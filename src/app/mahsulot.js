// src/app/mahsulot.js — Олинган маҳсулотлар: Склад файли (ботнинг omborFayl'и орқали) ва шерикнинг омбори snapshot.
import { kvGet, kvPut, kursOl, isOmborAdmin, isOmborSotuvchi, omborFayl, omborNusxa } from "../ombor.js";
import { nusxaQatorlar } from "../nusxa.js";
import { readTable } from "../xlsx.js";
import { son, ISM, SKLAD_MAP, parseSklad, davrKey } from "../sklad.js";
import { tgFaylYubor, botCtx } from "./tgapi.js";
import { appPut } from "./kv.js";

const FAYL_MAX = 20 * 1024 * 1024;

export async function davrlar(env) {
  const ro = await kvGet(env, "omb:davrlar", []);
  const d = (Array.isArray(ro) ? ro : []).map((x) => ({
    key: x.key, davr: x.davr || "", davrBoshi: x.davrBoshi || "", davrOxiri: x.davrOxiri || "",
    yuklandi: x.yuklandi || "", kim: x.kim || null, kimIsm: ISM[x.kim] || "", fayl: x.fayl || "", soni: son(x.jami && x.jami.soni), summa: son(x.jami && x.jami.summa),
    sotuvchilar: (x.sotuvchilar || []).length, kurs: son(x.kurs),
  }));
  const oxirgi = (Array.isArray(ro) ? ro : [])[0];
  const egasiz = oxirgi ? await kvGet(env, `omb:d:${oxirgi.key}:egasiz`, []) : [];
  return { davrlar: d, egasiz: (Array.isArray(egasiz) ? egasiz : []).map((b) => ({ nom: String(b.nom ?? ""), soni: son(b.soni), summa: son(b.summa), mahsulotlar: (b.mahsulotlar || []).length })) };
}

/** Склад .xlsx → ботнинг ўз юклагичи. Файл аввал админнинг чатига боради (file_id учун),
 *  кейин omborFayl айнан ботдагидек ишлайди ва натижани ўша чатга ёзади. */
export async function skladYukla(env, uid, fayl) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Склад файлини фақат омбор админи (ботдаги рўйхат) юклай олади" };
  if (!fayl) return { ok: false, xato: "Файл керак" };
  if (!/\.(xlsx|csv|txt)$/i.test(fayl.nom || "")) return { ok: false, xato: ".xlsx файл юборинг (.xls ўқилмайди)" };
  if (fayl.bytes.length > FAYL_MAX) return { ok: false, xato: "Файл 20 MB дан катта" };
  const r = await tgFaylYubor(env.BOT_TOKEN, "sendDocument", "document", { chat_id: uid, caption: "📥 Илова орқали юкланди" }, fayl);
  if (!r || !r.ok) return { ok: false, xato: "Файл ботга юборилмади — ботни очганмисиз? " + String(r && r.description || "").slice(0, 80) };
  const m = r.result;
  const message = { message_id: m.message_id, chat: { id: Number(uid), type: "private" }, from: { id: Number(uid) }, document: m.document };
  const oldin = await kvGet(env, "omb:davrlar", []);
  let ishlandi = false;
  try { ishlandi = await omborFayl(botCtx(env), message, null); }
  catch (e) { console.error("omborFayl:", e && e.stack || e); return { ok: false, xato: "Юклашда хато: " + String(e.message || e).slice(0, 160) }; }
  const keyin = await davrlar(env);
  const yangi = keyin.davrlar.find((d) => !oldin.some((o) => o.key === d.key && o.yuklandi === d.yuklandi));
  return { ok: true, ishlandi, yuklandi: !!yangi, davr: yangi || null, ...keyin,
           xabar: yangi ? `Юкланди: ${yangi.davr} · ${yangi.sotuvchilar} сотувчи` : "Бот файлни қабул қилмади — ботдаги жавобни кўринг" };
}

/** Жадвални НУСХАЛАБ қўйиш (Достон 2026-09-16: «admin mini appga exel yoki
 *  jadvalni nusxalab tashlidi»). Ботдаги omborNusxa АЙНАН шу ишни қилади:
 *  устунлар TAB билан ажралган матн → парс → текширув → сақлаш. Хабарлар
 *  админнинг бот чатига боради (ботдагидек). */
export async function nusxaYukla(env, uid, matn) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Жадвални фақат омбор админи юклай олади" };
  const t = String(matn || "");
  if (t.replace(/\s/g, "").length < 20) return { ok: false, xato: "Жадвал бўш" };
  if (!t.includes("\t")) return { ok: false, xato: "Устунлар ажралмаган — Excel'дан катакларни нусхалаб қўйинг (пробел билан эмас)" };
  if (t.length > 400_000) return { ok: false, xato: "Жадвал жуда катта — файл қилиб юборинг" };
  const message = { message_id: Math.floor(Date.now() / 1000), date: Math.floor(Date.now() / 1000),
                    chat: { id: Number(uid), type: "private" }, from: { id: Number(uid) }, text: t };
  const oldin = await kvGet(env, "omb:davrlar", []);
  let ishlandi = false;
  try { ishlandi = await omborNusxa(botCtx(env), message, null); }
  catch (e) { console.error("omborNusxa:", e && e.stack || e); return { ok: false, xato: "Ўқишда хато: " + String(e.message || e).slice(0, 160) }; }
  if (!ishlandi) return { ok: false, xato: "Жадвал танилмади — Склад жадвалининг катакларини нусхаланг" };
  const keyin = await davrlar(env);
  const yangi = keyin.davrlar.find((d) => !oldin.some((o) => o.key === d.key && o.yuklandi === d.yuklandi));
  return { ok: true, yuklandi: !!yangi, davr: yangi || null, ...keyin,
           xabar: yangi ? `Юкланди: ${yangi.davr} · ${yangi.sotuvchilar} сотувчи`
                        : "Жадвал тўлиқ эмас — ботдаги жавобни кўринг" };
}

/* ═══════════════ 📥 ЮКЛАНГАН МАЪЛУМОТЛАР (Достон 2026-09-25) ═══════════════
   Муаммо: Сардор ака нотўғри файл юкласа, иловада на ўчириш, на тузатиш бор эди.
   Ечим — уч қадам:
     1. ЮКЛАШДАН ОЛДИН ТАСДИҚ — файл ўқилади, нима ёзилиши кўрсатилади,
        «Тасдиқлаб ёзиш» босилгунча KV'га ҲЕЧ НИМА ёзилмайди.
     2. ЎЧИРИШ — бутун юклама (давр) битта ҳаракат билан кетади.
     3. ЭГАСИНИ ТУЗАТИШ — «эгаси аниқланмаган» блокни сотувчига бириктириш
        ёки блокни бошқа сотувчига кўчириш. Пул рақамларига ТЕГМАЙДИ.
   Қатор ичидаги рақам/ном таҳрири АТАЙИН ЙЎҚ: Basko файли — ҳақиқат манбаи,
   иловада қўлда ўзгартирилса файл билан тизим ажралиб кетарди. Тузатиш йўли —
   Basko'да тузатиб, юкламани ўчириб қайта юклаш.                            */

/** Нега танилмади — НИМА БОР, НИМА ЙЎҚ рўйхати (Достон 2026-09-28:
 *  «sotuvchi, to'lov, qarz, mahsulot topilmadi deb tushunarli xabar chiqsin»).
 *  Фақат «хато» демай, Склад файлида бўлиши керак нарсаларни бирма-бир
 *  ✓/✗ қилиб кўрсатамиз — одам нима етишмаётганини дарров кўради.        */
function nimaYoq(d, rows) {
  const R = Array.isArray(rows) ? rows : [];
  const toliq = R.filter((r) => (r.cells || []).some((c) => String(c ?? "").trim()));
  if (!toliq.length) return { sabab: "Файл бўш — биронта тўлдирилган қатор ҳам йўқ", royxat: [], korilgan: [] };
  // Файлдан ЎҚИЛГАН илк уч сатр — одам нима юклаганини кўрсин
  const korilgan = toliq.slice(0, 3).map((r) => (r.cells || [])
    .map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 5).join(" · ").slice(0, 90));
  const royxat = [
    { bor: Boolean(d && d.davrBoshi), nom: "давр сатри (01.09.2026-24.09.2026 давр оралиғи учун)" },
    { bor: Boolean(d && d.jami && son(d.jami.summa)), nom: "«Жами» сатри" },
    { bor: Boolean(d && d.bloklar && d.bloklar.length), nom: "сотувчи блоклари" },
    { bor: Boolean(d && d.bloklar && d.bloklar.some((b) => (b.mahsulotlar || []).length)),
      nom: "маҳсулот қаторлари (номи · сони · суммаси)" },
  ];
  const yoq = royxat.filter((x) => !x.bor);
  return { sabab: yoq.length === royxat.length
    ? "Бу Склад файли эмас — ичида ҳеч нима топилмади"
    : "Файл чала ёки бошқа кўринишда", royxat, korilgan };
}

/** Файл/жадвални ЎҚИЙДИ, лекин ЁЗМАЙДИ — тасдиқ ойнаси учун хулоса */
function korishXulosa(d, oldingi) {
  const ymd = (s) => (s ? String(s).split(".").reverse().join("") : "");
  const yB = ymd(d.davrBoshi), yO = ymd(d.davrOxiri);
  const dk = davrKey(d);
  const ustma = (oldingi || []).filter((x) => x.key !== dk && x.davrBoshi && x.davrOxiri &&
    !(ymd(x.davrOxiri) < yB || ymd(x.davrBoshi) > yO));
  const almashadi = ustma.filter((x) => ymd(x.davrBoshi) >= yB && ymd(x.davrOxiri) <= yO);
  const egasiz = d.bloklar.filter((b) => b.tgId === null);
  return {
    key: dk,
    davr: d.davr || "", davrBoshi: d.davrBoshi || "", davrOxiri: d.davrOxiri || "",
    bloklar: d.bloklar.length,
    sotuvchilar: [...new Set(d.bloklar.filter((b) => b.tgId !== null).map((b) => b.tgId))].length,
    soni: d.bloklar.reduce((a, b) => a + son(b.soni), 0),
    summa: d.bloklar.reduce((a, b) => a + son(b.summa), 0),
    egasiz: egasiz.map((b) => ({ nom: String(b.nom ?? ""), soni: son(b.soni), summa: son(b.summa) })),
    // Устма-уст тушиш: эскиси бутунлай ичида бўлса — АЛМАШАДИ, акс ҳолда юкланмайди
    almashadi: almashadi.map((x) => ({ key: x.key, davr: x.davr || "" })),
    tosiq: almashadi.length !== ustma.length
      ? (ustma.find((x) => !almashadi.includes(x)) || {}).davr || "олдинги давр"
      : "",
  };
}

/** 👁 Склад файлини ФАҚАТ КЎРИШ — KV'га ёзилмайди */
export async function skladKorish(env, uid, fayl) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Склад файлини фақат омбор админи юклай олади" };
  if (!fayl) return { ok: false, xato: "Файл керак" };
  if (!/\.(xlsx|csv|txt)$/i.test(fayl.nom || "")) return { ok: false, xato: ".xlsx файл юборинг (.xls ўқилмайди)" };
  if (fayl.bytes.length > FAYL_MAX) return { ok: false, xato: "Файл 20 MB дан катта" };
  let d = null, xomRows = [];
  try {
    const sheets = await readTable(fayl.nom, fayl.bytes.buffer ? fayl.bytes.buffer : fayl.bytes);
    xomRows = (sheets[0] && sheets[0].rows) || [];
    d = parseSklad(xomRows);
  } catch (e) { return { ok: false, xato: "❌ Файлни ўқиб бўлмади — .xlsx Склад файли юборинг.\n\n" + String(e.message || e).slice(0, 140) }; }
  if (!d || !d.bloklar || !d.bloklar.length) {
    const n = nimaYoq(d, xomRows);
    return { ok: false, xato: "❌ Юклаётган файлингиз хато — ичидаги маълумот умуман бошқа.\n\n" + n.sabab,
             royxat: n.royxat, korilgan: n.korilgan };
  }
  const kurs = await kursOl(env);
  const oldingi = await kvGet(env, "omb:davrlar", []);
  return { ok: true, korish: korishXulosa(d, Array.isArray(oldingi) ? oldingi : []), kurs: son(kurs && kurs.qiymat) };
}

/** 👁 Нусхаланган жадвални ФАҚАТ КЎРИШ — KV'га ёзилмайди */
export async function nusxaKorish(env, uid, matn) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Жадвални фақат омбор админи юклай олади" };
  const t = String(matn || "");
  if (t.replace(/\s/g, "").length < 20) return { ok: false, xato: "Жадвал бўш" };
  if (!t.includes("\t")) return { ok: false, xato: "Устунлар ажралмаган — Excel'дан катакларни нусхалаб қўйинг" };
  let d = null, xomRows = [];
  try { xomRows = nusxaQatorlar(t); d = parseSklad(xomRows); }
  catch (e) { return { ok: false, xato: "❌ Жадвални ўқиб бўлмади.\n\n" + String(e.message || e).slice(0, 140) }; }
  if (!d || !d.bloklar || !d.bloklar.length) {
    const n = nimaYoq(d, xomRows);
    return { ok: false, xato: "❌ Қўйган маълумотингиз хато — умуман бошқа маълумот.\n\n" + n.sabab,
             royxat: n.royxat, korilgan: n.korilgan };
  }
  const kurs = await kursOl(env);
  const oldingi = await kvGet(env, "omb:davrlar", []);
  return { ok: true, korish: korishXulosa(d, Array.isArray(oldingi) ? oldingi : []), kurs: son(kurs && kurs.qiymat) };
}

/** 🗑 Бутун юкламани (даврни) ўчириш — товарлари билан бирга */
export async function davrOchir(env, uid, key) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Буни фақат омбор админи қила олади" };
  const k = String(key || "").trim();
  if (!k) return { ok: false, xato: "Давр танланмади" };
  const ro = await kvGet(env, "omb:davrlar", []);
  const hammasi = Array.isArray(ro) ? ro : [];
  const d = hammasi.find((x) => x.key === k);
  if (!d) return { ok: false, xato: "Бундай давр топилмади" };
  await kvPut(env, "omb:davrlar", hammasi.filter((x) => x.key !== k));
  if (env.ACCESS_KV) {
    for (const id of [...(d.sotuvchilar || []), "egasiz"]) {
      try { await env.ACCESS_KV.delete(`omb:d:${k}:${id}`); } catch { /* йўқ бўлса майли */ }
    }
  }
  return { ok: true, xabar: `Ўчирилди: ${d.davr || k}`,
           ochirildi: { key: k, davr: d.davr || "", sotuvchilar: (d.sotuvchilar || []).length,
                        soni: son(d.jami && d.jami.soni), summa: son(d.jami && d.jami.summa) } };
}

/** 📂 Даврнинг ичи: қайси сотувчида қанча, эгасиз блоклар */
export async function davrIchi(env, uid, key) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Рухсат йўқ" };
  const k = String(key || "").trim();
  const ro = await kvGet(env, "omb:davrlar", []);
  const d = (Array.isArray(ro) ? ro : []).find((x) => x.key === k);
  if (!d) return { ok: false, xato: "Бундай давр топилмади" };
  const idlar = [...new Set((d.sotuvchilar || []).map(Number))];
  const satrlar = [];
  for (const id of idlar) {
    const b = await kvGet(env, `omb:d:${k}:${id}`, null);
    if (!b) continue;
    satrlar.push({ id, ism: ISM[id] || String(id), soni: son(b.soni), summa: son(b.summa),
                   mahsulot: (b.mahsulotlar || []).length });
  }
  satrlar.sort((a, b) => String(a.ism).localeCompare(String(b.ism), "ru"));
  const eg = await kvGet(env, `omb:d:${k}:egasiz`, []);
  // Эгасини тузатиш учун — ҲАММА омбор сотувчиси (маълумоти йўқлари ҳам)
  const barcha = [...new Set(Object.values(SKLAD_MAP).map(Number))]
    .map((id) => ({ id, ism: ISM[id] || String(id) }))
    .sort((a, b) => String(a.ism).localeCompare(String(b.ism), "ru"));
  return { ok: true, key: k, davr: d.davr || "", kurs: son(d.kurs), yuklandi: d.yuklandi || "", barcha,
           satrlar,
           egasiz: (Array.isArray(eg) ? eg : []).map((b, i) => ({ i, nom: String(b.nom ?? ""),
                     soni: son(b.soni), summa: son(b.summa), mahsulot: (b.mahsulotlar || []).length })) };
}

/** 👤 Эгасини тузатиш: эгасиз блокни сотувчига бириктириш ёки блокни кўчириш.
 *  Пул рақамларига ТЕГМАЙДИ — фақат кимга ёзилиши ўзгаради. */
export async function egasiniOzgartir(env, uid, { key, manba, egasiz, kimga }) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Буни фақат омбор админи қила олади" };
  const k = String(key || "").trim();
  const yangi = Number(kimga);
  if (!k) return { ok: false, xato: "Давр танланмади" };
  if (!isOmborSotuvchi(yangi)) return { ok: false, xato: "Бундай сотувчи йўқ" };
  const ro = await kvGet(env, "omb:davrlar", []);
  const hammasi = Array.isArray(ro) ? ro : [];
  const d = hammasi.find((x) => x.key === k);
  if (!d) return { ok: false, xato: "Бундай давр топилмади" };

  let blok = null;
  if (egasiz !== undefined && egasiz !== null && egasiz !== "") {
    const eg = await kvGet(env, `omb:d:${k}:egasiz`, []);
    const ro2 = Array.isArray(eg) ? eg : [];
    const i = Number(egasiz);
    if (!ro2[i]) return { ok: false, xato: "Эгасиз блок топилмади" };
    blok = ro2[i];
    await kvPut(env, `omb:d:${k}:egasiz`, ro2.filter((_, j) => j !== i));
  } else {
    const eski = Number(manba);
    if (!eski) return { ok: false, xato: "Қайси блок кўчирилиши танланмади" };
    if (eski === yangi) return { ok: false, xato: "Эгаси ўзгармади" };
    const b = await kvGet(env, `omb:d:${k}:${eski}`, null);
    if (!b) return { ok: false, xato: "Блок топилмади" };
    blok = b;
    if (env.ACCESS_KV) { try { await env.ACCESS_KV.delete(`omb:d:${k}:${eski}`); } catch { /* майли */ } }
    d.sotuvchilar = (d.sotuvchilar || []).filter((x) => Number(x) !== eski);
  }

  // Янги эгага ҚЎШАМИЗ (унда аллақачон блок бўлса — устига қўшилади)
  const bor = await kvGet(env, `omb:d:${k}:${yangi}`, null);
  const qoshildi = {
    summa: son(bor && bor.summa) + son(blok.summa),
    soni: son(bor && bor.soni) + son(blok.soni),
    mahsulotlar: [...((bor && bor.mahsulotlar) || []), ...((blok.mahsulotlar) || [])],
    nom: (bor && bor.nom) || blok.nom || "",
  };
  await kvPut(env, `omb:d:${k}:${yangi}`, qoshildi);
  if (!(d.sotuvchilar || []).map(Number).includes(yangi)) d.sotuvchilar = [...(d.sotuvchilar || []), yangi];
  await kvPut(env, "omb:davrlar", hammasi.map((x) => (x.key === k ? d : x)));
  return { ok: true, xabar: `${ISM[yangi] || yangi}га бириктирилди · ${son(blok.summa).toLocaleString("ru-RU")} сўм` };
}

/* ─── ҚАТОР ТАҲРИРИ (Достон 2026-09-28) ───────────────────────────────────
   «file ichidagi hato qatorni edit qilib qayta saqlash iloji bo'lsin».
   Мен файлни ҳақиқат манбаи деб қолишни маслаҳат бергандим; Достон талабни
   такрорлади — қилинди, аммо ИЗСИЗ эмас:
     • ҳар ўзгариш `omb:tahrir` журналига ёзилади (ким, қачон, эски → янги);
     • ўзгарган қатор `tahrir: true` белгисини олади ва иловада ✏️ кўринади;
     • блок ва давр жамиси автомат қайта ҳисобланади — рақамлар доим мос.   */
const TAHRIR_KEY = "omb:tahrir";

/** Блокни қайта ҳисоблаб ёзади ва давр жамисини янгилайди */
async function blokYangila(env, key, sid, mahsulotlar) {
  const summa = mahsulotlar.reduce((a, m) => a + son(m.summa), 0);
  const soni = mahsulotlar.reduce((a, m) => a + son(m.soni), 0);
  const bor = await kvGet(env, `omb:d:${key}:${sid}`, null);
  await kvPut(env, `omb:d:${key}:${sid}`, { ...(bor || {}), summa, soni, mahsulotlar });
  await davrJamiQayta(env, key);
}

/** Давр жамисини ҳамма блоклардан қайта ҳисоблайди (эгасиз ҳам киради) */
async function davrJamiQayta(env, key) {
  const ro = await kvGet(env, "omb:davrlar", []);
  const hammasi = Array.isArray(ro) ? ro : [];
  const d = hammasi.find((x) => x.key === key);
  if (!d) return;
  let jamiS = 0, jamiN = 0;
  for (const id of [...new Set((d.sotuvchilar || []).map(Number))]) {
    const b = await kvGet(env, `omb:d:${key}:${id}`, null);
    if (b) { jamiS += son(b.summa); jamiN += son(b.soni); }
  }
  const eg = await kvGet(env, `omb:d:${key}:egasiz`, []);
  for (const b of Array.isArray(eg) ? eg : []) { jamiS += son(b.summa); jamiN += son(b.soni); }
  d.jami = { ...(d.jami || {}), summa: jamiS, soni: jamiN };
  await kvPut(env, "omb:davrlar", hammasi.map((x) => (x.key === key ? d : x)));
}

/** Журналга ёзиш — охирги 200 та ўзгариш сақланади */
async function jurnalga(env, uid, yozuv) {
  const ro = await kvGet(env, TAHRIR_KEY, []);
  const ro2 = (Array.isArray(ro) ? ro : []).slice(-199);
  ro2.push({ ...yozuv, kim: Number(uid), ism: ISM[uid] || String(uid), vaqt: Date.now() });
  await kvPut(env, TAHRIR_KEY, ro2);
}

/** 📄 Битта сотувчининг шу даврдаги қаторлари */
export async function qatorlar(env, uid, key, sid) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Рухсат йўқ" };
  const b = await kvGet(env, `omb:d:${key}:${Number(sid)}`, null);
  if (!b) return { ok: false, xato: "Блок топилмади" };
  return { ok: true, key, sid: Number(sid), ism: ISM[sid] || String(sid),
           summa: son(b.summa), soni: son(b.soni),
           qatorlar: (b.mahsulotlar || []).map((m, i) => ({
             i, nom: String(m.nom ?? ""), xar: m.xar == null ? "" : String(m.xar),
             soni: son(m.soni), summa: son(m.summa), tahrir: !!m.tahrir })) };
}

/** ✏️ Қаторни тузатиш. Фақат ном · сони · суммаси. */
export async function qatorSaqla(env, uid, { key, sid, i, nom, soni, summa }) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Буни фақат омбор админи қила олади" };
  const b = await kvGet(env, `omb:d:${key}:${Number(sid)}`, null);
  if (!b) return { ok: false, xato: "Блок топилмади" };
  const ro = [...(b.mahsulotlar || [])];
  const idx = Number(i);
  if (!ro[idx]) return { ok: false, xato: "Қатор топилмади" };
  const yangiNom = String(nom ?? ro[idx].nom).replace(/\s+/g, " ").trim().slice(0, 200);
  if (yangiNom.length < 2) return { ok: false, xato: "Маҳсулот номи керак" };
  const yangiSoni = son(soni), yangiSumma = son(summa);
  if (!(yangiSumma >= 0) || yangiSumma > 1e12) return { ok: false, xato: "Сумма нотўғри" };
  if (!(yangiSoni >= 0)) return { ok: false, xato: "Сони нотўғри" };
  const eski = { nom: ro[idx].nom, soni: son(ro[idx].soni), summa: son(ro[idx].summa) };
  ro[idx] = { ...ro[idx], nom: yangiNom, soni: yangiSoni, summa: yangiSumma, tahrir: true };
  await blokYangila(env, key, Number(sid), ro);
  await jurnalga(env, uid, { amal: "tahrir", key, sid: Number(sid), eski,
                             yangi: { nom: yangiNom, soni: yangiSoni, summa: yangiSumma } });
  return { ok: true, xabar: "Қатор тузатилди" };
}

/** 🗑 Битта қаторни ўчириш */
export async function qatorOchir(env, uid, { key, sid, i }) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Буни фақат омбор админи қила олади" };
  const b = await kvGet(env, `omb:d:${key}:${Number(sid)}`, null);
  if (!b) return { ok: false, xato: "Блок топилмади" };
  const ro = [...(b.mahsulotlar || [])];
  const idx = Number(i);
  if (!ro[idx]) return { ok: false, xato: "Қатор топилмади" };
  const eski = { nom: ro[idx].nom, soni: son(ro[idx].soni), summa: son(ro[idx].summa) };
  ro.splice(idx, 1);
  await blokYangila(env, key, Number(sid), ro);
  await jurnalga(env, uid, { amal: "ochir", key, sid: Number(sid), eski, yangi: null });
  return { ok: true, xabar: `Ўчирилди: ${eski.nom}` };
}

/** 📜 Тузатишлар журнали — ким нимани ўзгартирган */
export async function tahrirJurnal(env, uid) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Рухсат йўқ" };
  const ro = await kvGet(env, TAHRIR_KEY, []);
  return { ok: true, jurnal: (Array.isArray(ro) ? ro : []).slice(-50).reverse() };
}

/** 🩺 ТЕКШИРУВ — шубҳали қаторларни ЎЗИ топади (Достон 2026-09-28:
 *  «agar superadmin bilmasa qaysi qator xatoligini — qayerdan biladi?»).
 *  Қидирув фақат НИМАНИ қидиришни билганда фойда; бу эса рўйхатни ўзи беради.
 *  Текширувлар арзон, битта ўтишда бажарилади:
 *    • сумма 0 ёки манфий · сони 0 ёки манфий
 *    • битта сотувчида АЙНАН бир хил қатор такрорланган
 *    • нархи (сумма/сони) ўша маҳсулотнинг бошқа қаторларидагидан 10 баравар фарқ
 *    • эгаси аниқланмаган блоклар
 *    • файлдаги «Жами» блоклар йиғиндисига тўғри келмаса                     */
export async function tekshiruv(env, uid, key) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Рухсат йўқ" };
  const k = String(key || "").trim();
  const ro = await kvGet(env, "omb:davrlar", []);
  const d = (Array.isArray(ro) ? ro : []).find((x) => x.key === k);
  if (!d) return { ok: false, xato: "Бундай юклама топилмади" };

  // 1-ўтиш: ҳамма қаторни йиғамиз
  const hamma = [];
  let jamiBlok = 0;
  for (const id of [...new Set((d.sotuvchilar || []).map(Number))]) {
    const b = await kvGet(env, `omb:d:${k}:${id}`, null);
    if (!b) continue;
    jamiBlok += son(b.summa);
    (b.mahsulotlar || []).forEach((m, i) => hamma.push({
      sid: id, ism: ISM[id] || String(id), i, nom: String(m.nom ?? ""),
      soni: son(m.soni), summa: son(m.summa), tahrir: !!m.tahrir }));
  }
  const eg = await kvGet(env, `omb:d:${k}:egasiz`, []);
  const egasiz = (Array.isArray(eg) ? eg : []);
  for (const b of egasiz) jamiBlok += son(b.summa);

  // Ном бўйича ўртача нарх (медиана) — четга чиққанини топиш учун
  const narxlar = new Map();
  for (const x of hamma) {
    if (!(x.soni > 0) || !(x.summa > 0)) continue;
    const kalit = x.nom.trim().toLowerCase();
    if (!narxlar.has(kalit)) narxlar.set(kalit, []);
    narxlar.get(kalit).push(x.summa / x.soni);
  }
  const mediana = (a) => { const z = [...a].sort((p, q) => p - q); return z[Math.floor(z.length / 2)]; };

  // 2-ўтиш: шубҳали қаторлар
  const korilgan = new Map();
  const shubha = [];
  const qosh2 = (x, sabab, izoh) => shubha.push({ ...x, sabab, izoh: izoh || "" });
  for (const x of hamma) {
    if (x.summa <= 0) { qosh2(x, "summa", x.summa === 0 ? "Сумма 0" : "Сумма манфий"); continue; }
    if (x.soni <= 0) { qosh2(x, "soni", x.soni === 0 ? "Сони 0" : "Сони манфий"); continue; }
    const tk = x.sid + "|" + x.nom.trim().toLowerCase() + "|" + x.summa + "|" + x.soni;
    if (korilgan.has(tk)) {
      qosh2(x, "takror", "Айнан шу қатор юқорида ҳам бор (" + (korilgan.get(tk) + 1) + "-қатор)");
      continue;
    }
    korilgan.set(tk, x.i);
    const ro2 = narxlar.get(x.nom.trim().toLowerCase()) || [];
    if (ro2.length >= 3) {
      const med = mediana(ro2);
      const narx = x.summa / x.soni;
      if (med > 0 && (narx > med * 10 || narx * 10 < med)) {
        qosh2(x, "narx", "Нархи " + Math.round(narx).toLocaleString("ru-RU")
          + " — бошқа қаторларда ~" + Math.round(med).toLocaleString("ru-RU"));
      }
    }
  }

  const jamiFayl = son(d.jami && d.jami.summa);
  const farq = Math.round((jamiBlok - jamiFayl) * 100) / 100;
  return { ok: true, key: k, davr: d.davr || k,
    qatorlar: hamma.length,
    shubha: shubha.slice(0, 60),
    shubhaSoni: shubha.length,
    egasiz: egasiz.map((b, i) => ({ i, nom: String(b.nom ?? ""), summa: son(b.summa), soni: son(b.soni) })),
    jamiFayl, jamiBlok, farq };
}
/** 🗑 ЭГАСИЗ блокни ўчириш (Достон 2026-09-28: «Нурмухаммад, Хамма номли
 *  сотувчи йўқ — олиб ташла, суммасини ҳам»). Давр жамиси қайта ҳисобланади. */
export async function egasizOchir(env, uid, { key, i }) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Буни фақат омбор админи қила олади" };
  const k = String(key || "").trim();
  const eg = await kvGet(env, `omb:d:${k}:egasiz`, []);
  const ro = Array.isArray(eg) ? eg : [];
  const idx = Number(i);
  if (!ro[idx]) return { ok: false, xato: "Эгасиз блок топилмади" };
  const eski = { nom: String(ro[idx].nom ?? ""), summa: son(ro[idx].summa), soni: son(ro[idx].soni) };
  await kvPut(env, `omb:d:${k}:egasiz`, ro.filter((_, j) => j !== idx));
  await davrJamiQayta(env, k);
  await jurnalga(env, uid, { amal: "egasiz_ochir", key: k, sid: 0, eski, yangi: null });
  return { ok: true, xabar: `Ўчирилди: ${eski.nom || "номсиз"} · ${eski.summa.toLocaleString("ru-RU")} сўм` };
}

/** 🔍 ҚАТОРНИ ҚИДИРИШ — ҳамма юкламалар бўйича (Достон 2026-09-28:
 *  «juda qiyin, etaplar juda ko'p — tez va oson tuzatolsin»). Аввал
 *  юклама → сотувчи → қаторлар деб кириш керак эди; энди маҳсулот номини
 *  (ёки рақамни) ёзади — тўғри келган қатор чиқади, ўша ерда тузатади. */
export async function qidir(env, uid, matn) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Рухсат йўқ" };
  const q = String(matn || "").trim().toLowerCase();
  if (q.length < 2) return { ok: false, xato: "Камида 2 белги ёзинг" };
  const raqam = q.replace(/[^\d]/g, "");
  const ro = await kvGet(env, "omb:davrlar", []);
  const davrRo = Array.isArray(ro) ? ro : [];
  const natija = [];
  for (const d of davrRo) {
    for (const id of [...new Set((d.sotuvchilar || []).map(Number))]) {
      const b = await kvGet(env, `omb:d:${d.key}:${id}`, null);
      if (!b || !Array.isArray(b.mahsulotlar)) continue;
      b.mahsulotlar.forEach((m, i) => {
        if (natija.length >= 40) return;
        const nom = String(m.nom ?? "");
        const mos = nom.toLowerCase().includes(q)
          || (raqam.length >= 2 && (String(son(m.soni)).includes(raqam) || String(son(m.summa)).includes(raqam)));
        if (!mos) return;
        natija.push({ key: d.key, davr: d.davr || d.key, sid: id, ism: ISM[id] || String(id),
                      i, nom, soni: son(m.soni), summa: son(m.summa), tahrir: !!m.tahrir });
      });
    }
  }
  return { ok: true, soni: natija.length, natija };
}
/* ======================== шерикнинг омбори ========================
   (жадвалнинг ўз SUMIFS'лари шу устунлардан), тўлов — J..O, бошланғич — «Қарздорлик умумий» D. */
const TG = { "абдулхай": 7000000012, "алишер": 7000000027, "рамзиддин": 7000000011, "дилмурод": 7000000015,
             "илхом": 7000000001, "сардорака": 7000000005, "дилшод": 7000000019, "аброрака": 7000000021, "абдувохид": 7000000017 };
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/ў/g, "у").replace(/қ/g, "к").replace(/ғ/g, "г").replace(/ҳ/g, "х").replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/ /g, "").replace(/ /g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else if (s.includes(",")) s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
const ikki = (n) => String(n).padStart(2, "0");
function sana(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${ikki(+m[2])}-${ikki(+m[1])}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const n = Number(s);
  if (Number.isFinite(n) && n > 30000 && n < 80000) {          // Excel сериал сана
    const d = new Date(Math.round((n - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${ikki(d.getUTCMonth() + 1)}-${ikki(d.getUTCDate())}`;
  }
  return "";
}
const katak = (row, i) => { const c = (row && row.cells) || row || []; const v = c[i]; return v === undefined || v === null ? "" : v; };


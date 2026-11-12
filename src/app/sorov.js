// src/app/sorov.js — 💸 Пул чиқариш · ➖ Қарзимдан минус · 📎 чек — БОТНИНГ ЎЗ ФУНКЦИЯЛАРИ орқали.
// Ёзувлар ботда яратилгани билан бир хил (sorovnoma.js), гуруҳдаги эълон ҳам ўша матн.
// Иловадан келгани `manba: "app"` майдони билан белгиланади (аудит учун, ботга таъсири йўқ).
import {
  kvGet, kvRoyxatYoz, isOmborSotuvchi, isOmborAdmin, isBuxgalter, firmaMos, firmaToliq, innlar,
  yubor, esc, tolovYoz, omborRasm, pdfMatn, hujjatOqi, SOROV_OCHIQ_UMR,
} from "../ombor.js";
import { pdfMatnToliq } from "../pdfoqi.js";
import { pdfKutOl, pdfKutOqildi, pdfKutOchir, pdfIchini } from "../pdfkut.js";
import {
  sorovQosh, sorovOl, sorovYangila, guruhgaElon, guruhgaBekor, kardTasdiqqaYubor, pulTasdiqqaYubor, elonMatn,
  yangiId, TAKROR_OYNA, SUMMA_MIN, SUMMA_MAX, KARD_TASDIQ, KARD_TASDIQ_ASL, KARD_ZAXIRA, ozigaMinusMumkin, OZIGA_MINUS_MATN,
} from "../sorovnoma.js";
import { ISM, pul, son, matndanSumma } from "../sklad.js";
import { tg, tgFaylYubor, botCtx } from "./tgapi.js";

const SOROV_KEY = "omb:sorov";
const FAYL_MAX = 20 * 1024 * 1024;
const guruhId = (env) => String(env.OMBOR_GURUH || "").split(/[,;\s]+/).filter(Boolean)[0] || "";
const bekorTugma = (id) => ({ inline_keyboard: [[{ text: "❌ Сўровни бекор қилиш", callback_data: `srv|bek|${id}` }]] });
function summaOqi(v) {
  if (typeof v === "number") return v;
  const t = String(v ?? "").trim();
  // Руслан 2026-10-10: заҳира йўлда ҳам охирги ,00 — тийин («500,00» 50 000 бўлмасин)
  return matndanSumma(t) || Number(t.replace(/[.,]\d{1,2}$/, "").replace(/[^\d]/g, "")) || 0;
}

/** KV ёзуви → илова кўриниши (ҳолат битта сўз билан) */
// Бот гуруҳда чекни ёзмаса — сотувчи ИЛОВАДА кўради (ombor.js sorovChekHolat, Достон 2026-09-21)
const CHEK_HOLAT = { tekshir: "chek_tekshir", rad: "chek_rad", bekor: "tolov_bekor" };
export { ozigaMinusMumkin };
/** Хуршид ака — «Қарзимдан минус»нинг АСЛ тасдиқловчиси. Иловада унга ФАҚАТ «Тасдиқлар» ва «Ошхона»
 *  (Достон 2026-09-21: «xurshidaka uchun tasdiqlash yoki rad qilish qolsin holos va oshhona»). */
export const kardTasdiqchimi = (uid) => Number(uid) === Number(KARD_TASDIQ_ASL);
export function sorovKorinish(env, s, hozir = Date.now()) {
  const g = guruhId(env);
  const gid = g.startsWith("-100") ? g.slice(4) : "";
  let holat;
  if (s.tur === "kard") {
    holat = s.holati === "kutilmoqda" ? "tasdiq_kutmoqda" : s.holati === "tasdiq" ? "tasdiqlandi"
          : s.holati === "rad" ? "rad" : s.holati === "muddat" ? "muddat" : "bekor";
  } else if (s.holati === "kutilmoqda") holat = "tasdiq_kutmoqda";
  else if (s.holati === "rad" && s.band) holat = "rad";
  else if (s.kutilmoqda && !s.band) holat = "takror";
  else if (!s.band) holat = hozir - son(s.vaqt) >= SOROV_OCHIQ_UMR ? "muddat"
    : s.chek && CHEK_HOLAT[s.chek.holat] ? CHEK_HOLAT[s.chek.holat]
    : son(s.tolangan) > 0 ? "qisman" : "ochiq";
  else holat = s.holati === "bekor" ? "bekor" : s.holati === "muddat" ? "muddat" : "yopildi";
  return {
    id: s.id, tur: s.tur, sid: s.sid, ism: ISM[s.sid] || String(s.sid), firma: s.firma || "", inn: s.inn || "",
    summa: son(s.summa), tolangan: son(s.tolangan), izoh: s.izoh || "", vaqt: son(s.vaqt), holat,
    fayl: s.fayl ? { tur: s.fayl.tur || "", nom: s.fayl.nom || "" } : null, oldingi: s.oldingi || null,
    manba: s.manba || "bot", tolovlar: Array.isArray(s.tolovlar) ? s.tolovlar : [],
    havola: gid && s.guruhMsg ? `https://t.me/c/${gid}/${s.guruhMsg}` : null,
  };
}

export async function meningSorovlarim(env, uid, hozir = Date.now()) {
  const ro = await kvGet(env, SOROV_KEY, []);
  return (Array.isArray(ro) ? ro : []).filter((s) => s && Number(s.sid) === Number(uid))
    .sort((a, b) => son(b.vaqt) - son(a.vaqt)).map((s) => sorovKorinish(env, s, hozir));
}

/** Файлни Telegram'га юбориб file_id олиш (гуруҳга — эълон билан, ёки сотувчининг ўзига) */
async function faylniYubor(env, chatId, fayl, caption, extra = {}) {
  const rasm = /^image\//i.test(fayl.mime || "") && !/pdf/i.test(fayl.mime || "");
  const r = await tgFaylYubor(env.BOT_TOKEN, rasm ? "sendPhoto" : "sendDocument", rasm ? "photo" : "document",
    { chat_id: chatId, caption, parse_mode: "HTML", ...extra }, fayl);
  if (!r || !r.ok) return null;
  const m = r.result;
  const f = rasm
    ? { tur: "photo", id: m.photo[m.photo.length - 1].file_id, nom: "" }
    : { tur: "doc", id: m.document.file_id, nom: m.document.file_name || fayl.nom || "" };
  let matn = "";
  if (!rasm && /pdf/i.test((fayl.mime || "") + " " + (fayl.nom || ""))) {
    try { matn = String((await pdfMatn(botCtx(env), m.document)) || ""); } catch { matn = ""; }
  }
  return { msgId: m.message_id, xabar: m, fayl: f, pdfMatn: matn };
}

/* ======================== 1. ПУЛ ЧИҚАРИШ ======================== */
/**
 * 💸 Пул чиқариш.
 * @param fayl      иловадан юкланган файл {bytes, nom, mime} — ёки null
 * @param tayyorFayl сотувчи гуруҳга/ботга АЛЛАҚАЧОН ташлаган файл {tur, id, nom}
 *                  («Пул чиқариш File», Достон 2026-09-25). Қайта юкланмайди —
 *                  Telegram file_id шундоқ ишлатилади.
 */
export async function pulYarat(env, uid, form, fayl, tayyorFayl = null) {
  if (!isOmborSotuvchi(uid)) return { ok: false, xato: "Сиз сотувчилар рўйхатида йўқсиз" };
  const ctx = botCtx(env);
  const guruh = guruhId(env);
  if (!guruh) return { ok: false, xato: "Гуруҳ созланмаган" };
  const firma = String(form.firma || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (firma.length < 2) return { ok: false, xato: "Фирма номини ёзинг (камида 2 белги)" };
  const summa = summaOqi(form.summa);
  if (!(summa >= SUMMA_MIN && summa <= SUMMA_MAX)) return { ok: false, xato: "Сумма 1 000 … 5 000 000 000 сўм оралиғида бўлсин" };
  const innXom = String(form.inn || "").replace(/\D/g, "");
  if (innXom && innXom.length !== 9) return { ok: false, xato: "ИНН 9 та рақам бўлади" };
  if (fayl && fayl.bytes.length > FAYL_MAX) return { ok: false, xato: "Файл 20 MB дан катта" };

  // Достон 2026-09-24: сўров аввал МАСЪУЛГА (Хуршид ака) боради, у тасдиқласа — гуруҳга
  const sorov = { id: yangiId(), tur: "pul", sid: Number(uid), summa, firma, inn: innXom, matn: "", fayl: null,
                  vaqt: Date.now(), band: false, kutilmoqda: true, holati: "kutilmoqda", guruhMsg: null, manba: "app" };
  const matnQur = (faylMatn) => [sorov.firma, sorov.inn, sorov.fayl && sorov.fayl.nom, faylMatn]
    .filter(Boolean).join("  ·  ").slice(0, 500);
  sorov.matn = matnQur(fayl ? fayl.nom : "");

  // ── ТАКРОР СЎРОВМИ? (sorovnoma.js билан бир хил қоида: шу фирмага 3 соат ичида очиқ сўров)
  const ro = await kvGet(env, SOROV_KEY, []);
  const eski = (Array.isArray(ro) ? ro : []).find((x) => x && Number(x.sid) === Number(uid) && x.tur === "pul" &&
    !x.band && Date.now() - son(x.vaqt) < TAKROR_OYNA &&
    // ТАКРОР — фақат ФИРМА НОМИ бўйича (Достон 2026-09-16): бутун PDF матни
    // солиштирилса, ҳар PDF'да бизнинг фирма номи бор — бошқа фирмага сўров ҳам «такрор» бўларди
    firmaMos(x.firma || x.matn, sorov.firma || sorov.matn) === "mos");
  if (eski) {
    if (tayyorFayl) { sorov.fayl = tayyorFayl; sorov.matn = matnQur(""); }
    else if (fayl) {   // file_id керак — файл сотувчининг ўзига боради, тасдиқлангач гуруҳга шу id билан кетади
      const r = await faylniYubor(env, uid, fayl, "📎 Сўров файли қабул қилинди — тасдиқлангач гуруҳга юборилади.");
      if (r) { sorov.fayl = r.fayl; if (r.pdfMatn) sorov.matn = matnQur(r.pdfMatn); }
    }
    sorov.kutilmoqda = true;
    sorov.holati = "";                 // «такрор» — аввал сотувчи ҳал қилади, кейин масъулга
    sorov.oldingi = eski.id;
    await sorovQosh(env, sorov);
    return { ok: true, takror: true, sorov: sorovKorinish(env, sorov), eski: sorovKorinish(env, eski) };
  }

  // ── Гуруҳга аллақачон ташланган счёт: file_id тайёр, қайта юкланмайди
  if (tayyorFayl) { sorov.fayl = tayyorFayl; sorov.matn = matnQur(""); }
  // ── Файл бўлса — file_id олиш учун сотувчининг ўзига (гуруҳга тасдиқдан КЕЙИН кетади)
  else if (fayl) {
    const r = await faylniYubor(env, uid, fayl, "📎 Сўров файли қабул қилинди — тасдиқлангач гуруҳга юборилади.");
    if (r) { sorov.fayl = r.fayl; if (r.pdfMatn) sorov.matn = matnQur(r.pdfMatn); }
  }
  await sorovQosh(env, sorov);
  // ── Масъулга (Хуршид ака) — у ✅ / ❌ босади, тасдиқлангач гуруҳга кетади
  const ketdi = await pulTasdiqqaYubor(ctx, sorov);
  if (!ketdi) {
    await sorovYangila(env, sorov.id, { band: true, kutilmoqda: false, holati: "bekor" });
    return { ok: false, xato: "Тасдиқловчига юборилмади. Админга хабар беринг." };
  }
  // Масъулга кетган хабар манзилини эслаб қоламиз — сотувчи бекор қилса,
  // ўша хабарнинг тугмалари олиб ташланади (Достон 2026-09-25)
  if (sorov.tasdiqMsg) await sorovYangila(env, sorov.id, { tasdiqMsg: sorov.tasdiqMsg, tasdiqChat: sorov.tasdiqChat });
  // Сотувчининг TG'сига хабар ЙЎҚ — жавоб ва ҳолат ИЛОВАДА (Достон 2026-09-21)
  const kimga = ISM[ketdi === "zaxira" ? KARD_ZAXIRA : KARD_TASDIQ] || "масъул";
  return { ok: true, sorov: sorovKorinish(env, sorov), ketdi, kimga };
}

/** Такрорий сўровга сотувчининг қарори: p1 = иккаласи, pr = олдингисини бекор, p0 = янгисини бекор */
export async function takrorHal(env, uid, id, qaror) {
  if (!["p1", "p0", "pr"].includes(qaror)) return { ok: false, xato: "қарор нотўғри" };
  const ctx = botCtx(env);
  const sorov = await sorovOl(env, id);
  if (!sorov || sorov.tur !== "pul") return { ok: false, xato: "Сўров топилмади" };
  if (Number(uid) !== Number(sorov.sid) && !isOmborAdmin(uid, null)) return { ok: false, xato: "Буни сўров эгаси ҳал қилади" };
  const belgi = `app:${uid}:${Date.now()}`;
  const olindi = await kvRoyxatYoz(env, SOROV_KEY,
    (joriy) => joriy.map((x) => (x.id === id && x.kutilmoqda && !x.band
      ? { ...x, kutilmoqda: false, halQildi: belgi, ...(qaror === "p0" ? { band: true, holati: "bekor" } : {}) } : x)),
    (joriy) => { const x = joriy.find((y) => y.id === id); return !x || !x.kutilmoqda; });
  const oxirgi = await sorovOl(env, id);
  if (!olindi || !oxirgi || oxirgi.halQildi !== belgi) return { ok: false, xato: "Бу сўров аллақачон ҳал қилинган" };
  if (qaror === "p0") {
    if (sorov.manba !== "app") await yubor(ctx, sorov.sid, "❌ <b>Сўров бекор қилинди</b> — гуруҳга юборилмади.").catch(() => {});
    return { ok: true, sorov: sorovKorinish(env, oxirgi) };
  }
  // Достон 2026-09-24: такрор ҳал бўлгач ҳам аввал МАСЪУЛГА боради
  await sorovYangila(env, id, { kutilmoqda: true, holati: "kutilmoqda" });
  const yuborilgan = { ...sorov, holati: "kutilmoqda" };
  const ketdi = await pulTasdiqqaYubor(ctx, yuborilgan);
  if (!ketdi) { await sorovYangila(env, id, { kutilmoqda: true, holati: "" }); return { ok: false, xato: "Тасдиқловчига юборилмади" }; }
  if (yuborilgan.tasdiqMsg) await sorovYangila(env, id, { tasdiqMsg: yuborilgan.tasdiqMsg, tasdiqChat: yuborilgan.tasdiqChat });
  let eskiBekor = null;
  if (qaror === "pr" && sorov.oldingi) {
    const eski = await sorovOl(env, sorov.oldingi);
    if (eski && !eski.band && Number(eski.sid) === Number(sorov.sid)) {
      await sorovYangila(env, eski.id, { band: true, kutilmoqda: false, holati: "bekor" });
      await guruhgaBekor(ctx, eski);
      eskiBekor = eski;
    }
  }
  if (sorov.manba !== "app") await yubor(ctx, sorov.sid, [
    ...(eskiBekor ? [`❌ Олдинги сўров бекор қилинди (${pul(eskiBekor.summa)} сўм)`] : []),
    "✅ <b>Масъулга юборилди</b> — тасдиқлангач гуруҳга кетади",
    `🏢 <b>${esc(firmaToliq(sorov.firma))}</b>  ·  💵 <b>${pul(sorov.summa)} сўм</b>`,
  ].join("\n"), { reply_markup: bekorTugma(sorov.id) }).catch(() => {});
  return { ok: true, sorov: sorovKorinish(env, await sorovOl(env, id)) };
}

/** Сўровни бекор қилиш (эгаси ёки омбор админи) — sorovnoma.js «bek» билан бир хил */
export async function sorovBekor(env, uid, id) {
  const ctx = botCtx(env);
  const sorov = await sorovOl(env, id);
  if (!sorov) return { ok: false, xato: "Сўров топилмади" };
  if (Number(uid) !== Number(sorov.sid) && !isOmborAdmin(uid, null)) return { ok: false, xato: "Сўровни фақат эгаси ёки админ бекор қила олади" };
  if (sorov.band) return { ok: false, xato: "Бу сўров аллақачон ёпилган" };
  await sorovYangila(env, id, { band: true, kutilmoqda: false, holati: "bekor" });
  await guruhgaBekor(ctx, sorov);
  // Масъул (Хуршид ака) ҳали ✅/❌ босмаган бўлса — унинг чатидаги тугмалар
  // олиб ташланади ва хабар берилади (Достон 2026-09-25). Акс ҳолда у йўқ
  // сўровга ✅ босиб, «аллақачон ҳал қилинган» жавобини оларди.
  const xb = `❌ <b>${esc(ISM[sorov.sid] || sorov.sid)} сўровни бекор қилди</b> — ${pul(sorov.summa)} сўм`;
  if (sorov.tur === "kard") {
    await yubor(ctx, KARD_TASDIQ_ASL, xb).catch(() => {});
    await yubor(ctx, KARD_ZAXIRA, xb).catch(() => {});
  } else if (sorov.holati === "kutilmoqda" || sorov.kutilmoqda) {
    if (sorov.tasdiqChat && sorov.tasdiqMsg) {
      await tg(env.BOT_TOKEN, "editMessageReplyMarkup",
        { chat_id: sorov.tasdiqChat, message_id: sorov.tasdiqMsg, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      await yubor(ctx, sorov.tasdiqChat, xb).catch(() => {});
    } else {
      await yubor(ctx, KARD_TASDIQ, xb).catch(() => {});
    }
  }
  if (sorov.manba !== "app") await yubor(ctx, sorov.sid, "❌ <b>Сўров бекор қилинди</b>").catch(() => {});
  return { ok: true, sorov: sorovKorinish(env, await sorovOl(env, id)) };
}

/* ======================== 2. ҚАРЗИМДАН МИНУС ======================== */
export async function kardYarat(env, uid, form) {
  if (!ozigaMinusMumkin(uid)) return { ok: false, xato: OZIGA_MINUS_MATN.replace(/^❌ /, "") };
  if (!isOmborSotuvchi(uid)) return { ok: false, xato: "Сиз сотувчилар рўйхатида йўқсиз" };
  const ctx = botCtx(env);
  const s = summaOqi(form.summa);
  if (!(s >= SUMMA_MIN && s <= SUMMA_MAX)) return { ok: false, xato: "Сумма 1 000 … 5 000 000 000 сўм оралиғида бўлсин" };
  const izoh = String(form.izoh || "").replace(/\s+/g, " ").trim();
  const sorov = { id: yangiId(), tur: "kard", sid: Number(uid), summa: s, izoh: izoh.length >= 3 ? izoh.slice(0, 300) : "",
                  matn: "қарзимдан минус", vaqt: Date.now(), band: false, kutilmoqda: true, holati: "kutilmoqda", manba: "app" };
  await sorovQosh(env, sorov);
  const ketdi = await kardTasdiqqaYubor(ctx, sorov);
  if (!ketdi) {
    await sorovYangila(env, sorov.id, { band: true, kutilmoqda: false, holati: "bekor" });
    return { ok: false, xato: "Тасдиқловчига юборилмади. Админга хабар беринг." };
  }
  // Сотувчининг TG'сига хабар ЙЎҚ — илова ўзи кимга кетганини айтади (Достон 2026-09-21)
  const kimga = ISM[ketdi === "zaxira" ? KARD_ZAXIRA : KARD_TASDIQ] || "масъул";
  return { ok: true, sorov: sorovKorinish(env, sorov), ketdi, kimga };
}

/** Ким «минус»ни ҳал қила олади — sorovnoma.js қоидаси */
export function kardHalMumkin(uid) {
  return [KARD_TASDIQ_ASL, KARD_ZAXIRA].includes(Number(uid)) || isOmborAdmin(uid, null);
}
/** k1 = тасдиқ (қарздан айирилади, tolovYoz), k0 = рад */
export async function kardHal(env, uid, id, qaror) {
  if (!["k1", "k0"].includes(qaror)) return { ok: false, xato: "қарор нотўғри" };
  if (!kardHalMumkin(uid)) return { ok: false, xato: "Бу сўровни фақат масъул шахс ҳал қилади" };
  const ctx = botCtx(env);
  const sorov = await sorovOl(env, id);
  if (!sorov || sorov.tur !== "kard") return { ok: false, xato: "Сўров топилмади" };
  if (sorov.holati !== "kutilmoqda") {
    const soz = { tasdiq: "тасдиқланган", rad: "рад этилган", bekor: "бекор қилинган", muddat: "7 кун жавоб берилмагани учун ёпилган" };
    return { ok: false, xato: `Бу сўров аллақачон ${soz[sorov.holati] || "ҳал қилинган"}` };
  }
  if (Number(uid) === Number(sorov.sid)) return { ok: false, xato: "Ўз сўровингизни ўзингиз тасдиқлай олмайсиз" };
  const yangiHolat = qaror === "k1" ? "tasdiq" : "rad";
  const belgi = `app:${uid}:${Date.now()}`;
  const olindi = await kvRoyxatYoz(env, SOROV_KEY,
    (joriy) => joriy.map((x) => (x.id === id && x.holati === "kutilmoqda"
      ? { ...x, holati: yangiHolat, kutilmoqda: false, band: true, halQildi: belgi } : x)),
    (joriy) => { const x = joriy.find((y) => y.id === id); return !x || x.holati !== "kutilmoqda"; });
  const oxirgi = await sorovOl(env, id);
  if (!olindi || !oxirgi || oxirgi.halQildi !== belgi) return { ok: false, xato: "Бу сўров аллақачон ҳал қилинган" };
  if (qaror === "k0") {
    await yubor(ctx, uid, `❌ <b>Рад этилди</b> — ${esc(ISM[sorov.sid] || sorov.sid)}, ${pul(sorov.summa)} сўм`).catch(() => {});
    if (sorov.manba !== "app") await yubor(ctx, sorov.sid, ["❌ <b>Қарздан минус рад этилди</b>", `💵 <b>${pul(sorov.summa)} сўм</b>`].join("\n")).catch(() => {});
    return { ok: true, sorov: sorovKorinish(env, oxirgi) };
  }
  // ✅ Тасдиқланди — қарздан айирамиз (ботдаги k1 билан бир хил чақирув; хабарлар масъулнинг ўз чатига)
  const tolovId = await tolovYoz(ctx, Number(uid), { message_id: undefined, from: { id: Number(uid) } },
                                 sorov.sid, sorov.summa, `kard:${sorov.id}`, "кардан минус", null, Number(uid), "kard", sorov.manba !== "app");
  return { ok: true, tolovId: tolovId || null, sorov: sorovKorinish(env, await sorovOl(env, id)) };
}

/** Тасдиқ кутаётган «минус» сўровлари (масъул/админ учун) */
export async function kardKutayotganlar(env, hozir = Date.now()) {
  const ro = await kvGet(env, SOROV_KEY, []);
  return (Array.isArray(ro) ? ro : []).filter((s) => s && s.tur === "kard" && s.holati === "kutilmoqda")
    .sort((a, b) => son(b.vaqt) - son(a.vaqt)).map((s) => sorovKorinish(env, s, hozir));
}
export async function takrorKutayotganlar(env, hozir = Date.now()) {
  const ro = await kvGet(env, SOROV_KEY, []);
  return (Array.isArray(ro) ? ro : []).filter((s) => s && s.tur === "pul" && s.kutilmoqda && !s.band)
    .sort((a, b) => son(b.vaqt) - son(a.vaqt)).map((s) => sorovKorinish(env, s, hozir));
}

/* ======================== 3. БУХГАЛТЕР: ЧЕК ======================== */
/** Чекни гуруҳга — айнан сўров эълонига reply қилиб — юборади ва ботнинг omborRasm'ини юргизади.
 *  Натижа гуруҳда кўринади (тасдиқ ёки «ТЕКШИРУВ ЎТМАДИ» тугмалари — уларни бот ишлайди). */
export async function chekYubor(env, uid, sorovId, fayl, izoh) {
  if (!isBuxgalter(uid) && !isOmborAdmin(uid, null)) return { ok: false, xato: "Фақат бухгалтер ёки омбор админи" };
  if (!fayl) return { ok: false, xato: "Чек файли керак" };
  if (fayl.bytes.length > FAYL_MAX) return { ok: false, xato: "Файл 20 MB дан катта" };
  if (!/^(image\/|application\/pdf)/i.test(fayl.mime || "")) return { ok: false, xato: "Расм ёки PDF юборинг" };
  const sorov = await sorovOl(env, sorovId);
  if (!sorov || sorov.tur !== "pul") return { ok: false, xato: "Сўров топилмади" };
  if (sorov.band || sorov.kutilmoqda) return { ok: false, xato: "Сўров очиқ эмас" };
  if (!sorov.guruhMsg) return { ok: false, xato: "Сўровнинг гуруҳдаги эълони йўқ" };
  const guruh = guruhId(env);
  const izohT = String(izoh || "").trim().slice(0, 200);
  const caption = (izohT ? izohT + "\n" : "") + `${ISM[uid] || "Бухгалтер"} — илова орқали`;
  const rasm = /^image\//i.test(fayl.mime);
  const r = await tgFaylYubor(env.BOT_TOKEN, rasm ? "sendPhoto" : "sendDocument", rasm ? "photo" : "document",
    { chat_id: guruh, reply_to_message_id: sorov.guruhMsg, allow_sending_without_reply: true, caption }, fayl);
  if (!r || !r.ok) return { ok: false, xato: "Гуруҳга юборилмади: " + String(r && r.description || "").slice(0, 100) };
  const m = r.result;
  // Ботнинг гуруҳдаги хабар ишловчиси кутадиган кўриниш (бухгалтер reply қилгандек)
  const message = {
    message_id: m.message_id, date: m.date, caption: m.caption || "",
    chat: { id: Number(guruh), type: "supergroup" },
    from: { id: Number(uid), is_bot: false, first_name: ISM[uid] || "" },
    photo: m.photo, document: m.document,
    reply_to_message: { message_id: sorov.guruhMsg, from: { is_bot: true }, text: elonMatn(sorov) },
  };
  let ishlandi = false;
  try { ishlandi = await omborRasm(botCtx(env), message, null); }
  catch (e) { console.error("omborRasm:", e && e.stack || e); return { ok: false, xato: "Чек текширувида хато — гуруҳдаги хабарни кўринг" }; }
  const yangi = await sorovOl(env, sorovId);
  const xabar = yangi && yangi.band ? "Тўлов ёзилди, сўров ёпилди"
    : yangi && son(yangi.tolangan) > son(sorov.tolangan) ? "Қисман тўлов ёзилди"
    : "Бот гуруҳда жавоб берди — текширувни ўша ерда якунланг";
  return { ok: true, ishlandi, xabar, sorov: sorovKorinish(env, yangi || sorov) };
}

/** 📄 PDF'ни ЎҚИБ БЕРИШ — Достон 2026-09-16: «alohida pdf ni ozini yuborishham
 *  mumkun bolsin». Сотувчи фақат PDF танласа, фирма ва СУММА шундан ўқилади
 *  (ботдаги билан АЙНАН бир хил: pdfoqi.js матни + hujjatOqi/GLM + ЖАМИ қоидаси).
 *  Ҳеч нарса сақланмайди — қийматлар сотувчига кўрсатилади, у тасдиқлайди. */
export async function pdfOqi(env, uid, fayl) {
  if (!isOmborSotuvchi(uid) && !isOmborAdmin(uid, null)) return { ok: false, xato: "Сиз сотувчилар рўйхатида йўқсиз" };
  if (!fayl) return { ok: false, xato: "PDF керак" };
  if (!/pdf/i.test(fayl.mime || "") && !/\.pdf$/i.test(fayl.nom || "")) return { ok: false, xato: "Фақат PDF ўқилади" };
  if (fayl.bytes.length > FAYL_MAX) return { ok: false, xato: "Файл 20 MB дан катта" };
  const inflate = async (b) => {
    try {
      const ds = new DecompressionStream("deflate");
      return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(ds)).arrayBuffer());
    } catch { return null; }
  };
  let matn = "";
  try { matn = await pdfMatnToliq(fayl.bytes, inflate, 6000); } catch { matn = ""; }
  if (!matn || matn.replace(/\s/g, "").length < 30)
    return { ok: false, xato: "PDF ичидан матн ўқилмади — фирма ва суммани ўзингиз ёзинг" };
  const h = await hujjatOqi(env, matn);
  if (!h || (!h.firma && !h.summa))
    return { ok: false, xato: "PDF ичидан фирма ва сумма ўқилмади — ўзингиз ёзинг" };
  return { ok: true, firma: h.firma || "", inn: h.inn || "", summa: h.summa || 0,
           xabar: h.firma && h.summa ? "PDF'дан ўқилди" : "PDF'дан тўлиқ ўқилмади — тўлдиринг" };
}

/* ============ 📄 «ПУЛ ЧИҚАРИШ FILE» (Достон 2026-09-25) ============
   Одам счётни БОТГА ташлайди (@bigant_innovation_bot, шахсий чат) — бот
   file_id ни эслаб қолади (src/pdfkut.js). Иловада тугмани босганда
   ФАҚАТ ШУ ЕРДА файл юкланиб ўқилади.
     • PDF бўлса   — фирма, ИНН, сумма ЎЗИ тўлади
     • бошқа тур   — файл бириктирилади, майдонларни одам ўзи ёзади
   Сумма ҳар доим ўзгартирилади: PDF'да 10 млн бўлса ҳам 5 млн юборилади.
   Сотувчи ҳам, супер админ ҳам ишлата олади.                          */
const FILE_YOQ = "Аввал файлни ботга ташланг";

/** Файл ичидан нима ТОПИЛМАГАНИ — огоҳлантириш учун (Достон 2026-09-25:
 *  «bo'sh file yoki boshqacha ma'lumotli file tashlasa ogohlantirish chiqsin»).
 *  ИНН ИХТИЁРИЙ — топилмаса огоҳлантирилмайди; МАЖБУРИЙси фирма ва сумма. */
function yetishmaganlar(o) {
  const y = [];
  if (!String(o.firma || "").trim()) y.push("фирма номи");
  if (!(Number(o.summa) > 0)) y.push("сумма");
  return y;
}

/** Кутиб турган файл борми ва ичида нима бор? Ташламаган бўлса — bor: false */
export async function pdfKutOqi(env, uid) {
  if (!isOmborSotuvchi(uid) && !isOmborAdmin(uid, null)) return { ok: false, xato: "Рухсат йўқ" };
  const kut = await pdfKutOl(env, uid);
  if (!kut) return { ok: true, bor: false };
  const asos = { ok: true, bor: true, nom: kut.nom, vaqt: kut.vaqt, pdf: !!kut.pdf };
  const bilan = (o) => ({ ...asos, ...o, yetishmagan: yetishmaganlar(o) });
  // Аввал ўқилган бўлса — қайта юклаб, нейрон сарфламаймиз
  if (kut.oqildi) return bilan(kut.oqildi);
  // PDF бўлмаса — ўқишга уринмаймиз ҳам (расм, docx, ихтиёрий файл)
  if (!kut.pdf) {
    const oqildi = { firma: "", inn: "", summa: 0, xabar: "" };
    await pdfKutOqildi(env, uid, oqildi);
    return bilan(oqildi);
  }
  // Одатда бу ерга КЕЛМАЙДИ: PDF файл ботга тушган заҳоти ўқилган бўлади
  // (src/pdfkut.js → pdfKutEslab). Бу — ўша ўқиш ишламай қолган ҳолат учун захира.
  const oqildi = (await pdfIchini(botCtx(env), kut)) || { firma: "", inn: "", summa: 0, xabar: "" };
  await pdfKutOqildi(env, uid, oqildi);
  return bilan(oqildi);
}

/** Сўров юбориш — счёт сифатида БОТГА ташланган файл ишлатилади */
export async function pulFileYarat(env, uid, form) {
  if (!isOmborSotuvchi(uid)) return { ok: false, xato: "Сиз сотувчилар рўйхатида йўқсиз" };
  const kut = await pdfKutOl(env, uid);
  if (!kut) return { ok: false, xato: FILE_YOQ };
  // Расм бўлса — sendPhoto, ҳужжат бўлса — sendDocument (sorovnoma.js шунга қарайди)
  const natija = await pulYarat(env, uid, form, null,
    { tur: kut.rasm ? "photo" : "doc", id: kut.id, nom: kut.rasm ? "" : kut.nom });
  // Юборилган бўлса — шу файл иккинчи сўровга қўшилиб кетмасин
  if (natija && natija.ok && !natija.takror) await pdfKutOchir(env, uid);
  return natija;
}

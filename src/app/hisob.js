// src/app/hisob.js — Mini App учун ҳисоб-китоб. ФАҚАТ ЎҚИЙДИ.
//
// Ботнинг ombor.js даги қоидаларини АЙНАН такрорлайди, шунда иловадаги
// рақам ботнинг Excel'идаги рақам билан бир хил чиқади:
//   • sotuvchiExcel  — ой оралиғи: оралиқдан ОЛДИНГИ товар ва тўлов
//     «олдинги даврлар» сифатида қўшилади, КЕЙИНГИси ташлаб юборилади,
//     «Бошланғич қарз» — айнан KV даги қиймат (omb:bq).
//   • adminMatn      — қарздорлик ва ҳақдорлик АЛОҲИДА жамланади.
//   • sorovEslatma   — очиқ сўров: !band && !kutilmoqda && 7 кундан ёш.
// Калит қурувчилар ombor.js да экспорт қилинмаган — шу ерда такрорланди
// (3 қатор), ботнинг файлига тегмаслик учун.
import {
  kvGet, kvGetMany, kursOl, holat, oyOraliq, oylarRoyxati, SOROV_OCHIQ_UMR,
} from "../ombor.js";
import { ISM, son } from "../sklad.js";
import { ddmmyyyy, excelDate } from "../xlsxout.js";

const DAVRLAR_KEY = "omb:davrlar";
const BQ_KEY = "omb:bq";
const BQ_KURS_KEY = "omb:bqkurs";
const SOROV_KEY = "omb:sorov";
const blokKey = (dk, id) => `omb:d:${dk}:${id}`;
const payKey = (id) => `omb:pay:${id}`;
const TZ = 5 * 3600 * 1000;
const ikki = (n) => String(n).padStart(2, "0");

/** Ҳисоботга кирадиган сотувчилар (ombor.js:1152 нинг нусхаси) */
export function hisobotIdlar(davrlar, bq) {
  return [...new Set([
    ...davrlar.flatMap((d) => d.sotuvchilar || []).map(Number),
    ...Object.keys(bq || {}).filter((k) => son(bq[k]) !== 0).map(Number),
  ])];
}
function blokNorm(b) {
  if (!b) return null;
  return { ...b, summa: son(b.summa), soni: son(b.soni),
           mahsulotlar: Array.isArray(b.mahsulotlar) ? b.mahsulotlar : [] };
}

/** Жорий ой — Тошкент вақти бўйича, «2026-09» */
export function joriyOy(hozir = Date.now()) {
  const t = new Date(hozir + TZ);
  return `${t.getUTCFullYear()}-${ikki(t.getUTCMonth() + 1)}`;
}
export function otganOy(hozir = Date.now()) {
  const [y, m] = joriyOy(hozir).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${ikki(d.getUTCMonth() + 1)}`;
}

async function asos(env) {
  const [davrlar, bq, bqKursXom, kursHoz] = await Promise.all([
    kvGet(env, DAVRLAR_KEY, []), kvGet(env, BQ_KEY, {}), kvGet(env, BQ_KURS_KEY, 0), kursOl(env),
  ]);
  const kurs = kursHoz ? son(kursHoz.qiymat) : 0;
  return { davrlar: Array.isArray(davrlar) ? davrlar : [], bq: bq || {}, bqKurs: son(bqKursXom) || kurs, kurs };
}
const dol = (summa, kurs) => (kurs ? summa / kurs : 0);
/** Сана оралиққа нисбатан қаерда: "oldin" | "ichida" | "keyin" (санасиз — ichida, ombor.js:oraliqda каби) */
function qayerda(kun, or) {
  if (!or || kun === null || kun === undefined) return "ichida";
  if (kun < or.dan) return "oldin";
  if (kun > or.gacha) return "keyin";
  return "ichida";
}

/** Сотувчилар рўйхати (админ/тестер танлови учун) */

/**
 * Сотувчининг ҳисоботи (Омбор). oy = "2026-09" ёки null (ҳаммаси).
 * Рақамлар ботнинг «Ойлик ҳисобот» Excel'и билан бир хил.
 */

/** Админ: ҳамма сотувчининг қарзи — БИР kvGetMany билан (sotuvchiExcel каби) */

/** Очиқ «Пул чиқариш» сўровлари (sorovnoma.js:722-727 шарти) */

/* ======================== шерикнинг омбори (snapshot) ========================
   tovar, tolangan, qarz, mahsulotlar:[{sana, nom, soni, narx, summa}],
   tolovlar:[{sana, som, kurs, dollar}] } } }   — ҳаммаси ДОЛЛАРДА.     */
/** Иловадаги сотувчи id: Telegram id; Омбор/Дўкон каби телеграмсизларга — −сотувчи № (Руслан 2026-10-01:
 *  «Омбор босилса очилмаяпти»). Манфий сон ҳеч қачон Telegram фойдаланувчиси эмас — тўқнашмайди. */
/** шерикнинг омбори ҳисоботи — Омбор билан бир хил қоида (олдингиси қўшилади, кейингиси ташланади) */

/* ======================== ДАВР (Mini App v3, Руслан 2026-09-15) ========================
   Сана ёки давр танланади — ўша ҳолатдаги қарз: Бошида (dan'дан олдинги ҳаммаси) +
   давр ичидаги товар − давр ичидаги тўлов = Охирида. dan="2000-01-01" → «Бугун» (бошида = бошланғич). */
const isoSerial = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) + 25569 : null; };
export const sanaMi = (s) => isoSerial(s) !== null;
const yax2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const oyOraliqIso = (oy) => ({ dan: `${oy}-01`, gacha: `${oy}-31` });

export async function davrQarz(env, snap, manba, dan, gacha, hozir = Date.now()) {
  const oy = joriyOy(hozir), oyOr = oyOraliqIso(oy);
  // Омбор — KV блоклари (davrBoshi) ва тўловлар (vaqt), сериал сана билан
  const A = await asos(env);
  const idlar = hisobotIdlar(A.davrlar, A.bq);
  const kalit = [];
  for (const d of A.davrlar) for (const id of idlar) kalit.push(blokKey(d.key, id));
  for (const id of idlar) kalit.push(payKey(id));
  const KV = await kvGetMany(env, kalit);
  const or = { dan: isoSerial(dan), gacha: isoSerial(gacha) }, oyS = { dan: isoSerial(oyOr.dan), gacha: isoSerial(`${oy}-28`) + 3 };
  const satrlar = [];
  let oyTovar = 0, oyTolangan = 0;
  // 💵 ДОЛЛАРДА (Достон 2026-09-21: «summalar hammasi dollarda ko'rinsin») — ботнинг Excel'и билан АЙНАН бир
  // хил қоида: бошланғич қарз ÷ ўз курси (2 хонагача), ҳар товар ÷ давр курси, ҳар тўлов ÷ ўз курси.
  for (const id of idlar) {
    let oldinTovar = 0, oldinTol = 0, tovar = 0, tolangan = 0;
    for (const d of A.davrlar) {
      const b = blokNorm(KV.get(blokKey(d.key, id)));
      if (!b) continue;
      const dk = son(d.kurs) || A.kurs, x = dol(b.summa, dk);
      const k = ddmmyyyy(d.davrBoshi), joy = qayerda(k, or);
      if (joy === "oldin") oldinTovar += x; else if (joy === "ichida") tovar += x;
      if (qayerda(k, oyS) === "ichida") oyTovar += x;
    }
    for (const p of KV.get(payKey(id)) || []) {
      if (!p || p.holat === "bekor") continue;
      const s = dol(son(p.summa), son(p.kurs) || A.kurs), k = excelDate(p.vaqt), joy = qayerda(k, or);
      if (joy === "oldin") oldinTol += s; else if (joy === "ichida") tolangan += s;
      if (qayerda(k, oyS) === "ichida") oyTolangan += s;
    }
    const bqD = Math.round(dol(son(A.bq[id] || 0), A.bqKurs) * 100) / 100;
    const boshida = yax2(bqD + oldinTovar - oldinTol);
    const oxirida = yax2(bqD + oldinTovar - oldinTol + tovar - tolangan);
    satrlar.push({ id, sid: null, ism: ISM[id] || String(id), boshida, tovar: yax2(tovar), tolangan: yax2(tolangan), oxirida, holat: holat(oxirida).nom });
  }
  satrlar.sort((a, b) => b.oxirida - a.oxirida);
  const oxirgi = A.davrlar[0] || null;
  const egasiz = oxirgi ? await kvGet(env, blokKey(oxirgi.key, "egasiz"), []) : [];
  const egK = (oxirgi && son(oxirgi.kurs)) || A.kurs;
  return jamla({ manba: "omb", valyuta: "$", dan, gacha, oy, oyTovar: yax2(oyTovar), oyTolangan: yax2(oyTolangan), kurs: A.kurs, yangilandi: oxirgi ? oxirgi.yuklandi || "" : "",
                 satrlar, egasiz: (Array.isArray(egasiz) ? egasiz : []).map((b) => ({ nom: String(b.nom ?? ""), soni: son(b.soni), summa: yax2(dol(son(b.summa), egK)) })),
                 oxirgiDavr: oxirgi ? { davr: oxirgi.davr || "", sotuvchilar: (oxirgi.sotuvchilar || []).length } : null });
}
function jamla(r) {
  const j = { jamiBoshida: 0, jamiTovar: 0, jamiTolangan: 0, jamiOxirida: 0, jamiQarzdor: 0, jamiHaqdor: 0 };
  for (const s of r.satrlar) {
    j.jamiBoshida += s.boshida; j.jamiTovar += s.tovar; j.jamiTolangan += s.tolangan; j.jamiOxirida += s.oxirida;
    if (s.oxirida > 0) j.jamiQarzdor += s.oxirida; else j.jamiHaqdor += -s.oxirida;
  }
  for (const k of Object.keys(j)) j[k] = yax2(j[k]);
  return { ...r, ...j };
}

/** 📋 Батафсил ҳисобот (Достон 2026-09-23: «exel ichini korib chiqasan… ilovada»).
 *  Ботнинг Excel'идаги учта варақни JSON қилиб беради — рақамлар айни ўша қоидада:
 *    • «Товарлар хисоботи» → mahsulotlar (ҳар товар ўз даврининг курсида)
 *    • «oplata»            → tolovlar    (ҳар тўлов ўз курсида)
 *    • «Қарздорлик умумий» → satrlar     (davrQarz — Excel билан тийинигача бир хил)
 */
export async function batafsil(env, dan, gacha, hozir = Date.now()) {
  const A = await asos(env);
  const idlar = hisobotIdlar(A.davrlar, A.bq);
  const kalit = [];
  for (const d of A.davrlar) for (const id of idlar) kalit.push(blokKey(d.key, id));
  for (const id of idlar) kalit.push(payKey(id));
  const KV = await kvGetMany(env, kalit);
  // Тўлов ҚАЙСИ сўров (фирма) учун эканини кўрсатиш учун (Достон 2026-09-23)
  const sorovXom = await kvGet(env, SOROV_KEY, []);
  const sorovMap = new Map();
  for (const sv of Array.isArray(sorovXom) ? sorovXom : []) {
    for (const t of (sv.tolovlar && sv.tolovlar.length ? sv.tolovlar : sv.tolov ? [sv.tolov] : [])) sorovMap.set(t, sv);
  }
  const or = { dan: isoSerial(dan), gacha: isoSerial(gacha) };
  const mahsulotlar = [], tolovlar = [];
  for (const id of idlar) {
    const ism = ISM[id] || String(id);
    for (const d of A.davrlar) {
      const b = blokNorm(KV.get(blokKey(d.key, id)));
      if (!b) continue;
      if (qayerda(ddmmyyyy(d.davrBoshi), or) !== "ichida") continue;
      const dk = son(d.kurs) || A.kurs;
      const sana = String(d.davrBoshi || "").replace(/^(\d{2})\.(\d{2})\.(\d{4}).*/, "$3-$2-$1");
      for (const p of b.mahsulotlar || []) {
        mahsulotlar.push({ sana, davr: d.davr || "", sotuvchi: ism, nom: String(p.nom ?? ""),
                           soni: son(p.soni), som: son(p.summa), kurs: dk, dollar: dol(son(p.summa), dk) });
      }
    }
    for (const p of KV.get(payKey(id)) || []) {
      if (!p || p.holat === "bekor") continue;
      if (qayerda(excelDate(p.vaqt), or) !== "ichida") continue;
      const k = son(p.kurs) || A.kurs;
      const sr = sorovMap.get(p.id);
      const kard = String(p.chek || "").startsWith("kard:") || /кард/i.test(String(p.manba || ""));
      tolovlar.push({ sana: String(p.vaqt || "").slice(0, 10), sotuvchi: ism, som: son(p.summa), kurs: k,
                      dollar: dol(son(p.summa), k), izoh: p.izoh || "",
                      nima: kard ? "Қарзимдан минус" : (sr && sr.firma) || p.izoh || "—" });
    }
  }
  mahsulotlar.sort((a, b) => b.sana.localeCompare(a.sana) || b.dollar - a.dollar);
  tolovlar.sort((a, b) => b.sana.localeCompare(a.sana) || b.dollar - a.dollar);
  const q = await davrQarz(env, null, "omb", dan, gacha, hozir);
  return {
    dan, gacha, valyuta: "$", kurs: A.kurs, yangilandi: q.yangilandi || "",
    mahsulotlar, tolovlar, satrlar: q.satrlar,
    jamiMahsulot: yax2(mahsulotlar.reduce((t, m) => t + m.dollar, 0)),
    jamiTolov: yax2(tolovlar.reduce((t, p) => t + p.dollar, 0)),
    jamiQarzdor: q.jamiQarzdor, jamiHaqdor: q.jamiHaqdor,
    sotuvchilar: q.satrlar.length, mahsulotSoni: mahsulotlar.length, tolovSoni: tolovlar.length,
  };
}

/** 💵 Тўловлар тарихи (Достон 2026-09-23): «qaysi mahsulot uchun qancha to'lov qilgani
 *  ko'rinsin, kalendar orqali sana/davr tanlansa o'sha davrdagi to'lovlar chiqsin».
 *  Тўлов МАҲСУЛОТГА эмас, СЎРОВГА (фирма/счётга) боғланади — шунинг учун «Нима учун»
 *  устунида ўша сўровнинг фирмаси, «Қарзимдан минус» ёки чекдаги банк изоҳи туради. */
export async function tolovTarix(env, dan, gacha) {
  const A = await asos(env);
  const idlar = hisobotIdlar(A.davrlar, A.bq);
  const KV = await kvGetMany(env, idlar.map((id) => payKey(id)));
  const sorovlar = await kvGet(env, SOROV_KEY, []);
  const sorovMap = new Map();                       // тўлов id → сўров (фирма учун)
  for (const s of Array.isArray(sorovlar) ? sorovlar : []) {
    for (const t of (s.tolovlar && s.tolovlar.length ? s.tolovlar : s.tolov ? [s.tolov] : [])) sorovMap.set(t, s);
  }
  const or = { dan: isoSerial(dan), gacha: isoSerial(gacha) };
  const royxat = [];
  for (const id of idlar) {
    const ism = ISM[id] || String(id);
    for (const p of KV.get(payKey(id)) || []) {
      if (!p || p.holat === "bekor") continue;
      if (qayerda(excelDate(p.vaqt), or) !== "ichida") continue;
      const k = son(p.kurs) || A.kurs;
      const s = sorovMap.get(p.id);
      const kard = String(p.chek || "").startsWith("kard:") || /кард/i.test(String(p.manba || ""));
      royxat.push({
        id: p.id || "", sana: String(p.vaqt || "").slice(0, 10), vaqt: p.vaqt || "",
        sotuvchi: ism, sid: id,
        nima: kard ? "Қарзимдан минус" : (s && s.firma) || p.izoh || "—",
        som: son(p.summa), kurs: k, dollar: dol(son(p.summa), k),
        izoh: p.izoh || "", manba: p.manba || "",
      });
    }
  }
  royxat.sort((a, b) => String(b.vaqt).localeCompare(String(a.vaqt)));
  return {
    dan, gacha, valyuta: "$", royxat, soni: royxat.length,
    jamiSom: royxat.reduce((t, x) => t + x.som, 0),
    jami: yax2(royxat.reduce((t, x) => t + x.dollar, 0)),
    sotuvchilar: [...new Set(royxat.map((x) => x.sotuvchi))].length,
  };
}

/** Бир сотувчи — давр бўйича: ҳисоб карточкаси + тўловлар + товар (кунлар бўйича) */
/** Архив гуруҳидаги нусхага ҳавола — фақат супергуруҳ (-100…) ва id бўлса */
function sotuvchiJamla(h) {
  h.mahsulotlar.sort((a, b) => b.sana.localeCompare(a.sana));
  h.tolovlar.sort((a, b) => b.sana.localeCompare(a.sana));
  const tovarX = h.mahsulotlar.reduce((t, m) => t + m.summa, 0);
  // 🔙 Возврат: шерикнинг омбори возврат қаторларининг ўзи (файлдан келганлари товар қаторига
  //    боғланмаган — Руслан 2026-09-27); бошқа манбада «қайтган» белгили моллар.
  const vozX = Array.isArray(h.vozvratlar) ? h.vozvratlar.reduce((t, v) => t + son(v.summa), 0)
             : h.mahsulotlar.reduce((t, m) => t + (m.qaytgan ? m.summa : 0), 0);
  const tolX = h.tolovlar.reduce((t, p) => t + (h.valyuta === "$" ? p.dollar : p.som), 0);
  h.tovar = yax2(tovarX - vozX);
  h.vozvrat = yax2(vozX);
  h.tolangan = yax2(tolX);
  // Яхлитлаш охирида (Excel ҳам яхлитланмаган қийматларни қўшади — тийинигача мос бўлсин)
  h.oxirida = yax2((h.boshidaXom ?? h.boshida) + tovarX - vozX - tolX);
  delete h.boshidaXom;
  h.holat = holat(h.oxirida).nom;
  // Кунлар бўйича (Руслан 2026-09-15: «бир қадам орқага — кунлар, ичида қаторлар»)
  const k = new Map();
  for (const m of h.mahsulotlar) { const x = k.get(m.sana) || { sana: m.sana, davr: m.davr || "", qator: 0, summa: 0, mahsulotlar: [] }; x.qator++; x.summa = yax2(x.summa + (m.qaytgan ? 0 : m.summa)); x.mahsulotlar.push(m); k.set(m.sana, x); }
  h.kunlar = [...k.values()].sort((a, b) => b.sana.localeCompare(a.sana));
  return h;
}


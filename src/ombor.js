// ombor.js — «📦 Бигант омбор ҳисоботи» бўлими.
//
//  Иш бошқарувчи      → ботга «Бигант Склад.xlsx» (ёки .csv) ташлайди
//                        бот ўқиб, 14 сотувчига ажратиб, KV'га ёзади
//  Сотувчи            → тугмани босади → ФАҚАТ ўзининг ҳисоботи
//  Админ              → тугмани босади → ўзиники + БАРЧА сотувчилар
//  Гуруҳ:  сотувчи    → «фалон МЧЖ га N сўм ўтказилсин»
//          бухгалтер  → пулни ўтказиб, ПЛАТЁЖКА расмини ташлайди
//                     → бот расмни AI билан ўқийди → қарздан айиради
//
// Сақлаш: мавжуд ACCESS_KV (алоҳида база керак эмас).
//   omb:davrlar            -> [{key, davr, yaratilgan, yuklandi, jami, kim}]
//   omb:d:<key>:<tgId>     -> {nom, soni, summa, mahsulotlar:[...]}
//   omb:d:<key>:egasiz     -> [{nom, soni, summa, mahsulotlar}]
//   omb:pay:<tgId>         -> [{id, vaqt, summa, kim, chek, holat}]
//   omb:bq                 -> {<tgId>: бошланғич қарз}
//   omb:chek:<fileUid>     -> "<to'lov id>"   (такрор чекни рад этиш учун)

import { readTable } from "./xlsx.js";
import { buildXlsx, S, dollar, ddmmyyyy, ddmmyyyyhhmm, excelDate, excelDateTime } from "./xlsxout.js";
import { sozdanSumma } from "./sozsumma.js";
import { geminiBor, geminiOqi } from "./gemini.js";
import { pdfMatnToliq } from "./pdfoqi.js";
import { yozishMumkin } from "./taqiq.js";
import { nusxaQatorlar, qismlarniBirlashtir, jadvalgaOxshaydi, jadvalBoshi,
         nusxaTekshir } from "./nusxa.js";
import { parseSklad, tekshir, davrKey, pul, son, normIsm,
         matndanSumma, matndanSummalar,
         ISM, OMBOR_ADMIN, OMBOR_HISOBOT, BUXGALTER, SKLAD_MAP, tgIdByName, SOTUVCHI_KEY } from "./sklad.js";

// «📊 Ҳисоботим» — ҳар бир сотувчи ФАҚАТ ўзиникини кўради.
// «📦 Склад ҳисоботи» — фақат омбор админи: умумий ҳисобот + ҳар сотувчи
//   алоҳида. Сардор ака иккови ҳам бор (у ҳам сотувчи, ҳам админ).
export const BTN_HISOBOTIM = "📊 Ҳисоботим";
// ЭСКИ тугма (2026-09-11 гача). Энди менюда йўқ — телефонда эски клавиатура
// қолган бўлса, босилганда «📥 Ойлик ҳисобот» очилади.
export const BTN_SKLAD = "📦 Умумий ҳисобот";
// Админ тугмалари (2026-09-11, Достон: «умумий ҳисобот керак эмас, ўрнига
// ойлик ҳисобот; курсни танлаш — алоҳида тугма, ортиқча нарса кўринмасин»).
export const BTN_OYLIK = "📥 Ойлик ҳисобот";
export const BTN_KURS = "💱 Курсни танлаш";
export const BTN_SOTUVCHILAR = "👥 Сотувчилар";
// Асосий менюдаги КИРИШ тугмаси. Босилганда омбор бўлимининг ўз
// клавиатураси очилади — асосий меню тугмаларга тўлиб кетмасин.
export const BTN_OMBOR = "📦 Бигант омбор";
export const BTN_ORQAGA = "⬅️ Орқага";

/** Омбор бўлимининг клавиатураси — «📦 Бигант омбор» босилганда очилади.
 *
 *    Сотувчи:  📊 Ҳисоботим
 *              💸 Пул чиқариш · ➖ Қарзимдан минус
 *    Админ:    📥 Ойлик ҳисобот
 *              💱 Курсни танлаш · 👥 Сотувчилар
 *  Икковида ҳам бўлган одам (Достон) — ҳаммасини кўради.              */
export function omborKb(uid, access, BTN_PUL, BTN_KARD) {
  const sotuvchi = isOmborSotuvchi(uid);
  const admin = isOmborAdmin(uid, access);
  const hisobot = isOmborHisobot(uid, access);      // Мурод ака — фақат шу
  const rows = [];

  // 1-қатор: ҳисоботлар ёнма-ён. «Ҳисоботим» — фақат сотувчида: фақат
  // админ бўлган одамга (Мурод ака) у «бириктирилмаган» деб жавоб берарди.
  const birinchi = [];
  if (sotuvchi) birinchi.push({ text: BTN_HISOBOTIM });
  if (hisobot) birinchi.push({ text: BTN_OYLIK });
  if (birinchi.length) rows.push(birinchi);

  // 2-қатор: амаллар ёнма-ён — фақат сотувчида
  if (sotuvchi) rows.push([{ text: BTN_PUL }, { text: BTN_KARD }]);

  // 3-қатор: курс ва сотувчилар — фақат админда, ёнма-ён (тугма кўпаймасин)
  if (admin) rows.push([{ text: BTN_KURS }, { text: BTN_SOTUVCHILAR }]);

  rows.push([{ text: BTN_ORQAGA }]);
  return { keyboard: rows, resize_keyboard: true };
}
// Эски ном — телефонда қолиб кетган клавиатурадан босилса ҳам ишласин
export const BTN_OMBOR_ESKI = "📦 Бигант омбор ҳисоботи";

const MAX_MSG = 3800;              // Telegram лимити 4096 — заҳира билан
// Бир даврда кўрсатиладиган маҳсулот сони. Юқори қўйилган — сотувчи ТЎЛИҚ
// рўйхатни кўриши керак; узун матн bolaklab() орқали бир нечта хабарга
// бўлинади (Telegram'нинг 4096 белги лимити).
const MAHSULOT_LIMIT = 200;
// ПЛАТЁЖКАНИ ЎҚИЙДИГАН МОДЕЛ — Z.ai GLM-5.3 Flash (Cloudflare Workers AI,
// Paid тариф). Достон 2026-09-15: «glm 5.3 flashga mosla shuni ishlatamiz».
// Синов (6 чек): тоза расмда сумма/фирма/ИНН/сана 3/3 тўғри; хира расмда
// ИНН'ни ўйлаб топиши мумкин — шунинг учун пастда иккинчи ўқиш билан
// солиштирилади. Эски Mistral/Llama суммада адашгани учун олиб ташланди.
// Модел номи wrangler.toml даги CHEK_MODEL билан алмаштирилади.
// Эслатма: «GLM-5.3» (Flash'сиз) РАСМНИ КЎРМАЙДИ — фақат Flash ярайди.
export const CHEK_MODEL_STANDART = "@cf/zai-org/glm-5.3-flash";
/* 🔁 ЗАҲИРА МОДЕЛЛАР (Руслан 2026-10-05). 03–05.10 оралиғида GLM-5.3 Flash Cloudflare'да РАСМНИ КЎРМАЙ
 * қолди (ўзи «I'm not able to view the image» дейди) — ҳамма платёжка «сумма аниқ эмас» бўлиб кетди.
 * Энди CHEK_MODEL — вергул билан РЎЙХАТ: биринчиси асосий, қолганлари навбат билан заҳира. Модел
 * суммани ўқиса — тамом; ўқимаса — кейингисига. Синов (15 та ҳақиқий чек/акт, 05.10): Qwen 3.8 —
 * сумма, сана, ҳужжат рақами 12/12, акт 4/4; Mistral Small 3.1 — сумма 12/12, лекин 1 сана ва 1
 * ҳужжат рақами хато; аммо Qwen ўйлаши жуда секин (бутун кўрсатма билан ~28 с, баъзан 240 с), Mistral ≈2 с.
 * Шунинг учун тартиб: Mistral → Qwen (Mistral шубҳа қилса/ўқимаса). GLM эса ўша куни суммани ЎЙЛАБ ТОПА бошлади
 * (13,6 млн лик чекка «20 000 000») — Cloudflare тузатгунча рўйхатдан чиқарилди (wrangler.toml). */
export function chekModellar(env) {
  const r = String((env && env.CHEK_MODEL) || CHEK_MODEL_STANDART).split(",").map((x) => x.trim()).filter(Boolean);
  return r.length ? r : [CHEK_MODEL_STANDART];
}
/** «reasoning_effort» фақат GLM учун: Qwen'га берилса 3 с ўрнига 27 с ўйлайди (05.10 ўлчови) */
export const ojlaydi = (model) => /glm/i.test(String(model));
/* ⏱ БИТТА МОДЕЛГА ВАҚТ ЧЕГАРАСИ (Руслан 2026-10-05): жонли ўлчовда Qwen одатда 3 с, лекин бир марта
 * 236 с жавоб бермади. Telegram вебхукни ~1 дақиқа кутади — шунча кутсак, хабар йўқолиши мумкин.
 * Чегарадан ошса — ўша модел ташланади, кейингиси сўралади. CHEK_MODEL_SEKUND билан ўзгартирилади. */
export const modelSekund = (env) => Math.max(1, Number((env && env.CHEK_MODEL_SEKUND) || 25));
export function vaqtChegarasi(promise, ms, nom) {
  let t;
  return Promise.race([promise, new Promise((_, rad) => { t = setTimeout(() => rad(new Error("вақт тугади: " + nom + " " + ms / 1000 + " с")), ms); })])
    .finally(() => clearTimeout(t));
}

const T = {
  yoq: "Сизга омбор ҳисоботи бириктирилмаган. Админга мурожаат қилинг.",
  bosh: "📭 Ҳисобот ҳали юкланмаган.",
  xato: "❌ Хатолик. Бир оздан сўнг қайта уриниб кўринг.",
  yuklanmoqda: "⏳ Файл ўқилмоқда…",
};

/* ======================== KV ёрдамчилари ======================== */
export async function kvGet(env, key, fallback) {
  if (!env.ACCESS_KV) return fallback;
  try {
    const raw = await env.ACCESS_KV.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { console.error("kvGet", key, e); return fallback; }
}
/**
 * Бир нечта калитни БИР ЙЎЛА ўқийди.
 *
 * НЕГА КЕРАК (2026-09-11): Cloudflare KV'да битта сўров ичида кўпи билан
 * 1 000 та амал қилиш мумкин — Free'да ҳам, Paid'да ҳам. Ҳисоботлар ҳар
 * бир юкланган даврни ҳар бир сотувчи учун АЛОҲИДА ўқирди: 13 × даврлар.
 * 76-файлдан кейин ҲАММА ҳисобот (сотувчининг «Ҳисоботим»и ҳам) ишламай
 * қоларди. KV'нинг бир йўла ўқиши (100 тагача калит) эса 1 та амал
 * ҳисобланади — энди 1 000 давр ҳам ~15 та амалга сиғади.
 *
 * Эски муҳит бир йўла ўқишни билмаса (синов стенди), ҳар калитни
 * алоҳида ўқишга ўтади — натижа бир хил.
 *
 * @returns {Promise<Map<string, any>>} калит → JSON қиймат (йўқ бўлса fallback)
 */
export async function kvGetMany(env, keys, fallback = null) {
  const natija = new Map();
  const noyob = [...new Set(keys)];
  if (!env.ACCESS_KV) { for (const k of noyob) natija.set(k, fallback); return natija; }
  const oqi = (k, raw) => {
    if (raw === null || raw === undefined || raw === "") return fallback;
    if (typeof raw !== "string") return raw;
    try { return JSON.parse(raw); } catch (e) { console.error("kvGetMany", k, e); return fallback; }
  };
  for (let i = 0; i < noyob.length; i += 100) {
    const bolak = noyob.slice(i, i + 100);
    let m = null;
    try {
      const r = await env.ACCESS_KV.get(bolak);
      if (r instanceof Map) m = r;
    } catch { m = null; }
    if (m) {
      for (const k of bolak) natija.set(k, oqi(k, m.get(k)));
    } else {
      for (const k of bolak) {
        let raw = null;
        try { raw = await env.ACCESS_KV.get(k); } catch (e) { console.error("kvGetMany", k, e); }
        natija.set(k, oqi(k, raw));
      }
    }
  }
  return natija;
}

/* ---------- РЎЙХАТНИ ПОЙГАСИЗ ЁЗИШ ----------
   Муаммо (2026-09-11 глобал текширув): тўловлар ва сўровлар рўйхати
   «ўқи → ўзгартир → ёз» қилинарди. Икки одам бир вақтда ёзса — иккинчиси
   биринчисининг ёзувини ЎЧИРИБ юборарди. Энг хавфлиси «omb:sorov»: у
   ҲАММА сотувчи учун БИТТА калит — икки сотувчи бир пайтда сўров юборса,
   бири йўқолиши мумкин эди.

   Cloudflare KV'да атомик ёзиш йўқ (Durable Object эса мураккаблик
   қўшарди). Шунинг учун икки қаватли ҳимоя:

   1) НАВБАТ (QULF). Бир Worker нусхасига келган сўровлар бир калитга
      навбат билан ёзади — бири тугамагунча иккинчиси ўқимайди. Кичик
      трафикда Telegram сўровлари деярли ҳар доим битта нусхага тушади,
      шунинг учун асосий ҳимоя шу.
   2) ТЕКШИРИШ. Ёзгандан кейин қисқа кутиб ҚАЙТА ўқиймиз — ўзгариш
      жойидами? Бошқа нусха устидан ёзиб юборган бўлса, ЭНГ СЎНГГИ рўйхатни
      олиб, ўзгаришни қайта қўллаймиз. Кутиш (300 ms) бошқа ёзувчининг
      «ўқиди → ёзди» оралиғидан узун бўлгани учун у ёзувни ушлаб қоламиз.
      Бир калитга секундига 1 та ёзув лимити (KV 429) ҳам шу ерда четланади.

   amal(ro)     — ЭНГ СЎНГГИ рўйхатга ўзгаришни қўллаб, янги рўйхат қайтаради.
                  Такрор қўлланса ҳам натижа ўша (мас. «id=X йўқ бўлса қўш»).
   tayyormi(ro) — ўзгариш рўйхатда турибдими.                              */
export const KV_TEKSHIR_MS = 300;
const QULF = new Map();                     // калит → навбатнинг охирги ваъдаси
function navbat(key, ish) {
  const bu = (QULF.get(key) || Promise.resolve()).then(ish);
  const dum = bu.catch(() => {});
  QULF.set(key, dum);
  dum.then(() => { if (QULF.get(key) === dum) QULF.delete(key); });
  return bu;
}
export function kvRoyxatYoz(env, key, amal, tayyormi, opt) {
  if (!env.ACCESS_KV) return Promise.reject(new Error("ACCESS_KV binding йўқ"));
  return navbat(key, () => royxatYozBir(env, key, amal, tayyormi, opt));
}
async function royxatYozBir(env, key, amal, tayyormi, { kutish = KV_TEKSHIR_MS } = {}) {
  const uxla = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  for (let urinish = 0; urinish < 5; urinish++) {
    const ro = await kvGet(env, key, []);
    if (urinish > 0 && tayyormi(ro)) return true;
    const yangi = JSON.stringify(amal(ro));   // бу ердаги хато — дастур хатоси, қайта уринмаймиз
    try {
      await env.ACCESS_KV.put(key, yangi);
    } catch (e) {
      // KV: бир калитга секундига биттадан ортиқ ёзув — бир оз кутиб яна
      console.warn("kvRoyxatYoz put:", key, e && e.message);
      await uxla(Math.max(kutish, 1) * 4);
      continue;
    }
    await uxla(kutish);
    if (tayyormi(await kvGet(env, key, []))) return true;
    await uxla(kutish + Math.floor(Math.random() * kutish));
  }
  console.error("kvRoyxatYoz: ёзув тасдиқланмади", key);
  return false;
}

export async function kvPut(env, key, val) {
  if (!env.ACCESS_KV) throw new Error("ACCESS_KV binding йўқ");
  await env.ACCESS_KV.put(key, JSON.stringify(val));
}

/* ---------- ДОЛЛАР КУРСИ ----------
   Бигантнинг ҳисоби долларда юритилади, ботники эса сўмда. Курс битта
   жойда — KV'да — сақланади ва икки жойда ишлатилади:
     • «💱 Курс» тугмаси орқали бошланғич қарзларни сўмга ўтказиш
     • Excel'даги «Курс» устунини тўлдириш («Оплата ($)» ўзи ҳисобланади)
   Аввал курс ҳеч қаерда сақланмасди — бухгалтер ҳар файлда қўлда
   ёзарди.                                                            */
const KURS_KEY = "omb:kurs";
const KURS_MIN = 1000, KURS_MAX = 100000;

/** @returns {Promise<{qiymat:number, kim:number, vaqt:number}|null>} */
export async function kursOl(env) {
  const k = await kvGet(env, KURS_KEY, null);
  if (k == null) return null;
  // Одатда {qiymat, kim, vaqt} объекти. Аммо қиймат ОДДИЙ СОН бўлиб
  // ёзилиб қолиши мумкин (панелдан қўлда таҳрирланса, эски захирадан
  // тикланса). Аввал бундай ҳолда курс «йўқ» деб ҳисобланиб, ҳамма
  // доллар устунлари ЖИМГИНА нолга айланарди.
  if (typeof k === "number" || typeof k === "string")
    return son(k) > 0 ? { qiymat: son(k) } : null;
  return son(k.qiymat) > 0 ? k : null;
}

export async function kursQoy(env, qiymat, uid) {
  await kvPut(env, KURS_KEY, { qiymat: son(qiymat), kim: uid, vaqt: Date.now() });
}

const davrlarKey = () => "omb:davrlar";
// Бошланғич қарз ҚАЙСИ курсда сўмга айлантирилгани
const BQ_KURS_KEY = "omb:bqkurs";
const blokKey = (dk, id) => `omb:d:${dk}:${id}`;
const payKey = (id) => `omb:pay:${id}`;

export function isOmborAdmin(uid, access) {
  // СИНОВ ТАҚСИМОТИ (2026-09-10): аввал бу ерда «|| access.isSuperAdmin(uid)»
  // ҳам бор эди — супер-админ (Руслан) автоматик равишда омбор админи
  // бўларди. Ҳозир унга ФАҚАТ бухгалтер роли керак, шунинг учун орқа
  // эшик ёпилди. ⚙️ Бошқарув панели бунга боғлиқ эмас — у алоҳида
  // текширув (access.isSuperAdmin) билан ишлайверади.
  //
  // ҚАЙТАРИШ: қаторни яна `|| (access && access.isSuperAdmin(uid))` билан
  // тўлдириш кифоя.
  void access;
  return OMBOR_ADMIN.includes(Number(uid));
}

/** ҲИСОБОТ ҲУҚУҚИ: тўлиқ админ ЁКИ «фақат ҳисобот» рўйхатидаги одам.
 *  Мурод ака шу ерда: Excel'ни кўради, лекин ҳеч нимани ўзгартирмайди. */
export function isOmborHisobot(uid, access) {
  return isOmborAdmin(uid, access) || OMBOR_HISOBOT.includes(Number(uid));
}
export function isBuxgalter(uid) {
  return BUXGALTER.includes(Number(uid));
}
export function isOmborSotuvchi(uid) {
  return Object.values(SKLAD_MAP).includes(Number(uid));
}

/* ============ ГУРУҲДАГИ СЎРОВЛАР (сотувчи ёзган пул сўрови) ============
   Ҳақиқий иш тартиби (result.json дан ўрганилди):
       Сотувчи:   «11 mln VERO-SMART МЧЖ га»
       Бухгалтер: [платёжка расми]  — ИЗОҲСИЗ, кўпинча reply ҳам эмас
   Шу сабабли бот сотувчиларнинг сўровларини эслаб туради ва чекдаги
   суммани ўшаларга солиштириб, эгасини ўзи топади.                     */

/** Платёжка ва сўровлар қабул қилинадиган гуруҳ(лар).
 *  OMBOR_GURUH да БИР НЕЧТА id бўлиши мумкин — вергул ёки бўшлиқ билан:
 *    OMBOR_GURUH = "-1001000000001,-1001000000002"
 *  Бўш бўлса — ҳар қандай чатдан қабул қилинади (тавсия этилмайди). */
function omborGuruhmi(env, chatId) {
  const xom = String(env.OMBOR_GURUH || "").trim();
  if (!xom) return true;
  return xom.split(/[,;\s]+/).filter(Boolean).includes(String(chatId));
}

const SOROV_KEY = "omb:sorov";
/* СЎРОВНИНГ УМРИ (2026-09-11 глобал текширувдан кейин).
   Аввал ҲАР ҚАНДАЙ сўров 3 кундан кейин ЖИМГИНА ўчиб кетарди. Банк
   ўтказмаси дам олиш кунлари билан 3 кундан ошиб кетиши мумкин —
   бухгалтер 4-куни эълонга reply қилиб платёжка ташласа, бот ЖИМ турарди
   ва тўлов ҳеч қаерга ёзилмасди. Энди:
     • ОЧИҚ (тўланмаган) сўров 7 кун кутади; кейин cron уни ЁПАДИ ва
       гуруҳга ҳамда сотувчига «муддати ўтди» деб айтади (sorovEslatma);
     • ЁПИЛГАН сўров 3 кун сақланади (такрорни аниқлаш учун), кейин ўчади;
     • рўйхат тўлиб кетса, аввал ЁПИЛГАНлари сиқиб чиқарилади.        */
const SOROV_UMR = 3 * 24 * 3600 * 1000;              // ёпилган сўров
export const SOROV_OCHIQ_UMR = 7 * 24 * 3600 * 1000; // очиқ сўров
const SOROV_ZAHIRA = 2 * 24 * 3600 * 1000;           // cron улгурсин
// Сақланадиган сўнгги сўровлар. 60 та кам эди: 14 сотувчи кунига бир
// нечта сўров юборса, ТЎЛАНМАГАН сўров рўйхатдан сиқиб чиқарилиб,
// бухгалтер чек ташлаганда «топилмади» бўлиб қоларди.
const SOROV_MAX = 200;

// Битта тўловнинг ЭНГ КАТТА суммаси. Бундан ортиғи — хато (нотўғри
// ўқилган чек, тугма ичидаги бузилган сон). Энг катта ҳақиқий қарз
// ~500 млн, шунинг учун 5 млрд — хавфсиз шифт.
const TOLOV_MAX = 5_000_000_000;
// ЭСКИ ЧЕК ТЕКШИРУВИ (30 кундан эски / келажак санали платёжка).
// ⚠️ СИНОВ (Достон 2026-09-15): «eski platyoshkani ham tashasam tasdiqlansin,
// rial ishga tushirganda eslatasan — yopib qo'y». ҲАҚИҚИЙ ИШГА ЎТИШДА — true!
// (false бўлганда эски чекни қайта ташлаб, пулни икки марта айириш мумкин.)
// Достон 2026-09-25 да ЁҚДИ: «sotuvchi so'roviga buxgalter eski chek tashlasa
// ogohlantirish chiqsin». Қоида: чек санаси СЎРОВ санасидан олдин бўлса — эски.
export const ESKI_CHEK_TEKSHIR = true;

// ИНН ТЕКШИРУВИ. Достон 2026-09-16: «inn oqish shart bolmasin, faqat summa va
// firma nomi orqali» — PDF да ҳам, қўлда ёзилганда ҳам. Чек фақат ФИРМА + СУММА
// билан текширилади; ИНН ўқилса, хабарда кўрсатилади, лекин тўловни ТЎХТАТМАЙДИ.
// Керак бўлса — true қилинса, эски қоида (PDF да ИНН текширилиши) қайтади.
export const INN_TEKSHIR = false;

/** Рўйхатда нималар қолади: эскирганлар ўчади, тўлиб кетса — аввал ёпилганлар. */
export function sorovSaqla(ro, now = Date.now()) {
  let q = ro.filter((x) => now - x.vaqt < (x.band ? SOROV_UMR : SOROV_OCHIQ_UMR + SOROV_ZAHIRA));
  let ortiq = q.length - SOROV_MAX;
  if (ortiq > 0) {
    q = q.filter((x) => !(x.band && ortiq-- > 0));   // энг эски ёпилганлар
    if (q.length > SOROV_MAX) q = q.slice(-SOROV_MAX);
  }
  return q;
}

// «#ombor» — МАЖБУРИЙ белги. Гуруҳга омбордан бошқа ҳисоботлар ҳам
// ташланади; тегсиз бот ҳаммасини сўров деб ўқиб, керак бўлмаган жойда
// аралашиб кетарди. Энди ФАҚАТ тег қўйилган сўров ўқилади.
// Битта тег = битта тўлов; иккинчиси учун яна тег ёзилади.
const OMBOR_TAG = /#\s*ombor|#\s*омбор/i;

// Тег бир хабарда, тўлов эса КЕЙИНГИ хабарда ёзилиши мумкин:
//     «#ombor»
//     «VERO-SMART МЧЖ га 10 mln»
// Шунинг учун тег очиқ туради ва сотувчининг кейинги хабарини кутади.
const TEG_KEY = "omb:teg";
const TEG_UMR = 30 * 60 * 1000;              // 30 дақиқа

// Битта фирмага шу муддат ичида иккинчи сўров — огоҳлантирилади.
// Тақиқланмайди: сотувчи тасдиқласа, тўлов ўтаверади.
const DUBLIKAT_OYNA = 3 * 3600 * 1000;       // 3 соат

/** ms → «14:05» (Тошкент вақти, UTC+5) */
function soat(ms) {
  const d = new Date(Number(ms) + 5 * 3600 * 1000);
  return String(d.getUTCHours()).padStart(2, "0") + ":" +
         String(d.getUTCMinutes()).padStart(2, "0");
}

/** ms → «08.09.2026 14:05» — ёлғиз турган санада ЙИЛ ҳам кўринсин.
 *  Сўров бир неча кун очиқ туриши мумкин, «09.09» қайси йил экани
 *  тушунарсиз эди.                                                    */
export function kunSoatYil(ms, ajratgich = " ") {
  const d = new Date(Number(ms) + 5 * 3600 * 1000);
  return String(d.getUTCDate()).padStart(2, "0") + "." +
         String(d.getUTCMonth() + 1).padStart(2, "0") + "." +
         d.getUTCFullYear() + ajratgich + soat(ms);
}

/** Гуруҳдаги матнли хабар. Ҳеч қачон хабарни «емайди» — фақат эслаб қолади. */
/* ---------- PDF ичидан матн ўқиш ----------
   Сотувчи счёт/шартнома PDF'ини ташлаб, тагига «11 mln» деб ёзиши мумкин —
   фирма номи ФАЙЛ ИЧИДА бўлади. Уни ўқимасак, фирма текшируви ишламайди.

   Ишлайди:  1С/Excel/Word'дан чиқарилган ОДДИЙ (матнли) PDF — Ўзбекистонда
             счётлар одатда шундай.
   Ишламайди: сканер қилинган ёки расмдан ясалган PDF (ичида матн йўқ) —
             ундай ҳолда бўш қайтади ва текширув «билиб бўлмади» бўлади,
             яъни тўлов аввалгидек ёзилаверади.

   CPU'ни асраш учун: фақат 2 МБ гача файл, фақат биринчи 40 та оқим.      */

const PDF_MAX = 2 * 1024 * 1024;

/** zlib (FlateDecode) оқимини очади. Нативе — JS CPU'ни емайди. */
async function inflate(bytes) {
  try {
    const ds = new DecompressionStream("deflate");
    const s = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(s).arrayBuffer());
  } catch { return null; }
}

/** PDF контент-оқимидан кўринадиган матнни ажратади: (матн) Tj ва [...] TJ */
function pdfOqimMatni(s) {
  const chiqdi = [];
  // (...) ичидаги матн — қавс экранланиши \( \) ҳисобга олинади
  for (const m of s.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
    const t = m[0].slice(1, -1)
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\t/g, " ")
      .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    if (t.trim()) chiqdi.push(t);
  }
  return chiqdi.join(" ");
}

export async function pdfMatn(ctx, doc, maks = 1000) {
  const { token } = ctx;
  try {
    if (!doc || (doc.file_size && doc.file_size > PDF_MAX)) return "";
    const info = await (await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${doc.file_id}`)).json();
    if (!info.ok) return "";
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!res.ok) return "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > PDF_MAX) return "";

    // 1) ToUnicode жадвали билан (кириллица, Excel/1C PDF'лари). 2026-09-15:
    //    эски усул бундай PDF'дан фақат рақамларни чиқарарди.
    const toliq = await pdfMatnToliq(buf, inflate, Math.max(maks, 1000));
    if ((toliq.match(/[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]{3,}/g) || []).length >= 3) return toliq.slice(0, maks);

    // 2) Эски усул — (матн) Tj. Байтларни latin1 матнга айлантирамиз — оқим чегараларини топиш учун
    let xom = "";
    for (let i = 0; i < buf.length; i += 8192) {
      xom += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    }

    const bolaklar = [];
    let n = 0;
    const re = /stream\r?\n?/g;
    let m;
    while ((m = re.exec(xom)) !== null && n < 40) {
      const bosh = m.index + m[0].length;
      const oxir = xom.indexOf("endstream", bosh);
      if (oxir === -1) break;
      n++;
      // «endstream» дан олдинги \r\n оқимга кирмайди — акс ҳолда ортиқча
      // байт қолиб, zlib очилмай қоларди (шу сабабли сиқилган PDF ўқилмасди).
      let son2 = oxir;
      while (son2 > bosh && (buf[son2 - 1] === 0x0a || buf[son2 - 1] === 0x0d)) son2--;
      const xomOqim = buf.subarray(bosh, son2);
      // Сиқилганми? zlib сарлавҳаси 0x78 билан бошланади
      const ochilgan = xomOqim[0] === 0x78 ? await inflate(xomOqim) : xomOqim;
      if (!ochilgan) { re.lastIndex = oxir + 9; continue; }
      let matn = "";
      for (let i = 0; i < ochilgan.length; i += 8192) {
        matn += String.fromCharCode.apply(null, ochilgan.subarray(i, i + 8192));
      }
      if (matn.includes("Tj") || matn.includes("TJ")) bolaklar.push(pdfOqimMatni(matn));
      // «endstream» дан КЕЙИН давом этамиз — акс ҳолда ўша сўзнинг ичидаги
      // «stream» қайта топилиб, қолган оқимлар ўқилмай қоларди.
      re.lastIndex = oxir + 9;
    }
    const eski = bolaklar.join(" ").replace(/\s+/g, " ").trim();
    return (eski.length >= toliq.length ? eski : toliq).slice(0, maks);
  } catch (err) {
    console.error("pdfMatn:", err);
    return "";
  }
}

/** Хабардаги PDF ичини ўқиб, `__matn` га ёзиб қўяди (бир марта). */
async function pdfliQil(ctx, msg) {
  const d = msg && msg.document;
  if (d && d.mime_type === "application/pdf" && d.__matn === undefined) {
    d.__matn = await pdfMatn(ctx, d);
  }
}

/** Хабардаги БАРЧА матнни йиғади.
 *
 *  Сотувчи сўровни хоҳлаган кўринишда ёзади: оддий матн, расм остига изоҳ,
 *  PDF/счёт файли (фирма номи файл номида ёки изоҳда бўлади). Аввал фақат
 *  `message.text` ўқиларди — қолгани умуман кўринмасди. */
function xabarMatni(msg) {
  if (!msg) return "";
  const d = msg.document;
  return [msg.text, msg.caption, d && d.file_name, d && d.mime_type === "application/pdf" && d.__matn]
    .filter(Boolean).join(" ").trim();
}

/** Хабар + унинг ота-хабари. Сотувчи аввал PDF ташлаб, кейин унга reply
 *  қилиб «11 mln» деб ёзиши мумкин — сумма бир хабарда, фирма иккинчисида. */
function sorovMatni(msg) {
  return [xabarMatni(msg), xabarMatni(msg && msg.reply_to_message)]
    .filter(Boolean).join("  ·  ").slice(0, 400);
}

export async function omborSorov(ctx, message, access) {
  const { env } = ctx;
  const uid = message.from && message.from.id;
  if (!uid) return false;
  if (message.chat.type === "private") return false;
  if (!omborGuruhmi(env, message.chat.id)) return false;
  if (!isOmborSotuvchi(uid)) return false;             // фақат сотувчиларнинг сўрови

  // PDF бўлса — ичидаги матнни ўқишга ҳаракат қиламиз (фирма номи ўша ерда).
  // Ота-хабарни ҳам: сотувчи аввал счётни ташлаб, кейин унга reply қилиб
  // «11 mln» деб ёзиши мумкин — фирма файлда, сумма reply'да бўлади.
  // ── ШАРТ: «#ombor» бўлмаса — умуман аралашмаймиз.
  //    Гуруҳда бошқа ҳисоботлар ҳам муҳокама қилинади; тегсиз хабарни
  //    сўров деб ўқисак, бот керак бўлмаган жойда жавоб бериб қўярди.
  //
  //    Тег АВВАЛ енгил матндан текширилади (матн, изоҳ, файл номи).
  //    PDF ичини ўқиш файлни юклаб олишни талаб қилади — тегсиз
  //    ҳужжатларга уни сарфламаймиз (гуруҳга кунига ўнлаб файл тушади).
  const yengil = [xabarMatni(message), xabarMatni(message.reply_to_message)]
    .filter(Boolean).join("  ·  ");
  const now = Date.now();
  const teglar = await kvGet(env, TEG_KEY, {});
  const eski = teglar[uid];
  const ochiq = eski && now - eski.vaqt < TEG_UMR ? eski : null;
  const teg = OMBOR_TAG.test(yengil);
  if (!teg && !ochiq) return false;

  // Энди — PDF ичидаги матн (фирма номи одатда ўша ерда)
  await pdfliQil(ctx, message);
  await pdfliQil(ctx, message.reply_to_message);

  const matn = sorovMatni(message);
  if (!matn) return false;

  // Суммани ҚАЕРДАН олиш: аввало сотувчининг ЎЗИ ёзганидан (матн/изоҳ).
  // PDF ичида ҳам сумма бор — иккисини қўшсак, битта сўров ИККИ марта
  // ёзилиб қоларди. Ўзи ёзмаган бўлса — файл/ота-хабардан оламиз.
  const ozi = [message.text, message.caption].filter(Boolean).join(" ");
  let summalar = matndanSummalar(ozi);
  if (!summalar.length) summalar = matndanSummalar(matn);
  summalar = [...new Set(summalar)];                   // такрорини ташлаймиз
  // «#ombor → битта тўлов» қоидаси: фақат биринчи сумма олинади
  summalar = summalar.slice(0, 1);

  // Сумма ҳали ёзилмаган бўлса — тегни ОЧИҚ қолдирамиз ва сотувчининг
  // кейинги хабарини кутамиз («#ombor» → кейин «VERO-SMART га 10 mln»).
  if (!summalar.length) {
    const yangiTeglar = {};
    for (const [k, v] of Object.entries(teglar)) {
      if (now - v.vaqt < TEG_UMR) yangiTeglar[k] = v;  // эскиларини тозалаймиз
    }
    yangiTeglar[uid] = {
      // Вақт — тег БИРИНЧИ қўйилган пайт. Акс ҳолда сотувчи гаплашиб турса,
      // ойна чўзилавериб, тег соатлаб очиқ қоларди.
      vaqt: ochiq ? ochiq.vaqt : now,
      // Контекст ЙИҒИЛАДИ: «#ombor VERO-SMART» → «ҳа шу» → «10 mln»
      // кетма-кетлигида фирма номи йўқолиб кетмаслиги учун.
      matn: [ochiq && ochiq.matn, matn].filter(Boolean).join("  ·  ").slice(0, 400),
    };
    await kvPut(env, TEG_KEY, yangiTeglar);
    return false;
  }

  // Контекст: тег хабаридаги матн (фирма ўша ерда бўлиши мумкин) + шу хабар
  const toliqMatn = [ochiq && ochiq.matn, matn].filter(Boolean).join("  ·  ").slice(0, 500);

  // Сўров ёзилди — тег ёпилади (битта тег = битта тўлов)
  if (ochiq) {
    const qolgan = {};
    for (const [k, v] of Object.entries(teglar)) {
      if (String(k) !== String(uid) && now - v.vaqt < TEG_UMR) qolgan[k] = v;
    }
    await kvPut(env, TEG_KEY, qolgan);
  }

  const ro = await kvGet(env, SOROV_KEY, []);

  // ── ТАКРОРИЙ СЎРОВ? Шу сотувчи ШУ ФИРМАга яқинда сўраганми?
  const oldingi = ro.find((x) =>
    x.sid === uid && !x.band && now - x.vaqt < DUBLIKAT_OYNA &&
    firmaMos(x.matn, toliqMatn) === "mos");

  const yangilar = summalar.map((s) => ({
    id: Math.random().toString(36).slice(2, 8), sid: uid, summa: s,
    matn: toliqMatn, msg: message.message_id, vaqt: now,
    band: false, teg,
    // Такрор бўлса — тасдиқлангунча ЧЕТДА туради: бухгалтер чек ташласа,
    // бу сўровга автомат уланиб кетмаслиги учун.
    kutilmoqda: Boolean(oldingi),
  }));

  const yangiId = new Set(yangilar.map((y) => y.id));
  await kvRoyxatYoz(env, SOROV_KEY,
    (joriy) => {
      const bor = new Set(joriy.map((x) => x.id));
      return sorovSaqla(joriy.concat(yangilar.filter((y) => !bor.has(y.id))), now);
    },
    (joriy) => [...yangiId].every((id) => joriy.some((x) => x.id === id)));

  if (oldingi) {
    const y = yangilar[0];
    await yubor(ctx, message.chat.id, [
      `⚠️ <b>${esc(ISM[uid] || uid)} — ТАКРОРИЙ СЎРОВ</b>`,
      `🏢 <b>${esc(firmaKorinishi(toliqMatn) || "—")}</b>`,
      blok([
        qator(kunSoatYil(oldingi.vaqt, "-"), pul(oldingi.summa) + " олдинги"),
        qator(kunSoatYil(now, "-"), pul(y.summa) + " янги"),
      ].join("\n")),
      "",
      "Бу ҲАҚИҚАТАН алоҳида, иккинчи тўловми?",
      "<i>Тасдиқламагунингизча бухгалтернинг чеки бу сўровга уланмайди.</i>",
    ].join("\n"), {
      reply_to_message_id: message.message_id,
      reply_markup: { inline_keyboard: [
        [{ text: "✅ Ҳа, бу алоҳида тўлов", callback_data: `omb|sq|${y.id}` }],
        [{ text: "❌ Йўқ, адашдим", callback_data: `omb|sn|${y.id}` }],
      ] },
    });
  }
  return false;                                        // хабар давом этсин
}

/* ---------- ИНН (СТИР) ----------
   Ўзбекистонда юридик шахснинг ИНН'и — 9 та рақам. Счётда ҳам, платёжкада
   ҳам ёзилади: иккови мос келса, пул АЙНАН ўша фирмага кетгани деярли
   шубҳасиз (ном ёзилишида фарқ бўлиши мумкин, ИНН эса ягона).           */

/** Матндан 9 хонали ИНН'ларни ажратиб олади */
export function innlar(matn) {
  const t = String(matn ?? "");
  const out = new Set();
  // «ИНН 123456789» — белгиси бор бўлса, шубҳасиз
  for (const m of t.matchAll(/(?:инн|inn|стир|stir)\D{0,3}(\d{9})(?!\d)/gi)) out.add(m[1]);
  // Белгисиз 9 хонали сон «000» билан тугаса — бу СУММА (150000000 = 150 млн),
  // ИНН эмас. Аввал ИНН деб олиниб, ҳар бир чек «ИНН мос эмас» бўларди.
  for (const x of t.replace(/[^\d]+/g, " ").match(/\b\d{9}\b/g) || []) {
    if (!/000$/.test(x)) out.add(x);
  }
  return out;
}

/** AI қайтарган ИНН'ни тозалайди: фақат 9 рақам бўлса қабул қиламиз */
function innTop(v) {
  const raq = String(v ?? "").replace(/\D/g, "");
  return raq.length === 9 ? raq : "";
}

/**
 * Чекдаги ИНН сўровдагиси билан мос келадими?
 * @returns {"mos"|"mos_emas"|"bilib_bolmadi"}
 */
export function innMos(sorovMatn, chekInn) {
  const inn = innTop(chekInn);
  if (!inn) return "bilib_bolmadi";
  const bor = innlar(sorovMatn);
  if (!bor.size) return "bilib_bolmadi";
  return bor.has(inn) ? "mos" : "mos_emas";
}

/** Сўров матнидан фирма номини кўрсатиш учун ажратади: «VERO SMART» */
/** Ҳуқуқий шакллар — улар ҲАР ДОИМ бош ҳарфда ёзилади (MCHJ, ООО ...) */
const HUQUQIY = new Set([
  "mchj", "мчж", "ooo", "ооо", "оoо", "xk", "хк", "aj", "аж",
  "yatt", "ятт", "qk", "қк", "mchjmchj", "ltd", "llc", "ip", "ип",
  "as", "ас", "uz", "uzb", "inc", "co",
]);

/**
 * Фирма номини чиройли кўринишга келтиради: ҳар сўзнинг бош ҳарфи катта.
 * Сотувчилар «convitech mchj», «CONVITECH MCHJ», «Convitech Mchj» деб
 * ҳар хил ёзади — гуруҳдаги эълон эса бир хил кўринсин.
 *
 * Қоида:
 *   • ҳуқуқий шакл (mchj, ооо ...)     -> ТЎЛИҚ бош ҳарфда
 *   • сўз аллақачон тўлиқ каттада      -> тегилмайди (аббревиатура)
 *   • қолгани                          -> биринчи ҳарф катта, қолгани кичик
 * Дефис ва нуқтадан кейин ҳам бош ҳарф катта: «vero-smart» -> «Vero-Smart»
 */
export function firmaChiroyli(matn) {
  const xom = String(matn || "").replace(/\s+/g, " ").trim();
  if (!xom) return xom;
  return xom.split(" ").map((soz) => {
    const toza = soz.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    if (HUQUQIY.has(toza)) return soz.toUpperCase();
    // Тўлиқ катта ҳарфли сўз — аббревиатура бўлиши мумкин, тегмаймиз
    if (soz === soz.toUpperCase() && /\p{L}/u.test(soz)) return soz;
    // Дефис/нуқта/қавсдан кейин ҳам бош ҳарф катта бўлсин
    return soz.toLowerCase().replace(/(^|[-–—.\/(«"'])(\p{L})/gu,
      (_, oldin, harf) => oldin + harf.toUpperCase());
  }).join(" ");
}

/** Ҳуқуқий шакл сўзи -> қандай ёзилиши. Калит — кичик ҳарфда, келишик
 *  қўшимчасисиз («mchjga» ҳам «mchj» деб топилади).                    */
const SHAKL_KORINISH = {
  mchj: "MCHJ", мчж: "МЧЖ", ooo: "OOO", ооо: "ООО",
  ltd: "LTD", llc: "LLC", xk: "XK", хк: "ХК",
  aj: "AJ", аж: "АЖ", yatt: "YATT", ятт: "ЯТТ", qk: "QK", қк: "ҚК",
};
// «mchj», «mchjga», «мчждан» … — келишик қўшимчаси 5 ҳарфгача
const SHAKL_RE = new RegExp(
  "^(" + Object.keys(SHAKL_KORINISH).join("|") + ")[a-zа-яёўқғҳ]{0,5}$", "i");

/**
 * Фирма номини гуруҳга ЭЪЛОН учун тайёрлайди: бош ҳарфи катта ва
 * ҳуқуқий шакли (MCHJ …) ҲАР ДОИМ ёзилган бўлади.
 *
 * Сотувчи «convitech» деб ёзса ҳам, «VERO MCHJga» деб ёзса ҳам, гуруҳда
 * бир хил кўринади:
 *      convitech        -> Convitech MCHJ
 *      convitech mchj   -> Convitech MCHJ
 *      VERO MCHJga      -> VERO MCHJ        (келишик қўшимчаси кесилади)
 *      alfa ooo         -> Alfa OOO         (бошқа шакл ёзилган бўлса — ўша)
 *      мчж кирилча      -> … МЧЖ            (қайси ёзувда ёзса — шунда)
 *
 * Шакл ёзилмаган бўлса «MCHJ» қўшилади — омбор фирмаларининг деярли
 * ҳаммаси МЧЖ, бухгалтерга шу кўринишда керак.
 */
export function firmaToliq(matn) {
  const sozlar = String(matn || "").replace(/\s+/g, " ").trim().split(" ")
    .filter(Boolean);
  let shakl = null, oldinda = false;
  const qolgan = [];
  for (const soz of sozlar) {
    const toza = soz.replace(/[^\p{L}\p{N}]/gu, "");
    const m = toza.match(SHAKL_RE);
    // Шакл сўзи («MCHJ», «OOO» …) — сотувчи ёзган ЖОЙИДА қолади.
    // Аввал ҳар доим охирига кўчирилар эди: «ooo izobubble» → «Izobubble
    // OOO» бўлиб, сотувчи «мен бундай ёзмаган эдим» деб чалғирди
    // (Достон 2026-09-12).
    if (m && !shakl) {
      shakl = SHAKL_KORINISH[m[1].toLowerCase()];
      oldinda = qolgan.length === 0;
      continue;
    }
    qolgan.push(soz);
  }
  const nom = firmaChiroyli(qolgan.join(" "));
  if (!nom) return shakl || "";
  if (shakl) return oldinda ? `${shakl} ${nom}` : `${nom} ${shakl}`;
  return `${nom} MCHJ`;
}

export function firmaKorinishi(matn) {
  return firmaSozlari(matn).slice(0, 3).join(" ").toUpperCase();
}

/** Чекдаги суммага мос, ҳали ёпилмаган сўровни топади (топилмаса null) */
/* ============ ФИРМАНИ СОЛИШТИРИШ ============
   Сотувчи: «11 mln VERO-SMART МЧЖ га»
   Бухгалтер эса адашиб БОШҚА фирмага ўтказиши мумкин. Сумма тўғри бўлса,
   бот аввал буни сезмасди — қарз камайиб кетарди, пул эса бошқа жойда.
   Шунинг учун чекдаги қабул қилувчи сўровдаги фирма билан таққосланади.

   Кирилл ва лотин аралаш ёзилади («ВЕРО-СМАРТ» / «VERO-SMART»), шунинг
   учун иккови ҳам битта кўринишга келтирилади.                        */

const KIRIL_LOTIN = {
  а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"j", з:"z", и:"i",
  й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t",
  у:"u", ф:"f", х:"x", ц:"ts", ч:"ch", ш:"sh", щ:"sh", ъ:"", ы:"i", ь:"",
  э:"e", ю:"yu", я:"ya", ў:"o", қ:"q", ғ:"g", ҳ:"h",
};

/** «ВЕРО-СМАРТ МЧЖ» → «vero smart mchj»
 *
 *  ХЕШТЕГЛАР ОЛИБ ТАШЛАНАДИ. «#ombor» — тўлов белгиси, фирма номи эмас;
 *  у қолса ҳамма сўровда бир хил сўз бўлиб, ТУРЛИ фирмалар ҳам «мос»
 *  бўлиб кўринарди (VERO-SMART ва ALFA BETON иккови ҳам «ombor»). */
function firmaNorm(s) {
  return String(s ?? "").toLowerCase()
    .replace(/#\s*[\wа-яёўқғҳ]+/gi, " ")
    .replace(/[а-яёўқғҳ]/g, (c) => (c in KIRIL_LOTIN ? KIRIL_LOTIN[c] : c))
    // Ўзбек тилида алмашиб ёзиладиган ҳарфлар — БИТТА кўринишга келтирамиз,
    // шунда катта-кичик ҳарф, кирилл-лотин ва ҳ/х, қ/к фарқи аҳамиятсиз:
    //   ҳ/х → h    қ/к/c → k    ц → s
    // Сўнг «h» БУТУНЛАЙ ташланади: «CONVITECH» ↔ «КОНВИТЕХ»,
    // «GHAYRAT» ↔ «ҒАЙРАТ» каби жуфтлар акс ҳолда мос келмасди
    // (лотинда «ch/gh» — кириллда битта ҳарф).
    // «ch» — лотинда ҳам ч, ҳам х бўлиши мумкин («Techno» = «ТЕХНО»),
    // шунинг учун уни аввал битта белгига келтирамиз.
    .replace(/ch/g, "h").replace(/x/g, "h").replace(/[qc]/g, "k")
    .replace(/ts/g, "s").replace(/h/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Ҳуқуқий шакл, ўлчов ва «пул ўтказ» феъллари — фирмани ажратмайди
const FIRMA_STOP = new Set([
  "mchj", "ooo", "oao", "aoot", "jshj", "yatt", "llc", "ltd", "inc", "jsc",
  "mln", "mlrd", "ming", "som", "sum", "uzs", "sumga", "somga",
  "uchun", "pul", "pulni", "tolov", "tolovi", "tolansin", "otkazilsin",
  "otkazing", "otkazib", "yuboring", "hisob", "schet", "bank", "banking",
  "filial", "ofis", "bosh", "savdo", "kompaniya", "firma", "iltimos",
]);

/** Матндан фирмани англатувчи МАЪНОЛИ сўзлар (3+ ҳарф, стоп-сўзсиз).
 *  3 ҳарф ҳам олинади — «НУР», «АСЛ» каби қисқа номлар бор; уларсиз чек
 *  томонида ҳеч нарса қолмай, хато ўтказма сезилмай кетарди.            */
function firmaSozlari(s) {
  return firmaNorm(s).split(" ")
    .filter((w) => w.length >= 3 && !FIRMA_STOP.has(w) && !/^\d+$/.test(w));
}

/**
 * Чекдаги қабул қилувчи сўровда айтилган фирмага мосми?
 * @returns {"mos"|"mos_emas"|"bilib_bolmadi"}
 */
/** Икки сўз орасидаги ҳарф фарқи (Левенштейн), `chegara` дан ошса тўхтайди */
function harfFarqi(a, b, chegara) {
  if (Math.abs(a.length - b.length) > chegara) return chegara + 1;
  let oldingi = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const joriy = [i];
    let engKichik = i;
    for (let j = 1; j <= b.length; j++) {
      const narx = a[i - 1] === b[j - 1] ? 0 : 1;
      joriy[j] = Math.min(oldingi[j] + 1, joriy[j - 1] + 1, oldingi[j - 1] + narx);
      if (joriy[j] < engKichik) engKichik = joriy[j];
    }
    if (engKichik > chegara) return chegara + 1;   // барибир ошиб кетди
    oldingi = joriy;
  }
  return oldingi[b.length];
}

/** Икки сўз АМАЛДА бир хилми? AI чекдаги «IZOBUBBLE» ни «IZOBBLE» деб
 *  ўқиши мумкин (Достон 2026-09-12) — узун сўзларда 1-2 ҳарф фарқи
 *  кечирилади. Қисқа сўзларда эса АЙНАН тенглик талаб қилинади:
 *  «ALFA» ва «ALSA» бошқа-бошқа фирма бўлиши мумкин.                  */
function sozYaqin(a, b) {
  if (a === b) return true;
  const uz = Math.max(a.length, b.length);
  if (uz < 5) return false;
  const ruxsat = uz >= 8 ? 2 : 1;
  return harfFarqi(a, b, ruxsat) <= ruxsat;
}

export function firmaMos(sorovMatn, chekKim) {
  const a = firmaSozlari(sorovMatn);      // сотувчи айтган
  const b = firmaSozlari(chekKim);        // чекда ёзилган
  if (!a.length || !b.length) return "bilib_bolmadi";
  // Биттаси иккинчисининг ичида бўлса ҳам мос: «vero» ↔ «verosmart».
  // Аммо 3 ҳарфлилар учун фақат АЙНАН тенглик — «нур» ҳар қандай узун
  // сўзнинг ичидан топилиб, хато ўтказмани «мос» деб кўрсатиб қўярди.
  const mos = a.some((x) => b.some((y) =>
    x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)))
    || sozYaqin(x, y)));
  return mos ? "mos" : "mos_emas";
}

/* ЭСЛАТМА: аввал бу ерда sorovTop() бор эди — чекдаги СУММАга қараб
   ҳамма сотувчилардан сўров қидирарди. Олиб ташланди: гуруҳ жонли,
   бухгалтер reply қилгунча орада бошқалар ёзади ва бошқа чеклар тушади.
   Суммага қараб тахмин қилиш тўловни БЕГОНАНИНГ қарзидан айириб юбориши
   мумкин эди. Энди боғланиш фақат reply (ёки изоҳда очиқ айтилиши)
   орқали — қуйидаги sorovByMsg() ва sorovTopSotuvchi() шунга хизмат
   қилади, иккови ҳам АНИҚ сотувчи доирасида ишлайди.                   */

/** Бот гуруҳга эълон қилган «Пул чиқариш» сўровига reply қилиндими? */
async function sorovByGuruhMsg(env, msgId) {
  const now = Date.now();
  return (await kvGet(env, SOROV_KEY, [])).find((x) =>
    x.guruhMsg && Number(x.guruhMsg) === Number(msgId) &&
    !x.band && now - x.vaqt < SOROV_OCHIQ_UMR) || null;
}

/** Бухгалтер reply қилган хабар — ўша сотувчининг сўрови ёзилган хабарми? */
async function sorovByMsg(env, sid, msgId) {
  const now = Date.now();
  return (await kvGet(env, SOROV_KEY, [])).find((x) =>
    Number(x.sid) === Number(sid) && Number(x.msg) === Number(msgId) &&
    !x.band && now - x.vaqt < SOROV_OCHIQ_UMR) || null;
}

/** АНИҚ сотувчининг суммага мос, очиқ сўровини топади.
 *
 *  sorovTop() сумма бўйича ҳамма сотувчилардан қидиради ва иккита турли
 *  сотувчида бир хил сумма бўлса — тахмин қилмай null қайтаради. Аммо
 *  бухгалтер reply қилган бўлса, сотувчи АЛЛАҚАЧОН маълум: ўшанинг
 *  сўровини аниқ топиш керак, акс ҳолда сўров ёпилмай очиқ қоларди. */
async function sorovTopSotuvchi(env, sid, summa) {
  const now = Date.now();
  const ro = (await kvGet(env, SOROV_KEY, []))
    .filter((x) => x.sid === sid && !x.band && !x.kutilmoqda &&
                   now - x.vaqt < SOROV_OCHIQ_UMR);
  const aniq = ro.filter((x) => x.summa === summa);
  const nomzod = aniq.length ? aniq
    : ro.filter((x) => Math.abs(x.summa - summa) <= summa * 0.01);
  return nomzod.length ? nomzod[nomzod.length - 1] : null;
}

/** Сотувчининг ОЧИҚ сўровлари — янгиси биринчи.
 *  Чек ҳеч бир сўровга уланмаса, шулар тугма бўлиб кўрсатилади. */
async function sorovlarOchiq(env, sid) {
  const now = Date.now();
  return (await kvGet(env, SOROV_KEY, []))
    .filter((x) => Number(x.sid) === Number(sid) && !x.band && !x.kutilmoqda &&
                   x.tur !== "kard" && now - x.vaqt < SOROV_OCHIQ_UMR)
    .sort((a, b) => b.vaqt - a.vaqt);
}

/** Икки сумма АЙНАН тенгми (сўмгача)?
 *  Достон 2026-09-15: «1 сўм ҳам хато ҳисобламасин». Аввал 1% кечириларди —
 *  ҳақиқий GLM синовида хира чекдаги 21 650 000 «21 550 000» деб ўқилди,
 *  фарқ 0.46% бўлгани учун текширувсиз ёзилиб, қарз 100 000 кўп қоларди.
 *  Тийин summaParse'да ташланади, шунинг учун сўмгача солиштириш етарли. */
function summaMos(a, b) {
  return a > 0 && b > 0 && Math.round(a) === Math.round(b);
}

/** AI чекда суммани икки жойдан ўқийди: РАҚАМДА ва СЎЗДА. Иккаласидан
 *  бири сўровдаги суммага АЙНАН тенг бўлса — ўшаниси. Ҳақиқий синовда
 *  (2026-09-15) рақам тўғри, сўз бузуқ ўқилган ҳол бўлди (7 868 000 /
 *  875 000) ва аксинча ҳам бўлиши мумкин. Ҳеч бири тенг бўлмаса — 0. */
function aiMosSumma(ai, kerak) {
  if (!ai || !(kerak > 0)) return 0;
  return [ai.summa, ai.raqamda, ai.sozda].some((v) => summaMos(son(v), kerak)) ? kerak : 0;
}

/** Сўровдан ҚОЛГАН сумма (қисман тўлов ҳисобга олинади) */
function sorovQoldiq(x) {
  return Math.max(0, son(x.summa) - son(x.tolangan || 0));
}

/** Платёжкадаги «12.09.2026» бугундан неча кун олдин?
 *  Мусбат — эски, манфий — келажак санаси, ўқиб бўлмаса null.
 *  Эски платёжка қайта ташланса (расм бошқа файл бўлгани учун такрорлик
 *  текшируви ушламайди) пул икки марта айириладиган эди.               */
function sanaFarqi(xom) {
  const m = String(xom || "").match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  let yil = Number(m[3]);
  if (yil < 100) yil += 2000;
  if (yil < 2020 || yil > 2100) return null;
  const h = new Date(Date.now() + 5 * 3600e3);              // Тошкент куни
  const bugun = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate());
  // Кун ва ой алмашиб ўқилиши мумкин (09/12/2026). Иккала ўқилишни ҳам
  // кўриб, БУГУНГА ЯҚИНроғини оламиз — акс ҳолда тўғри платёжка «эски»
  // деб ёлғон огоҳлантириш чиқарарди.
  // Келажакдаги ўқилиш ютмайди (Руслан 2026-10-10): 90 кунлик чек 12.07 ни 07.12 деб олиб («58 кундан
  // кейин» яқинроқ) «Чек санаси келажакда» дерди — тўғриси «Чек эски». Платёжка келажакдан келмайди.
  const otgan = (f) => f >= -2;
  let farq = null;
  for (const [kun, oy] of [[a, b], [b, a]]) {
    if (!kun || kun > 31 || !oy || oy > 12) continue;
    const f = Math.round((bugun - Date.UTC(yil, oy - 1, kun)) / 86400000);
    if (farq === null || (otgan(f) && !otgan(farq)) || (otgan(f) === otgan(farq) && Math.abs(f) < Math.abs(farq))) farq = f;
  }
  return farq;
}

/** Тасдиқ КУТАЁТГАН (такрорий) сўровни суммага қараб топади.
 *
 *  «Қарзимдан минус» (tur === "kard") сўровлари ҲИСОБГА ОЛИНМАЙДИ: улар
 *  чек билан эмас, Хуршидаканинг тасдиғи билан ёпилади. Акс ҳолда
 *  тасдиқ кутиб турган кард-сўров, ўша суммали ҲАҚИҚИЙ пул тўловини
 *  «тасдиқ кутмоқда» деб тўсиб қўйиши мумкин эди.                     */
async function sorovKutayotgan(env, summa, sid) {
  const now = Date.now();
  return (await kvGet(env, SOROV_KEY, [])).find((x) =>
    x.tur !== "kard" &&
    x.kutilmoqda && !x.band && now - x.vaqt < SOROV_OCHIQ_UMR &&
    (sid == null || Number(x.sid) === Number(sid)) &&
    Math.abs(x.summa - summa) <= summa * 0.01) || null;
}

// tolovId — сўровни ёпган тўлов. Тўлов «↩️ Бекор қилиш» билан бекор
// қилинса, шу орқали сўров ҚАЙТА ОЧИЛАДИ (тўғри чекни эълонга ташлаш мумкин).
async function sorovYop(env, id, tolovId) {
  await kvRoyxatYoz(env, SOROV_KEY,
    (joriy) => joriy.map((x) => (x.id === id
      ? { ...x, band: true, ...(tolovId ? { tolov: tolovId } : {}) } : x)),
    (joriy) => { const it = joriy.find((x) => x.id === id); return !it || it.band === true; });
}

/** Тўловни сўровга қўшади. Тўлиқ (сўмгача) тўланса — сўров ёпилади;
 *  қисман бўлса — очиқ қолади ва гуруҳдаги эълонга «қолди: …» ёзилади.
 *  Бир тўлов икки марта қўшилмайди (tolovlar рўйхати). */
export async function sorovTolov(ctx, id, tolovId, summa) {
  const { env } = ctx;
  const tuzat = (x) => {
    const ids = x.tolovlar || (x.tolov ? [x.tolov] : []);
    if (ids.includes(tolovId)) return x;
    const tolangan = son(x.tolangan || 0) + son(summa);
    // 1 сўм кам тўланса ҳам сўров очиқ қолади («қолди: 1»)
    const tolik = Math.round(son(x.summa)) - Math.round(tolangan) <= 0;
    return { ...x, tolangan, tolovlar: ids.concat([tolovId]), tolov: tolovId, band: tolik || x.band, chek: null };
  };
  await kvRoyxatYoz(env, SOROV_KEY,
    (joriy) => joriy.map((x) => (x.id === id ? tuzat(x) : x)),
    (joriy) => { const it = joriy.find((x) => x.id === id); return !it || (it.tolovlar || []).includes(tolovId); });
  const it = (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === id);
  if (it && !it.band && it.guruhMsg) {
    const guruh = String(env.OMBOR_GURUH || "").split(/[,;\s]+/).filter(Boolean)[0];
    const qoldi = Math.max(0, son(it.summa) - son(it.tolangan));
    if (guruh && qoldi > 0) {
      const r = await yubor(ctx, guruh,
        `⏳ <b>${esc(ISM[it.sid] || it.sid)} сўровидан қолди: ${pul(qoldi)} сўм</b>`,
        { reply_to_message_id: it.guruhMsg }).catch(() => null);
      if (r && r.result) await gmBogla(env, r.result.message_id, it.id);
    }
  }
}

/* Гуруҳдаги БОТ хабари → сўров. Эслатма, огоҳлантириш, «қолди» хабарларига
   жавоб қилиб ташланган чек ҳам ўша сўровга уланади (одамлар шундай қилади). */
const GM_KEY = (msgId) => `omb:gm:${msgId}`;

/** Сўровдаги чек ҳолати — Mini App сотувчига кўрсатади (Достон 2026-09-21: «rad etildi yoki
 *  tasdiqlanmadi mini appda korinsin»). tekshir — AI текширувидан ўтмади, бухгалтер кўрмоқда;
 *  rad — бухгалтер «❌ Бу чек ёзилмасин» босди; bekor — ёзилган тўлов ↩️ бекор қилинди.
 *  Тўлов ёзилганда (sorovTolov) белги тозаланади. */
export async function sorovChekHolat(env, id, holat) {
  try {
    await kvRoyxatYoz(env, SOROV_KEY,
      (joriy) => joriy.map((x) => (x.id === id && !x.band ? { ...x, chek: { holat, vaqt: Date.now() } } : x)),
      (joriy) => { const x = joriy.find((y) => y.id === id); return !x || x.band || (x.chek && x.chek.holat === holat); });
  } catch (e) { console.warn("sorovChekHolat:", e && e.message); }
}
export async function gmBogla(env, msgId, sorovId) {
  if (!env.ACCESS_KV || !msgId || !sorovId) return;
  try {
    await env.ACCESS_KV.put(GM_KEY(msgId), JSON.stringify(sorovId), { expirationTtl: 10 * 86400 });
  } catch (e) { console.warn("gmBogla:", e && e.message); }
}

/* ======================== 1. ФАЙЛНИ ЮКЛАШ ======================== */

/** Админ ботга .xlsx/.csv ташлаганда чақирилади. true = хабар «ейилди» */
export async function omborFayl(ctx, message, access) {
  const { env, tg, token } = ctx;
  const uid = message.from && message.from.id;
  const doc = message.document;
  if (!doc) return false;
  const nom = (doc.file_name || "").toLowerCase();
  // Склад файли ФАҚАТ шахсий чатда юкланади. Аввал админ гуруҳга ҳисобот
  // xlsx'ини ташласа (муҳокама учун), бот уни юкламоқчи бўлиб гуруҳга хато
  // ва админ менюсини чиқарарди (ҳақиқий синовда кўринди).
  if (!message.chat || message.chat.type !== "private") return false;
  // Эски .xls формати ўқилмайди — админга айтамиз (аввал бот жим турарди)
  if (/\.xls$/.test(nom) && isOmborAdmin(uid, access) && message.chat.type === "private") {
    await tg(token, "sendMessage", { chat_id: message.chat.id,
      text: "❌ .xls формати ўқилмайди. Файлни .xlsx қилиб сақлаб, қайта юборинг." });
    return true;
  }
  if (!/\.(xlsx|csv|txt)$/.test(nom)) return false;
  if (!isOmborAdmin(uid, access)) return false;          // фақат бошқарувчи

  const chatId = message.chat.id;
  const kutish = await tg(token, "sendMessage", { chat_id: chatId, text: T.yuklanmoqda });
  try {
    const buf = await tgFayl(token, doc.file_id);
    const sheets = await readTable(doc.file_name, buf);
    const d = parseSklad(sheets[0].rows);
    if (!d.bloklar.length) throw new Error("сотувчи блоклари топилмади");
    d.fayl = String(doc.file_name || "").slice(0, 120);   // юклама рўйхатида кўринади
    await skladSaqla(ctx, chatId, uid, d, "✅ Файл юкланди");
  } catch (err) {
    console.error("omborFayl:", err);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: `❌ Файлни ўқиб бўлмади.\n\n${String(err.message || err).slice(0, 300)}`,
      reply_markup: ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid),
    });
  } finally {
    if (kutish && kutish.result) {
      await tg(token, "deleteMessage", { chat_id: chatId, message_id: kutish.result.message_id });
    }
  }
  return true;
}

/* ==================== НУСХАЛАНГАН ЖАДВАЛ (матн) ====================
   Достон 2026-09-14: админ Склад Excel'идан катакларни нусхалаб, ботга
   МАТН қилиб ташлаши мумкин. Бот уни Excel файл юклангандек сақлайди.

   Telegram узун нусхани бир нечта хабарга бўлади. Бўлаклар KV'да йиғилади
   (message_id бўйича — тартибсиз келса ҳам) ва ҲАР БИР бўлакдан кейин
   жадвал қайта ўқилиб текширилади. Тўлиқ ва бузилмаган бўлса (давр сатри,
   «Жами», ҳар бир блокнинг йиғиндиси мос) — ўзи сақланади. Тўлиқ бўлмаса
   битта ҳолат хабари янгиланиб туради.
   Нусха ҲЕЧ ҚАЧОН чала ёки силжиган ҳолда ёзилмайди.                    */
const NUSXA_KEY = (uid) => `omb:nusxa:${uid}`;
const NUSXA_HOLAT_KEY = (uid) => `omb:nusxa:h:${uid}`;
const NUSXA_UMR_MS = 30 * 60 * 1000;           // чала қолган нусха 30 дақиқада эскиради

export async function omborNusxa(ctx, message, access) {
  const { env, tg, token } = ctx;
  const uid = message.from && message.from.id;
  const matn = message.text;
  if (!matn || !message.chat || message.chat.type !== "private") return false;
  if (!isOmborAdmin(uid, access) || !env.ACCESS_KV) return false;

  const hozir = Date.now();
  const eski = (await kvGet(env, NUSXA_KEY(uid), [])).filter((q) => hozir - q.vaqt < NUSXA_UMR_MS);
  const tabBor = matn.includes("\t");
  // Жадвалга ўхшамаса ва йиғилаётган нусха ҳам бўлмаса — бу бошқа хабар
  if (!jadvalgaOxshaydi(matn) && !(eski.length && tabBor)) return false;

  const chatId = message.chat.id;
  const menyu = ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid);

  // TAB йўқолган нусха — бўш катаклар йўқолиб, рақамлар бошқа устунга
  // силжийди. Ўқимаймиз, сабабини айтамиз.
  if (!tabBor) {
    await tg(token, "sendMessage", { chat_id: chatId, reply_markup: menyu,
      text: "⚠️ Жадвал ўқилмади — нусхада устунлар ажралмаган.\n\n" +
            "Excel'да катакларни белгилаб Ctrl+C билан нусхаланг ва шу ерга ташланг, " +
            "ёки Excel файлнинг ўзини юборинг." });
    return true;
  }

  // Янги жадвалнинг БОШИ келса — эски чала нусха ташланади
  const qism = { id: Number(message.message_id), matn, vaqt: hozir };
  const saqlandi = await kvRoyxatYoz(env, NUSXA_KEY(uid),
    (ro) => {
      const toza = (Array.isArray(ro) ? ro : []).filter((q) => hozir - q.vaqt < NUSXA_UMR_MS);
      const asos = jadvalBoshi(matn) ? toza.filter((q) => q.id > qism.id) : toza;
      return asos.some((q) => q.id === qism.id) ? asos : asos.concat(qism);
    },
    (ro) => Array.isArray(ro) && ro.some((q) => q.id === qism.id));
  if (!saqlandi) {
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "❌ Жадвал сақланмади — бир оздан сўнг қайта ташланг." });
    return true;
  }

  const qismlar = await kvGet(env, NUSXA_KEY(uid), []);
  const d = parseSklad(nusxaQatorlar(qismlarniBirlashtir(qismlar)));
  const t = nusxaTekshir(d);

  if (t.tayyor) {
    await env.ACCESS_KV.delete(NUSXA_KEY(uid));
    const holatId = await kvGet(env, NUSXA_HOLAT_KEY(uid), null);
    if (holatId) {
      await env.ACCESS_KV.delete(NUSXA_HOLAT_KEY(uid));
      await tg(token, "deleteMessage", { chat_id: chatId, message_id: holatId }).catch(() => {});
    }
    try {
      d.fayl = "нусхаланган жадвал";
      await skladSaqla(ctx, chatId, uid, d, "✅ Жадвал юкланди");
    } catch (err) {
      console.error("omborNusxa:", err);
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: menyu,
        text: `❌ Жадвални сақлаб бўлмади.\n\n${String(err.message || err).slice(0, 300)}` });
    }
    return true;
  }

  // Ҳали тўлиқ эмас — БИТТА ҳолат хабари янгиланади (ҳар бўлакка янги хабар эмас)
  const qatorlar = qismlar.reduce((a, q) => a + String(q.matn).split("\n").length, 0);
  const holat = [
    "📋 <b>Жадвал қабул қилинмоқда…</b>",
    `Хабарлар: ${qismlar.length} та · қаторлар: ${qatorlar} та`,
    "",
    t.jamiKeldi
      ? `⚠️ <i>${esc(t.sabab)}.</i>\nҚолган қисми бўлса ташланг. Бўлмаса Excel файлнинг ўзини юборинг.`
      : "<i>Давоми бўлса ташлайверинг — жадвал тўлиқ келгач ўзи юкланади.</i>",
  ].join("\n");
  const kb = { inline_keyboard: [[{ text: "❌ Бекор қилиш", callback_data: "omb|nx0" }]] };
  const holatId = await kvGet(env, NUSXA_HOLAT_KEY(uid), null);
  let yangilandi = false;
  if (holatId) {
    const r = await tg(token, "editMessageText", { chat_id: chatId, message_id: holatId,
      text: holat, parse_mode: "HTML", reply_markup: kb }).catch(() => null);
    yangilandi = Boolean(r && r.ok);
  }
  if (!yangilandi) {
    const r = await tg(token, "sendMessage", { chat_id: chatId, text: holat,
      parse_mode: "HTML", reply_markup: kb });
    if (r && r.result) {
      await env.ACCESS_KV.put(NUSXA_HOLAT_KEY(uid), JSON.stringify(r.result.message_id),
                              { expirationTtl: Math.round(NUSXA_UMR_MS / 1000) });
    }
  }
  return true;
}

/**
 * Ўқилган Склад жадвалини сақлайди — Excel ФАЙЛИ ҳам, НУСХАЛАНГАН МАТН ҳам
 * шу ердан ўтади, шунинг учун иккаласининг қоидалари БИР ХИЛ: санасиз
 * жадвал ёзилмайди, устма-уст давр текширилади, ҳар сотувчи ўз калитига.
 * Хато бўлса Error ташлайди — чақирувчи ўзи хабар беради.
 */
async function skladSaqla(ctx, chatId, uid, d, sarlavha) {
  const { env, tg, token } = ctx;
  {
    const t = tekshir(d);
    const dk = davrKey(d);
    const menyu = ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid);

    // Санасиз файл ЁЗИЛМАЙДИ: аввал «nomalum» калитига тушиб, бот қарзга
    // қўшарди, ойлик Excel эса ҳеч қайси ойга киритмасди (икки хил қарз).
    if (dk === "nomalum") {
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: menyu,
        text: "❌ Файлда давр санаси топилмади.\n\nСклад файлининг юқорисида «01.09.2026-10.09.2026 давр оралиғи учун» қатори бўлиши керак." });
      return true;
    }

    // --- УСТМА-УСТ ТУШАДИГАН ДАВРЛАР. Аввал фақат АЙНАН бир хил сана
    //     алмаштириларди: 01.09–05.09 дан кейин 01.09–10.09 юкланса, биринчи
    //     беш куннинг товари ИККИ МАРТА қарзга қўшиларди.
    //       • эски давр янгисининг ИЧИДА бўлса — янгиси унинг ўрнига ёзилади;
    //       • қисман устма-уст (ёки янгиси эскисининг ичида) — ЮКЛАНМАЙДИ.
    const ymd = (s) => (s ? String(s).split(".").reverse().join("") : "");
    const yB = ymd(d.davrBoshi), yO = ymd(d.davrOxiri);
    const oldingi = await kvGet(env, davrlarKey(), []);
    const ustma = oldingi.filter((x) => x.key !== dk && x.davrBoshi && x.davrOxiri &&
      !(ymd(x.davrOxiri) < yB || ymd(x.davrBoshi) > yO));
    const almashadi = ustma.filter((x) => ymd(x.davrBoshi) >= yB && ymd(x.davrOxiri) <= yO);
    if (almashadi.length !== ustma.length) {
      const bir = ustma.find((x) => !almashadi.includes(x));
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: menyu,
        text: `⚠️ Файл ЮКЛАНМАДИ\n\n🗓 ${d.davrBoshi}–${d.davrOxiri} олдин юкланган ` +
              `${bir.davrBoshi}–${bir.davrOxiri} файли билан устма-уст тушади — товар икки марта ҳисобланарди.\n\n` +
              "Бутун даврни ўз ичига олган битта файл юкланг." });
      return true;
    }

    // --- блокларни KV'га ёзиш (ҳар сотувчи алоҳида калит)
    //
    // ДИҚҚАТ: битта файлда битта сотувчига 2 блок бўлиши мумкин (мас.
    // «Сардор» + «Сардор/Абдувохид») — уларни ҚЎШАМИЗ. Аммо АЙНАН ШУ
    // юклашда ёзилганини эслаб турамиз: акс ҳолда бир хил давр иккинчи
    // марта юкланганда эски маълумот устига қўшилиб, сумма икки баравар
    // бўлиб кетарди.
    // Қўшиладиган биринчи блок ХОТИРАДАН олинади — KV'дан қайта ўқилмайди:
    // KV ҳар доим ҳам янги ёзувни дарҳол қайтармайди, эски юклашнинг блоки
    // келиб қолса товар ИККИ БАРАВАР бўларди.
    const yozildi = new Map();
    const egasiz = [];
    for (const b of d.bloklar) {
      if (b.tgId === null) { egasiz.push(b); continue; }
      const bor = yozildi.get(b.tgId) || null;
      const yangi = bor
        ? { ...bor, soni: bor.soni + b.soni, summa: bor.summa + b.summa,
            mahsulotlar: bor.mahsulotlar.concat(b.mahsulotlar) }
        : { davrKey: dk, nom: b.nom, soni: b.soni, summa: b.summa,
            mahsulotlar: b.mahsulotlar };
      yozildi.set(b.tgId, yangi);
    }
    // Ҳар бир сотувчининг блоки БИР МАРТА ёзилади. Аввал «Сардор» ва
    // «Сардор/Абдувохид» кетма-кет бир калитга ёзиларди — Cloudflare бир
    // калитга секундига биттадан ортиқ ёзувни рад этади (429).
    for (const [tgId, blok] of yozildi) await kvPut(env, blokKey(dk, tgId), blok);
    await kvPut(env, blokKey(dk, "egasiz"), egasiz);

    // --- даврлар рўйхати (бир хил давр қайта юкланса — алмаштирилади)
    const davrlar = await kvGet(env, davrlarKey(), []);
    const idx = davrlar.findIndex((x) => x.key === dk);

    // Эски юклашда бор бўлиб, янгисида ЙЎҚ сотувчиларнинг қолдиқларини ўчирамиз
    if (idx !== -1 && env.ACCESS_KV) {
      for (const eski of davrlar[idx].sotuvchilar || []) {
        if (!yozildi.has(eski)) await env.ACCESS_KV.delete(blokKey(dk, eski));
      }
    }
    // КУРС ШУ ЕРДА МУҲРЛАНАДИ. Файл юкланган пайтдаги курс ёзувда
    // қолади — кейин админ курсни ўзгартирса, БУ давр товарининг
    // доллардаги қиймати ЎЗГАРМАЙДИ. Янги курс фақат кейинги
    // ёзувларга тегишли бўлади.
    const kursHozir = await kursOl(env);
    const yozuv = {
      key: dk, davr: d.davr, davrBoshi: d.davrBoshi, davrOxiri: d.davrOxiri,
      yaratilgan: d.yaratilgan, yuklandi: new Date().toISOString(),
      fayl: d.fayl || "",                                  // қайси файлдан келгани
      jami: d.jami, kim: uid,
      sotuvchilar: [...new Set(d.bloklar.filter((b) => b.tgId).map((b) => Number(b.tgId)))],
      kurs: kursHozir ? son(kursHozir.qiymat) : 0,
    };
    if (idx === -1) davrlar.push(yozuv); else davrlar[idx] = yozuv;
    // Янгиси ўз ичига олган эски даврлар рўйхатдан чиқади ва блоклари ўчади
    const eskiKalit = new Set(almashadi.map((x) => x.key));
    const qolgan = davrlar.filter((x) => !eskiKalit.has(x.key));
    qolgan.sort((a, b) => (b.davrBoshi || "").split(".").reverse().join("")
                          .localeCompare((a.davrBoshi || "").split(".").reverse().join("")));
    await kvPut(env, davrlarKey(), qolgan);
    if (env.ACCESS_KV) {
      for (const x of almashadi) {
        for (const id of [...(x.sotuvchilar || []), "egasiz"]) await env.ACCESS_KV.delete(blokKey(x.key, id));
      }
    }

    const satrlar = [
      sarlavha,
      "",
      `🗓 Сана: ${d.davr || "—"}${idx === -1 ? "" : "  (эски маълумот алмаштирилди)"}`,
      ...(almashadi.length ? [`♻️ Ўрнига ёзилди: ${almashadi.map((x) => `${x.davrBoshi}–${x.davrOxiri}`).join(", ")}`] : []),
      `📦 Блоклар: ${t.bloklar} та · маҳсулотлар: ${t.mahsulotlar} та`,
      `💰 Жами: ${pul(d.jami.summa)} сўм`,
      t.ok ? "🔍 Текширув: жами сумма мос ✅"
           : `🔍 ⚠️ Текширув: ${pul(t.farq)} сўм фарқ бор!`,
    ];
    // Достон 2026-09-10 да сўради: файл юкланганда «⚠️ Эгаси
    // аниқланмаган» рўйхати чиқмасин — хабар қисқа бўлсин. Маълумот
    // йўқолмайди: у «📦 Умумий ҳисобот» да ва Excel'нинг бошқарув
    // блокида ўз жойида қолди.
    await tg(token, "sendMessage", { chat_id: chatId, text: satrlar.join("\n"), reply_markup: menyu });
  }
}

export async function tgFayl(token, fileId) {
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)).json();
  if (!info.ok) throw new Error("getFile: " + JSON.stringify(info).slice(0, 200));
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
  if (!res.ok) throw new Error("файлни юклаб бўлмади: HTTP " + res.status);
  return await res.arrayBuffer();
}

/* ======================== 2. ҲИСОБОТ ======================== */

/** KV'дан ўқилган блокни ХАВФСИЗ ҳолатга келтиради.
 *
 *  Нега керак: ярим ёзилган ёки эски форматдаги ёзувда `mahsulotlar`
 *  бўлмаслиги мумкин. Ўшанда `b.mahsulotlar.length` да БУТУН ҳисобот
 *  йиқиларди — битта сотувчи учун эмас, умуман (админ ҳисоботи ҳам,
 *  Excel ҳам). `summa` бузуқ бўлса эса жами NaN бўлиб кетарди. */
function blokNorm(b, davr) {
  if (!b) return null;
  return {
    ...b,
    davr: davr !== undefined ? davr : b.davr,
    summa: son(b.summa),
    soni: son(b.soni),
    mahsulotlar: Array.isArray(b.mahsulotlar) ? b.mahsulotlar : [],
  };
}

/** Ҳисоботга кирадиган сотувчилар: файлларда товари борлар + товари йўқ,
 *  лекин бошланғич қарзи борлар. Аввал фақат биринчилари олинарди — Склад
 *  файлида блоки йўқ сотувчи (мас. Достон, 50 млн) админ файлида умуман
 *  кўринмасди ва «Соф қолдиқ» шунча кам чиқарди. */
function hisobotIdlar(davrlar, bq) {
  return [...new Set([
    ...davrlar.flatMap((d) => d.sotuvchilar || []).map(Number),
    ...Object.keys(bq || {}).filter((k) => son(bq[k]) !== 0).map(Number),
  ])];
}

export async function sotuvchiMalumot(env, tgId) {
  const davrlar = await kvGet(env, davrlarKey(), []);
  const bq = await kvGet(env, "omb:bq", {});
  const tolovlar = (await kvGet(env, payKey(tgId), []))
    .filter((p) => p && p.holat !== "bekor");
  const bloklarKV = await kvGetMany(env, davrlar.map((d) => blokKey(d.key, tgId)));
  const bloklar = [];
  for (const d of davrlar) {
    const b = blokNorm(bloklarKV.get(blokKey(d.key, tgId)), d.davr);
    if (b) bloklar.push(b);
  }
  const tovar = bloklar.reduce((s, b) => s + b.summa, 0);
  const tolangan = tolovlar.reduce((s, p) => s + son(p.summa), 0);
  const boshlangich = son(bq[tgId] || 0);
  return { bloklar, tolovlar, tovar, tolangan, boshlangich,
           qarz: boshlangich + tovar - tolangan };
}

/* ---------- матнни чиройли кўрсатиш учун ёрдамчилар ----------
   Telegram HTML: <b> қалин, <i> курсив, <pre> — моношрифт БЛОК.

   Нега <code> эмас, <pre>? <code> — «сатр ичидаги» тег, Telegram уни
   атрофдаги матн билан бир хил оқимда чизади, шунинг учун бўлимлар
   бир-бирига ёпишиб кўринарди. <pre> эса алоҳида КАРТА бўлиб чизилади
   (фони ажралиб туради) — ҳар бўлим кўзга дарҳол ташланади.          */

const W = 30;                                   // моношрифт кенглиги (мобил экран)
const AJRAT = "━━━━━━━━━━━━━━━━━━";              // бўлимлар орасидаги чизиқ

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** «Чап .......... Ўнг» — иккита устунни текислайди */
export function qator(chap, ong, w = W) {
  const c = String(chap), o = String(ong);
  const bosh = Math.max(1, w - c.length - o.length);
  return c + " ".repeat(bosh) + o;
}

export function chiziq(w = W) { return "─".repeat(w); }

/** Узун номни кесади: «Печенье Шоколадное 500гр» → «Печенье Шоколадн…» */
export function qisqa(s, n) {
  const t = String(s == null ? "" : s).trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** Моношрифт карта. Ичидаги матн эскейпланади. */
export function blok(matn) { return "<pre>" + esc(matn) + "</pre>"; }

/** ▰▰▰▰▰▱▱▱▱▱ — улушни кўз билан кўрсатади */
function bar(qism, jami, n = 10) {
  if (!(jami > 0)) return "▱".repeat(n);
  const t = Math.max(0, Math.min(n, Math.round((qism / jami) * n)));
  return "▰".repeat(t) + "▱".repeat(n - t);
}

function foizli(qism, jami, n = 10) {
  const f = jami > 0 ? Math.max(0, Math.min(100, Math.round((qism / jami) * 100))) : 0;
  return bar(qism, jami, n) + " " + f + "%";
}

/** ISO вақт → «08.09.2026» */
function sana(iso) {
  const s = String(iso || "");
  return s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4);
}

/* ---------- ҚАРЗДОР ва ҲАҚДОР ----------
   qarz = бошланғич + олинган товар − тўланган.
   Мусбат  → сотувчи ҚАРЗДОР (фирмага қарзи бор).
   Манфий  → сотувчи қарзидан КЎПРОҚ тўлаган, энди ФИРМА унга қарздор —
             яъни сотувчи ҲАҚДОР. Фарқи кейинги товардан ушлаб қолинади.
             Ҳеч қаерда «манфий қарз» деб кўрсатилмайди — тушунарсиз.
   Бу ягона манба: барча хабар ва ҳисоботлар шуни ишлатади.        */
export function holat(qarz) {
  if (qarz > 0) {
    // 🟡 САРИҚ — қарздор, 🟢 ЯШИЛ — ҳақдор (Достон 2026-09-25: «qarz bo'lsa
    // sariq rangda, haqdor bo'lsa yashil rangda summa ko'rinsin — shundan
    // bilvoladi»). Иловадаги ранглар билан бир хил.
    return { qarzdor: true, haqdor: false, belgi: "🟡",
             nom: "ҚАРЗ", summa: pul(qarz), qisqa: pul(qarz) };
  }
  if (qarz < 0) {
    return { qarzdor: false, haqdor: true, belgi: "🟢",
             nom: "ҚАРЗ", summa: pul(-qarz), qisqa: "−" + pul(-qarz) };
  }
  return { qarzdor: false, haqdor: false, belgi: "✅",
           nom: "ҚАРЗ ЙЎҚ", summa: "0", qisqa: "0" };
}

/**
 * @param {boolean} ozi  true — сотувчининг ЎЗИ кўраяпти («сизнинг қарзингиз»),
 *   false — админ бошқа сотувчиникини кўраяпти (учинчи шахсда).
 */
// ЭСЛАТМА: ҳозир бот бу матнни ЮБОРМАЙДИ — сотувчига ҳам, админга ҳам
// ҳисобот Excel файлда келади (фойдаланувчи шуни сўради: матн узун чиқиб,
// экранни тўлдирарди). Функция ўз ўрнида қолдирилди: керак бўлса қайта
// ёқиш осон, синовлар ҳам шуни текширади. Продакшн бандлга тушмайди —
// экспорт қилинмаган, esbuild уни олиб ташлайди.
function sotuvchiMatn(tgId, m, ozi = true) {
  const ism = ISM[tgId] || String(tgId);
  const L = [];

  L.push("📊 <b>ҲИСОБОТИМ</b>");
  L.push(`👤 <b>${esc(ism)}</b>  ·  ${sana(new Date().toISOString())}`);
  L.push("");

  // --- Энг муҳим рақам: алоҳида, ўз қаторида, катта
  // Достон 2026-09-25: «"СИЗ ҲАҚДОРСИЗ" деган нарса кўринмасин — қарз бўлса
  // сариқ, ҳақдор бўлса яшил рангда сумма турсин, шундан билволади».
  // Telegram матнида ранг йўқ — шунинг учун 🟡 / 🟢 белгиси.
  const H = holat(m.qarz);
  void ozi;
  if (H.haqdor || H.qarzdor) L.push(`${H.belgi} <b>${H.summa} сўм</b>`);
  else L.push(`${H.belgi} <b>ҚАРЗ ЙЎҚ</b>`);
  L.push("");

  // --- Тўлов улуши: «қанчаси ёпилган» бир қарашда кўринсин
  const olingan = m.boshlangich + m.tovar;
  if (olingan > 0) {
    const f = Math.max(0, Math.min(100, Math.round((m.tolangan / olingan) * 100)));
    L.push(`${bar(m.tolangan, olingan)}  <b>${f}%</b> тўланди`);
    L.push("");
  }

  const h = [];
  if (m.boshlangich) h.push(qator("Бошланғич қарз", pul(m.boshlangich)));
  h.push(qator("Олинган товар", pul(m.tovar)));
  h.push(qator("Тўланган", "−" + pul(m.tolangan)));
  h.push(chiziq());
  h.push(qator("ЖАМИ", `${H.belgi} ${H.summa}`));
  L.push(blok(h.join("\n")));

  if (!m.bloklar.length) {
    L.push("", "<i>Ҳали маълумот юкланмаган.</i>");
    return [L.join("\n")];
  }

  // --- Маҳсулотлар. Ҳар бири 2 қатор, ораларида БЎШ ҚАТОР: аввал ҳаммаси
  //     бир-бирига ёпишиб кетарди ва ҳисоботни ўқиб бўлмасди.
  for (const b of m.bloklar) {                  // энг охирги сана биринчи
    // Иккинчи қават ҳимоя: одатда blokNorm() дан ўтган бўлади, аммо
    // sotuvchiMatn() тўғридан-тўғри чақирилса ҳам йиқилмасин.
    const mahsulotlar = Array.isArray(b.mahsulotlar) ? b.mahsulotlar : [];
    L.push("", AJRAT);
    L.push("📦 <b>ОЛИНГАН ТОВАР</b>");
    L.push(`<i>${esc(b.davr || "—")}  ·  ${mahsulotlar.length} та маҳсулот</i>`);
    L.push("");
    const mx = mahsulotlar.slice().sort((x, y) => son(y.summa) - son(x.summa));
    const rows = [];
    // Энг катта учтаси медаль билан — қайси товар кўп пул олганини
    // рақам ўқимасдан ҳам кўриш мумкин. Ораларида бўш қатор ЙЎҚ:
    // 11 маҳсулот 33 қатор бўлиб, ҳисобот ўқилмас ҳолга келарди.
    const BELGI = ["🥇", "🥈", "🥉"];
    mx.slice(0, MAHSULOT_LIMIT).forEach((p, i) => {
      // `p.nom` бўш бўлса «null» деб ёзилиб қолмасин
      const nom = String(p.nom ?? "—") + (p.xar ? " " + p.xar : "");
      const soni = son(p.soni), summa = son(p.summa);
      const narx = soni ? Math.round(summa / soni) : 0;
      const n = i < 3 ? BELGI[i] : String(i + 1).padStart(2) + ".";
      rows.push(`${n} ${qisqa(nom, W - 4)}`);
      rows.push(qator(`    ${pul(soni)} × ${pul(narx)}`, pul(summa)));
    });
    rows.push(chiziq());
    rows.push(qator("    ЖАМИ", pul(son(b.summa))));
    L.push(blok(rows.join("\n")));
    if (mx.length > MAHSULOT_LIMIT) {
      L.push(`<i>… ва яна ${mx.length - MAHSULOT_LIMIT} та маҳсулот</i>`);
    }
  }

  // --- Тўловлар тарихи
  if (m.tolovlar.length) {
    L.push("", AJRAT);
    L.push(`🧾 <b>${ozi ? "ТЎЛОВЛАРИМ" : "ТЎЛОВЛАР"}</b>`);
    L.push("");
    const t = [];
    m.tolovlar.slice().reverse().slice(0, 15).forEach((p) => {
      t.push(qator(sana(p.vaqt), pul(son(p.summa))));
      // Банк/фирма номи — платёжкадан ўқилган. Узун бўлади, шунинг учун
      // ўз қаторида ва қисқартирилган: рақамга ёпишиб қолмасин.
      if (p.izoh) t.push("   " + qisqa(p.izoh, W - 3));
    });
    t.push(chiziq());
    t.push(qator("ЖАМИ", pul(m.tolangan)));
    L.push(blok(t.join("\n")));
  }
  if (ozi) {
    L.push("", "<i>Янги тўлов керак бўлса — 💸 «Пул чиқариш» тугмасини босинг.</i>");
  }
  return bolaklab(L.join("\n"));
}

// Узун матнни Telegram лимитига мос бўлакларга бўлади.
// ДИҚҚАТ: <pre> блоки ўнлаб қатордан иборат бўлиши мумкин — бўлак айнан
// унинг ўртасига тушса, тег очиқ қолиб HTML бузиларди. Шунинг учун
// кесилган жойда тег ёпилади ва кейинги бўлакда қайтадан очилади.
function bolaklab(text) {
  if (text.length <= MAX_MSG) return [text];
  const CHEK = MAX_MSG - 16;                // тег очиш/ёпиш учун заҳира
  const out = [];
  let buf = "";
  let ochiq = null;                         // ҳозир очиқ тег: "pre" | "code" | null
  const bosh = () => (ochiq ? `<${ochiq}>` : "");
  const yoz = () => {                       // БЎШ бўлак юборилмасин: Telegram
    if (buf && buf !== bosh()) {            // «message text is empty» деб рад қилади
      out.push(ochiq ? `${buf}</${ochiq}>` : buf);
    }
    buf = bosh();
  };

  for (const xom of text.split("\n")) {
    // Битта қатор ЎЗИ лимитдан узун бўлса — уни ҳам майдалаймиз. Акс ҳолда
    // ўша қатор бир бўлакка тўлиқ тушиб, Telegram «message is too long»
    // деб рад қиларди (ҳозирги ҳисоботларда қаторлар қисқа, бу — заҳира).
    const qismlar = xom.length <= CHEK
      ? [xom]
      : (xom.match(new RegExp(`[\\s\\S]{1,${CHEK}}`, "g")) || [""]);

    for (const line of qismlar) {
      if (buf.length + line.length + 1 > MAX_MSG) yoz();
      buf += (buf && buf !== bosh() ? "\n" : "") + line;
      for (const teg of ["pre", "code"]) {
        const ochish = (line.match(new RegExp(`<${teg}>`, "g")) || []).length;
        const yopish = (line.match(new RegExp(`</${teg}>`, "g")) || []).length;
        if (ochish > yopish) ochiq = teg;
        else if (yopish > ochish && ochiq === teg) ochiq = null;
      }
    }
  }
  yoz();
  return out;
}

/** HTML билан юборади; эски мижоз ёки тег хатоси бўлса — оддий матнга тушади */
export async function yubor(ctx, chatId, matn, extra = {}) {
  const { tg, token } = ctx;
  const r = await tg(token, "sendMessage",
    { chat_id: chatId, text: matn, parse_mode: "HTML",
      link_preview_options: { is_disabled: true }, ...extra });
  if (r && r.ok === false) {
    console.error("HTML юборилмади:", r.description);
    const oddiy = matn.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return tg(token, "sendMessage", { chat_id: chatId, text: oddiy, ...extra });
  }
  return r;
}

async function adminMatn(env) {
  const davrlar = await kvGet(env, davrlarKey(), []);
  if (!davrlar.length) return [T.bosh];
  const bq = await kvGet(env, "omb:bq", {});
  const idlar = hisobotIdlar(davrlar, bq);

  const satrlar = [];
  let jamiTovar = 0, jamiTolov = 0, jamiQarz = 0;
  for (const id of idlar) {
    const m = await sotuvchiMalumot(env, id);
    jamiTovar += m.tovar; jamiTolov += m.tolangan; jamiQarz += m.qarz;
    satrlar.push({ id, ism: ISM[id] || String(id), ...m });
  }
  satrlar.sort((a, b) => b.qarz - a.qarz);

  const L = [];
  // Қарздорлар ва аванси борлар — АЛОҲИДА йиғилади. Аввал иккови бир-бирини
  // сўндириб, «жами қарз» аслидан кам кўринарди.
  const qarzdor = satrlar.filter((s) => s.qarz > 0).sort((a, b) => b.qarz - a.qarz);
  const haqdor = satrlar.filter((s) => s.qarz < 0).sort((a, b) => a.qarz - b.qarz);
  const tenglar = satrlar.filter((s) => s.qarz === 0);
  const jamiQarzdorlik = qarzdor.reduce((s, x) => s + x.qarz, 0);
  const jamiHaqdorlik = haqdor.reduce((s, x) => s - x.qarz, 0);

  L.push("📦 <b>ОМБОР — УМУМИЙ ҲИСОБОТ</b>");
  L.push("");
  L.push("🟡 <b>ЖАМИ ҚАРЗ</b>");
  L.push(`<b>      ${pul(jamiQarzdorlik)} сўм</b>`);
  if (jamiHaqdorlik) {
    L.push(`🟢 <b>ЖАМИ (−):</b>  ${pul(jamiHaqdorlik)} сўм`);
  }
  L.push("");
  L.push(`Тўланди:  ${foizli(jamiTolov, jamiTovar)}`);
  L.push("");
  const u = [
    qator("Олинган товар", pul(jamiTovar)),
    qator("Тўланган", "−" + pul(jamiTolov)),
    chiziq(),
    qator("Жами қарз", pul(jamiQarzdorlik)),
  ];
  if (jamiHaqdorlik) {
    u.push(qator("Ортиқча тўланган", "−" + pul(jamiHaqdorlik)));
    u.push(chiziq());
    u.push(qator("СОФ ҚОЛДИҚ", pul(jamiQarz)));
  }
  L.push(blok(u.join("\n")));

  if (qarzdor.length) {
    L.push("", AJRAT);
    L.push("🟡 <b>ҚАРЗИ БОРЛАР</b>");
    L.push("");
    const eng = qarzdor[0].qarz || 1;
    const rows = [];
    qarzdor.forEach((s, i) => {
      if (i) rows.push("");
      rows.push(qator(`${String(i + 1).padStart(2)}. ${qisqa(s.ism, 13)}`, pul(s.qarz)));
      rows.push("    " + bar(s.qarz, eng));
    });
    rows.push("", chiziq());
    rows.push(qator("    ЖАМИ", pul(jamiQarzdorlik)));
    L.push(blok(rows.join("\n")));
  }

  if (haqdor.length) {
    L.push("", AJRAT);
    L.push("🟢 <b>ОРТИҚЧА ТЎЛАГАНЛАР</b>");
    L.push("");
    const rows = haqdor.map((s) => qator("  " + qisqa(s.ism, 16), pul(-s.qarz)));
    rows.push(chiziq());
    rows.push(qator("  ЖАМИ", pul(jamiHaqdorlik)));
    L.push(blok(rows.join("\n")));
  }

  if (tenglar.length) {
    L.push("", AJRAT);
    L.push(`✅ <b>ҲИСОБ-КИТОБ ТЕНГ</b> <i>(${tenglar.length} та)</i>`);
    L.push("");
    L.push(blok(tenglar.map((s) => "  " + qisqa(s.ism, 24)).join("\n")));
  }

  const egasiz = await kvGet(env, blokKey(davrlar[0].key, "egasiz"), []);
  if (egasiz.length) {
    L.push("", AJRAT);
    L.push("⚠️ <b>ЭГАСИ АНИҚЛАНМАГАН</b>");
    L.push("<i>Бу маҳсулотларнинг эгаси топилмади.</i>");
    L.push("");
    L.push(blok(egasiz.map((e) => qator("  " + qisqa(e.nom, 15), pul(e.summa))).join("\n")));
  }
  return bolaklab(L.join("\n"));
}

/* ---------- 📥 ОЙЛИК ҲИСОБОТ (админ) ----------
   2026-09-11: «📥 Excel — ҳамма сотувчилар» ўрнига. Админ ойни танлайди,
   ўша ойнинг тўлиқ файли келади (тўрт варақ, шаблон ўша-ўша).

   Сабаби: «ҳамма даврлар» файли ҳар ой каттариб борарди. Ойлик файл эса
   доим бир ойлик ҳажмда қолади. Қарз эса ҳар доим ТЎҒРИ: ойдан олдинги
   товар ва тўлов константа бўлиб қўшилади (omborExcel, opt.dan изоҳи).

   Ойлар рўйхати — маълумот юкланган ойлар + жорий ой, энг янгиси
   биринчи, 12 тагача.                                                  */
// Тугмаларда ҚИСҚА ном (жой кам эгалласин), файл изоҳи ва номида —
// тўлиқ ном («Бигант омбор — Март 2025.xlsx»).
const OY_QISQA = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн",
                  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const OY_NOM = ["Январ", "Феврал", "Март", "Апрел", "Май", "Июн",
                "Июл", "Август", "Сентябр", "Октябр", "Ноябр", "Декабр"];

/** «2026-09» → { dan, gacha, izoh: "Сентябр 2026" } (Excel сериал саналари) */
export function oyOraliq(kod) {
  const m = String(kod || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1], o = +m[2];
  if (o < 1 || o > 12) return null;
  const oxirgiKun = new Date(Date.UTC(y, o, 0)).getUTCDate();
  const ikki = (n) => String(n).padStart(2, "0");
  return {
    dan: ddmmyyyy(`01.${ikki(o)}.${y}`),
    gacha: ddmmyyyy(`${ikki(oxirgiKun)}.${ikki(o)}.${y}`),
    izoh: `${OY_NOM[o - 1]} ${y}`,
  };
}

/** Маълумоти бор ойлар + жорий ой (Тошкент вақти), энг янгиси биринчи.
 *  (Эски кўриниш — ҳозир фақат «маълумот борми?» белгиси учун ишлатилади.) */
export function oylarRoyxati(davrlar, hozir = Date.now()) {
  const kodlar = new Set();
  for (const d of davrlar || []) {
    const m = String(d.davrBoshi || "").match(/^\d{2}\.(\d{2})\.(\d{4})/);
    if (m) kodlar.add(`${m[2]}-${m[1]}`);
  }
  const t = new Date(hozir + 5 * 3600 * 1000);
  kodlar.add(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`);
  return [...kodlar].sort().reverse();
}

/** Жорий йил — Тошкент вақти бўйича */
export function joriyYil(hozir = Date.now()) {
  return new Date(hozir + 5 * 3600 * 1000).getUTCFullYear();
}

/** Танлаш мумкин бўлган йиллар: маълумотли энг эски йилдан жорий йилгача */
export function yillarOraliq(davrlar, hozir = Date.now()) {
  const yillar = [];
  for (const d of davrlar || []) {
    const m = String(d.davrBoshi || "").match(/^\d{2}\.\d{2}\.(\d{4})/);
    if (m) yillar.push(Number(m[1]));
  }
  const bu = joriyYil(hozir);
  const eng = yillar.length ? Math.min(...yillar, bu) : bu;
  const oxir = yillar.length ? Math.max(...yillar, bu) : bu;
  return { eng, oxir };
}

/** Ой танлаш — УЧТА тугма, холос:
 *      [📅 2026]  [🗓 Сентябр]
 *      [📥 Юклаб олиш]
 *      [📅 Бошқа сана]
 *  Йил ёки ой босилса ЎША хабарнинг ичида рўйхат очилади, танлангач
 *  яна шу учта тугмага қайтади. Аввал 12 ой бирданига чиқарди —
 *  экранни тўлдириб юборарди (Достон 2026-09-12).
 *  Танланган йил-ой тугмаларнинг ЎЗИДА сақланади (callback_data),
 *  шунинг учун KV га ҳеч нима ёзилмайди.
 *  @param rejim "asosiy" | "yil" | "oy"                                */
function oyKb(yil, oy, oraliq, borOylar, rejim = "asosiy") {
  const kod = (y, o) => `${y}-${String(o).padStart(2, "0")}`;
  const orqaga = { text: "↩️ Орқага", callback_data: `omb|oys|${yil}|${oy}` };

  if (rejim === "yil") {
    const rows = [];
    const yillar = [];
    for (let y = oraliq.oxir; y >= oraliq.eng; y--) yillar.push(y);
    for (let i = 0; i < yillar.length; i += 4)
      rows.push(yillar.slice(i, i + 4).map((y) =>
        ({ text: (y === yil ? "•" : "") + y, callback_data: `omb|oys|${y}|${oy}` })));
    rows.push([orqaga]);
    return { inline_keyboard: rows };
  }

  if (rejim === "oy") {
    const rows = [];
    for (let i = 0; i < 12; i += 4)
      rows.push([0, 1, 2, 3].map((j) => {
        const o = i + j + 1;
        return { text: (borOylar.has(kod(yil, o)) ? "•" : "") + OY_QISQA[o - 1],
                 callback_data: `omb|oys|${yil}|${o}` };
      }));
    rows.push([orqaga]);
    return { inline_keyboard: rows };
  }

  // Достон 2026-09-12: «сана бўйича танлаш бўлмасин — йил, ой, юклаб
  // олиш, тамом». «omb|xrng» ҳандлери ўз ўрнида қолди: чатда осилиб
  // қолган эски тугма босилса ҳам ишлайверсин.
  return { inline_keyboard: [
    [{ text: `📅 ${yil}`, callback_data: `omb|oyy|${yil}|${oy}` },
     { text: `🗓 ${OY_NOM[oy - 1]}`, callback_data: `omb|oyo|${yil}|${oy}` }],
    [{ text: "📥 Юклаб олиш", callback_data: `omb|oyx|${kod(yil, oy)}` }],
  ] };
}

/** Excel диапазонини танлаш клавиатураси. sid=0 → ҳамма сотувчилар */
// Учта тугма кифоя. Аввал «Сўнгги 7 кун», «Сўнгги 30 кун» ва ҳар бир
// даврнинг ўз тугмаси ҳам бор эди — рўйхат узайиб, танлаш қийинлашарди.
// Аниқ кунлар керак бўлса «Сана бўйича ҳисобот» ҳаммасини қоплайди.
// ЭСЛАТМА: эски тугмалар чатда қолиб кетган бўлса ҳам ишлайверади —
// davrTanla() уларнинг калитларини ҳамон танийди.
function excelKb(sid = 0) {
  const rows = [
    [{ text: "📦 Омбор ҳисоботим", callback_data: `omb|xd|oxirgi|${sid}` }],
    [{ text: "📚 Ҳамма даврлар", callback_data: `omb|xd|all|${sid}` }],
  ];
  if (!sid) rows.push([{ text: "👤 Сотувчи бўйича", callback_data: "omb|xsel" }]);
  return { inline_keyboard: rows };
}

/* ---------- Сана бўйича ҳисобот: кунларни қўлда ёзиш ----------
   «📅 Сана бўйича ҳисобот» босилгач, фойдаланувчи «01.08.2026  01.09.2026» деб
   ёзади. Кутиш ҳолати KV'да 10 дақиқа сақланади — бошқа модуллар билан
   тўқнашмаслиги учун калит алоҳида (`omb:xrng:<uid>`).                */
const XRNG_KEY = (uid) => `omb:xrng:${uid}`;
const XRNG_UMR = 600;                            // сония

/** «01.09.2026 - 09.09.2026» дан икки сана. Йил ёзилмаса — жорий йил.
 *  Ажратгич: дефис, тире, «дан…гача», вергул ёки оддий бўшлиқ.         */
export function sanaOraliq(matn) {
  const yil = new Date().getFullYear();
  const t = [];
  const re = /(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/g;
  let m;
  while ((m = re.exec(String(matn || "")))) {
    let y = m[3] === undefined ? yil : Number(m[3]);
    if (y < 100) y += 2000;
    const kun = Number(m[1]), oy = Number(m[2]);
    if (kun < 1 || kun > 31 || oy < 1 || oy > 12 || y < 2000 || y > 2100) continue;
    t.push(Math.floor(Date.UTC(y, oy - 1, kun) / 86400000) + 25569);
  }
  if (t.length < 2) return null;
  const dan = Math.min(t[0], t[1]), gacha = Math.max(t[0], t[1]);
  return { dan, gacha };
}

/** Сериал сана -> «01.09.2026» (фойдаланувчига кўрсатиш учун) */
function sanaMatn(serial) {
  const d = new Date((serial - 25569) * 86400000);
  const ik = (n) => String(n).padStart(2, "0");
  return `${ik(d.getUTCDate())}.${ik(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

const EXCEL_MATN =
  "📥 <b>EXCEL ЮКЛАБ ОЛИШ</b>\n\n" +
  "Қайси даврни юклаймиз?\n" +
  "<i>«📅 Сана бўйича ҳисобот» ни боссангиз, ўзингиз хоҳлаган кунларни " +
  "ёзасиз (масалан: 01.08.2026  01.09.2026).</i>";

function sotuvchiTanlashKb(ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 2) {
    const r = [{ text: ISM[ids[i]] || String(ids[i]), callback_data: `omb|s|${ids[i]}` }];
    if (ids[i + 1]) r.push({ text: ISM[ids[i + 1]] || String(ids[i + 1]), callback_data: `omb|s|${ids[i + 1]}` });
    rows.push(r);
  }
  return { inline_keyboard: rows };
}

/** Асосий тугма босилганда */
/**
 * @param {boolean} faqatOzi  true — фақат ЎЗИНИНГ ҳисоботи («📊 Ҳисоботим»).
 *   false — админ бўлса умумий ҳисобот + сотувчилар рўйхати
 *   («📦 Склад ҳисоботи»). Сардор ака иккала тугмани ҳам кўради:
 *   бирида ўзиники, иккинчисида ҳамманики.
 */
export async function omborOch(ctx, chatId, uid, access, faqatOzi = false) {
  const { env, tg, token } = ctx;
  const admin = isOmborHisobot(uid, access) && !faqatOzi;
  const sotuvchi = isOmborSotuvchi(uid);
  if (!admin && !sotuvchi) {
    await tg(token, "sendMessage", { chat_id: chatId, text: T.yoq, reply_markup: ctx.mainKb(uid) });
    return;
  }
  const davrlar = await kvGet(env, davrlarKey(), []);
  if (!davrlar.length) {
    await tg(token, "sendMessage", { chat_id: chatId, text: T.bosh,
      reply_markup: ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid) });
    return;
  }

  // --- АДМИН: аввал УМУМИЙ ҳисобот, тагида сотувчилар тугмаси.
  //
  // Аввал админ айни пайтда сотувчи ҳам бўлса (мас. Сардор),
  // умумий ҳисоботдан ОЛДИН ўзининг шахсий ҳисоботи чиқиб келарди —
  // экран тўлиб, асосий ҳисобот пастга сурилиб кетарди. Энди йўқ:
  // ўзиникини ҳам қуйидаги рўйхатдан танлаб кўради.
  if (admin) {
    for (const bolak of await adminMatn(env)) {
      await yubor(ctx, chatId, bolak);
    }
    const idlar = [...new Set(davrlar.flatMap((d) => d.sotuvchilar || []))];
    const kb = sotuvchiTanlashKb(idlar);
    // Бу тугма — ҲАММА сотувчи бирга. Битта одамники керак бўлса, юқоридаги
    // исмни босиш кифоя: матн ҳисобот ва Excel файл бирга келади.
    kb.inline_keyboard.push([
      { text: "📥 Ойлик ҳисобот", callback_data: "omb|oy" }]);
    // Курс шу ерда — умумий ҳисобот админники, курс ҳам админники.
    // Асосий клавиатурага қўшилса, сотувчиларга ҳам кўриниб қоларди.
    const k = await kursOl(env);
    kb.inline_keyboard.push([{
      text: k ? `💱 Курс: ${pul(k.qiymat)}` : "💱 Курсни белгилаш",
      callback_data: "omb|kurs",
    }]);
    await yubor(ctx, chatId,
      "👇 <b>Кимнинг батафсил ҳисоботини кўрамиз?</b>", { reply_markup: kb });
    return;
  }

  // --- СОТУВЧИ: фақат ЭXCEL файл.
  // Аввал матн ҳисобот ҳам юборилар эди — экран тўлиб кетарди ва айни
  // маълумот икки жойда такрорланарди. Энди фақат файл: ичида
  // маҳсулотлар, тўловлар ва якуний ҳисоб («Илхом.xlsx» формати).
  // Давр танлаш тугмаси ЙЎҚ: сотувчига ҳар доим ТЎЛИҚ ҳисобот берилади.
  // Танлов қўшилса, у «қайси даврни олай?» деб ўйлаб ўтирарди.
  await excelYubor(ctx, chatId, uid,
    { davrlar, izoh: "ҳамма даврлар", sotuvchi: uid });
  // «— ҳисобот тугади —» ёзилмайди: файлнинг ўзи ҳисобот тугаганини
  // билдиради. Клавиатура «📦 Бигант омбор» босилганда ўрнатилган ва
  // Telegram уни сақлаб туради, шунинг учун қайта юборишнинг ҳожати йўқ.
}

/* ==================== 2b. EXCEL ҲИСОБОТИ ====================
   ФОРМАТ: «умумий ҲИСОБОТ» ва «Илхом.xlsx» файллари билан бир
   хил — одамлар таниш кўринишда юклаб олсин.

   АДМИН (учта варақ, файлдаги тартибда):
     1) Товарлар хисоботи — № · Маҳсулот номи · Сони · Нархи · Суммаси ·
                            Олинган сана · Сотувчи · Қўшилган сана
     2) oplata            — тўловлар алоҳида варақда
     3) Сана бўйича ҳисобот — маҳсулотлар · тўловлар · сотувчилар жамиси
     3) Қарздорлик умумий — № · Сотувчи · Қарздорлик · Бошланғич қарз ·
                            Олинган товар · Оплата · Улуш %
   СОТУВЧИ — битта «ҲИСОБОТ» варағи, уч блок ёнма-ён (пастга қаранг).

   ИККИ САНА:
     • «Олинган сана»  — товар омбордан олинган кун (ҳисобот даври).
     • «Қўшилган сана» — ўша ҳисобот ботга юкланган кун (соати билан).
   Иккови ҳар доим бир хил бўлмайди: 01.09 да олинган товарнинг ҳисоботи
   03.09 да юкланиши мумкин. Шунинг учун иккови ҳам файлда туради.

   САНА БЎЙИЧА ҲИСОБОТ: opt.dan / opt.gacha (Excel сериал сана) берилса,
   ҳам маҳсулот, ҳам тўлов қаторлари ЎША оралиқ бўйича фильтрланади — бу
   «📅 Сана бўйича ҳисобот» тугмаси орқали ишлайди (фақат админда).

   Ҳисоб-китоб SUMIFS билан — макрос йўқ, WPS'да ҳам, эски Excel'да ҳам
   ишлайди. Асл файлда бу устунлар Google Sheets'нинг ARRAYFORMULA/OFFSET
   ҳийласи билан тўлдирилган; Excel'да улар `__xludf.DUMMYFUNCTION` бўлиб
   бузилади, шунинг учун бот қийматларни ТЎҒРИДАН-ТЎҒРИ ёзади.          */

const SH_TOV = "Товарлар хисоботи";
const SH_OPL = "oplata";
const SH_KUN = "Сана бўйича ҳисобот";
const SH_QAR = "Қарздорлик умумий";

/** Сана оралиғига тушадими? (dan/gacha берилмаса — ҳамма нарса тушади) */
function oraliqda(sana, opt) {
  if (sana === null || sana === undefined || sana === "") return true;
  if (opt.dan != null && sana < opt.dan) return false;
  if (opt.gacha != null && sana > opt.gacha) return false;
  return true;
}

/**
 * @param {object} opt
 *   opt.davrlar   — файлга КИРИТИЛАДИГАН даврлар (йўқ бўлса — ҳаммаси)
 *   opt.sotuvchi  — фақат шу сотувчи (йўқ бўлса — ҳаммаси)
 *   opt.izoh      — БОШҚАРУВ блокида кўрсатиладиган танлов номи
 *   opt.dan/gacha — сана оралиғи (Excel сериал), ихтиёрий
 *
 * МУҲИМ ҚОИДА (акс ҳолда қарз нотўғри чиқади):
 *   • Танланган даврлардан ОЛДИНГИ даврларнинг товари «Бошланғич қарз»
 *     устунига қўшилади — акс ҳолда файлда кўринмай, қарз камайиб кетарди.
 *   • ТЎЛОВЛАР сана оралиғи берилмаса фильтрланмайди: тўлов давр тугагач
 *     қилинади ва у қайси давр товари учун эканини ҳеч ким белгиламайди.
 */
// Mini App ҳам шу функцияни чақиради (src/app/excel.js) — Excel БИТТА жойда ясалади
export async function omborExcel(env, opt = {}) {
  // Курс — админ «💱 Курс» тугмаси орқали белгилаган ҲОЗИРГИ рақам.
  // ДИҚҚАТ: у файлдаги эски ёзувларга тегмайди. Ҳар бир товар ва тўлов
  // ЎЗИ ёзилган кундаги курсда ҳисобланади (ёзувнинг ичида сақланади).
  // Ҳозирги курс фақат курси йўқ эски ёзувлар учун захира сифатида ва
  // «Ҳозирги курс» катагида маълумот сифатида ишлатилади.
  if (opt.kurs === undefined) {
    const k = await kursOl(env);
    opt = { ...opt, kurs: k ? son(k.qiymat) : 0 };
  }
  // Сотувчи танланган бўлса — унинг ЎЗ формати (битта «ҲИСОБОТ» варағи).
  // Админ бошқа сотувчининг файлини сўраса ҳам шу формат келади: файл
  // битта одам ҳақида бўлса, уч варақли умумий жадвал ортиқча.
  if (opt.sotuvchi) return sotuvchiExcel(env, opt.sotuvchi, opt);

  const barcha = await kvGet(env, davrlarKey(), []);
  const bqXom = await kvGet(env, "omb:bq", {});
  // Склад файли ҳали йўқ, лекин бошланғич қарз бор — файл БАРИБИР чиқсин (Достон 2026-09-21:
  // бошланғич қарзлар алоҳида ёзилади, биринчи Basko файлидан олдин ҳам Excel керак)
  if (!barcha.length && !Object.keys(bqXom || {}).length) return null;
  // Курси ёзилмаган эски ёзувлар учун захира қиймат
  const kurs = son(opt.kurs);

  const davrlar = opt.davrlar && opt.davrlar.length ? opt.davrlar : barcha;
  const kiritilgan = new Set(davrlar.map((d) => d.key));
  // 🔤 Алифбо тартиби (Достон 2026-09-25): «isimlar alifbo bo'yicha tursin a,b,c,d».
  // Файлнинг ҳамма варағи шу тартибда — «Қарздорлик умумий», «Сана бўйича ҳисобот».
  const ALIFBO = (x, y) => String(x || "").localeCompare(String(y || ""), "ru");
  const idlar = hisobotIdlar(davrlar, bqXom)
    .sort((a, b) => ALIFBO(ISM[a] || String(a), ISM[b] || String(b)));

  // Керакли ҲАММА блок ва тўлов — БИР ЙЎЛА (kvGetMany изоҳига қаранг).
  // Аввал ҳар бири тсикл ичида алоҳида ўқиларди: 13 × даврлар та амал.
  const kvKalit = [];
  for (const d of barcha) {
    for (const id of idlar) kvKalit.push(blokKey(d.key, id));
    kvKalit.push(blokKey(d.key, "egasiz"));
  }
  for (const id of idlar) kvKalit.push(payKey(id));
  const KV = await kvGetMany(env, kvKalit);
  const kvq = (k, fb) => { const v = KV.get(k); return v === null || v === undefined ? fb : v; };

  // --- «Бошланғич қарз» — АЙНАН ўша, KV'даги қиймат. Ҳеч нима қўшилмайди.
  //
  // Аввал бу устунга файлга КИРМАГАН даврларнинг товари ҳам қўшиларди.
  // Мақсад тўғри эди (тўловлар фильтрланмайди, шунинг учун кирмаган давр
  // товари ҳисобга олинмаса қарз камайиб кетарди), лекин натижа чалғитарди:
  // «бошланғич қарзим 50 млн эди, нега 74 млн?» Энди ўша фарқ ЎЗ жойига —
  // «Олинган товар» устунига қўшилади, чунки у аслида ТОВАР.
  const bq = {};
  const bqDollar = {};                            // бошланғич қарз — ЎЗ курсида
  const kirmagan = {};                            // файлга кирмаган давр товари
  const kirmaganD = {};                           // ўшанинг доллардаги қиймати
  // Бошланғич қарз ҚАЙСИ курсда ёзилган эди — ўшанда қолади. Курс кейин
  // ўзгарса ҳам жадвалдаги 3 675,21 $ ўша бўлиб туради.
  const bqKurs = son(await kvGet(env, BQ_KURS_KEY, 0)) || kurs;
  for (const id of idlar) {
    bq[id] = son(bqXom[id] || 0);
    bqDollar[id] = bqKurs ? bq[id] / bqKurs : 0;
    kirmagan[id] = 0;
    kirmaganD[id] = 0;
  }
  for (const d of barcha) {
    if (kiritilgan.has(d.key)) continue;
    // Сана оралиғидан КЕЙИН бошланган давр — «гача» санасидаги қарзга кирмайди
    // (аввал эски «Сана бўйича ҳисобот» да кейинги ой товари ҳам қўшиларди).
    if (opt.gacha != null && ddmmyyyy(d.davrBoshi) !== null && ddmmyyyy(d.davrBoshi) > opt.gacha) continue;
    const dKurs = son(d.kurs) || kurs;
    for (const id of idlar) {
      const b = blokNorm(kvq(blokKey(d.key, id), null));
      if (b) {
        kirmagan[id] += b.summa;
        if (dKurs) kirmaganD[id] += b.summa / dKurs;
      }
    }
  }
  // --- САНА ОРАЛИҒИДАН ОЛДИНГИ товар ва тўлов (ойлик / сана бўйича файл).
  //
  // ХАТО ТУЗАТИЛДИ (2026-09-11): оралиқ танланганда файлга фақат шу
  // оралиқнинг товари ва тўлови тушарди, ОЛДИНГИЛАРИ эса умуман йўқолиб
  // қоларди. Сентябр файлида Абдулхайнинг қарзи 32 млн ўрнига 15 млн
  // чиқарди — август товари (20 млн) ва тўлови (3 млн) ҳисобга олинмаган.
  //
  // Энди оралиқдан олдинги товар «файлга кирмаган давр товари» бўлиб
  // (аввалги қоида билан бир хил) «Олинган товар» га, олдинги тўлов эса
  // «Оплата» га константа бўлиб қўшилади. «Бошланғич қарз» тоза қолади.
  // Оралиқдан КЕЙИНГИ ёзувлар кирмайди — қарз «гача» санасидаги ҳолат.
  const oldinTol = {}, oldinTolD = {};
  for (const id of idlar) { oldinTol[id] = 0; oldinTolD[id] = 0; }
  if (opt.dan != null) {
    for (const d of davrlar) {
      const olingan = ddmmyyyy(d.davrBoshi);
      if (olingan === null || olingan >= opt.dan) continue;
      const dKurs = son(d.kurs) || kurs;
      for (const id of idlar) {
        const b = blokNorm(kvq(blokKey(d.key, id), null));
        if (b) {
          kirmagan[id] += b.summa;
          if (dKurs) kirmaganD[id] += b.summa / dKurs;
        }
      }
    }
    for (const id of idlar) {
      for (const p of kvq(payKey(id), [])) {
        if (!p || p.holat === "bekor") continue;
        const sana = excelDate(p.vaqt);
        if (sana === null || sana >= opt.dan) continue;
        oldinTol[id] += son(p.summa);
        const pk = son(p.kurs) || kurs;
        if (pk) oldinTolD[id] += son(p.summa) / pk;
      }
    }
  }
  const jamiOldinTol = idlar.reduce((a, id) => a + oldinTol[id], 0);
  // Константани формулага қўшиш: 0 бўлса ҳеч нима ёзилмайди
  const qosh = (v, dollarmi) => (v ? "+" + (dollarmi ? v.toFixed(2) : Math.round(v)) : "");

  const jamiKirmagan = idlar.reduce((a, id) => a + kirmagan[id], 0);

  /* ---------- маҳсулот қаторларини йиғамиз ----------
     [nom, soni, summa, olinganC, kim, qoshilganC, kurs]

     КУРС ҳар бир қаторнинг ЎЗИДА. Давр юкланган пайтдаги курс ёзувда
     муҳрланган — админ кейин курсни ўзгартирса, бу қаторнинг доллардаги
     қиймати ЎЗГАРМАЙДИ. Эски ёзувларда курс бўлмаса (2026-09-10 гача
     юкланганлар) — ҳозирги курсга қайтамиз.                          */
  const qatorlar = [];
  for (const d of davrlar) {
    const dKurs = son(d.kurs) || kurs;
    const olingan = ddmmyyyy(d.davrBoshi);
    if (!oraliqda(olingan, opt)) continue;
    const olinganC = olingan === null ? "" : { v: olingan, s: S.SANA };
    // «Қўшилган» — ҳисобот ботга юкланган кун (соати билан)
    const qosh = excelDateTime(d.yuklandi);
    const qoshC = qosh === null ? "" : { v: qosh, s: S.SANA_VAQT };
    for (const id of idlar) {
      const b = blokNorm(kvq(blokKey(d.key, id), null));
      if (!b) continue;
      for (const p of b.mahsulotlar) {
        qatorlar.push([String(p.nom ?? ""), son(p.soni), son(p.summa),
                       olinganC, ISM[id] || String(id), qoshC, dKurs]);
      }
    }
    // Эгасиз товар — «⚠️ …» номи билан. Ҳеч бир сотувчининг SUMIFS'ига
    // тушмайди, лекин файлда КЎРИНАДИ: жами текшируви шунга таянади.
    const eg = kvq(blokKey(d.key, "egasiz"), []);
    for (const xom of Array.isArray(eg) ? eg : []) {
      const b = blokNorm(xom);
      if (!b) continue;
      for (const p of b.mahsulotlar) {
        qatorlar.push([String(p.nom ?? ""), son(p.soni), son(p.summa),
                       olinganC, `⚠️ ${b.nom} (эгасиз)`, qoshC, dKurs]);
      }
    }
  }

  // 🔤 Тартиб: сотувчи алифбо бўйича, кейин сана 01.09 → 02.09, кейин номи.
  // Эгасиз товар («⚠️ …») ҳар доим ЭНГ ПАСТДА — умумий жамга халақит бермасин.
  const egasizmi = (q) => String(q[4]).startsWith(String.fromCharCode(0x26a0));
  const sanaSon = (c) => (c && typeof c === "object" ? Number(c.v) || 0 : 0);
  qatorlar.sort((a, b) =>
    (egasizmi(a) ? 1 : 0) - (egasizmi(b) ? 1 : 0)
    || ALIFBO(a[4], b[4]) || sanaSon(a[3]) - sanaSon(b[3]) || ALIFBO(a[0], b[0]));

  // «Қарздорлик умумий»!N3 — ҲОЗИРГИ курс. У фақат ЯНГИ ёзувлар учун
  // ишлатилади ва файлда маълумот сифатида кўрсатилади. Доллар устунлари
  // энди унга ҚАРАМАЙДИ — ҳар бир қатор ўз «Курс» катагига бўлинади.
  // Сабаби: курс ўзгарса эски товарнинг доллардаги қиймати ўзгариб
  // кетмаслиги керак (Достон 2026-09-10 да айтди).
  const KURS_KAT = `'${SH_QAR}'!$N$3`;
  /** Сумма катагини ЎША ҚАТОРНИНГ курс катагига бўлади */
  const dollarQ = (summaKat, kursKat) =>
    `IF(${kursKat}=0,"",${summaKat}/${kursKat})`;

  /* ---------- тўлов қаторлари ---------- */
  const tolovlar = [];
  for (const id of idlar) {
    // ДИҚҚАТ: `p.id` — ТЎЛОВ id'си, сотувчиники эмас. Шунинг учун сотувчи
    // алоҳида `sid` майдонида — `{id, ...p}` десак, p.id уни босиб кетарди.
    for (const p of kvq(payKey(id), [])) tolovlar.push({ sid: id, ...p });
  }
  // 🔤 Сана бўйича ЎСИШ тартибида: 01.09.2026, 02.09.2026, 03.09.2026 …
  // (Достон 2026-09-25). Бир кунда бир нечта бўлса — сотувчи алифбо бўйича.
  tolovlar.sort((a, b) => String(a.vaqt || "").localeCompare(String(b.vaqt || ""))
    || ALIFBO(ISM[a.sid] || String(a.sid), ISM[b.sid] || String(b.sid)));
  let tolMin = null;
  const tolQator = [];
  for (const p of tolovlar) {
    const sana = excelDate(p.vaqt);
    if (!oraliqda(sana, opt)) continue;
    if (sana !== null && (tolMin === null || sana < tolMin)) tolMin = sana;
    // Бекор қилинган тўлов ЎЧИРИЛМАЙДИ — исмига «(бекор)» қўшилади.
    // Шунда у файлда кўринади, аммо SUMIFS аниқ исмга мос келмагани учун
    // қарздан айирилмайди. Аввал алоҳида «Ҳолати» устуни бор эди — янги
    // форматда у йўқ, шунинг учун шу йўл.
    const kim = (ISM[p.sid] || String(p.sid)) + (p.holat === "bekor" ? " (бекор)" : "");
    const r = tolQator.length + 3;                // варақда 3-қатордан бошланади
    tolQator.push([
      sana === null ? "" : { v: sana, s: S.SANA }, { v: kim, s: S.MATN },
      { v: son(p.summa), s: S.SON },
      // «Курс» устуни аллақачон бор эди — энди бўш эмас. Ичида ШУ
      // ТЎЛОВНИНГ курси турибди, ҳозиргиси эмас.
      { v: son(p.kurs) || kurs, s: S.SON },
      { f: `IF(N${r}=0,"",M${r}/N${r})`, s: dollar(S.SON) },
    ]);
  }

  /* ---------- САНА ЧЕГАРАЛАРИ ----------
     Икки варақда ҳам керак: «Сана бўйича ҳисобот» нинг учинчи
     блокида ва «Қарздорлик умумий» нинг бошқарув блокида.            */
  const sanalar = davrlar.map((d) => ddmmyyyy(d.davrBoshi)).filter((x) => x !== null);
  const oxirgi = davrlar.map((d) => ddmmyyyy(d.davrOxiri)).filter((x) => x !== null);
  const bugun = excelDate(new Date());
  // Қуйи чегара — файлдаги ЭНГ ЭРТА сана (давр боши ёки тўлов, қайси эртароқ).
  // Тўлов чегарадан ташқарида қолса, қарз ҳақиқийдан кўп чиқиб кетарди.
  const erta = sanalar.length ? Math.min(...sanalar) : bugun;
  // ХАТО ТУЗАТИЛДИ: аввал «охирги сана» = давр тугаган кун эди. Тўловлар эса
  // ДАВР ТУГАГАЧ қилинади — 30.09 да тугаган давр учун 05.10 даги тўлов
  // фильтрдан ташқарида қолиб, Excel'даги қарз ботдагидан КЎП кўринарди.
  const minS = opt.dan != null ? opt.dan
             : (tolMin !== null ? Math.min(erta, tolMin) : erta);
  const maxS = opt.gacha != null ? opt.gacha
             : Math.max(oxirgi.length ? Math.max(...oxirgi) : bugun, bugun);

  /* ---------- 1-варақ: ТОВАРЛАР ХИСОБОТИ ----------
     A № · B Номи · C Сони · D Нархи · E Суммаси · F Курс ·
     G Суммаси ($) · H Олинган сана · I Сотувчи · J Қўшилган сана

     «Курс» устуни — ШУ товар олинган пайтдаги курс. Доллар устуни
     ўшанга бўлинади, ҳозирги курсга эмас: курс ўзгарса эски товарнинг
     доллардаги баҳоси ўзгармаслиги керак.                            */
  const tov = [[
    { v: "№", s: S.BOSH }, { v: "Маҳсулот номи", s: S.BOSH },
    { v: "Сони", s: S.BOSH }, { v: "Нархи", s: S.BOSH },
    { v: "Суммаси", s: S.BOSH }, { v: "Курс", s: S.BOSH },
    { v: "Суммаси ($)", s: S.BOSH }, { v: "Олинган сана", s: S.BOSH },
    { v: "Сотувчи", s: S.BOSH }, { v: "Қўшилган сана", s: S.BOSH },
  ]];
  // «Нархи» — формула, қиймат эмас: файлда «Сони» ёки «Суммаси» тузатилса,
  // бирлик нархи ўзи қайта ҳисобланади.
  qatorlar.forEach((q, i) => {
    const r = i + 2;                              // сарлавҳа 1-қатор
    tov.push([
      { v: i + 1, s: S.SON }, { v: q[0], s: S.MATN }, { v: q[1], s: S.SON },
      { f: `IF(C${r}=0,0,E${r}/C${r})`, s: S.SON },
      { v: q[2], s: S.SON }, { v: q[6], s: S.SON },
      { f: dollarQ(`E${r}`, `F${r}`), s: dollar(S.SON) },
      q[3], { v: q[4], s: S.MATN }, q[5],
    ]);
  });

  /* ---------- 2-варақ: OPLATA ----------
     Тўловлар алоҳида варақда: Сана · Сотувчи · Оплата · Курс · Оплата $.
     «Сана бўйича ҳисобот» даги тўлов блоки билан бир хил — шаблонда
     ҳам шундай. Бухгалтерга тўловларни ёлғиз кўриш қулай.            */
  const opl = [[
    { v: "Сана", s: S.BOSH }, { v: "Сотувчи", s: S.BOSH },
    { v: "Оплата", s: S.BOSH }, { v: "Курс", s: S.BOSH },
    { v: "Оплата $", s: S.BOSH },
  ]];
  tolQator.forEach((t, i) => {
    const r = i + 2;                              // сарлавҳа 1-қатор
    // «Курс» — ШУ ТЎЛОВ қилинган кундаги курс (t[3] да турибди)
    opl.push([t[0], t[1], t[2], t[3],
              { f: dollarQ(`C${r}`, `D${r}`), s: dollar(S.SON) }]);
  });

  /* ---------- 3-варақ: КУНЛИК ХИСОБОТ ----------
     Чапда A–G маҳсулотлар · H ажратгич · I–M тўловлар · N ажратгич ·
     O–T «САНА БЎЙИЧА ҲИСОБОТ».

     Учинчи блок — ботдаги «📅 Сана бўйича ҳисобот» нинг файл ичидаги
     кўриниши. S3 ва T3 катакларига икки сана ёзилади, ҳар бир сотувчининг
     ўша оралиқдаги товари ва тўлови ЎЗИ қайта ҳисобланади. Аввал файлни
     қайтадан юклаб олиш керак эди.

     «Жами қарз» устуни оралиқдан ҚАТЪИЙ НАЗАР — бошланғич қарз + гача
     санагача бўлган БАРЧА товар − барча тўлов. Яъни «ўша кунги ҳақиқий
     қарз». Аслий файлдаги формуланинг айни ўзи.                       */
  const kun = [];
  kun.push([{ v: "Олинган махсулотлар", s: S.BLOK }, "", "", "", "", "", "", "", "", "",
            { v: "Тўловлар", s: S.BLOK_YASHIL }, "", "", "", "", "",
            { v: "Сотувчилар бўйича жами", s: S.BLOK }]);
  kun.push([
    // A–I: маҳсулотлар («Курс» — ўша товар олинган кундаги курс)
    { v: "№", s: S.BOSH }, { v: "Маҳсулот номи", s: S.BOSH },
    { v: "Сони", s: S.BOSH }, { v: "Нархи", s: S.BOSH },
    { v: "Суммаси", s: S.BOSH }, { v: "Курс", s: S.BOSH },
    { v: "Суммаси ($)", s: S.BOSH },
    { v: "Олинган сана", s: S.BOSH }, { v: "Қўшилган сана", s: S.BOSH }, "",
    // K–O: тўловлар («Курс» аллақачон бор эди — янгиси қўшилмади)
    { v: "Сана", s: S.BOSH }, { v: "Сотувчи", s: S.BOSH },
    { v: "Оплата", s: S.BOSH }, { v: "Курс", s: S.BOSH },
    { v: "Оплата $", s: S.BOSH }, "",
    // Q–Y: сотувчилар бўйича жами — ҳар сумманинг доллардаги варианти билан
    { v: "Сотувчи", s: S.BOSH },
    { v: "Олган товар", s: S.BOSH }, { v: "Олган товар ($)", s: S.BOSH },
    { v: "Оплата", s: S.BOSH }, { v: "Оплата ($)", s: S.BOSH },
    { v: "Жами қарз", s: S.BOSH }, { v: "Жами қарз ($)", s: S.BOSH },
    { v: "Сана (дан)", s: S.SARIQ_M }, { v: "Сана (гача)", s: S.SARIQ_M },
  ]);

  // Учинчи блокнинг қаторлари — ҳар сотувчига биттадан.
  // Устунлар: Q Сотувчи · R товар · S товар($) · T оплата · U оплата($) ·
  //           V жами қарз · W жами қарз($) · X сана(дан) · Y сана(гача)
  //
  // Доллар устунлари СЎМни курсга бўлмайди — «Товарлар хисоботи» нинг
  // доллар устунини (G) айнан шу шартлар билан йиғади. Шунда ҳар бир
  // товар ЎЗ курсида ҳисобланган бўлиб қолади.
  const sanaBlok = idlar.map((id, i) => {
    const r = i + 3;
    const ism = ISM[id] || String(id);
    // ust: 'E' — сўм устуни, 'G' — доллар устуни («Товарлар хисоботи» да)
    const tovarF = (ust, chek) =>
      `SUMIFS('${SH_TOV}'!$${ust}:$${ust},'${SH_TOV}'!$I:$I,$Q${r},` +
      `'${SH_TOV}'!$H:$H,${chek})`;
    // ust: 'M' — сўм, 'O' — доллар (шу варақдаги тўловлар блоки)
    const tolF2 = (ust, chek) => `SUMIFS($${ust}:$${ust},$L:$L,$Q${r},$K:$K,${chek})`;
    const oraliq = `">="&$X$3,'${SH_TOV}'!$H:$H,"<="&$Y$3`;
    const tolOraliq = `">="&$X$3,$K:$K,"<="&$Y$3`;
    return [
      { v: ism, s: S.MATN },
      // Оралиқдаги товар — сўмда ва долларда
      { f: tovarF("E", oraliq) + (kirmagan[id] ? `+${kirmagan[id]}` : ""), s: S.SON },
      { f: tovarF("G", oraliq) + (kirmaganD[id] ? `+${kirmaganD[id].toFixed(2)}` : ""),
        s: dollar(S.SON) },
      // Оралиқдаги тўлов — сўмда ва долларда
      { f: tolF2("M", tolOraliq) + qosh(oldinTol[id]), s: S.SON },
      { f: tolF2("O", tolOraliq) + qosh(oldinTolD[id], true), s: dollar(S.SON) },
      // «Гача» санагача бўлган ҲАҚИҚИЙ қарз
      // ДИҚҚАТ: «Бошланғич қарз» — «Қарздорлик умумий» нинг E устунида,
      // доллардагиси эса F да. Нотўғри устунга қараса, доллар рақами
      // сўм деб олиниб қарз бутунлай нотўғри чиқади.
      { f: `INDEX('${SH_QAR}'!$E:$E,MATCH($Q${r},'${SH_QAR}'!$B:$B,0))` +
           `+${tovarF("E", `"<="&$Y$3`)}${qosh(kirmagan[id])}` +
           `-(${tolF2("M", `"<="&$Y$3`)}${qosh(oldinTol[id])})`, s: S.SON_B },
      { f: `INDEX('${SH_QAR}'!$F:$F,MATCH($Q${r},'${SH_QAR}'!$B:$B,0))` +
           `+${tovarF("G", `"<="&$Y$3`)}${qosh(kirmaganD[id], true)}` +
           `-(${tolF2("O", `"<="&$Y$3`)}${qosh(oldinTolD[id], true)})`,
        s: dollar(S.SON_B) },
      // Икки сана — фақат БИРИНЧИ қаторда, қолганлари $X$3/$Y$3 га қарайди
      i === 0 ? { v: minS, s: S.SARIQ_SANA } : "",
      i === 0 ? { v: maxS, s: S.SARIQ_SANA } : "",
    ];
  });

  const n = Math.max(qatorlar.length, tolQator.length, sanaBlok.length);
  for (let i = 0; i < n; i++) {
    const r = i + 3;
    const q = qatorlar[i];
    const chap = q
      ? [{ v: i + 1, s: S.SON }, { v: q[0], s: S.MATN }, { v: q[1], s: S.SON },
         { f: `IF(C${r}=0,0,E${r}/C${r})`, s: S.SON }, { v: q[2], s: S.SON },
         { v: q[6], s: S.SON }, { f: dollarQ(`E${r}`, `F${r}`), s: dollar(S.SON) },
         q[3], q[5]]
      : ["", "", "", "", "", "", "", "", ""];
    const ong = tolQator[i] || ["", "", "", "", ""];
    const uch = sanaBlok[i] || ["", "", "", "", "", "", "", "", ""];
    kun.push([...chap, "", ...ong, "", ...uch]);
  }

  /* ---------- 3-варақ: ҚАРЗДОРЛИК УМУМИЙ ----------
     A № · B Сотувчи · C Қарздорлик · D Бошланғич қарз · E Олинган товар ·
     F Оплата · G Улуш %   |   H/I — БОШҚАРУВ блоки */
  const r0 = 3;                                   // биринчи сотувчи қатори
  const rEnd = r0 + idlar.length - 1;
  const rJami = rEnd + 1;

  const qar = [];
  qar.push([{ v: "БИГАНТ ОМБОР — СОТУВЧИЛАР ҚАРЗДОРЛИГИ", s: S.KATTA }]);
  qar.push([
    // A–K: ҳар бир сумманинг сўмдаги ва доллардаги варианти ёнма-ён
    { v: "№", s: S.Q_BOSH }, { v: "Сотувчи", s: S.Q_BOSH },
    { v: "Қарздорлик", s: S.Q_BOSH }, { v: "Қарздорлик ($)", s: S.Q_BOSH },
    { v: "Бошланғич қарз", s: S.Q_BOSH }, { v: "Бошланғич қарз ($)", s: S.Q_BOSH },
    { v: "Олинган товар", s: S.Q_BOSH }, { v: "Олинган товар ($)", s: S.Q_BOSH },
    { v: "Оплата", s: S.Q_BOSH }, { v: "Оплата ($)", s: S.Q_BOSH },
    { v: "Улуш %", s: S.Q_BOSH },
  ]);
  // Бошқарув блоки M/N устунларида — доллар устунлари қўшилганда
  // силжиб кетмасин деб ўнг четда турибди. N3 — КУРС, N4/N5 — саналар.
  // Файлга кирмаган давр товари «Олинган товар» га константа бўлиб
  // қўшилади: шунда «Қарздорлик» ҳар доим ҲАҚИҚИЙ жами қарзни кўрсатади,
  // «Бошланғич қарз» эса тоза қолади.
  //
  // ust: 'E' — сўм, 'G' — доллар («Товарлар хисоботи» устунлари).
  // Доллар устуни СЎМни курсга бўлиш билан эмас, ҳар бир товарнинг ЎЗ
  // курсида ҳисобланган доллар қийматини йиғиш билан чиқади.
  const tovF = (r, id, ust) =>
    `SUMIFS('${SH_TOV}'!$${ust}:$${ust},'${SH_TOV}'!$I:$I,$B${r},` +
    `'${SH_TOV}'!$H:$H,">="&$N$4,'${SH_TOV}'!$H:$H,"<="&$N$5)` +
    (ust === "E"
      ? (kirmagan[id] ? `+${kirmagan[id]}` : "")
      : (kirmaganD[id] ? `+${kirmaganD[id].toFixed(2)}` : ""));
  // ust: 'M' — сўм, 'O' — доллар («Сана бўйича ҳисобот» тўловлар блоки)
  const tolF = (r, ust) =>
    `SUMIFS('${SH_KUN}'!$${ust}:$${ust},'${SH_KUN}'!$L:$L,$B${r},` +
    `'${SH_KUN}'!$K:$K,">="&$N$4,'${SH_KUN}'!$K:$K,"<="&$N$5)`;

  idlar.forEach((id, i) => {
    const r = r0 + i;
    // Зебра: жуфт қаторлар очиқ ҳаво рангда — асл файлдагидек, узун
    // рўйхатда кўз адашмасин.
    const z = i % 2 === 1;
    const M = z ? S.Q_ZEBRA : S.Q_MATN;
    const N = z ? S.Q_ZEBRA_SON : S.Q_SON;
    const F = z ? S.Q_ZEBRA_FOIZ : S.Q_FOIZ;
    qar.push([
      { v: i + 1, s: M },
      { v: ISM[id] || String(id), s: M },
      // Мусбат = сотувчи қарздор, манфий = сотувчи ҳақдор (ортиқча тўлаган).
      // Доллар устуни ҳам ЎЗ устунлари билан ҳисобланади (F+H−J), сўмни
      // курсга бўлиш билан эмас — ҳар бир қисм ўз курсида ёзилган.
      { f: `E${r}+G${r}-I${r}`, s: N },
      { f: `F${r}+H${r}-J${r}`, s: dollar(N) },
      { v: son(bq[id] || 0), s: N },
      { v: Math.round((bqDollar[id] || 0) * 100) / 100, s: dollar(N) },
      { f: tovF(r, id, "E"), s: N },
      { f: tovF(r, id, "G"), s: dollar(N) },
      { f: tolF(r, "M") + qosh(oldinTol[id]), s: N },
      { f: tolF(r, "O") + qosh(oldinTolD[id], true), s: dollar(N) },
      { f: `IFERROR(C${r}/$C$${rJami},0)`, s: F },
    ]);
  });
  // ЖАМИ қатори — ҳар бир устун ўз жамига эга, бўш катак қолмайди.
  qar.push([
    { v: "", s: S.JAMI_M }, { v: "BIGANT ЖАМИ", s: S.JAMI_M },
    { f: `SUM(C${r0}:C${rEnd})`, s: S.JAMI },
    { f: `SUM(D${r0}:D${rEnd})`, s: dollar(S.JAMI) },
    { f: `SUM(E${r0}:E${rEnd})`, s: S.JAMI },
    { f: `SUM(F${r0}:F${rEnd})`, s: dollar(S.JAMI) },
    { f: `SUM(G${r0}:G${rEnd})`, s: S.JAMI },
    { f: `SUM(H${r0}:H${rEnd})`, s: dollar(S.JAMI) },
    { f: `SUM(I${r0}:I${rEnd})`, s: S.JAMI },
    { f: `SUM(J${r0}:J${rEnd})`, s: dollar(S.JAMI) },
    { f: `SUM(K${r0}:K${rEnd})`, s: S.JAMI_FOIZ },
  ]);

  // --- БОШҚАРУВ блоки: M — изоҳ, N — қиймат.
  const qoy = (r, nom, qiymat, sariq) => {
    while (qar.length < r) qar.push([]);
    const s = qar[r - 1];
    while (s.length < 12) s.push("");
    s[12] = { v: nom, s: sariq ? S.SARIQ_M : S.YAKUN };
    s[13] = qiymat;
  };
  // N3 — ҲОЗИРГИ курс. ДИҚҚАТ: бу рақам ҳисоблашни бошқармайди. Ҳар бир
  // товар ва тўлов ЎЗ курсида ҳисобланган — курс ҳар қаторнинг «Курс»
  // устунида турибди. N3 фақат «бугун курс шунча» деб кўрсатади ва
  // кейинги юкланадиган файлларга тегишли бўлади.
  qoy(3, "Ҳозирги курс (1 $ = сўм)",
      { v: son(opt.kurs) || "", s: S.SARIQ_SON }, true);
  qoy(4, "Сана (дан)", { v: minS, s: S.SARIQ_SANA }, true);
  qoy(5, "Сана (гача)", { v: maxS, s: S.SARIQ_SANA }, true);
  qoy(6, "Танлов", { v: opt.izoh || "ҳамма даврлар", s: S.YAKUN });
  // ФАҚАТ танланган оралиққа тушган даврлар саналади. Аввал ҳамма
  // давр саналарди: сентябр танланганда «Даврлар сони: 1» деб турар,
  // аслида августдаги давр эди ва файлга умуман кирмаган эди.
  const davrlarIchida = davrlar.filter((d) => oraliqda(ddmmyyyy(d.davrBoshi), opt)).length;
  qoy(7, "Даврлар сони", { v: davrlarIchida, s: S.YAKUN_SON });
  qoy(8, "Файл яратилди", { v: excelDateTime(new Date()), s: S.YAKUN_VAQT });
  qoy(10, "Жами қарз", { f: `SUMIF(C${r0}:C${rEnd},">0")`, s: S.YAKUN_SON });
  qoy(11, "Жами (−)", { f: `-SUMIF(C${r0}:C${rEnd},"<0")`, s: S.YAKUN_SON });
  qoy(12, "Соф қолдиқ", { f: `SUM(C${r0}:C${rEnd})`, s: S.YAKUN_SON });
  qoy(13, "Файлга кирмаган давр товари",
      { v: jamiKirmagan, s: S.YAKUN_SON });
  qoy(17, "Файлга кирмаган давр тўлови",
      { v: jamiOldinTol, s: S.YAKUN_SON });
  // Эгасиз товар ҳеч кимнинг қаторига қўшилмайди — акс ҳолда «Товарлар
  // хисоботи» жамига тўғри келмай, ўқиган одам чалкашарди.
  qoy(14, "Эгаси аниқланмаган товар",
      { f: `SUMIFS('${SH_TOV}'!$E:$E,'${SH_TOV}'!$I:$I,"⚠️*",` +
           `'${SH_TOV}'!$H:$H,">="&$N$4,'${SH_TOV}'!$H:$H,"<="&$N$5)`, s: S.YAKUN_SON });
  qoy(15, "Қўлдаги ҳисобот", { v: "", s: S.YAKUN_SON });
  // «Қўлдаги ҳисобот» бўш турганда аввал #VALUE! чиқарди (Excel'да текширилди):
  // бўш катак матн сифатида ёзилади, «сон − матн» эса хато. Энди админ
  // рақамни ёзмагунча «Фарқ» бўш туради.
  qoy(16, "Фарқ", { f: `IF(N(N15)=0,"",N12-N15)`, s: S.YAKUN_SON });
  qoy(18, "👆 Икки санани ўзгартиринг — жадвал ўзи қайта ҳисобланади",
      { v: "", s: S.OD });
  qoy(19, "ℹ️ Ҳар бир товар ва тўлов ЎЗ кунидаги курсда ҳисобланган",
      { v: "", s: S.OD });

  // Устун кенгликлари асл файлдан олинган — сарлавҳа қирқилиб қолмасин.
  return buildXlsx([
    { name: SH_TOV, rows: tov,
      cols: [3.43, 65.71, 11.43, 11.43, 13, 11, 13, 13, 20.71, 17],
      freeze: 1, autoFilter: `A1:J${tov.length}` },
    { name: SH_OPL, rows: opl, cols: [12, 20.71, 16, 11, 14],
      freeze: 1, autoFilter: `A1:E${opl.length}` },
    { name: SH_KUN, rows: kun,
      // A–I маҳсулотлар · J ажратгич · K–O тўловлар · P ажратгич · Q–Y жами
      cols: [3.43, 39.43, 11.43, 11.43, 13, 11, 13, 13, 17, 3,
             11.14, 20.71, 14, 11, 12, 3,
             // …, V/W «Жами қарз», X/Y «Сана (дан/гача)» — сана сиғсин
             20.71, 16, 14, 16, 14, 18, 14, 16, 16],
      freeze: 2, merge: ["A1:I1", "K1:O1", "Q1:Y1"] },
    { name: SH_QAR, rows: qar,
      // A–K маълумот · M/N бошқарув блоки
      // A № · B исм · C/E/G/I сўм (1 млрддан ошиши мумкин) · D/F/H/J доллар
      // · K улуш · M изоҳ · N қиймат (сана-вақт ҳам шу ерда)
      cols: [4, 20.71, 18, 14, 18, 14, 18, 14, 18, 14, 10.71, 3, 30, 21],
      freeze: 2, merge: ["A1:K1"] },
  ]);
}

/* ============== 2c. СОТУВЧИНИНГ EXCEL ҲИСОБОТИ ==============
   ФОРМАТ: «Илхом.xlsx» файли билан бир хил — БИТТА «ҲИСОБОТ» варағи,
   уч блок ёнма-ён:
     1. ОЛИНГАН МАҲСУЛОТЛАР (A–G): № · Номи · Сони · Нархи · Суммаси ·
                                   Олинган сана · Қўшилган сана
     2. ТЎЛОВЛАР            (I–L): Сана · Оплата (сўм) · Курс · Оплата ($)
     3. ЯКУНИЙ ҲИСОБ        (N–R): Қарздорлик · Бошланғич қарз ·
                                   Олинган товар · Оплата · Улуш %
   H ва M — тор ажратгич устунлар (кенглиги 2), асл файлдагидек.

   «Курс» бўш қолдирилади — бот доллар курсини билмайди. Курсни ёзсангиз,
   «Оплата ($)» устуни ўзи ҳисобланади.                                */
async function sotuvchiExcel(env, tgId, opt = {}) {
  const barcha = await kvGet(env, davrlarKey(), []);
  const bqXom = await kvGet(env, "omb:bq", {});
  // Склад файли ҳали йўқ, лекин бошланғич қарз бор — файл БАРИБИР чиқсин (Достон 2026-09-21:
  // бошланғич қарзлар алоҳида ёзилади, биринчи Basko файлидан олдин ҳам Excel керак)
  if (!barcha.length && !Object.keys(bqXom || {}).length) return null;
  const davrlar = opt.davrlar && opt.davrlar.length ? opt.davrlar : barcha;
  const kiritilgan = new Set(davrlar.map((d) => d.key));

  // Керакли ҲАММА блок ва тўлов — БИР ЙЎЛА (kvGetMany изоҳига қаранг).
  // «Улуш %» учун ҳамма сотувчининг блоклари керак — аввал бу 13 × даврлар
  // та алоҳида ўқиш эди ва сотувчининг ЎЗ файлини ҳам буза оларди.
  const hammaId = [...new Set([...hisobotIdlar(barcha, bqXom), Number(tgId)])];
  const kvKalit = [];
  for (const d of barcha) for (const id of hammaId) kvKalit.push(blokKey(d.key, id));
  for (const id of hammaId) kvKalit.push(payKey(id));
  const KV = await kvGetMany(env, kvKalit);
  const kvq = (k, fb) => { const v = KV.get(k); return v === null || v === undefined ? fb : v; };

  // --- Бошланғич қарз: АЙНАН KV даги қиймат, ҳеч нима қўшилмайди.
  //     Файлга кирмаган даврлар товари «Олинган товар» устунига қўшилади
  //     (админ файлидаги қоиданинг айни ўзи — иккови бир хил чиқсин).
  const bosh = son(bqXom[tgId] || 0);
  // Курс — ҳар бир ёзувнинг ЎЗИНИКИ. Бошланғич қарз қайси курсда
  // ёзилган бўлса, ўша курсда доллари ҳисобланади; курс кейин ўзгарса
  // ҳам бу рақам ўзгармайди.
  const kursHoz = await kursOl(env);
  const kurs = son(opt.kurs !== undefined ? opt.kurs
                                          : (kursHoz ? kursHoz.qiymat : 0));
  const bqKurs = son(await kvGet(env, BQ_KURS_KEY, 0)) || kurs;
  const boshD = bqKurs ? bosh / bqKurs : 0;
  let kirmagan = 0, kirmaganD = 0;
  for (const d of barcha) {
    if (kiritilgan.has(d.key)) continue;
    // Сана оралиғидан КЕЙИН бошланган давр — «гача» санасидаги қарзга кирмайди
    // (аввал эски «Сана бўйича ҳисобот» да кейинги ой товари ҳам қўшиларди).
    if (opt.gacha != null && ddmmyyyy(d.davrBoshi) !== null && ddmmyyyy(d.davrBoshi) > opt.gacha) continue;
    const b = blokNorm(kvq(blokKey(d.key, tgId), null));
    if (b) {
      kirmagan += b.summa;
      const dk = son(d.kurs) || kurs;
      if (dk) kirmaganD += b.summa / dk;
    }
  }
  // Сана оралиғидан ОЛДИНГИ товар ва тўлов — админ файлидаги тузатишнинг
  // айни ўзи (у ердаги изоҳга қаранг). Акс ҳолда ойлик файлда сотувчининг
  // қарзи олдинги ойлар ҳисобга олинмай КАМ кўринарди.
  let oldinTol = 0, oldinTolD = 0;
  if (opt.dan != null) {
    for (const d of davrlar) {
      const olingan = ddmmyyyy(d.davrBoshi);
      if (olingan === null || olingan >= opt.dan) continue;
      const b = blokNorm(kvq(blokKey(d.key, tgId), null));
      if (b) {
        kirmagan += b.summa;
        const dk = son(d.kurs) || kurs;
        if (dk) kirmaganD += b.summa / dk;
      }
    }
    for (const p of kvq(payKey(tgId), [])) {
      if (!p || p.holat === "bekor") continue;
      const sana = excelDate(p.vaqt);
      if (sana === null || sana >= opt.dan) continue;
      oldinTol += son(p.summa);
      const pk = son(p.kurs) || kurs;
      if (pk) oldinTolD += son(p.summa) / pk;
    }
  }

  // --- Маҳсулотлар — фақат ШУ сотувчиники, сана оралиғида
  const mahsulotlar = [];
  for (const d of davrlar) {
    const olingan = ddmmyyyy(d.davrBoshi);
    if (!oraliqda(olingan, opt)) continue;
    const b = blokNorm(kvq(blokKey(d.key, tgId), null));
    if (!b) continue;
    const qosh = excelDateTime(d.yuklandi);
    const dKurs = son(d.kurs) || kurs;
    for (const p of b.mahsulotlar) {
      mahsulotlar.push({ nom: String(p.nom ?? ""), soni: son(p.soni),
                         summa: son(p.summa), olingan, qosh, kurs: dKurs });
    }
  }
  // 🔤 Сана 01.09 → 02.09, кейин маҳсулот номи алифбо бўйича (Достон 2026-09-25)
  const ALIFBO = (x, y) => String(x || "").localeCompare(String(y || ""), "ru");
  mahsulotlar.sort((a, b) => (a.olingan || 0) - (b.olingan || 0) || ALIFBO(a.nom, b.nom));

  // Бекор қилинган тўлов кўрсатилмайди: сотувчининг файлида «ҳолати»
  // устуни йўқ, кўрсатилса «тўладим-ку» деб чалкашарди.
  // Тўловлар ҳам эскидан янгига — юқорида 01.09, пастда охиргиси.
  const tolovlar = kvq(payKey(tgId), [])
    .filter((p) => p && p.holat !== "bekor" && oraliqda(excelDate(p.vaqt), opt))
    .sort((a, b) => String(a.vaqt || "").localeCompare(String(b.vaqt || "")));

  // --- Улуш %: шу сотувчининг қарзи БАРЧА сотувчилар қарзига нисбатан.
  //     Бунинг учун ҳамманинг ЖАМИси керак — маҳсулот рўйхати эмас, фақат
  //     блокнинг `summa` си ўқилади, шунинг учун қиммат эмас.
  const hamma = hisobotIdlar(barcha, bqXom);
  let jamiQarz = 0, ozQarz = 0;
  for (const id of hamma) {
    let q = son(bqXom[id] || 0);
    for (const d of barcha) {
      const b = blokNorm(kvq(blokKey(d.key, id), null));
      if (b) q += b.summa;
    }
    for (const p of kvq(payKey(id), [])) {
      if (p && p.holat !== "bekor") q -= son(p.summa);
    }
    jamiQarz += q;
    if (Number(id) === Number(tgId)) ozQarz = q;
  }
  const ulush = jamiQarz === 0 ? 0 : ozQarz / jamiQarz;

  const R0 = 6;                                   // маълумот 6-қатордан
  const rMah = R0 + Math.max(mahsulotlar.length, 1) - 1;
  const rTol = R0 + Math.max(tolovlar.length, 1) - 1;

  const rows = [];
  // Бош сарлавҳа — тўқ кўк бар, оқ ҳарф (асл файлдагидек)
  // Курс катаги — шу варақнинг ўзида, D2. Доллар устунлари шунга
  // қарайди: курсни ўзгартирсангиз, файл ўзи қайта ҳисобланади.
  // D2 — ҲОЗИРГИ курс, маълумот учун. Ҳисоблашни бошқармайди: ҳар бир
  // товар ва тўлов ўз «Курс» устунидаги рақамга бўлинади.
  const dollarQ = (summaKat, kursKat) =>
    `IF(${kursKat}=0,"",${summaKat}/${kursKat})`;

  rows.push([{ v: "Ombor — СОТУВЧИ ҲИСОБОТИ", s: S.S_KATTA }]);
  rows.push([{ v: "Сотувчи:", s: S.S_ISM_L },
             { v: ISM[tgId] || String(tgId), s: S.S_ISM },
             { v: "Курс (1 $ = сўм):", s: S.S_ISM_L },
             { v: kurs || "", s: S.SARIQ_SON },
             { v: "Танлов:", s: S.S_ISM_L },
             { v: opt.izoh || "ҳамма даврлар", s: S.S_MATN }]);
  rows.push([]);
  // Уч блокнинг бари — кўк, яшил, қизил (асл файлдаги ранглар)
  const r4 = new Array(16).fill("");
  r4[0] = { v: "1.  ОЛИНГАН МАҲСУЛОТЛАР", s: S.S_BLOK1 };
  r4[10] = { v: "2.  ТЎЛОВЛАР", s: S.S_BLOK2 };
  // ХАТО ТУЗАТИЛДИ (2026-09-10): бу ёзув бир катак ўнгда — бирлаштирилган
  // соҳанинг ИЧИДА турарди. Excel бирлаштирилган соҳада фақат ЧАП ЮҚОРИ
  // катакни кўрсатади, шунинг учун «3. ҚАРЗДОРЛИК» қизил бари БЎШ
  // кўринарди. Энди P — P4:X4 нинг чап юқори катаги.
  r4[15] = { v: "3.  ҚАРЗДОРЛИК", s: S.S_BLOK3 };
  rows.push(r4);
  rows.push([
    // A–I: маҳсулотлар («Курс» — ўша товар олинган кундаги курс)
    { v: "№", s: S.S_BOSH1 }, { v: "Маҳсулот номи", s: S.S_BOSH1 },
    { v: "Сони", s: S.S_BOSH1 }, { v: "Нархи", s: S.S_BOSH1 },
    { v: "Суммаси", s: S.S_BOSH1 }, { v: "Курс", s: S.S_BOSH1 },
    { v: "Суммаси ($)", s: S.S_BOSH1 },
    { v: "Олинган сана", s: S.S_BOSH1 }, { v: "Қўшилган сана", s: S.S_BOSH1 }, "",
    // K–N: тўловлар («Курс» аллақачон бор эди)
    { v: "Сана", s: S.S_BOSH2 }, { v: "Оплата (сўм)", s: S.S_BOSH2 },
    { v: "Курс", s: S.S_BOSH2 }, { v: "Оплата ($)", s: S.S_BOSH2 }, "",
    // O–X: якуний ҳисоб — ҳар сумма сўмда ва долларда
    { v: "ҚАРЗДОРЛИК", s: S.S_BOSH3 }, { v: "ҚАРЗДОРЛИК ($)", s: S.S_BOSH3 },
    { v: "Бошланғич қарз", s: S.S_BOSH3 }, { v: "Бошланғич қарз ($)", s: S.S_BOSH3 },
    { v: "Олинган товар", s: S.S_BOSH3 }, { v: "Олинган товар ($)", s: S.S_BOSH3 },
    { v: "Оплата", s: S.S_BOSH3 }, { v: "Оплата ($)", s: S.S_BOSH3 },
    { v: "Улуш %", s: S.S_BOSH3 },
  ]);

  const n = Math.max(mahsulotlar.length, tolovlar.length, 1);
  for (let i = 0; i < n; i++) {
    const r = R0 + i;
    // Зебра: тоқ қаторлар очиқ фонда (асл файлда 7, 9, 11 … қатор).
    const z = i % 2 === 1;
    const M1 = z ? S.S_Z1 : S.S_MATN, N1 = z ? S.S_Z1_SON : S.S_SON;
    const D1 = z ? S.S_Z1_SANA : S.S_SANA, V1 = z ? S.S_Z1_VAQT : S.S_VAQT;
    const M2 = z ? S.S_Z2 : S.S_MATN, N2 = z ? S.S_Z2_SON : S.S_SON;
    const D2 = z ? S.S_Z2_SANA : S.S_SANA;
    const m = mahsulotlar[i];
    const chap = m
      ? [{ v: i + 1, s: N1 }, { v: m.nom, s: M1 }, { v: m.soni, s: N1 },
         { f: `IF(C${r}=0,0,E${r}/C${r})`, s: N1 },
         { v: m.summa, s: N1 }, { v: m.kurs, s: N1 },
         { f: dollarQ(`E${r}`, `F${r}`), s: dollar(N1) },
         m.olingan === null ? { v: "", s: M1 } : { v: m.olingan, s: D1 },
         m.qosh === null ? { v: "", s: M1 } : { v: m.qosh, s: V1 }]
      : ["", "", "", "", "", "", "", "", ""];
    const t = tolovlar[i];
    const tSana = t ? excelDate(t.vaqt) : null;
    const orta = t
      ? [tSana === null ? { v: "", s: M2 } : { v: tSana, s: D2 },
         { v: son(t.summa), s: N2 },
         // «Курс» — ШУ ТЎЛОВ қилинган кундаги курс
         { v: son(t.kurs) || kurs, s: N2 },
         { f: dollarQ(`L${r}`, `M${r}`), s: dollar(N2) }]
      : ["", "", "", ""];
    // 3-блок фақат БИРИНЧИ қаторда — бу сотувчининг якуний рақамлари.
    // Қарздорлик — крем фонда, катта қалин рақам билан.
    const ong = i === 0
      ? [{ f: `R${r}+T${r}-V${r}`, s: S.S_KATTA_SON },
         { f: `S${r}+U${r}-W${r}`, s: dollar(S.S_KATTA_SON) },
         { v: bosh, s: S.S_SON },
         { v: Math.round(boshD * 100) / 100, s: dollar(S.S_SON) },
         { f: `SUM(E${R0}:E${rMah})` + (kirmagan ? `+${kirmagan}` : ""),
           s: S.S_SON },
         { f: `SUM(G${R0}:G${rMah})` +
              (kirmaganD ? `+${kirmaganD.toFixed(2)}` : ""), s: dollar(S.S_SON) },
         { f: `SUM(L${R0}:L${rTol})` + (oldinTol ? `+${Math.round(oldinTol)}` : ""),
           s: S.S_SON },
         { f: `SUM(N${R0}:N${rTol})` + (oldinTolD ? `+${oldinTolD.toFixed(2)}` : ""),
           s: dollar(S.S_SON) },
         { v: ulush, s: S.S_FOIZ }]
      : ["", "", "", "", "", "", "", "", ""];
    rows.push([...chap, "", ...orta, "", ...ong]);
  }

  return buildXlsx([{
    name: "ҲИСОБОТ", rows,
    // A–I маҳсулотлар · J ажратгич · K–N тўловлар · O ажратгич · P–X якуний
    cols: [6, 44, 10, 10, 13, 11, 13, 13, 17, 2,
           12, 15, 11, 13, 2,
           15, 14, 15, 14, 15, 14, 13, 13, 10],
    freeze: 5,
    merge: ["A1:X1", "A4:I4", "K4:N4", "P4:X4"],
  }]);
}

/**
 * Шахсий чатдаги матн — Excel учун сана оралиғи кутиляптими?
 * index.js бошқа ишлов берувчилардан ОЛДИН чақиради.
 * @returns {Promise<boolean>} true — хабар «ейилди»
 */
const KST_KEY = (uid) => `omb:kst:${uid}`;

/** «📥 Ойлик ҳисобот» — ойлар рўйхати (тугма ва эски inline тугма учун) */
export async function oylikTanlov(ctx, chatId, uid, access, yil = null, oy = null) {
  if (!isOmborHisobot(uid, access)) return false;   // Мурод ака — фақат ҳисобот
  const kb = await oyKbTayyorla(ctx.env, yil, oy);
  await yubor(ctx, chatId, "📥 <b>Ойлик ҳисобот</b>\n\nЙил ва ойни танланг 👇",
              { reply_markup: kb });
  return true;
}

/** Ой клавиатурасини йиғади. Йил/ой берилмаса — БУГУНГИ йил-ой. */
async function oyKbTayyorla(env, yil, oy, rejim = "asosiy") {
  const barcha = await kvGet(env, davrlarKey(), []);
  const oraliq = yillarOraliq(barcha);
  const bugun = new Date(Date.now() + 5 * 3600e3);              // Тошкент
  const y0 = Number(yil) || bugun.getUTCFullYear();
  const o0 = Number(oy) || bugun.getUTCMonth() + 1;
  const y = Math.min(Math.max(y0, oraliq.eng), oraliq.oxir);
  const o = Math.min(Math.max(o0, 1), 12);
  return oyKb(y, o, oraliq, new Set(oylarRoyxati(barcha)), rejim);
}

/** Шу ой оралиғида умуман маълумот борми? (товар ёки тўлов)
 *  Бўш ойга файл берилса, унда фақат ҲОЗИРГИ қарзлар кўриниб,
 *  «ўша ойда шунча қарз бўлган» деб нотўғри тушунилиши мумкин эди.   */
export async function oydaMalumot(env, dan, gacha) {
  const barcha = await kvGet(env, davrlarKey(), []);
  for (const d of barcha) {
    const s0 = ddmmyyyy(d.davrBoshi);
    if (s0 !== null && s0 >= dan && s0 <= gacha) return true;
  }
  const bq = await kvGet(env, "omb:bq", {});
  for (const id of hisobotIdlar(barcha, bq)) {
    const tolovlar = await kvGet(env, payKey(id), []);
    for (const p of tolovlar) {
      if (!p || p.holat === "bekor") continue;
      const s1 = excelDate(p.vaqt);
      if (s1 !== null && s1 >= dan && s1 <= gacha) return true;
    }
  }
  return false;
}

/** «💱 Курсни танлаш» — админ янги рақамни ёзишини кутамиз (10 дақиқа) */
export async function kursSora(ctx, chatId, uid, access) {
  const { env } = ctx;
  if (!isOmborAdmin(uid, access)) return false;
  if (env.ACCESS_KV) {
    // Бошқа ярим қолган жараён (сотувчилар панели) бекор бўлади — иккаласи
    // бирга турса, курс ўрнига ёзилган рақам қарз бўлиб кетарди ва ҳоказо.
    await env.ACCESS_KV.delete(`omb:spx:${uid}`);
    await env.ACCESS_KV.put(KST_KEY(uid), "1", { expirationTtl: 600 });
  }
  // Қисқа ва тушунарли: ҳозирги курс + «янги курсни ёзинг». Аввал бу
  // ерда ким қачон ўзгартиргани ва намуна рақам ҳам бор эди — Достон
  // 2026-09-10 да «ортиқча ёзувларни олиб ташла, чалғитяпти» деди.
  const k = await kursOl(env);
  // Курс ҳали «💱» тугмасидан белгиланмаган бўлса ҳам, /qarz_bosh даги
  // курс бор бўлиши мумкин — админ нимадан бошлаётганини кўрсин.
  const bqk = son(await kvGet(env, BQ_KURS_KEY, 0));
  const hozirgi = k ? son(k.qiymat) : bqk;
  await yubor(ctx, chatId, [
    hozirgi > 0 ? `💱 Ҳозирги курс: <b>${pul(hozirgi)}</b> сўм`
                : "💱 Ҳозирги курс: <b>белгиланмаган</b>",
    "",
    "Янги курсни ёзинг 👇",
  ].join("\n"));
  return true;
}

/**
 * Шахсий чатдаги матн — курс кутиляптими?
 * index.js бошқа ишлов берувчилардан ОЛДИН чақиради.
 */
export async function omborKursMatn(ctx, message, access) {
  const { env, tg, token } = ctx;
  const uid = message.from && message.from.id;
  if (!uid || !message.chat || message.chat.type !== "private") return false;
  if (!env.ACCESS_KV) return false;
  if (!(await env.ACCESS_KV.get(KST_KEY(uid)))) return false;
  if (!isOmborAdmin(uid, access)) return false;

  const matn = (message.text || "").trim();
  if (!matn) return false;
  // Тугма ёки буйруқ («/zaxira») босилса — кутишни бекор қиламиз, хабарни
  // ўзимиз емаймиз (аввал «/zaxira» «курсни тушунмадим» деб ютиларди)
  if ((ctx.isMainButton && ctx.isMainButton(matn)) || matn.startsWith("/")) {
    await env.ACCESS_KV.delete(KST_KEY(uid));
    return false;
  }

  // «12 050», «12,050», «12050» — ҳаммаси 12 050 (аввал «12,050» 12.05 бўлиб рад этиларди)
  const q = son(matn.replace(/[^\d.,]/g, ""));
  if (!(q >= KURS_MIN && q <= KURS_MAX)) {
    await tg(token, "sendMessage", { chat_id: message.chat.id,
      text: `Курсни тушунмадим. ${KURS_MIN} дан ${KURS_MAX} гача рақам ёзинг.\n` +
            "Масалан: 12050" });
    return true;
  }
  await env.ACCESS_KV.delete(KST_KEY(uid));
  await kursQoy(env, q, uid);
  // Бошланғич қарзлар (жадвалда ДОЛЛАРДА) ҳали ёзилмаган бўлса — БИРИНЧИ
  // танланган курс билан ўзи ёзилади. Админ «/qarz_bosh» деган буйруқни
  // билиши шарт эмас (Достон 2026-09-11: «админни чалкаштирма»).
  // Кейинги курс ўзгаришлари уларга ТЕГМАЙДИ — ўша курсда қолади.
  if (!(await kvGet(env, BQ_KURS_KEY, null))) {
    await boshlangichYoz(env, q);
  }
  // Админнинг вазифаси шу ерда тугайди: рақамни ёзди — тамом. Бундан
  // кейинги ҳамма иш (юкланадиган файллар, қабул қилинадиган тўловлар)
  // ЯНГИ курс билан давом этади. Эски ёзувлар ўз курсида қолади.
  await yubor(ctx, message.chat.id, `✅ <b>Курс янгиланди: ${pul(q)}</b>`);
  return true;
}

export async function omborExcelSana(ctx, message, access) {
  const { env, tg, token } = ctx;
  const uid = message.from && message.from.id;
  if (!uid || !message.chat || message.chat.type !== "private") return false;
  if (!env.ACCESS_KV) return false;

  let holat = null;
  try {
    const raw = await env.ACCESS_KV.get(XRNG_KEY(uid));
    holat = raw ? JSON.parse(raw) : null;
  } catch { holat = null; }
  if (!holat) return false;

  const matn = (message.text || "").trim();
  if (!matn) return false;
  // Тугма босилса — оралиқни кутишни бекор қиламиз, хабарни ўзимиз емаймиз
  if (ctx.isMainButton && ctx.isMainButton(matn)) {
    await env.ACCESS_KV.delete(XRNG_KEY(uid));
    return false;
  }

  const oraliq = sanaOraliq(matn);
  if (!oraliq) {
    await tg(token, "sendMessage", { chat_id: message.chat.id,
      text: "Санани тушунмадим. Мана шундай ёзинг:\n01.08.2026  01.09.2026" });
    return true;
  }
  await env.ACCESS_KV.delete(XRNG_KEY(uid));

  const sid = Number(holat.sid) || 0;
  if (sid && !isOmborAdmin(uid, access) && Number(sid) !== Number(uid)) return true;

  // Оралиққа тушадиган даврлар: даври бошланиши шу оралиқда бўлганлар.
  // Ҳеч нарса тушмаса ҳам файл берилади — жадвал бўш, лекин қарз кўринади.
  const barcha = await kvGet(env, davrlarKey(), []);
  const davrlar = barcha.filter((d) => {
    const s2 = ddmmyyyy(d.davrBoshi);
    return s2 !== null && s2 >= oraliq.dan && s2 <= oraliq.gacha;
  });
  const izoh = `${sanaMatn(oraliq.dan)} – ${sanaMatn(oraliq.gacha)}`;
  await excelYubor(ctx, message.chat.id, uid, {
    davrlar: davrlar.length ? davrlar : barcha,
    izoh, sotuvchi: sid || null, dan: oraliq.dan, gacha: oraliq.gacha,
  });
  return true;
}

/** Excel файлни Telegram'га юбориш */
/* ---------- Excel диапазонлари ----------
   Тугмалар орқали танланади. «Аниқ давр» ҳам бор — рўйхатдаги ҳар бир
   ҳисобот алоҳида тугма. Ундан ташқари файл ичида B3/B4 санаси қўлда
   ўзгартирилади: истаган оралиқ (мас. 01.09 – 03.09) шу ерда олинади. */
const DIAPAZON = {
  oxirgi: { nom: "Омбор ҳисоботим", kun: 0 },
  h7:     { nom: "Сўнгги 7 кун",   kun: 7 },
  k30:    { nom: "Сўнгги 30 кун",  kun: 30 },
  all:    { nom: "Ҳамма даврлар",  kun: null },
};

/** Танловга кўра даврлар рўйхатини қайтаради (энг янгиси биринчи) */
function davrTanla(davrlar, tanlov) {
  if (tanlov.startsWith("d:")) {
    const k = tanlov.slice(2);
    return { davrlar: davrlar.filter((d) => d.key === k),
             izoh: (davrlar.find((d) => d.key === k) || {}).davr || k };
  }
  const d = DIAPAZON[tanlov] || DIAPAZON.all;
  if (d.kun === null) return { davrlar, izoh: d.nom };
  if (d.kun === 0) return { davrlar: davrlar.slice(0, 1), izoh: d.nom };
  const chek = excelDate(new Date()) - d.kun;
  const t = davrlar.filter((x) => {
    const s = ddmmyyyy(x.davrBoshi);
    return s !== null && s >= chek;
  });
  // Оралиқда ҳеч нарса бўлмаса — бўш файл бермай, энг сўнггисини берамиз
  return t.length ? { davrlar: t, izoh: d.nom }
                  : { davrlar: davrlar.slice(0, 1), izoh: d.nom + " (топилмади — охиргиси)" };
}

/** Файл номи учун хавфсиз матн */
function fayltoza(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// Mini App «📥 Excel» тугмаси ҳам шу орқали юборади (ботнинг чатига)
export async function excelYubor(ctx, chatId, uid, opt = {}) {
  const { env, tg, token } = ctx;
  const kutish = await tg(token, "sendMessage", { chat_id: chatId, text: "⏳ Excel тайёрланмоқда…" });
  try {
    const bytes = await omborExcel(env, opt);
    if (!bytes) {
      await tg(token, "sendMessage", { chat_id: chatId, text: T.bosh });
      return;
    }
    const bugun = new Date().toISOString().slice(0, 10).split("-").reverse().join(".");
    // Файл номи ЭНГ ҚИСҚА кўринишда: исм ва «Омбор ҳисоботи», холос.
    // Сана ҳам, танланган давр ҳам номда ёзилмайди — иккови ҳам изоҳда
    // ва файл ичида бор. «.xlsx» эса ЎЧИРИЛМАЙДИ: усиз компьютер файлни
    // Excel билан очмайди.
    const nom = fayltoza(opt.sotuvchi
      ? `${ISM[opt.sotuvchi] || opt.sotuvchi} — Омбор ҳисоботи`
      : (opt.oy ? `Бигант омбор — ${opt.izoh}` : "Бигант омбор ҳисоботи")) + ".xlsx";
    if (!yozishMumkin("sendDocument", { chat_id: chatId })) return false;   // 🚫 src/taqiq.js (Абдумажид)
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    // Исм ёзилмайди. Кимники экани файл НОМИДА турибди («Абдувохид —
    // Омбор ҳисоботи — 10.09.2026.xlsx»), файл ичида ҳам «Сотувчи: …».
    // СОТУВЧИГА — изоҳсиз, фақат файлнинг ўзи. Аввал «📊 Омбор ҳисоботи /
    // 🗓 ҳамма даврлар» деб турарди; Достон 2026-09-10 да олиб ташлашни
    // сўради. Кимники ва қайси давр экани файл НОМИДА ҳам, ичида ҳам бор.
    // АДМИНГА — қисқа йўриқнома қолди, чунки унда варақ тўртта.
    // АДМИНГА — фақат сарлавҳа ва давр (варақлар рўйхати ва сариқ саналар
    // ҳақидаги йўриқнома 2026-09-11 да Достон сўрови билан олиб ташланди).
    fd.append("caption", opt.sotuvchi ? "" :
      `📊 <b>Омбор ҳисоботи</b>\n🗓 ${opt.izoh || "ҳамма даврлар"}`);
    fd.append("parse_mode", "HTML");
    fd.append("document",
      new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      nom);
    // 429 (жуда кўп сўров) келса — Telegram айтган вақтча кутиб, яна
    // уринамиз (index.js даги tg() билан бир хил қоида, кутиш ≤ 5 с).
    let j = null;
    for (let urinish = 0; urinish <= 2; urinish++) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: fd });
      j = await r.json();
      if (!(j && j.ok === false && j.error_code === 429) || urinish === 2) break;
      const s = Math.min(Math.max(Number(j.parameters && j.parameters.retry_after) || 1, 1), 5);
      await new Promise((res) => setTimeout(res, s * 1000));
    }
    if (!j.ok) throw new Error(JSON.stringify(j).slice(0, 200));
  } catch (err) {
    console.error("excelYubor:", err);
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "❌ Excel яратилмади: " + String(err.message || err).slice(0, 200) });
  } finally {
    if (kutish && kutish.result) {
      await tg(token, "deleteMessage", { chat_id: chatId, message_id: kutish.result.message_id });
    }
  }
}

/* ======================== 3. ГУРУҲ: ПЛАТЁЖКА ======================== */

/** Гуруҳга расм ташланганда. true = ишланди */
export async function omborRasm(ctx, message, access) {
  const { env, tg, token } = ctx;
  const uid = message.from && message.from.id;
  const chatId = message.chat.id;
  // Платёжка РАСМ ёки ФАЙЛ (банк иловасидан PDF, «файл сифатида» юборилган
  // расм) бўлиши мумкин. Аввал фақат расм кўриларди — PDF'га бот ЖИМ турарди.
  const hujjat = message.document;
  const hujjatChekmi = hujjat && /^(image\/|application\/pdf)/i.test(hujjat.mime_type || "");
  if ((!message.photo || !message.photo.length) && !hujjatChekmi) return false;
  if (!omborGuruhmi(env, chatId)) return false;
  if (!isBuxgalter(uid) && !isOmborAdmin(uid, access)) return false;   // фақат бухгалтер
  const pdfmi = !(message.photo && message.photo.length) && /pdf/i.test(hujjat.mime_type || "");

  // ЭНГ КАТТА ўлчам (2026-09-15). Аввал ~800px ли ўртачаси олинарди (CPU
  // тежаш учун) — кичрайган расмда ИНН каби майда рақамлар хиралашиб,
  // жонли синовда «7000000010» → «7000000009» деб ўқилди. Paid тарифда CPU
  // етарли, аниқлик муҳимроқ.
  const photo = message.photo && message.photo.length
    ? message.photo[message.photo.length - 1]
    : { file_id: hujjat.file_id, file_unique_id: hujjat.file_unique_id };
  // Эски ўлчам id'си — деплойдан олдин ёзилган чек қайта ташланса ҳам
  // такрор деб танилсин
  const eskiOlcham = message.photo && message.photo.length > 2
    ? message.photo[message.photo.length - 2].file_unique_id : null;

  // Такрор чек?
  const bor = await kvGet(env, `omb:chek:${photo.file_unique_id}`, null)
    || (eskiOlcham ? await kvGet(env, `omb:chek:${eskiOlcham}`, null) : null);
  if (bor) {
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "⚠️ Бу чек аллақачон ёзилган — такрор ёзилмади.",
      reply_to_message_id: message.message_id });
    return true;
  }

  // ── КИМНИНГ ТЎЛОВИ? Боғланиш ФАҚАТ АНИҚ бўлиши керак.
  //
  //    Гуруҳ жонли: сотувчи «#ombor VERO-SMART 10 mln» деб ёзгач, орада
  //    бошқалар гаплашади, бухгалтер эса БОШҚА сотувчининг чекини ташлаб
  //    юборади. Аввал бот суммага қараб ТАХМИН қиларди — иккита сотувчида
  //    бир хил сумма бўлса ёки орада бошқа чек тушса, тўлов БЕГОНАНИНГ
  //    қарзидан айирилиб кетиши мумкин эди.
  //
  //    Шунинг учун тахмин ЙЎҚ. Икки йўл қолди:
  //      1) бухгалтер айнан ўша сотувчининг сўровига REPLY қилади —
  //         боғланиш шубҳасиз;
  //      2) чек изоҳида «#ombor» ва сотувчининг исми ёзилади (қўлда).
  //    Иккови ҳам бўлмаса — бот жим.
  let target = null, manba = "", repSorov = null;
  const rep = message.reply_to_message;

  // 1) Бот ГУРУҲГА эълон қилган «Пул чиқариш» сўровига reply — энг аниқ йўл.
  //    Сўровда фирма, сумма ва ИНН аллақачон ёзилган: ҳаммасини солиштирамиз.
  if (rep) {
    repSorov = await sorovByGuruhMsg(env, rep.message_id);
    if (repSorov) { target = repSorov.sid; manba = "сўровнома №" + repSorov.id; }
  }

  // 1а) Ботнинг сўровга тегишли БОШҚА хабарига reply — эслатма («⏳ ҳали
  //     ёпилмади»), «🚨 ТЕКШИРУВ ЎТМАДИ» огоҳлантириши ва ҳ.к. Одамлар айнан
  //     шуларга жавоб қилиб чек ташлайди — аввал бот уларга ЖИМ турарди.
  let bogliq = null;
  if (!target && rep && rep.from && rep.from.is_bot) {
    const bogId = await kvGet(env, GM_KEY(rep.message_id), null);
    if (bogId) {
      bogliq = (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === bogId) || null;
      if (bogliq && !bogliq.band && !bogliq.kutilmoqda && Date.now() - bogliq.vaqt < SOROV_OCHIQ_UMR) {
        repSorov = bogliq;
        target = bogliq.sid;
        manba = "сўровнома №" + bogliq.id;
      }
    }
  }

  // 1б) Ботнинг эълонига reply, лекин сўров ОЧИҚ ЭМАС (тўланган, бекор
  //     қилинган ёки муддати ўтган). Аввал бот бу ерда ЖИМ турарди —
  //     бухгалтер тўлов ёзилди деб ўйлаб қоларди.
  if (!target && rep && rep.from && rep.from.is_bot &&
      (bogliq || /омборга пул чиқармоқчи|пул чиқариш сўрови/i.test(String(rep.text || rep.caption || "")))) {
    const it = bogliq || (await kvGet(env, SOROV_KEY, [])).find((x) =>
      x.guruhMsg && Number(x.guruhMsg) === Number(rep.message_id));
    const tolangan = it && it.band && it.holati !== "bekor" && it.holati !== "muddat";
    // Муддати ўтган, лекин cron ҳали ёпишга улгурмаган сўров ҳам бор:
    // уни «тасдиқланмаган» деб айтиш нотўғри сабаб бўларди.
    const muddatOtgan = Boolean(it) && !it.band &&
      Date.now() - it.vaqt >= SOROV_OCHIQ_UMR;
    const sabab = !it ? "эскириб кетган"
      : it.holati === "bekor" ? "бекор қилинган"
      : it.holati === "muddat" ? "7 кунда тўланмагани учун ёпилган"
      : tolangan ? "аллақачон тўланган"
      : muddatOtgan ? "7 кунда тўланмагани учун ёпилган"
      : "ҳали гуруҳга тасдиқланмаган";
    const m = String(rep.text || rep.caption || "").match(/💸\s*(.+?)\s+(?:омборга пул чиқармоқчи|пул чиқариш сўрови)/i);
    const kim = it ? (ISM[it.sid] || String(it.sid)) : (m ? m[1] : "сотувчи");
    // Тўланган сўровга «қайта ташланг» деб маслаҳат БЕРИЛМАЙДИ — у иккинчи
    // марта ёзилишига олиб келарди.
    await yubor(ctx, chatId, [
      `⚠️ <b>Тўлов ёзилмади</b> — бу сўров ${sabab}.`,
      ...(tolangan ? [] : [
        `<i>Тўлов ҳақиқатан керак бўлса — изоҳига «#ombor ${esc(kim)}» ёзиб қайта ташланг.</i>`]),
    ].join("\n"), { reply_to_message_id: message.message_id });
    return true;
  }

  // 2) Сотувчининг гуруҳдаги «#ombor …» хабарига reply
  if (!target && rep && rep.from && isOmborSotuvchi(rep.from.id)) {
    const sid = rep.from.id;
    // Reply қилинган хабар ОМБОР сўровими? Тег ўша хабарда бўлиши мумкин,
    // ёки хабар сўровни ёзиб қўйган бўлса — id си бўйича топилади.
    // Сўровни ҳар доим id бўйича топамиз — тег ўша хабарда бўлса ҳам.
    // Аввал тег бор бўлса қидирилмасди, шунинг учун бухгалтер АНИҚ фаол
    // сўровга reply қилганда ҳам, ўша сотувчининг бошқа (тасдиқ кутаётган)
    // сўрови тўловни тўсиб қўярди.
    const tegli = OMBOR_TAG.test(sorovMatni(rep));
    repSorov = await sorovByMsg(env, sid, rep.message_id);
    if (tegli || repSorov) { target = sid; manba = "reply"; }
  }

  const izoh = message.caption || "";
  if (!target && OMBOR_TAG.test(izoh)) {
    const t = ismdanId(izoh);
    if (t) { target = t; manba = "изоҳ"; }
  }

  // ── ЎЗ ҚАРЗИНИ ЎЗИ КАМАЙТИРА ОЛМАЙДИ. Админлар орасида сотувчилар ҳам бор
  //    (Сардор ака, Достон). Бухгалтер бўлмаган сотувчи-админ ташлаган расм
  //    ўзига ёки номаълум одамга тегишли бўлса — бу ТЎЛОВ эмас, унинг ўз
  //    СЎРОВИ (счёт расми): ишни omborSorov давом эттиради.
  if (!isBuxgalter(uid) && isOmborSotuvchi(uid) &&
      (!target || Number(target) === Number(uid))) {
    return false;
  }

  // ── Омборга тегишли белги топилмадими — бот ЖИМ.
  //    Сотувчилар шу гуруҳда бошқа тўловларни ҳам қиладилар; уларга
  //    аралашсак, керак бўлмаган хабар билан гуруҳни шовқинга кўмардик
  //    ва — энг хавфлиси — бегона тўловни омбор қарзидан айирардик.
  //    (AI'дан ОЛДИН текширилади — бегона расмларга кунлик текин AI лимити
  //    сарфланмасин.)
  if (!target && !OMBOR_TAG.test(izoh)) return false;

  let ai = null;
  if (!pdfmi) {
    try {
      ai = await chekOqi(env, token, photo.file_id);
    } catch (err) {
      console.error("chekOqi:", err);
    }
  }
  // PDF платёжка: AI расм ўқийди, PDF'ни эмас — матнини оламиз (пастда
  // сўровдаги сумма шу матнда бор-йўқлиги текширилади).
  let pdfMatnS = "";
  if (pdfmi) {
    try { pdfMatnS = String((await pdfMatn(ctx, hujjat)) || ""); } catch { pdfMatnS = ""; }
  }

  // Сумма: изоҳдан (одам ёзгани — «11mln» ҳам тушунилади) ёки чекдан (AI).
  // МУСБАТ бўлиши ШАРТ: AI манфий ёки нолни қайтариб қолса, у қарзни
  // КАМАЙТИРИШ ўрнига ОШИРИБ юборарди. Ундай ҳолда «ўқилмади» деб
  // ҳисоблаймиз.
  const izohSumma = matndanSumma(izoh);
  const xomSumma = izohSumma || (ai ? son(ai.summa) : 0);
  let summa = xomSumma > 0 ? xomSumma : 0;

  // Изоҳда «#ombor» бор, лекин сотувчи аниқ эмас — қўлда танлатамиз.
  if (!target && !summa) {
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "🧾 Сумма ўқилмади. Платёжкани изоҳига суммани ёзиб қайта ташланг (масалан: 11 mln).",
      reply_to_message_id: message.message_id });
    return true;
  }
  if (!target) {
    await tg(token, "sendMessage", { chat_id: chatId,
      text: `🧾 Платёжка: ${pul(summa)} сўм\n❓ Қайси сотувчи учун? Танланг:`,
      reply_to_message_id: message.message_id,
      reply_markup: sotuvchiTanlashKbPay(summa, photo.file_unique_id) });
    return true;
  }

  // ── Тасдиқ кутаётган такрорий сўровми? Уни жимгина ўтказиб юборсак,
  //    бухгалтер тўлов ёзилди деб ўйлаб қоларди.
  // Бухгалтер АНИҚ фаол сўровга reply қилган бўлса, ўша сотувчининг
  // бошқа (тасдиқ кутаётган) сўрови буни тўсиб қўймаслиги керак.
  const kutayotgan = (repSorov && !repSorov.kutilmoqda) || !summa
    ? null
    : await sorovKutayotgan(env, summa, target);
  if (kutayotgan) {
    await yubor(ctx, chatId, [
      "⏳ <b>ТЎЛОВ ТАСДИҚ КУТМОҚДА</b>",
      "",
      `👤 <b>${esc(ISM[target] || target)}</b>`,
      `💵 <b>${pul(summa)} сўм</b>`,
      "",
      "<i>Бу фирмага яқинда иккинчи марта сўров юборилган, шунинг учун "
        + "сотувчидан тасдиқ сўралган.</i>",
      "",
      "Сотувчи «✅ Ҳа, бу алоҳида тўлов» тугмасини боссин — шундан сўнг "
        + "чекни қайта ташланг.",
    ].join("\n"), { reply_to_message_id: message.message_id });
    return true;
  }

  // ── ФИРМАНИ ТЕКШИРИШ. Сумма тўғри бўлгани ҳали пул ТЎҒРИ ФИРМАга
  //    кетганини билдирмайди — бухгалтер адашиб бошқасига ўтказиши мумкин.
  //
  //    Матнни ҳамма жойдан йиғамиз, чунки сотувчи сўровни хоҳлаган
  //    кўринишда ёзади:
  //      • бухгалтер reply қилган хабар (матн/изоҳ/файл номи);
  //      • ўша хабарнинг ота-хабари (PDF ташлаб, тагига «11 mln» ёзилса);
  //      • эсланган сўров — унда PDF ичидан ўқилган матн ҳам бор.
  //    Telegram reply занжирини фақат БИР қадам беради, шунинг учун
  //    сақланган сўров матни ҳам қўшилади — ундаги контекст тўлиқроқ.
  // Бухгалтер тўғридан-тўғри счёт PDF'ига reply қилган бўлса — уни ҳам ўқиймиз
  await pdfliQil(ctx, rep);

  // Сақланган сўров ФАҚАТ ўша сотувчиники бўлса ишлатилади. Акс ҳолда
  // (сумма бошқа сотувчининг сўровига мос келиб қолса) фирма текшируви
  // БЕГОНА матн билан солиштирилиб, нотўғри хулоса чиқарарди.
  let saqlangan = repSorov || (summa ? await sorovTopSotuvchi(env, target, summa) : null);

  // Сотувчининг очиқ сўровлари — чек уланмаса тугма қилиб кўрсатилади
  const ochiq = await sorovlarOchiq(env, target);

  // ── ЧЕКНИ ҚАЙТА ЎҚИШ: фақат суммага қаратилган ҚАТЪИЙ сўров билан
  //    (рақам «сумма прописью» билан солиштирилади). AI баъзан нолни
  //    қўшиб/тушириб юборади — ҳақиқий синовда чекдаги 11 100 000
  //    «110 000 000» деб ўқилди. Икки ҳолатда қайта ўқиймиз:
  //      А) сўров топилди, лекин чекдаги сумма ундан фарқ қиляпти;
  //      Б) сумма ҳеч бир очиқ сўровга ТУШМАДИ — аввал бундай чек
  //         текширилмасдан ёзиб юбориларди, чунки солиштирадиган сўров
  //         топилмасди.
  //    Иккинчи ўқиш сўровга мос тушсагина ишлатилади; акс ҳолда текширув
  //    ўз ўрнида қолади ва тўлов ЁЗИЛМАЙ, бухгалтердан тасдиқ сўралади.
  // Қайта ўқиш натижаси сақланади — пастда ИНН/сана шубҳали бўлса ҳам
  // ўша ишлатилади (чек иккинчи марта юборилмайди).
  let aiQayta = null;
  // Рақамда ёки сўзда ўқилгани сўровга АЙНАН тенг бўлса — ўша олинади
  if (!pdfmi && !izohSumma && saqlangan && ai && !summaMos(summa, sorovQoldiq(saqlangan))) {
    const t = aiMosSumma(ai, sorovQoldiq(saqlangan));
    if (t) { summa = t; ai.summa = t; }
  }
  // Достон 2026-09-25: «bir martadayoq qilma, 2-3 marta o'qi — buning uchun
  // ai bor, hira chek tashlanmaydi». Сумма мос келмаса ЯНА ўқиймиз: жами
  // 3 ўқиш (1 та асосий + 2 та қайта). Биронтаси сўровдаги суммага АЙНАН
  // тушса — ўша олинади ва ёлғон огоҳлантириш чиқмайди.
  if (!pdfmi && !izohSumma && summa > 0 &&
      (saqlangan ? !summaMos(summa, sorovQoldiq(saqlangan)) : ochiq.length > 0)) {
    for (let urinish = 0; urinish < 2; urinish++) {
      let ai2 = null;
      try { ai2 = await chekOqi(env, token, photo.file_id, true); }
      catch (err) { console.error("chekOqi(qayta " + (urinish + 1) + "):", err); }
      if (!ai2) break;
      aiQayta = ai2;
      const nishon = saqlangan
        ? (aiMosSumma(ai2, sorovQoldiq(saqlangan)) ? saqlangan : null)
        : ochiq.find((x) => aiMosSumma(ai2, sorovQoldiq(x))) || null;
      if (!nishon) continue;                    // мос тушмади — яна бир марта
      const s2 = sorovQoldiq(nishon);           // қайта ўқиш АЙНАН шу суммани кўрди
      ai2.summa = s2;
      summa = s2;
      saqlangan = nishon;
      if (ai) { ai.summa = s2; if (!ai.kim && ai2.kim) ai.kim = ai2.kim; }
      else ai = ai2;
      break;
    }
  }

  const sorovMatn = [sorovMatni(rep), saqlangan && saqlangan.matn]
    .filter(Boolean).join("  ·  ");

  // Сўровдан ҚОЛГАН сумма — қисман тўлов бўлган бўлса, ундан айирилади
  const qolgan = saqlangan ? sorovQoldiq(saqlangan) : 0;
  // PDF: матнида сўровдаги (қолган) сумма ёзилган бўлса — ўша сумма
  if (!summa && pdfmi && qolgan && matndanSummalar(pdfMatnS).some((v) => Math.abs(v - qolgan) < 1)) {
    summa = qolgan;
  }
  if (!summa && !saqlangan) {
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "🧾 Сумма ўқилмади. Платёжкани изоҳига суммани ёзиб қайта ташланг (масалан: 11 mln).",
      reply_to_message_id: message.message_id });
    return true;
  }

  let firma = firmaMos(sorovMatn, ai && ai.kim);
  // ── ИНН ФАҚАТ PDF'ли СЎРОВДА текширилади (Достон 2026-09-15): «сотувчи ўз
  //    қўли билан фирма ва суммани ёзса — ИНН текширилмасин; PDF ташласа ва
  //    PDF ичида ИНН бўлса — текширилсин». Солиштириш сўровнинг ИНН'и билан
  //    (матндаги бошқа 9 хонали сонлар аралашмайди).
  const pdfliSorov = INN_TEKSHIR && Boolean(saqlangan && saqlangan.fayl &&
    (saqlangan.fayl.pdf || /\.pdf$/i.test(String(saqlangan.fayl.nom || ""))));
  const sorovInn = pdfliSorov ? innTop(saqlangan.inn) : "";
  let inn = sorovInn ? innMos(sorovInn, ai && ai.inn) : "bilib_bolmadi";
  if (pdfmi) {
    // PDF матнида тўловчи ҳам, олувчи ҳам бор. Матн ЎҚИЛГАН бўлса-ю,
    // сўровдаги фирма номи у ерда УМУМАН учрамаса — бу бошқа тўлов.
    // Матн чиқмаса (сканер қилинган PDF) — хулоса қилмаймиз.
    const pdfMatnBor = pdfMatnS.replace(/\s+/g, "").length > 40;
    firma = firmaMos(sorovMatn, pdfMatnS) === "mos" ? "mos"
      : (pdfMatnBor && firmaSozlari(sorovMatn).length ? "mos_emas" : "bilib_bolmadi");
    inn = sorovInn && innlar(pdfMatnS).has(sorovInn) ? "mos" : "bilib_bolmadi";
  }

  // ── НОЛ ХАТОСИ: 10 / 100 / 1000 баробар фарқ + фирма мос + сўзда
  //    ўқилмаган → бу OCR хатоси. Сўровдаги сумма ёзилади.
  let nolXato = 0;
  // ДИҚҚАТ: фақат AI сумманинг КАТТА ўқилиши тузатилади (summa > qolgan).
  // Кичик ўқилса — бу ҲАҚИҚИЙ ҚИСМАН ТЎЛОВ бўлиши мумкин (сотувчи 100 млн
  // сўради, бухгалтер 10 млн ўтказди) ва уни «нол хатоси» деб тузатсак,
  // қарздан 10 баробар кўп айирилиб кетарди.
  if (!pdfmi && !izohSumma && summa > qolgan && qolgan > 0 && firma === "mos" &&
      !(ai && son(ai.sozda) > 0)) {
    const nisbat = summa / qolgan;
    for (const k of [10, 100, 1000]) {
      if (Math.abs(nisbat - k) < 0.02) {         // айнан к баробар
        nolXato = summa;
        console.log("нол хатоси: AI " + summa + ", сўровда " + qolgan);
        summa = qolgan;
        if (ai) ai.summa = qolgan;
        break;
      }
    }
  }

  // ── СУММА мос келяптими? «Пул чиқариш» сўровида сотувчи суммани АНИҚ
  //    ёзган — чекдагиси ундан фарқ қилса, бошқа тўлов бўлиши мумкин.
  //    2026-09-15 дан 1 СЎМ фарқ ҳам кечирилмайди (аввал 1% кечириларди) —
  //    чек юқорида қайта ўқилган; барибир фарқ бўлса бухгалтер тугмадан
  //    АНИҚ суммани танлайди.
  const oqilmadi = !summa;
  const kam = summa > 0 && qolgan > 0 && Math.round(qolgan) - Math.round(summa) > 0;  // қисман тўловми?
  const kop = summa > 0 && qolgan > 0 && Math.round(summa) - Math.round(qolgan) > 0;  // ортиқ ёки нотўғри ўқилган
  // Достон 2026-09-25 (аниқлаштирди): «sotuvchi so'rovidagi puldan KAMROQ
  // yoki KO'PROQ bo'lsa — buxgalter va superadmin uchun chekni bekor qilish
  // bo'lsin». Сотувчи суммани ЎЗИ сўровда ўзгартиради; чекдаги сумма ўша
  // сўровникига АЙНАН тенг бўлиши керак. Тенг бўлмаса — ёзилмайди.
  const summaFarq = kam || kop;
  const pid = saqlangan ? `|${saqlangan.id}` : "";

  // ── ЧЕК СЎРОВГА УЛАНМАДИ: сумма ҳам, фирма ҳам солиштириладиган нарса
  //    йўқ. Бундай чек жимгина ёзилса, AI хато ўқиган сумма ҳам «тўғри
  //    ёзилди» бўлиб кўринарди. Энди бухгалтердан тасдиқ сўралади.
  //    Изоҳга суммани ОДАМ ёзган бўлса — у ўзи тасдиқлаган, ёзаверамиз.
  const bogsiz = !saqlangan && !izohSumma;

  // ── ТЎЛОВЧИ БИЗМИ? Платёжка бошқа фирма номидан юборилган бўлса, у
  //    пул бизнинг ҳисобдан кетмаган — қарздан айириш нотўғри бўларди.
  //    Фақат env.OMBOR_FIRMA белгиланганда ишлайди (белгиланмаса — жим).
  const tolovchiBegona = Boolean(env.OMBOR_FIRMA) && ai && ai.tolovchi &&
    firmaMos(String(env.OMBOR_FIRMA), String(ai.tolovchi)) === "mos_emas";

  // ── ПЛАТЁЖКА САНАСИ СЎРОВ САНАСИДАН ОЛДИНМИ? (Достон 2026-09-25:
  //    «sotuvchi so'roviga buxgalter eski chek tashlasa — chek sanasi va
  //     so'rov sanasi ko'rinsin, keyin "chek eski" yozuvi bo'lsin»).
  //    Сўровдан ОЛДИН тўланган чек — бу бошқа тўлов, шу сўровга тегишли эмас.
  const kunFarq = ai ? sanaFarqi(ai.sana) : null;
  // Сўров неча кун олдин юборилган (Тошкент куни бўйича)
  const sorovKunFarq = saqlangan && son(saqlangan.vaqt)
    ? Math.floor((Date.now() - son(saqlangan.vaqt)) / 86400000) : null;
  const eskiRoi = (k) => k !== null && (k < -2 || (sorovKunFarq !== null && k > sorovKunFarq));
  let eskiChek = ESKI_CHEK_TEKSHIR && eskiRoi(kunFarq);
  const sorovSanaMatn = saqlangan && son(saqlangan.vaqt)
    ? new Date(son(saqlangan.vaqt) + 5 * 3600e3).toISOString().slice(0, 10).split("-").reverse().join(".")
    : "";

  // ── ИНН ёки САНА ШУБҲАЛИ, фирма эса МОС (2026-09-14, Gemini синови).
  //    Хира/қийшиқ расмда модел кичкина ёзувни — ИНН ва санани — ЎЗИДАН
  //    ТОПИБ ёзади («ҳеч қачон тахмин қилма» кўрсатмасига ҳам қарамай;
  //    синовда 3 тадан 3 таси нотўғри эди). Сумма ва фирма номи эса катта
  //    ёзилгани учун тўғри ўқилди.
  //    Шунинг учун чек ҚАЙТА ўқилади ва иккала ўқиш солиштирилади:
  //      • иккинчиси сўровдагига мос → мос;
  //      • иккала ўқиш БИР ХИЛ бошқа рақам → ҳақиқатан бошқа → огоҳлантириш
  //        (номи ўхшаш, ИНН бошқа фирмага пул кетган бўлиши мумкин);
  //      • ўқишлар бир-биридан ФАРҚ қилади → расм ўқилмайди → бу текширув
  //        ҳисобга олинмайди (ёлғон огоҳлантириш чиқмасин).
  // ── PDF'ли СЎРОВДА ИНН БОР, чекдан эса ИНН ЎҚИЛМАДИ (2026-09-15, Достон
  //    қоидаси: «PDF ташласа — ИНН, фирма, сумма»). Аввал бундай чек фақат
  //    фирма + сумма билан ёзиларди. Энди чек бир марта ҚАЙТА ўқилади.
  const pdfInnKerak = Boolean(sorovInn);
  if (pdfInnKerak && !pdfmi && ai && !innTop(ai.inn)) {
    if (!aiQayta) {
      try { aiQayta = await chekOqi(env, token, photo.file_id, true); }
      catch (err) { console.error("chekOqi(ИНН йўқ):", err); }
    }
    if (aiQayta && innTop(aiQayta.inn)) {
      ai.inn = aiQayta.inn;
      inn = innMos(sorovInn, ai.inn);
    }
  }

  if (!pdfmi && firma === "mos" && ai && (inn === "mos_emas" || eskiChek)) {
    if (!aiQayta) {
      try { aiQayta = await chekOqi(env, token, photo.file_id, true); }
      catch (err) { console.error("chekOqi(ИНН/сана):", err); }
    }
    if (inn === "mos_emas") {
      const inn2 = aiQayta && aiQayta.inn;
      if (inn2 && innMos(sorovInn, inn2) === "mos") inn = "mos";
      else if (!inn2 || inn2 !== ai.inn) {
        console.log("ИНН ўқилмади: " + ai.inn + " / " + (inn2 || "—"));
        inn = "bilib_bolmadi";
      }
    }
    if (eskiChek) {
      const k2 = aiQayta ? sanaFarqi(aiQayta.sana) : null;
      const eski2 = eskiRoi(k2);
      if (!eski2 || String(aiQayta.sana) !== String(ai.sana)) {
        console.log("сана ўқилмади: " + ai.sana + " / " + ((aiQayta && aiQayta.sana) || "—"));
        eskiChek = false;
      }
    }
  }

  // ── ИНН'да БИТТА РАҚАМ фарқи (2026-09-15 жонли синов): чекда аниқ
  //    «7000000010» турарди, GLM «7000000009» деб ўқиди — фирма ва сумма
  //    мос бўлса ҳам «ИНН мос эмас» чиқди. Фирма МОС + сумма сўмигача ТЕНГ
  //    + ИНН'нинг фақат 1 рақами фарқ → бу ўқиш хатоси, ИНН мос деб
  //    ҳисобланади. (Бошқа фирма бўлиши учун номи ҳам, суммаси ҳам, ИНН'и
  //    ҳам деярли бир хил бўлиши керак — амалда бўлмайди.)
  if (inn === "mos_emas" && firma === "mos" && ai && qolgan > 0 && summaMos(summa, qolgan)) {
    const birFarq = (a, b) => a.length === b.length && [...a].filter((c, i) => c !== b[i]).length === 1;
    const oqilgan = [innTop(ai.inn), innTop(aiQayta && aiQayta.inn)].filter(Boolean);
    const sorovdagi = [sorovInn].filter(Boolean).find((x) => oqilgan.some((o) => birFarq(o, x)));
    if (sorovdagi) {
      console.log("ИНН 1 рақам хато ўқилди: " + oqilgan.join(" / ") + " → " + sorovdagi);
      ai.innOqilgan = ai.inn;
      ai.inn = sorovdagi;
      inn = "mos";
    }
  }

  // ── ФИРМА ЎҚИЛМАДИ: чекдан олувчи номи чиқмади (ёки AI ишламади).
  //    Достон қоидаси — фирма + сумма шарт. Аввал бундай чек фақат сумма
  //    билан ёзиларди. ИНН АНИҚ мос бўлса — ИНН фирмани аниқ билдиради, ёзилади.
  //    Бухгалтер суммани изоҳга ЎЗИ ёзган бўлса — бу унинг тасдиғи (олдинги
  //    қоида), бу икки текширув фақат AI ўқиган чекка қўлланади.
  const firmaOqilmadi = Boolean(saqlangan) && !izohSumma && firma === "bilib_bolmadi" && inn !== "mos";
  // PDF'ли сўровда ИНН бор, чекдан эса икки ўқишда ҳам ИНН чиқмади
  const innOqilmadi = pdfInnKerak && !izohSumma && inn === "bilib_bolmadi";

  // Бирор текширув ЙИҚИЛСА — тўлов ёзилмайди, бухгалтердан тасдиқ сўралади.
  if (oqilmadi || firma === "mos_emas" || inn === "mos_emas" || summaFarq ||
      bogsiz || eskiChek || tolovchiBegona || firmaOqilmadi || innOqilmadi) {
    const sabab = [];
    if (firmaOqilmadi) sabab.push("🏢 <b>Чекда фирма номи ўқилмади</b>");
    if (innOqilmadi) sabab.push("🔢 <b>Чекда ИНН ўқилмади</b> — сўровда ИНН бор (PDF)");
    if (bogsiz) sabab.push(ochiq.length
      ? "🔗 <b>Чек очиқ сўровга тушмади</b>"
      : "🔗 <b>Сўров топилмади</b> — солиштириб бўлмади");
    if (oqilmadi) sabab.push("🧾 <b>Чекдаги сумма ўқилмади</b>");
    if (firma === "mos_emas") {
      // Достон 2026-09-24: «So'rovda Firma — … / To'lovda boshqa — …»
      sabab.push("🏢 <b>Фирма мос эмас</b>");
      if (saqlangan && saqlangan.firma) sabab.push(`     Сўровда: <b>${esc(qisqa(firmaChiroyli(saqlangan.firma), 30))}</b>`);
      if (ai && ai.kim) sabab.push(`     Тўловда: <b>${esc(qisqa(firmaChiroyli(String(ai.kim)), 30))}</b>`);
    }
    if (inn === "mos_emas") sabab.push("🔢 <b>ИНН мос эмас</b>");
    if (kop) sabab.push("💵 <b>Сумма мос эмас</b>");
    if (kam) sabab.push("💵 <b>Чекда сўровдагидан КАМ</b> — қисман тўловми?");
    // Достон 2026-09-15: «chek eski degan habar chiqsin»
    if (eskiChek) {
      const k = sanaFarqi(ai.sana);
      // Достон 2026-09-25: аввал сўров ва чек саналари кўринсин, кейин «чек эски»
      if (sorovSanaMatn) sabab.push(`     Сўров санаси: <b>${esc(sorovSanaMatn)}</b>`);
      sabab.push(`     Чек санаси: <b>${esc(String(ai.sana))}</b>`);
      sabab.push(k !== null && k < 0 ? "📅 <b>Чек санаси келажакда</b>" : "📅 <b>Чек эски</b>");
    }
    if (tolovchiBegona) sabab.push(`🏦 <b>Тўловчи бошқа фирма</b> — ${esc(qisqa(String(ai.tolovchi), 30))}`);
    const jadval = [];
    jadval.push(bogsiz && ochiq.length ? "ОЧИҚ СЎРОВЛАР:" : "Сўровда:");
    if (bogsiz) {
      // Чек уланмади — бухгалтер солиштириши учун очиқ сўровлар кўрсатилади
      if (!ochiq.length) jadval.push("  очиқ сўров йўқ");
      for (const x of ochiq.slice(0, 3))
        jadval.push("  " + qisqa(firmaChiroyli(x.firma || x.matn || "сўров"), W - 16)
          + " — " + pul(sorovQoldiq(x)));
    } else if (saqlangan && saqlangan.firma)
      jadval.push("  " + qisqa(firmaChiroyli(saqlangan.firma), W - 2));
    else jadval.push("  " + qisqa(sorovMatn.trim(), W - 2));
    if (saqlangan) {
      jadval.push("  " + pul(son(saqlangan.summa)) + " сўм");
      if (son(saqlangan.tolangan)) jadval.push("  тўланди " + pul(son(saqlangan.tolangan)) + ", қолди " + pul(qolgan));
    }
    const sInn = sorovInn;
    if (sInn) jadval.push("  ИНН " + sInn);
    jadval.push("");
    jadval.push("Тўловда:");
    // Достон 2026-09-25: «ptichka yoki x chiqsin» — қайси қатор мос, қайси
    // қатор мос эмаслиги бир қарашда кўринсин.
    const belgi = (holati) => (holati === true ? "✅ " : holati === false ? "❌ " : "  ");
    jadval.push(belgi(firma === "mos" ? true : firma === "mos_emas" ? false : null)
      + qisqa(String((ai && ai.kim) || (pdfmi ? "PDF" : "—")), W - 4));
    jadval.push(belgi(summa ? (saqlangan ? !summaFarq && !kam : null) : false)
      + (summa ? pul(summa) + " сўм" : "сумма ўқилмади"));
    if (ai && ai.inn) jadval.push(belgi(inn === "mos" ? true : inn === "mos_emas" ? false : null) + "ИНН " + ai.inn);

    // sId: undefined — эсланган сўров, null — сўровсиз, id — ўша сўров
    const tugma = (s, izohT, sId) => [{ text: `✅ ${pul(s)} сўм ёзилсин (${izohT})`,
      callback_data: `omb|p|${target}|${Math.round(s)}|${photo.file_unique_id}`
        + (sId === undefined ? pid : (sId ? `|${sId}` : "")) }];
    const qatorlar = [];
    if (bogsiz) {
      // Чек қайси сўровга тегишли — бухгалтер танлайди. Ҳар тугмада ўша
      // сўровнинг АНИҚ (қолган) суммаси: AI хато ўқиган сон ёзилмайди.
      for (const x of ochiq.slice(0, 3))
        qatorlar.push(tugma(sorovQoldiq(x), qisqa(firmaChiroyli(x.firma || "сўров"), 18), x.id));
      qatorlar.push(tugma(summa, ochiq.length ? "чекдан ўқилгани, сўровсиз" : "сўровсиз", null));
    } else if (oqilmadi) {
      qatorlar.push(tugma(qolgan, "сўровдаги"));
    } else if (kam) {
      // 2026-09-11 ҳақиқий синов: пул икки қисмда ўтказилса ҳар бир чек «мос эмас»
      // бўларди. Энди қисман тўлов ёзилади, сўров қолган сумма билан очиқ туради.
      qatorlar.push(tugma(summa, `қисман, қолади ${pul(qolgan - summa)}`));
      qatorlar.push(tugma(qolgan, "сўровдаги"));
    } else if (kop) {
      // СУММА мос келмаса — ҳар бир тугмада АНИҚ сумма. AI чекдаги 11 100 000
      // ни 110 000 000 деб ўқиган эди; «барибир ёзилсин» 110 млн'ни ёзиб юборарди.
      qatorlar.push(tugma(qolgan, "сўровдаги"));
      qatorlar.push(tugma(summa, "чекдан ўқилгани"));
    } else {
      qatorlar.push([{ text: "✅ Текширдим, барибир ёзилсин",
        callback_data: `omb|p|${target}|${Math.round(summa)}|${photo.file_unique_id}${pid}` }]);
    }
    // Бу тугма фақат ШУ ЧЕКНИ рад этади — сўров очиқ қолади.
    qatorlar.push([{ text: "❌ Бу чек ёзилмасин", callback_data: "omb|no" }]);

    const w = await yubor(ctx, chatId, [
      // Достон 2026-09-11: исм сарлавҳанинг ўзида, «👤 Сотувчи:» қатори йўқ
      `🚨 <b>Тўловда хатолик бор — ${esc(ISM[target] || target)}</b>`,
      ...sabab,
      "",
      blok(jadval.join("\n")),
      "",
      // Достон 2026-09-15: «Тўлов ЁЗИЛМАДИ» олиб ташлансин — сарлавҳанинг
      // ўзи («ТЕКШИРУВ ЎТМАДИ») етарли, қолгани қолсин
      bogsiz
        ? (ochiq.length
            ? "<i>Чек қайси сўровга тегишли — тугмадан танланг.</i>"
            : "<i>Сумма тўғри бўлса — тугмани босинг.</i>")
        : oqilmadi || summaFarq
        ? "<i>Тўғри суммани тугмадан танланг ёки изоҳига ёзиб қайта ташланг.</i>"
        : "<i>Чек тўғри бўлса — пастдаги тугмани босинг.</i>",
    ].join("\n"), { reply_to_message_id: message.message_id, reply_markup: { inline_keyboard: qatorlar } });
    // Бухгалтер ШУ огоҳлантиришга reply қилиб янги чек ташласа — сўровга уланади
    if (saqlangan && w && w.result) await gmBogla(env, w.result.message_id, saqlangan.id);
    if (saqlangan) await sorovChekHolat(env, saqlangan.id, "tekshir");
    return true;                       // ЁЗИЛМАДИ — тасдиқ кутилади
  }


  if (nolXato && ai) ai.nolXato = nolXato;
  // Фирма МОС бўлса — гуруҳ хабарида AI ўқигани («Azlyagradstroy») эмас,
  // сўровдаги ТЎҒРИ ном кўринсин (Достон: «go'yo men noto'g'ri yozgandek»)
  if (firma === "mos" && ai && saqlangan && saqlangan.firma) {
    ai.kimOqilgan = ai.kim;
    ai.kim = saqlangan.firma;
  }
  const tolovId = await tolovYoz(ctx, chatId, message, target, summa, photo.file_unique_id,
                                 manba, ai, uid, firma, !(saqlangan && saqlangan.manba === "app"));
  // Сўров — ФАҚАТ шу сотувчиники. Тўлов унга қўшилади; тўлиқ тўланса ёпилади,
  // қисман бўлса «қолди: …» деб очиқ туради.
  if (saqlangan && tolovId) await sorovTolov(ctx, saqlangan.id, tolovId, summa);
  return true;
}

/* Изоҳдаги исм → сотувчи. ФАҚАТ БУТУН СЎЗ бўйича ва фақат СОТУВЧИЛАР ичида.
   Аввал «матн ичида бор-йўқми» деб қидирарди: «Дилшодбек» Дилшодга,
   «Сардор/Абдувохид» Абдувохидга, «Барно» (бухгалтер) Барнога тушарди —
   тўлов БЕГОНАНИНГ қарзидан айириларди. Икки хил сотувчи топилса — тахмин
   қилинмайди, null (бот сотувчини тугма билан танлатади).
   Ўзбекча қўшимчалар («Дилшодга», «Алишернинг») ҳам тушунилади.      */
const ISM_QOSHIMCHA = /^(га|ка|қа|ни|нинг|нг|дан|да|ники|ларга|лар|ga|ni|ning|dan|da)$/;
export function ismdanId(text) {
  const sozlar = String(text || "").split(/[\s,.;:!?()«»"'#]+/).map(normIsm).filter(Boolean);
  if (!sozlar.length) return null;
  const nomzod = [];                                        // [узунлик, id]
  const tekshir = (nom, id) => {
    const n = normIsm(nom);
    if (n.length < 3) return;
    const qism = String(nom).trim().split(/\s+/).length;    // «Хусниддинов Рамзиддин» — 2 сўз
    for (let i = 0; i + qism <= sozlar.length; i++) {
      const bolak = sozlar.slice(i, i + qism).join("");
      if (bolak === n || (bolak.startsWith(n) && ISM_QOSHIMCHA.test(bolak.slice(n.length)))) {
        nomzod.push([n.length, Number(id)]);
      }
    }
  };
  for (const [nom, id] of Object.entries(SKLAD_MAP)) tekshir(nom, id);
  for (const id of new Set(Object.values(SKLAD_MAP))) if (ISM[id]) tekshir(ISM[id], id);
  // Изоҳда икки хил сотувчи бўлса («Илхом, Алишер …») — тахмин йўқ
  const idlar = new Set(nomzod.map((x) => x[1]));
  return idlar.size === 1 ? [...idlar][0] : null;
}

function sotuvchiTanlashKbPay(summa, chek) {
  const ids = [...new Set(Object.values(SKLAD_MAP))];
  const rows = [];
  for (let i = 0; i < ids.length; i += 2) {
    const r = [{ text: ISM[ids[i]] || String(ids[i]), callback_data: `omb|p|${ids[i]}|${Math.round(summa)}|${chek}` }];
    if (ids[i + 1]) r.push({ text: ISM[ids[i + 1]] || String(ids[i + 1]),
                             callback_data: `omb|p|${ids[i + 1]}|${Math.round(summa)}|${chek}` });
    rows.push(r);
  }
  return { inline_keyboard: rows };
}

// `kim` — тўловни киритган ОДАМ (бухгалтер). Callback орқали келганда
// query.message.from бот бўлади, шунинг учун уни алоҳида параметр қилиб
// узатамиз — акс ҳолда аудитда нотўғри одам ёзилиб қоларди.
export async function tolovYoz(ctx, chatId, message, tgId, summa, chekUid, manba, ai, kim,
                         firma = "bilib_bolmadi", sotuvchigaXabar = true) {
  const { env, tg, token } = ctx;
  // ── ОХИРГИ ҲИМОЯ: бу ерга фақат мусбат, оқилона сумма ва ҳақиқий
  //    сотувчи ўтади. Юқорида текширилган бўлса ҳам, келажакда янги
  //    йўл қўшилса пул шу ердан ўтади.
  const sonSumma = son(summa);
  if (!isOmborSotuvchi(tgId) || !Number.isFinite(sonSumma) ||
      sonSumma <= 0 || sonSumma > TOLOV_MAX) {
    console.error("tolovYoz рад этилди:", tgId, summa);
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "⚠️ <b>Тўлов ёзилмади</b> — сумма ёки сотувчи нотўғри.",
      parse_mode: "HTML" }).catch(() => {});
    return null;
  }
  summa = sonSumma;
  const m = await sotuvchiMalumot(env, tgId);
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  // Курс шу ерда ҳам муҳрланади — тўлов қилинган кундаги курс.
  const kursHozir = await kursOl(env);
  const yozuv = {
    id, vaqt: new Date().toISOString(), summa,
    kim: kim || (message.from && message.from.id) || null,
    chek: chekUid, holat: "faol", manba,
    izoh: ai && ai.bank ? ai.bank : "",
    xabar: message.message_id,
    kurs: kursHozir ? son(kursHozir.qiymat) : 0,
  };
  // Пойгасиз: бир вақтда иккита тўлов келса ҳам иккаласи сақланади.
  // Лекин БИТТА чек (ёки битта кард-сўров) ИККИ МАРТА ёзилмайди: тугма
  // тез икки марта босилса, Telegram иккита сўров юборади — аввал иккаласи
  // ҳам «ҳали ёзилмаган» деб кўриб, қарздан икки марта айирарди.
  const shuChek = (x) => x.chek === chekUid && x.holat !== "bekor";
  await kvRoyxatYoz(env, payKey(tgId),
    (joriy) => (joriy.some((x) => x.id === id || shuChek(x)) ? joriy : joriy.concat([yozuv])),
    (joriy) => joriy.some((x) => x.id === id || shuChek(x)));
  const golib = (await kvGet(env, payKey(tgId), [])).find(shuChek);
  if (golib && golib.id !== id) {
    console.warn("tolovYoz: бу чек аллақачон ёзилган", chekUid, golib.id);
    return false;
  }
  // Ёзув сақланмади (KV бир неча марта рад этди) — «қабул қилинди» ДЕМАЙМИЗ
  // ва чекни «ишлатилган» деб белгиламаймиз, акс ҳолда уни қайта ташлаб
  // бўлмасди, тўлов эса ҳеч қаерда йўқ бўларди.
  if (!golib) {
    console.error("tolovYoz: тўлов сақланмади", tgId, chekUid);
    await yubor(ctx, chatId, "❌ Тўлов сақланмади — бир оздан сўнг қайта ташланг.",
                { reply_to_message_id: message.message_id }).catch(() => {});
    return false;
  }
  await kvPut(env, `omb:chek:${chekUid}`, id);

  const yangiQarz = m.qarz - summa;
  const H = holat(yangiQarz);
  // ЭСЛАТМА: «🆔 xxx (аниқланиш: reply)» қатори олиб ташланди — фойдаланувчига
  // керак эмас эди. `id` ва `manba` ёзувда сақланади (аудит + «Бекор қилиш»
  // тугмаси callback'и), reply орқали аниқлаш эса ўзгаришсиз ишлайверади.

  // Ҳисоб-китоб — иккала хабарда ҳам бир хил, моношрифт карта.
  // ДИҚҚАТ: тасдиқ хабарида ҚАРЗ/ҲАҚДОРЛИК КЎРСАТИЛМАЙДИ.
  // Гуруҳда бир нечта одам бор — сотувчининг қарзи ҳаммага кўриниб
  // турмаслиги керак. Сотувчи ўз қарзини «📊 Ҳисоботим» тугмасидан кўради.

  // --- Гуруҳга (бухгалтерга) тасдиқ
  // Сарлавҳанинг ЎЗИДА сотувчи исми — гуруҳда кимнинг тўлови экани
  // дарҳол кўринади ва пастда яна такрорланмайди.
  // «Кардан минус» тасдиғи — масъулнинг шахсий чатига, қисқа кўринишда
  // (Достон 2026-09-10 да айнан шуни сўради). Қолган ҳолатларда — гуруҳга,
  // фирма текшируви натижаси билан.
  const G = firma === "kard"
    ? [`✅ <b>${esc(ISM[tgId] || tgId)}дан омборга тўлов қабул қилинди</b>`, ""]
    : [`✅ <b>${esc(ISM[tgId] || tgId)}дан омборга тўлов қабул қилинди</b>`, ""];
  // Фирма текшируви натижаси кўриниб турсин — бухгалтер нимага ишонаётганини билсин
  if (firma === "mos") {
    // PDF платёжкада AI йўқ — фирма номи бўш «<b></b>» чиқмасин
    G.push(ai && ai.kim
      ? `🏢 Фирма: <b>${esc(qisqa(firmaChiroyli(String(ai.kim)), 30))}</b>`
      : "🏢 Фирма: <i>сўровга мос</i>");
    // ИНН текширилмайди (INN_TEKSHIR=false) — фақат чекдан ўқилгани кўрсатилади
    if (ai && ai.inn) G.push(`🔢 ИНН: <code>${esc(ai.inn)}</code>`);
  } else if (firma === "kard") {
    // Изоҳ қатори олиб ташланди — сарлавҳанинг ўзи етарли.
  } else if (firma === "qolda") {
    G.push("🏢 <i>Бухгалтер тасдиқлади</i>");
  } else if (firma === "bilib_bolmadi") {
    G.push("🏢 <i>Фирма солиштирилмади (сўровда ёки чекда ном йўқ)</i>");
  }
  G.push(`💵 Сумма: <b>${pul(summa)} сўм</b>`);
  if (ai && son(ai.nolXato) > 0)
    G.push(`<i>AI чекни «${pul(son(ai.nolXato))}» деб ўқиди — нол хатоси, `
      + "сўровдаги сумма ёзилди.</i>");
  // «⚠️ Қарздан ортиқча — … ҳақдорлик» қатори ОЛИБ ТАШЛАНДИ (Достон 2026-09-25):
  // «firma nomi, inn, summa, tasdiqlanganlik haqidagi habar ko'rinsin xolos,
  //  "haqdor" degan narsalar umuman ko'rinmasin». Ҳақдорлик рақами ҳисоботда бор.
  await yubor(ctx, chatId, G.join("\n"), {
    reply_to_message_id: message.message_id,
    reply_markup: { inline_keyboard: [[{ text: "↩️ Бекор қилиш", callback_data: `omb|rev|${tgId}|${id}` }]] },
  });

  // --- Сотувчига шахсий хабар (қарз рақамларисиз — улар «Ҳисоботим»да).
  // Аввал «Ҳисобингизга X сўм тушди» дерди — пул сотувчига эмас, фирмага
  // кетади, «Қарзимдан минус»да эса умуман пул йўқ. Энди бўлганини айтади.
  const S2 = firma === "kard"
    ? ["✅ <b>Қарздан минус тасдиқланди</b>"]      // тугма номи «Қарзимдан минус» қолади
    : ["✅ <b>Тўловингиз ёзилди</b>",
       ...(firma === "mos" && ai && ai.kim ? [`🏢 ${esc(qisqa(firmaChiroyli(String(ai.kim)), 30))}`] : [])];
  S2.push(`💵 <b>${pul(summa)} сўм</b> қарзингиздан айирилди`);
  // Mini App'дан юборилган сўров — жавоб ИЛОВАДА кўринади, TG'га хабар йўқ (Достон 2026-09-21)
  if (sotuvchigaXabar) await yubor(ctx, tgId, S2.join("\n")).catch(() => {});
  return id;
}

/* --------- платёжкани AI билан ўқиш (Cloudflare Workers AI) ---------
   API калит КЕРАК ЭМАС — модел Cloudflare'нинг ўзида ишлайди ([ai] binding).
   Anthropic API калити 2026-09-08 да олиб ташланди.

   МУҲИМ ҚОИДА: моделга РАҚАМ ҲИСОБЛАТМАЙМИЗ. У фақат КЎЧИРАДИ («20 000 000.00»
   деб ёзилган бўлса, шундоқ қайтаради), сонга айлантиришни summaParse() қилади.
   Сабаби (2026-09-08 ҳақиқий платёжкада топилди): «summa» ни рақам қилиб
   сўраганда модел «20 000 000.00» ни 20 000 000 000 деб қайтарарди — 1000
   баравар кўп, ва ҲАР САФАР (10/10). Кўчириш + ўзимиз ҳисоблаш = 46/46 тўғри.

   Модел танлови (2026-09-08 тести):
     mistral-small-3.1-24b  →  танланди; ҳақиқий платёжка 10/10, синтетик
                               (тоза + «телефонда олингандек» бузилган) 36/36.
     llava-1.5-7b           →  11 000 000 ни 10 000 деб ўқиди — ЯРОҚСИЗ.
     llama-3.2-11b-vision   →  Meta лицензиясини қабул қилиш талаб қилинади.
     gemma-4 / qwen3.8      →  «reasoning» моделлар, JSON'гача етиб бормайди.
     glm-5.3-flash          →  фақат Paid планда.
   2026-09-15: Paid тариф олинди → ҲОЗИРГИ МОДЕЛ glm-5.3-flash. Mistral
   ҳақиқий чекда «11 100 000 → 110 000 000» деб адашгани учун олиб ташланди.
   Синов: тоза чек 3/3 тўғри; хира чекда ИНН ўйлаб топилиши мумкин (иккинчи
   ўқиш билан солиштирилади), бир хира чекда сумма 21 650 000 → 21 550 000.

   Жавоб барибир МАСЛАҲАТ: изоҳдаги сумма устун туради (қаранг omborRasm) ва
   ҳар бир тўловда «↩️ Бекор қилиш» тугмаси бор.                          */

/** «20 000 000.00» → 20000000. Охиридаги .00/,00 — тийин, ташланади. */
function summaParse(raw) {
  // Руслан 2026-10-10: «13 600 000-00», «13600000=00», «… сўм 00 тийин» ҳам
  // тийин — аввал ҳаммаси бир сонга қўшилиб 1 360 000 000 бўларди.
  let s = String(raw == null ? "" : raw)
    .replace(/\d{1,2}\s*(тийин|тийн|tiyin|tiyn|коп(еек|ейка|ейки)?|kop)\.?/gi, " ")
    .replace(/(\d)\s*[-=]\s*\d{1,2}(?=\D*$)/, "$1")
    .replace(/[^\d.,]/g, "");
  s = s.replace(/[.,](\d{1,2})$/, "");     // тийин
  s = s.replace(/\D/g, "");                // қолган ажратгичлар
  return s ? parseInt(s, 10) : 0;
}

/* 📄 PDF ИЧИДАГИ РАСМ (Руслан 2026-09-24). Стройгороднинг PDF акти ҳам,
 * айрим платёжкалар ҳам — сканер эмас, СКРИНШОТ: ичида битта тайёр JPEG
 * турибди (/Filter /DCTDecode), матн умуман йўқ. Демак SOI (FFD8FF) дан
 * EOI (FFD9) гача кесиб олсак, оддий расмдек ўқилаверади — кутубхона
 * керак эмас. Ичида расм бўлмаса (матнли PDF) — null. */
/* 📏 РАСМНИНГ ЭНИ — БАЙТЛАРДАН (Руслан 2026-09-25).
 * Нега керак: 600px чегараси Telegram берган `width` га таянади, у эса ФАҚАТ
 * расмда бор. ФАЙЛ (ҳужжат) қилиб ташланса ўлчам умуман текширилмасди.
 * Жонли синовда (ҳақиқий модел, 09-chek-KICHIK-480px.jpg — 26 800 000 лик
 * чекнинг 480px нусхаси) модел уни «20 000 000» деб, ишончи эса «HIGH» деб
 * қайтарди — ишонч дарвозаси бундай хатони ТУТМАЙДИ. Демак ўлчамни ўзимиз
 * ўлчашимиз керак: байтлар аллақачон юкланган, кутубхона керак эмас.
 * JPEG: SOF маркерлари (FFC0…FFCF, C4/C8/CC дан ташқари) — эни +7 офсетда.
 * PNG: IHDR — эни 16-байтдан. Танилмаса 0 (текширув ўтказиб юборилади). */
export function rasmEni(buf) {
  try {
    if (!buf || buf.length < 24) return 0;
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
      return (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
    // JPEG
    if (!(buf[0] === 0xff && buf[1] === 0xd8)) return 0;
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const uz = (buf[i + 2] << 8) | buf[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return (buf[i + 7] << 8) | buf[i + 8];
      if (uz < 2) return 0;
      i += 2 + uz;
    }
  } catch { /* танилмади */ }
  return 0;
}

export function pdfdanJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0x25 || buf[1] !== 0x50) return null;   // «%P» — PDF эмас
  let bosh = -1;
  for (let i = 0; i + 2 < buf.length; i++)
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) { bosh = i; break; }
  if (bosh < 0) return null;
  let oxir = -1;
  for (let i = buf.length - 2; i > bosh; i--)
    if (buf[i] === 0xff && buf[i + 1] === 0xd9) { oxir = i + 2; break; }
  if (oxir <= bosh || oxir - bosh < 1024) return null;                     // жуда кичик — расм эмас
  return buf.subarray(bosh, oxir);
}

export async function chekOqi(env, token, fileId, qayta = false) {
  // Асосий — GLM-5.3 Flash (Workers AI); Gemini калити бўлса — фақат заҳира
  if (!geminiBor(env) && !env.AI) return null;
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)).json();
  if (!info.ok) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
  if (!res.ok) return null;
  const xom = new Uint8Array(await res.arrayBuffer());
  /* PDF келса — ичидаги расм олинади (скриншот-PDF шундай ўқилади).
   * Ичида расм бўлмаса ХОМ байтлар қолади: Бигант омбор оқими аввал ҳам
   * шундай ишларди, уни ўзгартирмаймиз (Руслан 2026-09-24). */
  const ichi = pdfdanJpeg(xom);
  const buf = ichi || xom;

  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
  }
  const media = !ichi && /\.png$/i.test(info.result.file_path) ? "image/png" : "image/jpeg";
  const olchamEni = rasmEni(buf);        // 📏 ҳақиқий эни — файл ҳолида ҳам билинсин
  const b64 = btoa(bin);                 // бир марта ҳисобланади — CPU тежалади

  // ИККИНЧИ ЎҚИШ (qayta): фақат СУММАга қаратилган, «сумма прописью» билан
  // солиштиришни талаб қиладиган қатъий сўров. Ҳақиқий синовда модел
  // 11 100 000 ни 110 000 000 деб ўқиган эди — биринчи ўқиш сўровдаги
  // сумма билан мос келмаса, чек ШУ сўров билан ҚАЙТА ўқилади.
  const QATIY =
    "This is a bank payment order from Uzbekistan. Find the PAYMENT AMOUNT.\n" +
    "1) Read the digits next to the amount field. 2) Read the amount written in WORDS.\n" +
    "3) If digits and words disagree, TRUST THE WORDS and report that number in digits.\n" +
    "Count the digit groups carefully: 11 100 000 is eleven million one hundred thousand,\n" +
    "it is NOT 110 000 000. Do not add or drop zeros.\n" +
    'Reply with ONLY JSON: {"summa_raw": "<digits exactly as printed>", ' +
    '"summa_sozda": "<amount in words as printed>", "kim": "<receiver company>", ' +
    // сана ҳам сўралади — ИНН/сана шубҳаси бўлса иккала ўқиш солиштирилади
    '"inn": "<receiver INN, 9 digits>", "sana": "<Дата документа, dd.mm.yyyy — NOT a contract date from Назначение платежа>", "bank": ""}\n' +
    'NEVER GUESS: if a field is not clearly legible, return "" for it.';

  const prompt = qayta ? QATIY :
    "This is a bank payment order (\u043f\u043b\u0430\u0442\u0451\u0436\u043a\u0430) from Uzbekistan. " +
    "Transcribe it. Reply with ONLY a JSON object, no other text:\n" +
    '{"summa_raw": "<the payment amount EXACTLY as printed, copy every character ' +
    'including spaces and any decimal part, e.g. 20 000 000.00>", ' +
    /* 📅 «Дата документа» (Руслан 2026-10-23): модел «Назначение платежа» ичидаги шартнома санасини
     * («оплата по дог №1006 от 30.09.2026г») олиб, 13.10 ва 20.10 даги чекларни 30.09 га ёзган эди. */
    '"sana": "<the date in the field Дата документа, dd.mm.yyyy. NEVER take the date from Назначение платежа — ' +
    'there «дог №… от 30.09.2026» is the CONTRACT date, not the payment date>", "kim": "<receiver name / company>", ' +
    '"tolovchi": "<the PAYER name / company — the one sending the money>", ' +
    '"summa_sozda": "<the amount written in WORDS, exactly as printed ' +
    '(«сумма прописью» / «сўзда»), e.g. бир юз миллион сўм>", ' +
    '"inn": "<the RECEIVER\'s INN / STIR / ИНН — exactly 9 digits, ' +
    'the one next to the receiver, NOT the payer>", ' +
    '"bank": "<bank or payment system>", ' +
    /* 🧾 ҲУЖЖАТ ТУРИ ва ИШОНЧ (Руслан 2026-09-24). Иккаласи ҳам ЎША сўровда
     * сўралади — қўшимча AI чақириғи йўқ. Синовда: 12 чек + 6 акт = 18/18
     * тўғри аниқланди; 320px да модел «low» деб рост айтди. */
    /* 🔑 НОМЕР ДОКУМЕНТА (Руслан 2026-09-25): платёжканинг ЎЗ рақами — банк
     * берган ягона калит. Такрорни сумма+сана билан эмас, шу рақам билан
     * аниқлаймиз: бир хил сумма уч кун ичида икки марта тўланса ҳам адашмайди. */
    '"raqam": "<Номер документа — the payment order\'s own number, digits only, e.g. 20112>", ' +
    '"hujjat": "<payment_order | reconciliation_act | delivery_note | other>", ' +
    '"ishonch": "<high | medium | low — how sure you are that the AMOUNT is read correctly>"}\n' +
    "payment_order = ONE bank payment (\u0414\u0435\u0431\u0435\u0442 \u043f\u043b\u0430\u0442\u0435\u043b\u044c\u0449\u0438\u043a\u0430 / \u0421\u0443\u043c\u043c\u0430 \u043f\u043b\u0430\u0442\u0435\u0436\u0430 / \u0421\u0443\u043c\u043c\u0430 \u043f\u0440\u043e\u043f\u0438\u0441\u044c\u044e). " +
    "reconciliation_act = a TABLE of many rows (\u2116 / \u0412\u0440\u0435\u043c\u044f / \u041e\u043f\u0435\u0440\u0430\u0446\u0438\u044f / \u041a\u0440\u0435\u0434\u0438\u0442 / \u041e\u043f\u0438\u0441\u0430\u043d\u0438\u044f / \u041e\u0441\u0442\u0430\u0442\u043e\u043a). " +
    "delivery_note = a goods list / return note (Возврат от …, Накладная: Товар / Количество / Цена / Стоимость, Итого сумма, Погашено из долга) — NOT a payment. " +
    "The image may be CROPPED on the left, so labels can lose their first letters.\n" +
    "Look for a field labelled \u0421\u0443\u043c\u043c\u0430, \u0421\u0443\u043c\u043c\u0430\u0441\u0438 " +
    'or "\u0421\u0443\u043c\u043c\u0430 \u043f\u043b\u0430\u0442\u0435\u0436\u0430". ' +
    "Do NOT convert, round or reformat the number \u2014 copy it character by character. " +
    'If you cannot read it, use "".\n' +
    // \u0425\u0438\u0440\u0430 \u0440\u0430\u0441\u043c\u0434\u0430 \u043c\u043e\u0434\u0435\u043b \u0418\u041d\u041d \u0432\u0430 \u0441\u0430\u043d\u0430\u043d\u0438 \u040e\u0417\u0418\u0414\u0410\u041d \u0422\u041e\u041f\u0418\u0411 \u0451\u0437\u0430\u0440\u0434\u0438 (\u0441\u0438\u043d\u043e\u0432\u0434\u0430 3 \u0442\u0430\u0434\u0430\u043d
    // 3 \u0442\u0430\u0441\u0438 \u043d\u043e\u0442\u045e\u0493\u0440\u0438 \u044d\u0434\u0438) \u2014 \u0431\u0443 \u0451\u043b\u0493\u043e\u043d \u00ab\u0418\u041d\u041d \u043c\u043e\u0441 \u044d\u043c\u0430\u0441\u00bb \u043e\u0433\u043e\u04b3\u043b\u0430\u043d\u0442\u0438\u0440\u0438\u0448 \u0431\u0435\u0440\u0430\u0434\u0438.
    "NEVER GUESS. If any character of a field is blurry, cut off or not clearly " +
    'legible, return "" for that field. An empty field is much better than a wrong one. ' +
    "This applies especially to the INN and the date.";

  // ── 1) Workers AI — моделлар навбат билан (chekModellar). Биринчи ўқиш — «low»
  //    (тез); иккинчи, қатъий ўқиш — «high» (модел кўпроқ ўйлайди, хира
  //    майдонни ўйлаб топиш ўрнига кўпинча "" қайтаради — синовда кўрилди).
  const birModel = async (model) => {
    let txt = "";
    /* 🔁 БИР МАРТА ҚАЙТА УРИНИШ (Руслан 2026-09-26, 2.6-синов). Жонли синовда
     * 1092px лик аниқ чек учун модел ҲЕЧ НИМА қайтармади — на ҳужжат тури, на
     * сумма; ўша расм алоҳида 15/15 марта тўғри ўқилди (кетма-кет ҳам, бир
     * вақтда учтадан ҳам). Демак бу ўткинчи нуқсон (Workers AI хатоси ёки бўш
     * жавоб), расм эмас. Бўш жавоб/хато бўлса дарҳол яна бир марта сўралади —
     * модел ўқиганида иккинчи чақириқ бўлмайди. */
    for (let urinish = 0; urinish < 2 && !txt; urinish++) {
      try {
        const out = await vaqtChegarasi(env.AI.run(model, {
          max_tokens: 4000,                 // ўйлаш ҳам шу лимитдан сарфланади
          temperature: 0,
          ...(ojlaydi(model) ? { reasoning_effort: qayta ? "high" : "low" } : {}),
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${media};base64,${b64}` } },
          ] }],
        }), modelSekund(env) * 1000, model);
        // Фақат ЖАВОБ олинади (reasoning_content — моделнинг ўйлаши, унда
        // бошқа сонлар ҳам бўлиши мумкин)
        txt = String((out && (out.response
                || (out.choices && out.choices[0] && out.choices[0].message
                    && out.choices[0].message.content))) || "");
        if (!/\{[\s\S]*\}/.test(txt)) txt = "";   // JSON'сиз жавоб — бўш билан тенг
      } catch (err) {
        console.error("AI.run(" + model + ", уриниш " + (urinish + 1) + "):", err && err.message);
        txt = "";
        if (/вақт тугади/.test(String(err && err.message))) break;   // секин модел — қайта кутмаймиз, кейингисига
      }
      if (!txt && urinish === 0) console.warn("чек: модел бўш жавоб қайтарди — қайта сўралмоқда");
    }
    return txt;
  };
  /* Сумма ўқилиб, модел шубҳа билдирмаса (high ёки ишонч сўралмаган) — тамом. Акс ҳолда кейинги модел ҳам сўралади ва энг яхшиси
   * танланади: «high» сумма > оддий сумма > акт > платёжка > бошқа. ЖОНЛИ ЎЛЧОВ (05.10): кўр GLM
   * баъзан ЎЙЛАБ ТОПИЛГАН сумма қайтаради (13,6 млн ва 30 млн лик чекларга, ҳатто актга ҳам «20 000 000»,
   * ишонч low/medium) — биринчи суммада тўхтасак, ўша ёлғон қоларди. Кўр модел ҳамма майдонни бўш
   * қолдириб турини «other» деса — бундай «бошқа» ҳеч нимадан устун келмайди. */
  const daraja = (r) => r.summa > 0 ? 5 : r.hujjat === "akt" ? 3 : r.hujjat === "chek" ? 2 : r.hujjat === "boshqa" && !r.bosh ? 1 : 0;
  let eng = null;
  const tanla = (r, model) => {
    if (!r) return false;
    r.model = model;
    // Модел ЎЗИ шубҳа билдирса (low/medium) — кейингиси ҳам сўралади. Ишонч сўралмаган ўқишда
    // (қатъий, иккинчи ўқиш — QATIY) ишонч бўш: сумма ўқилган бўлса — тамом, аввалгидек.
    if (r.summa > 0 && r.ishonch !== "low" && r.ishonch !== "medium") return true;
    /* 🧾 «Бу акт» — суммаси йўқлиги табиий, кейинги моделни кутиш шарт эмас (жонли ўлчов: Qwen'ни
     * 25 с кутиш ҳар бир актни 30 с га чўзарди). Ҳақиқатан актми — sherik.js aktOqi жадвални ўқиб текширади. */
    if (r.hujjat === "akt") { eng = r; return true; }
    if (!eng || daraja(r) > daraja(eng)) eng = r;
    return false;
  };
  for (const model of env.AI ? chekModellar(env) : []) {
    const r = jsonOqi(await birModel(model));
    if (tanla(r, model)) return r;
  }

  // ── 2) GOOGLE GEMINI — фақат ЗАҲИРА: Workers AI моделлари ўқимаса ва калит қўйилган бўлса
  if (geminiBor(env)) {
    let txt = "";
    try {
      txt = await geminiOqi(env, prompt, media, b64);
    } catch (err) {
      console.error("Gemini:", err && err.message);
      txt = "";
    }
    const r = jsonOqi(txt);
    if (tanla(r, "gemini")) return r;
  }
  return eng;

  function jsonOqi(txt) {
    // Модел жавобни ```json ... ``` ичида қайтариши мумкин — регекс шуни ҳам олади
    const m = String(txt || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j;
    try { j = JSON.parse(m[0]); } catch { return null; }
    // ── РАҚАМ ва СЎЗ. Платёжкада сумма икки марта ёзилади. Улар фарқ
    //    қилса — СЎЗДАГИСИ тўғри (банк қоидаси ҳам шундай): рақамда AI
    //    ноль қўшиб/тушириб юбориши мумкин, сўзда эса ноль йўқ.
    const raqamda = summaParse(j.summa_raw);
    const sozda = sozdanSumma(j.summa_sozda);
    let summa = raqamda;
    // 1 сўм фарқ ҳам «фарқ» (2026-09-15). Иккаласи ҳам қайтарилади — омборда
    // сўровга АЙНАН тенги танланади (aiMosSumma).
    if (sozda > 0 && raqamda > 0 && sozda !== raqamda) {
      console.log("чек: рақамда " + raqamda + ", сўзда " + sozda + " — сўзга ишондик");
      summa = sozda;
    } else if (!raqamda && sozda > 0) {
      summa = sozda;
    }
    const hujjat = String(j.hujjat || "").trim().toLowerCase();
    const ishonch = String(j.ishonch || "").trim().toLowerCase();
    // «№ 20112», «20112 / 2026» каби келса ҳам — фақат рақамлар қолади
    const raqam = String(j.raqam ?? "").replace(/\D+/g, "").slice(0, 20);
    return { summa, raqamda, sozda, raqam, en: olchamEni, sozMatn: j.summa_sozda, sana: j.sana, kim: j.kim,
             tolovchi: j.tolovchi, inn: innTop(j.inn), bank: j.bank,
             // "" — модел айтмаган бўлса (эски жавоб шакли): текширувлар ўтказиб юборилади
             hujjat: /act|akt|sverk/.test(hujjat) ? "akt" : /payment|order|platyo/.test(hujjat) ? "chek" : hujjat ? "boshqa" : "",
             ishonch: ["high", "medium", "low"].includes(ishonch) ? ishonch : "",
             // ҳамма майдон бўш — модел ҳеч нарса ўқимаган (кўр бўлиши ҳам мумкин): «бошқа» деган тури ҳисобланмайди
             bosh: !raqamda && !sozda && !raqam && ![j.sana, j.kim, j.tolovchi, j.inn].some((x) => String(x ?? "").trim()) };
  }
}

/* --------- СЧЁТ / СПЕЦИФИКАЦИЯ PDF'идан: ким олади, ИНН, сумма ---------
   Достон 2026-09-15: сотувчи «💸 Пул чиқариш» да PDF ташлайди — фирма, ИНН
   ва сумма шундан олинсин. PDF матни pdfMatn() билан (AI'сиз) олинади,
   GLM фақат МАТНни ўқиб, ПУЛНИ ОЛАДИГАН фирмани ажратади (харидор — биз).
   ЎЙЛАБ ТОПИЛГАНИ ЎТМАЙДИ: ҳар бир жавоб PDF матнида борлиги текширилади
   (ИНН — рақамлари, сумма — рақамда ёки сўзда, фирма — номи).          */
const HUJJAT_PROMPT =
  "Below is text extracted from a PDF invoice / specification / contract from Uzbekistan " +
  "(счёт, счёт-фактура, спецификация, договор, шартнома). The lines may be out of order.\n" +
  "Our company is the BUYER (Покупатель / Заказчик / Харидор / Сотиб олувчи) and must PAY.\n" +
  "Find the company that RECEIVES the money (Поставщик / Продавец / Производитель / " +
  "Исполнитель / Етказиб берувчи / Сотувчи).\n" +
  'Reply with ONLY JSON: {"firma": "<receiver company name exactly as written>", ' +
  '"inn": "<receiver INN / ИНН / СТИР, 9 digits, NOT the buyer\'s>", ' +
  '"summa_raw": "<the GRAND TOTAL to pay INCLUDING VAT, digits exactly as written>", ' +
  '"summa_sozda": "<the total written in words (Сумма прописью), exactly as written>"}\n' +
  "HOW TO FIND THE TOTAL (Достон 2026-09-15):\n" +
  "- If there is «Всего к оплате» / «Жами тўлов» / «Итого к оплате» — take THAT number.\n" +
  "- Otherwise take the LAST number of the «Итого» / «Жами» / «Jami» / «Всего» row " +
  "(that row lists: sum without VAT, VAT amount, then TOTAL WITH VAT — the TOTAL is the last one).\n" +
  "- The total usually equals the amount written in words.\n" +
  "- NEVER take a single line item, a price, a quantity, the VAT amount (НДС/ҚҚС суммаси) " +
  "or the sum without VAT.\n" +
  "The receiver's INN may be labelled ИНН, СТИР or STIR. The buyer's INN is NOT the answer.\n" +
  'NEVER GUESS: if a field is not in the text, return "" for it.';

/** PDF матнидан ЖАМИ суммани қоида билан топади (AI'сиз):
 *  1) «Всего к оплате / Итого к оплате / Jami to'lov» — ундан кейинги сон;
 *  2) «Итого / Жами / Jami / Всего» қатори — кетма-кет сонларнинг ОХИРГИСИ
 *     (ҚҚСсиз, ҚҚС, ҚҚС БИЛАН — жами охирида туради).
 *  Топилмаса 0. Матндаги қаторлар тартиби бузуқ бўлса ҳам хато бермайди. */
export function pdfJami(matn) {
  const q = String(matn || "").split(/\n/).map((x) => x.trim());
  const sonlar = (s) => (String(s).match(/\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{2}(?!\d)|\d{4,}(?:[.,]\d{1,2})?/g) || [])
    .map((x) => Math.round(parseFloat(x.replace(/[  ]/g, "").replace(",", ".")))).filter((v) => v >= 1000);
  const soflar = (i) => {                           // label'дан кейинги соф рақамли қаторлар
    const out = [];
    for (let k = i + 1; k < q.length && k <= i + 4; k++) {
      if (!/^[\d  .,%]+$/.test(q[k]) || /%/.test(q[k])) break;
      out.push(...sonlar(q[k]));
    }
    return out;
  };
  for (let i = 0; i < q.length; i++) {
    const m = q[i].match(/(всего\s+к\s+оплате|итого\s+к\s+оплате|jami\s+to['ʻ’]?lov|жами\s+тўлов)\s*:?\s*(.*)$/i);
    if (m) { const s = sonlar(m[2]); if (s.length) return s[0]; const n = soflar(i); if (n.length) return n[0]; }
  }
  let itogoBor = false;
  for (let i = 0; i < q.length; i++) {
    const m = q[i].match(/^(итого|жами|jami|всего)\s*:?\s*(.*)$/i);
    if (!m || /наименований/i.test(q[i])) continue;
    itogoBor = true;
    const s = sonlar(m[2]).concat(soflar(i));
    if (s.length) return s[s.length - 1];
  }
  // «ИТОГО:» бор-у, сонлари ёнида эмас (Excel PDF'ида қаторлар аралаш
  // чиқади: «16 250 000 / 1 950 000 / 18 200 000,00 … ИТОГО:»). Ундай
  // ҳолда «ҚҚСсиз + ҚҚС = ЖАМИ» бўлган кетма-кет уч сон қидирилади, энг
  // каттаси олинади (товар қатори ҳам шундай бўлиши мумкин — у кичик).
  if (itogoBor) {
    let eng = 0;
    for (let i = 0; i < q.length; i++) {
      const s = [];
      for (let k = i; k < q.length && k <= i + 2 && /^[\d  .,]+$/.test(q[k]); k++) s.push(...sonlar(q[k]));
      for (let j = 0; j + 2 < s.length; j++)
        if (Math.abs(s[j] + s[j + 1] - s[j + 2]) <= 1 && s[j + 2] > eng) eng = s[j + 2];
    }
    if (eng) return eng;
  }
  return 0;
}

export async function hujjatOqi(env, matn) {
  const t = String(matn || "");
  if (!env || !env.AI || t.replace(/\s+/g, "").length < 30) return null;
  const model = chekModellar(env)[0];             // матн — расм эмас, асосий модел ўқийди
  let javob = "";
  try {
    const out = await env.AI.run(model, {
      max_tokens: 3000, temperature: 0, reasoning_effort: "low",
      messages: [{ role: "user", content: HUJJAT_PROMPT + "\n\n--- TEXT ---\n" + t.slice(0, 6000) }],
    });
    javob = String((out && (out.response || (out.choices && out.choices[0] && out.choices[0].message
      && out.choices[0].message.content))) || "");
  } catch (err) {
    console.error("hujjatOqi:", err && err.message);
    return null;
  }
  const m = javob.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }

  const raqamlar = t.replace(/\D+/g, " ");
  // ИНН — матнда айнан шу 9 рақам бўлиши шарт
  let inn = innTop(j.inn);
  if (inn && !new RegExp("(^|\\s)" + inn + "(\\s|$)").test(raqamlar)
      && !t.replace(/\s+/g, "").includes(inn)) inn = "";
  // Фирма — номи матнда бўлиши шарт
  let firma = String(j.firma || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (firma && firmaMos(t, firma) !== "mos") firma = "";
  // Сумма — рақамдагиси матндаги суммалардан бири бўлиши ёки сўздагиси
  // (матндаги «Сумма прописью») унга тенг бўлиши шарт
  const raqamda = summaParse(j.summa_raw);
  const sozda = sozdanSumma(j.summa_sozda);
  const matnSummalar = new Set(matndanSummalar(t).map((x) => Math.round(x)));
  let summa = 0;
  if (raqamda > 0 && (matnSummalar.has(raqamda) || sozda === raqamda)) summa = raqamda;
  else if (sozda > 0 && matnSummalar.has(sozda)) summa = sozda;
  // Достон: «summada jami summani olsin». Қоида билан топилган ЖАМИ'дан
  // кичик сон олинган бўлса (бир қатор, ҚҚСсиз, ҚҚС суммаси) — ЖАМИ.
  const jami = pdfJami(t);
  if (jami > 0 && (!summa || summa < jami)) summa = jami;
  if (summa && (summa < 1000 || summa > TOLOV_MAX)) summa = 0;
  return { firma, inn, summa };
}

/* ======================== 4. CALLBACK'ЛАР ======================== */
export async function omborCallback(ctx, query, access) {
  const { env, tg, token } = ctx;
  const uid = query.from.id;
  const chatId = query.message.chat.id;
  const p = (query.data || "").split("|");
  const cmd = p[1];

  // Тугмалар ГУРУҲда ҳаммага кўринади, лекин фақат бухгалтер/админ боса
  // олади. Аввал рухсатсиз одам босса ЖИМ қайтарарди — тугма «ишламади»
  // деб ўйлаб қайта-қайта босаверарди. Энди сабаби айтилади.
  const rad = (matn) => tg(token, "answerCallbackQuery",
                           { callback_query_id: query.id, text: matn, show_alert: true });

  // --- Excel: аввал ДИАПАЗОН танланади, кейин файл юборилади (фақат админ)
  // 📥 Ойлик ҳисобот — ой танлаш. «xls» — чатда қолиб кетган эски
  // «📥 Excel — ҳамма сотувчилар» тугмаси: у ҳам энди ойларни кўрсатади.
  if (cmd === "oy" || cmd === "xls") {
    if (!isOmborHisobot(uid, access)) return rad("📥 Ойлик ҳисобот — фақат админ учун.");
    await oylikTanlov(ctx, chatId, uid, access);
    return;
  }
  // Нусхаланган жадвални бекор қилиш (чала қолган бўлаклар ташланади)
  if (cmd === "nx0") {
    if (!isOmborAdmin(uid, access)) return rad("Фақат админ учун.");
    if (env.ACCESS_KV) {
      await env.ACCESS_KV.delete(NUSXA_KEY(uid));
      await env.ACCESS_KV.delete(NUSXA_HOLAT_KEY(uid));
    }
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id, text: "Бекор қилинди" });
    await tg(token, "editMessageText", { chat_id: chatId, message_id: query.message.message_id,
      text: "❌ Жадвал юкланмади — бекор қилинди." }).catch(() => {});
    return;
  }

  // Ой танлаш экрани: oys — асосий (уч тугма), oyy — йил рўйхати,
  // oyo — ой рўйхати. Ҳаммаси ЎША хабарнинг тугмаларини алмаштиради.
  if (cmd === "oys" || cmd === "oyy" || cmd === "oyo") {
    if (!isOmborHisobot(uid, access)) return rad("📥 Ойлик ҳисобот — фақат админ учун.");
    const rejim = cmd === "oyy" ? "yil" : cmd === "oyo" ? "oy" : "asosiy";
    const kb = await oyKbTayyorla(env, p[2], p[3], rejim);
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
      message_id: query.message.message_id, reply_markup: kb });
    return;
  }
  if (cmd === "oyx") {
    if (!isOmborHisobot(uid, access)) return rad("📥 Ойлик ҳисобот — фақат админ учун.");
    const oy = oyOraliq(p[2]);
    if (!oy) return rad("Ой нотўғри.");
    // Бўш ой — файл берилмайди, сабаби айтилади
    if (!(await oydaMalumot(env, oy.dan, oy.gacha)))
      return rad(`${oy.izoh}: бу ойда товар ҳам, тўлов ҳам йўқ.`);
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    await excelYubor(ctx, chatId, uid, { izoh: oy.izoh, dan: oy.dan, gacha: oy.gacha, oy: true });
    return;
  }

  // 💱 Курсни белгилаш
  if (cmd === "kurs") {
    if (!isOmborAdmin(uid, access)) return rad("💱 Курс — фақат админ учун.");
    await kursSora(ctx, chatId, uid, access);
    return;
  }

  // 💰 Бошланғич қарзлар — тасдиқ тугмалари
  if (cmd === "qb1") {
    if (!isOmborAdmin(uid, access)) return rad("Фақат админ учун.");
    await qarzBoshBajar(ctx, chatId, uid, access, p[2]);
    return;
  }
  if (cmd === "qb0") {
    if (!isOmborAdmin(uid, access)) return rad("Фақат админ учун.");
    await yubor(ctx, chatId, "❌ Бекор қилинди — қарзлар ўзгармади.");
    return;
  }
  // Синов маълумотларини ЎЧИРИБ, кейин ҳақиқий қарзларни ёзиш
  if (cmd === "qbt") {
    if (!isOmborAdmin(uid, access)) return rad("Фақат админ учун.");
    await qarzBoshTozalab(ctx, chatId, uid, access, p[2]);
    return;
  }

  // 🧪 Нолдан бошлаш — тасдиқ тугмалари
  if (cmd === "reset1") {
    if (!isOmborAdmin(uid, access)) return rad("Фақат админ учун.");
    await testResetBajar(ctx, chatId, uid, access);
    return;
  }
  if (cmd === "reset0") {
    if (!isOmborAdmin(uid, access)) return rad("Фақат админ учун.");
    await yubor(ctx, chatId, "❌ Бекор қилинди — ҳеч нарса ўчирилмади.");
    return;
  }

  // Excel — сана оралиғини ЎЗИ ёзади (админ ҳам, сотувчи ҳам)
  if (cmd === "xrng") {
    const sid = Number(p[2]) || 0;
    if (!isOmborHisobot(uid, access) && Number(sid) !== Number(uid))
      return rad("📥 Excel — фақат ўз ҳисоботингизни юклай оласиз.");
    if (env.ACCESS_KV) {
      await env.ACCESS_KV.put(XRNG_KEY(uid), JSON.stringify({ sid }),
                              { expirationTtl: XRNG_UMR });
    }
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    await yubor(ctx, chatId, [
      "📅 <b>САНА БЎЙИЧА ҲИСОБОТ</b>",
      "",
      "Икки санани ёнма-ён ёзинг:",
      "",
      "<code>01.08.2026  01.09.2026</code>",
      "",
      "<i>Йилни ёзмасангиз ҳам бўлади: 01.08  01.09</i>",
    ].join("\n"));
    return;
  }

  // Эски «Давр танлаш» тугмаси (чатда қолиб кетган бўлиши мумкин).
  // Сотувчида танлов йўқ — дарҳол ТЎЛИҚ ҳисоботни берамиз.
  if (cmd === "xme") {
    if (!isOmborSotuvchi(uid)) return rad("📥 Excel — фақат сотувчи учун.");
    const dav = await kvGet(env, davrlarKey(), []);
    await excelYubor(ctx, chatId, uid,
      { davrlar: dav, izoh: "ҳамма даврлар", sotuvchi: uid });
    return;
  }

  // Excel — сотувчини танлаш
  if (cmd === "xsel") {
    if (!isOmborHisobot(uid, access)) return rad("📥 Excel — фақат админ учун.");
    const davrlar = await kvGet(env, davrlarKey(), []);
    const idlar = [...new Set(davrlar.flatMap((d) => d.sotuvchilar || []))];
    const kb = { inline_keyboard: [] };
    for (let i = 0; i < idlar.length; i += 2) {
      const r = [{ text: ISM[idlar[i]] || String(idlar[i]), callback_data: `omb|xsid|${idlar[i]}` }];
      if (idlar[i + 1]) r.push({ text: ISM[idlar[i + 1]] || String(idlar[i + 1]),
                                 callback_data: `omb|xsid|${idlar[i + 1]}` });
      kb.inline_keyboard.push(r);
    }
    await yubor(ctx, chatId, "👤 <b>Кимнинг Excel'ини юклаймиз?</b>", { reply_markup: kb });
    return;
  }

  // Excel — сотувчи танланди, энди диапазон
  if (cmd === "xsid") {
    if (!isOmborHisobot(uid, access)) return rad("📥 Excel — фақат админ учун.");
    const sid = Number(p[2]);
    await yubor(ctx, chatId, `👤 <b>${esc(ISM[sid] || sid)}</b>\n\n${EXCEL_MATN}`,
                { reply_markup: excelKb(sid) });
    return;
  }

  // Excel — диапазон танланди, файлни юборамиз
  if (cmd === "xd") {
    const tanlov = p[2], sid = Number(p[3]) || 0;
    // Ҳисобот ҳуқуқи борлар ҳаммасини, сотувчи ФАҚАТ ЎЗИНИКИНИ юклай олади.
    if (!isOmborHisobot(uid, access) && Number(sid) !== Number(uid))
      return rad("📥 Excel — фақат ўз ҳисоботингизни юклай оласиз.");
    const barcha = await kvGet(env, davrlarKey(), []);
    const t = davrTanla(barcha, tanlov);
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    await excelYubor(ctx, chatId, uid,
                     { davrlar: t.davrlar, izoh: t.izoh, sotuvchi: sid || null });
    return;
  }

  // Админ бошқа сотувчининг батафсил ҳисоботини кўради
  if (cmd === "s") {
    if (!isOmborHisobot(uid, access))
      return rad("Бошқа сотувчининг ҳисоботи — фақат админ учун.");
    const tgId = Number(p[2]);
    // Матн ҳисобот ЮБОРИЛМАЙДИ — фақат Excel файл. Матн узун чиқиб
    // (маҳсулотлар рўйхати билан) экранни тўлдирарди, айни маълумот эса
    // файлда аллақачон бор.
    // Файл ясалгунча тугма «айланиб» турмасин — дарҳол жавоб
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    const dav = await kvGet(env, davrlarKey(), []);
    // Давр танлаш сўралмайди — битта сотувчининг файли ҳар доим ТЎЛИҚ
    // берилади. Админга давр танлаш «📥 Excel — ҳамма сотувчилар»
    // тугмаси орқали қолди.
    await excelYubor(ctx, chatId, uid,
      { davrlar: dav, izoh: "ҳамма даврлар", sotuvchi: tgId });
    return;
  }

  // Гуруҳда сотувчи қўлда танланди
  if (cmd === "p") {
    if (!isBuxgalter(uid) && !isOmborAdmin(uid, access))
      return rad("Сотувчини фақат бухгалтер ёки админ танлай олади.");
    const tgId = Number(p[2]), summa = Number(p[3]), chek = p[4], sorovId = p[5];
    if (!isBuxgalter(uid) && Number(uid) === tgId)
      return rad("Ўз тўловингизни ўзингиз ёза олмайсиз — бухгалтер ёзади.");
    // Тугма ичидаги сон бузилган бўлиши мумкин (эски тугма, нотўғри
    // ўқилган чек). Манфий сумма қарзни ОШИРИБ юборарди.
    if (!isOmborSotuvchi(tgId))
      return rad("Бу одам сотувчилар рўйхатида йўқ — тўлов ёзилмади.");
    if (!Number.isFinite(summa) || summa <= 0)
      return rad("Сумма нотўғри — тўлов ёзилмади.");
    if (summa > TOLOV_MAX)
      return rad(`Сумма жуда катта (${pul(summa)}) — тўлов ёзилмади.`);
    if (await kvGet(env, `omb:chek:${chek}`, null)) {
      await tg(token, "answerCallbackQuery", { callback_query_id: query.id,
        text: "Бу чек аллақачон ёзилган", show_alert: true });
      return;
    }
    // ── Сўровга боғланган тугма: ўша сўров АЛЛАҚАЧОН ёпилган ёки
    //    қолган суммаси кичик бўлса — ёзмаймиз. Акс ҳолда бухгалтер
    //    иккита огоҳлантиришнинг иккала тугмасини босса (альбом, чекни
    //    қайта юбориш) қарздан икки марта айириларди.
    if (sorovId) {
      const s0 = (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === sorovId);
      if (s0 && Number(s0.sid) === tgId) {
        const qoldi = Math.max(0, son(s0.summa) - son(s0.tolangan || 0));
        if (s0.band || qoldi <= 0) {
          await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
            message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
          return rad(`Бу сўров аллақачон ёпилган — тўлов ёзилмади.`);
        }
        if (summa > qoldi * 1.01 + 1) {
          await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
            message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
          return rad(`Бу сўровда ${pul(qoldi)} сўм қолган. Ортиқчаси ёзилмади.`);
        }
      }
    }
    await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
      message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
    const sApp = sorovId ? (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === sorovId) : null;
    const tolovId = await tolovYoz(ctx, chatId, query.message.reply_to_message || query.message,
                                   tgId, summa, chek, "қўлда танланди", null, uid, "qolda",
                                   !(sApp && sApp.manba === "app"));
    // «Барибир ёзилсин» — ўша сўров ҳам ёпилади (фақат шу сотувчиники бўлса)
    if (tolovId && sorovId) {
      const s = (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === sorovId);
      if (s && Number(s.sid) === tgId && !s.band) await sorovTolov(ctx, sorovId, tolovId, summa);
    }
    return;
  }

  // ── Такрорий сўровни тасдиқлаш / бекор қилиш.
  //    Буни СОТУВЧИнинг ўзи (сўров эгаси) ёки админ ҳал қилади — бошқа
  //    сотувчи чалкаштириб юбормаслиги учун.
  if (cmd === "sq" || cmd === "sn") {
    const sid = p[2];
    const ro = await kvGet(env, SOROV_KEY, []);
    const it = ro.find((x) => x.id === sid);
    if (!it) return rad("Сўров топилмади (эскириб кетган бўлиши мумкин).");
    if (Number(uid) !== Number(it.sid) && !isOmborAdmin(uid, access)) {
      return rad("Буни сўров эгаси ёки админ ҳал қилади.");
    }
    if (cmd === "sq") {
      it.kutilmoqda = false;
      await kvRoyxatYoz(env, SOROV_KEY,
        (joriy) => joriy.map((x) => (x.id === sid ? { ...x, kutilmoqda: false } : x)),
        (joriy) => { const y = joriy.find((x) => x.id === sid); return !y || y.kutilmoqda === false; });
      await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
        message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
      await yubor(ctx, chatId,
        `✅ <b>Тасдиқланди</b> — ${pul(it.summa)} сўм алоҳида тўлов сифатида қабул қилинди.`,
        { reply_to_message_id: query.message.message_id });
    } else {
      await kvRoyxatYoz(env, SOROV_KEY,
        (joriy) => joriy.filter((x) => x.id !== sid),
        (joriy) => !joriy.some((x) => x.id === sid));
      await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
        message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
      await yubor(ctx, chatId, "❌ <b>Сўров ўчирилди</b> — тўлов кутилмайди.",
        { reply_to_message_id: query.message.message_id });
    }
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  // Фирма мос эмаслиги ҳақидаги огоҳлантиришни ёпиш (ҳеч нарса ёзилмайди)
  if (cmd === "no") {
    if (!isBuxgalter(uid) && !isOmborAdmin(uid, access))
      return rad("Буни фақат бухгалтер ёки админ бекор қила олади.");
    await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
      message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
    // Огоҳлантириш қайси сўровга тегишли (gmBogla) — Mini App'да «Чек ёзилмади» кўринади
    const gmSorov = await kvGet(env, GM_KEY(query.message.message_id), null);
    if (gmSorov) await sorovChekHolat(env, gmSorov, "rad");
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id,
      text: "Чек ёзилмади. Тўғри чекни эълонга юборинг.", show_alert: true });
    return;
  }

  // Тўловни бекор қилиш
  if (cmd === "rev") {
    const tgId = Number(p[2]), id = p[3];
    const ro = await kvGet(env, payKey(tgId), []);
    const it = ro.find((x) => x.id === id);
    // Бухгалтер ёки админ. «Қарзимдан минус»ни эса уни ТАСДИҚЛАГАН одам ҳам
    // бекор қила олади — тугма унинг шахсий чатида туради.
    const tasdiqlagan = it && it.manba === "кардан минус" && Number(it.kim) === Number(uid);
    if (!isBuxgalter(uid) && !isOmborAdmin(uid, access) && !tasdiqlagan)
      return rad("↩️ Тўловни фақат бухгалтер ёки админ бекор қила олади.");
    if (!it || it.holat === "bekor") {
      await tg(token, "answerCallbackQuery", { callback_query_id: query.id,
        text: "Топилмади ёки аллақачон бекор қилинган", show_alert: true });
      return;
    }
    await kvRoyxatYoz(env, payKey(tgId),
      (joriy) => joriy.map((x) => (x.id === id ? { ...x, holat: "bekor", bekorKim: uid } : x)),
      (joriy) => { const y = joriy.find((x) => x.id === id); return !y || y.holat === "bekor"; });
    if (it.chek) await env.ACCESS_KV.delete(`omb:chek:${it.chek}`);
    const bogliq = (await kvGet(env, SOROV_KEY, [])).find((x) => Number(x.sid) === tgId &&
      ((x.tolovlar || []).includes(id) || x.tolov === id));
    // Шу тўлов ёпган сўров қайта очилади — тўғри чекни эълонга ташлаш мумкин
    await kvRoyxatYoz(env, SOROV_KEY,
      (joriy) => joriy.map((x) => {
        const ids = x.tolovlar || (x.tolov ? [x.tolov] : []);
        if (Number(x.sid) !== tgId || !ids.includes(id)) return x;
        // Қисман тўловлардан бири бекор бўлса — фақат ўша сумма қайтади
        return { ...x, band: false, tolov: null, tolovlar: ids.filter((t) => t !== id),
                 tolangan: Math.max(0, son(x.tolangan || 0) - son(it.summa)),
                 chek: { holat: "bekor", vaqt: Date.now() } };
      }),
      (joriy) => !joriy.some((x) => Number(x.sid) === tgId &&
        ((x.tolovlar || []).includes(id) || x.tolov === id)));
    await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
      message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
    // ДИҚҚАТ: гуруҳга сотувчининг ҚАРЗИ ёзилмайди (аввал ёзиларди —
    // гуруҳдаги ҳамма кўрарди). Сотувчи ўзиникини «📊 Ҳисоботим»да кўради.
    await yubor(ctx, chatId,
      `↩️ <b>${esc(ISM[tgId] || tgId)} тўлови бекор қилинди</b> — ${pul(it.summa)} сўм`);
    if (!(bogliq && bogliq.manba === "app")) await yubor(ctx, tgId, [
      "↩️ <b>Тўловингиз бекор қилинди</b>",
      `💵 <b>${pul(it.summa)} сўм</b> қарзингизга қайтди`,
    ].join("\n")).catch(() => {});
    return;
  }
}

/* ==================== ТЕСТ УЧУН: ҚАРЗНИ ЎРНАТИШ ====================
   Реал синовда ҳар бир сотувчида кўринадиган қарз бўлиши керак.
   Қарз = бошланғич (omb:bq) + товар (Excel блоклари) − тўланган.
   Товар ва тўловларга ТЕГМАЙМИЗ — фақат БОШЛАНҒИЧни шундай ҳисоблаб
   қўямизки, натижавий қарз керакли рақам чиқсин. Синов тугагач
   `/test_tozala` бошланғични нолга қайтаради — реал маълумот бузилмайди.

   Буйруқлар (фақат админ, шахсий чатда):
     /test_qarz     — ҳаммага 100 млн, 2 тасига 0 (қарзи йўқ ҳолат ҳам
                      кўринсин: ҳисоботда «ҚАРЗ ЙЎҚ» деб чиқади)
     /test_tozala   — бошланғични тозалайди (omb:bq = {})
     /test_reset    — БУТУН омбор тарихини ўчиради (маҳсулот, тўлов,
                      сўров, чек) ва ҳар сотувчига 50 млн бошланғич
                      қарз қўяди. Тасдиқ сўралади — қайтариб бўлмайди.
==================================================================== */

const TEST_QARZ = 100_000_000;       // ҳамма сотувчига
const TEST_NOL = 2;                  // шунчаси қарзсиз — рўйхатнинг бошидан
const TEST_BOSH = 50_000_000;        // /test_reset дан кейинги бошланғич қарз

/* ---------- БОШЛАНҒИЧ ҚАРЗЛАР (НАМУНА) ----------
   ⚠️ ОЧИҚ РЕПОЗИТОРИЙ: бу рақамлар НАМУНА, ҳақиқий эмас.
   Ҳақиқий қарзлар бухгалтериянинг жадвалидан олинади ва бу файлга ёзилади.
   Манба: фойдаланувчи юборган жадвал, «09.09.2026 холатига».
   Рақамлар ДОЛЛАРДА. Исм ёнидаги «−» белгисининг маъноси йўқ —
   фойдаланувчи тасдиқлади: ҳаммаси оддий қарздор, мусбат.

   Бу ерга ТЕГМАНГ: рақам ўзгарса, одамнинг қарзи ўзгаради. Янгиси
   керак бўлса — жадвални қайтадан олиб, шу ерга ёзиш керак.        */
const QARZ_DOLLAR = {
  7000000012: 1000.00,   // Абдулхай
  7000000027: 1500.00,   // Алишер
  7000000011: 2000.00,   // Рамзиддин
  7000000015: 2500.00,   // Дилмурод
  7000000001: 3000.00,   // Илхом
  7000000030: 3500.00,   // Пўлат
  7000000005: 4000.00,   // Сардор
  7000000019: 4500.00,   // Дилшод
  7000000021: 5000.00,   // Аброрака
  7000000017: 5500.00,   // Абдувохид
  7000000004: 6000.00,   // Асрор
};
// Жадвалдаги ЖАМИ — текшириш учун. Бот ҳисоблаган жами шунга тўғри
// келмаса, демак рақам кўчиришда хато бўлган.
const QARZ_DOLLAR_JAMI = 38500.00;

/* СЎМДА берилган бошланғич қарзлар — жадвалдан ТАШҚАРИ.
   Курсга кўпайтирилмайди, айнан шу рақам ёзилади.

   Ҳозир бу ерда фақат Достон бор: у синов фойдаланувчиси, ҳақиқий
   жадвалда йўқ. Унга 50 млн қўйилади — бошқа ҲЕЧ ҚАНДАЙ қарз
   қўшилмайди (Склад файлида «Достон» деган блок йўқ, шунинг учун
   товар ҳам ёзилмайди).

   Синов тугагач шу қаторни ўчириш кифоя — қарзи 0 га тушади.        */
const QARZ_SOM = {
  7000000025: 50_000_000,   // Достон — синов
};

/** Сотувчининг бошланғич қарзи (сўмда). Курс — доллар жадвали учун. */
function boshlangichSom(id, kurs) {
  if (QARZ_SOM[id] !== undefined) return QARZ_SOM[id];
  return Math.round((QARZ_DOLLAR[id] || 0) * kurs);
}

/** SKLAD_MAP даги ТАКРОРЛАНМАС tgId'лар — рўйхатдаги тартибда */
function testSotuvchilar() {
  return [...new Set(Object.values(SKLAD_MAP))];
}

export async function testQarzOrnat(ctx, chatId, uid, access) {
  const { env, tg, token } = ctx;
  if (!isOmborAdmin(uid, access)) return true;

  const idlar = testSotuvchilar();
  const bq = {};
  const satrlar = [];
  for (let i = 0; i < idlar.length; i++) {
    const id = idlar[i];
    const nishon = i < TEST_NOL ? 0 : TEST_QARZ;
    const m = await sotuvchiMalumot(env, id);
    // бошланғични эски қийматидан ХОЛИ ҳолда ҳисоблаймиз
    bq[id] = nishon - (m.tovar - m.tolangan);
    satrlar.push(qator(qisqa(ISM[id] || String(id), 18),
                       nishon === 0 ? "0  (қарзсиз)" : pul(nishon)));
  }
  await kvPut(env, "omb:bq", bq);

  await yubor(ctx, chatId, [
    "🧪 <b>ТЕСТ ҚАРЗЛАРИ ЎРНАТИЛДИ</b>",
    "",
    `👥 Сотувчилар: <b>${idlar.length}</b> та`,
    `🟡 Қарзи бор: <b>${idlar.length - TEST_NOL}</b> та — ҳар бирида ` +
      `<b>${pul(TEST_QARZ)} сўм</b>`,
    `⚪️ Қарзсиз: <b>${TEST_NOL}</b> та — қарзи <b>0</b>`,
    "",
    blok(satrlar.join("\n")),
    "",
    "<i>Товар ва тўловларга тегилмади. Синов тугагач /test_tozala.</i>",
  ].join("\n"));
  return true;
}

export async function testQarzTozala(ctx, chatId, uid, access) {
  const { env } = ctx;
  if (!isOmborAdmin(uid, access)) return true;
  await kvPut(env, "omb:bq", {});
  await yubor(ctx, chatId,
    "🧹 <b>Тест қарзлари тозаланди</b>\n\n<i>Бошланғич қарз = 0. " +
    "Энди ҳисобот фақат Excel маълумотига таянади.</i>");
  return true;
}

/**
 * НОЛДАН БОШЛАШ: омборга оид БАРЧА KV ёзувлари ўчирилади ва ҳар бир
 * сотувчига 50 млн бошланғич қарз қўйилади.
 *
 * Нима ўчади: юкланган ҳисобот даврлари ва маҳсулот блоклари
 * (omb:d:…), тўловлар (omb:pay:…), сўровлар (omb:sorov), теглар
 * (omb:teg), ишлатилган чеклар (omb:chek:…), ярим қолган қадамлар
 * (omb:st:…, omb:xrng:…). Бошқа бўлимларга (access, state:…) тегилмайди —
 * улар "omb:" префиксида эмас.
 *
 * ҚАЙТАРИБ БЎЛМАЙДИ, шунинг учун аввал тасдиқ сўралади.
 */
export async function testReset(ctx, chatId, uid, access) {
  if (!isOmborAdmin(uid, access)) return true;
  const idlar = testSotuvchilar();
  await yubor(ctx, chatId, [
    "⚠️ <b>НОЛДАН БОШЛАШ</b>",
    "",
    "Қуйидагиларнинг <b>ҲАММАСИ</b> ўчирилади:",
    "  • юкланган ҳисоботлар ва маҳсулотлар",
    "  • барча тўловлар тарихи",
    "  • сўровлар, теглар, ишлатилган чеклар",
    "",
    `Сўнг ҳар бир сотувчига (${idlar.length} та) бошланғич қарз ` +
      `<b>${pul(TEST_BOSH)} сўм</b> қўйилади.`,
    "",
    "<i>Қайтариб бўлмайди. Ҳисоботни яна юклашингиз керак бўлади.</i>",
  ].join("\n"), { reply_markup: { inline_keyboard: [[
    { text: "✅ Ҳа, ҳаммасини ўчир", callback_data: "omb|reset1" },
    { text: "❌ Йўқ", callback_data: "omb|reset0" },
  ]] } });
  return true;
}

/** «omb:» калитларини ўчиради (qoldir даги калитлардан ташқари).
 *  Аввал ҲАММА калит йиғилади, кейин ўчирилади — айланиш пайтида ўчирсак
 *  cursor силжиб, бир қисми ўтказиб юбориларди. Лимитга урилса тўхтайди
 *  ва xato: true қайтаради (жимгина йиқилмайди). */
async function ombTozala(env, qoldir) {
  const kalitlar = [];
  let cursor, ochirildi = 0;
  try {
    do {
      const r = await env.ACCESS_KV.list({ prefix: "omb:", cursor });
      for (const k of r.keys) kalitlar.push(k.name);
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
    for (const nom of kalitlar) {
      if (qoldir.has(nom)) continue;
      await env.ACCESS_KV.delete(nom);
      ochirildi++;
    }
  } catch (e) {
    console.error("ombTozala:", e && e.message);
    return { ochirildi, xato: true };
  }
  return { ochirildi, xato: false };
}

/** Тасдиқлангач — ҳақиқий тозалаш */
export async function testResetBajar(ctx, chatId, uid, access) {
  const { env } = ctx;
  if (!isOmborAdmin(uid, access)) return;
  if (!env.ACCESS_KV) return;

  // Аввал ЯНГИ бошланғич қарз ёзилади, кейин қолган ҳамма «omb:» ўчирилади.
  // Тескари тартибда ўчириш ярмида тўхтаса (кунлик 1 000 ўчириш лимити)
  // бошланғич қарз ҳам йўқ бўлиб қоларди.
  const idlar = testSotuvchilar();
  const bq = {};
  for (const id of idlar) bq[id] = TEST_BOSH;
  await kvPut(env, "omb:bq", bq);
  const t = await ombTozala(env, new Set([SOTUVCHI_KEY, "omb:bq"]));
  const ochirildi = t.ochirildi;

  await yubor(ctx, chatId, [
    "🧹 <b>ТОЗАЛАНДИ — НОЛДАН БОШЛАНДИ</b>",
    "",
    `🗑 Ўчирилган ёзувлар: <b>${ochirildi}</b> та`,
    ...(t.xato ? ["⚠️ <b>Ҳаммаси ўчирилмади</b> (Cloudflare кунлик лимити) — эртага яна босинг."] : []),
    `👥 Сотувчилар: <b>${idlar.length}</b> та`,
    `💰 Ҳар бирида бошланғич қарз: <b>${pul(TEST_BOSH)} сўм</b>`,
    "",
    "<i>Энди «📊 Ҳисоботим» да фақат шу 50 млн кўринади — товар ҳам, " +
      "тўлов ҳам йўқ. Ҳисоботни юкласангиз, устига қўшилиб боради.</i>",
  ].join("\n"));
}

/**
 * ҲАҚИҚИЙ бошланғич қарзларни ўрнатиш (доллардан сўмга).
 *
 *     /qarz_bosh 12050
 *
 * Курсни фойдаланувчи ёзади — бот ўзи тахмин қилмайди. Аввал жадвал
 * кўрсатилади (ким, қанча доллар, қанча сўм), тасдиқлангандан кейингина
 * ёзилади.
 *
 * ЖАДВАЛДА ЙЎҚ сотувчиларнинг бошланғич қарзи НОЛГА тушади — эски
 * қиймат қолиб кетмасин («ортиқча сумма қўшилиб кетмасин» деб сўралган).
 */
export async function qarzBosh(ctx, chatId, uid, access, matn) {
  const { env } = ctx;
  if (!isOmborAdmin(uid, access)) {
    // Аввал бу ерда шунчаки `return true` эди — буйруқ ЖИМГИНА ейиларди.
    // 2026-09-10: Достон deploy тугашини кутмасдан ёзиб, ҳеч қандай
    // жавоб олмади ва «бот ишламаяптими?» деб ўйлади. Ўшанда сабаб
    // ҳуқуқ эмас, эски версия эди — лекин фарқини билиб бўлмасди.
    // Энди ТАНИШ одамга сабаби айтилади. Бутунлай бегонага эса ҳамон
    // жим — бот ичида қандай буйруқ борлиги кўринмасин.
    if (isOmborSotuvchi(uid) || isBuxgalter(uid)) {
      await yubor(ctx, chatId, "🔒 Бу буйруқ фақат админ учун.");
    }
    return true;
  }

  let kurs = son(String(matn || "").replace(/[^\d.,]/g, "").replace(",", "."));
  // Рақам ёзилмаса — сақланган курсни оламиз («💱 Курс» тугмаси орқали)
  if (!kurs) {
    const k = await kursOl(env);
    if (k) kurs = son(k.qiymat);
  }
  if (!(kurs >= KURS_MIN && kurs <= KURS_MAX)) {
    await yubor(ctx, chatId, "💱 Аввал «💱 Курсни танлаш» тугмаси орқали курсни ёзинг.");
    return true;
  }
  // Бошланғич қарзлар аллақачон ёзилган бўлса — «Фақат ёз» ҲАММАНИ қайта
  // ёзиб, «👥 Сотувчилар» да қилинган қўлда тузатишларни ўчириб юборарди.
  const bqKursBor = await kvGet(env, BQ_KURS_KEY, null);

  const idlar = [...new Set(Object.values(SKLAD_MAP))];
  const satrlar = [];
  let jamiDollar = 0, jamiSom = 0;
  for (const id of idlar) {
    const d = QARZ_DOLLAR[id] || 0;
    const som = boshlangichSom(id, kurs);
    jamiDollar += d;                          // назорат — фақат жадвал бўйича
    jamiSom += som;
    // «(0)» — жадвалда ҳам, сўм рўйхатида ҳам йўқлар. Сўмда берилганлар
    // (синов) «(синов)» деб белгиланади — жадвалдан эмаслиги кўринсин.
    const belgi = QARZ_SOM[id] !== undefined ? "  (синов)" : (d ? "" : "  (0)");
    satrlar.push(qator(qisqa(ISM[id] || String(id), 12) + belgi, pul(som)));
  }
  const nazorat = Math.abs(jamiDollar - QARZ_DOLLAR_JAMI) < 0.01;

  await yubor(ctx, chatId, [
    "💰 <b>БОШЛАНҒИЧ ҚАРЗЛАР</b>",
    "",
    `💱 Курс: <b>${pul(kurs)}</b>`,
    `📋 Жадвал: <b>${jamiDollar.toFixed(2)} $</b>` +
      (nazorat ? " ✅" : ` ⚠️ (кутилган ${QARZ_DOLLAR_JAMI})`),
    `💵 Сўмда: <b>${pul(jamiSom)} сўм</b>`,
    "",
    blok(satrlar.join("\n")),
    "",
    "<i>Жадвалда йўқлар (0) деб белгиланган — уларнинг бошланғич қарзи " +
      "нолга тушади.</i>",
    "",
    ...(bqKursBor
      ? [`⚠️ Бошланғич қарзлар <b>${pul(bqKursBor)}</b> курсда аллақачон ёзилган.`,
         "Битта сотувчини ўзгартириш: «👥 Сотувчилар» → ✏️.",
         "<b>Тозалаб ёз</b> — товарлар, тўловлар ва тузатишлар ЎЧАДИ."]
      : ["<b>Фақат ёз</b> — товар ва тўловлар жойида қолади",
         "<b>Тозалаб ёз</b> — товарлар ва тўловлар ЎЧАДИ, нолдан бошланади"]),
  ].join("\n"), { reply_markup: { inline_keyboard: [
    ...(bqKursBor ? [] : [[{ text: "✅ Фақат ёз", callback_data: `omb|qb1|${Math.round(kurs)}` }]]),
    [{ text: "🧹 Тозалаб ёз (ҳаммаси ўчади)",
       callback_data: `omb|qbt|${Math.round(kurs)}` }],
    [{ text: "❌ Йўқ", callback_data: "omb|qb0" }],
  ] } });
  return true;
}

/**
 * СИНОВДАН ҲАҚИҚИЙГА ЎТИШ: омборга оид ҳамма KV ёзувини ўчириб
 * (юкланган даврлар, маҳсулотлар, тўловлар, сўровлар, чеклар), сўнг
 * жадвалдаги ҲАҚИҚИЙ бошланғич қарзларни ёзади.
 *
 * testResetBajar дан фарқи: у ҳаммага бир хил 50 млн қўярди — синов
 * учун эди. Бу эса ҳар кимга ЎЗ рақамини қўяди.
 */
/** Жадвал (ҳақиқий бошланғич қарзлар) берилган курсда — ҳеч нарса ЁЗМАЙДИ.
 *  Ботдаги /qarz_bosh ва Mini App «Ҳақиқий ишга ўтиш» иккаласи шуни кўрсатади. */
export async function qarzBoshJadval(env, kurs) {
  const k = son(kurs);
  const idlar = [...new Set(Object.values(SKLAD_MAP))];
  const satrlar = idlar.map((id) => ({ id, ism: ISM[id] || String(id), dollar: QARZ_DOLLAR[id] || 0,
    som: boshlangichSom(id, k), sinov: QARZ_SOM[id] !== undefined }));
  const jamiDollar = satrlar.reduce((a, x) => a + x.dollar, 0);
  return { kurs: k, satrlar, jamiDollar: Math.round(jamiDollar * 100) / 100,
           jamiSom: satrlar.reduce((a, x) => a + x.som, 0),
           nazorat: Math.abs(jamiDollar - QARZ_DOLLAR_JAMI) < 0.01, kutilgan: QARZ_DOLLAR_JAMI,
           bqKurs: son(await kvGet(env, BQ_KURS_KEY, 0)) || null };
}

/** СИНОВДАН ҲАҚИҚИЙГА ЎТИШ — ҳисоб қисми (хабарсиз). Бот ва Mini App иккаласи чақиради. */
export async function qarzBoshTozalabBajar(env, uid, kurs) {
  if (!isOmborAdmin(uid, null)) return { ok: false, xato: "Фақат омбор админи" };
  const k = son(kurs);
  if (!(k >= KURS_MIN && k <= KURS_MAX)) return { ok: false, xato: `Курс ${KURS_MIN} … ${KURS_MAX} оралиғида бўлсин` };
  if (!env.ACCESS_KV) return { ok: false, xato: "KV йўқ" };
  // Аввал курс ва ҳақиқий қарзлар ЁЗИЛАДИ, кейин қолган «omb:» ўчирилади —
  // ўчириш ярмида тўхтаса ҳам қарзлар йўқолмайди.
  await kursQoy(env, k, uid);
  const idlar = [...new Set(Object.values(SKLAD_MAP))];
  const bq = {};
  for (const id of idlar) bq[id] = boshlangichSom(id, k);
  await kvPut(env, "omb:bq", bq);
  await kvPut(env, BQ_KURS_KEY, k);
  const t = await ombTozala(env, new Set([SOTUVCHI_KEY, "omb:bq", KURS_KEY, BQ_KURS_KEY]));
  return { ok: true, kurs: k, ochirildi: t.ochirildi, chala: Boolean(t.xato), sotuvchi: idlar.length,
           jami: Object.values(bq).reduce((a, b) => a + b, 0),
           nol: idlar.filter((id) => !bq[id]).map((id) => ISM[id] || String(id)) };
}

export async function qarzBoshTozalab(ctx, chatId, uid, access, kurs) {
  const { env } = ctx;
  if (!isOmborAdmin(uid, access)) return;
  const n = await qarzBoshTozalabBajar(env, uid, kurs);
  if (!n.ok) return;
  const k = n.kurs, t = { ochirildi: n.ochirildi, xato: n.chala }, jami = n.jami;
  const idlar = { length: n.sotuvchi };
  const nol = n.nol;
  await yubor(ctx, chatId, [
    "🧹 <b>ТОЗАЛАНДИ ВА ҲАҚИҚИЙ ҚАРЗЛАР ЁЗИЛДИ</b>",
    "",
    `🗑 Ўчирилган ёзувлар: <b>${t.ochirildi}</b> та`,
    ...(t.xato ? ["⚠️ <b>Ҳаммаси ўчирилмади</b> (Cloudflare кунлик лимити) — эртага яна босинг."] : []),
    `👥 Сотувчилар: <b>${idlar.length}</b> та`,
    `💱 Курс: <b>${pul(k)}</b>`,
    `💵 Жами бошланғич қарз: <b>${pul(jami)} сўм</b>`,
    ...(nol.length ? ["", "⚪️ Қарзи 0 бўлганлар: " +
      nol.map((x) => esc(x)).join(", ")] : []),
    "",
    "<i>Товар ҳам, тўлов ҳам йўқ — фақат шу қарзлар. Энди Склад файлини " +
      "юкласангиз, устига қўшилиб боради.</i>",
  ].join("\n"));
}

/** Жадвалдаги бошланғич қарзларни берилган курсда ёзади. Ҳеч нимани ўчирмайди. */
export async function boshlangichYoz(env, k) {
  // Жадвалдагилар ҳам (панелдан ўчирилган бўлса ҳам — қарзи йўқолмасин)
  const idlar = [...new Set([...Object.values(SKLAD_MAP),
    ...Object.keys(QARZ_DOLLAR).map(Number), ...Object.keys(QARZ_SOM).map(Number)])];
  const bq = {};
  for (const id of idlar) bq[id] = boshlangichSom(id, k);
  await kvPut(env, "omb:bq", bq);
  // Бошланғич қарз ҚАЙСИ курсда ёзилганини эслаб қоламиз: кейин курс
  // ўзгарса ҳам, жадвалдаги доллар рақами ўша бўлиб қолиши керак.
  await kvPut(env, BQ_KURS_KEY, k);
  return bq;
}

/** Тасдиқлангач — ҳақиқий ёзиш */
export async function qarzBoshBajar(ctx, chatId, uid, access, kurs) {
  const { env } = ctx;
  if (!isOmborAdmin(uid, access)) return;
  const k = son(kurs);
  if (!(k >= 1000 && k <= 100000)) return;
  // Эски хабардаги «✅ Фақат ёз» тугмаси — қўлда тузатишлар ўчиб кетмасин
  if (await kvGet(env, BQ_KURS_KEY, null)) {
    await yubor(ctx, chatId, "⚠️ Бошланғич қарзлар аллақачон ёзилган. Битта сотувчини: «👥 Сотувчилар» → ✏️.");
    return;
  }

  const bq = await boshlangichYoz(env, k);
  const idlar = Object.keys(bq);
  const jami = Object.values(bq).reduce((a, b) => a + b, 0);
  await yubor(ctx, chatId, [
    "✅ <b>БОШЛАНҒИЧ ҚАРЗЛАР ЁЗИЛДИ</b>",
    "",
    `👥 Сотувчилар: <b>${idlar.length}</b> та`,
    `💱 Курс: <b>${pul(k)}</b>`,
    `💵 Жами: <b>${pul(jami)} сўм</b>`,
    "",
    "<i>Ҳар ким «📊 Ҳисоботим» да фақат ЎЗ қарзини кўради.</i>",
  ].join("\n"));
}

// sklad.js — «Бигант Склад» файлини маънога айлантириш + ким кимлиги.
//
// Файл тузилиши (2026-09-08 да ҳақиқий файлдан ўқилган):
//   R2  «Сотилган товарлар хисоботи (сумда)»
//   R3  «01.08.2026-12.08.2026 давр оралиғи учун»      ← ДАВР
//   R4  D: «08.09.2026 11:25:38»                        ← файл яратилган вақт
//   R5  № | Менежер номи |  | Сони | Суммаси
//   R6  Bigant | ... | жами сони | жами суммаси
//   R8  1 | Абдувохид | | 184 | 8178100                 ← СОТУВЧИ сарлавҳаси
//   R9  № | Товар номи | Характеристика | Сони | Суммаси
//   R10+ маҳсулотлар...                                 ← кейинги сотувчигача
//   ...
//   R458 Жами | 128063 | 7000000003.5
//
// Сотувчи сарлавҳасини аниқлаш белгиси: ундан КЕЙИНГИ қаторда «Товар номи»
// туради. Шу қоида исмларга боғлиқ эмас — янги сотувчи қўшилса ҳам ишлайди.

/* ==================== КИМ КИМ ==================== */

// Excel'даги ном -> Telegram id. Изоҳлар: файлдаги ном ҳар доим ҳам
// ботдаги ном билан бир хил эмас (Пулат/Пўлат, Расул=Аброрака), шунинг
// учун мослик ШУ ЕРДА, битта жойда сақланади.
export const SKLAD_MAP = {
  // «Нурмухаммад» 2026-09-10 да олиб ташланди — у энди ишламайди
  // (Достон тасдиқлади). Склад файлида унинг блоки бор (17 маҳсулот,
  // 528 758 688 сўм), лекин у энди ЭГАСИЗ бўлади: ҳеч кимнинг қарзига
  // қўшилмайди, админга «⚠️ Эгаси аниқланмаган» рўйхатида кўринади.
  // Қайтариш керак бўлса:  "Нурмухаммад": 7000000024,
  "Абдулхай": 7000000012,
  "Пулат": 7000000030,              // ботда «Пўлат»
  "Алишер": 7000000027,
  "Дилмурод": 7000000015,
  "Дилшод": 7000000019,
  "Илхом": 7000000001,
  "Рамзиддин": 7000000011,        // ботда «Хусниддинов Рамзиддин»
  "Асрор/Сардор": 7000000004,    // Асрорнинг ўзига ёзилади
  "Абдувохид": 7000000017,
  "Расул": 7000000021,            // «Расул» = Аброрака
  "Сардор": 7000000005,
  "Сардор/Абдувохид": 7000000005, // Абдувохид билан бирга — Сардорга ёзилади
  // Достон — синов фойдаланувчиси. Сотувчи менюси унда ҳам очилиши учун
  // рўйхатда турибди, аммо калит «Достон» — Склад файлида бундай блок
  // ЙЎҚ, шунинг учун унга ҳеч қандай товар (демак қарз ҳам) ёзилмайди.
  //
  // 2026-09-10 гача бу ерда «Хамма»: 7000000025 турарди — эгаси
  // кўрсатилмаган блок Достонга бириктирилган эди. Олиб ташланди:
  // ҳақиқий файлдаги «Хамма» блоки 24 370 050 сўм бўлиб, бегона товар
  // унинг қарзига ёзилиб кетарди. Энди у «эгасиз» — админга алоҳида
  // кўрсатилади, ҳеч кимнинг қарзига қўшилмайди.
  "Достон": 7000000025,
};

// Ҳисоботда кўрсатиладиган расмий исм (Excel номи бошқача бўлса)
export const ISM = {
  7000000027: "Алишер", 7000000015: "Дилмурод", 7000000030: "Пўлат",
  7000000012: "Абдулхай", 7000000011: "Рамзиддин", 7000000021: "Аброрака",
  7000000013: "Абдумажид", 7000000019: "Дилшод", 7000000005: "Сардор",
  7000000001: "Илхом", 7000000017: "Абдувохид", 7000000028: "Хуршидака",
  7000000024: "Нурмухаммад", 7000000004: "Асрор", 7000000029: "Мурод ака",
  7000000022: "Барно",             // бухгалтер (@moliya_bigant)
  7000000014: "Дилдора",           // бухгалтер (@dildora_bigant) — аввал
                                   // исми йўқ эди, тегда «Бухгалтер» чиқарди
  7000000025: "Достон",            // синов — сотувчи + вақтинчалик админ
  7000000020: "Руслан",            // синов — ФАҚАТ бухгалтер
};

// Омбор ҳисоботида БАРЧА сотувчиларни кўра оладиганлар (иш бошқарувчи).
// Улар файл юклай олади — шунинг учун рўйхат қисқа.
//
// СИНОВ ТАҚСИМОТИ (2026-09-10) — ҳар кимга БИТТА рол, шунда ҳар бир
// йўлни алоҳида синаб кўриш мумкин:
//     Достон      → СОТУВЧИ + АДМИН  (синовни ўзи бошқаради)
//     Руслан      → фақат БУХГАЛТЕР  (админ рўйхатидан олинди)
//     Сардор ака  → АДМИН + Хуршидаканинг роли (кард тасдиғи)
//     Мурод ака   → АДМИН (эга — тегилмади)
// Синов тугагач Достон ва Руслан шу рўйхатга қайтарилади.
export const OMBOR_ADMIN = [
  7000000005,    // Сардор ака — иш бошқарувчи
  7000000025,   // Достон — ВАҚТИНЧА (синовни ўзи бошқариши учун)
];

// ФАҚАТ ҲИСОБОТ кўрадиганлар (Достон 2026-09-12): «📥 Ойлик ҳисобот» ва
// Excel — ҳа; курсни ўзгартириш, сотувчилар панели, Склад файлини юклаш,
// /qarz_bosh — ЙЎҚ. Тўлиқ админ бўлса бу рўйхатга ёзиш шарт эмас.
export const OMBOR_HISOBOT = [
  7000000029,      // Мурод ака — эга: ҳисоботни кўриб туради
];

// Платёжка расмини гуруҳга ташлаши ва қарзни камайтириши мумкин бўлганлар.
// ДИҚҚАТ (2026-09-10): аввал бу ерда «супер-админни ёзиш шарт эмас» деб
// турарди — isOmborAdmin() уни ўз ичига оларди. Энди олмайди (синов
// тақсимоти), шунинг учун бухгалтер бўлиши керак ҳар ким ШУ ЕРДА
// ёзилиши шарт.
//
// ҲАҚИҚИЙ бухгалтер ИККИТА — Барно ва Дилдора. Руслан фақат СИНОВ учун
// турибди: у ҳам чек ташлай олади ва гуруҳ эслатмасида (кўринмас тег
// билан) унга ҳам билдиришнома боради. Синов тугагач учинчи қаторни
// ўчириш кифоя.
export const BUXGALTER = [
  7000000022,   // @moliya_bigant — Барно   (ҳақиқий)
  7000000014,   // @dildora_bigant — Дилдора (ҳақиқий)
  7000000020,   // @rusticdev — Руслан       (СИНОВ — кейин олинади)
  7000000025,   // Достон — СИНОВ (2026-09-21 жонли синов: иловада сотувчи, гуруҳда бухгалтер) — кейин олинади
];

/* ==================== ЁРДАМЧИЛАР ==================== */

export function son(v) {
  // NaN/Infinity ҳам `typeof === "number"` — уларни ўтказиб юборсак, битта
  // бузуқ катак бутун ҳисоб-китобни NaN қилиб қўяди ва ҳисоботда «NaN сўм»
  // деб чиқади. Шунинг учун фақат ЧЕКЛИ сон ўтади.
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/ /g, " ").replace(/[^\d.,\- ]/g, "").replace(/ /g, "");
  if (s.includes(",") && s.includes(".")) {
    // «1,176,283,940.5» (инглизча) ёки «1.176.283.940,5» (европача)
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, "");                    // «1,500,000» — мингликлар (аввал 1.5 деб ўқиларди)
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, "");                   // «1.500.000»
  } else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ОДАМ ЁЗГАН суммани ўқийди. Ҳақиқий гуруҳдаги ёзувлар (result.json дан):
 *   «10.3mln SAYFULLAKA KRASKA ga»   → 10 300 000
 *   «3.7mln ... 8.6mln»              → [3 700 000, 8 600 000]
 *   «15.598.000 сум»                 → 15 598 000
 *   «Реалга100 м»                    → 100 000 000
 *   «11 000 000»                     → 11 000 000
 *   «500 ming»                       → 500 000
 * Топилган БАРЧА суммаларни қайтаради (битта хабарда бир нечта бўлиши мумкин).
 */
export function matndanSummalar(text) {
  return summaXom(text).map((x) => x.v);
}

/* ҚЎШМА СУММА → битта сон (Достон 2026-09-15: «2mln500» деб ёзди, бот
   2 000 000 деб ўқиди; «2 500 000» деб ёзганда тасдиқланди).
     «2mln500» · «2 mln 500» · «2 млн 500 минг»  → 2500000
     «10 mln 300 ming»                            → 10300000
     «1 mlrd 200 mln» · «1 mlrd 200»              → 1200000000
     «2 mln 500 000»                              → 2500000
   Охирги ЁЛҒИЗ сон (бирлиги ёзилмаган) — олдингисидан бир поғона кичик
   бирлик ҳисобланади, фақат ундан кейин сўз келмаса (ёки сўм/сум бўлса):
   «10 mln 2 ta» даги «2» — дона, суммага қўшилмайди.                    */
const BIRLIK = [
  [1e9, /^(mlrd|млрд|milliard|миллиард|milliarda|миллиарда|миллиардов)$/],
  [1e6, /^(mln|млн|million|millon|миллион|миллиона|миллионов|mil|m|м)$/],
  [1e3, /^(ming|минг|тыс|тысяч|тысячи|k|к)$/],
];
function birlikQiymat(soz) {
  const s = String(soz || "").replace(/\.$/, "");
  for (const [v, re] of BIRLIK) if (re.test(s)) return v;
  return 0;
}
// «сон + бирлик» жуфти; бирлик бўлмаса ҳам сон олинади
const JUFT = /(\d+(?:[.,]\d+)?)\s*([a-zа-яёўқғҳ]{1,10})?\.?/y;
function qoshmaSumma(s) {
  let chiqish = "", i = 0;
  while (i < s.length) {
    // Сон бошланадиган жой (олдида рақам бўлмаслиги керак)
    if (!/\d/.test(s[i]) || (i > 0 && /[\d.,]/.test(s[i - 1]))) { chiqish += s[i++]; continue; }
    let j = i, jami = 0, oxirgi = Infinity, soni = 0, tugash = i;
    while (true) {
      JUFT.lastIndex = j;
      const m = JUFT.exec(s);
      if (!m) break;
      const b = birlikQiymat(m[2]);
      const n = parseFloat(m[1].replace(",", "."));
      if (b && b < oxirgi) {
        jami += n * b; oxirgi = b; soni++;
        j = JUFT.lastIndex; tugash = j;
        const bosh = s.slice(j).match(/^\s*/)[0].length;
        if (!/\d/.test(s[j + bosh] || "")) break;
        j += bosh;
        continue;
      }
      // Бирликсиз охирги сон: «2mln500», «2 mln 500 000», «1 mlrd 200».
      // «2 mln 500 000» даги бўшлиқли минглик ҳам бир сон.
      if ((!m[2] || /^(сўм|сум|so|som|sum)$/.test(m[2])) && soni && oxirgi >= 1e6) {
        const ml = s.slice(j).match(/^\d{1,3}(?: \d{3})*(?!\d)/);
        const kolgan = ml ? s.slice(j + ml[0].length) : "";
        const sozBor = /^\s*[a-zа-яёўқғҳ'ʻ’]/.test(kolgan) && !/^\s*(сўм|сум|so['ʻ’]?m|sum)(?![a-zа-яёўқғҳ])/.test(kolgan);
        if (ml && !sozBor) {
          const y = Number(ml[0].replace(/ /g, ""));
          const add = y < 1000 ? y * (oxirgi / 1000) : (y < oxirgi ? y : NaN);
          if (!Number.isNaN(add)) { jami += add; soni++; tugash = j + ml[0].length; }
        }
      }
      break;
    }
    // Камида битта млрд/млн ва яна нимадир қўшилган бўлсагина алмаштирамиз
    if (soni >= 2 && Number.isFinite(jami)) {
      chiqish += " " + Math.round(jami) + " ";
      i = tugash;
    } else {
      chiqish += s[i++];
    }
  }
  return chiqish;
}

function summaXom(text) {
  const s0 = qoshmaSumma(String(text || "").toLowerCase().replace(/ /g, " "));
  // Сана, соат, ИНН, «№1523», телефон — СУММА ЭМАС. Аввал «11.09.2026» ни
  // 11 092 026 деб, «№1523, 11 mln» ни 1 523 110 000 деб ўқирди.
  const s = s0
    .replace(/(^|[^\d])\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?![\d])/g, "$1 ")      // 11.09.2026
    .replace(/(^|[^\d])\d{4}-\d{2}-\d{2}(?![\d])/g, "$1 ")                    // 2026-09-11
    .replace(/(^|[^\d])\d{1,2}:\d{2}(:\d{2})?(?![\d])/g, "$1 ")               // 14:30
    .replace(/(инн|inn|стир|stir)\D{0,3}\d{9}(?!\d)/gi, " ")                  // ИНН 123456789
    .replace(/(№|#)\s*\d+/g, " ")                                              // №1523
    .replace(/\+998[\d\s-]{9,14}/g, " ")                                       // +998 90 123 45 67
    .replace(/,(?=\s)/g, " ; ");                                               // «№1, 11 mln» — вергул чегара
  // рақам (ичида бўшлиқ/нуқта/вергул бўлиши мумкин) + кейинги СЎЗ
  const re = /(\d[\d .,]*\d|\d)\s*([a-zа-яё.]{0,8})/gi;
  const MLN  = ["mln", "млн", "million", "миллион", "mil", "m", "м"];
  const MING = ["ming", "минг", "тыс", "тысяч", "k", "к"];
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    const n = raqamOqi(m[1]);
    if (!n) continue;
    const soz = (m[2] || "").replace(/\.$/, "").toLowerCase();
    let v = n, olchov = false;
    if (birlikQiymat(soz) === 1e9) { v = n * 1e9; olchov = true; }
    else if (MLN.includes(soz)) { v = n * 1e6; olchov = true; }
    else if (MING.includes(soz)) { v = n * 1e3; olchov = true; }
    // Ишончли оралиқ: 1 000 сўмдан 10 миллиардгача
    if (v >= 1000 && v <= 1e10) {
      // ПУЛга ўхшайдими? «5 mln» (ўлчов сўзи), «11 100 000» (ажратгичли)
      // ёки 100 000 дан катта сон — ҳа. «2024», «4521» каби ёлғиз кичик
      // сонлар эса йил ёки счёт рақами бўлиши мумкин.
      const pulga = olchov || /[ .,]/.test(String(m[1]).trim()) || v >= 100000;
      out.push({ v: Math.round(v), pulga });
    }
  }
  return out;
}


/** Битта сумма керак бўлганда: ПУЛга ўхшаганлари ичидан ЭНГ КАТТАСИ.
 *  «НУР-2024 МЧЖ га 5 mln» → 5 000 000 (2024 — йил, сумма эмас)
 *  «11 100 000 сум (11 mln)» → 11 100 000 (аниқроғи)                */
export function matndanSumma(text) {
  const a = summaXom(text);
  if (!a.length) return 0;
  const pulli = a.filter((x) => x.pulga);
  const t = pulli.length ? pulli : a;
  return Math.max(...t.map((x) => x.v));
}

/** Матнда ИККИТА ҲАҚИҚИЙ сумма борми? (сўровда сўраб олиш учун)
 *  Бир-бирига яқин (5% ичида) сонлар битта деб ҳисобланади:
 *  «11 100 000 сум (11 mln)» — бу иккита сумма эмас.                */
export function summaAniqmi(text) {
  const p = [...new Set(summaXom(text).filter((x) => x.pulga).map((x) => x.v))]
    .sort((a, b) => b - a);
  return { aniq: p.length < 2 || p[1] >= p[0] * 0.95, tanlov: p.slice(0, 3) };
}

function raqamOqi(raw) {
  const xom = String(raw).trim();
  let t = xom.replace(/\s/g, "");
  if (!t) return 0;
  // Руслан 2026-10-10: «13.600.000,00» ва «13,600,000.00» 100 баравар катта
  // (1 360 000 000) ўқилиб, тўлов шундоқ ёзиларди. Минглик ажратгичли
  // (нуқта/вергул ёки бўшлиқ) сон охиридаги [.,]\d{1,2} — ТИЙИН, ташланади.
  // «13,6 mln» (ажратгичсиз битта вергул) — каср бўлиб қолади.
  const tiyin = t.match(/^(.+)[.,]\d{1,2}$/);
  if (tiyin && (/^\d{1,3}([.,]\d{3})+$/.test(tiyin[1]) || /\d\s\d{3}/.test(xom))) t = tiyin[1];
  // «15.598.000» ёки «15,598,000» — мингликлар ажратгичи
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, "");
  else if ((t.match(/[.,]/g) || []).length === 1) t = t.replace(",", ".");
  else t = t.replace(/[.,]/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

export function pul(n) {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toLocaleString("ru-RU");
  return (neg ? "−" : "") + s;
}

// Исмларни таққослаш учун: катта-кичик, ў/у, қ/к, ғ/г, ҳ/х, бўшлиқ фарқсиз
export function normIsm(s) {
  return String(s ?? "").toLowerCase()
    .replace(/ў/g, "у").replace(/қ/g, "к").replace(/ғ/g, "г").replace(/ҳ/g, "х")
    .replace(/[^a-zа-я0-9/]/gi, "");
}

const MAP_NORM = new Map(Object.entries(SKLAD_MAP).map(([k, v]) => [normIsm(k), v]));

/* ---------- БОТДАН ҚЎШИЛГАН / ЎЧИРИЛГАН СОТУВЧИЛАР ----------
   Юқоридаги SKLAD_MAP — асос. Админ «👥 Сотувчилар» панелида қилган
   ўзгаришлар KV'да (SOTUVCHI_KEY) сақланади ва ҳар бир сўров бошида шу
   функция орқали асос устига қўйилади (sotuvchilar.js).
     qosh:  { "<tgId>": { ism, excel: ["Склад файлидаги ном"] } }
     ochir: [tgId, ...]
   Ҳар сафар АСОСДАН бошлаб қурилади — бошқа сўровдан қолган эски ҳолат
   аралашиб кетмайди.                                                    */
export const SOTUVCHI_KEY = "omb:sotuvchilar";
const ASL_SKLAD = { ...SKLAD_MAP };
let ustamaBor = false;
export function sotuvchiUstama(u) {
  // Бузуқ ёзув (қўлда таҳрирланган захира) бутун ботни йиқитмасин
  const qosh = u && u.qosh && typeof u.qosh === "object" && !Array.isArray(u.qosh) ? u.qosh : {};
  const ochir = new Set((Array.isArray(u && u.ochir) ? u.ochir : []).map(Number));
  if (!ustamaBor && !Object.keys(qosh).length && !ochir.size) return;   // ўзгариш йўқ
  ustamaBor = true;
  for (const k of Object.keys(SKLAD_MAP)) delete SKLAD_MAP[k];
  for (const [nom, id] of Object.entries(ASL_SKLAD)) if (!ochir.has(Number(id))) SKLAD_MAP[nom] = id;
  for (const [id, s] of Object.entries(qosh)) {
    if (s && s.ism) ISM[id] = String(s.ism);             // ўчирилган бўлса ҳам исми қолади
    if (ochir.has(Number(id))) continue;
    for (const nom of (s && Array.isArray(s.excel) ? s.excel : [])) SKLAD_MAP[String(nom)] = Number(id);
  }
  MAP_NORM.clear();
  for (const [k, v] of Object.entries(SKLAD_MAP)) MAP_NORM.set(normIsm(k), v);
}

/** Excel'даги ном бўйича Telegram id (топилмаса null) */
export function tgIdByName(name) {
  const v = MAP_NORM.get(normIsm(name));
  return v === undefined ? null : v;
}

/* ==================== ПАРСЕР ==================== */

// Йил 4 ёки 2 хонали бўлиши мумкин: «01.09.2026-10.09.2026» ва «01.09.26-10.09.26»
const RE_DAVR = /(\d{2}\.\d{2}\.(?:\d{4}|\d{2}))\s*[-–—]\s*(\d{2}\.\d{2}\.(?:\d{4}|\d{2}))(?!\d)/;
const toliqYil = (s) => (/\.\d{2}$/.test(s) ? s.slice(0, 6) + "20" + s.slice(6) : s);

function textOf(row, i) { return String((row.cells && row.cells[i]) ?? "").trim(); }

// Қаторда «Товар номи» сарлавҳаси борми?
function isTovarHeader(row) {
  const c = row.cells || [];
  for (let i = 0; i < c.length; i++) {
    if (String(c[i] ?? "").trim().toLowerCase().startsWith("товар ном")) return true;
  }
  return false;
}

/* ---------- УСТУНЛАРНИ НОМИ БЎЙИЧА ТОПИШ ----------
   Аввал устунлар РАҚАМИ бўйича олинарди (c[4] = Сони, c[5] = Суммаси).
   Файлга битта устун қўшилса, ҳамма рақам силжиб, бот НОТЎҒРИ суммани
   ўқирди — ҳам ҳеч қандай хато чиқмасди. Энди сарлавҳа қаторидан
   («№ | Товар номи | Характеристика | Сони | Суммаси») ҳар бир
   устуннинг ўрни топилади.

   Доллар устуни ҳам таниб олинади: «Суммаси $», «Сумма ($)», «Доллар»,
   «$» — қайси кўринишда ёзилса ҳам. Файлда бўлмаса, оддийгина йўқ
   бўлади, ҳеч нима бузилмайди.                                       */
const USTUN_OLD = { nom: 2, xar: 3, soni: 4, summa: 5, dollar: -1 };

function ustunlar(row) {
  const c = row.cells || [];
  const u = { nom: -1, xar: -1, soni: -1, summa: -1, dollar: -1 };
  for (let i = 0; i < c.length; i++) {
    const t = String(c[i] ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!t) continue;
    // Долларни ОЛДИН текширамиз: «суммаси $» ҳам «сумма» билан бошланади
    if (u.dollar < 0 && (t.includes("$") || t.includes("доллар") ||
                         t.includes("dollar") || t.includes("usd"))) u.dollar = i;
    else if (u.nom < 0 && t.startsWith("товар ном")) u.nom = i;
    else if (u.xar < 0 && t.startsWith("характеристика")) u.xar = i;
    else if (u.soni < 0 && t.startsWith("сони")) u.soni = i;
    else if (u.summa < 0 && t.startsWith("сумма")) u.summa = i;
  }
  // Сарлавҳа танилмаса — эски (рақам бўйича) тартибга қайтамиз
  if (u.nom < 0 || u.soni < 0 || u.summa < 0) return { ...USTUN_OLD };
  if (u.xar < 0) u.xar = USTUN_OLD.xar;
  return u;
}

/**
 * Варақ қаторларини тузилмага айлантиради.
 * @returns {{davr, davrBoshi, davrOxiri, yaratilgan, jami, bloklar}}
 */
export function parseSklad(rows) {
  let davrBoshi = "", davrOxiri = "", yaratilgan = "";
  let jamiSoni = 0, jamiSumma = 0;

  // --- сарлавҳа қисми (биринчи 8 қатор кифоя)
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    for (const cell of (rows[i].cells || [])) {
      const s = String(cell ?? "").trim();
      if (!s) continue;
      const m = s.match(RE_DAVR);
      if (m && !davrBoshi) { davrBoshi = toliqYil(m[1]); davrOxiri = toliqYil(m[2]); }
      if (!yaratilgan && /^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}/.test(s)) yaratilgan = s;
    }
  }

  // --- сотувчи блоклари
  const bloklar = [];
  let cur = null;
  let u = { ...USTUN_OLD };                 // жорий блокнинг устун ўринлари
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const c = row.cells || [];

    // «Жами» — файл охири
    const b = textOf(row, 1);
    if (normIsm(b) === "жами") {
      jamiSoni = son(c[4]); jamiSumma = son(c[5]);
      break;
    }

    // Сотувчи сарлавҳаси: кейинги қатор «Товар номи» бўлса
    if (rows[i + 1] && isTovarHeader(rows[i + 1])) {
      const nom = textOf(row, 2);
      // Устунларнинг ўрни ҳар блокда қайтадан ўқилади — файл ичида
      // тартиб ўзгарса ҳам тўғри ишлайверсин
      u = ustunlar(rows[i + 1]);
      if (nom) {
        cur = {
          nom,
          tgId: tgIdByName(nom),
          soni: son(c[u.soni]),
          summa: son(c[u.summa]),
          ...(u.dollar >= 0 ? { dollar: son(c[u.dollar]) } : {}),
          mahsulotlar: [],
        };
        bloklar.push(cur);
      }
      i++;                      // «Товар номи» сарлавҳасини ўтказиб юборамиз
      continue;
    }

    if (!cur) continue;
    const raqam = textOf(row, 1);
    const nomi = textOf(row, u.nom);
    if (!raqam || !nomi || !/^\d+$/.test(raqam)) continue;   // бўш ёки сарлавҳа
    cur.mahsulotlar.push({
      nom: nomi,
      xar: u.xar >= 0 ? textOf(row, u.xar) : "",
      soni: son(c[u.soni]),
      summa: son(c[u.summa]),
      ...(u.dollar >= 0 ? { dollar: son(c[u.dollar]) } : {}),
    });
  }

  return {
    davr: davrBoshi ? `${davrBoshi} – ${davrOxiri}` : "",
    davrBoshi, davrOxiri, yaratilgan,
    jami: { soni: jamiSoni, summa: jamiSumma },
    bloklar,
  };
}

/** Давр учун ягона калит: «20260801-20260812» (қайта юклашда алмаштириш учун) */
export function davrKey(d) {
  const f = (s) => (s ? s.split(".").reverse().join("") : "");
  const k = f(d.davrBoshi) + "-" + f(d.davrOxiri);
  return k === "-" ? "nomalum" : k;   // санасиз файл — ягона «nomalum» калити
}

/** Текшириш: жами сумма блоклар йиғиндисига тўғри келадими */
export function tekshir(d) {
  const yigindi = d.bloklar.reduce((s, b) => s + b.summa, 0);
  const farq = Math.round((yigindi - d.jami.summa) * 100) / 100;
  const egasiz = d.bloklar.filter((b) => b.tgId === null);
  return {
    ok: Math.abs(farq) < 1,
    farq,
    yigindi,
    egasiz: egasiz.map((b) => ({ nom: b.nom, summa: b.summa })),
    bloklar: d.bloklar.length,
    mahsulotlar: d.bloklar.reduce((s, b) => s + b.mahsulotlar.length, 0),
  };
}

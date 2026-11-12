// xlsxout.js — .xlsx ЯРАТУВЧИ (ташқи кутубхонасиз, Workers'да ишлайди).
//
// Керакли минимум: ZIP (CRC32 + deflate-raw) ва бир нечта XML файл.
// Макрос ишлатилмайди — фақат оддий формулалар, шунда WPS'да ҳам,
// эски Excel'да ҳам, Google Sheets'да ҳам бир хил очилади.
//
// ТЕЗЛИК (2026-09-10). Cloudflare Free планда бир сўровга 10 ms CPU.
// 1500 қаторли ойлик файл аввал ~25 ms оларди — ярмидан кўпи deflate
// (CompressionStream, 6-даража) ва байтма-байт CRC эди. Энди:
//   • deflate — node:zlib, 1-даража: ~3.5 баробар тез, файл ~20 % каттароқ
//     (207 → 257 KB), ичидаги XML эса БАЙТМА-БАЙТ ўша-ўша.
//   • CRC32 — zlib.crc32 (native); бўлмаса «slicing-by-8» JS варианти.
//   • sheetXml — устун номлари жадвалдан, эскейп бир ўтишда.
// Cloudflare'да ўлчанди (1460 қатор, 30 сўров): 71 ms → 54 ms (P50).
// wrangler.toml'да `compatibility_flags = ["nodejs_compat"]` ШАРТ —
// акс ҳолда `node:zlib` топилмай, деплой тўхтайди.

import zlib from "node:zlib";

const ENC = new TextEncoder();

/* ============================ CRC32 ============================ */
// Native бўлса — ўша (0.05 ms / 1.6 MB). Бўлмаса slicing-by-8 (1.4 ms;
// байтма-байт варианти 2.8 ms эди).
let CRC_TAB = null;
function crcTable() {
  if (CRC_TAB) return CRC_TAB;
  const t = new Uint32Array(256 * 8);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  for (let k = 1; k < 8; k++)
    for (let i = 0; i < 256; i++)
      t[k * 256 + i] = (t[(k - 1) * 256 + i] >>> 8) ^ t[t[(k - 1) * 256 + i] & 0xff];
  return (CRC_TAB = t);
}
function crc32js(buf) {
  const t = crcTable();
  let c = 0xffffffff, i = 0;
  const n = buf.length;
  for (; i + 8 <= n; i += 8) {
    const a = (c ^ (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24))) >>> 0;
    const b = (buf[i + 4] | (buf[i + 5] << 8) | (buf[i + 6] << 16) | (buf[i + 7] << 24)) >>> 0;
    c = t[1792 + (a & 0xff)] ^ t[1536 + ((a >>> 8) & 0xff)] ^ t[1280 + ((a >>> 16) & 0xff)] ^ t[1024 + (a >>> 24)] ^
        t[768 + (b & 0xff)] ^ t[512 + ((b >>> 8) & 0xff)] ^ t[256 + ((b >>> 16) & 0xff)] ^ t[b >>> 24];
  }
  for (; i < n; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const crc32 = typeof zlib.crc32 === "function" ? (buf) => zlib.crc32(buf) >>> 0 : crc32js;

/* ============================= ZIP ============================= */
// 1-даража: XML учун етарли (207 → 257 KB), CPU эса 12 ms → 3.5 ms.
const DEFLATE_LEVEL = 1;
function deflate(bytes) {
  return new Uint8Array(zlib.deflateRawSync(bytes, { level: DEFLATE_LEVEL }));
}

function w16(a, o, v) { a[o] = v & 255; a[o + 1] = (v >>> 8) & 255; }
function w32(a, o, v) { a[o] = v & 255; a[o + 1] = (v >>> 8) & 255; a[o + 2] = (v >>> 16) & 255; a[o + 3] = (v >>> 24) & 255; }

async function zip(files) {                 // files: [{name, data:Uint8Array}]
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameB = ENC.encode(f.name);
    const crc = crc32(f.data);
    const comp = deflate(f.data);
    const lh = new Uint8Array(30 + nameB.length);
    w32(lh, 0, 0x04034b50); w16(lh, 4, 20); w16(lh, 6, 0); w16(lh, 8, 8);
    w16(lh, 10, 0); w16(lh, 12, 0);
    w32(lh, 14, crc); w32(lh, 18, comp.length); w32(lh, 22, f.data.length);
    w16(lh, 26, nameB.length); w16(lh, 28, 0);
    lh.set(nameB, 30);
    parts.push(lh, comp);

    const cd = new Uint8Array(46 + nameB.length);
    w32(cd, 0, 0x02014b50); w16(cd, 4, 20); w16(cd, 6, 20); w16(cd, 8, 0); w16(cd, 10, 8);
    w16(cd, 12, 0); w16(cd, 14, 0);
    w32(cd, 16, crc); w32(cd, 20, comp.length); w32(cd, 24, f.data.length);
    w16(cd, 28, nameB.length); w16(cd, 30, 0); w16(cd, 32, 0);
    w16(cd, 34, 0); w16(cd, 36, 0); w32(cd, 38, 0); w32(cd, 42, offset);
    cd.set(nameB, 46);
    central.push(cd);
    offset += lh.length + comp.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  w32(eocd, 0, 0x06054b50); w16(eocd, 8, files.length); w16(eocd, 10, files.length);
  w32(eocd, 12, cdSize); w32(eocd, 16, offset);

  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of parts) { out.set(b, p); p += b.length; }
  for (const b of central) { out.set(b, p); p += b.length; }
  out.set(eocd, p);
  return out;
}

/* ============================= XML ============================= */
// Бир ўтишда эскейп — натижа аввалги беш `replace` билан бир хил.
// U+FFFE/U+FFFF — XML'да ТАҚИҚЛАНГАН белги: маҳсулот номида учраб қолса варақ очилмасди
const ESC_RE = /[&<>"\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g;
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escCh = (ch) => ESC_MAP[ch] || "";
function esc(s) {
  s = String(s);
  return ESC_RE.test(s) ? (ESC_RE.lastIndex = 0, s.replace(ESC_RE, escCh)) : s;
}

function colName(i) {                       // 0 -> A, 26 -> AA
  let s = "";
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
// Устун номлари бир марта ҳисобланади — ҳар катакда эмас
const COLN = Array.from({ length: 128 }, (_, i) => colName(i));
const col = (i) => COLN[i] || colName(i);

/** Сана -> Excel сериал рақами (1900 тизими) */
// Тошкент вақти (UTC+5). Cloudflare UTC'да ишлайди: 31.07 соат 19:30 UTC —
// Тошкентда 01.08 00:30. Аввал тўлов ИЮЛГА ёзилиб, ойлик файлда қарз
// нотўғри чиқарди (ботнинг ўзи эса 01.08 деб кўрсатарди).
const TOSHKENT_MS = 5 * 3600 * 1000;

export function excelDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return null;
  const t = new Date(dt.getTime() + TOSHKENT_MS);
  const kun = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.floor(kun / 86400000) + 25569;
}

/** ISO вақт («2026-09-08T14:30:00Z») -> сериал рақам, вақти каср қисмда.
    ДИҚҚАТ: сана ФИЛЬТРИда ишлатиладиган устунларга буни ЁЗМАНГ — фильтр
    чегараси бутун кун (00:00), каср қисми бор ҳужайра «<= охирги кун»
    шартидан ўтмай қолади. Фильтр устунлари учун excelDate() ишлатилади. */
export function excelDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return null;
  return (dt.getTime() + TOSHKENT_MS) / 86400000 + 25569;
}

/** «01.08.2026» -> сериал рақам */
export function ddmmyyyy(s) {
  const m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return Math.floor(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000) + 25569;
}

/** «01.08.2026 14:30» -> сериал рақам (вақти каср қисмда).
    Вақтсиз ёзилган бўлса — ddmmyyyy() билан бир хил натижа қайтади,
    шунда ҳам Excel уни МАТН эмас, САНА деб қабул қилади.            */
export function ddmmyyyyhhmm(s) {
  const kun = ddmmyyyy(s);
  if (kun === null) return null;
  const t = String(s).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!t) return kun;
  return kun + (+t[1] * 3600 + +t[2] * 60 + (+t[3] || 0)) / 86400;
}

/* ==================== УСЛУБЛАР ====================
   Ранглар ва шрифтлар фойдаланувчининг ЎЗ файлларидан олинган:
     «умумий_ҲИСОБОТ.xlsx» — умумий (админ) ҳисобот
     «Илхом (4).xlsx»                     — сотувчининг ҳисоботи
   Ҳар бир ранг ўша файллардан кўчирилган, тахмин қилинмаган.

   Услублар жадвал орқали ясалади: FONTS/FILLS/BORDERS рўйхатлари ва
   XFS жадвали. Қўлда XML ёзилса, `count=` ни янгилашни унутиш осон —
   Excel эса нотўғри count'да файлни «бузилган» деб очмайди.        */

// --- Шрифтлар. n: ном (сукут — Calibri), sz: ўлчам, b: қалин, c: ранг
const FONTS = [
  { sz: 12 },                                    // 0 админ: маълумот
  { sz: 12, b: 1 },                              // 1 админ: устун сарлавҳаси
  { sz: 12, b: 1, c: "FFFFFF" },                 // 2 админ: блок сарлавҳаси
  { sz: 16 },                                    // 3 қарздорлик: маълумот
  { sz: 16, b: 1 },                              // 4 қарздорлик: сарлавҳа/ЖАМИ
  { sz: 16, b: 1, c: "FFFFFF" },                 // 5 қарздорлик: бош сарлавҳа
  { n: "Arial", sz: 10 },                        // 6 сотувчи: маълумот
  { n: "Arial", sz: 10, b: 1 },                  // 7 сотувчи: устун сарлавҳаси
  { n: "Arial", sz: 11, b: 1 },                  // 8 сотувчи: «Сотувчи:»
  { n: "Arial", sz: 11, b: 1, c: "FFFFFF" },     // 9 сотувчи: блок сарлавҳаси
  { n: "Arial", sz: 13, b: 1, c: "1F4E79" },     // 10 сотувчи: исм
  { n: "Arial", sz: 15, b: 1, c: "FFFFFF" },     // 11 сотувчи: бош сарлавҳа
  { n: "Arial", sz: 12, b: 1 },                  // 12 сотувчи: катта рақам
  { sz: 14, b: 1 },                              // 13 🎁 бонуслар: варақ сарлавҳаси
];

// --- Фонлар (0 — фонсиз, 1 — Excel талаб қиладиган gray125)
const FILLS = [null, "gray125",
  "D9EAF7",   //  2 админ устун сарлавҳаси (очиқ кўк)
  "2F75B5",   //  3 админ «Олинган махсулотлар» бари (кўк)
  "548235",   //  4 «Тўловлар» бари (яшил)
  "1F4E78",   //  5 бош сарлавҳа бари (тўқ кўк)
  "C1E4F5",   //  6 қарздорлик зебраси (ҳаво ранг)
  "B3E5A1",   //  7 BIGANT ЖАМИ (яшил)
  "FFFF00",   //  8 бошқарув санаси (сариқ)
  "D9E2F3",   //  9 сотувчи 1-блок сарлавҳаси
  "E2EFDA",   // 10 сотувчи 2-блок сарлавҳаси
  "FCE4E4",   // 11 сотувчи 3-блок сарлавҳаси
  "FFF2CC",   // 12 сотувчи: катта қарз рақами (крем)
  "EDF3FB",   // 13 сотувчи зебра — чап блок
  "F1F7EC",   // 14 сотувчи зебра — ўнг блок
  "2E75B6",   // 15 сотувчи «1. ОЛИНГАН МАҲСУЛОТЛАР» бари
  "9C2222",   // 16 сотувчи «3. ҚАРЗДОРЛИК» бари (тўқ қизил)
  "2F5597",   // 17 🎁 бонуслар: устун сарлавҳаси (Сардор акага берилган файлдаги тўқ кўк)
  "FFE699",   // 18 🎁 бонуслар: ЖАМИ (сариқ)
];

// --- Чегаралар (0 — чегарасиз)
const BORDERS = [null,
  "000000",   // 1 админ файли — қора ингичка
  "8EA9DB",   // 2 сотувчи сарлавҳалари — кўкимтир
  "B2B2B2",   // 3 сотувчи маълумоти — кулранг
];

// --- Рақам форматлари
const NF = { OD: 0, SANA: 164, SON: 165, VAQT: 166, FOIZ: 167, DOL: 168, SOAT: 169 };   // SOAT — [h]:mm (🎁 бонуслар)

// --- Услублар жадвали: [ном, numFmt, fontId, fillId, borderId, тартиб]
//     тартиб: "c" — марказда+ўраш, "l" — чапда+вертикал марказ
const XFS = [
  ["OD",         NF.OD,   0,  0, 0],
  // ── АДМИН: Товарлар хисоботи, oplata, Сана бўйича ҳисобот (12pt Calibri)
  ["BOSH",       NF.OD,   1,  2, 1, "c"],   // устун сарлавҳаси
  ["SANA",       NF.SANA, 0,  0, 1],
  ["SON",        NF.SON,  0,  0, 1],
  ["SON_B",      NF.SON,  1,  0, 1],
  ["MATN_B",     NF.OD,   1,  0, 1],
  ["KATTA",      NF.OD,   5,  5, 0, "l"],   // бош сарлавҳа бари
  ["SANA_VAQT",  NF.VAQT, 0,  0, 1],
  ["FOIZ",       NF.FOIZ, 0,  0, 1],
  ["MATN",       NF.OD,   0,  0, 1],
  ["BLOK",       NF.OD,   2,  3, 1, "l"],   // «Олинган махсулотлар» — кўк бар
  ["BLOK_YASHIL", NF.OD,  2,  4, 1, "l"],   // «Тўловлар» — яшил бар
  // Марказда (Руслан 2026-09-26: «the headers must be in the middle») — батафсил ҳисобот блок сарлавҳалари
  ["BLOK_M",     NF.OD,   2,  3, 1, "c"],
  ["BLOK_YASHIL_M", NF.OD, 2, 4, 1, "c"],
  // ── АДМИН: Қарздорлик умумий (16pt Calibri)
  ["Q_BOSH",     NF.OD,   4,  0, 1, "c"],
  ["Q_MATN",     NF.OD,   3,  0, 1],
  ["Q_SON",      NF.SON,  3,  0, 1],
  ["Q_FOIZ",     NF.FOIZ, 3,  0, 1],
  ["Q_SANA",     NF.SANA, 3,  0, 1],
  ["Q_ZEBRA",    NF.OD,   3,  6, 1],
  ["Q_ZEBRA_SON", NF.SON, 3,  6, 1],
  ["Q_ZEBRA_FOIZ", NF.FOIZ, 3, 6, 1],
  ["JAMI_M",     NF.OD,   4,  7, 1],
  ["JAMI",       NF.SON,  4,  7, 1],
  ["JAMI_FOIZ",  NF.FOIZ, 4,  7, 1],
  ["SARIQ_M",    NF.OD,   4,  8, 1],        // бошқарув: изоҳ (сариқ)
  ["SARIQ_M_C",  NF.OD,   4,  8, 1, "c"],   // ўша сариқ, марказда — батафсил ҳисобот «Сана» сарлавҳаси (Руслан 2026-09-26)
  ["SARIQ_SANA", NF.SANA, 4,  8, 1],        // бошқарув: сана (сариқ)
  ["SARIQ_SON",  NF.SON,  4,  8, 1],        // бошқарув: курс (сариқ, сон)
  ["YAKUN",      NF.OD,   4,  0, 1],        // бошқарув: қолган изоҳлар
  ["YAKUN_SON",  NF.SON,  4,  0, 1],
  ["YAKUN_SANA", NF.SANA, 4,  0, 1],
  ["YAKUN_VAQT", NF.VAQT, 4,  0, 1],
  // ── СОТУВЧИ файли (Arial)
  ["S_KATTA",    NF.OD,  11,  5, 0, "l"],   // бош сарлавҳа бари
  ["S_ISM_L",    NF.OD,   8,  0, 0],        // «Сотувчи:»
  ["S_ISM",      NF.OD,  10,  0, 0],        // исм — тўқ кўк ҳарф
  ["S_BLOK1",    NF.OD,   9, 15, 0, "l"],   // 1. ОЛИНГАН МАҲСУЛОТЛАР
  ["S_BLOK2",    NF.OD,   9,  4, 0, "l"],   // 2. ТЎЛОВЛАР
  ["S_BLOK3",    NF.OD,   9, 16, 0, "l"],   // 3. ҚАРЗДОРЛИК
  ["S_BOSH1",    NF.OD,   7,  9, 2, "c"],
  ["S_BOSH2",    NF.OD,   7, 10, 2, "c"],
  ["S_BOSH3",    NF.OD,   7, 11, 2, "c"],
  ["S_MATN",     NF.OD,   6,  0, 3],
  ["S_SON",      NF.SON,  6,  0, 3],
  ["S_SANA",     NF.SANA, 6,  0, 3],
  ["S_VAQT",     NF.VAQT, 6,  0, 3],
  ["S_FOIZ",     NF.FOIZ, 6,  0, 3],
  ["S_Z1",       NF.OD,   6, 13, 3],        // зебра — чап блок
  ["S_Z1_SON",   NF.SON,  6, 13, 3],
  ["S_Z1_SANA",  NF.SANA, 6, 13, 3],
  ["S_Z1_VAQT",  NF.VAQT, 6, 13, 3],
  ["S_Z2",       NF.OD,   6, 14, 3],        // зебра — ўнг блок
  ["S_Z2_SON",   NF.SON,  6, 14, 3],
  ["S_Z2_SANA",  NF.SANA, 6, 14, 3],
  ["S_Z2_FOIZ",  NF.FOIZ, 6, 14, 3],
  ["S_KATTA_SON", NF.SON, 12, 12, 3],       // катта қарз рақами (крем)
  // ── ДОЛЛАР катаклари: сўм билан бир хил кўриниш, лекин ИККИ хона
  //    ("3 809,69" — доллар тийинисиз ёзилса рақам ёлғон чиқади).
  ["SON_D",        NF.DOL,  0,  0, 1],
  ["SON_B_D",      NF.DOL,  1,  0, 1],
  ["Q_SON_D",      NF.DOL,  3,  0, 1],
  ["Q_ZEBRA_SON_D", NF.DOL, 3,  6, 1],
  ["JAMI_D",       NF.DOL,  4,  7, 1],
  ["S_SON_D",      NF.DOL,  6,  0, 3],
  ["S_Z1_SON_D",   NF.DOL,  6, 13, 3],
  ["S_Z2_SON_D",   NF.DOL,  6, 14, 3],
  ["S_KATTA_SON_D", NF.DOL, 12, 12, 3],
  // ── 🎁 БОНУСЛАР (src/bonus.js): Сардор ака суммани ўзи ёзадиган катак — крем фон.
  //    Рўйхат ОХИРИГА қўшилди: юқоридаги услубларнинг рақами ўзгармайди.
  ["BN_SUMMA",     NF.SON,  0, 12, 1],
  // Сардор акага берилган «Рағбатлантириш ва бонус» файлининг кўриниши (Достон 2026-09-17: «бир хил бўлсин»)
  ["BN_SARLAVHA",  NF.OD,  13,  0, 0, "c"],   // варақ сарлавҳаси
  ["BN_DAVR",      NF.OD,   0,  0, 0, "c"],   // давр қатори
  ["BN_BOSH",      NF.OD,   2, 17, 1, "c"],   // устун сарлавҳаси: тўқ кўк, оқ ҳарф
  ["BN_GURUH",     NF.OD,   1,  9, 1],        // ходим гуруҳи қатори: оч кўк
  ["BN_GURUH_SON", NF.SON,  1,  9, 1],
  ["BN_GURUH_SOAT", NF.SOAT, 1, 9, 1],
  ["BN_SOAT",      NF.SOAT, 0,  0, 1, "c"],   // ишлаган вақти [h]:mm
  ["BN_JAMI",      NF.OD,   1, 18, 1],        // ЖАМИ: сариқ
  ["BN_JAMI_SON",  NF.SON,  1, 18, 1],
  ["BN_JAMI_SOAT", NF.SOAT, 1, 18, 1],
  // 👥 Иловадан қўшилган ходим (Достон 2026-09-18): Сардор ака дарров кўрсин — оч яшил
  ["BN_QOSH",      NF.OD,   0, 10, 1],
  ["BN_QOSH_B",    NF.OD,   1, 10, 1],
];

const xmlRang = (rgb) => `<color rgb="FF${rgb}"/>`;

const fontXml = (f) =>
  `<font>${f.b ? "<b/>" : ""}<sz val="${f.sz}"/>` +
  `${f.c ? xmlRang(f.c) : ""}<name val="${f.n || "Calibri"}"/></font>`;

const fillXml = (v) =>
  v === null ? `<fill><patternFill patternType="none"/></fill>`
  : v === "gray125" ? `<fill><patternFill patternType="gray125"/></fill>`
  : `<fill><patternFill patternType="solid">` +
    `<fgColor rgb="FF${v}"/><bgColor indexed="64"/></patternFill></fill>`;

const borderXml = (v) => {
  if (v === null) return `<border><left/><right/><top/><bottom/><diagonal/></border>`;
  const yon = (t) => `<${t} style="thin">${xmlRang(v)}</${t}>`;
  return `<border>${yon("left")}${yon("right")}${yon("top")}${yon("bottom")}<diagonal/></border>`;
};

const xfXml = ([, nf, fo, fi, bo, tartib]) => {
  const bayroq = (nf ? ' applyNumberFormat="1"' : "") + (fo ? ' applyFont="1"' : "") +
                 (fi ? ' applyFill="1"' : "") + (bo ? ' applyBorder="1"' : "") +
                 (tartib ? ' applyAlignment="1"' : "");
  const bosh = `<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" ` +
               `borderId="${bo}" xfId="0"${bayroq}`;
  if (!tartib) return bosh + "/>";
  const al = tartib === "c"
    ? `<alignment horizontal="center" vertical="center" wrapText="1"/>`
    : `<alignment horizontal="left" vertical="center"/>`;
  return `${bosh}>${al}</xf>`;
};

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="6"><numFmt numFmtId="164" formatCode="DD.MM.YYYY"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="DD.MM.YYYY HH:MM"/><numFmt numFmtId="167" formatCode="0.0%"/><numFmt numFmtId="168" formatCode="#,##0.00"/><numFmt numFmtId="169" formatCode="[h]:mm"/></numFmts>
<fonts count="${FONTS.length}">${FONTS.map(fontXml).join("")}</fonts>
<fills count="${FILLS.length}">${FILLS.map(fillXml).join("")}</fills>
<borders count="${BORDERS.length}">${BORDERS.map(borderXml).join("")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${XFS.length}">${XFS.map(xfXml).join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Услуб номи -> cellXfs индекси */
export const S = Object.fromEntries(XFS.map(([nom], i) => [nom, i]));

/** Сўм услубининг ДОЛЛАР эгизаги: фон, шрифт, чегара — ўша, формат —
 *  икки хонали. dollar(S.Q_SON) → S.Q_SON_D. Эгизаги йўқ бўлса ўзи. */
const DOL_JUFT = Object.fromEntries(
  XFS.map(([nom]) => nom).filter((nom) => S[nom + "_D"] !== undefined)
     .map((nom) => [S[nom], S[nom + "_D"]]));
export const dollar = (uslub) => DOL_JUFT[uslub] ?? uslub;

function sheetXml(sheet) {
  // Натижа аввалги вариант билан БАЙТМА-БАЙТ бир хил; фақат тезроқ:
  // катак манзили жадвалдан, сатр битта string'га йиғилади.
  const rows = [];
  const R = sheet.rows;
  for (let r = 0; r < R.length; r++) {
    const cells = R[r];
    const rn = r + 1;
    let out = "";
    for (let ci = 0; ci < cells.length; ci++) {
      const c = cells[ci];
      if (c === null || c === undefined || c === "") continue;
      const cell = typeof c === "object" ? c : { v: c };
      const ref = col(ci) + rn;
      const s = cell.s ? ` s="${cell.s}"` : "";
      if (cell.f) {
        out += `<c r="${ref}"${s}><f>${esc(cell.f)}</f></c>`;
      } else if (typeof cell.v === "number") {
        out += `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
      } else {
        out += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
      }
    }
    /* Қатор баландлиги (Руслан 2026-09-26): ўралган (wrapText) сарлавҳа катаклари
     * баландлик берилмаса баъзи дастурларда бир қаторга қисилиб, иккинчи сатри
     * кўринмай қоларди. sheet.rowHt = { 2: 32 } — 2-қатор 32pt. */
    const ht = sheet.rowHt && sheet.rowHt[rn] ? ` ht="${sheet.rowHt[rn]}" customHeight="1"` : "";
    if (out) rows.push(`<row r="${rn}"${ht}>${out}</row>`);
  }

  const cols = (sheet.cols || []).length
    ? `<cols>${sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const freeze = sheet.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const filter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "";
  // ДИҚҚАТ: XML схемаси бўйича mergeCells autoFilter дан КЕЙИН туриши шарт,
  // акс ҳолда Excel файлни «бузилган» деб очмайди.
  const merge = (sheet.merge || []).length
    ? `<mergeCells count="${sheet.merge.length}">` +
      sheet.merge.map((r) => `<mergeCell ref="${r}"/>`).join("") + "</mergeCells>"
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows.join("")}</sheetData>${filter}${merge}</worksheet>`;
}

/**
 * Иш китобини яратади.
 * @param {Array<{name, rows, cols?, freeze?, autoFilter?, merge?, rowHt?}>} sheets
 * @returns {Promise<Uint8Array>} .xlsx файл байтлари
 */
export async function buildXlsx(sheets) {
  const files = [];
  files.push({
    name: "[Content_Types].xml",
    data: ENC.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`),
  });
  files.push({
    name: "_rels/.rels",
    data: ENC.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
  });
  files.push({
    name: "xl/workbook.xml",
    // fullCalcOnLoad — очилганда формулалар ҚАЙТА ҲИСОБЛАНАДИ (биз кэшланган
    // қийматларни ёзмаймиз, шусиз катакчалар бўш кўринарди)
    data: ENC.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
<calcPr calcId="0" fullCalcOnLoad="1"/>
</workbook>`),
  });
  files.push({
    name: "xl/_rels/workbook.xml.rels",
    data: ENC.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
  });
  files.push({ name: "xl/styles.xml", data: ENC.encode(STYLES) });
  sheets.forEach((s, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: ENC.encode(sheetXml(s)) });
  });
  return zip(files);
}

// src/sf/import.js (СФ бот): шаблонни патчлаш учун ZIP ёзувчи ва XML қочириш
export { zip, esc as xmlEsc };

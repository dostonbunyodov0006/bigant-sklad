export const pul = (n) => {
  const neg = n < 0;
  return (neg ? "−" : "") + Math.round(Math.abs(n || 0)).toLocaleString("ru-RU");
};
export const dol = (n, k = 2) => {
  const neg = n < 0;
  return (neg ? "−" : "") + Math.abs(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: k, maximumFractionDigits: k });
};
/* Қарз кўриниши (Достон 2026-09-24): «қарздор/ҳақдор» сўзи ЙЎҚ.
   Қарзи бор → «−123,45» (сариқ) · ортиқча тўлаган → «+123,45» (яшил) · 0 → «0,00» */
/** Қарз матни (Достон 2026-09-25, хўжайиннинг жадвалидаги қоида):
 *    қарздор  → белгисиз, сариқ рангда      «6 344,36»
 *    ҳақдор   → «−» билан, яшил рангда      «−14 290,75»
 *  Ранг чақирувчи жойда class:amb / class:gr билан берилади. */
export const qarzMatn = (n, k = 2) => ((n || 0) < 0 ? "−" : "") + dol(Math.abs(n || 0), k);
export const qisqa = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return (n / 1e9).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " млрд";
  if (a >= 1e6) return (n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " млн";
  return pul(n);
};
export const OY = ["Январ", "Феврал", "Март", "Апрел", "Май", "Июн", "Июл", "Август", "Сентябр", "Октябр", "Ноябр", "Декабр"];
export const OYQ = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const HAFTA = ["Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба", "Якшанба"];
export function oyNomi(kod) { const [y, m] = String(kod).split("-"); return `${OY[+m - 1] || m} ${y}`; }
/** ISO/«dd.mm.yyyy»/«yyyy-mm-dd» → «12 сен» */
export function sanaQ(s) {
  const t = String(s || "");
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${+m[3]} ${OYQ[+m[2] - 1]}`;
  m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${+m[1]} ${OYQ[+m[2] - 1]}`;
  return t;
}
export function ddmm(s) {
  const t = String(s || "");
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}`;
  m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[1]}.${m[2]}`;
  return t;
}
export function yosh(ms) {
  const s = ms / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + " дақ";
  if (s < 86400) return Math.round(s / 3600) + " соат";
  return Math.round(s / 86400) + " кун";
}
const ikki = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getUTCFullYear()}-${ikki(d.getUTCMonth() + 1)}-${ikki(d.getUTCDate())}`;
export function kunQosh(sana, n) { const d = new Date(sana + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
export function haftaKuni(sana) { const k = new Date(sana + "T00:00:00Z").getUTCDay(); return HAFTA[(k + 6) % 7]; }
export function haftaKod(sana) {
  const d = new Date(sana + "T00:00:00Z");
  const kun = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - kun);
  const y = d.getUTCFullYear();
  return `${y}-W${ikki(Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7))}`;
}
/** Меню экрани қайси ҳафтани очади. Достон 2026-09-14: «меню шанба куни
 *  кечқурун кейинги ҳафта учун ўзгартирилади». Шунинг учун ШАНБА ва
 *  ЯКШАНБА — КЕЙИНГИ ҳафта; қолган кунлар — шу ҳафта. */
export function menyuHaftasi(bugun) {
  const k = new Date(bugun + "T00:00:00Z").getUTCDay();
  return k === 6 || k === 0 ? haftaSilj(haftaKod(bugun), 1) : haftaKod(bugun);
}
/** «Бу ҳафта» / «Кейинги ҳафта» / «Ўтган ҳафта» */
export function haftaNomi(kod, bugun) {
  const joriy = haftaKod(bugun);
  if (kod === joriy) return "Бу ҳафта";
  if (kod === haftaSilj(joriy, 1)) return "Кейинги ҳафта";
  if (kod === haftaSilj(joriy, -1)) return "Ўтган ҳафта";
  return "";
}
export function haftaSilj(kod, n) { // «2026-W38» ± n ҳафта
  const m = String(kod).match(/^(\d{4})-W(\d{2})$/);
  const jan4 = new Date(Date.UTC(+m[1], 0, 4));
  const k = jan4.getUTCDay() || 7;
  const dush = jan4.getTime() - (k - 1) * 86400000 + (+m[2] - 1 + n) * 7 * 86400000;
  return haftaKod(iso(new Date(dush)));
}
export function oyOldingi(kod) { const [y, m] = kod.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${ikki(d.getUTCMonth() + 1)}`; }

const BIR = ["", "бир", "икки", "уч", "тўрт", "беш", "олти", "етти", "саккиз", "тўққиз"];
const ON = ["", "ўн", "йигирма", "ўттиз", "қирқ", "эллик", "олтмиш", "етмиш", "саксон", "тўқсон"];
function uchlik(n) { const y = Math.floor(n / 100), o = Math.floor((n % 100) / 10), b = n % 10; return [y ? BIR[y] + " юз" : "", ON[o], BIR[b]].filter(Boolean).join(" "); }
/** 11 100 000 → «ўн бир миллион юз минг сўм» */
export function sozda(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (!n) return "";
  const p = [];
  const mlrd = Math.floor(n / 1e9), mln = Math.floor((n % 1e9) / 1e6), ming = Math.floor((n % 1e6) / 1e3), q = n % 1000;
  if (mlrd) p.push(uchlik(mlrd) + " миллиард");
  if (mln) p.push(uchlik(mln) + " миллион");
  if (ming) p.push((ming === 1 ? "" : uchlik(ming) + " ") + "минг");
  if (q) p.push(uchlik(q));
  return p.join(" ") + " сўм";
}
export const HOLAT = {
  ochiq: ["Гуруҳда · платёжка кутилмоқда", "amb"], qisman: ["Қисман тўланди", "amb"], takror: ["Такрор — қарор керак", "rd"],
  tasdiq_kutmoqda: ["Масъул тасдиғи кутилмоқда", "amb"], yopildi: ["Тўланди — қарздан айирилди", "gr"],
  // «Қарзимдан минус» тасдиқланди — сотувчи қарори кўриб турсин (Достон 2026-09-16)
  tasdiqlandi: ["Тасдиқланди — қарздан айирилди", "gr"], bekor: ["Бекор қилинди", "muted"],
  muddat: ["Муддати ўтди", "muted"], rad: ["Рад этилди", "rd"],
  // Чек гуруҳда ёзилмаса — сотувчига ИЛОВАДА (Достон 2026-09-21)
  chek_tekshir: ["Чек текширувдан ўтмади · бухгалтер кўрмоқда", "amb"],
  chek_rad: ["Чек ёзилмади · бухгалтер тўғри чекни ташлайди", "rd"],
  tolov_bekor: ["Тўлов бекор қилинди · қайта кутилмоқда", "rd"],
};

/* 🔢 МАЙДОНДАГИ СОННИ ЎҚИШ (Руслан 2026-10-10). Аввал экранлар ҳар бир
   рақам бўлмаган белгини ўчирарди: «11 100 000,00» → 1 110 000 000 (100×),
   «12650.35» курси → 1 265 035. Энди охирги ажратгичдан кейин 3 та рақам
   бўлмаса (ёки олди минглик гуруҳга ўхшамаса) — у КАСР қисми.
     summaOqi: каср (тийин) ташланади — «11 100 000,00» → 11100000
     kursOqi:  каср сақланади         — «12 650,35»    → 12650.35        */
function sonQism(v) {
  const t = String(v ?? "").replace(/[^\d.,]/g, "");
  const m = t.match(/^(.*?)([.,])(\d+)$/);
  // «12.650» / «1,000» — минглик гуруҳ; «12650.355» — каср
  if (!m || !m[1] || (m[3].length === 3 && /^\d{1,3}([.,]\d{3})*$/.test(m[1])))
    return { butun: t.replace(/\D/g, ""), kasr: "" };
  return { butun: m[1].replace(/\D/g, ""), kasr: m[3] };
}
export function summaOqi(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const { butun, kasr } = sonQism(v);
  // «12,50» каби кичик сон — эскидек бир бутун (1250); тийин фақат 4+ хонали суммада
  if (kasr && (kasr.length > 2 || butun.length < 4)) return Number(butun + kasr) || 0;
  return Number(butun) || 0;
}
export function kursOqi(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const { butun, kasr } = sonQism(v);
  return Number(butun + (kasr ? "." + kasr : "")) || 0;
}

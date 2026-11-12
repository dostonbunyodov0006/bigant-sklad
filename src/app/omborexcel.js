// src/app/omborexcel.js — «Бигант омбор» Excel'и БОТНИНГ ЎЗ ФАЙЛИ билан.
//
// Достон 2026-09-16: «exel ichida qanday ustunlar bo'lsa ular umuman o'zgarmasin».
// Шунинг учун Mini App'даги Омбор Excel'и ботнинг omborExcel() функцияси билан
// ясалади — админда 4 варақ (Товарлар хисоботи · oplata · Сана бўйича ҳисобот ·
// Қарздорлик умумий), сотувчида битта «ҲИСОБОТ» варағи. Ҳеч нарса қайта ҳисобланмайди.
//
// Сана оралиғи (илованинг календари) ботнинг «Сана бўйича ҳисобот»и каби
// берилади: dan/gacha — Excel сериал санаси. шерикнинг омбори Excel'и (src/app/excel.js) ўзгармайди.
import { omborExcel } from "../ombor.js";
import { ISM } from "../sklad.js";
import { ddmmyyyy } from "../xlsxout.js";

const isoDdmm = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};
const serial = (iso) => { const d = isoDdmm(iso); return d ? ddmmyyyy(d) : null; };
const toza = (s) => String(s).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "hisobot";

/**
 * @param {object} env
 * @param {{sotuvchi?:number, dan?:string, gacha?:string}} p  dan/gacha — "YYYY-MM-DD"
 * @returns {Promise<{ok:true, bytes, nom, izoh} | {ok:false, xato}>}
 */
export async function omborExcelBayt(env, { sotuvchi = 0, dan = "", gacha = "", tur = "" } = {}) {
  // 📑 «Батафсил ҳисобот» — учта блок ёнма-ён, бухгалтерия файлидагидек (Достон 2026-09-23)
  if (tur === "batafsil") {
    const { batafsilExcel } = await import("./umumiy.js");
    const e = await batafsilExcel(env, dan || "2000-01-01", gacha, sotuvchi);
    return { ok: true, bytes: e.bytes, nom: e.nom, izoh: "" };
  }
  const hammasi = !dan || dan <= "2000-01-01";
  const opt = {};
  if (!hammasi) opt.dan = serial(dan);
  if (gacha) opt.gacha = serial(gacha);
  const izoh = hammasi ? `${isoDdmm(gacha) || "бугун"} ҳолатига` : `${isoDdmm(dan)} – ${isoDdmm(gacha)}`;
  opt.izoh = izoh;
  if (sotuvchi) opt.sotuvchi = Number(sotuvchi);
  const bytes = await omborExcel(env, opt);
  if (!bytes) return { ok: false, xato: "Ҳисобот ҳали юкланмаган" };
  const nom = toza(sotuvchi
    ? `${ISM[sotuvchi] || sotuvchi} — Омбор ҳисоботи — ${izoh}`
    : `Бигант омбор — ${izoh}`) + ".xlsx";
  return { ok: true, bytes, nom, izoh };
}

/* ── 📥 Илованинг ЎЗИДАН юклаб олиш (Telegram.WebApp.downloadFile) ──
   Telegram файлни имзосиз сўрайди, шунинг учун: рухсат /excel да текширилади,
   кейин 5 дақиқалик махфий ҳавола берилади. 2026-09-21: аввал БИР МАРТАЛИК эди — Telegram
   Desktop файлни икки марта сўрайди (текшириш + юклаш), иккинчисига 404 кетиб Excel
   юкланмасди (Достон: «downloads'да бошқа файл очиляпти»). Энди 5 дақиқа ичида қайта ишлайди. */
const HAVOLA_UMR = 300;
const kalit = (t) => `app:xl:${t}`;

export async function havolaYarat(env, uid, sorov) {
  const e = await omborExcelBayt(env, sorov);          // маълумот борлигини олдиндан билиш учун
  if (!e.ok) return e;
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const t = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  await env.ACCESS_KV.put(kalit(t), JSON.stringify({ uid: Number(uid), sorov, vaqt: Date.now() }), { expirationTtl: HAVOLA_UMR });
  return { ok: true, url: `/api/excel/fayl?t=${t}`, nom: e.nom, umr: HAVOLA_UMR };
}

export async function havolaOch(env, t) {
  const kod = String(t || "").trim();
  if (!/^[0-9a-f]{32}$/.test(kod)) return { ok: false, xato: "Ҳавола нотўғри" };
  const xom = await env.ACCESS_KV.get(kalit(kod));
  if (!xom) return { ok: false, xato: "Ҳавола эскирди — тугмани қайта босинг" };
  let y;
  try { y = JSON.parse(xom); } catch { return { ok: false, xato: "Ҳавола бузуқ" }; }
  return omborExcelBayt(env, y.sorov || {});
}

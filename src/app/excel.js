// src/app/excel.js — Mini App: давр бўйича Excel (Руслан 2026-09-15: «календардан Excel»).
// Файл фойдаланувчининг ЎЗ чатига (ботдан) юборилади — Telegram WebView'да файл юклаб олиш ишончсиз.
import { buildXlsx, S } from "../xlsxout.js";
import { yozishMumkin } from "../taqiq.js";

const ddmm = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(s || ""); };
const davrMatn = (r) => (r.dan <= "2000-01-01" ? `${ddmm(r.gacha)} ҳолатига` : `${ddmm(r.dan)} – ${ddmm(r.gacha)}`);
const manbaNomi = () => "Бигант омбор";
const N = (v) => ({ v: Number(v) || 0, s: S.SON });
const B = (v) => ({ v, s: S.BOSH });
const T = (v) => ({ v: String(v ?? ""), s: S.MATN });
const BB = (v) => ({ v, s: S.MATN_B });
const NB = (v) => ({ v: Number(v) || 0, s: S.SON_B });
const son = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const yax2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

/** Ҳамма сотувчи — давр */
export function davrJadval(r) {
  /* 🔙 «+ Товар» устуни СОФ сумма (возврат айирилган) — 24 $ қаерга кетгани
   * кўринмасди. Возврат бўлса, алоҳида устун қўшилади (Руслан 2026-09-24). */
  const jamiVoz = yax2(r.satrlar.reduce((a, s) => a + son(s.vozvrat), 0));
  const vozBor = jamiVoz !== 0;
  const rows = [
    [{ v: `Қарздорлик · ${manbaNomi(r.manba)} · ${davrMatn(r)} (${r.valyuta})`, s: S.KATTA }],
    [],
    [B("Сотувчи"), B(`Бошида ${ddmm(r.dan <= "2000-01-01" ? "" : r.dan) || "(бошланғич)"}`), B("+ Товар"),
     ...(vozBor ? [B("− Возврат")] : []), B("− Тўлов"), B(`Охирида ${ddmm(r.gacha)}`), B("Ҳолат")],
  ];
  for (const s of r.satrlar) rows.push([T(s.ism), N(s.boshida), N(yax2(s.tovar + son(s.vozvrat))),
    ...(vozBor ? [son(s.vozvrat) ? N(son(s.vozvrat)) : T("")] : []), N(s.tolangan), NB(s.oxirida), T(s.holat)]);
  rows.push([BB("Жами"), NB(r.jamiBoshida), NB(yax2(r.jamiTovar + jamiVoz)),
    ...(vozBor ? [NB(jamiVoz)] : []), NB(r.jamiTolangan), NB(r.jamiOxirida), T("")]);
  return [{ name: "Қарздорлик", rows, cols: [22, 16, 14, ...(vozBor ? [14] : []), 14, 16, 14], freeze: 3 }];
}
/** Бир сотувчи — давр: ҳисоб, тўловлар, товар (кунлар бўйича) */
export function sotuvchiJadval(h) {
  const v = h.valyuta;
  /* 🔙 Возврат (Руслан 2026-09-24): «Олинган товар» СОФ сумма — қайтган моллар
   * айирилган. Шунинг учун Товар варағида қатор суммалари «Жами» билан мос
   * келмасди: қайтган қатор тўлиқ нархда кўринарди. Энди алоҳида устун бор. */
  const voz = son(h.vozvrat);
  const hisob = [
    [{ v: `${h.ism} · ${manbaNomi(h.manba)} · ${davrMatn(h)}`, s: S.KATTA }], [],
    [T("Бошида"), N(h.boshida)], [T("Олинган товар"), N(yax2(h.tovar + voz))],
    ...(voz ? [[T("Возврат (қайтган)"), N(voz)]] : []),
    [T("Тўланган"), N(h.tolangan)], [BB(`Охирида (${v})`), NB(h.oxirida)], [T("Ҳолат"), T(h.holat)],
  ];
  const tol = [[B("Сана"), B("Сумма"), B("Изоҳ"), B("Манба")]];
  for (const p of h.tolovlar) tol.push([T(ddmm(p.sana)), N(p.som), T(p.izoh), T(p.manba)]);
  tol.push([BB("Жами"), NB(h.tolangan), T(""), T("")]);
  const tov = [[B("Сана"), B("Маҳсулот"), B("Сони"), B("Хар."), B(`Суммаси (${v})`),
                ...(voz ? [B("Возврат")] : [])]];
  for (const k of h.kunlar) for (const m of k.mahsulotlar)
    tov.push([T(ddmm(m.sana)), T(m.nom), N(m.soni), T(m.xar || ""), N(m.summa),
              ...(voz ? [m.qaytgan ? N(m.summa) : T("")] : [])]);
  tov.push([BB("Жами"), T(""), T(""), T(""), NB(yax2(h.tovar + voz)), ...(voz ? [NB(voz)] : [])]);
  return [{ name: "Ҳисоб", rows: hisob, cols: [22, 16] }, { name: "Тўловлар", rows: tol, cols: [12, 16, 14, 14], freeze: 1 },
          { name: "Товар", rows: tov, cols: [12, 44, 10, 12, 14, ...(voz ? [14] : [])], freeze: 1 }];
}
/** Файлни фойдаланувчининг ЎЗ чатига юбориш (ҳеч қачон гуруҳга эмас) */
export async function faylYubor(env, chatId, bytes, nom, izoh) {
  // 🚫 Тақиқланган одам (Абдумажид) — файл ҳам юборилмайди (src/taqiq.js)
  if (!yozishMumkin("sendDocument", { chat_id: chatId })) return { ok: false, xato: "Бу аккаунтга бот хабар юбормайди" };
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("document", new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nom);
  if (izoh) fd.append("caption", izoh);
  let r;
  try { r = await (await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: "POST", body: fd })).json(); }
  catch (e) { return { ok: false, xato: "Telegram'га юбориб бўлмади: " + String(e) }; }
  if (!r || !r.ok) return { ok: false, xato: r && /blocked|chat not found/i.test(r.description || "") ? "Аввал @bigant_innovation_bot га Start босинг" : "Telegram'га юбориб бўлмади" };
  return { ok: true };
}
export async function excelYubor(env, chatId, sheets, nom, izoh) {
  const bytes = await buildXlsx(sheets);
  return faylYubor(env, chatId, bytes, nom, izoh);
}
export const faylNomi = (t) => String(t).replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, "_").slice(0, 60);

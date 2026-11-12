// src/pdfkut.js — 📄 «Пул чиқариш File» учун: одам БОТГА ташлаган счёт файлини
// эслаб қоламиз.
//
// Достон 2026-09-25: «tg botga, @bigant_innovation_bot ga tashladi faylni —
// pdf emas, FAYLNI sotuvchi botdan o'qib ol, guruhda emas. "PDF" deb nomlab
// qoida qilib qo'yma — fayl tashladi. Superadminda ham shu ishlar bo'lsin».
//
// Шунинг учун:
//   • ФАҚАТ ШАХСИЙ чат (бот). Гуруҳ ҳисобга олинмайди.
//   • ҲАР ҚАНДАЙ файл (мимеси муҳим эмас). PDF бўлса — ичи ўқилиб, фирма ва
//     сумма ўзи тўлади; бошқа тур бўлса — файл бириктирилади, майдонларни
//     одам ўзи ёзади.
//   • Сотувчи ҲАМ, омбор админи (супер админ) ҲАМ ташлай олади.
//
// МУҲИМ: бу ерда файл ЮКЛАНМАЙДИ ва нейрон САРФЛАНМАЙДИ — фақат `file_id`
// ёзиб қўйилади. Ичи одам иловадаги тугмани босганда ўқилади
// (src/app/sorov.js → pdfKutOqi).
//
// Калит ҳар одамга АЛОҲИДА (`omb:pdfkut:<uid>`) — иккиталаси бир вақтда
// файл ташласа, битта умумий калитда бир-бирини ўчириб юборарди.
import { kvGet, kvPut, isOmborSotuvchi, isOmborAdmin, pdfMatn, hujjatOqi } from "./ombor.js";

/** Ёзув шунча вақт яшайди. Эскиси «йўқ» деб ҳисобланади. */
export const PDFKUT_UMR = 24 * 3600 * 1000;                 // 24 соат
export const pdfKutKey = (uid) => `omb:pdfkut:${Number(uid)}`;

/* ── НЕГА D1 (Достон 2026-09-25: «file tashladim, 2 daqiqadan keyin ochildi») ──
   Cloudflare KV — «охир-оқибат изчил»: калит ТОПИЛМАГАНИ ҳам чекка серверда
   60 сония кэшланади. Бот файлни ёзгунча илова бир марта «йўқ» деб ўқиб
   улгурса, ўша «йўқ» бир дақиқа туриб қоларди (Достонда 2 дақиқа бўлди).
   D1 (SQL) эса КУЧЛИ ИЗЧИЛ — ёзилган заҳоти ўқилади. Шунинг учун асосий
   манба D1, KV эса ЗАХИРА (D1 ишламай қолса ҳам оқим тўхтамасин).
   шерикнинг омбори жадвалларига тегилмайди — бу АЛОҲИДА `omb_pdfkut` жадвали. */
let jadvalTayyor = false;
async function d1(env) {
  if (!env || !env.DB || typeof env.DB.prepare !== "function") return null;
  if (!jadvalTayyor) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS omb_pdfkut (uid INTEGER PRIMARY KEY, malumot TEXT, vaqt INTEGER)").run();
    jadvalTayyor = true;
  }
  return env.DB;
}

/** Склад файли — БОШҚА оқим (Basko юклаш, ombor.js → omborFayl). Тегмаймиз. */
const skladFayl = (nom) => /\.(xlsx|xls|csv|txt)$/i.test(String(nom || ""));
export const pdfmi = (nom, mime) =>
  String(mime || "") === "application/pdf" || /\.pdf$/i.test(String(nom || ""));

/**
 * Одам ботга файл ташладими — эслаб қоламиз.
 * ҲЕЧ ҚАЧОН `true` қайтармайди: хабар «ейилмайди», бошқа ишловчилар
 * ўз ишини қилаверади (bonusYoz каби «жимгина ёзиб олувчи»).
 */
export async function pdfKutEslab(ctx, message, access = null) {
  try {
    const env = ctx && ctx.env;
    if (!env || !message) return false;
    // Ҳужжат ҳам, РАСМ ҳам бўлади (Достон 2026-09-25: счётни сурат қилиб ҳам
    // ташлайди). Расмда file_name йўқ — «счёт расм» деб ёзилади.
    const rasm = !message.document && Array.isArray(message.photo) && message.photo.length
      ? message.photo[message.photo.length - 1] : null;
    const d = message.document || (rasm ? { ...rasm, file_name: "счёт расм.jpg", mime_type: "image/jpeg" } : null);
    if (!d || !d.file_id) return false;
    // ФАҚАТ бот билан шахсий чат (Достон 2026-09-25: «guruhda emas»)
    if (!message.chat || message.chat.type !== "private") return false;
    const uid = message.from && message.from.id;
    if (!uid) return false;
    // Сотувчи ёки омбор админи (супер админ ҳам)
    if (!isOmborSotuvchi(uid) && !isOmborAdmin(uid, access)) return false;
    const nom = String(d.file_name || "").slice(0, 120);
    if (skladFayl(nom)) return false;              // Basko .xlsx — бошқа оқим
    const yozuv = {
      id: d.file_id,
      nom: nom || "счёт",
      olcham: Number(d.file_size || 0),
      mime: String(d.mime_type || ""),
      pdf: pdfmi(nom, d.mime_type),
      rasm: Boolean(rasm),
      vaqt: Date.now(),
    };
    await pdfKutYoz(env, uid, yozuv);
    // Қисқа тасдиқ — одам «кетдими-йўқми» деб иккиланиб турмасин
    if (ctx.tg && ctx.token) {
      await ctx.tg(ctx.token, "sendMessage", { chat_id: message.chat.id,
        text: "📎 Файл олинди — иловада «Пул чиқариш File» ни босинг" }).catch(() => {});
    }
    // 📄 PDF ичи ШУ ЕРДА ўқилади (Достон 2026-09-25: «zagruzka bo'lib aylanib
    // turib keyin ko'rindi»). Аввал тугма босилганда ўқиларди — одам 5-10
    // сония кутарди. Энди файл келган заҳоти ўқилади, илова ДАРҲОЛ очилади.
    // Хато бўлса — иловада қайтадан уринилади (pdfKutOqi).
    if (yozuv.pdf) {
      const oqildi = await pdfIchini(ctx, yozuv);
      if (oqildi) await pdfKutOqildi(env, uid, oqildi);
    }
  } catch { /* ёзиб олиш ҳеч қачон хабарга халақит бермайди */ }
  return false;
}

/**
 * PDF ичидан фирма, ИНН, суммани ўқийди. Иккита жойда ишлатилади:
 *   • файл ботга келганда (pdfKutEslab) — шунда илова дарҳол очилади;
 *   • илова тугмаси босилганда (app/sorov.js → pdfKutOqi) — захира йўл.
 * Натижа бир хил бўлиши учун қоида ФАҚАТ ШУ ЕРДА ёзилган.
 * @returns {Promise<{firma,inn,summa,xabar}|null>} null — ўқиб бўлмади
 */
export async function pdfIchini(ctx, kut) {
  try {
    const env = ctx && ctx.env;
    if (!env || !kut || !kut.pdf) return null;
    const matn = String((await pdfMatn(ctx, { file_id: kut.id, file_size: kut.olcham }, 6000)) || "");
    if (!matn || matn.replace(/\s/g, "").length < 30) return { firma: "", inn: "", summa: 0, xabar: "" };
    const h = await hujjatOqi(env, matn);
    if (h && (h.firma || h.summa || h.inn)) {
      return { firma: h.firma || "", inn: h.inn || "", summa: h.summa || 0, xabar: "" };
    }
    return { firma: "", inn: "", summa: 0, xabar: "" };
  } catch (e) { console.error("pdfIchini", e); return null; }
}

/** Ёзиш: аввал D1 (кучли изчил), кейин KV (захира). */
async function pdfKutYoz(env, uid, yozuv) {
  try {
    const db = await d1(env);
    if (db) {
      await db.prepare("INSERT INTO omb_pdfkut (uid, malumot, vaqt) VALUES (?1, ?2, ?3) "
        + "ON CONFLICT(uid) DO UPDATE SET malumot = ?2, vaqt = ?3")
        .bind(Number(uid), JSON.stringify(yozuv), Number(yozuv.vaqt)).run();
    }
  } catch (e) { console.error("pdfKutYoz(D1)", e); }
  await kvPut(env, pdfKutKey(uid), yozuv);
}

/** Одамнинг кутиб турган файли (муддати ўтмаган бўлса). Йўқ — null. */
export async function pdfKutOl(env, uid) {
  let r = null;
  try {
    const db = await d1(env);
    if (db) {
      const q = await db.prepare("SELECT malumot FROM omb_pdfkut WHERE uid = ?1").bind(Number(uid)).first();
      if (q && q.malumot) r = JSON.parse(q.malumot);
    }
  } catch (e) { console.error("pdfKutOl(D1)", e); }
  if (!r) r = await kvGet(env, pdfKutKey(uid), null);   // захира: KV
  if (!r || !r.id) return null;
  if (Date.now() - Number(r.vaqt || 0) > PDFKUT_UMR) return null;
  return r;
}

/** Ўқилган натижани ёзиб қўямиз — иккинчи марта юклаб, қайта ўқилмасин. */
export async function pdfKutOqildi(env, uid, oqildi) {
  const r = await pdfKutOl(env, uid);
  if (!r) return;
  await pdfKutYoz(env, uid, { ...r, oqildi });
}

/** Сўров юборилгач — ишлатилган файл ўчирилади (иккинчисига қўшилиб кетмасин). */
export async function pdfKutOchir(env, uid) {
  try {
    const db = await d1(env);
    if (db) await db.prepare("DELETE FROM omb_pdfkut WHERE uid = ?1").bind(Number(uid)).run();
  } catch (e) { console.error("pdfKutOchir(D1)", e); }
  try { await env.ACCESS_KV.delete(pdfKutKey(uid)); } catch { /* йўқ бўлса — майли */ }
}

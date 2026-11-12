// sorovnoma.js — сотувчининг ботдаги ИККИ ТУГМАСИ.
//
// Аввал сотувчи гуруҳга эркин матн ёзарди («#ombor VERO-SMART 10 mln»).
// Энди сўров БОТ ОРҚАЛИ, қадам-бақадам тўпланади: фирма, сумма, счёт
// файли — шунда маълумот тўлиқ ва бир хил кўринишда бўлади.
//
//  1) 💸 ПУЛ ЧИҚАРИШ — ҳақиқий пул ўтказма.
//       сотувчи → фирма → сумма → счёт файли
//       бот ГУРУҲГА ўзи эълон қилади (файл билан)
//       бухгалтер платёжкани ШУ ХАБАРГА reply қилиб ташлайди
//       AI текширади: фирма номи + сумма + ИНН
//       ҳаммаси мос бўлса → сотувчи қарзидан айирилади
//
//  2) ➖ КАРДАН МИНУС — пул чиқмайди, ФАҚАТ қарз камаяди.
//       сотувчи → сумма
//       Хуршидакага ✅/❌ билан боради
//       ✅ → қарздан айирилади,  ❌ → рад этилади
//
// Иккови ҳам `omb:sorov` рўйхатида сақланади (`tur` майдони билан) —
// шунда чекни текшириш мантиғи битта жойда қолади (ombor.js, omborRasm).

import {
  kvGet, kvPut, isOmborSotuvchi, isOmborAdmin,
  esc, blok, qator, chiziq, qisqa, kunSoatYil, holat, yubor,
  sotuvchiMalumot, tolovYoz, firmaKorinishi, firmaToliq, firmaMos, kvRoyxatYoz,
  pdfMatn, hujjatOqi, innlar, sorovSaqla, SOROV_OCHIQ_UMR, gmBogla,
} from "./ombor.js";
import { ISM, BUXGALTER, pul, son, matndanSumma, summaAniqmi } from "./sklad.js";

export const BTN_PUL = "💸 Пул чиқариш";
export const BTN_KARD = "➖ Қарзимдан минус";
const BTN_BEKOR = "❌ Бекор қилиш";
const BTN_FAYLSIZ = "📤 Файлсиз юбориш";
// PDF олинган бўлса — «файлсиз» эмас, шу тугма (PDF сўровга бириктирилади)
const BTN_PDF_YUBOR = "✅ Гуруҳга юбориш";
const yuborKb = (st) => ({ keyboard: [[{ text: st && st.fayl ? BTN_PDF_YUBOR : BTN_FAYLSIZ }], [{ text: BTN_BEKOR }]],
                          resize_keyboard: true });

/* «Кардан минус» ни тасдиқлайдиган одам.
 *
 * АСЛ МАСЪУЛ — ХУРШИДАКА АКА (Достон 2026-09-12 да шуни тасдиқлади).
 * САРДОР АКА — ЗАҲИРА: Хуршидака ака ботни ҳали очмаган бўлса, Telegram
 * хабарни қабул қилмайди («chat not found» / «bot was blocked»). Ундай
 * ҳолда сўров ЙЎҚОЛМАЙДИ — Сардор акага юборилади ва сотувчига кимга
 * борганини айтилади. Иккови ҳам тасдиқлай олади (пастдаги текширув).  */
//
// ЖОНЛИ СИНОВ (Достон 2026-09-15): «sardorakaga qarzimdan minus haqida habar
// boradi» — синов даврида ФАҚАТ Сардор акага боради. Ҳақиқий ишга ўтишда
// KARD_TASDIQ = KARD_TASDIQ_ASL қилиб қайтарилади (заҳира — Сардор ака).
const KARD_TASDIQ_ASL = 7000000028;           // Хуршидака Бигант — асл масъул
const KARD_TASDIQ = 7000000005;               // СИНОВ: Сардор ака (асли: KARD_TASDIQ_ASL)
const KARD_ZAXIRA = 7000000005;               // Сардор ака — заҳира
// Хуршид ака ЎЗИГА минус ёза олмайди (Достон 2026-09-21: «xurshidaka oziga ozi qarzimdan minus yozolmasin»).
// Аввал ёзса — сўров ўзига келар, ўзиникини тасдиқлай олмагани учун осилиб қоларди.
// Фақат АСЛ тасдиқловчи (Хуршид ака). Сардор ака синов учун унинг ўрнида — у ўзига ёза олади.
export const ozigaMinusMumkin = (uid) => Number(uid) !== Number(KARD_TASDIQ_ASL);
export const OZIGA_MINUS_MATN = "❌ Сиз «Қарзимдан минус» сўровларини тасдиқловчисиз — ўзингизга минус ёза олмайсиз.";

const SOROV_KEY = "omb:sorov";
const ST_KEY = (uid) => `omb:st:${uid}`;
const ST_UMR = 15 * 60;                      // сония — ярим қолган қадам
export const SUMMA_MIN = 1000;                      // хато терилган рақамдан ҳимоя
export const SUMMA_MAX = 5_000_000_000;

// Битта фирмага шу муддат ичида иккинчи сўров — сотувчидан тасдиқ сўралади
export const TAKROR_OYNA = 3 * 3600 * 1000;         // 3 соат
// Тўланмаган сўров шу муддатдан ошса — гуруҳга эслатма (кунига бир марта)
const ESLATMA_MUDDAT = 24 * 3600 * 1000;     // 1 кун

/* ======================== ҳолат (қадамлар) ======================== */

async function stOl(env, uid) {
  if (!env.ACCESS_KV) return null;
  try {
    const raw = await env.ACCESS_KV.get(ST_KEY(uid));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function stQoy(env, uid, st) {
  if (!env.ACCESS_KV) return;
  await env.ACCESS_KV.put(ST_KEY(uid), JSON.stringify(st), { expirationTtl: ST_UMR });
}
async function stOchir(env, uid) {
  if (!env.ACCESS_KV) return;
  await env.ACCESS_KV.delete(ST_KEY(uid));
}

const bekorKb = { keyboard: [[{ text: BTN_BEKOR }]], resize_keyboard: true };

/* ======================== сўровни сақлаш ======================== */

export const yangiId = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// «omb:sorov» — ҲАММА сотувчи учун БИТТА калит. Икки сотувчи бир пайтда
// сўров юборса бири йўқолмаслиги учун — пойгасиз ёзиш (kvRoyxatYoz изоҳи).
export async function sorovQosh(env, yozuv) {
  const now = Date.now();
  await kvRoyxatYoz(env, SOROV_KEY,
    (ro) => sorovSaqla(ro.some((x) => x.id === yozuv.id) ? ro : ro.concat([yozuv]), now),
    (ro) => ro.some((x) => x.id === yozuv.id));
}

export async function sorovOl(env, id) {
  return (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === id) || null;
}

export async function sorovYangila(env, id, ozgarish) {
  const ro = await kvGet(env, SOROV_KEY, []);
  if (!ro.some((x) => x.id === id)) return null;
  const mos = (x) => Object.entries(ozgarish).every(([k, v]) => x[k] === v);
  await kvRoyxatYoz(env, SOROV_KEY,
    (joriy) => joriy.map((x) => (x.id === id ? { ...x, ...ozgarish } : x)),
    (joriy) => { const x = joriy.find((y) => y.id === id); return !x || mos(x); });
  const oxirgi = (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === id);
  return oxirgi || { ...ro.find((x) => x.id === id), ...ozgarish };
}

/* ======================== 1. ПУЛ ЧИҚАРИШ ======================== */

/* 💸 ПУЛ ЧИҚАРИШ — АВВАЛ МАСЪУЛГА (Достон 2026-09-24): «sotuvchi yuborishni bosganda
   qaysi firmaga qancha miqdorda kim pul o'tkazmoqchiligi Xurshid akaga boradi, u
   tasdiqlaydi yoki otkaz bosadi — huddi qarzimdan minus funksiyasidek. Qachonki
   tasdiqlasalar, keyin guruhga xabar keladi.» */
export async function pulTasdiqqaYubor(ctx, sorov) {
  const { tg, token, env } = ctx;
  // Достон 2026-09-24: масъулга ГУРУҲГА борадиган хабарнинг АЙНАН ЎЗИ борсин
  const matn = elonMatn(sorov);
  const tugma = { inline_keyboard: [[
    { text: "✅ Ҳа, тасдиқлайман", callback_data: `srv|t1|${sorov.id}` },
    { text: "❌ Йўқ", callback_data: `srv|t0|${sorov.id}` },
  ]] };
  // Хабар манзили сўровга ёзиб қўйилади: сотувчи бекор қилса, масъулнинг
  // чатидаги ✅/❌ тугмалари ОЛИБ ТАШЛАНАДИ (Достон 2026-09-25 — акс ҳолда
  // йўқ сўровга ✅ босилиб, «аллақачон ҳал қилинган» деган жавоб чиқарди).
  const r = await tg(token, "sendMessage", { chat_id: KARD_TASDIQ, text: matn, parse_mode: "HTML", reply_markup: tugma });
  if (r && r.ok) {
    if (r.result) { sorov.tasdiqChat = KARD_TASDIQ; sorov.tasdiqMsg = r.result.message_id; }
    return "asosiy";
  }
  if (KARD_ZAXIRA === KARD_TASDIQ) return false;
  const z = await tg(token, "sendMessage", { chat_id: KARD_ZAXIRA, text: matn, parse_mode: "HTML", reply_markup: tugma });
  if (z && z.ok && z.result) { sorov.tasdiqChat = KARD_ZAXIRA; sorov.tasdiqMsg = z.result.message_id; }
  return z && z.ok ? "zaxira" : false;
}

/** Гуруҳдаги эълон матни (Mini App ҳам айнан шуни ишлатади — src/app/sorov.js) */
export function elonMatn(sorov) {
  // Сарлавҳада сотувчининг исми — гуруҳда кимнинг сўрови экани дарҳол
  // кўринсин. Фирма номи чиройли кўринишга келтирилади (бош ҳарф катта).
  const kim = ISM[sorov.sid] || String(sorov.sid);
  return [
    `💸 <b>${esc(kim)} омборга пул чиқармоқчи</b>`,
    "",
    `🏢 <b>${esc(firmaToliq(sorov.firma))}</b>`,
    `💵 <b>${pul(sorov.summa)} сўм</b>`,
    ...(sorov.inn ? [`🔢 ИНН: <code>${esc(sorov.inn)}</code>`] : []),
  ].join("\n");
}

/** Гуруҳга эълон: бухгалтер шуни кўриб, платёжкани reply қилади */
export async function guruhgaElon(ctx, sorov) {
  const { env, tg, token } = ctx;
  const guruh = String(env.OMBOR_GURUH || "").split(/[,;\s]+/).filter(Boolean)[0];
  if (!guruh) return null;
  const matn = elonMatn(sorov);

  // Файл бўлса — файл билан бирга, изоҳ сифатида
  if (sorov.fayl) {
    const met = sorov.fayl.tur === "photo" ? "sendPhoto" : "sendDocument";
    const maydon = sorov.fayl.tur === "photo" ? "photo" : "document";
    const r = await tg(token, met, {
      chat_id: guruh, [maydon]: sorov.fayl.id,
      caption: matn, parse_mode: "HTML",
    });
    if (r && r.ok) return r.result.message_id;
    // Файл юборилмаса — камида матнни юборамиз, сўров йўқолиб кетмасин
    console.error("guruhgaElon fayl:", r && r.description);
  }
  const r2 = await tg(token, "sendMessage", {
    chat_id: guruh, text: matn, parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  return r2 && r2.ok ? r2.result.message_id : null;
}

/** Гуруҳдаги эълонга «сўрови бекор қилинди» деб reply (бухгалтер пул ўтказмасин) */
export async function guruhgaBekor(ctx, sorov) {
  if (!sorov || !sorov.guruhMsg) return;
  const guruh = String(ctx.env.OMBOR_GURUH || "").split(/[,;\s]+/).filter(Boolean)[0];
  if (!guruh) return;
  // Эълон, эслатма ва «ёпилди» хабарлари билан бир хил кўриниш
  const r = await yubor(ctx, guruh, [
    `❌ <b>${esc(ISM[sorov.sid] || sorov.sid)} сўрови бекор қилинди</b>`,
    ...(sorov.firma ? [`🏢 <b>${esc(firmaToliq(sorov.firma))}</b>`] : []),
    `💵 <b>${pul(sorov.summa)} сўм</b>`,
    "<i>Тўлов керак эмас.</i>",
  ].join("\n"), { reply_to_message_id: sorov.guruhMsg }).catch(() => null);
  // Шу хабарга reply қилиб чек ташланса — «бекор қилинган» деб айтилади
  if (r && r.result) await gmBogla(ctx.env, r.result.message_id, sorov.id);
}

/* ======================== 2. КАРДАН МИНУС ======================== */

export async function kardTasdiqqaYubor(ctx, sorov) {
  const { tg, token, env } = ctx;
  // Шу сотувчининг ЯНА қанча сўрови тасдиқ кутмоқда? Достон кетма-кет
  // сўров юборишни тақиқламасликни сўраган, шунинг учун тўсмаймиз —
  // лекин тасдиқловчи иккита бир хил сўровни адашиб икки марта
  // тасдиқлаб юбормаслиги учун огоҳлантирамиз.
  const boshqa = (await kvGet(env, SOROV_KEY, [])).filter((x) =>
    x.id !== sorov.id && Number(x.sid) === Number(sorov.sid) &&
    x.tur === "kard" && !x.band);
  // Достон 2026-09-10 да айнан шу кўринишни сўради — тўрт қатор, холос.
  // Аввал бу ерда қарз картаси ҳам бор эди («ҳозир … кейин …») — ортиқча.
  // Достон 2026-09-24: «Сотувчи (Алишер) / Шотимдаги пулдан 3.000.000 омбор қарзга бердим»
  const matn = [
    `<b>Сотувчи (${esc(ISM[sorov.sid] || sorov.sid)})</b>`,
    ...(boshqa.length ? ["", `⚠️ <b>Яна ${boshqa.length} та сўрови тасдиқ кутмоқда</b> — `
      + boshqa.map((x) => pul(x.summa)).join(", ")] : []),
    "",
    `Шотимдаги пулдан <b>${pul(sorov.summa)}</b> омбор қарзга бердим`,
    `🕒 ${kunSoatYil(sorov.vaqt)}`,
    ...(sorov.izoh ? ["", `💬 <i>«${esc(sorov.izoh)}»</i>`] : []),
  ].join("\n");

  const tugma = { inline_keyboard: [[
    { text: "✅ Ҳа, тасдиқлайман", callback_data: `srv|k1|${sorov.id}` },
    { text: "❌ Йўқ", callback_data: `srv|k0|${sorov.id}` },
  ]] };
  const r = await tg(token, "sendMessage", {
    chat_id: KARD_TASDIQ, text: matn, parse_mode: "HTML", reply_markup: tugma });
  if (r && r.ok) return "asosiy";
  // Заҳира ўша одамнинг ўзи бўлса (синов) — қайта юбориш маъносиз
  if (KARD_ZAXIRA === KARD_TASDIQ) return false;
  // Асл масъулга етиб бормади — ЗАҲИРАга юборамиз, сўров йўқолмасин
  const z = await tg(token, "sendMessage", {
    chat_id: KARD_ZAXIRA, parse_mode: "HTML", reply_markup: tugma,
    text: matn + "\n\n<i>Хуршидака акага етиб бормади — сиз ҳал қилинг.</i>" });
  return z && z.ok ? "zaxira" : false;
}

/* ======================== қадамларни бошқариш ======================== */

/**
 * Ботдаги шахсий чатда сотувчининг хабари.
 * @returns {Promise<boolean>} true — хабар «ейилди»
 */
export async function sorovnomaXabar(ctx, message, access) {
  const { env, tg, token } = ctx;
  const uid = message.from && message.from.id;
  const chatId = message.chat.id;
  if (!uid || message.chat.type !== "private") return false;
  if (!isOmborSotuvchi(uid)) return false;

  const matn = (message.text || "").trim();

  // --- тугмалар
  if (matn === BTN_PUL) {
    await stQoy(env, uid, { qadam: "pul_firma", vaqt: Date.now() });
    await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
      text: "💸 ПУЛ ЧИҚАРИШ\n\n🏢 Қайси фирмага ва ҚАНЧА?\n\n" +
            // Битта намуна етарли — иккинчиси (VERO-SMART) 2026-09-10 да
            // олиб ташланди, Достон «чалғитяпти» деди.
            "Масалан:\n   CONVITECH MCHJ 10 mln\n\n" +
            "ИНН'ни ҳам билсангиз, ёнига ёзинг." });
    return true;
  }
  if (matn === BTN_KARD) {
    if (!ozigaMinusMumkin(uid)) {
      await tg(token, "sendMessage", { chat_id: chatId, text: OZIGA_MINUS_MATN });
      return true;
    }
    // 2026-09-10: аввал бу ерда «тасдиқ кутаётган сўровингиз бор» деб
    // ЙЎЛ ТЎСИЛАРДИ — сотувчи масъулнинг жавобини кутиб ўтириши керак
    // эди. Достон буни олиб ташлашни сўради: сотувчи кетма-кет бир
    // нечта сўров юбора олсин, ҳар бири алоҳида ✅/❌ билан ҳал бўлади.
    await stQoy(env, uid, { qadam: "kard_summa", vaqt: Date.now() });
    await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
      text: "➖ ҚАРЗИМДАН МИНУС\n\n💵 Суммани киритинг." });
    return true;
  }

  const st = await stOl(env, uid);
  if (!st) return false;                       // жараён йўқ — бошқа ҳандлерга

  // Жараён ўртасида менюдаги бошқа тугма босилди — жараён тугайди, тугма
  // ўз ишини қилади. Аввал «⬅️ Орқага» ёки «📊 Ҳисоботим» ФИРМА НОМИ бўлиб
  // ёзилиб, гуруҳга шундай сўров кетиши мумкин эди.
  if ((ctx.isMainButton && ctx.isMainButton(matn)) || /^\/(start|menu)\b/.test(matn)) {
    await stOchir(env, uid);
    return false;
  }

  if (matn === BTN_BEKOR || matn === "/cancel") {
    await stOchir(env, uid);
    await tg(token, "sendMessage", { chat_id: chatId, text: "Бекор қилинди.",
                                     reply_markup: (ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid)) });
    return true;
  }

  /* ---------- ПУЛ ЧИҚАРИШ: фирма ўрнига PDF (счёт/спецификация) ----------
     Достон 2026-09-15: сотувчи ёзмасдан PDF'нинг ўзини ташлаши мумкин.
     Фирма, ИНН ва сумма PDF'дан олинади, сотувчи битта тугма билан
     тасдиқлайди. PDF'да ИНН бўлмаса — фирма + сумма кифоя.            */
  if ((st.qadam === "pul_firma" || st.qadam === "pul_summa") && message.document) {
    const d = message.document;
    const pdfmi = d.mime_type === "application/pdf" || /\.pdf$/i.test(d.file_name || "");
    if (!pdfmi) {
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
        text: "Фақат PDF ташланг ёки фирма номи ва суммани ёзинг." });
      return true;
    }
    await tg(token, "sendMessage", { chat_id: chatId, text: "⏳ PDF ўқилмоқда…" });
    const pdfT = await pdfMatn(ctx, d, 6000);
    const h = pdfT ? await hujjatOqi(env, pdfT) : null;
    const fayl = { tur: "doc", pdf: true, id: d.file_id, nom: d.file_name || "", matn: pdfT.slice(0, 1000),
                   pdfFirma: (h && h.firma) || "", pdfInn: (h && h.inn) || "", pdfSumma: (h && h.summa) || 0 };
    // Сотувчи аввал фирмани ёзган бўлса (pul_summa) — ўшаниси қолади
    const firma = st.firma || (h && h.firma) || "";
    const inn = st.inn || (h && h.inn) || "";
    const summa = (h && h.summa) || 0;
    if (firma && summa) {
      await stQoy(env, uid, { ...st, qadam: "pul_fayl", firma, inn, summa, fayl });
      await tg(token, "sendMessage", { chat_id: chatId,
        text: "📄 PDF'дан ўқилди:\n\n" +
              `🏢 ${firmaToliq(firma)}\n` + (inn ? `🔢 ИНН: ${inn}\n` : "") + `💵 ${pul(summa)} сўм\n\n` +
              "Тўғри бўлса — «✅ Гуруҳга юбориш».\nСумма бошқа бўлса — тўғрисини ёзинг.",
        reply_markup: { keyboard: [[{ text: BTN_PDF_YUBOR }], [{ text: BTN_BEKOR }]], resize_keyboard: true } });
      return true;
    }
    if (firma) {
      await stQoy(env, uid, { ...st, qadam: "pul_summa", firma, inn, fayl });
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
        text: "📄 PDF'дан ўқилди:\n\n" + `🏢 ${firmaToliq(firma)}\n` + (inn ? `🔢 ИНН: ${inn}\n` : "") +
              "\n💵 Суммани PDF'дан аниқ ўқиб бўлмади — суммани ёзинг.\nМасалан: 11 mln ёки 11 000 000" });
      return true;
    }
    // Ҳеч нарса ўқилмади — PDF сақланади, сотувчи фирма ва суммани ёзади
    await stQoy(env, uid, { ...st, qadam: "pul_firma", fayl });
    await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
      text: "📄 PDF ичидан фирма номи ўқилмади.\n\n" +
            "🏢 Фирма номи ва суммани ёзинг.\nМасалан:\n   CONVITECH MCHJ 10 mln" });
    return true;
  }

  /* ---------- ПУЛ ЧИҚАРИШ: фирма ---------- */
  if (st.qadam === "pul_firma") {
    if (!matn || matn.length < 2) {
      await tg(token, "sendMessage", { chat_id: chatId,
        text: "Фирма номини ёзинг (камида 2 белги).", reply_markup: bekorKb });
      return true;
    }
    const inn = [...innlar(matn)][0] || "";
    // ИНН 9 хонали — «123456789» ни СУММА (123 млн) деб ўқиб қўймаслик учун
    // уни матндан чиқарамиз, сўнггина сумма қидирамиз.
    const innsiz = inn ? matn.split(inn).join(" ") : matn;
    // Одам одатда ҳаммасини бирга ёзади: «CONVITECH MCHJ 10 mln».
    // Сумма шу ерда топилса — қайта сўрамаймиз, дарҳол файл қадамига ўтамиз.
    const s = matndanSumma(innsiz);
    // Фирма номидан сумма ва ИНН олиб ташланади — гуруҳдаги эълонда
    // «10 mln CONVITECH mchjga» эмас, соф «CONVITECH mchj» кўринсин.
    const firma = innsiz
      .replace(/\d[\d\s.,]*\s*(mln|млн|ming|минг|mlrd|сўм|сум|so'm)?/gi, " ")
      .replace(/\s+/g, " ").replace(/^[\s,.;:—–-]+|[\s,.;:—–-]+$/g, "").trim()
      || matn.slice(0, 120);

    // Матнда ИККИТА ҳақиқий сумма бўлса («300 000 000 лик шартнома бўйича
    // 11 100 000 тўланг») — тахмин қилмаймиз, сотувчидан аниқлаб оламиз.
    const aniqlik = summaAniqmi(innsiz);
    if (s >= SUMMA_MIN && s <= SUMMA_MAX && !aniqlik.aniq) {
      await stQoy(env, uid, { ...st, qadam: "pul_summa", firma: firma.slice(0, 120), inn });
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
        text: `🏢 ${firmaToliq(firma.slice(0, 120))}\n\n`
          + `❓ Матнда бир нечта сумма бор: ${aniqlik.tanlov.map((v) => pul(v)).join(" · ")}\n`
          + "💵 Фақат тўланадиган суммани ёзинг." });
      return true;
    }
    if (s >= SUMMA_MIN && s <= SUMMA_MAX) {
      await stQoy(env, uid, { ...st, qadam: "pul_fayl", firma: firma.slice(0, 120), inn, summa: s });
      // Ортиқча йўриқнома ёзилмайди — пастдаги тугмаларнинг ўзи етарли.
      await tg(token, "sendMessage", { chat_id: chatId,
        text: `🏢 ${firmaToliq(firma.slice(0, 120))}\n💵 ${pul(s)} сўм` +
              (inn ? `\n🔢 ИНН: ${inn}` : ""),
        reply_markup: yuborKb(st) });
      return true;
    }

    await stQoy(env, uid, { ...st, qadam: "pul_summa", firma: firma.slice(0, 120), inn });
    await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
      text: `🏢 ${firmaToliq(firma.slice(0, 120))}` +
            (inn ? `\n🔢 ИНН: ${inn}` : "") +
            "\n\n💵 Энди суммани киритинг.\nМасалан: 11 mln ёки 11 000 000" });
    return true;
  }

  /* ---------- ПУЛ ЧИҚАРИШ: сумма ---------- */
  if (st.qadam === "pul_summa") {
    const s = matndanSumma(matn);
    const aniqlik2 = summaAniqmi(matn);
    if (s >= SUMMA_MIN && s <= SUMMA_MAX && !aniqlik2.aniq) {
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
        text: `❓ Бир нечта сумма бор: ${aniqlik2.tanlov.map((v) => pul(v)).join(" · ")}\n`
          + "💵 Фақат биттасини ёзинг." });
      return true;
    }
    if (!(s >= SUMMA_MIN && s <= SUMMA_MAX)) {
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
        text: "Суммани тушунмадим. Масалан: 11 mln ёки 11 000 000" });
      return true;
    }
    await stQoy(env, uid, { ...st, qadam: "pul_fayl", summa: s });
    await tg(token, "sendMessage", { chat_id: chatId,
      text: `🏢 ${firmaToliq(String(st.firma || ""))}\n💵 ${pul(s)} сўм`,
      reply_markup: yuborKb(st) });
    return true;
  }

  /* ---------- ПУЛ ЧИҚАРИШ: файл ---------- */
  if (st.qadam === "pul_fayl") {
    let fayl = null;
    if (message.document) {
      fayl = { tur: "doc", id: message.document.file_id,
               nom: message.document.file_name || "" };
      // PDF бўлса — ичидаги матн фирма/ИНН текшируви учун асқотади
      if (message.document.mime_type === "application/pdf" || /\.pdf$/i.test(fayl.nom)) {
        fayl.pdf = true;
        const toliq = await pdfMatn(ctx, message.document, 6000);
        fayl.matn = toliq.slice(0, 1000);
        // ИНН: PDF'да харидорнинг (бизнинг) ИНН'и ҳам бор — «биринчи учраган»
        // ни олиш хато эди. GLM ПУЛНИ ОЛАДИГАН фирманинг ИНН'ини ажратади.
        if (!st.inn) {
          const h = await hujjatOqi(env, toliq);
          if (h && h.inn) fayl.pdfInn = h.inn;
        }
      }
    } else if (message.photo && message.photo.length) {
      fayl = { tur: "photo", id: message.photo[message.photo.length - 1].file_id };
    } else if (st.fayl && (matn === BTN_PDF_YUBOR || matn === BTN_FAYLSIZ)) {
      fayl = st.fayl;                            // PDF олдинроқ ташланган
    } else if (st.fayl && matn) {
      // PDF'дан ўқилган суммани сотувчи тўғрилади
      const s2 = matndanSumma(matn);
      if (s2 >= SUMMA_MIN && s2 <= SUMMA_MAX && summaAniqmi(matn).aniq) {
        await stQoy(env, uid, { ...st, summa: s2 });
        await tg(token, "sendMessage", { chat_id: chatId,
          text: `🏢 ${firmaToliq(String(st.firma || ""))}\n` + (st.inn ? `🔢 ИНН: ${st.inn}\n` : "") +
                `💵 ${pul(s2)} сўм\n\nТўғри бўлса — «${BTN_PDF_YUBOR}».`,
          reply_markup: yuborKb(st) });
        return true;
      }
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: yuborKb(st),
        text: `«${BTN_PDF_YUBOR}» ни босинг ёки тўғри суммани ёзинг (масалан: 11 mln).` });
      return true;
    } else if (matn !== BTN_FAYLSIZ) {
      await tg(token, "sendMessage", { chat_id: chatId,
        text: "Файлни юборинг ёки «📤 Файлсиз юбориш» тугмасини босинг.",
        reply_markup: yuborKb(st) });
      return true;
    }

    const faylMatn = (fayl && fayl.matn) || "";
    const inn = st.inn || (fayl && fayl.pdfInn) || "";

    const sorov = {
      id: yangiId(), tur: "pul", sid: uid,
      summa: st.summa, firma: st.firma, inn,
      // `matn` — фирма текшируви шу матн билан солиштиради (ombor.js)
      matn: [st.firma, inn, fayl && fayl.nom, faylMatn.replace(/(^|\D)\d{9}(?!\d)/g, "$1 ")].filter(Boolean)
        .join("  ·  ").slice(0, 500),
      fayl: fayl ? { tur: fayl.tur, id: fayl.id, nom: fayl.nom || "", ...(fayl.pdf ? { pdf: true } : {}) } : null,
      vaqt: Date.now(), band: false, kutilmoqda: false, guruhMsg: null,
    };

    // ── ТАКРОР СЎРОВМИ? Шу фирмага яқинда сўралганми?
    //    Гуруҳга иккита бир хил эълон тушмаслиги учун аввал сотувчидан
    //    сўраймиз: сўров ЁЗИЛАДИ, лекин гуруҳга ҳозирча ЮБОРИЛМАЙДИ.
    const eski = (await kvGet(env, SOROV_KEY, [])).find((x) =>
      Number(x.sid) === Number(uid) && x.tur === "pul" && !x.band &&
      Date.now() - x.vaqt < TAKROR_OYNA &&
      firmaMos(x.matn, sorov.matn) === "mos");
    if (eski) {
      sorov.kutilmoqda = true;
      sorov.oldingi = eski.id;                 // «🔄 Олдингисини бекор қил» учун
      await sorovQosh(env, sorov);
      await stOchir(env, uid);
      // 2026-09-11 ҳақиқий синов: сотувчи эски сўровни «бекор қилдим» деб ўйлаб
      // (аслида гуруҳда фақат ЧЕК рад этилган эди) янгисини юборди — бот
      // «иккинчи тўловми?» деб сўради, тушунарсиз бўлди. Энди учта аниқ йўл.
      await yubor(ctx, chatId, [
        "⚠️ <b>ТАКРОРИЙ СЎРОВ</b>",
        `🏢 <b>${esc(firmaToliq(sorov.firma))}</b> га олдинги сўровингиз ҳали <b>тўланмаган</b>:`,
        blok([
          qator(kunSoatYil(eski.vaqt, "-"), pul(eski.summa) + " олдинги"),
          qator(kunSoatYil(sorov.vaqt, "-"), pul(sorov.summa) + " янги"),
        ].join("\n")),
        "<i>Танламагунингизча гуруҳга ҳеч нима юборилмайди.</i>",
      ].join("\n"), { reply_markup: { inline_keyboard: [
        [{ text: "🔄 Олдингисини бекор қил, янгисини юбор", callback_data: `srv|pr|${sorov.id}` }],
        [{ text: "➕ Иккаласи ҳам керак (2-тўлов)", callback_data: `srv|p1|${sorov.id}` }],
        [{ text: "❌ Янгисини бекор қил", callback_data: `srv|p0|${sorov.id}` }],
      ] } });
      return true;
    }

    const msgId = await guruhgaElon(ctx, sorov);
    if (!msgId) {
      await stOchir(env, uid);
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: (ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid)),
        text: "❌ Гуруҳга юборилмади. Админга хабар беринг." });
      return true;
    }
    sorov.guruhMsg = msgId;
    await sorovQosh(env, sorov);
    await stOchir(env, uid);

    await yubor(ctx, chatId, [
      "✅ <b>Сўров гуруҳга юборилди</b>",
      "",
      `🏢 <b>${esc(firmaToliq(sorov.firma))}</b>`,
      `💵 <b>${pul(sorov.summa)} сўм</b>`,
      ...(inn ? [`🔢 ИНН: <code>${esc(inn)}</code>`] : []),
    ].join("\n"), { reply_markup: { inline_keyboard: [[
      { text: "❌ Сўровни бекор қилиш", callback_data: `srv|bek|${sorov.id}` },
    ]] } });
    // Асосий клавиатурани ТИКЛАЙМИЗ. Битта хабарда inline ва reply
    // клавиатура бирга бўлмайди, шунинг учун алоҳида қисқа хабар.
    // (Аввал бу хабар юборилиб ЎЧИРИЛАРДИ — ўшанда Telegram клавиатурани
    //  ҳам олиб ташлаб, сотувчида тугмалар йўқолиб қоларди.)
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "Асосий меню 👇", reply_markup: (ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid)) }).catch(() => {});
    return true;
  }

  /* ---------- КАРДАН МИНУС: сумма ---------- */
  if (st.qadam === "kard_summa") {
    const s = matndanSumma(matn);
    if (!(s >= SUMMA_MIN && s <= SUMMA_MAX)) {
      await tg(token, "sendMessage", { chat_id: chatId, reply_markup: bekorKb,
        text: "Суммани тушунмадим. Масалан: 5 mln ёки 5 000 000" });
      return true;
    }
    // Сотувчи «5 mln, шу суммани қарзимдан минус қилмоқчиман» деб ёзиши
    // мумкин — суммадан ташқари изоҳни ҳам сақлаймиз, Хуршидака кўрсин.
    const izoh = matn.replace(/[\d\s.,]+(mln|млн|ming|минг|mlrd)?/i, " ")
      .replace(/\s+/g, " ").replace(/^[\s,.;:—–-]+/, "").trim();
    const sorov = {
      id: yangiId(), tur: "kard", sid: uid, summa: s,
      izoh: izoh.length >= 3 ? izoh.slice(0, 300) : "",
      matn: "қарзимдан минус", vaqt: Date.now(),
      band: false, kutilmoqda: true, holati: "kutilmoqda",
    };
    await sorovQosh(env, sorov);
    await stOchir(env, uid);

    const ketdi = await kardTasdiqqaYubor(ctx, sorov);
    if (!ketdi) {
      // Тасдиқловчига етиб бормади — сўровни ОЧИҚ қолдирмаймиз, акс ҳолда
      // у рўйхатда «тасдиқ кутмоқда» бўлиб осилиб қоларди ва сотувчи
      // янгисини ҳам юбора олмасди.
      await sorovYangila(env, sorov.id, { band: true, kutilmoqda: false, holati: "bekor" });
      await yubor(ctx, chatId, "❌ Тасдиқловчига юборилмади. Админга хабар беринг.",
        { reply_markup: (ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid)) });
      return true;
    }
    await yubor(ctx, chatId, [
      "✅ <b>Сўров юборилди</b>",
      `💵 <b>${pul(s)} сўм</b>`,
      ...(ketdi === "zaxira" ? ["<i>Хуршидака ака ботни очмаган — Сардор акага юборилди.</i>"] : []),
    ].join("\n"), { reply_markup: { inline_keyboard: [[
      { text: "❌ Сўровни бекор қилиш", callback_data: `srv|bek|${sorov.id}` },
    ]] } });
    await tg(token, "sendMessage", { chat_id: chatId,
      text: "Асосий меню 👇", reply_markup: (ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid)) }).catch(() => {});
    return true;
  }

  return false;
}

/* ======================== тугмалар (callback) ======================== */

export async function sorovnomaCallback(ctx, query, access) {
  const { env, tg, token } = ctx;
  const data = query.data || "";
  if (!data.startsWith("srv|")) return false;

  const [, cmd, id] = data.split("|");
  const uid = query.from.id;
  const rad = (t) => tg(token, "answerCallbackQuery",
                        { callback_query_id: query.id, text: t, show_alert: true });

  /* ---------- Такрорий «Пул чиқариш»ни тасдиқлаш / бекор қилиш ---------- */
  if (cmd === "p1" || cmd === "p0" || cmd === "pr") {
    const sorov = await sorovOl(env, id);
    if (!sorov || sorov.tur !== "pul") { await rad("Сўров топилмади."); return true; }
    if (Number(uid) !== Number(sorov.sid) && !isOmborAdmin(uid, access)) {
      await rad("Буни сўров эгаси ҳал қилади."); return true;
    }
    // Тугма икки марта босилса гуруҳга ИККИТА эълон кетарди (иккинчиси
    // биринчисининг ўрнини эгаллаб, биринчисига ташланган чек «топилмасди»).
    // Ёпилган сўров ҳам қайта эълон қилинмайди.
    const belgi = String(query.id);
    const olindi = await kvRoyxatYoz(env, SOROV_KEY,
      (joriy) => joriy.map((x) => (x.id === id && x.kutilmoqda && !x.band
        ? { ...x, kutilmoqda: false, halQildi: belgi,
            ...(cmd === "p0" ? { band: true, holati: "bekor" } : {}) } : x)),
      (joriy) => { const x = joriy.find((y) => y.id === id); return !x || !x.kutilmoqda; });
    const oxirgi = await sorovOl(env, id);
    await tg(token, "editMessageReplyMarkup", { chat_id: query.message.chat.id,
      message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
    if (!olindi || !oxirgi || oxirgi.halQildi !== belgi) {
      await rad("Бу сўров аллақачон ҳал қилинган."); return true;
    }

    if (cmd === "p0") {
      await yubor(ctx, sorov.sid, "❌ <b>Сўров бекор қилинди</b> — гуруҳга юборилмади.");
      await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
      return true;
    }
    const msgId = await guruhgaElon(ctx, sorov);
    if (!msgId) {
      // Эълон кетмади — сўров яна «тасдиқ кутмоқда» ҳолатига қайтади
      await sorovYangila(env, id, { kutilmoqda: true });
      await yubor(ctx, sorov.sid, "❌ Гуруҳга юборилмади. Админга хабар беринг.");
      await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
      return true;
    }
    await sorovYangila(env, id, { kutilmoqda: false, guruhMsg: msgId });
    // «🔄 Олдингисини бекор қил» — эски сўров ёпилади, гуруҳдаги эълонига
    // «бекор қилинди» деб ёзилади (бухгалтер эскисига пул ўтказмасин)
    let eskiBekor = null;
    if (cmd === "pr" && sorov.oldingi) {
      const eski = await sorovOl(env, sorov.oldingi);
      if (eski && !eski.band && Number(eski.sid) === Number(sorov.sid)) {
        await sorovYangila(env, eski.id, { band: true, kutilmoqda: false, holati: "bekor" });
        await guruhgaBekor(ctx, eski);
        eskiBekor = eski;
      }
    }
    await yubor(ctx, sorov.sid, [
      ...(eskiBekor ? [`❌ Олдинги сўров бекор қилинди (${pul(eskiBekor.summa)} сўм)`] : []),
      "✅ <b>Гуруҳга юборилди</b>",
      `🏢 <b>${esc(firmaToliq(sorov.firma))}</b>  ·  💵 <b>${pul(sorov.summa)} сўм</b>`,
    ].join("\n"), { reply_markup: { inline_keyboard: [[
      { text: "❌ Сўровни бекор қилиш", callback_data: `srv|bek|${sorov.id}` },
    ]] } });
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    return true;
  }

  /* ---------- 💸 ПУЛ ЧИҚАРИШНИ МАСЪУЛ ТАСДИҚЛАШИ (Достон 2026-09-24) ---------- */
  if (cmd === "t1" || cmd === "t0") {
    const sorov = await sorovOl(env, id);
    if (!sorov || sorov.tur !== "pul") { await rad("Сўров топилмади."); return true; }
    if (!([KARD_TASDIQ_ASL, KARD_ZAXIRA].includes(Number(uid)) || isOmborAdmin(uid, access))) {
      await rad("Бу сўровни фақат масъул шахс ҳал қилади."); return true;
    }
    if (Number(uid) === Number(sorov.sid)) { await rad("Ўз сўровингизни ўзингиз тасдиқлай олмайсиз."); return true; }
    if (sorov.holati !== "kutilmoqda") { await rad("Бу сўров аллақачон ҳал қилинган."); return true; }
    const belgi = String(query.id);
    const olindi = await kvRoyxatYoz(env, SOROV_KEY,
      (joriy) => joriy.map((x) => (x.id === id && x.holati === "kutilmoqda"
        ? { ...x, holati: cmd === "t1" ? "tasdiq" : "rad", kutilmoqda: false,
            ...(cmd === "t0" ? { band: true } : {}), halQildi: belgi } : x)),
      (joriy) => { const x = joriy.find((y) => y.id === id); return !x || x.holati !== "kutilmoqda"; });
    const oxirgi = await sorovOl(env, id);
    await tg(token, "editMessageReplyMarkup", { chat_id: query.message.chat.id,
      message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
    if (!olindi || !oxirgi || oxirgi.halQildi !== belgi) { await rad("Бу сўров аллақачон ҳал қилинган."); return true; }

    if (cmd === "t0") {
      await yubor(ctx, uid, `❌ <b>Рад этилди</b> — ${esc(ISM[sorov.sid] || sorov.sid)}, ${pul(sorov.summa)} сўм`).catch(() => {});
      if (sorov.manba !== "app") await yubor(ctx, sorov.sid, ["❌ <b>Пул чиқариш рад этилди</b>",
        `🏢 <b>${esc(firmaToliq(sorov.firma))}</b>  ·  💵 <b>${pul(sorov.summa)} сўм</b>`].join("\n")).catch(() => {});
      await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
      return true;
    }
    // ✅ Тасдиқланди — ЭНДИ гуруҳга кетади, бухгалтер платёжка ташлайди
    const msgId = await guruhgaElon(ctx, sorov);
    if (!msgId) {
      await sorovYangila(env, id, { holati: "kutilmoqda", kutilmoqda: true, halQildi: null });
      await yubor(ctx, uid, "❌ Гуруҳга юборилмади. Админга хабар беринг.").catch(() => {});
      await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
      return true;
    }
    await sorovYangila(env, id, { guruhMsg: msgId, holati: "ochiq" });
    await yubor(ctx, uid, [`✅ <b>Тасдиқланди — гуруҳга юборилди</b>`,
      `👤 ${esc(ISM[sorov.sid] || sorov.sid)}  ·  🏢 <b>${esc(firmaToliq(sorov.firma))}</b>  ·  💵 <b>${pul(sorov.summa)} сўм</b>`].join("\n")).catch(() => {});
    if (sorov.manba !== "app") await yubor(ctx, sorov.sid, ["✅ <b>Тасдиқланди — гуруҳга юборилди</b>",
      `🏢 <b>${esc(firmaToliq(sorov.firma))}</b>  ·  💵 <b>${pul(sorov.summa)} сўм</b>`].join("\n")).catch(() => {});
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    return true;
  }

  /* ---------- Сўровни БЕКОР қилиш (сотувчи ёки админ) ---------- */
  if (cmd === "bek") {
    const sorov = await sorovOl(env, id);
    if (!sorov) { await rad("Сўров топилмади."); return true; }
    if (Number(uid) !== Number(sorov.sid) && !isOmborAdmin(uid, access)) {
      await rad("Сўровни фақат эгаси ёки админ бекор қила олади."); return true;
    }
    if (sorov.band) { await rad("Бу сўров аллақачон ёпилган."); return true; }

    await sorovYangila(env, id, { band: true, kutilmoqda: false, holati: "bekor" });
    await tg(token, "editMessageReplyMarkup", { chat_id: query.message.chat.id,
      message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });

    // Гуруҳдаги эълон остига «бекор қилинди» деб ёзамиз — бухгалтер кўрсин
    await guruhgaBekor(ctx, sorov);
    // Кард-сўров бўлса — Хуршидакага ҳам хабар берамиз
    if (sorov.tur === "kard") {
      const xb = `❌ <b>${esc(ISM[sorov.sid] || sorov.sid)} сўровни бекор қилди</b> — ${pul(sorov.summa)} сўм`;
      await yubor(ctx, KARD_TASDIQ, xb).catch(() => {});
      if (KARD_ZAXIRA !== KARD_TASDIQ)                    // синовда иккови бир одам — икки марта юборилмасин
        await yubor(ctx, KARD_ZAXIRA, xb).catch(() => {});  // заҳирага ҳам кетган бўлиши мумкин
    }
    await yubor(ctx, sorov.sid, "❌ <b>Сўров бекор қилинди</b>");
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    return true;
  }

  if (cmd !== "k1" && cmd !== "k0") return true;

  // Фақат масъул шахс ёки омбор админи ҳал қилади.
  // Синов даврида Хуршидака ака ҳам қабул қилинади: агар унга эски
  // хабар етиб борган бўлса, тугмаси ишламай қолмасин.
  if (Number(uid) !== KARD_TASDIQ && Number(uid) !== KARD_TASDIQ_ASL &&
      Number(uid) !== KARD_ZAXIRA &&
      !isOmborAdmin(uid, access)) {
    await rad("Бу сўровни фақат масъул шахс ҳал қилади.");
    return true;
  }

  const sorov = await sorovOl(env, id);
  if (!sorov || sorov.tur !== "kard") {
    await rad("Сўров топилмади (эскириб кетган бўлиши мумкин).");
    return true;
  }
  if (sorov.holati !== "kutilmoqda") {
    const soz = { tasdiq: "тасдиқланган", rad: "рад этилган", bekor: "бекор қилинган",
                  muddat: "7 кун жавоб берилмагани учун ёпилган" };
    await rad(`Бу сўров аллақачон ${soz[sorov.holati] || "ҳал қилинган"}.`);
    return true;
  }
  // Ҳеч ким ЎЗ қарзини ўзи камайтира олмайди. Сардор ака (ҳозир масъул)
  // ва админлар ҳам сотувчи — аввал ўз сўровини ўзи тасдиқлай оларди.
  if (Number(uid) === Number(sorov.sid)) {
    await rad("Ўз сўровингизни ўзингиз тасдиқлай олмайсиз — бошқа масъул ёки админ ҳал қилади.");
    return true;
  }

  const chatId = query.message.chat.id;
  // Ҳал қилишни «эгаллаймиз»: тугма икки марта босилса ёки иккала масъул
  // бир вақтда босса — фақат биринчиси ўтади, иккинчисига «аллақачон».
  const yangiHolat = cmd === "k1" ? "tasdiq" : "rad";
  const belgi = `${query.id}`;
  const olindi = await kvRoyxatYoz(env, SOROV_KEY,
    (joriy) => joriy.map((x) => (x.id === id && x.holati === "kutilmoqda"
      ? { ...x, holati: yangiHolat, kutilmoqda: false, band: true, halQildi: belgi } : x)),
    (joriy) => { const x = joriy.find((y) => y.id === id); return !x || x.holati !== "kutilmoqda"; });
  const oxirgi = (await kvGet(env, SOROV_KEY, [])).find((x) => x.id === id);
  if (!olindi || !oxirgi || oxirgi.halQildi !== belgi) {
    await rad("Бу сўров аллақачон ҳал қилинган.");
    return true;
  }
  await tg(token, "editMessageReplyMarkup", { chat_id: chatId,
    message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });

  if (cmd === "k0") {
    await yubor(ctx, chatId,
      `❌ <b>Рад этилди</b> — ${esc(ISM[sorov.sid] || sorov.sid)}, ${pul(sorov.summa)} сўм`);
    // Mini App'дан юборилган бўлса — жавоб ИЛОВАДА (Достон 2026-09-21)
    if (sorov.manba !== "app") await yubor(ctx, sorov.sid, [
      "❌ <b>Қарздан минус рад этилди</b>",
      `💵 <b>${pul(sorov.summa)} сўм</b>`,
    ].join("\n")).catch(() => {});
    await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
    return true;
  }

  // ✅ Тасдиқланди — қарздан айирамиз
  await tolovYoz(ctx, chatId, query.message, sorov.sid, sorov.summa,
                 `kard:${sorov.id}`, "кардан минус", null, uid, "kard", sorov.manba !== "app");
  await tg(token, "answerCallbackQuery", { callback_query_id: query.id });
  return true;
}

/* ======================== ЭСЛАТМА (cron) ========================
   Тўланмаган сўров бир кундан ошса — гуруҳга, АЙНАН ЎША эълонга reply
   қилиб эслатма юборамиз: «бу сўров ҳали ёпилмади». Кунига бир марта,
   сўров ёпилгунча (тўланса ёки бекор қилинса).

   7 кун ичида ёпилмаса — cron ўзи ЁПАДИ (holati: "muddat") ва гуруҳга
   ҳамда сотувчига айтади. Аввал сўров 3 кунда жимгина ўчиб кетарди.

   Cloudflare Free: битта cron'да 50 та ташқи сўров. Шунинг учун бир
   юришда ESLATMA_MAX тадан ортиқ хабар юборилмайди — қолгани кейинги
   соатда (белги қўйилмагани учун йўқолмайди).                         */
const ESLATMA_MAX = 20;

/** Бухгалтерларни ТЕГ қилади — гуруҳда уларга билдиришнома борсин.
 *  `tg://user?id=…` — Telegram'нинг расмий «mention» усули: username
 *  керак эмас, одам гуруҳда бўлса кифоя.
 *
 *  2026-09-11: Достон «исмлар эмас, шунчаки "Бухгалтер" десин» деди.
 *  Кўринадиган матн — битта «Бухгалтер» сўзи (биринчи бухгалтерга
 *  ҳавола). Қолганлари КЎРИНМАС тег билан — ҳаволанинг матни нол
 *  кенгликдаги бўшлиқ (U+200B). Экранда ҳеч нарса кўринмайди, лекин
 *  Telegram уларга ҳам билдиришнома юборади.                           */
function buxgalterTeg() {
  const [birinchi, ...qolgan] = BUXGALTER;
  if (!birinchi) return "Бухгалтер";
  return `<a href="tg://user?id=${birinchi}">Бухгалтер</a>` +
    qolgan.map((id) => `<a href="tg://user?id=${id}">​</a>`).join("");
}

export async function sorovEslatma(ctx) {
  const { env, tg, token } = ctx;
  const guruh = String(env.OMBOR_GURUH || "").split(/[,;\s]+/).filter(Boolean)[0];
  if (!guruh) return 0;

  const ro = await kvGet(env, SOROV_KEY, []);
  const now = Date.now();
  let yuborildi = 0, xabar = 0;

  // ── 1) Муддати ўтган очиқ сўровларни ёпиш
  const yopildi = [];
  for (const s of ro) {
    if (s.band || now - s.vaqt < SOROV_OCHIQ_UMR) continue;
    if (xabar >= ESLATMA_MAX) break;
    yopildi.push(s.id);
    const kard = s.tur === "kard";
    const nishon = s.guruhMsg || s.msg;
    if (!kard && !s.kutilmoqda && nishon) {
      xabar++;
      const yr = await yubor(ctx, guruh, [
        `⌛ <b>${esc(ISM[s.sid] || s.sid)} сўрови ёпилди</b>`,
        ...(s.firma ? [`🏢 <b>${esc(firmaToliq(s.firma))}</b>`] : []),
        `💵 <b>${pul(s.summa)} сўм</b>`,
        "<i>7 кунда тўланмади — энди бу эълонга платёжка ёзилмайди.</i>",
      ].join("\n"), { reply_to_message_id: nishon }).catch(() => null);
      if (yr && yr.result) await gmBogla(env, yr.result.message_id, s.id);
    }
    if (s.sid && s.manba !== "app") {          // Mini App'дагида «Муддати ўтди» иловада кўринади
      xabar++;
      await yubor(ctx, s.sid, [
        "⌛ <b>Сўровингиз ёпилди</b>",
        "",
        ...(s.firma ? [`🏢 <b>${esc(firmaToliq(s.firma))}</b>`] : []),
        `💵 <b>${pul(s.summa)} сўм</b>`,
        "",
        kard ? "<i>7 кун ичида тасдиқланмади. Керак бўлса қайта юборинг.</i>"
             : "<i>7 кун ичида тўланмади. Тўлов ҳали керак бўлса — қайта юборинг.</i>",
      ].join("\n")).catch(() => {});
    }
  }
  if (yopildi.length) {
    const ids = new Set(yopildi);
    await kvRoyxatYoz(env, SOROV_KEY,
      (joriy) => joriy.map((x) => (ids.has(x.id) && !x.band
        ? { ...x, band: true, kutilmoqda: false, holati: "muddat" } : x)),
      (joriy) => joriy.every((x) => !ids.has(x.id) || x.band));
  }

  // ── 2) Эслатмалар
  for (const s of ro) {
    if (xabar >= ESLATMA_MAX) break;
    if (s.band || s.kutilmoqda) continue;             // ёпилган ёки тасдиқ кутмоқда
    if (now - s.vaqt >= SOROV_OCHIQ_UMR) continue;    // юқорида ёпилди
    if (s.tur === "kard") continue;                   // у гуруҳга тегишли эмас
    if (now - s.vaqt < ESLATMA_MUDDAT) continue;      // ҳали бир кун бўлмади
    if (s.eslatilgan && now - s.eslatilgan < ESLATMA_MUDDAT) continue;  // бугун айтилган

    const nishon = s.guruhMsg || s.msg;               // қайси хабарга reply
    if (!nishon) continue;

    const kun = Math.floor((now - s.vaqt) / (24 * 3600 * 1000));
    xabar++;
    // Достон 2026-09-11 да айнан шу кўринишни берди — ҳаммаси тагма-таг,
    // бўш қатор йўқ. Исм сарлавҳанинг ўзида (алоҳида 👤 қатори олиб
    // ташланди), фирма бошқа хабарлардагидек «Convitech MCHJ» бўлиб чиқади.
    const r = await yubor(ctx, guruh, [
      `⏳ <b>${esc(ISM[s.sid] || s.sid)} сўрови ҳали ёпилмади</b>`,
      ...(s.firma ? [`🏢 <b>${esc(firmaToliq(s.firma))}</b>`] : []),
      `💵 <b>${pul(s.summa)} сўм</b>` +
        (son(s.tolangan) ? ` · қолди <b>${pul(son(s.summa) - son(s.tolangan))}</b>` : ""),
      `🕒 ${kunSoatYil(s.vaqt, ", ")} — <b>${kun} кун</b> бўлди`,
      // Бухгалтерларни ТЕГ қиламиз — уларга билдиришнома борсин
      `🔔 ${buxgalterTeg()} — сўровга reply қилиб платёжкани юборинг`,
    ].join("\n"), { reply_to_message_id: nishon });

    if (r && r.ok !== false) {
      s.eslatilgan = now; yuborildi++;
      // Бухгалтер ЭСЛАТМАНИНГ ўзига reply қилиб чек ташласа ҳам сўровга уланади
      if (r.result) await gmBogla(env, r.result.message_id, s.id);
    }
  }

  // Пойгасиз: эслатма юборилаётганда сотувчи янги сўров қўшган бўлиши
  // мумкин — бутун эски рўйхатни ёзсак, у йўқолиб кетарди.
  if (yuborildi) {
    const belgi = new Map(ro.filter((s) => s.eslatilgan === now).map((s) => [s.id, now]));
    await kvRoyxatYoz(env, SOROV_KEY,
      (joriy) => joriy.map((x) => (belgi.has(x.id) ? { ...x, eslatilgan: now } : x)),
      (joriy) => joriy.every((x) => !belgi.has(x.id) || x.eslatilgan === now));
  }
  return yuborildi;
}

/** «Қарзимдан минус» тасдиқловчисининг id си — index.js менюси учун */
export { KARD_TASDIQ, KARD_TASDIQ_ASL, KARD_ZAXIRA };

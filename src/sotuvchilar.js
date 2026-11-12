// sotuvchilar.js — АДМИН учун «👥 Сотувчилар» панели.
//
// Достон 2026-09-11: «сотувчини бот ичидан қўшиш, ўчириш ва қарзини қўлда
// ўзгартириш бўлсин, лекин тугмалар кўпайиб кетмасин, чиройли бўлсин».
//
// Шунинг учун менюда БИТТА тугма. Қолган ҳамма нарса шу тугма ичида,
// битта хабарнинг ўзида алмашиб туради:
//
//   👥 Сотувчилар  →  рўйхат (исмлар)  +  ➕ Янги сотувчи
//        └ исм    →  карта: қарзи, Склад файлидаги номи
//                      ✏️ Қарзни ўзгартириш · 🗑 Ўчириш · ⬅️ Рўйхат
//
// ҚАЕРДА САҚЛАНАДИ. Кодадаги рўйхат (sklad.js, SKLAD_MAP) — асос. Ботдан
// қилинган ўзгаришлар KV'да, «omb:sotuvchilar» калитида: {qosh, ochir}.
// Ҳар бир сўров бошида sotuvchilarniYukla() уларни асос устига қўяди —
// deploy керак эмас. Калит «omb:» билан бошлангани учун кунлик захирага
// ҳам тушади.
//
// ҚАРЗНИ ЎЗГАРТИРИШ. Товар ва тўловлар тарихига ТЕГИЛМАЙДИ — фақат
// бошланғич қарз (omb:bq) шундай сурилади, ки якуний қарз админ ёзган
// рақамга тенг бўлсин. Ҳар бир ўзгариш «omb:tuzatish» да из қолдиради
// (ким, қачон, эски → янги). Тасдиқлашдан олдин эски/янги/фарқ кўрсатилади.
//
// ЎЧИРИШ. Сотувчи тугмалари ёпилади, Склад файлидаги блоки энди унга
// ёзилмайди. Қарзи ва тарихи ЎЧМАЙДИ — ҳисоботларда сақланиб қолади.

import {
  kvGet, kvPut, kvRoyxatYoz, yubor, esc, blok, qator,
  sotuvchiMalumot, isOmborAdmin, isOmborSotuvchi, BTN_SOTUVCHILAR,
} from "./ombor.js";
import { SKLAD_MAP, ISM, SOTUVCHI_KEY, sotuvchiUstama, tgIdByName, normIsm,
         matndanSumma, pul } from "./sklad.js";

export { BTN_SOTUVCHILAR };
const BTN_BEKOR = "❌ Бекор қилиш";
const BTN_TANLASH = "👤 Сотувчини танлаш";

const ST_KEY = (uid) => `omb:spx:${uid}`;       // ярим қолган қадам (zaxira.js: вақтинча)
const ST_UMR = 15 * 60;
const TUZATISH_KEY = "omb:tuzatish";
const BQ_KURS_KEY = "omb:bqkurs";
const QARZ_MAX = 50_000_000_000;

/* ======================== ўқиш / ёзиш ======================== */

/** Ҳар бир сўров бошида: ботдан қилинган ўзгаришларни рўйхатга қўяди */
export async function sotuvchilarniYukla(env) {
  sotuvchiUstama(await kvGet(env, SOTUVCHI_KEY, null));
}

async function ustamaOl(env) {
  const u = await kvGet(env, SOTUVCHI_KEY, null);
  return { qosh: { ...((u && u.qosh) || {}) }, ochir: [...((u && u.ochir) || [])].map(Number) };
}
async function ustamaYoz(env, u) {
  await kvPut(env, SOTUVCHI_KEY, u);
  sotuvchiUstama(u);                              // шу сўровнинг ўзида ҳам кучга кирсин
}

const idlar = () => [...new Set(Object.values(SKLAD_MAP))];
const ism = (id) => ISM[id] || String(id);
const excelNomlari = (id) => Object.entries(SKLAD_MAP)
  .filter(([, v]) => Number(v) === Number(id)).map(([k]) => k);

async function stOl(env, uid) {
  try { const r = await env.ACCESS_KV.get(ST_KEY(uid)); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
const stQoy = (env, uid, st) => env.ACCESS_KV.put(ST_KEY(uid), JSON.stringify(st), { expirationTtl: ST_UMR });
const stOchir = (env, uid) => env.ACCESS_KV.delete(ST_KEY(uid));
/** Янги жараён бошланганда бошқа ярим қолганлари (курс, пул чиқариш) ўчади */
async function boshqaJarayonlarniOchir(env, uid) {
  await Promise.all([`omb:kst:${uid}`, `omb:st:${uid}`].map((k) => env.ACCESS_KV.delete(k)));
}

const bekorKb = { keyboard: [[{ text: BTN_BEKOR }]], resize_keyboard: true };
const menyuKb = (ctx, uid) => (ctx.omborKb ? ctx.omborKb(uid) : ctx.mainKb(uid));

/** Inline тугмадан келган бўлса — ўша хабарнинг ўзини алмаштирамиз (чат тоза қолади) */
async function korsat(ctx, chatId, query, matn, kb) {
  const markup = { reply_markup: { inline_keyboard: kb || [] } };
  if (query && query.message) {
    const r = await ctx.tg(ctx.token, "editMessageText", {
      chat_id: chatId, message_id: query.message.message_id, text: matn,
      parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...markup });
    if (r && r.ok !== false) return r;
    // Тугма икки марта босилди — хабар аллақачон шундай. Янгисини юбормаймиз.
    if (r && /not modified/i.test(String(r.description || ""))) return r;
  }
  return yubor(ctx, chatId, matn, markup);
}

/** «90 mln», «90 000 000», «0», «-5 mln» → сон; тушунилмаса null */
export function qarzOqi(matn) {
  const t = String(matn || "").trim().replace(/ /g, " ");
  if (!t || !/\d/.test(t)) return null;
  const manfiy = /^[-−–]/.test(t);
  if (/^[-−–]?\s*0+([.,]0+)?\s*(сўм|сум|so'?m)?$/i.test(t)) return 0;
  const s = matndanSumma(t.replace(/^[-−–]\s*/, ""));
  if (!s) return null;
  return manfiy ? -s : s;
}

/* ======================== экранлар ======================== */

function royxatEkran() {
  const ro = idlar();
  const kb = [];
  for (let i = 0; i < ro.length; i += 2) {
    kb.push(ro.slice(i, i + 2).map((id) => ({ text: ism(id), callback_data: `spn|k|${id}` })));
  }
  kb.push([{ text: "➕ Янги сотувчи", callback_data: "spn|y" }]);
  return {
    matn: `👥 <b>Сотувчилар</b> — ${ro.length} та`,
    kb,
  };
}

async function kartaEkran(env, id) {
  const m = await sotuvchiMalumot(env, id);
  return {
    matn: [
      `👤 <b>${esc(ism(id))}</b>`,
      "",
      `💰 Қарзи: <b>${pul(m.qarz)} сўм</b>`,
    ].join("\n"),
    kb: [
      [{ text: "✏️ Қарзни ўзгартириш", callback_data: `spn|q|${id}` }],
      [{ text: "🗑 Ўчириш", callback_data: `spn|o|${id}` },
       { text: "⬅️ Рўйхат", callback_data: "spn|l" }],
    ],
  };
}

/* ======================== кириш: «👥 Сотувчилар» ======================== */

export async function sotuvchiPanel(ctx, chatId, uid, access) {
  if (!isOmborAdmin(uid, access)) return false;
  if (ctx.env.ACCESS_KV) await stOchir(ctx.env, uid);
  const e = royxatEkran();
  await yubor(ctx, chatId, e.matn, { reply_markup: { inline_keyboard: e.kb } });
  return true;
}

/* ======================== ёзилган хабарлар (қадамлар) ======================== */

function idniOl(message) {
  const s = message.users_shared && message.users_shared.users && message.users_shared.users[0];
  if (s && s.user_id) return { id: Number(s.user_id), taklif: [s.first_name, s.last_name].filter(Boolean).join(" ") };
  if (message.user_shared && message.user_shared.user_id) return { id: Number(message.user_shared.user_id), taklif: "" };
  if (message.contact && message.contact.user_id) {
    return { id: Number(message.contact.user_id),
             taklif: [message.contact.first_name, message.contact.last_name].filter(Boolean).join(" ") };
  }
  const fo = message.forward_origin;
  if (fo && fo.type === "user" && fo.sender_user) {
    return { id: Number(fo.sender_user.id), taklif: fo.sender_user.first_name || "" };
  }
  if (message.forward_from) return { id: Number(message.forward_from.id), taklif: message.forward_from.first_name || "" };
  const t = String(message.text || "").trim();
  if (/^\d{5,15}$/.test(t)) return { id: Number(t), taklif: "" };
  return null;
}

/** @returns {Promise<boolean>} true — хабар шу панелга тегишли эди */
export async function sotuvchiPanelXabar(ctx, message, access) {
  const { env } = ctx;
  const uid = message.from && message.from.id;
  const chatId = message.chat && message.chat.id;
  if (!uid || !env.ACCESS_KV || !message.chat || message.chat.type !== "private") return false;
  if (!isOmborAdmin(uid, access)) return false;      // бошқаларда KV умуман ўқилмайди
  const st = await stOl(env, uid);
  if (!st) return false;

  const matn = String(message.text || "").trim();
  // Матнсиз хабар (файл, расм) ёки буйруқ («/zaxira») — панелга тегишли эмас.
  // Аввал ярим қолган қадам юкланган Склад файлини ҳам «тушунмадим» деб
  // ютиб юборарди. Фақат «янги сотувчи» қадамида контакт/форвард олинади.
  const idXabar = st.qadam === "yangi_id" && (message.users_shared || message.user_shared ||
    message.contact || message.forward_origin || message.forward_from);
  if (!matn && !idXabar) return false;
  if (matn.startsWith("/") && matn !== "/cancel") {
    await stOchir(env, uid);
    return false;
  }
  if (matn === BTN_BEKOR || matn === "/cancel") {
    await stOchir(env, uid);
    await yubor(ctx, chatId, "Бекор қилинди.", { reply_markup: menyuKb(ctx, uid) });
    return true;
  }
  // Менюдаги бошқа тугма босилди — жараённи ташлаб, ўша тугмага йўл берамиз
  if ((ctx.isMainButton && ctx.isMainButton(matn)) || matn === "/start" || matn === "/menu") {
    await stOchir(env, uid);
    return false;
  }

  /* ---------- қарзни ўзгартириш: янги сумма ---------- */
  if (st.qadam === "qarz") {
    const yangi = qarzOqi(matn);
    if (yangi === null || Math.abs(yangi) > QARZ_MAX) {
      await yubor(ctx, chatId, "Суммани тушунмадим. Масалан: <b>90 mln</b> ёки <b>90 000 000</b>",
                  { reply_markup: bekorKb });
      return true;
    }
    await stOchir(env, uid);
    const m = await sotuvchiMalumot(env, st.sid);
    if (Math.round(yangi) === Math.round(m.qarz)) {
      await yubor(ctx, chatId, `Қарз ўзгармади — ҳозир ҳам <b>${pul(m.qarz)} сўм</b>.`,
                  { reply_markup: menyuKb(ctx, uid) });
      return true;
    }
    const farq = yangi - m.qarz;
    await yubor(ctx, chatId, [
      `✏️ <b>${esc(ism(st.sid))}нинг қарзи ўзгаради</b>`,
      "",
      blok([
        qator("Янги", pul(yangi), 24),
        qator("Фарқ", (farq > 0 ? "+" : "") + pul(farq), 24),
      ].join("\n")),
    ].join("\n"), { reply_markup: { inline_keyboard: [[
      { text: "✅ Тасдиқлайман", callback_data: `spn|qt|${st.sid}|${Math.round(yangi)}|${Math.round(m.qarz)}` },
      { text: "❌ Йўқ", callback_data: "spn|x" },
    ]] } });
    return true;
  }

  /* ---------- янги сотувчи: ким? ---------- */
  if (st.qadam === "yangi_id") {
    const t = idniOl(message);
    if (!t) {
      await yubor(ctx, chatId, `«${BTN_TANLASH}» тугмасини босинг ёки Telegram ID сини ёзинг.`,
                  { reply_markup: yangiIdKb() });
      return true;
    }
    if (isOmborSotuvchi(t.id)) {
      await yubor(ctx, chatId, `⚠️ <b>${esc(ism(t.id))}</b> аллақачон сотувчи. Бошқасини танланг.`,
                  { reply_markup: yangiIdKb() });
      return true;
    }
    const taklif = String(ISM[t.id] || t.taklif || "").trim().slice(0, 40);
    await stQoy(env, uid, { qadam: "yangi_ism", id: t.id, taklif });
    const kb = [];
    if (taklif) kb.push([{ text: taklif }]);
    kb.push([{ text: BTN_BEKOR }]);
    await yubor(ctx, chatId, "✍️ <b>Исмини ёзинг</b>",
                { reply_markup: { keyboard: kb, resize_keyboard: true } });
    return true;
  }

  /* ---------- янги сотувчи: исми ---------- */
  if (st.qadam === "yangi_ism") {
    const nom = matn.replace(/\s+/g, " ").trim();
    if (nom.length < 2 || nom.length > 40 || nom.startsWith("/") || !normIsm(nom)) {
      await yubor(ctx, chatId, "Исмни 2–40 ҳарф билан ёзинг.", { reply_markup: bekorKb });
      return true;
    }
    const band = tgIdByName(nom);
    if (band !== null && Number(band) !== Number(st.id)) {
      await yubor(ctx, chatId, `⚠️ «${esc(nom)}» номи банд — у <b>${esc(ism(band))}</b>га тегишли. Бошқача ёзинг.`,
                  { reply_markup: bekorKb });
      return true;
    }
    await stQoy(env, uid, { qadam: "yangi_tasdiq", id: st.id, ism: nom });
    await yubor(ctx, chatId, [
      "➕ <b>Янги сотувчи</b>",
      "",
      `👤 <b>${esc(nom)}</b>`,
      `🆔 <code>${st.id}</code>`,
    ].join("\n"), { reply_markup: { inline_keyboard: [[
      { text: "✅ Қўшиш", callback_data: "spn|y1" },
      { text: "❌ Йўқ", callback_data: "spn|x" },
    ]] } });
    return true;
  }

  if (st.qadam === "yangi_tasdiq") {
    await yubor(ctx, chatId, "Юқоридаги «✅ Қўшиш» ёки «❌ Йўқ» тугмасини босинг.");
    return true;
  }
  return false;
}

function yangiIdKb() {
  return { resize_keyboard: true, keyboard: [
    [{ text: BTN_TANLASH, request_users: { request_id: 1, user_is_bot: false, max_quantity: 1,
                                          request_name: true, request_username: true } }],
    [{ text: BTN_BEKOR }],
  ] };
}

/* ======================== тугмалар (callback) ======================== */

export async function sotuvchiPanelCallback(ctx, query, access) {
  const { env, tg, token } = ctx;
  const uid = query.from.id;
  const chatId = query.message.chat.id;
  const [, cmd, a, b, c] = String(query.data || "").split("|");
  if (!isOmborAdmin(uid, access)) {
    await yubor(ctx, chatId, "🔒 Сотувчилар панели — фақат админ учун.");
    return true;
  }
  const tugmasiz = () => tg(token, "editMessageReplyMarkup", { chat_id: chatId,
    message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });

  if (cmd === "l") {
    await stOchir(env, uid);
    const e = royxatEkran();
    await korsat(ctx, chatId, query, e.matn, e.kb);
    return true;
  }

  if (cmd === "k") {
    const id = Number(a);
    if (!isOmborSotuvchi(id)) {
      const e = royxatEkran();
      await korsat(ctx, chatId, query, "⚠️ Бу одам энди сотувчи эмас.\n\n" + e.matn, e.kb);
      return true;
    }
    await stOchir(env, uid);                            // картага қайтди — ярим қолган қадам йўқ
    const e = await kartaEkran(env, id);
    await korsat(ctx, chatId, query, e.matn, e.kb);
    return true;
  }

  /* ---------- ✏️ қарз ---------- */
  if (cmd === "q") {
    const id = Number(a);
    if (!isOmborSotuvchi(id)) { await korsat(ctx, chatId, query, "⚠️ Бу одам энди сотувчи эмас."); return true; }
    // Бошланғич қарзлар биринчи курс танланганда ЎЗИ ёзилади ва ўшанда
    // omb:bq бутунлай қайта ёзилади. Ундан олдин қилинган тузатиш ўчиб
    // кетарди — шунинг учун аввал курс.
    if (!(await kvGet(env, BQ_KURS_KEY, null))) {
      await yubor(ctx, chatId, "💱 Аввал «💱 Курсни танлаш» тугмаси орқали курсни ёзинг — кейин қарзни ўзгартириш мумкин.");
      return true;
    }
    const m = await sotuvchiMalumot(env, id);
    await boshqaJarayonlarniOchir(env, uid);
    await stQoy(env, uid, { qadam: "qarz", sid: id });
    await yubor(ctx, chatId, [
      `✏️ <b>${esc(ism(id))}</b>`,
      `Ҳозирги қарзи: <b>${pul(m.qarz)} сўм</b>`,
      "",
      "Янги қарзни ёзинг",
    ].join("\n"), { reply_markup: bekorKb });
    return true;
  }

  if (cmd === "qt") {
    const id = Number(a), yangi = Number(b), eski = Number(c);
    if (!isOmborSotuvchi(id) || !Number.isFinite(yangi) || !Number.isFinite(eski)) {
      await tugmasiz();
      await yubor(ctx, chatId, "⚠️ Бу сўров эскирган.", { reply_markup: menyuKb(ctx, uid) });
      return true;
    }
    const m = await sotuvchiMalumot(env, id);
    if (Math.round(m.qarz) === yangi) {                 // икки марта босилди
      await tugmasiz();
      return true;
    }
    if (Math.round(m.qarz) !== eski) {
      await tugmasiz();
      await yubor(ctx, chatId, [
        "⚠️ <b>Шу орада қарз ўзгарди</b> (тўлов ёки файл юкланди).",
        `Ҳозир: <b>${pul(m.qarz)} сўм</b>. Ҳеч нима ёзилмади — қайтадан уриниб кўринг.`,
      ].join("\n"), { reply_markup: menyuKb(ctx, uid) });
      return true;
    }
    const farq = yangi - eski;
    const bqYangi = Math.round(m.boshlangich + farq);
    const obj = (o) => (o && !Array.isArray(o) && typeof o === "object" ? o : {});
    const saqlandi = await kvRoyxatYoz(env, "omb:bq",
      (o) => ({ ...obj(o), [id]: bqYangi }),
      (o) => Number(obj(o)[id]) === bqYangi);
    if (!saqlandi) {
      await tugmasiz();
      await yubor(ctx, chatId, "❌ Сақланмади — бир оздан сўнг қайта уриниб кўринг.",
                  { reply_markup: menyuKb(ctx, uid) });
      return true;
    }
    const yozuv = { id: Math.random().toString(36).slice(2, 8).toUpperCase(), sid: id,
                    eski, yangi, farq, bqEski: m.boshlangich, bqYangi, kim: uid,
                    vaqt: new Date().toISOString() };
    await kvRoyxatYoz(env, TUZATISH_KEY,
      (ro) => (Array.isArray(ro) ? ro : []).filter((x) => x.id !== yozuv.id).concat([yozuv]).slice(-300),
      (ro) => Array.isArray(ro) && ro.some((x) => x.id === yozuv.id));
    await tugmasiz();
    await yubor(ctx, chatId, `✅ <b>${esc(ism(id))}нинг қарзи: ${pul(yangi)} сўм</b>`,
                { reply_markup: menyuKb(ctx, uid) });
    return true;
  }

  /* ---------- 🗑 ўчириш ---------- */
  if (cmd === "o") {
    const id = Number(a);
    if (!isOmborSotuvchi(id)) { await korsat(ctx, chatId, query, "⚠️ Бу одам энди сотувчи эмас."); return true; }
    const m = await sotuvchiMalumot(env, id);
    await korsat(ctx, chatId, query, [
      `🗑 <b>${esc(ism(id))}ни ўчирамизми?</b>`,
      "",
      "Ботда унинг сотувчи тугмалари ёпилади.",
      `<i>Қарзи (${pul(m.qarz)} сўм) ва тарихи ҳисоботларда сақланиб қолади.</i>`,
    ].join("\n"), [[
      { text: "✅ Ҳа, ўчириш", callback_data: `spn|o1|${id}` },
      { text: "❌ Йўқ", callback_data: `spn|k|${id}` },
    ]]);
    return true;
  }

  if (cmd === "o1") {
    const id = Number(a);
    if (!isOmborSotuvchi(id)) {
      const e = royxatEkran();
      await korsat(ctx, chatId, query, e.matn, e.kb);
      return true;
    }
    const nom = ism(id);
    const u = await ustamaOl(env);
    // Ботдан қўшилган сотувчининг ёзуви (исми) ЎЧИРИЛМАЙДИ — у ҳисоботларда
    // ва тарихда исми билан кўриниши керак. Фақат «ўчирилганлар» га тушади.
    if (!u.ochir.includes(id)) u.ochir.push(id);
    await ustamaYoz(env, u);
    await korsat(ctx, chatId, query, `🗑 <b>Сотувчи ${esc(nom)} ўчирилди</b>`,
                 [[{ text: "⬅️ Рўйхат", callback_data: "spn|l" }]]);
    return true;
  }

  /* ---------- ➕ янги ---------- */
  if (cmd === "y") {
    await boshqaJarayonlarniOchir(env, uid);
    await stQoy(env, uid, { qadam: "yangi_id" });
    // Йўриқнома матни йўқ — фақат тугмалар (Telegram клавиатурани кўрсатиш
    // учун хабарда БИРОР матн бўлиши шарт, шунинг учун фақат сарлавҳа).
    await yubor(ctx, chatId, "➕ <b>Янги сотувчи</b>", { reply_markup: yangiIdKb() });
    return true;
  }

  if (cmd === "y1") {
    const st = await stOl(env, uid);
    if (!st || st.qadam !== "yangi_tasdiq") { await tugmasiz(); return true; }  // эскирган ёки икки марта
    await stOchir(env, uid);
    await tugmasiz();
    if (isOmborSotuvchi(st.id)) {
      await yubor(ctx, chatId, `⚠️ <b>${esc(ism(st.id))}</b> аллақачон сотувчи.`,
                  { reply_markup: menyuKb(ctx, uid) });
      return true;
    }
    const u = await ustamaOl(env);
    u.ochir = u.ochir.filter((x) => x !== Number(st.id));
    u.qosh[st.id] = { ism: st.ism, excel: [st.ism], kim: uid, vaqt: new Date().toISOString() };
    await ustamaYoz(env, u);
    await yubor(ctx, chatId, `✅ <b>Янги сотувчи қўшилди: ${esc(st.ism)}</b>`,
                { reply_markup: menyuKb(ctx, uid) });
    // Сотувчининг ўзига ҳам айтамиз (ботни ҳали очмаган бўлса — жимгина ўтади)
    await yubor(ctx, st.id, "👋 <b>Сиз «Бигант омбор»га сотувчи сифатида қўшилдингиз</b>",
                { reply_markup: ctx.mainKb ? ctx.mainKb(st.id) : undefined }).catch(() => {});
    return true;
  }

  if (cmd === "x") {
    await stOchir(env, uid);
    await tugmasiz();
    await yubor(ctx, chatId, "Бекор қилинди.", { reply_markup: menyuKb(ctx, uid) });
    return true;
  }
  return true;
}

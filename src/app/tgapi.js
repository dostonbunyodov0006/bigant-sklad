// src/app/tgapi.js — Telegram Bot API ёрдамчилари (index.js даги tg() нинг нусхаси —
// у экспорт қилинмаган; қоидалар бир хил: reply йўқолса ҳам хабар кетади, 429 да кутади).
import { yozishMumkin, taqiqJavob, odamgaTaqiq } from "../taqiq.js";
const TG_URINISH = 2;
const TG_KUTISH_MAX = 5;
const kut = (ms) => new Promise((r) => setTimeout(r, ms));

export async function tg(token, method, payload, opts) {
  if (opts && opts.istisno && payload) payload = { ...payload, istisno: true };
  // 🚫 BIGANT гуруҳига ёзиш тақиқи (src/taqiq.js). ИСТИСНО (Достон + хўжайин, 2026-09-21): бонус эълонлари —
  // рағбатлантириш ва «ишни бошлади / тугатди» — гуруҳга боради (bonusapi.js opts.bonus = true, фақат sendMessage).
  // editMessageText / deleteMessage — ботнинг ЎЗ бонус эълонини янги шаклга ўтказиш ва такрорини ўчириш учун (Руслан 2026-09-24).
  const istisno = Boolean(opts && opts.bonus) && ["sendMessage", "editMessageText", "deleteMessage"].includes(method);
  if (!istisno && !yozishMumkin(method, payload)) return taqiqJavob(method, payload);
  if (odamgaTaqiq(method, payload, opts)) return taqiqJavob(method, payload);   // Абдумажид — бонус истисноси ҳам ўтмайди
  if (payload && payload.istisno) {
    const { istisno: _i, ...toza } = payload;
    payload = toza;
  }
  if (payload && payload.reply_to_message_id && payload.allow_sending_without_reply === undefined) {
    payload = { ...payload, allow_sending_without_reply: true };
  }
  for (let urinish = 0; ; urinish++) {
    let data;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      data = await res.json();
    } catch (e) {
      if (urinish < TG_URINISH) { await kut(700 * (urinish + 1)); continue; }
      console.error("tg тармоқ:", method, e);
      return { ok: false, error_code: 0, description: String(e) };
    }
    if (data && data.ok === false && data.error_code === 429 && urinish < TG_URINISH) {
      const s = Math.min(Math.max(Number(data.parameters && data.parameters.retry_after) || 1, 1), TG_KUTISH_MAX);
      await kut(s * 1000);
      continue;
    }
    if (data && data.ok === false) console.error("tg:", method, data.error_code, data.description);
    return data;
  }
}

/** Файл билан юбориш (multipart): sendDocument / sendPhoto. fayl = {bytes, nom, mime} */
export async function tgFaylYubor(token, method, maydon, fields, fayl) {
  if (!yozishMumkin(method, fields)) return taqiqJavob(method, fields);
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  fd.append(maydon, new Blob([fayl.bytes], { type: fayl.mime || "application/octet-stream" }), fayl.nom || "file");
  let j = null;
  for (let urinish = 0; urinish <= TG_URINISH; urinish++) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: fd });
      j = await r.json();
    } catch (e) {
      j = { ok: false, error_code: 0, description: String(e) };
      if (urinish < TG_URINISH) { await kut(700 * (urinish + 1)); continue; }
    }
    if (!(j && j.ok === false && j.error_code === 429) || urinish === TG_URINISH) break;
    await kut(Math.min(Math.max(Number(j.parameters && j.parameters.retry_after) || 1, 1), TG_KUTISH_MAX) * 1000);
  }
  if (j && j.ok === false) console.error("tg:", method, j.error_code, j.description);
  return j;
}

/** Ботнинг контексти — ombor.js / sorovnoma.js функциялари шуни кутади */
export function botCtx(env) {
  // mainKb/omborKb: ботнинг функциялари reply_markup учун чақиради — иловада клавиатура йўқ
  return { env, token: env.BOT_TOKEN, tg, mainKb: () => undefined, omborKb: undefined, isMainButton: () => false };
}

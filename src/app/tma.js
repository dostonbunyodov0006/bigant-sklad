// src/app/tma.js — Telegram Mini App initData имзосини текшириш.
// Ҳужжат: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//   secret = HMAC_SHA256(key = "WebAppData", msg = bot_token)
//   hash   = hex(HMAC_SHA256(key = secret, msg = data_check_string))
//   data_check_string = «hash»дан бошқа ҲАММА майдон (декодланган), калит
//                       бўйича сараланган, "\n" билан бирлаштирилган.
// Ҳеч нимани импорт қилмайди — тестда ҳам, Worker'да ҳам бир хил ишлайди.

const enc = new TextEncoder();

async function hmac(kalit, matn) {
  const k = await crypto.subtle.importKey("raw", kalit, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(matn)));
}
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Вақтга боғлиқ бўлмаган таққослаш (имзо узунлиги бир хил бўлса) */
function tengmi(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** URLSearchParams → кутилаётган hash (hex) */
export async function initDataImzo(params, token) {
  const satr = [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac(enc.encode("WebAppData"), token);
  return hex(await hmac(secret, satr));
}

/**
 * @returns {Promise<{ok:true, uid:number, user:object, authDate:number} | {ok:false, xato:string}>}
 */
export async function initDataTekshir(initData, token, { maxYosh = 86400, hozir = Date.now() } = {}) {
  if (!initData || typeof initData !== "string" || !token) return { ok: false, xato: "initData йўқ" };
  let p;
  try { p = new URLSearchParams(initData); } catch { return { ok: false, xato: "initData бузуқ" }; }
  const hash = p.get("hash");
  if (!hash) return { ok: false, xato: "hash йўқ" };
  const kutilgan = await initDataImzo(p, token);
  if (!tengmi(kutilgan, hash.toLowerCase())) return { ok: false, xato: "имзо нотўғри" };
  const authDate = Number(p.get("auth_date"));
  if (!Number.isFinite(authDate) || hozir / 1000 - authDate > maxYosh) return { ok: false, xato: "муддати ўтган — иловани қайта очинг" };
  let user = null;
  try { user = JSON.parse(p.get("user") || "null"); } catch { user = null; }
  if (!user || !Number.isFinite(Number(user.id))) return { ok: false, xato: "user йўқ" };
  return { ok: true, uid: Number(user.id), user, authDate };
}

/** Синов учун: сервер имзоси билан initData ясаш (Telegram шундай беради) */
export async function initDataYasa(user, token, { authDate = Math.floor(Date.now() / 1000), queryId = "AAHtest" } = {}) {
  const p = new URLSearchParams();
  p.set("auth_date", String(authDate));
  p.set("query_id", queryId);
  p.set("user", JSON.stringify(user));
  p.set("hash", await initDataImzo(p, token));
  return p.toString();
}

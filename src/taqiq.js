// 🚫 Гуруҳга/одамга ёзиш тақиғи — ОЧИҚ репозиторий учун бўш намуна.
// Асл рўйхат ишчи тизимда турган ҳақиқий чат id ларидан иборат, шу ерга кирмайди.
// Ишлатиш: тақиқлаш керак бўлган chat_id ларни қуйидаги Set'ларга қўшинг.

export const YOZISH_TAQIQ = new Set([]);   // гуруҳ id лари
export const ODAMGA_TAQIQ = new Set([]);   // шахсий chat_id лар

const OQISH = new Set(["getChat", "getChatMember", "getChatMemberCount", "getChatAdministrators", "getFile"]);

export function odamgaTaqiq(method, payload) {
  const chat = payload && payload.chat_id;
  return chat !== undefined && chat !== null && ODAMGA_TAQIQ.has(Number(chat)) && !OQISH.has(method);
}

export function yozishMumkin(method, payload) {
  const chat = payload && payload.chat_id;
  if (chat === undefined || chat === null) return true;
  if (odamgaTaqiq(method, payload)) return false;
  if (!YOZISH_TAQIQ.has(Number(chat))) return true;
  return OQISH.has(method);
}

export function taqiqJavob(method, payload) {
  console.log("тақиқ:", method, payload && payload.chat_id);
  return { ok: false, taqiq: true };
}

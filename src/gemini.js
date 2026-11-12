// GOOGLE GEMINI — платёжка расмини ўқиш.
//
// Достон 2026-09-14: Cloudflare'нинг ўз модели (Mistral) чекдаги суммани
// адашиб ўқиди («11 100 000 → 110 000 000», «100 000 000 →
// 10 000 000 000»). Gemini Flash расмдаги рақамларни анча аниқ ўқийди ва
// текин лимити бор.
//
// ҚАНДАЙ ЁҚИЛАДИ:
//   1) https://aistudio.google.com/apikey — калит олинади
//   2) npx wrangler secret put GEMINI_API_KEY   (калит КОДГА ёзилмайди)
//   3) deploy
// Калит бўлмаса ёки Gemini хато берса — бот ЖИМГИНА эски модел
// (Cloudflare Workers AI) билан ишлашда давом этади. Яъни калит
// қўйилмагунча ҳеч нарса бузилмайди.
//
// МОДЕЛ НОМИ: wrangler.toml даги GEMINI_MODEL билан алмаштирилади
// (Google янги версия чиқарса, кодга тегмасдан ўзгартириш учун).
//
// ДИҚҚАТ (Достонга айтилган): текин тарифда Google юборилган маълумотни
// ўз моделларини яхшилашга ишлатиши мумкин. Платёжкада фирма, ИНН, сумма
// бор. Пуллик тарифда бундай бўлмайди.

// 2026-09-14: gemini-2.5-flash ЯНГИ фойдаланувчиларга ёпилган (Google 404
// қайтаради). Текин тарифда синалди: 3.6-flash барқарор, 3.8/3.7 — «high
// demand» (503) бериб турди.
export const GEMINI_MODEL_STANDART = "gemini-3.6-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const KUTISH_MS = 20000;               // Google жавоб бермаса — эски моделга ўтамиз

/** Gemini ёқилганми? (калит қўйилган бўлса) */
export function geminiBor(env) {
  return Boolean(env && typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.trim());
}

/**
 * Расмни (ёки PDF'ни) Gemini'га юбориб, ЖАВОБ МАТНИНИ қайтаради.
 * Хато бўлса Error ташлайди — хабарда калит ҲЕЧ ҚАЧОН бўлмайди.
 * @param {object} env     Worker env (GEMINI_API_KEY, GEMINI_MODEL)
 * @param {string} prompt  кўрсатма
 * @param {string} media   "image/jpeg" | "image/png" | "application/pdf"
 * @param {string} base64  файл мазмуни (base64)
 */
export async function geminiOqi(env, prompt, media, base64) {
  if (!geminiBor(env)) throw new Error("GEMINI_API_KEY йўқ");
  const model = String(env.GEMINI_MODEL || GEMINI_MODEL_STANDART).trim();

  const toxtat = new AbortController();
  const vaqt = setTimeout(() => toxtat.abort(), KUTISH_MS);
  let res;
  try {
    res = await fetch(`${GEMINI_URL}${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // Калит сарлавҳада — URL'да эмас: URL логларга тушиши мумкин.
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY.trim() },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { text: prompt },
          { inline_data: { mime_type: media, data: base64 } },
        ] }],
        generationConfig: {
          temperature: 0,                       // ижодкорлик керак эмас — аниқ кўчириш
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
        },
      }),
      signal: toxtat.signal,
    });
  } catch (err) {
    throw new Error("Gemini'га уланиб бўлмади: " + (err && err.name === "AbortError" ? "вақт тугади" : String(err && err.message || err)));
  } finally {
    clearTimeout(vaqt);
  }

  let j = null;
  try { j = await res.json(); } catch { j = null; }
  if (!res.ok) {
    const sabab = (j && j.error && (j.error.message || j.error.status)) || ("HTTP " + res.status);
    throw new Error("Gemini хато: " + String(sabab).slice(0, 200));
  }
  const nomzod = j && j.candidates && j.candidates[0];
  const matn = nomzod && nomzod.content && Array.isArray(nomzod.content.parts)
    ? nomzod.content.parts.map((p) => (p && p.text) || "").join("")
    : "";
  if (!matn) {
    const sabab = (nomzod && nomzod.finishReason) || (j && j.promptFeedback && j.promptFeedback.blockReason) || "бўш жавоб";
    throw new Error("Gemini жавоб бермади: " + sabab);
  }
  return matn;
}

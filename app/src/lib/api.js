import { initData } from "./tg.js";

let viewAs = null, foydKor = false;
/** Тестер қайси бўлимда (X-View-As); hammasi=false — «фойдаланувчи кўради» (X-View-User: тестер имтиёзлари ҳам йўқ) */
export function setViewAs(r, hammasi = true) { viewAs = r; foydKor = Boolean(r) && !hammasi; }

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = { authorization: "tma " + initData() };
  if (viewAs) headers["x-view-as"] = viewAs;
  if (viewAs && foydKor) headers["x-view-user"] = "1";
  if (body !== undefined && !form) headers["content-type"] = "application/json";
  // «Failed to fetch» (Достон 2026-09-15): Telegram WebView'да алоқа бир лаҳза узилса
  // сўров ўзи 3 мартагача қайта юборилади. Овоз ёзиш такрорланса ҳам зарар йўқ — охиргиси қолади.
  let r = null;
  for (let urinish = 0; ; urinish++) {
    try {
      r = await fetch("/api" + path, { method, cache: "no-store", headers, body: form ? form : body !== undefined ? JSON.stringify(body) : undefined });
      break;
    } catch (e) {
      if (urinish >= 2 || form) { const x = new Error("Интернет алоқаси йўқ — қайта уриниб кўринг"); x.status = 0; throw x; }
      await new Promise((ok) => setTimeout(ok, 500 * (urinish + 1)));
    }
  }
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok || !j || j.ok === false) {
    const e = new Error((j && j.xato) || `HTTP ${r.status}`);
    e.status = r.status;
    // Хато билан бирга келган қўшимча маълумот (мас. файлдан ўқилган сатрлар)
    if (j && j.korilgan) e.korilgan = j.korilgan;
    if (j && j.royxat) e.royxat = j.royxat;
    throw e;
  }
  return j;
}

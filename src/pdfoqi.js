// PDF ИЧИДАГИ МАТНни ўқиш — ToUnicode жадвали билан.
//
// Достон 2026-09-15: сотувчи «💸 Пул чиқариш» да счёт/спецификация PDF'ини
// ташлайди. Excel'дан чиқарилган PDF'ларда кириллица «Type0 / Identity-H»
// шрифтида КОД сифатида ёзилади (<0123> Tj) — эски ўқувчи фақат (...) Tj ни
// кўрарди, шунинг учун фирма номи ва ИНН чиқмасди, фақат рақамлар қоларди.
// Cloudflare'нинг toMarkdown'и ҳам бу PDF'да бўш саҳифа қайтарди.
//
// Бу ерда PDF'нинг ўзидаги ToUnicode жадвали (код → ҳарф) ўқилади. AI йўқ,
// пул сарфланмайди.

const LATIN1 = new TextDecoder("latin1");

/** Байтлар → latin1 сатр (ҳар байт — битта белги) */
function lat(b) {
  return LATIN1.decode(b);
}

/**
 * PDF объектларини йиғади: рақам → { dict, stream (очилган байтлар) }.
 * Object stream (/Type/ObjStm) ичидаги объектлар ҳам очилади.
 * @param {Uint8Array} buf
 * @param {(b: Uint8Array) => Promise<Uint8Array|null>} inflate
 */
async function objektlar(buf, inflate) {
  const xom = lat(buf);
  const obj = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(xom)) !== null) {
    const bosh = m.index + m[0].length;
    const oxir = xom.indexOf("endobj", bosh);
    if (oxir === -1) break;
    let tana = xom.slice(bosh, oxir);
    let stream = null;
    const s = tana.search(/\bstream\r?\n/);
    if (s !== -1) {
      const dict = tana.slice(0, s);
      const sb = bosh + s + tana.slice(s).match(/^stream\r?\n/)[0].length;
      let se = xom.indexOf("endstream", sb);
      if (se === -1 || se > oxir) se = oxir;
      while (se > sb && (buf[se - 1] === 0x0a || buf[se - 1] === 0x0d)) se--;
      let bayt = buf.subarray(sb, se);
      if (/\/FlateDecode/.test(dict)) bayt = (await inflate(bayt)) || new Uint8Array(0);
      else if (/\/Filter/.test(dict)) bayt = new Uint8Array(0);   // бошқа сиқиш — ўқимаймиз
      stream = bayt;
      tana = dict;
    }
    obj.set(Number(m[1]), { dict: tana, stream });
    re.lastIndex = oxir + 6;
  }
  // Object stream'лар (замонавий PDF'ларда шрифт/саҳифа шу ичида бўлади)
  for (const o of [...obj.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.stream) continue;
    const n = Number((o.dict.match(/\/N\s+(\d+)/) || [])[1] || 0);
    const first = Number((o.dict.match(/\/First\s+(\d+)/) || [])[1] || 0);
    const s = lat(o.stream);
    const bosh = s.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const raqam = bosh[i * 2], ofs = bosh[i * 2 + 1];
      const keyingi = i + 1 < n ? bosh[(i + 1) * 2 + 1] : s.length - first;
      if (!obj.has(raqam)) obj.set(raqam, { dict: s.slice(first + ofs, first + keyingi), stream: null });
    }
  }
  return obj;
}

const havola = (s) => { const m = String(s || "").match(/^\s*(\d+)\s+\d+\s+R/); return m ? Number(m[1]) : null; };

/** Диктдан калит қийматини олади: «/Font 12 0 R» ёки «/Font <<...>>» */
function kalit(dict, nom, obj) {
  const i = dict.search(new RegExp("/" + nom + "(?![A-Za-z])"));
  if (i === -1) return "";
  let q = dict.slice(i + nom.length + 1).trimStart();
  const h = havola(q);
  if (h !== null) return obj.has(h) ? obj.get(h).dict : "";
  if (q.startsWith("<<")) {
    let d = 0;
    for (let j = 0; j < q.length - 1; j++) {
      if (q[j] === "<" && q[j + 1] === "<") { d++; j++; }
      else if (q[j] === ">" && q[j + 1] === ">") { d--; j++; if (!d) return q.slice(0, j + 1); }
    }
  }
  return q;
}

/** ToUnicode CMap → Map(код hex → матн) ва код узунлиги (байт) */
function cmapOqi(s) {
  const xarita = new Map();
  const oraliqlar = [];
  let uzun = 1;
  const hexMatn = (h) => {
    let t = "";
    for (let i = 0; i + 4 <= h.length; i += 4) t += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    if (h.length % 4 === 2) t += String.fromCharCode(parseInt(h.slice(-2), 16));
    return t;
  };
  const cs = s.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/);
  if (cs) uzun = cs[1].length / 2;
  for (const blok of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const q of blok[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g))
      xarita.set(q[1].toUpperCase(), hexMatn(q[2]));
  for (const blok of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const q of blok[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      const a = parseInt(q[1], 16), b = parseInt(q[2], 16), w = q[1].length;
      if (b - a > 5000) {
        // Катта оралиқ (FPDF: <0000> <FFFF> <0000> — код = ҳарф). Рўйхатга
        // очилмайди, қидирганда ҳисобланади.
        if (q[3].startsWith("<")) {
          const h = q[3].slice(1, -1);
          oraliqlar.push({ a, b, boshi: parseInt(h.slice(-4) || "0", 16), old: hexMatn(h.slice(0, -4)) });
        }
        continue;
      }
      if (q[3].startsWith("[")) {
        const royxat = [...q[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => hexMatn(x[1]));
        for (let c = a; c <= b; c++) xarita.set(c.toString(16).toUpperCase().padStart(w, "0"), royxat[c - a] || "");
      } else {
        const h = q[3].slice(1, -1), boshi = parseInt(h.slice(-4) || "0", 16), old = hexMatn(h.slice(0, -4));
        for (let c = a; c <= b; c++)
          xarita.set(c.toString(16).toUpperCase().padStart(w, "0"), old + String.fromCharCode(boshi + c - a));
      }
    }
  }
  return { xarita, oraliqlar, uzun };
}

/** (...) литерал сатрини байтларга */
function literal(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out.push(c.charCodeAt(0) & 255); continue; }
    const n = s[++i];
    if (n === undefined) break;
    if (/[0-7]/.test(n)) {
      let o = n;
      while (o.length < 3 && /[0-7]/.test(s[i + 1] || "")) o += s[++i];
      out.push(parseInt(o, 8) & 255);
    } else if (n === "n") out.push(10);
    else if (n === "r") out.push(13);
    else if (n === "t") out.push(9);
    else if (n === "\r" || n === "\n") { if (n === "\r" && s[i + 1] === "\n") i++; }
    else out.push(n.charCodeAt(0) & 255);
  }
  return out;
}

/** Байтларни жорий шрифт бўйича матнга */
function kodla(baytlar, shrift) {
  if (!shrift || !shrift.cmap) {
    // оддий шрифт (WinAnsi) — байт = ҳарф; 1251 кириллица бўлиши ҳам мумкин
    return baytlar.map((b) => (b >= 0xc0 && shrift && shrift.cyr ? String.fromCharCode(0x410 + b - 0xc0)
      : String.fromCharCode(b))).join("");
  }
  const { xarita, oraliqlar, uzun } = shrift.cmap;
  let t = "";
  for (let i = 0; i + uzun <= baytlar.length; i += uzun) {
    let h = "", kod = 0;
    for (let j = 0; j < uzun; j++) {
      h += baytlar[i + j].toString(16).toUpperCase().padStart(2, "0");
      kod = kod * 256 + baytlar[i + j];
    }
    if (xarita.has(h)) { t += xarita.get(h); continue; }
    const o = oraliqlar.find((x) => kod >= x.a && kod <= x.b);
    if (o) t += o.old + String.fromCharCode(o.boshi + kod - o.a);
  }
  return t;
}

/** Контент оқимини ўқиб матн чиқаради */
function oqimMatni(s, shriftlar) {
  let shrift = null;
  const qator = [];
  let joriy = "";
  const tokenRe = /\/([^\s/<>\[\]()]+)\s+[-\d.]+\s+Tf|\((?:\\[\s\S]|[^\\()])*\)|<([0-9A-Fa-f\s]*)>|\[|\]|(-?\d*\.?\d+)|\b(Tj|TJ|'|"|Td|TD|Tm|T\*|ET|BT)\b/g;
  let m;
  let massivda = false;
  const qosh = (baytlar) => { joriy += kodla(baytlar, shrift); };
  const yangiQator = () => { if (joriy.trim()) qator.push(joriy.trim()); joriy = ""; };
  let songgiStr = null;
  while ((m = tokenRe.exec(s)) !== null) {
    const t = m[0];
    if (m[1] !== undefined && /Tf$/.test(t)) { shrift = shriftlar.get(m[1]) || null; continue; }
    if (t === "[") { massivda = true; continue; }
    if (t === "]") { massivda = false; continue; }
    if (t[0] === "(") { const b = literal(t.slice(1, -1)); if (massivda) qosh(b); else songgiStr = b; continue; }
    if (t[0] === "<") {
      const h = (m[2] || "").replace(/\s+/g, "");
      const b = [];
      for (let i = 0; i + 1 < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
      if (massivda) qosh(b); else songgiStr = b;
      continue;
    }
    if (m[3] !== undefined) {
      // TJ ичидаги катта сурилиш — сўзлар орасидаги бўшлиқ
      if (massivda && Number(m[3]) < -180) joriy += " ";
      continue;
    }
    const op = m[4];
    if (op === "Tj" || op === "'" || op === '"') { if (songgiStr) qosh(songgiStr); songgiStr = null; joriy += " "; }
    else if (op === "TJ") joriy += " ";
    else if (op === "Td" || op === "TD" || op === "Tm" || op === "T*" || op === "ET") yangiQator();
  }
  yangiQator();
  return qator.join("\n");
}

/**
 * PDF байтларидан матн. Хато бўлса "" қайтаради.
 * @param {Uint8Array} buf
 * @param {(b: Uint8Array) => Promise<Uint8Array|null>} inflate
 * @param {number} [maks] натижа узунлиги чегараси
 */
export async function pdfMatnToliq(buf, inflate, maks = 6000) {
  try {
    const obj = await objektlar(buf, inflate);
    const shriftXotira = new Map();            // шрифт объекти → { cmap, cyr }
    const shriftOl = (dict) => {
      const tu = havola((dict.match(/\/ToUnicode\s+(\d+\s+\d+\s+R)/) || [])[1]);
      const cyr = /Cyr|1251/i.test(dict);
      let cmap = null;
      if (tu !== null && obj.has(tu) && obj.get(tu).stream) cmap = cmapOqi(lat(obj.get(tu).stream));
      return { cmap, cyr };
    };
    const sahifalar = [...obj.entries()]
      .filter(([, o]) => /\/Type\s*\/Page(?![s\w])/.test(o.dict))
      .sort((a, b) => a[0] - b[0]);
    const shriftlarOl = (res) => {
      const fontDict = kalit(res, "Font", obj);
      const shriftlar = new Map();
      for (const f of fontDict.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
        const n = Number(f[2]);
        if (!obj.has(n)) continue;
        if (!shriftXotira.has(n)) shriftXotira.set(n, shriftOl(obj.get(n).dict));
        shriftlar.set(f[1], shriftXotira.get(n));
      }
      return shriftlar;
    };
    // Оқим матни + ундаги «/TPL0 Do» Form XObject'лар (2026-09-15: FPDF'да
    // ясалган шартномада бутун матн шаблон ичида эди — саҳифа бўш чиқарди)
    const korildi = new Set();
    const oqimVaForma = (oqim, res, chuqur) => {
      let t = oqimMatni(oqim, shriftlarOl(res));
      if (chuqur >= 3) return t;
      const xo = kalit(res, "XObject", obj);
      for (const d of oqim.matchAll(/\/([^\s/<>\[\]()]+)\s+Do\b/g)) {
        const h = xo.match(new RegExp("/" + d[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+(\\d+)\\s+\\d+\\s+R"));
        const n = h ? Number(h[1]) : null;
        if (n === null || korildi.has(n) || !obj.has(n)) continue;
        const f = obj.get(n);
        if (!/\/Subtype\s*\/Form/.test(f.dict) || !f.stream) continue;
        korildi.add(n);
        t += "\n" + oqimVaForma(lat(f.stream), kalit(f.dict, "Resources", obj) || res, chuqur + 1);
      }
      return t;
    };
    const natija = [];
    for (const [, sahifa] of sahifalar.slice(0, 5)) {
      // Шрифтлар: /Resources → /Font (саҳифада бўлмаса — ота-дарахтдан)
      let res = kalit(sahifa.dict, "Resources", obj);
      let ota = sahifa.dict;
      for (let k = 0; !/\/(Font|XObject)/.test(res) && k < 5; k++) {
        const p = havola((ota.match(/\/Parent\s+(\d+\s+\d+\s+R)/) || [])[1]);
        if (p === null || !obj.has(p)) break;
        ota = obj.get(p).dict;
        res = kalit(ota, "Resources", obj) || res;
      }
      // Контент: битта ҳавола ёки ҳаволалар массиви
      const c = sahifa.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/);
      if (!c) continue;
      const idlar = [...c[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((x) => Number(x[1]));
      let oqim = "";
      for (const id of idlar) if (obj.has(id) && obj.get(id).stream) oqim += lat(obj.get(id).stream) + "\n";
      natija.push(oqimVaForma(oqim, res, 0));
      if (natija.join("\n").length > maks) break;
    }
    return natija.join("\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim().slice(0, maks);
  } catch (err) {
    console.error("pdfMatnToliq:", err && err.message);
    return "";
  }
}

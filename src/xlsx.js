// xlsx.js — .xlsx / .csv ўқувчи (ташқи кутубхонасиз).
//
// НЕГА ЎЗ ПАРСЕРИМИЗ: SheetJS каби умумий кутубхоналар ҳар қандай Excel
// хусусиятини қўллайди ва шунга яраша оғир. Бизга атиги битта нарса керак —
// катакчалар матни. Шу сабабли бу ерда фақат керакли қисм бор:
//   ZIP (central directory) -> DecompressionStream('deflate-raw') -> XML сканер.
// Ҳаммаси битта ўтишда, indexOf билан (regex backtracking йўқ) — Cloudflare
// Workers'нинг BEPUL планидаги CPU лимитига сиғиши учун.

const DEC = new TextDecoder("utf-8");

/* ============================= ZIP ============================= */
function u16(d, o) { return d[o] | (d[o + 1] << 8); }
function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

// Марказий каталогни охиридан топамиз (EOCD имзоси: PK\5\6)
function zipEntries(bytes) {
  let eocd = -1;
  const min = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i; break;
    }
  }
  if (eocd < 0) throw new Error("ZIP: EOCD топилмади (файл бузуқ ёки .xlsx эмас)");

  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) break;
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    const nlen = u16(bytes, p + 28);
    const elen = u16(bytes, p + 30);
    const clen = u16(bytes, p + 32);
    const lho = u32(bytes, p + 42);
    const name = DEC.decode(bytes.subarray(p + 46, p + 46 + nlen));
    out.set(name, { method, csize, lho });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

async function zipRead(bytes, ent) {
  // локал сарлавҳа: 30 байт + ном + extra
  const o = ent.lho;
  if (u32(bytes, o) !== 0x04034b50) throw new Error("ZIP: локал сарлавҳа нотўғри");
  const start = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28);
  const raw = bytes.subarray(start, start + ent.csize);
  if (ent.method === 0) return DEC.decode(raw);
  // deflate-raw — браузер/Workers'нинг НАТИВ декомпрессияси (JS CPU'ни емайди)
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([raw]).stream().pipeThrough(ds);
  return DEC.decode(await new Response(stream).arrayBuffer());
}

/* ============================= XML ============================= */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unesc(s) {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e] !== undefined ? ENT[e] : m;
  });
}

// <si> ичидаги барча <t> ларни бирлаштириб, умумий сатрлар рўйхатини қуради
function sharedStrings(xml) {
  const out = [];
  let i = 0;
  for (;;) {
    const si = xml.indexOf("<si>", i);
    if (si === -1) break;
    const end = xml.indexOf("</si>", si);
    if (end === -1) break;
    let buf = "";
    let j = si;
    for (;;) {
      const t = xml.indexOf("<t", j);
      if (t === -1 || t > end) break;
      const gt = xml.indexOf(">", t);
      if (gt === -1 || xml[gt - 1] === "/") { j = gt + 1; continue; }
      const close = xml.indexOf("</t>", gt);
      if (close === -1 || close > end) break;
      buf += xml.slice(gt + 1, close);
      j = close + 4;
    }
    out.push(unesc(buf));
    i = end + 5;
  }
  return out;
}

function colIndex(ref) {           // "BC12" -> 54
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function attr(tag, name) {
  const k = name + '="';
  const i = tag.indexOf(k);
  if (i === -1) return "";
  const s = i + k.length;
  const e = tag.indexOf('"', s);
  return e === -1 ? "" : tag.slice(s, e);
}

// Варақ XML -> қаторлар массиви (ҳар қатор: катакчалар массиви)
function sheetRows(xml, ss) {
  const rows = [];
  let i = 0;
  for (;;) {
    const rs = xml.indexOf("<row", i);
    if (rs === -1) break;
    const rTagEnd = xml.indexOf(">", rs);
    const selfClosed = xml[rTagEnd - 1] === "/";
    const re = selfClosed ? rTagEnd : xml.indexOf("</row>", rTagEnd);
    if (re === -1) break;
    const rowNum = parseInt(attr(xml.slice(rs, rTagEnd), "r"), 10) || rows.length + 1;
    const cells = [];

    if (!selfClosed) {
      let j = rTagEnd;
      for (;;) {
        const cs = xml.indexOf("<c", j);
        if (cs === -1 || cs > re) break;
        const cTagEnd = xml.indexOf(">", cs);
        const cTag = xml.slice(cs, cTagEnd);
        const ref = attr(cTag, "r");
        const type = attr(cTag, "t");
        let val = "";
        if (xml[cTagEnd - 1] !== "/") {
          const ce = xml.indexOf("</c>", cTagEnd);
          const inner = xml.slice(cTagEnd + 1, ce === -1 ? re : ce);
          if (type === "inlineStr") {
            const t0 = inner.indexOf("<t");
            if (t0 !== -1) {
              const g = inner.indexOf(">", t0);
              const cl = inner.indexOf("</t>", g);
              if (g !== -1 && cl !== -1) val = unesc(inner.slice(g + 1, cl));
            }
          } else {
            const v0 = inner.indexOf("<v>");
            if (v0 !== -1) {
              const v1 = inner.indexOf("</v>", v0);
              const raw = inner.slice(v0 + 3, v1 === -1 ? undefined : v1);
              val = type === "s" ? (ss[+raw] || "") : unesc(raw);
            }
          }
          j = ce === -1 ? re : ce + 4;
        } else {
          j = cTagEnd + 1;
        }
        const ci = ref ? colIndex(ref) : cells.length;
        cells[ci] = val;
      }
    }
    rows.push({ n: rowNum, cells });
    i = selfClosed ? rTagEnd + 1 : re + 6;
  }
  return rows;
}

/** ZIP ичидаги ҲАММА ёзувлар — хом байтлар (шаблонни патчлаш учун: src/sf/import.js).
 *  Map<name, Uint8Array>, марказий каталог тартибида. */
export async function zipHamma(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = new Map();
  for (const [name, ent] of zipEntries(b)) {
    const o = ent.lho;
    if (u32(b, o) !== 0x04034b50) throw new Error("ZIP: локал сарлавҳа нотўғри");
    const start = o + 30 + u16(b, o + 26) + u16(b, o + 28);
    const raw = b.subarray(start, start + ent.csize);
    if (ent.method === 0) { out.set(name, new Uint8Array(raw)); continue; }
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return out;
}

/* ============================ ОММАВИЙ ============================ */

/** .xlsx буферини ўқийди -> [{name, rows:[{n, cells:[]}]}] */
export async function readXlsx(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const ents = zipEntries(bytes);

  let ss = [];
  const ssEnt = ents.get("xl/sharedStrings.xml");
  if (ssEnt) ss = sharedStrings(await zipRead(bytes, ssEnt));

  // варақ номлари (workbook.xml) — тартиб sheet1, sheet2 ... га мос келади
  let names = [];
  const wbEnt = ents.get("xl/workbook.xml");
  if (wbEnt) {
    const wb = await zipRead(bytes, wbEnt);
    let i = 0;
    for (;;) {
      const s = wb.indexOf("<sheet ", i);
      if (s === -1) break;
      const e = wb.indexOf(">", s);
      names.push(unesc(attr(wb.slice(s, e), "name")));
      i = e + 1;
    }
  }

  const sheets = [];
  for (let k = 1; k <= 50; k++) {
    const ent = ents.get(`xl/worksheets/sheet${k}.xml`);
    if (!ent) { if (k === 1) continue; else break; }
    sheets.push({ name: names[k - 1] || `Лист${k}`, rows: sheetRows(await zipRead(bytes, ent), ss) });
  }
  if (!sheets.length) throw new Error("XLSX: варақ топилмади");
  return sheets;
}

/** CSV матни -> бир хил формат (RFC4180: қўштирноқ, ичидаги вергул ва сатр) */
export function readCsv(text, sep) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!sep) {
    const head = text.slice(0, 2000);
    const c = (head.match(/,/g) || []).length;
    const s = (head.match(/;/g) || []).length;
    const t = (head.match(/\t/g) || []).length;
    sep = t > c && t > s ? "\t" : s > c ? ";" : ",";
  }
  const rows = [];
  let cells = [], field = "", q = false, n = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else q = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { q = true; continue; }
    if (ch === sep) { cells.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { cells.push(field); rows.push({ n: n++, cells }); cells = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || cells.length) { cells.push(field); rows.push({ n: n++, cells }); }
  return [{ name: "CSV", rows }];
}

/** Файл номи ва буферга қараб керакли ўқувчини танлайди */
export async function readTable(fileName, arrayBuffer) {
  const nm = (fileName || "").toLowerCase();
  if (nm.endsWith(".csv") || nm.endsWith(".txt")) {
    return readCsv(DEC.decode(arrayBuffer));
  }
  return readXlsx(arrayBuffer);
}

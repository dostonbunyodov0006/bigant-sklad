// НУСХАЛАНГАН ЖАДВАЛ — админ Склад Excel'идан катакларни нусхалаб, ботга
// МАТН қилиб ташлайди (Достон 2026-09-14). Бот уни Excel файл юклангандек
// ўқийди: ҳар бир сотувчининг товари ўз номига ёзилади.
//
// Excel нусхалаганда нима келади:
//   • қаторлар — янги сатр, катаклар — TAB (\t) билан ажралади;
//   • рақамлар ФОРМАТЛАНГАН бўлиб келади («8 178 100», «590 480,00») —
//     sklad.js даги son() буни тушунади;
//   • ичида TAB/сатр/қўштирноқ бор катак "..." ичида келади.
//
// Telegram нима қилади:
//   • 4 096 белгидан узун матнни БИР НЕЧТА ХАБАРга бўлади;
//   • ҳар бир хабарнинг бошидаги ва охиридаги бўшлиқ/TAB'ни ОЛИБ ТАШЛАЙДИ.
//     Шунинг учун ҳар бир бўлакнинг биринчи қатори бошидаги бўш A устуни
//     йўқолади — пастдаги tekisla() буни тузатади.
//   • бўлаклар ботга ТАРТИБСИЗ келиши мумкин — message_id бўйича тартибланади.

/** Катак матнини TSV дан ажратади (фақат катак БОШИДАГИ қўштирноқ махсус) */
function tsvQator(qator) {
  const katak = [];
  let i = 0;
  while (i <= qator.length) {
    if (qator[i] === '"') {
      // "..." — ичида "" битта қўштирноқни билдиради
      let s = "";
      i++;
      while (i < qator.length) {
        if (qator[i] === '"' && qator[i + 1] === '"') { s += '"'; i += 2; continue; }
        if (qator[i] === '"') { i++; break; }
        s += qator[i++];
      }
      // ёпилгандан кейинги TAB гача қолганини ҳам қўшамиз
      const tab = qator.indexOf("\t", i);
      s += tab === -1 ? qator.slice(i) : qator.slice(i, tab);
      katak.push(s);
      if (tab === -1) break;
      i = tab + 1;
    } else {
      const tab = qator.indexOf("\t", i);
      if (tab === -1) { katak.push(qator.slice(i)); break; }
      katak.push(qator.slice(i, tab));
      i = tab + 1;
    }
  }
  return katak;
}

/** Катак ичида сатр кўчиши бўлса ("…\n…") — уни битта қаторда сақлаб бўлиш */
function qatorlargaBol(matn) {
  const natija = [];
  let joriy = "", ichida = false;
  for (let i = 0; i < matn.length; i++) {
    const ch = matn[i];
    if (ch === '"') {
      // катак боши ёки охиридаги қўштирноқ ҳолатни алмаштиради
      const oldin = i === 0 ? "\t" : matn[i - 1];
      if (!ichida && (oldin === "\t" || oldin === "\n")) ichida = true;
      else if (ichida && matn[i + 1] === '"') { joriy += '""'; i++; continue; }
      else if (ichida) ichida = false;
      joriy += ch;
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n" && !ichida) { natija.push(joriy); joriy = ""; continue; }
    joriy += ch;
  }
  natija.push(joriy);
  return natija;
}

/**
 * Склад жадвалидаги ҳар бир маъноли қатор B устунидан бошланади (A — бўш).
 * Нусхада A устуни бор-йўқлиги ва Telegram бўлак бошидаги TAB'ни кесиб
 * ташлаши ҳар хил бўлгани учун: бошидаги бўш катаклар олиб ташланиб,
 * ЯГОНА бўш катак қўйилади — шунда № доим 1-ўринда, ном 2-ўринда,
 * худди xlsx файлдагидек (parseSklad шунга таянади).
 */
function tekisla(katak) {
  let i = 0;
  while (i < katak.length && String(katak[i]).trim() === "") i++;
  if (i === katak.length) return [];
  return ["", ...katak.slice(i).map((x) => String(x).trim())];
}

/**
 * Нусхаланган матн → parseSklad кутадиган қаторлар [{n, cells}].
 *
 * ФАҚАТ TAB билан ажралган матн. Баъзи иловалар TAB'ни бўшлиққа
 * айлантиради — ўшанда БЎШ катаклар («Характеристика») йўқолиб, рақамлар
 * бошқа устунга СИЛЖИЙДИ ва «Сони» ўрнига сумма ёзилиб кетарди (синовда
 * кўринди). Бундай матн ўқилмайди — админга файл юбориш айтилади.
 */
export function nusxaQatorlar(matn) {
  const s = String(matn || "").replace(/^﻿/, "");
  if (!s.includes("\t")) return [];
  return qatorlargaBol(s).map((q, n) => ({ n: n + 1, cells: tekisla(tsvQator(q)) }));
}

/**
 * Нусхадан ўқилган жадвал ТЎЛИҚ ва БУЗИЛМАГАНми?
 *
 * Файлдан фарқли равишда нусха Telegram'да бўлакларга бўлинади — бирортаси
 * келмаса, ёки қатор ёпишиб/силжиб қолса, маълумот ЖИМГИНА нотўғри
 * ёзилмаслиги керак. Ҳақиқий Склад файлида ҲАР БИР сотувчи блокининг жами
 * суммаси ва сони унинг товарлари йиғиндисига АЙНАН тенг (14 блокда
 * текширилди) — шу ерда ҳам шуни талаб қиламиз.
 *
 * @returns {{ tayyor: boolean, jamiKeldi: boolean, sabab: string }}
 */
export function nusxaTekshir(d) {
  const jamiKeldi = Boolean(d && d.jami && (Number(d.jami.summa) !== 0 || Number(d.jami.soni) !== 0));
  if (!d || !d.bloklar || !d.bloklar.length)
    return { tayyor: false, jamiKeldi, sabab: "сотувчи блоклари топилмади" };
  if (!d.davrBoshi)
    return { tayyor: false, jamiKeldi, sabab: "давр санаси қатори келмади" };
  if (!jamiKeldi)
    return { tayyor: false, jamiKeldi, sabab: "«Жами» қатори ҳали келмади" };
  for (const b of d.bloklar) {
    const summa = b.mahsulotlar.reduce((a, m) => a + (Number(m.summa) || 0), 0);
    const soni = b.mahsulotlar.reduce((a, m) => a + (Number(m.soni) || 0), 0);
    if (Math.abs(summa - b.summa) >= 1 || Math.abs(soni - b.soni) >= 0.01)
      return { tayyor: false, jamiKeldi,
               sabab: `«${b.nom}» блокида товарлар йиғиндиси жамига тўғри келмайди` };
  }
  const yigindi = d.bloklar.reduce((a, b) => a + b.summa, 0);
  if (Math.abs(yigindi - d.jami.summa) >= 1)
    return { tayyor: false, jamiKeldi, sabab: "блоклар йиғиндиси «Жами» га тўғри келмайди" };
  return { tayyor: true, jamiKeldi, sabab: "" };
}

/**
 * Бир нечта бўлакни БИТТА матнга бирлаштиради.
 * Telegram узун матнни САТР ЧЕГАРАСИДАН бўлади ва ўша сатр кўчишини
 * олиб ташлайди — шунинг учун бўлаклар орасига сатр кўчиши қўйилади.
 * @param {Array<{id:number, matn:string}>} qismlar
 */
export function qismlarniBirlashtir(qismlar) {
  return qismlar
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((q) => String(q.matn || ""))
    .join("\n");
}

/** Матн Склад жадвалининг бўлагига ўхшайдими? (фақат тахминий белги) */
export function jadvalgaOxshaydi(matn) {
  const s = String(matn || "");
  if (s.length < 20) return false;
  const tablar = (s.match(/\t/g) || []).length;
  const satrlar = (s.match(/\n/g) || []).length;
  // TAB билан ажралган бир неча қатор — бу деярли аниқ Excel нусхаси
  if (tablar >= 8 && satrlar >= 2) return true;
  // TAB бўшлиққа айланган жадвал — таниймиз, лекин ўқимаймиз (сабабини айтамиз)
  return jadvalSozlari(s) && satrlar >= 3;
}

/** Склад жадвалининг калит сўзлари бор (TAB бўлмаса ҳам) */
export function jadvalSozlari(matn) {
  return /товар\s*ном|менежер\s*ном|давр оралиғи|сотилган товарлар/i.test(String(matn || ""));
}

/** Бўлак жадвалнинг БОШИми? (сарлавҳа ва давр сатри шу ерда бўлади) */
export function jadvalBoshi(matn) {
  return /сотилган товарлар|давр оралиғи/i.test(String(matn || "").slice(0, 600));
}

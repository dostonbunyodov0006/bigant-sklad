// 📊 «Умумий ҳисобот» (Достон 2026-09-23): «superadmin tglariga shunday ko'rinishda exel borsin
// va mini appni o'zidayam rasm ko'rinishida ko'rinsin — bitta bosganlarida ikkita jarayon».
//
// Ботнинг Excel'идаги «Сана бўйича ҳисобот» варағининг ЎНГ БЛОКИ (Сотувчи · Жами қарз · Сана)
// айнан ўша кўринишда — фарқи: битта варақ, учта устун. Рақамлар davrQarz'дан, яъни
// иловадаги ва ботдаги қарздорлик билан тийинигача бир хил.
import { buildXlsx, S, dollar } from "../xlsxout.js";
import { ISM } from "../sklad.js";
import { davrQarz, tolovTarix, batafsil } from "./hisob.js";

const ikki = (n) => String(n).padStart(2, "0");
/** «2026-09-20» → «20.09.2026» (жадвалдаги сана катаги) */
export const sanaMatn = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "");
};

/** Жадвал маълумоти — илова ҳам, Excel ҳам шундан ясалади */
export async function umumiy(env, dan, gacha, hozir = Date.now()) {
  const q = await davrQarz(env, null, "omb", dan, gacha, hozir);
  return {
    dan, gacha, sana: sanaMatn(gacha), valyuta: "$",
    satrlar: q.satrlar.map((s) => ({ id: s.id, ism: s.ism, qarz: s.oxirida })),
    jami: q.satrlar.reduce((t, s) => t + s.oxirida, 0),
    jamiQarzdor: q.jamiQarzdor, jamiHaqdor: q.jamiHaqdor,
  };
}

/** Ўша жадвалнинг .xlsx файли — бот чатига юбориш учун */
export async function umumiyExcel(env, dan, gacha, hozir = Date.now()) {
  const d = await umumiy(env, dan, gacha, hozir);
  const rows = [[{ v: "Сотувчи", s: S.BOSH }, { v: "Жами қарз", s: S.BOSH }, { v: "Сана", s: S.SARIQ_M }]];
  [...d.satrlar].sort((a, b) => String(a.ism).localeCompare(String(b.ism), "ru")).forEach((s, i) => {
    rows.push([{ v: s.ism, s: S.MATN }, { v: s.qarz, s: dollar(S.SON) },
               i === 0 ? { v: d.sana, s: S.SARIQ_M } : ""]);
  });
  const oxiri = d.satrlar.length + 1;                       // сарлавҳа 1-қатор
  rows.push([{ v: "BIGANT ЖАМИ", s: S.JAMI_M },
             { f: `SUM(B2:B${oxiri})`, s: dollar(S.JAMI) }, { v: "", s: S.JAMI_M }]);
  const bytes = await buildXlsx([{ name: "Умумий ҳисобот", rows, cols: [20.71, 14, 13], freeze: 1 }]);
  const kun = new Date(hozir + 5 * 3600 * 1000);
  const nom = `Бигант — умумий ҳисобот — ${ikki(kun.getUTCDate())}.${ikki(kun.getUTCMonth() + 1)}.${kun.getUTCFullYear()}.xlsx`;
  return { bytes, nom, jadval: d };
}

/** 💵 Тўловлар рўйхати — .xlsx (давр бўйича; Достон 2026-09-23) */
export async function tolovExcel(env, dan, gacha) {
  const d = await tolovTarix(env, dan, gacha);
  const rows = [[{ v: "Сана", s: S.BOSH }, { v: "Сотувчи", s: S.BOSH }, { v: "Нима учун", s: S.BOSH },
                 { v: "Оплата", s: S.BOSH }, { v: "Курс", s: S.BOSH }, { v: "Оплата $", s: S.BOSH }]];
  for (const t of d.royxat) {
    rows.push([{ v: sanaMatn(t.sana), s: S.MATN }, { v: t.sotuvchi, s: S.MATN }, { v: t.nima, s: S.MATN },
               { v: t.som, s: S.SON }, { v: t.kurs, s: S.SON }, { v: t.dollar, s: dollar(S.SON) }]);
  }
  const oxiri = d.royxat.length + 1;
  const bor = d.royxat.length > 0;
  rows.push([{ v: "", s: S.JAMI_M }, { v: "ЖАМИ", s: S.JAMI_M }, { v: "", s: S.JAMI_M },
             bor ? { f: `SUM(D2:D${oxiri})`, s: S.JAMI } : { v: 0, s: S.JAMI },
             { v: "", s: S.JAMI_M },
             bor ? { f: `SUM(F2:F${oxiri})`, s: dollar(S.JAMI) } : { v: 0, s: dollar(S.JAMI) }]);
  const bytes = await buildXlsx([{ name: "Тўловлар", rows, cols: [12, 18, 34, 16, 10, 13], freeze: 1 }]);
  const nom = `Бигант — тўловлар — ${sanaMatn(dan)}–${sanaMatn(gacha)}.xlsx`;
  return { bytes, nom, jadval: d };
}

/* 📑 «Батафсил ҳисобот» .xlsx (Достон 2026-09-23) — учта блок ЁНМА-ЁН, бухгалтериянинг
   ўз файлидагидек: «Олинган махсулотлар» · «Тўловлар» · «Умумий ҳисобот».
   ID устунлари ЙЎҚ (Достон: «faqat id lar ustuni shart emas»).
   «Олинган махсулотлар» блокида Нархи/Суммаси СЎМда (Достон 2026-09-24), қолгани долларда.
   Тартиб: исм алифбо бўйича, сана 01.09 → 02.09. */
/* 🧩 ЖАДВАЛНИНГ ЎЗИ — Бигант ва шерикнинг омбори учун БИТТА қурувчи (Руслан 2026-09-26:
 * «it must be exactly like in the Bigant sklad — the colors, the form, everything»).
 * Аввал шерикнинг омбори шу жадвалнинг НУСХАСИ бор эди ва у четга чиқиб кетган: 7 устун
 * (Коробка сони йўқ, Сотувчи бошқа жойда), бошқа кенгликлар, бошқа merge.
 * Энди иккови ҳам шу ердан чиқади — фарқ фақат маълумотда ва ЖАМИ номида.
 * vozvratlar берилса — охирига 4-блок «Возврат қилинган товарлар» қўшилади,
 * шакли «Олинган махсулотлар» билан АЙНАН бир хил (8 устун, ўша кенгликлар). */
export function batafsilJadval(d, { dan = "", gacha = "", jamiNomi = "BIGANT ЖАМИ", vozvratlar = null } = {}) {
  const son = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const D = (u) => dollar(u);
  // 📅 Сариқ «Сана» катаги: битта кун — «01.09.2026», давр — «01.09.2026 - 03.09.2026».
  // «Ҳаммаси» (dan = 2000-01-01) танланса — фақат охирги сана кўринади.
  const sanaKatak = (!dan || dan <= "2000-01-01" || dan === gacha)
    ? sanaMatn(gacha)
    : `${sanaMatn(dan)} - ${sanaMatn(gacha)}`;
  // 🔤 Тартиб (Достон 2026-09-24): исмлар алифбо бўйича, саналар 01.09 → 02.09
  const A = (x, y) => String(x || "").localeCompare(String(y || ""), "ru");
  const molTartib = (a, b) => A(a.sotuvchi, b.sotuvchi) || String(a.sana).localeCompare(String(b.sana)) || A(a.nom, b.nom);
  const MAH = [...d.mahsulotlar].sort(molTartib);
  const TOL = [...d.tolovlar].sort((a, b) =>
    String(a.sana).localeCompare(String(b.sana)) || A(a.sotuvchi, b.sotuvchi));
  const SAT = [...d.satrlar].sort((a, b) => A(a.ism, b.ism));
  const VOZ = vozvratlar ? [...vozvratlar].sort(molTartib) : null;
  // Мол қатори — «Олинган махсулотлар» ва «Возврат» блоклари учун битта шакл (A–H)
  const molQator = (i, m) => [{ v: i + 1, s: S.SON }, { v: m.nom, s: S.MATN },
    /* шерикнинг омбори «Коробка сони» йўқ — катак БЎШ, лекин УСЛУБЛИ: услубсиз "" чегарасиз
     * чиқиб, C устунида чизиқлар йўқолган эди (Руслан 2026-09-26) */
    { v: m.xar == null ? "" : son(m.xar), s: D(S.SON) },
    { v: m.soni, s: D(S.SON) }, { v: m.soni ? m.som / m.soni : 0, s: D(S.SON) },
    { v: m.som, s: D(S.SON) }, { v: m.sotuvchi, s: S.MATN }, { v: sanaMatn(m.sana), s: S.MATN }];
  const BOSH8 = [{ v: "№", s: S.BOSH }, { v: "Маҳсулот номи", s: S.BOSH }, { v: "Коробка сони", s: S.BOSH },
    { v: "Сони", s: S.BOSH }, { v: "Нархи", s: S.BOSH }, { v: "Суммаси", s: S.BOSH },
    { v: "Сотувчи", s: S.BOSH }, { v: "Сана", s: S.BOSH }];
  const rows = [];
  // 1-қатор: блок сарлавҳалари (кўк · яшил · кўк [· кўк])
  rows.push([
    { v: "Олинган махсулотлар", s: S.BLOK_M }, "", "", "", "", "", "", "", "",
    { v: "Тўловлар", s: S.BLOK_YASHIL_M }, "", "", "", "", "",
    { v: "Умумий ҳисобот", s: S.BLOK_M }, "", "", "", "",
    ...(VOZ ? ["", { v: "Возврат қилинган товарлар", s: S.BLOK_M }, "", "", "", "", "", "", ""] : []),
  ]);
  // 2-қатор: устун номлари
  rows.push([
    ...BOSH8, "",
    { v: "Сана", s: S.BOSH }, { v: "Сотувчи", s: S.BOSH }, { v: "Оплата", s: S.BOSH }, { v: "Курс", s: S.BOSH }, { v: "Оплата $", s: S.BOSH }, "",
    { v: "Сотувчи", s: S.BOSH }, { v: "Олган товар", s: S.BOSH }, { v: "Оплата", s: S.BOSH }, { v: "Жами қарз", s: S.BOSH }, { v: "Сана", s: S.SARIQ_M_C },
    ...(VOZ ? ["", ...BOSH8] : []),
  ]);
  const jamiSatr = SAT.length + 1;                             // «… ЖАМИ» ҳам битта қатор
  const vozSatr = VOZ ? VOZ.length + (VOZ.length ? 1 : 0) : 0;  // возврат ЖАМИ ҳам
  const n = Math.max(MAH.length, TOL.length, jamiSatr, vozSatr);
  for (let i = 0; i < n; i++) {
    const m = MAH[i], t = TOL[i], q = SAT[i];
    const r = [];
    // A–H: олинган маҳсулотлар
    if (m) r.push(...molQator(i, m));
    else r.push("", "", "", "", "", "", "", "");
    r.push("");                                                 // I — ажратгич
    // J–N: тўловлар
    if (t) r.push({ v: sanaMatn(t.sana), s: S.MATN }, { v: t.sotuvchi, s: S.MATN },
                  { v: t.som, s: S.SON }, { v: t.kurs, s: S.SON }, { v: t.dollar, s: D(S.SON) });
    else r.push("", "", "", "", "");
    r.push("");                                                 // O — ажратгич
    // P–T: умумий ҳисобот (сотувчилар бўйича жами), охирида … ЖАМИ
    if (q) r.push({ v: q.ism, s: S.MATN }, { v: q.tovar, s: D(S.SON) }, { v: q.tolangan, s: D(S.SON) },
                  { v: q.oxirida, s: D(S.SON) }, i === 0 ? { v: sanaKatak, s: S.SARIQ_M } : "");
    else if (i === SAT.length) r.push({ v: jamiNomi, s: S.JAMI_M },
                  { v: SAT.reduce((a, x) => a + x.tovar, 0), s: D(S.JAMI) },
                  { v: SAT.reduce((a, x) => a + x.tolangan, 0), s: D(S.JAMI) },
                  { v: SAT.reduce((a, x) => a + x.oxirida, 0), s: D(S.JAMI) }, { v: "", s: S.JAMI_M });
    else r.push("", "", "", "", "");
    // V–AC: возврат — «Олинган махсулотлар» билан айнан бир хил шакл, охирида ЖАМИ
    if (VOZ) {
      r.push("");                                               // U — ажратгич
      const z = VOZ[i];
      if (z) r.push(...molQator(i, z));
      else if (i === VOZ.length && VOZ.length) r.push({ v: "", s: S.JAMI_M }, { v: "ЖАМИ", s: S.JAMI_M }, { v: "", s: S.JAMI_M },
                  { v: "", s: S.JAMI_M }, { v: "", s: S.JAMI_M }, { v: VOZ.reduce((a, x) => a + x.som, 0), s: D(S.JAMI) },
                  { v: "", s: S.JAMI_M }, { v: "", s: S.JAMI_M });
      else r.push("", "", "", "", "", "", "", "");
    }
    rows.push(r);
  }
  const MOL_KENG = [4.5, 44, 13, 10, 15, 17, 18, 12];
  const asos = [...MOL_KENG, 2.5,   12, 18, 16, 10, 13, 2.5,   18, 14, 13, 14, 24, ...(VOZ ? [2.5, ...MOL_KENG] : [])];
  /* 📏 ҲАР МАТН КЎРИНСИН (Руслан 2026-09-26: «every text should be visible when file
   * opened»). Excel файлни очганда устунни ўзи кенгайтирмайди — кенглик биз ёзганча
   * қолади, узун мол номи кесилиб кўринарди. Энди ҳар устун ўз ичидаги энг узун
   * матнга қараб кенгаяди (ҳозирги қийматдан тор бўлмайди, 70 дан ошмайди).
   * 1-қатор (блок сарлавҳалари) ҳисобга кирмайди — улар бирлашган катаклар. */
  const uzunlik = (c) => { const v = c && typeof c === "object" ? c.v : c;
    return v == null || v === "" ? 0 : typeof v === "number" ? String(Math.round(v * 100) / 100).length + 2 : String(v).length; };
  const cols = asos.map((w, i) => {
    if (w <= 2.5) return w;                                     // ажратгич устунлар
    let eng = 0;
    for (const r of rows.slice(1)) eng = Math.max(eng, uzunlik(r[i]));
    return Math.min(70, Math.max(w, Math.ceil(eng * 1.15 + 2)));
  });
  return {
    rows, cols,
    // 2-қатор: 12pt bold сарлавҳалар ўралиб икки сатр бўлади — баландлик 32pt, тўлиқ кўринсин
    rowHt: { 2: 32 },
    freeze: 2, merge: ["A1:H1", "J1:N1", "P1:T1", ...(VOZ ? ["V1:AC1"] : [])],
  };
}

export async function batafsilExcel(env, dan, gacha, sotuvchi = 0) {
  const hammasi = await batafsil(env, dan, gacha);
  const kim = sotuvchi ? (ISM[sotuvchi] || String(sotuvchi)) : "";
  const d = !sotuvchi ? hammasi : {
    ...hammasi,
    mahsulotlar: hammasi.mahsulotlar.filter((m) => m.sotuvchi === kim),
    tolovlar: hammasi.tolovlar.filter((t) => t.sotuvchi === kim),
    satrlar: hammasi.satrlar.filter((s) => Number(s.id) === Number(sotuvchi)),
  };
  const bytes = await buildXlsx([{ name: "Батафсил ҳисобот", ...batafsilJadval(d, { dan, gacha }) }]);
  const nom = sotuvchi ? `Бигант — ${kim} — ҳисобот — ${sanaMatn(gacha)}.xlsx`
                       : `Бигант — батафсил ҳисобот — ${sanaMatn(gacha)}.xlsx`;
  return { bytes, nom, jadval: d };
}

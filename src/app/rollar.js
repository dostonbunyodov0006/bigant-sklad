// src/app/rollar.js — Роллар (app:roles) ва курс.
import { kvGet, kursOl, kursQoy, isOmborAdmin, boshlangichYoz } from "../ombor.js";
import { ISM, son } from "../sklad.js";
import { appPut } from "./kv.js";

const KEY = "app:roles";
const L = (a) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);

/* КОДДАГИ АСОС — «Созлама → Роллар» (KV) устига ҚЎШИЛАДИ.
 * Нега (Достон 2026-09-14): Созламадаги танлаш рўйхатида фақат ботга
 * таниш одамлар (ISM) бор — янги ошпаз у ерда йўқ эди. Шу ерга ёзилган
 * одам деплойдан кейин дарров ишлайди.
 * ДИҚҚАТ: бу ердагини Созламадан ўчириб бўлмайди — фақат шу ердан. */
/* ОШХОНА РОЛЛАРИ СОЗЛАМАДАН (Достон 2026-09-15): «кейинчалик ошхонага сотувчи,
 * бухгалтер ёки программист қўшилиши мумкин — ҳар сафар код ёзиб деплой қилмайлик».
 * Супер админ «Созлама → Роллар»да ID ёки рўйхатдан қўшади. Қуйидагилар — коддаги
 * асос (🔒, Созламадан ўчмайди), KV'дагилар устига қўшилади. */
export const UJIN_KORADI = [7000000020];               // тушлик + кечки: Руслан
export const FAQAT_UJIN = [7000000023];                // фақат кечки: Комолиддин (тушлиги Хусниддин сонида)
export const OSHPAZ_HISOB = [7000000007];               // «Ошпаз» бўлимида фақат Ҳисоб: Ҳамид ака
// Достон 2026-09-15: «ролларда бухгалтер, ошпаз, бригадир, сотувчи, программист, админ, супер админ —
// шу ердан одам қўшилсин». Қуйидагилар коддаги асос (🔒); Созламада қўшилганлар устига қўшилади.
export const SUPERADMIN = [7000000005, 7000000025];     // Сардор ака, Достон
export const DEVELOPER = [7000000025, 7000000020];     // Достон, Руслан
export const ILOVA_SOTUVCHI = [7000000028];             // Хуршид ака (ботда сотувчи эмас, иловада — сотувчи)
// 📦 Омборчи — возврат товарларни қабул қилади (Достон 2026-09-29).
// Одамни шу ерга ёки Созлама → Роллар → «Омборчи»дан қўшиш мумкин.
export const OMBORCHI = [
  7000000024,   // Нурмухаммад (Склад)
  7000000008,   // Умрзоқ (Цех)
];
const ASOS = {
  omborchi: OMBORCHI,
  superadmin: SUPERADMIN,
  developer: DEVELOPER,
  sotuvchi: ILOVA_SOTUVCHI,
  ujin: UJIN_KORADI,
  faqatUjin: FAQAT_UJIN,
  oshHisob: OSHPAZ_HISOB,
  // Тестерлар — ФАҚАТ Достон ва Руслан (Достон 2026-09-15). Бошқаси KV да қолиб кетган бўлса ҳам тестер эмас.
  testers: [7000000025, 7000000020],
  cook: [7000000006],          // ошпаз
  admins: [7000000029, 7000000028], // илова админлари: Мурод ака, Хуршид ака (Достон 2026-09-14)
  // Илова даражасидаги бухгалтер (Достон 2026-09-14: «Дилдора ва Феруза
  // бухгалтерияга тегишли — Бухгалтерия бўлимида Ошхона кўринсин»).
  // Ботнинг омбор бухгалтерлари рўйхатига (sklad.js BUXGALTER) ТЕГИЛМАЙДИ.
  buxgalter: [7000000002, 7000000014],   // Феруза, Дилдора (Руслан 2026-09-16: Дилдора — бухгалтер)
  // Грузчиклар бригадири — Хусниддин (Достон 2026-09-15: «Дилшод ака эмас, Хусниддин»).
  // У ҳар куни эрталаб неча одам ейишини (ўзини қўшиб) ёзади.
  brigadir: [7000000026],       // Хусниддин
  // Грузчик — фақат ёрлиқ (Руслан 2026-09-16: «Ошхона» рол эмас, Комолиддин — грузчик);
  // сони бригадир ёзади, ўзи бўлим кўрмайди
  gruzchik: [7000000023],      // Комолиддин
  // ✅ Ейман / ❌ Емайман босадиган ишчилар (Достон 2026-09-14, жадвалдан).
  // Достон 2026-10-14: «Абдувоҳид, Дилшод ва Асрор ака учун ўзлари мини аппга кириб
  // овқат ейман/емайманни босолсин — шу кунгача Хусниддин бригадир уларга ҳам овқат
  // айтиб юборарди (сонига қўшиб ёзарди). Энди Хусниддин ўзи билан бирга фақат
  // биттагина Мамур акани белгилаб юбора олсин» → Хусниддиннинг сони 2 бўлади.
  // Достон 2026-10-15: «Мамур ака ҳам ўзи овқат ейман/емайманни белгилай олсин».
  ishchi: [
    7000000018,   // Мамур ака — 15.10 дан ўзи босади (олдин Хусниддин сонида эди)
    7000000026,    // Хусниддин — 14.10 дан ўзи босади
    7000000017,   // Абдувоҳид — 14.10 дан ўзи босади (олдин Хусниддин сонида эди)
    7000000019,    // Дилшод ака — 14.10 дан ўзи босади (иккинчи аккаунти 7000000016)
    7000000004,   // Асрор ака — 14.10 дан ўзи босади
    7000000011,    // Хусниддинов Рамзиддин
    7000000021,    // Аброрака
    7000000005,    // Сардор ака
    7000000001,   // Илхом
    7000000028,    // Хуршидака Бигант
    7000000029,      // Мурод ака
    7000000020,   // Руслан
    7000000015,    // Дилмурод
    7000000030,      // Пўлат
    7000000002,   // Феруза
    7000000014,   // Дилдора — бухгалтер (Бухгалтер бўлимида «Ошхона»)
    7000000025,   // Достон — фақат тушлик
  ],
};
// Достон 2026-09-15: «супер админ мавжуд ходимни ҳам ўчира олсин» — коддаги одам Созламадан
// ўчирилса, KV'даги «olib» (чиқарилганлар) рўйхатига тушади; қайта қўшилса — қайтади.
let OLIB = {};
const asosli = (nom, kv) => L([...(ASOS[nom] || []), ...(Array.isArray(kv) ? kv : [])])
  .filter((id) => !(Array.isArray(OLIB[nom]) ? OLIB[nom] : []).map(Number).includes(id));

/* КЕЧКИ ОВҚАТНИ КЎРАДИГАНЛАР (Достон 2026-09-14): «ужин фақат бригадирга
 * ва Русланга кўринсин, қолганларга кўринмасин». Ошпаз ҳам
 * кўради — менюни у ёзади. Кечкига фақат шулар овоз бера олади. */
// 2026-09-14 (кеч): бригадир (Хусниддин) кечкини КЎРМАЙДИ — у фақат тушлик сонини ёзади.
/* ФАҚАТ КЕЧКИ (Достон 2026-09-14): Комолиддин — тушлигини Хусниддин сонига
 * қўшиб ёзади, кечкини эса ЎЗИ белгилайди (Ейман/Емайман). Унга тушлик
 * тугмаси кўринмайди. ID келганда шу ерга ёзилади — бошқа жойга тегилмайди. */
/** Рўйхат: cfg (rollarOl натижаси) берилса — ундан (Созлама + код), бўлмаса — фақат коддаги асос */
const ro = (cfg, k) => ((cfg && Array.isArray(cfg[k])) ? cfg[k] : (ASOS[k] || [])).map(Number);
export const faqatUjinmi = (uid, cfg) => ro(cfg, "faqatUjin").includes(Number(uid));
export const oshHisobmi = (uid, cfg) => ro(cfg, "oshHisob").includes(Number(uid));
const ujinOvoz = (uid, cfg) => ro(cfg, "ujin").includes(Number(uid)) || faqatUjinmi(uid, cfg);
export const ujinKoradimi = (uid, rollar, cfg) =>
  ujinOvoz(uid, cfg) ||
  Boolean(rollar && rollar.has && (rollar.has("oshpaz") || rollar.has("oshhisobchi")));

/* КИМ ОВОЗ БЕРА ОЛАДИ
 *   • Достон 2026-10-14: БРИГАДИР ҲАМ босади («Хусниддин ҳам овқат ейман/емайманни
 *     боссин, ҳафта кунларига олдиндан белгилай олсин, 1/2/3 та заказ қилсин»);
 *   • ошпаз — ҳеч қачон (менюни у ёзади);
 *   • тушлик — ишчилар;
 *   • кечки — ишчилардан фақат кечкини кўрадиганлар (Руслан). */
export function ovozBeraOladimi(uid, rollar, m, cfg) {
  const has = (r) => Boolean(rollar && rollar.has && rollar.has(r));
  if (has("oshpaz") || ro(cfg, "cook").includes(Number(uid))) return false;   // ошпаз овоз бермайди
  // Админ ҳам овқатланади (Руслан 2026-09-14): ишчи рўйхатида бўлмаса ҳам овоз беради
  if (!has("ishchi") && !has("admin")) return false;
  if (m === "t" && faqatUjinmi(uid, cfg)) return false;   // тушлиги Хусниддин сонида
  return m === "k" ? ujinOvoz(uid, cfg) : m === "t";
}

/* ФАҚАТ БРИГАДИР: бригадирга илова фақат «Грузчиклар»ни кўрсатади.
 * 2026-09-15 дан — Хусниддин (7000000026), Дилшод ака эмас.
 * Ботнинг омбор қисмига (sklad.js) тегилмайди — бу фақат илова учун. */
/* СУПЕР АДМИН (Достон 2026-09-14): Сардор ака — ҳамма ҳуқуқ (ҳамма маълумотни
 * кўриш ва ўзгартириш) + сотувчи. Илованинг «Админ» ролидан чиқарилган.
 * Ботнинг омбор қисмига (sklad.js) тегилмайди — бу фақат илова учун. */
// 2026-09-15 (кеч): Руслан супер админликдан олинди — у «Программист» бўлимида
// Сардор ака — илова «Админ» ва «Ҳисобот» ролидан чиқарилган, унга «Сотувчи» қўшилган
export const ADMINSIZ_SUPER = [7000000005];
// Мурод ака — ФАҚАТ «Админ» (Достон 2026-09-15): «Ҳисобот» ва тестер олиб ташланган
export const FAQAT_ADMIN = [7000000029];
/* ДЕВЕЛОПЕР (Достон 2026-09-14): Достон ва Руслан — «Девелопер»
 * бўлимига кириб «Ошхона»ни босишади (Ейман/Емайман).
 * 2026-10-21: ҳамкасб ишдан бўшатилди — рўйхатдан олиб ташланди (Достон). */
/* Хуршид ака — «Админ» билан бирга «Сотувчи» бўлими ҳам (иккаласида «Ошхона») */
/* ОШПАЗ БЎЛИМИДА ФАҚАТ «ҲИСОБ» (Достон 2026-09-15): Ҳамид ака — неча одам
 * ейди / емайди, фақат кўради. Менюни ўзгартира олмайди, овоз бермайди. */
export const FAQAT_BRIGADIR = [7000000026];
/* 🍽 НЕЧТА ПОРЦИЯ — БУТУНЛАЙ ОЛИБ ТАШЛАНДИ (Достон 2026-10-15):
 * «Хусниддин акадан 2 ё 3 та овқат заказ қилиш ҳуқуқини олиб қой — ҳозир
 * ҳамма ўзига ўзи овқат заказ қилвоти». Энди ҳамма — ҳар доим 1 та.
 * osh_ovoz.soni устуни қолди (ҳамма қаторда 1) — ҳисобга таъсири йўқ. */
// Эски бригадир (Дилшод ака) — Созламадан KV га ёзилиб қолган бўлса ҳам бригадир эмас
const ESKI_BRIGADIR = [7000000019];
export function yakuniyRollar(uid, rollar, cfg) {
  if (!ro(cfg, "brigadir").includes(Number(uid))) return rollar;
  // Бригадир — фақат «Бригадир» бўлими. ЛЕКИН Бигант сотувчиси ҳам бўлса, «Сотувчи»
  // бўлими ҳам кўринади (Хусниддин — Достон 2026-09-24).
  const r = new Set(["brigadir"]);
  if (rollar.has("sotuvchi")) r.add("sotuvchi");
  // Достон 2026-10-14: бригадир ҳам ўзи «Ейман/Емайман» босади — «ишчи» сақланади
  if (rollar.has("ishchi")) r.add("ishchi");
  if (rollar.has("xodim")) r.add("xodim");
  return r;
}

/** Созламада супер админ ўзгартира оладиган рўйхатлар */
export const TAHRIR = ["superadmin", "admins", "developer", "buxgalter", "sotuvchi", "omborchi", "cook", "oshHisob", "brigadir", "gruzchik", "ishchi", "ujin", "faqatUjin"];
const ismlarToza = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {})
  .filter(([id, ism]) => /^\d{3,15}$/.test(id) && typeof ism === "string" && ism.trim())
  .slice(0, 300).map(([id, ism]) => [id, ism.trim().slice(0, 60)]));
/* ЯНГИ БЎЛИМЛАР (Достон 2026-09-15): «супер админда умуман янги бўлим яратиш имкони ҳам бўлсин».
 * [{ id: "b…", nom: "Омборчилар", odamlar: [id…] }] — бўлим аъзоларида шу номли бўлим очилади,
 * ичида «Ошхона» (Ейман/Емайман). Рол номи: "b:<id>". */
export const bolimMi = (r) => typeof r === "string" && /^b:b[a-z0-9]{3,12}$/.test(r);
const bolimlarToza = (a) => (Array.isArray(a) ? a : [])
  .filter((b) => b && /^b[a-z0-9]{3,12}$/.test(String(b.id)) && typeof b.nom === "string" && b.nom.trim())
  .slice(0, 30).map((b) => ({ id: String(b.id), nom: b.nom.trim().slice(0, 30), odamlar: L(b.odamlar) }));
// Созламада шу бўлимларга қўшилган одам ОШХОНАГА ҲАМ автоматик қўшилади (тушлик)
// + супер админ ва админ (Достон 2026-09-15: «янги ходим қўшишдан мақсад — унга ҳам ошхона кўриниши»)
const AVTO_ISHCHI = ["superadmin", "admins", "developer", "buxgalter", "sotuvchi"];
const olibToza = (o) => Object.fromEntries(TAHRIR.map((k) => [k, L(o && o[k])]).filter(([, v]) => v.length));
function birlashtir(r) {
  OLIB = olibToza(r.olib);
  const faqatUjin = asosli("faqatUjin", r.faqatUjin);
  const bolimlar = bolimlarToza(r.bolimlar);
  const avto = [...AVTO_ISHCHI.flatMap((k) => (Array.isArray(r[k]) ? r[k] : [])), ...bolimlar.flatMap((b) => b.odamlar)];
  return { testers: asosli("testers", r.testers).filter((id) => ASOS.testers.includes(id)), admins: asosli("admins", r.admins), cook: asosli("cook", r.cook),
           asker: asosli("asker", r.asker), brigadir: asosli("brigadir", r.brigadir).filter((id) => !ESKI_BRIGADIR.includes(id)),
           // Фақат кечки бўлганлар ҳам ишчи (овоз бериш учун) — тушлик тугмаси уларга йўқ
           ishchi: asosli("ishchi", [...(Array.isArray(r.ishchi) ? r.ishchi : []), ...faqatUjin, ...avto]),
           buxgalter: asosli("buxgalter", r.buxgalter), gruzchik: asosli("gruzchik", r.gruzchik),
           ujin: asosli("ujin", r.ujin), faqatUjin, oshHisob: asosli("oshHisob", r.oshHisob),
           superadmin: asosli("superadmin", r.superadmin), developer: asosli("developer", r.developer), sotuvchi: asosli("sotuvchi", r.sotuvchi),
           omborchi: asosli("omborchi", r.omborchi),
           bolimlar, ismlar: ismlarToza(r.ismlar), olib: OLIB };
}
export async function rollarOl(env) {
  return birlashtir((await kvGet(env, KEY, null)) || {});
}
/** Коддаги асос (🔒) — Созламадан ўчмайди */
export function qulflar() {
  return {};   // 2026-09-15: қулф йўқ — супер админ ҳаммани ўчира олади
}
/** Супер админ сақлаши: фақат TAHRIR рўйхатлари; коддагилар KV'га ёзилмайди;
 *  тестерлар, бухгалтер ва бошқа калитлар ТЕГИЛМАЙДИ. */
export async function rollarYoz(env, body) {
  const eski = (await kvGet(env, KEY, null)) || {};
  const v = { ...eski };
  const olib = olibToza(eski.olib);
  for (const k of TAHRIR) {
    if (!Array.isArray(body && body[k])) continue;
    const yangi = L(body[k]);
    v[k] = yangi.filter((id) => !(ASOS[k] || []).includes(id));
    const chiqdi = (ASOS[k] || []).map(Number).filter((id) => !yangi.includes(id));   // коддагилардан ўчирилганлар
    if (chiqdi.length) olib[k] = chiqdi; else delete olib[k];
  }
  v.olib = olib;
  if (body && Array.isArray(body.bolimlar)) v.bolimlar = bolimlarToza(body.bolimlar);
  // Ўзи қўшиладиганлар (фақат кечки; программист/бухгалтер/сотувчи/янги бўлим аъзолари) ишчи
  // рўйхатида алоҳида сақланмайди — бўлимдан олиб ташланса, ошхонадан ҳам чиқади
  // (олдинги сақлашдагилар ҳам: бўлим/одам шу сафар ўчирилган бўлса, «ишчи» бўлиб қолиб кетмасин)
  const avtoIdlar = (o) => [...(o.faqatUjin || []), ...AVTO_ISHCHI.flatMap((k) => o[k] || []), ...bolimlarToza(o.bolimlar).flatMap((b) => b.odamlar)];
  const aniqIshchi = new Set((Array.isArray(eski.ishchi) ? eski.ishchi : []).map(Number));
  const fu = new Set([...ASOS.faqatUjin, ...avtoIdlar(v), ...avtoIdlar(eski)].map(Number));
  if (Array.isArray(v.ishchi)) v.ishchi = v.ishchi.filter((id) => !fu.has(id) || (aniqIshchi.has(id) && !avtoIdlar(v).includes(id) && !avtoIdlar(eski).includes(id)));
  v.ismlar = ismlarToza({ ...(eski.ismlar || {}), ...((body && body.ismlar) || {}) });
  await appPut(env, KEY, v);
  return birlashtir(v);
}
/** Ботнинг ўзидаги рол (омбор) Созламадан ўчмайди — фақат ошхонадан чиқарилади */
/** Танлаш учун одамлар: ботга маълум ҳамма (ISM) + ID орқали қўшилганларнинг исмлари */
// Ботнинг ISM рўйхатида йўқ (ёки лотинча) исмлар — Созламада рақам эмас, исм кўринсин (Достон 2026-09-15)
const KOD_ISM = { 7000000002: "Феруза (бухгалтер)", 7000000006: "Феруза (ошпаз)", 7000000007: "Ҳамид ака",
                  7000000026: "Хусниддин", 7000000023: "Комолиддин", 7000000020: "Руслан",
                  7000000018: "Мамур ака" };   // грузчик, sklad.js ISM да йўқ (15.10 дан ўзи босади)
export function odamlar(qoshimcha = {}) {
  const m = new Map(Object.entries(ISM).map(([id, ism]) => [Number(id), String(ism)]));
  for (const [id, ism] of Object.entries(KOD_ISM)) m.set(Number(id), ism);
  for (const [id, ism] of Object.entries(qoshimcha || {})) if (!m.has(Number(id))) m.set(Number(id), String(ism));
  return [...m].map(([id, ism]) => ({ id, ism })).sort((a, b) => a.ism.localeCompare(b.ism, "ru"));
}
/** Курсни ўзгартириш — фақат омбор админи ва фақат бошланғич курс аллақачон ёзилган бўлса
 *  (биринчи курс ботдаги «💱 Курсни танлаш» орқали ёзилади — у бошланғич қарзларни сўмга ўтказади). */
export async function kursYoz(env, uid, qiymat, testerHuquq = null) {
  // Ботдаги «💱 Курсни танлаш» билан бир хил: омбор админи ёки супер админ, олдиндан
  // шарт йўқ (2026-09-15: шерикнинг омбори дафтарига курс керак, бошланғич қарзлар ҳали кўчирилмаган)
  // Омбор админи, супер админ ёки тестер (Руслан 2026-09-15: «Созламада курс ўзгартирилсин»)
  // testerHuquq (2026-10-25): иловада «фойдаланувчи кўради» режимида тестер имтиёзи ЙЎҚ (api.js беради); null — ўзи текширади
  const cfg = await rollarOl(env);
  const tester = testerHuquq == null ? cfg.testers.includes(Number(uid)) : Boolean(testerHuquq);
  if (!isOmborAdmin(uid, null) && !cfg.superadmin.includes(Number(uid)) && !tester) return { ok: false, xato: "Курсни фақат омбор админи ёки супер админ ўзгартиради" };
  const q = son(qiymat);
  if (!(q >= 1000 && q <= 100000)) return { ok: false, xato: "Курс 1 000 … 100 000 оралиғида бўлсин" };
  await kursQoy(env, q, uid);
  // Ботдаги «💱 Курсни танлаш» билан БИР ХИЛ: бошланғич қарзлар ҳали ёзилмаган бўлса — БИРИНЧИ курс
  // билан ўзи ёзилади (аввал иловада ёзилмасди — бот ва илова фарқ қиларди, 2026-09-21 топилди)
  let bqYozildi = false;
  if (!(await kvGet(env, "omb:bqkurs", null))) { await boshlangichYoz(env, q); bqYozildi = true; }
  const k = await kursOl(env);
  return { ok: true, kurs: k ? k.qiymat : q, bqYozildi };
}

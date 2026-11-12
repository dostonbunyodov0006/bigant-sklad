// src/app/kesh.js — Mini App хотира кеши (хотирада вақтинча сақлаш ва тозалаш)
export const KESH = new Map();

export async function kesh(nom, ms, ish) {
  const k = KESH.get(nom);
  if (k && Date.now() - k.t < ms) return k.v;
  const v = await ish();
  KESH.set(nom, { t: Date.now(), v });
  return v;
}
export const keshla = kesh;

export const keshTozala = (nom) => KESH.delete(nom);

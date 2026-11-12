// app: калитларини ёзиш — фақат «app:» префикси билан (хато калит ёзилмасин).
export async function appPut(env, key, val) {
  if (!String(key).startsWith("app:")) throw new Error(`appPut: фақат app: калит (${key})`);
  if (!env.ACCESS_KV) throw new Error("ACCESS_KV binding йўқ");
  await env.ACCESS_KV.put(key, JSON.stringify(val));
}

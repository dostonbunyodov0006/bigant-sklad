<script>
  // 💱 Курсни алмаштириш — «Бигант омбор» ичидаги алоҳида тугмадан (Достон 2026-09-21).
  // Охирги сақланган курс — бундан кейинги товар ва тўловлар шу курсда ҳисобланади.
  import { api } from "../lib/api.js";
  import { pul, kursOqi } from "../lib/format.js";
  import { haptic } from "../lib/tg.js";
  let { me, xabar } = $props();
  let kurs = $state(me.kurs ? String(me.kurs) : ""), hozir = $state(me.kurs || 0), yuk = $state(false);
  async function saqla() {
    yuk = true;
    try {
      const r = await api("/kurs", { method: "PUT", body: { qiymat: kursOqi(kurs) } });   // Руслан 2026-10-10: «12650.35» → 1 265 035 бўларди, каср сақланади
      hozir = r.kurs; me.kurs = r.kurs;
      xabar("Курс сақланди: " + pul(r.kurs) + (r.bqYozildi ? " · бошланғич қарзлар ёзилди" : "")); haptic("medium");
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }
</script>

<div class="body">
  <div class="card">
    <div class="row b"><span class="l">Ҳозирги курс</span><span class="v">{hozir ? pul(hozir) + " сўм" : "белгиланмаган"}</span></div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px">
      <div class="field"><input bind:value={kurs} inputmode="decimal" placeholder="12 100" aria-label="Курс" /></div>
      <button class="btn" disabled={yuk} onclick={saqla}>Сақлаш</button>
    </div>
    <div class="muted" style="font-size:12px">Янги курс фақат бундан кейинги товар ва тўловларга; эскилари ўз курсида қолади.</div>
  </div>
</div>

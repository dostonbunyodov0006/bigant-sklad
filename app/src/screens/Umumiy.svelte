<script>
  // 📊 «Умумий ҳисобот» — Excel'даги жадвалнинг АЙНАН ўзи (Достон 2026-09-23):
  // Сотувчи · Жами қарз · Сана, пастда «BIGANT ЖАМИ». Тугма босилганда бу экран
  // очилади ВА шу заҳоти ўша жадвал .xlsx бўлиб бот чатига кетади (иккита жараён).
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import { dol, qarzMatn } from "../lib/format.js";
  import { davrQuery } from "../lib/davr.js";
  import { haptic } from "../lib/tg.js";
  import Icon from "../lib/Icon.svelte";
  let { davr, xabar } = $props();
  let d = $state(null), xato = $state(""), yuk = $state(false);
  onMount(() => api(`/umumiy?${davrQuery(davr)}`).then((r) => (d = r)).catch((e) => (xato = e.message)));
  /* 📷 Жадвални РАСМ қилиб чизиб, бот чатига юбориш (Достон 2026-09-24:
     «shu ko'rinish rasm ko'rinishida bo'lsin»). Экрандаги жадвалнинг айнан ўзи. */
  let rasmYuk = $state(false);
  async function rasm() {
    if (rasmYuk || !d) return;
    rasmYuk = true;
    try {
      const K = 2, W = 720, H_BOSH = 56, H_SATR = 44, CHET = 18, SARLAVHA = 38;
      const n = d.satrlar.length + 1;
      const H = CHET * 2 + SARLAVHA + H_BOSH + H_SATR * n;
      const c = document.createElement("canvas");
      c.width = W * K; c.height = H * K;
      const g = c.getContext("2d");
      g.scale(K, K);
      g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H);
      const X0 = CHET, X1 = 330, X2 = 545, X3 = W - CHET;      // устун чегаралари
      let y = CHET;
      // Сарлавҳа — ФАҚАТ ном. «<сана> ҳолатига · долларда» расм изоҳида
      // туради (Достон 2026-09-25), шунинг учун бу ерда такрорланмайди.
      g.fillStyle = "#16333A"; g.font = "700 24px system-ui, Segoe UI, sans-serif";
      g.textAlign = "left"; g.fillText("БИГАНТ ОМБОР — умумий ҳисобот", X0, y + 26);
      y += SARLAVHA;
      // Устун номлари
      g.fillStyle = "#A9DCE6"; g.fillRect(X0, y, X3 - X0, H_BOSH);
      g.fillStyle = "#16333A"; g.font = "700 17px system-ui, Segoe UI, sans-serif";
      g.textAlign = "left";  g.fillText("Сотувчи", X0 + 14, y + 36);
      g.textAlign = "right"; g.fillText("Жами қарз", X2 - 14, y + 36);
      g.textAlign = "center"; g.fillText("Сана", (X2 + X3) / 2, y + 36);
      y += H_BOSH;
      const chiziq = (yy) => { g.strokeStyle = "#D9D9D9"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(X0, yy + 0.5); g.lineTo(X3, yy + 0.5); g.stroke(); };
      d.satrlar.forEach((r, i) => {
        g.fillStyle = i % 2 ? "#FAFAFA" : "#FFFFFF"; g.fillRect(X0, y, X3 - X0, H_SATR);
        if (i === 0) { g.fillStyle = "#FFF2CC"; g.fillRect(X2, y, X3 - X2, H_SATR); }
        g.font = "600 17px system-ui, Segoe UI, sans-serif";
        g.textAlign = "left"; g.fillStyle = "#191815"; g.fillText(r.ism, X0 + 14, y + 28);
        g.textAlign = "right"; g.fillStyle = r.qarz < 0 ? "#2E9E3E" : r.qarz > 0 ? "#C2841D" : "#191815";
        g.font = "700 17px system-ui, Segoe UI, sans-serif";
        g.fillText(qarzMatn(r.qarz), X2 - 14, y + 28);
        if (i === 0) { g.textAlign = "center"; g.fillStyle = "#9C6A00";
          g.font = "700 16px system-ui, Segoe UI, sans-serif"; g.fillText(d.sana, (X2 + X3) / 2, y + 28); }
        chiziq(y + H_SATR); y += H_SATR;
      });
      // ЖАМИ
      g.fillStyle = "#FFE699"; g.fillRect(X0, y, X3 - X0, H_SATR);
      g.fillStyle = "#7A5200"; g.font = "800 18px system-ui, Segoe UI, sans-serif";
      g.textAlign = "left"; g.fillText("BIGANT ЖАМИ", X0 + 14, y + 29);
      g.textAlign = "right"; g.fillText(dol(d.jami), X2 - 14, y + 29);
      // Ташқи ҳошия
      g.strokeStyle = "#BDBDBD"; g.lineWidth = 1;
      g.strokeRect(X0 + 0.5, CHET + SARLAVHA + 0.5, X3 - X0 - 1, H_BOSH + H_SATR * n - 1);
      const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
      if (!blob) throw new Error("Расм чизилмади");
      const fd = new FormData();
      fd.append("sana", d.sana);
      fd.append("fayl", blob, "umumiy.png");
      const r = await api("/umumiy/rasm", { method: "POST", form: fd });
      xabar(r.xabar); haptic("medium");
    } catch (e) { xabar(e.message, true); }
    rasmYuk = false;
  }
  export async function excel(sokin = false) {
    if (yuk) return;
    yuk = true;
    try {
      const r = await api("/umumiy/excel", { method: "POST", body: { dan: davr.dan, gacha: davr.gacha } });
      xabar(r.xabar); if (!sokin) haptic("medium");
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }
</script>

<div class="body">
  {#if xato}
    <div class="note rd"><Icon name="alert" size={18} />{xato}</div>
  {:else if !d}
    <div class="spin"></div>
  {:else}
    <div class="jadval">
      <table>
        <thead>
          <tr><th class="kok">Сотувчи</th><th class="kok son">Жами қарз</th><th class="sariq">Сана</th></tr>
        </thead>
        <tbody>
          {#each d.satrlar as s, i (s.ism)}
            <tr><td>{s.ism}</td><td class="son" class:gr={s.qarz < 0} class:amb={s.qarz > 0}>{qarzMatn(s.qarz)}</td><td class="sariq">{i === 0 ? d.sana : ""}</td></tr>
          {/each}
          <tr class="jami"><td>BIGANT ЖАМИ</td><td class="son">{dol(d.jami)}</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <div class="two">
      <button class="btn" disabled={rasmYuk} onclick={rasm}><Icon name="file" size={18} /> {rasmYuk ? "Чизилмоқда…" : "Расм қилиб юбориш"}</button>
      <button class="btn soft" disabled={yuk} onclick={() => excel()}><Icon name="download" size={18} /> {yuk ? "Юборилмоқда…" : "Excel"}</button>
    </div>
  {/if}
</div>

<style>
  /* Excel'даги жадвалнинг кўриниши: кўк сарлавҳа, сариқ сана устуни, сариқ ЖАМИ қатори */
  .jadval { background: var(--surf); border: var(--cb); box-shadow: var(--shadow); border-radius: 16px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; border: 1px solid var(--line); text-align: left; white-space: nowrap; }
  th { font-weight: 700; }
  th.kok { background: #A9DCE6; color: #16333A; }
  th.sariq, td.sariq { background: var(--ambs); color: var(--amb); font-weight: 600; text-align: center; }
  th.son, td.son { text-align: right; font-variant-numeric: tabular-nums; }
  td { color: var(--ink); }
  tr.jami td { background: var(--ambs); color: var(--amb); font-weight: 800; }
  tr.jami td.son { color: var(--amb); }
  td.gr { color: var(--gr); }
</style>

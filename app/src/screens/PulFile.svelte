<script>
  // 📄 «Пул чиқариш File» (Достон 2026-09-25)
  // Сотувчи счётни ГУРУҲГА ташлайди → бу ерга киради → фирма, ИНН, сумма
  // ЎЗИ тўлади. Сумма ўзгартирилади: PDF'да 10 млн бўлса ҳам 5 млн юборса бўлади.
  // Файл танлаш ЙЎҚ — счёт аллақачон гуруҳда.
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import { pul, summaOqi } from "../lib/format.js";
  import { haptic } from "../lib/tg.js";
  import Icon from "../lib/Icon.svelte";
  let { me, xabar, ondone } = $props();

  let holat = $state("yuklanmoqda");            // yuklanmoqda | yoq | tayyor
  let nom = $state(""), pdfIzoh = $state(""), yetishmagan = $state([]);
  let summa = $state(""), firma = $state(""), inn = $state("");
  let yuk = $state(false), takror = $state(null);
  // Руслан 2026-10-10: «11 100 000,00» 100× катта бўларди — тийин summaOqi'да ташланади
  const son = $derived(summaOqi(summa));
  function summaFmt(e) { const v = summaOqi(e.target.value); summa = v ? v.toLocaleString("ru-RU") : ""; }

  onMount(tekshir);
  async function tekshir() {
    holat = "yuklanmoqda";
    try {
      const r = await api("/sorov/pdfkut");
      if (!r.bor) { holat = "yoq"; return; }
      nom = r.nom || "";
      pdfIzoh = r.xabar || "";
      yetishmagan = r.yetishmagan || [];
      if (r.summa) summa = Number(r.summa).toLocaleString("ru-RU");
      firma = r.firma || "";
      inn = r.inn || "";
      holat = "tayyor";
      haptic("medium");
    } catch (e) { xabar(e.message, true); holat = "yoq"; }
  }
  async function yubor() {
    yuk = true;
    try {
      const r = await api("/sorov/pulfile", { method: "POST", body: { firma, inn, summa: String(son) } });
      haptic("medium");
      if (r.takror) takror = r;
      else { xabar("Сўров юборилди ✓"); ondone(); }
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }
  async function qaror(q) {
    yuk = true;
    try { await api(`/sorov/${takror.sorov.id}/takror`, { method: "POST", body: { qaror: q } }); xabar(q === "p0" ? "Янги сўров бекор қилинди" : "Юборилди ✓"); ondone(); }
    catch (e) { xabar(e.message, true); }
    yuk = false;
  }
</script>

<div class="body">
  {#if takror}
    <div class="note amb"><Icon name="repeat" size={18} /><span><b>Такрорий сўров.</b> {takror.eski.firma} га олдинги сўровингиз ҳали тўланмаган.</span></div>
    <div class="card">
      <div class="row"><span class="l">Олдинги</span><span class="v">{pul(takror.eski.summa)} сўм</span></div>
      <div class="row"><span class="l">Янги</span><span class="v">{pul(takror.sorov.summa)} сўм</span></div>
    </div>
    <button class="btn" disabled={yuk} onclick={() => qaror("pr")}>Олдингисини бекор қил, янгисини юбор</button>
    <button class="btn soft" disabled={yuk} onclick={() => qaror("p1")}>Иккаласи ҳам керак (2-тўлов)</button>
    <button class="btn danger" disabled={yuk} onclick={() => qaror("p0")}>Янгисини бекор қил</button>
  {:else if holat === "yuklanmoqda"}
    <div class="spin"></div>
  {:else if holat === "yoq"}
    <!-- Достон 2026-09-25: «ogohlantirish habari ko'rinsin qizil rangda» -->
    <div class="note rd"><Icon name="alert" size={18} />Аввал файлни ботга ташланг</div>
    <button class="btn soft" onclick={tekshir}><Icon name="repeat" size={18} /> Қайта текшириш</button>
  {:else}
    <div class="note gr"><Icon name="file" size={18} /><span>{nom}</span></div>
    <!-- Достон 2026-09-25: бўш ёки бошқача файл — нима топилмаганини айтамиз -->
    {#if yetishmagan.length}
      <div class="note amb"><Icon name="alert" size={18} /><span>Файл ичидаги маълумотда хатолик — <b>{yetishmagan.join(", ")}</b> топилмади</span></div>
    {/if}
    <div class="field"><label for="pf-summa">Сумма</label><input id="pf-summa" value={summa} oninput={summaFmt} inputmode="numeric" placeholder="11 100 000" /></div>
    <div class="field"><label for="pf-firma">Фирма</label><input id="pf-firma" bind:value={firma} placeholder="CONVITECH MCHJ" autocomplete="off" /></div>
    <div class="field"><label for="pf-inn">ИНН (ихтиёрий)</label><input id="pf-inn" bind:value={inn} inputmode="numeric" maxlength="9" placeholder="9 та рақам" /></div>
    {#if pdfIzoh}<div class="muted" style="font-size:12px">📄 {pdfIzoh}</div>{/if}
    <button class="btn lg" disabled={yuk || firma.trim().length < 2 || son < 1000} onclick={yubor}>{yuk ? "Юборилмоқда…" : "Юбориш →"}</button>
  {/if}
</div>

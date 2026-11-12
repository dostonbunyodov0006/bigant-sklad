<script>
  // Админ / супер админ · Қарздорлик — икки манба АЛОҲИДА (сегмент), давр календардан (App.svelte).
  // «Бугун» — бошидан бугунгача; давр танланса — бошида/охирида ва давр ичидаги ҳаракат.
  import { api } from "../lib/api.js";
  import { excelOl } from "../lib/excel.js";
  import { pul, dol, ddmm, OYQ, oyNomi, qarzMatn } from "../lib/format.js";
  import { haptic } from "../lib/tg.js";
  import { bugunmi, davrQuery } from "../lib/davr.js";
  import Icon from "../lib/Icon.svelte";
  let { me, davr, xabar, onseller, manba = $bindable("omb"), sodda = false } = $props();
  let d = $state(null), xato = $state("");
  $effect(() => {
    const m = manba, dv = davr;
    d = null; xato = "";
    api(`/qarz?src=${m}&${davrQuery(dv)}`).then((r) => { if (m === manba && dv === davr) d = r; }).catch((e) => { if (m === manba) xato = e.message; });
  });
  // 💵 Бигант омбор ҳам ДОЛЛАРДА (Достон 2026-09-21) — сервер ботнинг Excel'и қоидасида ҳисоблайди; шерикнинг омбори ўзгармади
  const unit = "$";
  /* Руслан 2026-09-25: шерикнинг омборида ҳам ТИЙИНИ билан — «Бигант склад»дагидек.
     Аввал dol(n, 0) эди: жами 25 011,40 ўрнига 25 011 кўринарди, «Умумий
     ҳисобот» ва Excel билан рақам мос тушмасди. */
  const v = (n) => dol(n);
  const bugun = $derived(bugunmi(davr, me.bugun));
  const eng = $derived(d ? Math.max(1, ...d.satrlar.map((s) => s.oxirida)) : 1);
  /** Календардаги «Excel» — шу экран учун (App.svelte bind:this орқали чақиради) */
  export async function excel(dv) {
    try { xabar(await excelOl({ tur: "qarz", src: manba, dan: dv.dan, gacha: dv.gacha, botga: true })); haptic("medium"); }
    catch (e) { xabar(e.message, true); }
  }
</script>

<div class="body">
  {#if xato}
    <div class="note rd"><Icon name="alert" size={18} />{xato}</div>
  {:else if !d}
    <div class="spin"></div>
  {:else}
    <!-- Достон 2026-09-25: «har bir sotuvchida o'ziga tegishli summa tursin» —
         Бигантда УМУМИЙ йиғинди кўрсатилмайди (қарзи борлар ва ортиқча
         тўлаганлар бир-бирини ейди, рақам чалғитади). шерикнинг омборида — аввалгидек. -->
    {#if !sodda}
    <div class="card statrow">
      {#if bugun}
        <div class="st"><span class="n">{v(d.oyTolangan)} {unit}</span><span class="l">тўланди · {OYQ[+d.oy.slice(5) - 1]}</span></div>
        <div class="vl"></div>
          <div class="st"><span class="n">{d.kurs ? "1 $ = " + pul(d.kurs) : "—"}</span><span class="l">курс</span></div>
      {:else}
        <div class="st"><span class="n">+{v(d.jamiTovar)} {unit}</span><span class="l">товар олинди · давр</span></div>
        <div class="vl"></div>
        <div class="st"><span class="n">−{v(d.jamiTolangan)} {unit}</span><span class="l">тўланди · давр</span></div>
      {/if}
    </div>
    {/if}
    {#if !sodda}<div class="sect"><span>Сотувчилар · {d.satrlar.length}</span><button class="chip" onclick={() => excel(davr)}><Icon name="download" size={14} />Excel</button></div>{/if}
    <div class="card list">
      {#each d.satrlar as s (s.ism)}
        <button class="srow" disabled={sodda || s.id == null} onclick={() => onseller({ id: s.id, ism: s.ism })}>
          <span class="av sm">{s.ism[0]}</span>
          <span class="mid"><span class="t">{s.ism}</span><span class="bar"><i style="width:{s.oxirida > 0 ? Math.round((s.oxirida / eng) * 100) : 0}%"></i></span></span>
          <span class="r"><span class="n" class:gr={s.oxirida < 0} class:amb={s.oxirida > 0}>{qarzMatn(s.oxirida)} {unit}</span>
            {#if !bugun}<span class="s">{ddmm(davr.dan)} да {v(s.boshida)}</span>{/if}</span>
        </button>
      {/each}
    </div>
    {#if !bugun}<div class="hint">Сотувчи устига босилса — унинг тўловлари ва маҳсулотлари алоҳида очилади.</div>{/if}
  {/if}
</div>

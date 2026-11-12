<script>
  import { onMount, onDestroy } from "svelte";
  import { api } from "../lib/api.js";
  import { pul, yosh, HOLAT, sanaQ } from "../lib/format.js";
  import { ochish, haptic } from "../lib/tg.js";
  import Icon from "../lib/Icon.svelte";
  // tur: "pul" | "kard" — фақат шу турдагилар (ихтиёрий); "" — ҳаммаси
  let { me, xabar, onpul, onkard, onpulfile, rol = "", tur = "" } = $props();
  // Достон 2026-09-18: тестер қайси бўлимда турса — ФАҚАТ ўша ролнинг тугмалари
  // Супер админ бўлимида ҳам (Сардор ака — сотувчи ҳам), тестер «Супер админ»да ҳам
  const sotuvchiTugma = $derived(me.tester ? (rol === "sotuvchi" || rol === "superadmin") : me.sotuvchimi);
  let ro = $state(null), xato = $state(""), band = $state("");
  const YOPIQ = ["yopildi", "tasdiqlandi", "bekor", "muddat", "rad"];
  // Илова очиқ турганда жавоб келса — қисқа хабар ҳам чиқади (платёжка ёзилди / тасдиқланди / рад)
  const JAVOB = { yopildi: ["Тўланди — қарздан айирилди ✓", false], tasdiqlandi: ["Минус тасдиқланди — қарздан айирилди ✓", false], rad: ["Минус рад этилди", true],
                  chek_rad: ["Чек ёзилмади — бухгалтер тўғри чекни ташлайди", true], tolov_bekor: ["Тўлов бекор қилинди", true] };
  let oldingi = null;
  const yukla = () => api("/sorov/mine").then((r) => {
    const yangi = r.sorovlar || [];
    if (oldingi) for (const s of yangi) {
      const o = oldingi.get(s.id);
      if (o && o !== s.holat && JAVOB[s.holat] && (!tur || s.tur === tur)) { xabar(`№${s.id}: ${JAVOB[s.holat][0]}`, JAVOB[s.holat][1]); haptic("medium"); }
    }
    oldingi = new Map(yangi.map((s) => [s.id, s.holat]));
    ro = yangi; xato = "";
  }).catch((e) => (xato = e.message));
  // Жавоб (платёжка ёзилди / минус тасдиқланди ёки рад) ИЛОВАДА кўринсин: очиқ сўров бор экан —
  // ҳар 20 сонияда ва илова қайта очилганда (visibilitychange) янгиланади.
  let taymer = null;
  const korinsa = () => { if (document.visibilityState === "visible") yukla(); };
  onMount(() => {
    yukla();
    taymer = setInterval(() => { if (document.visibilityState === "visible" && faol.length) yukla(); }, 20000);
    document.addEventListener("visibilitychange", korinsa);
  });
  onDestroy(() => { clearInterval(taymer); document.removeEventListener("visibilitychange", korinsa); });
  async function amal(id, yol, body) {
    band = id;
    try { const r = await api(`/sorov/${id}/${yol}`, { method: "POST", body: body || {} }); xabar(r.xabar || "Бажарилди ✓"); haptic("medium"); await yukla(); }
    catch (e) { xabar(e.message, true); }
    band = "";
  }
  const mos = $derived(ro ? ro.filter((s) => !tur || s.tur === tur) : []);
  const faol = $derived(mos.filter((s) => !YOPIQ.includes(s.holat)));
  const eski = $derived(mos.filter((s) => YOPIQ.includes(s.holat)));
  function bosqich(s) {   // Юборилди → Гуруҳда → Платёжка → Ёпилди
    const yop = s.holat === "yopildi";
    return [
      { n: "Юборилди", on: true },
      { n: "Масъулга кетди", on: true, now: s.holat === "takror" },
      ...(s.tur === "kard" ? [] : [{ n: "Гуруҳда", on: !!s.havola || yop, now: s.holat === "tasdiq_kutmoqda" }]),
      { n: s.tur === "kard" ? "Тасдиқ" : "Платёжка", on: s.tolangan > 0 || yop, now: ["ochiq", "qisman", "chek_tekshir", "chek_rad", "tolov_bekor"].includes(s.holat) || (s.tur === "kard" && s.holat === "tasdiq_kutmoqda") },
      { n: "Ёпилди", on: yop },
    ];
  }
</script>

<div class="body">
  {#if sotuvchiTugma && tur === "pul"}
    <button class="btn" onclick={onpul}><Icon name="wallet" size={18} /> Янги пул чиқариш</button>
  {:else if sotuvchiTugma && tur === "kard" && me.minusMumkin !== false}
    <button class="btn" onclick={onkard}><Icon name="minus" size={18} /> Янги «Қарзимдан минус»</button>
  {:else if sotuvchiTugma}
    <!-- Достон 2026-09-25: иккисининг ОРАСИГА «Пул чиқариш File» — счёт гуруҳда -->
    <div class="two">
      <button class="btn sm" onclick={onpul}><Icon name="wallet" size={18} /> Пул чиқариш</button>
      <button class="btn sm soft" onclick={onpulfile}><Icon name="file" size={18} /> Пул чиқариш File</button>
    </div>
    {#if me.minusMumkin !== false}<button class="btn sm soft" onclick={onkard}><Icon name="minus" size={18} /> Қарзимдан минус</button>{/if}
  {/if}
  {#if xato}
    <div class="note rd"><Icon name="alert" size={18} />{xato}</div>
  {:else if !ro}
    <div class="spin"></div>
  {:else}
    {#if !faol.length}
      <div class="card" style="align-items:center;padding:26px"><span class="muted"><Icon name="checkcircle" size={30} /></span><div class="muted">Очиқ сўров йўқ</div></div>
    {/if}
    {#each faol as s (s.id)}
      {@const h = HOLAT[s.holat] || ["", "muted"]}
      <div class="card">
        <div style="display:flex;gap:12px;align-items:center">
          <span class="icav" class:or={s.tur === "pul"}><Icon name={s.tur === "kard" ? "minus" : "wallet"} size={18} /></span>
          <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
            <span style="font-size:15px;font-weight:700">{s.tur === "kard" ? "Қарзимдан минус" : s.firma}</span>
            <span class="muted" style="font-size:12px">№{s.id} · {yosh(Date.now() - s.vaqt)} олдин{s.inn ? " · ИНН " + s.inn : ""}</span></span>
          <span class="chip {h[1]}">{h[0].split(" · ")[0]}</span>
        </div>
        <div class="big">{pul(s.summa)} <span class="u">сўм</span></div>
        {#if s.tolangan > 0}<div class="row"><span class="l">Тўланган</span><span class="v gr">{pul(s.tolangan)}</span></div><div class="row"><span class="l">Қолди</span><span class="v">{pul(s.summa - s.tolangan)}</span></div>{/if}
        <div class="tl">
          {#each bosqich(s) as b (b.n)}
            <div class="st" class:on={b.on} class:now={b.now && !b.on}><span class="m"><Icon name={b.on ? "check" : b.now ? "clock" : "dots"} size={14} /></span>{b.n}</div>
          {/each}
        </div>
        {#if s.holat === "takror"}
          <div class="note amb"><Icon name="repeat" size={18} /><span>Шу фирмага 3 соат ичида иккинчи сўров. Гуруҳга ҳали юборилмади — танланг:</span></div>
          <button class="btn sm" disabled={band === s.id} onclick={() => amal(s.id, "takror", { qaror: "pr" })}>Олдингисини бекор қил, янгисини юбор</button>
          <button class="btn sm soft" disabled={band === s.id} onclick={() => amal(s.id, "takror", { qaror: "p1" })}>Иккаласи ҳам керак (2-тўлов)</button>
          <button class="btn sm danger" disabled={band === s.id} onclick={() => amal(s.id, "takror", { qaror: "p0" })}>Янгисини бекор қил</button>
        {:else}
          <div class="chips">
            {#if s.havola}<button class="chip or" onclick={() => ochish(s.havola)}><Icon name="link" size={14} />Гуруҳда</button>{/if}
            {#if s.fayl}<span class="chip muted"><Icon name="clip" size={14} />{s.fayl.nom || s.fayl.tur}</span>{/if}
            <button class="chip rd" disabled={band === s.id} onclick={() => { if (confirm("Сўровни бекор қиламизми?")) amal(s.id, "bekor"); }}><Icon name="x" size={14} />Бекор</button>
          </div>
        {/if}
      </div>
    {/each}
    {#if eski.length}
      <div class="sect"><span>Аввалгилар · {eski.length}</span></div>
      <div class="card list">
        {#each eski as s (s.id)}
          {@const h = HOLAT[s.holat] || ["", "muted"]}
          <div class="lrow"><span class="icav" class:gr={h[1] === "gr"}><Icon name={h[1] === "gr" ? "check" : "x"} size={16} /></span>
            <span class="mid"><span class="t">{pul(s.summa)} сўм</span><span class="s">{s.tur === "kard" ? "Минус" : s.firma} · {sanaQ(new Date(s.vaqt).toISOString())}</span></span>
            <span class="chip {h[1]}">{h[0]}</span></div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

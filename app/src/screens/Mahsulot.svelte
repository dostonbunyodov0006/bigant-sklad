<script>
  // Супер админ · Бигант омбор: Склад файлини юклаш ва ЮКЛАНГАН МАЪЛУМОТЛАР.
  //
  // Достон 2026-09-25: «hato malumot kiritilib ketsa superadmin nima qiladi?»
  //   1. ЮКЛАШДАН ОЛДИН тасдиқ — нима ёзилиши кўрсатилади, кейин ёзилади
  //   2. Юкламани битта ҳаракат билан ЎЧИРИШ
  //   3. Эгаси нотўғри блокни тўғри сотувчига бириктириш (пулга тегмайди)
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import { pul, dol, ddmm } from "../lib/format.js";
  import { haptic } from "../lib/tg.js";
  import Icon from "../lib/Icon.svelte";
  let { me, xabar, rol = "" } = $props();
  let d = $state(null), xato = $state(""), yuk = $state(false), natija = $state(null);
  const yukla = () => api("/mahsulot/davrlar").then((r) => (d = r)).catch((e) => (xato = e.message));
  onMount(yukla);
  // Достон 2026-09-18: тестер қайси бўлимда турса — ФАҚАТ ўша ролнинг тугмалари
  const yuklaydi = $derived(me.tester ? rol === "superadmin" : (me.omborAdmin || me.rollar.includes("superadmin")));

  /* ─── 1. ЮКЛАШДАН ОЛДИН ТАСДИҚ ─── */
  let korish = $state(null), kutgan = $state(null);   // kutgan: {fayl} ёки {matn}
  async function korishSora(payload) {
    yuk = true; natija = null; korish = null;
    try {
      let r;
      if (payload.fayl) {
        const fd = new FormData(); fd.append("fayl", payload.fayl, payload.fayl.name);
        r = await api("/mahsulot/korish", { method: "POST", form: fd });
      } else {
        r = await api("/mahsulot/korish", { method: "POST", body: { matn: payload.matn } });
      }
      korish = r.korish; kutgan = payload; haptic("medium");
    } catch (e) { xabar("Файл қабул қилинмади", true);
      natija = { xato: e.message, korilgan: e.korilgan || [], royxat: e.royxat || [] }; }
    yuk = false;
  }
  function faylTanla(e) { const f = e.target.files[0]; e.target.value = ""; if (f) korishSora({ fayl: f }); }
  async function tasdiqla() {
    if (!kutgan) return;
    yuk = true;
    try {
      let r;
      if (kutgan.fayl) {
        const fd = new FormData(); fd.append("fayl", kutgan.fayl, kutgan.fayl.name);
        r = await api("/mahsulot/sklad", { method: "POST", form: fd });
      } else {
        r = await api("/mahsulot/nusxa", { method: "POST", body: { matn: kutgan.matn } });
      }
      natija = r; korish = null; kutgan = null; nusxa = ""; nusxaOchiq = false;
      xabar(r.xabar || "Юкланди ✓"); haptic("medium"); await yukla();
    } catch (e) { xabar(e.message, true); natija = { xato: e.message }; }
    yuk = false;
  }
  const bekor = () => { korish = null; kutgan = null; haptic(); };

  /* ─── 2. ЮКЛАМАЛАР: ичини кўриш ва ўчириш ─── */
  let ichi = $state(null), ochirTasdiq = $state(null);
  async function ich(key) {
    yuk = true;
    try { ichi = await api(`/mahsulot/davr/${key}`); haptic(); }
    catch (e) { xabar(e.message, true); }
    yuk = false;
  }
  async function ochir(key) {
    yuk = true;
    try {
      const r = await api(`/mahsulot/davr/${key}`, { method: "DELETE" });
      xabar(r.xabar || "Ўчирилди"); haptic("medium");
      ochirTasdiq = null; ichi = null; await yukla();
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }

  /* 🩺 ТЕКШИРУВ — шубҳали қаторларни тизим ўзи топади (Достон 2026-09-28) */
  let tek = $state(null);
  async function tekshir(key) {
    yuk = true;
    try { tek = await api(`/mahsulot/tekshiruv/${key}`); haptic(); }
    catch (e) { xabar(e.message, true); }
    yuk = false;
  }
  async function tekTuzat(x) {
    qTahrir = { key: tek.key, sid: x.sid, i: x.i, nom: x.nom, soni: String(x.soni), summa: String(x.summa) };
    haptic();
  }

  /* 🗑 Эгасиз блокни ўчириш (Достон 2026-09-28) */
  let egasizOchirish = $state(null);
  async function egasizniOchir(i) {
    yuk = true;
    try {
      const r = await api("/mahsulot/egasiz", { method: "DELETE", body: { key: ichi.key, i } });
      xabar(r.xabar || "Ўчирилди"); haptic("medium"); egasizOchirish = null;
      await ich(ichi.key); await yukla();
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }

  /* ─── 3. ЭГАСИНИ ТУЗАТИШ ─── */
  let egaOchiq = $state(null);                        // {egasiz: i} ёки {manba: id}
  let egaTanlov = $state("");
  async function egaSaqla() {
    if (!egaOchiq || !egaTanlov) return;
    yuk = true;
    try {
      const r = await api("/mahsulot/egasi", { method: "POST",
        body: { key: ichi.key, kimga: Number(egaTanlov), ...egaOchiq } });
      xabar(r.xabar || "Тузатилди ✓"); haptic("medium");
      egaOchiq = null; egaTanlov = "";
      await ich(ichi.key); await yukla();
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }

  /* ─── 🔍 ҚИДИРУВ (Достон 2026-09-28: «tez va oson tuzatolsin») ───
     Аввал: юклама → сотувчи → қаторлар → скролл. Энди: ёзади → тузатади. */
  let qq = $state(""), topildi = $state(null), qYuk = $state(false);
  let taym = null;
  function qidirYoz(e) {
    qq = e.target.value;
    clearTimeout(taym);
    if (qq.trim().length < 2) { topildi = null; return; }
    taym = setTimeout(qidir, 350);
  }
  async function qidir() {
    qYuk = true;
    try { topildi = await api(`/mahsulot/qidir?q=${encodeURIComponent(qq.trim())}`); }
    catch (e) { xabar(e.message, true); topildi = null; }
    qYuk = false;
  }
  /** Қидирувдан топилган қаторни тузатиш/ўчириш — ўша ернинг ўзида */
  let qTahrir = $state(null), qOchirish = $state(null);
  async function qSaqla() {
    if (!qTahrir) return;
    yuk = true;
    try {
      const r = await api("/mahsulot/qator", { method: "POST", body: {
        key: qTahrir.key, sid: qTahrir.sid, i: qTahrir.i,
        nom: qTahrir.nom, soni: qTahrir.soni, summa: qTahrir.summa } });
      xabar(r.xabar || "Тузатилди ✓"); haptic("medium"); qTahrir = null;
      await qidir(); await yukla();
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }
  async function qOchir2(x) {
    yuk = true;
    try {
      const r = await api("/mahsulot/qator", { method: "DELETE", body: { key: x.key, sid: x.sid, i: x.i } });
      xabar(r.xabar || "Ўчирилди"); haptic("medium"); qOchirish = null;
      await qidir(); await yukla();
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }

  /* ─── 4. ҚАТОРЛАР (Достон 2026-09-28: «hato qatorni edit qilib qayta saqlash») ─── */
  let qat = $state(null), tahrir = $state(null), qOchir = $state(null);
  async function qatorlarOch(sid) {
    yuk = true;
    try { qat = await api(`/mahsulot/davr/${ichi.key}/${sid}`); haptic(); }
    catch (e) { xabar(e.message, true); }
    yuk = false;
  }
  async function qatorSaqla() {
    if (!tahrir) return;
    yuk = true;
    try {
      const r = await api("/mahsulot/qator", { method: "POST", body: {
        key: qat.key, sid: qat.sid, i: tahrir.i,
        nom: tahrir.nom, soni: tahrir.soni, summa: tahrir.summa } });
      xabar(r.xabar || "Тузатилди ✓"); haptic("medium"); tahrir = null;
      await qatorlarOch(qat.sid); await ich(ichi.key); await yukla();
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }
  async function qatorniOchir(i) {
    yuk = true;
    try {
      const r = await api("/mahsulot/qator", { method: "DELETE", body: { key: qat.key, sid: qat.sid, i } });
      xabar(r.xabar || "Ўчирилди"); haptic("medium"); qOchir = null;
      await qatorlarOch(qat.sid); await ich(ichi.key); await yukla();
    } catch (e) { xabar(e.message, true); }
    yuk = false;
  }

  // 📋 Жадвални НУСХАЛАБ қўйиш (Достон 2026-09-16)
  let nusxaOchiq = $state(false), nusxa = $state("");
  // Юкламалар рўйхати ЁПИҚ туради — вақт ўтиб кўпайиб кетмасин (Достон 2026-09-28)
  let royxatOchiq = $state(false);
</script>

<div class="body">
  {#if xato}
    <div class="note rd"><Icon name="alert" size={18} />{xato}</div>
  {:else if !d}
    <div class="spin"></div>

  <!-- ─── 🩺 ТЕКШИРУВ НАТИЖАСИ ─── -->
  {:else if tek}
    <button class="btn soft" onclick={() => { tek = null; qTahrir = null; haptic(); }}><Icon name="back" size={18} /> Орқага</button>
    <div class="card total"><span class="l"><Icon name="alert" size={16} />Текширув · {tek.davr}</span>
      <span class="n">{tek.shubhaSoni} та</span></div>
    {#if tek.farq}
      <div class="note amb"><Icon name="alert" size={18} /><span>Файлдаги «Жами» мос эмас — фарқ {tek.farq.toLocaleString("ru-RU")} сўм
        (файлда {tek.jamiFayl.toLocaleString("ru-RU")}, қаторларда {tek.jamiBlok.toLocaleString("ru-RU")})</span></div>
    {/if}
    {#if tek.egasiz.length}
      <div class="note amb"><Icon name="alert" size={18} /><span>Эгаси аниқланмаган: {tek.egasiz.length} та ·
        {tek.egasiz.reduce((a, e) => a + e.summa, 0).toLocaleString("ru-RU")} сўм — «Ичини кўриш»да тузатилади</span></div>
    {/if}
    {#if !tek.shubhaSoni && !tek.farq && !tek.egasiz.length}
      <div class="note gr"><Icon name="checkcircle" size={18} />Шубҳали қатор топилмади — {tek.qatorlar} қатор текширилди</div>
    {/if}
    {#each tek.shubha as x (x.sid + "-" + x.i)}
      <div class="card">
        {#if qTahrir && qTahrir.sid === x.sid && qTahrir.i === x.i}
          <div class="field"><label for="tk-nom">Маҳсулот номи</label><input id="tk-nom" bind:value={qTahrir.nom} /></div>
          <div class="two">
            <div class="field"><label for="tk-soni">Сони</label><input id="tk-soni" bind:value={qTahrir.soni} inputmode="decimal" /></div>
            <div class="field"><label for="tk-summa">Суммаси</label><input id="tk-summa" bind:value={qTahrir.summa} inputmode="numeric" /></div>
          </div>
          <div class="two">
            <button class="btn sm" disabled={yuk} onclick={async () => { await qSaqla(); await tekshir(tek.key); }}>Сақлаш</button>
            <button class="btn sm soft" disabled={yuk} onclick={() => (qTahrir = null)}>Бекор</button>
          </div>
        {:else if qOchirish === "t" + x.sid + x.i}
          <div class="note rd"><Icon name="alert" size={16} /><span>«{x.nom}» ўчирилсинми?</span></div>
          <div class="two">
            <button class="btn danger" disabled={yuk} onclick={async () => { await qOchir2({ key: tek.key, sid: x.sid, i: x.i }); await tekshir(tek.key); }}>✅ Ҳа</button>
            <button class="btn soft" disabled={yuk} onclick={() => (qOchirish = null)}>❌ Йўқ</button>
          </div>
        {:else}
          <div class="note amb" style="margin-bottom:8px"><Icon name="alert" size={16} />{x.izoh}</div>
          <div class="row"><span class="l"><b>{x.nom}</b></span></div>
          <div class="row"><span class="l" style="font-size:12px;color:var(--muted)">{x.ism}</span>
            <span class="v">{x.soni.toLocaleString("ru-RU")} дона · {x.summa.toLocaleString("ru-RU")} сўм</span></div>
          <div class="two">
            <button class="btn sm soft" onclick={() => tekTuzat(x)}><Icon name="pencil" size={14} /> Тузатиш</button>
            <button class="btn sm danger" onclick={() => { qOchirish = "t" + x.sid + x.i; haptic(); }}><Icon name="ban" size={14} /> Ўчириш</button>
          </div>
        {/if}
      </div>
    {/each}

  <!-- ─── ҚАТОРЛАР (битта сотувчи) ─── -->
  {:else if qat}
    <button class="btn soft" onclick={() => { qat = null; tahrir = null; haptic(); }}><Icon name="back" size={18} /> Орқага</button>
    <div class="card total"><span class="l"><Icon name="user" size={16} />{qat.ism}</span>
      <span class="n">{qat.summa.toLocaleString("ru-RU")} сўм</span></div>
    {#each qat.qatorlar as q (q.i)}
      <div class="card">
        {#if tahrir && tahrir.i === q.i}
          <div class="field"><label for="q-nom">Маҳсулот номи</label><input id="q-nom" bind:value={tahrir.nom} /></div>
          <div class="two">
            <div class="field"><label for="q-soni">Сони</label><input id="q-soni" bind:value={tahrir.soni} inputmode="decimal" /></div>
            <div class="field"><label for="q-summa">Суммаси (сўм)</label><input id="q-summa" bind:value={tahrir.summa} inputmode="numeric" /></div>
          </div>
          <div class="two">
            <button class="btn sm" disabled={yuk} onclick={qatorSaqla}>Сақлаш</button>
            <button class="btn sm soft" disabled={yuk} onclick={() => (tahrir = null)}>Бекор</button>
          </div>
        {:else if qOchir === q.i}
          <div class="note rd"><Icon name="alert" size={16} /><span>«{q.nom}» ўчирилсинми? {q.summa.toLocaleString("ru-RU")} сўм қарздан айирилади.</span></div>
          <div class="two">
            <button class="btn danger" disabled={yuk} onclick={() => qatorniOchir(q.i)}>✅ Ҳа, ўчир</button>
            <button class="btn soft" disabled={yuk} onclick={() => (qOchir = null)}>❌ Йўқ</button>
          </div>
        {:else}
          <div class="row"><span class="l">{q.tahrir ? "✏️ " : ""}{q.i + 1}. {q.nom}</span>
            <span class="v">{q.summa.toLocaleString("ru-RU")} сўм</span></div>
          <div class="row"><span class="l">{q.soni.toLocaleString("ru-RU")} дона</span>
            <span class="v">{q.soni ? Math.round(q.summa / q.soni).toLocaleString("ru-RU") : 0} сўм/дона</span></div>
          <div class="two">
            <button class="btn sm soft" disabled={yuk} onclick={() => { tahrir = { i: q.i, nom: q.nom, soni: String(q.soni), summa: String(q.summa) }; haptic(); }}><Icon name="pencil" size={14} /> Тузатиш</button>
            <button class="btn sm danger" disabled={yuk} onclick={() => { qOchir = q.i; haptic(); }}><Icon name="ban" size={14} /> Ўчириш</button>
          </div>
        {/if}
      </div>
    {/each}

  <!-- ─── ЮКЛАМА ИЧИ ─── -->
  {:else if ichi}
    <button class="btn soft" onclick={() => { ichi = null; egaOchiq = null; haptic(); }}><Icon name="back" size={18} /> Орқага</button>
    <div class="card total"><span class="l"><Icon name="box" size={16} />{ichi.davr}</span>
      <span class="n">{ichi.satrlar.reduce((a, s) => a + s.summa, 0).toLocaleString("ru-RU")} сўм</span></div>
    {#if ichi.egasiz.length}
      <div class="note amb"><Icon name="alert" size={18} />Эгаси аниқланмаган: {ichi.egasiz.length} та</div>
      {#each ichi.egasiz as e (e.i)}
        <div class="card">
          <div class="row"><span class="l">{e.nom || "номсиз"}</span><span class="v">{e.summa.toLocaleString("ru-RU")} сўм</span></div>
          {#if egasizOchirish === e.i}
            <div class="note rd"><Icon name="alert" size={16} /><span>«{e.nom || "номсиз"}» ўчирилсинми? {e.summa.toLocaleString("ru-RU")} сўм жамидан айирилади.</span></div>
            <div class="two">
              <button class="btn danger" disabled={yuk} onclick={() => egasizniOchir(e.i)}>✅ Ҳа, ўчир</button>
              <button class="btn soft" disabled={yuk} onclick={() => (egasizOchirish = null)}>❌ Йўқ</button>
            </div>
          {:else if egaOchiq && egaOchiq.egasiz === e.i}
            <select bind:value={egaTanlov}><option value="">— сотувчини танланг —</option>
              {#each ichi.barcha as s (s.id)}<option value={s.id}>{s.ism}</option>{/each}</select>
            <div class="two">
              <button class="btn sm" disabled={yuk || !egaTanlov} onclick={egaSaqla}>Бириктириш</button>
              <button class="btn sm soft" onclick={() => (egaOchiq = null)}>Бекор</button>
            </div>
          {:else}
            <div class="two">
              <button class="btn sm soft" onclick={() => { egaOchiq = { egasiz: e.i }; egaTanlov = ""; haptic(); }}><Icon name="user" size={16} /> Эгасини белгилаш</button>
              <button class="btn sm danger" onclick={() => { egasizOchirish = e.i; haptic(); }}><Icon name="ban" size={16} /> Ўчириш</button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
    <div class="card">
      {#each ichi.satrlar as s (s.id)}
        <div class="row"><span class="l">{s.ism}</span><span class="v">{s.summa.toLocaleString("ru-RU")} сўм · {s.mahsulot} та</span></div>
        {#if egaOchiq && egaOchiq.manba === s.id}
          <select bind:value={egaTanlov}><option value="">— кимга кўчирилсин —</option>
            {#each ichi.barcha.filter((x) => x.id !== s.id) as x (x.id)}<option value={x.id}>{x.ism}</option>{/each}</select>
          <div class="two">
            <button class="btn sm" disabled={yuk || !egaTanlov} onclick={egaSaqla}>Кўчириш</button>
            <button class="btn sm soft" onclick={() => (egaOchiq = null)}>Бекор</button>
          </div>
        {:else}
          <div class="two">
            <button class="btn sm soft" onclick={() => qatorlarOch(s.id)}><Icon name="search" size={14} /> Қаторлари</button>
            <button class="btn sm soft" onclick={() => { egaOchiq = { manba: s.id }; egaTanlov = ""; haptic(); }}><Icon name="swap" size={14} /> Эгасини ўзгартириш</button>
          </div>
        {/if}
      {/each}
    </div>
    <div class="muted" style="font-size:12px">«Қаторлари» — битта маҳсулотни тузатиш ёки ўчириш. Тузатилган қатор ✏️ белгиси билан кўринади ва журналга ёзилади.</div>

  <!-- ─── ТАСДИҚ ОЙНАСИ ─── -->
  {:else if korish}
    <div class="card total"><span class="l"><Icon name="upload" size={16} />{korish.davr || "давр номаълум"}</span>
      <span class="n">{korish.summa.toLocaleString("ru-RU")} сўм</span></div>
    <div class="card">
      <div class="row"><span class="l">Маҳсулот</span><span class="v">{korish.soni.toLocaleString("ru-RU")} та</span></div>
      <div class="row"><span class="l">Сотувчи</span><span class="v">{korish.sotuvchilar} та</span></div>
      <div class="row"><span class="l">Курс</span><span class="v">{korish.kurs ? korish.kurs.toLocaleString("ru-RU") : "—"}</span></div>
      <div class="hr"></div>
      <div class="row b"><span class="l">Долларда</span><span class="v">{korish.kurs ? dol(korish.summa / korish.kurs) : "—"} $</span></div>
    </div>
    {#if korish.egasiz.length}
      <div class="note amb"><Icon name="alert" size={18} /><span>Эгаси аниқланмаган: {korish.egasiz.length} та ·
        {korish.egasiz.reduce((a, e) => a + e.summa, 0).toLocaleString("ru-RU")} сўм</span></div>
    {/if}
    {#if korish.tosiq}
      <div class="note rd"><Icon name="alert" size={18} />«{korish.tosiq}» билан устма-уст тушади — ёзилмайди. Аввал ўшани ўчиринг.</div>
    {:else if korish.almashadi.length}
      <div class="note amb"><Icon name="repeat" size={18} />«{korish.almashadi.map((x) => x.davr).join(", ")}» ўрнига ёзилади</div>
    {/if}
    <div class="two">
      <button class="btn" disabled={yuk || !!korish.tosiq} onclick={tasdiqla}>{yuk ? "Ёзилмоқда…" : "✅ Тасдиқлаб ёзиш"}</button>
      <button class="btn soft" disabled={yuk} onclick={bekor}>❌ Бекор</button>
    </div>

  <!-- ─── АСОСИЙ ЭКРАН ─── -->
  {:else}
    <!-- 🔍 Қидирув: маҳсулот номи ёки рақам → дарров тузатиш -->
    {#if d.davrlar.length}
      <div class="qidiruv">
        <Icon name="search" size={18} />
        <input value={qq} oninput={qidirYoz} placeholder="Хато қаторни қидириш: номи ёки рақами" />
        {#if qq}<button class="xbtn" onclick={() => { qq = ""; topildi = null; }} aria-label="Тозалаш"><Icon name="x" size={16} /></button>{/if}
      </div>
      {#if qYuk}<div class="spin"></div>{/if}
      {#if topildi}
        <div class="muted" style="font-size:12px">{topildi.soni} та топилди</div>
        {#each topildi.natija as x (x.key + x.sid + x.i)}
          <div class="card">
            {#if qTahrir && qTahrir.key === x.key && qTahrir.sid === x.sid && qTahrir.i === x.i}
              <div class="field"><label for="qt-nom">Маҳсулот номи</label><input id="qt-nom" bind:value={qTahrir.nom} /></div>
              <div class="two">
                <div class="field"><label for="qt-soni">Сони</label><input id="qt-soni" bind:value={qTahrir.soni} inputmode="decimal" /></div>
                <div class="field"><label for="qt-summa">Суммаси</label><input id="qt-summa" bind:value={qTahrir.summa} inputmode="numeric" /></div>
              </div>
              <div class="two">
                <button class="btn sm" disabled={yuk} onclick={qSaqla}>Сақлаш</button>
                <button class="btn sm soft" disabled={yuk} onclick={() => (qTahrir = null)}>Бекор</button>
              </div>
            {:else if qOchirish === x.key + x.sid + x.i}
              <div class="note rd"><Icon name="alert" size={16} /><span>«{x.nom}» ўчирилсинми?</span></div>
              <div class="two">
                <button class="btn danger" disabled={yuk} onclick={() => qOchir2(x)}>✅ Ҳа</button>
                <button class="btn soft" disabled={yuk} onclick={() => (qOchirish = null)}>❌ Йўқ</button>
              </div>
            {:else}
              <div class="row"><span class="l"><b>{x.tahrir ? "✏️ " : ""}{x.nom}</b></span></div>
              <div class="row"><span class="l" style="font-size:12px;color:var(--muted)">{x.ism} · {x.davr}</span>
                <span class="v">{x.soni.toLocaleString("ru-RU")} дона · {x.summa.toLocaleString("ru-RU")} сўм</span></div>
              <div class="two">
                <button class="btn sm soft" onclick={() => { qTahrir = { key: x.key, sid: x.sid, i: x.i, nom: x.nom, soni: String(x.soni), summa: String(x.summa) }; haptic(); }}><Icon name="pencil" size={14} /> Тузатиш</button>
                <button class="btn sm danger" onclick={() => { qOchirish = x.key + x.sid + x.i; haptic(); }}><Icon name="ban" size={14} /> Ўчириш</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    {/if}
    {#if yuklaydi}
      <label class="upload" class:busy={yuk} for="sklad"><span class="or"><Icon name="upload" size={32} /></span><div style="font-size:16px;font-weight:700">{yuk ? "Ўқилмоқда…" : "Файлни танланг"}</div></label>
      <input id="sklad" type="file" accept=".xlsx,.csv" hidden onchange={faylTanla} />
      <button class="btn soft" onclick={() => { nusxaOchiq = !nusxaOchiq; haptic(); }}><Icon name="clip" size={18} /> {nusxaOchiq ? "Ёпиш" : "Жадвални нусхалаб қўйиш"}</button>
      {#if nusxaOchiq}
        <div class="card">
          <textarea bind:value={nusxa} rows="5" placeholder="Excel катакларини нусхалаб шу ерга қўйинг"></textarea>
          <button class="btn" disabled={yuk || nusxa.trim().length < 20} onclick={() => korishSora({ matn: nusxa })}>{yuk ? "Ўқилмоқда…" : "Кўриш"}</button>
        </div>
      {/if}
    {/if}
    {#if natija && natija.xato}
      <div class="note rd" style="align-items:flex-start"><Icon name="alert" size={18} /><span style="white-space:pre-line">{natija.xato}</span></div>
      <!-- Достон 2026-09-28: нима бор, нима йўқ — бирма-бир ✓/✗ -->
      {#if natija.royxat && natija.royxat.length}
        <div class="card"><div class="muted" style="font-size:12px;margin-bottom:6px">Склад файлида бўлиши керак:</div>
          {#each natija.royxat as x}
            <div style="font-size:13px;overflow-wrap:anywhere;color:{x.bor ? 'var(--gr)' : 'var(--rd)'}">{x.bor ? "✓" : "✗"} {x.nom}</div>
          {/each}</div>
      {/if}
      {#if natija.korilgan && natija.korilgan.length}
        <div class="card"><div class="muted" style="font-size:12px;margin-bottom:6px">Файлдан ўқилгани:</div>
          {#each natija.korilgan as q}<div style="font-size:12px;color:var(--muted);overflow-wrap:anywhere">{q}</div>{/each}</div>
      {/if}
    {/if}

    <!-- Юкланган маълумотлар — ЁПИҚ туради (Достон 2026-09-28: «keyinchalik
         ko'payib ketadi, tagma-tag tushib ketadi — ko'rinmasin»). Тугма
         босилганда очилади; ичида қанчаси борлиги тугмада кўриниб туради. -->
    {#if d.davrlar.length}
      <button class="btn soft" onclick={() => { royxatOchiq = !royxatOchiq; haptic(); }}>
        <Icon name="board" size={18} /> Юкланган маълумотлар · {d.davrlar.length} та {royxatOchiq ? "▲" : "▼"}
      </button>
    {/if}
    {#if d.davrlar.length && royxatOchiq}
      {#each d.davrlar as x (x.key)}
        <div class="card">
          <div class="row"><span class="l"><b>{x.davr}</b></span><span class="v">{x.summa.toLocaleString("ru-RU")} сўм</span></div>
          <div class="row"><span class="l">{x.soni.toLocaleString("ru-RU")} та · {x.sotuvchilar} сотувчи</span>
            <span class="v">курс {x.kurs ? x.kurs.toLocaleString("ru-RU") : "—"}</span></div>
          <!-- Достон 2026-09-28: юкламани топиш осон бўлсин — файл номи, вақти, ким -->
          <div class="row"><span class="l" style="font-size:12px;color:var(--muted)">
            {x.fayl ? "📎 " + x.fayl : "📎 —"}</span></div>
          <div class="row"><span class="l" style="font-size:12px;color:var(--muted)">
            📅 {x.yuklandi ? new Date(x.yuklandi).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
            {x.kimIsm ? " · " + x.kimIsm : ""}</span></div>
          {#if ochirTasdiq === x.key}
            <div class="note rd"><Icon name="alert" size={16} /><span>Ўчирилсинми? {x.soni.toLocaleString("ru-RU")} та маҳсулот,
              {x.sotuvchilar} сотувчи қарзидан {x.summa.toLocaleString("ru-RU")} сўм айирилади.</span></div>
            <div class="two">
              <button class="btn danger" disabled={yuk} onclick={() => ochir(x.key)}>{yuk ? "Ўчирилмоқда…" : "✅ Ҳа, ўчир"}</button>
              <button class="btn soft" disabled={yuk} onclick={() => (ochirTasdiq = null)}>❌ Йўқ</button>
            </div>
          {:else}
            <button class="btn sm" disabled={yuk} onclick={() => tekshir(x.key)}><Icon name="alert" size={16} /> Текшириш — хато қаторларни топиш</button>
            <div class="two">
              <button class="btn sm soft" disabled={yuk} onclick={() => ich(x.key)}><Icon name="search" size={16} /> Ичини кўриш</button>
              {#if yuklaydi}<button class="btn sm danger" disabled={yuk} onclick={() => { ochirTasdiq = x.key; haptic(); }}><Icon name="ban" size={16} /> Ўчириш</button>{/if}
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      <div class="note"><Icon name="info" size={18} />Ҳали маълумот юкланмаган</div>
    {/if}
  {/if}
</div>

<style>
  .qidiruv { display: flex; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: 4px;
             background: var(--surf); border: var(--cb); border-radius: 14px; color: var(--muted); }
  .qidiruv input { flex: 1; border: 0; background: transparent; color: var(--ink); font-size: 14px; outline: none; }
  select { width: 100%; padding: 10px 12px; margin: 8px 0; border-radius: 12px; border: var(--cb);
           background: var(--surf); color: var(--ink); font-size: 14px; }
  textarea { width: 100%; padding: 10px 12px; border-radius: 12px; border: var(--cb);
             background: var(--surf); color: var(--ink); font-size: 13px; resize: vertical; }
</style>

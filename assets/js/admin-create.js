// assets/js/admin-create.js
// STOLAR CARP • admin-create (Create/Edit competitions)
//
// ✅ НІЯКОГО другого логіну: беремо існуючу сесію з admin.html
// ✅ Перевірка доступу: users/{uid}.role === "admin"
// ✅ Мінімум читань: lakes (1 раз), competitions (тільки в edit), settings/app (1 раз)
// ✅ Старт/фініш = datetime-local → зберігаємо Timestamp (UTC)
// ✅ Тривалість рахуємо в UI автоматично
// ✅ Реєстрація: auto (−28/−14) або manual (date/date)
// ✅ Чернетка: localStorage
// ✅ Make Active завжди робить active тільки після Save (щоб doc існував)
// ✅ registry + format-*.js (init/validate/serialize/deserialize), engine в Firestore
// ✅ FIX: НЕ чекаємо window.firebase (може не існувати) — чекаємо scAuth/scDb
// ✅ FIX: activateFormat fallback правильно виставляє activeFormatName
// ✅ FIX: draft serialize бере фактичний inpFormat.value, не старий activeFormatName
//
// ✅ NEW (головне): "СЕЗОН = РІК", а не "подія"
//    - seasonYear = 2026/2027...
//    - kind="tour"  => Турнір сезону (етапи+фінал), ID = tournament-2026 (стабільний)
//    - kind="teams" => Командна подія в сезоні, ID = event-2026-...-abcd
//    - kind="solo"  => Соло подія в сезоні, ID = event-2026-...-abcd
//    - Обмеження форматів по kind (3tables НЕ може бути турніром)

(function(){
  "use strict";

  // bump draft key because structure changed (kind/lakeCustom/etc)
  const DRAFT_KEY = "sc_admin_create_draft_v2";

  const $ = (id)=>document.getElementById(id);

  const setStatus = (t)=>{ const e=$("createStatus"); if(e) e.textContent=t; };
  const setDebug  = (t)=>{ const e=$("createDebug");  if(e) e.textContent=t||""; };
  const setMsg    = (html)=>{ const e=$("createMsg"); if(e) e.innerHTML = html || ""; };

  function show(el){ el && el.classList.remove("hidden"); }
  function hide(el){ el && el.classList.add("hidden"); }

  function esc(s){
    return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }

  // ---- Firebase wait (НЕ чекаємо window.firebase!) ----
  async function waitForFirebase(){
    for(let i=0;i<140;i++){
      if(window.scAuth && window.scDb) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb. Перевір assets/js/firebase-init.js.");
  }

  function getFirebaseCompat(){
    if(window.firebase) return window.firebase;
    if(typeof firebase !== "undefined") return firebase;
    return null;
  }

  let auth=null, db=null, fb=null;

  // --- Mode (create/edit)
  const url = new URL(location.href);
  const mode = (url.searchParams.get("mode") || "create").toLowerCase(); // create|edit
  const isEditMode = mode === "edit";

  // --- UI refs
  const gate = $("createGate");
  const app  = $("createApp");

  const tabCreate = $("tabCreate");
  const tabEdit   = $("tabEdit");
  const editPicker = $("editPicker");
  const deleteWrap = $("deleteWrap");

  // Fields (existing)
  const inpType = $("inpType");     // legacy: season|oneoff (we keep for backward UI)
  const inpYear = $("inpYear");
  const inpName = $("inpName");
  const inpFormat = $("inpFormat");
  const inpLake = $("inpLake");

  const inpStartAt = $("inpStartAt");
  const inpFinishAt = $("inpFinishAt");

  const outDuration = $("outDuration");
  const outDurationHours = $("outDurationHours");
  const outDurationDays = $("outDurationDays");

  const seasonOnly = $("seasonOnly");
  const inpStagesCount = $("inpStagesCount");
  const inpHasFinal = $("inpHasFinal");

  const inpRegMode = $("inpRegMode");
  const inpPayEnabled = $("inpPayEnabled");
  const inpRegOpen = $("inpRegOpen");
  const inpRegClose = $("inpRegClose");
  const inpPrice = $("inpPrice");
  const inpCurrency = $("inpCurrency");
  const inpPayDetails = $("inpPayDetails");
  const regPreview = $("regPreview");

  // NEW optional fields (won't break if missing)
  const inpKind = $("inpKind"); // tour|teams|solo (optional but recommended)
  const inpLakeCustom = $("inpLakeCustom"); // custom lake name (optional)

  // Buttons
  const btnSave = $("btnSave");
  const btnMakeActive = $("btnMakeActive");
  const btnResetDraft = $("btnResetDraft");
  const btnDelete = $("btnDelete");

  // Edit picker
  const selCompetition = $("selCompetition");
  const btnReloadList = $("btnReloadList");
  const editPickerMsg = $("editPickerMsg");

  // ------------------------------------------------------------
  // ✅ Formats loader (registry + format-*.js)
  // ------------------------------------------------------------
  const formatFieldsEl = $("formatFields");
  let activeFormatName = "";
  let activeFormat = null;

  function renderFormatSpecificFields(html){
    if(!formatFieldsEl) return;
    formatFieldsEl.innerHTML = html || "";
  }

  function getRegistry(){
    const sc = window.SC_FORMATS || null;
    if(!sc) return null;
    if(typeof sc.get === "function") return sc; // SC_FORMATS.get(name)
    if(sc.registry && typeof sc.registry.get === "function") return sc.registry; // SC_FORMATS.registry.get(name)
    return null;
  }

  function getPreset(name){
    const reg = getRegistry();
    const key = String(name || "").toLowerCase();
    if(!reg || !key) return null;
    try{
      return reg.get(key) || null;
    }catch(_){
      return null;
    }
  }

  async function activateFormat(formatName, opts){
    let requested = String(formatName || "classic").toLowerCase();
    let preset = getPreset(requested);

    if(!preset){
      console.warn(`Формат "${requested}" не знайдено, fallback classic`);
      requested = "classic";
      preset = getPreset("classic");
    }

    activeFormatName = requested;
    activeFormat = preset || null;

    renderFormatSpecificFields("");

    if(activeFormat && typeof activeFormat.init === "function"){
      activeFormat.init({ render: renderFormatSpecificFields, $, esc });
    }

    if(opts && opts.deserializeData && activeFormat && typeof activeFormat.deserialize === "function"){
      try{
        activeFormat.deserialize(opts.deserializeData, { render: renderFormatSpecificFields, $, esc });
      }catch(e){
        console.warn("deserialize error:", e);
      }
    }
  }

  // --- Helpers: Draft
  function getDraft(){ try{ return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); }catch{ return null; } }
  function setDraft(data){ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); }catch{} }
  function clearDraft(){ try{ localStorage.removeItem(DRAFT_KEY); }catch{} }

  // --- Helpers: Date/time
  function parseLocalDateTime(v){
    const s = (v||"").trim();
    if(!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return null;
    const y = +m[1], mo = +m[2]-1, d = +m[3], h = +m[4], mi = +m[5];
    const dt = new Date(y, mo, d, h, mi, 0, 0);
    if(Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  function toDateTimeLocalValue(date){
    if(!date) return "";
    const yy = date.getFullYear();
    const mm = String(date.getMonth()+1).padStart(2,"0");
    const dd = String(date.getDate()).padStart(2,"0");
    const hh = String(date.getHours()).padStart(2,"0");
    const mi = String(date.getMinutes()).padStart(2,"0");
    return `${yy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function diffMinutes(a,b){
    if(!a || !b) return null;
    const ms = b.getTime() - a.getTime();
    if(!Number.isFinite(ms)) return null;
    return Math.floor(ms / 60000);
  }

  // --- Registration windows (auto)
  function normDate(v){
    const s = (v||"").trim();
    if(!s) return "";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    return s;
  }

  function addDays(dateStr, days){
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth()+1).padStart(2,"0");
    const dd = String(dt.getUTCDate()).padStart(2,"0");
    return `${yy}-${mm}-${dd}`;
  }
  function regOpenFromStartDate(startDateStr){ return startDateStr ? addDays(startDateStr, -28) : ""; }
  function regCloseFromStartDate(startDateStr){ return startDateStr ? addDays(startDateStr, -14) : ""; }

  function startDateOnly(){
    const dt = parseLocalDateTime(inpStartAt?.value || "");
    if(!dt) return "";
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth()+1).padStart(2,"0");
    const dd = String(dt.getDate()).padStart(2,"0");
    return `${yy}-${mm}-${dd}`;
  }

  // --- Access
  async function requireAdmin(user){
    if(!user) return false;
    try{
      const snap = await db.collection("users").doc(user.uid).get();
      const role = snap.exists ? ((snap.data()||{}).role || "") : "";
      return String(role).toLowerCase() === "admin";
    }catch(_){
      return false;
    }
  }

  // --- UI: Mode switch
  function setActiveTab(isEdit){
    if(tabCreate && tabEdit){
      tabCreate.classList.toggle("pill--active", !isEdit);
      tabEdit.classList.toggle("pill--active", isEdit);
    }
    if(editPicker) (isEdit ? show : hide)(editPicker);
    if(deleteWrap) (isEdit ? show : hide)(deleteWrap);
  }

  function gotoMode(nextMode){
    const u = new URL(location.href);
    if(nextMode === "edit") u.searchParams.set("mode","edit");
    else u.searchParams.delete("mode");
    location.href = u.toString();
  }

  // ------------------------------------------------------------
  // ✅ Business rules: kind + форматні обмеження
  // ------------------------------------------------------------
  const KIND_LABELS = {
    tour:  "Турнір сезону (етапи + фінал)",
    teams: "Командні змагання (подія)",
    solo:  "Соло змагання (подія)"
  };

  const TOUR_FORMATS  = ["classic"]; // турнір = тільки classic (за твоїм правилом)
  const SOLO_FORMATS  = ["stalker-solo"];
  const TEAMS_FORMATS = ["classic","3tables","stalker-teams","bigfish30","autumn-carp","trophy15"];

  function inferKindFallback(){
    // Якщо inpKind не існує — робимо розумний fallback:
    // - inpType=season => турнір
    // - інакше за форматом: stalker-solo => solo, інше => teams
    const t = (inpType?.value || "oneoff").toLowerCase();
    const fmt = String(inpFormat?.value || "classic").toLowerCase();
    if(t === "season") return "tour";
    if(fmt === "stalker-solo") return "solo";
    return "teams";
  }

  function getKind(){
    const k = String(inpKind?.value || "").toLowerCase().trim();
    if(k === "tour" || k === "teams" || k === "solo") return k;
    return inferKindFallback();
  }

  function allowedFormatsForKind(kind){
    if(kind === "tour") return TOUR_FORMATS.slice();
    if(kind === "solo") return SOLO_FORMATS.slice();
    return TEAMS_FORMATS.slice();
  }

  function enforceFormatForKind(kind){
    // Якщо вибраний формат не дозволений — переключаємо на перший дозволений
    const allowed = allowedFormatsForKind(kind);
    const current = String(inpFormat?.value || "classic").toLowerCase();
    if(!allowed.includes(current)){
      const next = allowed[0] || "classic";
      if(inpFormat) inpFormat.value = next;
    }
  }

  function setSeasonVisibility(){
    // seasonOnly показуємо тільки для kind=tour
    const kind = getKind();
    if(seasonOnly){
      if(kind === "tour") show(seasonOnly);
      else hide(seasonOnly);
    }
  }

  // ------------------------------------------------------------
  // Lakes
  // ------------------------------------------------------------
  async function loadLakes(){
    if(!inpLake) return;
    inpLake.innerHTML = `<option value="">Завантаження…</option>`;
    try{
      const snap = await db.collection("lakes").get();
      const items = snap.docs.map(d=>{
        const x = d.data() || {};
        return { id: d.id, name: x.name || d.id };
      });
      items.sort((a,b)=> (a.name||"").localeCompare(b.name||"","uk"));

      if(!items.length){
        inpLake.innerHTML = `<option value="">Нема водойм (lakes)</option>`;
        return;
      }

      inpLake.innerHTML = `<option value="">— вибери водойму —</option>` + items.map(it=>{
        return `<option value="${esc(it.id)}">${esc(it.name)} (${esc(it.id)})</option>`;
      }).join("");
    }catch(e){
      inpLake.innerHTML = `<option value="">Помилка завантаження lakes</option>`;
      setDebug(e?.message || String(e));
    }
  }

  function getLakeInput(){
    // Пріоритет: custom name -> select
    const custom = (inpLakeCustom?.value || "").trim();
    const lakeId = (inpLake?.value || "").trim();

    if(custom){
      return {
        source: "custom",
        id: `custom:${custom.toLowerCase().slice(0,60).replace(/[^a-z0-9а-яіїєґ\-\s]+/gi,"").trim().replace(/\s+/g,"-") || "lake"}`,
        name: custom
      };
    }

    if(lakeId){
      return { source:"catalog", id: lakeId, name: "" }; // name буде з lakes або fallback
    }

    return null;
  }

  async function getLakeSnapshot(lakeObj){
    if(!lakeObj) return null;

    if(lakeObj.source === "custom"){
      return { id: lakeObj.id, name: lakeObj.name, source:"custom" };
    }

    const lakeId = lakeObj.id;
    try{
      const doc = await db.collection("lakes").doc(lakeId).get();
      if(!doc.exists) return { id: lakeId, name: lakeId, source:"catalog" };
      const d = doc.data() || {};
      return { id: lakeId, name: d.name || lakeId, source:"catalog" };
    }catch(_){
      return { id: lakeId, name: lakeId, source:"catalog" };
    }
  }

  // ------------------------------------------------------------
  // Edit list
  // ------------------------------------------------------------
  async function loadCompetitionsList(){
    if(!selCompetition) return;
    selCompetition.innerHTML = `<option value="">Завантаження…</option>`;
    if(editPickerMsg) editPickerMsg.textContent = "";

    let activeId = "";
    try{
      const s = await db.collection("settings").doc("app").get();
      if(s.exists) activeId = (s.data() || {}).activeCompetitionId || "";
    }catch(_){}

    const snap = await db.collection("competitions").get();
    const items = snap.docs.map(doc=>{
      const d = doc.data() || {};
      const year = d.seasonYear || d.year || 0;
      const kind = d.kind || ((d.type === "season") ? "tour" : "teams");
      const name = d.name || doc.id;
      return {
        id: doc.id,
        year,
        kind,
        name,
        active: doc.id === activeId
      };
    });

    items.sort((a,b)=>
      (b.year - a.year) ||
      (a.kind||"").localeCompare(b.kind||"","uk") ||
      (a.name||"").localeCompare(b.name||"","uk")
    );

    if(!items.length){
      selCompetition.innerHTML = `<option value="">Нема змагань</option>`;
      return;
    }

    selCompetition.innerHTML =
      `<option value="">— вибери змагання —</option>` +
      items.map(it=>{
        const k = KIND_LABELS[it.kind] ? it.kind : "teams";
        const label = `${it.active ? "✅ " : ""}${it.id} — ${it.name} (${it.year}, ${k})`;
        return `<option value="${esc(it.id)}">${esc(label)}</option>`;
      }).join("");
  }

  // ------------------------------------------------------------
  // UI updates
  // ------------------------------------------------------------
  function updateDurationUI(){
    const a = parseLocalDateTime(inpStartAt?.value || "");
    const b = parseLocalDateTime(inpFinishAt?.value || "");
    const mins = diffMinutes(a,b);

    if(!a || !b || mins === null){
      if(outDuration) outDuration.value = "—";
      if(outDurationHours) outDurationHours.value = "—";
      if(outDurationDays) outDurationDays.value = "—";
      return;
    }

    if(mins <= 0){
      if(outDuration) outDuration.value = "❌ Фініш має бути після старту";
      if(outDurationHours) outDurationHours.value = "—";
      if(outDurationDays) outDurationDays.value = "—";
      return;
    }

    const hours = mins / 60;
    const days = hours / 24;

    if(outDuration) outDuration.value = `${Math.round(hours)} год (${days.toFixed(2)} доби)`;
    if(outDurationHours) outDurationHours.value = hours.toFixed(2);
    if(outDurationDays) outDurationDays.value = days.toFixed(2);
  }

  function updateRegUI(){
    const mode = (inpRegMode?.value || "auto");
    const startD = startDateOnly();

    if(mode === "manual"){
      if(inpRegOpen) inpRegOpen.disabled = false;
      if(inpRegClose) inpRegClose.disabled = false;
      if(regPreview){
        regPreview.innerHTML =
          `Реєстрація: <b>MANUAL</b> (${esc(normDate(inpRegOpen?.value)||"—")} → ${esc(normDate(inpRegClose?.value)||"—")})`;
      }
      return;
    }

    if(inpRegOpen) inpRegOpen.disabled = true;
    if(inpRegClose) inpRegClose.disabled = true;

    if(!startD){
      if(regPreview) regPreview.textContent = "Реєстрація: —";
      return;
    }
    const o = regOpenFromStartDate(startD);
    const c = regCloseFromStartDate(startD);
    if(regPreview) regPreview.innerHTML = `Реєстрація: <b>${o}</b> → <b>${c}</b>`;
  }

  function currentFormatKey(){
    return String((inpFormat && inpFormat.value) ? inpFormat.value : (activeFormatName || "classic")).toLowerCase();
  }

  // ------------------------------------------------------------
  // Form collect/apply/draft
  // ------------------------------------------------------------
  function collectForm(){
    const yearStr = (inpYear?.value || "").trim();
    const name = (inpName?.value || "").trim();
    const kind = getKind(); // tour|teams|solo

    // legacy type mapping (for backward compatibility)
    const type = (kind === "tour") ? "season" : "oneoff";

    const format = String(inpFormat?.value || "classic").toLowerCase();
    const lakeInput = getLakeInput();

    const startDt = parseLocalDateTime(inpStartAt?.value || "");
    const finishDt = parseLocalDateTime(inpFinishAt?.value || "");

    const stagesCount = (kind === "tour") ? Number(inpStagesCount?.value || 3) : 1;
    const hasFinal = (kind === "tour") ? ((inpHasFinal?.value || "yes") === "yes") : false;

    const regMode = (inpRegMode?.value || "auto");
    const payEnabled = (inpPayEnabled?.value || "yes") === "yes";

    const manualOpen = normDate(inpRegOpen?.value || "");
    const manualClose = normDate(inpRegClose?.value || "");

    const priceRaw = (inpPrice?.value || "").trim();
    const price = priceRaw ? Number(String(priceRaw).replace(",", ".")) : null;
    const currency = (inpCurrency?.value || "UAH").trim().toUpperCase();
    const payDetails = (inpPayDetails?.value || "").trim();

    return {
      yearStr,
      seasonYear: /^\d{4}$/.test(yearStr) ? Number(yearStr) : null,
      name,
      kind,
      type,
      format,
      lakeInput,
      startDt,
      finishDt,
      stagesCount,
      hasFinal,
      regMode,
      payEnabled,
      manualOpen,
      manualClose,
      price: (price === null || Number.isFinite(price)) ? price : null,
      currency,
      payDetails
    };
  }

  function applyForm(data){
    if(!data) return;

    // kind first (if UI exists)
    const kind = String(data.kind || "").toLowerCase();
    if(inpKind && (kind === "tour" || kind === "teams" || kind === "solo")){
      inpKind.value = kind;
    }else{
      // legacy mapping if no inpKind or old docs
      if(inpType) inpType.value = (data.type === "season") ? "season" : "oneoff";
    }

    if(inpYear) inpYear.value = data.yearStr || String(data.seasonYear || data.year || "");
    if(inpName) inpName.value = data.name || "";

    if(inpFormat) inpFormat.value = (data.format || "classic");

    // lake
    if(inpLakeCustom) inpLakeCustom.value = data.lakeCustomName || "";
    if(inpLake) inpLake.value = data.lakeId || "";

    // schedule
    if(inpStartAt) inpStartAt.value = data.startAtLocal || "";
    if(inpFinishAt) inpFinishAt.value = data.finishAtLocal || "";

    // tour-only
    if(inpStagesCount) inpStagesCount.value = String(data.stagesCount || 3);
    if(inpHasFinal) inpHasFinal.value = (data.hasFinal ? "yes" : "no");

    // reg + pay
    if(inpRegMode) inpRegMode.value = data.regMode || "auto";
    if(inpPayEnabled) inpPayEnabled.value = (data.payEnabled === false ? "no" : "yes");
    if(inpRegOpen) inpRegOpen.value = data.manualOpen || "";
    if(inpRegClose) inpRegClose.value = data.manualClose || "";
    if(inpPrice) inpPrice.value = (data.price === 0 || data.price) ? String(data.price) : "";
    if(inpCurrency) inpCurrency.value = (data.currency || "UAH").toUpperCase();
    if(inpPayDetails) inpPayDetails.value = data.payDetails || "";
  }

  function saveDraftNow(){
    const d = collectForm();
    const fmtKey = currentFormatKey();

    const draft = {
      yearStr: d.yearStr,
      name: d.name,
      kind: d.kind,
      type: d.type,
      format: d.format,

      lakeId: d.lakeInput?.source === "catalog" ? d.lakeInput.id : "",
      lakeCustomName: d.lakeInput?.source === "custom" ? d.lakeInput.name : "",

      startAtLocal: inpStartAt?.value || "",
      finishAtLocal: inpFinishAt?.value || "",

      stagesCount: d.stagesCount,
      hasFinal: d.hasFinal,

      regMode: d.regMode,
      payEnabled: d.payEnabled,
      manualOpen: d.manualOpen,
      manualClose: d.manualClose,
      price: d.price,
      currency: d.currency,
      payDetails: d.payDetails,

      engine: (activeFormat && typeof activeFormat.serialize === "function")
        ? (activeFormat.serialize({ $, format: fmtKey }) || {})
        : {},

      ts: Date.now()
    };
    setDraft(draft);
  }

  // ------------------------------------------------------------
  // IDs
  // ------------------------------------------------------------
  function rand4(){
    return Math.random().toString(36).slice(2,6);
  }

  function slugify(name){
    return (name||"event")
      .toLowerCase()
      .replace(/[^a-z0-9а-яіїєґ]+/gi,"-")
      .replace(/-+/g,"-")
      .replace(/^-|-$/g,"")
      .slice(0,40);
  }

  function compIdFrom(kind, yearStr, name){
    // Турнір року має бути стабільний 1-в-1
    if(kind === "tour"){
      return `tournament-${yearStr}`;
    }

    const slug = slugify(name);
    return `event-${yearStr}-${slug || "event"}-${rand4()}`;
  }

  // ------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------
  function validate(form){
    if(!/^\d{4}$/.test(form.yearStr)) throw new Error("Вкажи рік (4 цифри), наприклад 2026.");
    if(!form.name) throw new Error("Вкажи назву змагання.");

    // lake: either selected or custom
    if(!form.lakeInput) throw new Error("Вкажи водойму: або вибери зі списку, або впиши назву.");

    if(!form.startDt) throw new Error("Заповни старт (дата + година).");
    if(!form.finishDt) throw new Error("Заповни фініш (дата + година).");
    if(form.finishDt.getTime() <= form.startDt.getTime()) throw new Error("Фініш має бути після старту.");

    // kind + format restriction
    const kind = form.kind;
    const allowed = allowedFormatsForKind(kind);
    if(!allowed.includes(String(form.format||"").toLowerCase())){
      const msg =
        kind === "tour"
          ? `Турнір сезону може бути тільки у форматі: ${allowed.join(", ")}.`
          : `Для цього виду доступні формати: ${allowed.join(", ")}.`;
      throw new Error(msg);
    }

    if(form.kind === "tour"){
      const sc = Number(form.stagesCount || 0);
      if(!Number.isFinite(sc) || sc < 2 || sc > 8) throw new Error("Турнір: к-сть етапів має бути 2–8.");
    }

    if(form.regMode === "manual"){
      if(form.manualOpen && !form.manualClose) throw new Error("Manual: заповни дату закриття реєстрації.");
      if(!form.manualOpen && form.manualClose) throw new Error("Manual: заповни дату відкриття реєстрації.");
    }

    if(form.payEnabled){
      if(form.price !== null && !Number.isFinite(form.price)) throw new Error("Внесок має бути числом.");
    }
  }

  function computeRegistrationBlock(form){
    const startD = startDateOnly();
    if(form.regMode === "manual"){
      return { mode: "manual", openDate: form.manualOpen || "", closeDate: form.manualClose || "" };
    }
    return {
      mode: "auto",
      openDate: startD ? regOpenFromStartDate(startD) : "",
      closeDate: startD ? regCloseFromStartDate(startD) : ""
    };
  }

  // ------------------------------------------------------------
  // Load one competition
  // ------------------------------------------------------------
  async function loadCompetition(compId){
    if(!compId) return;

    setMsg("");
    setStatus("Завантаження…");
    try{
      const doc = await db.collection("competitions").doc(compId).get();
      if(!doc.exists) throw new Error(`Не знайдено competitions/${compId}`);

      const d = doc.data() || {};

      const startAt = d.schedule?.startAt?.toDate ? d.schedule.startAt.toDate() : null;
      const finishAt = d.schedule?.finishAt?.toDate ? d.schedule.finishAt.toDate() : null;

      const reg = d.registration || {};
      const pay = d.payment || {};

      const kind = String(d.kind || "").toLowerCase() ||
        ((d.type === "season") ? "tour" : "teams");

      const lakeId = d.lake?.id || d.lakeId || "";
      const lakeSource = d.lake?.source || (String(lakeId).startsWith("custom:") ? "custom" : "catalog");
      const lakeCustomName = (lakeSource === "custom") ? (d.lake?.name || "") : "";

      applyForm({
        type: d.type || ((kind === "tour") ? "season" : "oneoff"),
        kind,
        yearStr: String(d.seasonYear || d.year || ""),
        seasonYear: d.seasonYear || d.year || null,
        name: d.name || "",
        format: d.format || "classic",

        lakeId: (lakeSource === "catalog") ? lakeId : "",
        lakeCustomName: lakeCustomName,

        startAtLocal: startAt ? toDateTimeLocalValue(startAt) : "",
        finishAtLocal: finishAt ? toDateTimeLocalValue(finishAt) : "",

        stagesCount: d.stagesCount || 3,
        hasFinal: !!d.hasFinal,

        regMode: reg.mode || "auto",
        payEnabled: pay.enabled !== false,
        manualOpen: reg.openDate || "",
        manualClose: reg.closeDate || "",

        price: (pay.price === 0 || pay.price) ? pay.price : null,
        currency: pay.currency || "UAH",
        payDetails: pay.details || ""
      });

      // enforce kind restrictions in UI
      enforceFormatForKind(getKind());

      // activate format + deserialize engine
      await activateFormat((inpFormat?.value || d.format || "classic"), { deserializeData: (d.engine || {}) });

      setSeasonVisibility();
      updateDurationUI();
      updateRegUI();
      saveDraftNow();

      setStatus("Завантажено ✅");
      setDebug("");
    }catch(e){
      setStatus("Помилка завантаження ❌");
      setDebug(e?.message || String(e));
    }
  }

  // ------------------------------------------------------------
  // Save
  // ------------------------------------------------------------
  async function saveCompetition(editingCompId){
    const form = collectForm();

    // enforce UI before validate (so it doesn't surprise)
    enforceFormatForKind(form.kind);

    // refresh format after possible enforce
    form.format = String(inpFormat?.value || form.format || "classic").toLowerCase();

    validate(form);

    // format-specific validate/serialize
    let formatExtra = {};
    if(activeFormat && typeof activeFormat.validate === "function"){
      activeFormat.validate({ $, format: String(form.format || "").toLowerCase() });
    }
    if(activeFormat && typeof activeFormat.serialize === "function"){
      formatExtra = activeFormat.serialize({ $, format: String(form.format || "").toLowerCase() }) || {};
    }

    const compId = editingCompId || compIdFrom(form.kind, form.yearStr, form.name);

    const lakeSnap = await getLakeSnapshot(form.lakeInput);
    const regBlock = computeRegistrationBlock(form);

    const mins = diffMinutes(form.startDt, form.finishDt);
    const durationHours = (mins !== null) ? (mins/60) : null;

    const ref = db.collection("competitions").doc(compId);
    const snap = await ref.get();

    // ✅ RULE: tournament-year is unique
    if(!editingCompId && form.kind === "tour" && snap.exists){
      throw new Error(`Турнір сезону ${form.yearStr} вже існує (ID: ${compId}). Перейди в "Редагувати" і відкрий його.`);
    }

    const data = {
      compId,

      // legacy but kept
      type: form.type, // "season" for tour, "oneoff" for events
      year: Number(form.yearStr), // legacy compatibility
      seasonYear: Number(form.yearStr), // canonical

      kind: form.kind, // canonical: tour|teams|solo
      name: form.name,
      brand: "STOLAR CARP",
      format: String(form.format || "classic").toLowerCase(),

      // engine (format-specific config)
      engine: {
        baseFormat: String(form.format || "classic").toLowerCase(),
        ...formatExtra
      },

      lake: lakeSnap ? { id: lakeSnap.id, name: lakeSnap.name, source: lakeSnap.source || "catalog" } : null,

      schedule: {
        startAt: fb.firestore.Timestamp.fromDate(form.startDt),
        finishAt: fb.firestore.Timestamp.fromDate(form.finishDt),
        durationHours: (durationHours !== null) ? Number(durationHours.toFixed(2)) : null
      },

      // only meaningful for tour
      stagesCount: form.kind === "tour" ? Number(form.stagesCount) : 1,
      hasFinal: form.kind === "tour" ? !!form.hasFinal : false,

      registration: {
        mode: regBlock.mode,
        openDate: regBlock.openDate || "",
        closeDate: regBlock.closeDate || ""
      },

      payment: {
        enabled: !!form.payEnabled,
        price: (form.price === 0 || form.price) ? form.price : null,
        currency: (form.currency || "UAH").toUpperCase(),
        details: form.payDetails || ""
      },

      updatedAt: fb.firestore.FieldValue.serverTimestamp()
    };

    if(!snap.exists){
      data.createdAt = fb.firestore.FieldValue.serverTimestamp();
    }

    await ref.set(data, { merge:true });

    saveDraftNow();
    return compId;
  }

  // --- Make active
  async function makeActive(compId){
    await db.collection("settings").doc("app").set({
      activeCompetitionId: compId,
      updatedAt: fb.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  // --- Delete
  async function deleteCompetition(compId){
    const typed = prompt(`УВАГА! Видалення без відновлення.\nВведи точно ID змагання для підтвердження:\n\n${compId}`);
    if(typed !== compId) throw new Error("Видалення скасовано (ID не співпав).");

    try{
      const s = await db.collection("settings").doc("app").get();
      const activeId = s.exists ? ((s.data()||{}).activeCompetitionId || "") : "";
      if(activeId === compId){
        await db.collection("settings").doc("app").set({
          activeCompetitionId: "",
          updatedAt: fb.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
      }
    }catch(_){}

    await db.collection("competitions").doc(compId).delete();
  }

  // ------------------------------------------------------------
  // Bind UI
  // ------------------------------------------------------------
  function bindUI(){
    if(tabCreate) tabCreate.onclick = ()=> gotoMode("create");
    if(tabEdit) tabEdit.onclick = ()=> gotoMode("edit");

    // If legacy inpType exists, we map it:
    // season -> kind=tour ; oneoff -> kind based on format (solo/teams)
    if(inpType){
      inpType.addEventListener("change", async ()=>{
        if(inpType.value === "season"){
          if(inpKind) inpKind.value = "tour";
        }else{
          // oneoff
          if(inpKind){
            const fmt = String(inpFormat?.value || "classic").toLowerCase();
            inpKind.value = (fmt === "stalker-solo") ? "solo" : "teams";
          }
        }
        enforceFormatForKind(getKind());
        await activateFormat(inpFormat?.value || "classic");
        setSeasonVisibility();
        updateRegUI();
        saveDraftNow();
      });
    }

    if(inpKind){
      inpKind.addEventListener("change", async ()=>{
        enforceFormatForKind(getKind());
        await activateFormat(inpFormat?.value || "classic");
        setSeasonVisibility();
        updateRegUI();
        saveDraftNow();
      });
    }

    if(inpFormat){
      inpFormat.addEventListener("change", async ()=>{
        // keep restrictions by kind
        enforceFormatForKind(getKind());
        await activateFormat(inpFormat.value);
        saveDraftNow();
      });
    }

    // Inputs
    [
      inpYear, inpName, inpLake, inpLakeCustom,
      inpStartAt, inpFinishAt,
      inpStagesCount, inpHasFinal,
      inpRegMode, inpPayEnabled, inpRegOpen, inpRegClose,
      inpPrice, inpCurrency, inpPayDetails
    ].forEach(el=>{
      if(!el) return;
      el.addEventListener("change", ()=>{
        updateDurationUI();
        updateRegUI();
        saveDraftNow();
      });
      el.addEventListener("input", ()=>{
        updateDurationUI();
        updateRegUI();
        saveDraftNow();
      });
    });

    if(btnResetDraft){
      btnResetDraft.onclick = async ()=>{
        clearDraft();

        if(inpKind) inpKind.value = "tour";
        if(inpType) inpType.value = "season";

        if(inpYear) inpYear.value = "";
        if(inpName) inpName.value = "";
        if(inpFormat) inpFormat.value = "classic";

        if(inpLake) inpLake.value = "";
        if(inpLakeCustom) inpLakeCustom.value = "";

        if(inpStartAt) inpStartAt.value = "";
        if(inpFinishAt) inpFinishAt.value = "";

        if(inpStagesCount) inpStagesCount.value = "3";
        if(inpHasFinal) inpHasFinal.value = "yes";

        if(inpRegMode) inpRegMode.value = "auto";
        if(inpPayEnabled) inpPayEnabled.value = "yes";
        if(inpRegOpen) inpRegOpen.value = "";
        if(inpRegClose) inpRegClose.value = "";
        if(inpPrice) inpPrice.value = "";
        if(inpCurrency) inpCurrency.value = "UAH";
        if(inpPayDetails) inpPayDetails.value = "";

        enforceFormatForKind(getKind());
        await activateFormat(inpFormat?.value || "classic");

        setSeasonVisibility();
        updateDurationUI();
        updateRegUI();
        setMsg(`<span class="ok">✅ Чернетку скинуто</span>`);
      };
    }

    if(btnReloadList){
      btnReloadList.onclick = async ()=>{
        if(editPickerMsg) editPickerMsg.textContent = "Оновлення…";
        await loadCompetitionsList();
        if(editPickerMsg) editPickerMsg.textContent = "";
      };
    }

    if(selCompetition){
      selCompetition.onchange = async ()=>{
        const id = selCompetition.value;
        if(!id) return;
        await loadCompetition(id);
      };
    }

    if(btnSave){
      btnSave.onclick = async ()=>{
        setMsg(`<span class="muted">Збереження…</span>`);
        try{
          const editingId = (isEditMode && selCompetition && selCompetition.value) ? selCompetition.value : "";
          const compId = await saveCompetition(editingId || "");
          setMsg(`<span class="ok">✅ Збережено:</span> ${esc(compId)}`);
          setStatus("Збережено ✅");
        }catch(e){
          setMsg(`<span class="err">❌</span> ${esc(e?.message || String(e))}`);
          setStatus("Помилка ❌");
          setDebug(e?.message || String(e));
        }
      };
    }

    if(btnMakeActive){
      btnMakeActive.onclick = async ()=>{
        setMsg(`<span class="muted">Зробити активним…</span>`);
        try{
          const editingId = (isEditMode && selCompetition && selCompetition.value) ? selCompetition.value : "";
          let compId = editingId;

          if(!compId){
            compId = await saveCompetition("");
          }

          await makeActive(compId);
          setMsg(`<span class="ok">✅ Активне:</span> ${esc(compId)}`);
        }catch(e){
          setMsg(`<span class="err">❌</span> ${esc(e?.message || String(e))}`);
        }
      };
    }

    if(btnDelete){
      btnDelete.onclick = async ()=>{
        try{
          if(!isEditMode) throw new Error("Видалення доступне тільки в режимі редагування.");
          const compId = selCompetition?.value || "";
          if(!compId) throw new Error("Вибери змагання для видалення.");
          setMsg(`<span class="muted">Видаляю…</span>`);
          await deleteCompetition(compId);
          setMsg(`<span class="ok">✅ Видалено:</span> ${esc(compId)}`);
          await loadCompetitionsList();
          clearDraft();
        }catch(e){
          setMsg(`<span class="err">❌</span> ${esc(e?.message || String(e))}`);
        }
      };
    }
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  async function init(){
    try{
      await waitForFirebase();
      auth = window.scAuth;
      db   = window.scDb;
      fb   = getFirebaseCompat();
      if(!fb || !fb.firestore) throw new Error("Firebase compat (firebase) не доступний. Перевір підключення firebase-*-compat.js.");
    }catch(e){
      setStatus("Firebase не запустився ❌");
      setDebug(e?.message || String(e));
      show(gate);
      hide(app);
      return;
    }

    bindUI();

    auth.onAuthStateChanged(async (user)=>{
      if(!user){
        setStatus("Нема сесії (увійди в admin.html)");
        setDebug("");
        show(gate);
        hide(app);
        return;
      }

      const ok = await requireAdmin(user);
      if(!ok){
        setStatus("Доступ заборонено ❌");
        setDebug("Цей акаунт не має ролі admin (users/{uid}.role).");
        show(gate);
        hide(app);
        return;
      }

      hide(gate);
      show(app);
      setStatus(isEditMode ? "Режим: Редагування" : "Режим: Створення");
      setDebug("");

      setActiveTab(isEditMode);

      await loadLakes();

      // default kind mapping (if no inpKind)
      if(inpType && !inpKind){
        // nothing to do, fallback works
      }else{
        // if inpKind exists and empty -> set default tour
        if(inpKind && !inpKind.value) inpKind.value = "tour";
      }

      const draft = getDraft();
      if(draft && !isEditMode){
        applyForm(draft);

        // enforce restrictions after apply
        enforceFormatForKind(getKind());

        await activateFormat((inpFormat?.value || draft.format || "classic"), { deserializeData: (draft.engine || {}) });
        setStatus("Чернетку відновлено ✅");
      }else{
        enforceFormatForKind(getKind());
        await activateFormat((inpFormat && inpFormat.value) ? inpFormat.value : "classic");
      }

      setSeasonVisibility();
      updateDurationUI();
      updateRegUI();

      if(isEditMode){
        await loadCompetitionsList();
        const pre = url.searchParams.get("compId");
        if(pre){
          selCompetition.value = pre;
          await loadCompetition(pre);
        }
      }
    });
  }

  window.addEventListener("error", (e)=>{
    setStatus("Помилка JS ❌");
    setDebug(e?.message || "Помилка");
  });

  window.addEventListener("unhandledrejection", (e)=>{
    setStatus("Помилка Promise ❌");
    setDebug(e?.reason?.message || String(e?.reason || "Promise error"));
  });

  init();
})();

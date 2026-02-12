// assets/js/admin-create.js
// STOLAR CARP • admin-create (Create/Edit competitions)
// ✅ НІЯКОГО другого логіну: беремо існуючу сесію з admin.html
// ✅ Перевірка доступу: users/{uid}.role === "admin"
// ✅ Мінімум читань: lakes (1 раз), competitions (тільки в edit), settings/app (1 раз)
// ✅ Старт/фініш = datetime-local → зберігаємо Timestamp (UTC)
// ✅ Тривалість рахуємо в UI автоматично
// ✅ Реєстрація: auto (−28/−14) або manual (date/date)
// ✅ Чернетка: localStorage

(function(){
  "use strict";

  const DRAFT_KEY = "sc_admin_create_draft_v1";
  const $ = (id)=>document.getElementById(id);

  const setStatus = (t)=>{ const e=$("createStatus"); if(e) e.textContent=t; };
  const setDebug  = (t)=>{ const e=$("createDebug");  if(e) e.textContent=t||""; };
  const setMsg    = (html)=>{ const e=$("createMsg"); if(e) e.innerHTML = html || ""; };

  function show(el){ el && el.classList.remove("hidden"); }
  function hide(el){ el && el.classList.add("hidden"); }

  function esc(s){
    return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }

  async function waitForFirebase(){
    for(let i=0;i<140;i++){
      if(window.scAuth && window.scDb && window.firebase) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb. Перевір assets/js/firebase-init.js.");
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

  // Fields
  const inpType = $("inpType");
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

  // Buttons
  const btnSave = $("btnSave");
  const btnMakeActive = $("btnMakeActive");
  const btnResetDraft = $("btnResetDraft");
  const btnDelete = $("btnDelete");

  // Edit picker
  const selCompetition = $("selCompetition");
  const btnReloadList = $("btnReloadList");
  const editPickerMsg = $("editPickerMsg");

  // --- Helpers: Draft
  function getDraft(){ try{ return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); }catch{ return null; } }
  function setDraft(data){ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); }catch{} }
  function clearDraft(){ try{ localStorage.removeItem(DRAFT_KEY); }catch{} }

  // --- Helpers: Date/time
  // datetime-local value: "YYYY-MM-DDTHH:mm"
  function parseLocalDateTime(v){
    const s = (v||"").trim();
    if(!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return null;
    const y = +m[1], mo = +m[2]-1, d = +m[3], h = +m[4], mi = +m[5];
    // Це локальний час браузера → конвертуємо в Date (локальний), а в Firestore пишемо Timestamp
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

  // Рахуємо по UTC 12:00, щоб не плавало
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

  // Беремо дату старту з datetime-local → YYYY-MM-DD
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

  // --- Load lakes (for dropdown)
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

  // --- Load competitions list (edit)
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
      return { id: doc.id, year: d.year||0, name: d.name||doc.id, active: doc.id === activeId };
    });

    items.sort((a,b)=> (b.year-a.year) || (a.name||"").localeCompare(b.name||"","uk"));

    if(!items.length){
      selCompetition.innerHTML = `<option value="">Нема змагань</option>`;
      return;
    }

    selCompetition.innerHTML = `<option value="">— вибери змагання —</option>` + items.map(it=>{
      const label = `${it.active ? "✅ " : ""}${it.id} — ${it.name}`;
      return `<option value="${esc(it.id)}">${esc(label)}</option>`;
    }).join("");
  }

  // --- Form state
  function setSeasonVisibility(){
    const type = (inpType?.value || "season");
    if(seasonOnly){
      if(type === "season") show(seasonOnly);
      else hide(seasonOnly);
    }
  }

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
      inpRegOpen.disabled = false;
      inpRegClose.disabled = false;
      regPreview.innerHTML = `Реєстрація: <b>MANUAL</b> (${esc(normDate(inpRegOpen.value)||"—")} → ${esc(normDate(inpRegClose.value)||"—")})`;
      return;
    }

    // auto
    inpRegOpen.disabled = true;
    inpRegClose.disabled = true;

    if(!startD){
      regPreview.textContent = "Реєстрація: —";
      return;
    }
    const o = regOpenFromStartDate(startD);
    const c = regCloseFromStartDate(startD);
    regPreview.innerHTML = `Реєстрація: <b>${o}</b> → <b>${c}</b>`;
  }

  function collectForm(){
    const type = (inpType?.value || "season");
    const yearStr = (inpYear?.value || "").trim();
    const name = (inpName?.value || "").trim();
    const format = (inpFormat?.value || "classic");

    const lakeId = (inpLake?.value || "").trim();

    const startDt = parseLocalDateTime(inpStartAt?.value || "");
    const finishDt = parseLocalDateTime(inpFinishAt?.value || "");

    const stagesCount = (type === "season") ? Number(inpStagesCount?.value || 3) : 1;
    const hasFinal = (type === "season") ? ((inpHasFinal?.value || "yes") === "yes") : false;

    const regMode = (inpRegMode?.value || "auto");
    const payEnabled = (inpPayEnabled?.value || "yes") === "yes";

    const manualOpen = normDate(inpRegOpen?.value || "");
    const manualClose = normDate(inpRegClose?.value || "");

    const priceRaw = (inpPrice?.value || "").trim();
    const price = priceRaw ? Number(String(priceRaw).replace(",", ".")) : null;
    const currency = (inpCurrency?.value || "UAH").trim().toUpperCase();
    const payDetails = (inpPayDetails?.value || "").trim();

    return {
      type,
      yearStr,
      name,
      format,
      lakeId,
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

    if(inpType) inpType.value = data.type || "season";
    if(inpYear) inpYear.value = data.yearStr || data.year || "";
    if(inpName) inpName.value = data.name || "";
    if(inpFormat) inpFormat.value = data.format || "classic";

    if(inpLake) inpLake.value = data.lakeId || "";

    // schedule
    if(inpStartAt) inpStartAt.value = data.startAtLocal || "";
    if(inpFinishAt) inpFinishAt.value = data.finishAtLocal || "";

    // season
    if(inpStagesCount) inpStagesCount.value = String(data.stagesCount || 3);
    if(inpHasFinal) inpHasFinal.value = (data.hasFinal ? "yes" : (data.hasFinal === false ? "no" : (data.inpHasFinal || "yes")));

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
    const draft = {
      type: d.type,
      yearStr: d.yearStr,
      name: d.name,
      format: d.format,
      lakeId: d.lakeId,
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
      ts: Date.now()
    };
    setDraft(draft);
  }

  function compIdFrom(type, yearStr, name){
    if(type === "season") return `season-${yearStr}`;
    const slug = (name||"event")
      .toLowerCase()
      .replace(/[^a-z0-9а-яіїєґ]+/gi,"-")
      .replace(/-+/g,"-")
      .replace(/^-|-$/g,"");
    return `oneoff-${yearStr}-${slug || "event"}`;
  }

  // --- Validation
  function validate(form){
    if(!/^\d{4}$/.test(form.yearStr)) throw new Error("Вкажи рік (4 цифри), наприклад 2026.");
    if(!form.name) throw new Error("Вкажи назву змагання.");
    if(!form.lakeId) throw new Error("Вибери водойму.");

    if(!form.startDt) throw new Error("Заповни старт (дата + година).");
    if(!form.finishDt) throw new Error("Заповни фініш (дата + година).");
    if(form.finishDt.getTime() <= form.startDt.getTime()) throw new Error("Фініш має бути після старту.");

    if(form.regMode === "manual"){
      if(form.manualOpen && !form.manualClose) throw new Error("Manual: заповни дату закриття реєстрації.");
      if(!form.manualOpen && form.manualClose) throw new Error("Manual: заповни дату відкриття реєстрації.");
    }

    // pay
    if(form.payEnabled){
      // дозволяємо без внеску (якщо захочеш “пізніше”), але реквізити корисно мати
      if(form.price !== null && !Number.isFinite(form.price)) throw new Error("Внесок має бути числом.");
    }
  }

  // --- Firestore mappers
  async function getLakeSnapshot(lakeId){
    if(!lakeId) return null;
    try{
      const doc = await db.collection("lakes").doc(lakeId).get();
      if(!doc.exists) return { id: lakeId, name: lakeId };
      const d = doc.data() || {};
      return { id: lakeId, name: d.name || lakeId };
    }catch(_){
      return { id: lakeId, name: lakeId };
    }
  }

  function computeRegistrationBlock(form){
    const startD = startDateOnly(); // YYYY-MM-DD from current UI (same as form.startDt)
    if(form.regMode === "manual"){
      return {
        mode: "manual",
        openDate: form.manualOpen || "",
        closeDate: form.manualClose || ""
      };
    }
    return {
      mode: "auto",
      openDate: startD ? regOpenFromStartDate(startD) : "",
      closeDate: startD ? regCloseFromStartDate(startD) : ""
    };
  }

  // --- Load selected competition into form (edit)
  async function loadCompetition(compId){
    if(!compId) return;

    setMsg("");
    setStatus("Завантаження змагання…");
    try{
      const doc = await db.collection("competitions").doc(compId).get();
      if(!doc.exists) throw new Error(`Не знайдено competitions/${compId}`);

      const d = doc.data() || {};

      // schedule Timestamp -> Date
      const startAt = d.schedule?.startAt?.toDate ? d.schedule.startAt.toDate() : null;
      const finishAt = d.schedule?.finishAt?.toDate ? d.schedule.finishAt.toDate() : null;

      const reg = d.registration || {};
      const pay = d.payment || {};

      applyForm({
        type: d.type || "season",
        yearStr: String(d.year || ""),
        name: d.name || "",
        format: d.format || "classic",
        lakeId: d.lake?.id || d.lakeId || "",
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

  // --- Save competition
  async function saveCompetition(editingCompId){
    const form = collectForm();
    validate(form);

    const compId = editingCompId || compIdFrom(form.type, form.yearStr, form.name);

    const lakeSnap = await getLakeSnapshot(form.lakeId);

    const regBlock = computeRegistrationBlock(form);

    // Duration
    const mins = diffMinutes(form.startDt, form.finishDt);
    const durationHours = mins ? (mins/60) : null;

    const ref = db.collection("competitions").doc(compId);
    const snap = await ref.get();

    const data = {
      compId,
      type: form.type,
      year: Number(form.yearStr),
      name: form.name,
      brand: "STOLAR CARP",
      format: form.format,

      lake: lakeSnap ? { id: lakeSnap.id, name: lakeSnap.name } : { id: form.lakeId, name: form.lakeId },

      schedule: {
        startAt: fb.firestore.Timestamp.fromDate(form.startDt),
        finishAt: fb.firestore.Timestamp.fromDate(form.finishDt),
        durationHours: durationHours ? Number(durationHours.toFixed(2)) : null
      },

      stagesCount: form.type === "season" ? Number(form.stagesCount) : 1,
      hasFinal: form.type === "season" ? !!form.hasFinal : false,

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

    // якщо було активним — знімаємо
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

  // --- Bind UI events
  function bindUI(){
    if(tabCreate) tabCreate.onclick = ()=> gotoMode("create");
    if(tabEdit) tabEdit.onclick = ()=> gotoMode("edit");

    if(inpType) inpType.addEventListener("change", ()=>{
      setSeasonVisibility();
      saveDraftNow();
    });

    [
      inpYear, inpName, inpFormat, inpLake,
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
      btnResetDraft.onclick = ()=>{
        clearDraft();
        // мінімальний reset (без фантазій)
        if(inpType) inpType.value = "season";
        if(inpYear) inpYear.value = "";
        if(inpName) inpName.value = "";
        if(inpFormat) inpFormat.value = "classic";
        if(inpLake) inpLake.value = "";
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
          const compId = editingId || compIdFrom(inpType.value, (inpYear.value||"").trim(), (inpName.value||"").trim());
          if(!compId) throw new Error("Нема ID. Заповни тип/рік/назву.");
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
          // після видалення — оновити список
          await loadCompetitionsList();
          // очистити форму
          clearDraft();
        }catch(e){
          setMsg(`<span class="err">❌</span> ${esc(e?.message || String(e))}`);
        }
      };
    }
  }

  // --- Init
  async function init(){
    try{
      await waitForFirebase();
      auth = window.scAuth;
      db   = window.scDb;
      fb   = window.firebase;
    }catch(e){
      setStatus("Firebase не запустився ❌");
      setDebug(e?.message || String(e));
      show(gate);
      hide(app);
      return;
    }

    bindUI();

    // Auth gate
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

      // allowed
      hide(gate);
      show(app);
      setStatus(isEditMode ? "Режим: Редагування" : "Режим: Створення");
      setDebug("");

      // tabs state
      setActiveTab(isEditMode);

      // load lakes once
      await loadLakes();

      // restore draft (create mode only; в edit ми завантажимо по вибору)
      const draft = getDraft();
      if(draft && !isEditMode){
        applyForm(draft);
        setStatus("Чернетку відновлено ✅");
      }

      // set initial UI
      setSeasonVisibility();
      updateDurationUI();
      updateRegUI();

      // edit mode: load list
      if(isEditMode){
        await loadCompetitionsList();
        // якщо URL має compId=...
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

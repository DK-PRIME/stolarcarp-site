// assets/js/admin.js
// STOLAR CARP • Admin panel (Create/Edit competitions)
// ✅ moved out of admin.html
// ✅ stage-N: manual regOpen/regClose toggle + dates (anytime)
// ✅ currency + price + payment requisites per event
// ✅ keeps Final автоматичним (28/14) або без мануалу (за замовчуванням)

(function(){
  "use strict";

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const DRAFT_KEY = "sc_admin_create_draft_v5"; // bump version
  const DEFAULT_TZ_NOTE = "12:00 Київ";

  const $ = (id)=>document.getElementById(id);

  const setStatus = (t)=>{ const e=$("adminStatus"); if(e) e.textContent=t; };
  const setDebug  = (t)=>{ const e=$("adminDebug");  if(e) e.textContent=t||""; };

  function show(el){ el && el.classList.remove("hidden"); }
  function hide(el){ el && el.classList.add("hidden"); }

  function esc(s){
    return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }

  function normDate(v){
    const s = (v||"").trim();
    if(!s) return "";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    return s;
  }

  // UTC 12:00 щоб не плавало по часових
  function addDays(dateStr, days){
    const [y,m,d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth()+1).padStart(2,"0");
    const dd = String(dt.getUTCDate()).padStart(2,"0");
    return `${yy}-${mm}-${dd}`;
  }
  function regOpenFromStart(startDate){ return startDate ? addDays(startDate, -28) : ""; }
  function regCloseFromStart(startDate){ return startDate ? addDays(startDate, -14) : ""; }

  // ---- Firebase wait ----
  async function waitForFirebase(){
    for(let i=0;i<140;i++){
      if(window.scAuth && window.scDb && window.firebase) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb. Перевір assets/js/firebase-init.js.");
  }

  let auth=null, db=null;

  // ---- UI refs ----
  const adminLogin = $("adminLogin");
  const adminApp   = $("adminApp");
  const modCreate  = $("modCreate");
  const modEdit    = $("modEdit");

  function openModule(name){
    hide(modCreate); hide(modEdit);
    if(name==="create") show(modCreate);
    if(name==="edit") show(modEdit);
  }

  // ---- Event card rendering ----
  function renderEventBlock(key, title, isFinal=false){
    const badge = isFinal
      ? `<span class="badge badge--final">ФІНАЛ</span>`
      : `<span class="badge">${esc(key)}</span>`;

    // manual only for stage-N (not final, not oneoff default) — але ти просив саме "ЕтапиN без фіналу"
    const allowManualReg = (!isFinal && /^stage-\d+$/i.test(String(key)));

    return `
      <div class="win-card" data-ev="${esc(key)}" data-final="${isFinal ? "1" : "0"}">
        <div class="win-title">
          <span>${esc(title)}</span>
          ${badge}
        </div>

        <div class="grid2">
          <div>
            <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Старт (дата)</div>
            <input type="date" data-start />
          </div>
          <div>
            <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Фініш (дата)</div>
            <input type="date" data-finish />
          </div>
        </div>

        <div class="hr"></div>

        <div class="grid2">
          <div>
            <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Сума внеску</div>
            <input inputmode="decimal" placeholder="Напр. 3500" data-price />
          </div>
          <div>
            <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Валюта</div>
            <select data-currency>
              <option value="UAH" selected>UAH</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="PLN">PLN</option>
            </select>
          </div>
        </div>

        <div style="margin-top:10px;">
          <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Реквізити для оплати (текст)</div>
          <textarea data-payDetails rows="3"
            style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.35);
                   background:rgba(2,6,23,.55);color:#e5e7eb;outline:none;resize:vertical;"
            placeholder="Напр. IBAN / Номер карти / Призначення платежу..."></textarea>
        </div>

        <div class="hr"></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" data-payEnabled />
            <span class="muted">Оплата активна</span>
          </label>

          ${allowManualReg ? `
          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" data-manualReg />
            <span class="muted">Manual відкриття/закриття реєстрації</span>
          </label>
          ` : `
          <span class="muted" style="opacity:.8;">(Manual реєстрація: тільки для stage-N)</span>
          `}
        </div>

        <div class="grid2" style="margin-top:10px; ${allowManualReg ? "" : "opacity:.65;"}">
          <div>
            <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Відкриття реєстрації (дата)</div>
            <input type="date" data-regopen ${allowManualReg ? "" : "disabled"} />
          </div>
          <div>
            <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Закриття реєстрації (дата)</div>
            <input type="date" data-regclose ${allowManualReg ? "" : "disabled"} />
          </div>
        </div>

        <div class="note" data-preview style="margin-top:10px;">Реєстрація: —</div>
      </div>
    `;
  }

  function readEventsFrom(container){
    const res = [];
    container.querySelectorAll("[data-ev]").forEach(card=>{
      const key = card.getAttribute("data-ev");
      const isFinal = card.getAttribute("data-final") === "1";

      const startDate  = normDate(card.querySelector("[data-start]")?.value || "");
      const finishDate = normDate(card.querySelector("[data-finish]")?.value || "");

      const payEnabled = !!card.querySelector("[data-payEnabled]")?.checked;
      const priceRaw = (card.querySelector("[data-price]")?.value || "").trim();
      const price = priceRaw ? Number(String(priceRaw).replace(",", ".")) : null;
      const currency = (card.querySelector("[data-currency]")?.value || "UAH").trim().toUpperCase();
      const payDetails = (card.querySelector("[data-payDetails]")?.value || "").trim();

      const manualRegEnabled = !!card.querySelector("[data-manualReg]")?.checked;
      const manualRegOpenDate  = normDate(card.querySelector("[data-regopen]")?.value || "");
      const manualRegCloseDate = normDate(card.querySelector("[data-regclose]")?.value || "");

      res.push({
        key,
        isFinal,
        startDate,
        finishDate,
        payEnabled,
        price: (price === null || Number.isFinite(price)) ? price : null,
        currency: currency || "UAH",
        payDetails,
        manualRegEnabled,
        manualRegOpenDate,
        manualRegCloseDate
      });
    });
    return res;
  }

  function fillEventsInto(container, events){
    const map = new Map((events||[]).map(e=>[e.key,e]));
    container.querySelectorAll("[data-ev]").forEach(card=>{
      const key = card.getAttribute("data-ev");
      const e = map.get(key) || {};

      const iS = card.querySelector("[data-start]");
      const iF = card.querySelector("[data-finish]");
      if(iS) iS.value = e.startDate || "";
      if(iF) iF.value = e.finishDate || "";

      const payEnabled = card.querySelector("[data-payEnabled]");
      if(payEnabled) payEnabled.checked = !!e.payEnabled;

      const price = card.querySelector("[data-price]");
      if(price) price.value = (e.price === 0 || e.price) ? String(e.price) : "";

      const currency = card.querySelector("[data-currency]");
      if(currency) currency.value = (e.currency || "UAH").toUpperCase();

      const payDetails = card.querySelector("[data-payDetails]");
      if(payDetails) payDetails.value = e.payDetails || "";

      const manual = card.querySelector("[data-manualReg]");
      if(manual) manual.checked = !!e.manualRegEnabled;

      const ro = card.querySelector("[data-regopen]");
      const rc = card.querySelector("[data-regclose]");
      if(ro) ro.value = e.manualRegOpenDate || "";
      if(rc) rc.value = e.manualRegCloseDate || "";

      // enable/disable regopen/regclose based on manual checkbox + allowManualReg
      applyManualToggle(card);
    });

    refreshPreviews(container);
  }

  function isAllowManualForCard(card){
    const key = card.getAttribute("data-ev") || "";
    const isFinal = card.getAttribute("data-final") === "1";
    return (!isFinal && /^stage-\d+$/i.test(String(key)));
  }

  function applyManualToggle(card){
    const allow = isAllowManualForCard(card);
    const manual = card.querySelector("[data-manualReg]");
    const ro = card.querySelector("[data-regopen]");
    const rc = card.querySelector("[data-regclose]");
    if(!ro || !rc) return;

    if(!allow){
      ro.disabled = true;
      rc.disabled = true;
      return;
    }

    const on = !!manual?.checked;
    ro.disabled = !on;
    rc.disabled = !on;

    // якщо щойно увімкнули manual і поля пусті — лишаємо пустими (бо "коли завгодно")
    // якщо вимкнули manual — чистимо manual дати, щоб не плутало
    if(!on){
      ro.value = "";
      rc.value = "";
    }
  }

  function refreshPreviews(container){
    container.querySelectorAll("[data-ev]").forEach(card=>{
      const start = normDate(card.querySelector("[data-start]")?.value || "");
      const prev  = card.querySelector("[data-preview]");
      if(!prev) return;

      const allowManual = isAllowManualForCard(card);
      const manualOn = !!card.querySelector("[data-manualReg]")?.checked;

      if(allowManual && manualOn){
        const ro = normDate(card.querySelector("[data-regopen]")?.value || "");
        const rc = normDate(card.querySelector("[data-regclose]")?.value || "");
        if(!ro && !rc){
          prev.innerHTML = `Реєстрація: <b>MANUAL</b> (дати не задані)`;
          return;
        }
        prev.innerHTML = `Реєстрація: <b>${esc(ro||"—")}</b> → <b>${esc(rc||"—")}</b> (${DEFAULT_TZ_NOTE})`;
        return;
      }

      // default авто по старту
      if(!start){
        prev.textContent = "Реєстрація: —";
        return;
      }
      const o = regOpenFromStart(start);
      const c = regCloseFromStart(start);
      prev.innerHTML = `Реєстрація: <b>${o}</b> → <b>${c}</b> (${DEFAULT_TZ_NOTE})`;
    });
  }

  function hookPreviewAndDraft(container, onChange){
    // dates + inputs
    const handler = ()=>{
      // manual toggles
      container.querySelectorAll("[data-ev]").forEach(card=>applyManualToggle(card));
      refreshPreviews(container);
      onChange && onChange();
    };

    container.querySelectorAll("input, select, textarea").forEach(inp=>{
      inp.addEventListener("change", handler);
      inp.addEventListener("input", handler);
    });

    // initial apply
    handler();
  }

  function buildEventBlocksInto(container, {type, stagesCount, hasFinal}, keepExisting=true){
    const prev = (keepExisting && container) ? readEventsFrom(container) : [];

    const blocks = [];
    const count = (type==="season") ? Number(stagesCount||3) : 1;

    for(let i=1;i<=count;i++){
      blocks.push(renderEventBlock(`stage-${i}`, `Етап ${i}`, false));
    }
    if(type==="season" && hasFinal==="yes"){
      blocks.push(renderEventBlock("final", "Фінал", true));
    }

    container.innerHTML = blocks.join("");

    // повертаємо введені значення назад
    if(prev.length) fillEventsInto(container, prev);
    refreshPreviews(container);
  }

  // ---- Draft ----
  function getDraft(){ try{ return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); }catch{ return null; } }
  function setDraft(data){ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); }catch{} }
  function clearDraft(){ try{ localStorage.removeItem(DRAFT_KEY); }catch{} }

  function collectCreateState(){
    const wrap = $("eventWindowsWrap");
    return {
      type: $("inpType")?.value || "season",
      year: ($("inpYear")?.value || "").trim(),
      name: ($("inpName")?.value || "").trim(),
      stagesCount: Number($("inpStagesCount")?.value || 3),
      hasFinal: $("inpHasFinal")?.value || "yes",
      events: wrap ? readEventsFrom(wrap) : [],
      ts: Date.now()
    };
  }
  function applyCreateState(state){
    if(!state) return;
    $("inpType").value = state.type || "season";
    $("inpYear").value = state.year || "";
    $("inpName").value = state.name || "";
    $("inpStagesCount").value = String(state.stagesCount || 3);
    $("inpHasFinal").value = state.hasFinal || "yes";
  }

  function compIdFrom(type, year, name){
    if(type==="season") return `season-${year}`;
    const slug = (name||"event")
      .toLowerCase()
      .replace(/[^a-z0-9а-яіїєґ]+/gi,"-")
      .replace(/-+/g,"-")
      .replace(/^-|-$/g,"");
    return `oneoff-${year}-${slug || "event"}`;
  }

  function validateEvents(eventsRaw){
    // валідація дат старт/фініш
    eventsRaw.forEach(ev=>{
      if(ev.startDate && !ev.finishDate) throw new Error(`Заповни фініш для ${ev.key}.`);
      if(!ev.startDate && ev.finishDate) throw new Error(`Заповни старт для ${ev.key}.`);

      // якщо manualRegEnabled → можна будь-які дати, але якщо одну ввели — краще щоб була друга
      if(ev.manualRegEnabled){
        if(ev.manualRegOpenDate && !ev.manualRegCloseDate) throw new Error(`Manual: заповни закриття реєстрації для ${ev.key}.`);
        if(!ev.manualRegOpenDate && ev.manualRegCloseDate) throw new Error(`Manual: заповни відкриття реєстрації для ${ev.key}.`);
      }
    });
  }

  function computeRegWindow(ev){
    // stage-N manual, else auto-by-start
    const allowManual = (!ev.isFinal && /^stage-\d+$/i.test(String(ev.key)));
    if(allowManual && ev.manualRegEnabled){
      return {
        regMode: "manual",
        regOpenDate: ev.manualRegOpenDate || "",
        regCloseDate: ev.manualRegCloseDate || ""
      };
    }
    return {
      regMode: "auto",
      regOpenDate: ev.startDate ? regOpenFromStart(ev.startDate) : "",
      regCloseDate: ev.startDate ? regCloseFromStart(ev.startDate) : ""
    };
  }

  async function init(){
    // Firebase init
    try{
      await waitForFirebase();
      auth = window.scAuth;
      db   = window.scDb;
    }catch(e){
      setStatus("Firebase не запустився ❌");
      setDebug(e.message || String(e));
      show(adminLogin);
      return;
    }

    // login button
    $("btnAdminLogin").onclick = async ()=>{
      const email = ($("admEmail").value || "").trim();
      const pass  = ($("admPass").value || "").trim();
      const msg   = $("adminLoginMsg");
      if(!email || !pass){ msg.textContent="Введи email і пароль."; return; }
      msg.textContent="Вхід…";
      try{
        await auth.signInWithEmailAndPassword(email, pass);
      }catch(e){
        msg.textContent = e?.message || "Помилка входу";
      }
    };

    // create ui build
    const syncCreateUI = ()=>{
      const type = $("inpType").value;
      const seasonOnly = $("seasonOnly");
      if(type==="season") show(seasonOnly); else hide(seasonOnly);

      const wrap = $("eventWindowsWrap");
      const stagesCount = Number($("inpStagesCount")?.value || 3);
      const hasFinal = $("inpHasFinal")?.value || "yes";

      buildEventBlocksInto(wrap, {type, stagesCount, hasFinal}, true);
      hookPreviewAndDraft(wrap, ()=> setDraft(collectCreateState()));
    };

    ["inpType","inpYear","inpName","inpStagesCount","inpHasFinal"].forEach(id=>{
      const el = $(id);
      if(!el) return;
      el.addEventListener("change", ()=> setDraft(collectCreateState()));
      el.addEventListener("input", ()=> setDraft(collectCreateState()));
    });

    $("inpType").onchange = syncCreateUI;
    $("inpStagesCount").onchange = syncCreateUI;
    $("inpHasFinal").onchange = syncCreateUI;

    // first render
    syncCreateUI();

    // restore draft
    const draft = getDraft();
    if(draft){
      applyCreateState(draft);
      syncCreateUI();
      fillEventsInto($("eventWindowsWrap"), draft.events || []);
      setStatus("Чернетку відновлено ✅");
    }

    $("btnResetDraft").onclick = ()=>{
      clearDraft();
      $("inpType").value = "season";
      $("inpYear").value = "";
      $("inpName").value = "";
      $("inpStagesCount").value = "3";
      $("inpHasFinal").value = "yes";
      syncCreateUI();
      $("createMsg").innerHTML = `<span class="ok">✅ Чернетку скинуто</span>`;
    };

    // modules
    $("btnOpenCreate").onclick = ()=> openModule("create");
    $("btnOpenEdit").onclick = async ()=>{
      openModule("edit");
      await loadCompetitionsToSelect();
    };
    $("btnReloadList").onclick = async ()=>{
      $("editMsg").textContent="Оновлення…";
      await loadCompetitionsToSelect();
      $("editMsg").textContent="";
    };
    $("selCompetition").onchange = async ()=>{ await loadSelectedCompetitionIntoEditor(); };

    // SAVE competition
    $("btnSaveCompetition").onclick = async ()=>{
      const msg = $("createMsg");
      msg.className="muted";
      msg.textContent="Збереження…";

      try{
        const type = $("inpType").value; // season|oneoff
        const year = ($("inpYear").value || "").trim();
        const name = ($("inpName").value || "").trim();
        if(!/^\d{4}$/.test(year)) throw new Error("Вкажи рік (4 цифри), наприклад 2026.");
        if(!name) throw new Error("Вкажи назву змагання.");

        const stagesCount = (type==="season") ? Number($("inpStagesCount").value) : 1;
        const hasFinal = (type==="season") ? ($("inpHasFinal").value === "yes") : false;

        const eventsRaw = readEventsFrom($("eventWindowsWrap"));
        validateEvents(eventsRaw);

        const events = eventsRaw.map(ev=>{
          const reg = computeRegWindow(ev);
          return {
            key: ev.key,
            startDate: ev.startDate || "",
            finishDate: ev.finishDate || "",

            // registration window:
            regMode: reg.regMode,               // "auto" | "manual"
            regOpenDate: reg.regOpenDate || "",
            regCloseDate: reg.regCloseDate || "",

            // payments:
            payEnabled: !!ev.payEnabled,
            price: (ev.price === 0 || ev.price) ? ev.price : null,
            currency: (ev.currency || "UAH").toUpperCase(),
            payDetails: ev.payDetails || ""
          };
        });

        const compId = compIdFrom(type, year, name);
        const data = {
          compId,
          type,
          year: Number(year),
          brand: "STOLAR CARP",
          name,
          stagesCount,
          hasFinal,
          events,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("competitions").doc(compId).set(data, { merge:true });

        setDraft(collectCreateState());
        msg.innerHTML = `<span class="ok">✅ Збережено:</span> ${esc(compId)}`;
      }catch(e){
        msg.innerHTML = `<span class="err">❌</span> ${esc(e.message || String(e))}`;
      }
    };

    // MAKE ACTIVE
    $("btnMakeActive").onclick = async ()=>{
      const msg = $("createMsg");
      msg.className="muted";
      msg.textContent="Збереження активного…";

      try{
        const type = $("inpType").value;
        const year = ($("inpYear").value || "").trim();
        const name = ($("inpName").value || "").trim();
        if(!/^\d{4}$/.test(year)) throw new Error("Вкажи рік (4 цифри).");
        if(!name) throw new Error("Вкажи назву змагання.");

        const compId = compIdFrom(type, year, name);

        await db.collection("settings").doc("app").set({
          activeCompetitionId: compId,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });

        msg.innerHTML = `<span class="ok">✅ Активне:</span> ${esc(compId)}`;
      }catch(e){
        msg.innerHTML = `<span class="err">❌</span> ${esc(e.message || String(e))}`;
      }
    };

    // EDIT save
    $("btnSaveEdit").onclick = async ()=>{
      const msg = $("editMsg");
      msg.className="muted";
      msg.textContent="Збереження…";

      try{
        const compId = $("selCompetition").value;
        if(!compId) throw new Error("Нема вибраного змагання.");

        const eventsRaw = readEventsFrom($("editWindowsWrap"));
        validateEvents(eventsRaw);

        const events = eventsRaw.map(ev=>{
          const reg = computeRegWindow(ev);
          return {
            key: ev.key,
            startDate: ev.startDate || "",
            finishDate: ev.finishDate || "",
            regMode: reg.regMode,
            regOpenDate: reg.regOpenDate || "",
            regCloseDate: reg.regCloseDate || "",
            payEnabled: !!ev.payEnabled,
            price: (ev.price === 0 || ev.price) ? ev.price : null,
            currency: (ev.currency || "UAH").toUpperCase(),
            payDetails: ev.payDetails || ""
          };
        });

        await db.collection("competitions").doc(compId).set({
          events,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });

        msg.innerHTML = `<span class="ok">✅ Збережено</span>`;
      }catch(e){
        msg.innerHTML = `<span class="err">❌</span> ${esc(e.message || String(e))}`;
      }
    };

    // --- DELETE competition (clean Firebase) ---
    async function deleteQueryInBatches(q){
      while(true){
        const snap = await q.limit(500).get();
        if(snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach(doc=>batch.delete(doc.ref));
        await batch.commit();
      }
    }

    $("btnDeleteCompetition").onclick = async ()=>{
      const msg = $("editMsg");
      msg.className = "muted";

      try{
        const compId = $("selCompetition").value;
        if(!compId) throw new Error("Нема вибраного змагання.");

        const typed = prompt(`УВАГА! Видалення без відновлення.\nВведи точно ID змагання для підтвердження:\n\n${compId}`);
        if(typed !== compId){
          msg.innerHTML = `<span class="err">❌</span> Видалення скасовано (ID не співпав).`;
          return;
        }

        msg.textContent = "Видаляю…";

        // якщо активне — прибираємо активність
        try{
          const s = await db.collection("settings").doc("app").get();
          const activeId = s.exists ? ((s.data()||{}).activeCompetitionId || "") : "";
          if(activeId === compId){
            await db.collection("settings").doc("app").set({
              activeCompetitionId: "",
              updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            }, { merge:true });
          }
        }catch(_){}

        // чистимо registrations (best-effort)
        try{ await deleteQueryInBatches(db.collection("registrations").where("competitionId","==",compId)); }catch(_){}
        try{ await deleteQueryInBatches(db.collection("registrations").where("seasonId","==",compId)); }catch(_){}

        await db.collection("competitions").doc(compId).delete();

        msg.innerHTML = `<span class="ok">✅</span> Видалено: ${esc(compId)}`;
        await loadCompetitionsToSelect();
      }catch(e){
        msg.innerHTML = `<span class="err">❌</span> ${esc(e.message || String(e))}`;
      }
    };

    // load select/editor
    async function loadCompetitionsToSelect(){
      const sel = $("selCompetition");
      const editor = $("editWindowsWrap");
      sel.innerHTML = `<option value="">Завантаження…</option>`;
      editor.innerHTML = "";

      let activeId = "";
      try{
        const s = await db.collection("settings").doc("app").get();
        if(s.exists) activeId = (s.data() || {}).activeCompetitionId || "";
      }catch(_){}

      const snap = await db.collection("competitions").get();
      const items = snap.docs.map(doc=>{
        const d = doc.data() || {};
        return { id: doc.id, year: d.year||0, name: d.name||doc.id };
      });

      items.sort((a,b)=> (b.year-a.year) || (a.name||"").localeCompare(b.name||"","uk"));

      if(!items.length){
        sel.innerHTML = `<option value="">Нема змагань. Створи спочатку.</option>`;
        return;
      }

      sel.innerHTML = items.map(it=>{
        const isActive = it.id === activeId;
        const label = `${isActive ? "✅ " : ""}${it.id} — ${it.name}`;
        return `<option value="${esc(it.id)}" ${isActive ? "selected" : ""}>${esc(label)}</option>`;
      }).join("");

      await loadSelectedCompetitionIntoEditor();
    }

    async function loadSelectedCompetitionIntoEditor(){
      const compId = $("selCompetition").value;
      const editor = $("editWindowsWrap");
      editor.innerHTML = "";
      if(!compId) return;

      const doc = await db.collection("competitions").doc(compId).get();
      if(!doc.exists){
        editor.innerHTML = `<div class="muted err">Не знайдено competitions/${esc(compId)}</div>`;
        return;
      }
      const d = doc.data() || {};
      const type = d.type || "season";
      const stagesCount = Number(d.stagesCount || 1);
      const hasFinal = !!d.hasFinal;

      buildEventBlocksInto(editor, {type, stagesCount, hasFinal: hasFinal ? "yes" : "no"}, false);
      fillEventsInto(editor, d.events || []);
      hookPreviewAndDraft(editor, null);
    }

    // AUTH STATE
    auth.onAuthStateChanged((user)=>{
      if(!user){
        setStatus("Потрібен вхід");
        setDebug("");
        show(adminLogin);
        hide(adminApp);
        openModule("create");
        return;
      }
      if(user.uid !== ADMIN_UID){
        setStatus("Доступ заборонено ❌");
        setDebug("Цей акаунт не є адміном.");
        show(adminLogin);
        hide(adminApp);
        return;
      }

      setStatus("Адмін-доступ ✅");
      setDebug("");
      hide(adminLogin);
      show(adminApp);
      openModule("create");
    });
  }

  // crash catcher
  window.addEventListener("error", (e)=>{
    setStatus("Помилка JS ❌");
    setDebug(e?.message || "Помилка");
    show(adminLogin);
  });
  window.addEventListener("unhandledrejection", (e)=>{
    setStatus("Помилка Promise ❌");
    setDebug(e?.reason?.message || String(e?.reason || "Promise error"));
    show(adminLogin);
  });

  init();
})();

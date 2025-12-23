// assets/js/draw_admin.js
// STOLAR CARP • Admin draw (table-like rows)
// ✅ loads competitions -> stageSelect
// ✅ loads ALL confirmed registrations once, filters locally
// ✅ unique sectors A1..C8
// ✅ per-row save: drawKey/drawZone/drawSector/bigFishTotal/drawAt
// ✅ keeps selected stage (localStorage restore)
// ✅ after save -> сортую по зонах/секторах
// ✅ після кожного збереження оновлює stageResults/{activeKey} (teams + bigFishTotal)

(function () {
  "use strict";

  const auth = window.scAuth;
  const db   = window.scDb;

  const stageSelect = document.getElementById("stageSelect");
  const qInput      = document.getElementById("q");
  const msgEl       = document.getElementById("msg");

  const drawRows    = document.getElementById("drawRows");
  const countInfo   = document.getElementById("countInfo");

  const LS_KEY_STAGE = "sc_draw_selected_stage_v1";

  if (!auth || !db || !window.firebase) {
    if (msgEl) msgEl.textContent = "Firebase init не завантажився.";
    return;
  }

  const SECTORS = (() => {
    const arr = [];
    ["A","B","C"].forEach(z => { for (let i=1;i<=8;i++) arr.push(`${z}${i}`); });
    return arr;
  })();

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const setMsg = (text, ok=true) => {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.style.color = text ? (ok ? "#8fe39a" : "#ff6c6c") : "";
  };

  function normStr(v){ return String(v ?? "").trim(); }

  function parseStageValue(v){
    const [compId, stageKeyRaw] = String(v||"").split("||");
    const comp = normStr(compId);
    const stage = normStr(stageKeyRaw);
    return { compId: comp, stageKey: stage ? stage : null };
  }

  function currentStageKey() {
    return stageSelect?.value || "";
  }

  async function requireAdmin(user){
    const snap = await db.collection("users").doc(user.uid).get();
    const role = (snap.exists ? (snap.data()||{}).role : "") || "";
    return role === "admin";
  }

  // robust getters
  function getCompIdFromReg(x){
    return x.competitionId || x.compId || x.competition || x.seasonId || x.season || x.eventCompetitionId || "";
  }
  function getStageIdFromReg(x){
    const v = x.stageId || x.stageKey || x.stage || x.eventId || x.eventKey || x.roundId || "";
    return normStr(v) || null;
  }

  // --- sort helpers (A1..C8) ---
  function parseSectorKey(drawKey){
    const s = normStr(drawKey).toUpperCase();
    if (!s) return null;
    const zone = s[0];
    const n = parseInt(s.slice(1), 10);
    if (!["A","B","C"].includes(zone) || !Number.isFinite(n)) return null;
    return { zone, n };
  }
  function zoneRank(z){
    if (z === "A") return 1;
    if (z === "B") return 2;
    if (z === "C") return 3;
    return 9;
  }
  function sortLikeWeighings(a, b){
    const sa = parseSectorKey(a.drawKey);
    const sb = parseSectorKey(b.drawKey);

    if (!!sa && !sb) return -1;
    if (!sa && !!sb) return 1;

    if (!sa && !sb) return (a.teamName||"").localeCompare(b.teamName||"", "uk");

    const zr = zoneRank(sa.zone) - zoneRank(sb.zone);
    if (zr) return zr;
    const nr = sa.n - sb.n;
    if (nr) return nr;
    return (a.teamName||"").localeCompare(b.teamName||"", "uk");
  }

  function fmtTimeNow(){
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    return `${hh}:${mm}:${ss}`;
  }

  // inject tiny CSS (feedback + button size)
  (function injectCSS(){
    const css = `
      .draw-row.is-saving { opacity:.85; }
      .draw-row.is-ok {
        border-color: rgba(143,227,154,.55) !important;
        box-shadow: 0 0 0 1px rgba(143,227,154,.25) inset;
      }
      .draw-row.is-err {
        border-color: rgba(255,108,108,.55) !important;
        box-shadow: 0 0 0 1px rgba(255,108,108,.20) inset;
      }
      .rowMsg.ok { color:#8fe39a !important; }
      .rowMsg.err{ color:#ff6c6c !important; }

      .sectorPick { max-width: 110px !important; padding: 8px 10px !important; }
      .btn-icon { width: 44px; height: 44px; display:flex; align-items:center; justify-content:center; padding:0 !important; border-radius:12px; }
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  })();

  function saveStageToLS(v){
    try { localStorage.setItem(LS_KEY_STAGE, String(v||"")); } catch {}
  }
  function loadStageFromLS(){
    try { return localStorage.getItem(LS_KEY_STAGE) || ""; } catch { return ""; }
  }
  function restoreStageIfPossible(){
    if (!stageSelect) return false;
    const saved = loadStageFromLS();
    if (!saved) return false;

    const opt = stageSelect.querySelector(`option[value="${CSS.escape(saved)}"]`);
    if (!opt) return false;

    stageSelect.value = saved;
    return true;
  }

  // stage label map
  let stageNameByKey = new Map();

  let isAdmin = false;

  let regsAllConfirmed = [];
  let regsFiltered = [];
  let usedSectorSet = new Set();

  async function loadStagesToSelect(){
    if (!stageSelect) return;

    const keep = stageSelect.value || loadStageFromLS();

    stageSelect.innerHTML = `<option value="">Завантаження…</option>`;
    stageNameByKey = new Map();
    const items = [];

    const snap = await db.collection("competitions").get();
    snap.forEach(docSnap => {
      const c = docSnap.data() || {};
      const compId = docSnap.id;

      const brand = c.brand || "STOLAR CARP";
      const year  = c.year || c.seasonYear || "";
      const compTitle = c.name || c.title || (year ? `Season ${year}` : compId);

      const eventsArr = Array.isArray(c.events) ? c.events : null;

      if (eventsArr && eventsArr.length) {
        eventsArr.forEach((ev, idx) => {
          const key = String(ev.key || ev.stageId || ev.id || `stage-${idx+1}`);
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx+1}`;
          const label = `${brand} · ${compTitle} — ${stageTitle}`;
          const value = `${compId}||${key}`;
          items.push({ value, label });
          stageNameByKey.set(value, label);
        });
      } else {
        const label = `${brand} · ${compTitle}`;
        const value = `${compId}||main`;
        items.push({ value, label });
        stageNameByKey.set(value, label);
      }
    });

    items.sort((a,b)=>a.label.localeCompare(b.label,"uk"));

    stageSelect.innerHTML =
      `<option value="">— Оберіть —</option>` +
      items.map(x => `<option value="${escapeHtml(x.value)}">${escapeHtml(x.label)}</option>`).join("");

    // restore previous selection if exists
    if (keep) {
      const opt = stageSelect.querySelector(`option[value="${CSS.escape(keep)}"]`);
      if (opt) stageSelect.value = keep;
    }
  }

  async function loadAllConfirmed(){
    setMsg("Завантаження підтверджених заявок…", true);

    const snap = await db.collection("registrations")
      .where("status","==","confirmed")
      .get();

    regsAllConfirmed = [];
    snap.forEach(d => {
      const x = d.data() || {};
      regsAllConfirmed.push({
        _id: d.id,
        teamName: x.teamName || x.team || x.name || "",
        captain: x.captain || x.captainName || "",
        phone: x.phone || x.captainPhone || "",
        createdAt: x.createdAt || null,

        compId: normStr(getCompIdFromReg(x)),
        stageId: getStageIdFromReg(x),

        drawKey: normStr(x.drawKey || ""),
        bigFishTotal: !!x.bigFishTotal
      });
    });

    setMsg("", true);
  }

  function rebuildUsedSectors(){
    usedSectorSet = new Set();
    regsFiltered.forEach(r => { if (normStr(r.drawKey)) usedSectorSet.add(normStr(r.drawKey)); });
  }

  function applyStageFilter(){
    const selVal = stageSelect?.value || "";
    const { compId, stageKey } = parseStageValue(selVal);

    if (!compId) {
      regsFiltered = [];
      usedSectorSet = new Set();
      render();
      if (countInfo) countInfo.textContent = "";
      return;
    }

    regsFiltered = regsAllConfirmed.filter(r => {
      if (normStr(r.compId) !== normStr(compId)) return false;
      if (stageKey && normStr(r.stageId) !== normStr(stageKey)) return false;
      if (!stageKey && r.stageId) return false;
      return true;
    });

    const q = normStr(qInput?.value || "").toLowerCase();
    if (q) {
      regsFiltered = regsFiltered.filter(r => {
        const t = `${r.teamName} ${r.phone} ${r.captain}`.toLowerCase();
        return t.includes(q);
      });
    }

    regsFiltered.sort(sortLikeWeighings);

    rebuildUsedSectors();
    render();

    if (countInfo) {
      const totalAll = regsAllConfirmed.length;
      const totalSel = regsFiltered.length;
      countInfo.textContent = `Для вибраного: ${totalSel} команд (з підтверджених ${totalAll})`;
    }
  }

  function sectorOptionsHTML(cur, docId){
    const current = normStr(cur);
    return `
      <select class="select sectorPick" data-docid="${escapeHtml(docId)}">
        <option value="">—</option>
        ${SECTORS.map(s=>{
          const taken = usedSectorSet.has(s) && s !== current;
          return `<option value="${s}" ${s===current?"selected":""} ${taken?"disabled":""}>
            ${s}${taken?" (зайнято)":""}
          </option>`;
        }).join("")}
      </select>
    `;
  }

  function rowHTML(r){
    const phone  = normStr(r.phone);
    return `
      <div class="draw-row" data-docid="${escapeHtml(r._id)}">
        <div>
          <div class="draw-team">${escapeHtml(r.teamName || "—")}</div>
          <div class="draw-sub">${escapeHtml(r.captain ? `Капітан: ${r.captain}` : "")}</div>
        </div>

        <div class="hide-sm">
          <div class="draw-sub">${escapeHtml(phone || "—")}</div>
        </div>

        <div>
          ${sectorOptionsHTML(r.drawKey, r._id)}
        </div>

        <div style="display:flex;align-items:center;justify-content:center;">
          <input type="checkbox" class="chk bigFishChk" ${r.bigFishTotal ? "checked":""} />
        </div>

        <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;">
          <button class="btn btn--ghost btn-icon saveBtn" type="button" title="Зберегти" aria-label="Зберегти">💾</button>
          <div class="draw-sub rowMsg"></div>
        </div>
      </div>
    `;
  }

  function render(){
    if (!drawRows) return;

    if (!regsFiltered.length) {
      drawRows.innerHTML = `<div class="muted" style="padding:12px 2px;">Нема команд для жеребкування.</div>`;
      return;
    }

    drawRows.innerHTML = regsFiltered.map(rowHTML).join("");
  }

  function showRowMsg(wrap, text, ok=true){
    const el = wrap.querySelector(".rowMsg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("ok", !!ok);
    el.classList.toggle("err", !ok);
  }

  function setRowState(wrap, state){
    wrap.classList.remove("is-saving","is-ok","is-err");
    if (state) wrap.classList.add(state);
  }

  function setBtnIcon(wrap, icon){
    const btn = wrap.querySelector(".saveBtn");
    if (!btn) return;
    if (icon === "saving") btn.textContent = "⏳";
    else if (icon === "ok") btn.textContent = "✅";
    else if (icon === "err") btn.textContent = "⚠️";
    else btn.textContent = "💾";
  }

  // === ПУБЛІКАЦІЯ В stageResults (LIVE) ===
  async function publishStageResultsTeams() {
    if (!isAdmin) return;

    const selVal = currentStageKey();
    if (!selVal) return;

    const { compId, stageKey } = parseStageValue(selVal);
    if (!compId) return;

    const docId = stageKey ? `${compId}||${stageKey}` : `${compId}||main`;

    const teams = regsFiltered.map(r => {
      const drawKey = normStr(r.drawKey);
      const zone    = drawKey ? drawKey[0] : null;
      const n       = drawKey ? parseInt(drawKey.slice(1), 10) : null;
      return {
        regId: r._id,
        teamName: r.teamName || "",
        drawKey: drawKey || null,
        drawZone: zone || null,
        drawSector: Number.isFinite(n) ? n : null,
        bigFishTotal: !!r.bigFishTotal
      };
    });

    const bigFishTotal = teams
      .filter(t => t.bigFishTotal)
      .map(t => ({
        regId: t.regId,
        team: t.teamName,
        big1Day: null,
        big2Day: null,
        maxBig: null,
        isMax: false
      }));

    const stageName = stageNameByKey.get(selVal) || "";

    await db.collection("stageResults").doc(docId).set({
      stageName,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      teams,
      bigFishTotal,
      // на всяк випадок — пусті структури для live_firebase
      zones: { A: [], B: [], C: [] },
      total: []
    }, { merge: true });

    setMsg("✅ Live оновлено", true);
    setTimeout(() => setMsg("", true), 1200);
  }

  // save per-row
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".saveBtn");
    if (!btn) return;

    const wrap = e.target.closest(".draw-row");
    if (!wrap) return;

    if (!isAdmin) {
      setRowState(wrap, "is-err");
      setBtnIcon(wrap, "err");
      showRowMsg(wrap, "Нема адмін-доступу.", false);
      setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1600);
      return;
    }

    saveStageToLS(stageSelect?.value || "");

    const docId = wrap.getAttribute("data-docid");
    const sectorVal = normStr(wrap.querySelector(".sectorPick")?.value || "");
    const bigFish = !!wrap.querySelector(".bigFishChk")?.checked;

    if (!sectorVal) {
      setRowState(wrap, "is-err");
      setBtnIcon(wrap, "err");
      showRowMsg(wrap, "Оберіть сектор.", false);
      setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1600);
      return;
    }

    if (usedSectorSet.has(sectorVal)) {
      const other = regsFiltered.find(r => normStr(r.drawKey) === sectorVal && r._id !== docId);
      if (other) {
        setRowState(wrap, "is-err");
        setBtnIcon(wrap, "err");
        showRowMsg(wrap, `Зайнято: ${other.teamName}`, false);
        setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1800);
        return;
      }
    }

    const zone = sectorVal[0];
    const sectorNum = parseInt(sectorVal.slice(1), 10);

    try {
      setRowState(wrap, "is-saving");
      setBtnIcon(wrap, "saving");
      showRowMsg(wrap, "Збереження…", true);

      await db.collection("registrations").doc(docId).update({
        drawKey: sectorVal,
        drawZone: zone,
        drawSector: Number.isFinite(sectorNum) ? sectorNum : null,
        bigFishTotal: bigFish,
        drawAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      const a = regsAllConfirmed.find(x=>x._id===docId);
      if (a) {
        a.drawKey = sectorVal;
        a.bigFishTotal = bigFish;
      }

      setRowState(wrap, "is-ok");
      setBtnIcon(wrap, "ok");
      showRowMsg(wrap, `Збережено ${fmtTimeNow()}`, true);

      // оновлюємо локальний список + Live
      applyStageFilter();
      await publishStageResultsTeams();

      setMsg("✅ Збережено", true);
      setTimeout(()=> setMsg("", true), 900);
    } catch (err) {
      console.error(err);
      setRowState(wrap, "is-err");
      setBtnIcon(wrap, "err");
      showRowMsg(wrap, "Помилка (Rules/доступ).", false);
      setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1800);
    }
  });

  async function boot(){
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setMsg("Увійдіть як адмін.", false);
        if (stageSelect) stageSelect.innerHTML = `<option value="">Увійдіть як адмін</option>`;
        regsAllConfirmed = [];
        regsFiltered = [];
        render();
        return;
      }

      try {
        isAdmin = await requireAdmin(user);
        if (!isAdmin) {
          setMsg("Доступ заборонено. Цей акаунт не є адміном.", false);
          regsAllConfirmed = [];
          regsFiltered = [];
          render();
          return;
        }

        await loadStagesToSelect();
        await loadAllConfirmed();

        const restored = restoreStageIfPossible();
        if (restored) {
          setMsg("✅ Етап відновлено", true);
          applyStageFilter();
          setTimeout(()=> setMsg("", true), 700);
        } else {
          setMsg("Оберіть змагання/етап.", true);
        }
      } catch (e) {
        console.error(e);
        setMsg("Помилка завантаження/перевірки адміна.", false);
      }
    });

    stageSelect?.addEventListener("change", () => {
      saveStageToLS(stageSelect.value || "");
      applyStageFilter();
    });

    qInput?.addEventListener("input", () => applyStageFilter());
  }

  boot();
})();

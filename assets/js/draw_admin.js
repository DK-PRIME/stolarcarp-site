// assets/js/draw_admin.js
// STOLAR CARP • Admin draw (table-like rows)
// - loads competitions -> stageSelect
// - loads ALL confirmed registrations once, filters locally
// - assign unique sectors A1..C8 (A/B/C x 1..8)
// - per-row save: drawKey/drawZone/drawSector/bigFishTotal/drawAt
(function () {
  "use strict";

  const auth = window.scAuth;
  const db   = window.scDb;

  const stageSelect = document.getElementById("stageSelect");
  const qInput      = document.getElementById("q");
  const msgEl       = document.getElementById("msg");

  const drawRows    = document.getElementById("drawRows");
  const countInfo   = document.getElementById("countInfo");

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

  async function requireAdmin(user){
    const snap = await db.collection("users").doc(user.uid).get();
    const role = (snap.exists ? (snap.data()||{}).role : "") || "";
    return role === "admin";
  }

  // robust getters (щоб не ламалось від назв полів)
  function getCompIdFromReg(x){
    return x.competitionId || x.compId || x.competition || x.seasonId || x.season || x.eventCompetitionId || "";
  }
  function getStageIdFromReg(x){
    const v = x.stageId || x.stageKey || x.stage || x.eventId || x.eventKey || x.roundId || "";
    return normStr(v) || null;
  }

  // stage label map: "compId||stageKey" -> label
  let stageNameByKey = new Map();

  let currentUser = null;
  let isAdmin = false;

  let regsAllConfirmed = []; // normalized
  let regsFiltered = [];
  let usedSectorSet = new Set();

  async function loadStagesToSelect(){
    if (!stageSelect) return;

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
        const value = `${compId}||`;
        items.push({ value, label });
        stageNameByKey.set(value, label);
      }
    });

    items.sort((a,b)=>a.label.localeCompare(b.label,"uk"));

    stageSelect.innerHTML =
      `<option value="">— Оберіть —</option>` +
      items.map(x => `<option value="${escapeHtml(x.value)}">${escapeHtml(x.label)}</option>`).join("");
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
        stageId: getStageIdFromReg(x), // null якщо нема

        drawKey: normStr(x.drawKey || ""),
        bigFishTotal: !!x.bigFishTotal
      });
    });

    setMsg("", true);
  }

  function applyStageFilter(){
    const { compId, stageKey } = parseStageValue(stageSelect?.value || "");

    if (!compId) {
      regsFiltered = [];
      usedSectorSet = new Set();
      render();
      if (countInfo) countInfo.textContent = "";
      return;
    }

    regsFiltered = regsAllConfirmed.filter(r => {
      if (normStr(r.compId) !== normStr(compId)) return false;
      if (stageKey) return normStr(r.stageId) === normStr(stageKey);
      // oneoff: приймаємо всіх по compId
      return true;
    });

    // пошук
    const q = normStr(qInput?.value || "").toLowerCase();
    if (q) {
      regsFiltered = regsFiltered.filter(r => {
        const t = `${r.teamName} ${r.phone} ${r.captain}`.toLowerCase();
        return t.includes(q);
      });
    }

    regsFiltered.sort((a,b)=>(a.teamName||"").localeCompare(b.teamName||"","uk"));

    usedSectorSet = new Set();
    regsFiltered.forEach(r => { if (r.drawKey) usedSectorSet.add(r.drawKey); });

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
      <select class="select sectorPick" data-docid="${escapeHtml(docId)}" style="max-width:160px;">
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
    const sector = normStr(r.drawKey);
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
          ${sectorOptionsHTML(sector, r._id)}
        </div>

        <div style="display:flex;align-items:center;gap:10px;">
          <input type="checkbox" class="chk bigFishChk" ${r.bigFishTotal ? "checked":""} />
        </div>

        <div>
          <button class="btn btn--ghost btn-mini saveBtn" type="button">Зберегти</button>
          <div class="draw-sub rowMsg" style="margin-top:6px;"></div>
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
    el.style.color = text ? (ok ? "#8fe39a" : "#ff6c6c") : "";
  }

  // save per-row
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".saveBtn");
    if (!btn) return;

    const wrap = e.target.closest(".draw-row");
    if (!wrap) return;

    if (!isAdmin) return showRowMsg(wrap, "Нема адмін-доступу.", false);

    const docId = wrap.getAttribute("data-docid");
    const sectorVal = normStr(wrap.querySelector(".sectorPick")?.value || "");
    const bigFish = !!wrap.querySelector(".bigFishChk")?.checked;

    if (!sectorVal) return showRowMsg(wrap, "Оберіть сектор (A1…C8).", false);

    // уникальність сектора
    if (usedSectorSet.has(sectorVal)) {
      const other = regsFiltered.find(r => r.drawKey === sectorVal && r._id !== docId);
      if (other) return showRowMsg(wrap, `Сектор ${sectorVal} вже зайнятий: ${other.teamName}`, false);
    }

    const zone = sectorVal[0];
    const sectorNum = parseInt(sectorVal.slice(1), 10);

    try {
      await db.collection("registrations").doc(docId).update({
        drawKey: sectorVal,
        drawZone: zone,
        drawSector: Number.isFinite(sectorNum) ? sectorNum : null,
        bigFishTotal: bigFish,
        drawAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      // локально оновлюємо
      const a = regsAllConfirmed.find(x=>x._id===docId);
      if (a) { a.drawKey = sectorVal; a.bigFishTotal = bigFish; }

      showRowMsg(wrap, "Збережено ✔", true);
      applyStageFilter();
    } catch (err) {
      console.error(err);
      showRowMsg(wrap, "Помилка збереження (Rules/доступ).", false);
    }
  });

  async function boot(){
    auth.onAuthStateChanged(async (user) => {
      currentUser = user || null;

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

        setMsg("Оберіть змагання/етап.", true);
      } catch (e) {
        console.error(e);
        setMsg("Помилка завантаження/перевірки адміна.", false);
      }
    });

    stageSelect?.addEventListener("change", () => applyStageFilter());
    qInput?.addEventListener("input", () => applyStageFilter());
  }

  boot();
})();

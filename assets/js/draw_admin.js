// assets/js/draw_admin.js
// STOLAR CARP • Admin draw (mobile-first cards)
// ✅ competitions -> stageSelect
// ✅ loads ALL confirmed registrations once, filters locally
// ✅ unique sectors A1..C8
// ✅ per-row save: drawKey/drawZone/drawSector/bigFishTotal/drawAt
// ✅ keeps selected stage (localStorage restore)
// ✅ after save -> sorts A..C + sector
// ✅ after each save -> updates stageResults/{activeKey} + settings/app.activeKey (LIVE)

(function () {
  "use strict";

  const auth = window.scAuth;
  const db   = window.scDb;

  const stageSelect = document.getElementById("stageSelect");
  const qInput      = document.getElementById("q");
  const msgEl       = document.getElementById("msg");

  const drawRows    = document.getElementById("drawRows");
  const countInfo   = document.getElementById("countInfo");

  const LS_KEY_STAGE = "sc_draw_selected_stage_v2";

  if (!auth || !db || !window.firebase) {
    if (msgEl) msgEl.textContent = "Firebase init не завантажився.";
    return;
  }

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const SECTORS = (() => {
    const arr = [];
    ["A","B","C"].forEach(z => { for (let i=1;i<=8;i++) arr.push(`${z}${i}`); });
    return arr;
  })();

  const esc = (s) =>
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

  function norm(v){ return String(v ?? "").trim(); }

  function parseStageValue(v){
    const [compId, stageKeyRaw] = String(v||"").split("||");
    const comp = norm(compId);
    const stage = norm(stageKeyRaw);
    return { compId: comp, stageKey: stage ? stage : null };
  }

  function currentStageValue(){
    return stageSelect?.value || "";
  }

  async function requireAdmin(user){
    if (!user) return false;
    if (user.uid === ADMIN_UID) return true;
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
    return norm(v) || null;
  }

  function parseSector(drawKey){
    const s = norm(drawKey).toUpperCase();
    if (!s) return null;
    const z = s[0];
    const n = parseInt(s.slice(1), 10);
    if (!["A","B","C"].includes(z) || !Number.isFinite(n)) return null;
    return { z, n };
  }
  function zoneRank(z){ return z==="A"?1 : z==="B"?2 : z==="C"?3 : 9; }
  function sortByDraw(a,b){
    const sa = parseSector(a.drawKey);
    const sb = parseSector(b.drawKey);

    if (!!sa && !sb) return -1;
    if (!sa && !!sb) return 1;

    if (!sa && !sb) return (a.teamName||"").localeCompare(b.teamName||"", "uk");

    const zr = zoneRank(sa.z) - zoneRank(sb.z);
    if (zr) return zr;
    const nr = sa.n - sb.n;
    if (nr) return nr;
    return (a.teamName||"").localeCompare(b.teamName||"", "uk");
  }

  function saveStageToLS(v){
    try { localStorage.setItem(LS_KEY_STAGE, String(v||"")); } catch {}
  }
  function loadStageFromLS(){
    try { return localStorage.getItem(LS_KEY_STAGE) || ""; } catch { return ""; }
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
      items.map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");

    if (keep) {
      // без CSS.escape для старих браузерів
      const opts = Array.from(stageSelect.options || []);
      const ok = opts.find(o => String(o.value) === String(keep));
      if (ok) stageSelect.value = keep;
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

        teamId: norm(x.teamId || ""),
        teamName: x.teamName || x.team || x.name || "",
        captain: x.captain || x.captainName || "",
        phone: x.phone || x.captainPhone || "",

        compId: norm(getCompIdFromReg(x)),
        stageId: getStageIdFromReg(x),

        drawKey: norm(x.drawKey || ""),
        bigFishTotal: !!x.bigFishTotal
      });
    });

    setMsg("", true);
  }

  function rebuildUsedSectors(){
    usedSectorSet = new Set();
    regsFiltered.forEach(r => { if (norm(r.drawKey)) usedSectorSet.add(norm(r.drawKey)); });
  }

  function applyStageFilter(){
    const selVal = currentStageValue();
    const { compId, stageKey } = parseStageValue(selVal);

    if (!compId) {
      regsFiltered = [];
      usedSectorSet = new Set();
      render();
      if (countInfo) countInfo.textContent = "";
      return;
    }

    regsFiltered = regsAllConfirmed.filter(r => {
      if (norm(r.compId) !== norm(compId)) return false;
      if (stageKey && norm(r.stageId) !== norm(stageKey)) return false;
      if (!stageKey && r.stageId) return false;
      return true;
    });

    const q = norm(qInput?.value || "").toLowerCase();
    if (q) {
      regsFiltered = regsFiltered.filter(r => {
        const t = `${r.teamName} ${r.phone} ${r.captain}`.toLowerCase();
        return t.includes(q);
      });
    }

    regsFiltered.sort(sortByDraw);

    rebuildUsedSectors();
    render();

    if (countInfo) {
      const totalAll = regsAllConfirmed.length;
      const totalSel = regsFiltered.length;
      countInfo.textContent = `Для вибраного: ${totalSel} команд (з підтверджених ${totalAll})`;
    }
  }

  function sectorOptionsHTML(cur, docId){
    const current = norm(cur);
    return `
      <select class="select sectorPick" data-docid="${esc(docId)}">
        <option value="">— Оберіть сектор —</option>
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
  return `
    <div class="row" data-docid="${r._id}">
      <div class="team">
        <div class="name">${esc(r.teamName || "—")}</div>
      </div>

      <div class="row-actions">
        ${sectorOptionsHTML(r.drawKey, r._id)}
        <input type="checkbox" class="chk bigFishChk" ${r.bigFishTotal ? "checked" : ""}>
        <button class="saveBtn" type="button">💾</button>
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

    drawRows.innerHTML = `<div class="draw-wrap">${regsFiltered.map(rowHTML).join("")}</div>`;
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
    btn.textContent =
      icon === "saving" ? "⏳" :
      icon === "ok"     ? "✅" :
      icon === "err"    ? "⚠️" :
      "💾";
  }

  function fmtTimeNow(){
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    return `${hh}:${mm}:${ss}`;
  }

  // === publish LIVE stageResults + settings/app ===
  async function publishStageResultsTeams(){
    if (!isAdmin) return;

    const selVal = currentStageValue();
    if (!selVal) return;

    const { compId, stageKey } = parseStageValue(selVal);
    if (!compId) return;

    const docId = stageKey ? `${compId}||${stageKey}` : `${compId}||main`;
    const stageName = stageNameByKey.get(selVal) || "";

    const teams = regsFiltered.map(r => {
      const drawKey = norm(r.drawKey);
      const zone    = drawKey ? drawKey[0] : null;
      const n       = drawKey ? parseInt(drawKey.slice(1), 10) : null;

      return {
        regId: r._id,
        teamId: norm(r.teamId || ""),
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
        teamId: t.teamId || null,
        team: t.teamName,
        big1Day: null,
        big2Day: null,
        maxBig: null,
        isMax: false
      }));

    const ts = window.firebase.firestore.FieldValue.serverTimestamp();

    await db.collection("stageResults").doc(docId).set({
      compId,
      stageKey: stageKey || null,
      stageName,
      updatedAt: ts,
      teams,
      bigFishTotal,
      zones: { A: [], B: [], C: [] },
      total: []
    }, { merge:true });

    await db.collection("settings").doc("app").set({
      activeKey: docId,
      activeCompetitionId: compId,
      activeStageId: stageKey || null,
      updatedAt: ts
    }, { merge:true });
  }

  // save per-row
  document.addEventListener("click", async (e)=>{
    const btn = e.target.closest(".saveBtn");
    if (!btn) return;

    const wrap = e.target.closest(".draw-row");
    if (!wrap) return;

    if (!isAdmin) {
      setRowState(wrap, "is-err");
      setBtnIcon(wrap, "err");
      showRowMsg(wrap, "Нема адмін-доступу", false);
      setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1400);
      return;
    }

    saveStageToLS(stageSelect?.value || "");

    const docId = wrap.getAttribute("data-docid");
    const sectorVal = norm(wrap.querySelector(".sectorPick")?.value || "");
    const bigFish = !!wrap.querySelector(".bigFishChk")?.checked;

    if (!sectorVal) {
      setRowState(wrap, "is-err");
      setBtnIcon(wrap, "err");
      showRowMsg(wrap, "Оберіть сектор", false);
      setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1400);
      return;
    }

    if (usedSectorSet.has(sectorVal)) {
      const other = regsFiltered.find(r => norm(r.drawKey) === sectorVal && r._id !== docId);
      if (other) {
        setRowState(wrap, "is-err");
        setBtnIcon(wrap, "err");
        showRowMsg(wrap, `Зайнято: ${other.teamName}`, false);
        setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1700);
        return;
      }
    }

    const zone = sectorVal[0];
    const sectorNum = parseInt(sectorVal.slice(1), 10);

    try{
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
      // ✅ MIRROR → public_participants (для participation / cabinet)
await db.collection("public_participants").doc(docId).set({
  drawKey: sectorVal,
  drawZone: zone,
  drawSector: Number.isFinite(sectorNum) ? sectorNum : null,
  bigFishTotal: bigFish,
  drawAt: window.firebase.firestore.FieldValue.serverTimestamp()
}, { merge: true });

      const a = regsAllConfirmed.find(x => x._id === docId);
      if (a) {
        a.drawKey = sectorVal;
        a.bigFishTotal = bigFish;
      }

      setRowState(wrap, "is-ok");
      setBtnIcon(wrap, "ok");
      showRowMsg(wrap, `Збережено ${fmtTimeNow()}`, true);

      applyStageFilter();
      await publishStageResultsTeams();

      setMsg("✅ Live оновлено", true);
      setTimeout(()=> setMsg("", true), 900);

    }catch(err){
      console.error(err);
      setRowState(wrap, "is-err");
      setBtnIcon(wrap, "err");
      showRowMsg(wrap, "Помилка (Rules/доступ)", false);
      setTimeout(()=>{ setRowState(wrap, null); setBtnIcon(wrap, "save"); }, 1700);
    }
  });

  async function boot(){
    auth.onAuthStateChanged(async (user)=>{
      if (!user) {
        setMsg("Увійдіть як адмін.", false);
        if (stageSelect) stageSelect.innerHTML = `<option value="">Увійдіть як адмін</option>`;
        regsAllConfirmed = [];
        regsFiltered = [];
        render();
        return;
      }

      try{
        isAdmin = await requireAdmin(user);
        if (!isAdmin) {
          setMsg("Доступ заборонено. Цей акаунт не адмін.", false);
          regsAllConfirmed = [];
          regsFiltered = [];
          render();
          return;
        }

        await loadStagesToSelect();
        await loadAllConfirmed();

        const saved = loadStageFromLS();
        if (saved) {
          const opts = Array.from(stageSelect.options || []);
          const ok = opts.find(o => String(o.value) === String(saved));
          if (ok) stageSelect.value = saved;
        }

        if (stageSelect?.value) {
          applyStageFilter();
          setMsg("", true);
        } else {
          setMsg("Оберіть змагання/етап.", true);
        }
      }catch(e){
        console.error(e);
        setMsg("Помилка завантаження/перевірки адміна.", false);
      }
    });

    stageSelect?.addEventListener("change", ()=>{
      saveStageToLS(stageSelect.value || "");
      applyStageFilter();
    });
    qInput?.addEventListener("input", ()=> applyStageFilter());
  }

  boot();
})();

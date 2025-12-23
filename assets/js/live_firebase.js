// assets/js/live_firebase.js
// STOLAR CARP • Live (Firebase)
// - reads active stage from settings/app
// - subscribes to stageResults doc (zones + total)
// - renders W1..W4 + totals + BIG

(function () {
  "use strict";

  const db = window.scDb;

  const stageEl    = document.getElementById("liveStageName");
  const zonesWrap  = document.getElementById("zonesContainer");
  const totalTbody = document.querySelector("#totalTable tbody");
  const loadingEl  = document.getElementById("liveLoading");
  const contentEl  = document.getElementById("liveContent");
  const errorEl    = document.getElementById("liveError");
  const updEl      = document.getElementById("liveUpdatedAt");

  if (!db || !window.firebase) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = "❌ Firebase init не завантажився.";
    }
    if (loadingEl) loadingEl.style.display = "none";
    return;
  }

  // ---------- helpers ----------
  function normStr(v){ return String(v ?? "").trim(); }

  function fmtKg(v){
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return n.toFixed(3);
  }

  function fmtCW(obj){
    const c = Number(obj?.c || 0);
    const kg = Number(obj?.kg || 0);
    if (!c && !kg) return "—";
    return `${c} / ${fmtKg(kg)}`;
  }

  function showError(text){
    if (errorEl){
      errorEl.style.display = "block";
      errorEl.textContent = text;
    }
    if (loadingEl) loadingEl.style.display = "none";
  }

  function setUpdatedAt(ts){
    if (!updEl) return;
    try {
      const d = ts?.toDate ? ts.toDate() : null;
      updEl.textContent = d ? `Оновлено: ${d.toLocaleString("uk-UA")}` : "Оновлено: —";
    } catch {
      updEl.textContent = "Оновлено: —";
    }
  }

  function zoneTableHTML(list, zoneLetter){
    if (!list || !list.length){
      return `
        <div class="live-zone card">
          <div class="live-zone-title">
            <h3 style="margin:0;">Зона ${zoneLetter}</h3>
            <span class="badge">немає даних</span>
          </div>
          <p class="form__hint">Результати для цієї зони ще не заповнені.</p>
        </div>
      `;
    }

    const rows = list.map(r => `
      <tr>
        <td>${r.placeZone ?? "—"}</td>
        <td class="team-col">${r.team ?? "—"}</td>
        <td>${fmtCW(r.w1)}</td>
        <td>${fmtCW(r.w2)}</td>
        <td>${fmtCW(r.w3)}</td>
        <td>${fmtCW(r.w4)}</td>
        <td><b>${Number(r.totalC || 0)} / ${fmtKg(r.totalKg)}</b></td>
        <td>${fmtKg(r.bigKg)}</td>
      </tr>
    `).join("");

    return `
      <div class="live-zone card">
        <div class="live-zone-title">
          <h3 style="margin:0;">Зона ${zoneLetter}</h3>
          <span class="badge badge--warn">команд: ${list.length}</span>
        </div>

        <div class="table-wrap" style="overflow-x:auto;">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>№</th>
                <th>Команда</th>
                <th>W1</th>
                <th>W2</th>
                <th>W3</th>
                <th>W4</th>
                <th>Разом</th>
                <th>BIG</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderZones(zones){
    const names = ["A","B","C"];
    zonesWrap.innerHTML = names.map(z => zoneTableHTML(zones?.[z] || [], z)).join("");
  }

  function renderTotal(total){
    if (!total || !total.length){
      totalTbody.innerHTML = `<tr><td colspan="9">Дані ще не заповнені.</td></tr>`;
      return;
    }

    totalTbody.innerHTML = total.map(r => `
      <tr>
        <td>${r.placeTotal ?? "—"}</td>
        <td class="team-col">${r.team ?? "—"}</td>
        <td>${r.zone ?? "—"}</td>
        <td>${fmtCW(r.w1)}</td>
        <td>${fmtCW(r.w2)}</td>
        <td>${fmtCW(r.w3)}</td>
        <td>${fmtCW(r.w4)}</td>
        <td><b>${Number(r.totalC || 0)} / ${fmtKg(r.totalKg)}</b></td>
        <td>${fmtKg(r.bigKg)}</td>
      </tr>
    `).join("");
  }

  // ---------- active stage reading ----------
  // We read settings/app and expect (any of):
  // - activeCompetitionId / activeCompId / competitionId
  // - activeStageId / activeStageKey / stageId / stageKey
  // If stage is empty -> one-off competition doc
  function parseActiveFromSettings(x){
    const compId =
      normStr(x?.activeCompetitionId) ||
      normStr(x?.activeCompId) ||
      normStr(x?.competitionId) ||
      normStr(x?.compId);

    const stageId =
      normStr(x?.activeStageId) ||
      normStr(x?.activeStageKey) ||
      normStr(x?.stageId) ||
      normStr(x?.stageKey) ||
      "";

    return { compId, stageId: stageId || "" };
  }

  async function findStageResultsDoc(compId, stageId){
    // try multiple docId formats to be robust
    const tries = [];
    if (compId && stageId) {
      tries.push(`${compId}__${stageId}`);
      tries.push(`${compId}_${stageId}`);
    }
    if (compId && !stageId) {
      tries.push(`${compId}__`);
      tries.push(`${compId}_`);
      tries.push(`${compId}`);
    }
    // also allow "compId__stageId" even if stageId empty
    if (compId) tries.push(`${compId}__${stageId}`);

    for (const id of tries) {
      const ref = db.collection("stageResults").doc(id);
      const snap = await ref.get();
      if (snap.exists) return { ref, id };
    }
    // fallback: return first expected ref (for onSnapshot)
    const fallbackId = (compId && stageId) ? `${compId}__${stageId}` : (compId ? `${compId}` : "");
    return { ref: db.collection("stageResults").doc(fallbackId), id: fallbackId };
  }

  let unsubSettings = null;
  let unsubResults = null;

  function subscribeToStage(compId, stageId){
    if (unsubResults) { try { unsubResults(); } catch {} unsubResults = null; }

    if (!compId) {
      showError("❌ Не задано активний етап у settings/app.");
      return;
    }

    findStageResultsDoc(compId, stageId).then(({ref}) => {
      unsubResults = ref.onSnapshot((snap) => {
        if (!snap.exists) {
          // no results yet
          if (stageEl) stageEl.textContent = "—";
          renderZones({A:[],B:[],C:[]});
          renderTotal([]);
          if (loadingEl) loadingEl.style.display = "none";
          if (contentEl) contentEl.style.display = "grid";
          setUpdatedAt(null);
          return;
        }

        const data = snap.data() || {};
        if (stageEl) stageEl.textContent = data.stageName || data.stage || "—";

        renderZones(data.zones || {A:[],B:[],C:[]});
        renderTotal(data.total || []);
        setUpdatedAt(data.updatedAt || data.updated || null);

        if (loadingEl) loadingEl.style.display = "none";
        if (contentEl) contentEl.style.display = "grid";
        if (errorEl) errorEl.style.display = "none";
      }, (err) => {
        console.error(err);
        showError("❌ Не вдалося підключити live-дані (stageResults).");
      });
    }).catch((e)=>{
      console.error(e);
      showError("❌ Помилка читання stageResults.");
    });
  }

  // ---------- boot ----------
  (function boot(){
    if (loadingEl) loadingEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
    if (errorEl) errorEl.style.display = "none";

    const settingsRef = db.collection("settings").doc("app");

    unsubSettings = settingsRef.onSnapshot((snap) => {
      const x = snap.exists ? (snap.data() || {}) : {};
      const { compId, stageId } = parseActiveFromSettings(x);

      // subscribe to correct stage
      subscribeToStage(compId, stageId);
    }, (err) => {
      console.error(err);
      showError("❌ Не вдалося прочитати settings/app.");
    });
  })();

})();

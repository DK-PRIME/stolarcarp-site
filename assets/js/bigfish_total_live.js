// assets/js/bigfish_total_live.js
// STOLAR CARP • BigFish Total (Firebase)
// - list participants from registrations where bigFishTotal == true
// - show BIG 1 day / BIG 2 day / MAX BIG if stageResults contains fields
//   (later judge/admin weighings will fill these fields)

(function(){
  "use strict";

  const db = window.scDb;

  const tbody   = document.querySelector("#bigFishTable tbody");
  const countEl = document.getElementById("bfCount");

  if (!db || !window.firebase || !tbody) return;

  function normStr(v){ return String(v ?? "").trim(); }

  function fmtKg(v){
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return n.toFixed(3);
  }

  // active from settings/app (same as live)
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
    if (compId) tries.push(`${compId}__${stageId}`);

    for (const id of tries) {
      const ref = db.collection("stageResults").doc(id);
      const snap = await ref.get();
      if (snap.exists) return { ref, id };
    }

    const fallbackId = (compId && stageId) ? `${compId}__${stageId}` : (compId ? `${compId}` : "");
    return { ref: db.collection("stageResults").doc(fallbackId), id: fallbackId };
  }

  // We will cache stageResults rows by teamName (or teamId)
  let resultsByTeam = new Map();

  function buildResultsMap(stageResultsData){
    resultsByTeam = new Map();

    const total = Array.isArray(stageResultsData?.total) ? stageResultsData.total : [];
    total.forEach(r => {
      const teamId = normStr(r.teamId);
      const teamName = normStr(r.team);

      // Optional fields for BigFish Total:
      // r.big1DayKg / r.big2DayKg / r.maxBigKg
      // (later we will write them when weighings are ready)
      resultsByTeam.set(teamId ? `id:${teamId}` : `name:${teamName}`, {
        team: teamName,
        big1: r.big1DayKg ?? r.big1 ?? null,
        big2: r.big2DayKg ?? r.big2 ?? null,
        max:  r.maxBigKg  ?? r.maxBig ?? null
      });
    });
  }

  function render(list){
    if (!Array.isArray(list) || !list.length){
      tbody.innerHTML = `<tr><td colspan="4">Поки що немає учасників BigFish Total.</td></tr>`;
      if (countEl) countEl.textContent = `Учасників: 0`;
      return;
    }

    // join with results if present
    const rows = list.map(p => {
      const key1 = p.teamId ? `id:${p.teamId}` : "";
      const key2 = `name:${p.teamName}`;

      const res = (key1 && resultsByTeam.get(key1)) || resultsByTeam.get(key2) || {};
      const b1 = fmtKg(res.big1);
      const b2 = fmtKg(res.big2);
      const mx = fmtKg(res.max);

      // highlight row if max exists and equals this team max (optional)
      const isMax = (mx !== "—") && (Number(res.max) > 0);

      return `
        <tr class="${isMax ? "bigfish-row--max" : ""}">
          <td>${p.teamName}</td>
          <td>${b1}</td>
          <td>${b2}</td>
          <td><strong>${mx}</strong>${isMax ? " 🏆" : ""}</td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = rows;
    if (countEl) countEl.textContent = `Учасників: ${list.length}`;
  }

  // Load participants (registrations bigFishTotal==true) for active comp/stage
  async function loadParticipants(compId, stageId){
    if (!compId){
      render([]);
      return;
    }

    // we try to filter by compId & stageId if those fields exist in registrations.
    // If stageId empty -> oneoff, we filter only by compId.
    let q = db.collection("registrations").where("bigFishTotal", "==", true);

    // Try common field names: competitionId + stageId
    // If your registrations uses different names, we’ll adjust later.
    q = q.where("competitionId", "==", compId);
    if (stageId) q = q.where("stageId", "==", stageId);

    const snap = await q.get();

    const list = [];
    snap.forEach(d => {
      const x = d.data() || {};
      list.push({
        teamId: normStr(x.teamId),
        teamName: normStr(x.teamName || x.team || x.name || "—")
      });
    });

    // sort by name
    list.sort((a,b)=>a.teamName.localeCompare(b.teamName,"uk"));
    render(list);
  }

  // subscriptions
  let unsubSettings = null;
  let unsubResults = null;

  function subscribeStageResults(compId, stageId){
    if (unsubResults) { try{unsubResults();}catch{} unsubResults=null; }

    if (!compId) {
      resultsByTeam = new Map();
      render([]);
      return;
    }

    findStageResultsDoc(compId, stageId).then(({ref})=>{
      unsubResults = ref.onSnapshot((snap)=>{
        const data = snap.exists ? (snap.data() || {}) : {};
        buildResultsMap(data);
        // participants are rendered by loadParticipants; this will refresh table cells once results appear
      });
    }).catch((e)=>{
      console.error(e);
      resultsByTeam = new Map();
    });
  }

  (function boot(){
    const settingsRef = db.collection("settings").doc("app");

    unsubSettings = settingsRef.onSnapshot(async (snap)=>{
      const x = snap.exists ? (snap.data() || {}) : {};
      const { compId, stageId } = parseActiveFromSettings(x);

      subscribeStageResults(compId, stageId);

      try {
        await loadParticipants(compId, stageId);
      } catch (e) {
        console.error(e);

        // Fallback: if your registrations doesn’t have stageId filter or uses other names
        // we show empty for now (we can adapt when you confirm exact fields)
        render([]);
      }
    }, (err)=>{
      console.error(err);
      render([]);
    });
  })();

})();

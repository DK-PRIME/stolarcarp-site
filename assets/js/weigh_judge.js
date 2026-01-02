// assets/js/weigh_judge.js
(function () {
  "use strict";

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const LS_KEY = "sc_judge_zone_v1";
  const MAX_W = 4;

  const $ = id => document.getElementById(id);

  const zoneTitle = $("zoneTitle");
  const statusEl  = $("status");
  const bindInfo  = $("bindInfo");
  const msgEl     = $("msg");
  const authPill  = $("authPill");

  const btnOpen   = $("btnOpen");
  const btnReset  = $("btnReset");
  const btnSaveHint = $("btnSaveHint");

  const weighCard = $("weighCard");
  const teamsBox  = $("teamsBox");
  const teamsCountEl = $("teamsCount");
  const curWEl = $("curW");
  const wMsgEl = $("wMsg");

  const wBtns = [
    { n:1, el:$("w1") },
    { n:2, el:$("w2") },
    { n:3, el:$("w3") },
    { n:4, el:$("w4") },
  ];

  let db, auth, me;
  let zone = "";
  let compId = "";
  let stageId = "";
  let activeKey = "";
  let currentW = 1;
  let viewW = 1;

  function readZone() {
    try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; }
  }
  function saveZone(z) {
    try { localStorage.setItem(LS_KEY, z); } catch {}
  }

  function setMsg(t, ok=true) {
    msgEl.textContent = t || "";
    msgEl.className = "muted " + (ok ? "ok":"err");
  }

  function updateWButtons() {
    curWEl.textContent = `W${currentW}`;
    wBtns.forEach(b=>{
      b.el.classList.toggle("isActive", b.n === viewW);
      b.el.disabled = b.n > currentW;
    });
  }

  function parseZoneFromURL() {
    const p = new URLSearchParams(location.search);
    const z = (p.get("zone")||"").toUpperCase();
    if(["A","B","C"].includes(z)) saveZone(z);
  }

  async function loadTeams() {
    const snap = await db.collection("registrations")
      .where("competitionId","==",compId)
      .where("stageId","==",stageId)
      .where("status","==","confirmed")
      .get();

    const rows = [];
    snap.forEach(d=>{
      const x = d.data()||{};
      const z = (x.drawZone || x.drawKey?.[0] || "").toUpperCase();
      if(z !== zone) return;

      rows.push({
        teamId: x.teamId,
        teamName: x.teamName,
        sector: x.drawSector || 0
      });
    });

    rows.sort((a,b)=>a.sector-b.sector);
    return rows;
  }

  function weighDocId(teamId,wNo){
    return `${compId}||${stageId}||W${wNo}||${teamId}`;
  }

  async function saveWeigh(team,wNo,weights){
    await db.collection("weighings").doc(weighDocId(team.teamId,wNo)).set({
      compId,
      stageId,
      weighNo:wNo,
      teamId:team.teamId,
      weights,
      zone,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  }

  async function renderTeams() {
    const teams = await loadTeams();
    teamsCountEl.textContent = `Команд: ${teams.length}`;
    if(!teams.length){
      teamsBox.innerHTML = "<div class='muted'>Нема команд у зоні</div>";
      return;
    }

    teamsBox.innerHTML = teams.map(t=>`
      <div class="teamRow">
        <b>${t.teamName}</b> (сектор ${t.sector})
        <div style="margin-top:8px">
          <input class="inp" placeholder="Вага, кг" data-team="${t.teamId}">
          <button class="btn btn--primary" data-save="${t.teamId}">Зберегти</button>
        </div>
      </div>
    `).join("");

    teamsBox.querySelectorAll("[data-save]").forEach(btn=>{
      btn.onclick = async ()=>{
        const teamId = btn.dataset.save;
        const inp = teamsBox.querySelector(`input[data-team="${teamId}"]`);
        const w = Number(String(inp.value).replace(",","."))||0;
        await saveWeigh(teams.find(x=>x.teamId===teamId),viewW,[w]);
        setMsg("Збережено",true);
      };
    });
  }

  async function openZone() {
    zone = readZone();
    if(!zone) return setMsg("Нема зони (?zone=A)",false);
    if(!activeKey) return setMsg("Нема активного етапу",false);

    zoneTitle.textContent = `Зона ${zone}`;
    weighCard.style.display = "block";
    await renderTeams();
  }

  async function init() {
    parseZoneFromURL();
    db = window.scDb;
    auth = window.scAuth;

    auth.onAuthStateChanged(async user=>{
      if(!user){
        authPill.textContent = "auth ❌";
        return;
      }
      me = user;
      authPill.textContent = "auth ✅";

      const appSnap = await db.collection("settings").doc("app").get();
      const app = appSnap.data()||{};
      compId = app.activeCompetitionId;
      stageId = app.activeStageId;
      activeKey = app.activeKey;

      btnOpen.onclick = openZone;
    });
  }

  init();
})();

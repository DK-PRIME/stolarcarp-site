(function(){
  const db = window.scDb;

  const stageSelect = document.getElementById("stageSelect");
  const teamsWrap   = document.getElementById("teamsWrap");
  const saveBtn     = document.getElementById("saveDraw");

  const sectors = [];
  ["A","B","C"].forEach(z=>{
    for(let i=1;i<=8;i++) sectors.push(`${z}${i}`);
  });

  let currentTeams = [];

  async function loadStages(){
    const snap = await db.collection("competitions").get();
    stageSelect.innerHTML = "";

    snap.forEach(doc=>{
      const c = doc.data();
      (c.events || []).forEach(ev=>{
        const opt = document.createElement("option");
        opt.value = `${doc.id}||${ev.key}`;
        opt.textContent = `${c.name} — ${ev.key}`;
        stageSelect.appendChild(opt);
      });
    });

    loadTeams();
  }

  async function loadTeams(){
    teamsWrap.innerHTML = "Завантаження…";
    const [compId, stageId] = stageSelect.value.split("||");

    const snap = await db.collection("registrations")
      .where("competitionId","==",compId)
      .where("stageId","==",stageId)
      .where("status","==","paid")
      .get();

    currentTeams = snap.docs.map(d=>({ id:d.id, ...d.data() }));

    renderTeams();
  }

  function renderTeams(){
    if(!currentTeams.length){
      teamsWrap.innerHTML = "Нема команд";
      return;
    }

    teamsWrap.innerHTML = currentTeams.map(t=>`
      <div class="row" style="align-items:center;margin-bottom:10px">
        <b>${t.teamName}</b>

        <select data-sector="${t.id}">
          <option value="">Сектор</option>
          ${sectors.map(s=>`<option value="${s}">${s}</option>`).join("")}
        </select>

        <select data-bf="${t.id}">
          <option value="">BigFish</option>
          <option value="yes">Так</option>
        </select>
      </div>
    `).join("");
  }

  saveBtn.onclick = async ()=>{
    const used = new Set();
    const [compId, stageId] = stageSelect.value.split("||");

    for(const t of currentTeams){
      const sector = document.querySelector(`[data-sector="${t.id}"]`).value;
      if(!sector) return alert("Не всі сектори вибрані");

      if(used.has(sector)) return alert(`Сектор ${sector} вже зайнятий`);
      used.add(sector);

      const bf = document.querySelector(`[data-bf="${t.id}"]`).value === "yes";

      await db.collection("draws")
        .doc(compId)
        .collection("stages")
        .doc(stageId)
        .collection("teams")
        .doc(t.teamId)
        .set({
          teamName: t.teamName,
          sector,
          zone: sector[0],
          bigFishTotal: bf,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    alert("✅ Жеребкування збережено");
  };

  stageSelect.onchange = loadTeams;
  loadStages();
})();

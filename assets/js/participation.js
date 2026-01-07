(function(){
  "use strict";

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
  function norm(v){ return String(v ?? "").trim(); }

  function isPaid(r){
    const s = norm(r.status).toLowerCase();
    return s === "confirmed" || s === "paid";
  }

  async function waitFirebase(){
    for(let i=0;i<120;i++){
      if(window.scDb) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firestore не готовий");
  }

  (async function init(){
    try{
      await waitFirebase();
      const db = window.scDb;

      const params = new URLSearchParams(location.search);
      const compId  = params.get("comp");
      const stageId = params.get("stage") || "main";

      if(!compId){
        $("msg").textContent = "❌ Не передано competitionId";
        return;
      }

      $("pageTitle").textContent = "Учасники змагання";
      $("pageSub").textContent = `competitionId: ${compId} • stage: ${stageId}`;

      const snap = await db.collection("registrations")
        .where("competitionId","==",compId)
        .where("stageId","==",stageId)
        .get();

      const rows = [];
      snap.forEach(doc=>{
        const r = doc.data() || {};
        rows.push({
          team: norm(r.teamName || "—"),
          paid: isPaid(r),
          captain: norm(r.captainName || r.captain || ""),
          phone: norm(r.phone || r.captainPhone || "")
        });
      });

      if(!rows.length){
        $("msg").textContent = "Нема заявок на це змагання";
        return;
      }

      rows.sort((a,b)=>{
        if(a.paid !== b.paid) return a.paid ? -1 : 1;
        return a.team.localeCompare(b.team,"uk");
      });

      $("teamsList").innerHTML = rows.map(r=>`
        <div class="partItem">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span class="lamp ${r.paid ? "lamp--green":"lamp--red"}"></span>
            <div>
              <div class="partTitle">${esc(r.team)}</div>
              <div class="partSub">${r.paid ? "Оплачено" : "Очікує оплату"}</div>
            </div>
          </div>
          <div class="partSub" style="text-align:right">
            ${esc(r.captain)}
            ${r.phone ? `<div>${esc(r.phone)}</div>` : ""}
          </div>
        </div>
      `).join("");

    }catch(e){
      console.error(e);
      $("msg").textContent = "❌ " + (e.message || e);
    }
  })();

})();

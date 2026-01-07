// assets/js/participation.js
(function(){
  "use strict";

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
  function norm(v){ return String(v ?? "").trim(); }

  function isPaidStatus(status){
    const s = norm(status).toLowerCase();
    return s === "confirmed" || s === "paid";
  }

  async function waitFirebase(maxMs = 12000){
    const t0 = Date.now();
    while(Date.now() - t0 < maxMs){
      if(window.scDb) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firestore не готовий (нема scDb)");
  }

  async function getCompetitionMeta(compId, stageId){
    const db = window.scDb;
    let title = "Змагання";
    let stageTitle = "";

    try{
      const cSnap = await db.collection("competitions").doc(compId).get();
      if(cSnap.exists){
        const c = cSnap.data() || {};
        title = c.name || c.title || title;

        const events = Array.isArray(c.events) ? c.events : [];
        const st = stageId || "main";
        const ev = events.find(e => String(e?.key || e?.stageId || e?.id || "").trim() === String(st).trim());
        stageTitle = (ev && (ev.title || ev.name || ev.label)) || "";
      }
    }catch{}

    return { title, stageTitle };
  }

  async function getMaxTeams(compId, stageId){
    const db = window.scDb;
    let maxTeams = 24;

    try{
      const cSnap = await db.collection("competitions").doc(compId).get();
      if(!cSnap.exists) return maxTeams;

      const c = cSnap.data() || {};
      const events = Array.isArray(c.events) ? c.events : [];
      const st = stageId || "main";

      const ev = events.find(e => String(e?.key || e?.stageId || e?.id || "").trim() === String(st).trim());

      const v = ev?.maxTeams ?? ev?.teamsLimit ?? c?.maxTeams ?? c?.teamsLimit ?? null;
      const n = typeof v === "number" ? v : parseInt(String(v||""),10);
      if(Number.isFinite(n) && n > 0) maxTeams = n;
    }catch{}

    return maxTeams;
  }

  function render(rows, maxTeams){
    const list = $("teamsList");
    const msg  = $("msg");
    if(!list) return;

    list.innerHTML = "";
    if(msg) msg.textContent = "";

    const main = rows.slice(0, maxTeams);
    const reserve = rows.slice(maxTeams);

    function rowHtml(idx, r){
      const paid = isPaidStatus(r.status);
      return `
        <div class="partItem" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="display:flex;gap:10px;align-items:center;min-width:0;">
            <span class="lamp ${paid ? "lamp--green":"lamp--red"}"></span>
            <div style="min-width:0;">
              <div class="partTitle" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${idx}. ${esc(r.teamName || "—")}
              </div>
              <div class="partSub">${paid ? "Оплачено" : "Очікується"}</div>
            </div>
          </div>
        </div>
      `;
    }

    if(main.length){
      list.innerHTML += `<div class="muted" style="margin-bottom:10px;">Учасники: ${main.length} / ${maxTeams}</div>`;
      list.innerHTML += main.map((r,i)=>rowHtml(i+1,r)).join("");
    } else {
      list.innerHTML = `<div class="muted">Нема заявок на це змагання</div>`;
      return;
    }

    if(reserve.length){
      list.innerHTML += `<div class="muted" style="margin:14px 0 10px;">Резерв: ${reserve.length}</div>`;
      list.innerHTML += reserve.map((r,i)=>rowHtml(maxTeams + i + 1, r)).join("");
    }
  }

  (async function init(){
    try{
      await waitFirebase();
      const db = window.scDb;

      const params = new URLSearchParams(location.search);
      const compId  = params.get("comp");
      const stageId = params.get("stage") || "main";

      if(!compId){
        if($("msg")) $("msg").textContent = "❌ Не передано competitionId";
        return;
      }

      const meta = await getCompetitionMeta(compId, stageId);
      const maxTeams = await getMaxTeams(compId, stageId);

      if($("pageTitle")) $("pageTitle").textContent = meta.stageTitle ? `${meta.title} · ${meta.stageTitle}` : meta.title;
      if($("pageSub")) $("pageSub").textContent = `Список заявок (тільки назви команд)`;

      if($("msg")) $("msg").textContent = "Завантаження списку…";

      // ✅ ЧИТАЄМО public_participants (як в правилах)
      // stageId може бути "main" або null (старі записи могли мати null)
      const rowsMap = new Map();

      // 1) stageId == stageId
      const snap1 = await db.collection("public_participants")
        .where("competitionId","==",compId)
        .where("stageId","==",stageId)
        .where("entryType","==","team")
        .get();

      snap1.forEach(doc=>{
        const r = doc.data() || {};
        const teamName = norm(r.teamName || "—");
        rowsMap.set(doc.id, {
          teamName,
          status: norm(r.status || "pending_payment")
        });
      });

      // 2) якщо stageId == "main" — добираємо ще stageId == null
      if(String(stageId) === "main"){
        const snap2 = await db.collection("public_participants")
          .where("competitionId","==",compId)
          .where("stageId","==",null)
          .where("entryType","==","team")
          .get();

        snap2.forEach(doc=>{
          if(rowsMap.has(doc.id)) return;
          const r = doc.data() || {};
          const teamName = norm(r.teamName || "—");
          rowsMap.set(doc.id, {
            teamName,
            status: norm(r.status || "pending_payment")
          });
        });
      }

      const rows = Array.from(rowsMap.values());

      rows.sort((a,b)=>{
        const ap = isPaidStatus(a.status);
        const bp = isPaidStatus(b.status);
        if(ap !== bp) return ap ? -1 : 1;
        return a.teamName.localeCompare(b.teamName,"uk");
      });

      if($("msg")) $("msg").textContent = "";
      render(rows, maxTeams);

    }catch(e){
      console.error(e);
      if($("msg")) $("msg").textContent = "❌ " + (e?.message || e);
    }
  })();
})();

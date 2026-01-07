// assets/js/participation.js
(function(){
  "use strict";

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
  function norm(v){ return String(v ?? "").trim(); }

  function isPaidStatus(status){
    const s = norm(status).toLowerCase();
    return s === "confirmed" || s === "paid" || s === "payment_confirmed";
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
        title = (c.name || c.title || title);

        const events = Array.isArray(c.events) ? c.events : [];
        const st = stageId || "main";
        const ev = events.find(e => String(e?.key || e?.stageId || e?.id || "").trim() === String(st).trim());
        stageTitle = (ev && (ev.title || ev.name || ev.label)) ? String(ev.title || ev.name || ev.label) : "";
      }
    }catch{}

    return { title: String(title || "Змагання").trim(), stageTitle: String(stageTitle || "").trim() };
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

  function rowHtml(idx, r){
    const paid = isPaidStatus(r.status);
    return `
      <div class="row">
        <span class="lamp ${paid ? "lamp--green":"lamp--red"}"></span>
        <span class="idx">${idx}.</span>
        <span class="name">${esc(r.teamName || "—")}</span>
        <span class="status ${paid ? "status--paid":"status--unpaid"}">${paid ? "Оплачено" : "Не оплачено"}</span>
      </div>
    `;
  }

  function render(rows, maxTeams){
    const list = $("teamsList");
    const msg  = $("msg");
    if(!list) return;

    list.innerHTML = "";
    if(msg) msg.textContent = "";

    const main = rows.slice(0, maxTeams);
    const reserve = rows.slice(maxTeams);

    if(!rows.length){
      list.innerHTML = `<div class="mutedCenter">Нема заявок на це змагання</div>`;
      return;
    }

    // лічильник
    list.innerHTML += `<div class="pageSub" style="margin:0 0 10px;">Учасники: ${main.length} / ${maxTeams}</div>`;

    // основні
    list.innerHTML += main.map((r,i)=>rowHtml(i+1,r)).join("");

    // резерв (якщо треба)
    if(reserve.length){
      list.innerHTML += `<div class="dividerLabel">Резерв: ${reserve.length}</div>`;
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

      // ✅ заголовок по центру (градієнт робить CSS)
      if($("pageTitle")) $("pageTitle").textContent = meta.stageTitle ? `${meta.title} · ${meta.stageTitle}` : meta.title;
      if($("pageSub")) $("pageSub").textContent = ""; // прибираємо “Список заявок...”

      if($("msg")) $("msg").textContent = "Завантаження списку…";

      // ✅ public_participants: stageId == stageId + (якщо main) stageId == null
      const rowsMap = new Map();

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

      // ✅ сортування: оплачені зверху, далі по назві
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

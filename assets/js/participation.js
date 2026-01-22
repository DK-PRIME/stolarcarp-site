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
        const ev = events.find(e =>
          String(e?.key || e?.stageId || e?.id || "").trim() === String(st).trim()
        );
        stageTitle = (ev && (ev.title || ev.name || ev.label)) ? String(ev.title || ev.name || ev.label) : "";
      }
    }catch{}

    return {
      title: String(title || "Змагання").trim(),
      stageTitle: String(stageTitle || "").trim()
    };
  }

  async function getMaxTeams(compId, stageId){
    const db = window.scDb;
    let maxTeams = 21;

    try{
      const cSnap = await db.collection("competitions").doc(compId).get();
      if(!cSnap.exists) return maxTeams;

      const c = cSnap.data() || {};
      const events = Array.isArray(c.events) ? c.events : [];
      const st = stageId || "main";
      const ev = events.find(e =>
        String(e?.key || e?.stageId || e?.id || "").trim() === String(st).trim()
      );

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
        <span class="lamp ${paid ? "lamp--green" : "lamp--red"}"></span>
        <span class="idx">${idx}.</span>
        <span class="name">${esc(r.teamName || "—")}</span>
        <span class="status ${paid ? "status--paid" : "status--unpaid"}">
          ${paid ? "Оплачено" : "Очікується"}
        </span>
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

    list.innerHTML += `
  <div class="participantsSub" style="margin:0 0 10px;">
    Учасники: ${main.length} / ${maxTeams}
  </div>
`;

    list.innerHTML += main.map((r,i)=>rowHtml(i+1,r)).join("");

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

      if ($("pageTitle")) {
  $("pageTitle").textContent = meta.title; // Назва змагання: "Турнір"
}

if ($("pageSub")) {
  let txt = meta.stageTitle;

  // Якщо назва етапу не знайдена в competitions – формуємо самі
  if (!txt && stageId && stageId !== "main") {
    const num = stageId.match(/\d+/);
    if (num) txt = `Етап ${num[0]}`;
  }

  $("pageSub").textContent = txt || "";
}

      if($("msg")) $("msg").textContent = "Завантаження списку…";

      const rowsMap = new Map();

const snap1 = await db.collection("public_participants")
  .where("competitionId","==",compId)
  .where("stageId","==",stageId)
  .where("entryType","==","team")
  .get();

snap1.forEach(doc=>{
  const r = doc.data() || {};
  rowsMap.set(doc.id, {
    teamName: norm(r.teamName || "—"),
    status: norm(r.status || "pending_payment"),
    createdAt: r.createdAt || null,
    confirmedAt: r.confirmedAt || null,
    orderPaid: Number.isFinite(r.orderPaid) ? r.orderPaid : null
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
    rowsMap.set(doc.id, {
      teamName: norm(r.teamName || "—"),
      status: norm(r.status || "pending_payment"),
      createdAt: r.createdAt || null,
      confirmedAt: r.confirmedAt || null,
      orderPaid: Number.isFinite(r.orderPaid) ? r.orderPaid : null
    });
  });
}

rows.sort((a, b) => {
  const order = { confirmed: 1, pending_payment: 2, cancelled: 2 };
  const A = order[a.status] || 99;
  const B = order[b.status] || 99;

  if (A !== B) return A - B;

  // confirmed — порядок підтвердження (СТАБІЛЬНО)
  if (A === 1) {
    const oa = Number.isFinite(a.orderPaid) ? a.orderPaid : 9999;
    const ob = Number.isFinite(b.orderPaid) ? b.orderPaid : 9999;
    return oa - ob;
  }

  // pending/cancelled — по createdAt
  const tA =
    a.createdAt?.toMillis?.() ||
    (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);

  const tB =
    b.createdAt?.toMillis?.() ||
    (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);

  return tA - tB;
});

if($("msg")) $("msg").textContent = "";
render(rows, maxTeams);

    }catch(e){
      console.error(e);
      if($("msg")) $("msg").textContent = "❌ " + (e?.message || e);
    }
  })();
})();

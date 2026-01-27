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

  // === POPUP СКЛАДУ КОМАНДИ ===
  async function openTeamPopup(teamName, teamDocId) {
    const popup = $("teamPopup");
    const title = $("teamPopupTitle");
    const body = $("teamPopupBody");

    if (!popup || !title || !body) return;

    title.textContent = teamName || "Команда";
    body.innerHTML = '<div class="team-loading">Завантаження складу…</div>';
    popup.style.display = "flex";

    try {
      const db = window.scDb;

      // 1. Отримуємо дані команди
      const teamDoc = await db.collection("teams").doc(teamDocId).get();
      if (!teamDoc.exists) {
        body.innerHTML = '<div class="team-loading">Команду не знайдено</div>';
        return;
      }

      const teamData = teamDoc.data();
      const ownerUid = teamData.ownerUid;

      // 2. Знаходимо користувачів з цієї команди
      let members = [];
      
      try {
        const usersSnap = await db.collection("users")
          .where("teamId", "==", teamDocId)
          .get();
        
        usersSnap.forEach(doc => {
          members.push({ id: doc.id, ...(doc.data() || {}) });
        });
      } catch (err) {
        console.log("Пошук по teamId не вдався:", err);
      }

      // Якщо не знайшли — додаємо капітана
      if (members.length === 0 && ownerUid) {
        const captainSnap = await db.collection("users").doc(ownerUid).get();
        if (captainSnap.exists) {
          members.push({ 
            id: captainSnap.id, 
            ...(captainSnap.data() || {}),
            role: "captain" 
          });
        }
      }

      if (members.length === 0) {
        body.innerHTML = '<div class="team-loading">Склад команди порожній</div>';
        return;
      }

      // Сортуємо: капітан перший
      members.sort((a, b) => {
        const aIsCaptain = a.role === "captain" || a.id === ownerUid;
        const bIsCaptain = b.role === "captain" || b.id === ownerUid;
        if (aIsCaptain && !bIsCaptain) return -1;
        if (bIsCaptain && !aIsCaptain) return 1;
        return (a.fullName || "").localeCompare(b.fullName || "");
      });

      body.innerHTML = members.map(m => {
        const name = m.fullName || m.email || "Учасник";
        const isCaptain = m.role === "captain" || m.id === ownerUid;
        const role = isCaptain ? "Капітан" : "Учасник";
        const avatarUrl = m.avatarUrl || '';

        const avatarHtml = avatarUrl
          ? `<div class="member-avatar"><img src="${esc(avatarUrl)}" alt=""></div>`
          : `<div class="member-avatar"><div class="member-avatar-placeholder">👤</div></div>`;

        return `
          <div class="team-member">
            ${avatarHtml}
            <div class="member-info">
              <div class="member-name">${esc(name)}</div>
              <div class="member-role">${esc(role)}</div>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error(err);
      body.innerHTML = '<div class="team-loading">Помилка завантаження</div>';
    }
  }

  function closeTeamPopup() {
    const popup = $("teamPopup");
    if (popup) popup.style.display = "none";
  }

  // Закриття по кліку поза контентом
  document.addEventListener('click', (e) => {
    const popup = $("teamPopup");
    const content = $("teamPopupContent");
    if (popup && content && popup.style.display === "flex" && !content.contains(e.target)) {
      closeTeamPopup();
    }
  });

  // Закриття по кнопці
  const closeBtn = $("teamPopupClose");
  if (closeBtn) closeBtn.addEventListener("click", closeTeamPopup);

  // Закриття по Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTeamPopup();
  });

  function rowHtml(idx, r, teamId){
    const paid = isPaidStatus(r.status);
    return `
      <div class="row" data-team-id="${esc(teamId)}" data-team-name="${esc(r.teamName || 'Команда')}">
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
      <div class="participantsSub" style="margin:0 0 10px; color:#94a3b8; font-size:.9rem;">
        Учасники: ${main.length} / ${maxTeams} (натисніть на команду для перегляду складу)
      </div>
    `;

    list.innerHTML += main.map((r, i) => rowHtml(i + 1, r, r.teamId)).join("");

    if(reserve.length){
      list.innerHTML += `<div class="dividerLabel">Резерв: ${reserve.length}</div>`;
      list.innerHTML += reserve.map((r, i) => rowHtml(maxTeams + i + 1, r, r.teamId)).join("");
    }

    // Додаємо обробники кліку
    list.querySelectorAll('.row').forEach(row => {
      row.addEventListener('click', () => {
        const teamId = row.dataset.teamId;
        const teamName = row.dataset.teamName;
        if (teamId) openTeamPopup(teamName, teamId);
      });
    });
  }

  (async function init(){
    try{
      await waitFirebase();
      const db = window.scDb;

      const params = new URLSearchParams(location.search);
      const compId  = params.get("comp");
      const stageParam = params.get("stage") || "main";

      if(!compId){
        if($("msg")) $("msg").textContent = "❌ Не передано competitionId";
        return;
      }

      // ✅ НОРМАЛІЗАЦІЯ stageId (приймає "1" і "stage-1")
      const stageIdVariants = [
        stageParam,
        "stage-" + stageParam,
        stageParam.replace(/^stage-/, "")
      ].filter(Boolean);

      const meta = await getCompetitionMeta(compId, stageParam);
      const maxTeams = await getMaxTeams(compId, stageParam);

      if ($("pageTitle")) {
        $("pageTitle").textContent = meta.title;
      }

      if ($("pageSub")) {
        let txt = meta.stageTitle;
        if (!txt && stageParam && stageParam !== "main") {
          const num = stageParam.match(/\d+/);
          if (num) txt = `Етап ${num[0]}`;
        }
        $("pageSub").textContent = txt || "";
      }

      if($("msg")) $("msg").textContent = "Завантаження списку…";

      const rowsMap = new Map();

      // Отримуємо всі заявки цього змагання
      const snap1 = await db.collection("public_participants")
        .where("competitionId","==",compId)
        .where("entryType","==","team")
        .get();

      snap1.forEach(doc=>{
        const r = doc.data() || {};
        
        // ✅ ФІЛЬТР: приймаємо "1" і "stage-1"
        const docStageId = r.stageId || "main";
        const stageMatches = stageIdVariants.includes(docStageId) || 
                            (stageParam === "main" && (!r.stageId || r.stageId === "main"));
        
        if (!stageMatches) return;
        
        // ✅ ФІЛЬТР: показуємо confirmed і pending_payment
        const status = norm(r.status || "pending_payment");
        if (!["confirmed", "pending_payment", "paid"].includes(status)) return;

        rowsMap.set(doc.id, {
          teamId: r.teamId,
          teamName: norm(r.teamName || "—"),
          status: status,
          createdAt: r.createdAt || null,
          confirmedAt: r.confirmedAt || null,
          orderPaid: Number.isFinite(r.orderPaid) ? r.orderPaid : null
        });
      });

      const rows = Array.from(rowsMap.values());

      // Сортування
      rows.sort((a, b) => {
        const order = { confirmed: 1, paid: 1, pending_payment: 2 };
        const A = order[a.status] || 99;
        const B = order[b.status] || 99;

        if (A !== B) return A - B;

        if (A === 1) {
          const oa = Number.isFinite(a.orderPaid) ? a.orderPaid : 9999;
          const ob = Number.isFinite(b.orderPaid) ? b.orderPaid : 9999;
          return oa - ob;
        }

        const tA = a.createdAt?.toMillis?.() || (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
        const tB = b.createdAt?.toMillis?.() || (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);

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

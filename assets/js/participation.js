// assets/js/participation.js
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  const norm = v => String(v ?? "").trim();

  const isPaidStatus = status => ["confirmed", "paid", "payment_confirmed"].includes(norm(status).toLowerCase());

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scDb) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Firestore не готовий (нема scDb)");
  }

  async function getCompetitionMeta(compId, stageId) {
    const db = window.scDb;
    let title = "Змагання";
    let stageTitle = "";

    try {
      const cSnap = await db.collection("competitions").doc(compId).get();
      if (cSnap.exists) {
        const c = cSnap.data() || {};
        title = c.name || c.title || title;

        const events = Array.isArray(c.events) ? c.events : [];
        const ev = events.find(e => String(e?.key || e?.stageId || e?.id || "").trim() === String(stageId).trim());
        stageTitle = ev && (ev.title || ev.name || ev.label) ? String(ev.title || ev.name || ev.label) : "";
      }
    } catch {}

    return {
      title: String(title || "Змагання").trim(),
      stageTitle: String(stageTitle || "").trim()
    };
  }

  async function getMaxTeams(compId, stageId) {
    const db = window.scDb;
    let maxTeams = 21;

    try {
      const cSnap = await db.collection("competitions").doc(compId).get();
      if (!cSnap.exists) return maxTeams;

      const c = cSnap.data() || {};
      const events = Array.isArray(c.events) ? c.events : [];
      const ev = events.find(e => String(e?.key || e?.stageId || e?.id || "").trim() === String(stageId).trim());

      const v = ev?.maxTeams ?? ev?.teamsLimit ?? c?.maxTeams ?? c?.teamsLimit ?? null;
      const n = typeof v === "number" ? v : parseInt(String(v || ""), 10);
      if (Number.isFinite(n) && n > 0) maxTeams = n;
    } catch {}

    return maxTeams;
  }

  // === POPUP ===
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
      const teamSnap = await db.collection("teams").doc(teamDocId).get();
      if (!teamSnap.exists) {
        body.innerHTML = '<div class="team-loading">Команду не знайдено</div>';
        return;
      }

      const team = teamSnap.data();
      const ownerUid = team.ownerUid || null;
      const members = [];
      const used = new Set();

      const usersSnap = await db.collection("users").where("teamId", "==", teamDocId).get();
      usersSnap.forEach(doc => {
        const d = doc.data();
        members.push({
          id: doc.id,
          fullName: d.fullName || d.displayName || d.email || "Учасник",
          role: d.role || "member",
          avatarUrl: d.avatarUrl || d.photoURL || null
        });
        used.add(doc.id);
      });

      if (ownerUid && !used.has(ownerUid)) {
        const capSnap = await db.collection("users").doc(ownerUid).get();
        if (capSnap.exists) {
          const c = capSnap.data();
          members.push({
            id: ownerUid,
            fullName: c.fullName || c.displayName || c.email || "Капітан",
            role: "captain",
            avatarUrl: c.avatarUrl || c.photoURL || null
          });
        }
      }

      if (members.length === 0) {
        body.innerHTML = '<div class="team-loading">Склад команди порожній</div>';
        return;
      }

      members.sort((a, b) => {
        const aCap = a.role === "captain" || (ownerUid && a.id === ownerUid);
        const bCap = b.role === "captain" || (ownerUid && b.id === ownerUid);
        if (aCap && !bCap) return -1;
        if (bCap && !aCap) return 1;
        return (a.fullName || "").localeCompare(b.fullName || "");
      });

      body.innerHTML = members.map(m => {
        const avatarHtml = m.avatarUrl
          ? `<div class="member-avatar"><img src="${esc(m.avatarUrl)}" alt=""></div>`
          : `<div class="member-avatar"><div class="member-avatar-placeholder">👤</div></div>`;
        return `
          <div class="team-member">
            ${avatarHtml}
            <div class="member-info">
              <div class="member-name">${esc(m.fullName)}</div>
              <div class="member-role">${m.role === "captain" ? "⭐ Капітан" : "Учасник"}</div>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error("Помилка popup:", err);
      body.innerHTML = `<div class="team-loading">Помилка: ${esc(err.message)}</div>`;
    }
  }

  function closeTeamPopup() {
    const popup = $("teamPopup");
    if (popup) popup.style.display = "none";
  }

  window.openTeamPopup = openTeamPopup;
  window.closeTeamPopup = closeTeamPopup;

  document.addEventListener("click", e => {
    if (e.target.id === "teamPopupClose") closeTeamPopup();
  });

  document.addEventListener("click", e => {
    const popup = $("teamPopup");
    const content = $("teamPopupContent");
    if (popup?.style.display === "flex" && e.target === popup && !content?.contains(e.target)) {
      closeTeamPopup();
    }
  });

  window.addEventListener("popstate", closeTeamPopup);

  // === RENDER ===
  function rowHtml(idx, r, teamId) {
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

  function render(rows, maxTeams) {
    const list = $("teamsList");
    const msg = $("msg");
    if (!list) return;

    list.innerHTML = "";
    if (msg) msg.textContent = "";

    const main = rows.slice(0, maxTeams);
    const reserve = rows.slice(maxTeams);

    if (!rows.length) {
      list.innerHTML = '<div class="mutedCenter">Нема заявок на це змагання</div>';
      return;
    }

    list.innerHTML += `
      <div class="participantsSub" style="margin:0 0 10px; color:#94a3b8; font-size:.9rem;">
        Учасники: ${main.length} / ${maxTeams} (натисніть на команду для перегляду складу)
      </div>
    `;

    list.innerHTML += main.map((r, i) => rowHtml(i + 1, r, r.teamId)).join("");

    if (reserve.length) {
      list.innerHTML += '<div class="dividerLabel">Резерв: ' + reserve.length + '</div>';
      list.innerHTML += reserve.map((r, i) => rowHtml(maxTeams + i + 1, r, r.teamId)).join("");
    }

    list.querySelectorAll('.row').forEach(row => {
      row.addEventListener('click', () => {
        const teamId = row.dataset.teamId;
        const teamName = row.dataset.teamName;
        if (teamId) openTeamPopup(teamName, teamId);
      });
    });
  }

  // === INIT ===
  (async function init() {
    try {
      await waitFirebase();
      const db = window.scDb;

      const params = new URLSearchParams(location.search);
      const compId = params.get("comp");
      const stageParam = params.get("stage") || "main";

      if (!compId) {
        if ($("msg")) $("msg").textContent = "❌ Не передано competitionId";
        return;
      }

      const stageIdVariants = [
        stageParam,
        "stage-" + stageParam,
        stageParam.replace(/^stage-/, "")
      ].filter(Boolean);

      const meta = await getCompetitionMeta(compId, stageParam);
      const maxTeams = await getMaxTeams(compId, stageParam);

      if ($("pageTitle")) $("pageTitle").textContent = meta.title;
      if ($("pageSub")) $("pageSub").textContent = meta.stageTitle || "";

      if ($("msg")) $("msg").textContent = "Завантаження списку…";

      const snap = await db.collection("public_participants")
        .where("competitionId", "==", compId)
        .where("entryType", "==", "team")
        .get();

      const rowsMap = new Map();

      snap.forEach(doc => {
        const r = doc.data() || {};
        const docStageId = r.stageId || "main";
        const stageMatches = stageIdVariants.includes(docStageId) ||
          (stageParam === "main" && (!r.stageId || r.stageId === "main"));

        if (!stageMatches) return;

        const status = norm(r.status || "pending_payment");
        if (!["confirmed", "pending_payment", "paid"].includes(status)) return;

        rowsMap.set(doc.id, {
          teamId: r.teamId,
          teamName: norm(r.teamName || "—"),
          status,
          createdAt: r.createdAt || null,
          confirmedAt: r.confirmedAt || null,
          orderPaid: Number.isFinite(r.orderPaid) ? r.orderPaid : null
        });
      });

      const rows = Array.from(rowsMap.values());

      // === СОРТУВАННЯ ===
      rows.sort((a, b) => {
        const rank = { confirmed: 1, paid: 1, pending_payment: 2 };
        const aRank = rank[a.status] || 99;
        const bRank = rank[b.status] || 99;
        if (aRank !== bRank) return aRank - bRank;

        if (aRank === 1) {
          if (Number.isFinite(a.orderPaid) && Number.isFinite(b.orderPaid)) return a.orderPaid - b.orderPaid;
          if (Number.isFinite(a.orderPaid)) return -1;
          if (Number.isFinite(b.orderPaid)) return 1;

          const aTime = a.confirmedAt?.toMillis?.() || (a.confirmedAt?._seconds ? a.confirmedAt._seconds * 1000 : 0);
          const bTime = b.confirmedAt?.toMillis?.() || (b.confirmedAt?._seconds ? b.confirmedAt._seconds * 1000 : 0);
          return aTime - bTime;
        }

        const aTime = a.createdAt?.toMillis?.() || (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0);
        const bTime = b.createdAt?.toMillis?.() || (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0);
        return aTime - bTime;
      });

      if ($("msg")) $("msg").textContent = "";
      render(rows, maxTeams);

    } catch (e) {
      console.error(e);
      if ($("msg")) $("msg").textContent = "❌ " + (e?.message || e);
    }
  })();
})();

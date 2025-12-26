// assets/js/my_participation.js
// Cabinet: show competitions/stages where TEAM already has a registration

(function () {
  const auth = window.scAuth;
  const db = window.scDb;

  const box = document.getElementById("myCompetitions");
  if (!box) return;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtTs(ts) {
    try {
      const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      return d ? d.toLocaleString("uk-UA") : "—";
    } catch {
      return "—";
    }
  }

  function statusText(s) {
    return s === "confirmed" ? "Підтверджено"
      : s === "pending_payment" ? "Очікує оплату"
      : s === "cancelled" ? "Скасовано"
      : (s || "—");
  }

  function statusColor(s) {
    // тільки inline колір тексту, без нових класів
    if (s === "confirmed") return "#22c55e";
    if (s === "pending_payment") return "#facc15";
    if (s === "cancelled") return "#ef4444";
    return "#9ca3af";
  }

  async function loadStageMap() {
    const map = new Map(); // key: compId||stageId -> label
    const snap = await db.collection("competitions").get();

    snap.forEach((docSnap) => {
      const c = docSnap.data() || {};
      const compId = docSnap.id;

      const brand = c.brand || "STOLAR CARP";
      const year = c.year || c.seasonYear || "";
      const compTitle = c.name || c.title || (year ? `Season ${year}` : compId);

      const eventsArr = Array.isArray(c.events) ? c.events : null;
      if (eventsArr && eventsArr.length) {
        eventsArr.forEach((ev, idx) => {
          const stageId = String(ev.key || ev.stageId || ev.id || `stage-${idx + 1}`);
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx + 1}`;
          map.set(`${compId}||${stageId}`, `${brand} · ${compTitle} — ${stageTitle}`);
        });
      } else {
        map.set(`${compId}||`, `${brand} · ${compTitle}`);
      }
    });

    return map;
  }

  function renderEmpty(text) {
    box.innerHTML = `<div class="cabinet-small-muted">${esc(text)}</div>`;
  }

  function renderList(items, stageMap) {
    // items: [{id, teamName, competitionId, stageId, status, createdAt}]
    const rows = items.map((r) => {
      const key = `${r.competitionId || ""}||${r.stageId || ""}`;
      const label = stageMap.get(key) || key;

      return `
        <div class="meta-pill" style="display:block;padding:10px 12px;margin:8px 0;">
          <div style="font-weight:700;margin-bottom:4px;">
            ${esc(label)}
          </div>
          <div style="font-size:.82rem;color:#9ca3af;display:flex;flex-wrap:wrap;gap:8px;">
            <span>Команда: <b style="color:#e5e7eb;">${esc(r.teamName || "—")}</b></span>
            <span>Подано: <b style="color:#e5e7eb;">${esc(fmtTs(r.createdAt))}</b></span>
            <span>Статус:
              <b style="color:${statusColor(r.status)};">${esc(statusText(r.status))}</b>
            </span>
          </div>
        </div>
      `;
    }).join("");

    box.innerHTML = rows;
  }

  async function init() {
    if (!auth || !db || !window.firebase) {
      renderEmpty("Firebase не завантажився.");
      return;
    }

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        renderEmpty("Увійдіть у акаунт, щоб бачити участь.");
        return;
      }

      try {
        // 1) teamId з users/{uid}
        const uSnap = await db.collection("users").doc(user.uid).get();
        const u = uSnap.data() || {};
        const teamId = u.teamId || null;

        if (!teamId) {
          renderEmpty("Ви ще не в команді. Приєднайтесь до команди.");
          return;
        }

        // 2) назви етапів
        const stageMap = await loadStageMap();

        // 3) заявки команди
        const snap = await db.collection("registrations")
          .where("teamId", "==", teamId)
          .get();

        // 4) прибираємо дублікати по compId+stageId
        const best = new Map();
        const rank = (st) => (st === "confirmed" ? 3 : st === "pending_payment" ? 2 : st === "cancelled" ? 1 : 0);

        snap.forEach((d) => {
          const r = d.data() || {};
          if (r.deleted === true) return;      // якщо буде soft-delete
          if (r.status === "cancelled") return; // не показуємо скасовані

          const key = `${r.competitionId || ""}||${r.stageId || ""}`;
          const prev = best.get(key);

          if (!prev || rank(r.status) > rank(prev.status)) {
            best.set(key, { id: d.id, ...r });
          }
        });

        const regs = Array.from(best.values());

        if (!regs.length) {
          renderEmpty("Поки що немає поданих заявок на змагання.");
          return;
        }

        regs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        renderList(regs, stageMap);

      } catch (e) {
        console.error("my_participation error:", e);
        renderEmpty("Не вдалося завантажити участь (Rules/доступ або дані).");
      }
    });
  }

  init();
})();

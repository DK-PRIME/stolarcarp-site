// assets/js/my_participation.js
// STOLAR CARP • Cabinet: show only stages where team already submitted registrations

(function () {
  const auth = window.scAuth;
  const db = window.scDb;

  const box = document.getElementById("myCompetitions");
  if (!auth || !db || !window.firebase || !box) return;

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  function statusLabel(s) {
    return s === "confirmed" ? "Підтверджено"
      : s === "pending_payment" ? "Очікує оплату"
      : s === "cancelled" ? "Скасовано"
      : (s || "—");
  }

  function statusPill(s) {
    // ті самі стилі “пілюль”, як у register.html
    const base = "pill-b";
    if (s === "confirmed") return `${base} pill-b--open`;
    if (s === "pending_payment") return `${base} pill-b--active`;
    if (s === "cancelled") return `${base} pill-b--closed`;
    return base;
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
    box.innerHTML = `<p class="form__hint">${esc(text)}</p>`;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      renderEmpty("Увійдіть у акаунт, щоб бачити участь у змаганнях.");
      return;
    }

    try {
      // 1) teamId з профілю
      const uSnap = await db.collection("users").doc(user.uid).get();
      const u = uSnap.data() || {};
      const teamId = u.teamId || null;

      if (!teamId) {
        renderEmpty("Ви ще не в команді. Приєднайтесь до команди, щоб бачити участь.");
        return;
      }

      // 2) мапа назв
      const stageMap = await loadStageMap();

      // 3) заявки команди
      const snap = await db.collection("registrations")
        .where("teamId", "==", teamId)
        .get();

      const uniq = new Map(); // key comp||stage -> best reg
      snap.forEach((d) => {
        const r = d.data() || {};

        // якщо ти робитимеш soft-delete — врахуємо
        if (r.deleted === true) return;

        // показуємо тільки активні (не скасовано)
        if (r.status === "cancelled") return;

        const key = `${r.competitionId || ""}||${r.stageId || ""}`;
        const prev = uniq.get(key);

        // якщо дубль — залишимо “кращий” статус (confirmed > pending_payment)
        const rank = (st) => (st === "confirmed" ? 2 : st === "pending_payment" ? 1 : 0);
        if (!prev || rank(r.status) > rank(prev.status)) {
          uniq.set(key, { id: d.id, ...r });
        }
      });

      const regs = Array.from(uniq.values());

      if (!regs.length) {
        renderEmpty("Поки що немає поданих заявок на змагання.");
        return;
      }

      // сортуємо за часом подачі
      regs.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() || 0;
        const bt = b.createdAt?.toMillis?.() || 0;
        return bt - at;
      });

      // 4) рендер під твій стиль (як event-item)
      box.innerHTML = regs.map((r) => {
        const compId = r.competitionId || "";
        const stageId = r.stageId || "";
        const key = `${compId}||${stageId}`;
        const label = stageMap.get(key) || key;

        return `
          <div class="event-item">
            <div class="event-content">
              <div class="event-title">
                <div class="text">${esc(label)}</div>
                <div class="event-badges">
                  <span class="${statusPill(r.status)}">${esc(statusLabel(r.status))}</span>
                </div>
              </div>
              <div class="event-meta">
                Команда: ${esc(r.teamName || "—")} · Подано: ${esc(r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("uk-UA") : "—")}
              </div>
            </div>
          </div>
        `;
      }).join("");

    } catch (e) {
      console.error(e);
      renderEmpty("Не вдалося завантажити участь (помилка доступу/даних).");
    }
  });
})();

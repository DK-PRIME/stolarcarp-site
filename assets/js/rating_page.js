// assets/js/rating_page.js
// STOLAR CARP • Rating page (stages from Firestore -> show/hide En columns)
// ✅ НЕ перебудовує таблицю
// ✅ Просто ховає/показує колонки [data-stage="n"]
// ✅ onSnapshot — одразу реагує коли ти створюєш/редагуєш season/events
// ✅ Фінал НЕ рахуємо як Е-колонку
// ✅ "Детальніше…" без дубля

(function () {
  "use strict";

  const db = window.scDb;

  const kickerEl = document.querySelector(".season-rating-head .kicker");
  const titleEl  = document.querySelector(".season-rating-head .page-title");
  const descEl   = document.querySelector(".season-rating-head .rating-desc");

  function pickSeasonIdFromGlobals() {
    return (
      window.SC_ACTIVE_SEASON_ID ||
      window.scActiveSeasonId ||
      window.scSeasonId ||
      window.SC_SEASON_ID ||
      null
    );
  }

  async function getSeasonId() {
    const g = pickSeasonIdFromGlobals();
    if (g) return String(g);

    try {
      const s = await db.collection("settings").doc("active").get();
      if (s.exists) {
        const d = s.data() || {};
        if (d.seasonId) return String(d.seasonId);
        if (d.competitionId) return String(d.competitionId);
        if (d.activeSeasonId) return String(d.activeSeasonId);
      }
    } catch (e) {
      console.warn("rating_page: settings/active read failed", e);
    }

    try {
      const snap = await db.collection("competitions").limit(1).get();
      if (!snap.empty) return snap.docs[0].id;
    } catch (e) {
      console.warn("rating_page: competitions fallback failed", e);
    }

    return null;
  }

  function isFinalEvent(ev) {
    const key = String(ev?.key || ev?.stageId || ev?.id || "").toLowerCase();
    return !!ev?.isFinal || key.includes("final");
  }

  function countStagesNoFinal(events) {
    const arr = Array.isArray(events) ? events : [];
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      if (!isFinalEvent(arr[i])) n++;
    }
    return n;
  }

  function applyStagesToTable(stagesCount) {
    const n = Number(stagesCount || 0);

    // атрибут для діагностики/стилів якщо треба
    document.body.setAttribute("data-stages", String(n));

    // показ/ховання всіх елементів з data-stage
    const all = document.querySelectorAll("[data-stage]");
    all.forEach((el) => {
      const idx = Number(el.getAttribute("data-stage") || 0);
      el.style.display = (idx >= 1 && idx <= n) ? "" : "none";
    });
  }

  function setHeader(year) {
    const y = year || (new Date()).getFullYear();
    if (kickerEl) kickerEl.textContent = `СЕЗОН ${y}`;
    if (titleEl)  titleEl.textContent  = "Рейтинг сезону STOLAR CARP";
  }

  function setupCollapsibleDesc() {
    if (!descEl || !titleEl) return;
    if (document.getElementById("descToggleBtn")) return;

    descEl.style.display = "none";

    const btn = document.createElement("button");
    btn.id = "descToggleBtn";
    btn.type = "button";
    btn.textContent = "Детальніше…";
    btn.className = "btn btn--ghost";
    btn.style.marginTop = "12px";
    btn.style.border = "1px solid rgba(251,191,36,.65)";
    btn.style.color = "#fbbf24";
    btn.style.background = "transparent";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "999px";

    let open = false;
    btn.addEventListener("click", () => {
      open = !open;
      descEl.style.display = open ? "block" : "none";
      btn.textContent = open ? "Згорнути" : "Детальніше…";
    });

    titleEl.insertAdjacentElement("afterend", btn);
  }

  let unsub = null;

  async function boot() {
    setupCollapsibleDesc();

    // дефолт: нема етапів — сховали всі Е
    applyStagesToTable(0);
    setHeader((new Date()).getFullYear());

    if (!db || !window.firebase) return;

    const seasonId = await getSeasonId();
    if (!seasonId) return;

    if (unsub) unsub();
    unsub = db.collection("competitions").doc(seasonId).onSnapshot(
      (snap) => {
        if (!snap.exists) {
          applyStagesToTable(0);
          setHeader((new Date()).getFullYear());
          return;
        }

        const c = snap.data() || {};
        const year = c.year || c.seasonYear || (new Date()).getFullYear();

        // 1) якщо ти явно зберігаєш stagesCount — беремо його
        // 2) інакше рахуємо з events без фіналу
        const stagesCount =
          (typeof c.stagesCount === "number" && c.stagesCount > 0)
            ? Number(c.stagesCount)
            : countStagesNoFinal(c.events);

        setHeader(year);
        applyStagesToTable(stagesCount);
      },
      (err) => console.warn("rating_page: competitions snapshot error", err)
    );
  }

  boot();
})();

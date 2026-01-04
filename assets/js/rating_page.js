// assets/js/rating_page.js
// STOLAR CARP • Rating page (SAFE + collapsible description)
// ✅ НЕ чіпає таблицю (не міняє thead/tbody)
// ✅ Якщо етапів 0 — ховає Е1..Е5 через body[data-stages="0"]
// ✅ Тягне рік сезону з competitions/{seasonId}.year (fallback: поточний рік)
// ✅ Ховає опис і робить кнопку "Детальніше…"

(function () {
  const db = window.scDb;

  const kickerEl = document.querySelector(".season-rating-head .kicker");
  const titleEl  = document.querySelector(".season-rating-head .page-title");
  const descEl   = document.querySelector(".season-rating-head .rating-desc");

  if (!kickerEl || !titleEl) {
    console.warn("rating_page: header DOM missing");
    return;
  }

  // ---- helpers ----
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
    const fromGlobals = pickSeasonIdFromGlobals();
    if (fromGlobals) return String(fromGlobals);

    // settings/active
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

    // fallback: будь-який competitions (без orderBy)
    try {
      const snap = await db.collection("competitions").limit(1).get();
      if (!snap.empty) return snap.docs[0].id;
    } catch (e) {
      console.warn("rating_page: competitions fallback failed", e);
    }

    return null;
  }

  function countStagesNoFinal(events) {
    const arr = Array.isArray(events) ? events : [];
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i] || {};
      const key = ev.key || ev.stageId || ev.id || "";
      const isFinal = String(key).toLowerCase().includes("final") || !!ev.isFinal;
      if (!isFinal) n++;
    }
    return n;
  }

  // ---- UI: collapsible description ----
  function setupCollapsibleDesc() {
    if (!descEl) return;

    // якщо вже зроблено — не дублюємо
    if (document.getElementById("descToggleBtn")) return;

    // Ховаємо опис спочатку
    descEl.style.display = "none";

    // Кнопка
    const btn = document.createElement("button");
    btn.id = "descToggleBtn";
    btn.type = "button";
    btn.textContent = "Детальніше…";
    btn.className = "btn btn--ghost"; // якщо у тебе є такі, інакше — ок

    // Трошки інлайн-стилю, щоб виглядало як на скріні
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

    // Вставляємо кнопку одразу ПІСЛЯ заголовка
    titleEl.insertAdjacentElement("afterend", btn);
  }

  async function boot() {
    // Якщо Firebase не піднявся — ховаємо етапи і ставимо поточний рік
    if (!db || !window.firebase) {
      document.body.setAttribute("data-stages", "0");
      kickerEl.textContent = `СЕЗОН ${(new Date()).getFullYear()}`;
      titleEl.textContent = "Рейтинг сезону STOLAR CARP";
      setupCollapsibleDesc();
      return;
    }

    // За замовчуванням: етапів нема → ховаємо Е1..Е5
    document.body.setAttribute("data-stages", "0");

    let year = (new Date()).getFullYear();
    let stagesCount = 0;

    const seasonId = await getSeasonId();

    if (seasonId) {
      try {
        const snap = await db.collection("competitions").doc(seasonId).get();
        if (snap.exists) {
          const c = snap.data() || {};
          year = c.year || c.seasonYear || year;
          stagesCount = countStagesNoFinal(c.events);
        }
      } catch (e) {
        console.warn("rating_page: cannot load competition doc", e);
      }
    }

    // ставимо атрибут: якщо stagesCount=0 → CSS сховає Е1..Е5
    document.body.setAttribute("data-stages", String(stagesCount || 0));

    kickerEl.textContent = `СЕЗОН ${year}`;
    titleEl.textContent = "Рейтинг сезону STOLAR CARP";

    setupCollapsibleDesc();
  }

  boot();
})();

// STOLAR CARP — Досягнення команди
// Читає готовий сезонний рейтинг з seasonRating/{year}
// Показує: загальний улов команди + найбільшу рибу за сезон

(function () {
  "use strict";

  const SEASON_YEAR = "2026";

  const totalWeightEl = document.getElementById("teamTotalWeight");
  const bigFishEl = document.getElementById("teamBigFish");

  if (!totalWeightEl || !bigFishEl) return;

  function fmtKg(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return n.toFixed(2).replace(/\.?0+$/, "");
  }

  function setEmpty() {
    totalWeightEl.textContent = "—";
    bigFishEl.textContent = "—";
  }

  function getTeamId() {
    return (
      window.currentTeamId ||
      window.teamId ||
      window.scTeamId ||
      ""
    ).toString().trim();
  }

  async function waitForTeamId(timeoutMs = 8000) {
    const started = Date.now();

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const teamId = getTeamId();

        if (teamId) {
          clearInterval(timer);
          resolve(teamId);
          return;
        }

        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve("");
        }
      }, 150);
    });
  }

  async function init() {
    try {
      if (window.scReady) {
        await window.scReady;
      }

      const db = window.scDb;

      if (!db) {
        console.warn("[team-achievements] Firestore не ініціалізований");
        setEmpty();
        return;
      }

      const teamId = await waitForTeamId();

      if (!teamId) {
        console.warn("[team-achievements] teamId не знайдено");
        setEmpty();
        return;
      }

      const snap = await db.collection("seasonRating").doc(SEASON_YEAR).get();

      if (!snap.exists) {
        setEmpty();
        return;
      }

      const data = snap.data() || {};
      const teams = Array.isArray(data.teams) ? data.teams : [];

      const team = teams.find(t => String(t.teamId || "") === teamId);

      if (!team) {
        setEmpty();
        return;
      }

      totalWeightEl.textContent = fmtKg(team.totalWeight);
      bigFishEl.textContent = fmtKg(team.bigFish);

    } catch (e) {
      console.error("[team-achievements] Помилка:", e);
      setEmpty();
    }
  }

  init();
})();

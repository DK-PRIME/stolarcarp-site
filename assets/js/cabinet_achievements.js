// STOLAR CARP — Досягнення команди в кабінеті
// Читає готовий рейтинг сезону: seasonRating/{year}
// Показує:
// - Загальний улов команди за сезон
// - Big Fish команди за сезон

(function () {
  "use strict";

  const SEASON_YEAR = "2026";

  const totalWeightEl = document.getElementById("statTotalWeight");
  const bigFishEl = document.getElementById("statBigFish");

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

  function getTeamIdFromWindow() {
    return String(
      window.currentTeamId ||
      window.teamId ||
      window.scTeamId ||
      window.cabinetTeamId ||
      ""
    ).trim();
  }

  async function waitForReady() {
    if (window.scReady) {
      await window.scReady;
    }
  }

  async function waitForTeamId(timeoutMs = 10000) {
    const started = Date.now();

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const teamId = getTeamIdFromWindow();

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

  async function findTeamIdFallback(db) {
    const auth = window.scAuth;
    const user = auth && auth.currentUser ? auth.currentUser : null;

    if (!user) return "";

    try {
      const userSnap = await db.collection("users").doc(user.uid).get();
      const userData = userSnap.exists ? (userSnap.data() || {}) : {};

      return String(
        userData.teamId ||
        userData.team ||
        userData.currentTeamId ||
        ""
      ).trim();

    } catch (e) {
      console.warn("[cabinet_achievements] Не вдалося прочитати users:", e);
      return "";
    }
  }

  function findTeamInRating(teams, teamId) {
    if (!Array.isArray(teams) || !teamId) return null;

    return teams.find(t => String(t.teamId || "") === String(teamId));
  }

  async function init() {
    try {
      setEmpty();

      await waitForReady();

      const db = window.scDb;

      if (!db) {
        console.warn("[cabinet_achievements] Firestore не ініціалізований");
        return;
      }

      let teamId = await waitForTeamId();

      if (!teamId) {
        teamId = await findTeamIdFallback(db);
      }

      if (!teamId) {
        console.warn("[cabinet_achievements] teamId не знайдено");
        return;
      }

      const ratingSnap = await db
        .collection("seasonRating")
        .doc(SEASON_YEAR)
        .get();

      if (!ratingSnap.exists) {
        console.warn("[cabinet_achievements] seasonRating не знайдено:", SEASON_YEAR);
        return;
      }

      const rating = ratingSnap.data() || {};
      const teams = Array.isArray(rating.teams) ? rating.teams : [];

      const team = findTeamInRating(teams, teamId);

      if (!team) {
        console.warn("[cabinet_achievements] Команду не знайдено в seasonRating:", teamId);
        return;
      }

      totalWeightEl.textContent = fmtKg(team.totalWeight);
      bigFishEl.textContent = fmtKg(team.bigFish);

    } catch (e) {
      console.error("[cabinet_achievements] Помилка:", e);
      setEmpty();
    }
  }

  init();
})();

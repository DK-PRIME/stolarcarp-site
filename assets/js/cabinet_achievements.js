// assets/js/cabinet_achievements.js
// STOLAR CARP — Досягнення команди в кабінеті

(function () {
  "use strict";

  const SEASON_YEAR = "2026";

  const totalWeightEl = document.getElementById("statTotalWeight");
  const bigFishEl = document.getElementById("statBigFish");
  const teamNameEl = document.getElementById("teamNameText");

  if (!totalWeightEl || !bigFishEl) return;

  function fmtKg(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return n.toFixed(2).replace(/\.?0+$/, "");
  }

  function clean(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function setEmpty() {
    totalWeightEl.textContent = "—";
    bigFishEl.textContent = "—";
  }

  function setLoading() {
    totalWeightEl.textContent = "…";
    bigFishEl.textContent = "…";
  }

  function getWindowTeamId() {
    return String(
      window.currentTeamId ||
      window.teamId ||
      window.scTeamId ||
      window.cabinetTeamId ||
      ""
    ).trim();
  }

  function getDisplayedTeamName() {
    const txt = teamNameEl ? teamNameEl.textContent : "";
    if (!txt || txt === "Команда…" || txt === "—") return "";
    return String(txt).trim();
  }

  async function waitForAuth(auth, timeoutMs = 8000) {
    return new Promise(resolve => {
      if (auth.currentUser) {
        resolve(auth.currentUser);
        return;
      }

      const started = Date.now();

      const unsub = auth.onAuthStateChanged(user => {
        if (user || Date.now() - started > timeoutMs) {
          unsub();
          resolve(user || null);
        }
      });
    });
  }

  async function waitForTeamData(timeoutMs = 10000) {
    const started = Date.now();

    return new Promise(resolve => {
      const timer = setInterval(() => {
        const teamId = getWindowTeamId();
        const teamName = getDisplayedTeamName();

        if (teamId || teamName) {
          clearInterval(timer);
          resolve({ teamId, teamName });
          return;
        }

        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve({ teamId: "", teamName: "" });
        }
      }, 200);
    });
  }

  async function getTeamIdFromUserDoc(db, uid) {
    if (!uid) return "";

    try {
      const snap = await db.collection("users").doc(uid).get();
      const u = snap.exists ? (snap.data() || {}) : {};

      return String(
        u.teamId ||
        u.currentTeamId ||
        u.team ||
        ""
      ).trim();
    } catch (e) {
      console.warn("[achievements] users fallback error:", e);
      return "";
    }
  }

  function findTeam(teams, teamId, teamName) {
    if (!Array.isArray(teams)) return null;

    if (teamId) {
      const byId = teams.find(t => String(t.teamId || "").trim() === String(teamId).trim());
      if (byId) return byId;
    }

    if (teamName) {
      const target = clean(teamName);

      const byName = teams.find(t =>
        clean(t.team || t.teamName || "") === target
      );

      if (byName) return byName;

      const byNameSoft = teams.find(t =>
        clean(t.team || t.teamName || "").includes(target) ||
        target.includes(clean(t.team || t.teamName || ""))
      );

      if (byNameSoft) return byNameSoft;
    }

    return null;
  }

  async function init() {
    try {
      setLoading();

      if (window.scReady) await window.scReady;

      const db = window.scDb;
      const auth = window.scAuth;

      if (!db || !auth) {
        setEmpty();
        return;
      }

      const user = await waitForAuth(auth);
      const waited = await waitForTeamData();

      let teamId = waited.teamId;
      let teamName = waited.teamName;

      if (!teamId && user) {
        teamId = await getTeamIdFromUserDoc(db, user.uid);
      }

      const ratingSnap = await db.collection("seasonRating").doc(SEASON_YEAR).get();

      if (!ratingSnap.exists) {
        setEmpty();
        return;
      }

      const rating = ratingSnap.data() || {};
      const teams = Array.isArray(rating.teams) ? rating.teams : [];

      const team = findTeam(teams, teamId, teamName);

      if (!team) {
        console.warn("[achievements] Команду не знайдено", { teamId, teamName });
        setEmpty();
        return;
      }

      totalWeightEl.textContent = fmtKg(team.totalWeight);
      bigFishEl.textContent = fmtKg(team.bigFish);

    } catch (e) {
      console.error("[achievements] Помилка:", e);
      setEmpty();
    }
  }

  init();
})();

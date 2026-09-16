// assets/js/cabinet_achievements.js
// STOLAR CARP — Досягнення команди в кабінеті
//
// ✅ Автоматичний сезон за поточним роком
// ✅ teamId — основний пошук
// ✅ teamName — fallback
// ✅ Читає seasonRating/{YEAR}
// ✅ Показує totalWeight + bigFish
// ✅ Нічого не записує у Firebase

(function () {
  "use strict";

  console.log("✅ cabinet_achievements.js LOADED v20260916-auto-season");

  // =========================================================
  // AUTO SEASON
  // =========================================================

  const SEASON_YEAR = String(new Date().getFullYear());

  console.log("[achievements] season:", SEASON_YEAR);

  // =========================================================
  // DOM
  // =========================================================

  const totalWeightEl =
    document.getElementById("statTotalWeight");

  const bigFishEl =
    document.getElementById("statBigFish");

  const teamNameEl =
    document.getElementById("teamNameText");

  if (!totalWeightEl || !bigFishEl) {
    return;
  }

  // =========================================================
  // HELPERS
  // =========================================================

  function fmtKg(v) {
    const n = Number(v || 0);

    if (
      !Number.isFinite(n) ||
      n <= 0
    ) {
      return "—";
    }

    return n
      .toFixed(2)
      .replace(/\.?0+$/, "");
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

  // =========================================================
  // TEAM FROM WINDOW
  // =========================================================

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
    const txt =
      teamNameEl
        ? teamNameEl.textContent
        : "";

    if (
      !txt ||
      txt === "Команда…" ||
      txt === "—"
    ) {
      return "";
    }

    return String(txt).trim();
  }

  // =========================================================
  // AUTH WAIT
  // =========================================================

  async function waitForAuth(
    auth,
    timeoutMs = 8000
  ) {
    return new Promise(resolve => {
      if (auth.currentUser) {
        resolve(auth.currentUser);
        return;
      }

      const started = Date.now();

      let finished = false;
      let unsub = null;

      const done = user => {
        if (finished) return;

        finished = true;

        if (typeof unsub === "function") {
          unsub();
        }

        resolve(user || null);
      };

      unsub =
        auth.onAuthStateChanged(user => {
          if (user) {
            done(user);
          }
        });

      setTimeout(() => {
        done(auth.currentUser || null);
      }, timeoutMs);
    });
  }

  // =========================================================
  // WAIT TEAM DATA FROM CABINET
  // =========================================================

  async function waitForTeamData(
    timeoutMs = 10000
  ) {
    const started = Date.now();

    return new Promise(resolve => {
      const timer =
        setInterval(() => {
          const teamId =
            getWindowTeamId();

          const teamName =
            getDisplayedTeamName();

          if (
            teamId ||
            teamName
          ) {
            clearInterval(timer);

            resolve({
              teamId,
              teamName
            });

            return;
          }

          if (
            Date.now() - started >
            timeoutMs
          ) {
            clearInterval(timer);

            resolve({
              teamId: "",
              teamName: ""
            });
          }
        }, 200);
    });
  }

  // =========================================================
  // USER FALLBACK
  // =========================================================

  async function getTeamIdFromUserDoc(
    db,
    uid
  ) {
    if (!uid) {
      return "";
    }

    try {
      const snap =
        await db
          .collection("users")
          .doc(uid)
          .get();

      const u =
        snap.exists
          ? (snap.data() || {})
          : {};

      return String(
        u.teamId ||
        u.currentTeamId ||
        u.team ||
        ""
      ).trim();

    } catch (e) {
      console.warn(
        "[achievements] users fallback error:",
        e
      );

      return "";
    }
  }

  // =========================================================
  // FIND TEAM
  // =========================================================

  function findTeam(
    teams,
    teamId,
    teamName
  ) {
    if (!Array.isArray(teams)) {
      return null;
    }

    // -------------------------------------------------------
    // 1. Головний пошук — teamId
    // -------------------------------------------------------

    if (teamId) {
      const targetId =
        String(teamId).trim();

      const byId =
        teams.find(team =>
          String(
            team?.teamId ||
            ""
          ).trim() === targetId
        );

      if (byId) {
        return byId;
      }
    }

    // -------------------------------------------------------
    // 2. Fallback — точна назва
    // -------------------------------------------------------

    if (teamName) {
      const target =
        clean(teamName);

      const byName =
        teams.find(team =>
          clean(
            team?.team ||
            team?.teamName ||
            ""
          ) === target
        );

      if (byName) {
        return byName;
      }

      // -----------------------------------------------------
      // 3. Soft fallback
      // -----------------------------------------------------

      const byNameSoft =
        teams.find(team => {
          const candidate =
            clean(
              team?.team ||
              team?.teamName ||
              ""
            );

          if (
            !candidate ||
            !target
          ) {
            return false;
          }

          return (
            candidate.includes(target) ||
            target.includes(candidate)
          );
        });

      if (byNameSoft) {
        return byNameSoft;
      }
    }

    return null;
  }

  // =========================================================
  // INIT
  // =========================================================

  async function init() {
    try {
      setLoading();

      if (window.scReady) {
        await window.scReady;
      }

      const db =
        window.scDb;

      const auth =
        window.scAuth;

      if (
        !db ||
        !auth
      ) {
        console.warn(
          "[achievements] Firebase не готовий"
        );

        setEmpty();
        return;
      }

      // -----------------------------------------------------
      // USER
      // -----------------------------------------------------

      const user =
        await waitForAuth(auth);

      // -----------------------------------------------------
      // TEAM DATA
      // -----------------------------------------------------

      const waited =
        await waitForTeamData();

      let teamId =
        waited.teamId;

      let teamName =
        waited.teamName;

      // -----------------------------------------------------
      // FALLBACK FROM users/{uid}
      // -----------------------------------------------------

      if (
        !teamId &&
        user
      ) {
        teamId =
          await getTeamIdFromUserDoc(
            db,
            user.uid
          );
      }

      console.log(
        "[achievements] team:",
        {
          teamId,
          teamName,
          season: SEASON_YEAR
        }
      );

      // -----------------------------------------------------
      // CURRENT SEASON
      // seasonRating/{currentYear}
      // -----------------------------------------------------

      const ratingSnap =
        await db
          .collection("seasonRating")
          .doc(SEASON_YEAR)
          .get();

      if (!ratingSnap.exists) {
        console.warn(
          `[achievements] seasonRating/${SEASON_YEAR} не знайдено`
        );

        setEmpty();
        return;
      }

      const rating =
        ratingSnap.data() || {};

      const teams =
        Array.isArray(rating.teams)
          ? rating.teams
          : [];

      // -----------------------------------------------------
      // FIND CURRENT TEAM
      // -----------------------------------------------------

      const team =
        findTeam(
          teams,
          teamId,
          teamName
        );

      if (!team) {
        console.warn(
          "[achievements] Команду не знайдено",
          {
            teamId,
            teamName,
            season: SEASON_YEAR
          }
        );

        setEmpty();
        return;
      }

      // -----------------------------------------------------
      // RENDER
      // -----------------------------------------------------

      totalWeightEl.textContent =
        fmtKg(
          team.totalWeight
        );

      bigFishEl.textContent =
        fmtKg(
          team.bigFish
        );

      console.log(
        "[achievements] loaded:",
        {
          season: SEASON_YEAR,
          teamId:
            team.teamId || "",
          team:
            team.team ||
            team.teamName ||
            "",
          totalWeight:
            team.totalWeight || 0,
          bigFish:
            team.bigFish || 0
        }
      );

    } catch (e) {
      console.error(
        "[achievements] Помилка:",
        e
      );

      setEmpty();
    }
  }

  init();

})();

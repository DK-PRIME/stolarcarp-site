// assets/js/cabinet_achievements.js
(function () {
  const elTotal = document.getElementById("statTotalWeight");
  const elBig = document.getElementById("statBigFish");
  const elRank = document.getElementById("statRank");

  if (!elTotal || !elBig || !elRank) return;

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase not ready (scAuth/scDb)");
  }

  function setText(el, v) {
    el.textContent = (v === null || v === undefined || v === "") ? "—" : String(v);
  }

  function num(v) {
    const n = typeof v === "number" ? v : parseFloat(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function toMillis(ts) {
    if (!ts) return 0;
    if (ts.toMillis) return ts.toMillis();
    try { return +new Date(ts); } catch { return 0; }
  }

  // намагаємось витягнути вагу з різних можливих полів
  function getTeamTotalWeight(teamObj) {
    return (
      num(teamObj.totalWeight) ||
      num(teamObj.totalWeightKg) ||
      num(teamObj.sumWeight) ||
      num(teamObj.sumWeightKg) ||
      num(teamObj.weightTotal) ||
      0
    );
  }

  function getTeamBigFish(teamObj) {
    return (
      num(teamObj.bigFish) ||
      num(teamObj.bigFishKg) ||
      num(teamObj.bigFishWeight) ||
      num(teamObj.maxFish) ||
      0
    );
  }

  async function getActiveInfo(db) {
    // settings/app — як на твоєму скріні
    const snap = await db.collection("settings").doc("app").get();
    const d = snap.exists ? (snap.data() || {}) : {};
    return {
      activeCompetitionId: d.activeCompetitionId || "",
      activeKey: d.activeKey || "",
      activeStageId: d.activeStageId || "",
    };
  }

  async function loadAchievements(user) {
    const db = window.scDb;

    // 1) user → teamId
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) {
      setText(elTotal, "—");
      setText(elBig, "—");
      setText(elRank, "—");
      return;
    }
    const u = uSnap.data() || {};
    const teamId = u.teamId;
    if (!teamId) {
      setText(elTotal, "—");
      setText(elBig, "—");
      setText(elRank, "—");
      return;
    }

    // 2) активний турнір (щоб рахувати “по сезону/турніру”)
    const active = await getActiveInfo(db);
    const activeCompId = active.activeCompetitionId || "";
    const activeKey = active.activeKey || "";

    // 3) stageResults → знаходимо всі записи твоєї команди
    const srSnap = await db.collection("stageResults").get();

    let total = 0;
    let big = 0;

    srSnap.forEach((doc) => {
      const d = doc.data() || {};

      // Фільтр по активному турніру, якщо є чим:
      // - compId інколи є типу "oneoff-2026-...."
      // - activeCompetitionId теж схоже на це
      const compId = d.compId || "";
      const stageKey = d.stageKey || "";
      const okByComp =
        !activeCompId ? true : (compId === activeCompId || String(compId).includes(activeCompId));
      const okByKey =
        !activeKey ? true : (stageKey === activeKey || String(stageKey).includes(activeKey) || String(compId).includes(activeKey));

      if (!(okByComp || okByKey)) return;

      const teams = Array.isArray(d.teams) ? d.teams : [];
      const t = teams.find((x) => x && x.teamId === teamId);
      if (!t) return;

      total += getTeamTotalWeight(t);
      big = Math.max(big, getTeamBigFish(t));
    });

    // 4) показуємо
    setText(elTotal, total ? total.toFixed(2) : "—");
    setText(elBig, big ? big.toFixed(2) : "—");

    // 5) rank (якщо є seasonRating) — пробуємо знайти
    // Якщо колекції/поля нема — лишиться "—"
    try {
      const ratingSnap = await db.collection("seasonRating").get();
      let foundRank = null;

      ratingSnap.forEach((doc) => {
        const d = doc.data() || {};
        const compId = d.compId || d.competitionId || "";

        // фільтр по активному турніру, якщо є
        if (activeCompId && compId && compId !== activeCompId) return;

        const teams = Array.isArray(d.teams) ? d.teams : Array.isArray(d.items) ? d.items : [];
        const me = teams.find((x) => x && x.teamId === teamId);
        if (!me) return;

        foundRank = me.rank || me.place || me.position || null;
      });

      setText(elRank, foundRank ?? "—");
    } catch (e) {
      setText(elRank, "—");
    }
  }

  (async () => {
    try {
      await waitFirebase();

      // дефолт
      setText(elTotal, "—");
      setText(elBig, "—");
      setText(elRank, "—");

      window.scAuth.onAuthStateChanged(async (user) => {
        if (!user) {
          setText(elTotal, "—");
          setText(elBig, "—");
          setText(elRank, "—");
          return;
        }
        try {
          await loadAchievements(user);
        } catch (e) {
          console.error(e);
          setText(elTotal, "—");
          setText(elBig, "—");
          setText(elRank, "—");
        }
      });
    } catch (e) {
      console.error(e);
    }
  })();
})();

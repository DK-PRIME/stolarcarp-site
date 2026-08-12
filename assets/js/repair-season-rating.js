// assets/js/repair-season-rating.js
// STOLAR CARP • ОДНОРАЗОВИЙ РЕМОНТ РЕЙТИНГУ 2026
// Джерело істини: seasonResults/2026/stages
// Звичайні змагання, яких уже немає в seasonResults, у рейтинг НЕ потраплять.

(async function () {
  "use strict";

  const SEASON_YEAR = "2026";

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitFirebase(maxMs = 12000) {
    const started = Date.now();

    while (Date.now() - started < maxMs) {
      if (window.scAuth && window.scDb && window.firebase) {
        return;
      }

      await wait(100);
    }

    throw new Error("Firebase не ініціалізований.");
  }

  try {
    await waitFirebase();

    const auth = window.scAuth;
    const db = window.scDb;
    const fb = window.firebase;

    const user = auth.currentUser;

    if (!user) {
      throw new Error("Потрібно увійти в адмін-акаунт.");
    }

    const userSnap = await db
      .collection("users")
      .doc(user.uid)
      .get();

    const role = userSnap.exists
      ? String((userSnap.data() || {}).role || "")
      : "";

    if (role !== "admin") {
      throw new Error("Доступ дозволено тільки адміністратору.");
    }

    console.log("🔧 Починаю ремонт рейтингу сезону", SEASON_YEAR);

    // =====================================================
    // 1. Читаємо ТІЛЬКИ правильний сезонний архів
    // =====================================================

    const stagesSnap = await db
      .collection("seasonResults")
      .doc(SEASON_YEAR)
      .collection("stages")
      .get();

    if (stagesSnap.empty) {
      throw new Error(
        `seasonResults/${SEASON_YEAR}/stages порожній. Ремонт зупинено.`
      );
    }

    const byTeam = new Map();
    const archivedStages = [];

    stagesSnap.forEach(stageDoc => {
      const stage = stageDoc.data() || {};
      const stageDocId = stageDoc.id;

      const standings = Array.isArray(stage.standings)
        ? stage.standings
        : [];

      console.log(
        "✅ Беру в рейтинг:",
        stageDocId,
        `(${standings.length} команд)`
      );

      archivedStages.push({
        stageDocId,
        compId: stage.compId || "",
        stageId: stage.stageId || "",
        stageName: stage.stageName || stageDocId,
        type: stage.type || "",
        stageType: stage.stageType || "",
        isFinal: stage.isFinal === true,
        archivedAt: stage.archivedAt || null
      });

      standings.forEach(row => {
        const teamId = String(row.teamId || "").trim();

        if (!teamId) return;

        const current = byTeam.get(teamId) || {
          teamId,
          team: String(
            row.team ||
            row.teamName ||
            "—"
          ),
          stages: {}
        };

        current.team = String(
          row.team ||
          row.teamName ||
          current.team ||
          "—"
        );

        current.stages[stageDocId] = {
          stageDocId,

          compId:
            stage.compId ||
            "",

          stageId:
            stage.stageId ||
            "",

          stageName:
            stage.stageName ||
            stageDocId,

          place:
            num(row.place),

          overallPlace:
            num(
              row.overallPlace ||
              row.finalPlace ||
              row.place
            ),

          zonePlace:
            num(row.zonePlace),

          points:
            num(
              row.points ||
              row.zonePlace ||
              row.place
            ),

          totalWeight:
            num(row.totalWeight),

          bigFish:
            num(row.bigFish),

          bigCarp:
            num(row.bigCarp),

          bigAmur:
            num(row.bigAmur),

          totalCount:
            num(row.totalCount)
        };

        byTeam.set(teamId, current);
      });
    });

    // =====================================================
    // 2. Формуємо чистий список команд
    // =====================================================

    const teams = Array
      .from(byTeam.values())
      .map(team => {

        const stageValues =
          Object.values(team.stages || {});

        return {
          ...team,

          played:
            stageValues.length,

          totalPoints:
            stageValues.reduce(
              (sum, stage) =>
                sum + num(stage.points),
              0
            ),

          totalWeight:
            stageValues.reduce(
              (sum, stage) =>
                sum + num(stage.totalWeight),
              0
            ),

          bigFish:
            stageValues.reduce(
              (max, stage) =>
                Math.max(
                  max,
                  num(stage.bigFish)
                ),
              0
            ),

          bigCarp:
            stageValues.reduce(
              (max, stage) =>
                Math.max(
                  max,
                  num(stage.bigCarp)
                ),
              0
            ),

          bigAmur:
            stageValues.reduce(
              (max, stage) =>
                Math.max(
                  max,
                  num(stage.bigAmur)
                ),
              0
            ),

          totalCount:
            stageValues.reduce(
              (sum, stage) =>
                sum + num(stage.totalCount),
              0
            )
        };
      });

    // =====================================================
    // 3. ПОВНІСТЮ переписуємо seasonRating/2026
    // =====================================================
    // ВАЖЛИВО: без merge:true.
    // Старе забруднене поле teams буде повністю замінене.
    // =====================================================

    await db
      .collection("seasonRating")
      .doc(SEASON_YEAR)
      .set({
        seasonYear: SEASON_YEAR,

        source: "seasonResults",

        archivedStages,

        teams,

        repairedAt:
          fb.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          fb.firestore.FieldValue.serverTimestamp(),

        repairedBy:
          user.uid
      });

    // =====================================================
    // 4. Чистимо локальний кеш рейтингу
    // =====================================================

    try {
      localStorage.removeItem(
        "sc_rating_cache_final_v5_season"
      );

      localStorage.removeItem(
        "sc_rating_cache_best2_with_final_v4_bigfish"
      );
    } catch {}

    console.log("=================================");
    console.log("✅ РЕЙТИНГ ВІДНОВЛЕНО");
    console.log("Етапів:", archivedStages.length);
    console.log("Команд:", teams.length);
    console.log("=================================");

    alert(
      `✅ Рейтинг ${SEASON_YEAR} відновлено.\n\n` +
      `Етапів у рейтингу: ${archivedStages.length}\n` +
      `Команд: ${teams.length}\n\n` +
      `Рейтинг перебудований ТІЛЬКИ з seasonResults.`
    );

  } catch (e) {
    console.error("❌ Repair rating error:", e);

    alert(
      "❌ Не вдалося відновити рейтинг:\n\n" +
      (e.message || e)
    );
  }
})();

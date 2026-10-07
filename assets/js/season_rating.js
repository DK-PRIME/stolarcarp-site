// assets/js/season_rating.js
// STOLAR CARP • Підсумковий рейтинг команд сезону
//
// =========================================================
// ЛОГІКА
// =========================================================
//
// 1. ВИХІД У ФІНАЛ
//    • TOP-18 тільки за відбірковими етапами;
//    • 2 найкращі результати;
//    • пропущений етап = 8 балів;
//    • менше балів — краще;
//    • при рівності: більша вага;
//    • потім більший Big Fish.
//
// 2. РЕЙТИНГ СЕЗОНУ
//    • тільки 18 фіналістів;
//    • усі відбіркові етапи;
//    • + Фінал;
//    • бал = місце в зоні;
//    • пропущений Фінал = 7 балів.
//
// 3. BIG FISH
//    • серед ВСІХ учасників сезону.
//
// 4. ЗАВЕРШЕННЯ СЕЗОНУ
//
//    БЕЗПЕЧНА СХЕМА:
//
//    seasonArchives/{YEAR}
//      — підсумковий архів сезону.
//
//    seasonArchives/{YEAR}__rating
//      — повний оригінальний seasonRating.
//
//    seasonArchives/{YEAR}__seasonResults
//      — оригінальний parent seasonResults/{YEAR}
//
//    seasonArchives/{YEAR}__stage__...
//      — повний оригінальний документ кожного етапу.
//
//    Після запису:
//      • перечитуємо ВСІ архівні документи;
//      • перевіряємо кількість етапів;
//      • перевіряємо Фінал;
//      • перевіряємо рейтинг;
//      • тільки після цього видаляємо робочі дані.
//
// =========================================================

(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  // =========================================================
  // SETTINGS
  // =========================================================

  const TOP_COUNT = 18;
  const BEST_COUNT_FOR_FINAL = 2;
  const ABSENT_REGULAR_POINTS = 8;
  const ABSENT_FINAL_POINTS = 7;

  const MAX_BATCH_WRITES = 400;

  const params =
    new URLSearchParams(
      window.location.search
    );

  const SEASON_YEAR =
    params.get("year") ||
    "2026";

  const NEXT_SEASON_YEAR =
    String(
      Number(SEASON_YEAR) + 1
    );

  // UID, який дозволений Firestore Rules.
  const FIRESTORE_ADMIN_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  // =========================================================
  // RUNTIME
  // =========================================================

  let currentDb = null;
  let currentRatingSource = null;
  let currentPayload = null;

  let currentUser = null;
  let currentUserIsAdmin = false;

  let archiveInProgress = false;

  let ratingUnsubscribe = null;
  let authUnsubscribe = null;

  let archiveDelegatedHandlerInstalled = false;

  // =========================================================
  // HELPERS
  // =========================================================

  function safeText(
    value,
    dash = "—"
  ) {
    return (
      value === null ||
      value === undefined ||
      value === ""
    )
      ? dash
      : String(value);
  }

  function num(value) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function fmtKg(value) {
    const n = num(value);

    if (n <= 0) {
      return "—";
    }

    return n
      .toFixed(2)
      .replace(/\.?0+$/, "");
  }

  function clean(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function esc(value) {
    return String(
      value ?? ""
    ).replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char])
    );
  }

  function teamKey(team) {
    const id =
      String(
        team?.teamId || ""
      ).trim();

    if (id) {
      return `id:${id}`;
    }

    const name =
      clean(
        team?.team ||
        team?.teamName ||
        ""
      );

    return name
      ? `name:${name}`
      : "";
  }

  function safeArchiveId(value) {
    return encodeURIComponent(
      String(value || "")
    )
      .replace(/%/g, "_")
      .replace(/\./g, "_");
  }

  function archiveStageDocId(
    stageDocId
  ) {
    return (
      `${SEASON_YEAR}` +
      `__stage__` +
      safeArchiveId(
        stageDocId
      )
    );
  }

  function serverTimestamp() {
    if (
      typeof firebase === "undefined" ||
      !firebase.firestore ||
      !firebase.firestore.FieldValue
    ) {
      throw new Error(
        "Firebase FieldValue недоступний."
      );
    }

    return firebase
      .firestore
      .FieldValue
      .serverTimestamp();
  }

  // =========================================================
  // PAGE STATE
  // =========================================================

  function setReady() {
    document.documentElement
      .setAttribute(
        "data-season-rating-ready",
        "1"
      );
  }

  function showError(message) {
    const box =
      $("seasonRatingError");

    if (!box) {
      return;
    }

    box.style.display =
      "block";

    box.innerHTML =
      message;
  }

  function hideError() {
    const box =
      $("seasonRatingError");

    if (!box) {
      return;
    }

    box.style.display =
      "none";

    box.innerHTML =
      "";
  }

  // =========================================================
  // FIREBASE
  // =========================================================

  async function waitReady() {
    if (window.scReady) {
      await window.scReady;
    }

    const db =
      window.scDb;

    if (!db) {
      throw new Error(
        "Firestore не ініціалізований."
      );
    }

    currentDb = db;

    return db;
  }

  // =========================================================
  // AUTH / ADMIN
  // =========================================================

  async function checkAdmin(
    user,
    db
  ) {
    if (!user) {
      return false;
    }

    // Firestore Rules дозволяють
    // завершення сезону тільки цьому UID.
    return (
      user.uid ===
      FIRESTORE_ADMIN_UID
    );
  }

  async function initAdminAccess(
    db
  ) {
    if (
      typeof firebase ===
        "undefined" ||
      !firebase.auth
    ) {
      console.warn(
        "[Season Rating] firebase.auth недоступний."
      );

      currentUser = null;
      currentUserIsAdmin = false;

      renderAdminArchivePanel();

      return;
    }

    if (
      typeof authUnsubscribe ===
      "function"
    ) {
      authUnsubscribe();
    }

    authUnsubscribe =
      firebase
        .auth()
        .onAuthStateChanged(
          async user => {
            currentUser =
              user || null;

            currentUserIsAdmin =
              await checkAdmin(
                currentUser,
                db
              );

            console.log(
              "[Season Rating] AUTH",
              {
                uid:
                  currentUser?.uid ||
                  null,

                email:
                  currentUser?.email ||
                  null,

                requiredUid:
                  FIRESTORE_ADMIN_UID,

                isAdmin:
                  currentUserIsAdmin
              }
            );

            renderAdminArchivePanel();
          }
        );
  }

  // =========================================================
  // STAGE HELPERS
  // =========================================================

  function isFinalStage(stage) {
    if (!stage) {
      return false;
    }

    const raw =
      clean(
        `${
          stage.stageDocId || ""
        } ${
          stage.stageId || ""
        } ${
          stage.stageName || ""
        } ${
          stage.type || ""
        } ${
          stage.stageType || ""
        } ${
          stage.title || ""
        }`
      );

    return (
      stage.isFinal === true ||
      stage.final === true ||
      clean(stage.type) ===
        "final" ||
      clean(stage.stageType) ===
        "final" ||
      raw.includes("final") ||
      raw.includes("фінал")
    );
  }

  function extractStageNumber(
    value
  ) {
    const raw =
      String(value || "");

    let match =
      raw.match(
        /stage[-_\s]*(\d+)/i
      );

    if (match) {
      return Number(match[1]);
    }

    match =
      raw.match(
        /етап\s*(\d+)/i
      );

    if (match) {
      return Number(match[1]);
    }

    match =
      raw.match(
        /(?:^|[^a-zа-яіїєґ0-9])[eе]\s*(\d+)/i
      );

    if (match) {
      return Number(match[1]);
    }

    const numbers =
      raw.match(/\d+/g);

    if (!numbers?.length) {
      return null;
    }

    return Number(
      numbers[
        numbers.length - 1
      ]
    );
  }

  function stageSortValue(stage) {
    if (isFinalStage(stage)) {
      return 999999;
    }

    const values = [
      stage?.stageId,
      stage?.stageDocId,
      stage?.stageName
    ];

    for (
      const value of values
    ) {
      const n =
        extractStageNumber(
          value
        );

      if (
        Number.isFinite(n)
      ) {
        return n;
      }
    }

    return 9999;
  }

  function stageDisplayNumber(
    stage,
    index
  ) {
    const values = [
      stage?.stageId,
      stage?.stageDocId,
      stage?.stageName
    ];

    for (
      const value of values
    ) {
      const n =
        extractStageNumber(
          value
        );

      if (
        Number.isFinite(n)
      ) {
        return n;
      }
    }

    return index + 1;
  }

  function stageDisplayTitle(
    stage,
    index
  ) {
    if (
      isFinalStage(stage)
    ) {
      return "Фінал";
    }

    return (
      `Етап ${stageDisplayNumber(
        stage,
        index
      )}`
    );
  }

  function normalizeStage(stage) {
    if (
      typeof stage ===
      "string"
    ) {
      const fixed = {
        stageDocId:
          stage,

        stageId:
          stage,

        stageName:
          stage,

        title:
          stage,

        type:
          "",

        stageType:
          "",

        isFinal:
          false
      };

      fixed.isFinal =
        isFinalStage(fixed);

      return fixed;
    }

    const fixed = {
      stageDocId:
        String(
          stage?.stageDocId ||
          stage?.id ||
          ""
        ),

      stageId:
        String(
          stage?.stageId ||
          stage?.stageDocId ||
          stage?.id ||
          ""
        ),

      stageName:
        String(
          stage?.stageName ||
          stage?.title ||
          stage?.stageId ||
          stage?.stageDocId ||
          stage?.id ||
          ""
        ),

      title:
        String(
          stage?.title ||
          stage?.stageName ||
          ""
        ),

      type:
        String(
          stage?.type ||
          ""
        ),

      stageType:
        String(
          stage?.stageType ||
          ""
        ),

      isFinal:
        Boolean(
          stage?.isFinal ||
          stage?.final
        )
    };

    fixed.isFinal =
      isFinalStage(fixed);

    return fixed;
  }

  function getCandidateStages(
    rating
  ) {
    const source =
      Array.isArray(
        rating?.archivedStages
      )
        ? rating.archivedStages
        : [];

    return source
      .map(normalizeStage)
      .filter(
        stage =>
          stage.stageDocId
      )
      .sort(
        (a, b) =>
          stageSortValue(a) -
          stageSortValue(b)
      );
  }

  // =========================================================
  // STANDING
  // =========================================================

  function normalizeStandingRow(
    row
  ) {
    return {
      teamId:
        String(
          row?.teamId || ""
        ).trim(),

      team:
        String(
          row?.team ||
          row?.teamName ||
          "—"
        ).trim(),

      zone:
        String(
          row?.zone || ""
        )
          .toUpperCase()
          .trim(),

      sector:
        String(
          row?.sector || ""
        ).trim(),

      overallPlace:
        num(
          row?.overallPlace ||
          row?.finalPlace ||
          row?.place
        ),

      zonePlace:
        num(
          row?.zonePlace
        ),

      points:
        num(
          row?.points ||
          row?.zonePlace
        ),

      totalWeight:
        num(
          row?.totalWeight
        ),

      bigFish:
        num(
          row?.bigFish
        ),

      totalCount:
        num(
          row?.totalCount
        ),

      w1:
        row?.w1 || null,

      w2:
        row?.w2 || null,

      w3:
        row?.w3 || null,

      w4:
        row?.w4 || null
    };
  }

  function compareStandingRows(
    a,
    b
  ) {
    if (
      b.totalWeight !==
      a.totalWeight
    ) {
      return (
        b.totalWeight -
        a.totalWeight
      );
    }

    if (
      b.bigFish !==
      a.bigFish
    ) {
      return (
        b.bigFish -
        a.bigFish
      );
    }

    if (
      b.totalCount !==
      a.totalCount
    ) {
      return (
        b.totalCount -
        a.totalCount
      );
    }

    return String(
      a.team
    ).localeCompare(
      String(b.team),
      "uk"
    );
  }

  function computeStageMap(
    standings
  ) {
    const rows =
      (
        Array.isArray(
          standings
        )
          ? standings
          : []
      ).map(
        normalizeStandingRow
      );

    const byTeamId =
      new Map();

    const byTeamName =
      new Map();

    const overallRows =
      rows
        .slice()
        .sort(
          compareStandingRows
        );

    const overallPlaceMap =
      new Map();

    overallRows.forEach(
      (row, index) => {
        const key =
          row.teamId ||
          clean(row.team);

        if (!key) {
          return;
        }

        overallPlaceMap.set(
          key,
          row.overallPlace ||
          index + 1
        );
      }
    );

    ["A", "B", "C"]
      .forEach(
        zone => {
          const zoneRows =
            rows
              .filter(
                row =>
                  row.zone ===
                  zone
              )
              .sort(
                compareStandingRows
              );

          zoneRows.forEach(
            (row, index) => {
              const key =
                row.teamId ||
                clean(row.team);

              const zonePlace =
                row.zonePlace ||
                index + 1;

              const fixed = {
                ...row,

                zonePlace,

                points:
                  zonePlace,

                overallPlace:
                  row.overallPlace ||
                  overallPlaceMap.get(
                    key
                  ) ||
                  0
              };

              if (
                fixed.teamId
              ) {
                byTeamId.set(
                  fixed.teamId,
                  fixed
                );
              }

              if (
                fixed.team
              ) {
                byTeamName.set(
                  clean(
                    fixed.team
                  ),
                  fixed
                );
              }
            }
          );
        }
      );

    rows
      .filter(
        row =>
          !["A", "B", "C"]
            .includes(
              row.zone
            )
      )
      .forEach(
        row => {
          const key =
            row.teamId ||
            clean(row.team);

          const fixed = {
            ...row,

            overallPlace:
              row.overallPlace ||
              overallPlaceMap.get(
                key
              ) ||
              0,

            points:
              row.points ||
              row.zonePlace ||
              row.overallPlace ||
              0
          };

          if (
            fixed.teamId
          ) {
            byTeamId.set(
              fixed.teamId,
              fixed
            );
          }

          if (
            fixed.team
          ) {
            byTeamName.set(
              clean(
                fixed.team
              ),
              fixed
            );
          }
        }
      );

    return {
      rows,
      byTeamId,
      byTeamName
    };
  }

  // =========================================================
  // STAGE SUMMARY
  // =========================================================

  function buildStageSummary(
    data,
    standings
  ) {
    const rows =
      Array.isArray(
        standings
      )
        ? standings
        : [];

    const summary =
      data?.summary || {};

    const calculatedWeight =
      rows.reduce(
        (sum, row) =>
          sum +
          num(
            row?.totalWeight
          ),
        0
      );

    const calculatedBig =
      rows.reduce(
        (max, row) =>
          Math.max(
            max,
            num(
              row?.bigFish
            )
          ),
        0
      );

    const calculatedFishCount =
      rows.reduce(
        (sum, row) =>
          sum +
          num(
            row?.totalCount
          ),
        0
      );

    const teamsCountRaw =
      summary.teamsCount ??
      summary.teamCount ??
      summary.participantsCount ??
      null;

    const weightRaw =
      summary.totalWeight ??
      summary.weight ??
      null;

    const bigRaw =
      summary.maxBigFish ??
      summary.bigFish ??
      summary.bigFishKg ??
      null;

    const fishCountRaw =
      summary.totalCount ??
      summary.fishCount ??
      null;

    return {
      teamsCount:
        teamsCountRaw !== null
          ? num(
              teamsCountRaw
            )
          : rows.length,

      totalWeight:
        weightRaw !== null
          ? num(
              weightRaw
            )
          : calculatedWeight,

      maxBigFish:
        bigRaw !== null
          ? num(bigRaw)
          : calculatedBig,

      totalCount:
        fishCountRaw !== null
          ? num(
              fishCountRaw
            )
          : calculatedFishCount
    };
  }

  // =========================================================
  // LOAD DISPLAY STAGE MAPS
  // =========================================================

  async function loadStageMaps(
    db,
    stages
  ) {
    const maps =
      new Map();

    await Promise.all(
      stages.map(
        async stage => {
          const snap =
            await db
              .collection(
                "seasonResults"
              )
              .doc(
                SEASON_YEAR
              )
              .collection(
                "stages"
              )
              .doc(
                stage.stageDocId
              )
              .get();

          if (!snap.exists) {
            console.warn(
              "[Season Rating] stage missing:",
              stage.stageDocId
            );

            return;
          }

          const data =
            snap.data() || {};

          const standings =
            Array.isArray(
              data.standings
            )
              ? data.standings
              : [];

          const map =
            computeStageMap(
              standings
            );

          map.raw = data;

          map.summary =
            buildStageSummary(
              data,
              standings
            );

          map.meta = {
            stageDocId:
              snap.id,

            stageId:
              String(
                data.stageId ||
                stage.stageId ||
                snap.id
              ),

            stageName:
              String(
                data.stageName ||
                data.title ||
                stage.stageName ||
                ""
              ),

            title:
              String(
                data.title ||
                data.stageName ||
                stage.title ||
                ""
              ),

            type:
              String(
                data.type ||
                stage.type ||
                ""
              ),

            stageType:
              String(
                data.stageType ||
                stage.stageType ||
                ""
              ),

            isFinal:
              Boolean(
                data.isFinal ||
                data.final ||
                stage.isFinal
              )
          };

          maps.set(
            stage.stageDocId,
            map
          );
        }
      )
    );

    return maps;
  }

  // =========================================================
  // ENRICH
  // =========================================================

  function enrichStages(
    stages,
    stageMaps
  ) {
    return stages.map(
      stage => {
        const map =
          stageMaps.get(
            stage.stageDocId
          );

        const meta =
          map?.meta || {};

        const fixed = {
          ...stage,

          stageId:
            String(
              meta.stageId ||
              stage.stageId ||
              stage.stageDocId ||
              ""
            ),

          stageName:
            String(
              meta.stageName ||
              stage.stageName ||
              ""
            ),

          title:
            String(
              meta.title ||
              stage.title ||
              ""
            ),

          type:
            String(
              meta.type ||
              stage.type ||
              ""
            ),

          stageType:
            String(
              meta.stageType ||
              stage.stageType ||
              ""
            ),

          isFinal:
            Boolean(
              meta.isFinal ||
              stage.isFinal
            )
        };

        fixed.isFinal =
          isFinalStage(
            fixed
          );

        return fixed;
      }
    );
  }

  // =========================================================
  // FINAL HINTS
  // =========================================================

  function getRatingFinalHints(
    rating
  ) {
    const raw = [
      rating?.finalStageDocId,
      rating?.finalStageId,
      rating?.finalStageKey,
      rating?.finalId,
      rating?.finalKey
    ];

    if (
      typeof rating?.finalStage ===
      "string"
    ) {
      raw.push(
        rating.finalStage
      );
    }

    if (
      rating?.finalStage &&
      typeof rating.finalStage ===
        "object"
    ) {
      raw.push(
        rating.finalStage
          .stageDocId,

        rating.finalStage
          .stageId,

        rating.finalStage
          .id,

        rating.finalStage
          .key
      );
    }

    return raw
      .map(clean)
      .filter(Boolean);
  }

  function stageMatchesHint(
    stage,
    hints
  ) {
    const values = [
      stage.stageDocId,
      stage.stageId,
      stage.stageName,
      stage.title
    ]
      .map(clean)
      .filter(Boolean);

    return hints.some(
      hint =>
        values.includes(
          hint
        )
    );
  }

  // =========================================================
  // RESOLVE STAGES
  // =========================================================

  function resolveStageStructure(
    rating,
    candidateStages,
    stageMaps
  ) {
    let stages =
      enrichStages(
        candidateStages,
        stageMaps
      );

    let finalStage =
      stages.find(
        isFinalStage
      ) ||
      null;

    if (!finalStage) {
      const hints =
        getRatingFinalHints(
          rating
        );

      if (hints.length) {
        finalStage =
          stages.find(
            stage =>
              stageMatchesHint(
                stage,
                hints
              )
          ) ||
          null;
      }
    }

    if (
      !finalStage &&
      stages.length >= 2
    ) {
      const numericStages =
        stages
          .slice()
          .sort(
            (a, b) =>
              stageSortValue(a) -
              stageSortValue(b)
          );

      const last =
        numericStages[
          numericStages.length - 1
        ];

      const lastCount =
        num(
          stageMaps.get(
            last.stageDocId
          )?.summary
            ?.teamsCount
        );

      const previousCounts =
        numericStages
          .slice(0, -1)
          .map(
            stage =>
              num(
                stageMaps.get(
                  stage.stageDocId
                )?.summary
                  ?.teamsCount
              )
          );

      const hadLargerStage =
        previousCounts.some(
          count =>
            count > TOP_COUNT
        );

      if (
        lastCount > 0 &&
        lastCount <=
          TOP_COUNT &&
        hadLargerStage
      ) {
        finalStage = {
          ...last,

          isFinal:
            true,

          type:
            "final",

          stageType:
            "final",

          stageName:
            "Фінал",

          title:
            "Фінал",

          inferredFinal:
            true
        };
      }
    }

    if (finalStage) {
      finalStage = {
        ...finalStage,

        isFinal:
          true,

        type:
          "final",

        stageType:
          "final",

        stageName:
          "Фінал",

        title:
          "Фінал"
      };

      stages =
        stages.map(
          stage =>
            stage.stageDocId ===
            finalStage.stageDocId
              ? finalStage
              : stage
        );
    }

    const regularStages =
      stages
        .filter(
          stage =>
            !finalStage ||
            stage.stageDocId !==
              finalStage.stageDocId
        )
        .sort(
          (a, b) =>
            stageSortValue(a) -
            stageSortValue(b)
        );

    return {
      regularStages,

      finalStage,

      allStages:
        finalStage
          ? [
              ...regularStages,
              finalStage
            ]
          : [
              ...regularStages
            ]
    };
  }

  // =========================================================
  // TEAM LOOKUP
  // =========================================================

  function findTeamRow(
    stageMap,
    team
  ) {
    if (
      !stageMap ||
      !team
    ) {
      return null;
    }

    const teamId =
      String(
        team.teamId || ""
      ).trim();

    const teamName =
      clean(
        team.team ||
        team.teamName ||
        ""
      );

    if (
      teamId &&
      stageMap
        .byTeamId
        .has(teamId)
    ) {
      return stageMap
        .byTeamId
        .get(teamId);
    }

    if (
      teamName &&
      stageMap
        .byTeamName
        .has(teamName)
    ) {
      return stageMap
        .byTeamName
        .get(teamName);
    }

    return null;
  }

  function readStageResult(
    team,
    stage,
    stageMaps
  ) {
    if (!stage) {
      return null;
    }

    const final =
      isFinalStage(stage);

    const stageMap =
      stageMaps.get(
        stage.stageDocId
      );

    const archiveRow =
      findTeamRow(
        stageMap,
        team
      );

    if (archiveRow) {
      const place =
        final
          ? num(
              archiveRow
                .zonePlace
            )
          : num(
              archiveRow
                .zonePlace ||
              archiveRow
                .points ||
              archiveRow
                .place
            );

      if (!place) {
        return null;
      }

      return {
        place,
        points:
          place,

        totalWeight:
          num(
            archiveRow
              .totalWeight
          ),

        bigFish:
          num(
            archiveRow
              .bigFish
          ),

        totalCount:
          num(
            archiveRow
              .totalCount
          ),

        final
      };
    }

    const stagesObject =
      team.stages || {};

    const data =
      stagesObject[
        stage.stageDocId
      ] ||
      stagesObject[
        stage.stageId
      ] ||
      null;

    if (!data) {
      return null;
    }

    const place =
      final
        ? num(
            data.zonePlace ||
            data.finalZonePlace
          )
        : num(
            data.zonePlace ||
            data.points ||
            data.place
          );

    if (!place) {
      return null;
    }

    return {
      place,
      points:
        place,

      totalWeight:
        num(
          data.totalWeight
        ),

      bigFish:
        num(
          data.bigFish
        ),

      totalCount:
        num(
          data.totalCount
        ),

      final
    };
  }

  // =========================================================
  // QUALIFICATION
  // =========================================================

  function calculateQualification(
    team,
    regularStages,
    stageMaps
  ) {
    const results =
      regularStages.map(
        stage => {
          const result =
            readStageResult(
              team,
              stage,
              stageMaps
            );

          if (result) {
            return {
              points:
                result.points,

              totalWeight:
                result.totalWeight,

              bigFish:
                result.bigFish
            };
          }

          return {
            points:
              ABSENT_REGULAR_POINTS,

            totalWeight:
              0,

            bigFish:
              0
          };
        }
      );

    results.sort(
      (a, b) => {
        if (
          a.points !==
          b.points
        ) {
          return (
            a.points -
            b.points
          );
        }

        if (
          b.totalWeight !==
          a.totalWeight
        ) {
          return (
            b.totalWeight -
            a.totalWeight
          );
        }

        return (
          b.bigFish -
          a.bigFish
        );
      }
    );

    return results
      .slice(
        0,
        BEST_COUNT_FOR_FINAL
      )
      .reduce(
        (sum, item) =>
          sum +
          num(
            item.points
          ),
        0
      );
  }

  function getRegularWeight(
    team,
    regularStages,
    stageMaps
  ) {
    let weight = 0;

    regularStages.forEach(
      stage => {
        const result =
          readStageResult(
            team,
            stage,
            stageMaps
          );

        if (result) {
          weight +=
            num(
              result.totalWeight
            );
        }
      }
    );

    return weight;
  }

  function getRegularBigFish(
    team,
    regularStages,
    stageMaps
  ) {
    let bigFish = 0;

    regularStages.forEach(
      stage => {
        const result =
          readStageResult(
            team,
            stage,
            stageMaps
          );

        if (result) {
          bigFish =
            Math.max(
              bigFish,
              num(
                result.bigFish
              )
            );
        }
      }
    );

    return bigFish;
  }

  function getFinalists(
    rawTeams,
    regularStages,
    stageMaps
  ) {
    const ranked =
      rawTeams.map(
        team => ({
          team,

          qualificationPoints:
            calculateQualification(
              team,
              regularStages,
              stageMaps
            ),

          qualificationWeight:
            getRegularWeight(
              team,
              regularStages,
              stageMaps
            ),

          qualificationBigFish:
            getRegularBigFish(
              team,
              regularStages,
              stageMaps
            )
        })
      );

    ranked.sort(
      (a, b) => {
        if (
          a.qualificationPoints !==
          b.qualificationPoints
        ) {
          return (
            a.qualificationPoints -
            b.qualificationPoints
          );
        }

        if (
          b.qualificationWeight !==
          a.qualificationWeight
        ) {
          return (
            b.qualificationWeight -
            a.qualificationWeight
          );
        }

        if (
          b.qualificationBigFish !==
          a.qualificationBigFish
        ) {
          return (
            b.qualificationBigFish -
            a.qualificationBigFish
          );
        }

        return String(
          a.team.team ||
          a.team.teamName ||
          ""
        ).localeCompare(
          String(
            b.team.team ||
            b.team.teamName ||
            ""
          ),
          "uk"
        );
      }
    );

    return ranked
      .slice(
        0,
        TOP_COUNT
      )
      .map(
        item =>
          item.team
      );
  }

  // =========================================================
  // PARTICIPANTS
  // =========================================================

  function collectAllSeasonParticipants(
    stages,
    stageMaps
  ) {
    const participants =
      new Map();

    stages.forEach(
      stage => {
        const stageMap =
          stageMaps.get(
            stage.stageDocId
          );

        if (
          !stageMap ||
          !Array.isArray(
            stageMap.rows
          )
        ) {
          return;
        }

        stageMap.rows.forEach(
          row => {
            const participant = {
              teamId:
                String(
                  row.teamId || ""
                ).trim(),

              team:
                String(
                  row.team || "—"
                ).trim()
            };

            const key =
              teamKey(
                participant
              );

            if (!key) {
              return;
            }

            if (
              !participants.has(
                key
              )
            ) {
              participants.set(
                key,
                participant
              );
            }
          }
        );
      }
    );

    return [
      ...participants.values()
    ];
  }

  // =========================================================
  // SEASON STATS
  // =========================================================

  function buildRegularCells(
    team,
    regularStages,
    stageMaps
  ) {
    return regularStages.map(
      stage => {
        const result =
          readStageResult(
            team,
            stage,
            stageMaps
          );

        if (!result) {
          return {
            place:
              "—",

            points:
              ABSENT_REGULAR_POINTS,

            absent:
              true
          };
        }

        return {
          place:
            result.place,

          points:
            result.points,

          absent:
            false
        };
      }
    );
  }

  function calculateSeasonStats(
    team,
    regularStages,
    finalStage,
    stageMaps
  ) {
    let totalWeight = 0;
    let biggestFish = 0;
    let biggestFishStage = "";

    regularStages.forEach(
      (stage, index) => {
        const result =
          readStageResult(
            team,
            stage,
            stageMaps
          );

        if (!result) {
          return;
        }

        totalWeight +=
          num(
            result.totalWeight
          );

        if (
          num(
            result.bigFish
          ) >
          biggestFish
        ) {
          biggestFish =
            num(
              result.bigFish
            );

          biggestFishStage =
            stageDisplayTitle(
              stage,
              index
            );
        }
      }
    );

    if (finalStage) {
      const result =
        readStageResult(
          team,
          finalStage,
          stageMaps
        );

      if (result) {
        totalWeight +=
          num(
            result.totalWeight
          );

        if (
          num(
            result.bigFish
          ) >
          biggestFish
        ) {
          biggestFish =
            num(
              result.bigFish
            );

          biggestFishStage =
            "Фінал";
        }
      }
    }

    return {
      totalWeight,
      biggestFish,
      biggestFishStage
    };
  }

  function buildSeasonRanking(
    finalists,
    regularStages,
    finalStage,
    stageMaps
  ) {
    const rows =
      finalists.map(
        team => {
          const regularCells =
            buildRegularCells(
              team,
              regularStages,
              stageMaps
            );

          const regularPoints =
            regularCells.reduce(
              (sum, item) =>
                sum +
                num(
                  item.points
                ),
              0
            );

          let finalPlace =
            "—";

          let finalPoints =
            0;

          if (finalStage) {
            const result =
              readStageResult(
                team,
                finalStage,
                stageMaps
              );

            if (result) {
              finalPlace =
                result.place;

              finalPoints =
                result.points;
            } else {
              finalPoints =
                ABSENT_FINAL_POINTS;
            }
          }

          const stats =
            calculateSeasonStats(
              team,
              regularStages,
              finalStage,
              stageMaps
            );

          return {
            teamId:
              String(
                team.teamId || ""
              ),

            team:
              team.team ||
              team.teamName ||
              "—",

            regularCells,

            finalPlace,
            finalPoints,

            seasonPoints:
              regularPoints +
              finalPoints,

            totalWeight:
              stats.totalWeight,

            bigFish:
              stats.biggestFish,

            bigFishStage:
              stats.biggestFishStage
          };
        }
      );

    rows.sort(
      (a, b) => {
        if (
          a.seasonPoints !==
          b.seasonPoints
        ) {
          return (
            a.seasonPoints -
            b.seasonPoints
          );
        }

        if (
          b.totalWeight !==
          a.totalWeight
        ) {
          return (
            b.totalWeight -
            a.totalWeight
          );
        }

        if (
          b.bigFish !==
          a.bigFish
        ) {
          return (
            b.bigFish -
            a.bigFish
          );
        }

        return String(
          a.team
        ).localeCompare(
          String(b.team),
          "uk"
        );
      }
    );

    return rows.map(
      (row, index) => ({
        ...row,
        place:
          index + 1
      })
    );
  }

  function buildAllParticipantsStats(
    participants,
    regularStages,
    finalStage,
    stageMaps
  ) {
    return participants.map(
      team => {
        const stats =
          calculateSeasonStats(
            team,
            regularStages,
            finalStage,
            stageMaps
          );

        return {
          teamId:
            String(
              team.teamId || ""
            ),

          team:
            team.team ||
            team.teamName ||
            "—",

          bigFish:
            stats.biggestFish,

          bigFishStage:
            stats.biggestFishStage
        };
      }
    );
  }

  // =========================================================
  // STAGE SUMMARIES
  // =========================================================

  function buildStageArchiveSummaries(
    allStages,
    stageMaps
  ) {
    return allStages.map(
      (stage, index) => {
        const map =
          stageMaps.get(
            stage.stageDocId
          );

        const summary =
          map?.summary || {
            teamsCount: 0,
            totalWeight: 0,
            maxBigFish: 0,
            totalCount: 0
          };

        const final =
          isFinalStage(stage);

        const number =
          final
            ? null
            : stageDisplayNumber(
                stage,
                index
              );

        return {
          type:
            final
              ? "final"
              : "qualification",

          isFinal:
            final,

          number,

          title:
            final
              ? "Фінал"
              : `Етап ${number}`,

          stageDocId:
            String(
              stage.stageDocId ||
              ""
            ),

          stageId:
            String(
              stage.stageId ||
              ""
            ),

          teamsCount:
            num(
              summary.teamsCount
            ),

          totalWeight:
            num(
              summary.totalWeight
            ),

          bigFish:
            num(
              summary.maxBigFish
            ),

          totalCount:
            num(
              summary.totalCount
            )
        };
      }
    );
  }

  // =========================================================
  // HEADER
  // =========================================================

  function buildHeader(
    regularStages
  ) {
    const head =
      $("seasonFinalHead");

    if (!head) {
      return;
    }

    head
      .querySelectorAll(
        "th.col-stage"
      )
      .forEach(
        element =>
          element.remove()
      );

    const finalHeader =
      head.querySelector(
        "th.col-final"
      );

    if (!finalHeader) {
      return;
    }

    regularStages.forEach(
      (stage, index) => {
        const number =
          stageDisplayNumber(
            stage,
            index
          );

        const th =
          document.createElement(
            "th"
          );

        th.className =
          "col-stage";

        th.dataset.stageDocId =
          stage.stageDocId;

        th.innerHTML =
          `Е${number}<br>м / б`;

        head.insertBefore(
          th,
          finalHeader
        );
      }
    );
  }

  // =========================================================
  // TABLE
  // =========================================================

  function renderTable(
    rows,
    regularStages
  ) {
    const tbody =
      $("seasonFinalRows");

    if (!tbody) {
      return;
    }

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${
            regularStages.length +
            6
          }">
            Немає команд для рейтингу.
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML =
      rows
        .map(
          row => {
            const rankClass =
              row.place === 1
                ? "season-rank-1"
                : row.place === 2
                  ? "season-rank-2"
                  : row.place === 3
                    ? "season-rank-3"
                    : "";

            const stageHtml =
              row.regularCells
                .map(
                  cell => `
                    <td
                      class="col-stage ${
                        cell.absent
                          ? "stage-noshow"
                          : ""
                      }"
                    >
                      <div class="stage-cell">
                        <span class="stage-place">
                          ${esc(
                            safeText(
                              cell.place
                            )
                          )}
                        </span>

                        <span class="stage-slash">
                          /
                        </span>

                        <span class="stage-points">
                          ${esc(
                            safeText(
                              cell.points
                            )
                          )}
                        </span>
                      </div>
                    </td>
                  `
                )
                .join("");

            return `
              <tr class="${rankClass}">
                <td class="col-place">
                  <span class="place-num">
                    ${row.place}
                  </span>
                </td>

                <td
                  class="col-team"
                  title="${esc(
                    row.team
                  )}"
                >
                  ${esc(row.team)}
                </td>

                ${stageHtml}

                <td class="col-final">
                  <span class="final-place">
                    ${esc(
                      safeText(
                        row.finalPlace
                      )
                    )}
                  </span>
                </td>

                <td class="col-points">
                  <b>
                    ${esc(
                      row.seasonPoints
                    )}
                  </b>
                </td>

                <td class="col-weight">
                  ${esc(
                    fmtKg(
                      row.totalWeight
                    )
                  )}
                </td>

                <td
                  class="col-big"
                  data-season-big="${
                    row.bigFish
                  }"
                >
                  ${esc(
                    fmtKg(
                      row.bigFish
                    )
                  )}
                </td>
              </tr>
            `;
          }
        )
        .join("");
  }

  // =========================================================
  // PODIUM
  // =========================================================

  function renderPodium(rows) {
    for (
      let place = 1;
      place <= 3;
      place++
    ) {
      const row =
        rows[
          place - 1
        ];

      const teamEl =
        $(
          `seasonWinner${place}Team`
        );

      const pointsEl =
        $(
          `seasonWinner${place}Points`
        );

      if (teamEl) {
        teamEl.textContent =
          row
            ? row.team
            : "—";
      }

      if (pointsEl) {
        pointsEl.textContent =
          row
            ? `${
                row.seasonPoints
              } бал. · ${
                fmtKg(
                  row.totalWeight
                )
              } кг`
            : "—";
      }
    }
  }

  // =========================================================
  // BIG FISH
  // =========================================================

  function getBigFishWinners(
    stats
  ) {
    const teams =
      Array.isArray(stats)
        ? stats
        : [];

    const weight =
      teams.reduce(
        (max, row) =>
          Math.max(
            max,
            num(
              row.bigFish
            )
          ),
        0
      );

    if (weight <= 0) {
      return {
        weight: 0,
        winners: []
      };
    }

    return {
      weight,

      winners:
        teams.filter(
          row =>
            num(
              row.bigFish
            ) === weight
        )
    };
  }

  function renderSeasonBigFish(
    stats
  ) {
    const teamEl =
      $("seasonBigFishTeam");

    const metaEl =
      $("seasonBigFishMeta");

    const weightEl =
      $("seasonBigFishWeight");

    const result =
      getBigFishWinners(
        stats
      );

    if (
      result.weight <= 0
    ) {
      if (teamEl) {
        teamEl.textContent =
          "—";
      }

      if (metaEl) {
        metaEl.textContent =
          "Дані відсутні";
      }

      if (weightEl) {
        weightEl.textContent =
          "—";
      }

      return;
    }

    if (teamEl) {
      teamEl.textContent =
        result.winners
          .map(
            row =>
              row.team
          )
          .join(" / ");
    }

    if (metaEl) {
      const stages = [
        ...new Set(
          result.winners
            .map(
              row =>
                row.bigFishStage
            )
            .filter(Boolean)
        )
      ];

      metaEl.textContent =
        stages.length
          ? stages.join(" / ")
          : `Сезон ${SEASON_YEAR}`;
    }

    if (weightEl) {
      weightEl.textContent =
        `${fmtKg(
          result.weight
        )} кг`;
    }

    document
      .querySelectorAll(
        "#seasonFinalRows td.col-big"
      )
      .forEach(
        cell => {
          cell.classList.toggle(
            "season-bigfish-winner",
            num(
              cell.dataset
                .seasonBig
            ) ===
              result.weight
          );
        }
      );
  }

  function updateTitles() {
    const kicker =
      $("seasonRatingKicker");

    const title =
      $("seasonRatingTitle");

    if (kicker) {
      kicker.textContent =
        `СЕЗОН ${SEASON_YEAR}`;
    }

    if (title) {
      title.textContent =
        "Рейтинг команд сезону";
    }
  }

  // =========================================================
  // BUILD PAYLOAD
  // =========================================================

  async function buildPayload(
    db,
    rating
  ) {
    const candidateStages =
      getCandidateStages(
        rating
      );

    if (
      !candidateStages.length
    ) {
      throw new Error(
        "У seasonRating немає archivedStages."
      );
    }

    const stageMaps =
      await loadStageMaps(
        db,
        candidateStages
      );

    const structure =
      resolveStageStructure(
        rating,
        candidateStages,
        stageMaps
      );

    const {
      regularStages,
      finalStage,
      allStages
    } = structure;

    const rawTeams =
      Array.isArray(
        rating.teams
      )
        ? rating.teams.slice()
        : [];

    const finalists =
      getFinalists(
        rawTeams,
        regularStages,
        stageMaps
      );

    const rows =
      buildSeasonRanking(
        finalists,
        regularStages,
        finalStage,
        stageMaps
      );

    const participantsMap =
      new Map();

    collectAllSeasonParticipants(
      allStages,
      stageMaps
    ).forEach(
      team => {
        const key =
          teamKey(team);

        if (key) {
          participantsMap.set(
            key,
            team
          );
        }
      }
    );

    rawTeams.forEach(
      team => {
        const key =
          teamKey(team);

        if (
          key &&
          !participantsMap.has(
            key
          )
        ) {
          participantsMap.set(
            key,
            team
          );
        }
      }
    );

    const allParticipantsStats =
      buildAllParticipantsStats(
        [
          ...participantsMap.values()
        ],
        regularStages,
        finalStage,
        stageMaps
      );

    return {
      regularStages,
      finalStage,
      allStages,
      rows,
      allParticipantsStats,

      stageSummaries:
        buildStageArchiveSummaries(
          allStages,
          stageMaps
        ),

      stageMaps
    };
  }

  // =========================================================
  // RENDER
  // =========================================================

  function renderPayload(
    payload
  ) {
    currentPayload =
      payload;

    const regularStages =
      Array.isArray(
        payload.regularStages
      )
        ? payload.regularStages
        : [];

    const rows =
      Array.isArray(
        payload.rows
      )
        ? payload.rows
        : [];

    buildHeader(
      regularStages
    );

    renderTable(
      rows,
      regularStages
    );

    renderPodium(
      rows
    );

    renderSeasonBigFish(
      payload
        .allParticipantsStats ||
      []
    );

    updateTitles();

    renderAdminArchivePanel();

    if (!rows.length) {
      showError(
        "⚠️ Немає команд для підсумкового рейтингу."
      );
    } else {
      hideError();
    }

    setReady();
  }

  // =========================================================
  // ADMIN CSS
  // =========================================================

  function injectAdminArchiveStyles() {
    if (
      $(
        "seasonArchiveAdminStyles"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "seasonArchiveAdminStyles";

    style.textContent = `
      .season-archive-admin{
        position:relative;
        z-index:100;
        isolation:isolate;
        margin-top:28px;
        padding:18px;
        border-radius:18px;
        border:1px solid rgba(245,158,11,.42);
        background:#0b0d14;
        box-shadow:0 16px 36px rgba(0,0,0,.42);
        pointer-events:auto !important;
      }

      .season-archive-admin__title{
        font-size:1.05rem;
        font-weight:950;
        color:#fbbf24;
      }

      .season-archive-admin__text{
        margin-top:8px;
        color:#cbd5e1;
        font-size:.86rem;
        line-height:1.55;
      }

      .season-archive-admin__warning{
        margin-top:10px;
        color:#fca5a5;
        font-size:.8rem;
        line-height:1.5;
      }

      .season-archive-admin__button{
        display:block;
        position:relative;
        z-index:999;
        width:100%;
        margin-top:14px;
        padding:14px 16px;
        border:1px solid rgba(251,191,36,.55);
        border-radius:14px;
        background:linear-gradient(
          90deg,
          #facc15,
          #f97316
        );
        color:#111827;
        font-size:.95rem;
        font-weight:950;
        cursor:pointer;
        pointer-events:auto !important;
        touch-action:manipulation;
        -webkit-tap-highlight-color:transparent;
        user-select:none;
      }

      .season-archive-admin__button:disabled{
        cursor:not-allowed;
        opacity:.55;
      }

      .season-archive-admin__status{
        display:none;
        margin-top:12px;
        padding:11px 12px;
        border-radius:12px;
        background:rgba(15,23,42,.75);
        border:1px solid rgba(148,163,184,.16);
        color:#cbd5e1;
        font-size:.82rem;
        line-height:1.45;
      }

      .season-archive-admin__status.is-success{
        display:block;
        color:#86efac;
        border-color:rgba(34,197,94,.35);
      }

      .season-archive-admin__status.is-error{
        display:block;
        color:#fca5a5;
        border-color:rgba(239,68,68,.35);
      }

      .season-archive-admin__status.is-working{
        display:block;
        color:#fde68a;
        border-color:rgba(250,204,21,.30);
      }
    `;

    document.head
      .appendChild(style);
  }

  function setArchiveStatus(
    message,
    type = ""
  ) {
    const box =
      $("seasonArchiveStatus");

    if (!box) {
      return;
    }

    box.className =
      "season-archive-admin__status";

    if (type) {
      box.classList.add(
        `is-${type}`
      );
    }

    box.textContent =
      message;

    box.style.display =
      message
        ? "block"
        : "none";
  }

  // =========================================================
  // PERMANENT ARCHIVE BUTTON HANDLER
  // =========================================================

  function installArchiveButtonHandler() {
    if (
      archiveDelegatedHandlerInstalled
    ) {
      return;
    }

    archiveDelegatedHandlerInstalled =
      true;

    document.addEventListener(
      "click",
      async event => {
        const target =
          event.target;

        if (
          !target ||
          typeof target.closest !==
            "function"
        ) {
          return;
        }

        const button =
          target.closest(
            "#archiveSeasonButton"
          );

        if (!button) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (
          archiveInProgress ||
          button.disabled
        ) {
          return;
        }

        console.log(
          "[Season Archive] CLICK CAPTURED",
          {
            uid:
              currentUser?.uid ||
              null,

            year:
              SEASON_YEAR,

            isAdmin:
              currentUserIsAdmin,

            hasDb:
              Boolean(currentDb),

            hasRating:
              Boolean(
                currentRatingSource
              ),

            hasPayload:
              Boolean(
                currentPayload
              ),

            rows:
              currentPayload
                ?.rows
                ?.length ||
              0,

            finalStage:
              currentPayload
                ?.finalStage
                ?.stageDocId ||
              null
          }
        );

        setArchiveStatus(
          "Кнопка працює. Перевіряємо сезон…",
          "working"
        );

        try {
          await archiveCurrentSeason();
        } catch (error) {
          console.error(
            "[Season Archive] CLICK ERROR",
            error
          );

          archiveInProgress =
            false;

          const liveButton =
            $("archiveSeasonButton");

          if (liveButton) {
            liveButton.disabled =
              false;

            liveButton.textContent =
              `🏆 Архівувати та завершити сезон ${SEASON_YEAR}`;
          }

          const text =
            getArchiveErrorText(
              error
            );

          setArchiveStatus(
            `❌ ${text}`,
            "error"
          );

          window.alert(
            `ПОМИЛКА.\n\n${text}`
          );
        }
      },
      true
    );

    console.log(
      "[Season Archive] delegated click handler installed"
    );
  }

  // =========================================================
  // ADMIN PANEL
  // =========================================================

  function renderAdminArchivePanel() {
    injectAdminArchiveStyles();
    installArchiveButtonHandler();

    let panel =
      $("seasonArchiveAdmin");

    if (
      !currentUserIsAdmin
    ) {
      if (panel) {
        panel.remove();
      }

      return;
    }

    const content =
      document.querySelector(
        ".season-rating-content"
      );

    if (!content) {
      console.error(
        "[Season Archive] .season-rating-content не знайдено."
      );

      return;
    }

    if (!panel) {
      panel =
        document.createElement(
          "section"
        );

      panel.id =
        "seasonArchiveAdmin";

      panel.className =
        "season-archive-admin";

      panel.innerHTML = `
        <div class="season-archive-admin__title">
          🔐 Завершення сезону
        </div>

        <div class="season-archive-admin__text">
          Спочатку буде створена та перевірена
          повна резервна копія сезону
          ${esc(SEASON_YEAR)}.
        </div>

        <div class="season-archive-admin__warning">
          <b>Безпечний порядок:</b><br><br>

          1. Архівуємо рейтинг.<br>
          2. Архівуємо КОЖЕН документ етапу окремо.<br>
          3. Перевіряємо всі архівні копії.<br>
          4. Тільки після цього видаляємо
          seasonResults/${esc(SEASON_YEAR)}.<br>
          5. seasonRating/${esc(SEASON_YEAR)}
          переводимо у стан archived.
        </div>

        <button
          id="archiveSeasonButton"
          class="season-archive-admin__button"
          type="button"
        >
          🏆 Архівувати та завершити сезон ${esc(SEASON_YEAR)}
        </button>

        <div
          id="seasonArchiveStatus"
          class="season-archive-admin__status"
        ></div>
      `;

      content.appendChild(
        panel
      );
    }

    const button =
      $("archiveSeasonButton");

    if (!button) {
      console.error(
        "[Season Archive] button missing"
      );

      return;
    }

    const alreadyArchived =
      currentRatingSource
        ?.archived === true &&
      (
        !Array.isArray(
          currentRatingSource
            ?.teams
        ) ||
        currentRatingSource
          .teams
          .length === 0
      );

    if (alreadyArchived) {
      button.disabled =
        true;

      button.textContent =
        `✅ Сезон ${SEASON_YEAR} завершено`;

      setArchiveStatus(
        `Сезон ${SEASON_YEAR} уже заархівований.`,
        "success"
      );

      return;
    }

    button.disabled =
      archiveInProgress;

    if (!archiveInProgress) {
      button.textContent =
        `🏆 Архівувати та завершити сезон ${SEASON_YEAR}`;
    }

    console.log(
      "[Season Archive] BUTTON READY",
      {
        uid:
          currentUser?.uid ||
          null,

        year:
          SEASON_YEAR,

        hasPayload:
          Boolean(
            currentPayload
          )
      }
    );
  }

  // =========================================================
  // ARCHIVE DATA
  // =========================================================

  function makeArchiveStages(
    payload
  ) {
    return (
      Array.isArray(
        payload
          ?.stageSummaries
      )
        ? payload.stageSummaries
        : []
    ).map(
      stage => ({
        type:
          stage.type,

        isFinal:
          stage.isFinal ===
          true,

        number:
          stage.number ??
          null,

        title:
          String(
            stage.title || ""
          ),

        stageDocId:
          String(
            stage.stageDocId ||
            ""
          ),

        stageId:
          String(
            stage.stageId || ""
          ),

        teamsCount:
          num(
            stage.teamsCount
          ),

        totalWeight:
          num(
            stage.totalWeight
          ),

        bigFish:
          num(
            stage.bigFish
          ),

        totalCount:
          num(
            stage.totalCount
          )
      })
    );
  }

  function buildRankingArchive() {
    return currentPayload
      .rows
      .map(
        row => ({
          place:
            num(
              row.place
            ),

          teamId:
            String(
              row.teamId || ""
            ),

          team:
            String(
              row.team || "—"
            ),

          stages:
            row.regularCells
              .map(
                (
                  cell,
                  index
                ) => {
                  const stage =
                    currentPayload
                      .regularStages[
                        index
                      ];

                  return {
                    stageDocId:
                      String(
                        stage
                          ?.stageDocId ||
                        ""
                      ),

                    stageId:
                      String(
                        stage
                          ?.stageId ||
                        ""
                      ),

                    place:
                      cell.place,

                    points:
                      num(
                        cell.points
                      ),

                    absent:
                      cell.absent ===
                      true
                  };
                }
              ),

          final: {
            stageDocId:
              String(
                currentPayload
                  .finalStage
                  ?.stageDocId ||
                ""
              ),

            stageId:
              String(
                currentPayload
                  .finalStage
                  ?.stageId ||
                ""
              ),

            place:
              row.finalPlace,

            points:
              num(
                row.finalPoints
              ),

            absent:
              row.finalPlace ===
              "—"
          },

          seasonPoints:
            num(
              row.seasonPoints
            ),

          totalWeight:
            num(
              row.totalWeight
            ),

          bigFish:
            num(
              row.bigFish
            ),

          bigFishStage:
            String(
              row.bigFishStage ||
              ""
            )
        })
      );
  }

  // =========================================================
  // READ ALL WORKING DATA
  // =========================================================

  async function readCompleteSeasonSource() {
    if (!currentDb) {
      throw new Error(
        "Firestore не готовий."
      );
    }

    setArchiveStatus(
      "Читаємо всі фактичні документи seasonResults…",
      "working"
    );

    const ratingRef =
      currentDb
        .collection(
          "seasonRating"
        )
        .doc(
          SEASON_YEAR
        );

    const resultsRef =
      currentDb
        .collection(
          "seasonResults"
        )
        .doc(
          SEASON_YEAR
        );

    const stagesRef =
      resultsRef
        .collection(
          "stages"
        );

    const [
      ratingSnap,
      resultsSnap,
      stagesSnap
    ] =
      await Promise.all([
        ratingRef.get(),
        resultsRef.get(),
        stagesRef.get()
      ]);

    if (
      !ratingSnap.exists
    ) {
      throw new Error(
        `seasonRating/${SEASON_YEAR} не знайдено.`
      );
    }

    if (
      stagesSnap.empty
    ) {
      throw new Error(
        `У seasonResults/${SEASON_YEAR}/stages немає документів.`
      );
    }

    const stageDocuments =
      stagesSnap.docs.map(
        doc => ({
          id:
            doc.id,

          data:
            doc.data() || {}
        })
      );

    return {
      rating:
        ratingSnap.data() ||
        {},

      seasonResultsParent:
        resultsSnap.exists
          ? resultsSnap.data() ||
            {}
          : null,

      stageDocuments
    };
  }

  // =========================================================
  // BUILD MAIN ARCHIVE
  // =========================================================

  function buildMainArchiveDocument(
    source
  ) {
    if (
      !currentPayload ||
      !currentPayload
        .finalStage
    ) {
      throw new Error(
        "Фінал сезону не знайдено."
      );
    }

    const ranking =
      buildRankingArchive();

    if (!ranking.length) {
      throw new Error(
        "Рейтинг порожній."
      );
    }

    const stages =
      makeArchiveStages(
        currentPayload
      );

    const finalStage =
      stages.find(
        stage =>
          stage.isFinal ===
          true
      );

    if (!finalStage) {
      throw new Error(
        "Фінал відсутній у зведенні етапів."
      );
    }

    const podium =
      ranking
        .slice(0, 3)
        .map(
          row => ({
            place:
              row.place,

            teamId:
              row.teamId,

            team:
              row.team,

            points:
              row.seasonPoints,

            totalWeight:
              row.totalWeight,

            bigFish:
              row.bigFish
          })
        );

    const bf =
      getBigFishWinners(
        currentPayload
          .allParticipantsStats
      );

    const sourceStages =
      source
        .stageDocuments
        .map(
          stage => ({
            sourceDocId:
              stage.id,

            archiveDocId:
              archiveStageDocId(
                stage.id
              ),

            archivePath:
              `seasonArchives/${
                archiveStageDocId(
                  stage.id
                )
              }`
          })
        );

    return {
      seasonYear:
        SEASON_YEAR,

      status:
        "archived",

      archiveVersion:
        5,

      archiveStorage:
        "split-documents",

      fullSourcePreserved:
        true,

      hasFinal:
        true,

      stagesCount:
        source
          .stageDocuments
          .length,

      ratingStagesCount:
        stages.length,

      finalistsCount:
        ranking.length,

      qualificationRule: {
        bestResults:
          BEST_COUNT_FOR_FINAL,

        absentPoints:
          ABSENT_REGULAR_POINTS,

        topCount:
          TOP_COUNT
      },

      seasonRule: {
        regularStagePoints:
          "zonePlace",

        finalPoints:
          "zonePlace",

        absentFinalPoints:
          ABSENT_FINAL_POINTS,

        sort: [
          "points_asc",
          "weight_desc",
          "bigFish_desc"
        ]
      },

      stages,

      finalStage,

      ranking,

      podium,

      bigFish: {
        weight:
          num(
            bf.weight
          ),

        winners:
          bf.winners.map(
            row => ({
              teamId:
                String(
                  row.teamId ||
                  ""
                ),

              team:
                String(
                  row.team ||
                  "—"
                ),

              stage:
                String(
                  row.bigFishStage ||
                  ""
                )
            })
          )
      },

      allParticipantsBigFish:
        (
          currentPayload
            .allParticipantsStats ||
          []
        ).map(
          row => ({
            teamId:
              String(
                row.teamId ||
                ""
              ),

            team:
              String(
                row.team ||
                "—"
              ),

            bigFish:
              num(
                row.bigFish
              ),

            bigFishStage:
              String(
                row.bigFishStage ||
                ""
              )
          })
        ),

      sourceSnapshots: {
        rating:
          `seasonArchives/${SEASON_YEAR}__rating`,

        seasonResultsParent:
          `seasonArchives/${SEASON_YEAR}__seasonResults`,

        stages:
          sourceStages
      },

      source: {
        seasonRating:
          `seasonRating/${SEASON_YEAR}`,

        seasonResults:
          `seasonResults/${SEASON_YEAR}`,

        seasonResultsStages:
          `seasonResults/${SEASON_YEAR}/stages`
      },

      cleanupPlan: {
        deleteStageDocuments:
          true,

        deleteSeasonResultsParent:
          true,

        closeSeasonRating:
          true
      },

      archivedBy: {
        uid:
          String(
            currentUser?.uid ||
            ""
          ),

        email:
          String(
            currentUser?.email ||
            ""
          )
      },

      archivedAt:
        serverTimestamp()
    };
  }

  // =========================================================
  // WRITE ARCHIVE
  // =========================================================

  async function writeCompleteArchive(
    source,
    mainArchive
  ) {
    const archiveCollection =
      currentDb.collection(
        "seasonArchives"
      );

    setArchiveStatus(
      "Архівуємо оригінальний seasonRating…",
      "working"
    );

    await archiveCollection
      .doc(
        `${SEASON_YEAR}__rating`
      )
      .set(
        {
          archiveType:
            "seasonRating-source",

          seasonYear:
            SEASON_YEAR,

          sourcePath:
            `seasonRating/${SEASON_YEAR}`,

          sourceData:
            source.rating,

          archivedAt:
            serverTimestamp()
        },
        {
          merge: false
        }
      );

    setArchiveStatus(
      "Архівуємо seasonResults parent…",
      "working"
    );

    await archiveCollection
      .doc(
        `${SEASON_YEAR}__seasonResults`
      )
      .set(
        {
          archiveType:
            "seasonResults-parent-source",

          seasonYear:
            SEASON_YEAR,

          sourcePath:
            `seasonResults/${SEASON_YEAR}`,

          sourceExists:
            source
              .seasonResultsParent !==
            null,

          sourceData:
            source
              .seasonResultsParent ||
            {},

          archivedAt:
            serverTimestamp()
        },
        {
          merge: false
        }
      );

    for (
      let start = 0;
      start <
      source.stageDocuments.length;
      start +=
        MAX_BATCH_WRITES
    ) {
      const chunk =
        source
          .stageDocuments
          .slice(
            start,
            start +
              MAX_BATCH_WRITES
          );

      const batch =
        currentDb.batch();

      chunk.forEach(
        stage => {
          const ref =
            archiveCollection
              .doc(
                archiveStageDocId(
                  stage.id
                )
              );

          batch.set(
            ref,
            {
              archiveType:
                "seasonStage-source",

              seasonYear:
                SEASON_YEAR,

              sourcePath:
                `seasonResults/${SEASON_YEAR}/stages/${stage.id}`,

              sourceDocId:
                stage.id,

              sourceData:
                stage.data,

              archivedAt:
                serverTimestamp()
            },
            {
              merge: false
            }
          );
        }
      );

      await batch.commit();

      setArchiveStatus(
        `Архівовано етапів: ${
          Math.min(
            start +
              chunk.length,
            source
              .stageDocuments
              .length
          )
        } / ${
          source
            .stageDocuments
            .length
        }`,
        "working"
      );
    }

    // MAIN archive пишемо останнім.
    await archiveCollection
      .doc(
        SEASON_YEAR
      )
      .set(
        mainArchive,
        {
          merge: false
        }
      );
  }

  // =========================================================
  // VERIFY ARCHIVE
  // =========================================================

  async function verifyCompleteArchive(
    source
  ) {
    setArchiveStatus(
      "Перечитуємо та перевіряємо архів…",
      "working"
    );

    const collection =
      currentDb.collection(
        "seasonArchives"
      );

    const mainSnap =
      await collection
        .doc(
          SEASON_YEAR
        )
        .get();

    if (!mainSnap.exists) {
      throw new Error(
        "Головний архів не знайдено після запису. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    const main =
      mainSnap.data() ||
      {};

    if (
      main.status !==
      "archived"
    ) {
      throw new Error(
        "Архів має неправильний status. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    if (
      main.fullSourcePreserved !==
      true
    ) {
      throw new Error(
        "Архів не підтвердив збереження source. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    if (
      main.hasFinal !== true
    ) {
      throw new Error(
        "У головному архіві немає Фіналу. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    if (
      !Array.isArray(
        main.ranking
      ) ||
      !main.ranking.length
    ) {
      throw new Error(
        "В архіві немає рейтингу. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    if (
      !Array.isArray(
        main.podium
      ) ||
      !main.podium.length
    ) {
      throw new Error(
        "В архіві немає призерів. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    if (
      num(
        main.stagesCount
      ) !==
      source
        .stageDocuments
        .length
    ) {
      throw new Error(
        "Кількість етапів в архіві не збігається з джерелом. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    const ratingSourceSnap =
      await collection
        .doc(
          `${SEASON_YEAR}__rating`
        )
        .get();

    if (
      !ratingSourceSnap.exists
    ) {
      throw new Error(
        "Повна копія seasonRating не знайдена. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    const ratingSourceData =
      ratingSourceSnap.data() ||
      {};

    if (
      ratingSourceData.archiveType !==
      "seasonRating-source" ||
      !ratingSourceData.sourceData ||
      typeof ratingSourceData.sourceData !==
        "object"
    ) {
      throw new Error(
        "Повна копія seasonRating пошкоджена. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    const parentSourceSnap =
      await collection
        .doc(
          `${SEASON_YEAR}__seasonResults`
        )
        .get();

    if (
      !parentSourceSnap.exists
    ) {
      throw new Error(
        "Копія seasonResults parent не знайдена. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    const parentSourceData =
      parentSourceSnap.data() ||
      {};

    if (
      parentSourceData.archiveType !==
      "seasonResults-parent-source"
    ) {
      throw new Error(
        "Копія seasonResults parent некоректна. НІЧОГО НЕ ВИДАЛЕНО."
      );
    }

    for (
      let i = 0;
      i <
      source.stageDocuments.length;
      i++
    ) {
      const stage =
        source.stageDocuments[i];

      const archiveId =
        archiveStageDocId(
          stage.id
        );

      const snap =
        await collection
          .doc(
            archiveId
          )
          .get();

      if (!snap.exists) {
        throw new Error(
          `Не знайдена архівна копія етапу ${stage.id}. НІЧОГО НЕ ВИДАЛЕНО.`
        );
      }

      const data =
        snap.data() ||
        {};

      if (
        data.archiveType !==
        "seasonStage-source"
      ) {
        throw new Error(
          `Некоректний архів етапу ${stage.id}. НІЧОГО НЕ ВИДАЛЕНО.`
        );
      }

      if (
        String(
          data.sourceDocId ||
          ""
        ) !==
        String(stage.id)
      ) {
        throw new Error(
          `Не збігається ID архіву етапу ${stage.id}. НІЧОГО НЕ ВИДАЛЕНО.`
        );
      }

      if (
        !data.sourceData ||
        typeof data.sourceData !==
          "object"
      ) {
        throw new Error(
          `У копії етапу ${stage.id} немає sourceData. НІЧОГО НЕ ВИДАЛЕНО.`
        );
      }

      setArchiveStatus(
        `Перевірено архівів етапів: ${
          i + 1
        } / ${
          source
            .stageDocuments
            .length
        }`,
        "working"
      );
    }

    return main;
  }

  // =========================================================
  // DELETE WORKING RESULTS
  // =========================================================

  async function deleteWorkingSeasonResults(
    expectedStageCount
  ) {
    const seasonRef =
      currentDb
        .collection(
          "seasonResults"
        )
        .doc(
          SEASON_YEAR
        );

    const stagesRef =
      seasonRef
        .collection(
          "stages"
        );

    // Ще раз перечитуємо source
    // безпосередньо перед DELETE.
    const freshSnap =
      await stagesRef.get();

    if (
      freshSnap.size !==
      expectedStageCount
    ) {
      throw new Error(
        `Перед видаленням змінилась кількість етапів: ` +
        `було ${expectedStageCount}, стало ${freshSnap.size}. ` +
        `ВИДАЛЕННЯ ЗУПИНЕНО.`
      );
    }

    let deleted = 0;

    for (
      let start = 0;
      start <
      freshSnap.docs.length;
      start +=
        MAX_BATCH_WRITES
    ) {
      const docs =
        freshSnap.docs.slice(
          start,
          start +
            MAX_BATCH_WRITES
        );

      const batch =
        currentDb.batch();

      docs.forEach(
        doc => {
          batch.delete(
            doc.ref
          );
        }
      );

      await batch.commit();

      deleted +=
        docs.length;

      setArchiveStatus(
        `Видалено робочих етапів: ${deleted} / ${freshSnap.size}`,
        "working"
      );
    }

    // Firestore НЕ видаляє parent
    // автоматично після видалення subcollection.
    await seasonRef.delete();

    return deleted;
  }

  async function verifyWorkingResultsDeleted() {
    const seasonRef =
      currentDb
        .collection(
          "seasonResults"
        )
        .doc(
          SEASON_YEAR
        );

    const [
      parentSnap,
      stageSnap
    ] =
      await Promise.all([
        seasonRef.get(),

        seasonRef
          .collection(
            "stages"
          )
          .limit(1)
          .get()
      ]);

    return (
      !parentSnap.exists &&
      stageSnap.empty
    );
  }

  // =========================================================
  // CLOSE RATING
  // =========================================================

  async function closeWorkingRating() {
    const ratingRef =
      currentDb
        .collection(
          "seasonRating"
        )
        .doc(
          SEASON_YEAR
        );

    await ratingRef.set(
      {
        seasonYear:
          SEASON_YEAR,

        archived:
          true,

        status:
          "archived",

        archivedTo:
          `seasonArchives/${SEASON_YEAR}`,

        archivedAt:
          serverTimestamp(),

        nextSeasonYear:
          NEXT_SEASON_YEAR,

        archivedStages:
          [],

        teams:
          [],

        finalStageId:
          "",

        finalStageDocId:
          "",

        finalStageKey:
          "",

        seasonResultsCleared:
          true,

        source:
          "season-closed"
      },
      {
        merge: false
      }
    );

    const verify =
      await ratingRef.get();

    if (!verify.exists) {
      throw new Error(
        "seasonRating не знайдено після закриття."
      );
    }

    const data =
      verify.data() || {};

    if (
      data.archived !== true
    ) {
      throw new Error(
        "seasonRating не отримав archived:true."
      );
    }

    if (
      Array.isArray(
        data.teams
      ) &&
      data.teams.length
    ) {
      throw new Error(
        "teams у seasonRating не очищено."
      );
    }

    if (
      Array.isArray(
        data.archivedStages
      ) &&
      data
        .archivedStages
        .length
    ) {
      throw new Error(
        "archivedStages у seasonRating не очищено."
      );
    }
  }

  // =========================================================
  // CACHE
  // =========================================================

  function clearRatingCaches() {
    try {
      const keys = [];

      for (
        let i = 0;
        i <
        localStorage.length;
        i++
      ) {
        const key =
          localStorage.key(i);

        if (
          key &&
          (
            key.startsWith(
              "sc_rating_cache"
            ) ||
            key.startsWith(
              "sc_season_rating"
            )
          )
        ) {
          keys.push(key);
        }
      }

      keys.forEach(
        key =>
          localStorage
            .removeItem(key)
      );
    } catch (error) {
      console.warn(
        "[Season Archive] cache",
        error
      );
    }
  }

  // =========================================================
  // ERROR TEXT
  // =========================================================

  function getArchiveErrorText(
    error
  ) {
    const code =
      String(
        error?.code || ""
      );

    const message =
      String(
        error?.message ||
        error ||
        "Невідома помилка"
      );

    if (
      code.includes(
        "permission-denied"
      )
    ) {
      return (
        "Firestore заборонив операцію. " +
        `Поточний UID: ${
          currentUser?.uid ||
          "немає"
        }. ` +
        `UID адміністратора у Rules: ${FIRESTORE_ADMIN_UID}. ` +
        `[${code}]`
      );
    }

    if (
      code.includes(
        "unauthenticated"
      )
    ) {
      return (
        "Firebase не бачить авторизованого адміністратора. " +
        `[${code}]`
      );
    }

    if (
      code.includes(
        "resource-exhausted"
      )
    ) {
      return (
        "Firestore перевищив допустимий ліміт операції. " +
        `[${code}]`
      );
    }

    if (
      code.includes(
        "invalid-argument"
      )
    ) {
      return (
        `Firestore відхилив дані: ${message} ` +
        `[${code}]`
      );
    }

    if (
      code.includes(
        "unavailable"
      )
    ) {
      return (
        "Firestore тимчасово недоступний. " +
        `[${code}]`
      );
    }

    return code
      ? `${message} [${code}]`
      : message;
  }

  // =========================================================
  // ARCHIVE CURRENT SEASON
  // =========================================================

  async function archiveCurrentSeason() {
    if (archiveInProgress) {
      return;
    }

    console.log(
      "[Season Archive] START",
      {
        year:
          SEASON_YEAR,

        uid:
          currentUser?.uid ||
          null,

        isAdmin:
          currentUserIsAdmin
      }
    );

    if (!currentUser) {
      throw new Error(
        "Адміністратор не авторизований."
      );
    }

    if (
      currentUser.uid !==
      FIRESTORE_ADMIN_UID
    ) {
      throw new Error(
        `Цей акаунт не має права завершувати сезон. ` +
        `Поточний UID: ${currentUser.uid}`
      );
    }

    if (
      !currentUserIsAdmin
    ) {
      throw new Error(
        "Немає прав адміністратора."
      );
    }

    if (!currentDb) {
      throw new Error(
        "Firestore ще не готовий."
      );
    }

    if (
      !currentPayload ||
      !Array.isArray(
        currentPayload.rows
      ) ||
      !currentPayload
        .rows
        .length
    ) {
      throw new Error(
        "Немає готового рейтингу для архівації."
      );
    }

    if (
      !currentPayload
        .finalStage
    ) {
      throw new Error(
        `Фінал сезону ${SEASON_YEAR} не знайдено.`
      );
    }

    // Спочатку читаємо ФАКТИЧНІ
    // робочі дані Firestore.
    const source =
      await readCompleteSeasonSource();

    const stageNames =
      source
        .stageDocuments
        .map(
          item =>
            `• ${item.id}`
        )
        .join("\n");

    const confirmed =
      window.confirm(
        `ЗАВЕРШИТИ СЕЗОН ${SEASON_YEAR}?\n\n` +

        `Знайдено фактичних документів етапів: ` +
        `${source.stageDocuments.length}\n\n` +

        `${stageNames}\n\n` +

        `Спочатку буде створена ПОВНА резервна копія.\n\n` +

        `Після перевірки архіву буде видалено:\n` +
        `• seasonResults/${SEASON_YEAR}/stages/*\n` +
        `• seasonResults/${SEASON_YEAR}\n\n` +

        `seasonRating/${SEASON_YEAR} буде очищено ` +
        `та позначено archived:true.\n\n` +

        `Продовжити?`
      );

    if (!confirmed) {
      setArchiveStatus(
        "Архівацію скасовано.",
        ""
      );

      return;
    }

    const finalConfirm =
      window.confirm(
        `ОСТАННЄ ПІДТВЕРДЖЕННЯ\n\n` +

        `Сезон: ${SEASON_YEAR}\n` +
        `Етапів: ${source.stageDocuments.length}\n` +
        `Фінал: ${
          currentPayload
            .finalStage
            .stageDocId
        }\n\n` +

        `Видалення почнеться ТІЛЬКИ після ` +
        `успішної перевірки всіх архівних копій.\n\n` +

        `Виконати?`
      );

    if (!finalConfirm) {
      setArchiveStatus(
        "Завершення сезону скасовано.",
        ""
      );

      return;
    }

    archiveInProgress =
      true;

    const button =
      $("archiveSeasonButton");

    if (button) {
      button.disabled =
        true;

      button.textContent =
        "⏳ Архівуємо сезон…";
    }

    try {
      const archiveRef =
        currentDb
          .collection(
            "seasonArchives"
          )
          .doc(
            SEASON_YEAR
          );

      const existing =
        await archiveRef.get();

      if (existing.exists) {
        const overwrite =
          window.confirm(
            `seasonArchives/${SEASON_YEAR} уже існує.\n\n` +
            `Перезаписати архів актуальними даними?`
          );

        if (!overwrite) {
          archiveInProgress =
            false;

          if (button) {
            button.disabled =
              false;

            button.textContent =
              `🏆 Архівувати та завершити сезон ${SEASON_YEAR}`;
          }

          setArchiveStatus(
            "Скасовано. Робочі дані не видалялися.",
            ""
          );

          return;
        }
      }

      const mainArchive =
        buildMainArchiveDocument(
          source
        );

      setArchiveStatus(
        "Створюємо повну резервну копію сезону…",
        "working"
      );

      await writeCompleteArchive(
        source,
        mainArchive
      );

      if (button) {
        button.textContent =
          "⏳ Перевіряємо архів…";
      }

      await verifyCompleteArchive(
        source
      );

      console.log(
        "[Season Archive] FULL ARCHIVE VERIFIED"
      );

      setArchiveStatus(
        "✅ Архів повністю перевірено. Видаляємо робочі seasonResults…",
        "working"
      );

      if (button) {
        button.textContent =
          "⏳ Видаляємо робочі дані…";
      }

      const deletedStages =
        await deleteWorkingSeasonResults(
          source
            .stageDocuments
            .length
        );

      const resultsDeleted =
        await verifyWorkingResultsDeleted();

      if (!resultsDeleted) {
        throw new Error(
          "Архів збережено, але seasonResults очистився не повністю. " +
          "seasonRating НЕ буде очищено."
        );
      }

      setArchiveStatus(
        "seasonResults очищено. Закриваємо seasonRating…",
        "working"
      );

      if (button) {
        button.textContent =
          "⏳ Закриваємо рейтинг…";
      }

      await closeWorkingRating();

      clearRatingCaches();

      archiveInProgress =
        false;

      setArchiveStatus(
        `✅ Сезон ${SEASON_YEAR} повністю завершено. ` +
        `Архів створено та перевірено.`,
        "success"
      );

      if (button) {
        button.disabled =
          true;

        button.textContent =
          `✅ Сезон ${SEASON_YEAR} завершено`;
      }

      window.alert(
        `ГОТОВО.\n\n` +

        `СЕЗОН ${SEASON_YEAR} ЗАВЕРШЕНО.\n\n` +

        `ЗБЕРЕЖЕНО:\n` +
        `• seasonArchives/${SEASON_YEAR}\n` +
        `• повний seasonRating\n` +
        `• повний seasonResults parent\n` +
        `• окрема повна копія кожного етапу\n` +
        `• рейтинг\n` +
        `• TOP-3\n` +
        `• Big Fish\n` +
        `• Фінал\n\n` +

        `ВИДАЛЕНО:\n` +
        `• seasonResults/${SEASON_YEAR}/stages/*\n` +
        `• seasonResults/${SEASON_YEAR}\n\n` +

        `ЗАКРИТО:\n` +
        `• seasonRating/${SEASON_YEAR}\n\n` +

        `Видалено етапів: ${deletedStages}.`
      );

    } catch (error) {
      console.error(
        "[Season Archive] ERROR",
        error
      );

      archiveInProgress =
        false;

      const errorText =
        getArchiveErrorText(
          error
        );

      setArchiveStatus(
        `❌ ${errorText}`,
        "error"
      );

      if (button) {
        button.disabled =
          false;

        button.textContent =
          `🏆 Архівувати та завершити сезон ${SEASON_YEAR}`;
      }

      window.alert(
        `НЕ ВДАЛОСЯ ЗАВЕРШИТИ СЕЗОН.\n\n` +

        `${errorText}\n\n` +

        `Якщо архів уже був створений, ` +
        `він залишився у seasonArchives.\n\n` +

        `Код не переходить до видалення робочих даних, ` +
        `доки архів не пройде перевірку.`
      );
    }
  }

  // =========================================================
  // LOAD
  // =========================================================

  async function loadSeasonRating() {
    hideError();

    // Встановлюємо обробник одразу.
    // Він не залежить від того,
    // коли буде створена кнопка.
    installArchiveButtonHandler();

    try {
      const db =
        await waitReady();

      await initAdminAccess(
        db
      );

      if (
        typeof ratingUnsubscribe ===
        "function"
      ) {
        ratingUnsubscribe();
      }

      ratingUnsubscribe =
        db
          .collection(
            "seasonRating"
          )
          .doc(
            SEASON_YEAR
          )
          .onSnapshot(
            async snap => {
              if (!snap.exists) {
                currentRatingSource =
                  null;

                currentPayload =
                  null;

                showError(
                  `⚠️ Немає документа seasonRating/${SEASON_YEAR}`
                );

                renderAdminArchivePanel();

                setReady();

                return;
              }

              try {
                const rating =
                  snap.data() ||
                  {};

                currentRatingSource =
                  rating;

                // =================================================
                // SEASON CLOSED
                // =================================================

                if (
                  rating.archived ===
                    true &&
                  (
                    !Array.isArray(
                      rating.teams
                    ) ||
                    !rating
                      .teams
                      .length
                  )
                ) {
                  currentPayload = {
                    regularStages:
                      [],

                    finalStage:
                      null,

                    allStages:
                      [],

                    rows:
                      [],

                    allParticipantsStats:
                      [],

                    stageSummaries:
                      [],

                    stageMaps:
                      new Map()
                  };

                  buildHeader([]);

                  renderTable(
                    [],
                    []
                  );

                  renderPodium([]);

                  renderSeasonBigFish(
                    []
                  );

                  updateTitles();

                  showError(
                    `✅ Сезон ${esc(
                      SEASON_YEAR
                    )} завершений та заархівований. ` +
                    `Архів: ${esc(
                      rating.archivedTo ||
                      `seasonArchives/${SEASON_YEAR}`
                    )}`
                  );

                  renderAdminArchivePanel();

                  setReady();

                  return;
                }

                const payload =
                  await buildPayload(
                    db,
                    rating
                  );

                renderPayload(
                  payload
                );

              } catch (error) {
                console.error(
                  "[Season Rating] BUILD ERROR",
                  error
                );

                showError(
                  `⚠️ Помилка формування рейтингу сезону: ${esc(
                    error.message ||
                    error
                  )}`
                );

                renderAdminArchivePanel();

                setReady();
              }
            },

            error => {
              console.error(
                "[Season Rating] SNAPSHOT ERROR",
                error
              );

              showError(
                `⚠️ Помилка читання seasonRating/${SEASON_YEAR}: ${esc(
                  error.message ||
                  error
                )}`
              );

              setReady();
            }
          );

    } catch (error) {
      console.error(
        "[Season Rating] LOAD ERROR",
        error
      );

      showError(
        `⚠️ Помилка завантаження: ${esc(
          error.message ||
          error
        )}`
      );

      setReady();
    }
  }

  // =========================================================
  // PUBLIC REFRESH
  // =========================================================

  window.refreshSeasonRating =
    function () {
      window.location.reload();
    };

  // =========================================================
  // CLEANUP
  // =========================================================

  window.addEventListener(
    "beforeunload",
    () => {
      if (
        typeof ratingUnsubscribe ===
        "function"
      ) {
        ratingUnsubscribe();
      }

      if (
        typeof authUnsubscribe ===
        "function"
      ) {
        authUnsubscribe();
      }
    },
    {
      once: true
    }
  );

  // =========================================================
  // START
  // =========================================================

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      loadSeasonRating,
      {
        once: true
      }
    );
  } else {
    loadSeasonRating();
  }

})();

// assets/js/final_qualification.js
// STOLAR CARP • Автоматичне формування фіналістів
//
// =========================================================
// ПРИЗНАЧЕННЯ
// =========================================================
//
// Скрипт автоматично підтримує фінальну кваліфікацію
// ОКРЕМО ДЛЯ КОЖНОГО СЕЗОНУ.
//
// Firestore:
//
// finalQualifications/{year}
// finalQualifications/{year}/teams/{teamId}
//
// Наприклад:
//
// finalQualifications/2026/teams/TEAM_ID
// finalQualifications/2027/teams/TEAM_ID
// finalQualifications/2028/teams/TEAM_ID
//
// =========================================================
// ЛОГІКА
// =========================================================
//
// • читає seasonRating/{year};
// • бере рейтинг команд;
// • перші 18 активних команд -> invited;
// • нижчі -> reserve;
// • declined пропускається;
// • якщо хтось із TOP-18 declined:
//      наступна команда автоматично стає invited;
// • confirmed зберігається;
// • declined зберігається;
// • rank оновлюється;
// • сезони НЕ змішуються;
// • 2026 / 2027 / 2028 / ... окремі;
//
// =========================================================
// ВАЖЛИВО
// =========================================================
//
// Скрипт виконує WRITE у Firestore.
// Тому запускаємо його тільки під ADMIN.
//
// Якщо користувач не admin —
// скрипт нічого не записує.
//
// =========================================================

(function () {
  "use strict";

  const LOG =
    "[STOLAR CARP final_qualification]";

  // =========================================================
  // CONFIG
  // =========================================================

  const TOP_COUNT = 18;

  const BEST_COUNT = 2;

  const ABSENT_POINTS = 8;

  const QUALIFICATIONS_COLLECTION =
    "finalQualifications";

  const RATING_COLLECTION =
    "seasonRating";

  const RESULTS_COLLECTION =
    "seasonResults";

  const COMPETITIONS_COLLECTION =
    "competitions";

  const ADMIN_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  // Не використовуємо batch на 500 операцій.
  // Залишаємо запас.
  const BATCH_LIMIT = 400;

  // =========================================================
  // FIREBASE STATE
  // =========================================================

  let auth = null;
  let db = null;
  let fb = null;

  let currentUser = null;

  let unsubscribeRatings = null;

  /*
   * По одному listener на:
   *
   * finalQualifications/{year}/teams
   */
  const qualificationListeners =
    new Map();

  /*
   * Захист від одночасного sync одного року.
   */
  const syncStateByYear =
    new Map();

  /*
   * Кеш competition info.
   */
  let competitionsCache =
    null;

  let competitionsCacheAt =
    0;

  const COMPETITIONS_CACHE_MS =
    60 * 1000;

  // =========================================================
  // HELPERS
  // =========================================================

  function normalize(value) {
    return String(
      value ?? ""
    ).trim();
  }

  function clean(value) {
    return normalize(value)
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function num(value) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function serverTimestamp() {
    return fb
      .firestore
      .FieldValue
      .serverTimestamp();
  }

  function isValidYear(value) {
    return /^\d{4}$/.test(
      normalize(value)
    );
  }

  function isAdminUser(user) {
    return Boolean(
      user &&
      user.uid === ADMIN_UID
    );
  }

  function sleep(ms) {
    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );
  }

  // =========================================================
  // FIREBASE READY
  // =========================================================

  async function waitFirebase(
    maxMs = 15000
  ) {
    const startedAt =
      Date.now();

    while (
      Date.now() -
        startedAt <
      maxMs
    ) {
      if (
        window.scAuth &&
        window.scDb &&
        window.firebase
      ) {
        return;
      }

      await sleep(100);
    }

    throw new Error(
      "Firebase не готовий."
    );
  }

  // =========================================================
  // FINAL DETECTOR
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
          stage.title || ""
        } ${
          stage.name || ""
        } ${
          stage.type || ""
        } ${
          stage.stageType || ""
        }`
      );

    return (
      stage.isFinal === true ||
      raw.includes("final") ||
      raw.includes("фінал")
    );
  }

  // =========================================================
  // REGULAR ARCHIVED STAGES
  // =========================================================

  function stageSortValue(stage) {
    const raw =
      normalize(
        stage.stageId ||
        stage.stageDocId ||
        stage.id
      );

    const match =
      raw.match(
        /(\d+)/
      );

    return match
      ? Number(
          match[1]
        )
      : 999999;
  }

  function getRegularArchivedStages(
    rating
  ) {
    const archived =
      Array.isArray(
        rating?.archivedStages
      )
        ? rating.archivedStages
        : [];

    return archived
      .map(item => {

        if (
          typeof item ===
          "string"
        ) {
          return {
            stageDocId:
              item,

            stageId:
              item,

            stageName:
              item,

            isFinal:
              false
          };
        }

        return {
          stageDocId:
            normalize(
              item?.stageDocId ||
              item?.id
            ),

          stageId:
            normalize(
              item?.stageId ||
              item?.stageDocId ||
              item?.id
            ),

          stageName:
            normalize(
              item?.stageName ||
              item?.title ||
              item?.name ||
              item?.stageId ||
              item?.stageDocId
            ),

          type:
            normalize(
              item?.type
            ),

          stageType:
            normalize(
              item?.stageType
            ),

          isFinal:
            item?.isFinal ===
            true
        };
      })
      .filter(stage =>
        Boolean(
          stage.stageDocId
        )
      )
      .filter(stage =>
        !isFinalStage(
          stage
        )
      )
      .sort(
        (a, b) =>
          stageSortValue(a) -
          stageSortValue(b)
      );
  }

  // =========================================================
  // NORMALIZE ARCHIVED STANDING
  // =========================================================

  function normalizeStandingRow(
    row
  ) {
    return {
      teamId:
        normalize(
          row?.teamId
        ),

      team:
        normalize(
          row?.team ||
          row?.teamName
        ),

      zone:
        normalize(
          row?.zone
        ).toUpperCase(),

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
        )
    };
  }

  // =========================================================
  // STAGE MAP
  // =========================================================

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

    [
      "A",
      "B",
      "C"
    ].forEach(zone => {

      const zoneRows =
        rows
          .filter(
            row =>
              row.zone ===
              zone
          )
          .sort(
            (a, b) => {

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
                String(
                  b.team
                ),
                "uk"
              );
            }
          );

      zoneRows.forEach(
        (
          row,
          index
        ) => {

          const zonePlace =
            row.zonePlace ||
            index + 1;

          const fixed = {
            ...row,

            zonePlace,

            points:
              zonePlace
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
    });

    /*
     * Дані без A/B/C.
     */
    rows
      .filter(
        row =>
          ![
            "A",
            "B",
            "C"
          ].includes(
            row.zone
          )
      )
      .forEach(row => {

        const fixed = {
          ...row,

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
      });

    return {
      byTeamId,
      byTeamName
    };
  }

  // =========================================================
  // LOAD ARCHIVED STAGES
  // =========================================================

  async function loadArchiveStageMaps(
    seasonYear,
    regularStages
  ) {
    const result =
      new Map();

    await Promise.all(
      regularStages.map(
        async stage => {

          try {

            const snapshot =
              await db
                .collection(
                  RESULTS_COLLECTION
                )
                .doc(
                  seasonYear
                )
                .collection(
                  "stages"
                )
                .doc(
                  stage.stageDocId
                )
                .get();

            if (
              !snapshot.exists
            ) {
              return;
            }

            const data =
              snapshot.data() ||
              {};

            result.set(
              stage.stageDocId,
              computeStageMap(
                Array.isArray(
                  data.standings
                )
                  ? data.standings
                  : []
              )
            );

          } catch (
            error
          ) {

            console.warn(
              LOG,
              seasonYear,
              "не вдалося прочитати stage",
              stage.stageDocId,
              error
            );
          }
        }
      )
    );

    return result;
  }

  // =========================================================
  // TEAM STAGE RESULT
  // =========================================================

  function findArchiveRowForTeam(
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
      normalize(
        team.teamId
      );

    const teamName =
      clean(
        team.team ||
        team.teamName
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

  function readRegularStageResult(
    team,
    stage,
    archiveMaps
  ) {
    if (
      isFinalStage(
        stage
      )
    ) {
      return null;
    }

    const archiveMap =
      archiveMaps.get(
        stage.stageDocId
      );

    const archiveRow =
      findArchiveRowForTeam(
        archiveMap,
        team
      );

    if (
      archiveRow
    ) {
      const place =
        num(
          archiveRow.zonePlace ||
          archiveRow.points
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
            archiveRow.totalWeight
          ),

        bigFish:
          num(
            archiveRow.bigFish
          )
      };
    }

    /*
     * Fallback:
     * seasonRating.teams[].stages
     */
    const stages =
      team?.stages ||
      {};

    const stageData =
      stages[
        stage.stageDocId
      ] ||
      stages[
        stage.stageId
      ] ||
      null;

    if (!stageData) {
      return null;
    }

    const place =
      num(
        stageData.zonePlace ||
        stageData.points ||
        stageData.place
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
          stageData.totalWeight
        ),

      bigFish:
        num(
          stageData.bigFish
        )
    };
  }

  // =========================================================
  // BEST RESULTS
  // =========================================================

  function calculateTeamRating(
    team,
    regularStages,
    archiveMaps
  ) {
    const results =
      regularStages.map(
        stage => {

          const result =
            readRegularStageResult(
              team,
              stage,
              archiveMaps
            );

          if (
            result
          ) {
            return {
              stageDocId:
                stage.stageDocId,

              points:
                result.points,

              totalWeight:
                result.totalWeight,

              bigFish:
                result.bigFish
            };
          }

          return {
            stageDocId:
              stage.stageDocId,

            points:
              ABSENT_POINTS,

            totalWeight:
              0,

            bigFish:
              0
          };
        }
      );

    /*
     * Менше points = краще.
     */
    const sorted =
      results
        .slice()
        .sort(
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

    const counted =
      sorted.slice(
        0,
        BEST_COUNT
      );

    const ratingPoints =
      counted.reduce(
        (sum, row) =>
          sum +
          num(
            row.points
          ),
        0
      );

    let totalWeight =
      0;

    let bigFish =
      0;

    regularStages.forEach(
      stage => {

        const result =
          readRegularStageResult(
            team,
            stage,
            archiveMaps
          );

        if (
          result
        ) {
          totalWeight +=
            num(
              result.totalWeight
            );

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

    return {
      ratingPoints,
      totalWeight,
      bigFish
    };
  }

  // =========================================================
  // RANK TEAMS
  // =========================================================

  async function buildSeasonRanking(
    seasonYear,
    rating
  ) {
    const regularStages =
      getRegularArchivedStages(
        rating
      );

    const teams =
      Array.isArray(
        rating?.teams
      )
        ? rating.teams
            .slice()
        : [];

    if (
      !regularStages.length
    ) {
      return [];
    }

    const archiveMaps =
      await loadArchiveStageMaps(
        seasonYear,
        regularStages
      );

    const ranked =
      teams
        .map(team => {

          const teamId =
            normalize(
              team?.teamId
            );

          const teamName =
            normalize(
              team?.team ||
              team?.teamName
            );

          /*
           * teamId обов'язковий,
           * бо registration працює
           * саме через teamId.
           */
          if (!teamId) {
            console.warn(
              LOG,
              seasonYear,
              "команда без teamId пропущена:",
              teamName
            );

            return null;
          }

          const ratingInfo =
            calculateTeamRating(
              team,
              regularStages,
              archiveMaps
            );

          return {
            teamId,

            teamName:
              teamName ||
              "Команда",

            ratingPoints:
              ratingInfo.ratingPoints,

            totalWeight:
              ratingInfo.totalWeight,

            bigFish:
              ratingInfo.bigFish
          };
        })
        .filter(Boolean);

    ranked.sort(
      (a, b) => {

        /*
         * 1. Менше балів.
         */
        if (
          a.ratingPoints !==
          b.ratingPoints
        ) {
          return (
            a.ratingPoints -
            b.ratingPoints
          );
        }

        /*
         * 2. Більша вага.
         */
        if (
          b.totalWeight !==
          a.totalWeight
        ) {
          return (
            b.totalWeight -
            a.totalWeight
          );
        }

        /*
         * 3. Більший Big Fish.
         */
        if (
          b.bigFish !==
          a.bigFish
        ) {
          return (
            b.bigFish -
            a.bigFish
          );
        }

        /*
         * 4. Стабільний fallback.
         */
        return String(
          a.teamName
        ).localeCompare(
          String(
            b.teamName
          ),
          "uk"
        );
      }
    );

    return ranked.map(
      (
        team,
        index
      ) => ({
        ...team,

        rank:
          index + 1
      })
    );
  }

  // =========================================================
  // COMPETITION / FINAL DISCOVERY
  // =========================================================

  function getFinalEvent(
    competition
  ) {
    const events =
      Array.isArray(
        competition?.events
      )
        ? competition.events
        : [];

    return (
      events.find(event => {

        const key =
          normalize(
            event?.key ||
            event?.stageId ||
            event?.id
          );

        const text =
          clean(
            `${
              key
            } ${
              event?.title || ""
            } ${
              event?.name || ""
            } ${
              event?.label || ""
            }`
          );

        return (
          event?.isFinal ===
            true ||
          clean(key) ===
            "final" ||
          text.includes(
            "final"
          ) ||
          text.includes(
            "фінал"
          )
        );
      }) ||
      null
    );
  }

  async function loadCompetitions() {
    if (
      competitionsCache &&
      Date.now() -
        competitionsCacheAt <
        COMPETITIONS_CACHE_MS
    ) {
      return competitionsCache;
    }

    const snapshot =
      await db
        .collection(
          COMPETITIONS_COLLECTION
        )
        .get();

    competitionsCache =
      snapshot.docs.map(
        doc => ({
          id:
            doc.id,

          data:
            doc.data() ||
            {}
        })
      );

    competitionsCacheAt =
      Date.now();

    return competitionsCache;
  }

  async function resolveFinalCompetition(
    seasonYear,
    rating
  ) {
    /*
     * Найкращий варіант:
     * competitionId уже є в seasonRating.
     */
    const ratingCompetitionId =
      normalize(
        rating?.finalCompetitionId ||
        rating?.competitionId
      );

    const competitions =
      await loadCompetitions();

    if (
      ratingCompetitionId
    ) {
      const found =
        competitions.find(
          item =>
            item.id ===
            ratingCompetitionId
        );

      if (found) {
        const finalEvent =
          getFinalEvent(
            found.data
          );

        if (
          finalEvent
        ) {
          return {
            competitionId:
              found.id,

            finalStageId:
              normalize(
                finalEvent.stageId ||
                finalEvent.key ||
                finalEvent.id
              ) ||
              "final"
          };
        }
      }
    }

    /*
     * Автоматичний пошук
     * competition відповідного року.
     */
    const candidates =
      competitions.filter(
        item => {

          const year =
            normalize(
              item.data?.year ||
              item.data?.seasonYear
            );

          if (
            year !==
            String(
              seasonYear
            )
          ) {
            return false;
          }

          if (
            normalize(
              item.data?.type
            ).toLowerCase() !==
              "season"
          ) {
            return false;
          }

          return Boolean(
            getFinalEvent(
              item.data
            )
          );
        }
      );

    if (
      candidates.length ===
      1
    ) {
      const candidate =
        candidates[0];

      const finalEvent =
        getFinalEvent(
          candidate.data
        );

      return {
        competitionId:
          candidate.id,

        finalStageId:
          normalize(
            finalEvent?.stageId ||
            finalEvent?.key ||
            finalEvent?.id
          ) ||
          "final"
      };
    }

    /*
     * Якщо кілька сезонних competitions
     * одного року — не вгадуємо.
     */
    if (
      candidates.length >
      1
    ) {
      console.error(
        LOG,
        seasonYear,
        "знайдено кілька competitions з final:",
        candidates.map(
          item =>
            item.id
        )
      );

      return null;
    }

    console.warn(
      LOG,
      seasonYear,
      "не знайдено season competition з final."
    );

    return null;
  }

  // =========================================================
  // READ CURRENT QUALIFICATIONS
  // =========================================================

  async function readExistingQualifications(
    seasonYear
  ) {
    const snapshot =
      await db
        .collection(
          QUALIFICATIONS_COLLECTION
        )
        .doc(
          seasonYear
        )
        .collection(
          "teams"
        )
        .get();

    const map =
      new Map();

    snapshot.forEach(
      doc => {

        map.set(
          doc.id,
          {
            id:
              doc.id,

            ...(
              doc.data() ||
              {}
            )
          }
        );
      }
    );

    return map;
  }

  // =========================================================
  // CALCULATE STATUS
  // =========================================================

  function buildDesiredRows(
    seasonYear,
    ranking,
    existing
  ) {
    /*
     * confirmed також займає
     * місце у фінальній 18-ці.
     *
     * invited також займає.
     *
     * declined — НЕ займає.
     */
    let occupied =
      0;

    const rows =
      [];

    ranking.forEach(team => {

      const old =
        existing.get(
          team.teamId
        ) ||
        null;

      const oldStatus =
        clean(
          old?.status
        );

      let status =
        "reserve";

      /*
       * Відмова назавжди зберігається.
       */
      if (
        oldStatus ===
        "declined"
      ) {
        status =
          "declined";
      }

      /*
       * Підтверджена участь
       * теж зберігається.
       */
      else if (
        oldStatus ===
        "confirmed"
      ) {
        status =
          "confirmed";

        occupied++;
      }

      /*
       * Ще є місце у 18.
       */
      else if (
        occupied <
        TOP_COUNT
      ) {
        status =
          "invited";

        occupied++;
      }

      /*
       * Місця закінчилися.
       */
      else {
        status =
          "reserve";
      }

      rows.push({
        seasonYear:
          Number(
            seasonYear
          ),

        teamId:
          team.teamId,

        teamName:
          team.teamName,

        rank:
          team.rank,

        ratingPoints:
          team.ratingPoints,

        totalWeight:
          team.totalWeight,

        bigFish:
          team.bigFish,

        status,

        qualifiedForFinal:
          status ===
            "invited" ||
          status ===
            "confirmed"
      });
    });

    return rows;
  }

  // =========================================================
  // COMPARE
  // =========================================================

  function scalarEqual(
    a,
    b
  ) {
    if (
      a === null ||
      a === undefined
    ) {
      return (
        b === null ||
        b === undefined
      );
    }

    return (
      String(a) ===
      String(b)
    );
  }

  function needsUpdate(
    oldData,
    nextData
  ) {
    if (!oldData) {
      return true;
    }

    const fields = [
      "seasonYear",
      "teamId",
      "teamName",
      "rank",
      "ratingPoints",
      "totalWeight",
      "bigFish",
      "status",
      "qualifiedForFinal",
      "competitionId",
      "stageId"
    ];

    return fields.some(
      key =>
        !scalarEqual(
          oldData[key],
          nextData[key]
        )
    );
  }

  // =========================================================
  // WRITE BATCHES
  // =========================================================

  async function commitOperations(
    operations
  ) {
    if (
      !operations.length
    ) {
      return;
    }

    for (
      let start = 0;
      start <
      operations.length;
      start +=
      BATCH_LIMIT
    ) {
      const chunk =
        operations.slice(
          start,
          start +
            BATCH_LIMIT
        );

      const batch =
        db.batch();

      chunk.forEach(
        operation => {

          if (
            operation.type ===
            "set"
          ) {
            batch.set(
              operation.ref,
              operation.data,
              {
                merge:
                  true
              }
            );
          }

          if (
            operation.type ===
            "delete"
          ) {
            batch.delete(
              operation.ref
            );
          }
        }
      );

      await batch.commit();
    }
  }

  // =========================================================
  // SYNC YEAR
  // =========================================================

  async function syncSeason(
    seasonYear,
    rating
  ) {
    if (
      !currentUser ||
      !isAdminUser(
        currentUser
      )
    ) {
      return;
    }

    if (
      !isValidYear(
        seasonYear
      )
    ) {
      console.warn(
        LOG,
        "некоректний seasonYear:",
        seasonYear
      );

      return;
    }

    const state =
      syncStateByYear.get(
        seasonYear
      ) || {
        running:
          false,

        queued:
          false
      };

    /*
     * Уже sync.
     * Просто ставимо повторний запуск.
     */
    if (
      state.running
    ) {
      state.queued =
        true;

      syncStateByYear.set(
        seasonYear,
        state
      );

      return;
    }

    state.running =
      true;

    state.queued =
      false;

    syncStateByYear.set(
      seasonYear,
      state
    );

    try {

      console.info(
        LOG,
        `sync ${seasonYear}...`
      );

      const ranking =
        await buildSeasonRanking(
          seasonYear,
          rating
        );

      if (
        !ranking.length
      ) {
        console.warn(
          LOG,
          seasonYear,
          "рейтинг порожній."
        );

        return;
      }

      const finalInfo =
        await resolveFinalCompetition(
          seasonYear,
          rating
        );

      if (
        !finalInfo
      ) {
        console.warn(
          LOG,
          seasonYear,
          "final competition не визначено. Запис не виконується."
        );

        return;
      }

      const existing =
        await readExistingQualifications(
          seasonYear
        );

      const desiredRows =
        buildDesiredRows(
          seasonYear,
          ranking,
          existing
        );

      const seasonRef =
        db
          .collection(
            QUALIFICATIONS_COLLECTION
          )
          .doc(
            seasonYear
          );

      /*
       * META документа сезону.
       */
      await seasonRef.set(
        {
          seasonYear:
            Number(
              seasonYear
            ),

          competitionId:
            finalInfo.competitionId,

          stageId:
            finalInfo.finalStageId,

          topCount:
            TOP_COUNT,

          teamsCount:
            desiredRows.length,

          updatedAt:
            serverTimestamp()
        },
        {
          merge:
            true
        }
      );

      const operations =
        [];

      const rankingTeamIds =
        new Set();

      desiredRows.forEach(
        row => {

          rankingTeamIds.add(
            row.teamId
          );

          const old =
            existing.get(
              row.teamId
            );

          const oldStatus =
            clean(
              old?.status
            );

          const next = {
            ...row,

            competitionId:
              finalInfo.competitionId,

            stageId:
              finalInfo.finalStageId,

            updatedAt:
              serverTimestamp()
          };

          /*
           * createdAt тільки
           * для нового документа.
           */
          if (!old) {
            next.createdAt =
              serverTimestamp();
          }

          /*
           * Коли команда вперше
           * отримала invited.
           */
          if (
            row.status ===
              "invited" &&
            oldStatus !==
              "invited"
          ) {
            next.invitedAt =
              serverTimestamp();
          }

          /*
           * Коли команда переходить
           * у reserve.
           */
          if (
            row.status ===
              "reserve" &&
            oldStatus !==
              "reserve"
          ) {
            next.reservedAt =
              serverTimestamp();
          }

          if (
            needsUpdate(
              old,
              next
            )
          ) {
            operations.push({
              type:
                "set",

              ref:
                seasonRef
                  .collection(
                    "teams"
                  )
                  .doc(
                    row.teamId
                  ),

              data:
                next
            });
          }
        }
      );

      /*
       * Старі команди, яких уже немає
       * у seasonRating цього року.
       *
       * Не видаляємо confirmed /
       * declined автоматично.
       *
       * Інші документи можна прибрати,
       * щоб база не накопичувала сміття
       * всередині конкретного сезону.
       */
      existing.forEach(
        (
          old,
          teamId
        ) => {

          if (
            rankingTeamIds.has(
              teamId
            )
          ) {
            return;
          }

          const status =
            clean(
              old.status
            );

          if (
            status ===
              "confirmed" ||
            status ===
              "declined"
          ) {
            return;
          }

          operations.push({
            type:
              "delete",

            ref:
              seasonRef
                .collection(
                  "teams"
                )
                .doc(
                  teamId
                )
          });
        }
      );

      await commitOperations(
        operations
      );

      const activeCount =
        desiredRows.filter(
          row =>
            row.status ===
              "invited" ||
            row.status ===
              "confirmed"
        ).length;

      const reserveCount =
        desiredRows.filter(
          row =>
            row.status ===
            "reserve"
        ).length;

      const declinedCount =
        desiredRows.filter(
          row =>
            row.status ===
            "declined"
        ).length;

      console.info(
        LOG,
        `${seasonYear} synchronized`,
        {
          competitionId:
            finalInfo.competitionId,

          stageId:
            finalInfo.finalStageId,

          activeCount,

          reserveCount,

          declinedCount,

          writes:
            operations.length
        }
      );

    } catch (
      error
    ) {

      console.error(
        LOG,
        `sync ${seasonYear} error:`,
        error
      );

    } finally {

      const latest =
        syncStateByYear.get(
          seasonYear
        );

      if (!latest) {
        return;
      }

      const rerun =
        latest.queued ===
        true;

      latest.running =
        false;

      latest.queued =
        false;

      syncStateByYear.set(
        seasonYear,
        latest
      );

      /*
       * Якщо поки ми писали
       * прийшов новий snapshot —
       * запускаємо ще раз.
       */
      if (
        rerun &&
        currentUser &&
        isAdminUser(
          currentUser
        )
      ) {
        try {

          const fresh =
            await db
              .collection(
                RATING_COLLECTION
              )
              .doc(
                seasonYear
              )
              .get();

          if (
            fresh.exists
          ) {
            await syncSeason(
              seasonYear,
              fresh.data() ||
                {}
            );
          }

        } catch (
          error
        ) {

          console.error(
            LOG,
            seasonYear,
            "rerun error:",
            error
          );
        }
      }
    }
  }

  // =========================================================
  // QUALIFICATION LISTENER
  // =========================================================

  function subscribeQualificationYear(
    seasonYear
  ) {
    if (
      qualificationListeners.has(
        seasonYear
      )
    ) {
      return;
    }

    /*
     * Слухаємо статуси команд.
     *
     * Якщо хтось став declined,
     * автоматично запускаємо sync,
     * і наступний reserve стане invited.
     */
    const unsubscribe =
      db
        .collection(
          QUALIFICATIONS_COLLECTION
        )
        .doc(
          seasonYear
        )
        .collection(
          "teams"
        )
        .onSnapshot(
          async snapshot => {

            if (
              snapshot.empty &&
              !currentUser
            ) {
              return;
            }

            if (
              !currentUser ||
              !isAdminUser(
                currentUser
              )
            ) {
              return;
            }

            try {

              const ratingSnap =
                await db
                  .collection(
                    RATING_COLLECTION
                  )
                  .doc(
                    seasonYear
                  )
                  .get();

              if (
                !ratingSnap.exists
              ) {
                return;
              }

              await syncSeason(
                seasonYear,
                ratingSnap.data() ||
                  {}
              );

            } catch (
              error
            ) {

              console.error(
                LOG,
                seasonYear,
                "qualification listener:",
                error
              );
            }
          },
          error => {

            console.error(
              LOG,
              seasonYear,
              "qualification snapshot error:",
              error
            );
          }
        );

    qualificationListeners.set(
      seasonYear,
      unsubscribe
    );
  }

  // =========================================================
  // UNSUBSCRIBE
  // =========================================================

  function clearQualificationListeners() {
    qualificationListeners.forEach(
      unsubscribe => {

        if (
          typeof unsubscribe ===
          "function"
        ) {
          unsubscribe();
        }
      }
    );

    qualificationListeners.clear();
  }

  function stop() {
    if (
      typeof unsubscribeRatings ===
      "function"
    ) {
      unsubscribeRatings();
    }

    unsubscribeRatings =
      null;

    clearQualificationListeners();

    syncStateByYear.clear();
  }

  // =========================================================
  // SEASON RATING LISTENER
  // =========================================================

  function subscribeRatings() {
    if (
      typeof unsubscribeRatings ===
      "function"
    ) {
      unsubscribeRatings();
    }

    unsubscribeRatings =
      db
        .collection(
          RATING_COLLECTION
        )
        .onSnapshot(
          snapshot => {

            /*
             * Тут немає 2026 hardcode.
             *
             * Який document з'явився:
             *
             * seasonRating/2026
             * seasonRating/2027
             * seasonRating/2028
             *
             * той і обробляється.
             */
            snapshot.docs.forEach(
              doc => {

                const seasonYear =
                  normalize(
                    doc.id
                  );

                if (
                  !isValidYear(
                    seasonYear
                  )
                ) {
                  return;
                }

                subscribeQualificationYear(
                  seasonYear
                );

                syncSeason(
                  seasonYear,
                  doc.data() ||
                    {}
                );
              }
            );
          },
          error => {

            console.error(
              LOG,
              "seasonRating listener:",
              error
            );
          }
        );
  }

  // =========================================================
  // DEBUG API
  // =========================================================

  /*
   * Можна вручну викликати в console:
   *
   * await SC_FINAL_QUALIFICATION.sync("2026")
   *
   * Це не потрібно для звичайної роботи,
   * просто debug.
   */
  window.SC_FINAL_QUALIFICATION = {

    async sync(
      seasonYear
    ) {
      const year =
        normalize(
          seasonYear
        );

      if (
        !isValidYear(
          year
        )
      ) {
        throw new Error(
          "Некоректний рік."
        );
      }

      if (
        !currentUser ||
        !isAdminUser(
          currentUser
        )
      ) {
        throw new Error(
          "Потрібна admin-сесія."
        );
      }

      const snapshot =
        await db
          .collection(
            RATING_COLLECTION
          )
          .doc(
            year
          )
          .get();

      if (
        !snapshot.exists
      ) {
        throw new Error(
          `seasonRating/${year} не існує.`
        );
      }

      await syncSeason(
        year,
        snapshot.data() ||
          {}
      );

      return true;
    },

    stop
  };

  // =========================================================
  // INIT
  // =========================================================

  async function init() {
    try {

      await waitFirebase();

      auth =
        window.scAuth;

      db =
        window.scDb;

      fb =
        window.firebase;

      auth.onAuthStateChanged(
        user => {

          currentUser =
            user ||
            null;

          stop();

          if (
            !user
          ) {
            console.info(
              LOG,
              "no user — disabled"
            );

            return;
          }

          if (
            !isAdminUser(
              user
            )
          ) {
            console.info(
              LOG,
              "non-admin — read/write manager disabled"
            );

            return;
          }

          console.info(
            LOG,
            "admin active — automatic qualification started"
          );

          subscribeRatings();
        }
      );

    } catch (
      error
    ) {

      console.error(
        LOG,
        "init error:",
        error
      );
    }
  }

  init();

})();

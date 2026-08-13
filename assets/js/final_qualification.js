// assets/js/final_qualification.js
// STOLAR CARP • Автоматичне формування фіналістів
//
// =========================================================
// FIRESTORE STRUCTURE
// =========================================================
//
// ОСНОВНА СЕЗОННА СТРУКТУРА:
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
// Кожен сезон фізично відокремлений.
//
// =========================================================
// COMPATIBILITY MIRROR
// =========================================================
//
// register_firebase.js зараз перевіряє:
//
// finalInvites/{competitionId}__{stageId}__{teamId}
//
// Тому цей JS також автоматично підтримує finalInvites.
//
// finalQualifications = основне джерело кваліфікації.
// finalInvites        = технічний mirror для реєстрації.
//
// =========================================================
// ЛОГІКА
// =========================================================
//
// • автоматично знаходить seasonRating/2026, /2027, /2028...
// • фінал НЕ бере участі в рейтингових балах;
// • рейтинг:
//      1. два найкращі результати;
//      2. менше балів = краще;
//      3. більша загальна вага;
//      4. більший Big Fish;
// • перші 18 доступних команд -> invited;
// • решта -> reserve;
// • declined ніколи автоматично не повертається;
// • confirmed ніколи автоматично не скидається;
// • declined НЕ займає місце у TOP-18;
// • confirmed займає місце;
// • якщо finalist declined -> наступний reserve стає invited;
// • кожен сезон повністю відокремлений.
//
// =========================================================
// ВАЖЛИВО
// =========================================================
//
// WRITE виконується тільки під ADMIN UID.
//
// Цей browser JS працює тільки тоді,
// коли сторінка, де він підключений,
// реально відкрита під admin-сесією.
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

  const FINAL_INVITES_COLLECTION =
    "finalInvites";

  const RATING_COLLECTION =
    "seasonRating";

  const RESULTS_COLLECTION =
    "seasonResults";

  const COMPETITIONS_COLLECTION =
    "competitions";

  const ADMIN_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const BATCH_LIMIT = 400;

  const COMPETITIONS_CACHE_MS =
    60 * 1000;

  // =========================================================
  // FIREBASE STATE
  // =========================================================

  let auth = null;
  let db = null;
  let fb = null;

  let currentUser = null;

  let unsubscribeRatings = null;

  const qualificationListeners =
    new Map();

  const syncStateByYear =
    new Map();

  let competitionsCache = null;
  let competitionsCacheAt = 0;

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

  function buildInviteId(
    competitionId,
    stageId,
    teamId
  ) {
    return (
      `${normalize(competitionId)}__` +
      `${normalize(stageId) || "final"}__` +
      `${normalize(teamId)}`
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
      Date.now() - startedAt <
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
  // ARCHIVED REGULAR STAGES
  // =========================================================

  function stageSortValue(stage) {
    const raw =
      normalize(
        stage.stageId ||
        stage.stageDocId ||
        stage.id
      );

    const match =
      raw.match(/(\d+)/);

    return match
      ? Number(match[1])
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
          const stage = {
            stageDocId:
              normalize(item),

            stageId:
              normalize(item),

            stageName:
              normalize(item),

            type:
              "",

            stageType:
              "",

            isFinal:
              false
          };

          stage.isFinal =
            isFinalStage(stage);

          return stage;
        }

        const stage = {
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
              item?.stageDocId ||
              item?.id
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

        stage.isFinal =
          isFinalStage(stage);

        return stage;
      })

      .filter(
        stage =>
          Boolean(
            stage.stageDocId
          )
      )

      .filter(
        stage =>
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
  // NORMALIZE STANDING
  // =========================================================

  function normalizeStandingRow(row) {
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
      isFinalStage(stage)
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

    if (archiveRow) {
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
  // TEAM RATING
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

          if (result) {
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

    let totalWeight = 0;
    let bigFish = 0;

    regularStages.forEach(
      stage => {

        const result =
          readRegularStageResult(
            team,
            stage,
            archiveMaps
          );

        if (!result) {
          return;
        }

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
    );

    return {
      ratingPoints,
      totalWeight,
      bigFish
    };
  }

  // =========================================================
  // TEAM ACTIVE FILTER
  // =========================================================

  function isActiveRatingTeam(
    team
  ) {
    if (!team) {
      return false;
    }

    /*
     * Якщо поля active немає —
     * команда вважається активною.
     *
     * Якщо явно:
     * active:false
     * disabled:true
     * deleted:true
     *
     * тоді не беремо.
     */
    if (
      team.active ===
      false
    ) {
      return false;
    }

    if (
      team.disabled ===
      true
    ) {
      return false;
    }

    if (
      team.deleted ===
      true
    ) {
      return false;
    }

    return true;
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

    if (
      !regularStages.length
    ) {
      return [];
    }

    const teams =
      Array.isArray(
        rating?.teams
      )
        ? rating.teams
            .filter(
              isActiveRatingTeam
            )
            .slice()
        : [];

    const archiveMaps =
      await loadArchiveStageMaps(
        seasonYear,
        regularStages
      );

    const uniqueTeamIds =
      new Set();

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

          if (!teamId) {
            console.warn(
              LOG,
              seasonYear,
              "команда без teamId пропущена:",
              teamName
            );

            return null;
          }

          /*
           * Не дозволяємо одному teamId
           * випадково бути двічі.
           */
          if (
            uniqueTeamIds.has(
              teamId
            )
          ) {
            console.warn(
              LOG,
              seasonYear,
              "duplicate teamId пропущено:",
              teamId
            );

            return null;
          }

          uniqueTeamIds.add(
            teamId
          );

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

        if (
          a.ratingPoints !==
          b.ratingPoints
        ) {
          return (
            a.ratingPoints -
            b.ratingPoints
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
  // FINAL COMPETITION DISCOVERY
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
    const year =
      String(
        seasonYear
      );

    const ratingCompetitionId =
      normalize(
        rating?.finalCompetitionId ||
        rating?.competitionId
      );

    const competitions =
      await loadCompetitions();

    /*
     * 1. Якщо seasonRating явно
     * вказує competition.
     */
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

        if (finalEvent) {
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
     * 2. Автоматично шукаємо
     * season competition цього року.
     */
    const candidates =
      competitions.filter(
        item => {

          const competitionYear =
            normalize(
              item.data?.year ||
              item.data?.seasonYear
            );

          if (
            competitionYear !==
            year
          ) {
            return false;
          }

          const type =
            normalize(
              item.data?.type
            ).toLowerCase();

          /*
           * Якщо type не заданий,
           * але є year + final,
           * теж допускаємо.
           */
          if (
            type &&
            type !==
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

    if (
      candidates.length >
      1
    ) {
      console.error(
        LOG,
        seasonYear,
        "знайдено кілька season competitions з final:",
        candidates.map(
          item =>
            item.id
        )
      );

      return null;
    }

    /*
     * 3. Безпечний fallback:
     * competition id season-{year}.
     */
    const fallbackId =
      `season-${year}`;

    const fallback =
      competitions.find(
        item =>
          item.id ===
          fallbackId
      );

    if (fallback) {
      const finalEvent =
        getFinalEvent(
          fallback.data
        );

      if (finalEvent) {
        return {
          competitionId:
            fallback.id,

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

    console.warn(
      LOG,
      seasonYear,
      "не знайдено competition із фінальним етапом."
    );

    return null;
  }

  // =========================================================
  // EXISTING QUALIFICATIONS
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
  // STATUS CALCULATION
  // =========================================================

  function buildDesiredRows(
    seasonYear,
    ranking,
    existing
  ) {
    let occupied = 0;

    const rows = [];

    ranking.forEach(
      team => {

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
         * DECLINED:
         * не повертаємо автоматично.
         * Місце у TOP-18 не займає.
         */
        if (
          oldStatus ===
          "declined"
        ) {
          status =
            "declined";
        }

        /*
         * CONFIRMED:
         * не скидаємо.
         * Місце займає.
         */
        else if (
          oldStatus ===
          "confirmed"
        ) {
          status =
            "confirmed";

          occupied += 1;
        }

        /*
         * Є вільне місце.
         */
        else if (
          occupied <
          TOP_COUNT
        ) {
          status =
            "invited";

          occupied += 1;
        }

        /*
         * Далі резерв.
         */
        else {
          status =
            "reserve";
        }

        rows.push({
          /*
           * STRING.
           *
           * Не Number(2026).
           */
          seasonYear:
            String(
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
      }
    );

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
  // BATCH
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
                  operation.merge !==
                  false
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
  // FINAL INVITE MIRROR
  // =========================================================

  function buildInviteMirrorData(
    row,
    finalInfo
  ) {
    return {
      seasonYear:
        String(
          row.seasonYear
        ),

      competitionId:
        finalInfo.competitionId,

      stageId:
        finalInfo.finalStageId,

      teamId:
        row.teamId,

      teamName:
        row.teamName,

      rank:
        row.rank,

      ratingPoints:
        row.ratingPoints,

      totalWeight:
        row.totalWeight,

      bigFish:
        row.bigFish,

      status:
        row.status,

      qualifiedForFinal:
        row.qualifiedForFinal,

      source:
        "final_qualification",

      updatedAt:
        serverTimestamp()
    };
  }

  // =========================================================
  // SYNC ONE SEASON
  // =========================================================

  async function syncSeason(
    seasonYear,
    rating
  ) {
    const year =
      String(
        seasonYear
      );

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
        year
      )
    ) {
      console.warn(
        LOG,
        "некоректний seasonYear:",
        year
      );

      return;
    }

    const state =
      syncStateByYear.get(
        year
      ) || {
        running:
          false,

        queued:
          false
      };

    if (
      state.running
    ) {
      state.queued =
        true;

      syncStateByYear.set(
        year,
        state
      );

      return;
    }

    state.running =
      true;

    state.queued =
      false;

    syncStateByYear.set(
      year,
      state
    );

    try {
      console.info(
        LOG,
        `sync ${year}...`
      );

      const ranking =
        await buildSeasonRanking(
          year,
          rating
        );

      if (
        !ranking.length
      ) {
        console.warn(
          LOG,
          year,
          "рейтинг порожній або ще немає заархівованих відбіркових етапів."
        );

        return;
      }

      const finalInfo =
        await resolveFinalCompetition(
          year,
          rating
        );

      if (!finalInfo) {
        console.warn(
          LOG,
          year,
          "final competition не визначено. Запис не виконується."
        );

        return;
      }

      const existing =
        await readExistingQualifications(
          year
        );

      const desiredRows =
        buildDesiredRows(
          year,
          ranking,
          existing
        );

      const seasonRef =
        db
          .collection(
            QUALIFICATIONS_COLLECTION
          )
          .doc(
            year
          );

      // =====================================================
      // META SEASON DOCUMENT
      // =====================================================

      await seasonRef.set(
        {
          seasonYear:
            year,

          competitionId:
            finalInfo.competitionId,

          stageId:
            finalInfo.finalStageId,

          topCount:
            TOP_COUNT,

          teamsCount:
            desiredRows.length,

          activeCount:
            desiredRows.filter(
              row =>
                row.status ===
                  "invited" ||
                row.status ===
                  "confirmed"
            ).length,

          reserveCount:
            desiredRows.filter(
              row =>
                row.status ===
                "reserve"
            ).length,

          declinedCount:
            desiredRows.filter(
              row =>
                row.status ===
                "declined"
            ).length,

          updatedAt:
            serverTimestamp()
        },
        {
          merge:
            true
        }
      );

      const operations = [];

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

          if (!old) {
            next.createdAt =
              serverTimestamp();
          }

          if (
            row.status ===
              "invited" &&
            oldStatus !==
              "invited"
          ) {
            next.invitedAt =
              serverTimestamp();
          }

          if (
            row.status ===
              "reserve" &&
            oldStatus !==
              "reserve"
          ) {
            next.reservedAt =
              serverTimestamp();
          }

          // ===================================================
          // MAIN YEAR-SCOPED RECORD
          // ===================================================

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
                next,

              merge:
                true
            });
          }

          // ===================================================
          // REGISTER_FIREBASE COMPATIBILITY MIRROR
          // ===================================================

          const inviteId =
            buildInviteId(
              finalInfo.competitionId,
              finalInfo.finalStageId,
              row.teamId
            );

          const inviteRef =
            db
              .collection(
                FINAL_INVITES_COLLECTION
              )
              .doc(
                inviteId
              );

          operations.push({
            type:
              "set",

            ref:
              inviteRef,

            data:
              buildInviteMirrorData(
                row,
                finalInfo
              ),

            merge:
              true
          });
        }
      );

      // =====================================================
      // CLEAN OLD QUALIFICATION TEAM DOCS
      // =====================================================

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

          /*
           * Історичні confirmed /
           * declined не видаляємо.
           */
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

          /*
           * Також прибираємо
           * технічний finalInvites mirror
           * саме цього сезону.
           */
          const competitionId =
            normalize(
              old.competitionId ||
              finalInfo.competitionId
            );

          const stageId =
            normalize(
              old.stageId ||
              finalInfo.finalStageId
            ) ||
            "final";

          if (
            competitionId
          ) {
            operations.push({
              type:
                "delete",

              ref:
                db
                  .collection(
                    FINAL_INVITES_COLLECTION
                  )
                  .doc(
                    buildInviteId(
                      competitionId,
                      stageId,
                      teamId
                    )
                  )
            });
          }
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
        `${year} synchronized`,
        {
          competitionId:
            finalInfo.competitionId,

          stageId:
            finalInfo.finalStageId,

          total:
            desiredRows.length,

          activeCount,

          reserveCount,

          declinedCount,

          operations:
            operations.length
        }
      );

    } catch (
      error
    ) {
      console.error(
        LOG,
        `sync ${year} error:`,
        error
      );

    } finally {
      const latest =
        syncStateByYear.get(
          year
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
        year,
        latest
      );

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
                year
              )
              .get();

          if (
            fresh.exists
          ) {
            await syncSeason(
              year,
              fresh.data() ||
                {}
            );
          }

        } catch (
          error
        ) {
          console.error(
            LOG,
            year,
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
    const year =
      String(
        seasonYear
      );

    if (
      qualificationListeners.has(
        year
      )
    ) {
      return;
    }

    let initialized =
      false;

    const unsubscribe =
      db
        .collection(
          QUALIFICATIONS_COLLECTION
        )
        .doc(
          year
        )
        .collection(
          "teams"
        )
        .onSnapshot(
          async snapshot => {

            /*
             * Перший snapshot виникає
             * просто через підписку.
             *
             * Основний sync у цей момент
             * і так запускається з seasonRating.
             */
            if (!initialized) {
              initialized =
                true;

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

            /*
             * Реагуємо тільки якщо
             * реально змінились документи.
             */
            const meaningfulChange =
              snapshot
                .docChanges()
                .some(
                  change =>
                    change.type ===
                      "modified" ||
                    change.type ===
                      "added" ||
                    change.type ===
                      "removed"
                );

            if (!meaningfulChange) {
              return;
            }

            try {
              const ratingSnap =
                await db
                  .collection(
                    RATING_COLLECTION
                  )
                  .doc(
                    year
                  )
                  .get();

              if (
                !ratingSnap.exists
              ) {
                return;
              }

              await syncSeason(
                year,
                ratingSnap.data() ||
                  {}
              );

            } catch (
              error
            ) {
              console.error(
                LOG,
                year,
                "qualification listener:",
                error
              );
            }
          },
          error => {
            console.error(
              LOG,
              year,
              "qualification snapshot error:",
              error
            );
          }
        );

    qualificationListeners.set(
      year,
      unsubscribe
    );
  }

  // =========================================================
  // STOP
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
  // SEASON RATINGS LISTENER
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
             * НІЯКОГО hardcode 2026.
             *
             * seasonRating/2026
             * seasonRating/2027
             * seasonRating/2028
             * seasonRating/2029
             * ...
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

          if (!user) {
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
              "non-admin — qualification manager disabled"
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

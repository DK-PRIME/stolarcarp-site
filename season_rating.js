// assets/js/season_rating.js
// STOLAR CARP • Підсумковий рейтинг команд сезону
//
// ЛОГІКА:
//
// 1. Спочатку визначаємо 18 фіналістів:
//    • тільки відбіркові етапи;
//    • 2 найкращі результати;
//    • пропущений етап = 8 балів;
//    • бали ↑, вага ↓, Big Fish ↓.
//
// 2. У сезонний рейтинг допускаються ТІЛЬКИ ці TOP-18.
//
// 3. Рейтинг сезону:
//    • враховуються ВСІ відбіркові етапи;
//    • + результат Фіналу;
//    • відбірковий етап: бал = місце в зоні;
//    • Фінал: бал = загальне місце у Фіналі;
//    • менше балів = краще;
//    • при рівності: загальна вага ↓;
//    • потім Big Fish ↓.
//
// 4. Автоматично:
//    • 1 / 2 / 3 місце сезону;
//    • Big Fish сезону.
//
// HTML:
// season_rating.html

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // =========================================================
  // SETTINGS
  // =========================================================

  const TOP_COUNT = 18;

  const BEST_COUNT_FOR_FINAL = 2;

  // Штраф за пропущений ВІДБІРКОВИЙ етап
  const ABSENT_REGULAR_POINTS = 8;

  /*
   * Якщо Фінал уже заархівований,
   * але команда-фіналіст не має результату Фіналу,
   * ставимо місце після всіх 18 фіналістів.
   *
   * Якщо за твоїм регламентом має бути інше —
   * змінюється тільки ця константа.
   */
  const ABSENT_FINAL_POINTS = TOP_COUNT + 1; // 19

  /*
   * Можна відкривати:
   * season_rating.html
   *
   * або:
   * season_rating.html?year=2026
   */
  const params =
    new URLSearchParams(
      window.location.search
    );

  const SEASON_YEAR =
    params.get("year") || "2026";

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
    return String(value ?? "")
      .replace(
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

    if (!box) return;

    box.style.display = "block";
    box.innerHTML = message;
  }

  function hideError() {
    const box =
      $("seasonRatingError");

    if (!box) return;

    box.style.display = "none";
    box.innerHTML = "";
  }

  // =========================================================
  // FIRESTORE
  // =========================================================

  async function waitReady() {
    if (window.scReady) {
      await window.scReady;
    }

    const db = window.scDb;

    if (!db) {
      throw new Error(
        "Firestore не ініціалізований."
      );
    }

    return db;
  }

  // =========================================================
  // STAGES
  // =========================================================

  function isFinalStage(stage) {
    if (!stage) {
      return false;
    }

    const raw = clean(
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
      }`
    );

    return (
      stage.isFinal === true ||
      raw.includes("final") ||
      raw.includes("фінал")
    );
  }

  function stageSortValue(stage) {
    if (isFinalStage(stage)) {
      return 999999;
    }

    const raw = String(
      stage.stageId ||
      stage.stageDocId ||
      stage.id ||
      stage.stageName ||
      ""
    );

    const match =
      raw.match(/(\d+)/);

    return match
      ? Number(match[1])
      : 9999;
  }

  function stageDisplayNumber(
    stage,
    index
  ) {
    const values = [
      stage.stageId,
      stage.stageDocId,
      stage.stageName
    ];

    for (
      const value of values
    ) {
      const match =
        String(value || "")
          .match(/(\d+)/);

      if (match) {
        return Number(
          match[1]
        );
      }
    }

    return index + 1;
  }

  function normalizeStage(stage) {
    if (
      typeof stage === "string"
    ) {
      const fixed = {
        stageDocId: stage,
        stageId: stage,
        stageName: stage,
        type: "",
        stageType: "",
        isFinal: false
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
          stage?.stageId ||
          stage?.stageDocId ||
          stage?.id ||
          ""
        ),

      type:
        String(
          stage?.type || ""
        ),

      stageType:
        String(
          stage?.stageType || ""
        ),

      isFinal:
        Boolean(
          stage?.isFinal
        )
    };

    fixed.isFinal =
      isFinalStage(fixed);

    return fixed;
  }

  function getStages(rating) {
    const source =
      Array.isArray(
        rating.archivedStages
      )
        ? rating.archivedStages
        : [];

    const stages =
      source
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

    const regularStages =
      stages.filter(
        stage =>
          !isFinalStage(stage)
      );

    const finalStage =
      stages.find(
        stage =>
          isFinalStage(stage)
      ) || null;

    return {
      regularStages,
      finalStage
    };
  }

  // =========================================================
  // STANDINGS NORMALIZE
  // =========================================================

  function normalizeStandingRow(row) {
    return {
      teamId:
        String(
          row.teamId || ""
        ).trim(),

      team:
        String(
          row.team ||
          row.teamName ||
          "—"
        ).trim(),

      zone:
        String(
          row.zone || ""
        )
          .toUpperCase()
          .trim(),

      sector:
        String(
          row.sector || ""
        ).trim(),

      overallPlace:
        num(
          row.overallPlace ||
          row.finalPlace ||
          row.place
        ),

      zonePlace:
        num(
          row.zonePlace
        ),

      points:
        num(
          row.points ||
          row.zonePlace
        ),

      totalWeight:
        num(
          row.totalWeight
        ),

      bigFish:
        num(
          row.bigFish
        ),

      totalCount:
        num(
          row.totalCount
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
        Array.isArray(standings)
          ? standings
          : []
      ).map(
        normalizeStandingRow
      );

    const byTeamId =
      new Map();

    const byTeamName =
      new Map();

    /*
     * Загальне місце.
     *
     * Особливо потрібне для Фіналу.
     */
    const overallRows =
      rows
        .slice()
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
        );

    const overallPlaceMap =
      new Map();

    overallRows.forEach(
      (row, index) => {

        const key =
          row.teamId ||
          clean(row.team);

        if (!key) return;

        overallPlaceMap.set(
          key,
          row.overallPlace ||
          index + 1
        );
      }
    );

    /*
     * Місця в зонах.
     */
    ["A", "B", "C"]
      .forEach(zone => {

        const zoneRows =
          rows
            .filter(
              row =>
                row.zone === zone
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
      });

    /*
     * Рядки без A/B/C.
     */
    rows
      .filter(
        row =>
          !["A", "B", "C"]
            .includes(row.zone)
      )
      .forEach(row => {

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
      });

    return {
      byTeamId,
      byTeamName
    };
  }

  // =========================================================
  // LOAD ARCHIVED STAGES
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

          try {
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
              return;
            }

            const data =
              snap.data() || {};

            maps.set(
              stage.stageDocId,
              computeStageMap(
                Array.isArray(
                  data.standings
                )
                  ? data.standings
                  : []
              )
            );

          } catch (error) {

            console.warn(
              "[Season Rating] Не вдалося прочитати етап:",
              stage.stageDocId,
              error
            );
          }
        }
      )
    );

    return maps;
  }

  // =========================================================
  // FIND TEAM
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
      stageMap.byTeamId.has(
        teamId
      )
    ) {
      return stageMap
        .byTeamId
        .get(teamId);
    }

    if (
      teamName &&
      stageMap.byTeamName.has(
        teamName
      )
    ) {
      return stageMap
        .byTeamName
        .get(teamName);
    }

    return null;
  }

  // =========================================================
  // READ RESULT
  // =========================================================

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
              archiveRow.overallPlace ||
              archiveRow.finalPlace ||
              archiveRow.place
            )
          : num(
              archiveRow.zonePlace ||
              archiveRow.points
            );

      if (!place) {
        return null;
      }

      return {
        place,
        points: place,

        totalWeight:
          num(
            archiveRow.totalWeight
          ),

        bigFish:
          num(
            archiveRow.bigFish
          ),

        totalCount:
          num(
            archiveRow.totalCount
          ),

        final
      };
    }

    /*
     * Fallback:
     * seasonRating/{year}.teams[].stages
     */
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
            data.overallPlace ||
            data.finalPlace ||
            data.points ||
            data.place
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
      points: place,

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
  // QUALIFICATION — 2 BEST
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
              ABSENT_REGULAR_POINTS,

            totalWeight: 0,
            bigFish: 0
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

    const best =
      results.slice(
        0,
        BEST_COUNT_FOR_FINAL
      );

    return best.reduce(
      (sum, result) =>
        sum +
        num(
          result.points
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

  // =========================================================
  // FIXED TOP-18 FINALISTS
  // =========================================================

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
  // SEASON REGULAR CELLS
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
            place: "—",
            points:
              ABSENT_REGULAR_POINTS,

            absent: true
          };
        }

        return {
          place:
            result.place,

          points:
            result.points,

          absent: false
        };
      }
    );
  }

  // =========================================================
  // TOTAL WEIGHT + BIG FISH
  // =========================================================

  function calculateSeasonStats(
    team,
    regularStages,
    finalStage,
    stageMaps
  ) {
    let totalWeight = 0;
    let biggestFish = 0;

    let biggestFishStage =
      "";

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
            `Етап ${
              stageDisplayNumber(
                stage,
                index
              )
            }`;
        }
      }
    );

    if (finalStage) {

      const finalResult =
        readStageResult(
          team,
          finalStage,
          stageMaps
        );

      if (finalResult) {

        totalWeight +=
          num(
            finalResult.totalWeight
          );

        if (
          num(
            finalResult.bigFish
          ) >
          biggestFish
        ) {
          biggestFish =
            num(
              finalResult.bigFish
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

  // =========================================================
  // SEASON RANKING
  // =========================================================

  function buildSeasonRanking(
    finalists,
    regularStages,
    finalStage,
    stageMaps
  ) {
    const finalArchived =
      Boolean(finalStage);

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

            const finalResult =
              readStageResult(
                team,
                finalStage,
                stageMaps
              );

            if (finalResult) {

              finalPlace =
                finalResult.place;

              finalPoints =
                finalResult.points;

            } else {

              /*
               * Фінал вже є,
               * але результату команди немає.
               */
              finalPlace =
                "—";

              finalPoints =
                ABSENT_FINAL_POINTS;
            }
          }

          const seasonStats =
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
              seasonStats.totalWeight,

            bigFish:
              seasonStats.biggestFish,

            bigFishStage:
              seasonStats.biggestFishStage,

            finalArchived
          };
        }
      );

    rows.sort(
      (a, b) => {

        // 1. Менше балів
        if (
          a.seasonPoints !==
          b.seasonPoints
        ) {
          return (
            a.seasonPoints -
            b.seasonPoints
          );
        }

        // 2. Більша вага
        if (
          b.totalWeight !==
          a.totalWeight
        ) {
          return (
            b.totalWeight -
            a.totalWeight
          );
        }

        // 3. Більший Big Fish
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

  // =========================================================
  // DYNAMIC HEADER
  // =========================================================

  function buildHeader(
    regularStages
  ) {
    const head =
      $("seasonFinalHead");

    if (!head) {
      return;
    }

    /*
     * Видаляємо старі
     * динамічні Е1/Е2/...
     */
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
  // RENDER TABLE
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
            regularStages.length + 6
          }">
            Немає команд для рейтингу.
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML =
      rows
        .map(row => {

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
              .map(cell => `
                <td class="col-stage ${
                  cell.absent
                    ? "stage-noshow"
                    : ""
                }">
                  <div class="stage-cell">

                    <span class="stage-place">
                      ${esc(
                        safeText(
                          cell.place,
                          "—"
                        )
                      )}
                    </span>

                    <span class="stage-slash">
                      /
                    </span>

                    <span class="stage-points">
                      ${esc(
                        safeText(
                          cell.points,
                          "—"
                        )
                      )}
                    </span>

                  </div>
                </td>
              `)
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
                title="${esc(row.team)}"
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
                data-season-big="${row.bigFish}"
              >
                ${esc(
                  fmtKg(
                    row.bigFish
                  )
                )}
              </td>

            </tr>
          `;
        })
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
            ? `${row.seasonPoints} бал. · ${fmtKg(
                row.totalWeight
              )} кг`
            : "—";
      }
    }
  }

  // =========================================================
  // BIG FISH
  // =========================================================

  function renderSeasonBigFish(
    rows
  ) {
    const teamEl =
      $("seasonBigFishTeam");

    const metaEl =
      $("seasonBigFishMeta");

    const weightEl =
      $("seasonBigFishWeight");

    const maxBigFish =
      rows.reduce(
        (max, row) =>
          Math.max(
            max,
            num(
              row.bigFish
            )
          ),
        0
      );

    if (
      maxBigFish <= 0
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

    /*
     * Якщо колись дві команди
     * матимуть однаковий Big Fish,
     * тут покажемо всі назви.
     */
    const winners =
      rows.filter(
        row =>
          num(
            row.bigFish
          ) ===
          maxBigFish
      );

    if (teamEl) {
      teamEl.textContent =
        winners
          .map(
            row =>
              row.team
          )
          .join(" / ");
    }

    if (metaEl) {

      const stageNames =
        [
          ...new Set(
            winners
              .map(
                row =>
                  row.bigFishStage
              )
              .filter(Boolean)
          )
        ];

      metaEl.textContent =
        stageNames.length
          ? stageNames.join(" / ")
          : `Сезон ${SEASON_YEAR}`;
    }

    if (weightEl) {
      weightEl.textContent =
        `${fmtKg(
          maxBigFish
        )} кг`;
    }

    /*
     * Підсвічуємо Big Fish
     * і в основній таблиці.
     */
    document
      .querySelectorAll(
        "#seasonFinalRows td.col-big"
      )
      .forEach(cell => {

        const value =
          num(
            cell.dataset
              .seasonBig
          );

        cell.classList.toggle(
          "season-bigfish-winner",
          value ===
            maxBigFish
        );
      });
  }

  // =========================================================
  // TITLE
  // =========================================================

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
  // CONVERT
  // =========================================================

  async function buildPayload(
    db,
    rating
  ) {
    const {
      regularStages,
      finalStage
    } =
      getStages(rating);

    const rawTeams =
      Array.isArray(
        rating.teams
      )
        ? rating.teams.slice()
        : [];

    /*
     * Читаємо всі відбіркові етапи
     * + Фінал, якщо він уже є.
     */
    const stagesToLoad =
      finalStage
        ? [
            ...regularStages,
            finalStage
          ]
        : [
            ...regularStages
          ];

    const stageMaps =
      await loadStageMaps(
        db,
        stagesToLoad
      );

    /*
     * КРОК 1:
     * фіксуємо склад TOP-18
     * за рейтингом виходу у Фінал.
     */
    const finalists =
      getFinalists(
        rawTeams,
        regularStages,
        stageMaps
      );

    /*
     * КРОК 2:
     * тільки ці 18 беруть участь
     * у підсумковому рейтингу.
     */
    const rows =
      buildSeasonRanking(
        finalists,
        regularStages,
        finalStage,
        stageMaps
      );

    return {
      regularStages,
      finalStage,
      rows
    };
  }

  // =========================================================
  // RENDER PAYLOAD
  // =========================================================

  function renderPayload(
    payload
  ) {
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
      rows
    );

    updateTitles();

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
  // LOAD
  // =========================================================

  async function loadSeasonRating() {
    hideError();

    try {

      const db =
        await waitReady();

      db
        .collection(
          "seasonRating"
        )
        .doc(
          SEASON_YEAR
        )
        .onSnapshot(

          async snap => {

            if (
              !snap.exists
            ) {

              showError(
                `⚠️ Немає документа seasonRating/${SEASON_YEAR}`
              );

              setReady();

              return;
            }

            try {

              const rating =
                snap.data() || {};

              const payload =
                await buildPayload(
                  db,
                  rating
                );

              renderPayload(
                payload
              );

            } catch (
              error
            ) {

              console.error(
                "[Season Rating] build error:",
                error
              );

              showError(
                `⚠️ Помилка формування рейтингу сезону: ${esc(
                  error.message ||
                  error
                )}`
              );

              setReady();
            }
          },

          error => {

            console.error(
              "[Season Rating] snapshot error:",
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
        "[Season Rating] load error:",
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
  // REFRESH
  // =========================================================

  window.refreshSeasonRating =
    function () {
      window.location.reload();
    };

  // =========================================================
  // START
  // =========================================================

  document.addEventListener(
    "DOMContentLoaded",
    loadSeasonRating
  );

})();

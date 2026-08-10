// assets/js/rating_page.js
// STOLAR CARP • Вихід у фінал
//
// Джерело:
// seasonRating/{year}
// seasonResults/{year}/stages
//
// ЛОГІКА:
// • показуються всі заархівовані ВІДБІРКОВІ етапи;
// • кількість колонок етапів динамічна;
// • Фінал тут повністю виключений;
// • бал за етап = місце команди у своїй зоні;
// • у рейтинг ідуть 2 найкращі результати;
// • відсутній результат на вже проведеному етапі = 8 балів;
// • сортування:
//      1) сума 2 кращих балів ↑
//      2) загальна вага всіх відбіркових етапів ↓
//      3) Big Fish всіх відбіркових етапів ↓
// • TOP 18 = вихід у фінал.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // =========================================================
  // НАЛАШТУВАННЯ
  // =========================================================

  const TOP_COUNT = 18;
  const SEASON_YEAR = "2026";

  // Два найкращі результати
  const BEST_COUNT = 2;

  // Неявка / відсутність результату
  const ABSENT_POINTS = 8;

  const CACHE_TTL_MS = 5 * 60 * 1000;

  // Новий кеш без старої логіки фіналу
  const CACHE_KEY =
    "sc_final_qualification_dynamic_stages_v2";

  // =========================================================
  // HELPERS
  // =========================================================

  function safeText(v, dash = "—") {
    return (
      v === null ||
      v === undefined ||
      v === ""
    )
      ? dash
      : String(v);
  }

  function num(v) {
    const n = Number(v);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function fmtKg(v) {
    const n = num(v);

    if (n <= 0) {
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

  // =========================================================
  // READY / ERROR
  // =========================================================

  function setReadyFlag() {
    document.documentElement.setAttribute(
      "data-rating-ready",
      "1"
    );
  }

  function showError(msgHtml) {
    const box = $("ratingError");

    if (!box) return;

    box.style.display = "block";
    box.innerHTML = msgHtml;
  }

  function hideError() {
    const box = $("ratingError");

    if (!box) return;

    box.style.display = "none";
    box.innerHTML = "";
  }

  // =========================================================
  // BIG FISH STYLE
  // =========================================================

  function injectBigFishStyle() {
    if (
      document.getElementById(
        "sc-rating-bigfish-style"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "sc-rating-bigfish-style";

    style.textContent = `
      .col-big.season-bigfish-winner{
        color:#f59e0b !important;
        font-weight:900 !important;
        text-shadow:
          0 0 6px
          rgba(245,158,11,.35);
      }
    `;

    document.head.appendChild(style);
  }

  // =========================================================
  // CACHE
  // =========================================================

  function cacheGet() {
    try {
      const raw =
        localStorage.getItem(
          CACHE_KEY
        );

      if (!raw) {
        return null;
      }

      const obj =
        JSON.parse(raw);

      if (
        !obj ||
        !obj.ts
      ) {
        return null;
      }

      if (
        Date.now() - obj.ts >
        CACHE_TTL_MS
      ) {
        return null;
      }

      return obj.payload || null;

    } catch {
      return null;
    }
  }

  function cacheSet(payload) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          ts: Date.now(),
          payload
        })
      );
    } catch {}
  }

  function cacheClear() {
    try {
      localStorage.removeItem(
        CACHE_KEY
      );
    } catch {}
  }

  // =========================================================
  // FIRESTORE READY
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
  // FINAL DETECTOR
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

  // =========================================================
  // СОРТУВАННЯ ЕТАПІВ
  // =========================================================

  function stageSortValue(stage) {
    const raw = String(
      stage.stageId ||
      stage.stageDocId ||
      stage.id ||
      ""
    );

    const match =
      raw.match(/(\d+)/);

    return match
      ? Number(match[1])
      : 9999;
  }

  // =========================================================
  // НАЗВА КОЛОНКИ ЕТАПУ
  // =========================================================

  function stageDisplayNumber(
    stage,
    index
  ) {
    const values = [
      stage.stageId,
      stage.stageDocId,
      stage.stageName
    ];

    for (const value of values) {
      const match =
        String(value || "")
          .match(/(\d+)/);

      if (match) {
        return Number(match[1]);
      }
    }

    return index + 1;
  }

  // =========================================================
  // ЧИТАЄМО ТІЛЬКИ ВІДБІРКОВІ ЕТАПИ
  // =========================================================

  function getRegularArchivedStages(
    rating
  ) {
    const arr =
      Array.isArray(
        rating.archivedStages
      )
        ? rating.archivedStages
        : [];

    return arr
      .map(s => {

        if (typeof s === "string") {
          const stage = {
            stageDocId: s,
            stageId: s,
            stageName: s,
            type: "",
            stageType: "",
            isFinal: false
          };

          stage.isFinal =
            isFinalStage(stage);

          return stage;
        }

        const stage = {
          stageDocId:
            String(
              s.stageDocId ||
              s.id ||
              ""
            ),

          stageId:
            String(
              s.stageId ||
              s.stageDocId ||
              s.id ||
              ""
            ),

          stageName:
            String(
              s.stageName ||
              s.stageId ||
              s.stageDocId ||
              s.id ||
              ""
            ),

          type:
            String(
              s.type || ""
            ),

          stageType:
            String(
              s.stageType || ""
            ),

          isFinal:
            Boolean(
              s.isFinal
            )
        };

        stage.isFinal =
          isFinalStage(stage);

        return stage;
      })

      // Без порожніх ID
      .filter(stage =>
        stage.stageDocId
      )

      // ГОЛОВНЕ:
      // Фінал тут повністю прибираємо
      .filter(stage =>
        !isFinalStage(stage)
      )

      // Е1 → Е2 → Е3 → ...
      .sort(
        (a, b) =>
          stageSortValue(a) -
          stageSortValue(b)
      );
  }

  // =========================================================
  // ДИНАМІЧНА ШАПКА ТАБЛИЦІ
  // =========================================================

  function buildStageHeaders(
    regularStages
  ) {
    const heads = [
      $("seasonTopHead"),
      $("seasonContendersHead")
    ].filter(Boolean);

    heads.forEach(head => {

      // При повторному render
      // видаляємо попередні
      // динамічні заголовки.
      head
        .querySelectorAll(
          "th.col-stage"
        )
        .forEach(el =>
          el.remove()
        );

      const pointsTh =
        head.querySelector(
          "th.col-points"
        );

      if (!pointsTh) {
        return;
      }

      regularStages.forEach(
        (stage, index) => {

          const stageNo =
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
            `Е${stageNo}<br>м / б`;

          head.insertBefore(
            th,
            pointsTh
          );
        }
      );
    });

    document.body.setAttribute(
      "data-stages",
      String(
        regularStages.length
      )
    );
  }

  // =========================================================
  // HTML РЯДКА
  // =========================================================

  function rowHTML(
    place,
    qualified,
    stagesCount
  ) {
    const stagesHtml =
      Array.from({
        length: stagesCount
      })
        .map(() => `
          <td class="col-stage">
            <div class="stage-cell">

              <span class="stage-place">
                –
              </span>

              <span class="stage-slash">
                /
              </span>

              <span class="stage-points">
                –
              </span>

            </div>
          </td>
        `)
        .join("");

    return `
      <tr class="${
        qualified
          ? "row-qualified"
          : ""
      }">

        <td class="col-place">
          <span class="place-num">
            ${place}
          </span>
        </td>

        <td class="col-move">
          <span class="move move--same">
            –
          </span>
        </td>

        <td class="col-team">
          -
        </td>

        ${stagesHtml}

        <td class="col-points">
          <b>-</b>
        </td>

        <td class="col-weight">
          -
        </td>

        <td class="col-big">
          -
        </td>

      </tr>
    `;
  }

  // =========================================================
  // SKELETON
  // =========================================================

  function buildSkeleton(
    stagesCount,
    contendersCount = 3
  ) {
    const topTbody =
      $("season-top");

    const contTbody =
      $("season-contenders");

    if (
      !topTbody ||
      !contTbody
    ) {
      return;
    }

    topTbody.innerHTML = "";

    for (
      let i = 1;
      i <= TOP_COUNT;
      i++
    ) {
      topTbody.insertAdjacentHTML(
        "beforeend",
        rowHTML(
          i,
          true,
          stagesCount
        )
      );
    }

    contTbody.innerHTML = "";

    const cc =
      Math.max(
        3,
        Number(
          contendersCount || 0
        )
      );

    for (
      let i = 0;
      i < cc;
      i++
    ) {
      contTbody.insertAdjacentHTML(
        "beforeend",
        rowHTML(
          TOP_COUNT + i + 1,
          false,
          stagesCount
        )
      );
    }
  }

  // =========================================================
  // РУХ У РЕЙТИНГУ
  // =========================================================

  function setMove(
    el,
    moveDelta
  ) {
    if (!el) return;

    el.classList.remove(
      "move--up",
      "move--down",
      "move--same"
    );

    const d =
      Number(
        moveDelta || 0
      );

    if (d > 0) {

      el.classList.add(
        "move--up"
      );

      el.textContent =
        `▲${d}`;

    } else if (d < 0) {

      el.classList.add(
        "move--down"
      );

      el.textContent =
        `▼${Math.abs(d)}`;

    } else {

      el.classList.add(
        "move--same"
      );

      el.textContent =
        "–";
    }
  }

  // =========================================================
  // РЕНДЕР РЯДКА
  // =========================================================

  function renderRow(
    tr,
    item
  ) {
    if (
      !tr ||
      !item
    ) {
      return;
    }

    const placeEl =
      tr.querySelector(
        ".place-num"
      );

    if (placeEl) {
      placeEl.textContent =
        safeText(
          item.place
        );
    }

    const moveEl =
      tr.querySelector(
        ".move"
      );

    setMove(
      moveEl,
      item.moveDelta
    );

    const teamCell =
      tr.querySelector(
        "td.col-team"
      );

    if (teamCell) {
      teamCell.textContent =
        safeText(
          item.team
        );
    }

    // -------------------------
    // ЕТАПИ
    // -------------------------

    const stages =
      Array.isArray(
        item.stages
      )
        ? item.stages
        : [];

    const stageCells =
      tr.querySelectorAll(
        "td.col-stage"
      );

    stageCells.forEach(
      (cell, index) => {

        const stage =
          stages[index] || {};

        const stagePlaceEl =
          cell.querySelector(
            ".stage-place"
          );

        const stagePointsEl =
          cell.querySelector(
            ".stage-points"
          );

        if (stagePlaceEl) {
          stagePlaceEl.textContent =
            safeText(
              stage.p,
              "–"
            );
        }

        if (stagePointsEl) {
          stagePointsEl.textContent =
            safeText(
              stage.pts,
              "–"
            );
        }

        cell.classList.remove(
          "stage-counted",
          "stage-dropped",
          "stage-noshow"
        );

        if (
          stage.noShow === true
        ) {
          cell.classList.add(
            "stage-noshow"
          );

        } else if (
          stage.counted === true
        ) {
          cell.classList.add(
            "stage-counted"
          );

        } else if (
          stage.dropped === true ||
          stage.counted === false
        ) {
          cell.classList.add(
            "stage-dropped"
          );
        }
      }
    );

    // -------------------------
    // БАЛИ
    // -------------------------

    const pointsEl =
      tr.querySelector(
        ".col-points b"
      );

    if (pointsEl) {
      pointsEl.textContent =
        safeText(
          item.points
        );
    }

    // -------------------------
    // ВАГА
    // -------------------------

    const weightEl =
      tr.querySelector(
        "td.col-weight"
      );

    if (weightEl) {
      weightEl.textContent =
        safeText(
          item.weight
        );
    }

    // -------------------------
    // BIG FISH
    // -------------------------

    const bigCell =
      tr.querySelector(
        "td.col-big"
      );

    if (bigCell) {

      bigCell.classList.remove(
        "season-bigfish-winner"
      );

      if (
        item.seasonBigFishWinner ===
        true
      ) {
        bigCell.classList.add(
          "season-bigfish-winner"
        );
      }

      bigCell.textContent =
        safeText(
          item.bigFish
        );
    }

    // -------------------------
    // TOP 18
    // -------------------------

    if (
      item.qualifiedForFinal ===
      true
    ) {
      tr.classList.add(
        "row-qualified"
      );

    } else {
      tr.classList.remove(
        "row-qualified"
      );
    }
  }

  // =========================================================
  // NORMALIZE STANDINGS
  // =========================================================

  function normalizeStandingRow(r) {
    return {
      teamId:
        String(
          r.teamId || ""
        ).trim(),

      team:
        String(
          r.team ||
          r.teamName ||
          "—"
        ).trim(),

      zone:
        String(
          r.zone || ""
        )
          .toUpperCase()
          .trim(),

      sector:
        String(
          r.sector || ""
        ).trim(),

      overallPlace:
        num(
          r.overallPlace ||
          r.finalPlace ||
          r.place
        ),

      zonePlace:
        num(
          r.zonePlace
        ),

      points:
        num(
          r.points ||
          r.zonePlace
        ),

      totalWeight:
        num(
          r.totalWeight
        ),

      bigFish:
        num(
          r.bigFish
        ),

      totalCount:
        num(
          r.totalCount
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

    // -------------------------
    // ЗОНИ A/B/C
    // -------------------------

    ["A", "B", "C"].forEach(
      zone => {

        const zoneRows =
          rows
            .filter(
              r =>
                r.zone === zone
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
                  String(b.team),
                  "uk"
                );
              }
            );

        zoneRows.forEach(
          (r, index) => {

            const zonePlace =
              r.zonePlace ||
              index + 1;

            const fixed = {
              ...r,
              zonePlace,
              points: zonePlace
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

    // -------------------------
    // Якщо зони немає
    // -------------------------

    rows
      .filter(
        r =>
          !["A", "B", "C"]
            .includes(r.zone)
      )
      .forEach(r => {

        const fixed = {
          ...r,

          points:
            r.points ||
            r.zonePlace ||
            r.overallPlace ||
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
  // ЗАВАНТАЖЕННЯ АРХІВУ ЕТАПІВ
  // =========================================================

  async function loadArchiveStageMaps(
    db,
    seasonYear,
    regularStages
  ) {
    const result =
      new Map();

    await Promise.all(
      regularStages.map(
        async stage => {

          try {

            const snap =
              await db
                .collection(
                  "seasonResults"
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
              !snap.exists
            ) {
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

            result.set(
              stage.stageDocId,
              computeStageMap(
                standings
              )
            );

          } catch (e) {

            console.warn(
              "[Final qualification] Не вдалося прочитати етап:",
              stage.stageDocId,
              e
            );
          }
        }
      )
    );

    return result;
  }

  // =========================================================
  // ЗНАХОДИМО КОМАНДУ
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
  // РЕЗУЛЬТАТ ВІДБІРКОВОГО ЕТАПУ
  // =========================================================

  function readRegularStageResult(
    team,
    stage,
    archiveMaps
  ) {
    // Додатковий захист:
    // фінал сюди не потрапить.
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
        p: place,
        pts: place,

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
          )
      };
    }

    // -------------------------
    // fallback із seasonRating
    // -------------------------

    const stagesObj =
      team.stages || {};

    const stageData =
      stagesObj[
        stage.stageDocId
      ] ||
      stagesObj[
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
      p: place,
      pts: place,

      totalWeight:
        num(
          stageData.totalWeight
        ),

      bigFish:
        num(
          stageData.bigFish
        ),

      totalCount:
        num(
          stageData.totalCount
        )
    };
  }

  // =========================================================
  // 2 НАЙКРАЩІ РЕЗУЛЬТАТИ
  // =========================================================

  function calculateBestResults(
    team,
    regularStages,
    archiveMaps
  ) {
    const allResults = [];

    regularStages.forEach(
      stage => {

        const result =
          readRegularStageResult(
            team,
            stage,
            archiveMaps
          );

        if (result) {

          allResults.push({
            stageDocId:
              stage.stageDocId,

            ...result,

            isNoShow:
              false
          });

        } else {

          allResults.push({
            stageDocId:
              stage.stageDocId,

            p: "–",
            pts: ABSENT_POINTS,

            totalWeight: 0,
            bigFish: 0,
            totalCount: 0,

            isNoShow:
              true
          });
        }
      }
    );

    // Менше балів = краще.
    // Якщо однаково:
    // вага, потім Big Fish.
    const sorted =
      allResults
        .slice()
        .sort(
          (a, b) => {

            if (
              a.pts !==
              b.pts
            ) {
              return (
                a.pts -
                b.pts
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

    const dropped =
      sorted.slice(
        BEST_COUNT
      );

    const countedKeys =
      new Set(
        counted.map(
          x =>
            x.stageDocId
        )
      );

    const droppedKeys =
      new Set(
        dropped.map(
          x =>
            x.stageDocId
        )
      );

    const ratingPoints =
      counted.reduce(
        (sum, x) =>
          sum +
          num(x.pts),
        0
      );

    return {
      countedKeys,
      droppedKeys,
      ratingPoints
    };
  }

  // =========================================================
  // КЛІТИНКИ ЕТАПІВ
  // =========================================================

  function makeStageCells(
    team,
    regularStages,
    bestInfo,
    archiveMaps
  ) {
    return regularStages.map(
      stage => {

        const result =
          readRegularStageResult(
            team,
            stage,
            archiveMaps
          );

        const counted =
          bestInfo
            .countedKeys
            .has(
              stage.stageDocId
            );

        const dropped =
          bestInfo
            .droppedKeys
            .has(
              stage.stageDocId
            );

        if (!result) {

          return {
            p: "–",
            pts: ABSENT_POINTS,

            noShow: true,
            counted,
            dropped
          };
        }

        return {
          p: result.p,
          pts: result.pts,

          noShow: false,
          counted,
          dropped
        };
      }
    );
  }

  // =========================================================
  // ЗАГАЛЬНА ВАГА ВСІХ ВІДБІРКОВИХ ЕТАПІВ
  // =========================================================

  function getTournamentWeight(
    team,
    regularStages,
    archiveMaps
  ) {
    let weight = 0;

    regularStages.forEach(
      stage => {

        const result =
          readRegularStageResult(
            team,
            stage,
            archiveMaps
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

  // =========================================================
  // BIG FISH ВСІХ ВІДБІРКОВИХ ЕТАПІВ
  // =========================================================

  function getTournamentBigFish(
    team,
    regularStages,
    archiveMaps
  ) {
    let bigFish = 0;

    regularStages.forEach(
      stage => {

        const result =
          readRegularStageResult(
            team,
            stage,
            archiveMaps
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
  // РАНЖУВАННЯ КОМАНД
  // =========================================================

  function rankTeams(
    rawTeams,
    regularStages,
    archiveMaps
  ) {
    const rows =
      rawTeams.map(
        team => {

          const bestInfo =
            calculateBestResults(
              team,
              regularStages,
              archiveMaps
            );

          const stageCells =
            makeStageCells(
              team,
              regularStages,
              bestInfo,
              archiveMaps
            );

          return {
            teamId:
              String(
                team.teamId ||
                ""
              ),

            team:
              team.team ||
              team.teamName ||
              "—",

            stages:
              stageCells,

            ratingPoints:
              bestInfo.ratingPoints,

            displayWeight:
              getTournamentWeight(
                team,
                regularStages,
                archiveMaps
              ),

            displayBigFish:
              getTournamentBigFish(
                team,
                regularStages,
                archiveMaps
              )
          };
        }
      );

    rows.sort(
      (a, b) => {

        // 1. Бали
        if (
          a.ratingPoints !==
          b.ratingPoints
        ) {
          return (
            a.ratingPoints -
            b.ratingPoints
          );
        }

        // 2. Вага
        if (
          b.displayWeight !==
          a.displayWeight
        ) {
          return (
            b.displayWeight -
            a.displayWeight
          );
        }

        // 3. Big Fish
        if (
          b.displayBigFish !==
          a.displayBigFish
        ) {
          return (
            b.displayBigFish -
            a.displayBigFish
          );
        }

        // 4. Стабільність
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
        place: index + 1
      })
    );
  }

  // =========================================================
  // ПОПЕРЕДНЄ МІСЦЕ
  // =========================================================

  function calculatePreviousPlaces(
    rawTeams,
    regularStages,
    archiveMaps
  ) {
    if (
      regularStages.length <= 1
    ) {
      return new Map();
    }

    // Прибираємо останній
    // заархівований етап.
    const previousStages =
      regularStages.slice(
        0,
        -1
      );

    const previousRows =
      rankTeams(
        rawTeams,
        previousStages,
        archiveMaps
      );

    const map =
      new Map();

    previousRows.forEach(
      row => {

        if (
          row.teamId
        ) {
          map.set(
            row.teamId,
            row.place
          );
        }
      }
    );

    return map;
  }

  // =========================================================
  // FIRESTORE → PAYLOAD
  // =========================================================

  async function convertRatingToRows(
    db,
    rating
  ) {
    // ТІЛЬКИ звичайні етапи.
    // Фінал тут уже відкинутий.
    const regularStages =
      getRegularArchivedStages(
        rating
      );

    const rawTeams =
      Array.isArray(
        rating.teams
      )
        ? rating.teams.slice()
        : [];

    const archiveMaps =
      await loadArchiveStageMaps(
        db,
        SEASON_YEAR,
        regularStages
      );

    const currentRows =
      rankTeams(
        rawTeams,
        regularStages,
        archiveMaps
      );

    const previousPlaces =
      calculatePreviousPlaces(
        rawTeams,
        regularStages,
        archiveMaps
      );

    const seasonBigFish =
      currentRows.reduce(
        (max, row) =>
          Math.max(
            max,
            num(
              row.displayBigFish
            )
          ),
        0
      );

    const rows =
      currentRows.map(
        row => {

          const prevPlace =
            previousPlaces.get(
              row.teamId
            ) ||
            row.place;

          const moveDelta =
            prevPlace -
            row.place;

          return {
            place:
              row.place,

            team:
              row.team,

            stages:
              row.stages,

            points:
              row.ratingPoints ||
              "—",

            weight:
              fmtKg(
                row.displayWeight
              ),

            bigFish:
              fmtKg(
                row.displayBigFish
              ),

            seasonBigFishWinner:
              seasonBigFish > 0 &&
              num(
                row.displayBigFish
              ) ===
              seasonBigFish,

            moveDelta,

            qualifiedForFinal:
              row.place <=
              TOP_COUNT
          };
        }
      );

    /*
      regularStages теж кладемо
      в payload.

      Це потрібно для
      динамічної шапки:
      Е1 / Е2 / Е3 / Е4...
    */
    return {
      regularStages,
      rows
    };
  }

  // =========================================================
  // RENDER PAYLOAD
  // =========================================================

  function renderRatingPayload(
    payload,
    offline = false
  ) {
    const rows =
      Array.isArray(
        payload.rows
      )
        ? payload.rows
        : [];

    const regularStages =
      Array.isArray(
        payload.regularStages
      )
        ? payload.regularStages
        : [];

    const contendersCount =
      Math.max(
        3,
        rows.length -
        TOP_COUNT
      );

    // -------------------------
    // 1. ШАПКА Е1 / Е2 / Е3...
    // -------------------------

    buildStageHeaders(
      regularStages
    );

    // -------------------------
    // 2. РЯДКИ
    // -------------------------

    buildSkeleton(
      regularStages.length,
      contendersCount
    );

    const topRows =
      $("season-top")
        ? $("season-top")
            .querySelectorAll(
              "tr"
            )
        : [];

    const contRows =
      $("season-contenders")
        ? $("season-contenders")
            .querySelectorAll(
              "tr"
            )
        : [];

    rows.forEach(
      (item, index) => {

        if (
          index <
          TOP_COUNT
        ) {

          if (
            topRows[index]
          ) {
            renderRow(
              topRows[index],
              item
            );
          }

        } else {

          const contenderIndex =
            index -
            TOP_COUNT;

          if (
            contRows[
              contenderIndex
            ]
          ) {

            renderRow(
              contRows[
                contenderIndex
              ],
              {
                ...item,
                qualifiedForFinal:
                  false
              }
            );
          }
        }
      }
    );

    // -------------------------
    // TITLES
    // -------------------------

    if (
      $("seasonTitle")
    ) {
      $("seasonTitle")
        .textContent =
        "Вихід у фінал STOLAR CARP";
    }

    if (
      $("seasonKicker")
    ) {
      $("seasonKicker")
        .textContent =
        `СЕЗОН ${SEASON_YEAR}`;
    }

    // -------------------------
    // ERROR
    // -------------------------

    if (
      !rows.length &&
      !offline
    ) {
      showError(
        "⚠️ Немає даних відбору. Спочатку потрібно архівувати хоча б один етап."
      );

    } else if (
      !offline
    ) {
      hideError();
    }

    setReadyFlag();
  }

  // =========================================================
  // LOAD
  // =========================================================

  async function loadRating() {
    injectBigFishStyle();
    hideError();

    /*
      НЕ створюємо тут 5 колонок,
      як робив старий JS.

      Чекаємо дані Firestore,
      дізнаємося реальну кількість
      етапів і тільки тоді
      будуємо таблицю.
    */

    const cached =
      cacheGet();

    if (cached) {

      try {
        renderRatingPayload(
          cached,
          true
        );

      } catch (e) {

        console.warn(
          "[Final qualification] cache render error:",
          e
        );
      }
    }

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

              setReadyFlag();

              return;
            }

            const rating =
              snap.data() || {};

            const payload =
              await convertRatingToRows(
                db,
                rating
              );

            cacheSet(
              payload
            );

            renderRatingPayload(
              payload,
              false
            );
          },

          err => {

            console.error(
              "[Final qualification] onSnapshot error:",
              err
            );

            const cachedData =
              cacheGet();

            if (cachedData) {

              renderRatingPayload(
                cachedData,
                true
              );

              showError(
                "⚠️ Офлайн-режим. Показано кеш рейтингу."
              );

            } else {

              showError(
                `⚠️ Помилка читання seasonRating/${SEASON_YEAR}: ${safeText(
                  err.message
                )}`
              );
            }

            setReadyFlag();
          }
        );

    } catch (e) {

      const cachedData =
        cacheGet();

      if (cachedData) {

        renderRatingPayload(
          cachedData,
          true
        );

        showError(
          "⚠️ Офлайн-режим. Показано кеш рейтингу."
        );

      } else {

        showError(
          `⚠️ Помилка завантаження рейтингу: ${safeText(
            e.message || e
          )}`
        );

        setReadyFlag();
      }
    }
  }

  // =========================================================
  // MANUAL REFRESH
  // =========================================================

  window.refreshRating =
    function () {

      cacheClear();

      window.location.reload();
    };

  // =========================================================
  // START
  // =========================================================

  document.addEventListener(
    "DOMContentLoaded",
    loadRating
  );

})();

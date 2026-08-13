// assets/js/rating_page.js
// STOLAR CARP • Вихід у фінал
//
// =========================================================
// ДЖЕРЕЛА
// =========================================================
//
// seasonRating/{year}
// seasonResults/{year}/stages
//
// =========================================================
// ЛОГІКА
// =========================================================
//
// • сезон НЕ прив'язаний до 2026;
// • підтримуються 2027 / 2028 / 2029 / ...;
// • рік визначається автоматично;
// • ?year=2028 має найвищий пріоритет;
// • далі settings/app;
// • далі activeCompetitionId;
// • далі останній доступний seasonRating;
// • фінал не входить у розрахунок рейтингу;
// • показуються всі заархівовані ВІДБІРКОВІ етапи;
// • кількість колонок етапів динамічна;
// • бал за етап = місце команди у своїй зоні;
// • у рейтинг ідуть 2 найкращі результати;
// • відсутній результат = 8 балів;
// • сортування:
//      1) сума 2 кращих балів ↑
//      2) загальна вага ↓
//      3) Big Fish ↓
// • TOP 18 = право на фінал;
// • teamId зберігається у payload для автоматизації finalInvites.
//
// =========================================================

(function () {
  "use strict";

  const $ = (id) =>
    document.getElementById(id);

  // =========================================================
  // SETTINGS
  // =========================================================

  const TOP_COUNT = 18;

  const BEST_COUNT = 2;

  const ABSENT_POINTS = 8;

  const CACHE_TTL_MS =
    5 * 60 * 1000;

  const CACHE_PREFIX =
    "sc_final_qualification_dynamic_stages_v3";

  /*
   * Визначається автоматично.
   *
   * Наприклад:
   *
   * 2026
   * 2027
   * 2028
   * ...
   */
  let SEASON_YEAR = "";

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
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : 0;
  }

  function fmtKg(value) {
    const number =
      num(value);

    if (number <= 0) {
      return "—";
    }

    return number
      .toFixed(2)
      .replace(
        /\.?0+$/,
        ""
      );
  }

  function clean(value) {
    return String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        " "
      );
  }

  function normalizeYear(
    value
  ) {
    const raw =
      String(
        value ?? ""
      ).trim();

    if (
      !/^\d{4}$/.test(raw)
    ) {
      return "";
    }

    const year =
      Number(raw);

    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2200
    ) {
      return "";
    }

    return raw;
  }

  // =========================================================
  // READY / ERROR
  // =========================================================

  function setReadyFlag() {
    document.documentElement
      .setAttribute(
        "data-rating-ready",
        "1"
      );
  }

  function showError(
    msgHtml
  ) {
    const box =
      $("ratingError");

    if (!box) {
      return;
    }

    box.style.display =
      "block";

    box.innerHTML =
      msgHtml;
  }

  function hideError() {
    const box =
      $("ratingError");

    if (!box) {
      return;
    }

    box.style.display =
      "none";

    box.innerHTML =
      "";
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
      document.createElement(
        "style"
      );

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

    document.head
      .appendChild(style);
  }

  // =========================================================
  // CACHE
  // =========================================================

  function getCacheKey() {
    if (!SEASON_YEAR) {
      return "";
    }

    return (
      CACHE_PREFIX +
      "_" +
      SEASON_YEAR
    );
  }

  function cacheGet() {
    const key =
      getCacheKey();

    if (!key) {
      return null;
    }

    try {
      const raw =
        localStorage.getItem(
          key
        );

      if (!raw) {
        return null;
      }

      const object =
        JSON.parse(raw);

      if (
        !object ||
        !object.ts
      ) {
        return null;
      }

      if (
        Date.now() -
          object.ts >
        CACHE_TTL_MS
      ) {
        return null;
      }

      return (
        object.payload ||
        null
      );

    } catch {
      return null;
    }
  }

  function cacheSet(
    payload
  ) {
    const key =
      getCacheKey();

    if (!key) {
      return;
    }

    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          ts:
            Date.now(),

          payload
        })
      );
    } catch {}
  }

  function cacheClear() {
    const key =
      getCacheKey();

    if (!key) {
      return;
    }

    try {
      localStorage.removeItem(
        key
      );
    } catch {}
  }

  function clearOldRatingCaches() {
    try {
      Object
        .keys(localStorage)
        .forEach(key => {

          if (
            key.startsWith(
              "sc_final_qualification_dynamic_stages_"
            ) &&
            !key.startsWith(
              CACHE_PREFIX
            )
          ) {
            localStorage
              .removeItem(key);
          }
        });

    } catch {}
  }

  // =========================================================
  // FIRESTORE READY
  // =========================================================

  async function waitReady() {
    if (
      window.scReady
    ) {
      await window.scReady;
    }

    const db =
      window.scDb;

    if (!db) {
      throw new Error(
        "Firestore не ініціалізований."
      );
    }

    return db;
  }

  // =========================================================
  // SEASON YEAR
  // =========================================================

  function getYearFromUrl() {
    try {
      const params =
        new URLSearchParams(
          window.location.search
        );

      return normalizeYear(
        params.get("year")
      );

    } catch {
      return "";
    }
  }

  async function getYearFromSettings(
    db
  ) {
    try {
      const snap =
        await db
          .collection(
            "settings"
          )
          .doc(
            "app"
          )
          .get();

      if (!snap.exists) {
        return {
          year: "",
          activeCompetitionId: ""
        };
      }

      const data =
        snap.data() || {};

      const explicitYear =
        normalizeYear(
          data.activeSeasonYear ||
          data.currentSeasonYear ||
          data.seasonYear ||
          data.year
        );

      return {
        year:
          explicitYear,

        activeCompetitionId:
          String(
            data.activeCompetitionId ||
            ""
          ).trim()
      };

    } catch (
      error
    ) {
      console.warn(
        "[Final qualification] settings year:",
        error
      );

      return {
        year: "",
        activeCompetitionId: ""
      };
    }
  }

  async function getYearFromCompetition(
    db,
    competitionId
  ) {
    if (!competitionId) {
      return "";
    }

    try {
      const snap =
        await db
          .collection(
            "competitions"
          )
          .doc(
            competitionId
          )
          .get();

      if (!snap.exists) {
        return "";
      }

      const data =
        snap.data() || {};

      /*
       * Якщо це season —
       * беремо його рік.
       *
       * Якщо type відсутній у старому
       * документі, теж дозволяємо.
       */
      const type =
        String(
          data.type || ""
        )
          .trim()
          .toLowerCase();

      if (
        type &&
        type !== "season"
      ) {
        return "";
      }

      return normalizeYear(
        data.year ||
        data.seasonYear
      );

    } catch (
      error
    ) {
      console.warn(
        "[Final qualification] competition year:",
        error
      );

      return "";
    }
  }

  async function getLatestRatingYear(
    db
  ) {
    try {
      const snap =
        await db
          .collection(
            "seasonRating"
          )
          .get();

      const years =
        [];

      snap.forEach(
        doc => {

          const year =
            normalizeYear(
              doc.id
            );

          if (year) {
            years.push(
              Number(year)
            );
          }
        }
      );

      if (!years.length) {
        return "";
      }

      years.sort(
        (a, b) =>
          b - a
      );

      return String(
        years[0]
      );

    } catch (
      error
    ) {
      console.warn(
        "[Final qualification] latest season:",
        error
      );

      return "";
    }
  }

  async function resolveSeasonYear(
    db
  ) {
    /*
     * 1.
     * URL:
     *
     * rating.html?year=2028
     */
    const urlYear =
      getYearFromUrl();

    if (urlYear) {
      return urlYear;
    }

    /*
     * 2.
     * settings/app
     */
    const settings =
      await getYearFromSettings(
        db
      );

    if (
      settings.year
    ) {
      return settings.year;
    }

    /*
     * 3.
     * activeCompetitionId
     */
    if (
      settings.activeCompetitionId
    ) {
      const competitionYear =
        await getYearFromCompetition(
          db,
          settings.activeCompetitionId
        );

      if (competitionYear) {
        return competitionYear;
      }
    }

    /*
     * 4.
     * Останній реально існуючий
     * seasonRating/{year}.
     *
     * Це важливо, якщо activeCompetition
     * зараз не сезонне змагання.
     */
    const latestRatingYear =
      await getLatestRatingYear(
        db
      );

    if (
      latestRatingYear
    ) {
      return latestRatingYear;
    }

    /*
     * 5.
     * Крайній fallback.
     */
    return String(
      new Date()
        .getFullYear()
    );
  }

  // =========================================================
  // FINAL DETECTOR
  // =========================================================

  function isFinalStage(
    stage
  ) {
    if (!stage) {
      return false;
    }

    const raw =
      clean(
        `${
          stage.stageDocId ||
          ""
        } ${
          stage.stageId ||
          ""
        } ${
          stage.stageName ||
          ""
        } ${
          stage.type ||
          ""
        } ${
          stage.stageType ||
          ""
        }`
      );

    return (
      stage.isFinal ===
        true ||

      raw.includes(
        "final"
      ) ||

      raw.includes(
        "фінал"
      )
    );
  }

  // =========================================================
  // STAGE SORT
  // =========================================================

  function stageSortValue(
    stage
  ) {
    const raw =
      String(
        stage.stageId ||
        stage.stageDocId ||
        stage.id ||
        ""
      );

    const match =
      raw.match(
        /(\d+)/
      );

    return match
      ? Number(
          match[1]
        )
      : 9999;
  }

  // =========================================================
  // STAGE DISPLAY NUMBER
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

    for (
      const value of values
    ) {
      const match =
        String(
          value || ""
        ).match(
          /(\d+)/
        );

      if (match) {
        return Number(
          match[1]
        );
      }
    }

    return (
      index + 1
    );
  }

  // =========================================================
  // REGULAR ARCHIVED STAGES
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
      .map(
        stageRaw => {

          if (
            typeof stageRaw ===
            "string"
          ) {
            const stage = {
              stageDocId:
                stageRaw,

              stageId:
                stageRaw,

              stageName:
                stageRaw,

              type:
                "",

              stageType:
                "",

              isFinal:
                false
            };

            stage.isFinal =
              isFinalStage(
                stage
              );

            return stage;
          }

          const stage = {
            stageDocId:
              String(
                stageRaw.stageDocId ||
                stageRaw.id ||
                ""
              ),

            stageId:
              String(
                stageRaw.stageId ||
                stageRaw.stageDocId ||
                stageRaw.id ||
                ""
              ),

            stageName:
              String(
                stageRaw.stageName ||
                stageRaw.stageId ||
                stageRaw.stageDocId ||
                stageRaw.id ||
                ""
              ),

            type:
              String(
                stageRaw.type ||
                ""
              ),

            stageType:
              String(
                stageRaw.stageType ||
                ""
              ),

            isFinal:
              Boolean(
                stageRaw.isFinal
              )
          };

          stage.isFinal =
            isFinalStage(
              stage
            );

          return stage;
        }
      )

      /*
       * Без пустих ID.
       */
      .filter(
        stage =>
          stage.stageDocId
      )

      /*
       * ФІНАЛ ПОВНІСТЮ
       * ВИКЛЮЧАЄМО З РЕЙТИНГУ.
       */
      .filter(
        stage =>
          !isFinalStage(
            stage
          )
      )

      /*
       * Е1 → Е2 → Е3...
       */
      .sort(
        (a, b) =>
          stageSortValue(a) -
          stageSortValue(b)
      );
  }

  // =========================================================
  // HEADERS
  // =========================================================

  function buildStageHeaders(
    regularStages
  ) {
    const heads = [
      $("seasonTopHead"),
      $("seasonContendersHead")
    ].filter(Boolean);

    heads.forEach(
      head => {

        head
          .querySelectorAll(
            "th.col-stage"
          )
          .forEach(
            element =>
              element.remove()
          );

        const pointsTh =
          head.querySelector(
            "th.col-points"
          );

        if (!pointsTh) {
          return;
        }

        regularStages.forEach(
          (
            stage,
            index
          ) => {

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
      }
    );

    document.body
      .setAttribute(
        "data-stages",
        String(
          regularStages.length
        )
      );
  }

  // =========================================================
  // ROW HTML
  // =========================================================

  function rowHTML(
    place,
    qualified,
    stagesCount
  ) {
    const stagesHtml =
      Array.from({
        length:
          stagesCount
      })
        .map(
          () => `
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
          `
        )
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

    topTbody.innerHTML =
      "";

    for (
      let i = 1;
      i <= TOP_COUNT;
      i++
    ) {
      topTbody
        .insertAdjacentHTML(
          "beforeend",
          rowHTML(
            i,
            true,
            stagesCount
          )
        );
    }

    contTbody.innerHTML =
      "";

    const count =
      Math.max(
        3,
        Number(
          contendersCount ||
          0
        )
      );

    for (
      let i = 0;
      i < count;
      i++
    ) {
      contTbody
        .insertAdjacentHTML(
          "beforeend",
          rowHTML(
            TOP_COUNT +
              i +
              1,
            false,
            stagesCount
          )
        );
    }
  }

  // =========================================================
  // MOVE
  // =========================================================

  function setMove(
    element,
    moveDelta
  ) {
    if (!element) {
      return;
    }

    element.classList.remove(
      "move--up",
      "move--down",
      "move--same"
    );

    const delta =
      Number(
        moveDelta ||
        0
      );

    if (
      delta > 0
    ) {
      element.classList.add(
        "move--up"
      );

      element.textContent =
        `▲${delta}`;

      return;
    }

    if (
      delta < 0
    ) {
      element.classList.add(
        "move--down"
      );

      element.textContent =
        `▼${Math.abs(
          delta
        )}`;

      return;
    }

    element.classList.add(
      "move--same"
    );

    element.textContent =
      "–";
  }

  // =========================================================
  // RENDER ROW
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

    /*
     * Зберігаємо teamId
     * прямо у DOM теж.
     *
     * Це не впливає на вигляд,
     * але корисно для діагностики.
     */
    if (
      item.teamId
    ) {
      tr.dataset.teamId =
        item.teamId;
    } else {
      delete tr.dataset.teamId;
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

    setMove(
      tr.querySelector(
        ".move"
      ),
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

    // ---------------------------------------------------------
    // STAGES
    // ---------------------------------------------------------

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
      (
        cell,
        index
      ) => {

        const stage =
          stages[index] ||
          {};

        const placeElement =
          cell.querySelector(
            ".stage-place"
          );

        const pointsElement =
          cell.querySelector(
            ".stage-points"
          );

        if (
          placeElement
        ) {
          placeElement.textContent =
            safeText(
              stage.p,
              "–"
            );
        }

        if (
          pointsElement
        ) {
          pointsElement.textContent =
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
          stage.noShow ===
          true
        ) {
          cell.classList.add(
            "stage-noshow"
          );

        } else if (
          stage.counted ===
          true
        ) {
          cell.classList.add(
            "stage-counted"
          );

        } else if (
          stage.dropped ===
            true ||
          stage.counted ===
            false
        ) {
          cell.classList.add(
            "stage-dropped"
          );
        }
      }
    );

    // ---------------------------------------------------------
    // POINTS
    // ---------------------------------------------------------

    const pointsEl =
      tr.querySelector(
        ".col-points b"
      );

    if (
      pointsEl
    ) {
      pointsEl.textContent =
        safeText(
          item.points
        );
    }

    // ---------------------------------------------------------
    // WEIGHT
    // ---------------------------------------------------------

    const weightEl =
      tr.querySelector(
        "td.col-weight"
      );

    if (
      weightEl
    ) {
      weightEl.textContent =
        safeText(
          item.weight
        );
    }

    // ---------------------------------------------------------
    // BIG FISH
    // ---------------------------------------------------------

    const bigCell =
      tr.querySelector(
        "td.col-big"
      );

    if (
      bigCell
    ) {
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

    // ---------------------------------------------------------
    // TOP 18
    // ---------------------------------------------------------

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
  // NORMALIZE STANDING
  // =========================================================

  function normalizeStandingRow(
    row
  ) {
    return {
      teamId:
        String(
          row.teamId ||
          ""
        ).trim(),

      team:
        String(
          row.team ||
          row.teamName ||
          "—"
        ).trim(),

      zone:
        String(
          row.zone ||
          ""
        )
          .toUpperCase()
          .trim(),

      sector:
        String(
          row.sector ||
          ""
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

    /*
     * Зони.
     */
    [
      "A",
      "B",
      "C"
    ].forEach(
      zone => {

        const zoneRows =
          rows
            .filter(
              row =>
                row.zone ===
                zone
            )
            .sort(
              (
                a,
                b
              ) => {

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
      }
    );

    /*
     * Якщо зона відсутня.
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
      .forEach(
        row => {

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
        }
      );

    return {
      byTeamId,
      byTeamName
    };
  }

  // =========================================================
  // LOAD ARCHIVED STAGES
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
              snap.data() ||
              {};

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

          } catch (
            error
          ) {
            console.warn(
              "[Final qualification] Не вдалося прочитати етап:",
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
  // FIND TEAM IN ARCHIVE
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
        team.teamId ||
        ""
      ).trim();

    const teamName =
      clean(
        team.team ||
        team.teamName ||
        ""
      );

    /*
     * teamId завжди має
     * найвищий пріоритет.
     */
    if (
      teamId &&
      stageMap.byTeamId.has(
        teamId
      )
    ) {
      return stageMap
        .byTeamId
        .get(
          teamId
        );
    }

    /*
     * Назва — тільки fallback
     * для старих даних.
     */
    if (
      teamName &&
      stageMap.byTeamName.has(
        teamName
      )
    ) {
      return stageMap
        .byTeamName
        .get(
          teamName
        );
    }

    return null;
  }

  // =========================================================
  // REGULAR STAGE RESULT
  // =========================================================

  function readRegularStageResult(
    team,
    stage,
    archiveMaps
  ) {
    /*
     * Фінал ніколи
     * не враховуємо.
     */
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
        p:
          place,

        pts:
          place,

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

    /*
     * Fallback зі старого
     * seasonRating.
     */
    const stagesObj =
      team.stages ||
      {};

    const stageData =
      stagesObj[
        stage.stageDocId
      ] ||
      stagesObj[
        stage.stageId
      ] ||
      null;

    if (
      !stageData
    ) {
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
      p:
        place,

      pts:
        place,

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
  // BEST RESULTS
  // =========================================================

  function calculateBestResults(
    team,
    regularStages,
    archiveMaps
  ) {
    const allResults =
      [];

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

            p:
              "–",

            pts:
              ABSENT_POINTS,

            totalWeight:
              0,

            bigFish:
              0,

            totalCount:
              0,

            isNoShow:
              true
          });
        }
      }
    );

    const sorted =
      allResults
        .slice()
        .sort(
          (
            a,
            b
          ) => {

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
          item =>
            item.stageDocId
        )
      );

    const droppedKeys =
      new Set(
        dropped.map(
          item =>
            item.stageDocId
        )
      );

    const ratingPoints =
      counted.reduce(
        (
          sum,
          item
        ) =>
          sum +
          num(
            item.pts
          ),
        0
      );

    return {
      countedKeys,
      droppedKeys,
      ratingPoints
    };
  }

  // =========================================================
  // STAGE CELLS
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

        if (
          !result
        ) {
          return {
            p:
              "–",

            pts:
              ABSENT_POINTS,

            noShow:
              true,

            counted,

            dropped
          };
        }

        return {
          p:
            result.p,

          pts:
            result.pts,

          noShow:
            false,

          counted,

          dropped
        };
      }
    );
  }

  // =========================================================
  // TOTAL WEIGHT
  // =========================================================

  function getTournamentWeight(
    team,
    regularStages,
    archiveMaps
  ) {
    let weight =
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
  // TOURNAMENT BIG FISH
  // =========================================================

  function getTournamentBigFish(
    team,
    regularStages,
    archiveMaps
  ) {
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
  // RANK TEAMS
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

          return {
            teamId:
              String(
                team.teamId ||
                ""
              ).trim(),

            team:
              String(
                team.team ||
                team.teamName ||
                "—"
              ).trim(),

            stages:
              makeStageCells(
                team,
                regularStages,
                bestInfo,
                archiveMaps
              ),

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
      (
        a,
        b
      ) => {

        /*
         * 1.
         * Менше балів = краще.
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
         * 2.
         * Більша загальна вага.
         */
        if (
          b.displayWeight !==
          a.displayWeight
        ) {
          return (
            b.displayWeight -
            a.displayWeight
          );
        }

        /*
         * 3.
         * Більший Big Fish.
         */
        if (
          b.displayBigFish !==
          a.displayBigFish
        ) {
          return (
            b.displayBigFish -
            a.displayBigFish
          );
        }

        /*
         * 4.
         * Стабільний fallback.
         */
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

    return rows.map(
      (
        row,
        index
      ) => ({
        ...row,

        place:
          index + 1
      })
    );
  }

  // =========================================================
  // PREVIOUS PLACES
  // =========================================================

  function calculatePreviousPlaces(
    rawTeams,
    regularStages,
    archiveMaps
  ) {
    if (
      regularStages.length <=
      1
    ) {
      return new Map();
    }

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
  // FIRESTORE -> PAYLOAD
  // =========================================================

  async function convertRatingToRows(
    db,
    rating
  ) {
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
        (
          max,
          row
        ) =>
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

          const previousPlace =
            previousPlaces.get(
              row.teamId
            ) ||
            row.place;

          const moveDelta =
            previousPlace -
            row.place;

          return {
            /*
             * КРИТИЧНО:
             *
             * teamId тепер передається
             * далі разом із рейтингом.
             *
             * Саме він потрібен
             * автоматизації finalInvites.
             */
            teamId:
              row.teamId,

            place:
              row.place,

            team:
              row.team,

            stages:
              row.stages,

            points:
              Number.isFinite(
                row.ratingPoints
              )
                ? row.ratingPoints
                : "—",

            weight:
              fmtKg(
                row.displayWeight
              ),

            bigFish:
              fmtKg(
                row.displayBigFish
              ),

            seasonBigFishWinner:
              seasonBigFish >
                0 &&
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

    return {
      seasonYear:
        SEASON_YEAR,

      topCount:
        TOP_COUNT,

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

    buildStageHeaders(
      regularStages
    );

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

    const contenderRows =
      $("season-contenders")
        ? $("season-contenders")
            .querySelectorAll(
              "tr"
            )
        : [];

    rows.forEach(
      (
        item,
        index
      ) => {

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

          return;
        }

        const contenderIndex =
          index -
          TOP_COUNT;

        if (
          contenderRows[
            contenderIndex
          ]
        ) {
          renderRow(
            contenderRows[
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
    );

    // ---------------------------------------------------------
    // TITLES
    // ---------------------------------------------------------

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

    document.body
      .setAttribute(
        "data-season-year",
        SEASON_YEAR
      );

    // ---------------------------------------------------------
    // ERROR
    // ---------------------------------------------------------

    if (
      !rows.length &&
      !offline
    ) {
      showError(
        `⚠️ Немає даних відбору сезону ${SEASON_YEAR}. Спочатку потрібно архівувати хоча б один етап.`
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
    clearOldRatingCaches();

    try {
      const db =
        await waitReady();

      /*
       * ГОЛОВНЕ:
       *
       * визначаємо рік ДО читання
       * seasonRating і cache.
       */
      SEASON_YEAR =
        await resolveSeasonYear(
          db
        );

      if (
        !SEASON_YEAR
      ) {
        throw new Error(
          "Не вдалося визначити сезон."
        );
      }

      console.log(
        "[Final qualification] active season:",
        SEASON_YEAR
      );

      /*
       * Тепер cache уже
       * прив'язаний до конкретного року.
       */
      const cached =
        cacheGet();

      if (
        cached
      ) {
        try {
          renderRatingPayload(
            cached,
            true
          );

        } catch (
          error
        ) {
          console.warn(
            "[Final qualification] cache render:",
            error
          );
        }
      }

      /*
       * Реальний рейтинг
       * конкретного сезону.
       */
      db
        .collection(
          "seasonRating"
        )
        .doc(
          SEASON_YEAR
        )
        .onSnapshot(

          async snapshot => {

            if (
              !snapshot.exists
            ) {
              showError(
                `⚠️ Немає документа seasonRating/${SEASON_YEAR}`
              );

              setReadyFlag();

              return;
            }

            try {
              const rating =
                snapshot.data() ||
                {};

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

            } catch (
              error
            ) {
              console.error(
                "[Final qualification] convert:",
                error
              );

              showError(
                `⚠️ Помилка формування рейтингу сезону ${SEASON_YEAR}: ${safeText(
                  error.message ||
                  error
                )}`
              );

              setReadyFlag();
            }
          },

          error => {

            console.error(
              "[Final qualification] onSnapshot:",
              error
            );

            const cachedData =
              cacheGet();

            if (
              cachedData
            ) {
              renderRatingPayload(
                cachedData,
                true
              );

              showError(
                `⚠️ Офлайн-режим. Показано кеш рейтингу сезону ${SEASON_YEAR}.`
              );

            } else {
              showError(
                `⚠️ Помилка читання seasonRating/${SEASON_YEAR}: ${safeText(
                  error.message
                )}`
              );
            }

            setReadyFlag();
          }
        );

    } catch (
      error
    ) {
      console.error(
        "[Final qualification] load:",
        error
      );

      showError(
        `⚠️ Помилка завантаження рейтингу: ${safeText(
          error.message ||
          error
        )}`
      );

      setReadyFlag();
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

  /*
   * Корисно для інших JS.
   *
   * Наприклад:
   *
   * window.getActiveSeasonYear()
   */
  window.getActiveSeasonYear =
    function () {
      return SEASON_YEAR;
    };

  // =========================================================
  // START
  // =========================================================

  document.addEventListener(
    "DOMContentLoaded",
    loadRating
  );

})();

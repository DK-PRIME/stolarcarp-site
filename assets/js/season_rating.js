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
//    • відбірковий етап: бал = місце в зоні;
//    • Фінал: бал = місце в зоні;
//    • пропущений Фінал = 7 балів;
//    • менше балів — краще;
//    • при рівності: більша загальна вага;
//    • потім більший Big Fish.
//
// 3. ПРИЗЕРИ
//    • 1 / 2 / 3 місце автоматично.
//
// 4. BIG FISH СЕЗОНУ
//    • серед ВСІХ учасників сезону;
//    • не тільки TOP-18;
//    • усі відбіркові етапи + Фінал.
//
// 5. АРХІВАЦІЯ СЕЗОНУ
//    • snapshot -> seasonArchives/{year}
//    • зберігає:
//        - Етап 1 / 2 / 3...
//        - Фінал
//        - summary кожного етапу
//        - повний рейтинг
//        - TOP-3
//        - Big Fish сезону
//    • seasonResults/{year}/stages НЕ видаляється;
//    • seasonRating/{year} після архівації очищається.
//
// 6. FINAL DETECTION
//    • isFinal / type / stageType / назва "Фінал";
//    • finalStageId / finalStageDocId у seasonRating;
//    • legacy fallback:
//      останній етап з <= TOP-18 команд,
//      якщо попередні етапи мали > TOP-18.
//
// =========================================================

(function () {
  "use strict";

  const $ = id =>
    document.getElementById(id);

  // =========================================================
  // SETTINGS
  // =========================================================

  const TOP_COUNT = 18;

  const BEST_COUNT_FOR_FINAL = 2;

  const ABSENT_REGULAR_POINTS = 8;

  const ABSENT_FINAL_POINTS = 7;

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

  // =========================================================
  // RUNTIME
  // =========================================================

  let currentDb = null;

  let currentRatingSource = null;

  let currentPayload = null;

  let currentUser = null;

  let currentUserIsAdmin = false;

  let archiveInProgress = false;

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
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function fmtKg(value) {
    const n =
      num(value);

    if (n <= 0) {
      return "—";
    }

    return n
      .toFixed(2)
      .replace(/\.?0+$/, "");
  }

  function clean(value) {
    return String(
      value || ""
    )
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

    currentDb =
      db;

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

    if (
      window.scIsAdmin === true
    ) {
      return true;
    }

    try {
      const token =
        await user
          .getIdTokenResult();

      if (
        token?.claims?.admin === true ||
        token?.claims?.role === "admin"
      ) {
        return true;
      }
    } catch (error) {
      console.warn(
        "[Season Rating] claims:",
        error
      );
    }

    try {
      const snap =
        await db
          .collection("users")
          .doc(user.uid)
          .get();

      if (snap.exists) {
        const data =
          snap.data() || {};

        if (
          data.isAdmin === true ||
          data.admin === true ||
          clean(data.role) ===
            "admin"
        ) {
          return true;
        }
      }
    } catch (error) {
      console.warn(
        "[Season Rating] users admin:",
        error
      );
    }

    try {
      const configuredEmail =
        clean(
          window.SC_ADMIN_EMAIL ||
          window.scAdminEmail ||
          ""
        );

      const userEmail =
        clean(
          user.email || ""
        );

      if (
        configuredEmail &&
        userEmail &&
        configuredEmail ===
          userEmail
      ) {
        return true;
      }
    } catch {}

    return false;
  }

  async function initAdminAccess(
    db
  ) {
    if (
      typeof firebase ===
        "undefined" ||
      !firebase.auth
    ) {
      return;
    }

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
      String(
        value || ""
      );

    let match =
      raw.match(
        /stage[-_\s]*(\d+)/i
      );

    if (match) {
      return Number(
        match[1]
      );
    }

    match =
      raw.match(
        /етап\s*(\d+)/i
      );

    if (match) {
      return Number(
        match[1]
      );
    }

    match =
      raw.match(
        /(?:^|[^a-zа-яіїєґ0-9])[eе]\s*(\d+)/i
      );

    if (match) {
      return Number(
        match[1]
      );
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

  function stageSortValue(
    stage
  ) {
    if (
      isFinalStage(stage)
    ) {
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

    return `Етап ${
      stageDisplayNumber(
        stage,
        index
      )
    }`;
  }

  function normalizeStage(
    stage
  ) {
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

        type:
          "",

        stageType:
          "",

        title:
          "",

        isFinal:
          false
      };

      fixed.isFinal =
        isFinalStage(
          fixed
        );

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
      isFinalStage(
        fixed
      );

    return fixed;
  }

  function getCandidateStages(
    rating
  ) {
    const source =
      Array.isArray(
        rating.archivedStages
      )
        ? rating.archivedStages
        : [];

    return source
      .map(
        normalizeStage
      )
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
          row?.teamId ||
          ""
        ).trim(),

      team:
        String(
          row?.team ||
          row?.teamName ||
          "—"
        ).trim(),

      zone:
        String(
          row?.zone ||
          ""
        )
          .toUpperCase()
          .trim(),

      sector:
        String(
          row?.sector ||
          ""
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
        row?.w1 ||
        null,

      w2:
        row?.w2 ||
        null,

      w3:
        row?.w3 ||
        null,

      w4:
        row?.w4 ||
        null
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
      String(
        b.team
      ),
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
      (
        row,
        index
      ) => {
        const key =
          row.teamId ||
          clean(
            row.team
          );

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
              compareStandingRows
            );

        zoneRows.forEach(
          (
            row,
            index
          ) => {
            const key =
              row.teamId ||
              clean(
                row.team
              );

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
          const key =
            row.teamId ||
            clean(
              row.team
            );

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
      data?.summary ||
      {};

    const calculatedWeight =
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          num(
            row?.totalWeight
          ),
        0
      );

    const calculatedBig =
      rows.reduce(
        (
          max,
          row
        ) =>
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
        (
          sum,
          row
        ) =>
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
        teamsCountRaw !==
          null
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
          ? num(
              bigRaw
            )
          : calculatedBig,

      totalCount:
        fishCountRaw !==
          null
          ? num(
              fishCountRaw
            )
          : calculatedFishCount
    };
  }

  // =========================================================
  // LOAD STAGE MAPS
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
              console.warn(
                "[Season Rating] Етап не знайдено:",
                stage.stageDocId
              );

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

            const map =
              computeStageMap(
                standings
              );

            map.raw =
              data;

            map.summary =
              buildStageSummary(
                data,
                standings
              );

            map.meta = {
              stageDocId:
                stage.stageDocId,

              stageId:
                String(
                  data.stageId ||
                  stage.stageId ||
                  stage.stageDocId ||
                  ""
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
          } catch (
            error
          ) {
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
  // ENRICH STAGES
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
          map?.meta ||
          {};

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
              stage.stageId ||
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
        rating.finalStage.stageDocId,
        rating.finalStage.stageId,
        rating.finalStage.id,
        rating.finalStage.key
      );
    }

    return raw
      .map(
        value =>
          clean(
            value
          )
      )
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
      .map(
        clean
      )
      .filter(Boolean);

    return hints.some(
      hint =>
        values.includes(
          hint
        )
    );
  }

  // =========================================================
  // RESOLVE STAGE STRUCTURE
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

    /*
     * 1. Явно позначений Фінал.
     */
    let finalStage =
      stages.find(
        stage =>
          isFinalStage(
            stage
          )
      ) ||
      null;

    /*
     * 2. Hint у seasonRating.
     */
    if (!finalStage) {
      const hints =
        getRatingFinalHints(
          rating
        );

      if (
        hints.length
      ) {
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

    /*
     * 3. Legacy fallback.
     *
     * Старий сезон міг записати:
     * stage-4
     *
     * замість:
     * isFinal:true / "Фінал".
     *
     * Для STOLAR CARP фінал:
     * TOP-18.
     *
     * Якщо останній етап має
     * <=18 команд, а хоча б один
     * попередній мав >18 —
     * останній вважаємо Фіналом.
     */
    if (
      !finalStage &&
      stages.length >= 2
    ) {
      const numericStages =
        stages
          .slice()
          .sort(
            (
              a,
              b
            ) =>
              stageSortValue(a) -
              stageSortValue(b)
          );

      const last =
        numericStages[
          numericStages.length - 1
        ];

      const lastSummary =
        stageMaps.get(
          last.stageDocId
        )?.summary;

      const lastCount =
        num(
          lastSummary?.teamsCount
        );

      const previous =
        numericStages.slice(
          0,
          -1
        );

      const previousCounts =
        previous.map(
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
            count >
            TOP_COUNT
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

        stages =
          stages.map(
            stage =>
              stage.stageDocId ===
                last.stageDocId
                ? finalStage
                : stage
          );

        console.info(
          "[Season Rating] Legacy Final inferred:",
          finalStage.stageDocId
        );
      }
    }

    /*
     * Якщо finalStage знайдений
     * через hint — канонізуємо.
     */
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
          (
            a,
            b
          ) =>
            stageSortValue(a) -
            stageSortValue(b)
        );

    const allStages =
      finalStage
        ? [
            ...regularStages,
            finalStage
          ]
        : [
            ...regularStages
          ];

    return {
      regularStages,
      finalStage,
      allStages
    };
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
        team.teamId ||
        ""
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
        .has(
          teamId
        )
    ) {
      return stageMap
        .byTeamId
        .get(
          teamId
        );
    }

    if (
      teamName &&
      stageMap
        .byTeamName
        .has(
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
      isFinalStage(
        stage
      );

    const stageMap =
      stageMaps.get(
        stage.stageDocId
      );

    const archiveRow =
      findTeamRow(
        stageMap,
        team
      );

    if (
      archiveRow
    ) {
      const place =
        final
          ? num(
              archiveRow.zonePlace
            )
          : num(
              archiveRow.zonePlace ||
              archiveRow.points ||
              archiveRow.place
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
          ),

        totalCount:
          num(
            archiveRow.totalCount
          ),

        final
      };
    }

    const stagesObject =
      team.stages ||
      {};

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
              ABSENT_REGULAR_POINTS,

            totalWeight:
              0,

            bigFish:
              0
          };
        }
      );

    results.sort(
      (
        a,
        b
      ) => {
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
        (
          sum,
          result
        ) =>
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
    let weight =
      0;

    regularStages.forEach(
      stage => {
        const result =
          readStageResult(
            team,
            stage,
            stageMaps
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

  function getRegularBigFish(
    team,
    regularStages,
    stageMaps
  ) {
    let bigFish =
      0;

    regularStages.forEach(
      stage => {
        const result =
          readStageResult(
            team,
            stage,
            stageMaps
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
  // TOP-18
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
      (
        a,
        b
      ) => {
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
  // ALL PARTICIPANTS
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
                  row.teamId ||
                  ""
                ).trim(),

              team:
                String(
                  row.team ||
                  "—"
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
  // REGULAR CELLS
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

  // =========================================================
  // SEASON STATS
  // =========================================================

  function calculateSeasonStats(
    team,
    regularStages,
    finalStage,
    stageMaps
  ) {
    let totalWeight =
      0;

    let biggestFish =
      0;

    let biggestFishStage =
      "";

    regularStages.forEach(
      (
        stage,
        index
      ) => {
        const result =
          readStageResult(
            team,
            stage,
            stageMaps
          );

        if (
          !result
        ) {
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

    if (
      finalStage
    ) {
      const result =
        readStageResult(
          team,
          finalStage,
          stageMaps
        );

      if (
        result
      ) {
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
      Boolean(
        finalStage
      );

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
              (
                sum,
                item
              ) =>
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

          if (
            finalStage
          ) {
            const finalResult =
              readStageResult(
                team,
                finalStage,
                stageMaps
              );

            if (
              finalResult
            ) {
              finalPlace =
                finalResult.place;

              finalPoints =
                finalResult.points;
            } else {
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
                team.teamId ||
                ""
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
              seasonStats
                .totalWeight,

            bigFish:
              seasonStats
                .biggestFish,

            bigFishStage:
              seasonStats
                .biggestFishStage,

            finalArchived
          };
        }
      );

    rows.sort(
      (
        a,
        b
      ) => {
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
  // ALL PARTICIPANTS BIG FISH
  // =========================================================

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
              team.teamId ||
              ""
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
  // STAGE ARCHIVE SUMMARIES
  // =========================================================

  function buildStageArchiveSummaries(
    allStages,
    stageMaps
  ) {
    return allStages.map(
      (
        stage,
        index
      ) => {
        const map =
          stageMaps.get(
            stage.stageDocId
          );

        const summary =
          map?.summary || {
            teamsCount:
              0,

            totalWeight:
              0,

            maxBigFish:
              0,

            totalCount:
              0
          };

        const final =
          isFinalStage(
            stage
          );

        const number =
          final
            ? null
            : stageDisplayNumber(
                stage,
                index
              );

        const title =
          final
            ? "Фінал"
            : `Етап ${number}`;

        return {
          type:
            final
              ? "final"
              : "qualification",

          isFinal:
            final,

          number,

          title,

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

          /*
           * Канонічна назва.
           *
           * Навіть якщо старий
           * stage-4 був без "Фінал",
           * в архіві буде "Фінал".
           */
          stageName:
            title,

          sourceStageName:
            String(
              map?.meta
                ?.stageName ||
              stage.stageName ||
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
            ),

          /*
           * Дублюємо summary,
           * щоб archive.js міг
           * читати і старий,
           * і новий формат.
           */
          summary: {
            teamsCount:
              num(
                summary.teamsCount
              ),

            totalWeight:
              num(
                summary.totalWeight
              ),

            maxBigFish:
              num(
                summary.maxBigFish
              ),

            totalCount:
              num(
                summary.totalCount
              )
          }
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

    if (
      !finalHeader
    ) {
      return;
    }

    regularStages.forEach(
      (
        stage,
        index
      ) => {
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

    if (
      !rows.length
    ) {
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
                  ${esc(
                    row.team
                  )}
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

  function renderPodium(
    rows
  ) {
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

      if (
        teamEl
      ) {
        teamEl.textContent =
          row
            ? row.team
            : "—";
      }

      if (
        pointsEl
      ) {
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
  // BIG FISH WINNERS
  // =========================================================

  function getBigFishWinners(
    allParticipantsStats
  ) {
    const teams =
      Array.isArray(
        allParticipantsStats
      )
        ? allParticipantsStats
        : [];

    const maxBigFish =
      teams.reduce(
        (
          max,
          row
        ) =>
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
      return {
        weight:
          0,

        winners:
          []
      };
    }

    return {
      weight:
        maxBigFish,

      winners:
        teams.filter(
          row =>
            num(
              row.bigFish
            ) ===
            maxBigFish
        )
    };
  }

  // =========================================================
  // BIG FISH RENDER
  // =========================================================

  function renderSeasonBigFish(
    allParticipantsStats
  ) {
    const teamEl =
      $("seasonBigFishTeam");

    const metaEl =
      $("seasonBigFishMeta");

    const weightEl =
      $("seasonBigFishWeight");

    const result =
      getBigFishWinners(
        allParticipantsStats
      );

    const maxBigFish =
      result.weight;

    const winners =
      result.winners;

    if (
      maxBigFish <= 0
    ) {
      if (
        teamEl
      ) {
        teamEl.textContent =
          "—";
      }

      if (
        metaEl
      ) {
        metaEl.textContent =
          "Дані відсутні";
      }

      if (
        weightEl
      ) {
        weightEl.textContent =
          "—";
      }

      return;
    }

    if (
      teamEl
    ) {
      teamEl.textContent =
        winners
          .map(
            row =>
              row.team
          )
          .join(
            " / "
          );
    }

    if (
      metaEl
    ) {
      const stages =
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
        stages.length
          ? stages.join(
              " / "
            )
          : `Сезон ${SEASON_YEAR}`;
    }

    if (
      weightEl
    ) {
      weightEl.textContent =
        `${fmtKg(
          maxBigFish
        )} кг`;
    }

    document
      .querySelectorAll(
        "#seasonFinalRows td.col-big"
      )
      .forEach(
        cell => {
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
        }
      );
  }

  // =========================================================
  // TITLES
  // =========================================================

  function updateTitles() {
    const kicker =
      $("seasonRatingKicker");

    const title =
      $("seasonRatingTitle");

    if (
      kicker
    ) {
      kicker.textContent =
        `СЕЗОН ${SEASON_YEAR}`;
    }

    if (
      title
    ) {
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
    /*
     * 1. Беремо всі archivedStages.
     */
    const candidateStages =
      getCandidateStages(
        rating
      );

    /*
     * 2. Читаємо реальні
     * seasonResults/{year}/stages.
     *
     * Тут отримуємо:
     * standings + summary + meta.
     */
    const stageMaps =
      await loadStageMaps(
        db,
        candidateStages
      );

    /*
     * 3. Тепер визначаємо,
     * що регулярне, а що Фінал.
     */
    const {
      regularStages,
      finalStage,
      allStages
    } =
      resolveStageStructure(
        rating,
        candidateStages,
        stageMaps
      );

    const rawTeams =
      Array.isArray(
        rating.teams
      )
        ? rating.teams.slice()
        : [];

    /*
     * TOP-18 тільки
     * за відбірковими етапами.
     */
    const finalists =
      getFinalists(
        rawTeams,
        regularStages,
        stageMaps
      );

    /*
     * Підсумковий рейтинг.
     */
    const rows =
      buildSeasonRanking(
        finalists,
        regularStages,
        finalStage,
        stageMaps
      );

    /*
     * Усі учасники сезону
     * для Big Fish.
     */
    const allParticipants =
      collectAllSeasonParticipants(
        allStages,
        stageMaps
      );

    const participantsMap =
      new Map();

    allParticipants.forEach(
      team => {
        const key =
          teamKey(
            team
          );

        if (
          key
        ) {
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
          teamKey(
            team
          );

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

    const finalAllParticipants =
      [
        ...participantsMap.values()
      ];

    const allParticipantsStats =
      buildAllParticipantsStats(
        finalAllParticipants,
        regularStages,
        finalStage,
        stageMaps
      );

    /*
     * Готовий summary:
     *
     * Етап 1
     * Команд: 21
     * Вага: ...
     * BIG: ...
     *
     * ...
     *
     * Фінал
     * Команд: 18
     * ...
     */
    const stageSummaries =
      buildStageArchiveSummaries(
        allStages,
        stageMaps
      );

    return {
      regularStages,
      finalStage,
      allStages,

      rows,

      allParticipantsStats,

      stageSummaries
    };
  }

  // =========================================================
  // RENDER PAYLOAD
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

    const allParticipantsStats =
      Array.isArray(
        payload.allParticipantsStats
      )
        ? payload.allParticipantsStats
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
      allParticipantsStats
    );

    updateTitles();

    renderAdminArchivePanel();

    if (
      !rows.length
    ) {
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
      document.getElementById(
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
        margin-top:28px;
        padding:18px;
        border-radius:18px;
        border:1px solid rgba(245,158,11,.42);
        background:
          radial-gradient(
            circle at top left,
            rgba(245,158,11,.12),
            transparent 45%
          ),
          #0b0d14;
        box-shadow:
          0 16px 36px rgba(0,0,0,.42);
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
        width:100%;
        margin-top:14px;
        padding:14px 16px;
        border:1px solid rgba(251,191,36,.55);
        border-radius:14px;
        background:
          linear-gradient(
            90deg,
            #facc15,
            #f97316
          );
        color:#111827;
        font-size:.95rem;
        font-weight:950;
        cursor:pointer;
        box-shadow:
          0 14px 30px rgba(249,115,22,.22);
      }

      .season-archive-admin__button:disabled{
        cursor:wait;
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
        background:rgba(34,197,94,.08);
      }

      .season-archive-admin__status.is-error{
        display:block;
        color:#fca5a5;
        border-color:rgba(239,68,68,.35);
        background:rgba(239,68,68,.08);
      }

      .season-archive-admin__status.is-working{
        display:block;
        color:#fde68a;
        border-color:rgba(250,204,21,.30);
        background:rgba(250,204,21,.06);
      }
    `;

    document.head.appendChild(
      style
    );
  }

  // =========================================================
  // ADMIN PANEL
  // =========================================================

  function renderAdminArchivePanel() {
    injectAdminArchiveStyles();

    let panel =
      $("seasonArchiveAdmin");

    if (
      !currentUserIsAdmin
    ) {
      if (
        panel
      ) {
        panel.remove();
      }

      return;
    }

    const content =
      document.querySelector(
        ".season-rating-content"
      );

    if (
      !content
    ) {
      return;
    }

    if (
      !panel
    ) {
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
          Кнопка збере повний фінальний snapshot сезону
          ${esc(SEASON_YEAR)}:
          відбіркові етапи, Фінал,
          підсумковий рейтинг,
          призерів та Big Fish.
          Дані буде збережено у
          <b>seasonArchives/${esc(SEASON_YEAR)}</b>.
        </div>

        <div class="season-archive-admin__warning">
          Після успішного запису
          <b>seasonRating/${esc(SEASON_YEAR)}</b>
          буде очищено.

          <br><br>

          Детальні архіви етапів
          <b>seasonResults/${esc(SEASON_YEAR)}/stages</b>
          залишаться без змін.
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

      const button =
        $("archiveSeasonButton");

      if (
        button
      ) {
        button.addEventListener(
          "click",
          archiveCurrentSeason
        );
      }
    }
  }

  function setArchiveStatus(
    message,
    type = ""
  ) {
    const box =
      $("seasonArchiveStatus");

    if (
      !box
    ) {
      return;
    }

    box.className =
      "season-archive-admin__status";

    if (
      type
    ) {
      box.classList.add(
        `is-${type}`
      );
    }

    box.textContent =
      message;
  }

  // =========================================================
  // ARCHIVE STAGES
  // =========================================================

  function makeArchiveStages(
    payload
  ) {
    const summaries =
      Array.isArray(
        payload?.stageSummaries
      )
        ? payload.stageSummaries
        : [];

    return summaries.map(
      stage => ({
        type:
          stage.type,

        isFinal:
          stage.isFinal ===
          true,

        number:
          stage.number,

        title:
          stage.title,

        stageDocId:
          stage.stageDocId,

        stageId:
          stage.stageId,

        stageName:
          stage.stageName,

        sourceStageName:
          stage.sourceStageName,

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
          ),

        summary: {
          teamsCount:
            num(
              stage.summary
                ?.teamsCount
            ),

          totalWeight:
            num(
              stage.summary
                ?.totalWeight
            ),

          maxBigFish:
            num(
              stage.summary
                ?.maxBigFish
            ),

          totalCount:
            num(
              stage.summary
                ?.totalCount
            )
        }
      })
    );
  }

  // =========================================================
  // ARCHIVE DOCUMENT
  // =========================================================

  function buildArchiveDocument() {
    if (
      !currentPayload
    ) {
      throw new Error(
        "Рейтинг сезону ще не сформований."
      );
    }

    const rows =
      Array.isArray(
        currentPayload.rows
      )
        ? currentPayload.rows
        : [];

    if (
      !rows.length
    ) {
      throw new Error(
        "Немає команд для архівації."
      );
    }

    /*
     * Сезон НЕ закриваємо,
     * якщо Фінал не знайдений.
     *
     * Це захист від випадкового
     * неповного snapshot.
     */
    if (
      !currentPayload.finalStage
    ) {
      throw new Error(
        "Фінал сезону не знайдено. Архівацію заблоковано."
      );
    }

    const bigFishResult =
      getBigFishWinners(
        currentPayload
          .allParticipantsStats
      );

    const podium =
      rows
        .slice(
          0,
          3
        )
        .map(
          row => ({
            place:
              row.place,

            teamId:
              String(
                row.teamId ||
                ""
              ),

            team:
              row.team,

            points:
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
              )
          })
        );

    const ranking =
      rows.map(
        row => ({
          place:
            row.place,

          teamId:
            String(
              row.teamId ||
              ""
            ),

          team:
            row.team,

          /*
           * Відбіркові етапи.
           */
          stages:
            row.regularCells.map(
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
                  type:
                    "qualification",

                  number:
                    stageDisplayNumber(
                      stage,
                      index
                    ),

                  title:
                    stageDisplayTitle(
                      stage,
                      index
                    ),

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

          /*
           * Compatibility fields.
           */
          finalPlace:
            row.finalPlace,

          finalPoints:
            num(
              row.finalPoints
            ),

          /*
           * Новий структурований final.
           */
          final: {
            type:
              "final",

            title:
              "Фінал",

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
            row.bigFishStage ||
            ""
        })
      );

    const allBigFishParticipants =
      (
        Array.isArray(
          currentPayload
            .allParticipantsStats
        )
          ? currentPayload
              .allParticipantsStats
          : []
      ).map(
        row => ({
          teamId:
            String(
              row.teamId ||
              ""
            ),

          team:
            row.team,

          bigFish:
            num(
              row.bigFish
            ),

          bigFishStage:
            row.bigFishStage ||
            ""
        })
      );

    const stages =
      makeArchiveStages(
        currentPayload
      );

    const finalStageArchive =
      stages.find(
        stage =>
          stage.isFinal ===
          true
      ) ||
      null;

    return {
      seasonYear:
        SEASON_YEAR,

      status:
        "archived",

      /*
       * v2 =
       * stages мають summary +
       * структурований final.
       */
      archiveVersion:
        2,

      stagesCount:
        stages.length,

      regularStagesCount:
        stages.filter(
          stage =>
            !stage.isFinal
        ).length,

      hasFinal:
        Boolean(
          finalStageArchive
        ),

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
        regularStages:
          "all",

        regularStagePoints:
          "zonePlace",

        final:
          true,

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

      /*
       * Етап 1 / 2 / 3 / Фінал
       * разом із summary.
       */
      stages,

      /*
       * Швидке посилання
       * на Фінал всередині snapshot.
       */
      finalStage:
        finalStageArchive,

      /*
       * Повний TOP-18.
       */
      ranking,

      /*
       * TOP-3.
       */
      podium,

      /*
       * Big Fish сезону.
       */
      bigFish: {
        weight:
          num(
            bigFishResult.weight
          ),

        winners:
          bigFishResult
            .winners
            .map(
              row => ({
                teamId:
                  String(
                    row.teamId ||
                    ""
                  ),

                team:
                  row.team,

                stage:
                  row.bigFishStage ||
                  ""
              })
            )
      },

      /*
       * Усі учасники,
       * щоб Big Fish можна було
       * перевірити в архіві.
       */
      allParticipantsBigFish:
        allBigFishParticipants,

      source: {
        seasonRating:
          `seasonRating/${SEASON_YEAR}`,

        seasonResults:
          `seasonResults/${SEASON_YEAR}/stages`
      },

      archivedBy: {
        uid:
          currentUser?.uid ||
          "",

        email:
          currentUser?.email ||
          ""
      },

      archivedAt:
        firebase.firestore
          .FieldValue
          .serverTimestamp()
    };
  }

  // =========================================================
  // CACHE
  // =========================================================

  function clearRatingCaches() {
    try {
      const keys =
        [];

      for (
        let i = 0;
        i <
        localStorage.length;
        i++
      ) {
        const key =
          localStorage.key(
            i
          );

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
          keys.push(
            key
          );
        }
      }

      keys.forEach(
        key =>
          localStorage
            .removeItem(
              key
            )
      );
    } catch (
      error
    ) {
      console.warn(
        "[Season Archive] cache:",
        error
      );
    }
  }

  // =========================================================
  // ARCHIVE CURRENT SEASON
  // =========================================================

  async function archiveCurrentSeason() {
    if (
      archiveInProgress
    ) {
      return;
    }

    if (
      !currentUserIsAdmin
    ) {
      alert(
        "Ця дія доступна тільки адміністратору."
      );

      return;
    }

    if (
      !currentDb
    ) {
      alert(
        "Firestore ще не готовий."
      );

      return;
    }

    if (
      !currentPayload ||
      !currentPayload
        .rows
        ?.length
    ) {
      alert(
        "Немає готового рейтингу для архівації."
      );

      return;
    }

    /*
     * Тепер без Фіналу
     * сезон не закриваємо.
     */
    if (
      !currentPayload
        .finalStage
    ) {
      alert(
        `Фінал сезону ${SEASON_YEAR} не знайдено.\n\n` +
        `Сезон НЕ буде закритий.\n\n` +
        `Спочатку потрібно перевірити архів Фіналу.`
      );

      return;
    }

    const stageSummaries =
      Array.isArray(
        currentPayload
          .stageSummaries
      )
        ? currentPayload
            .stageSummaries
        : [];

    const finalSummary =
      stageSummaries.find(
        stage =>
          stage.isFinal
      );

    const confirmed =
      confirm(
        `ЗАВЕРШИТИ СЕЗОН ${SEASON_YEAR}?\n\n` +

        `Буде збережено:\n\n` +

        `${stageSummaries
          .map(
            stage =>
              `• ${
                stage.title
              }: ${
                stage.teamsCount
              } команд · ${
                fmtKg(
                  stage.totalWeight
                )
              } кг · BIG ${
                fmtKg(
                  stage.bigFish
                )
              }`
          )
          .join("\n")}\n\n` +

        `• Повний рейтинг TOP-${TOP_COUNT}\n` +
        `• 1 / 2 / 3 місце\n` +
        `• Big Fish сезону\n\n` +

        `Фінал: ${
          finalSummary
            ? `${finalSummary.teamsCount} команд`
            : "знайдено"
        }\n\n` +

        `seasonResults/${SEASON_YEAR}/stages залишиться без змін.\n` +
        `seasonRating/${SEASON_YEAR} буде очищено.\n\n` +

        `Продовжити?`
      );

    if (
      !confirmed
    ) {
      return;
    }

    const finalConfirm =
      confirm(
        `ОСТАННЄ ПІДТВЕРДЖЕННЯ.\n\n` +
        `Після завершення сезону ${SEASON_YEAR} ` +
        `робочий рейтинг буде очищено.\n\n` +
        `Фінальний snapshot залишиться у:\n` +
        `seasonArchives/${SEASON_YEAR}\n\n` +
        `Архівувати сезон?`
      );

    if (
      !finalConfirm
    ) {
      return;
    }

    const button =
      $("archiveSeasonButton");

    archiveInProgress =
      true;

    if (
      button
    ) {
      button.disabled =
        true;

      button.textContent =
        "⏳ Архівуємо сезон…";
    }

    setArchiveStatus(
      "Формуємо повний snapshot сезону…",
      "working"
    );

    try {
      const archiveDocument =
        buildArchiveDocument();

      const archiveRef =
        currentDb
          .collection(
            "seasonArchives"
          )
          .doc(
            SEASON_YEAR
          );

      const ratingRef =
        currentDb
          .collection(
            "seasonRating"
          )
          .doc(
            SEASON_YEAR
          );

      const existing =
        await archiveRef
          .get();

      if (
        existing.exists
      ) {
        const overwrite =
          confirm(
            `Архів сезону ${SEASON_YEAR} уже існує.\n\n` +
            `Перезаписати його новим повним snapshot?`
          );

        if (
          !overwrite
        ) {
          throw new Error(
            "Архівацію скасовано: архів уже існує."
          );
        }
      }

      setArchiveStatus(
        "Записуємо етапи, Фінал, рейтинг, TOP-3 та Big Fish…",
        "working"
      );

      const batch =
        currentDb.batch();

      batch.set(
        archiveRef,
        archiveDocument,
        {
          merge:
            false
        }
      );

      batch.set(
        ratingRef,
        {
          seasonYear:
            SEASON_YEAR,

          archived:
            true,

          archivedTo:
            `seasonArchives/${SEASON_YEAR}`,

          archivedAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp(),

          nextSeasonYear:
            NEXT_SEASON_YEAR,

          archivedStages:
            [],

          teams:
            [],

          source:
            "season-closed"
        },
        {
          merge:
            false
        }
      );

      await batch
        .commit();

      clearRatingCaches();

      setArchiveStatus(
        `✅ Сезон ${SEASON_YEAR} заархівовано повністю. ` +
        `Етапи + Фінал + рейтинг + TOP-3 + Big Fish збережені.`,
        "success"
      );

      if (
        button
      ) {
        button.textContent =
          `✅ Сезон ${SEASON_YEAR} заархівовано`;
      }

      alert(
        `Готово.\n\n` +
        `Сезон ${SEASON_YEAR} збережено в:\n` +
        `seasonArchives/${SEASON_YEAR}\n\n` +
        `Збережено:\n` +
        `• відбіркові етапи\n` +
        `• Фінал\n` +
        `• підсумки етапів\n` +
        `• повний рейтинг\n` +
        `• TOP-3\n` +
        `• Big Fish сезону\n\n` +
        `Детальні таблиці етапів залишились у seasonResults.`
      );

    } catch (
      error
    ) {
      console.error(
        "[Season Archive] error:",
        error
      );

      setArchiveStatus(
        `❌ ${safeText(
          error.message ||
          error
        )}`,
        "error"
      );

      if (
        button
      ) {
        button.disabled =
          false;

        button.textContent =
          `🏆 Архівувати та завершити сезон ${SEASON_YEAR}`;
      }

      archiveInProgress =
        false;
    }
  }

  // =========================================================
  // LOAD
  // =========================================================

  async function loadSeasonRating() {
    hideError();

    try {
      const db =
        await waitReady();

      initAdminAccess(
        db
      );

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
              currentRatingSource =
                null;

              currentPayload =
                null;

              showError(
                `⚠️ Немає документа seasonRating/${SEASON_YEAR}`
              );

              setReady();

              return;
            }

            try {
              const rating =
                snap.data() ||
                {};

              currentRatingSource =
                rating;

              /*
               * Уже завершений сезон.
               */
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
                    []
                };

                buildHeader(
                  []
                );

                renderTable(
                  [],
                  []
                );

                renderPodium(
                  []
                );

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

            } catch (
              error
            ) {
              console.error(
                "[Season Rating] build:",
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
              "[Season Rating] snapshot:",
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

    } catch (
      error
    ) {
      console.error(
        "[Season Rating] load:",
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
      window.location
        .reload();
    };

  // =========================================================
  // START
  // =========================================================

  document.addEventListener(
    "DOMContentLoaded",
    loadSeasonRating
  );

})();

// events/archive.js
// STOLAR CARP • Архів сезону
//
// =========================================================
// ДЖЕРЕЛА
// =========================================================
//
// 1. seasonArchives/{year}
//    • фінальний snapshot сезону;
//    • Етапи + Фінал;
//    • TOP-3;
//    • Big Fish сезону;
//    • повний рейтинг.
//
// 2. seasonResults/{year}/stages
//    • детальні standings;
//    • W1-W4;
//    • зони A/B/C;
//    • вага / BIG / місця.
//
// =========================================================
// ПОВЕДІНКА
// =========================================================
//
// ✅ Якщо seasonArchives/{year} вже є:
//    показує повний архів сезону.
//
// ✅ Якщо сезон ще НЕ закритий:
//    показує наявні seasonResults.
//
// ✅ Фінал:
//    • type:"final"
//    • isFinal:true
//    • "Фінал" у назві
//    • legacy fallback:
//      останній етап <=18 команд,
//      якщо попередні мали >18.
//
// ✅ Детальні таблиці етапів залишаються.
// ✅ Компактний mobile-first вигляд.
// =========================================================

(async function () {
  "use strict";

  // =========================================================
  // DOM
  // =========================================================

  const $ = id =>
    document.getElementById(id);

  const pageTitle =
    $("pageTitle");

  const msg =
    $("msg");

  const stagesList =
    $("stagesList");

  const resultSection =
    $("resultSection");

  const stageTitle =
    $("stageTitle");

  const stageMeta =
    $("stageMeta");

  const zonesWrap =
    $("zonesWrap");

  if (
    !stagesList
  ) {
    return;
  }

  injectArchiveCss();

  // =========================================================
  // FIREBASE
  // =========================================================

  try {
    if (
      window.scReady
    ) {
      await window.scReady;
    }
  } catch (error) {
    if (
      msg
    ) {
      msg.textContent =
        "Firebase не ініціалізувався: " +
        error.message;

      msg.className =
        "err";
    }

    return;
  }

  const db =
    window.scDb;

  if (
    !db
  ) {
    if (
      msg
    ) {
      msg.textContent =
        "Firestore не знайдено.";

      msg.className =
        "err";
    }

    return;
  }

  // =========================================================
  // PARAMS
  // =========================================================

  const params =
    new URLSearchParams(
      window.location.search
    );

  const seasonYear =
    params.get("year") ||
    "2026";

  const FINALISTS_COUNT =
    18;

  if (
    pageTitle
  ) {
    pageTitle.textContent =
      `Архів сезону ${seasonYear}`;
  }

  // =========================================================
  // STATE
  // =========================================================

  let archiveDocument =
    null;

  let stages =
    [];

  // =========================================================
  // HELPERS
  // =========================================================

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

  function clean(value) {
    return String(
      value ?? ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        " "
      );
  }

  function norm(value) {
    return String(
      value ?? ""
    ).trim();
  }

  function num(value) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function fmt(value) {
    return (
      value === null ||
      value === undefined ||
      value === ""
    )
      ? "—"
      : String(value);
  }

  function fmtWeight(value) {
    const n =
      num(value);

    return n > 0
      ? n
          .toFixed(2)
          .replace(
            /\.?0+$/,
            ""
          )
      : "—";
  }

  function fmtW(slot) {
    if (
      !slot
    ) {
      return "—";
    }

    const count =
      num(
        slot.c ??
        slot.count ??
        slot.fishCount ??
        0
      );

    const weight =
      num(
        slot.w ??
        slot.weight ??
        slot.total ??
        slot.totalWeight ??
        0
      );

    if (
      !count &&
      !weight
    ) {
      return "—";
    }

    return (
      `${count}/` +
      `${fmtWeight(weight)}`
    );
  }

  function stageNumber(
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

    if (
      match
    ) {
      return Number(
        match[1]
      );
    }

    match =
      raw.match(
        /етап\s*(\d+)/i
      );

    if (
      match
    ) {
      return Number(
        match[1]
      );
    }

    const numbers =
      raw.match(
        /\d+/g
      );

    if (
      !numbers?.length
    ) {
      return null;
    }

    return Number(
      numbers[
        numbers.length - 1
      ]
    );
  }

  // =========================================================
  // FINAL
  // =========================================================

  function isFinalMeta(
    data,
    id = ""
  ) {
    const raw =
      clean(
        `${
          id || ""
        } ${
          data?.stageId || ""
        } ${
          data?.stageName || ""
        } ${
          data?.title || ""
        } ${
          data?.type || ""
        } ${
          data?.stageType || ""
        }`
      );

    return (
      data?.isFinal === true ||
      data?.final === true ||
      clean(
        data?.type
      ) === "final" ||
      clean(
        data?.stageType
      ) === "final" ||
      raw.includes(
        "final"
      ) ||
      raw.includes(
        "фінал"
      )
    );
  }

  // =========================================================
  // SUMMARY
  // =========================================================

  function calculateStageSummary(
    data
  ) {
    const rows =
      Array.isArray(
        data?.standings
      )
        ? data.standings
        : [];

    const summary =
      data?.summary ||
      {};

    const teamsCount =
      num(
        summary.teamsCount ??
        summary.teamCount ??
        summary.participantsCount ??
        rows.length
      );

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

    const totalWeight =
      (
        summary.totalWeight !==
          undefined &&
        summary.totalWeight !==
          null
      )
        ? num(
            summary.totalWeight
          )
        : calculatedWeight;

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

    const maxBigFish =
      (
        summary.maxBigFish !==
          undefined &&
        summary.maxBigFish !==
          null
      )
        ? num(
            summary.maxBigFish
          )
        : calculatedBig;

    const totalCount =
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

    return {
      teamsCount,
      totalWeight,
      maxBigFish,
      totalCount
    };
  }

  // =========================================================
  // ARCHIVE STAGE MATCH
  // =========================================================

  function findArchiveStage(
    stageDocId,
    stageData
  ) {
    const archiveStages =
      Array.isArray(
        archiveDocument?.stages
      )
        ? archiveDocument.stages
        : [];

    const id =
      norm(
        stageDocId
      );

    const stageId =
      norm(
        stageData?.stageId
      );

    let found =
      archiveStages.find(
        stage =>
          norm(
            stage.stageDocId
          ) === id
      );

    if (
      found
    ) {
      return found;
    }

    if (
      stageId
    ) {
      found =
        archiveStages.find(
          stage =>
            norm(
              stage.stageId
            ) === stageId
        );
    }

    return found ||
      null;
  }

  // =========================================================
  // LEGACY FINAL DETECTION
  // =========================================================

  function inferLegacyFinal(
    items
  ) {
    if (
      !Array.isArray(
        items
      ) ||
      items.length < 2
    ) {
      return;
    }

    /*
     * Уже є нормальний Фінал.
     */
    if (
      items.some(
        item =>
          item.isFinal
      )
    ) {
      return;
    }

    const ordered =
      items
        .slice()
        .sort(
          (
            a,
            b
          ) =>
            a.sortValue -
            b.sortValue
        );

    const last =
      ordered[
        ordered.length - 1
      ];

    if (
      !last
    ) {
      return;
    }

    const lastCount =
      num(
        last.summary
          ?.teamsCount
      );

    const previous =
      ordered.slice(
        0,
        -1
      );

    const previousHadMore =
      previous.some(
        item =>
          num(
            item.summary
              ?.teamsCount
          ) >
          FINALISTS_COUNT
      );

    /*
     * Наш випадок 2026:
     *
     * 21
     * 21
     * 20
     * 18 <- Фінал
     */
    if (
      lastCount > 0 &&
      lastCount <=
        FINALISTS_COUNT &&
      previousHadMore
    ) {
      last.isFinal =
        true;

      last.title =
        "Фінал";

      last.type =
        "final";

      last.legacyFinal =
        true;
    }
  }

  // =========================================================
  // STAGE TITLE
  // =========================================================

  function resolveStageTitle(
    item,
    index = 0
  ) {
    if (
      item?.isFinal
    ) {
      return "Фінал";
    }

    const archiveMeta =
      item?.archiveMeta;

    if (
      archiveMeta
    ) {
      if (
        archiveMeta.isFinal ===
          true ||
        clean(
          archiveMeta.type
        ) === "final"
      ) {
        return "Фінал";
      }

      const title =
        norm(
          archiveMeta.title ||
          archiveMeta.stageName
        );

      if (
        title &&
        !title.includes(
          "season-"
        )
      ) {
        return title;
      }
    }

    const data =
      item?.data ||
      {};

    const savedName =
      norm(
        data.stageName ||
        data.title
      );

    if (
      savedName &&
      !savedName.includes(
        "season-"
      )
    ) {
      return savedName;
    }

    const number =
      stageNumber(
        data.stageId ||
        item?.id
      );

    if (
      Number.isFinite(
        number
      )
    ) {
      return (
        `Етап ${number}`
      );
    }

    return (
      savedName ||
      `Етап ${index + 1}`
    );
  }

  // =========================================================
  // SORT VALUE
  // =========================================================

  function stageSortValue(
    item
  ) {
    if (
      item?.isFinal
    ) {
      return 999999;
    }

    const meta =
      item?.archiveMeta;

    if (
      Number.isFinite(
        Number(
          meta?.number
        )
      )
    ) {
      return Number(
        meta.number
      );
    }

    const values = [
      item?.data?.stageId,
      item?.data?.stageName,
      item?.id
    ];

    for (
      const value
      of values
    ) {
      const n =
        stageNumber(
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

  // =========================================================
  // INSERT SUMMARY SECTIONS
  // =========================================================

  function ensureSeasonSummaryDom() {
    if (
      document.getElementById(
        "seasonArchiveSummary"
      )
    ) {
      return;
    }

    const main =
      pageTitle
        ?.parentElement;

    if (
      !main
    ) {
      return;
    }

    const stagesCard =
      stagesList.closest(
        ".archive-card"
      );

    if (
      !stagesCard
    ) {
      return;
    }

    const wrap =
      document.createElement(
        "div"
      );

    wrap.id =
      "seasonArchiveSummary";

    wrap.innerHTML = `
      <section
        id="seasonArchivePodium"
        class="season-summary-section"
        hidden
      >
        <div class="season-summary-title">
          🏆 Підсумок сезону
        </div>

        <div
          id="seasonPodiumGrid"
          class="season-podium-grid"
        ></div>
      </section>

      <section
        id="seasonArchiveBigFish"
        class="season-summary-section"
        hidden
      >
        <div class="season-summary-title">
          🎣 Big Fish сезону
        </div>

        <div
          id="seasonBigFishArchiveCard"
          class="season-bigfish-card"
        ></div>
      </section>

      <section
        id="seasonArchiveRanking"
        class="season-summary-section"
        hidden
      >
        <div class="season-summary-title">
          📊 Підсумковий рейтинг
        </div>

        <div class="season-ranking-scroll">
          <table
            id="seasonArchiveRankingTable"
            class="season-ranking-table"
          >
            <thead></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    `;

    main.insertBefore(
      wrap,
      stagesCard
    );
  }

  // =========================================================
  // PODIUM
  // =========================================================

  function renderSeasonPodium() {
    const section =
      $("seasonArchivePodium");

    const grid =
      $("seasonPodiumGrid");

    if (
      !section ||
      !grid
    ) {
      return;
    }

    const podium =
      Array.isArray(
        archiveDocument?.podium
      )
        ? archiveDocument.podium
        : [];

    if (
      !podium.length
    ) {
      section.hidden =
        true;

      return;
    }

    const medals = {
      1: "🥇",
      2: "🥈",
      3: "🥉"
    };

    grid.innerHTML =
      podium
        .slice(
          0,
          3
        )
        .map(
          row => `
            <div class="
              season-podium-card
              season-podium-card--${num(
                row.place
              )}
            ">

              <div class="season-podium-medal">
                ${
                  medals[
                    num(
                      row.place
                    )
                  ] ||
                  "🏆"
                }
              </div>

              <div class="season-podium-place">
                ${esc(
                  row.place
                )} місце
              </div>

              <div class="season-podium-team">
                ${esc(
                  row.team ||
                  "—"
                )}
              </div>

              <div class="season-podium-meta">
                ${esc(
                  num(
                    row.points
                  )
                )} бал.
                ·
                ${esc(
                  fmtWeight(
                    row.totalWeight
                  )
                )} кг
              </div>

            </div>
          `
        )
        .join("");

    section.hidden =
      false;
  }

  // =========================================================
  // BIG FISH
  // =========================================================

  function renderSeasonBigFish() {
    const section =
      $("seasonArchiveBigFish");

    const box =
      $("seasonBigFishArchiveCard");

    if (
      !section ||
      !box
    ) {
      return;
    }

    const bigFish =
      archiveDocument
        ?.bigFish ||
      null;

    const weight =
      num(
        bigFish?.weight
      );

    const winners =
      Array.isArray(
        bigFish?.winners
      )
        ? bigFish.winners
        : [];

    if (
      weight <= 0 ||
      !winners.length
    ) {
      section.hidden =
        true;

      return;
    }

    box.innerHTML = `
      <div class="season-bigfish-icon">
        🎣
      </div>

      <div class="season-bigfish-info">

        <div class="season-bigfish-team">
          ${winners
            .map(
              row =>
                esc(
                  row.team ||
                  "—"
                )
            )
            .join(
              " / "
            )}
        </div>

        <div class="season-bigfish-stage">
          ${[
            ...new Set(
              winners
                .map(
                  row =>
                    row.stage
                )
                .filter(
                  Boolean
                )
            )
          ]
            .map(
              esc
            )
            .join(
              " / "
            ) ||
            `Сезон ${esc(
              seasonYear
            )}`
          }
        </div>

      </div>

      <div class="season-bigfish-weight">
        ${esc(
          fmtWeight(
            weight
          )
        )} кг
      </div>
    `;

    section.hidden =
      false;
  }

  // =========================================================
  // RANKING
  // =========================================================

  function renderSeasonRanking() {
    const section =
      $("seasonArchiveRanking");

    const table =
      $("seasonArchiveRankingTable");

    if (
      !section ||
      !table
    ) {
      return;
    }

    const ranking =
      Array.isArray(
        archiveDocument?.ranking
      )
        ? archiveDocument.ranking
        : [];

    if (
      !ranking.length
    ) {
      section.hidden =
        true;

      return;
    }

    const archiveStages =
      Array.isArray(
        archiveDocument?.stages
      )
        ? archiveDocument.stages
        : [];

    const regularStages =
      archiveStages.filter(
        stage =>
          !(
            stage.isFinal ===
              true ||
            clean(
              stage.type
            ) === "final"
          )
      );

    const hasFinal =
      archiveStages.some(
        stage =>
          stage.isFinal ===
            true ||
          clean(
            stage.type
          ) === "final"
      ) ||
      archiveDocument
        ?.hasFinal ===
        true;

    table.querySelector(
      "thead"
    ).innerHTML = `
      <tr>
        <th>М</th>
        <th>Команда</th>

        ${
          regularStages
            .map(
              (
                stage,
                index
              ) => `
                <th>
                  Е${
                    num(
                      stage.number
                    ) ||
                    index + 1
                  }
                </th>
              `
            )
            .join("")
        }

        ${
          hasFinal
            ? `<th>Ф</th>`
            : ""
        }

        <th>Б</th>
        <th>кг</th>
        <th>BIG</th>
      </tr>
    `;

    table.querySelector(
      "tbody"
    ).innerHTML =
      ranking
        .map(
          row => {
            const stageResults =
              Array.isArray(
                row.stages
              )
                ? row.stages
                : [];

            return `
              <tr class="${
                num(
                  row.place
                ) <= 3
                  ? `ranking-top-${num(
                      row.place
                    )}`
                  : ""
              }">

                <td class="r-place">
                  ${esc(
                    row.place
                  )}
                </td>

                <td
                  class="r-team"
                  title="${esc(
                    row.team ||
                    ""
                  )}"
                >
                  ${esc(
                    row.team ||
                    "—"
                  )}
                </td>

                ${
                  regularStages
                    .map(
                      (
                        stage,
                        index
                      ) => {
                        const cell =
                          stageResults[
                            index
                          ] ||
                          {};

                        return `
                          <td class="${
                            cell.absent
                              ? "r-absent"
                              : ""
                          }">
                            ${
                              cell.place ===
                                "—" ||
                              cell.place ===
                                null ||
                              cell.place ===
                                undefined
                                ? "—"
                                : esc(
                                    cell.place
                                  )
                            }
                            /
                            ${esc(
                              num(
                                cell.points
                              )
                            )}
                          </td>
                        `;
                      }
                    )
                    .join("")
                }

                ${
                  hasFinal
                    ? `
                      <td class="${
                        row.final
                          ?.absent
                          ? "r-absent"
                          : ""
                      }">
                        ${esc(
                          row.final
                            ?.place ??
                          row.finalPlace ??
                          "—"
                        )}
                      </td>
                    `
                    : ""
                }

                <td class="r-points">
                  ${esc(
                    num(
                      row.seasonPoints
                    )
                  )}
                </td>

                <td>
                  ${esc(
                    fmtWeight(
                      row.totalWeight
                    )
                  )}
                </td>

                <td class="r-big">
                  ${esc(
                    fmtWeight(
                      row.bigFish
                    )
                  )}
                </td>

              </tr>
            `;
          }
        )
        .join("");

    section.hidden =
      false;
  }

  // =========================================================
  // RENDER ARCHIVE SNAPSHOT
  // =========================================================

  function renderArchiveSnapshot() {
    ensureSeasonSummaryDom();

    if (
      !archiveDocument ||
      clean(
        archiveDocument.status
      ) !== "archived"
    ) {
      return;
    }

    renderSeasonPodium();

    renderSeasonBigFish();

    renderSeasonRanking();
  }

  // =========================================================
  // LOAD ARCHIVE DOCUMENT
  // =========================================================

  async function loadSeasonArchiveDocument() {
    try {
      const snap =
        await db
          .collection(
            "seasonArchives"
          )
          .doc(
            seasonYear
          )
          .get();

      if (
        snap.exists
      ) {
        archiveDocument =
          snap.data() ||
          {};

        return;
      }

      archiveDocument =
        null;

    } catch (error) {
      console.warn(
        "[Archive] seasonArchives:",
        error
      );

      archiveDocument =
        null;
    }
  }

  // =========================================================
  // LOAD STAGES
  // =========================================================

  async function loadStages() {
    try {
      if (
        msg
      ) {
        msg.textContent =
          "Завантажую архів…";

        msg.className =
          "muted";
      }

      /*
       * Спочатку snapshot сезону.
       */
      await loadSeasonArchiveDocument();

      /*
       * Потім детальні етапи.
       */
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
          .get();

      stages =
        [];

      snap.forEach(
        doc => {
          const data =
            doc.data() ||
            {};

          const archiveMeta =
            findArchiveStage(
              doc.id,
              data
            );

          const summaryFromStage =
            calculateStageSummary(
              data
            );

          const summary = {
            teamsCount:
              num(
                archiveMeta
                  ?.teamsCount ??
                archiveMeta
                  ?.summary
                  ?.teamsCount ??
                summaryFromStage
                  .teamsCount
              ),

            totalWeight:
              num(
                archiveMeta
                  ?.totalWeight ??
                archiveMeta
                  ?.summary
                  ?.totalWeight ??
                summaryFromStage
                  .totalWeight
              ),

            maxBigFish:
              num(
                archiveMeta
                  ?.bigFish ??
                archiveMeta
                  ?.summary
                  ?.maxBigFish ??
                summaryFromStage
                  .maxBigFish
              ),

            totalCount:
              num(
                archiveMeta
                  ?.totalCount ??
                archiveMeta
                  ?.summary
                  ?.totalCount ??
                summaryFromStage
                  .totalCount
              )
          };

          const item = {
            id:
              doc.id,

            data,

            archiveMeta,

            summary,

            isFinal:
              Boolean(
                archiveMeta
                  ?.isFinal
              ) ||
              clean(
                archiveMeta
                  ?.type
              ) === "final" ||
              isFinalMeta(
                data,
                doc.id
              ),

            type:
              clean(
                archiveMeta
                  ?.type
              ) ||
              (
                isFinalMeta(
                  data,
                  doc.id
                )
                  ? "final"
                  : "qualification"
              )
          };

          item.sortValue =
            stageSortValue(
              item
            );

          stages.push(
            item
          );
        }
      );

      /*
       * Старий 2026:
       * stage-4 -> Фінал.
       */
      inferLegacyFinal(
        stages
      );

      stages.forEach(
        (
          item,
          index
        ) => {
          item.title =
            resolveStageTitle(
              item,
              index
            );

          item.sortValue =
            item.isFinal
              ? 999999
              : stageSortValue(
                  item
                );
        }
      );

      stages.sort(
        (
          a,
          b
        ) =>
          a.sortValue -
          b.sortValue
      );

      renderArchiveSnapshot();

      // =====================================================
      // NO STAGE RESULTS
      // =====================================================

      if (
        !stages.length
      ) {
        if (
          msg
        ) {
          msg.textContent =
            archiveDocument
              ? `Сезон ${seasonYear} заархівовано, але детальні етапи не знайдено.`
              : `Немає архівованих етапів сезону ${seasonYear}.`;

          msg.className =
            archiveDocument
              ? "ok"
              : "muted";
        }

        stagesList.innerHTML =
          "";

        return;
      }

      // =====================================================
      // STATUS
      // =====================================================

      if (
        msg
      ) {
        msg.textContent =
          archiveDocument
            ? `Сезон ${seasonYear} завершено · етапів: ${stages.length}`
            : `Знайдено етапів: ${stages.length}`;

        msg.className =
          "ok";
      }

      // =====================================================
      // STAGE BUTTONS
      // =====================================================

      stagesList.innerHTML =
        stages
          .map(
            item => {
              const summary =
                item.summary ||
                {};

              return `
                <button
                  class="
                    stage-btn
                    ${
                      item.isFinal
                        ? "stage-btn--final"
                        : ""
                    }
                  "
                  type="button"
                  data-stage="${esc(
                    item.id
                  )}"
                >

                  <div class="stage-btn__top">

                    <div class="stage-btn__title">
                      ${
                        item.isFinal
                          ? "🏆 "
                          : ""
                      }
                      ${esc(
                        item.title
                      )}
                    </div>

                    ${
                      item.isFinal
                        ? `
                          <span class="stage-final-badge">
                            ФІНАЛ
                          </span>
                        `
                        : ""
                    }

                  </div>

                  <div class="stage-btn__meta">

                    Команд:
                    <b>
                      ${esc(
                        num(
                          summary.teamsCount
                        )
                      )}
                    </b>

                    · Вага:
                    <b>
                      ${esc(
                        fmtWeight(
                          summary.totalWeight
                        )
                      )}
                    </b>

                    · BIG:
                    <b>
                      ${esc(
                        fmtWeight(
                          summary.maxBigFish
                        )
                      )}
                    </b>

                  </div>

                </button>
              `;
            }
          )
          .join("");

      // =====================================================
      // CLICK
      // =====================================================

      stagesList
        .querySelectorAll(
          "[data-stage]"
        )
        .forEach(
          button => {
            button.addEventListener(
              "click",
              () => {
                const id =
                  button.getAttribute(
                    "data-stage"
                  );

                const item =
                  stages.find(
                    stage =>
                      stage.id ===
                      id
                  );

                if (
                  item
                ) {
                  renderStage(
                    item
                  );
                }
              }
            );
          }
        );

    } catch (
      error
    ) {
      console.error(
        "[Archive] load:",
        error
      );

      if (
        msg
      ) {
        msg.innerHTML =
          `<span class="err">Помилка читання архіву: ${esc(
            error.message ||
            error
          )}</span>`;
      }
    }
  }

  // =========================================================
  // STAGE DETAIL
  // =========================================================

  function renderStage(
    item
  ) {
    const data =
      item?.data ||
      {};

    const rows =
      Array.isArray(
        data.standings
      )
        ? data.standings.slice()
        : [];

    if (
      !rows.length
    ) {
      if (
        resultSection
      ) {
        resultSection.style.display =
          "block";
      }

      if (
        stageTitle
      ) {
        stageTitle.textContent =
          item?.title ||
          "Етап";
      }

      if (
        stageMeta
      ) {
        stageMeta.textContent =
          "Детальні standings відсутні.";
      }

      if (
        zonesWrap
      ) {
        zonesWrap.innerHTML =
          `<div class="archive-card err">У цьому етапі немає standings.</div>`;
      }

      return;
    }

    if (
      resultSection
    ) {
      resultSection.style.display =
        "block";
    }

    if (
      stageTitle
    ) {
      stageTitle.textContent =
        item?.isFinal
          ? "Фінал · Зони A / B / C"
          : "Зони A / B / C";
    }

    if (
      stageMeta
    ) {
      stageMeta.textContent =
        `${item?.title || "Етап"} · Команд: ${rows.length}`;
    }

    const zones = {
      A: [],
      B: [],
      C: []
    };

    rows.forEach(
      row => {
        const zone =
          String(
            row.zone ||
            ""
          )
            .toUpperCase()
            .trim();

        if (
          zones[
            zone
          ]
        ) {
          zones[
            zone
          ].push(
            row
          );
        }
      }
    );

    if (
      zonesWrap
    ) {
      zonesWrap.innerHTML =
        renderZone(
          "A",
          zones.A
        ) +
        renderZone(
          "B",
          zones.B
        ) +
        renderZone(
          "C",
          zones.C
        );
    }

    resultSection
      ?.scrollIntoView({
        behavior:
          "smooth",

        block:
          "start"
      });
  }

  // =========================================================
  // SECTOR
  // =========================================================

  function formatSector(
    zone,
    sectorValue
  ) {
    const raw =
      norm(
        sectorValue
      )
        .toUpperCase();

    if (
      !raw
    ) {
      return zone;
    }

    /*
     * Якщо вже A3 —
     * не робимо AA3.
     */
    if (
      /^[ABC]\d+$/i.test(
        raw
      )
    ) {
      return raw;
    }

    return (
      `${zone}${raw}`
    );
  }

  // =========================================================
  // ZONE TABLE
  // =========================================================

  function renderZone(
    zone,
    rows
  ) {
    const sorted =
      rows
        .slice()
        .sort(
          (
            a,
            b
          ) => {
            if (
              num(
                b.totalWeight
              ) !==
              num(
                a.totalWeight
              )
            ) {
              return (
                num(
                  b.totalWeight
                ) -
                num(
                  a.totalWeight
                )
              );
            }

            if (
              num(
                b.bigFish
              ) !==
              num(
                a.bigFish
              )
            ) {
              return (
                num(
                  b.bigFish
                ) -
                num(
                  a.bigFish
                )
              );
            }

            if (
              num(
                b.totalCount
              ) !==
              num(
                a.totalCount
              )
            ) {
              return (
                num(
                  b.totalCount
                ) -
                num(
                  a.totalCount
                )
              );
            }

            return String(
              a.team ||
              a.teamName ||
              ""
            ).localeCompare(
              String(
                b.team ||
                b.teamName ||
                ""
              ),
              "uk"
            );
          }
        );

    const body =
      sorted
        .map(
          (
            row,
            index
          ) => {
            const sector =
              formatSector(
                zone,
                row.sector
              );

            const zonePlace =
              num(
                row.zonePlace
              ) ||
              index + 1;

            const teamName =
              row.team ||
              row.teamName ||
              "—";

            return `
              <tr>

                <td class="a-sector">
                  ${esc(
                    sector
                  )}
                </td>

                <td
                  class="a-team"
                  title="${esc(
                    teamName
                  )}"
                >
                  ${esc(
                    teamName
                  )}
                </td>

                <td>
                  ${fmtW(
                    row.w1
                  )}
                </td>

                <td>
                  ${fmtW(
                    row.w2
                  )}
                </td>

                <td>
                  ${fmtW(
                    row.w3
                  )}
                </td>

                <td>
                  ${fmtW(
                    row.w4
                  )}
                </td>

                <td>
                  ${fmt(
                    num(
                      row.totalCount
                    ) ||
                    "—"
                  )}
                </td>

                <td>
                  ${fmtWeight(
                    row.bigFish
                  )}
                </td>

                <td class="a-weight">
                  ${fmtWeight(
                    row.totalWeight
                  )}
                </td>

                <td class="a-place">
                  ${esc(
                    zonePlace
                  )}
                </td>

              </tr>
            `;
          }
        )
        .join("");

    return `
      <div class="archive-zone-card">

        <div class="archive-zone-head">

          <h3>
            Зона ${esc(
              zone
            )}
          </h3>

          <span>
            команд: ${
              sorted.length
            }
          </span>

        </div>

        <div class="archive-table-wrap">

          <table class="archive-compact-table">

            <thead>
              <tr>
                <th>З</th>
                <th>Команда</th>
                <th>W1</th>
                <th>W2</th>
                <th>W3</th>
                <th>W4</th>
                <th>Р</th>
                <th>BIG</th>
                <th>кг</th>
                <th>М</th>
              </tr>
            </thead>

            <tbody>
              ${
                body ||
                `
                  <tr>
                    <td colspan="10">
                      Немає команд у зоні ${esc(
                        zone
                      )}
                    </td>
                  </tr>
                `
              }
            </tbody>

          </table>

        </div>

      </div>
    `;
  }

  // =========================================================
  // CSS
  // =========================================================

  function injectArchiveCss() {
    if (
      document.getElementById(
        "archiveCompactCss"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "archiveCompactCss";

    style.textContent = `

      /* =====================================================
         SUMMARY SECTIONS
         ===================================================== */

      .season-summary-section{
        margin:18px 0;
        padding:16px;
        border-radius:20px;
        border:1px solid rgba(148,163,184,.20);
        background:
          radial-gradient(
            circle at top left,
            rgba(250,204,21,.07),
            transparent 42%
          ),
          #0b0d14;
        box-shadow:
          0 18px 42px rgba(0,0,0,.28);
      }

      .season-summary-section[hidden]{
        display:none !important;
      }

      .season-summary-title{
        margin-bottom:14px;
        color:#fbbf24;
        font-size:1.15rem;
        font-weight:950;
      }


      /* =====================================================
         PODIUM
         ===================================================== */

      .season-podium-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:10px;
      }

      .season-podium-card{
        min-width:0;
        padding:16px 10px;
        border-radius:18px;
        text-align:center;
        border:1px solid rgba(148,163,184,.20);
        background:#11111a;
      }

      .season-podium-card--1{
        border-color:rgba(250,204,21,.52);
        background:
          radial-gradient(
            circle at top,
            rgba(250,204,21,.12),
            transparent 55%
          ),
          #11111a;
      }

      .season-podium-card--2{
        border-color:rgba(203,213,225,.36);
      }

      .season-podium-card--3{
        border-color:rgba(249,115,22,.38);
      }

      .season-podium-medal{
        font-size:2rem;
        line-height:1;
      }

      .season-podium-place{
        margin-top:9px;
        color:#94a3b8;
        font-size:.8rem;
        font-weight:900;
      }

      .season-podium-team{
        margin-top:8px;
        color:#f8fafc;
        font-size:.95rem;
        line-height:1.2;
        font-weight:950;
        overflow-wrap:anywhere;
      }

      .season-podium-meta{
        margin-top:8px;
        color:#94a3b8;
        font-size:.75rem;
        line-height:1.35;
        font-weight:700;
      }


      /* =====================================================
         BIG FISH
         ===================================================== */

      .season-bigfish-card{
        display:grid;
        grid-template-columns:auto 1fr auto;
        align-items:center;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid rgba(249,115,22,.42);
        background:
          radial-gradient(
            circle at left top,
            rgba(249,115,22,.11),
            transparent 45%
          ),
          #11111a;
      }

      .season-bigfish-icon{
        font-size:1.8rem;
      }

      .season-bigfish-info{
        min-width:0;
      }

      .season-bigfish-team{
        color:#f8fafc;
        font-size:1rem;
        font-weight:950;
        overflow-wrap:anywhere;
      }

      .season-bigfish-stage{
        margin-top:5px;
        color:#94a3b8;
        font-size:.8rem;
      }

      .season-bigfish-weight{
        color:#fb923c;
        font-size:1.35rem;
        font-weight:950;
        white-space:nowrap;
      }


      /* =====================================================
         SEASON RANKING
         ===================================================== */

      .season-ranking-scroll{
        width:100%;
        overflow-x:auto;
        -webkit-overflow-scrolling:touch;
      }

      .season-ranking-table{
        width:100%;
        min-width:560px;
        border-collapse:collapse;
        table-layout:fixed;
        font-size:9px;
      }

      .season-ranking-table th,
      .season-ranking-table td{
        border:1px solid rgba(148,163,184,.18);
        padding:4px 3px;
        text-align:center;
        white-space:nowrap;
        color:#d1d5db;
      }

      .season-ranking-table th{
        background:#191923;
        color:#f8fafc;
        font-weight:950;
      }

      .season-ranking-table td{
        background:#11111a;
        font-weight:750;
      }

      .season-ranking-table th:nth-child(1),
      .season-ranking-table td:nth-child(1){
        width:30px;
      }

      .season-ranking-table th:nth-child(2),
      .season-ranking-table td:nth-child(2){
        width:110px;
      }

      .season-ranking-table .r-team{
        text-align:left;
        overflow:hidden;
        text-overflow:ellipsis;
        font-weight:900;
      }

      .season-ranking-table .r-place,
      .season-ranking-table .r-points{
        color:#f8fafc;
        font-weight:950;
      }

      .season-ranking-table .r-big{
        color:#fb923c;
        font-weight:900;
      }

      .season-ranking-table .r-absent{
        color:#64748b;
        background:rgba(127,29,29,.12);
      }

      .season-ranking-table .ranking-top-1 td{
        background:rgba(250,204,21,.08);
      }

      .season-ranking-table .ranking-top-2 td{
        background:rgba(203,213,225,.05);
      }

      .season-ranking-table .ranking-top-3 td{
        background:rgba(249,115,22,.06);
      }


      /* =====================================================
         STAGE BUTTONS
         ===================================================== */

      .stage-btn{
        transition:
          transform .18s ease,
          border-color .18s ease,
          background .18s ease;
      }

      .stage-btn:active{
        transform:scale(.99);
      }

      .stage-btn--final{
        border-color:rgba(250,204,21,.55) !important;
        background:
          radial-gradient(
            circle at right top,
            rgba(250,204,21,.10),
            transparent 42%
          ),
          #111827 !important;
      }

      .stage-btn__top{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }

      .stage-btn__title{
        min-width:0;
        color:#e5e7eb;
        font-size:1rem;
        font-weight:950;
      }

      .stage-btn--final .stage-btn__title{
        color:#facc15;
      }

      .stage-final-badge{
        flex:0 0 auto;
        padding:4px 8px;
        border-radius:999px;
        color:#111827;
        background:linear-gradient(
          90deg,
          #facc15,
          #f97316
        );
        font-size:.65rem;
        font-weight:950;
        letter-spacing:.06em;
      }

      .stage-btn__meta{
        margin-top:6px;
        color:#94a3b8;
        font-size:.82rem;
        line-height:1.45;
      }

      .stage-btn__meta b{
        color:#cbd5e1;
      }


      /* =====================================================
         ZONE CARDS
         ===================================================== */

      .archive-zone-card{
        margin:14px 0;
        padding:10px;
        border-radius:18px;
        border:1px solid rgba(148,163,184,.22);
        background:#11111a;
      }

      .archive-zone-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:8px;
      }

      .archive-zone-head h3{
        margin:0;
        font-size:clamp(26px,7vw,42px);
        line-height:1;
        font-weight:950;
        color:#f8fafc;
      }

      .archive-zone-head span{
        flex:0 0 auto;
        padding:6px 10px;
        border-radius:999px;
        border:1px solid rgba(148,163,184,.28);
        color:#d1d5db;
        background:#111827;
        font-size:.78rem;
        font-weight:800;
      }

      .archive-table-wrap{
        width:100%;
        overflow:visible;
      }

      .archive-compact-table{
        width:100%;
        min-width:0 !important;
        table-layout:fixed;
        border-collapse:collapse;
        font-size:9px;
        line-height:1.05;
      }

      .archive-compact-table th,
      .archive-compact-table td{
        border:1px solid rgba(148,163,184,.20);
        padding:2px 1px;
        text-align:center;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        height:18px;
        color:#d1d5db;
      }

      .archive-compact-table th{
        background:#191923;
        color:#e5e7eb;
        font-weight:950;
        font-size:9px;
      }

      .archive-compact-table td{
        background:#11111a;
        font-weight:700;
      }

      .archive-compact-table .a-sector{
        color:#facc15;
        font-weight:950;
      }

      .archive-compact-table .a-team{
        text-align:left;
        font-size:8px;
        font-weight:800;
      }

      .archive-compact-table .a-weight,
      .archive-compact-table .a-place{
        color:#f8fafc;
        font-weight:950;
      }

      .archive-compact-table th:nth-child(1),
      .archive-compact-table td:nth-child(1){
        width:25px;
      }

      .archive-compact-table th:nth-child(2),
      .archive-compact-table td:nth-child(2){
        width:auto;
      }

      .archive-compact-table th:nth-child(3),
      .archive-compact-table td:nth-child(3),
      .archive-compact-table th:nth-child(4),
      .archive-compact-table td:nth-child(4),
      .archive-compact-table th:nth-child(5),
      .archive-compact-table td:nth-child(5),
      .archive-compact-table th:nth-child(6),
      .archive-compact-table td:nth-child(6){
        width:46px;
      }

      .archive-compact-table th:nth-child(7),
      .archive-compact-table td:nth-child(7){
        width:28px;
      }

      .archive-compact-table th:nth-child(8),
      .archive-compact-table td:nth-child(8){
        width:34px;
      }

      .archive-compact-table th:nth-child(9),
      .archive-compact-table td:nth-child(9){
        width:42px;
      }

      .archive-compact-table th:nth-child(10),
      .archive-compact-table td:nth-child(10){
        width:25px;
      }


      /* =====================================================
         MOBILE
         ===================================================== */

      @media(max-width:620px){

        .season-podium-grid{
          grid-template-columns:1fr;
        }

        .season-podium-card{
          display:grid;
          grid-template-columns:42px 1fr;
          grid-template-rows:auto auto auto;
          text-align:left;
          align-items:center;
          column-gap:10px;
          padding:13px;
        }

        .season-podium-medal{
          grid-row:1 / span 3;
          font-size:1.8rem;
          text-align:center;
        }

        .season-podium-place{
          margin-top:0;
        }

        .season-podium-team{
          margin-top:3px;
        }

        .season-podium-meta{
          margin-top:3px;
        }

        .season-bigfish-card{
          grid-template-columns:auto 1fr;
        }

        .season-bigfish-weight{
          grid-column:2;
          margin-top:3px;
        }
      }

      @media(max-width:420px){

        .season-summary-section{
          padding:12px;
          border-radius:17px;
        }

        .archive-zone-card{
          padding:8px;
          border-radius:16px;
        }

        .archive-compact-table{
          font-size:8px;
        }

        .archive-compact-table th,
        .archive-compact-table td{
          height:17px;
          padding:1px;
        }

        .archive-compact-table th{
          font-size:8px;
        }

        .archive-compact-table .a-team{
          font-size:7.4px;
        }

        .archive-compact-table th:nth-child(3),
        .archive-compact-table td:nth-child(3),
        .archive-compact-table th:nth-child(4),
        .archive-compact-table td:nth-child(4),
        .archive-compact-table th:nth-child(5),
        .archive-compact-table td:nth-child(5),
        .archive-compact-table th:nth-child(6),
        .archive-compact-table td:nth-child(6){
          width:42px;
        }

        .archive-compact-table th:nth-child(8),
        .archive-compact-table td:nth-child(8){
          width:32px;
        }

        .archive-compact-table th:nth-child(9),
        .archive-compact-table td:nth-child(9){
          width:40px;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  // =========================================================
  // START
  // =========================================================

  await loadStages();

})();

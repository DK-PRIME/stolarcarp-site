// events/archive.js
// STOLAR CARP • Архів сезону

(async function () {
  "use strict";

  const $ = id => document.getElementById(id);

  const pageTitle = $("pageTitle");
  const msg = $("msg");
  const stagesList = $("stagesList");
  const resultSection = $("resultSection");
  const stageTitle = $("stageTitle");
  const stageMeta = $("stageMeta");
  const zonesWrap = $("zonesWrap");

  if (!stagesList) return;

  injectCss();

  try {
    if (window.scReady) {
      await window.scReady;
    }
  } catch (error) {
    if (msg) {
      msg.textContent =
        "Firebase не ініціалізувався: " + error.message;
      msg.className = "err";
    }
    return;
  }

  const db = window.scDb;

  if (!db) {
    if (msg) {
      msg.textContent = "Firestore не знайдено.";
      msg.className = "err";
    }
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const seasonYear = params.get("year") || "2026";

  const FINALISTS_COUNT = 18;

  if (pageTitle) {
    pageTitle.textContent = `Архів сезону ${seasonYear}`;
  }

  let archiveDocument = null;
  let stages = [];

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]
    ));
  }

  function clean(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function norm(value) {
    return String(value ?? "").trim();
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function hasValue(value) {
    return (
      value !== null &&
      value !== undefined &&
      value !== ""
    );
  }

  function fmt(value) {
    return hasValue(value)
      ? String(value)
      : "—";
  }

  function fmtWeight(value) {
    const n = num(value);

    return n > 0
      ? n.toFixed(2).replace(/\.?0+$/, "")
      : "—";
  }

  function fmtPoints(value) {
    return hasValue(value)
      ? String(value)
      : "—";
  }

  function fmtW(slot) {
    if (!slot) return "—";

    const count = num(
      slot.c ??
      slot.count ??
      slot.fishCount
    );

    const weight = num(
      slot.w ??
      slot.weight ??
      slot.total ??
      slot.totalWeight
    );

    if (!count && !weight) {
      return "—";
    }

    return `${count}/${fmtWeight(weight)}`;
  }

  function stageNumber(value) {
    const raw = String(value || "");

    let match = raw.match(/stage[-_\s]*(\d+)/i);

    if (match) {
      return Number(match[1]);
    }

    match = raw.match(/етап\s*(\d+)/i);

    if (match) {
      return Number(match[1]);
    }

    const numbers = raw.match(/\d+/g);

    return numbers?.length
      ? Number(numbers[numbers.length - 1])
      : null;
  }

  function isSeasonArchived() {
    return (
      archiveDocument &&
      clean(archiveDocument.status) === "archived"
    );
  }

  function isFinalMeta(data, id = "") {
    const raw = clean(
      `${id} ` +
      `${data?.stageId || ""} ` +
      `${data?.stageName || ""} ` +
      `${data?.title || ""} ` +
      `${data?.type || ""} ` +
      `${data?.stageType || ""}`
    );

    return (
      data?.isFinal === true ||
      data?.final === true ||
      clean(data?.type) === "final" ||
      clean(data?.stageType) === "final" ||
      raw.includes("final") ||
      raw.includes("фінал")
    );
  }

  function unwrapArchivedStage(raw) {
    if (!raw || typeof raw !== "object") {
      return {};
    }

    const candidates = [
      raw.stageData,
      raw.data,
      raw.sourceData,
      raw.snapshot,
      raw.stage,
      raw.original,
      raw.originalData
    ];

    for (const candidate of candidates) {
      if (
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        Array.isArray(candidate.standings)
      ) {
        return candidate;
      }
    }

    if (Array.isArray(raw.standings)) {
      return raw;
    }

    for (const candidate of candidates) {
      if (
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
      ) {
        return candidate;
      }
    }

    return raw;
  }

  function archivedOriginalId(docId, raw, data) {
    const direct = norm(
      raw?.sourceStageDocId ||
      raw?.stageDocId ||
      raw?.originalStageDocId ||
      data?.stageDocId
    );

    if (direct) {
      return direct;
    }

    const prefix = `${seasonYear}__stage__`;

    if (docId.startsWith(prefix)) {
      return docId.slice(prefix.length);
    }

    return docId;
  }

  function calculateStageSummary(data) {
    const rows = Array.isArray(data?.standings)
      ? data.standings
      : [];

    const summary = data?.summary || {};

    const totalWeight = rows.reduce(
      (sum, row) => sum + num(row?.totalWeight),
      0
    );

    const maxBigFish = rows.reduce(
      (max, row) =>
        Math.max(max, num(row?.bigFish)),
      0
    );

    const totalCount = rows.reduce(
      (sum, row) => sum + num(row?.totalCount),
      0
    );

    return {
      teamsCount: num(
        summary.teamsCount ??
        summary.teamCount ??
        summary.participantsCount ??
        rows.length
      ),

      totalWeight:
        summary.totalWeight != null
          ? num(summary.totalWeight)
          : totalWeight,

      maxBigFish:
        summary.maxBigFish != null
          ? num(summary.maxBigFish)
          : maxBigFish,

      totalCount:
        summary.totalCount != null
          ? num(summary.totalCount)
          : totalCount
    };
  }

  function findArchiveStage(stageDocId, stageData) {
    const archiveStages = Array.isArray(
      archiveDocument?.stages
    )
      ? archiveDocument.stages
      : [];

    const id = norm(stageDocId);
    const stageId = norm(stageData?.stageId);

    return (
      archiveStages.find(
        stage =>
          norm(stage?.stageDocId) === id
      ) ||
      archiveStages.find(
        stage =>
          stageId &&
          norm(stage?.stageId) === stageId
      ) ||
      null
    );
  }

  function createStageItem(id, data, rawArchive = null) {
    const archiveMeta =
      findArchiveStage(id, data) ||
      (
        rawArchive &&
        typeof rawArchive === "object"
          ? rawArchive
          : null
      );

    const calculated = calculateStageSummary(data);

    const summary = {
      teamsCount: num(
        archiveMeta?.teamsCount ??
        archiveMeta?.summary?.teamsCount ??
        calculated.teamsCount
      ),

      totalWeight: num(
        archiveMeta?.totalWeight ??
        archiveMeta?.summary?.totalWeight ??
        calculated.totalWeight
      ),

      maxBigFish: num(
        archiveMeta?.bigFish ??
        archiveMeta?.maxBigFish ??
        archiveMeta?.summary?.maxBigFish ??
        calculated.maxBigFish
      ),

      totalCount: num(
        archiveMeta?.totalCount ??
        archiveMeta?.summary?.totalCount ??
        calculated.totalCount
      )
    };

    const final =
      archiveMeta?.isFinal === true ||
      clean(archiveMeta?.type) === "final" ||
      isFinalMeta(data, id);

    const item = {
      id,
      data,
      archiveMeta,
      summary,
      isFinal: final,
      type: final ? "final" : "qualification",
      sortValue: 9999
    };

    item.sortValue = stageSortValue(item);

    return item;
  }

  function stageSortValue(item) {
    if (item?.isFinal) {
      return 999999;
    }

    const metaNumber = Number(
      item?.archiveMeta?.number
    );

    if (
      Number.isFinite(metaNumber) &&
      metaNumber > 0
    ) {
      return metaNumber;
    }

    const values = [
      item?.data?.stageId,
      item?.data?.stageName,
      item?.archiveMeta?.stageId,
      item?.archiveMeta?.stageDocId,
      item?.id
    ];

    for (const value of values) {
      const n = stageNumber(value);

      if (Number.isFinite(n)) {
        return n;
      }
    }

    return 9999;
  }

  function inferFinal(items) {
    if (
      items.length < 2 ||
      items.some(item => item.isFinal)
    ) {
      return;
    }

    const ordered = items
      .slice()
      .sort(
        (a, b) =>
          a.sortValue - b.sortValue
      );

    const last = ordered[ordered.length - 1];
    const previous = ordered.slice(0, -1);

    if (
      num(last?.summary?.teamsCount) > 0 &&
      num(last?.summary?.teamsCount) <= FINALISTS_COUNT &&
      previous.some(
        item =>
          num(item?.summary?.teamsCount) >
          FINALISTS_COUNT
      )
    ) {
      last.isFinal = true;
      last.type = "final";
    }
  }

  function resolveStageTitle(item, index) {
    if (item?.isFinal) {
      return "Фінал";
    }

    const title = norm(
      item?.archiveMeta?.title ||
      item?.archiveMeta?.stageName ||
      item?.data?.stageName ||
      item?.data?.title
    );

    if (
      title &&
      !clean(title).includes("season-")
    ) {
      return title;
    }

    const number = stageNumber(
      item?.data?.stageId ||
      item?.archiveMeta?.stageId ||
      item?.id
    );

    return Number.isFinite(number)
      ? `Етап ${number}`
      : `Етап ${index + 1}`;
  }

  function prepareStages() {
    inferFinal(stages);

    stages.forEach((item, index) => {
      item.title = resolveStageTitle(
        item,
        index
      );

      item.sortValue = item.isFinal
        ? 999999
        : stageSortValue(item);
    });

    stages.sort(
      (a, b) =>
        a.sortValue - b.sortValue
    );
  }

  function regularArchiveStages() {
    const archiveStages = Array.isArray(
      archiveDocument?.stages
    )
      ? archiveDocument.stages.slice()
      : [];

    return archiveStages
      .filter(
        stage =>
          !(
            stage?.isFinal === true ||
            clean(stage?.type) === "final" ||
            clean(stage?.stageType) === "final"
          )
      )
      .sort((a, b) => {
        const an =
          num(a?.number) ||
          stageNumber(a?.stageId) ||
          stageNumber(a?.stageDocId) ||
          9999;

        const bn =
          num(b?.number) ||
          stageNumber(b?.stageId) ||
          stageNumber(b?.stageDocId) ||
          9999;

        return an - bn;
      });
  }

  function archiveHasFinal() {
    const archiveStages = Array.isArray(
      archiveDocument?.stages
    )
      ? archiveDocument.stages
      : [];

    return (
      archiveDocument?.hasFinal === true ||
      archiveStages.some(
        stage =>
          stage?.isFinal === true ||
          clean(stage?.type) === "final" ||
          clean(stage?.stageType) === "final"
      )
    );
  }

  async function loadArchive() {
    const snap = await db
      .collection("seasonArchives")
      .doc(seasonYear)
      .get();

    archiveDocument = snap.exists
      ? snap.data() || {}
      : null;
  }

  async function loadArchivedStages() {
    const prefix = `${seasonYear}__stage__`;

    const fieldPath =
      window.firebase
        ?.firestore
        ?.FieldPath
        ?.documentId?.();

    if (!fieldPath) {
      return [];
    }

    const snap = await db
      .collection("seasonArchives")
      .orderBy(fieldPath)
      .startAt(prefix)
      .endAt(prefix + "\uf8ff")
      .get();

    const result = [];

    snap.forEach(doc => {
      const raw = doc.data() || {};
      const data = unwrapArchivedStage(raw);

      const originalId = archivedOriginalId(
        doc.id,
        raw,
        data
      );

      result.push(
        createStageItem(
          originalId,
          data,
          raw
        )
      );
    });

    return result;
  }

  async function loadLiveStages() {
    const snap = await db
      .collection("seasonResults")
      .doc(seasonYear)
      .collection("stages")
      .get();

    const result = [];

    snap.forEach(doc => {
      result.push(
        createStageItem(
          doc.id,
          doc.data() || {}
        )
      );
    });

    return result;
  }

  function ensureSummaryDom() {
    if ($("seasonArchiveSummary")) {
      return;
    }

    const main = pageTitle?.parentElement;
    const stagesCard = stagesList.closest(
      ".archive-card"
    );

    if (!main || !stagesCard) {
      return;
    }

    const wrap = document.createElement("div");

    wrap.id = "seasonArchiveSummary";

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

        <div
          id="seasonRankingLegend"
          class="season-ranking-legend"
        ></div>

        <div class="season-ranking-wrap">
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

  function renderSeasonPodium() {
    const section = $("seasonArchivePodium");
    const grid = $("seasonPodiumGrid");

    if (!section || !grid) {
      return;
    }

    const podium = Array.isArray(
      archiveDocument?.podium
    )
      ? archiveDocument.podium
      : [];

    if (!podium.length) {
      section.hidden = true;
      return;
    }

    const medals = {
      1: "🥇",
      2: "🥈",
      3: "🥉"
    };

    grid.innerHTML = podium
      .slice()
      .sort(
        (a, b) =>
          num(a?.place) - num(b?.place)
      )
      .slice(0, 3)
      .map(row => `
        <div class="season-podium-card podium-${num(row.place)}">

          <div class="season-podium-medal">
            ${medals[num(row.place)] || "🏆"}
          </div>

          <div class="season-podium-place">
            ${esc(row.place)} місце
          </div>

          <div class="season-podium-team">
            ${esc(row.team || "—")}
          </div>

          <div class="season-podium-meta">
            ${esc(fmtPoints(
              row.points ??
              row.seasonPoints
            ))} бал.
            ·
            ${esc(fmtWeight(
              row.totalWeight
            ))} кг
          </div>

        </div>
      `)
      .join("");

    section.hidden = false;
  }

  function renderSeasonBigFish() {
    const section = $("seasonArchiveBigFish");
    const box = $("seasonBigFishArchiveCard");

    if (!section || !box) {
      return;
    }

    const bigFish =
      archiveDocument?.bigFish || {};

    const weight = num(bigFish.weight);

    const winners = Array.isArray(
      bigFish.winners
    )
      ? bigFish.winners
      : [];

    if (!weight || !winners.length) {
      section.hidden = true;
      return;
    }

    const teams = [
      ...new Set(
        winners
          .map(row =>
            norm(
              row?.team ||
              row?.teamName
            )
          )
          .filter(Boolean)
      )
    ];

    const stageNames = [
      ...new Set(
        winners
          .map(row =>
            norm(row?.stage)
          )
          .filter(Boolean)
      )
    ];

    box.innerHTML = `
      <div class="season-bigfish-icon">
        🎣
      </div>

      <div class="season-bigfish-info">

        <div class="season-bigfish-team">
          ${teams.map(esc).join(" / ")}
        </div>

        <div class="season-bigfish-stage">
          ${
            stageNames.length
              ? stageNames
                  .map(esc)
                  .join(" / ")
              : `Сезон ${esc(seasonYear)}`
          }
        </div>

      </div>

      <div class="season-bigfish-weight">
        ${esc(fmtWeight(weight))} кг
      </div>
    `;

    section.hidden = false;
  }

  function getArchivedRanking() {
    const ranking = Array.isArray(
      archiveDocument?.ranking
    )
      ? archiveDocument.ranking.slice()
      : [];

    return ranking.sort((a, b) => {
      const aPlace =
        num(a?.place) || 999999;

      const bPlace =
        num(b?.place) || 999999;

      if (aPlace !== bPlace) {
        return aPlace - bPlace;
      }

      return String(
        a?.team || ""
      ).localeCompare(
        String(b?.team || ""),
        "uk"
      );
    });
  }

  function getStageCell(row, stage, index) {
    const results = Array.isArray(
      row?.stages
    )
      ? row.stages
      : [];

    const stageDocId =
      norm(stage?.stageDocId);

    const stageId =
      norm(stage?.stageId);

    const exact = results.find(result =>
      (
        stageDocId &&
        norm(result?.stageDocId) ===
        stageDocId
      ) ||
      (
        stageId &&
        norm(result?.stageId) ===
        stageId
      )
    );

    return (
      exact ||
      results[index] ||
      {}
    );
  }

  function formatRankingCell(cell) {
    const place = hasValue(cell?.place)
      ? cell.place
      : "—";

    const points = hasValue(cell?.points)
      ? cell.points
      : "—";

    return `${esc(place)}/${esc(points)}`;
  }

  function renderSeasonRanking() {
    const section = $("seasonArchiveRanking");
    const table = $("seasonArchiveRankingTable");
    const legend = $("seasonRankingLegend");

    if (!section || !table) {
      return;
    }

    const ranking = getArchivedRanking();

    if (!ranking.length) {
      section.hidden = true;
      return;
    }

    const regularStages =
      regularArchiveStages();

    const hasFinal =
      archiveHasFinal();

    const finalists = ranking.filter(
      row => {
        const place = num(row?.place);

        return (
          place > 0 &&
          place <= FINALISTS_COUNT
        );
      }
    );

    const contenders = ranking.filter(
      row => {
        const place = num(row?.place);

        return (
          place <= 0 ||
          place > FINALISTS_COUNT
        );
      }
    );

    const orderedRanking = [
      ...finalists,
      ...contenders
    ];

    if (legend) {
      legend.innerHTML = `
        <span>
          Фіналістів:
          <b>${finalists.length}</b>
        </span>

        ${
          contenders.length
            ? `
              <span>
                Претендентів:
                <b>${contenders.length}</b>
              </span>
            `
            : ""
        }
      `;
    }

    table
      .querySelector("thead")
      .innerHTML = `
        <tr>
          <th class="col-place">М</th>
          <th class="col-team">Команда</th>

          ${regularStages
            .map((stage, index) => `
              <th class="col-stage">
                Е${
                  num(stage?.number) ||
                  stageNumber(stage?.stageId) ||
                  stageNumber(stage?.stageDocId) ||
                  index + 1
                }
              </th>
            `)
            .join("")}

          ${
            hasFinal
              ? `<th class="col-final">Ф</th>`
              : ""
          }

          <th class="col-points">Б</th>
          <th class="col-weight">кг</th>
          <th class="col-big">BIG</th>
        </tr>
      `;

    let body = "";

    orderedRanking.forEach((row, index) => {
      const place = num(row?.place);

      const isFinalist =
        place > 0 &&
        place <= FINALISTS_COUNT;

      if (
        contenders.length &&
        index === finalists.length
      ) {
        body += `
          <tr class="ranking-divider">
            <td colspan="${
              2 +
              regularStages.length +
              (hasFinal ? 1 : 0) +
              3
            }">
              ПРЕТЕНДЕНТИ
            </td>
          </tr>
        `;
      }

      body += `
        <tr class="
          ${
            place >= 1 &&
            place <= 3
              ? `ranking-top-${place}`
              : ""
          }
          ${
            isFinalist
              ? "ranking-finalist"
              : "ranking-contender"
          }
        ">

          <td class="r-place">
            ${esc(
              hasValue(row?.place)
                ? row.place
                : "—"
            )}
          </td>

          <td
            class="r-team"
            title="${esc(row?.team || "")}"
          >
            ${esc(row?.team || "—")}
          </td>

          ${regularStages
            .map((stage, stageIndex) => {
              const cell = getStageCell(
                row,
                stage,
                stageIndex
              );

              return `
                <td class="
                  r-stage
                  ${
                    cell?.absent
                      ? "r-absent"
                      : ""
                  }
                ">
                  ${formatRankingCell(cell)}
                </td>
              `;
            })
            .join("")}

          ${
            hasFinal
              ? `
                <td class="
                  r-final
                  ${
                    row?.final?.absent
                      ? "r-absent"
                      : ""
                  }
                ">
                  ${esc(
                    row?.final?.place ??
                    row?.finalPlace ??
                    "—"
                  )}
                </td>
              `
              : ""
          }

          <td class="r-points">
            ${esc(
              fmtPoints(
                row?.seasonPoints ??
                row?.points
              )
            )}
          </td>

          <td class="r-weight">
            ${esc(
              fmtWeight(
                row?.totalWeight
              )
            )}
          </td>

          <td class="r-big">
            ${esc(
              fmtWeight(
                row?.bigFish
              )
            )}
          </td>

        </tr>
      `;
    });

    table
      .querySelector("tbody")
      .innerHTML = body;

    section.hidden = false;
  }

  function renderArchiveSnapshot() {
    if (!isSeasonArchived()) {
      return;
    }

    ensureSummaryDom();

    renderSeasonPodium();
    renderSeasonBigFish();
    renderSeasonRanking();
  }

  function renderStageButtons() {
    stagesList.innerHTML = stages
      .map(item => {
        const summary = item.summary || {};

        return `
          <button
            class="stage-btn ${
              item.isFinal
                ? "stage-btn--final"
                : ""
            }"
            type="button"
            data-stage="${esc(item.id)}"
          >

            <div class="stage-btn__top">

              <div class="stage-btn__title">
                ${
                  item.isFinal
                    ? "🏆 "
                    : ""
                }
                ${esc(item.title)}
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
                  num(summary.teamsCount)
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
      })
      .join("");

    stagesList
      .querySelectorAll("[data-stage]")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            const item = stages.find(
              stage =>
                stage.id ===
                button.dataset.stage
            );

            if (item) {
              renderStage(item);
            }
          }
        );
      });
  }

  async function loadStages() {
    try {
      if (msg) {
        msg.textContent =
          "Завантажую архів…";

        msg.className = "muted";
      }

      await loadArchive();

      if (isSeasonArchived()) {
        stages = await loadArchivedStages();
      } else {
        stages = await loadLiveStages();
      }

      prepareStages();

      if (isSeasonArchived()) {
        renderArchiveSnapshot();
      }

      if (!stages.length) {
        stagesList.innerHTML = "";

        if (msg) {
          msg.textContent =
            isSeasonArchived()
              ? `Сезон ${seasonYear} завершено.`
              : `Немає етапів сезону ${seasonYear}.`;

          msg.className =
            isSeasonArchived()
              ? "ok"
              : "muted";
        }

        return;
      }

      if (msg) {
        msg.textContent =
          isSeasonArchived()
            ? `Сезон ${seasonYear} завершено · етапів: ${stages.length}`
            : `Знайдено етапів: ${stages.length}`;

        msg.className = "ok";
      }

      renderStageButtons();

    } catch (error) {
      console.error(
        "[Archive] load:",
        error
      );

      if (msg) {
        msg.textContent =
          "Не вдалося завантажити архів.";

        msg.className = "err";
      }
    }
  }

  function compareStandingRows(a, b) {
    const weight =
      num(b?.totalWeight) -
      num(a?.totalWeight);

    if (weight) {
      return weight;
    }

    const big =
      num(b?.bigFish) -
      num(a?.bigFish);

    if (big) {
      return big;
    }

    const count =
      num(b?.totalCount) -
      num(a?.totalCount);

    if (count) {
      return count;
    }

    return String(
      a?.team ||
      a?.teamName ||
      ""
    ).localeCompare(
      String(
        b?.team ||
        b?.teamName ||
        ""
      ),
      "uk"
    );
  }

  function renderStage(item) {
    const rows = Array.isArray(
      item?.data?.standings
    )
      ? item.data.standings.slice()
      : [];

    if (resultSection) {
      resultSection.style.display = "block";
    }

    if (stageTitle) {
      stageTitle.textContent =
        item?.isFinal
          ? "Фінал · Зони A / B / C"
          : "Зони A / B / C";
    }

    if (stageMeta) {
      stageMeta.textContent =
        `${item?.title || "Етап"} · Команд: ${rows.length}`;
    }

    if (!rows.length) {
      if (zonesWrap) {
        zonesWrap.innerHTML =
          `<div class="archive-card err">Детальні результати етапу відсутні.</div>`;
      }

      return;
    }

    const zones = {
      A: [],
      B: [],
      C: []
    };

    rows.forEach(row => {
      const zone = norm(
        row?.zone
      ).toUpperCase();

      if (zones[zone]) {
        zones[zone].push(row);
      }
    });

    if (zonesWrap) {
      zonesWrap.innerHTML =
        renderZone("A", zones.A) +
        renderZone("B", zones.B) +
        renderZone("C", zones.C);
    }

    resultSection?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function formatSector(zone, sectorValue) {
    const raw = norm(
      sectorValue
    ).toUpperCase();

    if (!raw) {
      return zone;
    }

    return /^[ABC]\d+$/i.test(raw)
      ? raw
      : `${zone}${raw}`;
  }

  function renderZone(zone, rows) {
    const sorted = rows
      .slice()
      .sort(compareStandingRows);

    const body = sorted
      .map((row, index) => {
        const team =
          row?.team ||
          row?.teamName ||
          "—";

        return `
          <tr>

            <td class="a-sector">
              ${esc(
                formatSector(
                  zone,
                  row?.sector
                )
              )}
            </td>

            <td
              class="a-team"
              title="${esc(team)}"
            >
              ${esc(team)}
            </td>

            <td>${fmtW(row?.w1)}</td>
            <td>${fmtW(row?.w2)}</td>
            <td>${fmtW(row?.w3)}</td>
            <td>${fmtW(row?.w4)}</td>

            <td>
              ${fmt(
                num(row?.totalCount) ||
                "—"
              )}
            </td>

            <td>
              ${fmtWeight(
                row?.bigFish
              )}
            </td>

            <td class="a-weight">
              ${fmtWeight(
                row?.totalWeight
              )}
            </td>

            <td class="a-place">
              ${esc(
                num(row?.zonePlace) ||
                index + 1
              )}
            </td>

          </tr>
        `;
      })
      .join("");

    return `
      <div class="archive-zone-card">

        <div class="archive-zone-head">
          <h3>
            Зона ${esc(zone)}
          </h3>

          <span>
            команд: ${sorted.length}
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
                      Немає команд
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

  function injectCss() {
    if ($("archiveCompactCss")) {
      return;
    }

    const style =
      document.createElement("style");

    style.id = "archiveCompactCss";

    style.textContent = `
      .season-summary-section{
        margin:18px 0;
        padding:14px;
        border:1px solid rgba(148,163,184,.20);
        border-radius:20px;
        background:#0b0d14;
        box-shadow:0 18px 42px rgba(0,0,0,.28);
      }

      .season-summary-section[hidden]{
        display:none!important;
      }

      .season-summary-title{
        margin-bottom:12px;
        color:#fbbf24;
        font-size:1.15rem;
        font-weight:950;
      }

      .season-podium-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:8px;
      }

      .season-podium-card{
        min-width:0;
        padding:13px 8px;
        border:1px solid rgba(148,163,184,.20);
        border-radius:16px;
        background:#11111a;
        text-align:center;
      }

      .season-podium-card.podium-1{
        border-color:rgba(250,204,21,.52);
        background:rgba(250,204,21,.07);
      }

      .season-podium-card.podium-2{
        border-color:rgba(203,213,225,.36);
      }

      .season-podium-card.podium-3{
        border-color:rgba(249,115,22,.38);
      }

      .season-podium-medal{
        font-size:1.8rem;
      }

      .season-podium-place{
        margin-top:6px;
        color:#94a3b8;
        font-size:.75rem;
        font-weight:900;
      }

      .season-podium-team{
        margin-top:5px;
        color:#f8fafc;
        font-size:.9rem;
        line-height:1.2;
        font-weight:950;
        overflow-wrap:anywhere;
      }

      .season-podium-meta{
        margin-top:5px;
        color:#94a3b8;
        font-size:.7rem;
        font-weight:700;
      }

      .season-bigfish-card{
        display:grid;
        grid-template-columns:auto 1fr auto;
        align-items:center;
        gap:10px;
        padding:14px;
        border:1px solid rgba(249,115,22,.42);
        border-radius:17px;
        background:#11111a;
      }

      .season-bigfish-icon{
        font-size:1.7rem;
      }

      .season-bigfish-info{
        min-width:0;
      }

      .season-bigfish-team{
        color:#f8fafc;
        font-weight:950;
        overflow-wrap:anywhere;
      }

      .season-bigfish-stage{
        margin-top:4px;
        color:#94a3b8;
        font-size:.75rem;
      }

      .season-bigfish-weight{
        color:#fb923c;
        font-size:1.2rem;
        font-weight:950;
        white-space:nowrap;
      }

      .season-ranking-legend{
        display:flex;
        flex-wrap:wrap;
        gap:6px 12px;
        margin:-3px 0 10px;
        color:#94a3b8;
        font-size:11px;
        font-weight:700;
      }

      .season-ranking-legend b{
        color:#f8fafc;
      }

      .season-ranking-wrap{
        width:100%;
        overflow:hidden;
      }

      .season-ranking-table{
        width:100%;
        border-collapse:collapse;
        table-layout:fixed;
        font-size:8px;
        line-height:1.05;
      }

      .season-ranking-table th,
      .season-ranking-table td{
        height:27px;
        padding:2px 1px;
        border:1px solid rgba(148,163,184,.18);
        text-align:center;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        color:#d1d5db;
      }

      .season-ranking-table th{
        background:#191923;
        color:#f8fafc;
        font-size:8px;
        font-weight:950;
      }

      .season-ranking-table td{
        background:#11111a;
        font-weight:750;
      }

      .season-ranking-table .col-place{
        width:6%;
      }

      .season-ranking-table .col-team{
        width:30%;
      }

      .season-ranking-table .col-stage{
        width:8%;
      }

      .season-ranking-table .col-final{
        width:6%;
      }

      .season-ranking-table .col-points{
        width:7%;
      }

      .season-ranking-table .col-weight{
        width:10%;
      }

      .season-ranking-table .col-big{
        width:9%;
      }

      .season-ranking-table .r-team{
        text-align:left;
        padding-left:4px;
        font-size:8px;
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
        background:rgba(250,204,21,.09);
      }

      .season-ranking-table .ranking-top-2 td{
        background:rgba(203,213,225,.055);
      }

      .season-ranking-table .ranking-top-3 td{
        background:rgba(249,115,22,.065);
      }

      .season-ranking-table .ranking-contender td{
        color:#94a3b8;
      }

      .season-ranking-table .ranking-contender .r-team{
        color:#cbd5e1;
      }

      .season-ranking-table .ranking-divider td{
        height:24px;
        padding:4px;
        color:#fbbf24;
        background:#17130b;
        font-size:8px;
        font-weight:950;
        letter-spacing:.08em;
        text-align:left;
      }

      .stage-btn{
        transition:transform .18s ease;
      }

      .stage-btn:active{
        transform:scale(.99);
      }

      .stage-btn--final{
        border-color:rgba(250,204,21,.55)!important;
        background:#111827!important;
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
        background:linear-gradient(90deg,#facc15,#f97316);
        font-size:.65rem;
        font-weight:950;
      }

      .stage-btn__meta{
        margin-top:6px;
        color:#94a3b8;
        font-size:.82rem;
        line-height:1.4;
      }

      .stage-btn__meta b{
        color:#cbd5e1;
      }

      .archive-zone-card{
        margin:14px 0;
        padding:8px;
        border:1px solid rgba(148,163,184,.22);
        border-radius:17px;
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
        color:#f8fafc;
        font-size:clamp(25px,7vw,40px);
        line-height:1;
        font-weight:950;
      }

      .archive-zone-head span{
        padding:5px 9px;
        border:1px solid rgba(148,163,184,.28);
        border-radius:999px;
        color:#d1d5db;
        background:#111827;
        font-size:.72rem;
        font-weight:800;
      }

      .archive-table-wrap{
        width:100%;
        overflow:hidden;
      }

      .archive-compact-table{
        width:100%;
        min-width:0;
        table-layout:fixed;
        border-collapse:collapse;
        font-size:7.5px;
        line-height:1;
      }

      .archive-compact-table th,
      .archive-compact-table td{
        height:18px;
        padding:1px;
        border:1px solid rgba(148,163,184,.20);
        text-align:center;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        color:#d1d5db;
      }

      .archive-compact-table th{
        background:#191923;
        color:#e5e7eb;
        font-size:7.5px;
        font-weight:950;
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
        font-size:7px;
        font-weight:800;
      }

      .archive-compact-table .a-weight,
      .archive-compact-table .a-place{
        color:#f8fafc;
        font-weight:950;
      }

      .archive-compact-table th:nth-child(1),
      .archive-compact-table td:nth-child(1){
        width:7%;
      }

      .archive-compact-table th:nth-child(2),
      .archive-compact-table td:nth-child(2){
        width:25%;
      }

      .archive-compact-table th:nth-child(3),
      .archive-compact-table td:nth-child(3),
      .archive-compact-table th:nth-child(4),
      .archive-compact-table td:nth-child(4),
      .archive-compact-table th:nth-child(5),
      .archive-compact-table td:nth-child(5),
      .archive-compact-table th:nth-child(6),
      .archive-compact-table td:nth-child(6){
        width:9%;
      }

      .archive-compact-table th:nth-child(7),
      .archive-compact-table td:nth-child(7){
        width:6%;
      }

      .archive-compact-table th:nth-child(8),
      .archive-compact-table td:nth-child(8){
        width:8%;
      }

      .archive-compact-table th:nth-child(9),
      .archive-compact-table td:nth-child(9){
        width:10%;
      }

      .archive-compact-table th:nth-child(10),
      .archive-compact-table td:nth-child(10){
        width:6%;
      }

      @media(max-width:620px){
        .season-summary-section{
          margin:14px 0;
          padding:10px;
          border-radius:17px;
        }

        .season-summary-title{
          margin-bottom:10px;
          font-size:1.05rem;
        }

        .season-podium-grid{
          grid-template-columns:1fr;
        }

        .season-podium-card{
          display:grid;
          grid-template-columns:38px 1fr;
          text-align:left;
          align-items:center;
          column-gap:8px;
          padding:10px;
        }

        .season-podium-medal{
          grid-row:1 / span 3;
          text-align:center;
          font-size:1.6rem;
        }

        .season-podium-place,
        .season-podium-team,
        .season-podium-meta{
          margin-top:2px;
        }

        .season-ranking-table{
          font-size:7px;
        }

        .season-ranking-table th{
          font-size:7px;
        }

        .season-ranking-table th,
        .season-ranking-table td{
          height:25px;
          padding:1px;
        }

        .season-ranking-table .r-team{
          padding-left:3px;
          font-size:7px;
        }
      }

      @media(max-width:390px){
        .season-ranking-table{
          font-size:6.5px;
        }

        .season-ranking-table th{
          font-size:6.5px;
        }

        .season-ranking-table .r-team{
          font-size:6.5px;
        }

        .archive-compact-table{
          font-size:6.8px;
        }

        .archive-compact-table th{
          font-size:6.8px;
        }

        .archive-compact-table .a-team{
          font-size:6.4px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  await loadStages();

})();

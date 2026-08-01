// assets/js/live_firebase.js
// STOLAR CARP • Live public
//
// За замовчуванням: CLASSIC
// Якщо competitions/{compId}.format === "3tables":
//   - чинний Live залишається;
//   - нижче додаються 3 таблиці + підсумок.
//
// Потрібне підключення:
// live-3tables.js ПЕРЕД live_firebase.js

(function () {
  "use strict";

  const db = window.scDb;

  const stageEl         = document.getElementById("liveStageName");
  const zonesWrap       = document.getElementById("zonesContainer");
  const weighTableEl    = document.getElementById("totalTable");
  const weighInfoEl     = document.getElementById("weighInfo");
  const updatedEl       = document.getElementById("liveUpdatedAt");
  const finalBigFishBox = document.getElementById("finalBigFishBox");

  const loadingEl = document.getElementById("liveLoading");
  const contentEl = document.getElementById("liveContent");
  const errorEl   = document.getElementById("liveError");

  const wBtn1 = document.getElementById("wBtn1");
  const wBtn2 = document.getElementById("wBtn2");
  const wBtn3 = document.getElementById("wBtn3");
  const wBtn4 = document.getElementById("wBtn4");

  const FORMAT_CLASSIC = "classic";
  const FORMAT_3TABLES = "3tables";

  let activeFormat = FORMAT_CLASSIC;

  let threeTablesSection = null;
  let threeTablesContainer = null;

  const fmt = (value) => {
    return value === null ||
      value === undefined ||
      value === ""
      ? "—"
      : String(value);
  };

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );
  }

  function fmtTs(ts) {
    try {
      const date = ts?.toDate
        ? ts.toDate()
        : ts instanceof Date
          ? ts
          : null;

      if (!date) return "—";

      return date.toLocaleString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit"
      });
    } catch {
      return "—";
    }
  }

  function fmtNum(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return null;
    }

    return number
      .toFixed(3)
      .replace(/\.?0+$/, "");
  }

  function kgShort(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return number
      .toFixed(3)
      .replace(/\.?0+$/, "");
  }

  function normalizeFormat(value) {
    const raw = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "-");

    if (
      raw === "3tables" ||
      raw === "3-tables" ||
      raw === "threetables" ||
      raw === "three-tables" ||
      raw === "three_table" ||
      raw === "3table"
    ) {
      return FORMAT_3TABLES;
    }

    return FORMAT_CLASSIC;
  }

  function isThreeTablesFormat() {
    return activeFormat === FORMAT_3TABLES;
  }

  function getFishKg(fish) {
    if (
      typeof fish === "number" ||
      typeof fish === "string"
    ) {
      return Number(fish);
    }

    return Number(
      fish?.kg ??
      fish?.weight ??
      fish?.value ??
      0
    );
  }

  function isAmurFish(fish) {
    if (!fish || typeof fish !== "object") {
      return false;
    }

    return (
      fish.isAmur === true ||
      fish.fishType === "amur" ||
      fish.type === "amur"
    );
  }

  function normalizeFishArray(arr) {
    if (!Array.isArray(arr)) return [];

    return arr
      .map(fish => {
        const kg = getFishKg(fish);

        if (
          !Number.isFinite(kg) ||
          kg <= 0
        ) {
          return null;
        }

        const isAmur = isAmurFish(fish);

        return {
          kg,
          fishType: isAmur
            ? "amur"
            : "carp",
          isAmur
        };
      })
      .filter(Boolean);
  }

  function fishCellHTML(fish) {
    const normalized =
      normalizeFishArray([fish])[0];

    if (!normalized) return "—";

    const value = fmtNum(normalized.kg);

    if (!value) return "—";

    if (normalized.isAmur) {
      return `
        <span class="live-fish-amur">
          ${esc(value)}
        </span>
      `;
    }

    return `<span>${esc(value)}</span>`;
  }

  function showError(text) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = text;
    }

    if (loadingEl) {
      loadingEl.style.display = "none";
    }

    if (contentEl) {
      contentEl.style.display = "grid";
    }
  }

  function showContent() {
    if (errorEl) {
      errorEl.style.display = "none";
    }

    if (loadingEl) {
      loadingEl.style.display = "none";
    }

    if (contentEl) {
      contentEl.style.display = "grid";
    }
  }

  function debounce(fn, ms = 80) {
    let timer = null;

    return (...args) => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(
        () => fn(...args),
        ms
      );
    };
  }

  function wCell(hasDoc, weightsArr) {
    if (!hasDoc) return "-";

    const arr =
      normalizeFishArray(weightsArr);

    const count = arr.length;

    const sum = arr.reduce(
      (total, fish) =>
        total + Number(fish.kg || 0),
      0
    );

    if (count === 0) {
      return "0 / 0";
    }

    return `${count} / ${kgShort(sum)}`;
  }

  /* ============================================================
     THREE TABLES — UI
     ============================================================ */

  function injectThreeTablesStyles() {
    const styleId =
      "sc-live-three-tables-styles";

    if (document.getElementById(styleId)) {
      return;
    }

    const style =
      document.createElement("style");

    style.id = styleId;

    style.textContent = `
      .three-tables-section {
        display: none;
        width: 100%;
        min-width: 0;
        margin-top: 18px;
      }

      .three-tables-section.is-visible {
        display: block;
      }

      .three-tables-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 14px;
      }

      .three-tables-heading h2 {
        margin: 0;
        font-size: 1.15rem;
      }

      .three-zone-result {
        margin-bottom: 18px;
      }

      .three-zone-result:last-child {
        margin-bottom: 0;
      }

      .three-zone-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }

      .three-zone-header h3 {
        margin: 0;
      }

      .three-result-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }

      .three-result-card {
        min-width: 0;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 12px;
        background: rgba(255,255,255,.025);
      }

      .three-result-card h4 {
        margin: 0 0 9px;
        font-size: .88rem;
        text-transform: uppercase;
        letter-spacing: .05em;
      }

      .three-table-scroll {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .three-table {
        width: 100%;
        min-width: 410px;
        border-collapse: collapse;
      }

      .three-table--final {
        min-width: 780px;
      }

      .three-table th,
      .three-table td {
        padding: 8px 7px;
        border-bottom: 1px solid rgba(255,255,255,.07);
        text-align: center;
        white-space: nowrap;
        font-size: .78rem;
      }

      .three-table th {
        color: var(--muted, #aaa);
        font-size: .7rem;
        text-transform: uppercase;
      }

      .three-table td.three-team {
        max-width: 190px;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        font-weight: 700;
      }

      .three-table td.three-final-place {
        font-size: 1rem;
        font-weight: 900;
        color: var(--accent, #f6c34c);
      }

      .three-top5-fish {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 4px;
        min-width: 170px;
      }

      .three-fish-pill {
        display: inline-flex;
        padding: 3px 6px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 999px;
        background: rgba(255,255,255,.04);
        font-size: .7rem;
      }

      .three-empty {
        padding: 12px;
        color: var(--muted, #aaa);
        text-align: center;
      }

      @media (max-width: 900px) {
        .three-result-grid {
          grid-template-columns: 1fr;
        }

        .three-result-card {
          padding: 10px;
        }
      }

      @media (max-width: 520px) {
        .three-tables-heading {
          align-items: flex-start;
          flex-direction: column;
        }

        .three-table th,
        .three-table td {
          padding: 7px 6px;
          font-size: .72rem;
        }

        .three-table th {
          font-size: .64rem;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureThreeTablesUI() {
    injectThreeTablesStyles();

    threeTablesSection =
      document.getElementById(
        "threeTablesSection"
      );

    threeTablesContainer =
      document.getElementById(
        "threeTablesContainer"
      );

    if (
      threeTablesSection &&
      threeTablesContainer
    ) {
      return;
    }

    threeTablesSection =
      document.createElement("section");

    threeTablesSection.id =
      "threeTablesSection";

    threeTablesSection.className =
      "three-tables-section card";

    threeTablesSection.innerHTML = `
      <div class="three-tables-heading">
        <h2>Три таблиці</h2>
        <span class="badge badge--warn">
          Одиночне змагання
        </span>
      </div>

      <div id="threeTablesContainer">
        <div class="three-empty">
          Очікую дані…
        </div>
      </div>
    `;

    threeTablesContainer =
      threeTablesSection.querySelector(
        "#threeTablesContainer"
      );

    /*
     * Ставимо блок після зон.
     * Якщо zonesContainer має батьківський блок —
     * вставляємо після нього.
     */
    const anchor =
      zonesWrap?.parentElement ||
      zonesWrap ||
      contentEl;

    if (anchor?.parentElement) {
      anchor.parentElement.insertBefore(
        threeTablesSection,
        anchor.nextSibling
      );
    } else if (contentEl) {
      contentEl.appendChild(
        threeTablesSection
      );
    } else {
      document.body.appendChild(
        threeTablesSection
      );
    }
  }

  function applyFormatVisibility() {
    ensureThreeTablesUI();

    if (isThreeTablesFormat()) {
      threeTablesSection?.classList.add(
        "is-visible"
      );

      /*
       * У форматі 3tables окремий фінальний
       * Короп/Амур не потрібен, бо є власний Big Fish.
       */
      if (finalBigFishBox) {
        finalBigFishBox.style.display =
          "none";
      }
    } else {
      threeTablesSection?.classList.remove(
        "is-visible"
      );

      if (threeTablesContainer) {
        threeTablesContainer.innerHTML = "";
      }

      if (finalBigFishBox) {
        finalBigFishBox.style.display = "";
      }
    }
  }

  function renderTop5Pills(fishArr) {
    const fish = Array.isArray(fishArr)
      ? fishArr
      : [];

    if (!fish.length) {
      return `<span>—</span>`;
    }

    return `
      <div class="three-top5-fish">
        ${fish.map((kg, index) => `
          <span class="three-fish-pill">
            ${index + 1}: ${esc(kgShort(kg))}
          </span>
        `).join("")}
      </div>
    `;
  }

  function renderThreeCriterionTable(
    title,
    rows,
    type
  ) {
    const list = Array.isArray(rows)
      ? rows
      : [];

    if (!list.length) {
      return `
        <div class="three-result-card">
          <h4>${esc(title)}</h4>
          <div class="three-empty">
            Немає команд
          </div>
        </div>
      `;
    }

    let head = "";
    let body = "";

    if (type === "total") {
      head = `
        <tr>
          <th>Місце</th>
          <th>Сектор</th>
          <th>Команда</th>
          <th>Риб</th>
          <th>Вага</th>
          <th>Бал</th>
        </tr>
      `;

      body = list.map(row => `
        <tr>
          <td>${esc(row.totalPlace)}</td>
          <td>${esc(row.zoneLabel)}</td>
          <td class="three-team">
            ${esc(row.teamName)}
          </td>
          <td>${esc(row.fishCount)}</td>
          <td>${esc(kgShort(row.totalWeight))}</td>
          <td>${esc(row.totalPoints)}</td>
        </tr>
      `).join("");
    }

    if (type === "top5") {
      head = `
        <tr>
          <th>Місце</th>
          <th>Сектор</th>
          <th>Команда</th>
          <th>5 риб</th>
          <th>К-сть</th>
          <th>Вага</th>
          <th>Бал</th>
        </tr>
      `;

      body = list.map(row => `
        <tr>
          <td>${esc(row.top5Place)}</td>
          <td>${esc(row.zoneLabel)}</td>
          <td class="three-team">
            ${esc(row.teamName)}
          </td>
          <td>
            ${renderTop5Pills(row.top5Fish)}
          </td>
          <td>${esc(row.top5Count)}</td>
          <td>${esc(kgShort(row.top5Weight))}</td>
          <td>${esc(row.top5Points)}</td>
        </tr>
      `).join("");
    }

    if (type === "bigfish") {
      head = `
        <tr>
          <th>Місце</th>
          <th>Сектор</th>
          <th>Команда</th>
          <th>Big Fish</th>
          <th>Бал</th>
        </tr>
      `;

      body = list.map(row => `
        <tr>
          <td>${esc(row.bigFishPlace)}</td>
          <td>${esc(row.zoneLabel)}</td>
          <td class="three-team">
            ${esc(row.teamName)}
          </td>
          <td>${esc(kgShort(row.bigFish))}</td>
          <td>${esc(row.bigFishPoints)}</td>
        </tr>
      `).join("");
    }

    return `
      <div class="three-result-card">
        <h4>${esc(title)}</h4>

        <div class="three-table-scroll">
          <table class="three-table">
            <thead>${head}</thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderThreeFinalTable(rows) {
    const list = Array.isArray(rows)
      ? rows
      : [];

    if (!list.length) {
      return `
        <div class="three-result-card">
          <h4>Підсумок</h4>
          <div class="three-empty">
            Немає команд
          </div>
        </div>
      `;
    }

    return `
      <div class="three-result-card">
        <h4>Підсумкова таблиця</h4>

        <div class="three-table-scroll">
          <table class="three-table three-table--final">
            <thead>
              <tr>
                <th>Місце</th>
                <th>Сектор</th>
                <th>Команда</th>

                <th>Загальна вага</th>
                <th>Бал</th>

                <th>5 великих</th>
                <th>Вага 5</th>
                <th>Бал</th>

                <th>Big Fish</th>
                <th>Бал</th>

                <th>Сума балів</th>
              </tr>
            </thead>

            <tbody>
              ${list.map(row => `
                <tr>
                  <td class="three-final-place">
                    ${esc(row.finalPlace)}
                  </td>

                  <td>${esc(row.zoneLabel)}</td>

                  <td class="three-team">
                    ${esc(row.teamName)}
                  </td>

                  <td>
                    ${esc(kgShort(row.totalWeight))}
                  </td>

                  <td>
                    ${esc(row.totalPoints)}
                  </td>

                  <td>
                    ${renderTop5Pills(row.top5Fish)}
                  </td>

                  <td>
                    ${esc(kgShort(row.top5Weight))}
                  </td>

                  <td>
                    ${esc(row.top5Points)}
                  </td>

                  <td>
                    ${esc(kgShort(row.bigFish))}
                  </td>

                  <td>
                    ${esc(row.bigFishPoints)}
                  </td>

                  <td>
                    <strong>
                      ${esc(row.pointsSum)}
                    </strong>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderThreeTables() {
    applyFormatVisibility();

    if (!isThreeTablesFormat()) {
      return;
    }

    ensureThreeTablesUI();

    if (
      !window.SCThreeTables ||
      typeof window.SCThreeTables.build !==
        "function"
    ) {
      threeTablesContainer.innerHTML = `
        <div class="three-empty">
          Не завантажено
          assets/js/live-3tables.js
        </div>
      `;

      console.error(
        "SCThreeTables.build не знайдено. " +
        "Підключи live-3tables.js перед live_firebase.js."
      );

      return;
    }

    try {
      /*
       * Спочатку рахуємо весь результат.
       * Лише після завершення будуємо HTML.
       */
      const result =
        window.SCThreeTables.build(
          regRows,
          allWeighDocs
        );

      const zoneNames = ["A", "B", "C"];

      const html = zoneNames
        .map(zoneName => {
          const zone =
            result?.zones?.[zoneName];

          if (
            !zone ||
            !zone.teamsCount
          ) {
            return `
              <section class="three-zone-result">
                <div class="three-zone-header">
                  <h3>Зона ${zoneName}</h3>
                  <span class="badge">
                    немає команд
                  </span>
                </div>
              </section>
            `;
          }

          return `
            <section class="three-zone-result">
              <div class="three-zone-header">
                <h3>Зона ${zoneName}</h3>

                <span class="badge badge--warn">
                  команд: ${esc(zone.teamsCount)}
                </span>
              </div>

              <div class="three-result-grid">
                ${renderThreeCriterionTable(
                  "Загальна вага",
                  zone.totalTable,
                  "total"
                )}

                ${renderThreeCriterionTable(
                  "5 великих",
                  zone.top5Table,
                  "top5"
                )}

                ${renderThreeCriterionTable(
                  "Big Fish",
                  zone.bigFishTable,
                  "bigfish"
                )}
              </div>

              ${renderThreeFinalTable(
                zone.finalTable
              )}
            </section>
          `;
        })
        .join("");

      threeTablesContainer.innerHTML =
        html || `
          <div class="three-empty">
            Очікую команди та зважування…
          </div>
        `;
    } catch (error) {
      console.error(
        "renderThreeTables error:",
        error
      );

      threeTablesContainer.innerHTML = `
        <div class="three-empty">
          Помилка розрахунку трьох таблиць.
        </div>
      `;
    }
  }

  const renderThreeTablesDebounced =
    debounce(renderThreeTables, 70);

  /* ============================================================
     CLASSIC ZONES
     ============================================================ */

  function buildZonesAuto(
    regRowsArg,
    weighDocs
  ) {
    const zones = {
      A: [],
      B: [],
      C: []
    };

    const byTeam = new Map();

    (weighDocs || []).forEach(doc => {
      const teamId =
        doc.teamId || "";

      if (!teamId) return;

      const weighNo =
        Number(doc.weighNo);

      if (
        weighNo < 1 ||
        weighNo > 4
      ) {
        return;
      }

      if (!byTeam.has(teamId)) {
        byTeam.set(teamId, {
          has: {
            1: false,
            2: false,
            3: false,
            4: false
          },

          w: {
            1: [],
            2: [],
            3: [],
            4: []
          }
        });
      }

      const team =
        byTeam.get(teamId);

      team.has[weighNo] = true;

      team.w[weighNo] =
        normalizeFishArray(
          doc.weights || []
        );
    });

    (regRowsArg || []).forEach(row => {
      const zoneLetter =
        String(row.zoneLabel || "")[0]
          ?.toUpperCase();

      if (
        !["A", "B", "C"].includes(
          zoneLetter
        )
      ) {
        return;
      }

      const team =
        byTeam.get(row.teamId) || {
          has: {
            1: false,
            2: false,
            3: false,
            4: false
          },

          w: {
            1: [],
            2: [],
            3: [],
            4: []
          }
        };

      let totalCount = 0;
      let totalWeight = 0;
      let bigFish = 0;

      [1, 2, 3, 4].forEach(number => {
        if (!team.has[number]) return;

        const arr =
          team.w[number] || [];

        totalCount += arr.length;

        const sum = arr.reduce(
          (total, fish) =>
            total +
            Number(fish.kg || 0),
          0
        );

        totalWeight += sum;

        arr.forEach(fish => {
          bigFish = Math.max(
            bigFish,
            Number(fish.kg || 0)
          );
        });
      });

      zones[zoneLetter].push({
        zoneLabel: row.zoneLabel,
        team: row.teamName,

        w1: wCell(
          team.has[1],
          team.w[1]
        ),

        w2: wCell(
          team.has[2],
          team.w[2]
        ),

        w3: wCell(
          team.has[3],
          team.w[3]
        ),

        w4: wCell(
          team.has[4],
          team.w[4]
        ),

        total: totalCount,

        big: bigFish
          ? kgShort(bigFish)
          : "—",

        weight: totalWeight
          ? kgShort(totalWeight)
          : "—",

        _tw: totalWeight,
        _bf: bigFish,
        _tc: totalCount
      });
    });

    ["A", "B", "C"].forEach(zone => {
      zones[zone].sort((a, b) => {
        if (b._tw !== a._tw) {
          return b._tw - a._tw;
        }

        if (b._bf !== a._bf) {
          return b._bf - a._bf;
        }

        return b._tc - a._tc;
      });

      zones[zone].forEach(
        (row, index) => {
          row.place = index + 1;
        }
      );
    });

    return zones;
  }

  function fmtW(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }

    const count =
      value.count ??
      value.c ??
      value.qty ??
      "";

    const kg =
      value.weight ??
      value.kg ??
      value.w ??
      "";

    if (
      count === "" &&
      kg === ""
    ) {
      return "—";
    }

    return `${fmt(count)} / ${fmt(kg)}`;
  }

  function normZoneItem(item) {
    const zoneRaw =
      item.zone ??
      item.drawZone ??
      "";

    const sector =
      item.drawSector ??
      item.sector ??
      null;

    const drawKey =
      item.drawKey || "";

    let zoneLabel =
      item.zoneLabel || "";

    if (!zoneLabel) {
      if (drawKey) {
        zoneLabel =
          String(drawKey);
      } else if (
        zoneRaw &&
        sector
      ) {
        zoneLabel =
          `${zoneRaw}${sector}`;
      } else {
        zoneLabel =
          zoneRaw || "—";
      }
    }

    return {
      zoneLabel,

      team:
        item.team ??
        item.teamName ??
        "—",

      w1:
        item.w1 ??
        item.W1 ??
        null,

      w2:
        item.w2 ??
        item.W2 ??
        null,

      w3:
        item.w3 ??
        item.W3 ??
        null,

      w4:
        item.w4 ??
        item.W4 ??
        null,

      total:
        item.total ??
        item.sum ??
        null,

      big:
        item.big ??
        item.BIG ??
        item.bigFish ??
        "—",

      weight:
        item.weight ??
        item.totalWeight ??
        item.total?.weight ??
        "—",

      place:
        item.place ??
        item.p ??
        "—"
    };
  }

  function renderZones(
    zonesData,
    teamsRaw
  ) {
    if (!zonesWrap) return;

    const zoneNames = [
      "A",
      "B",
      "C"
    ];

    let useZones =
      zonesData || {};

    const hasZoneData =
      (
        useZones.A &&
        useZones.A.length
      ) ||
      (
        useZones.B &&
        useZones.B.length
      ) ||
      (
        useZones.C &&
        useZones.C.length
      );

    if (
      !hasZoneData &&
      Array.isArray(teamsRaw) &&
      teamsRaw.length
    ) {
      const fallback = {
        A: [],
        B: [],
        C: []
      };

      teamsRaw.forEach(team => {
        const drawKey =
          String(team.drawKey || "")
            .toUpperCase();

        const zone = String(
          team.drawZone ||
          team.zone ||
          (
            drawKey
              ? drawKey[0]
              : ""
          ) ||
          ""
        ).toUpperCase();

        const sector =
          team.drawSector ||
          team.sector ||
          (
            drawKey
              ? parseInt(
                  drawKey.slice(1),
                  10
                )
              : null
          );

        if (
          !["A", "B", "C"].includes(
            zone
          )
        ) {
          return;
        }

        fallback[zone].push({
          teamName:
            team.teamName ||
            team.team ||
            "—",

          zone,
          drawZone: zone,
          drawSector: sector,
          drawKey,

          place: "—",
          w1: null,
          w2: null,
          w3: null,
          w4: null,
          total: null,
          big: "—",
          weight: "—"
        });
      });

      useZones = fallback;
    }

    zonesWrap.innerHTML =
      zoneNames.map(zone => {
        const rawList =
          useZones?.[zone] || [];

        const list =
          rawList.map(normZoneItem);

        if (!list.length) {
          return `
            <div class="live-zone card">
              <div class="live-zone-title">
                <h3 style="margin:0;">
                  Зона ${zone}
                </h3>

                <span class="badge">
                  немає даних
                </span>
              </div>

              <p class="form__hint">...</p>
            </div>
          `;
        }

        const rowsHtml =
          list.map(row => `
            <tr>
              <td>${esc(fmt(row.zoneLabel))}</td>

              <td class="team-col">
                ${esc(fmt(row.team))}
              </td>

              <td>${esc(fmtW(row.w1))}</td>
              <td>${esc(fmtW(row.w2))}</td>
              <td>${esc(fmtW(row.w3))}</td>
              <td>${esc(fmtW(row.w4))}</td>
              <td>${esc(fmtW(row.total))}</td>
              <td>${esc(fmt(row.big))}</td>
              <td>${esc(fmt(row.weight))}</td>
              <td>${esc(fmt(row.place))}</td>
            </tr>
          `).join("");

        return `
          <div class="live-zone card">
            <div class="live-zone-title">
              <h3 style="margin:0;">
                Зона ${zone}
              </h3>

              <span class="badge badge--warn">
                команд: ${list.length}
              </span>
            </div>

            <div
              class="table-wrap"
              style="
                overflow-x:auto;
                max-width:100%;
                -webkit-overflow-scrolling:touch;
              "
            >
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Зона</th>
                    <th>Команда</th>
                    <th>W1</th>
                    <th>W2</th>
                    <th>W3</th>
                    <th>W4</th>
                    <th>Разом</th>
                    <th>BIG</th>
                    <th>Вага</th>
                    <th>Місце</th>
                  </tr>
                </thead>

                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join("");
  }

  /* ============================================================
     STATE
     ============================================================ */

  let activeCompId = "";
  let activeStageId = "";
  let activeDocId = "";

  let currentWeighNo = 1;
  let currentWeighKey = "W1";

  let regRows = [];
  let weighByTeam = new Map();

  let allWeighDocs = [];
  let needAutoZones = false;

  let currentStageTeamsRaw = [];
  let currentStageZonesData = {
    A: [],
    B: [],
    C: []
  };

  let unsubWeigh = null;
  let unsubAllWeigh = null;
  let unsubStage = null;
  let unsubCompetition = null;

  function stopWeighSubs() {
    if (unsubWeigh) {
      unsubWeigh();
      unsubWeigh = null;
    }

    if (unsubAllWeigh) {
      unsubAllWeigh();
      unsubAllWeigh = null;
    }
  }

  function stopStageSub() {
    if (unsubStage) {
      unsubStage();
      unsubStage = null;
    }
  }

  function stopCompetitionSub() {
    if (unsubCompetition) {
      unsubCompetition();
      unsubCompetition = null;
    }
  }

  function parseZoneKey(
    drawKey,
    drawZone,
    drawSector
  ) {
    const zone = String(
      drawZone ||
      (
        drawKey
          ? String(drawKey)[0]
          : ""
      ) ||
      ""
    ).toUpperCase();

    const sector = Number(
      drawSector ||
      (
        drawKey
          ? parseInt(
              String(drawKey).slice(1),
              10
            )
          : 0
      ) ||
      0
    );

    const label = drawKey
      ? String(drawKey).toUpperCase()
      : zone && sector
        ? `${zone}${sector}`
        : zone || "—";

    const zoneOrder =
      zone === "A"
        ? 1
        : zone === "B"
          ? 2
          : zone === "C"
            ? 3
            : 9;

    const sortKey =
      zoneOrder * 100 +
      (
        Number.isFinite(sector)
          ? sector
          : 99
      );

    return {
      label,
      sortKey,
      zone,
      sector
    };
  }

  function buildRegRowsFromStageTeams(
    teamsRaw
  ) {
    const rows = [];

    (teamsRaw || []).forEach(team => {
      const teamId =
        String(team.teamId || "")
          .trim();

      if (!teamId) return;

      const hasDraw = Boolean(
        team.drawKey ||
        team.drawZone ||
        team.drawSector ||
        team.zone ||
        team.sector
      );

      if (!hasDraw) return;

      const parsed =
        parseZoneKey(
          team.drawKey,
          team.drawZone || team.zone,
          team.drawSector || team.sector
        );

      rows.push({
        zoneLabel: parsed.label,
        sortKey: parsed.sortKey,
        zone: parsed.zone,
        sector: parsed.sector,
        drawKey: parsed.label,

        teamId,

        teamName:
          team.teamName ||
          team.team ||
          "—"
      });
    });

    rows.sort(
      (a, b) =>
        a.sortKey - b.sortKey
    );

    return rows;
  }

  /* ============================================================
     FINAL BIG FISH CLASSIC
     ============================================================ */

  function renderFinalBigFishTables() {
    if (!finalBigFishBox) return;

    if (isThreeTablesFormat()) {
      finalBigFishBox.style.display =
        "none";

      return;
    }

    finalBigFishBox.style.display = "";

    const teamIds = new Set(
      regRows.map(row => row.teamId)
    );

    if (!teamIds.size) {
      finalBigFishBox.innerHTML = `
        <div class="muted">
          Очікую список команд…
        </div>
      `;

      return;
    }

    const w4Done = new Set();
    const bigCarp = [];
    const bigAmur = [];

    (allWeighDocs || []).forEach(doc => {
      const teamId =
        String(doc.teamId || "");

      if (!teamIds.has(teamId)) {
        return;
      }

      if (Number(doc.weighNo) === 4) {
        w4Done.add(teamId);
      }

      const team =
        regRows.find(
          row => row.teamId === teamId
        );

      const fish =
        normalizeFishArray(
          doc.weights || []
        );

      fish.forEach(item => {
        const row = {
          teamName:
            team?.teamName ||
            doc.teamName ||
            "—",

          zoneLabel:
            team?.zoneLabel ||
            doc.zone ||
            "—",

          kg:
            Number(item.kg || 0)
        };

        if (
          item.fishType === "amur" ||
          item.isAmur === true
        ) {
          bigAmur.push(row);
        } else {
          bigCarp.push(row);
        }
      });
    });

    if (
      w4Done.size <
      teamIds.size
    ) {
      finalBigFishBox.innerHTML = `
        <div class="muted">
          Big Fish Короп / Амур зʼявиться
          після завершення W4.
          Готово W4:
          ${w4Done.size}/${teamIds.size}
        </div>
      `;

      return;
    }

    const carpWinner =
      bigCarp.sort(
        (a, b) => b.kg - a.kg
      )[0];

    const amurWinner =
      bigAmur.sort(
        (a, b) => b.kg - a.kg
      )[0];

    finalBigFishBox.innerHTML = `
      <div class="final-bigfish-line">
        <strong>Big Fish Короп</strong>

        <span>
          ${
            carpWinner
              ? `${esc(fmt(carpWinner.zoneLabel))} · ` +
                `${esc(fmt(carpWinner.teamName))} · ` +
                `${esc(kgShort(carpWinner.kg))} кг`
              : "немає даних"
          }
        </span>
      </div>

      <div
        class="
          final-bigfish-line
          final-bigfish-line--amur
        "
      >
        <strong>Big Fish Амур</strong>

        <span>
          ${
            amurWinner
              ? `${esc(fmt(amurWinner.zoneLabel))} · ` +
                `${esc(fmt(amurWinner.teamName))} · ` +
                `${esc(kgShort(amurWinner.kg))} кг`
              : "немає даних"
          }
        </span>
      </div>
    `;
  }

  /* ============================================================
     W1-W4
     ============================================================ */

  function setWeighButtons(activeKey) {
    const map = {
      W1: wBtn1,
      W2: wBtn2,
      W3: wBtn3,
      W4: wBtn4
    };

    Object.entries(map).forEach(
      ([key, button]) => {
        if (!button) return;

        button.classList.toggle(
          "btn--accent",
          key === activeKey
        );

        button.classList.toggle(
          "btn--ghost",
          key !== activeKey
        );
      }
    );
  }

  function setActiveWeigh(number) {
    const parsed = Number(number);

    currentWeighNo =
      parsed >= 1 && parsed <= 4
        ? parsed
        : 1;

    currentWeighKey =
      `W${currentWeighNo}`;

    setWeighButtons(
      currentWeighKey
    );

    startWeighingsFor(
      currentWeighNo
    );
  }

  function renderWeighTable() {
    if (!weighTableEl) return;

    if (!regRows.length) {
      weighTableEl.innerHTML = `
        <thead>
          <tr>
            <th>Зона</th>
            <th>Команда</th>
            <th>🐟1</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td colspan="3">
              Очікую список команд…
            </td>
          </tr>
        </tbody>
      `;

      return;
    }

    const rows = regRows.map(row => {
      const weights =
        weighByTeam.get(row.teamId) ||
        [];

      const fish =
        normalizeFishArray(weights);

      return {
        zoneLabel: row.zoneLabel,
        teamName: row.teamName,
        fish
      };
    });

    const maxFish = Math.max(
      1,
      ...rows.map(row => row.fish.length)
    );

    const fishHeaders =
      Array.from(
        { length: maxFish },
        (_, index) =>
          `<th class="fish-th">🐟${index + 1}</th>`
      ).join("");

    const bodyHtml =
      rows.map(row => {
        const cells = [];

        for (
          let index = 0;
          index < maxFish;
          index++
        ) {
          const fish =
            row.fish[index];

          cells.push(`
            <td class="fish-td">
              ${
                fish
                  ? fishCellHTML(fish)
                  : "—"
              }
            </td>
          `);
        }

        return `
          <tr>
            <td>
              ${esc(fmt(row.zoneLabel))}
            </td>

            <td class="team-col">
              ${esc(fmt(row.teamName))}
            </td>

            ${cells.join("")}
          </tr>
        `;
      }).join("");

    weighTableEl.innerHTML = `
      <thead>
        <tr>
          <th>Зона</th>
          <th>Команда</th>
          ${fishHeaders}
        </tr>
      </thead>

      <tbody>
        ${bodyHtml}
      </tbody>
    `;
  }

  const renderZonesDebounced =
    debounce(renderZones, 70);

  const renderWeighDebounced =
    debounce(renderWeighTable, 40);

  function startWeighingsFor(
    weighNo
  ) {
    if (!db) return;

    if (
      !activeCompId ||
      !activeStageId
    ) {
      return;
    }

    if (unsubWeigh) {
      unsubWeigh();
      unsubWeigh = null;
    }

    weighByTeam = new Map();

    unsubWeigh = db
      .collection("weighings")
      .where(
        "compId",
        "==",
        activeCompId
      )
      .where(
        "stageId",
        "==",
        activeStageId
      )
      .where(
        "weighNo",
        "==",
        Number(weighNo)
      )
      .where(
        "status",
        "==",
        "submitted"
      )
      .onSnapshot(
        snapshot => {
          const map = new Map();

          snapshot.forEach(docSnap => {
            const data =
              docSnap.data() || {};

            const teamId =
              data.teamId || "";

            const weights =
              normalizeFishArray(
                data.weights || []
              );

            if (teamId) {
              map.set(
                teamId,
                weights
              );
            }
          });

          weighByTeam = map;

          renderWeighDebounced();
        },
        error => {
          console.error(
            "weighings snapshot error:",
            error
          );
        }
      );

    if (weighInfoEl) {
      weighInfoEl.textContent =
        `${currentWeighKey} — ` +
        `список риб по секторах`;
    }
  }

  /* ============================================================
     ALL WEIGHINGS
     ============================================================ */

  function startAllWeighingsSubIfNeeded() {
    if (!db) return;

    if (
      !activeCompId ||
      !activeStageId
    ) {
      return;
    }

    if (unsubAllWeigh) {
      unsubAllWeigh();
      unsubAllWeigh = null;
    }

    unsubAllWeigh = db
      .collection("weighings")
      .where(
        "compId",
        "==",
        activeCompId
      )
      .where(
        "stageId",
        "==",
        activeStageId
      )
      .where(
        "status",
        "==",
        "submitted"
      )
      .onSnapshot(
        snapshot => {
          const docs = [];

          snapshot.forEach(docSnap => {
            docs.push({
              _id: docSnap.id,
              ...(docSnap.data() || {})
            });
          });

          allWeighDocs = docs;

          renderFinalBigFishTables();

          if (
            needAutoZones &&
            regRows.length
          ) {
            renderZonesDebounced(
              buildZonesAuto(
                regRows,
                allWeighDocs
              ),
              []
            );
          }

          /*
           * Для 3tables:
           * спочатку повний розрахунок,
           * після цього готовий render.
           */
          renderThreeTablesDebounced();
        },
        error => {
          console.error(
            "all weighings snapshot error:",
            error
          );
        }
      );
  }

  /* ============================================================
     STAGE RESULTS
     ============================================================ */

  function startStageSub(docId) {
    stopStageSub();

    if (!docId) {
      showError(
        "Нема активного етапу (settings/app)."
      );

      return;
    }

    unsubStage = db
      .collection("stageResults")
      .doc(docId)
      .onSnapshot(
        snapshot => {
          try {
            if (!snapshot.exists) {
              if (stageEl) {
                stageEl.textContent = docId;
              }

              if (updatedEl) {
                updatedEl.textContent = "";
              }

              regRows = [];
              currentStageTeamsRaw = [];
              currentStageZonesData = {
                A: [],
                B: [],
                C: []
              };

              renderWeighDebounced();
              renderThreeTablesDebounced();

              showContent();
              return;
            }

            const data =
              snapshot.data() || {};

            const stageName =
              data.stageName ||
              data.stage ||
              data.title ||
              docId;

            if (stageEl) {
              stageEl.textContent =
                stageName;
            }

            const updatedAt =
              data.updatedAt ||
              data.updated ||
              data.ts ||
              null;

            if (updatedEl) {
              updatedEl.textContent =
                `Оновлено: ${fmtTs(updatedAt)}`;
            }

            const zonesData =
              data.zones || {
                A: [],
                B: [],
                C: []
              };

            const teamsRaw =
              Array.isArray(data.teams)
                ? data.teams
                : [];

            currentStageTeamsRaw =
              teamsRaw;

            currentStageZonesData =
              zonesData;

            regRows =
              buildRegRowsFromStageTeams(
                teamsRaw
              );

            renderFinalBigFishTables();
            renderWeighDebounced();
            renderThreeTablesDebounced();

            const hasStageZones =
              (
                zonesData.A &&
                zonesData.A.length
              ) ||
              (
                zonesData.B &&
                zonesData.B.length
              ) ||
              (
                zonesData.C &&
                zonesData.C.length
              );

            needAutoZones =
              !hasStageZones;

            if (hasStageZones) {
              renderZonesDebounced(
                zonesData,
                teamsRaw
              );
            } else if (
              allWeighDocs.length
            ) {
              renderZonesDebounced(
                buildZonesAuto(
                  regRows,
                  allWeighDocs
                ),
                teamsRaw
              );
            } else {
              renderZonesDebounced(
                {
                  A: [],
                  B: [],
                  C: []
                },
                teamsRaw
              );
            }

            startAllWeighingsSubIfNeeded();
            showContent();
          } catch (error) {
            console.error(
              "stageResults render error:",
              error
            );

            showError(
              "Помилка відображення даних Live."
            );
          }
        },
        error => {
          console.error(
            "stageResults snapshot error:",
            error
          );

          showError(
            "Помилка читання Live (stageResults)."
          );
        }
      );
  }

  /* ============================================================
     COMPETITION FORMAT
     ============================================================ */

  function getEventFromCompetition(
    competition
  ) {
    const events =
      Array.isArray(competition?.events)
        ? competition.events
        : [];

    if (!activeStageId) {
      return null;
    }

    return events.find(event => {
      const key = String(
        event?.key ||
        event?.stageId ||
        event?.id ||
        ""
      );

      return key === activeStageId;
    }) || null;
  }

  function resolveCompetitionFormat(
    competition
  ) {
    const event =
      getEventFromCompetition(
        competition
      );

    const rawFormat =
      event?.format ||
      event?.engine?.baseFormat ||
      competition?.format ||
      competition?.engine?.baseFormat ||
      FORMAT_CLASSIC;

    return normalizeFormat(rawFormat);
  }

  function startCompetitionSub(
    compId
  ) {
    stopCompetitionSub();

    if (!compId) {
      activeFormat =
        FORMAT_CLASSIC;

      applyFormatVisibility();
      renderFinalBigFishTables();

      return;
    }

    unsubCompetition = db
      .collection("competitions")
      .doc(compId)
      .onSnapshot(
        snapshot => {
          try {
            const competition =
              snapshot.exists
                ? snapshot.data() || {}
                : {};

            const nextFormat =
              resolveCompetitionFormat(
                competition
              );

            const formatChanged =
              nextFormat !== activeFormat;

            activeFormat =
              nextFormat;

            applyFormatVisibility();

            /*
             * Якщо формат змінився:
             * повторно перемальовуємо потрібні блоки.
             */
            if (formatChanged) {
              console.info(
                "Live format:",
                activeFormat
              );
            }

            renderFinalBigFishTables();
            renderThreeTablesDebounced();

            /*
             * Classic-зони та W1-W4 лишаються
             * доступними за замовчуванням.
             */
            renderWeighDebounced();

            if (
              needAutoZones &&
              regRows.length
            ) {
              renderZonesDebounced(
                buildZonesAuto(
                  regRows,
                  allWeighDocs
                ),
                []
              );
            } else {
              renderZonesDebounced(
                currentStageZonesData,
                currentStageTeamsRaw
              );
            }
          } catch (error) {
            console.error(
              "competition format error:",
              error
            );

            /*
             * При будь-якій помилці —
             * безпечний fallback на classic.
             */
            activeFormat =
              FORMAT_CLASSIC;

            applyFormatVisibility();
            renderFinalBigFishTables();
          }
        },
        error => {
          console.error(
            "competition snapshot error:",
            error
          );

          /*
           * Якщо competitions читати не вдалося,
           * Live не ламаємо — використовуємо classic.
           */
          activeFormat =
            FORMAT_CLASSIC;

          applyFormatVisibility();
          renderFinalBigFishTables();
        }
      );
  }

  /* ============================================================
     SETTINGS / APP
     ============================================================ */

  function stageDocIdFromApp(app) {
    const explicitKey =
      app?.activeKey ||
      app?.activeStageResultsId;

    if (explicitKey) {
      return String(explicitKey);
    }

    const compId =
      app?.activeCompetitionId ||
      app?.activeCompetition ||
      app?.competitionId ||
      "";

    const stageId =
      app?.activeStageId ||
      app?.stageId ||
      "stage-1";

    if (compId && stageId) {
      return `${compId}__${stageId}`;
    }

    return "";
  }

  function readActiveIdsFromApp(app) {
    const compId =
      app?.activeCompetitionId ||
      app?.activeCompetition ||
      app?.competitionId ||
      "";

    const stageId =
      app?.activeStageId ||
      app?.stageId ||
      "stage-1";

    activeCompId =
      String(compId || "");

    activeStageId =
      String(stageId || "");
  }

  if (!db) {
    showError(
      "Firebase init не завантажився."
    );

    return;
  }

  ensureThreeTablesUI();
  applyFormatVisibility();

  let prevStageKey = "";

  db.collection("settings")
    .doc("app")
    .onSnapshot(
      snapshot => {
        try {
          const app =
            snapshot.exists
              ? snapshot.data() || {}
              : {};

          readActiveIdsFromApp(app);

          activeDocId =
            stageDocIdFromApp(app);

          const stageKey =
            `${activeCompId}||${activeStageId}`;

          if (
            stageKey !== prevStageKey
          ) {
            prevStageKey =
              stageKey;

            allWeighDocs = [];
            weighByTeam = new Map();
            regRows = [];

            currentStageTeamsRaw = [];
            currentStageZonesData = {
              A: [],
              B: [],
              C: []
            };

            needAutoZones = false;

            /*
             * Безпечний початковий режим.
             * Після читання competitions
             * формат буде уточнений.
             */
            activeFormat =
              FORMAT_CLASSIC;

            applyFormatVisibility();

            stopWeighSubs();

            startCompetitionSub(
              activeCompId
            );

            startStageSub(
              activeDocId
            );

            setActiveWeigh(
              currentWeighNo
            );
          }
        } catch (error) {
          console.error(
            "settings/app error:",
            error
          );

          showError(
            "Помилка читання settings/app."
          );
        }
      },
      error => {
        console.error(
          "settings/app snapshot error:",
          error
        );

        showError(
          "Помилка читання settings/app."
        );
      }
    );

  if (wBtn1) {
    wBtn1.addEventListener(
      "click",
      () => setActiveWeigh(1)
    );
  }

  if (wBtn2) {
    wBtn2.addEventListener(
      "click",
      () => setActiveWeigh(2)
    );
  }

  if (wBtn3) {
    wBtn3.addEventListener(
      "click",
      () => setActiveWeigh(3)
    );
  }

  if (wBtn4) {
    wBtn4.addEventListener(
      "click",
      () => setActiveWeigh(4)
    );
  }

  setActiveWeigh(1);

})();

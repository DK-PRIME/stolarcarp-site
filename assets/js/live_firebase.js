// assets/js/live_firebase.js
// STOLAR CARP • Live public
//
// ✅ TEAM + SOLO одним модулем
// ✅ Жереб показується одразу після збереження
// ✅ stageResults = основне джерело жеребу для LIVE
// ✅ public_participants = SOLO fallback для імені/жеребу
// ✅ SOLO identity = uid / entityId
// ✅ TEAM identity = teamId
// ✅ SOLO canonical name = Прізвище Ім'я
// ✅ legacy 2-word name НЕ переставляємо
// ✅ W1–W4 + Big Fish працюють для TEAM + SOLO
// ✅ 3TABLES лишається без змін
//
// Потрібно:
// live-3tables.js підключити ПЕРЕД live_firebase.js

(function () {
  "use strict";

  console.log(
    "✅ live_firebase.js LOADED v20260916-team-solo-v8"
  );

  const db =
    window.scDb;

  // =========================================================
  // DOM
  // =========================================================

  const stageEl =
    document.getElementById(
      "liveStageName"
    );

  const zonesWrap =
    document.getElementById(
      "zonesContainer"
    );

  const weighTableEl =
    document.getElementById(
      "totalTable"
    );

  const weighInfoEl =
    document.getElementById(
      "weighInfo"
    );

  const updatedEl =
    document.getElementById(
      "liveUpdatedAt"
    );

  const finalBigFishBox =
    document.getElementById(
      "finalBigFishBox"
    );

  const loadingEl =
    document.getElementById(
      "liveLoading"
    );

  const contentEl =
    document.getElementById(
      "liveContent"
    );

  const errorEl =
    document.getElementById(
      "liveError"
    );

  const wBtn1 =
    document.getElementById(
      "wBtn1"
    );

  const wBtn2 =
    document.getElementById(
      "wBtn2"
    );

  const wBtn3 =
    document.getElementById(
      "wBtn3"
    );

  const wBtn4 =
    document.getElementById(
      "wBtn4"
    );

  // =========================================================
  // CONSTANTS
  // =========================================================

  const FORMAT_CLASSIC =
    "classic";

  const FORMAT_3TABLES =
    "3tables";

  const ENTRY_TEAM =
    "team";

  const ENTRY_SOLO =
    "solo";

  // =========================================================
  // STATE
  // =========================================================

  let activeFormat =
    FORMAT_CLASSIC;

  let activeEntryType =
    ENTRY_TEAM;

  let activeCompId =
    "";

  let activeStageId =
    "";

  let activeDocId =
    "";

  let currentWeighNo =
    1;

  let currentWeighKey =
    "W1";

  let regRows =
    [];

  let weighByTeam =
    new Map();

  let allWeighDocs =
    [];

  let needAutoZones =
    false;

  let currentStageTeamsRaw =
    [];

  let currentStageZonesData = {
    A: [],
    B: [],
    C: []
  };

  /*
   * SOLO public fallback.
   */
  let publicSoloNameByUid =
    new Map();

  let publicSoloNameByTeamId =
    new Map();

  let publicSoloRows =
    [];

  let threeTablesSection =
    null;

  let threeTablesContainer =
    null;

  let unsubWeigh =
    null;

  let unsubAllWeigh =
    null;

  let unsubStage =
    null;

  let unsubCompetition =
    null;

  let unsubPublicParticipants =
    null;

  // =========================================================
  // COMMON HELPERS
  // =========================================================

  const fmt =
    value => (
      value === null ||
      value === undefined ||
      value === ""
        ? "—"
        : String(
            value
          )
    );

  function esc(
    value
  ) {
    return String(
      value ?? ""
    ).replace(
      /[&<>"']/g,
      char => ({
        "&":
          "&amp;",

        "<":
          "&lt;",

        ">":
          "&gt;",

        '"':
          "&quot;",

        "'":
          "&#39;"
      })[
        char
      ]
    );
  }

  function norm(
    value
  ) {
    return String(
      value ?? ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  function normLower(
    value
  ) {
    return norm(
      value
    )
      .toLowerCase();
  }

  function fmtTs(
    ts
  ) {
    try {
      const date =
        ts?.toDate
          ? ts.toDate()
          : ts instanceof Date
            ? ts
            : null;

      if (
        !date
      ) {
        return "—";
      }

      return date
        .toLocaleString(
          "uk-UA",
          {
            hour:
              "2-digit",

            minute:
              "2-digit",

            day:
              "2-digit",

            month:
              "2-digit"
          }
        );

    } catch {
      return "—";
    }
  }

  function fmtNum(
    value
  ) {
    const number =
      Number(
        value
      );

    if (
      !Number.isFinite(
        number
      )
    ) {
      return null;
    }

    return number
      .toFixed(
        2
      )
      .replace(
        /\.?0+$/,
        ""
      );
  }

  function kgShort(
    value
  ) {
    const number =
      Number(
        value
      );

    if (
      !Number.isFinite(
        number
      )
    ) {
      return "0";
    }

    return number
      .toFixed(
        2
      )
      .replace(
        /\.?0+$/,
        ""
      );
  }

  function weightOrDash(
    value
  ) {
    const number =
      Number(
        value
      );

    if (
      !Number.isFinite(
        number
      ) ||
      number <= 0
    ) {
      return "—";
    }

    return kgShort(
      number
    );
  }

  function valueOrDash(
    value
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    return String(
      value
    );
  }

  function debounce(
    fn,
    ms = 80
  ) {
    let timer =
      null;

    return (
      ...args
    ) => {
      if (
        timer
      ) {
        clearTimeout(
          timer
        );
      }

      timer =
        setTimeout(
          () => {
            fn(
              ...args
            );
          },
          ms
        );
    };
  }

  function showError(
    text
  ) {
    if (
      errorEl
    ) {
      errorEl.style.display =
        "block";

      errorEl.textContent =
        text;
    }

    if (
      loadingEl
    ) {
      loadingEl.style.display =
        "none";
    }

    if (
      contentEl
    ) {
      contentEl.style.display =
        "grid";
    }
  }

  function showContent() {
    if (
      errorEl
    ) {
      errorEl.style.display =
        "none";
    }

    if (
      loadingEl
    ) {
      loadingEl.style.display =
        "none";
    }

    if (
      contentEl
    ) {
      contentEl.style.display =
        "grid";
    }
  }

  // =========================================================
  // FISH HELPERS
  // =========================================================

  function getFishKg(
    fish
  ) {
    if (
      typeof fish ===
        "number" ||
      typeof fish ===
        "string"
    ) {
      return Number(
        fish
      );
    }

    return Number(
      fish?.kg ??
      fish?.weight ??
      fish?.value ??
      0
    );
  }

  function isAmurFish(
    fish
  ) {
    if (
      !fish ||
      typeof fish !==
        "object"
    ) {
      return false;
    }

    return (
      fish.isAmur ===
        true ||
      fish.fishType ===
        "amur" ||
      fish.type ===
        "amur"
    );
  }

  function normalizeFishArray(
    arr
  ) {
    if (
      !Array.isArray(
        arr
      )
    ) {
      return [];
    }

    return arr
      .map(
        fish => {
          const kg =
            getFishKg(
              fish
            );

          if (
            !Number.isFinite(
              kg
            ) ||
            kg <= 0
          ) {
            return null;
          }

          const isAmur =
            isAmurFish(
              fish
            );

          return {
            kg,

            fishType:
              isAmur
                ? "amur"
                : "carp",

            isAmur
          };
        }
      )
      .filter(
        Boolean
      );
  }

  function fishCellHTML(
    fish
  ) {
    const normalized =
      normalizeFishArray(
        [
          fish
        ]
      )[0];

    if (
      !normalized
    ) {
      return "—";
    }

    const value =
      fmtNum(
        normalized.kg
      );

    if (
      !value
    ) {
      return "—";
    }

    if (
      normalized.isAmur
    ) {
      return `
        <span class="live-fish-amur">
          ${esc(value)}
        </span>
      `;
    }

    return `
      <span>
        ${esc(value)}
      </span>
    `;
  }

  function wCell(
    hasDoc,
    weightsArr
  ) {
    if (
      !hasDoc
    ) {
      return "-";
    }

    const fish =
      normalizeFishArray(
        weightsArr
      );

    const count =
      fish.length;

    const sum =
      fish.reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.kg ||
            0
          ),
        0
      );

    if (
      count === 0
    ) {
      return "0 / 0";
    }

    return (
      `${count} / ` +
      `${kgShort(sum)}`
    );
  }

  // =========================================================
  // FORMAT / ENTRY TYPE
  // =========================================================

  function normalizeFormat(
    value
  ) {
    const raw =
      String(
        value ||
        ""
      )
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          ""
        )
        .replace(
          /_/g,
          "-"
        );

    if (
      raw === "3tables" ||
      raw === "3-tables" ||
      raw === "3table" ||
      raw === "three-tables" ||
      raw === "threetables"
    ) {
      return FORMAT_3TABLES;
    }

    return FORMAT_CLASSIC;
  }

  function isThreeTablesFormat() {
    return (
      activeFormat ===
      FORMAT_3TABLES
    );
  }

  function isSoloEntry() {
    return (
      activeEntryType ===
      ENTRY_SOLO
    );
  }

  /*
   * ВАЖЛИВО:
   *
   * Не покладаємося тільки
   * на activeEntryType.
   *
   * stageResults може прийти
   * швидше за competitions.
   */
  function isSoloItem(
    item
  ) {
    if (
      !item
    ) {
      return false;
    }

    if (
      normLower(
        item.entryType
      ) ===
      ENTRY_SOLO
    ) {
      return true;
    }

    return isSoloEntry();
  }

  function getCompetitionEvent(
    competition
  ) {
    const events =
      Array.isArray(
        competition?.events
      )
        ? competition.events
        : [];

    return (
      events.find(
        event => {
          const eventId =
            String(
              event?.key ||
              event?.stageId ||
              event?.id ||
              ""
            );

          return (
            eventId ===
            activeStageId
          );
        }
      ) ||
      null
    );
  }

  function resolveCompetitionFormat(
    competition
  ) {
    const event =
      getCompetitionEvent(
        competition
      );

    const rawFormat =
      event?.format ||
      event?.engine?.baseFormat ||
      competition?.format ||
      competition?.engine
        ?.baseFormat ||
      FORMAT_CLASSIC;

    return normalizeFormat(
      rawFormat
    );
  }

  function resolveCompetitionEntryType(
    competition
  ) {
    const event =
      getCompetitionEvent(
        competition
      );

    const eventKey =
      normLower(
        event?.key ||
        event?.stageId ||
        event?.id ||
        activeStageId ||
        ""
      );

    const eventTitle =
      normLower(
        event?.title ||
        event?.name ||
        event?.label ||
        ""
      );

    const isFinal =
      event?.isFinal ===
        true ||
      eventKey ===
        "final" ||
      eventKey.includes(
        "final"
      ) ||
      eventKey.includes(
        "фінал"
      ) ||
      eventTitle.includes(
        "final"
      ) ||
      eventTitle.includes(
        "фінал"
      );

    if (
      isFinal
    ) {
      return ENTRY_TEAM;
    }

    const explicit =
      normLower(
        event?.entryType ||
        competition?.entryType ||
        ""
      );

    if (
      explicit ===
        ENTRY_SOLO ||
      explicit ===
        ENTRY_TEAM
    ) {
      return explicit;
    }

    const rawFormat =
      String(
        event?.format ||
        event?.engine?.baseFormat ||
        competition?.format ||
        competition?.engine
          ?.baseFormat ||
        ""
      )
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          ""
        )
        .replace(
          /_/g,
          "-"
        );

    if (
      rawFormat ===
      "stalker-solo"
    ) {
      return ENTRY_SOLO;
    }

    return ENTRY_TEAM;
  }

  // =========================================================
  // SOLO NAME
  // =========================================================

  function isPlaceholderSoloName(
    value
  ) {
    const v =
      normLower(
        value
      )
        .replace(
          /[.!]/g,
          ""
        )
        .trim();

    return (
      !v ||
      v === "учасник" ||
      v === "учасник команди" ||
      v === "participant" ||
      v === "player" ||
      v === "користувач" ||
      v === "user" ||
      v === "команда" ||
      v === "team" ||
      v === "—" ||
      v === "-"
    );
  }

  function cleanSoloName(
    value
  ) {
    const name =
      norm(
        value
      );

    if (
      !name ||
      isPlaceholderSoloName(
        name
      )
    ) {
      return "";
    }

    if (
      name.includes(
        "@"
      )
    ) {
      return "";
    }

    return name;
  }

  function isPatronymicPart(
    value
  ) {
    const s =
      normLower(
        value
      );

    if (
      !s
    ) {
      return false;
    }

    return (
      /(?:ович|евич|євич|йович)$/i.test(
        s
      ) ||
      /(?:івна|ївна|овна|евна|євна)$/i.test(
        s
      )
    );
  }

  /*
   * Legacy:
   *
   * 2 слова — НЕ переставляємо.
   *
   * 3 слова:
   * пробуємо забрати по батькові.
   */
  function normalizeLegacySoloName(
    value
  ) {
    const raw =
      cleanSoloName(
        value
      );

    if (
      !raw
    ) {
      return "";
    }

    const parts =
      raw
        .split(
          " "
        )
        .filter(
          Boolean
        );

    if (
      parts.length ===
      2
    ) {
      return raw;
    }

    if (
      parts.length ===
      3
    ) {
      const patronymicIndex =
        parts.findIndex(
          isPatronymicPart
        );

      /*
       * Прізвище Ім'я По-батькові
       */
      if (
        patronymicIndex ===
        2
      ) {
        return (
          `${parts[0]} ${parts[1]}`
        );
      }

      /*
       * Ім'я По-батькові Прізвище
       */
      if (
        patronymicIndex ===
        1
      ) {
        return (
          `${parts[2]} ${parts[0]}`
        );
      }

      if (
        patronymicIndex ===
        0
      ) {
        return (
          `${parts[2]} ${parts[1]}`
        );
      }
    }

    return raw;
  }

  function canonicalSoloNameFromData(
    data
  ) {
    const d =
      data ||
      {};

    const firstName =
      cleanSoloName(
        d.firstName
      );

    const lastName =
      cleanSoloName(
        d.lastName
      );

    /*
     * Canonical:
     * Прізвище Ім'я
     */
    if (
      firstName &&
      lastName
    ) {
      return (
        `${lastName} ${firstName}`
      );
    }

    const direct =
      normalizeLegacySoloName(
        d.participantName ||
        d.fullName ||
        d.userName ||
        d.name ||
        ""
      );

    if (
      direct
    ) {
      return direct;
    }

    const displayName =
      cleanSoloName(
        d.displayName
      );

    const teamName =
      norm(
        d.teamName ||
        d.team
      );

    if (
      displayName &&
      (
        !teamName ||
        normLower(
          displayName
        ) !==
          normLower(
            teamName
          )
      )
    ) {
      return normalizeLegacySoloName(
        displayName
      );
    }

    const captain =
      cleanSoloName(
        d.captain
      );

    if (
      captain &&
      (
        !teamName ||
        normLower(
          captain
        ) !==
          normLower(
            teamName
          )
      )
    ) {
      return normalizeLegacySoloName(
        captain
      );
    }

    return "";
  }

  function rawSoloFullName(
    item
  ) {
    if (
      !item
    ) {
      return "";
    }

    const firstName =
      cleanSoloName(
        item.firstName
      );

    const lastName =
      cleanSoloName(
        item.lastName
      );

    /*
     * Найвищий пріоритет:
     * structured fields.
     */
    if (
      firstName &&
      lastName
    ) {
      return (
        `${lastName} ${firstName}`
      );
    }

    const uid =
      norm(
        item.uid ||
        item.participantUid ||
        item.userId ||
        item.registeredByUid ||
        item.entityId ||
        ""
      );

    /*
     * Public profile/mirror може
     * містити новіший canonical ПІБ,
     * ніж старий stageResults.
     */
    if (
      uid &&
      publicSoloNameByUid.has(
        uid
      )
    ) {
      const publicName =
        cleanSoloName(
          publicSoloNameByUid.get(
            uid
          )
        );

      if (
        publicName
      ) {
        return publicName;
      }
    }

    const legacyTeamId =
      norm(
        item.teamId
      );

    if (
      legacyTeamId &&
      publicSoloNameByTeamId.has(
        legacyTeamId
      )
    ) {
      const publicName =
        cleanSoloName(
          publicSoloNameByTeamId.get(
            legacyTeamId
          )
        );

      if (
        publicName
      ) {
        return publicName;
      }
    }

    return canonicalSoloNameFromData(
      item
    );
  }

  /*
   * Уже отримуємо canonical:
   *
   * Прізвище Ім'я
   *
   * НІЧОГО не перевертаємо.
   */
  function soloDisplayName(
    item,
    maxChars = 16
  ) {
    const full =
      rawSoloFullName(
        item
      );

    if (
      !full
    ) {
      return "Учасник";
    }

    if (
      full.length <=
      maxChars
    ) {
      return full;
    }

    const parts =
      full
        .split(
          " "
        )
        .filter(
          Boolean
        );

    if (
      parts.length <
      2
    ) {
      return full;
    }

    const lastName =
      parts[0];

    const firstName =
      parts[1];

    const initial =
      firstName
        .charAt(
          0
        )
        .toUpperCase();

    return initial
      ? `${lastName} ${initial}.`
      : lastName;
  }

  function fullSoloDisplayName(
    item
  ) {
    return (
      rawSoloFullName(
        item
      ) ||
      "Учасник"
    );
  }

  function displayName(
    item
  ) {
    if (
      isSoloItem(
        item
      )
    ) {
      return soloDisplayName(
        item
      );
    }

    return (
      norm(
        item?.teamName ||
        item?.team
      ) ||
      "—"
    );
  }

  function fullDisplayName(
    item
  ) {
    if (
      isSoloItem(
        item
      )
    ) {
      return fullSoloDisplayName(
        item
      );
    }

    return displayName(
      item
    );
  }

  function participantColumnTitle() {
    return isSoloEntry()
      ? "Учасник"
      : "Команда";
  }

  function participantCountText(
    count
  ) {
    return isSoloEntry()
      ? `учасників: ${count}`
      : `команд: ${count}`;
  }

  function participantWaitingText() {
    return isSoloEntry()
      ? "Очікую список учасників…"
      : "Очікую список команд…";
  }

  // =========================================================
  // ENTITY IDS
  // =========================================================

  function entityCandidates(
    item
  ) {
    if (
      !item
    ) {
      return [];
    }

    const ids =
      [];

    const addId =
      value => {
        const id =
          norm(
            value
          );

        if (
          id &&
          !ids.includes(
            id
          )
        ) {
          ids.push(
            id
          );
        }
      };

    /*
     * SOLO:
     * UID / entityId.
     *
     * teamId лише legacy alias.
     */
    if (
      isSoloItem(
        item
      )
    ) {
      addId(
        item.uid
      );

      addId(
        item.participantUid
      );

      addId(
        item.userId
      );

      addId(
        item.registeredByUid
      );

      addId(
        item.entityId
      );

      addId(
        item.teamId
      );

      return ids;
    }

    /*
     * TEAM.
     */
    addId(
      item.teamId
    );

    addId(
      item.entityId
    );

    return ids;
  }

  function primaryEntityId(
    item
  ) {
    return (
      entityCandidates(
        item
      )[0] ||
      ""
    );
  }

  function findWeightsForRow(
    row
  ) {
    const ids =
      entityCandidates(
        row
      );

    for (
      const id
      of ids
    ) {
      if (
        weighByTeam.has(
          id
        )
      ) {
        return (
          weighByTeam.get(
            id
          ) ||
          []
        );
      }
    }

    return [];
  }

  function findRegRowForWeighDoc(
    doc
  ) {
    const docIds =
      new Set(
        entityCandidates(
          doc
        )
      );

    if (
      !docIds.size
    ) {
      return null;
    }

    return (
      regRows.find(
        row =>
          entityCandidates(
            row
          ).some(
            id =>
              docIds.has(
                id
              )
          )
      ) ||
      null
    );
  }

  // =========================================================
  // COMPACT 3TABLES UI
  // =========================================================

  function injectThreeTablesStyles() {
    const styleId =
      "sc-live-three-tables-styles";

    if (
      document.getElementById(
        styleId
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      styleId;

    style.textContent = `
      .three-tables-section {
        display: none;
        width: 100%;
        min-width: 0;
        margin-top: 18px;
        margin-bottom: 22px;
      }

      .three-tables-section.is-visible {
        display: block;
      }

      .three-tables-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }

      .three-tables-heading__text {
        min-width: 0;
      }

      .three-tables-heading h2 {
        margin: 0;
        font-size: clamp(1.18rem, 3vw, 1.55rem);
        line-height: 1.15;
      }

      .three-tables-heading p {
        margin: 4px 0 0;
        color: var(--muted, #999);
        font-size: .72rem;
      }

      .three-tables-section .live-zone {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        margin-bottom: 9px;
        overflow: hidden;
      }

      .three-tables-section .live-zone:last-child {
        margin-bottom: 0;
      }

      .three-tables-section .live-zone-title {
        margin-bottom: 7px;
      }

      .three-table-wrap {
        width: 100%;
        max-width: 100%;
        overflow: hidden;
      }

      .three-live-table {
        width: 100%;
        max-width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .three-live-table th,
      .three-live-table td {
        box-sizing: border-box;
        padding: 4px 2px;
        border-bottom: 1px solid rgba(255,255,255,.07);
        text-align: center;
        vertical-align: middle;
        overflow: hidden;
        font-size: clamp(7px, 1.42vw, 11px);
        line-height: 1.08;
        font-variant-numeric: tabular-nums;
      }

      .three-live-table th {
        color: var(--muted, #aaa);
        font-size: clamp(6px, 1.2vw, 9px);
        font-weight: 900;
        text-transform: uppercase;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .three-live-table td {
        white-space: nowrap;
        text-overflow: clip;
      }

      .three-col-zone {
        width: 5%;
      }

      .three-col-team {
        width: 18%;
      }

      .three-col-total-weight {
        width: 9%;
      }

      .three-col-total-place {
        width: 4%;
      }

      .three-col-fish {
        width: 5.8%;
      }

      .three-col-five-sum {
        width: 8%;
      }

      .three-col-five-place {
        width: 4%;
      }

      .three-col-big-weight {
        width: 8%;
      }

      .three-col-big-place {
        width: 4%;
      }

      .three-col-points {
        width: 6%;
      }

      .three-col-final {
        width: 5%;
      }

      .three-live-table .three-zone-cell {
        font-weight: 900;
      }

      .three-live-table .three-team-cell {
        padding-left: 4px;
        padding-right: 3px;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: normal;
        font-weight: 750;
      }

      .three-live-table .three-weight-cell {
        font-weight: 800;
      }

      .three-live-table .three-place-cell {
        font-weight: 900;
        color: var(--accent, #f6c34c);
      }

      .three-live-table .three-fish-cell {
        padding-left: 1px;
        padding-right: 1px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .three-live-table .three-points-cell {
        font-weight: 900;
      }

      .three-live-table .three-final-cell {
        font-size: clamp(8px, 1.65vw, 13px);
        font-weight: 950;
        color: #7cffb2;
      }

      .three-group-total {
        background: rgba(59,130,246,.055);
      }

      .three-group-five {
        background: rgba(246,195,76,.045);
      }

      .three-group-big {
        background: rgba(239,68,68,.045);
      }

      .three-live-table .three-table-group {
        padding: 6px 2px 5px;
        text-align: center;
        vertical-align: middle;
        border-bottom: 1px solid rgba(255,255,255,.14);
      }

      .three-live-table .three-table-number {
        display: block;
        margin-bottom: 3px;
        color: var(--accent, #f6c34c);
        font-size: clamp(6.5px, 1.25vw, 9px);
        line-height: 1;
        font-weight: 950;
        letter-spacing: .04em;
        white-space: nowrap;
      }

      .three-live-table .three-table-name {
        display: block;
        color: #e8e8ec;
        font-size: clamp(6px, 1.2vw, 9px);
        line-height: 1.08;
        font-weight: 900;
        white-space: normal;
      }

      .three-live-table .three-table-group--total {
        background: rgba(59,130,246,.10);
        border-left: 2px solid rgba(59,130,246,.48);
      }

      .three-live-table .three-table-group--five {
        background: rgba(246,195,76,.09);
        border-left: 2px solid rgba(246,195,76,.48);
      }

      .three-live-table .three-table-group--big {
        background: rgba(239,68,68,.09);
        border-left: 2px solid rgba(239,68,68,.48);
      }

      .three-live-table .three-table-subtitle {
        font-weight: 900;
      }

      .three-live-table .three-summary-head {
        font-weight: 950;
        vertical-align: middle;
      }

      .three-final-first td {
        border-top: 1px solid rgba(246,195,76,.4);
        border-bottom-color: rgba(246,195,76,.25);
      }

      .three-final-first .three-final-cell {
        color: #ffd451;
      }

      .three-final-second .three-final-cell {
        color: #e5e7eb;
      }

      .three-final-third .three-final-cell {
        color: #df9968;
      }

      .three-empty {
        padding: 18px 10px;
        color: var(--muted, #999);
        text-align: center;
        font-size: .8rem;
      }

      @media (max-width: 600px) {
        .three-tables-section {
          margin-top: 14px;
        }

        .three-tables-heading {
          align-items: flex-start;
          flex-direction: column;
          margin-bottom: 10px;
        }

        .three-tables-section .live-zone {
          padding: 9px 6px;
          border-radius: 10px;
        }

        .three-live-table th,
        .three-live-table td {
          padding: 3px 1px;
          font-size: clamp(6.6px, 1.9vw, 8px);
          line-height: 1.02;
        }

        .three-live-table th {
          font-size: clamp(5.5px, 1.55vw, 7px);
        }

        .three-live-table .three-team-cell {
          padding-left: 2px;
          padding-right: 2px;
          font-size: clamp(6.4px, 1.8vw, 8px);
        }

        .three-live-table .three-fish-cell {
          font-size: clamp(6.2px, 1.72vw, 7.6px);
          letter-spacing: -0.04em;
        }

        .three-live-table .three-final-cell {
          font-size: clamp(7px, 2vw, 9px);
        }

        .three-live-table .three-table-group {
          padding: 4px 1px 3px;
        }

        .three-live-table .three-table-number {
          margin-bottom: 2px;
          font-size: 5.8px;
          letter-spacing: 0;
        }

        .three-live-table .three-table-name {
          font-size: 5.6px;
          line-height: 1.05;
        }
      }

      @media (max-width: 380px) {
        .three-live-table th,
        .three-live-table td {
          font-size: 6.4px;
        }

        .three-live-table th {
          font-size: 5.4px;
        }

        .three-live-table .three-fish-cell {
          font-size: 6.1px;
        }

        .three-live-table .three-team-cell {
          font-size: 6.3px;
        }

        .three-live-table .three-table-number {
          font-size: 5.4px;
        }

        .three-live-table .three-table-name {
          font-size: 5.2px;
        }
      }
    `;

    document.head
      .appendChild(
        style
      );
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
      document.createElement(
        "section"
      );

    threeTablesSection.id =
      "threeTablesSection";

    threeTablesSection.className =
      "three-tables-section";

    threeTablesSection.innerHTML = `
      <div class="three-tables-heading">

        <div class="three-tables-heading__text">

          <h2>
            Результати — три таблиці
          </h2>

          <p>
            1 таблиця — загальна вага ·
            2 таблиця — 5 великих без Big Fish ·
            3 таблиця — Big Fish
          </p>

        </div>

        <span class="badge badge--warn">
          Підсумок за зонами
        </span>

      </div>

      <div id="threeTablesContainer">

        <div class="three-empty">
          Очікую команди та зважування…
        </div>

      </div>
    `;

    threeTablesContainer =
      threeTablesSection
        .querySelector(
          "#threeTablesContainer"
        );

    const anchor =
      zonesWrap
        ?.parentElement ||
      zonesWrap ||
      contentEl;

    if (
      anchor
        ?.parentElement
    ) {
      anchor
        .parentElement
        .insertBefore(
          threeTablesSection,
          anchor.nextSibling
        );

    } else if (
      contentEl
    ) {
      contentEl
        .appendChild(
          threeTablesSection
        );

    } else {
      document.body
        .appendChild(
          threeTablesSection
        );
    }
  }

  function applyFormatVisibility() {
    ensureThreeTablesUI();

    if (
      isThreeTablesFormat()
    ) {
      threeTablesSection
        ?.classList
        .add(
          "is-visible"
        );

      if (
        finalBigFishBox
      ) {
        finalBigFishBox
          .style
          .display =
          "none";
      }

      return;
    }

    threeTablesSection
      ?.classList
      .remove(
        "is-visible"
      );

    if (
      threeTablesContainer
    ) {
      threeTablesContainer
        .innerHTML =
        "";
    }

    if (
      finalBigFishBox
    ) {
      finalBigFishBox
        .style
        .display =
        "";
    }
  }

  function finalPlaceClass(
    place
  ) {
    const number =
      Number(
        place
      );

    if (
      number ===
      1
    ) {
      return "three-final-first";
    }

    if (
      number ===
      2
    ) {
      return "three-final-second";
    }

    if (
      number ===
      3
    ) {
      return "three-final-third";
    }

    return "";
  }

  function fishValueAt(
    row,
    index
  ) {
    const fish =
      Array.isArray(
        row?.top5Fish
      )
        ? row.top5Fish
        : [];

    const value =
      fish[
        index
      ];

    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(
        Number(
          value
        )
      ) ||
      Number(
        value
      ) <= 0
    ) {
      return "—";
    }

    return kgShort(
      value
    );
  }

  function renderThreeZone(
    zoneName,
    zoneResult
  ) {
    const rows =
      Array.isArray(
        zoneResult
          ?.finalTable
      )
        ? [
            ...zoneResult
              .finalTable
          ]
        : [];

    if (
      !rows.length
    ) {
      return `
        <div class="live-zone card">

          <div class="live-zone-title">

            <h3 style="margin:0;">
              Зона ${esc(zoneName)}
            </h3>

            <span class="badge">
              немає команд
            </span>

          </div>

          <p class="form__hint">
            ...
          </p>

        </div>
      `;
    }

    rows.sort(
      (
        a,
        b
      ) =>
        Number(
          a.finalPlace ||
          9999
        ) -
        Number(
          b.finalPlace ||
          9999
        )
    );

    const rowsHtml =
      rows
        .map(
          row => {
            const rowClass =
              finalPlaceClass(
                row.finalPlace
              );

            return `
              <tr class="${rowClass}">

                <td class="three-zone-cell">
                  ${esc(
                    row.zoneLabel ||
                    row.sector ||
                    "—"
                  )}
                </td>

                <td
                  class="three-team-cell"
                  title="${esc(
                    row.teamName ||
                    "—"
                  )}"
                >
                  ${esc(
                    row.teamName ||
                    "—"
                  )}
                </td>

                <td class="three-weight-cell three-group-total">
                  ${esc(
                    weightOrDash(
                      row.totalWeight
                    )
                  )}
                </td>

                <td class="three-place-cell three-group-total">
                  ${esc(
                    valueOrDash(
                      row.totalPlace
                    )
                  )}
                </td>

                <td class="three-fish-cell three-group-five">
                  ${esc(
                    fishValueAt(
                      row,
                      0
                    )
                  )}
                </td>

                <td class="three-fish-cell three-group-five">
                  ${esc(
                    fishValueAt(
                      row,
                      1
                    )
                  )}
                </td>

                <td class="three-fish-cell three-group-five">
                  ${esc(
                    fishValueAt(
                      row,
                      2
                    )
                  )}
                </td>

                <td class="three-fish-cell three-group-five">
                  ${esc(
                    fishValueAt(
                      row,
                      3
                    )
                  )}
                </td>

                <td class="three-fish-cell three-group-five">
                  ${esc(
                    fishValueAt(
                      row,
                      4
                    )
                  )}
                </td>

                <td class="three-weight-cell three-group-five">
                  ${esc(
                    weightOrDash(
                      row.top5Weight
                    )
                  )}
                </td>

                <td class="three-place-cell three-group-five">
                  ${esc(
                    valueOrDash(
                      row.top5Place
                    )
                  )}
                </td>

                <td class="three-weight-cell three-group-big">
                  ${esc(
                    weightOrDash(
                      row.bigFish
                    )
                  )}
                </td>

                <td class="three-place-cell three-group-big">
                  ${esc(
                    valueOrDash(
                      row.bigFishPlace
                    )
                  )}
                </td>

                <td class="three-points-cell">
                  ${esc(
                    valueOrDash(
                      row.pointsSum
                    )
                  )}
                </td>

                <td class="three-final-cell">
                  ${esc(
                    valueOrDash(
                      row.finalPlace
                    )
                  )}
                </td>

              </tr>
            `;
          }
        )
        .join("");

    return `
      <div class="live-zone card">

        <div class="live-zone-title">

          <h3 style="margin:0;">
            Зона ${esc(zoneName)}
          </h3>

          <span class="badge badge--warn">
            команд: ${esc(
              zoneResult
                ?.teamsCount ||
              rows.length
            )}
          </span>

        </div>

        <div class="three-table-wrap">

          <table class="table table-sm three-live-table">

            <colgroup>
              <col class="three-col-zone">
              <col class="three-col-team">

              <col class="three-col-total-weight">
              <col class="three-col-total-place">

              <col class="three-col-fish">
              <col class="three-col-fish">
              <col class="three-col-fish">
              <col class="three-col-fish">
              <col class="three-col-fish">

              <col class="three-col-five-sum">
              <col class="three-col-five-place">

              <col class="three-col-big-weight">
              <col class="three-col-big-place">

              <col class="three-col-points">
              <col class="three-col-final">
            </colgroup>

            <thead>

              <tr>

                <th
                  rowspan="3"
                  class="three-summary-head"
                >
                  Зона
                </th>

                <th
                  rowspan="3"
                  class="three-summary-head"
                >
                  Команда
                </th>

                <th
                  colspan="2"
                  class="
                    three-table-group
                    three-table-group--total
                  "
                >
                  <span class="three-table-number">
                    1 ТАБЛИЦЯ
                  </span>

                  <span class="three-table-name">
                    ЗАГАЛЬНА ВАГА
                  </span>
                </th>

                <th
                  colspan="7"
                  class="
                    three-table-group
                    three-table-group--five
                  "
                >
                  <span class="three-table-number">
                    2 ТАБЛИЦЯ
                  </span>

                  <span class="three-table-name">
                    5 ВЕЛИКИХ РИБ
                  </span>
                </th>

                <th
                  colspan="2"
                  class="
                    three-table-group
                    three-table-group--big
                  "
                >
                  <span class="three-table-number">
                    3 ТАБЛИЦЯ
                  </span>

                  <span class="three-table-name">
                    BIG FISH
                  </span>
                </th>

                <th
                  rowspan="3"
                  class="three-summary-head"
                >
                  Бали
                </th>

                <th
                  rowspan="3"
                  class="three-summary-head"
                >
                  М
                </th>

              </tr>

              <tr>

                <th
                  rowspan="2"
                  class="
                    three-group-total
                    three-table-subtitle
                  "
                >
                  Вага
                </th>

                <th
                  rowspan="2"
                  class="
                    three-group-total
                    three-table-subtitle
                  "
                >
                  М
                </th>

                <th
                  colspan="5"
                  class="
                    three-group-five
                    three-table-subtitle
                  "
                >
                  Риби
                </th>

                <th
                  rowspan="2"
                  class="
                    three-group-five
                    three-table-subtitle
                  "
                >
                  Вага
                </th>

                <th
                  rowspan="2"
                  class="
                    three-group-five
                    three-table-subtitle
                  "
                >
                  М
                </th>

                <th
                  rowspan="2"
                  class="
                    three-group-big
                    three-table-subtitle
                  "
                >
                  Вага
                </th>

                <th
                  rowspan="2"
                  class="
                    three-group-big
                    three-table-subtitle
                  "
                >
                  М
                </th>

              </tr>

              <tr>
                <th class="three-group-five">1</th>
                <th class="three-group-five">2</th>
                <th class="three-group-five">3</th>
                <th class="three-group-five">4</th>
                <th class="three-group-five">5</th>
              </tr>

            </thead>

            <tbody>
              ${rowsHtml}
            </tbody>

          </table>

        </div>

      </div>
    `;
  }

  function renderThreeTables() {
    applyFormatVisibility();

    if (
      !isThreeTablesFormat()
    ) {
      return;
    }

    ensureThreeTablesUI();

    if (
      !window.SCThreeTables ||
      typeof window.SCThreeTables
        .build !==
        "function"
    ) {
      threeTablesContainer
        .innerHTML = `
          <div class="three-empty">
            Не завантажено live-3tables.js.
          </div>
        `;

      console.error(
        "SCThreeTables.build не знайдено. " +
        "Підключи live-3tables.js перед live_firebase.js."
      );

      return;
    }

    try {
      const result =
        window.SCThreeTables
          .build(
            regRows,
            allWeighDocs
          );

      threeTablesContainer
        .innerHTML = [
          renderThreeZone(
            "A",
            result?.zones?.A
          ),

          renderThreeZone(
            "B",
            result?.zones?.B
          ),

          renderThreeZone(
            "C",
            result?.zones?.C
          )
        ].join("");

    } catch (
      error
    ) {
      console.error(
        "renderThreeTables error:",
        error
      );

      threeTablesContainer
        .innerHTML = `
          <div class="three-empty">
            Помилка розрахунку трьох таблиць.
          </div>
        `;
    }
  }

  const renderThreeTablesDebounced =
    debounce(
      renderThreeTables,
      70
    );

  // =========================================================
  // CLASSIC ZONES
  // =========================================================

  function buildZonesAuto(
    regRowsArg,
    weighDocs
  ) {
    const zones = {
      A: [],
      B: [],
      C: []
    };

    const byEntity =
      new Map();

    /*
     * Збираємо W1-W4
     * по універсальному identity.
     */
    (
      weighDocs ||
      []
    ).forEach(
      doc => {
        const ids =
          entityCandidates(
            doc
          );

        if (
          !ids.length
        ) {
          return;
        }

        const weighNo =
          Number(
            doc.weighNo
          );

        if (
          weighNo < 1 ||
          weighNo > 4
        ) {
          return;
        }

        let bucket =
          null;

        for (
          const id
          of ids
        ) {
          if (
            byEntity.has(
              id
            )
          ) {
            bucket =
              byEntity.get(
                id
              );

            break;
          }
        }

        if (
          !bucket
        ) {
          bucket = {
            has: {
              1: false,
              2: false,
              3: false,
              4: false
            },

            weights: {
              1: [],
              2: [],
              3: [],
              4: []
            }
          };
        }

        ids.forEach(
          id => {
            byEntity.set(
              id,
              bucket
            );
          }
        );

        bucket.has[
          weighNo
        ] =
          true;

        bucket.weights[
          weighNo
        ] =
          normalizeFishArray(
            doc.weights ||
            []
          );
      }
    );

    /*
     * ГОЛОВНЕ:
     *
     * regRows вже містить жереб.
     * Навіть коли weighings = [],
     * учасники/команди вже показуються.
     */
    (
      regRowsArg ||
      []
    ).forEach(
      row => {
        const zoneLetter =
          String(
            row.zoneLabel ||
            ""
          )[0]
            ?.toUpperCase();

        if (
          ![
            "A",
            "B",
            "C"
          ].includes(
            zoneLetter
          )
        ) {
          return;
        }

        let entityBucket =
          null;

        const ids =
          entityCandidates(
            row
          );

        for (
          const id
          of ids
        ) {
          if (
            byEntity.has(
              id
            )
          ) {
            entityBucket =
              byEntity.get(
                id
              );

            break;
          }
        }

        if (
          !entityBucket
        ) {
          entityBucket = {
            has: {
              1: false,
              2: false,
              3: false,
              4: false
            },

            weights: {
              1: [],
              2: [],
              3: [],
              4: []
            }
          };
        }

        let totalCount =
          0;

        let totalWeight =
          0;

        let bigFish =
          0;

        [
          1,
          2,
          3,
          4
        ].forEach(
          number => {
            if (
              !entityBucket
                .has[
                  number
                ]
            ) {
              return;
            }

            const fish =
              entityBucket
                .weights[
                  number
                ] ||
              [];

            totalCount +=
              fish.length;

            const sum =
              fish.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.kg ||
                    0
                  ),
                0
              );

            totalWeight +=
              sum;

            fish.forEach(
              item => {
                bigFish =
                  Math.max(
                    bigFish,
                    Number(
                      item.kg ||
                      0
                    )
                  );
              }
            );
          }
        );

        zones[
          zoneLetter
        ].push({
          entryType:
            row.entryType ||
            (
              isSoloEntry()
                ? ENTRY_SOLO
                : ENTRY_TEAM
            ),

          entityId:
            row.entityId ||
            primaryEntityId(
              row
            ),

          zoneLabel:
            row.zoneLabel,

          displayLabel:
            displayName(
              row
            ),

          fullDisplayLabel:
            fullDisplayName(
              row
            ),

          participantName:
            row.participantName ||
            "",

          firstName:
            row.firstName ||
            "",

          lastName:
            row.lastName ||
            "",

          uid:
            row.uid ||
            "",

          teamId:
            row.teamId ||
            "",

          teamName:
            row.teamName ||
            "",

          w1:
            wCell(
              entityBucket
                .has[1],
              entityBucket
                .weights[1]
            ),

          w2:
            wCell(
              entityBucket
                .has[2],
              entityBucket
                .weights[2]
            ),

          w3:
            wCell(
              entityBucket
                .has[3],
              entityBucket
                .weights[3]
            ),

          w4:
            wCell(
              entityBucket
                .has[4],
              entityBucket
                .weights[4]
            ),

          total:
            totalCount,

          big:
            bigFish
              ? kgShort(
                  bigFish
                )
              : "—",

          weight:
            totalWeight
              ? kgShort(
                  totalWeight
                )
              : "—",

          _totalWeight:
            totalWeight,

          _bigFish:
            bigFish,

          _totalCount:
            totalCount
        });
      }
    );

    [
      "A",
      "B",
      "C"
    ].forEach(
      zone => {
        zones[
          zone
        ].sort(
          (
            a,
            b
          ) => {
            if (
              b._totalWeight !==
              a._totalWeight
            ) {
              return (
                b._totalWeight -
                a._totalWeight
              );
            }

            if (
              b._bigFish !==
              a._bigFish
            ) {
              return (
                b._bigFish -
                a._bigFish
              );
            }

            if (
              b._totalCount !==
              a._totalCount
            ) {
              return (
                b._totalCount -
                a._totalCount
              );
            }

            return String(
              a.zoneLabel ||
              ""
            ).localeCompare(
              String(
                b.zoneLabel ||
                ""
              ),
              "uk",
              {
                numeric:
                  true
              }
            );
          }
        );

        /*
         * До першої риби
         * місця НЕ показуємо.
         */
        const hasAnyResult =
          zones[
            zone
          ].some(
            row =>
              row._totalWeight >
                0 ||
              row._totalCount >
                0 ||
              row._bigFish >
                0
          );

        zones[
          zone
        ].forEach(
          (
            row,
            index
          ) => {
            row.place =
              hasAnyResult
                ? index + 1
                : "—";
          }
        );
      }
    );

    return zones;
  }

  function fmtW(
    value
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    if (
      typeof value ===
      "string"
    ) {
      return value;
    }

    if (
      typeof value ===
      "number"
    ) {
      return String(
        value
      );
    }

    const count =
      value.count ??
      value.c ??
      value.qty ??
      "";

    const weight =
      value.weight ??
      value.kg ??
      value.w ??
      "";

    if (
      count === "" &&
      weight === ""
    ) {
      return "—";
    }

    return (
      `${fmt(count)} / ` +
      `${fmt(weight)}`
    );
  }

  function normZoneItem(
    item
  ) {
    const zoneRaw =
      item.zone ??
      item.drawZone ??
      "";

    const sector =
      item.drawSector ??
      item.sector ??
      null;

    const drawKey =
      item.drawKey ||
      "";

    let zoneLabel =
      item.zoneLabel ||
      "";

    if (
      !zoneLabel
    ) {
      if (
        drawKey
      ) {
        zoneLabel =
          String(
            drawKey
          );

      } else if (
        zoneRaw &&
        sector
      ) {
        zoneLabel =
          `${zoneRaw}${sector}`;

      } else {
        zoneLabel =
          zoneRaw ||
          "—";
      }
    }

    let shownName =
      "";

    let fullName =
      "";

    if (
      item.displayLabel
    ) {
      shownName =
        norm(
          item.displayLabel
        );

      fullName =
        norm(
          item.fullDisplayLabel
        ) ||
        shownName;

    } else {
      shownName =
        displayName(
          item
        );

      fullName =
        fullDisplayName(
          item
        );
    }

    return {
      zoneLabel,

      team:
        shownName ||
        "—",

      fullName:
        fullName ||
        shownName ||
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
    if (
      !zonesWrap
    ) {
      return;
    }

    const zoneNames = [
      "A",
      "B",
      "C"
    ];

    let useZones =
      zonesData ||
      {};

    const hasZoneData =
      Boolean(
        useZones.A
          ?.length
      ) ||
      Boolean(
        useZones.B
          ?.length
      ) ||
      Boolean(
        useZones.C
          ?.length
      );

    /*
     * Fallback із stageResults.teams.
     */
    if (
      !hasZoneData &&
      Array.isArray(
        teamsRaw
      ) &&
      teamsRaw.length
    ) {
      const fallback = {
        A: [],
        B: [],
        C: []
      };

      teamsRaw.forEach(
        team => {
          const drawKey =
            String(
              team.drawKey ||
              ""
            )
              .toUpperCase();

          const zone =
            String(
              team.drawZone ||
              team.zone ||
              (
                drawKey
                  ? drawKey[0]
                  : ""
              )
            )
              .toUpperCase();

          const sector =
            team.drawSector ??
            team.sector ??
            (
              drawKey
                ? parseInt(
                    drawKey.slice(
                      1
                    ),
                    10
                  )
                : null
            );

          if (
            ![
              "A",
              "B",
              "C"
            ].includes(
              zone
            )
          ) {
            return;
          }

          const rowSolo =
            normLower(
              team.entryType
            ) ===
              ENTRY_SOLO ||
            isSoloEntry();

          fallback[
            zone
          ].push({
            entryType:
              rowSolo
                ? ENTRY_SOLO
                : ENTRY_TEAM,

            entityId:
              norm(
                team.entityId
              ),

            uid:
              norm(
                team.uid ||
                team.participantUid ||
                team.userId ||
                team.registeredByUid ||
                (
                  rowSolo
                    ? team.entityId
                    : ""
                ) ||
                ""
              ),

            participantName:
              rowSolo
                ? normalizeLegacySoloName(
                    team.participantName ||
                    team.fullName ||
                    team.userName ||
                    ""
                  )
                : "",

            firstName:
              norm(
                team.firstName
              ),

            lastName:
              norm(
                team.lastName
              ),

            displayName:
              norm(
                team.displayName
              ),

            captain:
              norm(
                team.captain
              ),

            teamId:
              norm(
                team.teamId
              ),

            teamName:
              rowSolo
                ? ""
                : norm(
                    team.teamName ||
                    team.team
                  ),

            zone,

            drawZone:
              zone,

            drawSector:
              sector,

            drawKey:
              drawKey ||
              (
                zone &&
                sector
                  ? `${zone}${sector}`
                  : zone
              ),

            place:
              "—",

            w1:
              null,

            w2:
              null,

            w3:
              null,

            w4:
              null,

            total:
              null,

            big:
              "—",

            weight:
              "—"
          });
        }
      );

      useZones =
        fallback;
    }

    zonesWrap.innerHTML =
      zoneNames
        .map(
          zone => {
            const rawList =
              useZones?.[
                zone
              ] ||
              [];

            const list =
              rawList.map(
                normZoneItem
              );

            if (
              !list.length
            ) {
              return `
                <div class="live-zone card">

                  <div class="live-zone-title">

                    <h3 style="margin:0;">
                      Зона ${esc(zone)}
                    </h3>

                    <span class="badge">
                      немає даних
                    </span>

                  </div>

                  <p class="form__hint">
                    ...
                  </p>

                </div>
              `;
            }

            const rowsHtml =
              list
                .map(
                  row => `
                    <tr>

                      <td>
                        ${esc(
                          fmt(
                            row.zoneLabel
                          )
                        )}
                      </td>

                      <td
                        class="team-col"
                        title="${esc(
                          row.fullName
                        )}"
                      >
                        ${esc(
                          fmt(
                            row.team
                          )
                        )}
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
                  `
                )
                .join("");

            return `
              <div class="live-zone card">

                <div class="live-zone-title">

                  <h3 style="margin:0;">
                    Зона ${esc(zone)}
                  </h3>

                  <span class="badge badge--warn">
                    ${esc(
                      participantCountText(
                        list.length
                      )
                    )}
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
                        <th>
                          Зона
                        </th>

                        <th>
                          ${esc(
                            participantColumnTitle()
                          )}
                        </th>

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
          }
        )
        .join("");
  }

  const renderZonesDebounced =
    debounce(
      renderZones,
      70
    );

  // =========================================================
  // STAGE TEAMS / PARTICIPANTS
  // =========================================================

  function parseZoneKey(
    drawKey,
    drawZone,
    drawSector
  ) {
    const rawDrawKey =
      norm(
        drawKey
      )
        .toUpperCase();

    let zone =
      norm(
        drawZone
      )
        .toUpperCase();

    let sector =
      0;

    if (
      rawDrawKey
    ) {
      const match =
        rawDrawKey.match(
          /^([ABC])(\d+)$/
        );

      if (
        match
      ) {
        zone =
          match[1];

        sector =
          Number(
            match[2]
          );
      }
    }

    /*
     * Підтримка:
     * 7
     * або A7
     */
    if (
      !sector
    ) {
      const rawSector =
        norm(
          drawSector
        )
          .toUpperCase();

      const sectorMatch =
        rawSector.match(
          /^(?:[ABC])?(\d+)$/
        );

      if (
        sectorMatch
      ) {
        sector =
          Number(
            sectorMatch[1]
          );
      }
    }

    if (
      ![
        "A",
        "B",
        "C"
      ].includes(
        zone
      )
    ) {
      zone =
        rawDrawKey &&
        /^[ABC]/.test(
          rawDrawKey
        )
          ? rawDrawKey[0]
          : "";
    }

    const label =
      rawDrawKey
        ? rawDrawKey
        : (
            zone &&
            sector
              ? `${zone}${sector}`
              : zone ||
                "—"
          );

    const zoneOrder =
      zone === "A"
        ? 1
        : zone === "B"
          ? 2
          : zone === "C"
            ? 3
            : 9;

    const sortKey =
      zoneOrder *
        100 +
      (
        Number.isFinite(
          sector
        ) &&
        sector > 0
          ? sector
          : 99
      );

    return {
      zone,
      sector,
      label,
      sortKey
    };
  }

  function buildRegRowsFromStageTeams(
    teamsRaw
  ) {
    const rows =
      [];

    (
      teamsRaw ||
      []
    ).forEach(
      team => {
        /*
         * Визначаємо SOLO
         * по самому row,
         * а не тільки по competition.
         */
        const rowSolo =
          normLower(
            team.entryType
          ) ===
            ENTRY_SOLO ||
          isSoloEntry();

        const teamId =
          norm(
            team.teamId
          );

        const uid =
          norm(
            team.uid ||
            team.participantUid ||
            team.userId ||
            team.registeredByUid ||
            (
              rowSolo
                ? team.entityId
                : ""
            ) ||
            ""
          );

        const entityId =
          rowSolo
            ? (
                uid ||
                norm(
                  team.entityId
                ) ||
                teamId
              )
            : (
                teamId ||
                norm(
                  team.entityId
                )
              );

        if (
          !entityId
        ) {
          return;
        }

        const hasDraw =
          Boolean(
            team.drawKey ||
            team.drawZone ||
            team.drawSector ||
            team.zone ||
            team.sector
          );

        if (
          !hasDraw
        ) {
          return;
        }

        const parsed =
          parseZoneKey(
            team.drawKey,
            team.drawZone ||
            team.zone,
            team.drawSector ??
            team.sector
          );

        if (
          ![
            "A",
            "B",
            "C"
          ].includes(
            parsed.zone
          )
        ) {
          return;
        }

        rows.push({
          entityId,

          entryType:
            rowSolo
              ? ENTRY_SOLO
              : ENTRY_TEAM,

          uid:
            rowSolo
              ? uid
              : "",

          participantUid:
            norm(
              team.participantUid
            ),

          userId:
            norm(
              team.userId
            ),

          registeredByUid:
            norm(
              team.registeredByUid
            ),

          participantName:
            rowSolo
              ? normalizeLegacySoloName(
                  team.participantName ||
                  team.fullName ||
                  team.userName ||
                  ""
                )
              : "",

          firstName:
            norm(
              team.firstName
            ),

          lastName:
            norm(
              team.lastName
            ),

          displayName:
            norm(
              team.displayName
            ),

          captain:
            norm(
              team.captain
            ),

          /*
           * SOLO:
           * teamId не identity.
           *
           * Але legacy value
           * залишаємо alias.
           */
          teamId:
            rowSolo
              ? teamId
              : entityId,

          teamName:
            rowSolo
              ? ""
              : norm(
                  team.teamName ||
                  team.team
                ),

          zone:
            parsed.zone,

          sector:
            parsed.sector,

          zoneLabel:
            parsed.label,

          drawKey:
            parsed.label,

          drawZone:
            parsed.zone,

          drawSector:
            parsed.sector,

          sortKey:
            parsed.sortKey
        });
      }
    );

    rows.sort(
      (
        a,
        b
      ) =>
        a.sortKey -
        b.sortKey
    );

    return rows;
  }

  // =========================================================
  // CLASSIC ZONE REFRESH
  // =========================================================

  function hasCurrentStageZones() {
    return (
      Boolean(
        currentStageZonesData
          ?.A?.length
      ) ||
      Boolean(
        currentStageZonesData
          ?.B?.length
      ) ||
      Boolean(
        currentStageZonesData
          ?.C?.length
      )
    );
  }

  function refreshClassicZones() {
    const hasStageZones =
      hasCurrentStageZones();

    /*
     * SOLO завжди будуємо
     * з regRows + weighings.
     *
     * Саме тому жереб видно
     * ДО першого зважування.
     */
    needAutoZones =
      isSoloEntry() ||
      !hasStageZones;

    /*
     * Старий TEAM із готовими zones
     * залишається без змін.
     */
    if (
      !isSoloEntry() &&
      hasStageZones
    ) {
      renderZonesDebounced(
        currentStageZonesData,
        currentStageTeamsRaw
      );

      return;
    }

    /*
     * КЛЮЧОВЕ:
     *
     * не чекаємо allWeighDocs.
     *
     * Якщо є regRows —
     * показуємо жереб одразу.
     */
    if (
      regRows.length
    ) {
      renderZonesDebounced(
        buildZonesAuto(
          regRows,
          allWeighDocs
        ),
        currentStageTeamsRaw
      );

      return;
    }

    renderZonesDebounced(
      {
        A: [],
        B: [],
        C: []
      },
      currentStageTeamsRaw
    );
  }

  // =========================================================
  // CLASSIC FINAL BIG FISH
  // =========================================================

  function renderFinalBigFishTables() {
    if (
      !finalBigFishBox
    ) {
      return;
    }

    if (
      isThreeTablesFormat()
    ) {
      finalBigFishBox
        .style
        .display =
        "none";

      return;
    }

    finalBigFishBox
      .style
      .display =
      "";

    const entityIds =
      new Set(
        regRows
          .map(
            row =>
              primaryEntityId(
                row
              )
          )
          .filter(
            Boolean
          )
      );

    if (
      !entityIds.size
    ) {
      finalBigFishBox
        .innerHTML = `
          <div class="muted">
            ${esc(
              participantWaitingText()
            )}
          </div>
        `;

      return;
    }

    const w4Done =
      new Set();

    const bigCarp =
      [];

    const bigAmur =
      [];

    allWeighDocs
      .forEach(
        doc => {
          const participant =
            findRegRowForWeighDoc(
              doc
            );

          if (
            !participant
          ) {
            return;
          }

          const participantId =
            primaryEntityId(
              participant
            );

          if (
            Number(
              doc.weighNo
            ) ===
              4 &&
            participantId
          ) {
            w4Done.add(
              participantId
            );
          }

          const fish =
            normalizeFishArray(
              doc.weights ||
              []
            );

          fish.forEach(
            item => {
              const row = {
                teamName:
                  displayName(
                    participant
                  ),

                fullName:
                  fullDisplayName(
                    participant
                  ),

                zoneLabel:
                  participant
                    ?.zoneLabel ||
                  doc.zone ||
                  "—",

                kg:
                  Number(
                    item.kg ||
                    0
                  )
              };

              if (
                item.fishType ===
                  "amur" ||
                item.isAmur ===
                  true
              ) {
                bigAmur.push(
                  row
                );

              } else {
                bigCarp.push(
                  row
                );
              }
            }
          );
        }
      );

    if (
      w4Done.size <
      entityIds.size
    ) {
      finalBigFishBox
        .innerHTML = `
          <div class="muted">
            Big Fish Короп / Амур зʼявиться
            після завершення W4.
            Готово W4:
            ${w4Done.size}/${entityIds.size}
          </div>
        `;

      return;
    }

    const carpWinner =
      bigCarp
        .sort(
          (
            a,
            b
          ) =>
            b.kg -
            a.kg
        )[0];

    const amurWinner =
      bigAmur
        .sort(
          (
            a,
            b
          ) =>
            b.kg -
            a.kg
        )[0];

    finalBigFishBox
      .innerHTML = `
        <div class="final-bigfish-line">

          <strong>
            Big Fish Короп
          </strong>

          <span>
            ${
              carpWinner
                ? `${esc(
                    fmt(
                      carpWinner.zoneLabel
                    )
                  )} · ` +
                  `<span title="${esc(
                    carpWinner.fullName
                  )}">${esc(
                    fmt(
                      carpWinner.teamName
                    )
                  )}</span> · ` +
                  `${esc(
                    kgShort(
                      carpWinner.kg
                    )
                  )} кг`
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

          <strong>
            Big Fish Амур
          </strong>

          <span>
            ${
              amurWinner
                ? `${esc(
                    fmt(
                      amurWinner.zoneLabel
                    )
                  )} · ` +
                  `<span title="${esc(
                    amurWinner.fullName
                  )}">${esc(
                    fmt(
                      amurWinner.teamName
                    )
                  )}</span> · ` +
                  `${esc(
                    kgShort(
                      amurWinner.kg
                    )
                  )} кг`
                : "немає даних"
            }
          </span>

        </div>
      `;
  }

  // =========================================================
  // W1-W4
  // =========================================================

  function setWeighButtons(
    activeKey
  ) {
    const map = {
      W1:
        wBtn1,

      W2:
        wBtn2,

      W3:
        wBtn3,

      W4:
        wBtn4
    };

    Object.entries(
      map
    ).forEach(
      (
        [
          key,
          button
        ]
      ) => {
        if (
          !button
        ) {
          return;
        }

        button.classList
          .toggle(
            "btn--accent",
            key ===
            activeKey
          );

        button.classList
          .toggle(
            "btn--ghost",
            key !==
            activeKey
          );
      }
    );
  }

  function setActiveWeigh(
    number
  ) {
    const parsed =
      Number(
        number
      );

    currentWeighNo =
      parsed >= 1 &&
      parsed <= 4
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
    if (
      !weighTableEl
    ) {
      return;
    }

    if (
      !regRows.length
    ) {
      weighTableEl
        .innerHTML = `
          <thead>
            <tr>
              <th>
                Зона
              </th>

              <th>
                ${esc(
                  participantColumnTitle()
                )}
              </th>

              <th>
                🐟1
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td colspan="3">
                ${esc(
                  participantWaitingText()
                )}
              </td>
            </tr>
          </tbody>
        `;

      return;
    }

    const rows =
      regRows.map(
        row => {
          const weights =
            findWeightsForRow(
              row
            );

          return {
            zoneLabel:
              row.zoneLabel,

            displayName:
              displayName(
                row
              ),

            fullDisplayName:
              fullDisplayName(
                row
              ),

            fish:
              normalizeFishArray(
                weights
              )
          };
        }
      );

    const maxFish =
      Math.max(
        1,
        ...rows.map(
          row =>
            row.fish.length
        )
      );

    const fishHeaders =
      Array.from(
        {
          length:
            maxFish
        },
        (
          _,
          index
        ) => `
          <th class="fish-th">
            🐟${index + 1}
          </th>
        `
      ).join("");

    const bodyHtml =
      rows.map(
        row => {
          const cells =
            [];

          for (
            let index = 0;
            index < maxFish;
            index++
          ) {
            const fish =
              row.fish[
                index
              ];

            cells.push(`
              <td class="fish-td">
                ${
                  fish
                    ? fishCellHTML(
                        fish
                      )
                    : "—"
                }
              </td>
            `);
          }

          return `
            <tr>

              <td>
                ${esc(
                  fmt(
                    row.zoneLabel
                  )
                )}
              </td>

              <td
                class="team-col"
                title="${esc(
                  row.fullDisplayName
                )}"
              >
                ${esc(
                  fmt(
                    row.displayName
                  )
                )}
              </td>

              ${cells.join("")}

            </tr>
          `;
        }
      )
      .join("");

    weighTableEl
      .innerHTML = `
        <thead>
          <tr>

            <th>
              Зона
            </th>

            <th>
              ${esc(
                participantColumnTitle()
              )}
            </th>

            ${fishHeaders}

          </tr>
        </thead>

        <tbody>
          ${bodyHtml}
        </tbody>
      `;
  }

  const renderWeighDebounced =
    debounce(
      renderWeighTable,
      40
    );

  function startWeighingsFor(
    weighNo
  ) {
    if (
      !db ||
      !activeCompId ||
      !activeStageId
    ) {
      return;
    }

    if (
      unsubWeigh
    ) {
      unsubWeigh();

      unsubWeigh =
        null;
    }

    weighByTeam =
      new Map();

    unsubWeigh =
      db
        .collection(
          "weighings"
        )
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
          Number(
            weighNo
          )
        )
        .where(
          "status",
          "==",
          "submitted"
        )
        .onSnapshot(
          snapshot => {
            const map =
              new Map();

            snapshot.forEach(
              docSnap => {
                const data =
                  docSnap.data() ||
                  {};

                const ids =
                  entityCandidates(
                    data
                  );

                if (
                  !ids.length
                ) {
                  return;
                }

                const weights =
                  normalizeFishArray(
                    data.weights ||
                    []
                  );

                ids.forEach(
                  id => {
                    map.set(
                      id,
                      weights
                    );
                  }
                );
              }
            );

            weighByTeam =
              map;

            renderWeighDebounced();
          },

          error => {
            console.error(
              "weighings snapshot error:",
              error
            );
          }
        );

    if (
      weighInfoEl
    ) {
      weighInfoEl.textContent =
        `${currentWeighKey} — список риб по секторах`;
    }
  }

  // =========================================================
  // ALL WEIGHINGS
  // =========================================================

  function startAllWeighingsSub() {
    if (
      !db ||
      !activeCompId ||
      !activeStageId
    ) {
      return;
    }

    if (
      unsubAllWeigh
    ) {
      unsubAllWeigh();

      unsubAllWeigh =
        null;
    }

    unsubAllWeigh =
      db
        .collection(
          "weighings"
        )
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
            const docs =
              [];

            snapshot.forEach(
              docSnap => {
                docs.push({
                  _id:
                    docSnap.id,

                  ...(
                    docSnap.data() ||
                    {}
                  )
                });
              }
            );

            allWeighDocs =
              docs;

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
                currentStageTeamsRaw
              );
            }

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

  // =========================================================
  // STAGE MATCH
  // =========================================================

  function stageMatches(
    rowStageId,
    stageParam
  ) {
    const rowStage =
      norm(
        rowStageId
      ) ||
      "main";

    const wanted =
      norm(
        stageParam
      ) ||
      "main";

    const wantedRaw =
      wanted.replace(
        /^stage-/,
        ""
      );

    const rowRaw =
      rowStage.replace(
        /^stage-/,
        ""
      );

    return (
      rowStage ===
        wanted ||
      rowStage ===
        `stage-${wantedRaw}` ||
      rowRaw ===
        wantedRaw ||
      (
        wanted ===
          "main" &&
        rowStage ===
          "main"
      )
    );
  }

  // =========================================================
  // PUBLIC PARTICIPANTS — SOLO FALLBACK
  // =========================================================

  function stopPublicParticipantsSub() {
    if (
      unsubPublicParticipants
    ) {
      unsubPublicParticipants();

      unsubPublicParticipants =
        null;
    }

    publicSoloNameByUid =
      new Map();

    publicSoloNameByTeamId =
      new Map();

    publicSoloRows =
      [];
  }

  function startPublicParticipantsSub(
    compId
  ) {
    stopPublicParticipantsSub();

    if (
      !compId
    ) {
      return;
    }

    unsubPublicParticipants =
      db
        .collection(
          "public_participants"
        )
        .where(
          "competitionId",
          "==",
          compId
        )
        .onSnapshot(
          snapshot => {
            const uidMap =
              new Map();

            const teamMap =
              new Map();

            const rows =
              [];

            snapshot.forEach(
              docSnap => {
                const data =
                  docSnap.data() ||
                  {};

                if (
                  !stageMatches(
                    data.stageId,
                    activeStageId
                  )
                ) {
                  return;
                }

                const status =
                  normLower(
                    data.status
                  );

                /*
                 * Якщо status присутній —
                 * беремо тільки confirmed.
                 */
                if (
                  status &&
                  status !==
                    "confirmed"
                ) {
                  return;
                }

                const entryType =
                  normLower(
                    data.entryType
                  );

                /*
                 * Canonical SOLO,
                 * __solo__ doc,
                 * або legacy row
                 * у SOLO competition.
                 */
                const looksSolo =
                  entryType ===
                    ENTRY_SOLO ||
                  docSnap.id.includes(
                    "__solo__"
                  ) ||
                  isSoloEntry();

                if (
                  !looksSolo
                ) {
                  return;
                }

                let uid =
                  norm(
                    data.uid ||
                    data.participantUid ||
                    data.userId ||
                    data.registeredByUid ||
                    data.entityId ||
                    ""
                  );

                if (
                  !uid &&
                  docSnap.id.includes(
                    "__solo__"
                  )
                ) {
                  uid =
                    norm(
                      docSnap.id
                        .split(
                          "__solo__"
                        )
                        .pop()
                    );
                }

                const teamId =
                  norm(
                    data.teamId
                  );

                const name =
                  canonicalSoloNameFromData(
                    data
                  );

                if (
                  name
                ) {
                  if (
                    uid
                  ) {
                    uidMap.set(
                      uid,
                      name
                    );
                  }

                  if (
                    teamId
                  ) {
                    teamMap.set(
                      teamId,
                      name
                    );
                  }
                }

                /*
                 * PUBLIC може бути
                 * резервним джерелом жеребу,
                 * якщо stageResults ще
                 * не встиг приїхати.
                 */
                const hasDraw =
                  Boolean(
                    data.drawKey ||
                    data.drawZone ||
                    data.drawSector ||
                    data.zone ||
                    data.sector
                  );

                if (
                  !hasDraw
                ) {
                  return;
                }

                const entityId =
                  uid ||
                  norm(
                    data.entityId
                  ) ||
                  docSnap.id;

                rows.push({
                  _id:
                    docSnap.id,

                  entryType:
                    ENTRY_SOLO,

                  entityId,

                  uid:
                    uid ||
                    entityId,

                  participantName:
                    name ||
                    "Учасник",

                  firstName:
                    norm(
                      data.firstName
                    ),

                  lastName:
                    norm(
                      data.lastName
                    ),

                  displayName:
                    norm(
                      data.displayName
                    ),

                  teamId,

                  teamName:
                    "",

                  drawKey:
                    norm(
                      data.drawKey
                    ),

                  drawZone:
                    norm(
                      data.drawZone ||
                      data.zone
                    ),

                  drawSector:
                    data.drawSector ??
                    data.sector ??
                    null,

                  zone:
                    norm(
                      data.zone ||
                      data.drawZone
                    ),

                  sector:
                    data.sector ??
                    data.drawSector ??
                    null
                });
              }
            );

            publicSoloNameByUid =
              uidMap;

            publicSoloNameByTeamId =
              teamMap;

            publicSoloRows =
              rows;

            /*
             * stageResults головний.
             *
             * PUBLIC rows —
             * тільки fallback.
             */
            if (
              currentStageTeamsRaw.length
            ) {
              regRows =
                buildRegRowsFromStageTeams(
                  currentStageTeamsRaw
                );

            } else if (
              publicSoloRows.length
            ) {
              regRows =
                buildRegRowsFromStageTeams(
                  publicSoloRows
                );
            }

            refreshClassicZones();
            renderWeighDebounced();
            renderFinalBigFishTables();
          },

          error => {
            console.warn(
              "public_participants snapshot error:",
              error
            );
          }
        );
  }

  // =========================================================
  // STAGE RESULTS
  // =========================================================

  function stopStageSub() {
    if (
      unsubStage
    ) {
      unsubStage();

      unsubStage =
        null;
    }
  }

  function startStageSub(
    docId
  ) {
    stopStageSub();

    if (
      !docId
    ) {
      showError(
        "Нема активного етапу (settings/app)."
      );

      return;
    }

    unsubStage =
      db
        .collection(
          "stageResults"
        )
        .doc(
          docId
        )
        .onSnapshot(
          snapshot => {
            try {
              /*
               * Якщо stageResults
               * ще не створився,
               * SOLO жереб можемо
               * показати з public mirror.
               */
              if (
                !snapshot.exists
              ) {
                if (
                  stageEl
                ) {
                  stageEl.textContent =
                    docId;
                }

                if (
                  updatedEl
                ) {
                  updatedEl.textContent =
                    "";
                }

                currentStageTeamsRaw =
                  [];

                currentStageZonesData = {
                  A: [],
                  B: [],
                  C: []
                };

                regRows =
                  publicSoloRows.length
                    ? buildRegRowsFromStageTeams(
                        publicSoloRows
                      )
                    : [];

                refreshClassicZones();

                renderWeighDebounced();
                renderFinalBigFishTables();
                renderThreeTablesDebounced();

                startAllWeighingsSub();

                showContent();

                return;
              }

              const data =
                snapshot.data() ||
                {};

              /*
               * Дуже важливо:
               *
               * draw_admin.js вже записує
               * entryType у stageResults.
               *
               * Тому можемо визначити SOLO
               * одразу, не чекаючи competitions.
               */
              const stageEntryType =
                normLower(
                  data.entryType
                );

              if (
                stageEntryType ===
                  ENTRY_SOLO ||
                stageEntryType ===
                  ENTRY_TEAM
              ) {
                activeEntryType =
                  stageEntryType;
              }

              const stageName =
                data.stageName ||
                data.stage ||
                data.title ||
                docId;

              if (
                stageEl
              ) {
                stageEl.textContent =
                  stageName;
              }

              const updatedAt =
                data.updatedAt ||
                data.updated ||
                data.ts ||
                null;

              if (
                updatedEl
              ) {
                updatedEl.textContent =
                  `Оновлено: ${fmtTs(
                    updatedAt
                  )}`;
              }

              const zonesData =
                data.zones || {
                  A: [],
                  B: [],
                  C: []
                };

              const teamsRaw =
                Array.isArray(
                  data.teams
                )
                  ? data.teams
                  : [];

              currentStageTeamsRaw =
                teamsRaw;

              currentStageZonesData =
                zonesData;

              /*
               * stageResults — основа.
               *
               * public_participants —
               * тільки якщо teams[]
               * реально порожній.
               */
              if (
                teamsRaw.length
              ) {
                regRows =
                  buildRegRowsFromStageTeams(
                    teamsRaw
                  );

              } else if (
                publicSoloRows.length
              ) {
                regRows =
                  buildRegRowsFromStageTeams(
                    publicSoloRows
                  );

              } else {
                regRows =
                  [];
              }

              applyFormatVisibility();

              refreshClassicZones();

              renderWeighDebounced();
              renderFinalBigFishTables();
              renderThreeTablesDebounced();

              startAllWeighingsSub();

              showContent();

            } catch (
              error
            ) {
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

  // =========================================================
  // COMPETITION FORMAT + ENTRY TYPE
  // =========================================================

  function stopCompetitionSub() {
    if (
      unsubCompetition
    ) {
      unsubCompetition();

      unsubCompetition =
        null;
    }
  }

  function startCompetitionSub(
    compId
  ) {
    stopCompetitionSub();

    if (
      !compId
    ) {
      activeFormat =
        FORMAT_CLASSIC;

      activeEntryType =
        ENTRY_TEAM;

      applyFormatVisibility();

      refreshClassicZones();
      renderWeighDebounced();
      renderFinalBigFishTables();
      renderThreeTablesDebounced();

      return;
    }

    unsubCompetition =
      db
        .collection(
          "competitions"
        )
        .doc(
          compId
        )
        .onSnapshot(
          snapshot => {
            try {
              const competition =
                snapshot.exists
                  ? snapshot.data() ||
                    {}
                  : {};

              const nextFormat =
                resolveCompetitionFormat(
                  competition
                );

              const nextEntryType =
                resolveCompetitionEntryType(
                  competition
                );

              const formatChanged =
                nextFormat !==
                activeFormat;

              const entryTypeChanged =
                nextEntryType !==
                activeEntryType;

              activeFormat =
                nextFormat;

              activeEntryType =
                nextEntryType;

              /*
               * Якщо спочатку public snapshot
               * прийшов як legacy TEAM,
               * після визначення SOLO
               * перечитуємо public mirror.
               */
              if (
                entryTypeChanged &&
                activeEntryType ===
                  ENTRY_SOLO
              ) {
                startPublicParticipantsSub(
                  compId
                );
              }

              if (
                formatChanged ||
                entryTypeChanged
              ) {
                console.info(
                  "STOLAR CARP Live:",
                  {
                    format:
                      activeFormat,

                    entryType:
                      activeEntryType
                  }
                );
              }

              /*
               * Competition може
               * завантажитись ПІСЛЯ
               * stageResults.
               *
               * Перебудовуємо identity.
               */
              if (
                currentStageTeamsRaw.length
              ) {
                regRows =
                  buildRegRowsFromStageTeams(
                    currentStageTeamsRaw
                  );

              } else if (
                isSoloEntry() &&
                publicSoloRows.length
              ) {
                regRows =
                  buildRegRowsFromStageTeams(
                    publicSoloRows
                  );
              }

              applyFormatVisibility();

              refreshClassicZones();

              renderWeighDebounced();
              renderFinalBigFishTables();
              renderThreeTablesDebounced();

            } catch (
              error
            ) {
              console.error(
                "competition format error:",
                error
              );

              activeFormat =
                FORMAT_CLASSIC;

              activeEntryType =
                ENTRY_TEAM;

              applyFormatVisibility();

              refreshClassicZones();
              renderWeighDebounced();
              renderFinalBigFishTables();
            }
          },

          error => {
            console.error(
              "competition snapshot error:",
              error
            );

            activeFormat =
              FORMAT_CLASSIC;

            activeEntryType =
              ENTRY_TEAM;

            applyFormatVisibility();

            refreshClassicZones();
            renderWeighDebounced();
            renderFinalBigFishTables();
          }
        );
  }

  // =========================================================
  // SETTINGS / APP
  // =========================================================

  function stageDocIdFromApp(
    app
  ) {
    const explicitKey =
      app?.activeKey ||
      app?.activeStageResultsId;

    if (
      explicitKey
    ) {
      return String(
        explicitKey
      );
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

    if (
      compId &&
      stageId
    ) {
      return (
        `${compId}__${stageId}`
      );
    }

    return "";
  }

  function readActiveIdsFromApp(
    app
  ) {
    activeCompId =
      String(
        app?.activeCompetitionId ||
        app?.activeCompetition ||
        app?.competitionId ||
        ""
      );

    activeStageId =
      String(
        app?.activeStageId ||
        app?.stageId ||
        "stage-1"
      );
  }

  function stopWeighSubs() {
    if (
      unsubWeigh
    ) {
      unsubWeigh();

      unsubWeigh =
        null;
    }

    if (
      unsubAllWeigh
    ) {
      unsubAllWeigh();

      unsubAllWeigh =
        null;
    }
  }

  // =========================================================
  // INIT
  // =========================================================

  if (
    !db
  ) {
    showError(
      "Firebase init не завантажився."
    );

    return;
  }

  ensureThreeTablesUI();
  applyFormatVisibility();

  let previousStageKey =
    "";

  db
    .collection(
      "settings"
    )
    .doc(
      "app"
    )
    .onSnapshot(
      snapshot => {
        try {
          const app =
            snapshot.exists
              ? snapshot.data() ||
                {}
              : {};

          readActiveIdsFromApp(
            app
          );

          activeDocId =
            stageDocIdFromApp(
              app
            );

          const stageKey =
            `${activeCompId}||${activeStageId}`;

          if (
            stageKey ===
            previousStageKey
          ) {
            return;
          }

          previousStageKey =
            stageKey;

          stopWeighSubs();
          stopStageSub();
          stopCompetitionSub();
          stopPublicParticipantsSub();

          allWeighDocs =
            [];

          weighByTeam =
            new Map();

          regRows =
            [];

          currentStageTeamsRaw =
            [];

          currentStageZonesData = {
            A: [],
            B: [],
            C: []
          };

          needAutoZones =
            false;

          /*
           * Безпечний default,
           * поки не прийде
           * competition/stageResults.
           */
          activeFormat =
            FORMAT_CLASSIC;

          activeEntryType =
            ENTRY_TEAM;

          applyFormatVisibility();

          /*
           * Усі realtime джерела
           * стартують паралельно.
           */
          startCompetitionSub(
            activeCompId
          );

          startPublicParticipantsSub(
            activeCompId
          );

          startStageSub(
            activeDocId
          );

          setActiveWeigh(
            currentWeighNo
          );

        } catch (
          error
        ) {
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

  if (
    wBtn1
  ) {
    wBtn1.addEventListener(
      "click",
      () =>
        setActiveWeigh(
          1
        )
    );
  }

  if (
    wBtn2
  ) {
    wBtn2.addEventListener(
      "click",
      () =>
        setActiveWeigh(
          2
        )
    );
  }

  if (
    wBtn3
  ) {
    wBtn3.addEventListener(
      "click",
      () =>
        setActiveWeigh(
          3
        )
    );
  }

  if (
    wBtn4
  ) {
    wBtn4.addEventListener(
      "click",
      () =>
        setActiveWeigh(
          4
        )
    );
  }

  setActiveWeigh(
    1
  );

})();

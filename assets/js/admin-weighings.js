// assets/js/admin-weighings.js
// STOLAR CARP • Адмін зважування + архів + очищення LIVE
//
// VERSION 2026.10.08
//
// TEAM + SOLO
// Фізичні сектори водойми
// Короп + Амур
// LIVE + seasonResults + seasonRating
//
// Фізичний сектор:
//   lakeId
//   lakeSectorNumber
//   lakeSectorId
//
// Турнірний сектор:
//   drawZone
//   drawSector
//   drawKey
//
// Джерела фізичного сектора:
//   1. registrations
//   2. sectorMaps/{year}/stages/{stageDocId}
//
// Фізичні сектори не визначаються за A1/B1/C1 автоматично.

(function () {
  "use strict";

  const auth = window.scAuth;
  const db = window.scDb;
  const fb = window.firebase;

  const $ = id => document.getElementById(id);

  const stageSelect = $("stageSelect");
  const wSelect = $("wSelect");
  const msgEl = $("msg");
  const dbgEl = $("debug");
  const zonesWrap = $("zonesWrap");
  const archiveSection = $("archiveSection");
  const seasonYearInp = $("seasonYear");
  const btnArchive = $("btnArchive");
  const btnClearLive = $("btnClearLive");
  const archiveMsg = $("archiveMsg");

  const ENTRY_TEAM = "team";
  const ENTRY_SOLO = "solo";

  const DEFAULT_LAKE_ID = "lelehivka";

  let currentTeams = [];
  let currentCompetitionKind = "unknown";
  let currentEntryType = ENTRY_TEAM;
  let currentStageYear = "";

  const competitionInfoCache = new Map();
  const userNameCache = new Map();
  const sectorMapCache = new Map();

  let tableLoadId = 0;
  let operationBusy = false;

  // =====================================================
  // HELPERS
  // =====================================================

  function norm(value) {
    return String(value ?? "").trim();
  }

  function normLower(value) {
    return norm(value).toLowerCase();
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function num(value) {
    const n = Number(
      String(value ?? "").replace(",", ".")
    );

    return Number.isFinite(n) ? n : 0;
  }

  function firstDefined(...values) {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return "";
  }

  function timestamp() {
    return fb.firestore.FieldValue.serverTimestamp();
  }

  function currentUid() {
    return auth.currentUser?.uid || "admin";
  }

  function isSoloMode() {
    return currentEntryType === ENTRY_SOLO;
  }

  function isSoloTeam(team) {
    return normLower(team?.entryType) === ENTRY_SOLO;
  }

  function entityLabel() {
    return isSoloMode() ? "Учасник" : "Команда";
  }

  function entityCountLabel(count) {
    return isSoloMode()
      ? `учасників: ${count}`
      : `команд: ${count}`;
  }

  function entityIdOf(team) {
    if (!team) return "";

    if (isSoloTeam(team)) {
      return norm(
        team.entityId ||
        team.uid ||
        team.regId
      );
    }

    return norm(
      team.entityId ||
      team.teamId
    );
  }

  function setMsg(text, ok = true) {
    if (!msgEl) return;

    msgEl.textContent = text || "";
    msgEl.className =
      "muted " + (text ? (ok ? "ok" : "err") : "");
  }

  function setDbg(text) {
    if (dbgEl) {
      dbgEl.textContent = text || "";
    }
  }

  function setArchiveMsg(text, ok = true) {
    if (!archiveMsg) return;

    archiveMsg.textContent = text || "";
    archiveMsg.className =
      "muted " + (text ? (ok ? "ok" : "err") : "");
  }

  // =====================================================
  // FISH
  // =====================================================

  function fishKg(fish) {
    if (
      typeof fish === "number" ||
      typeof fish === "string"
    ) {
      return num(fish);
    }

    return num(
      firstDefined(
        fish?.kg,
        fish?.weight,
        fish?.value
      )
    );
  }

  function fishIsAmur(fish) {
    if (!fish || typeof fish !== "object") {
      return false;
    }

    return (
      fish.isAmur === true ||
      fish.fishType === "amur" ||
      fish.type === "amur"
    );
  }

  function normalizeFishItem(fish) {
    const kg = fishKg(fish);

    if (kg <= 0) return null;

    const isAmur = fishIsAmur(fish);

    return {
      kg,
      fishType: isAmur ? "amur" : "carp",
      isAmur
    };
  }

  function normalizeFishArray(arr) {
    if (!Array.isArray(arr)) return [];

    return arr
      .map(normalizeFishItem)
      .filter(Boolean);
  }

  function fishStats(arr) {
    const fish = normalizeFishArray(arr);

    const carp = fish.filter(
      f => f.fishType === "carp"
    );

    const amur = fish.filter(
      f => f.fishType === "amur"
    );

    const sum = list =>
      list.reduce((s, f) => s + num(f.kg), 0);

    const max = list =>
      list.length
        ? Math.max(...list.map(f => num(f.kg)))
        : 0;

    return {
      fish,

      total: sum(fish),
      count: fish.length,

      bigFish: max(fish),
      bigCarp: max(carp),
      bigAmur: max(amur),

      carpCount: carp.length,
      amurCount: amur.length,

      carpWeight: sum(carp),
      amurWeight: sum(amur)
    };
  }

  // =====================================================
  // COMPETITION
  // =====================================================

  function detectCompetitionKind(compId, data) {
    const c = data || {};

    if (c.isSeason === true) return "season";
    if (c.isOneoff === true) return "oneoff";

    const raw = normLower(
      c.type ||
      c.competitionType ||
      c.kind ||
      c.mode
    );

    if (
      ["season", "seasonal", "championship"]
        .includes(raw)
    ) {
      return "season";
    }

    if (
      ["oneoff", "one-off", "single", "standalone"]
        .includes(raw)
    ) {
      return "oneoff";
    }

    const id = normLower(compId);

    if (
      id.startsWith("season-") ||
      id.startsWith("season_")
    ) {
      return "season";
    }

    if (
      id.startsWith("oneoff-") ||
      id.startsWith("oneoff_")
    ) {
      return "oneoff";
    }

    return "unknown";
  }

  async function getCompetitionInfo(
    compId,
    force = false
  ) {
    const id = norm(compId);

    if (!id) {
      return {
        exists: false,
        data: {},
        kind: "unknown"
      };
    }

    if (!force && competitionInfoCache.has(id)) {
      return competitionInfoCache.get(id);
    }

    const snap = await db
      .collection("competitions")
      .doc(id)
      .get();

    const data = snap.exists
      ? snap.data() || {}
      : {};

    const info = {
      exists: snap.exists,
      data,
      kind: detectCompetitionKind(id, data)
    };

    competitionInfoCache.set(id, info);

    return info;
  }

  function eventKey(event, index) {
    return norm(
      event?.key ||
      event?.stageId ||
      event?.id ||
      `stage-${index + 1}`
    );
  }

  function eventTitle(event, index) {
    return norm(
      event?.name ||
      event?.title ||
      event?.label ||
      `Етап ${index + 1}`
    );
  }

  function findCompetitionEvent(
    competition,
    stageKey
  ) {
    const events = Array.isArray(competition?.events)
      ? competition.events
      : [];

    return events.find(
      (event, index) =>
        eventKey(event, index) === norm(stageKey)
    ) || null;
  }

  function resolveCompetitionEntryType(
    competition,
    stageKey
  ) {
    const c = competition || {};

    const event = findCompetitionEvent(
      c,
      stageKey
    );

    const key = normLower(
      event?.key ||
      event?.stageId ||
      event?.id ||
      stageKey
    );

    const title = normLower(
      event?.title ||
      event?.name ||
      event?.label
    );

    const isFinal =
      event?.isFinal === true ||
      key === "final" ||
      key.includes("фінал") ||
      title.includes("фінал");

    if (isFinal) return ENTRY_TEAM;

    const explicit = normLower(
      event?.entryType ||
      c.entryType
    );

    if (
      explicit === ENTRY_SOLO ||
      explicit === ENTRY_TEAM
    ) {
      return explicit;
    }

    const format = normLower(
      event?.format ||
      event?.engine?.baseFormat ||
      c.format ||
      c.engine?.baseFormat
    )
      .replace(/\s+/g, "")
      .replace(/_/g, "-");

    return format === "stalker-solo"
      ? ENTRY_SOLO
      : ENTRY_TEAM;
  }

  function configureCompetitionModeUI(kind) {
    currentCompetitionKind = kind || "unknown";

    if (btnArchive) {
      btnArchive.style.display =
        kind === "season" ? "" : "none";

      btnArchive.disabled =
        kind !== "season" || operationBusy;
    }

    if (seasonYearInp) {
      seasonYearInp.disabled =
        kind !== "season";
    }

    if (btnClearLive) {
      btnClearLive.disabled =
        kind === "unknown" || operationBusy;
    }
  }

  function showCompetitionModeHint() {
    if (currentCompetitionKind === "oneoff") {
      setArchiveMsg(
        "ℹ️ Одиночне змагання. Після завершення можна очистити LIVE. Сезонний рейтинг не змінюється.",
        true
      );

      return;
    }

    if (currentCompetitionKind === "unknown") {
      setArchiveMsg(
        "⚠️ Тип змагання невідомий. Архів та очищення LIVE заблоковані.",
        false
      );

      return;
    }

    setArchiveMsg("", true);
  }

  // =====================================================
  // PHYSICAL LAKE SECTORS
  // =====================================================

  function validLakeSectorNumber(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const n = Number(value);

    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > 9999
    ) {
      return null;
    }

    return n;
  }

  function lakeSectorId(number) {
    const n = validLakeSectorNumber(number);

    return n === null
      ? null
      : `sector-${n}`;
  }

  function normalizeLakeId(value) {
    return norm(value);
  }

  function normalizeDrawZone(value) {
    return norm(value).toUpperCase();
  }

  function normalizeDrawSector(value) {
    return norm(value);
  }

  function drawKeyOf(zone, sector) {
    const z = normalizeDrawZone(zone);
    const s = normalizeDrawSector(sector);

    if (!z || !s) return "";

    return `${z}${s}`;
  }

  function getStageYear(competition, fallback = "") {
    const value = firstDefined(
      competition?.seasonYear,
      competition?.year,
      fallback
    );

    return norm(value);
  }

  function lakeInfoFromRegistration(
    registration,
    competition
  ) {
    const r = registration || {};
    const c = competition || {};

    const number = validLakeSectorNumber(
      firstDefined(
        r.lakeSectorNumber,
        r.physicalSectorNumber,
        r.physicalSector,
        r.lakeSector?.number
      )
    );

    const lakeId = normalizeLakeId(
      firstDefined(
        r.lakeId,
        r.waterbodyId,
        r.lake?.id,
        c.lakeId,
        c.waterbodyId
      )
    );

    return {
      lakeId,
      lakeSectorNumber: number,
      lakeSectorId: lakeSectorId(number)
    };
  }

  function lakeInfoFromMapAssignment(
    assignment,
    fallbackLakeId
  ) {
    const a = assignment || {};

    const number = validLakeSectorNumber(
      firstDefined(
        a.lakeSectorNumber,
        a.physicalSectorNumber,
        a.physicalSector,
        a.lakeSectorId
          ? String(a.lakeSectorId)
              .replace(/^sector-/, "")
          : ""
      )
    );

    return {
      lakeId: normalizeLakeId(
        a.lakeId || fallbackLakeId
      ),
      lakeSectorNumber: number,
      lakeSectorId: lakeSectorId(number)
    };
  }

  function normalizeMapAssignments(mapData) {
    const data = mapData || {};

    const assignments = Array.isArray(
      data.assignments
    )
      ? data.assignments
      : [];

    const byDrawKey = new Map();

    assignments.forEach(assignment => {
      const key = norm(
        assignment.drawKey ||
        drawKeyOf(
          assignment.zone,
          assignment.sector
        )
      ).toUpperCase();

      if (!key) return;

      const lake = lakeInfoFromMapAssignment(
        assignment,
        data.lakeId
      );

      if (lake.lakeSectorNumber === null) {
        return;
      }

      byDrawKey.set(key, lake);
    });

    return {
      exists: true,
      status: norm(data.status),
      lakeId: norm(data.lakeId),
      byDrawKey
    };
  }

  async function loadSectorMap(
    seasonYear,
    stageDocId,
    force = false
  ) {
    const year = norm(seasonYear);
    const id = norm(stageDocId);

    if (!year || !id) {
      return {
        exists: false,
        status: "",
        lakeId: "",
        byDrawKey: new Map()
      };
    }

    const cacheKey = `${year}/${id}`;

    if (!force && sectorMapCache.has(cacheKey)) {
      return sectorMapCache.get(cacheKey);
    }

    const snap = await db
      .collection("sectorMaps")
      .doc(year)
      .collection("stages")
      .doc(id)
      .get();

    const result = snap.exists
      ? normalizeMapAssignments(snap.data())
      : {
          exists: false,
          status: "",
          lakeId: "",
          byDrawKey: new Map()
        };

    sectorMapCache.set(cacheKey, result);

    return result;
  }

  function resolveLakeSector(
    registration,
    competition,
    map,
    zone,
    sector
  ) {
    const fromRegistration =
      lakeInfoFromRegistration(
        registration,
        competition
      );

    const key = drawKeyOf(zone, sector);

    const fromMap =
      map?.byDrawKey?.get(key) || null;

    // Якщо сектор указано в реєстрації,
    // перевіряємо відповідність із картою.
    if (
      fromRegistration.lakeSectorNumber !== null
    ) {
      if (
        fromMap &&
        fromMap.lakeSectorNumber !==
          fromRegistration.lakeSectorNumber
      ) {
        throw new Error(
          `Конфлікт секторів ${key}: ` +
          `registrations = №${fromRegistration.lakeSectorNumber}, ` +
          `sectorMaps = №${fromMap.lakeSectorNumber}.`
        );
      }

      return {
        lakeId:
          fromRegistration.lakeId ||
          fromMap?.lakeId ||
          "",

        lakeSectorNumber:
          fromRegistration.lakeSectorNumber,

        lakeSectorId:
          fromRegistration.lakeSectorId,

        lakeSectorSource:
          "registration"
      };
    }

    if (fromMap) {
      return {
        ...fromMap,
        lakeSectorSource: "sectorMap"
      };
    }

    return {
      lakeId:
        fromRegistration.lakeId ||
        map?.lakeId ||
        "",

      lakeSectorNumber: null,
      lakeSectorId: null,
      lakeSectorSource: "unknown"
    };
  }

  function lakeFields(entity) {
    const number = validLakeSectorNumber(
      entity?.lakeSectorNumber
    );

    return {
      lakeId: norm(entity?.lakeId),
      lakeSectorNumber: number,
      lakeSectorId: lakeSectorId(number)
    };
  }

  function lakeSectorLabel(entity) {
    const number = validLakeSectorNumber(
      entity?.lakeSectorNumber
    );

    return number === null
      ? "Фізичний сектор: не визначено"
      : `Фізичний сектор водойми: №${number}`;
  }

  function checkDuplicatePhysicalSectors(rows) {
    const seen = new Map();

    for (const row of rows) {
      const lakeId = norm(row.lakeId);
      const number = validLakeSectorNumber(
        row.lakeSectorNumber
      );

      if (!lakeId || number === null) {
        continue;
      }

      const key = `${lakeId}/${number}`;
      const previous = seen.get(key);

      if (previous) {
        throw new Error(
          `Фізичний сектор №${number} (${lakeId}) ` +
          `призначено двічі: ${previous} і ` +
          `${row.zone}${row.sector}.`
        );
      }

      seen.set(
        key,
        `${row.zone}${row.sector}`
      );
    }
  }

  // =====================================================
  // AUTH
  // =====================================================

  async function requireAdmin(user) {
    const snap = await db
      .collection("users")
      .doc(user.uid)
      .get();

    return (
      snap.exists &&
      normLower(snap.data()?.role) === "admin"
    );
  }

  // =====================================================
  // SOLO NAMES
  // =====================================================

  function isPlaceholderParticipantName(value) {
    const v = normLower(value)
      .replace(/[.!]/g, "")
      .replace(/\s+/g, " ");

    return (
      !v ||
      [
        "учасник",
        "учасник команди",
        "participant",
        "player",
        "команда",
        "team",
        "користувач",
        "user",
        "—",
        "-"
      ].includes(v) ||
      /^учасник\s*\d*$/.test(v) ||
      /^participant\s*\d*$/.test(v)
    );
  }

  function validParticipantName(
    value,
    oldTeamName = ""
  ) {
    const name = norm(value);

    if (
      !name ||
      isPlaceholderParticipantName(name) ||
      name.includes("@")
    ) {
      return "";
    }

    if (
      oldTeamName &&
      normLower(name) === normLower(oldTeamName)
    ) {
      return "";
    }

    return name;
  }

  function canonicalParticipantNameFromObject(
    data,
    oldTeamName = ""
  ) {
    const d = data || {};

    const firstName = validParticipantName(
      d.firstName ||
      d.firstname ||
      d.first_name ||
      d.givenName,
      oldTeamName
    );

    const lastName = validParticipantName(
      d.lastName ||
      d.lastname ||
      d.last_name ||
      d.surname ||
      d.familyName,
      oldTeamName
    );

    return firstName && lastName
      ? `${lastName} ${firstName}`
      : "";
  }

  function legacyParticipantNameFromObject(
    data,
    oldTeamName = ""
  ) {
    const d = data || {};

    const candidates = [
      d.participantName,
      d.fullName,
      d.userName,
      d.name,
      d.displayName,
      d.captain
    ];

    for (const candidate of candidates) {
      const name = validParticipantName(
        candidate,
        oldTeamName
      );

      if (name) return name;
    }

    return "";
  }

  async function getUserNameByUid(uid) {
    const id = norm(uid);

    if (!id) return "";

    if (userNameCache.has(id)) {
      return userNameCache.get(id);
    }

    let name = "";

    try {
      const snap = await db
        .collection("users")
        .doc(id)
        .get();

      if (snap.exists) {
        const user = snap.data() || {};

        name =
          canonicalParticipantNameFromObject(user) ||
          legacyParticipantNameFromObject(user);
      }
    } catch (error) {
      console.warn(
        "[admin-weighings] User:",
        id,
        error
      );
    }

    userNameCache.set(id, name);

    return name;
  }

  async function resolveSoloParticipantName(
    registration,
    uid
  ) {
    const r = registration || {};

    const oldTeamName = norm(
      r.teamName || r.team
    );

    const canonical =
      canonicalParticipantNameFromObject(
        r,
        oldTeamName
      );

    if (canonical) return canonical;

    const profile = validParticipantName(
      await getUserNameByUid(uid),
      oldTeamName
    );

    if (profile) return profile;

    return (
      legacyParticipantNameFromObject(
        r,
        oldTeamName
      ) ||
      "Учасник"
    );
  }

  // =====================================================
  // IDS
  // =====================================================

  function parseStageValue(value) {
    const parts = norm(value).split("||");

    return {
      compId: norm(parts[0]),
      stageKey: norm(parts.slice(1).join("||"))
    };
  }

  function stageResultsId(compId, stageKey) {
    return `${compId}__${stageKey}`;
  }

  function weighingDocId(
    compId,
    stageKey,
    wNo,
    entityId
  ) {
    return (
      `${compId}||${stageKey}||` +
      `W${Number(wNo)}||${entityId}`
    );
  }

  function identityFields(team) {
    const entityId = entityIdOf(team);

    if (isSoloTeam(team)) {
      const participantName =
        validParticipantName(
          team.participantName || team.team
        ) || "Учасник";

      return {
        entryType: ENTRY_SOLO,
        entityId,
        uid: norm(team.uid || entityId),
        participantName,
        displayName: participantName,
        teamId: null,
        teamName: null,
        team: null
      };
    }

    return {
      entryType: ENTRY_TEAM,
      entityId,
      teamId: norm(team.teamId || entityId),
      teamName: norm(team.team) || "—",
      team: norm(team.team) || "—"
    };
  }

  // =====================================================
  // NEXT STAGE
  // =====================================================

  function fallbackNextStageKey(stageKey) {
    const match = norm(stageKey).match(
      /^(.*?)(\d+)$/
    );

    if (!match) return "";

    return `${match[1]}${Number(match[2]) + 1}`;
  }

  async function getNextStageInfo(
    compId,
    currentStageKey
  ) {
    const info = await getCompetitionInfo(
      compId,
      true
    );

    if (!info.exists) return null;

    const events = Array.isArray(info.data.events)
      ? info.data.events
      : [];

    if (events.length) {
      const stages = events.map(
        (event, index) => ({
          key: eventKey(event, index),
          title: eventTitle(event, index)
        })
      );

      const index = stages.findIndex(
        stage => stage.key === currentStageKey
      );

      if (index >= 0) {
        return stages[index + 1]
          ? {
              ...stages[index + 1],
              source: "events"
            }
          : null;
      }

      // Якщо events існують, але поточний
      // етап не знайдено, не вигадуємо наступний.
      throw new Error(
        `Етап ${currentStageKey} відсутній ` +
        `у competitions/${compId}.events.`
      );
    }

    const fallback = fallbackNextStageKey(
      currentStageKey
    );

    return fallback
      ? {
          key: fallback,
          title: fallback,
          source: "fallback"
        }
      : null;
  }

  // =====================================================
  // ACTIVE STAGE
  // =====================================================

  async function loadStages() {
    if (!stageSelect) return;

    stageSelect.innerHTML =
      `<option value="">— Завантаження… —</option>`;

    try {
      const appSnap = await db
        .collection("settings")
        .doc("app")
        .get();

      const app = appSnap.exists
        ? appSnap.data() || {}
        : {};

      const compId = norm(
        app.activeCompetitionId
      );

      const stageKey = norm(
        app.activeStageId
      );

      if (!compId || !stageKey) {
        stageSelect.innerHTML =
          `<option value="">— Немає активного етапу —</option>`;

        currentTeams = [];
        currentStageYear = "";

        configureCompetitionModeUI("unknown");

        if (zonesWrap) zonesWrap.innerHTML = "";

        if (archiveSection) {
          archiveSection.style.display = "none";
        }

        setMsg(
          "Немає активного етапу для зважування.",
          false
        );

        return;
      }

      const info = await getCompetitionInfo(
        compId,
        true
      );

      if (!info.exists) {
        throw new Error(
          `Турнір competitions/${compId} не знайдено.`
        );
      }

      const c = info.data;

      currentEntryType =
        resolveCompetitionEntryType(
          c,
          stageKey
        );

      currentStageYear = getStageYear(
        c,
        seasonYearInp?.value || ""
      );

      if (
        seasonYearInp &&
        currentStageYear
      ) {
        seasonYearInp.value = currentStageYear;
      }

      configureCompetitionModeUI(info.kind);

      const event = findCompetitionEvent(
        c,
        stageKey
      );

      const title =
        event
          ? eventTitle(
              event,
              c.events.indexOf(event)
            )
          : norm(
              app.activeStageTitle || stageKey
            );

      const compTitle = norm(
        c.name ||
        c.title ||
        compId
      );

      const brand = norm(
        c.brand || "STOLAR CARP"
      );

      const value = `${compId}||${stageKey}`;

      stageSelect.innerHTML = `
        <option value="${esc(value)}" selected>
          ${esc(brand)} · ${esc(compTitle)}
          — ${esc(title)}
        </option>
      `;

      stageSelect.value = value;

      const typeText =
        info.kind === "season"
          ? "Сезонний етап"
          : info.kind === "oneoff"
            ? "Одиночне змагання"
            : "Невідомий тип змагання";

      setMsg(
        `${typeText}: ${title} · ` +
        currentEntryType.toUpperCase(),
        info.kind !== "unknown"
      );

    } catch (error) {
      console.error(error);

      configureCompetitionModeUI("unknown");

      stageSelect.innerHTML =
        `<option value="">— Помилка —</option>`;

      setMsg(
        "Помилка активного етапу: " +
        error.message,
        false
      );
    }
  }

  // =====================================================
  // REGISTRATIONS
  // =====================================================

  async function loadTeamsFromRegistrations(
    compId,
    stageKey
  ) {
    const info = await getCompetitionInfo(compId);

    const competition = info.data || {};

    currentEntryType =
      resolveCompetitionEntryType(
        competition,
        stageKey
      );

    const year = getStageYear(
      competition,
      currentStageYear ||
      seasonYearInp?.value ||
      ""
    );

    const stageDocId = stageResultsId(
      compId,
      stageKey
    );

    let sectorMap;

    try {
      sectorMap = await loadSectorMap(
        year,
        stageDocId,
        true
      );
    } catch (error) {
      console.warn(
        "[admin-weighings] Sector map:",
        error
      );

      sectorMap = {
        exists: false,
        status: "",
        lakeId: "",
        byDrawKey: new Map()
      };
    }

    let query = db
      .collection("registrations")
      .where("competitionId", "==", compId)
      .where("status", "==", "confirmed");

    if (!stageKey || stageKey === "main") {
      query = query.where(
        "stageId",
        "in",
        [null, "main"]
      );
    } else {
      query = query.where(
        "stageId",
        "==",
        stageKey
      );
    }

    const snap = await query.get();

    const teams = (
      await Promise.all(
        snap.docs.map(async doc => {
          const r = doc.data() || {};

          const zone = normalizeDrawZone(
            r.drawZone || r.zone
          );

          const sector = normalizeDrawSector(
            firstDefined(
              r.drawSector,
              r.sector,
              r.place
            )
          );

          if (!zone || !sector) return null;

          const lake = resolveLakeSector(
            r,
            competition,
            sectorMap,
            zone,
            sector
          );

          const common = {
            regId: doc.id,
            zone,
            sector,
            drawZone: zone,
            drawSector: sector,
            drawKey: drawKeyOf(zone, sector),
            ...lake
          };

          if (currentEntryType === ENTRY_SOLO) {
            let uid = norm(
              r.uid ||
              r.participantUid ||
              r.userId ||
              r.registeredByUid
            );

            if (
              !uid &&
              doc.id.includes("__solo__")
            ) {
              uid = norm(
                doc.id.split("__solo__").pop()
              );
            }

            const entityId = uid || doc.id;

            const participantName =
              await resolveSoloParticipantName(
                r,
                uid
              );

            return {
              ...common,
              entryType: ENTRY_SOLO,
              entityId,
              uid: uid || entityId,
              participantName,
              legacyTeamId: norm(r.teamId),
              teamId: null,
              team: participantName
            };
          }

          const teamId = norm(r.teamId);

          if (!teamId) return null;

          return {
            ...common,
            entryType: ENTRY_TEAM,
            entityId: teamId,
            teamId,
            uid: norm(r.uid),
            team: norm(
              r.teamName ||
              r.team ||
              r.name ||
              "Команда"
            )
          };
        })
      )
    ).filter(Boolean);

    const zoneOrder = {
      A: 1,
      B: 2,
      C: 3
    };

    teams.sort((a, b) => {
      const za = zoneOrder[a.zone] || 9;
      const zb = zoneOrder[b.zone] || 9;

      if (za !== zb) return za - zb;

      const na = Number(a.sector);
      const nb = Number(b.sector);

      if (
        Number.isFinite(na) &&
        Number.isFinite(nb) &&
        na !== nb
      ) {
        return na - nb;
      }

      return a.sector.localeCompare(
        b.sector,
        "uk"
      );
    });

    checkDuplicatePhysicalSectors(teams);

    return teams;
  }

  // =====================================================
  // LIVE SOLO SYNC
  // =====================================================

  async function syncSoloParticipantsToStageResults(
    compId,
    stageKey,
    participants
  ) {
    if (currentEntryType !== ENTRY_SOLO) {
      return;
    }

    const list = participants.filter(
      p => isSoloTeam(p) && entityIdOf(p)
    );

    if (!list.length) return;

    const stageDocId = stageResultsId(
      compId,
      stageKey
    );

    const stageRef = db
      .collection("stageResults")
      .doc(stageDocId);

    await db.runTransaction(async tx => {
      const snap = await tx.get(stageRef);

      const data = snap.exists
        ? snap.data() || {}
        : {};

      const teams = Array.isArray(data.teams)
        ? data.teams.slice()
        : [];

      list.forEach(participant => {
        const entityId = entityIdOf(
          participant
        );

        const uid = norm(
          participant.uid || entityId
        );

        const legacyTeamId = norm(
          participant.legacyTeamId
        );

        const index = teams.findIndex(row => (
          row &&
          (
            (uid && norm(row.uid) === uid) ||
            (
              norm(row.entityId) === entityId &&
              entityId
            ) ||
            (
              legacyTeamId &&
              norm(row.teamId) === legacyTeamId
            )
          )
        ));

        const patch = {
          ...identityFields(participant),

          zone: participant.zone,
          sector: participant.sector,

          drawZone: participant.zone,
          drawSector: participant.sector,
          drawKey: participant.drawKey,

          ...lakeFields(participant)
        };

        if (index >= 0) {
          teams[index] = {
            ...teams[index],
            ...patch
          };
        } else {
          teams.push(patch);
        }
      });

      tx.set(
        stageRef,
        {
          compId,
          stageId: stageKey,
          competitionType:
            currentCompetitionKind,
          entryType: ENTRY_SOLO,

          stageName:
            data.stageName ||
            data.name ||
            stageDocId,

          teams,

          archived: false,
          isLive: true,
          isActive: true,

          updatedAt: timestamp()
        },
        { merge: true }
      );
    });
  }

  // =====================================================
  // LOAD WEIGHING
  // =====================================================

  async function loadTeamData(
    compId,
    stageKey,
    team,
    wNo
  ) {
    const ids = [
      entityIdOf(team),
      norm(team.legacyTeamId)
    ].filter(Boolean);

    const candidateIds = [...new Set(ids)];

    for (const id of candidateIds) {
      const docId = weighingDocId(
        compId,
        stageKey,
        wNo,
        id
      );

      const snap = await db
        .collection("weighings")
        .doc(docId)
        .get();

      if (!snap.exists) continue;

      const data = snap.data() || {};

      return {
        source:
          data.source === "admin-weigh"
            ? "admin"
            : "judge",

        weights: normalizeFishArray(
          data.weights ||
          data.fish ||
          data.weightsKg ||
          []
        )
      };
    }

    const stageDocId = stageResultsId(
      compId,
      stageKey
    );

    for (const id of candidateIds) {
      const snap = await db
        .collection("stageResults")
        .doc(stageDocId)
        .collection("teams")
        .doc(id)
        .get();

      if (!snap.exists) continue;

      const data = snap.data() || {};

      const slot =
        data.weighings?.[`W${wNo}`] ||
        null;

      if (!slot) continue;

      return {
        source: "admin",
        weights: normalizeFishArray(
          slot.fish ||
          slot.fishKg ||
          []
        )
      };
    }

    return {
      source: "none",
      weights: []
    };
  }

  // =====================================================
  // TABLE HTML
  // =====================================================

  function zoneBlock(zone, html, count) {
    return `
      <div class="card">

        <div class="zoneTitle">
          <h3>Зона ${esc(zone)}</h3>

          <span class="badge">
            ${esc(entityCountLabel(count))}
          </span>
        </div>

        <div class="table-wrap">
          ${html}
        </div>

      </div>
    `;
  }

  function fishInputHTML(value) {
    const fish = normalizeFishItem(value) || {
      kg: "",
      fishType: "carp",
      isAmur: false
    };

    const val = num(fish.kg) > 0
      ? num(fish.kg).toFixed(3)
      : "";

    const checked =
      fish.fishType === "amur"
        ? "checked"
        : "";

    const cls =
      fish.fishType === "amur"
        ? " fishLine-amur"
        : "";

    return `
      <div class="fishLine${cls}" data-fish-line>

        <input
          class="fishInput"
          inputmode="decimal"
          placeholder="0.000"
          value="${esc(val)}"
          data-fish
        >

        <label class="amurCheck">

          <input
            type="checkbox"
            data-amur
            ${checked}
          >

          <span>Амур</span>

        </label>

      </div>
    `;
  }

  async function buildTable(
    zone,
    teams,
    wKey,
    compId,
    stageKey
  ) {
    if (!teams.length) {
      return `
        <div class="muted">
          Немає ${isSoloMode() ? "учасників" : "команд"}
          у зоні ${esc(zone)}.
        </div>
      `;
    }

    const wNo = Number(
      wKey.replace("W", "")
    );

    const rows = await Promise.all(
      teams.map(async team => {
        const data = await loadTeamData(
          compId,
          stageKey,
          team,
          wNo
        );

        const fish = normalizeFishArray(
          data.weights
        );

        const stats = fishStats(fish);

        const sourceClass =
          data.source === "judge"
            ? "source-judge"
            : data.source === "admin"
              ? "source-admin"
              : "source-none";

        const sourceText =
          data.source === "judge"
            ? "суддя"
            : data.source === "admin"
              ? "адмін"
              : "—";

        const entityId = entityIdOf(team);

        const physicalSector =
          validLakeSectorNumber(
            team.lakeSectorNumber
          );

        return `
          <tr
            data-entity="${esc(entityId)}"
            data-zone="${esc(team.zone)}"
          >

            <td>

              <div class="pill">
                ${esc(team.sector)}
              </div>

              <div class="small">
                ${
                  physicalSector !== null
                    ? `📍 Озеро №${physicalSector}`
                    : "📍 Не прив'язано"
                }
              </div>

            </td>

            <td>

              <div class="teamName">
                ${esc(team.team)}
              </div>

              <div class="teamMeta">
                ${esc(
                  isSoloTeam(team)
                    ? team.uid || entityId
                    : team.teamId || entityId
                )}
              </div>

            </td>

            <td>

              <div class="fishWrap">

                ${
                  fish.length
                    ? fish.map(fishInputHTML).join("")
                    : `<span class="muted">
                         Немає риби
                       </span>`
                }

                <button
                  class="btnPlus"
                  type="button"
                  data-plus
                >
                  +
                </button>

              </div>

              <div class="small">
                Вага окремо. Галочка — амур.
              </div>

            </td>

            <td style="text-align:right;">

              <div class="sumBox" data-sum>
                ${stats.total.toFixed(3)}
              </div>

              <div class="small" data-fish-stats>
                Короп BF: ${stats.bigCarp.toFixed(3)}
                · Амур BF: ${stats.bigAmur.toFixed(3)}
              </div>

            </td>

            <td style="text-align:center;">

              <span
                class="source-badge ${sourceClass}"
              >
                ${sourceText}
              </span>

            </td>

            <td style="text-align:right;">

              <button
                class="btnSaveMini"
                type="button"
                data-save
              >
                Зберегти
              </button>

              <div class="small" data-status></div>

            </td>

          </tr>
        `;
      })
    );

    return `
      <table>

        <thead>
          <tr>
            <th>Сектор</th>
            <th>${esc(entityLabel())}</th>
            <th>Риба (${esc(wKey)})</th>
            <th>Сума</th>
            <th>Джерело</th>
            <th>Дія</th>
          </tr>
        </thead>

        <tbody>
          ${rows.join("")}
        </tbody>

      </table>
    `;
  }

  // =====================================================
  // FISH ROW EVENTS
  // =====================================================

  function collectFish(tr) {
    const result = [];

    tr.querySelectorAll(
      "[data-fish-line]"
    ).forEach(line => {
      const input = line.querySelector(
        "input[data-fish]"
      );

      const checkbox = line.querySelector(
        "input[data-amur]"
      );

      const kg = num(input?.value);

      if (kg <= 0) return;

      const isAmur = !!checkbox?.checked;

      result.push({
        kg,
        fishType: isAmur ? "amur" : "carp",
        isAmur
      });
    });

    return result;
  }

  function recalcRowSum(tr) {
    const stats = fishStats(
      collectFish(tr)
    );

    const sumEl = tr.querySelector(
      "[data-sum]"
    );

    if (sumEl) {
      sumEl.textContent =
        stats.total.toFixed(3);
    }

    const statsEl = tr.querySelector(
      "[data-fish-stats]"
    );

    if (statsEl) {
      statsEl.textContent =
        `Короп BF: ${stats.bigCarp.toFixed(3)} · ` +
        `Амур BF: ${stats.bigAmur.toFixed(3)}`;
    }
  }

  // =====================================================
  // SAVE HELPERS
  // =====================================================

  function stageArrayRowMatches(row, team) {
    if (!row || !team) return false;

    const entityId = entityIdOf(team);

    if (isSoloTeam(team)) {
      const uid = norm(
        team.uid || entityId
      );

      const legacyTeamId = norm(
        team.legacyTeamId
      );

      return (
        (uid && norm(row.uid) === uid) ||
        (
          entityId &&
          norm(row.entityId) === entityId
        ) ||
        (
          legacyTeamId &&
          norm(row.teamId) === legacyTeamId
        )
      );
    }

    return (
      norm(row.teamId) === norm(team.teamId)
    );
  }

  function weighingSlot(stats) {
    return {
      fish: stats.fish,

      fishKg: stats.fish.map(
        f => num(f.kg)
      ),

      total: stats.total,
      count: stats.count,

      big: stats.bigFish,
      bigCarp: stats.bigCarp,
      bigAmur: stats.bigAmur,

      carpCount: stats.carpCount,
      amurCount: stats.amurCount,

      carpWeight: stats.carpWeight,
      amurWeight: stats.amurWeight
    };
  }

  function calculateAllWeighings(weighings) {
    const result = {
      totalWeight: 0,
      bigFish: 0,
      bigCarp: 0,
      bigAmur: 0,

      totalCount: 0,
      carpCount: 0,
      amurCount: 0,

      carpWeight: 0,
      amurWeight: 0,

      sums: {}
    };

    for (let i = 1; i <= 4; i++) {
      const key = `W${i}`;
      const slot = weighings[key] || {};

      result.sums[key] = num(slot.total);

      result.totalWeight += num(slot.total);
      result.totalCount += num(slot.count);

      result.bigFish = Math.max(
        result.bigFish,
        num(slot.big)
      );

      result.bigCarp = Math.max(
        result.bigCarp,
        num(slot.bigCarp)
      );

      result.bigAmur = Math.max(
        result.bigAmur,
        num(slot.bigAmur)
      );

      result.carpCount += num(
        slot.carpCount
      );

      result.amurCount += num(
        slot.amurCount
      );

      result.carpWeight += num(
        slot.carpWeight
      );

      result.amurWeight += num(
        slot.amurWeight
      );
    }

    return result;
  }

  function liveWSlot(slot) {
    const s = slot || {};

    return {
      c: num(s.count),
      w: num(s.total),
      bigCarp: num(s.bigCarp),
      bigAmur: num(s.bigAmur)
    };
  }

  // =====================================================
  // SAVE TEAM / PARTICIPANT
  // =====================================================

  async function saveTeam(
    compId,
    stageKey,
    wKey,
    team,
    fish
  ) {
    const entityId = entityIdOf(team);

    if (!entityId) {
      throw new Error(
        "Немає ID учасника або команди."
      );
    }

    const wNo = Number(
      wKey.replace("W", "")
    );

    if (![1, 2, 3, 4].includes(wNo)) {
      throw new Error(
        "Невірний номер зважування."
      );
    }

    const stageDocId = stageResultsId(
      compId,
      stageKey
    );

    const identity = identityFields(team);
    const lake = lakeFields(team);

    const stats = fishStats(fish);

    const wDocId = weighingDocId(
      compId,
      stageKey,
      wNo,
      entityId
    );

    const weighingRef = db
      .collection("weighings")
      .doc(wDocId);

    const stageRef = db
      .collection("stageResults")
      .doc(stageDocId);

    const canonicalTeamRef = stageRef
      .collection("teams")
      .doc(entityId);

    const legacyTeamId = norm(
      team.legacyTeamId
    );

    const legacyTeamRef =
      legacyTeamId &&
      legacyTeamId !== entityId
        ? stageRef
            .collection("teams")
            .doc(legacyTeamId)
        : null;

    // Транзакція не допускає втрати
    // інших зважувань при одночасних записах.
    await db.runTransaction(async tx => {
      const [
        stageSnap,
        canonicalSnap,
        legacySnap
      ] = await Promise.all([
        tx.get(stageRef),
        tx.get(canonicalTeamRef),
        legacyTeamRef
          ? tx.get(legacyTeamRef)
          : Promise.resolve(null)
      ]);

      const stageData = stageSnap.exists
        ? stageSnap.data() || {}
        : {};

      const oldTeam =
        canonicalSnap.exists
          ? canonicalSnap.data() || {}
          : legacySnap?.exists
            ? legacySnap.data() || {}
            : {};

      const weighings = {
        ...(oldTeam.weighings || {})
      };

      weighings[wKey] = weighingSlot(stats);

      const totals = calculateAllWeighings(
        weighings
      );

      const common = {
        ...identity,

        zone: team.zone,
        sector: team.sector,

        drawZone: team.zone,
        drawSector: team.sector,
        drawKey: team.drawKey,

        ...lake
      };

      const weighingPayload = {
        compId,
        stageId: stageKey,

        competitionType:
          currentCompetitionKind,

        ...common,

        weighNo: wNo,

        weights: stats.fish,

        weightsKg: stats.fish.map(
          f => num(f.kg)
        ),

        fishCount: stats.count,
        totalWeightKg: stats.total,

        bigFishKg: stats.bigFish,
        bigCarpKg: stats.bigCarp,
        bigAmurKg: stats.bigAmur,

        carpCount: stats.carpCount,
        amurCount: stats.amurCount,

        carpWeightKg: stats.carpWeight,
        amurWeightKg: stats.amurWeight,

        status: "submitted",
        source: "admin-weigh",

        updatedAt: timestamp(),
        updatedBy: currentUid()
      };

      tx.set(
        weighingRef,
        weighingPayload,
        { merge: true }
      );

      tx.set(
        canonicalTeamRef,
        {
          compId,
          stageId: stageKey,

          competitionType:
            currentCompetitionKind,

          ...common,

          weighings,
          sums: totals.sums,

          totalWeight: totals.totalWeight,
          bigFish: totals.bigFish,
          bigCarp: totals.bigCarp,
          bigAmur: totals.bigAmur,

          totalCount: totals.totalCount,
          carpCount: totals.carpCount,
          amurCount: totals.amurCount,

          carpWeight: totals.carpWeight,
          amurWeight: totals.amurWeight,

          updatedAt: timestamp(),
          updatedBy: currentUid()
        },
        { merge: true }
      );

      const teamsArr = Array.isArray(
        stageData.teams
      )
        ? stageData.teams.slice()
        : [];

      const index = teamsArr.findIndex(
        row => stageArrayRowMatches(row, team)
      );

      const rowObj = {
        ...common,

        w1: liveWSlot(weighings.W1),
        w2: liveWSlot(weighings.W2),
        w3: liveWSlot(weighings.W3),
        w4: liveWSlot(weighings.W4),

        totalWeight: totals.totalWeight,
        bigFish: totals.bigFish,
        bigCarp: totals.bigCarp,
        bigAmur: totals.bigAmur,

        totalCount: totals.totalCount,
        carpCount: totals.carpCount,
        amurCount: totals.amurCount,

        carpWeight: totals.carpWeight,
        amurWeight: totals.amurWeight,

        total: totals.totalCount
      };

      if (index >= 0) {
        teamsArr[index] = {
          ...teamsArr[index],
          ...rowObj
        };
      } else {
        teamsArr.push(rowObj);
      }

      tx.set(
        stageRef,
        {
          compId,
          stageId: stageKey,

          competitionType:
            currentCompetitionKind,

          entryType:
            currentEntryType,

          stageName:
            stageData.stageName ||
            stageData.name ||
            stageDocId,

          teams: teamsArr,

          archived: false,
          isLive: true,
          isActive: true,

          updatedAt: timestamp()
        },
        { merge: true }
      );
    });

    return {
      ...stats,
      lakeSectorNumber: lake.lakeSectorNumber
    };
  }

  // =====================================================
  // LOAD TABLES
  // =====================================================

  async function loadTables() {
    if (!stageSelect || !wSelect) return;

    const requestId = ++tableLoadId;

    const { compId, stageKey } =
      parseStageValue(stageSelect.value);

    const wKey = wSelect.value;

    if (!compId || !stageKey) {
      setMsg(
        "Немає активного етапу.",
        false
      );
      return;
    }

    setMsg("Завантажую зважування…");
    setDbg("");

    try {
      const info = await getCompetitionInfo(
        compId,
        true
      );

      configureCompetitionModeUI(info.kind);

      currentEntryType =
        resolveCompetitionEntryType(
          info.data,
          stageKey
        );

      if (isSoloMode()) {
        userNameCache.clear();
      }

      const teams =
        await loadTeamsFromRegistrations(
          compId,
          stageKey
        );

      if (requestId !== tableLoadId) return;

      currentTeams = teams;

      if (!teams.length) {
        if (zonesWrap) zonesWrap.innerHTML = "";

        if (archiveSection) {
          archiveSection.style.display = "none";
        }

        setMsg(
          "Немає підтверджених учасників із жеребкуванням.",
          false
        );

        return;
      }

      if (isSoloMode()) {
        await syncSoloParticipantsToStageResults(
          compId,
          stageKey,
          teams
        );
      }

      const zones = {
        A: [],
        B: [],
        C: []
      };

      teams.forEach(team => {
        if (zones[team.zone]) {
          zones[team.zone].push(team);
        }
      });

      const html = await Promise.all(
        ["A", "B", "C"].map(zone =>
          buildTable(
            zone,
            zones[zone],
            wKey,
            compId,
            stageKey
          )
        )
      );

      if (requestId !== tableLoadId) return;

      if (zonesWrap) {
        zonesWrap.innerHTML = ["A", "B", "C"]
          .map((zone, index) =>
            zoneBlock(
              zone,
              html[index],
              zones[zone].length
            )
          )
          .join("");
      }

      if (archiveSection) {
        archiveSection.style.display = "block";
      }

      const mapped = teams.filter(
        t => t.lakeSectorNumber !== null
      ).length;

      const unmapped = teams.length - mapped;

      setMsg(
        `✅ Таблиці готові. ` +
        `${entityCountLabel(teams.length)}. ` +
        `Фізичних секторів прив'язано: ${mapped}.` +
        (
          unmapped
            ? ` Не прив'язано: ${unmapped}.`
            : ""
        ),
        unmapped === 0
      );

      showCompetitionModeHint();

    } catch (error) {
      console.error(error);

      setMsg(
        "Помилка завантаження: " +
        error.message,
        false
      );

      setDbg(String(error));
    }
  }

  // =====================================================
  // TABLE EVENTS
  // =====================================================

  if (zonesWrap) {
    zonesWrap.addEventListener(
      "input",
      event => {
        if (!event.target.matches(
          "input[data-fish]"
        )) {
          return;
        }

        const tr = event.target.closest(
          "tr[data-entity]"
        );

        if (tr) recalcRowSum(tr);
      }
    );

    zonesWrap.addEventListener(
      "change",
      event => {
        if (!event.target.matches(
          "input[data-amur]"
        )) {
          return;
        }

        const line = event.target.closest(
          "[data-fish-line]"
        );

        const tr = event.target.closest(
          "tr[data-entity]"
        );

        if (line) {
          line.classList.toggle(
            "fishLine-amur",
            event.target.checked
          );
        }

        if (tr) recalcRowSum(tr);
      }
    );

    zonesWrap.addEventListener(
      "click",
      async event => {
        const plus = event.target.closest(
          "[data-plus]"
        );

        const save = event.target.closest(
          "[data-save]"
        );

        if (!plus && !save) return;

        const tr = event.target.closest(
          "tr[data-entity]"
        );

        if (!tr) return;

        if (plus) {
          const wrap = tr.querySelector(
            ".fishWrap"
          );

          if (!wrap) return;

          wrap.querySelector(".muted")?.remove();

          const holder = document.createElement(
            "div"
          );

          holder.innerHTML = fishInputHTML(
            null
          ).trim();

          const line = holder.firstElementChild;

          wrap.insertBefore(
            line,
            wrap.querySelector("[data-plus]")
          );

          line.querySelector(
            "input[data-fish]"
          )?.focus();

          recalcRowSum(tr);
          return;
        }

        if (operationBusy || save.disabled) {
          return;
        }

        const { compId, stageKey } =
          parseStageValue(stageSelect.value);

        const wKey = wSelect.value;

        const entityId = tr.getAttribute(
          "data-entity"
        );

        const team = currentTeams.find(
          item => entityIdOf(item) === entityId
        );

        const statusEl = tr.querySelector(
          "[data-status]"
        );

        if (!team) {
          if (statusEl) {
            statusEl.textContent =
              "❌ Учасника не знайдено";
          }
          return;
        }

        save.disabled = true;

        if (statusEl) {
          statusEl.textContent = "Зберігаю…";
        }

        try {
          const result = await saveTeam(
            compId,
            stageKey,
            wKey,
            team,
            collectFish(tr)
          );

          if (statusEl) {
            statusEl.innerHTML = `
              <span class="ok">✅ Збережено</span><br>
              BF короп: ${result.bigCarp.toFixed(3)}<br>
              BF амур: ${result.bigAmur.toFixed(3)}
            `;
          }

          const badge = tr.querySelector(
            ".source-badge"
          );

          if (badge) {
            badge.className =
              "source-badge source-admin";

            badge.textContent = "адмін";
          }

          setMsg(
            `✅ Зважування збережено. ` +
            lakeSectorLabel(team),
            true
          );

          setDbg(
            weighingDocId(
              compId,
              stageKey,
              Number(wKey.replace("W", "")),
              entityId
            )
          );

        } catch (error) {
          console.error(error);

          if (statusEl) {
            statusEl.textContent =
              "❌ Помилка збереження";
          }

          setMsg(
            error.message,
            false
          );

        } finally {
          save.disabled = false;
        }
      }
    );
  }

  // =====================================================
  // ARCHIVE HELPERS
  // =====================================================

  function archiveRowFromStageTeam(
    team,
    fallbackId = ""
  ) {
    const t = team || {};

    const entryType = normLower(
      t.entryType
    ) === ENTRY_SOLO
      ? ENTRY_SOLO
      : ENTRY_TEAM;

    const entityId = norm(
      t.entityId ||
      (
        entryType === ENTRY_SOLO
          ? t.uid
          : t.teamId
      ) ||
      fallbackId
    );

    const identity =
      entryType === ENTRY_SOLO
        ? {
            entryType,
            entityId,
            uid: norm(t.uid || entityId),
            participantName: norm(
              t.participantName ||
              t.displayName ||
              "Учасник"
            ),
            teamId: null
          }
        : {
            entryType,
            entityId,
            teamId: norm(t.teamId || entityId)
          };

    const weighings = t.weighings || {};

    const slot = index => {
      const fromWeighings = weighings[
        `W${index}`
      ];

      if (fromWeighings) {
        return liveWSlot(fromWeighings);
      }

      const legacy = t[`w${index}`] || {};

      return {
        c: num(
          firstDefined(
            legacy.c,
            legacy.count
          )
        ),

        w: num(
          firstDefined(
            legacy.w,
            legacy.total
          )
        ),

        bigCarp: num(legacy.bigCarp),
        bigAmur: num(legacy.bigAmur)
      };
    };

    return {
      ...identity,

      team:
        entryType === ENTRY_SOLO
          ? norm(
              t.participantName ||
              t.displayName ||
              "Учасник"
            )
          : norm(
              t.team ||
              t.teamName ||
              "—"
            ),

      zone: norm(
        t.zone || t.drawZone
      ),

      sector: norm(
        firstDefined(
          t.sector,
          t.drawSector
        )
      ),

      drawZone: norm(
        t.drawZone || t.zone
      ),

      drawSector: norm(
        firstDefined(
          t.drawSector,
          t.sector
        )
      ),

      drawKey: norm(
        t.drawKey ||
        drawKeyOf(
          t.drawZone || t.zone,
          firstDefined(
            t.drawSector,
            t.sector
          )
        )
      ),

      ...lakeFields(t),

      w1: slot(1),
      w2: slot(2),
      w3: slot(3),
      w4: slot(4),

      totalWeight: num(t.totalWeight),
      bigFish: num(t.bigFish),
      bigCarp: num(t.bigCarp),
      bigAmur: num(t.bigAmur),

      totalCount: num(
        firstDefined(
          t.totalCount,
          t.total
        )
      ),

      carpCount: num(t.carpCount),
      amurCount: num(t.amurCount),

      carpWeight: num(t.carpWeight),
      amurWeight: num(t.amurWeight)
    };
  }

  async function buildArchiveTeamsFromWeighings(
    compId,
    stageKey
  ) {
    const snap = await db
      .collection("weighings")
      .where("compId", "==", compId)
      .where("stageId", "==", stageKey)
      .get();

    const byEntity = new Map();

    snap.forEach(doc => {
      const w = doc.data() || {};

      const entryType =
        normLower(w.entryType) === ENTRY_SOLO
          ? ENTRY_SOLO
          : ENTRY_TEAM;

      const entityId = norm(
        w.entityId ||
        (
          entryType === ENTRY_SOLO
            ? w.uid
            : w.teamId
        )
      );

      if (!entityId) return;

      const weighNo = Number(w.weighNo);

      if (![1, 2, 3, 4].includes(weighNo)) {
        return;
      }

      const old = byEntity.get(entityId) || {
        ...archiveRowFromStageTeam({
          ...w,
          entryType,
          entityId,
          totalWeight: 0,
          totalCount: 0
        }),

        totalWeight: 0,
        bigFish: 0,
        bigCarp: 0,
        bigAmur: 0,

        totalCount: 0,
        carpCount: 0,
        amurCount: 0,

        carpWeight: 0,
        amurWeight: 0
      };

      const stats = fishStats(
        w.weights ||
        w.fish ||
        w.weightsKg ||
        []
      );

      old[`w${weighNo}`] = {
        c: stats.count,
        w: stats.total,
        bigCarp: stats.bigCarp,
        bigAmur: stats.bigAmur
      };

      old.totalWeight += stats.total;
      old.totalCount += stats.count;

      old.bigFish = Math.max(
        old.bigFish,
        stats.bigFish
      );

      old.bigCarp = Math.max(
        old.bigCarp,
        stats.bigCarp
      );

      old.bigAmur = Math.max(
        old.bigAmur,
        stats.bigAmur
      );

      old.carpCount += stats.carpCount;
      old.amurCount += stats.amurCount;

      old.carpWeight += stats.carpWeight;
      old.amurWeight += stats.amurWeight;

      byEntity.set(entityId, old);
    });

    return [...byEntity.values()];
  }

  async function enrichArchiveWithLakeSectors(
    rows,
    compId,
    stageKey,
    seasonYear
  ) {
    const info = await getCompetitionInfo(compId);

    const stageDocId = stageResultsId(
      compId,
      stageKey
    );

    const map = await loadSectorMap(
      seasonYear,
      stageDocId,
      true
    );

    const registrationRows =
      currentTeams.length
        ? currentTeams
        : await loadTeamsFromRegistrations(
            compId,
            stageKey
          );

    const byEntity = new Map();
    const byDrawKey = new Map();

    registrationRows.forEach(team => {
      byEntity.set(entityIdOf(team), team);
      byDrawKey.set(team.drawKey, team);
    });

    const enriched = rows.map(row => {
      const entityId = norm(
        row.entityId ||
        row.teamId ||
        row.uid
      );

      const drawKey = norm(
        row.drawKey ||
        drawKeyOf(row.zone, row.sector)
      );

      const registration =
        byEntity.get(entityId) ||
        byDrawKey.get(drawKey) ||
        null;

      const lake = resolveLakeSector(
        registration || row,
        info.data,
        map,
        row.zone,
        row.sector
      );

      return {
        ...row,

        drawZone: row.drawZone || row.zone,
        drawSector: row.drawSector || row.sector,
        drawKey,

        ...lakeFields(lake)
      };
    });

    checkDuplicatePhysicalSectors(enriched);

    return enriched;
  }

  function calculateStandings(rows) {
    const sorted = rows.slice().sort((a, b) => {
      if (b.totalWeight !== a.totalWeight) {
        return b.totalWeight - a.totalWeight;
      }

      if (b.bigFish !== a.bigFish) {
        return b.bigFish - a.bigFish;
      }

      return b.totalCount - a.totalCount;
    });

    // Загальне місце зберігаємо окремо.
    const zoneCounters = new Map();

    sorted.forEach(row => {
      const zone = norm(row.zone);

      if (!zoneCounters.has(zone)) {
        zoneCounters.set(zone, []);
      }

      zoneCounters.get(zone).push(row);
    });

    const zonePlaces = new Map();

    zoneCounters.forEach((zoneRows, zone) => {
      zoneRows
        .slice()
        .sort((a, b) => {
          if (b.totalWeight !== a.totalWeight) {
            return b.totalWeight - a.totalWeight;
          }

          if (b.bigFish !== a.bigFish) {
            return b.bigFish - a.bigFish;
          }

          return b.totalCount - a.totalCount;
        })
        .forEach((row, index) => {
          zonePlaces.set(
            `${zone}/${row.entityId}`,
            index + 1
          );
        });
    });

    return sorted.map((row, index) => {
      const zonePlace = zonePlaces.get(
        `${row.zone}/${row.entityId}`
      ) || index + 1;

      return {
        ...row,

        place: index + 1,
        overallPlace: index + 1,

        zonePlace,

        // Для звичайних етапів бали
        // визначаються місцем у зоні.
        points: zonePlace
      };
    });
  }

  function isFinalStage(
    competition,
    stageKey
  ) {
    const event = findCompetitionEvent(
      competition,
      stageKey
    );

    const text = normLower(
      `${stageKey} ` +
      `${event?.title || ""} ` +
      `${event?.name || ""}`
    );

    return (
      event?.isFinal === true ||
      text.includes("final") ||
      text.includes("фінал")
    );
  }

  // =====================================================
  // SEASON RATING
  // =====================================================

  async function rebuildSeasonRatingFromArchive(
    seasonYear
  ) {
    const snap = await db
      .collection("seasonResults")
      .doc(seasonYear)
      .collection("stages")
      .get();

    const byTeam = new Map();
    const archivedStages = [];

    for (const stageDoc of snap.docs) {
      const stage = stageDoc.data() || {};

      const compId = norm(stage.compId);

      let kind = detectCompetitionKind(
        compId,
        {
          type: stage.competitionType
        }
      );

      if (kind === "unknown" && compId) {
        const info = await getCompetitionInfo(
          compId
        );

        kind = info.kind;
      }

      if (kind !== "season") continue;

      const stageDocId = stageDoc.id;

      archivedStages.push({
        stageDocId,
        compId,
        stageId: stage.stageId || "",
        stageName:
          stage.stageName || stageDocId,

        competitionType: "season",
        isFinal: stage.isFinal === true,

        archivedAt: stage.archivedAt || null
      });

      const rows = Array.isArray(
        stage.standings
      )
        ? stage.standings
        : [];

      rows.forEach(row => {
        const teamId = norm(row.teamId);

        if (!teamId) return;

        const old = byTeam.get(teamId) || {
          teamId,
          team: norm(row.team) || "—",
          stages: {}
        };

        old.team = norm(row.team) || old.team;

        old.stages[stageDocId] = {
          stageDocId,

          compId,
          stageId: stage.stageId || "",
          stageName:
            stage.stageName || stageDocId,

          place: num(row.place),

          zonePlace: num(
            firstDefined(
              row.zonePlace,
              row.points,
              row.place
            )
          ),

          overallPlace: num(
            firstDefined(
              row.overallPlace,
              row.place
            )
          ),

          points: num(
            firstDefined(
              row.points,
              row.place
            )
          ),

          totalWeight: num(row.totalWeight),
          bigFish: num(row.bigFish),
          bigCarp: num(row.bigCarp),
          bigAmur: num(row.bigAmur),

          totalCount: num(row.totalCount)
        };

        byTeam.set(teamId, old);
      });
    }

    const teams = [...byTeam.values()]
      .map(team => {
        const stages = Object.values(
          team.stages
        );

        const sortedPoints = stages
          .map(s => num(s.points))
          .sort((a, b) => a - b);

        const bestTwo = sortedPoints.slice(0, 2);

        const ratingPoints =
          bestTwo.reduce(
            (sum, value) => sum + value,
            0
          ) +
          (bestTwo.length === 1 ? 8 : 0);

        return {
          ...team,

          played: stages.length,

          totalPoints: ratingPoints,

          totalWeight: stages.reduce(
            (sum, s) =>
              sum + num(s.totalWeight),
            0
          ),

          bigFish: Math.max(
            0,
            ...stages.map(s => num(s.bigFish))
          ),

          bigCarp: Math.max(
            0,
            ...stages.map(s => num(s.bigCarp))
          ),

          bigAmur: Math.max(
            0,
            ...stages.map(s => num(s.bigAmur))
          ),

          totalCount: stages.reduce(
            (sum, s) =>
              sum + num(s.totalCount),
            0
          )
        };
      })
      .sort((a, b) => {
        if (a.totalPoints !== b.totalPoints) {
          return a.totalPoints - b.totalPoints;
        }

        if (a.totalWeight !== b.totalWeight) {
          return b.totalWeight - a.totalWeight;
        }

        return b.bigFish - a.bigFish;
      })
      .map((team, index) => ({
        ...team,
        seasonPlace: index + 1
      }));

    await db
      .collection("seasonRating")
      .doc(seasonYear)
      .set(
        {
          seasonYear,

          source: "seasonResults",

          archivedStages,
          teams,

          updatedAt: timestamp()
        },
        { merge: true }
      );

    return {
      teamsCount: teams.length,
      stagesCount: archivedStages.length
    };
  }

  // =====================================================
  // ARCHIVE
  // =====================================================

  async function archiveStage() {
    if (operationBusy) return;

    const { compId, stageKey } =
      parseStageValue(stageSelect.value);

    const seasonYear = norm(
      seasonYearInp?.value ||
      currentStageYear
    );

    if (!compId || !stageKey) {
      setArchiveMsg(
        "Немає активного етапу.",
        false
      );
      return;
    }

    if (!seasonYear) {
      setArchiveMsg(
        "Укажи рік сезону.",
        false
      );
      return;
    }

    const info = await getCompetitionInfo(
      compId,
      true
    );

    configureCompetitionModeUI(info.kind);

    if (info.kind !== "season") {
      setArchiveMsg(
        "Архівація дозволена тільки для сезонних змагань.",
        false
      );
      return;
    }

    const stageDocId = stageResultsId(
      compId,
      stageKey
    );

    if (!confirm(
      `Архівувати ${stageDocId} у сезон ${seasonYear}?`
    )) {
      return;
    }

    operationBusy = true;
    configureCompetitionModeUI(info.kind);

    try {
      const stageRef = db
        .collection("stageResults")
        .doc(stageDocId);

      setArchiveMsg(
        "STEP 1 — Читаю LIVE…"
      );

      const stageSnap = await stageRef.get();

      const stageData = stageSnap.exists
        ? stageSnap.data() || {}
        : {};

      const teamsSnap = await stageRef
        .collection("teams")
        .get();

      let teamsData = [];

      if (!teamsSnap.empty) {
        teamsData = teamsSnap.docs.map(doc =>
          archiveRowFromStageTeam(
            doc.data(),
            doc.id
          )
        );
      } else if (
        Array.isArray(stageData.teams) &&
        stageData.teams.length
      ) {
        teamsData = stageData.teams.map(
          row => archiveRowFromStageTeam(row)
        );
      }

      if (!teamsData.length) {
        teamsData =
          await buildArchiveTeamsFromWeighings(
            compId,
            stageKey
          );
      }

      if (!teamsData.length) {
        throw new Error(
          "Немає результатів для архівації."
        );
      }

      setArchiveMsg(
        "STEP 2 — Перевіряю фізичні сектори…"
      );

      teamsData =
        await enrichArchiveWithLakeSectors(
          teamsData,
          compId,
          stageKey,
          seasonYear
        );

      const mapped = teamsData.filter(
        row => row.lakeSectorNumber !== null
      ).length;

      setArchiveMsg(
        "STEP 3 — Розраховую місця…"
      );

      const standings = calculateStandings(
        teamsData
      );

      const finalStage = isFinalStage(
        info.data,
        stageKey
      );

      // Фінал отримує бали за загальне місце.
      if (finalStage) {
        standings.forEach(row => {
          row.points = row.overallPlace;
        });
      }

      const summary = {
        teamsCount: standings.length,

        mappedLakeSectors: mapped,

        totalWeight: standings.reduce(
          (s, t) => s + num(t.totalWeight),
          0
        ),

        maxBigFish: Math.max(
          0,
          ...standings.map(t => num(t.bigFish))
        ),

        maxBigCarp: Math.max(
          0,
          ...standings.map(t => num(t.bigCarp))
        ),

        maxBigAmur: Math.max(
          0,
          ...standings.map(t => num(t.bigAmur))
        ),

        totalCount: standings.reduce(
          (s, t) => s + num(t.totalCount),
          0
        ),

        carpCount: standings.reduce(
          (s, t) => s + num(t.carpCount),
          0
        ),

        amurCount: standings.reduce(
          (s, t) => s + num(t.amurCount),
          0
        )
      };

      const archiveRef = db
        .collection("seasonResults")
        .doc(seasonYear)
        .collection("stages")
        .doc(stageDocId);

      setArchiveMsg(
        "STEP 4 — Записую архів…"
      );

      await archiveRef.set(
        {
          seasonYear,
          compId,
          stageId: stageKey,
          stageDocId,

          competitionType: "season",

          stageName:
            stageData.stageName ||
            stageData.name ||
            stageDocId,

          isFinal: finalStage,

          lakeId: norm(
            info.data.lakeId ||
            info.data.waterbodyId
          ),

          standings,
          summary,

          archivedAt: timestamp(),
          archivedBy: currentUid(),

          isArchived: true,
          isActive: false
        },
        { merge: true }
      );

      const verify = await archiveRef.get();

      if (!verify.exists) {
        throw new Error(
          "Не вдалося підтвердити запис архіву."
        );
      }

      setArchiveMsg(
        "STEP 5 — Перераховую рейтинг…"
      );

      const rating =
        await rebuildSeasonRatingFromArchive(
          seasonYear
        );

      setArchiveMsg(
        "STEP 6 — Закриваю архівований LIVE…"
      );

      await stageRef.set(
        {
          competitionType: "season",

          archived: true,
          isLive: false,
          isActive: false,

          archivedAt: timestamp(),

          archivedTo:
            `seasonResults/${seasonYear}/` +
            `stages/${stageDocId}`
        },
        { merge: true }
      );

      setArchiveMsg(
        `✅ Архів готовий. ` +
        `Команд: ${standings.length}. ` +
        `Фізичних секторів: ${mapped}. ` +
        `Рейтинг: ${rating.teamsCount} команд. ` +
        `Можна очистити LIVE.`,
        true
      );

      setMsg(
        "✅ Етап архівовано.",
        true
      );

    } catch (error) {
      console.error(error);

      setArchiveMsg(
        `❌ Помилка архівування: ${error.message}`,
        false
      );

    } finally {
      operationBusy = false;
      configureCompetitionModeUI(
        currentCompetitionKind
      );
    }
  }

  // =====================================================
  // DELETE
  // =====================================================

  async function deleteDocsInBatches(
    docs,
    label
  ) {
    let deleted = 0;

    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();

      const chunk = docs.slice(i, i + 400);

      chunk.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      deleted += chunk.length;

      setArchiveMsg(
        `🧹 ${label}: ${deleted}/${docs.length}`
      );
    }

    return deleted;
  }

  // =====================================================
  // ACTIVATE NEXT
  // =====================================================

  async function activateNextStage(
    compId,
    currentStageKey,
    currentStageDocId
  ) {
    const next = await getNextStageInfo(
      compId,
      currentStageKey
    );

    const appRef = db
      .collection("settings")
      .doc("app");

    if (!next) {
      await appRef.set(
        {
          activeCompetitionId: "",
          activeStageId: "",
          activeKey: "",
          activeStageResultsId: "",
          activeStageTitle: "",

          liveClosed: true,
          liveClosedAt: timestamp(),
          liveClosedFrom: currentStageDocId,

          previousCompetitionId: compId,
          previousStageId: currentStageKey,
          previousStageResultsId:
            currentStageDocId,

          updatedAt: timestamp()
        },
        { merge: true }
      );

      return null;
    }

    const nextStageDocId = stageResultsId(
      compId,
      next.key
    );

    await db
      .collection("stageResults")
      .doc(nextStageDocId)
      .set(
        {
          compId,
          stageId: next.key,

          competitionType: "season",

          stageName:
            next.title || nextStageDocId,

          teams: [],

          zones: {
            A: [],
            B: [],
            C: []
          },

          archived: false,
          isLive: true,
          isActive: true,

          preparedAt: timestamp()
        },
        { merge: true }
      );

    await appRef.set(
      {
        activeCompetitionId: compId,
        activeStageId: next.key,

        activeKey: nextStageDocId,
        activeStageResultsId: nextStageDocId,

        activeStageTitle:
          next.title || next.key,

        liveClosed: false,
        liveClosedAt: null,

        liveClosedFrom: currentStageDocId,

        previousCompetitionId: compId,
        previousStageId: currentStageKey,
        previousStageResultsId:
          currentStageDocId,

        updatedAt: timestamp()
      },
      { merge: true }
    );

    return {
      stageKey: next.key,
      stageDocId: nextStageDocId,
      title: next.title || next.key
    };
  }

  // =====================================================
  // CLOSE ONEOFF
  // =====================================================

  async function closeOneoffLive(
    compId,
    stageKey,
    stageDocId
  ) {
    const appRef = db
      .collection("settings")
      .doc("app");

    const snap = await appRef.get();

    const app = snap.exists
      ? snap.data() || {}
      : {};

    const patch = {
      liveClosed: true,
      liveClosedAt: timestamp(),
      liveClosedFrom: stageDocId,

      previousCompetitionId: compId,
      previousStageId: stageKey,
      previousStageResultsId: stageDocId,

      updatedAt: timestamp()
    };

    if (
      norm(app.activeCompetitionId) === compId &&
      norm(app.activeStageId) === stageKey
    ) {
      Object.assign(patch, {
        activeCompetitionId: "",
        activeStageId: "",
        activeKey: "",
        activeStageResultsId: "",
        activeStageTitle: ""
      });
    }

    await appRef.set(
      patch,
      { merge: true }
    );
  }

  // =====================================================
  // CLEAR LIVE
  // =====================================================

  async function clearLiveStage() {
    if (operationBusy) return;

    const { compId, stageKey } =
      parseStageValue(stageSelect.value);

    const seasonYear = norm(
      seasonYearInp?.value ||
      currentStageYear
    );

    if (!compId || !stageKey) {
      setArchiveMsg(
        "Немає активного етапу.",
        false
      );
      return;
    }

    const info = await getCompetitionInfo(
      compId,
      true
    );

    configureCompetitionModeUI(info.kind);

    if (info.kind === "unknown") {
      setArchiveMsg(
        "Невідомий тип змагання. Очищення заблоковано.",
        false
      );
      return;
    }

    const isSeason = info.kind === "season";
    const isOneoff = info.kind === "oneoff";

    const stageDocId = stageResultsId(
      compId,
      stageKey
    );

    if (isSeason) {
      if (!seasonYear) {
        setArchiveMsg(
          "Укажи рік сезону.",
          false
        );
        return;
      }

      const archiveSnap = await db
        .collection("seasonResults")
        .doc(seasonYear)
        .collection("stages")
        .doc(stageDocId)
        .get();

      if (!archiveSnap.exists) {
        setArchiveMsg(
          "❌ Спочатку архівуй сезонний етап.",
          false
        );
        return;
      }

      const archiveData = archiveSnap.data() || {};

      if (
        normLower(
          archiveData.competitionType
        ) !== "season"
      ) {
        setArchiveMsg(
          "❌ Архів не позначений як season.",
          false
        );
        return;
      }
    }

    // Перевіряємо, що адміністратор не
    // намагається очистити вже неактивний етап.
    const appSnap = await db
      .collection("settings")
      .doc("app")
      .get();

    const app = appSnap.exists
      ? appSnap.data() || {}
      : {};

    if (
      norm(app.activeCompetitionId) !== compId ||
      norm(app.activeStageId) !== stageKey
    ) {
      setArchiveMsg(
        "❌ Цей етап уже не є активним. " +
        "Очищення заблоковано.",
        false
      );
      return;
    }

    const confirmText = isSeason
      ? (
          `Очистити LIVE ${stageDocId}?\n\n` +
          `Архів сезону залишиться.\n` +
          `Рейтинг сезону залишиться.\n\n` +
          `Після очищення активується наступний етап.`
        )
      : (
          `Завершити одиночне змагання ${stageDocId}?\n\n` +
          `LIVE та зважування буде видалено.\n` +
          `Сезонний рейтинг не зміниться.`
        );

    if (!confirm(confirmText)) return;

    operationBusy = true;
    configureCompetitionModeUI(info.kind);

    try {
      // Визначаємо наступний етап до видалення,
      // щоб помилка конфігурації не виникла
      // після очищення даних.
      let next = null;

      if (isSeason) {
        next = await getNextStageInfo(
          compId,
          stageKey
        );
      }

      setArchiveMsg(
        "🧹 Видаляю weighings…"
      );

      const weighingsSnap = await db
        .collection("weighings")
        .where("compId", "==", compId)
        .where("stageId", "==", stageKey)
        .get();

      const deletedWeighings =
        await deleteDocsInBatches(
          weighingsSnap.docs,
          "weighings"
        );

      const stageRef = db
        .collection("stageResults")
        .doc(stageDocId);

      const teamsSnap = await stageRef
        .collection("teams")
        .get();

      const deletedTeams =
        await deleteDocsInBatches(
          teamsSnap.docs,
          "stageResults/teams"
        );

      await stageRef.delete();

      let activated = null;

      if (isSeason) {
        // next уже перевірений вище.
        activated = await activateNextStage(
          compId,
          stageKey,
          stageDocId
        );
      }

      if (isOneoff) {
        await closeOneoffLive(
          compId,
          stageKey,
          stageDocId
        );
      }

      ++tableLoadId;

      currentTeams = [];

      if (zonesWrap) {
        zonesWrap.innerHTML = "";
      }

      if (archiveSection) {
        archiveSection.style.display = "none";
      }

      await loadStages();

      setArchiveMsg(
        `✅ LIVE очищено. ` +
        `Зважувань: ${deletedWeighings}. ` +
        `Записів команд: ${deletedTeams}. ` +
        (
          isOneoff
            ? "Одиночне змагання закрито."
            : activated
              ? `Активовано: ${activated.title}.`
              : "Наступного етапу немає."
        ),
        true
      );

      setMsg(
        "✅ Очищення завершено.",
        true
      );

      setDbg("");

    } catch (error) {
      console.error(error);

      setArchiveMsg(
        "❌ Помилка очищення: " +
        error.message,
        false
      );

    } finally {
      operationBusy = false;
      configureCompetitionModeUI(
        currentCompetitionKind
      );
    }
  }

  // =====================================================
  // INIT
  // =====================================================

  async function init() {
    if (!auth || !db || !fb) {
      setMsg(
        "Firebase не ініціалізувався.",
        false
      );
      return;
    }

    auth.onAuthStateChanged(async user => {
      if (!user) {
        setMsg(
          "Увійди як адміністратор.",
          false
        );
        return;
      }

      let allowed = false;

      try {
        allowed = await requireAdmin(user);
      } catch (error) {
        console.error(error);

        setMsg(
          "Помилка перевірки прав адміністратора.",
          false
        );

        return;
      }

      if (!allowed) {
        setMsg(
          "Доступ заборонено.",
          false
        );
        return;
      }

      await loadStages();

      const btnReloadStages = $(
        "btnReloadStages"
      );

      const btnLoadTables = $(
        "btnLoadTables"
      );

      if (btnReloadStages) {
        btnReloadStages.onclick = async () => {
          competitionInfoCache.clear();
          userNameCache.clear();
          sectorMapCache.clear();

          await loadStages();
        };
      }

      if (btnLoadTables) {
        btnLoadTables.onclick = loadTables;
      }

      if (btnArchive) {
        btnArchive.onclick = archiveStage;
      }

      if (btnClearLive) {
        btnClearLive.onclick = clearLiveStage;
      }
    });
  }

  init();

})();

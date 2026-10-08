// assets/js/draw_admin.js
// STOLAR CARP • Admin draw
//
// TEAM + SOLO
// registrations = основне джерело статусу
// тільки confirmed
// public_participants = fallback
// пошук не впливає на зайняті сектори
//
// NEW:
// • автоматичне читання підготовленої карти
// • фізичні сектори водойми
// • довільна кількість секторів
// • передача lakeSectorNumber у LIVE
// • старі змагання працюють без карти
//
// stageResults ID:
// `${compId}__${stageKey}`
//
// Карта:
// sectorMaps/{year}/stages/{compId}__{stageKey}

(function () {
  "use strict";

  const CONFIG = {
    ADMIN_UID: "5Dt6fN64c3aWACYV1WacxV2BHDl2",

    LS_KEY_STAGE: "sc_draw_selected_stage_v3",

    DEFAULT_LAKE_ID: "lelehivka",

    COLLECTIONS: {
      REGISTRATIONS: "registrations",
      COMPETITIONS: "competitions",
      USERS: "users",
      STAGE_RESULTS: "stageResults",
      SETTINGS: "settings",
      PUBLIC_PARTICIPANTS: "public_participants",
      SECTOR_MAPS: "sectorMaps"
    }
  };

  const ENTRY_TEAM = "team";
  const ENTRY_SOLO = "solo";

  // =====================================================
  // LEGACY SECTORS
  // =====================================================

  const LEGACY_SECTORS = [];

  ["A", "B", "C"].forEach(zone => {
    for (let i = 1; i <= 8; i++) {
      LEGACY_SECTORS.push(`${zone}${i}`);
    }
  });

  // =====================================================
  // STATE
  // =====================================================

  const state = {
    isAdmin: false,

    stageNameByKey: new Map(),
    stageMetaByKey: new Map(),

    regsAllConfirmed: [],
    regsFiltered: [],

    usedSectorSet: new Set(),

    sectorMap: null,

    availableSectors: [...LEGACY_SECTORS],

    sectorMapLoading: false,

    sectorMapError: "",

    sectorMapRequestId: 0,

    savingRows: new Set()
  };

  const userNameCache = new Map();

  // =====================================================
  // DOM
  // =====================================================

  const els = {
    stageSelect: document.getElementById("stageSelect"),
    qInput: document.getElementById("q"),
    msg: document.getElementById("msg"),
    drawRows: document.getElementById("drawRows"),
    countInfo: document.getElementById("countInfo")
  };

  const auth = window.scAuth;
  const db = window.scDb;

  if (!auth || !db || !window.firebase) {
    if (els.msg) {
      els.msg.textContent =
        "Firebase init не завантажився.";
    }

    return;
  }

  const FV = window.firebase.firestore.FieldValue;

  // =====================================================
  // UTILS
  // =====================================================

  const utils = {
    esc(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    norm(value) {
      return String(value ?? "").trim();
    },

    lower(value) {
      return String(value ?? "").trim().toLowerCase();
    },

    setMsg(message, ok = true) {
      if (!els.msg) return;

      els.msg.textContent = message || "";

      els.msg.style.color = message
        ? ok
          ? "#8fe39a"
          : "#ff6c6c"
        : "";
    },

    parseStageValue(value) {
      const parts = String(value || "").split("||");

      return {
        compId: this.norm(parts[0]),
        stageKey: this.norm(parts.slice(1).join("||")) || "main"
      };
    },

    currentStageValue() {
      return els.stageSelect?.value || "";
    },

    getCompIdFromReg(row) {
      return (
        row.competitionId ||
        row.compId ||
        row.competition ||
        row.seasonId ||
        row.season ||
        row.eventCompetitionId ||
        ""
      );
    },

    getStageIdFromReg(row) {
      return this.norm(
        row.stageId ||
        row.stageKey ||
        row.stage ||
        row.eventId ||
        row.eventKey ||
        row.roundId ||
        ""
      ) || "main";
    },

    normalizeDrawKey(value) {
      const key = this.norm(value).toUpperCase();

      const match = key.match(/^([ABC])([1-9]\d*)$/);

      return match ? `${match[1]}${Number(match[2])}` : "";
    },

    parseSector(value) {
      const key = this.normalizeDrawKey(value);

      if (!key) return null;

      return {
        z: key[0],
        n: Number(key.slice(1))
      };
    },

    zoneRank(zone) {
      return zone === "A"
        ? 1
        : zone === "B"
          ? 2
          : zone === "C"
            ? 3
            : 9;
    },

    sectorCompare(a, b) {
      const sa = this.parseSector(a);
      const sb = this.parseSector(b);

      if (!sa && !sb) {
        return String(a).localeCompare(String(b), "uk");
      }

      if (!sa) return 1;
      if (!sb) return -1;

      return (
        this.zoneRank(sa.z) - this.zoneRank(sb.z) ||
        sa.n - sb.n
      );
    },

    saveStageToLS(value) {
      try {
        localStorage.setItem(
          CONFIG.LS_KEY_STAGE,
          String(value || "")
        );
      } catch (_) {}
    },

    loadStageFromLS() {
      try {
        return localStorage.getItem(
          CONFIG.LS_KEY_STAGE
        ) || "";
      } catch (_) {
        return "";
      }
    },

    fmtTimeNow() {
      return new Date().toLocaleTimeString("uk-UA");
    },

    yearFrom(value) {
      const match = String(value ?? "").match(/\b20\d{2}\b/);

      return match ? match[0] : "";
    }
  };

  // =====================================================
  // EVENTS
  // =====================================================

  function eventKey(event, index) {
    return utils.norm(
      event?.key ||
      event?.stageId ||
      event?.id ||
      `stage-${index + 1}`
    );
  }

  function eventTitle(event, index) {
    return utils.norm(
      event?.title ||
      event?.name ||
      event?.label ||
      `Етап ${index + 1}`
    );
  }

  function normalizeFormat(value) {
    return utils.lower(value)
      .replace(/\s+/g, "")
      .replace(/_/g, "-");
  }

  function isFinalEvent(event, stageKey) {
    const key = utils.lower(
      event?.key ||
      event?.stageId ||
      event?.id ||
      stageKey
    );

    const text = utils.lower(
      `${event?.title || ""} ${
        event?.name || ""
      } ${event?.label || ""}`
    );

    return (
      event?.isFinal === true ||
      key.includes("final") ||
      key.includes("фінал") ||
      text.includes("final") ||
      text.includes("фінал")
    );
  }

  function resolveCompetitionEntryType(
    competition,
    event,
    stageKey
  ) {
    if (isFinalEvent(event, stageKey)) {
      return ENTRY_TEAM;
    }

    const explicit = utils.lower(
      event?.entryType ||
      competition?.entryType
    );

    if (
      explicit === ENTRY_SOLO ||
      explicit === ENTRY_TEAM
    ) {
      return explicit;
    }

    const format = normalizeFormat(
      event?.format ||
      event?.engine?.baseFormat ||
      competition?.format ||
      competition?.engine?.baseFormat
    );

    return format === "stalker-solo"
      ? ENTRY_SOLO
      : ENTRY_TEAM;
  }

  // =====================================================
  // CANONICAL STAGE ID
  // =====================================================

  function stageResultsDocId(compId, stageKey) {
    return `${utils.norm(compId)}__${
      utils.norm(stageKey) || "main"
    }`;
  }

  // =====================================================
  // CURRENT META
  // =====================================================

  function currentStageMeta() {
    return (
      state.stageMetaByKey.get(
        utils.currentStageValue()
      ) || null
    );
  }

  function currentEntryType() {
    return currentStageMeta()?.entryType === ENTRY_SOLO
      ? ENTRY_SOLO
      : ENTRY_TEAM;
  }

  function isSoloMode() {
    return currentEntryType() === ENTRY_SOLO;
  }

  // =====================================================
  // SECTOR MAP NORMALIZATION
  // =====================================================

  /*
   * Підтримувані приклади:
   *
   * sectors: {
   *   "1": { drawKey: "A1" },
   *   "2": { zone: "A", sector: 2 }
   * }
   *
   * sectors: [
   *   { number: 1, drawKey: "A1" }
   * ]
   *
   * bindings: [
   *   { lakeSectorNumber: 1, drawKey: "A1" }
   * ]
   *
   * sectorAssignments: {
   *   "A1": 1,
   *   "A2": 2
   * }
   *
   * Якщо формат інший — не вигадуємо
   * відповідність.
   */

  function physicalSectorNumber(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "object") {
      return null;
    }

    const text = utils.norm(value);

    if (!/^\d+$/.test(text)) return null;

    const number = Number(text);

    return Number.isSafeInteger(number) &&
      number >= 1 &&
      number <= 1000
      ? number
      : null;
  }

  function drawKeyFromMapRow(row, fallbackKey = "") {
    if (typeof row === "string") {
      return utils.normalizeDrawKey(row);
    }

    if (!row || typeof row !== "object") {
      return utils.normalizeDrawKey(fallbackKey);
    }

    const direct = utils.normalizeDrawKey(
      row.drawKey ||
      row.tournamentSector ||
      row.tournamentKey ||
      row.zoneSector ||
      row.assignment ||
      row.assignedSector ||
      row.code ||
      ""
    );

    if (direct) return direct;

    const zone = utils.norm(
      row.zone ||
      row.drawZone ||
      row.assignedZone ||
      ""
    ).toUpperCase();

    const sector = physicalSectorNumber(
      row.drawSector ??
      row.zoneNumber ??
      row.assignedNumber ??
      row.sectorInZone ??
      row.sector
    );

    if (zone && sector) {
      return utils.normalizeDrawKey(
        `${zone}${sector}`
      );
    }

    return utils.normalizeDrawKey(fallbackKey);
  }

  function numberFromMapRow(row, fallbackNumber = null) {
    if (typeof row === "number") {
      return physicalSectorNumber(row);
    }

    if (!row || typeof row !== "object") {
      return physicalSectorNumber(fallbackNumber);
    }

    return physicalSectorNumber(
      row.lakeSectorNumber ??
      row.physicalSectorNumber ??
      row.physicalSector ??
      row.lakeSector ??
      row.sectorNumber ??
      row.number ??
      row.placeNumber ??
      row.place ??
      fallbackNumber
    );
  }

  function normalizeSectorMap(data, context) {
    const bindings = new Map();
    const occupiedPhysical = new Map();

    let invalid = false;

    function add(drawKey, physicalNumber) {
      const key = utils.normalizeDrawKey(drawKey);
      const number = physicalSectorNumber(physicalNumber);

      if (!key || !number) return;

      if (
        bindings.has(key) &&
        bindings.get(key) !== number
      ) {
        invalid = true;
        return;
      }

      if (
        occupiedPhysical.has(number) &&
        occupiedPhysical.get(number) !== key
      ) {
        invalid = true;
        return;
      }

      bindings.set(key, number);
      occupiedPhysical.set(number, key);
    }

    function consumeCollection(collection) {
      if (!collection) return;

      if (Array.isArray(collection)) {
        collection.forEach(row => {
          if (!row || typeof row !== "object") return;

          if (
            row.enabled === false ||
            row.active === false ||
            row.disabled === true ||
            row.isUnused === true
          ) {
            return;
          }

          add(
            drawKeyFromMapRow(row),
            numberFromMapRow(row)
          );
        });

        return;
      }

      if (typeof collection !== "object") return;

      Object.entries(collection).forEach(
        ([entryKey, value]) => {
          if (value === null || value === "") return;

          if (
            value &&
            typeof value === "object" &&
            (
              value.enabled === false ||
              value.active === false ||
              value.disabled === true ||
              value.isUnused === true
            )
          ) {
            return;
          }

          const keyIsDraw = utils.normalizeDrawKey(entryKey);
          const keyIsPhysical = physicalSectorNumber(entryKey);

          if (keyIsDraw) {
            const number =
              numberFromMapRow(value) ??
              physicalSectorNumber(value);

            add(keyIsDraw, number);
            return;
          }

          if (keyIsPhysical) {
            add(
              drawKeyFromMapRow(value),
              keyIsPhysical
            );
            return;
          }

          if (value && typeof value === "object") {
            add(
              drawKeyFromMapRow(value),
              numberFromMapRow(value)
            );
          }
        }
      );
    }

    [
      data.sectors,
      data.bindings,
      data.sectorBindings,
      data.sectorAssignments,
      data.assignments,
      data.mapping,
      data.sectorMapping,
      data.sectorMap
    ].forEach(consumeCollection);

    if (invalid) {
      throw new Error(
        "У карті є повторне призначення турнірного або фізичного сектора."
      );
    }

    if (!bindings.size) {
      throw new Error(
        "Карту знайдено, але прив'язки секторів не розпізнані. " +
        "Потрібно перевірити формат документа sectorMaps."
      );
    }

    const availableSectors = Array.from(
      bindings.keys()
    ).sort(utils.sectorCompare.bind(utils));

    const lakeId = utils.norm(
      data.lakeId ||
      data.waterbodyId ||
      data.waterId ||
      context.lakeId ||
      CONFIG.DEFAULT_LAKE_ID
    );

    return {
      lakeId,

      year: context.year,

      compId: context.compId,

      stageKey: context.stageKey,

      stageDocId: context.stageDocId,

      bindings,

      availableSectors,

      source: "sectorMaps"
    };
  }

  // =====================================================
  // SECTOR MAP LOADER
  // =====================================================

  async function loadSectorMapForCurrentStage() {
    const requestId = ++state.sectorMapRequestId;

    state.sectorMap = null;
    state.sectorMapError = "";
    state.sectorMapLoading = true;

    state.availableSectors = [...LEGACY_SECTORS];

    const meta = currentStageMeta();

    if (!meta) {
      state.sectorMapLoading = false;
      filters.apply();
      return;
    }

    const {
      compId,
      stageKey,
      year,
      lakeId
    } = meta;

    const stageDocId = stageResultsDocId(
      compId,
      stageKey
    );

    if (!year) {
      state.sectorMapLoading = false;

      utils.setMsg(
        "Рік змагання не визначено. " +
        "Використовується стандартне жеребкування A1–C8.",
        true
      );

      filters.apply();
      return;
    }

    try {
      const ref = db
        .collection(CONFIG.COLLECTIONS.SECTOR_MAPS)
        .doc(String(year))
        .collection("stages")
        .doc(stageDocId);

      const snap = await ref.get();

      if (requestId !== state.sectorMapRequestId) {
        return;
      }

      if (!snap.exists) {
        state.sectorMap = null;

        state.availableSectors = [
          ...LEGACY_SECTORS
        ];

        state.sectorMapError = "";

        utils.setMsg(
          "Карту для цього етапу не знайдено. " +
          "Доступне стандартне жеребкування A1–C8.",
          true
        );

      } else {
        const map = normalizeSectorMap(
          snap.data() || {},
          {
            compId,
            stageKey,
            year,
            lakeId,
            stageDocId
          }
        );

        state.sectorMap = map;

        state.availableSectors = [
          ...map.availableSectors
        ];

        utils.setMsg(
          `✅ Карту завантажено. ` +
          `Доступно секторів: ${
            map.availableSectors.length
          }.`,
          true
        );
      }

    } catch (error) {
      if (requestId !== state.sectorMapRequestId) {
        return;
      }

      console.error(
        "[draw_admin] sector map:",
        error
      );

      state.sectorMap = null;

      state.availableSectors = [];

      state.sectorMapError =
        error?.message ||
        "Не вдалося завантажити карту.";

      utils.setMsg(
        `Помилка карти: ${state.sectorMapError}`,
        false
      );

    } finally {
      if (requestId === state.sectorMapRequestId) {
        state.sectorMapLoading = false;
        filters.apply();
      }
    }
  }

  // =====================================================
  // PHYSICAL SECTOR
  // =====================================================

  function physicalSectorFor(drawKey) {
    const key = utils.normalizeDrawKey(drawKey);

    if (!key) return null;

    if (!state.sectorMap) return null;

    return state.sectorMap.bindings.get(key) ?? null;
  }

  function currentLakeId() {
    if (state.sectorMap) {
      return state.sectorMap.lakeId;
    }

    return utils.norm(
      currentStageMeta()?.lakeId
    ) || null;
  }

  // =====================================================
  // CURRENT STAGE ROWS
  // =====================================================

  function getCurrentStageConfirmedRows() {
    const {
      compId,
      stageKey
    } = utils.parseStageValue(
      utils.currentStageValue()
    );

    if (!compId) return [];

    return state.regsAllConfirmed.filter(row => {
      return (
        utils.norm(row.compId) === compId &&
        (utils.norm(row.stageId) || "main") === stageKey
      );
    });
  }

  // =====================================================
  // AUTH
  // =====================================================

  async function requireAdmin(user) {
    if (!user) return false;

    if (user.uid === CONFIG.ADMIN_UID) {
      return true;
    }

    const snap = await db
      .collection(CONFIG.COLLECTIONS.USERS)
      .doc(user.uid)
      .get();

    return snap.exists &&
      utils.norm(snap.data()?.role) === "admin";
  }

  // =====================================================
  // USER NAME
  // =====================================================

  async function getUserNameByUid(uid) {
    const id = utils.norm(uid);

    if (!id) return "";

    if (userNameCache.has(id)) {
      return userNameCache.get(id) || "";
    }

    let name = "";

    try {
      const snap = await db
        .collection(CONFIG.COLLECTIONS.USERS)
        .doc(id)
        .get();

      if (snap.exists) {
        const user = snap.data() || {};

        const first = utils.norm(user.firstName);
        const last = utils.norm(user.lastName);

        name = first && last
          ? `${first} ${last}`
          : utils.norm(
              user.fullName ||
              user.displayName ||
              user.name ||
              user.email
            );
      }

    } catch (error) {
      console.warn(
        "[draw_admin] user name:",
        id,
        error
      );
    }

    userNameCache.set(id, name);

    return name;
  }

  // =====================================================
  // IDENTITY
  // =====================================================

  function rowUid(row) {
    let uid = utils.norm(
      row?.uid ||
      row?.participantUid ||
      row?.userId ||
      row?.registeredByUid
    );

    if (
      !uid &&
      utils.norm(row?._id).includes("__solo__")
    ) {
      uid = utils.norm(
        String(row._id).split("__solo__").pop()
      );
    }

    return uid;
  }

  function participantNameFromRow(row) {
    if (!row) return "";

    const first = utils.norm(row.firstName);
    const last = utils.norm(row.lastName);

    if (first && last) {
      return `${first} ${last}`;
    }

    const name = utils.norm(
      row.participantName ||
      row.fullName ||
      row.userName
    );

    if (name) return name;

    if (row._profileName) {
      return utils.norm(row._profileName);
    }

    const display = utils.norm(row.displayName);

    const teamName = utils.norm(
      row.teamName ||
      row.team
    );

    if (display && display !== teamName) {
      return display;
    }

    const captain = utils.norm(row.captain);

    if (captain && captain !== teamName) {
      return captain;
    }

    return "";
  }

  function displayRowName(row) {
    if (isSoloMode()) {
      return participantNameFromRow(row) || "Учасник";
    }

    return utils.norm(
      row?.teamName ||
      row?.team ||
      row?.name
    ) || "Команда";
  }

  function entityIdForRow(row) {
    return isSoloMode()
      ? rowUid(row) || utils.norm(row?._id)
      : utils.norm(row?.teamId);
  }

  // =====================================================
  // FIRESTORE
  // =====================================================

  const firestore = {

    // ===================================================
    // LOAD STAGES
    // ===================================================

    async loadStagesToSelect() {
      if (!els.stageSelect) return;

      const keep =
        els.stageSelect.value ||
        utils.loadStageFromLS();

      els.stageSelect.innerHTML =
        `<option value="">Завантаження…</option>`;

      state.stageNameByKey.clear();
      state.stageMetaByKey.clear();

      const items = [];

      const snap = await db
        .collection(CONFIG.COLLECTIONS.COMPETITIONS)
        .get();

      snap.forEach(docSnap => {
        const competition = docSnap.data() || {};

        const compId = docSnap.id;

        const brand =
          competition.brand || "STOLAR CARP";

        const year = utils.yearFrom(
          competition.year ||
          competition.seasonYear ||
          compId
        );

        const compTitle =
          competition.name ||
          competition.title ||
          (year ? `Season ${year}` : compId);

        const lakeId = utils.norm(
          competition.lakeId ||
          competition.waterbodyId ||
          competition.waterId ||
          competition.lake?.id ||
          ""
        );

        const events = Array.isArray(
          competition.events
        )
          ? competition.events
          : [];

        function addStage(event, index, fallback = false) {
          const key = fallback
            ? "main"
            : eventKey(event, index);

          const title = fallback
            ? ""
            : eventTitle(event, index);

          const label = fallback
            ? `${brand} · ${compTitle}`
            : `${brand} · ${compTitle} — ${title}`;

          const value = `${compId}||${key}`;

          const entryType = resolveCompetitionEntryType(
            competition,
            event,
            key
          );

          const format = normalizeFormat(
            event?.format ||
            event?.engine?.baseFormat ||
            competition.format ||
            competition.engine?.baseFormat ||
            "classic"
          );

          const stageYear = utils.yearFrom(
            event?.year ||
            event?.seasonYear ||
            year
          );

          const stageLakeId = utils.norm(
            event?.lakeId ||
            event?.waterbodyId ||
            event?.waterId ||
            lakeId
          );

          items.push({ value, label });

          state.stageNameByKey.set(value, label);

          state.stageMetaByKey.set(value, {
            compId,
            stageKey: key,
            entryType,
            format,
            isFinal: isFinalEvent(event, key),
            year: stageYear,
            lakeId: stageLakeId
          });
        }

        if (events.length) {
          events.forEach((event, index) => {
            addStage(event, index);
          });

        } else {
          addStage(null, 0, true);
        }
      });

      items.sort((a, b) =>
        a.label.localeCompare(b.label, "uk")
      );

      els.stageSelect.innerHTML =
        `<option value="">— Оберіть —</option>` +
        items.map(item => `
          <option value="${utils.esc(item.value)}">
            ${utils.esc(item.label)}
          </option>
        `).join("");

      if (keep) {
        const found = Array.from(
          els.stageSelect.options
        ).some(option => option.value === keep);

        if (found) {
          els.stageSelect.value = keep;
        }
      }
    },

    // ===================================================
    // NORMALIZE REGISTRATION
    // ===================================================

    normalizeReg(id, data, source) {
      const row = data || {};

      let uid = utils.norm(
        row.uid ||
        row.participantUid ||
        row.userId ||
        row.registeredByUid
      );

      if (!uid && String(id).includes("__solo__")) {
        uid = utils.norm(
          String(id).split("__solo__").pop()
        );
      }

      return {
        _id: id,
        _source: source,

        status: utils.lower(row.status),
        entryType: utils.lower(row.entryType),

        uid,

        participantUid: utils.norm(row.participantUid),
        userId: utils.norm(row.userId),
        registeredByUid: utils.norm(row.registeredByUid),

        participantName: utils.norm(row.participantName),
        firstName: utils.norm(row.firstName),
        lastName: utils.norm(row.lastName),
        fullName: utils.norm(row.fullName),
        userName: utils.norm(row.userName),
        displayName: utils.norm(row.displayName),

        teamId: utils.norm(row.teamId),

        teamName: utils.norm(
          row.teamName ||
          row.team ||
          row.name
        ),

        captain: utils.norm(
          row.captain ||
          row.captainName
        ),

        phone: utils.norm(
          row.phone ||
          row.captainPhone
        ),

        compId: utils.norm(
          utils.getCompIdFromReg(row)
        ),

        stageId: utils.getStageIdFromReg(row),

        drawKey: utils.normalizeDrawKey(
          row.drawKey
        ),

        drawZone: utils.norm(
          row.drawZone ||
          row.zone
        ),

        drawSector:
          row.drawSector ??
          row.sector ??
          null,

        lakeId: utils.norm(row.lakeId),

        lakeSectorNumber:
          physicalSectorNumber(
            row.lakeSectorNumber
          ),

        bigFishTotal: !!(
          row.bigFishTotal ||
          row.bigfishTotal
        )
      };
    },

    // ===================================================
    // LOAD CONFIRMED
    // ===================================================

    async loadAllConfirmed() {
      utils.setMsg(
        "Завантаження підтверджених заявок…"
      );

      const byId = new Map();

      const existingRegistrationIds = new Set();

      const regSnap = await db
        .collection(CONFIG.COLLECTIONS.REGISTRATIONS)
        .get();

      regSnap.forEach(docSnap => {
        const raw = docSnap.data() || {};

        existingRegistrationIds.add(docSnap.id);

        if (utils.lower(raw.status) !== "confirmed") {
          return;
        }

        byId.set(
          docSnap.id,
          this.normalizeReg(
            docSnap.id,
            raw,
            "registrations"
          )
        );
      });

      const pubSnap = await db
        .collection(
          CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS
        )
        .get();

      pubSnap.forEach(docSnap => {
        const raw = docSnap.data() || {};

        const privateExists =
          existingRegistrationIds.has(docSnap.id);

        if (privateExists) {
          if (!byId.has(docSnap.id)) {
            return;
          }

          const current = byId.get(docSnap.id);

          const pubRow = this.normalizeReg(
            docSnap.id,
            raw,
            "public_participants"
          );

          [
            "uid",
            "participantUid",
            "userId",
            "registeredByUid",
            "participantName",
            "firstName",
            "lastName",
            "fullName",
            "userName",
            "displayName"
          ].forEach(key => {
            if (!current[key] && pubRow[key]) {
              current[key] = pubRow[key];
            }
          });

          if (!current.drawKey && pubRow.drawKey) {
            current.drawKey = pubRow.drawKey;
            current.drawZone = pubRow.drawZone;
            current.drawSector = pubRow.drawSector;

            current.lakeId = pubRow.lakeId;

            current.lakeSectorNumber =
              pubRow.lakeSectorNumber;
          }

          if (
            !current.bigFishTotal &&
            pubRow.bigFishTotal
          ) {
            current.bigFishTotal = true;
          }

          return;
        }

        if (utils.lower(raw.status) !== "confirmed") {
          return;
        }

        byId.set(
          docSnap.id,
          this.normalizeReg(
            docSnap.id,
            raw,
            "public_participants"
          )
        );
      });

      const rows = Array.from(byId.values());

      await Promise.all(
        rows.map(async row => {
          const uid = rowUid(row);

          if (!uid) return;

          if (participantNameFromRow(row)) {
            return;
          }

          row._profileName =
            await getUserNameByUid(uid);
        })
      );

      state.regsAllConfirmed = rows;

      utils.setMsg("");
    },

    // ===================================================
    // PRIVATE REGISTRATION
    // ===================================================

    async restoreOrSaveRegistration(args) {
      const {
        docId,
        reg,
        compId,
        stageKey,
        sectorVal,
        zone,
        sectorNum,
        bigFish,
        ts
      } = args;

      const solo = isSoloMode();

      const uid = rowUid(reg);

      const participantName =
        participantNameFromRow(reg) || "Учасник";

      const base = {
        status: "confirmed",

        competitionId: compId,
        stageId: stageKey || "main",

        entryType: solo
          ? ENTRY_SOLO
          : ENTRY_TEAM,

        bigFishTotal: bigFish,

        drawAt: ts
      };

      if (reg._source === "public_participants") {
        base.restoredAt = ts;
      }

      if (solo) {
        base.uid = uid || docId;
        base.participantName = participantName;
        base.displayName = participantName;
        base.teamId = null;
        base.teamName = null;

      } else {
        base.teamId = reg.teamId || "";
        base.teamName = reg.teamName || "";
        base.captain = reg.captain || "";
        base.phone = reg.phone || "";
      }

      const ref = db
        .collection(CONFIG.COLLECTIONS.REGISTRATIONS)
        .doc(docId);

      if (!sectorVal) {
        await ref.set(
          {
            ...base,

            drawKey: FV.delete(),
            drawZone: FV.delete(),
            drawSector: FV.delete(),

            lakeSectorNumber: FV.delete(),
            lakeId: FV.delete()
          },
          { merge: true }
        );

        return;
      }

      const physical = physicalSectorFor(sectorVal);

      const lakeId = currentLakeId();

      const payload = {
        ...base,

        drawKey: sectorVal,
        drawZone: zone,
        drawSector: sectorNum,

        lakeSectorNumber:
          physical ?? FV.delete(),

        lakeId:
          physical !== null && lakeId
            ? lakeId
            : FV.delete()
      };

      await ref.set(payload, { merge: true });
    },

    // ===================================================
    // PUBLIC MIRROR
    // ===================================================

    async publishPublicParticipant(args) {
      const {
        docId,
        reg,
        compId,
        stageKey,
        sectorVal,
        zone,
        sectorNum,
        bigFish,
        ts
      } = args;

      const solo = isSoloMode();

      const uid = rowUid(reg);

      const participantName =
        participantNameFromRow(reg) || "Учасник";

      const base = {
        status: "confirmed",

        competitionId: compId,
        stageId: stageKey || "main",

        entryType: solo
          ? ENTRY_SOLO
          : ENTRY_TEAM,

        bigFishTotal: bigFish,

        drawAt: ts
      };

      if (solo) {
        base.uid = uid || docId;
        base.participantName = participantName;
        base.displayName = participantName;
        base.teamId = null;
        base.teamName = null;

      } else {
        base.teamId = reg.teamId || "";
        base.teamName = reg.teamName || "";
        base.captain = reg.captain || "";
      }

      const ref = db
        .collection(
          CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS
        )
        .doc(docId);

      if (!sectorVal) {
        await ref.set(
          {
            ...base,

            drawKey: FV.delete(),
            drawZone: FV.delete(),
            drawSector: FV.delete(),

            lakeSectorNumber: FV.delete(),
            lakeId: FV.delete()
          },
          { merge: true }
        );

        return;
      }

      const physical = physicalSectorFor(sectorVal);

      const lakeId = currentLakeId();

      await ref.set(
        {
          ...base,

          drawKey: sectorVal,
          drawZone: zone,
          drawSector: sectorNum,

          lakeSectorNumber:
            physical ?? FV.delete(),

          lakeId:
            physical !== null && lakeId
              ? lakeId
              : FV.delete()
        },
        { merge: true }
      );
    },

    // ===================================================
    // STAGE RESULTS
    // ===================================================

    async publishStageResultsTeams() {
      if (!state.isAdmin) return;

      const selVal = utils.currentStageValue();

      if (!selVal) return;

      const {
        compId,
        stageKey
      } = utils.parseStageValue(selVal);

      if (!compId) return;

      const solo = isSoloMode();

      const docId = stageResultsDocId(
        compId,
        stageKey
      );

      const stageName =
        state.stageNameByKey.get(selVal) || "";

      const stageRef = db
        .collection(CONFIG.COLLECTIONS.STAGE_RESULTS)
        .doc(docId);

      const oldSnap = await stageRef.get();

      const oldStage = oldSnap.exists
        ? oldSnap.data() || {}
        : {};

      /*
       * Не дозволяємо випадково
       * перезаписати архівний етап
       * через жеребкування.
       */
      if (oldStage.archived === true) {
        throw new Error(
          "Етап уже архівований. " +
          "Жеребкування не може повторно відкрити його LIVE."
        );
      }

      const oldTeams = Array.isArray(
        oldStage.teams
      )
        ? oldStage.teams
        : [];

      function findOldRow(reg) {
        if (solo) {
          const uid = rowUid(reg);
          const entityId = entityIdForRow(reg);

          return oldTeams.find(row => {
            if (!row) return false;

            if (
              uid &&
              utils.norm(row.uid) === uid
            ) {
              return true;
            }

            if (
              entityId &&
              utils.norm(row.entityId) === entityId
            ) {
              return true;
            }

            if (
              reg.teamId &&
              utils.norm(row.teamId) ===
                utils.norm(reg.teamId)
            ) {
              return true;
            }

            return false;
          }) || null;
        }

        const teamId = utils.norm(reg.teamId);

        return oldTeams.find(row =>
          utils.norm(row?.teamId) === teamId
        ) || null;
      }

      const stageRows =
        getCurrentStageConfirmedRows();

      const teams = stageRows.map(reg => {
        const drawKey = utils.normalizeDrawKey(
          reg.drawKey
        );

        const zone = drawKey
          ? drawKey[0]
          : null;

        const sector = drawKey
          ? Number(drawKey.slice(1))
          : null;

        const previous = findOldRow(reg) || {};

        const physical = drawKey
          ? physicalSectorFor(drawKey)
          : null;

        const lakeId =
          physical !== null
            ? currentLakeId()
            : null;

        const common = {
          ...previous,

          regId: reg._id,

          drawKey: drawKey || null,
          drawZone: zone,
          drawSector: sector,

          zone,
          sector,

          lakeId,

          lakeSectorNumber: physical,

          bigFishTotal: !!reg.bigFishTotal
        };

        if (solo) {
          const uid = rowUid(reg) || reg._id;

          const participantName =
            participantNameFromRow(reg) ||
            "Учасник";

          return {
            ...common,

            entryType: ENTRY_SOLO,

            entityId: uid,
            uid,

            participantName,
            displayName: participantName,

            teamId: null,
            teamName: null,
            team: null
          };
        }

        return {
          ...common,

          entryType: ENTRY_TEAM,

          entityId: utils.norm(reg.teamId),

          teamId: utils.norm(reg.teamId),

          teamName: reg.teamName || "",
          team: reg.teamName || ""
        };
      });

      // =================================================
      // BIG FISH TOTAL
      // =================================================

      const oldBigFish = Array.isArray(
        oldStage.bigFishTotal
      )
        ? oldStage.bigFishTotal
        : [];

      const bigFishTotal = teams
        .filter(row => row.bigFishTotal)
        .map(row => {
          const previous = oldBigFish.find(old => {
            return utils.norm(old?.entityId) ===
              utils.norm(row.entityId);
          }) || {};

          if (solo) {
            return {
              ...previous,

              regId: row.regId,
              entryType: ENTRY_SOLO,

              entityId: row.entityId,
              uid: row.uid,

              participantName: row.participantName,
              displayName: row.participantName,

              teamId: null,
              team: row.participantName,

              big1Day: previous.big1Day ?? null,
              big2Day: previous.big2Day ?? null,
              maxBig: previous.maxBig ?? null,
              isMax: previous.isMax ?? false
            };
          }

          return {
            ...previous,

            regId: row.regId,
            entryType: ENTRY_TEAM,

            entityId: row.teamId,
            teamId: row.teamId,

            team: row.teamName,
            teamName: row.teamName,

            big1Day: previous.big1Day ?? null,
            big2Day: previous.big2Day ?? null,
            maxBig: previous.maxBig ?? null,
            isMax: previous.isMax ?? false
          };
        });

      const ts = FV.serverTimestamp();

      // =================================================
      // SAVE LIVE
      // =================================================

      const payload = {
        compId,

        stageId: stageKey || "main",
        stageKey: stageKey || "main",

        entryType: solo
          ? ENTRY_SOLO
          : ENTRY_TEAM,

        stageName,

        updatedAt: ts,

        teams,

        bigFishTotal,

        zones: {
          A: [],
          B: [],
          C: []
        },

        total: Array.isArray(oldStage.total)
          ? oldStage.total
          : [],

        archived: false,
        isLive: true,
        isActive: true
      };

      /*
       * Інформація про карту.
       * Відсутність карти не ламає LIVE.
       */
      if (state.sectorMap) {
        payload.lakeId = state.sectorMap.lakeId;

        payload.sectorMapYear =
          state.sectorMap.year;

        payload.sectorMapStageId =
          state.sectorMap.stageDocId;

        payload.sectorMapEnabled = true;

      } else {
        payload.sectorMapEnabled = false;
      }

      await stageRef.set(
        payload,
        { merge: true }
      );

      // =================================================
      // SETTINGS / APP
      // =================================================

      await db
        .collection(CONFIG.COLLECTIONS.SETTINGS)
        .doc("app")
        .set(
          {
            activeKey: docId,

            activeStageResultsId: docId,

            activeCompetitionId: compId,

            activeStageId: stageKey || "main",

            activeStageTitle: stageName,

            liveClosed: false,

            updatedAt: ts
          },
          { merge: true }
        );
    }
  };

  // =====================================================
  // FILTERS
  // =====================================================

  const filters = {

    rebuildUsedSectors() {
      state.usedSectorSet = new Set();

      getCurrentStageConfirmedRows().forEach(row => {
        const key = utils.normalizeDrawKey(
          row.drawKey
        );

        if (key) {
          state.usedSectorSet.add(key);
        }
      });
    },

    apply() {
      const {
        compId
      } = utils.parseStageValue(
        utils.currentStageValue()
      );

      if (!compId) {
        state.regsFiltered = [];
        state.usedSectorSet = new Set();

        render.list();

        if (els.countInfo) {
          els.countInfo.textContent = "";
        }

        return;
      }

      const stageRows =
        getCurrentStageConfirmedRows();

      state.regsFiltered = [...stageRows];

      const q = utils.lower(
        els.qInput?.value
      );

      if (q) {
        state.regsFiltered =
          state.regsFiltered.filter(row => {
            const text = utils.lower(
              `${displayRowName(row)} ${
                row.teamName || ""
              } ${
                row.phone || ""
              } ${
                row.captain || ""
              }`
            );

            return text.includes(q);
          });
      }

      state.regsFiltered.sort((a, b) => {
        const sa = utils.parseSector(a.drawKey);
        const sb = utils.parseSector(b.drawKey);

        if (sa && !sb) return -1;
        if (!sa && sb) return 1;

        if (!sa && !sb) {
          return displayRowName(a).localeCompare(
            displayRowName(b),
            "uk"
          );
        }

        return (
          utils.zoneRank(sa.z) -
            utils.zoneRank(sb.z) ||
          sa.n - sb.n ||
          displayRowName(a).localeCompare(
            displayRowName(b),
            "uk"
          )
        );
      });

      this.rebuildUsedSectors();

      render.list();

      if (els.countInfo) {
        const total = stageRows.length;

        const visible = state.regsFiltered.length;

        const restored = stageRows.filter(
          row =>
            row._source === "public_participants"
        ).length;

        const label = isSoloMode()
          ? "учасників"
          : "команд";

        let text = q
          ? `Знайдено: ${visible} із ${total} ${label}`
          : `Для вибраного: ${total} ${label} · підтверджено: ${total}`;

        if (restored) {
          text += ` · до відновлення: ${restored}`;
        }

        if (state.sectorMap) {
          text +=
            ` · карта: ${
              state.availableSectors.length
            } секторів`;
        }

        els.countInfo.textContent = text;
      }
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  const render = {

    sectorOptionsHTML(currentValue, docId) {
      const current = utils.normalizeDrawKey(
        currentValue
      );

      /*
       * Якщо старий сектор уже збережений,
       * але його немає у новій карті,
       * показуємо його окремо.
       *
       * Це не дозволяє випадково
       * втратити старе жеребкування.
       */
      const sectors = [
        ...state.availableSectors
      ];

      if (
        current &&
        !sectors.includes(current)
      ) {
        sectors.push(current);
        sectors.sort(
          utils.sectorCompare.bind(utils)
        );
      }

      const disabled =
        state.sectorMapLoading ||
        !!state.sectorMapError;

      return `
        <select
          class="select sectorPick"
          data-docid="${utils.esc(docId)}"
          ${disabled ? "disabled" : ""}
        >
          <option value="">
            — Оберіть сектор —
          </option>

          ${sectors.map(sector => {
            const taken =
              state.usedSectorSet.has(sector) &&
              sector !== current;

            const physical =
              physicalSectorFor(sector);

            const outsideMap =
              !!state.sectorMap &&
              !state.availableSectors.includes(sector);

            const description =
              physical !== null
                ? ` · озеро №${physical}`
                : outsideMap
                  ? " · поза картою"
                  : "";

            return `
              <option
                value="${utils.esc(sector)}"
                ${sector === current ? "selected" : ""}
                ${taken || outsideMap ? "disabled" : ""}
              >
                ${utils.esc(
                  sector +
                  description +
                  (taken ? " (зайнято)" : "")
                )}
              </option>
            `;
          }).join("")}
        </select>
      `;
    },

    rowHTML(row) {
      const name = displayRowName(row);

      const solo = isSoloMode();

      const meta = solo
        ? rowUid(row) || row._id
        : row.teamId || row._id;

      const physical = physicalSectorFor(
        row.drawKey
      );

      const physicalLabel =
        physical !== null
          ? `Фізичний сектор №${physical}`
          : "";

      return `
        <div
          class="draw-row"
          data-docid="${utils.esc(row._id)}"
        >

          <div class="draw-team">

            ${utils.esc(name)}

            ${
              solo
                ? `<span class="muted"> · SOLO</span>`
                : ""
            }

            ${
              row._source === "public_participants"
                ? `<span class="muted"> · буде відновлено</span>`
                : ""
            }

            <div
              class="muted"
              style="
                font-size:10px;
                margin-top:2px;
                word-break:break-all;
              "
            >
              ${utils.esc(meta)}
            </div>

            ${
              physicalLabel
                ? `
                  <div
                    style="
                      font-size:11px;
                      color:#8fe39a;
                      margin-top:4px;
                    "
                  >
                    ${utils.esc(physicalLabel)}
                  </div>
                `
                : ""
            }

          </div>

          ${this.sectorOptionsHTML(
            row.drawKey,
            row._id
          )}

          <input
            type="checkbox"
            class="chk bigFishChk"
            ${row.bigFishTotal ? "checked" : ""}
          >

          <button
            class="btn-icon saveBtnRow"
            type="button"
            title="Зберегти"
            ${
              state.sectorMapLoading ||
              state.sectorMapError
                ? "disabled"
                : ""
            }
          >
            💾
          </button>

          <div class="rowMsg"></div>

        </div>
      `;
    },

    list() {
      if (!els.drawRows) return;

      if (state.sectorMapLoading) {
        els.drawRows.innerHTML = `
          <div class="muted" style="padding:12px;">
            Завантаження карти секторів…
          </div>
        `;

        return;
      }

      if (state.sectorMapError) {
        els.drawRows.innerHTML = `
          <div
            style="
              color:#ff6c6c;
              padding:12px;
            "
          >
            ${utils.esc(state.sectorMapError)}
          </div>
        `;

        return;
      }

      if (!state.regsFiltered.length) {
        els.drawRows.innerHTML = `
          <div class="muted" style="padding:12px 2px;">
            ${
              isSoloMode()
                ? "Нема учасників для жеребкування."
                : "Нема команд для жеребкування."
            }
          </div>
        `;

        return;
      }

      els.drawRows.innerHTML = `
        <div class="draw-wrap">
          ${
            state.regsFiltered
              .map(row => this.rowHTML(row))
              .join("")
          }
        </div>
      `;
    },

    showRowMsg(wrap, message, ok = true) {
      const el = wrap?.querySelector(".rowMsg");

      if (!el) return;

      el.textContent = message || "";

      el.classList.toggle("ok", !!ok);
      el.classList.toggle("err", !ok);
    },

    setRowState(wrap, stateName) {
      if (!wrap) return;

      wrap.classList.remove(
        "is-saving",
        "is-ok",
        "is-err"
      );

      if (stateName) {
        wrap.classList.add(stateName);
      }
    },

    setBtnIcon(wrap, icon) {
      const btn = wrap?.querySelector(".saveBtnRow");

      if (!btn) return;

      btn.textContent =
        icon === "saving"
          ? "⏳"
          : icon === "ok"
            ? "✅"
            : icon === "err"
              ? "⚠️"
              : "💾";
    }
  };

  // =====================================================
  // HANDLERS
  // =====================================================

  const handlers = {

    async saveRow(event) {
      const btn = event.target.closest(
        ".saveBtnRow"
      );

      if (!btn) return;

      const wrap = btn.closest(".draw-row");

      if (!wrap) return;

      if (!state.isAdmin) {
        render.showRowMsg(
          wrap,
          "Нема адмін-доступу",
          false
        );

        return;
      }

      if (
        state.sectorMapLoading ||
        state.sectorMapError
      ) {
        render.showRowMsg(
          wrap,
          "Карта ще не готова.",
          false
        );

        return;
      }

      const selVal = utils.currentStageValue();

      const {
        compId,
        stageKey
      } = utils.parseStageValue(selVal);

      if (!compId) {
        utils.setMsg(
          "Оберіть змагання/етап.",
          false
        );

        return;
      }

      const docId = wrap.getAttribute("data-docid");

      if (!docId) return;

      if (state.savingRows.has(docId)) {
        return;
      }

      const sectorVal = utils.normalizeDrawKey(
        wrap.querySelector(".sectorPick")?.value
      );

      const bigFish = !!wrap.querySelector(
        ".bigFishChk"
      )?.checked;

      const reg = state.regsAllConfirmed.find(
        row => row._id === docId
      );

      if (!reg) {
        utils.setMsg(
          "Заявку не знайдено.",
          false
        );

        return;
      }

      // =================================================
      // VALIDATE SECTOR
      // =================================================

      if (
        sectorVal &&
        !state.availableSectors.includes(sectorVal)
      ) {
        render.showRowMsg(
          wrap,
          "Цей сектор відсутній у підготовленій карті.",
          false
        );

        return;
      }

      const other = sectorVal
        ? getCurrentStageConfirmedRows().find(
            row =>
              utils.normalizeDrawKey(row.drawKey) ===
                sectorVal &&
              row._id !== docId
          )
        : null;

      if (other) {
        render.showRowMsg(
          wrap,
          `Зайнято: ${displayRowName(other)}`,
          false
        );

        return;
      }

      const zone = sectorVal
        ? sectorVal[0]
        : null;

      const sectorNum = sectorVal
        ? Number(sectorVal.slice(1))
        : null;

      const physical = sectorVal
        ? physicalSectorFor(sectorVal)
        : null;

      if (
        state.sectorMap &&
        sectorVal &&
        physical === null
      ) {
        render.showRowMsg(
          wrap,
          "Не знайдено фізичний сектор на карті.",
          false
        );

        return;
      }

      const ts = FV.serverTimestamp();

      const args = {
        docId,
        reg,
        compId,
        stageKey,
        sectorVal,
        zone,
        sectorNum,
        bigFish,
        ts
      };

      state.savingRows.add(docId);

      try {
        render.setRowState(wrap, "is-saving");

        render.setBtnIcon(wrap, "saving");

        render.showRowMsg(
          wrap,
          sectorVal
            ? "Збереження…"
            : "Очищення…"
        );

        /*
         * Спершу перевіряємо, чи LIVE
         * не позначено як архівний.
         */
        const stageDocId = stageResultsDocId(
          compId,
          stageKey
        );

        const stageSnap = await db
          .collection(CONFIG.COLLECTIONS.STAGE_RESULTS)
          .doc(stageDocId)
          .get();

        if (
          stageSnap.exists &&
          stageSnap.data()?.archived === true
        ) {
          throw new Error(
            "Цей етап уже архівований. " +
            "Змінювати жеребкування заборонено."
          );
        }

        await firestore.restoreOrSaveRegistration(args);

        await firestore.publishPublicParticipant(args);

        // =================================================
        // LOCAL STATE
        // =================================================

        reg._source = "registrations";
        reg.status = "confirmed";

        reg.compId = compId;
        reg.stageId = stageKey || "main";

        reg.drawKey = sectorVal || "";
        reg.drawZone = zone || "";
        reg.drawSector = sectorNum;

        reg.lakeSectorNumber = physical;

        reg.lakeId =
          physical !== null
            ? currentLakeId() || ""
            : "";

        reg.bigFishTotal = bigFish;

        if (isSoloMode()) {
          reg.entryType = ENTRY_SOLO;

          reg.uid = rowUid(reg) || docId;

          reg.participantName =
            participantNameFromRow(reg) ||
            "Учасник";

          reg.displayName = reg.participantName;

          reg.teamId = "";
          reg.teamName = "";
        }

        filters.apply();

        // =================================================
        // LIVE
        // =================================================

        await firestore.publishStageResultsTeams();

        const freshWrap = Array.from(
          els.drawRows?.querySelectorAll(
            ".draw-row"
          ) || []
        ).find(
          element =>
            element.getAttribute("data-docid") ===
            docId
        );

        if (freshWrap) {
          render.setRowState(
            freshWrap,
            "is-ok"
          );

          render.setBtnIcon(
            freshWrap,
            "ok"
          );

          const text = sectorVal
            ? physical !== null
              ? `Збережено ${sectorVal} · озеро №${physical}`
              : `Збережено ${sectorVal}`
            : "Сектор очищено";

          render.showRowMsg(
            freshWrap,
            text,
            true
          );
        }

        utils.setMsg(
          sectorVal
            ? physical !== null
              ? `✅ ${sectorVal} → фізичний сектор №${physical}. LIVE оновлено.`
              : "✅ Жеребкування збережено. LIVE оновлено."
            : "✅ Сектор очищено. LIVE оновлено.",
          true
        );

        utils.saveStageToLS(selVal);

      } catch (error) {
        console.error(
          "[draw_admin] save:",
          error
        );

        /*
         * Якщо приватна заявка вже
         * записана, але наступний крок
         * завершився помилкою,
         * перечитуємо дані з Firestore.
         */
        try {
          await firestore.loadAllConfirmed();
          filters.apply();
        } catch (reloadError) {
          console.error(
            "[draw_admin] reload:",
            reloadError
          );
        }

        utils.setMsg(
          `Помилка збереження: ${
            error?.message || error?.code || "невідома"
          }`,
          false
        );

      } finally {
        state.savingRows.delete(docId);
      }
    }
  };

  // =====================================================
  // STAGE CHANGE
  // =====================================================

  async function onStageChanged() {
    utils.saveStageToLS(
      utils.currentStageValue()
    );

    await loadSectorMapForCurrentStage();
  }

  // =====================================================
  // EVENTS
  // =====================================================

  function bindEvents() {
    document.addEventListener(
      "click",
      event => handlers.saveRow(event)
    );

    els.stageSelect?.addEventListener(
      "change",
      onStageChanged
    );

    els.qInput?.addEventListener(
      "input",
      () => filters.apply()
    );
  }

  // =====================================================
  // BOOT
  // =====================================================

  function boot() {
    auth.onAuthStateChanged(async user => {
      state.isAdmin = false;

      state.sectorMapRequestId++;

      state.sectorMap = null;
      state.sectorMapError = "";
      state.sectorMapLoading = false;

      state.availableSectors = [
        ...LEGACY_SECTORS
      ];

      if (!user) {
        utils.setMsg(
          "Увійдіть як адмін.",
          false
        );

        if (els.stageSelect) {
          els.stageSelect.innerHTML = `
            <option value="">
              Увійдіть як адмін
            </option>
          `;
        }

        state.regsAllConfirmed = [];
        state.regsFiltered = [];
        state.usedSectorSet = new Set();

        render.list();
        return;
      }

      try {
        state.isAdmin = await requireAdmin(user);

        if (!state.isAdmin) {
          utils.setMsg(
            "Доступ заборонено. Цей акаунт не адмін.",
            false
          );

          state.regsAllConfirmed = [];
          state.regsFiltered = [];
          state.usedSectorSet = new Set();

          render.list();
          return;
        }

        await firestore.loadStagesToSelect();

        await firestore.loadAllConfirmed();

        const saved = utils.loadStageFromLS();

        if (saved && els.stageSelect) {
          const found = Array.from(
            els.stageSelect.options
          ).some(option => option.value === saved);

          if (found) {
            els.stageSelect.value = saved;
          }
        }

        if (els.stageSelect?.value) {
          await loadSectorMapForCurrentStage();

        } else {
          utils.setMsg(
            "Оберіть змагання/етап."
          );

          filters.apply();
        }

      } catch (error) {
        console.error(
          "[draw_admin] boot:",
          error
        );

        utils.setMsg(
          `Помилка завантаження: ${
            error?.message || error?.code || "невідома"
          }`,
          false
        );
      }
    });
  }

  bindEvents();
  boot();

})();

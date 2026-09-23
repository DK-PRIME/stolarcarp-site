
// assets/js/participation.js
// STOLAR CARP • Participation list
//
// ✅ TEAM + SOLO
// ✅ TEAM -> назва команди
// ✅ SOLO -> повністю Прізвище Ім'я
// ✅ middleName / по батькові не показуємо
// ✅ legacy SOLO names
// ✅ Stalker Solo -> SOLO
// ✅ Stalker Teams -> TEAM
// ✅ Final -> TEAM
// ✅ TEAM popup
// ✅ meal buttons / meal context
//
// ✅ НОВА ЛОГІКА ОПЛАТИ:
//    • номеруються тільки оплачені
//    • резерв рахується тільки серед оплачених
//    • неоплачені та скасовані — окремо, без номерів
//    • скасування звільняє місце в основному списку
//    • повторне підтвердження повертає в оплачені
//    • LIVE-оновлення з public_participants
//
// ✅ без додаткового Firestore index по entryType

(function () {
  "use strict";

  const $ = id =>
    document.getElementById(id);

  const esc = value =>
    String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );

  const norm = value =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const normLower = value =>
    norm(value).toLowerCase();

  const PAID_STATUSES = new Set([
    "confirmed",
    "paid",
    "payment_confirmed"
  ]);

  const ALLOWED_STATUSES = new Set([
    ...PAID_STATUSES,
    "pending_payment",
    "cancelled"
  ]);

  const userNameCache = new Map();

  let unsubParticipants = null;
  let renderRequestId = 0;

  // =========================================================
  // STATUS
  // =========================================================

  function isPaidStatus(status) {
    return PAID_STATUSES.has(
      normLower(status)
    );
  }

  function isCancelledStatus(status) {
    return normLower(status) === "cancelled";
  }

  // =========================================================
  // FIREBASE
  // =========================================================

  async function waitFirebase(maxMs = 12000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxMs) {
      if (window.scDb) {
        return;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 100)
      );
    }

    throw new Error(
      "Firestore не готовий (нема scDb)"
    );
  }

  // =========================================================
  // ENTRY TYPE
  // =========================================================

  function resolveCompetitionEntryType(
    competition,
    event
  ) {
    const explicit = normLower(
      event?.entryType ||
      competition?.entryType ||
      ""
    );

    if (
      explicit === "solo" ||
      explicit === "team"
    ) {
      return explicit;
    }

    const format = normLower(
      event?.format ||
      event?.engine?.baseFormat ||
      competition?.format ||
      competition?.engine?.baseFormat ||
      ""
    )
      .replace(/\s+/g, "")
      .replace(/_/g, "-");

    return format === "stalker-solo"
      ? "solo"
      : "team";
  }

  function isFinalMeta(event, stageId) {
    const key = normLower(
      event?.key ||
      event?.stageId ||
      event?.id ||
      stageId ||
      ""
    );

    const title = normLower(
      [
        event?.title,
        event?.name,
        event?.label
      ].filter(Boolean).join(" ")
    );

    return (
      event?.isFinal === true ||
      key.includes("final") ||
      key.includes("фінал") ||
      title.includes("final") ||
      title.includes("фінал")
    );
  }

  function resolveRowEntryType(row, meta) {
    const explicit = normLower(
      row?.entryType
    );

    // Фінал завжди TEAM.
    if (meta.isFinal) {
      return "team";
    }

    // SOLO-формат має пріоритет над legacy TEAM.
    if (meta.entryType === "solo") {
      return "solo";
    }

    if (
      explicit === "solo" ||
      explicit === "team"
    ) {
      return explicit;
    }

    if (
      !norm(row?.teamId) &&
      (
        norm(row?.participantName) ||
        norm(row?.displayName)
      )
    ) {
      return "solo";
    }

    return "team";
  }

  // =========================================================
  // COMPETITION META
  // =========================================================

  async function getCompetitionMeta(
    compId,
    stageId
  ) {
    const db = window.scDb;

    let title = "Змагання";
    let stageTitle = "";
    let entryType = "team";
    let format = "classic";

    let competition = {};
    let event = null;

    try {
      const snap = await db
        .collection("competitions")
        .doc(compId)
        .get();

      if (snap.exists) {
        competition = snap.data() || {};

        title =
          competition.name ||
          competition.title ||
          title;

        const events = Array.isArray(
          competition.events
        )
          ? competition.events
          : [];

        const wantedStage =
          norm(stageId) || "main";

        event = events.find(item => {
          const key = norm(
            item?.key ||
            item?.stageId ||
            item?.id
          );

          return key === wantedStage;
        }) || null;

        if (event) {
          stageTitle = norm(
            event.title ||
            event.name ||
            event.label ||
            ""
          );
        }

        entryType = resolveCompetitionEntryType(
          competition,
          event
        );

        format = normLower(
          event?.format ||
          event?.engine?.baseFormat ||
          competition.format ||
          competition.engine?.baseFormat ||
          "classic"
        );
      }

    } catch (error) {
      console.warn(
        "[participation] competition meta:",
        error
      );
    }

    const isFinal = isFinalMeta(
      event,
      stageId
    );

    if (isFinal) {
      entryType = "team";
    }

    return {
      title: norm(title) || "Змагання",
      stageTitle: norm(stageTitle),
      entryType,
      format,
      isFinal,
      competition,
      event
    };
  }

  // =========================================================
  // MAX ENTRIES
  // =========================================================

  function getMaxEntriesFromMeta(meta) {
    const c = meta.competition || {};
    const ev = meta.event || {};

    const value =
      ev.maxParticipants ??
      ev.participantsLimit ??
      ev.maxTeams ??
      ev.teamsLimit ??
      c.maxParticipants ??
      c.participantsLimit ??
      c.maxTeams ??
      c.teamsLimit ??
      null;

    const n = Number.parseInt(
      String(value ?? ""),
      10
    );

    return Number.isFinite(n) && n > 0
      ? n
      : 21;
  }

  // =========================================================
  // PERSON NAME HELPERS
  // =========================================================

  function isPlaceholderPersonName(value) {
    const raw = normLower(value);

    if (!raw) {
      return true;
    }

    if ([
      "—",
      "-",
      "учасник",
      "учасниця",
      "participant",
      "user",
      "користувач",
      "невідомо",
      "unknown",
      "команда",
      "team"
    ].includes(raw)) {
      return true;
    }

    if (/^учасник\s*\d*$/i.test(raw)) {
      return true;
    }

    if (/^participant\s*\d*$/i.test(raw)) {
      return true;
    }

    return false;
  }

  function validPersonalName(
    value,
    teamName = ""
  ) {
    const name = norm(value);
    const team = norm(teamName);

    if (isPlaceholderPersonName(name)) {
      return "";
    }

    // Назва команди не є ім'ям SOLO-учасника.
    if (
      team &&
      normLower(name) === normLower(team)
    ) {
      return "";
    }

    return name;
  }

  // =========================================================
  // STRUCTURED NAME
  // =========================================================

  function structuredPersonName(data) {
    const d = data || {};

    const firstName = validPersonalName(
      d.firstName ||
      d.givenName ||
      d.first_name ||
      ""
    );

    const lastName = validPersonalName(
      d.lastName ||
      d.surname ||
      d.familyName ||
      d.last_name ||
      ""
    );

    if (firstName && lastName) {
      return `${lastName} ${firstName}`;
    }

    return "";
  }

  // =========================================================
  // LEGACY PATRONYMIC
  // =========================================================

  function isPatronymicPart(value) {
    const s = normLower(value);

    if (!s) {
      return false;
    }

    return (
      /(?:ович|евич|євич|йович)$/i.test(s) ||
      /(?:івна|ївна|овна|евна|євна)$/i.test(s)
    );
  }

  function normalizeLegacySoloName(value) {
    const raw = norm(value);

    if (
      !raw ||
      isPlaceholderPersonName(raw)
    ) {
      return "";
    }

    const parts = raw
      .split(" ")
      .filter(Boolean);

    // Два слова не переставляємо навмання.
    if (parts.length === 2) {
      return raw;
    }

    if (parts.length === 3) {
      const patronymicIndex =
        parts.findIndex(isPatronymicPart);

      // Прізвище Ім'я По батькові.
      if (patronymicIndex === 2) {
        return `${parts[0]} ${parts[1]}`;
      }

      // Ім'я По батькові Прізвище.
      if (patronymicIndex === 1) {
        return `${parts[2]} ${parts[0]}`;
      }

      // По батькові Ім'я Прізвище.
      if (patronymicIndex === 0) {
        return `${parts[2]} ${parts[1]}`;
      }
    }

    return raw;
  }

  // =========================================================
  // PERSON NAME
  // =========================================================

  function personNameFromObject(data) {
    const d = data || {};

    const structured =
      structuredPersonName(d);

    if (structured) {
      return structured;
    }

    const teamName = norm(
      d.teamName ||
      d.team ||
      ""
    );

    const candidates = [
      d.participantName,
      d.fullName,
      d.userName,
      d.displayName,
      d.name,
      d.captain
    ];

    for (const candidate of candidates) {
      const name = validPersonalName(
        candidate,
        teamName
      );

      if (name) {
        return name;
      }
    }

    return "";
  }

  function formatSoloName(value) {
    return (
      normalizeLegacySoloName(value) ||
      "Учасник"
    );
  }

  // =========================================================
  // USER NAME FALLBACK
  // =========================================================

  async function getUserDisplayName(uid) {
    const id = norm(uid);

    if (!id) {
      return "";
    }

    if (userNameCache.has(id)) {
      return userNameCache.get(id) || "";
    }

    let name = "";

    try {
      const snap = await window.scDb
        .collection("users")
        .doc(id)
        .get();

      if (snap.exists) {
        const user = snap.data() || {};

        const structured =
          structuredPersonName(user);

        if (structured) {
          name = structured;

        } else {
          const legacy =
            personNameFromObject(user);

          name = formatSoloName(legacy);

          if (isPlaceholderPersonName(name)) {
            name = "";
          }
        }
      }

    } catch (error) {
      // Публічні користувачі можуть не мати
      // доступу до users через Firestore Rules.
      console.warn(
        "[participation] user fallback:",
        error?.message || error
      );
    }

    userNameCache.set(id, name);

    return name;
  }

  // =========================================================
  // UID
  // =========================================================

  function uidFromPublicDoc(doc, data) {
    const row = data || {};

    const direct = norm(
      row.uid ||
      row.participantUid ||
      row.userId ||
      row.registeredByUid ||
      ""
    );

    if (direct) {
      return direct;
    }

    const docId = norm(doc?.id);

    if (docId.includes("__solo__")) {
      return norm(
        docId.split("__solo__").pop()
      );
    }

    return "";
  }

  // =========================================================
  // TEAM POPUP
  // =========================================================

  async function openTeamPopup(
    teamName,
    teamDocId
  ) {
    if (!teamDocId) {
      return;
    }

    const popup = $("teamPopup");
    const title = $("teamPopupTitle");
    const body = $("teamPopupBody");

    if (!popup || !title || !body) {
      return;
    }

    title.textContent = teamName || "Команда";

    body.innerHTML =
      '<div class="team-loading">Завантаження складу…</div>';

    popup.style.display = "flex";

    try {
      const db = window.scDb;

      const teamSnap = await db
        .collection("teams")
        .doc(teamDocId)
        .get();

      if (!teamSnap.exists) {
        body.innerHTML =
          '<div class="team-loading">Команду не знайдено</div>';

        return;
      }

      const team = teamSnap.data() || {};
      const ownerUid = team.ownerUid || null;

      const members = [];
      const used = new Set();

      const usersSnap = await db
        .collection("users")
        .where("teamId", "==", teamDocId)
        .get();

      usersSnap.forEach(doc => {
        const d = doc.data() || {};

        members.push({
          id: doc.id,
          fullName:
            personNameFromObject(d) ||
            d.email ||
            "Учасник",
          role: d.role || "member",
          avatarUrl:
            d.avatarUrl ||
            d.photoURL ||
            null
        });

        used.add(doc.id);
      });

      if (ownerUid && !used.has(ownerUid)) {
        const capSnap = await db
          .collection("users")
          .doc(ownerUid)
          .get();

        if (capSnap.exists) {
          const captain = capSnap.data() || {};

          members.push({
            id: ownerUid,
            fullName:
              personNameFromObject(captain) ||
              captain.email ||
              "Капітан",
            role: "captain",
            avatarUrl:
              captain.avatarUrl ||
              captain.photoURL ||
              null
          });
        }
      }

      if (!members.length) {
        body.innerHTML =
          '<div class="team-loading">Склад команди порожній</div>';

        return;
      }

      members.sort((a, b) => {
        const aCaptain =
          a.role === "captain" ||
          a.id === ownerUid;

        const bCaptain =
          b.role === "captain" ||
          b.id === ownerUid;

        if (aCaptain && !bCaptain) return -1;
        if (bCaptain && !aCaptain) return 1;

        return (a.fullName || "").localeCompare(
          b.fullName || "",
          "uk"
        );
      });

      body.innerHTML = members.map(member => {
        const avatarHtml = member.avatarUrl
          ? `
            <div class="member-avatar">
              <img
                src="${esc(member.avatarUrl)}"
                alt=""
              >
            </div>
          `
          : `
            <div class="member-avatar">
              <div class="member-avatar-placeholder">
                👤
              </div>
            </div>
          `;

        const isCaptain =
          member.role === "captain" ||
          member.id === ownerUid;

        return `
          <div class="team-member">
            ${avatarHtml}

            <div class="member-info">
              <div class="member-name">
                ${esc(member.fullName)}
              </div>

              <div class="member-role">
                ${isCaptain ? "⭐ Капітан" : "Учасник"}
              </div>
            </div>
          </div>
        `;
      }).join("");

    } catch (error) {
      console.error(
        "[participation] team popup:",
        error
      );

      body.innerHTML = `
        <div class="team-loading">
          Помилка: ${esc(
            error?.message || error
          )}
        </div>
      `;
    }
  }

  function closeTeamPopup() {
    const popup = $("teamPopup");

    if (popup) {
      popup.style.display = "none";
    }
  }

  window.openTeamPopup = openTeamPopup;
  window.closeTeamPopup = closeTeamPopup;

  document.addEventListener("click", event => {
    if (event.target?.id === "teamPopupClose") {
      closeTeamPopup();
    }
  });

  document.addEventListener("click", event => {
    const popup = $("teamPopup");
    const content = $("teamPopupContent");

    if (
      popup?.style.display === "flex" &&
      event.target === popup &&
      !content?.contains(event.target)
    ) {
      closeTeamPopup();
    }
  });

  window.addEventListener(
    "popstate",
    closeTeamPopup
  );

  // =========================================================
  // MEAL BUTTONS
  // =========================================================

  function attachMealButtons() {
    const btnOpen = $("btnMealGateOpen");
    const btnOrder = $("btnOpenMealOrder");
    const btnList = $("btnOpenMealList");
    const btnClear = $("btnClearMealOrders");

    if (btnOpen) {
      btnOpen.onclick = () => {
        if (
          window.scMeals &&
          typeof window.scMeals.openMeals === "function"
        ) {
          window.scMeals.openMeals();
        }
      };
    }

    if (btnOrder) {
      btnOrder.onclick = () => {
        if (
          window.scMeals &&
          typeof window.scMeals.openOrder === "function"
        ) {
          window.scMeals.openOrder();
        }
      };
    }

    if (btnList) {
      btnList.onclick = () => {
        if (
          window.scMeals &&
          typeof window.scMeals.openList === "function"
        ) {
          window.scMeals.openList();
        }
      };
    }

    if (btnClear) {
      btnClear.onclick = () => {
        if (
          window.scMeals &&
          typeof window.scMeals.clearOrders === "function"
        ) {
          window.scMeals.clearOrders();
        }
      };
    }

    if (
      window.scMeals &&
      typeof window.scMeals.setContext === "function" &&
      window.scMealContext
    ) {
      window.scMeals.setContext(
        window.scMealContext
      );
    }
  }

  // =========================================================
  // STAGE MATCH
  // =========================================================

  function stageMatches(
    rowStageId,
    stageParam
  ) {
    const rowStage =
      norm(rowStageId) || "main";

    const wanted =
      norm(stageParam) || "main";

    const wantedRaw = wanted.replace(
      /^stage-/,
      ""
    );

    const rowRaw = rowStage.replace(
      /^stage-/,
      ""
    );

    return (
      rowStage === wanted ||
      rowStage === `stage-${wantedRaw}` ||
      rowRaw === wantedRaw ||
      (
        wanted === "main" &&
        rowStage === "main"
      )
    );
  }

  // =========================================================
  // DISPLAY NAMES
  // =========================================================

  function participantDisplayName(row) {
    const direct = norm(
      row?.participantName
    );

    if (
      direct &&
      !isPlaceholderPersonName(direct)
    ) {
      return formatSoloName(direct);
    }

    const structured =
      structuredPersonName(row);

    if (structured) {
      return structured;
    }

    const legacy =
      personNameFromObject(row);

    return legacy
      ? formatSoloName(legacy)
      : "Учасник";
  }

  function teamDisplayName(row) {
    return (
      norm(row?.teamName) ||
      norm(row?.displayName) ||
      "—"
    );
  }

  // =========================================================
  // NORMALIZE PUBLIC PARTICIPANT
  // =========================================================

  async function normalizeParticipantRow(
    doc,
    meta
  ) {
    const r = doc.data() || {};

    const status = normLower(
      r.status || "pending_payment"
    );

    if (!ALLOWED_STATUSES.has(status)) {
      return null;
    }

    const entryType =
      resolveRowEntryType(r, meta);

    const common = {
      participantDocId: doc.id,

      sourceEntryType:
        normLower(r.entryType),

      status,

      createdAt: r.createdAt || null,
      confirmedAt: r.confirmedAt || null,
      cancelledAt: r.cancelledAt || null,
      updatedAt: r.updatedAt || null,

      orderPaid: Number.isFinite(r.orderPaid)
        ? r.orderPaid
        : null,

      drawZone:
        r.drawZone ||
        r.zone ||
        "",

      drawSector:
        r.drawSector ||
        r.sector ||
        "",

      drawKey:
        r.drawKey ||
        (
          (
            r.drawZone ||
            r.zone
          ) &&
          (
            r.drawSector ||
            r.sector
          )
            ? `${
                r.drawZone ||
                r.zone
              }${
                r.drawSector ||
                r.sector
              }`
            : ""
        )
    };

    // =====================================================
    // SOLO
    // =====================================================

    if (entryType === "solo") {
      const uid =
        uidFromPublicDoc(doc, r);

      if (!uid) {
        return null;
      }

      const teamName = norm(
        r.teamName ||
        r.team ||
        ""
      );

      // 1. Структуроване ім'я з public_participants.
      let participantName =
        structuredPersonName(r);

      // 2. Структуроване ім'я з users.
      if (!participantName) {
        participantName =
          await getUserDisplayName(uid);
      }

      // 3. Legacy fallback.
      if (!participantName) {
        const legacy =
          personNameFromObject(r);

        if (legacy) {
          participantName =
            formatSoloName(legacy);
        }
      }

      // Назва команди ніколи не замінює SOLO-ім'я.
      if (
        teamName &&
        participantName &&
        normLower(participantName) ===
          normLower(teamName)
      ) {
        participantName = "";
      }

      if (
        !participantName ||
        isPlaceholderPersonName(participantName)
      ) {
        participantName = "Учасник";
      }

      participantName =
        formatSoloName(participantName);

      return {
        ...common,

        legacyConvertedToSolo:
          normLower(r.entryType) !== "solo",

        entryType: "solo",
        uid,

        participantName,
        displayName: participantName,

        firstName: norm(r.firstName),
        lastName: norm(r.lastName),

        teamId: null,
        teamName: null
      };
    }

    // =====================================================
    // TEAM
    // =====================================================

    const teamId = norm(r.teamId);

    if (!teamId) {
      return null;
    }

    const teamName =
      teamDisplayName(r);

    return {
      ...common,

      legacyConvertedToSolo: false,

      entryType: "team",
      uid: norm(r.uid),

      teamId,
      teamName,
      displayName: teamName
    };
  }

  // =========================================================
  // TIMESTAMPS
  // =========================================================

  function timestampMs(value) {
    if (!value) {
      return 0;
    }

    try {
      if (typeof value.toMillis === "function") {
        return value.toMillis();
      }

      if (typeof value.toDate === "function") {
        return value.toDate().getTime();
      }

      if (typeof value.seconds === "number") {
        return value.seconds * 1000;
      }

      if (typeof value._seconds === "number") {
        return value._seconds * 1000;
      }

      if (typeof value === "number") {
        return value;
      }

      const d = new Date(value);

      return Number.isNaN(d.getTime())
        ? 0
        : d.getTime();

    } catch {
      return 0;
    }
  }

  // =========================================================
  // DEDUPE
  // =========================================================

  function rowStatusTimestamp(row) {
    return Math.max(
      timestampMs(row.cancelledAt),
      timestampMs(row.confirmedAt),
      timestampMs(row.updatedAt),
      timestampMs(row.createdAt)
    );
  }

  function chooseBetterRow(a, b) {
    if (!a) return b;
    if (!b) return a;

    // Новий canonical SOLO має пріоритет
    // над старим TEAM-записом того самого UID.
    if (
      a.legacyConvertedToSolo !==
      b.legacyConvertedToSolo
    ) {
      return a.legacyConvertedToSolo
        ? b
        : a;
    }

    // Для дублікатів використовуємо найновішу
    // зміну статусу, а не автоматично "Оплачено".
    const ta = rowStatusTimestamp(a);
    const tb = rowStatusTimestamp(b);

    if (ta !== tb) {
      return tb > ta ? b : a;
    }

    // Fallback для старих документів без дат.
    const aPaid = isPaidStatus(a.status);
    const bPaid = isPaidStatus(b.status);

    if (aPaid !== bPaid) {
      return bPaid ? b : a;
    }

    return a;
  }

  function dedupeRows(rows) {
    const map = new Map();

    rows.forEach(row => {
      const identity =
        row.entryType === "solo"
          ? norm(row.uid)
          : norm(row.teamId);

      const key =
        `${row.entryType}||${
          identity || row.participantDocId
        }`;

      map.set(
        key,
        chooseBetterRow(
          map.get(key),
          row
        )
      );
    });

    return Array.from(map.values());
  }

  // =========================================================
  // SORT PAID
  // =========================================================

  function sortPaidRows(rows) {
    return [...rows].sort((a, b) => {
      const aTime =
        timestampMs(a.confirmedAt);

      const bTime =
        timestampMs(b.confirmedAt);

      // Чинна дата підтвердження — головна.
      // Старий orderPaid не повинен повертати
      // перепідтверджену заявку на старе місце.
      if (aTime && bTime && aTime !== bTime) {
        return aTime - bTime;
      }

      // Legacy: обидва без confirmedAt.
      if (!aTime && !bTime) {
        if (
          Number.isFinite(a.orderPaid) &&
          Number.isFinite(b.orderPaid) &&
          a.orderPaid !== b.orderPaid
        ) {
          return a.orderPaid - b.orderPaid;
        }
      }

      // Fallback для змішаних старих документів.
      const aFallback =
        aTime || timestampMs(a.createdAt);

      const bFallback =
        bTime || timestampMs(b.createdAt);

      if (aFallback !== bFallback) {
        return aFallback - bFallback;
      }

      return norm(a.participantDocId).localeCompare(
        norm(b.participantDocId)
      );
    });
  }

  // =========================================================
  // SORT UNPAID
  // =========================================================

  function sortUnpaidRows(rows) {
    return [...rows].sort((a, b) => {
      const aCancelled =
        isCancelledStatus(a.status);

      const bCancelled =
        isCancelledStatus(b.status);

      // Ті, хто очікує оплату, перед скасованими.
      if (aCancelled !== bCancelled) {
        return aCancelled ? 1 : -1;
      }

      const aTime =
        timestampMs(a.createdAt);

      const bTime =
        timestampMs(b.createdAt);

      if (aTime !== bTime) {
        return aTime - bTime;
      }

      return norm(a.participantDocId).localeCompare(
        norm(b.participantDocId)
      );
    });
  }

  // =========================================================
  // ROW HTML
  // =========================================================

  function rowHtml(number, row) {
    const paid =
      isPaidStatus(row.status);

    const cancelled =
      isCancelledStatus(row.status);

    const solo =
      row.entryType === "solo";

    const name = solo
      ? participantDisplayName(row)
      : teamDisplayName(row);

    const teamId = solo
      ? ""
      : norm(row.teamId);

    const teamName = solo
      ? ""
      : teamDisplayName(row);

    const statusLabel = paid
      ? "Оплачено"
      : cancelled
        ? "Скасовано"
        : "Очікується";

    return `
      <div
        class="row ${
          solo
            ? "row--solo"
            : "row--team"
        }"
        data-entry-type="${esc(row.entryType)}"
        data-team-id="${esc(teamId)}"
        data-team-name="${esc(teamName)}"
        style="cursor:${
          !solo && teamId
            ? "pointer"
            : "default"
        };"
      >

        <span class="lamp ${
          paid
            ? "lamp--green"
            : "lamp--red"
        }"></span>

        <span class="idx">
          ${
            number !== null
              ? `${number}.`
              : ""
          }
        </span>

        <span
          class="name"
          title="${esc(name)}"
        >
          ${esc(name)}
        </span>

        <span class="status ${
          paid
            ? "status--paid"
            : "status--unpaid"
        }">
          ${statusLabel}
        </span>

      </div>
    `;
  }

  // =========================================================
  // RENDER
  // =========================================================

  function render(rows, maxEntries) {
    const list = $("teamsList");
    const msg = $("msg");

    if (!list) {
      return;
    }

    list.innerHTML = "";

    if (msg) {
      msg.textContent = "";
    }

    if (!rows.length) {
      list.innerHTML =
        '<div class="mutedCenter">Нема заявок на це змагання</div>';

      attachMealButtons();
      return;
    }

    // -------------------------------------------------------
    // ТІЛЬКИ ОПЛАЧЕНІ МАЮТЬ НОМЕРИ.
    // -------------------------------------------------------

    const paid = sortPaidRows(
      rows.filter(row =>
        isPaidStatus(row.status)
      )
    );

    const unpaid = sortUnpaidRows(
      rows.filter(row =>
        !isPaidStatus(row.status)
      )
    );

    // Ліміт змагання стосується оплачених,
    // а не всіх поданих заявок.
    const main = paid.slice(
      0,
      maxEntries
    );

    const reserve = paid.slice(
      maxEntries
    );

    const html = [];

    // -------------------------------------------------------
    // ОСНОВНИЙ СПИСОК
    // -------------------------------------------------------

    if (main.length) {
      html.push(
        main.map((row, index) =>
          rowHtml(index + 1, row)
        ).join("")
      );
    }

    // -------------------------------------------------------
    // РЕЗЕРВ — ТІЛЬКИ ОПЛАЧЕНІ
    // -------------------------------------------------------

    if (reserve.length) {
      html.push(`
        <div class="dividerLabel">
          Резерв: ${reserve.length}
        </div>
      `);

      html.push(
        reserve.map((row, index) =>
          rowHtml(
            maxEntries + index + 1,
            row
          )
        ).join("")
      );
    }

    // -------------------------------------------------------
    // НЕОПЛАЧЕНІ ТА СКАСОВАНІ — БЕЗ НОМЕРІВ
    // -------------------------------------------------------

    if (unpaid.length) {
      html.push(`
        <div class="dividerLabel">
          Очікують оплату / скасовані: ${unpaid.length}
        </div>
      `);

      html.push(
        unpaid.map(row =>
          rowHtml(null, row)
        ).join("")
      );
    }

    if (!paid.length && !unpaid.length) {
      html.push(`
        <div class="mutedCenter">
          Нема заявок на це змагання
        </div>
      `);
    }

    list.innerHTML = html.join("");

    // -------------------------------------------------------
    // TEAM POPUP
    // -------------------------------------------------------

    list.querySelectorAll(".row").forEach(rowEl => {
      rowEl.addEventListener("click", () => {
        const entryType = normLower(
          rowEl.dataset.entryType
        );

        if (entryType === "solo") {
          return;
        }

        const teamId = norm(
          rowEl.dataset.teamId
        );

        const teamName = norm(
          rowEl.dataset.teamName
        );

        if (teamId) {
          openTeamPopup(teamName, teamId);
        }
      });
    });

    attachMealButtons();
  }

  // =========================================================
  // MEAL CONTEXT
  // =========================================================

  function updateMealContext(
    compId,
    stageParam,
    meta,
    maxEntries,
    rows
  ) {
    const rawStage = stageParam.replace(
      /^stage-/,
      ""
    );

    const stageIdVariants = [
      stageParam,
      rawStage,
      `stage-${rawStage}`
    ].filter(Boolean);

    window.scMealContext = {
      competitionId: compId,
      stageId: stageParam,

      stageIdVariants: [
        ...new Set(stageIdVariants)
      ],

      competitionTitle: meta.title,
      stageTitle: meta.stageTitle,

      entryType: meta.entryType,
      format: meta.format,
      isFinal: meta.isFinal,

      maxTeams: maxEntries,
      maxParticipants: maxEntries,

      // Для харчування залишаємо всі актуальні
      // заявки зі статусами. Харчування саме
      // перевіряє дозвіл на подання замовлення.
      teams: rows,
      participants: rows
    };

    if (
      window.scMeals &&
      typeof window.scMeals.setContext === "function"
    ) {
      window.scMeals.setContext(
        window.scMealContext
      );
    }
  }

  // =========================================================
  // LIVE PUBLIC PARTICIPANTS
  // =========================================================

  function startParticipantsRealtime(
    compId,
    stageParam,
    meta,
    maxEntries
  ) {
    if (unsubParticipants) {
      unsubParticipants();
      unsubParticipants = null;
    }

    const db = window.scDb;

    // Не додаємо entryType до Firestore query:
    // legacy SOLO теж мають потрапити у список.
    unsubParticipants = db
      .collection("public_participants")
      .where("competitionId", "==", compId)
      .onSnapshot(
        async snap => {
          // Захист від ситуації, коли старе
          // асинхронне завантаження завершується
          // пізніше від нового LIVE-оновлення.
          const requestId = ++renderRequestId;

          try {
            const docs = [];

            snap.forEach(doc => {
              const row = doc.data() || {};

              if (!stageMatches(
                row.stageId,
                stageParam
              )) {
                return;
              }

              docs.push(doc);
            });

            const normalized = await Promise.all(
              docs.map(doc =>
                normalizeParticipantRow(
                  doc,
                  meta
                )
              )
            );

            if (requestId !== renderRequestId) {
              return;
            }

            let rows = normalized.filter(Boolean);

            rows = dedupeRows(rows);

            // Спочатку оплачені за чинною
            // датою підтвердження,
            // потім неоплачені та скасовані.
            const paid = sortPaidRows(
              rows.filter(row =>
                isPaidStatus(row.status)
              )
            );

            const unpaid = sortUnpaidRows(
              rows.filter(row =>
                !isPaidStatus(row.status)
              )
            );

            rows = [...paid, ...unpaid];

            updateMealContext(
              compId,
              stageParam,
              meta,
              maxEntries,
              rows
            );

            render(rows, maxEntries);

          } catch (error) {
            if (requestId !== renderRequestId) {
              return;
            }

            console.error(
              "[participation] normalize:",
              error
            );

            if ($("msg")) {
              $("msg").textContent =
                "Помилка обробки списку: " +
                (error?.message || error);
            }
          }
        },

        error => {
          console.error(
            "[participation] public participants:",
            error
          );

          if ($("msg")) {
            $("msg").textContent =
              "Не вдалося завантажити список: " +
              (error?.message || error);
          }
        }
      );
  }

  // =========================================================
  // INIT
  // =========================================================

  (async function init() {
    try {
      await waitFirebase();

      const params = new URLSearchParams(
        location.search
      );

      const compId = norm(
        params.get("comp")
      );

      const stageParam =
        norm(params.get("stage")) || "main";

      if (!compId) {
        if ($("msg")) {
          $("msg").textContent =
            "Не передано competitionId";
        }
        return;
      }

      const meta = await getCompetitionMeta(
        compId,
        stageParam
      );

      const maxEntries =
        getMaxEntriesFromMeta(meta);

      if ($("pageTitle")) {
        $("pageTitle").textContent =
          meta.title;
      }

      if ($("pageSub")) {
        $("pageSub").textContent =
          meta.stageTitle || "";
      }

      if ($("msg")) {
        $("msg").textContent =
          "Завантаження списку…";
      }

      attachMealButtons();

      startParticipantsRealtime(
        compId,
        stageParam,
        meta,
        maxEntries
      );

    } catch (error) {
      console.error(
        "[participation] init:",
        error
      );

      if ($("msg")) {
        $("msg").textContent =
          "Помилка: " +
          (error?.message || error);
      }
    }
  })();

  // =========================================================
  // CLEANUP
  // =========================================================

  window.addEventListener("beforeunload", () => {
    renderRequestId++;

    if (unsubParticipants) {
      unsubParticipants();
      unsubParticipants = null;
    }
  });

})();

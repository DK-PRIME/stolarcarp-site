// assets/js/my_participation.js
// STOLAR CARP • Моя участь
//
// ✅ OPTIMIZED
// ✅ TEAM + SOLO
// ✅ TEAM — показує участь команди
// ✅ SOLO — показує тільки особисту заявку користувача
// ✅ SOLO не залежить від teamId
// ✅ Користувач без команди теж бачить свої SOLO заявки
// ✅ "Учасник" НЕ вважається справжнім ім'ям
//
// ✅ SOLO canonical name:
//    lastName + firstName
//    Прізвище Ім'я
//
// ✅ НІЧОГО не скорочуємо
// ✅ middleName / по батькові не показуємо
//
// ✅ SOLO ім'я:
//    1. lastName + firstName із public_participants
//    2. lastName + firstName із users profile
//    3. legacy participantName/fullName як fallback
//
// ✅ Legacy:
//    "Цьотар Василь Богданович" -> "Цьотар Василь"
//    "Василь Богданович Цьотар" -> "Цьотар Василь"
//
// ✅ Legacy SOLO з entryType:"team"
//    правильно визначається через competition
//
// ✅ Stalker Solo -> SOLO
// ✅ Stalker Teams -> TEAM
// ✅ Final -> TEAM
//
// ✅ Показує тільки поточні та майбутні змагання
// ✅ Завершені етапи автоматично зникають
// ✅ Нічого не видаляє з Firestore
// ✅ Якщо дати немає — запис не ховається
//
// ===========================================================
// OPTIMIZATION
// ===========================================================
//
// ✅ НЕ читаємо competition послідовно
// ✅ НЕ читаємо той самий competition окремо для кожного stage
// ✅ 1 Firestore read = 1 competitionId
// ✅ competitions завантажуються паралельно
// ✅ SOLO query стартує паралельно з users/{uid}
// ✅ TEAM / SOLO snapshots завчасно прогрівають competition cache
// ✅ cache тільки в RAM до перезавантаження сторінки
// ✅ realtime public_participants залишається
//

(function () {
  "use strict";

  const box =
    document.getElementById(
      "myCompetitions"
    );

  if (!box) {
    return;
  }

  // =========================================================
  // STATE
  // =========================================================

  let unsubs = [];

  let currentUser = null;
  let currentProfile = null;

  let teamRows = [];
  let soloRows = [];

  let teamLoaded = false;
  let soloLoaded = false;

  let renderRequestId = 0;

  // =========================================================
  // COMPETITION CACHE
  //
  // Це НЕ localStorage.
  // Це звичайна пам'ять сторінки.
  //
  // competitionDocCache:
  // compId -> competition document data
  //
  // competitionPromiseCache:
  // compId -> Promise поки документ завантажується
  //
  // Завдяки Promise cache одночасні rebuild-и
  // не запускають дубльовані Firestore reads.
  // =========================================================

  const competitionDocCache =
    new Map();

  const competitionPromiseCache =
    new Map();

  // =========================================================
  // FIREBASE
  // =========================================================

  async function waitFirebase(
    maxMs = 12000
  ) {
    const t0 =
      Date.now();

    while (
      Date.now() - t0 <
      maxMs
    ) {
      if (
        window.scAuth &&
        window.scDb &&
        window.firebase
      ) {
        return;
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            50
          )
      );
    }

    throw new Error(
      "Firebase not ready (scAuth/scDb)"
    );
  }

  // =========================================================
  // HELPERS
  // =========================================================

  function esc(s) {
    return String(
      s ?? ""
    )
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );
  }

  function norm(v) {
    return String(
      v ?? ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  function normLower(v) {
    return norm(v)
      .toLowerCase();
  }

  function showMuted(text) {
    box.innerHTML =
      `<div class="cabinet-small-muted">${esc(text)}</div>`;
  }

  function showError(text) {
    box.innerHTML = `
      <div
        class="cabinet-small-muted"
        style="color:#ef4444;"
      >
        ${esc(text)}
      </div>
    `;
  }

  function stopSubscriptions() {
    unsubs.forEach(
      fn => {
        try {
          if (
            typeof fn ===
            "function"
          ) {
            fn();
          }
        } catch (_) {}
      }
    );

    unsubs = [];
  }

  function isPaidStatus(status) {
    const s =
      normLower(
        status
      );

    return (
      s === "confirmed" ||
      s === "paid" ||
      s === "payment_confirmed"
    );
  }

  // =========================================================
  // PERSON NAME
  // =========================================================

  function isPlaceholderPersonName(
    value
  ) {
    const raw =
      normLower(
        value
      );

    if (!raw) {
      return true;
    }

    if (
      [
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
      ].includes(raw)
    ) {
      return true;
    }

    if (
      /^учасник\s*\d*$/i.test(
        raw
      )
    ) {
      return true;
    }

    if (
      /^participant\s*\d*$/i.test(
        raw
      )
    ) {
      return true;
    }

    return false;
  }

  function validPersonName(
    value,
    teamName = ""
  ) {
    const name =
      norm(
        value
      );

    const team =
      norm(
        teamName
      );

    if (
      isPlaceholderPersonName(
        name
      )
    ) {
      return "";
    }

    if (
      team &&
      normLower(name) ===
        normLower(team)
    ) {
      return "";
    }

    return name;
  }

  // =========================================================
  // CANONICAL LAST + FIRST
  // =========================================================

  function lastFirstNameFromObject(
    data
  ) {
    const d =
      data ||
      {};

    const firstName =
      validPersonName(
        d.firstName ||
        d.givenName ||
        d.first_name ||
        ""
      );

    const lastName =
      validPersonName(
        d.lastName ||
        d.surname ||
        d.familyName ||
        d.last_name ||
        ""
      );

    if (
      firstName &&
      lastName
    ) {
      return (
        `${lastName} ${firstName}`
      );
    }

    return "";
  }

  // =========================================================
  // LEGACY PATRONYMIC
  // =========================================================

  function isPatronymicPart(
    value
  ) {
    const s =
      normLower(
        value
      );

    if (!s) {
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

  // =========================================================
  // LEGACY SOLO NAME
  // =========================================================

  function normalizeLegacySoloName(
    value
  ) {
    const raw =
      norm(
        value
      );

    if (
      !raw ||
      isPlaceholderPersonName(
        raw
      )
    ) {
      return "";
    }

    const parts =
      raw
        .split(" ")
        .filter(Boolean);

    if (
      parts.length === 2
    ) {
      return raw;
    }

    if (
      parts.length === 3
    ) {
      const patronymicIndex =
        parts.findIndex(
          isPatronymicPart
        );

      /*
       * Цьотар Василь Богданович
       * -> Цьотар Василь
       */
      if (
        patronymicIndex === 2
      ) {
        return (
          `${parts[0]} ${parts[1]}`
        );
      }

      /*
       * Василь Богданович Цьотар
       * -> Цьотар Василь
       */
      if (
        patronymicIndex === 1
      ) {
        return (
          `${parts[2]} ${parts[0]}`
        );
      }

      /*
       * Богданович Василь Цьотар
       * -> Цьотар Василь
       */
      if (
        patronymicIndex === 0
      ) {
        return (
          `${parts[2]} ${parts[1]}`
        );
      }
    }

    return raw;
  }

  // =========================================================
  // PERSON NAME FROM OBJECT
  // =========================================================

  function personNameFromObject(
    data
  ) {
    const d =
      data ||
      {};

    const structured =
      lastFirstNameFromObject(
        d
      );

    if (
      structured
    ) {
      return structured;
    }

    const teamName =
      norm(
        d.teamName ||
        d.team ||
        ""
      );

    const candidates = [
      d.participantName,
      d.fullName,
      d.userName,
      d.name,
      d.displayName,
      d.captain
    ];

    for (
      const candidate
      of candidates
    ) {
      const name =
        validPersonName(
          candidate,
          teamName
        );

      if (
        name
      ) {
        return (
          normalizeLegacySoloName(
            name
          )
        );
      }
    }

    return "";
  }

  // =========================================================
  // SOLO DISPLAY NAME
  // =========================================================

  function formatSoloName(
    value
  ) {
    const raw =
      normalizeLegacySoloName(
        value
      );

    if (!raw) {
      return "Учасник";
    }

    return raw;
  }

  // =========================================================
  // RESOLVE SOLO NAME
  // =========================================================

  function resolveSoloIdentityName(
    row
  ) {
    /*
     * 1.
     * public_participants:
     * lastName + firstName
     */
    const rowStructured =
      lastFirstNameFromObject(
        row ||
        {}
      );

    if (
      rowStructured
    ) {
      return rowStructured;
    }

    /*
     * 2.
     * users profile:
     * lastName + firstName
     */
    const profileStructured =
      lastFirstNameFromObject(
        currentProfile ||
        {}
      );

    if (
      profileStructured
    ) {
      return profileStructured;
    }

    /*
     * 3.
     * Legacy row
     */
    const fromRow =
      personNameFromObject(
        row
      );

    if (
      fromRow
    ) {
      return (
        formatSoloName(
          fromRow
        )
      );
    }

    /*
     * 4.
     * Legacy profile
     */
    const fromProfile =
      personNameFromObject(
        currentProfile ||
        {}
      );

    if (
      fromProfile
    ) {
      return (
        formatSoloName(
          fromProfile
        )
      );
    }

    /*
     * 5.
     * Email fallback
     */
    const email =
      norm(
        currentUser?.email
      );

    if (
      email
    ) {
      return email;
    }

    return "Учасник";
  }

  // =========================================================
  // TIME
  // =========================================================

  function toMillis(v) {
    if (!v) {
      return 0;
    }

    try {
      if (
        typeof v.toMillis ===
        "function"
      ) {
        return v.toMillis();
      }

      if (
        typeof v.toDate ===
        "function"
      ) {
        return v
          .toDate()
          .getTime();
      }

      if (
        v instanceof Date
      ) {
        return v.getTime();
      }

      if (
        typeof v ===
        "number"
      ) {
        return Number.isFinite(v)
          ? v
          : 0;
      }

      const d =
        new Date(v);

      return Number.isNaN(
        d.getTime()
      )
        ? 0
        : d.getTime();

    } catch (_) {
      return 0;
    }
  }

  function dateValueToMillis(
    v,
    endOfDay = false
  ) {
    if (!v) {
      return 0;
    }

    try {
      if (
        typeof v.toDate ===
        "function"
      ) {
        const d =
          v.toDate();

        if (
          endOfDay
        ) {
          d.setHours(
            23,
            59,
            59,
            999
          );
        }

        return d.getTime();
      }

      if (
        v instanceof Date
      ) {
        const d =
          new Date(
            v.getTime()
          );

        if (
          endOfDay
        ) {
          d.setHours(
            23,
            59,
            59,
            999
          );
        }

        return d.getTime();
      }

      if (
        typeof v ===
        "number"
      ) {
        const d =
          new Date(v);

        if (
          Number.isNaN(
            d.getTime()
          )
        ) {
          return 0;
        }

        if (
          endOfDay
        ) {
          d.setHours(
            23,
            59,
            59,
            999
          );
        }

        return d.getTime();
      }

      if (
        typeof v ===
        "string"
      ) {
        const s =
          v.trim();

        if (!s) {
          return 0;
        }

        // YYYY-MM-DD
        const isoDate =
          s.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
          );

        if (
          isoDate
        ) {
          const year =
            Number(
              isoDate[1]
            );

          const month =
            Number(
              isoDate[2]
            ) - 1;

          const day =
            Number(
              isoDate[3]
            );

          const d =
            endOfDay
              ? new Date(
                  year,
                  month,
                  day,
                  23,
                  59,
                  59,
                  999
                )
              : new Date(
                  year,
                  month,
                  day,
                  0,
                  0,
                  0,
                  0
                );

          return d.getTime();
        }

        // DD.MM.YYYY
        const ukDate =
          s.match(
            /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
          );

        if (
          ukDate
        ) {
          const day =
            Number(
              ukDate[1]
            );

          const month =
            Number(
              ukDate[2]
            ) - 1;

          const year =
            Number(
              ukDate[3]
            );

          const d =
            endOfDay
              ? new Date(
                  year,
                  month,
                  day,
                  23,
                  59,
                  59,
                  999
                )
              : new Date(
                  year,
                  month,
                  day,
                  0,
                  0,
                  0,
                  0
                );

          return d.getTime();
        }

        const parsed =
          new Date(s);

        if (
          !Number.isNaN(
            parsed.getTime()
          )
        ) {
          if (
            endOfDay
          ) {
            parsed.setHours(
              23,
              59,
              59,
              999
            );
          }

          return parsed.getTime();
        }
      }

    } catch (e) {
      console.warn(
        "[my_participation] Date parse error:",
        v,
        e
      );
    }

    return 0;
  }

  function formatDate(ts) {
    if (!ts) {
      return "—";
    }

    try {
      const d =
        ts.toDate
          ? ts.toDate()
          : new Date(ts);

      if (
        Number.isNaN(
          d.getTime()
        )
      ) {
        return "—";
      }

      return d.toLocaleDateString(
        "uk-UA"
      );

    } catch (_) {
      return "—";
    }
  }

  // =========================================================
  // ENTRY TYPE
  // =========================================================

  function normalizeFormat(
    value
  ) {
    return normLower(
      value
    )
      .replace(
        /\s+/g,
        ""
      )
      .replace(
        /_/g,
        "-"
      );
  }

  function isFinalMeta(
    event,
    stageId
  ) {
    const key =
      normLower(
        event?.key ||
        event?.stageId ||
        event?.id ||
        stageId ||
        ""
      );

    const title =
      normLower(
        `${
          event?.title || ""
        } ${
          event?.name || ""
        } ${
          event?.label || ""
        }`
      );

    return (
      event?.isFinal === true ||
      key === "final" ||
      key.includes("final") ||
      key.includes("фінал") ||
      title.includes("final") ||
      title.includes("фінал")
    );
  }

  function entryTypeFromCompetition(
    event,
    competition,
    stageId = ""
  ) {
    if (
      isFinalMeta(
        event,
        stageId
      )
    ) {
      return "team";
    }

    const explicitType =
      normLower(
        event?.entryType ||
        competition?.entryType ||
        ""
      );

    if (
      explicitType === "solo" ||
      explicitType === "team"
    ) {
      return explicitType;
    }

    const format =
      normalizeFormat(
        event?.format ||
        event?.engine?.baseFormat ||
        competition?.format ||
        competition?.engine?.baseFormat ||
        ""
      );

    if (
      format === "stalker-solo"
    ) {
      return "solo";
    }

    return "team";
  }

  // =========================================================
  // COMPETITION DATE HELPERS
  // =========================================================

  function readStartDate(obj) {
    if (!obj) {
      return null;
    }

    const schedule =
      obj.schedule ||
      {};

    return (
      obj.startDate ??
      obj.dateStart ??
      obj.startAt ??
      schedule.startAt ??
      schedule.startDate ??
      obj.dateFrom ??
      obj.fromDate ??
      obj.from ??
      obj.start ??
      obj.date ??
      null
    );
  }

  function readEndDate(obj) {
    if (!obj) {
      return null;
    }

    const schedule =
      obj.schedule ||
      {};

    return (
      obj.endDate ??
      obj.dateEnd ??
      obj.endAt ??
      obj.finishDate ??
      obj.finishAt ??
      schedule.endAt ??
      schedule.endDate ??
      schedule.finishAt ??
      schedule.finishDate ??
      obj.dateTo ??
      obj.toDate ??
      obj.to ??
      obj.end ??
      obj.date ??
      null
    );
  }

  // =========================================================
  // FAST COMPETITION DOCUMENT READ
  //
  // ГОЛОВНА ОПТИМІЗАЦІЯ:
  //
  // Було:
  // compId + stageId -> Firestore GET
  //
  // Стало:
  // compId -> Firestore GET
  //
  // Один competition документ містить всі events,
  // тому нема сенсу читати його повторно для stage-1,
  // stage-2, final і т.д.
  // =========================================================

  async function getCompetitionDocument(
    compId
  ) {
    const id =
      norm(
        compId
      );

    if (!id) {
      return null;
    }

    /*
     * Уже є готовий документ.
     *
     * Map.has важливий:
     * навіть null для неіснуючого документа
     * є валідним кешованим результатом.
     */
    if (
      competitionDocCache.has(
        id
      )
    ) {
      return (
        competitionDocCache.get(
          id
        )
      );
    }

    /*
     * Документ уже прямо зараз
     * завантажується іншим rebuild.
     *
     * Не запускаємо другий GET.
     */
    if (
      competitionPromiseCache.has(
        id
      )
    ) {
      return (
        competitionPromiseCache.get(
          id
        )
      );
    }

    const db =
      window.scDb;

    const promise =
      db
        .collection(
          "competitions"
        )
        .doc(id)
        .get()
        .then(
          snap => {
            const data =
              snap.exists
                ? (
                    snap.data() ||
                    {}
                  )
                : null;

            competitionDocCache.set(
              id,
              data
            );

            return data;
          }
        )
        .catch(
          e => {
            /*
             * Помилку НЕ кешуємо назавжди.
             * Наступний rebuild зможе повторити GET.
             */
            console.warn(
              "[my_participation] Competition read error:",
              id,
              e
            );

            return null;
          }
        )
        .finally(
          () => {
            competitionPromiseCache.delete(
              id
            );
          }
        );

    competitionPromiseCache.set(
      id,
      promise
    );

    return promise;
  }

  // =========================================================
  // PRELOAD COMPETITIONS IN PARALLEL
  // =========================================================

  async function preloadCompetitionDocuments(
    rows
  ) {
    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {
      return;
    }

    const ids =
      new Set();

    rows.forEach(
      row => {
        const compId =
          norm(
            row?.competitionId
          );

        if (
          compId
        ) {
          ids.add(
            compId
          );
        }
      }
    );

    if (
      ids.size === 0
    ) {
      return;
    }

    /*
     * ВАЖЛИВО:
     *
     * Тут усі competitions стартують ОДНОЧАСНО.
     *
     * Немає:
     * await competition1
     * await competition2
     * await competition3
     *
     * Є:
     * Promise.all(...)
     */
    await Promise.all(
      Array
        .from(ids)
        .map(
          compId =>
            getCompetitionDocument(
              compId
            )
        )
    );
  }

  // =========================================================
  // WARM CACHE
  //
  // Викликається одразу після TEAM / SOLO snapshot.
  //
  // Не чекаємо завершення.
  // Поки другий snapshot приходить,
  // competitions уже вантажаться.
  // =========================================================

  function warmCompetitionDocuments(
    rows
  ) {
    preloadCompetitionDocuments(
      rows
    ).catch(
      e => {
        console.warn(
          "[my_participation] Competition warmup:",
          e
        );
      }
    );
  }

  // =========================================================
  // COMPETITION META FROM ALREADY LOADED DOCUMENT
  //
  // Тут Firestore READ вже НЕМАЄ.
  // Це проста синхронна JS-функція.
  // =========================================================

  function competitionMetaFromDocument(
    competition,
    stageId
  ) {
    const st =
      norm(
        stageId
      ) ||
      "main";

    const c =
      competition ||
      {};

    let compTitle =
      "";

    let stageTitle =
      "";

    let startMillis =
      0;

    let endMillis =
      0;

    let entryType =
      "team";

    let format =
      "classic";

    let isFinal =
      false;

    compTitle =
      norm(
        c.name ||
        c.title ||
        c.competitionName ||
        ""
      );

    const events =
      Array.isArray(
        c.events
      )
        ? c.events
        : [];

    const ev =
      events.find(
        event => {
          const evId =
            norm(
              event?.key ||
              event?.stageId ||
              event?.id
            );

          return (
            evId === st
          );
        }
      ) || null;

    isFinal =
      isFinalMeta(
        ev,
        st
      );

    entryType =
      entryTypeFromCompetition(
        ev,
        c,
        st
      );

    format =
      normalizeFormat(
        ev?.format ||
        ev?.engine?.baseFormat ||
        c.format ||
        c.engine?.baseFormat ||
        "classic"
      );

    if (
      ev
    ) {
      stageTitle =
        norm(
          ev.title ||
          ev.name ||
          ev.label ||
          ""
        );

      const startValue =
        readStartDate(
          ev
        ) ||
        readStartDate(
          c
        );

      const endValue =
        readEndDate(
          ev
        ) ||
        readEndDate(
          c
        ) ||
        startValue;

      startMillis =
        dateValueToMillis(
          startValue,
          false
        );

      endMillis =
        dateValueToMillis(
          endValue,
          true
        );

    } else {
      const startValue =
        readStartDate(
          c
        );

      const endValue =
        readEndDate(
          c
        ) ||
        startValue;

      startMillis =
        dateValueToMillis(
          startValue,
          false
        );

      endMillis =
        dateValueToMillis(
          endValue,
          true
        );

      if (
        st !== "main"
      ) {
        stageTitle =
          st;
      }
    }

    return {
      compTitle,
      stageTitle,

      startMillis,
      endMillis,

      entryType,
      format,
      isFinal
    };
  }

  // =========================================================
  // TITLE
  // =========================================================

  function niceTitle(it) {
    let stage =
      norm(
        it.stageTitle
      );

    if (
      stage &&
      /^stage[-_ ]?\d+$/i.test(
        stage
      )
    ) {
      stage =
        "";
    }

    if (
      !stage &&
      it.stageId &&
      it.stageId !== "main"
    ) {
      const m =
        String(
          it.stageId
        ).match(
          /\d+/
        );

      if (
        m
      ) {
        stage =
          `Етап ${m[0]}`;
      }
    }

    return stage
      ? esc(stage)
      : esc(
          it.compTitle ||
          "Змагання"
        );
  }

  // =========================================================
  // FILTER
  // =========================================================

  function isCurrentOrFutureCompetition(
    it
  ) {
    const now =
      Date.now();

    if (
      it.endMillis > 0
    ) {
      return (
        it.endMillis >=
        now
      );
    }

    if (
      it.startMillis > 0
    ) {
      return (
        it.startMillis >=
        now
      );
    }

    /*
     * Якщо дати немає —
     * запис не ховаємо.
     */
    return true;
  }

  // =========================================================
  // ROW HELPERS
  // =========================================================

  function rowEntryType(
    row
  ) {
    return (
      normLower(
        row?.entryType
      ) === "solo"
    )
      ? "solo"
      : "team";
  }

  function rowUid(
    row
  ) {
    if (!row) {
      return "";
    }

    const direct =
      norm(
        row.uid ||
        row.participantUid ||
        row.userId ||
        row.registeredByUid ||
        ""
      );

    if (
      direct
    ) {
      return direct;
    }

    const docId =
      norm(
        row.id
      );

    if (
      docId.includes(
        "__solo__"
      )
    ) {
      return norm(
        docId
          .split(
            "__solo__"
          )
          .pop()
      );
    }

    return "";
  }

  function rowTime(
    row
  ) {
    return toMillis(
      row.updatedAt ||
      row.confirmedAt ||
      row.createdAt
    );
  }

  function chooseBetterRow(
    oldRow,
    newRow
  ) {
    if (
      !oldRow
    ) {
      return newRow;
    }

    const oldPaid =
      isPaidStatus(
        oldRow.status
      );

    const newPaid =
      isPaidStatus(
        newRow.status
      );

    if (
      !oldPaid &&
      newPaid
    ) {
      return newRow;
    }

    if (
      oldPaid &&
      !newPaid
    ) {
      return oldRow;
    }

    return (
      rowTime(
        newRow
      ) >
      rowTime(
        oldRow
      )
    )
      ? newRow
      : oldRow;
  }

  // =========================================================
  // RENDER
  // =========================================================

  function renderItems(
    items
  ) {
    if (
      !items ||
      items.length === 0
    ) {
      showMuted(
        "Немає майбутніх змагань"
      );

      return;
    }

    let html =
      "";

    items.forEach(
      it => {
        const paid =
          isPaidStatus(
            it.status
          );

        const dot =
          paid
            ? "#22c55e"
            : "#ef4444";

        const entryType =
          rowEntryType(
            it
          );

        const isSolo =
          entryType === "solo";

        const identityLabel =
          isSolo
            ? "Учасник"
            : "Команда";

        let identityName =
          "";

        if (
          isSolo
        ) {
          const rawName =
            resolveSoloIdentityName(
              it
            );

          identityName =
            formatSoloName(
              rawName
            );

        } else {
          identityName =
            norm(
              it.teamName
            ) ||
            norm(
              it.displayName
            ) ||
            "—";
        }

        html += `
          <div
            class="stat-card"
            style="margin-bottom:10px;"
          >
            <div
              style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
              "
            >
              <div
                style="
                  min-width:0;
                "
              >

                <div
                  class="stat-label"
                  style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                  "
                >
                  <span
                    style="
                      display:inline-block;
                      width:10px;
                      height:10px;
                      border-radius:999px;
                      background:${dot};
                      box-shadow:0 0 10px rgba(0,0,0,.25);
                    "
                  ></span>

                  <span
                    style="
                      min-width:0;
                      overflow:hidden;
                      text-overflow:ellipsis;
                      white-space:nowrap;
                    "
                  >
                    ${niceTitle(it)}
                  </span>
                </div>

                <div
                  class="cabinet-small-muted"
                  style="
                    margin-top:6px;
                  "
                >
                  ${esc(identityLabel)}:

                  <strong
                    style="
                      color:#e5e7eb;
                    "
                    title="${esc(
                      identityName
                    )}"
                  >
                    ${esc(identityName)}
                  </strong>

                  ${
                    it.updatedAt
                      ? ` · Оновлено: ${esc(
                          formatDate(
                            it.updatedAt
                          )
                        )}`
                      : ""
                  }
                </div>

                <div
                  class="cabinet-small-muted"
                  style="
                    margin-top:6px;
                  "
                >
                  Статус:

                  <strong
                    style="
                      color:${
                        paid
                          ? "#22c55e"
                          : "#ef4444"
                      };
                    "
                  >
                    ${
                      paid
                        ? "Оплачено"
                        : "Очікується"
                    }
                  </strong>
                </div>

              </div>

              <div
                style="
                  flex-shrink:0;
                "
              >
                <a
                  class="btn btn--primary"
                  href="participation.html?comp=${encodeURIComponent(
                    it.competitionId
                  )}&stage=${encodeURIComponent(
                    it.stageId ||
                    "main"
                  )}"
                >
                  Відкрити
                </a>
              </div>

            </div>
          </div>
        `;
      }
    );

    box.innerHTML =
      html;
  }

  // =========================================================
  // MERGE + META + RENDER
  // =========================================================

  async function rebuildParticipation() {
    const requestId =
      ++renderRequestId;

    if (
      !teamLoaded ||
      !soloLoaded
    ) {
      showMuted(
        "Завантаження участі…"
      );

      return;
    }

    const combined = [
      ...teamRows,
      ...soloRows
    ];

    if (
      !combined.length
    ) {
      showMuted(
        "Ще немає заявок на майбутні змагання"
      );

      return;
    }

    // =====================================================
    // DEDUPE SAME FIRESTORE DOCUMENT
    // =====================================================

    const byDocId =
      Object.create(null);

    combined.forEach(
      row => {
        if (
          !row ||
          !row.id
        ) {
          return;
        }

        byDocId[
          row.id
        ] =
          chooseBetterRow(
            byDocId[
              row.id
            ],
            row
          );
      }
    );

    const rawRows =
      Object.values(
        byDocId
      );

    /*
     * =====================================================
     * ГОЛОВНА ОПТИМІЗАЦІЯ
     * =====================================================
     *
     * Спочатку збираємо всі competitionId.
     *
     * Потім ОДНИМ Promise.all()
     * паралельно дочитуємо відсутні.
     *
     * Після цього нижче вже НІ ОДНОГО
     * await всередині циклу немає.
     */
    await preloadCompetitionDocuments(
      rawRows
    );

    if (
      requestId !==
      renderRequestId
    ) {
      return;
    }

    const rows =
      [];

    // =====================================================
    // NORMALIZE
    //
    // Тут тільки RAM + JS.
    // Firestore GET тут уже нема.
    // =====================================================

    for (
      const sourceRow
      of rawRows
    ) {
      const it = {
        ...sourceRow
      };

      const compId =
        norm(
          it.competitionId
        );

      const stageId =
        norm(
          it.stageId
        ) ||
        "main";

      if (
        !compId
      ) {
        continue;
      }

      const competition =
        competitionDocCache.has(
          compId
        )
          ? competitionDocCache.get(
              compId
            )
          : null;

      const meta =
        competitionMetaFromDocument(
          competition,
          stageId
        );

      it.compTitle =
        meta.compTitle ||
        it.competitionTitle ||
        it.competitionName ||
        "Змагання";

      it.stageTitle =
        meta.stageTitle ||
        it.stageName ||
        "";

      it.startMillis =
        meta.startMillis ||
        0;

      it.endMillis =
        meta.endMillis ||
        0;

      it.format =
        meta.format ||
        it.format ||
        "classic";

      it.isFinal =
        meta.isFinal === true;

      /*
       * competition / event —
       * джерело істини.
       */
      it.entryType =
        meta.entryType ||
        norm(
          it.entryType
        ) ||
        "team";

      const isSolo =
        rowEntryType(
          it
        ) === "solo";

      if (
        isSolo
      ) {
        const uid =
          rowUid(
            it
          );

        /*
         * SOLO —
         * тільки поточний користувач.
         */
        if (
          !uid ||
          uid !==
            norm(
              currentUser?.uid
            )
        ) {
          continue;
        }

        it.uid =
          uid;

        it.teamId =
          null;

        it.teamName =
          null;

        const participantName =
          resolveSoloIdentityName(
            it
          );

        it.participantName =
          participantName ||
          "Учасник";

        it.displayName =
          it.participantName;

      } else {
        /*
         * TEAM
         */
        it.teamName =
          norm(
            it.teamName
          ) ||
          norm(
            currentProfile?.teamName
          ) ||
          norm(
            it.displayName
          ) ||
          "";
      }

      it.updatedAt =
        it.updatedAt ||
        it.confirmedAt ||
        it.createdAt ||
        null;

      it.stageId =
        stageId;

      rows.push(
        it
      );
    }

    if (
      requestId !==
      renderRequestId
    ) {
      return;
    }

    // =====================================================
    // DEDUPE BY PARTICIPATION IDENTITY
    // =====================================================

    const participationMap =
      Object.create(null);

    rows.forEach(
      row => {
        const compId =
          norm(
            row.competitionId
          );

        if (
          !compId
        ) {
          return;
        }

        const stageId =
          norm(
            row.stageId
          ) ||
          "main";

        const entryType =
          rowEntryType(
            row
          );

        let identity =
          "";

        if (
          entryType === "solo"
        ) {
          identity =
            rowUid(
              row
            ) ||
            norm(
              currentUser?.uid
            );

        } else {
          identity =
            norm(
              row.teamId
            ) ||
            norm(
              currentProfile?.teamId
            );
        }

        if (
          !identity
        ) {
          identity =
            row.id ||
            "";
        }

        const key =
          `${compId}||` +
          `${stageId}||` +
          `${entryType}||` +
          `${identity}`;

        participationMap[
          key
        ] =
          chooseBetterRow(
            participationMap[
              key
            ],
            row
          );
      }
    );

    const uniq =
      Object.values(
        participationMap
      );

    // =====================================================
    // CURRENT / FUTURE ONLY
    // =====================================================

    const activeItems =
      uniq.filter(
        isCurrentOrFutureCompetition
      );

    if (
      !activeItems.length
    ) {
      showMuted(
        "Немає майбутніх змагань"
      );

      return;
    }

    // =====================================================
    // SORT
    // =====================================================

    activeItems.sort(
      (a, b) => {
        const aStart =
          a.startMillis ||
          Number.MAX_SAFE_INTEGER;

        const bStart =
          b.startMillis ||
          Number.MAX_SAFE_INTEGER;

        if (
          aStart !==
          bStart
        ) {
          return (
            aStart -
            bStart
          );
        }

        const ap =
          isPaidStatus(
            a.status
          );

        const bp =
          isPaidStatus(
            b.status
          );

        if (
          ap !==
          bp
        ) {
          return ap
            ? -1
            : 1;
        }

        return (
          rowTime(b) -
          rowTime(a)
        );
      }
    );

    if (
      requestId !==
      renderRequestId
    ) {
      return;
    }

    renderItems(
      activeItems
    );
  }

  // =========================================================
  // TEAM SUBSCRIPTION
  // =========================================================

  function subscribeTeamParticipation(
    db,
    teamId
  ) {
    if (
      !teamId
    ) {
      teamRows =
        [];

      teamLoaded =
        true;

      rebuildParticipation();

      return;
    }

    const unsub =
      db
        .collection(
          "public_participants"
        )
        .where(
          "teamId",
          "==",
          teamId
        )
        .onSnapshot(
          qs => {
            const rows =
              [];

            qs.forEach(
              d => {
                const data =
                  d.data() ||
                  {};

                /*
                 * Canonical SOLO
                 * читається через UID.
                 */
                if (
                  normLower(
                    data.entryType
                  ) === "solo"
                ) {
                  return;
                }

                rows.push({
                  id:
                    d.id,

                  ...data,

                  _sourceQuery:
                    "team"
                });
              }
            );

            teamRows =
              rows;

            teamLoaded =
              true;

            /*
             * Не чекаємо SOLO.
             *
             * Одразу починаємо тягнути
             * competitions у фоні.
             */
            warmCompetitionDocuments(
              rows
            );

            rebuildParticipation();
          },

          err => {
            console.warn(
              "[my_participation] TEAM query:",
              err
            );

            teamRows =
              [];

            teamLoaded =
              true;

            rebuildParticipation();
          }
        );

    unsubs.push(
      unsub
    );
  }

  // =========================================================
  // SOLO / UID SUBSCRIPTION
  // =========================================================

  function subscribeSoloParticipation(
    db,
    uid
  ) {
    if (
      !uid
    ) {
      soloRows =
        [];

      soloLoaded =
        true;

      rebuildParticipation();

      return;
    }

    /*
     * entryType НЕ фільтруємо.
     *
     * Legacy Stalker Solo
     * міг мати entryType:"team".
     *
     * Правильний тип визначаємо
     * через competition.
     */
    const unsub =
      db
        .collection(
          "public_participants"
        )
        .where(
          "uid",
          "==",
          uid
        )
        .onSnapshot(
          qs => {
            const rows =
              [];

            qs.forEach(
              d => {
                const data =
                  d.data() ||
                  {};

                rows.push({
                  id:
                    d.id,

                  ...data,

                  uid:
                    norm(
                      data.uid
                    ) ||
                    uid,

                  _sourceQuery:
                    "uid"
                });
              }
            );

            soloRows =
              rows;

            soloLoaded =
              true;

            /*
             * Так само одразу гріємо
             * competitions.
             */
            warmCompetitionDocuments(
              rows
            );

            rebuildParticipation();
          },

          err => {
            console.warn(
              "[my_participation] UID query:",
              err
            );

            soloRows =
              [];

            soloLoaded =
              true;

            rebuildParticipation();
          }
        );

    unsubs.push(
      unsub
    );
  }

  // =========================================================
  // SUBSCRIPTION
  // =========================================================

  async function subscribeParticipation(
    user
  ) {
    const db =
      window.scDb;

    stopSubscriptions();

    teamRows =
      [];

    soloRows =
      [];

    teamLoaded =
      false;

    soloLoaded =
      false;

    currentUser =
      user;

    currentProfile =
      null;

    showMuted(
      "Завантаження участі…"
    );

    /*
     * =====================================================
     * OPTIMIZATION
     * =====================================================
     *
     * Раніше:
     *
     * 1. await users/{uid}
     * 2. тільки потім UID public_participants
     *
     * Тепер:
     *
     * UID public_participants стартує ВІДРАЗУ.
     * Паралельно читаємо users/{uid}.
     *
     * Для SOLO teamId взагалі не потрібен.
     */
    subscribeSoloParticipation(
      db,
      user.uid
    );

    /*
     * Profile потрібен для:
     *
     * - teamId
     * - canonical SOLO name
     * - teamName
     */
    const uSnap =
      await db
        .collection(
          "users"
        )
        .doc(
          user.uid
        )
        .get();

    /*
     * Поки ми чекали profile,
     * користувач міг вийти / змінитись.
     */
    if (
      !currentUser ||
      currentUser.uid !==
        user.uid
    ) {
      return;
    }

    if (
      !uSnap.exists
    ) {
      showError(
        "Немає профілю користувача"
      );

      return;
    }

    const u =
      uSnap.data() ||
      {};

    const teamId =
      norm(
        u.teamId
      );

    const firstName =
      norm(
        u.firstName
      );

    const lastName =
      norm(
        u.lastName
      );

    let fullName =
      "";

    /*
     * Canonical:
     * Прізвище Ім'я
     */
    if (
      firstName &&
      lastName
    ) {
      fullName =
        `${lastName} ${firstName}`;

    } else {
      fullName =
        personNameFromObject(
          u
        );
    }

    currentProfile = {
      uid:
        user.uid,

      email:
        norm(
          user.email
        ),

      firstName,

      lastName,

      fullName:
        fullName ||
        norm(
          user.email
        ),

      teamId,

      teamName:
        norm(
          u.teamName
        )
    };

    /*
     * Тепер знаємо teamId —
     * запускаємо TEAM query.
     */
    subscribeTeamParticipation(
      db,
      teamId
    );
  }

  // =========================================================
  // INIT
  // =========================================================

  (async () => {
    try {
      await waitFirebase();

      showMuted(
        "Завантаження участі…"
      );

      window.scAuth
        .onAuthStateChanged(
          async user => {
            stopSubscriptions();

            /*
             * Скасовуємо старий
             * async rebuild.
             */
            renderRequestId++;

            currentUser =
              user ||
              null;

            currentProfile =
              null;

            teamRows =
              [];

            soloRows =
              [];

            teamLoaded =
              false;

            soloLoaded =
              false;

            if (
              !user
            ) {
              showMuted(
                "Увійдіть у акаунт"
              );

              return;
            }

            try {
              await subscribeParticipation(
                user
              );

            } catch (e) {
              console.error(
                "[my_participation] subscribe:",
                e
              );

              showError(
                "Помилка завантаження участі"
              );
            }
          }
        );

    } catch (e) {
      console.error(
        "[my_participation] init:",
        e
      );

      showError(
        "Помилка завантаження участі"
      );
    }
  })();

})();

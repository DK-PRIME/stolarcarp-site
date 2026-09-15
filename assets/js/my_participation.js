// assets/js/my_participation.js
// STOLAR CARP • Моя участь
//
// ✅ TEAM + SOLO
// ✅ TEAM — показує участь команди
// ✅ SOLO — показує тільки особисту заявку користувача
// ✅ SOLO не залежить від teamId
// ✅ Користувач без команди теж бачить свої SOLO заявки
// ✅ participantName для SOLO
// ✅ teamName для TEAM
// ✅ Показує тільки поточні та майбутні змагання
// ✅ Завершені етапи автоматично зникають
// ✅ Нічого не видаляє з Firestore
// ✅ Якщо дати немає — запис не ховається
// ✅ Підтримка старих TEAM записів без entryType

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
            100
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
    ).trim();
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
      normLower(status);

    return (
      s === "confirmed" ||
      s === "paid"
    );
  }

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

    } catch {
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
      // Firestore Timestamp
      if (
        typeof v.toDate ===
        "function"
      ) {
        const d =
          v.toDate();

        if (endOfDay) {
          d.setHours(
            23,
            59,
            59,
            999
          );
        }

        return d.getTime();
      }

      // Date
      if (
        v instanceof Date
      ) {
        const d =
          new Date(
            v.getTime()
          );

        if (endOfDay) {
          d.setHours(
            23,
            59,
            59,
            999
          );
        }

        return d.getTime();
      }

      // Number timestamp
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

        if (endOfDay) {
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

        if (isoDate) {
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

        if (ukDate) {
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
          if (endOfDay) {
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

    } catch {
      return "—";
    }
  }

  // =========================================================
  // ENTRY TYPE
  // =========================================================

  function entryTypeFromCompetition(
    event,
    competition
  ) {
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
      normLower(
        event?.format ||
        competition?.format ||
        competition?.engine?.baseFormat ||
        ""
      );

    if (
      format ===
      "stalker-solo"
    ) {
      return "solo";
    }

    return "team";
  }

  // =========================================================
  // COMPETITION META
  // =========================================================

  const metaCache =
    Object.create(null);

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

  async function getCompetitionMeta(
    compId,
    stageId
  ) {
    const st =
      norm(stageId) ||
      "main";

    const key =
      `${compId}||${st}`;

    if (
      metaCache[key]
    ) {
      return metaCache[key];
    }

    const db =
      window.scDb;

    let compTitle = "";
    let stageTitle = "";

    let startMillis = 0;
    let endMillis = 0;

    let entryType =
      "team";

    let format =
      "classic";

    try {
      const cSnap =
        await db
          .collection(
            "competitions"
          )
          .doc(compId)
          .get();

      if (
        cSnap.exists
      ) {
        const c =
          cSnap.data() ||
          {};

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
            e => {
              const evId =
                norm(
                  e?.key ||
                  e?.stageId ||
                  e?.id
                );

              return (
                evId === st
              );
            }
          );

        entryType =
          entryTypeFromCompetition(
            ev || null,
            c
          );

        format =
          normLower(
            ev?.format ||
            c.format ||
            c.engine?.baseFormat ||
            "classic"
          );

        if (ev) {
          stageTitle =
            norm(
              ev.title ||
              ev.name ||
              ev.label ||
              ""
            );

          const startValue =
            readStartDate(ev) ||
            readStartDate(c);

          const endValue =
            readEndDate(ev) ||
            readEndDate(c) ||
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
            readStartDate(c);

          const endValue =
            readEndDate(c) ||
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
      }

    } catch (e) {
      console.warn(
        "[my_participation] Competition meta read error:",
        compId,
        st,
        e
      );
    }

    const res = {
      compTitle,
      stageTitle,

      startMillis,
      endMillis,

      entryType,
      format
    };

    metaCache[key] =
      res;

    return res;
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
      stage = "";
    }

    if (
      !stage &&
      it.stageId &&
      it.stageId !==
        "main"
    ) {
      const m =
        String(
          it.stageId
        ).match(
          /\d+/
        );

      if (m) {
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
     * Якщо дат немає —
     * запис не ховаємо.
     */
    return true;
  }

  // =========================================================
  // ROW HELPERS
  // =========================================================

  function rowEntryType(row) {
    return normLower(
      row?.entryType
    ) === "solo"
      ? "solo"
      : "team";
  }

  function rowTime(row) {
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
    if (!oldRow) {
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
      rowTime(newRow) >
      rowTime(oldRow)
    )
      ? newRow
      : oldRow;
  }

  // =========================================================
  // RENDER
  // =========================================================

  function renderItems(items) {
    if (
      !items ||
      items.length === 0
    ) {
      showMuted(
        "Немає майбутніх змагань"
      );

      return;
    }

    let html = "";

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
          rowEntryType(it);

        const isSolo =
          entryType ===
          "solo";

        const identityLabel =
          isSolo
            ? "Учасник"
            : "Команда";

        const identityName =
          isSolo
            ? (
                norm(
                  it.participantName
                ) ||
                norm(
                  it.displayName
                ) ||
                norm(
                  currentProfile?.fullName
                ) ||
                norm(
                  currentUser?.email
                ) ||
                "—"
              )
            : (
                norm(
                  it.teamName
                ) ||
                norm(
                  it.displayName
                ) ||
                "—"
              );

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

    const combined =
      [
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
    // DEDUPE BY DOCUMENT ID
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

        byDocId[row.id] =
          chooseBetterRow(
            byDocId[row.id],
            row
          );
      }
    );

    const rows =
      Object.values(
        byDocId
      );

    // =====================================================
    // LOAD COMPETITION META
    // =====================================================

    for (
      const it of rows
    ) {
      const compId =
        norm(
          it.competitionId
        );

      const stageId =
        norm(
          it.stageId
        ) || "main";

      if (!compId) {
        continue;
      }

      const meta =
        await getCompetitionMeta(
          compId,
          stageId
        );

      if (
        requestId !==
        renderRequestId
      ) {
        return;
      }

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

      /*
       * Якщо entryType відсутній
       * у старому public document —
       * беремо його зі competition.
       *
       * Якщо entryType уже є —
       * довіряємо самій заявці.
       */
      if (
        !norm(
          it.entryType
        )
      ) {
        it.entryType =
          meta.entryType ||
          "team";
      }

      const isSolo =
        rowEntryType(it) ===
        "solo";

      if (isSolo) {
        /*
         * SOLO:
         * команда тут не використовується.
         */
        it.teamId =
          null;

        it.teamName =
          null;

        it.participantName =
          norm(
            it.participantName
          ) ||
          norm(
            it.displayName
          ) ||
          (
            norm(it.uid) ===
            norm(currentUser?.uid)
              ? (
                  norm(
                    currentProfile?.fullName
                  ) ||
                  norm(
                    currentUser?.email
                  )
                )
              : ""
          );

      } else {
        /*
         * TEAM.
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

        if (!compId) {
          return;
        }

        const stageId =
          norm(
            row.stageId
          ) || "main";

        const entryType =
          rowEntryType(row);

        let identity = "";

        if (
          entryType ===
          "solo"
        ) {
          identity =
            norm(
              row.uid
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

        const key =
          `${compId}||` +
          `${stageId}||` +
          `${entryType}||` +
          `${identity}`;

        participationMap[key] =
          chooseBetterRow(
            participationMap[key],
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
          ap !== bp
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
    if (!teamId) {
      teamRows = [];
      teamLoaded = true;

      rebuildParticipation();

      return;
    }

    /*
     * Не ставимо entryType == team
     * у Firestore query.
     *
     * Так підтримуємо старі TEAM документи,
     * де entryType ще могло бути відсутнє.
     */
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
            const rows = [];

            qs.forEach(
              d => {
                const data =
                  d.data() ||
                  {};

                /*
                 * SOLO сюди не повинно
                 * потрапляти.
                 *
                 * Нові SOLO мають:
                 * teamId = null.
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

                  entryType:
                    norm(
                      data.entryType
                    ) ||
                    "team"
                });
              }
            );

            teamRows =
              rows;

            teamLoaded =
              true;

            rebuildParticipation();
          },

          err => {
            console.warn(
              "[my_participation] TEAM query:",
              err
            );

            teamRows = [];
            teamLoaded = true;

            rebuildParticipation();
          }
        );

    unsubs.push(
      unsub
    );
  }

  // =========================================================
  // SOLO SUBSCRIPTION
  // =========================================================

  function subscribeSoloParticipation(
    db,
    uid
  ) {
    if (!uid) {
      soloRows = [];
      soloLoaded = true;

      rebuildParticipation();

      return;
    }

    /*
     * SOLO шукаємо ПО UID.
     *
     * Не по команді.
     *
     * Тому два, три або десять
     * учасників однієї команди
     * можуть незалежно мати
     * свої SOLO заявки.
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
            const rows = [];

            qs.forEach(
              d => {
                const data =
                  d.data() ||
                  {};

                if (
                  normLower(
                    data.entryType
                  ) !== "solo"
                ) {
                  return;
                }

                rows.push({
                  id:
                    d.id,

                  ...data,

                  entryType:
                    "solo"
                });
              }
            );

            soloRows =
              rows;

            soloLoaded =
              true;

            rebuildParticipation();
          },

          err => {
            console.warn(
              "[my_participation] SOLO query:",
              err
            );

            soloRows = [];
            soloLoaded = true;

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

    teamRows = [];
    soloRows = [];

    teamLoaded = false;
    soloLoaded = false;

    showMuted(
      "Завантаження участі…"
    );

    const uSnap =
      await db
        .collection(
          "users"
        )
        .doc(
          user.uid
        )
        .get();

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

    currentUser =
      user;

    currentProfile = {
      uid:
        user.uid,

      email:
        norm(
          user.email
        ),

      fullName:
        norm(
          u.fullName ||
          u.name ||
          user.email
        ),

      teamId,

      teamName:
        norm(
          u.teamName
        )
    };

    /*
     * TEAM:
     * якщо користувач у команді —
     * бачить заявку своєї команди.
     *
     * Якщо команди немає —
     * TEAM просто пропускаємо.
     */
    subscribeTeamParticipation(
      db,
      teamId
    );

    /*
     * SOLO:
     * завжди перевіряємо UID.
     *
     * Навіть якщо користувач
     * взагалі не входить у команду.
     */
    subscribeSoloParticipation(
      db,
      user.uid
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

            currentUser =
              user ||
              null;

            currentProfile =
              null;

            teamRows = [];
            soloRows = [];

            teamLoaded = false;
            soloLoaded = false;

            if (!user) {
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

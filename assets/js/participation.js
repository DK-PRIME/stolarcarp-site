// assets/js/participation.js
// STOLAR CARP • Participation list
//
// ✅ TEAM + SOLO
// ✅ TEAM -> назва команди
// ✅ SOLO -> ім'я та прізвище учасника
// ✅ "Учасник" / "Participant" не вважається справжнім ім'ям
// ✅ Legacy SOLO: старий TEAM-запис у SOLO competition показується як SOLO
// ✅ Stalker Teams -> TEAM
// ✅ Final -> TEAM
// ✅ SOLO не відкриває popup команди
// ✅ public_participants
// ✅ без додаткового Firestore index по entryType

(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  const esc = s =>
    String(s ?? "").replace(
      /[&<>"']/g,
      m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[m]
    );

  const norm = v =>
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const normLower = v =>
    norm(v).toLowerCase();

  const isPaidStatus = status =>
    [
      "confirmed",
      "paid",
      "payment_confirmed"
    ].includes(
      normLower(status)
    );

  const ALLOWED_STATUSES =
    new Set([
      "confirmed",
      "paid",
      "payment_confirmed",
      "pending_payment",
      "cancelled"
    ]);

  const userNameCache =
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
        window.scDb
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
    const explicit =
      normLower(
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

    const format =
      normLower(
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

    const text =
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
      text.includes("final") ||
      text.includes("фінал")
    );
  }

  function resolveRowEntryType(
    row,
    meta
  ) {
    const explicit =
      normLower(
        row?.entryType
      );

    /*
     * Фінал залишається TEAM.
     */
    if (
      meta.isFinal
    ) {
      return "team";
    }

    /*
     * Для SOLO competition
     * competition/event є головним
     * джерелом істини.
     */
    if (
      meta.entryType === "solo"
    ) {
      return "solo";
    }

    if (
      explicit === "solo" ||
      explicit === "team"
    ) {
      return explicit;
    }

    /*
     * Legacy SOLO.
     */
    if (
      !norm(
        row?.teamId
      ) &&
      (
        norm(
          row?.participantName
        ) ||
        norm(
          row?.displayName
        )
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
    const db =
      window.scDb;

    let title =
      "Змагання";

    let stageTitle =
      "";

    let entryType =
      "team";

    let format =
      "classic";

    let competition =
      {};

    let event =
      null;

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
        competition =
          cSnap.data() ||
          {};

        title =
          competition.name ||
          competition.title ||
          title;

        const events =
          Array.isArray(
            competition.events
          )
            ? competition.events
            : [];

        const wantedStage =
          norm(stageId) ||
          "main";

        event =
          events.find(
            e => {
              const id =
                norm(
                  e?.key ||
                  e?.stageId ||
                  e?.id
                );

              return (
                id ===
                wantedStage
              );
            }
          ) || null;

        if (
          event
        ) {
          stageTitle =
            norm(
              event.title ||
              event.name ||
              event.label ||
              ""
            );
        }

        entryType =
          resolveCompetitionEntryType(
            competition,
            event
          );

        format =
          normLower(
            event?.format ||
            event?.engine?.baseFormat ||
            competition.format ||
            competition.engine
              ?.baseFormat ||
            "classic"
          );
      }

    } catch (e) {
      console.warn(
        "[participation] competition meta:",
        e
      );
    }

    const isFinal =
      isFinalMeta(
        event,
        stageId
      );

    if (
      isFinal
    ) {
      entryType =
        "team";
    }

    return {
      title:
        norm(title) ||
        "Змагання",

      stageTitle:
        norm(
          stageTitle
        ),

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

  async function getMaxEntries(
    compId,
    stageId
  ) {
    const db =
      window.scDb;

    let max =
      21;

    try {
      const cSnap =
        await db
          .collection(
            "competitions"
          )
          .doc(compId)
          .get();

      if (
        !cSnap.exists
      ) {
        return max;
      }

      const c =
        cSnap.data() ||
        {};

      const events =
        Array.isArray(
          c.events
        )
          ? c.events
          : [];

      const ev =
        events.find(
          e =>
            norm(
              e?.key ||
              e?.stageId ||
              e?.id
            ) ===
            norm(stageId)
        );

      const value =
        ev?.maxParticipants ??
        ev?.participantsLimit ??
        ev?.maxTeams ??
        ev?.teamsLimit ??
        c?.maxParticipants ??
        c?.participantsLimit ??
        c?.maxTeams ??
        c?.teamsLimit ??
        null;

      const n =
        typeof value ===
        "number"
          ? value
          : parseInt(
              String(
                value ||
                ""
              ),
              10
            );

      if (
        Number.isFinite(n) &&
        n > 0
      ) {
        max =
          n;
      }

    } catch (_) {}

    return max;
  }

  // =========================================================
  // PERSON NAME HELPERS
  // =========================================================

  /*
   * Такі значення НЕ є ім'ям.
   *
   * Тобто якщо в Firestore:
   *
   * participantName: "Учасник"
   *
   * ми НЕ зупиняємось на цьому,
   * а шукаємо справжнє ПІБ далі.
   */

  function isPlaceholderPersonName(
    value
  ) {
    const raw =
      normLower(
        value
      );

    if (
      !raw
    ) {
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
      ].includes(
        raw
      )
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

  function validPersonalName(
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

    /*
     * У SOLO назва команди
     * не може бути ім'ям людини.
     */
    if (
      team &&
      normLower(name) ===
        normLower(team)
    ) {
      return "";
    }

    return name;
  }

  function personNameFromObject(
    data
  ) {
    const d =
      data ||
      {};

    const firstName =
      validPersonalName(
        d.firstName
      );

    const lastName =
      validPersonalName(
        d.lastName
      );

    if (
      firstName &&
      lastName
    ) {
      return (
        `${firstName} ${lastName}`
      );
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
      d.displayName,
      d.name,
      d.captain
    ];

    for (
      const candidate
      of candidates
    ) {
      const name =
        validPersonalName(
          candidate,
          teamName
        );

      if (
        name
      ) {
        return name;
      }
    }

    return "";
  }

  /*
   * Наприклад:
   *
   * Роман Дячок
   * -> Дячок Роман
   *
   * якщо довге:
   *
   * Олександр Коваленко
   * -> Коваленко О.
   */

  function formatSoloName(
    value,
    maxChars = 18
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
      return "Учасник";
    }

    const parts =
      raw
        .split(" ")
        .filter(
          Boolean
        );

    if (
      parts.length < 2
    ) {
      return raw;
    }

    /*
     * У профілі очікуємо:
     * Ім'я Прізвище
     *
     * або:
     * Ім'я По-батькові Прізвище.
     */

    const firstName =
      parts[0];

    const lastName =
      parts[
        parts.length - 1
      ];

    const full =
      `${lastName} ${firstName}`;

    if (
      full.length <=
      maxChars
    ) {
      return full;
    }

    const initial =
      firstName
        .charAt(0)
        .toUpperCase();

    return initial
      ? `${lastName} ${initial}.`
      : lastName;
  }

  // =========================================================
  // USER NAME FALLBACK
  // =========================================================

  async function getUserDisplayName(
    uid
  ) {
    const id =
      norm(
        uid
      );

    if (
      !id
    ) {
      return "";
    }

    if (
      userNameCache.has(
        id
      )
    ) {
      return (
        userNameCache.get(
          id
        ) ||
        ""
      );
    }

    let name =
      "";

    try {
      const snap =
        await window.scDb
          .collection(
            "users"
          )
          .doc(id)
          .get();

      if (
        snap.exists
      ) {
        name =
          personNameFromObject(
            snap.data() ||
            {}
          );
      }

    } catch (e) {
      /*
       * На публічній сторінці
       * users може бути закрита Rules.
       *
       * Тоді ім'я повинно бути
       * у public_participants.
       */

      console.warn(
        "[participation] user name fallback skipped:",
        id,
        e?.message ||
        e
      );
    }

    userNameCache.set(
      id,
      name
    );

    return name;
  }

  /*
   * UID беремо не тільки з поля uid.
   *
   * Підтримує:
   * participantUid
   * userId
   * registeredByUid
   *
   * і canonical document ID:
   *
   * comp__main__solo__UID
   */

  function uidFromPublicDoc(
    doc,
    data
  ) {
    const r =
      data ||
      {};

    const direct =
      norm(
        r.uid ||
        r.participantUid ||
        r.userId ||
        r.registeredByUid ||
        ""
      );

    if (
      direct
    ) {
      return direct;
    }

    const docId =
      norm(
        doc?.id
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

  // =========================================================
  // TEAM POPUP
  // =========================================================

  async function openTeamPopup(
    teamName,
    teamDocId
  ) {
    if (
      !teamDocId
    ) {
      return;
    }

    const popup =
      $("teamPopup");

    const title =
      $("teamPopupTitle");

    const body =
      $("teamPopupBody");

    if (
      !popup ||
      !title ||
      !body
    ) {
      return;
    }

    title.textContent =
      teamName ||
      "Команда";

    body.innerHTML =
      '<div class="team-loading">Завантаження складу…</div>';

    popup.style.display =
      "flex";

    try {
      const db =
        window.scDb;

      const teamSnap =
        await db
          .collection(
            "teams"
          )
          .doc(
            teamDocId
          )
          .get();

      if (
        !teamSnap.exists
      ) {
        body.innerHTML =
          '<div class="team-loading">Команду не знайдено</div>';

        return;
      }

      const team =
        teamSnap.data() ||
        {};

      const ownerUid =
        team.ownerUid ||
        null;

      const members =
        [];

      const used =
        new Set();

      const usersSnap =
        await db
          .collection(
            "users"
          )
          .where(
            "teamId",
            "==",
            teamDocId
          )
          .get();

      usersSnap.forEach(
        doc => {
          const d =
            doc.data() ||
            {};

          members.push({
            id:
              doc.id,

            fullName:
              personNameFromObject(
                d
              ) ||
              d.email ||
              "Учасник",

            role:
              d.role ||
              "member",

            avatarUrl:
              d.avatarUrl ||
              d.photoURL ||
              null
          });

          used.add(
            doc.id
          );
        }
      );

      if (
        ownerUid &&
        !used.has(
          ownerUid
        )
      ) {
        const capSnap =
          await db
            .collection(
              "users"
            )
            .doc(
              ownerUid
            )
            .get();

        if (
          capSnap.exists
        ) {
          const c =
            capSnap.data() ||
            {};

          members.push({
            id:
              ownerUid,

            fullName:
              personNameFromObject(
                c
              ) ||
              c.email ||
              "Капітан",

            role:
              "captain",

            avatarUrl:
              c.avatarUrl ||
              c.photoURL ||
              null
          });
        }
      }

      if (
        !members.length
      ) {
        body.innerHTML =
          '<div class="team-loading">Склад команди порожній</div>';

        return;
      }

      members.sort(
        (a, b) => {
          const aCap =
            a.role ===
              "captain" ||
            (
              ownerUid &&
              a.id ===
                ownerUid
            );

          const bCap =
            b.role ===
              "captain" ||
            (
              ownerUid &&
              b.id ===
                ownerUid
            );

          if (
            aCap &&
            !bCap
          ) {
            return -1;
          }

          if (
            bCap &&
            !aCap
          ) {
            return 1;
          }

          return (
            a.fullName ||
            ""
          ).localeCompare(
            b.fullName ||
            "",
            "uk"
          );
        }
      );

      body.innerHTML =
        members
          .map(
            member => {
              const avatarHtml =
                member.avatarUrl
                  ? `
                    <div class="member-avatar">
                      <img
                        src="${esc(
                          member.avatarUrl
                        )}"
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
                member.role ===
                  "captain" ||
                (
                  ownerUid &&
                  member.id ===
                    ownerUid
                );

              return `
                <div class="team-member">

                  ${avatarHtml}

                  <div class="member-info">

                    <div class="member-name">
                      ${esc(
                        member.fullName
                      )}
                    </div>

                    <div class="member-role">
                      ${
                        isCaptain
                          ? "⭐ Капітан"
                          : "Учасник"
                      }
                    </div>

                  </div>

                </div>
              `;
            }
          )
          .join("");

    } catch (err) {
      console.error(
        "[participation] team popup:",
        err
      );

      body.innerHTML = `
        <div class="team-loading">
          Помилка: ${esc(
            err?.message ||
            err
          )}
        </div>
      `;
    }
  }

  function closeTeamPopup() {
    const popup =
      $("teamPopup");

    if (
      popup
    ) {
      popup.style.display =
        "none";
    }
  }

  window.openTeamPopup =
    openTeamPopup;

  window.closeTeamPopup =
    closeTeamPopup;

  document.addEventListener(
    "click",
    event => {
      if (
        event.target.id ===
        "teamPopupClose"
      ) {
        closeTeamPopup();
      }
    }
  );

  document.addEventListener(
    "click",
    event => {
      const popup =
        $("teamPopup");

      const content =
        $("teamPopupContent");

      if (
        popup?.style.display ===
          "flex" &&
        event.target ===
          popup &&
        !content?.contains(
          event.target
        )
      ) {
        closeTeamPopup();
      }
    }
  );

  window.addEventListener(
    "popstate",
    closeTeamPopup
  );

  // =========================================================
  // MEALS
  // =========================================================

  function attachMealButtons() {
    const btnOpen =
      $("btnMealGateOpen");

    const btnOrder =
      $("btnOpenMealOrder");

    const btnList =
      $("btnOpenMealList");

    const btnClear =
      $("btnClearMealOrders");

    if (
      btnOpen
    ) {
      btnOpen.onclick =
        () => {
          if (
            window.scMeals &&
            typeof window.scMeals
              .openMeals ===
              "function"
          ) {
            window.scMeals
              .openMeals();
          }
        };
    }

    if (
      btnOrder
    ) {
      btnOrder.onclick =
        () => {
          if (
            window.scMeals &&
            typeof window.scMeals
              .openOrder ===
              "function"
          ) {
            window.scMeals
              .openOrder();
          }
        };
    }

    if (
      btnList
    ) {
      btnList.onclick =
        () => {
          if (
            window.scMeals &&
            typeof window.scMeals
              .openList ===
              "function"
          ) {
            window.scMeals
              .openList();
          }
        };
    }

    if (
      btnClear
    ) {
      btnClear.onclick =
        () => {
          if (
            window.scMeals &&
            typeof window.scMeals
              .clearOrders ===
              "function"
          ) {
            window.scMeals
              .clearOrders();
          }
        };
    }

    if (
      window.scMeals &&
      typeof window.scMeals
        .setContext ===
        "function" &&
      window.scMealContext
    ) {
      window.scMeals
        .setContext(
          window.scMealContext
        );
    }
  }

  // =========================================================
  // STAGE
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
  // DISPLAY NAMES
  // =========================================================

  function participantDisplayName(
    row
  ) {
    const raw =
      personNameFromObject(
        row
      );

    return raw
      ? formatSoloName(
          raw
        )
      : "Учасник";
  }

  function teamDisplayName(
    row
  ) {
    return (
      norm(
        row.teamName
      ) ||
      norm(
        row.displayName
      ) ||
      "—"
    );
  }

  // =========================================================
  // NORMALIZE PUBLIC ROW
  // =========================================================

  async function normalizeParticipantRow(
    doc,
    meta
  ) {
    const r =
      doc.data() ||
      {};

    const status =
      normLower(
        r.status ||
        "pending_payment"
      );

    if (
      !ALLOWED_STATUSES
        .has(
          status
        )
    ) {
      return null;
    }

    const entryType =
      resolveRowEntryType(
        r,
        meta
      );

    // =====================================================
    // SOLO
    // =====================================================

    if (
      entryType ===
      "solo"
    ) {
      const uid =
        uidFromPublicDoc(
          doc,
          r
        );

      if (
        !uid
      ) {
        return null;
      }

      const teamName =
        norm(
          r.teamName ||
          r.team ||
          ""
        );

      /*
       * Спочатку шукаємо нормальне
       * персональне ім'я в самому
       * public_participants.
       */
      let participantName =
        personNameFromObject(
          r
        );

      /*
       * "Учасник" — це заглушка.
       *
       * Так само якщо випадково
       * participantName === teamName.
       *
       * Тоді пробуємо users/{uid}.
       */
      if (
        !participantName ||
        isPlaceholderPersonName(
          participantName
        ) ||
        (
          teamName &&
          normLower(
            participantName
          ) ===
            normLower(
              teamName
            )
        )
      ) {
        const fromUser =
          await getUserDisplayName(
            uid
          );

        if (
          fromUser
        ) {
          participantName =
            fromUser;
        }
      }

      /*
       * КЛЮЧОВЕ:
       *
       * У SOLO НІКОЛИ
       * не підставляємо teamName
       * як ім'я людини.
       */

      if (
        !participantName ||
        isPlaceholderPersonName(
          participantName
        )
      ) {
        participantName =
          "Учасник";
      }

      return {
        participantDocId:
          doc.id,

        sourceEntryType:
          normLower(
            r.entryType
          ),

        legacyConvertedToSolo:
          normLower(
            r.entryType
          ) !== "solo",

        entryType:
          "solo",

        uid,

        participantName,

        displayName:
          participantName,

        firstName:
          norm(
            r.firstName
          ),

        lastName:
          norm(
            r.lastName
          ),

        teamId:
          null,

        teamName:
          null,

        status,

        createdAt:
          r.createdAt ||
          null,

        confirmedAt:
          r.confirmedAt ||
          null,

        updatedAt:
          r.updatedAt ||
          null,

        orderPaid:
          Number.isFinite(
            r.orderPaid
          )
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
    }

    // =====================================================
    // TEAM
    // =====================================================

    const teamId =
      norm(
        r.teamId
      );

    if (
      !teamId
    ) {
      return null;
    }

    const teamName =
      teamDisplayName(
        r
      );

    return {
      participantDocId:
        doc.id,

      sourceEntryType:
        normLower(
          r.entryType
        ),

      legacyConvertedToSolo:
        false,

      entryType:
        "team",

      uid:
        norm(
          r.uid
        ),

      teamId,

      teamName,

      displayName:
        teamName,

      status,

      createdAt:
        r.createdAt ||
        null,

      confirmedAt:
        r.confirmedAt ||
        null,

      updatedAt:
        r.updatedAt ||
        null,

      orderPaid:
        Number.isFinite(
          r.orderPaid
        )
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
  }

  // =========================================================
  // TIMESTAMP
  // =========================================================

  function timestampMs(
    value
  ) {
    if (
      !value
    ) {
      return 0;
    }

    try {
      if (
        typeof value.toMillis ===
        "function"
      ) {
        return value
          .toMillis();
      }

      if (
        typeof value.toDate ===
        "function"
      ) {
        return value
          .toDate()
          .getTime();
      }

      if (
        value._seconds
      ) {
        return (
          value._seconds *
          1000
        );
      }

      const d =
        new Date(
          value
        );

      return Number.isNaN(
        d.getTime()
      )
        ? 0
        : d.getTime();

    } catch {
      return 0;
    }
  }

  function rowTimestamp(
    row
  ) {
    return timestampMs(
      row.updatedAt ||
      row.confirmedAt ||
      row.createdAt
    );
  }

  // =========================================================
  // DEDUPE
  // =========================================================

  function chooseBetterRow(
    a,
    b
  ) {
    if (
      !a
    ) {
      return b;
    }

    if (
      !b
    ) {
      return a;
    }

    /*
     * Справжній новий SOLO
     * кращий за legacy TEAM,
     * який ми трактуємо як SOLO.
     */
    if (
      a.legacyConvertedToSolo !==
      b.legacyConvertedToSolo
    ) {
      return a.legacyConvertedToSolo
        ? b
        : a;
    }

    const aPaid =
      isPaidStatus(
        a.status
      );

    const bPaid =
      isPaidStatus(
        b.status
      );

    if (
      aPaid !==
      bPaid
    ) {
      return bPaid
        ? b
        : a;
    }

    return (
      rowTimestamp(
        b
      ) >
      rowTimestamp(
        a
      )
    )
      ? b
      : a;
  }

  function dedupeRows(
    rows
  ) {
    const map =
      new Map();

    rows.forEach(
      row => {
        let identity =
          row.entryType ===
          "solo"
            ? norm(
                row.uid
              )
            : norm(
                row.teamId
              );

        if (
          !identity
        ) {
          identity =
            row.participantDocId;
        }

        const key =
          `${row.entryType}||${identity}`;

        map.set(
          key,
          chooseBetterRow(
            map.get(key),
            row
          )
        );
      }
    );

    return Array.from(
      map.values()
    );
  }

  // =========================================================
  // ROW HTML
  // =========================================================

  function rowHtml(
    idx,
    row
  ) {
    const paid =
      isPaidStatus(
        row.status
      );

    const isSolo =
      row.entryType ===
      "solo";

    const name =
      isSolo
        ? participantDisplayName(
            row
          )
        : teamDisplayName(
            row
          );

    const teamId =
      isSolo
        ? ""
        : norm(
            row.teamId
          );

    const teamName =
      isSolo
        ? ""
        : teamDisplayName(
            row
          );

    return `
      <div
        class="row ${
          isSolo
            ? "row--solo"
            : "row--team"
        }"

        data-entry-type="${esc(
          row.entryType
        )}"

        data-team-id="${esc(
          teamId
        )}"

        data-team-name="${esc(
          teamName
        )}"

        style="
          cursor:${
            !isSolo &&
            teamId
              ? "pointer"
              : "default"
          };
        "
      >

        <span
          class="lamp ${
            paid
              ? "lamp--green"
              : "lamp--red"
          }"
        ></span>

        <span class="idx">
          ${idx}.
        </span>

        <span
          class="name"
          title="${esc(
            row.participantName ||
            name
          )}"
        >
          ${esc(name)}
        </span>

        <span
          class="status ${
            paid
              ? "status--paid"
              : "status--unpaid"
          }"
        >
          ${
            paid
              ? "Оплачено"
              : "Очікується"
          }
        </span>

      </div>
    `;
  }

  // =========================================================
  // RENDER
  // =========================================================

  function render(
    rows,
    maxEntries
  ) {
    const list =
      $("teamsList");

    const msg =
      $("msg");

    if (
      !list
    ) {
      return;
    }

    list.innerHTML =
      "";

    if (
      msg
    ) {
      msg.textContent =
        "";
    }

    const main =
      rows.slice(
        0,
        maxEntries
      );

    const reserve =
      rows.slice(
        maxEntries
      );

    if (
      !rows.length
    ) {
      list.innerHTML =
        '<div class="mutedCenter">Нема заявок на це змагання</div>';

      attachMealButtons();

      return;
    }

    list.innerHTML +=
      main
        .map(
          (
            row,
            index
          ) =>
            rowHtml(
              index + 1,
              row
            )
        )
        .join("");

    if (
      reserve.length
    ) {
      list.innerHTML += `
        <div class="dividerLabel">
          Резерв: ${reserve.length}
        </div>
      `;

      list.innerHTML +=
        reserve
          .map(
            (
              row,
              index
            ) =>
              rowHtml(
                maxEntries +
                index +
                1,
                row
              )
          )
          .join("");
    }

    /*
     * Popup тільки для TEAM.
     */
    list
      .querySelectorAll(
        ".row"
      )
      .forEach(
        row => {
          row.addEventListener(
            "click",
            () => {
              const entryType =
                normLower(
                  row.dataset
                    .entryType
                );

              if (
                entryType ===
                "solo"
              ) {
                return;
              }

              const teamId =
                norm(
                  row.dataset
                    .teamId
                );

              const teamName =
                norm(
                  row.dataset
                    .teamName
                );

              if (
                teamId
              ) {
                openTeamPopup(
                  teamName,
                  teamId
                );
              }
            }
          );
        }
      );

    attachMealButtons();
  }

  // =========================================================
  // SORT
  // =========================================================

  function sortRows(
    rows
  ) {
    const rank = {
      confirmed:
        1,

      paid:
        1,

      payment_confirmed:
        1,

      cancelled:
        1,

      pending_payment:
        2
    };

    rows.sort(
      (a, b) => {
        const aRank =
          rank[
            normLower(
              a.status
            )
          ] ||
          99;

        const bRank =
          rank[
            normLower(
              b.status
            )
          ] ||
          99;

        if (
          aRank !==
          bRank
        ) {
          return (
            aRank -
            bRank
          );
        }

        if (
          aRank ===
          1
        ) {
          if (
            Number.isFinite(
              a.orderPaid
            ) &&
            Number.isFinite(
              b.orderPaid
            )
          ) {
            return (
              a.orderPaid -
              b.orderPaid
            );
          }

          if (
            Number.isFinite(
              a.orderPaid
            )
          ) {
            return -1;
          }

          if (
            Number.isFinite(
              b.orderPaid
            )
          ) {
            return 1;
          }

          return (
            timestampMs(
              a.confirmedAt
            ) -
            timestampMs(
              b.confirmedAt
            )
          );
        }

        return (
          timestampMs(
            a.createdAt
          ) -
          timestampMs(
            b.createdAt
          )
        );
      }
    );

    return rows;
  }

  // =========================================================
  // INIT
  // =========================================================

  (async function init() {
    try {
      await waitFirebase();

      const db =
        window.scDb;

      const params =
        new URLSearchParams(
          location.search
        );

      const compId =
        norm(
          params.get(
            "comp"
          )
        );

      const stageParam =
        norm(
          params.get(
            "stage"
          )
        ) ||
        "main";

      if (
        !compId
      ) {
        if (
          $("msg")
        ) {
          $("msg")
            .textContent =
            "❌ Не передано competitionId";
        }

        return;
      }

      // =====================================================
      // META
      // =====================================================

      const meta =
        await getCompetitionMeta(
          compId,
          stageParam
        );

      const maxEntries =
        await getMaxEntries(
          compId,
          stageParam
        );

      if (
        $("pageTitle")
      ) {
        $("pageTitle")
          .textContent =
          meta.title;
      }

      if (
        $("pageSub")
      ) {
        $("pageSub")
          .textContent =
          meta.stageTitle ||
          "";
      }

      if (
        $("msg")
      ) {
        $("msg")
          .textContent =
          "Завантаження списку…";
      }

      // =====================================================
      // PUBLIC PARTICIPANTS
      // =====================================================

      /*
       * entryType спеціально
       * НЕ додаємо в where,
       * щоб legacy SOLO теж
       * потрапив у список.
       */

      const snap =
        await db
          .collection(
            "public_participants"
          )
          .where(
            "competitionId",
            "==",
            compId
          )
          .get();

      const docs =
        [];

      snap.forEach(
        doc => {
          const r =
            doc.data() ||
            {};

          if (
            !stageMatches(
              r.stageId,
              stageParam
            )
          ) {
            return;
          }

          docs.push(
            doc
          );
        }
      );

      // =====================================================
      // NORMALIZE
      // =====================================================

      const normalized =
        await Promise.all(
          docs.map(
            doc =>
              normalizeParticipantRow(
                doc,
                meta
              )
          )
        );

      let rows =
        normalized.filter(
          Boolean
        );

      rows =
        dedupeRows(
          rows
        );

      rows =
        sortRows(
          rows
        );

      // =====================================================
      // MEAL CONTEXT
      // =====================================================

      window.scMealContext = {
        competitionId:
          compId,

        stageId:
          stageParam,

        stageIdVariants: [
          stageParam,

          `stage-${stageParam}`,

          stageParam.replace(
            /^stage-/,
            ""
          )
        ].filter(
          Boolean
        ),

        competitionTitle:
          meta.title,

        stageTitle:
          meta.stageTitle,

        entryType:
          meta.entryType,

        format:
          meta.format,

        isFinal:
          meta.isFinal,

        maxTeams:
          maxEntries,

        maxParticipants:
          maxEntries,

        /*
         * Legacy meal_orders.js
         */
        teams:
          rows,

        participants:
          rows
      };

      if (
        $("msg")
      ) {
        $("msg")
          .textContent =
          "";
      }

      // =====================================================
      // RENDER
      // =====================================================

      render(
        rows,
        maxEntries
      );

      if (
        window.scMeals &&
        typeof window.scMeals
          .setContext ===
          "function"
      ) {
        window.scMeals
          .setContext(
            window.scMealContext
          );
      }

    } catch (e) {
      console.error(
        "[participation] init:",
        e
      );

      if (
        $("msg")
      ) {
        $("msg")
          .textContent =
          "❌ " +
          (
            e?.message ||
            e
          );
      }
    }
  })();

})();

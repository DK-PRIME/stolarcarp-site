// assets/js/draw_admin.js
// STOLAR CARP • Admin draw
//
// ✅ TEAM + SOLO
// ✅ TEAM -> teamId + teamName
// ✅ SOLO -> uid + participantName
// ✅ Stalker Solo -> персональний учасник
// ✅ Stalker Teams -> TEAM
// ✅ Final -> TEAM
// ✅ registrations + fallback public_participants
// ✅ if registration deleted -> save can restore it
// ✅ unique sectors A1..C8
// ✅ per-row save/clear
//
// КРИТИЧНО:
// ✅ stageResults ID = `${compId}__${stageKey}`
// ✅ settings/app.activeKey використовує ТОЙ САМИЙ ID
// ✅ більше немає старого `${compId}||${stageKey}` для stageResults
//
// ✅ SOLO передає в stageResults:
//    entryType: "solo"
//    entityId: uid
//    uid
//    participantName
//    displayName
//    teamId: null
//    teamName: null
//
// ✅ TEAM залишається без змін по суті

(function () {
  "use strict";

  const CONFIG = {
    ADMIN_UID: "5Dt6fN64c3aWACYV1WacxV2BHDl2",

    LS_KEY_STAGE:
      "sc_draw_selected_stage_v3",

    COLLECTIONS: {
      REGISTRATIONS:
        "registrations",

      COMPETITIONS:
        "competitions",

      USERS:
        "users",

      STAGE_RESULTS:
        "stageResults",

      SETTINGS:
        "settings",

      PUBLIC_PARTICIPANTS:
        "public_participants"
    }
  };

  const ENTRY_TEAM =
    "team";

  const ENTRY_SOLO =
    "solo";

  // =========================================================
  // SECTORS
  // =========================================================

  const SECTORS =
    (() => {
      const arr = [];

      [
        "A",
        "B",
        "C"
      ].forEach(
        zone => {
          for (
            let i = 1;
            i <= 8;
            i++
          ) {
            arr.push(
              `${zone}${i}`
            );
          }
        }
      );

      return arr;
    })();

  // =========================================================
  // STATE
  // =========================================================

  const state = {
    isAdmin:
      false,

    stageNameByKey:
      new Map(),

    /*
     * value:
     * competitionId||stageId
     *
     * metadata:
     * {
     *   compId,
     *   stageKey,
     *   entryType,
     *   format,
     *   isFinal
     * }
     */
    stageMetaByKey:
      new Map(),

    regsAllConfirmed:
      [],

    regsFiltered:
      [],

    usedSectorSet:
      new Set()
  };

  const userNameCache =
    new Map();

  // =========================================================
  // DOM
  // =========================================================

  const els = {
    stageSelect:
      document.getElementById(
        "stageSelect"
      ),

    qInput:
      document.getElementById(
        "q"
      ),

    msg:
      document.getElementById(
        "msg"
      ),

    drawRows:
      document.getElementById(
        "drawRows"
      ),

    countInfo:
      document.getElementById(
        "countInfo"
      )
  };

  const auth =
    window.scAuth;

  const db =
    window.scDb;

  if (
    !auth ||
    !db ||
    !window.firebase
  ) {
    if (
      els.msg
    ) {
      els.msg.textContent =
        "Firebase init не завантажився.";
    }

    return;
  }

  // =========================================================
  // UTILS
  // =========================================================

  const utils = {

    esc: value =>
      String(
        value ?? ""
      )
        .replace(
          /&/g,
          "&amp;"
        )
        .replace(
          /</g,
          "&lt;"
        )
        .replace(
          />/g,
          "&gt;"
        )
        .replace(
          /"/g,
          "&quot;"
        )
        .replace(
          /'/g,
          "&#39;"
        ),

    norm: value =>
      String(
        value ?? ""
      ).trim(),

    normLower: value =>
      String(
        value ?? ""
      )
        .trim()
        .toLowerCase(),

    setMsg:
      (
        text,
        ok = true
      ) => {
        if (
          !els.msg
        ) {
          return;
        }

        els.msg.textContent =
          text || "";

        els.msg.style.color =
          text
            ? (
                ok
                  ? "#8fe39a"
                  : "#ff6c6c"
              )
            : "";
      },

    parseStageValue:
      value => {
        const parts =
          String(
            value ||
            ""
          ).split(
            "||"
          );

        const compId =
          utils.norm(
            parts[0]
          );

        const stageKey =
          utils.norm(
            parts
              .slice(1)
              .join("||")
          ) ||
          "main";

        return {
          compId,
          stageKey
        };
      },

    currentStageValue:
      () =>
        els.stageSelect
          ?.value ||
        "",

    getCompIdFromReg:
      row =>
        row.competitionId ||
        row.compId ||
        row.competition ||
        row.seasonId ||
        row.season ||
        row.eventCompetitionId ||
        "",

    getStageIdFromReg:
      row => {
        const value =
          row.stageId ||
          row.stageKey ||
          row.stage ||
          row.eventId ||
          row.eventKey ||
          row.roundId ||
          "";

        return (
          utils.norm(
            value
          ) ||
          "main"
        );
      },

    parseSector:
      drawKey => {
        const value =
          utils
            .norm(
              drawKey
            )
            .toUpperCase();

        if (
          !value
        ) {
          return null;
        }

        const zone =
          value[0];

        const number =
          parseInt(
            value.slice(1),
            10
          );

        if (
          ![
            "A",
            "B",
            "C"
          ].includes(
            zone
          ) ||
          !Number.isFinite(
            number
          )
        ) {
          return null;
        }

        return {
          z:
            zone,

          n:
            number
        };
      },

    zoneRank:
      zone =>
        zone === "A"
          ? 1
          : zone === "B"
            ? 2
            : zone === "C"
              ? 3
              : 9,

    saveStageToLS:
      value => {
        try {
          localStorage.setItem(
            CONFIG.LS_KEY_STAGE,
            String(
              value ||
              ""
            )
          );
        } catch (_) {}
      },

    loadStageFromLS:
      () => {
        try {
          return (
            localStorage.getItem(
              CONFIG.LS_KEY_STAGE
            ) ||
            ""
          );
        } catch {
          return "";
        }
      },

    fmtTimeNow:
      () => {
        const d =
          new Date();

        return (
          `${String(
            d.getHours()
          ).padStart(
            2,
            "0"
          )}:` +
          `${String(
            d.getMinutes()
          ).padStart(
            2,
            "0"
          )}:` +
          `${String(
            d.getSeconds()
          ).padStart(
            2,
            "0"
          )}`
        );
      }
  };

  // =========================================================
  // EVENT HELPERS
  // =========================================================

  function eventKey(
    event,
    index
  ) {
    return utils.norm(
      event?.key ||
      event?.stageId ||
      event?.id ||
      `stage-${index + 1}`
    );
  }

  function eventTitle(
    event,
    index
  ) {
    return utils.norm(
      event?.title ||
      event?.name ||
      event?.label ||
      `Етап ${index + 1}`
    );
  }

  function normalizeFormat(
    value
  ) {
    return utils
      .normLower(
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

  function isFinalEvent(
    event,
    stageKey
  ) {
    const key =
      utils.normLower(
        event?.key ||
        event?.stageId ||
        event?.id ||
        stageKey ||
        ""
      );

    const text =
      utils.normLower(
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
      key.includes(
        "final"
      ) ||
      key.includes(
        "фінал"
      ) ||
      text.includes(
        "final"
      ) ||
      text.includes(
        "фінал"
      )
    );
  }

  function resolveCompetitionEntryType(
    competition,
    event,
    stageKey
  ) {
    /*
     * Поточна система фіналу:
     * тільки TEAM.
     */
    if (
      isFinalEvent(
        event,
        stageKey
      )
    ) {
      return ENTRY_TEAM;
    }

    const explicit =
      utils.normLower(
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

    const format =
      normalizeFormat(
        event?.format ||
        event?.engine
          ?.baseFormat ||
        competition?.format ||
        competition?.engine
          ?.baseFormat ||
        ""
      );

    /*
     * Legacy Stalker Solo.
     */
    if (
      format ===
      "stalker-solo"
    ) {
      return ENTRY_SOLO;
    }

    /*
     * Stalker Teams та
     * всі стандартні формати.
     */
    return ENTRY_TEAM;
  }

  // =========================================================
  // STAGE ID
  // =========================================================

  /*
   * ЄДИНИЙ canonical ID.
   *
   * ВАЖЛИВО:
   * НЕ ||.
   */
  function stageResultsDocId(
    compId,
    stageKey
  ) {
    return (
      `${utils.norm(
        compId
      )}__${utils.norm(
        stageKey
      ) || "main"}`
    );
  }

  // =========================================================
  // CURRENT META
  // =========================================================

  function currentStageMeta() {
    const value =
      utils.currentStageValue();

    return (
      state.stageMetaByKey.get(
        value
      ) ||
      null
    );
  }

  function currentEntryType() {
    return (
      currentStageMeta()
        ?.entryType ===
      ENTRY_SOLO
    )
      ? ENTRY_SOLO
      : ENTRY_TEAM;
  }

  function isSoloMode() {
    return (
      currentEntryType() ===
      ENTRY_SOLO
    );
  }

  // =========================================================
  // AUTH
  // =========================================================

  const authModule = {

    requireAdmin:
      async user => {
        if (
          !user
        ) {
          return false;
        }

        if (
          user.uid ===
          CONFIG.ADMIN_UID
        ) {
          return true;
        }

        const snap =
          await db
            .collection(
              CONFIG.COLLECTIONS
                .USERS
            )
            .doc(
              user.uid
            )
            .get();

        const role =
          snap.exists
            ? (
                snap.data() ||
                {}
              ).role ||
              ""
            : "";

        return (
          role ===
          "admin"
        );
      }
  };

  // =========================================================
  // USER NAME
  // =========================================================

  async function getUserNameByUid(
    uid
  ) {
    const id =
      utils.norm(
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
        await db
          .collection(
            CONFIG.COLLECTIONS
              .USERS
          )
          .doc(
            id
          )
          .get();

      if (
        snap.exists
      ) {
        const user =
          snap.data() ||
          {};

        const first =
          utils.norm(
            user.firstName
          );

        const last =
          utils.norm(
            user.lastName
          );

        if (
          first &&
          last
        ) {
          name =
            `${first} ${last}`;

        } else {
          name =
            utils.norm(
              user.fullName ||
              user.displayName ||
              user.name ||
              user.email ||
              ""
            );
        }
      }

    } catch (error) {
      console.warn(
        "[draw_admin] user name:",
        id,
        error
      );
    }

    userNameCache.set(
      id,
      name
    );

    return name;
  }

  // =========================================================
  // REGISTRATION NAME / IDENTITY
  // =========================================================

  function rowUid(
    row
  ) {
    let uid =
      utils.norm(
        row?.uid ||
        row?.participantUid ||
        row?.userId ||
        row?.registeredByUid ||
        ""
      );

    if (
      !uid &&
      utils
        .norm(
          row?._id
        )
        .includes(
          "__solo__"
        )
    ) {
      uid =
        utils.norm(
          String(
            row._id
          )
            .split(
              "__solo__"
            )
            .pop()
        );
    }

    return uid;
  }

  function participantNameFromRow(
    row
  ) {
    if (
      !row
    ) {
      return "";
    }

    const first =
      utils.norm(
        row.firstName
      );

    const last =
      utils.norm(
        row.lastName
      );

    if (
      first &&
      last
    ) {
      return (
        `${first} ${last}`
      );
    }

    let name =
      utils.norm(
        row.participantName ||
        row.fullName ||
        row.userName ||
        ""
      );

    if (
      name
    ) {
      return name;
    }

    if (
      row._profileName
    ) {
      return utils.norm(
        row._profileName
      );
    }

    /*
     * displayName лише якщо
     * це не назва команди.
     */
    const display =
      utils.norm(
        row.displayName
      );

    const teamName =
      utils.norm(
        row.teamName ||
        row.team
      );

    if (
      display &&
      display !==
        teamName
    ) {
      return display;
    }

    /*
     * captain може бути ПІБ
     * у legacy SOLO.
     */
    const captain =
      utils.norm(
        row.captain
      );

    if (
      captain &&
      captain !==
        teamName
    ) {
      return captain;
    }

    return "";
  }

  function displayRowName(
    row
  ) {
    if (
      isSoloMode()
    ) {
      return (
        participantNameFromRow(
          row
        ) ||
        "Учасник"
      );
    }

    return (
      utils.norm(
        row?.teamName ||
        row?.team ||
        row?.name ||
        ""
      ) ||
      "Команда"
    );
  }

  function entityIdForRow(
    row
  ) {
    if (
      isSoloMode()
    ) {
      return (
        rowUid(
          row
        ) ||
        utils.norm(
          row?._id
        )
      );
    }

    return utils.norm(
      row?.teamId
    );
  }

  // =========================================================
  // FIRESTORE
  // =========================================================

  const firestore = {

    // =======================================================
    // LOAD STAGES
    // =======================================================

    loadStagesToSelect:
      async () => {
        if (
          !els.stageSelect
        ) {
          return;
        }

        const keep =
          els.stageSelect.value ||
          utils.loadStageFromLS();

        els.stageSelect.innerHTML =
          `<option value="">Завантаження…</option>`;

        state.stageNameByKey =
          new Map();

        state.stageMetaByKey =
          new Map();

        const items =
          [];

        const snap =
          await db
            .collection(
              CONFIG.COLLECTIONS
                .COMPETITIONS
            )
            .get();

        snap.forEach(
          docSnap => {
            const competition =
              docSnap.data() ||
              {};

            const compId =
              docSnap.id;

            const brand =
              competition.brand ||
              "STOLAR CARP";

            const year =
              competition.year ||
              competition.seasonYear ||
              "";

            const compTitle =
              competition.name ||
              competition.title ||
              (
                year
                  ? `Season ${year}`
                  : compId
              );

            const events =
              Array.isArray(
                competition.events
              )
                ? competition.events
                : [];

            if (
              events.length
            ) {
              events.forEach(
                (
                  event,
                  index
                ) => {
                  const key =
                    eventKey(
                      event,
                      index
                    );

                  const title =
                    eventTitle(
                      event,
                      index
                    );

                  const label =
                    `${brand} · ${compTitle} — ${title}`;

                  const value =
                    `${compId}||${key}`;

                  const entryType =
                    resolveCompetitionEntryType(
                      competition,
                      event,
                      key
                    );

                  const format =
                    normalizeFormat(
                      event?.format ||
                      event?.engine
                        ?.baseFormat ||
                      competition.format ||
                      competition.engine
                        ?.baseFormat ||
                      "classic"
                    );

                  items.push({
                    value,
                    label
                  });

                  state.stageNameByKey.set(
                    value,
                    label
                  );

                  state.stageMetaByKey.set(
                    value,
                    {
                      compId,
                      stageKey:
                        key,

                      entryType,

                      format,

                      isFinal:
                        isFinalEvent(
                          event,
                          key
                        )
                    }
                  );
                }
              );

            } else {
              const key =
                "main";

              const label =
                `${brand} · ${compTitle}`;

              const value =
                `${compId}||main`;

              const entryType =
                resolveCompetitionEntryType(
                  competition,
                  null,
                  "main"
                );

              const format =
                normalizeFormat(
                  competition.format ||
                  competition.engine
                    ?.baseFormat ||
                  "classic"
                );

              items.push({
                value,
                label
              });

              state.stageNameByKey.set(
                value,
                label
              );

              state.stageMetaByKey.set(
                value,
                {
                  compId,

                  stageKey:
                    "main",

                  entryType,

                  format,

                  isFinal:
                    false
                }
              );
            }
          }
        );

        items.sort(
          (
            a,
            b
          ) =>
            a.label.localeCompare(
              b.label,
              "uk"
            )
        );

        els.stageSelect.innerHTML =
          `<option value="">— Оберіть —</option>` +
          items
            .map(
              item =>
                `<option value="${utils.esc(
                  item.value
                )}">${utils.esc(
                  item.label
                )}</option>`
            )
            .join("");

        if (
          keep
        ) {
          const option =
            Array.from(
              els.stageSelect
                .options ||
              []
            ).find(
              item =>
                String(
                  item.value
                ) ===
                String(
                  keep
                )
            );

          if (
            option
          ) {
            els.stageSelect.value =
              keep;
          }
        }
      },

    // =======================================================
    // NORMALIZE REG
    // =======================================================

    normalizeReg:
      (
        id,
        data,
        source
      ) => {
        const row =
          data || {};

        let uid =
          utils.norm(
            row.uid ||
            row.participantUid ||
            row.userId ||
            row.registeredByUid ||
            ""
          );

        if (
          !uid &&
          String(
            id
          ).includes(
            "__solo__"
          )
        ) {
          uid =
            utils.norm(
              String(
                id
              )
                .split(
                  "__solo__"
                )
                .pop()
            );
        }

        const firstName =
          utils.norm(
            row.firstName
          );

        const lastName =
          utils.norm(
            row.lastName
          );

        return {
          _id:
            id,

          _source:
            source,

          entryType:
            utils.normLower(
              row.entryType
            ),

          uid,

          participantUid:
            utils.norm(
              row.participantUid
            ),

          userId:
            utils.norm(
              row.userId
            ),

          registeredByUid:
            utils.norm(
              row.registeredByUid
            ),

          participantName:
            utils.norm(
              row.participantName
            ),

          firstName,

          lastName,

          fullName:
            utils.norm(
              row.fullName
            ),

          userName:
            utils.norm(
              row.userName
            ),

          displayName:
            utils.norm(
              row.displayName
            ),

          teamId:
            utils.norm(
              row.teamId
            ),

          teamName:
            utils.norm(
              row.teamName ||
              row.team ||
              row.name ||
              ""
            ),

          captain:
            utils.norm(
              row.captain ||
              row.captainName ||
              ""
            ),

          phone:
            utils.norm(
              row.phone ||
              row.captainPhone ||
              ""
            ),

          compId:
            utils.norm(
              utils.getCompIdFromReg(
                row
              )
            ),

          stageId:
            utils.getStageIdFromReg(
              row
            ),

          drawKey:
            utils.norm(
              row.drawKey ||
              ""
            ),

          drawZone:
            utils.norm(
              row.drawZone ||
              row.zone ||
              ""
            ),

          drawSector:
            row.drawSector ??
            row.sector ??
            null,

          bigFishTotal:
            !!(
              row.bigFishTotal ||
              row.bigfishTotal
            )
        };
      },

    // =======================================================
    // LOAD CONFIRMED
    // =======================================================

    loadAllConfirmed:
      async () => {
        utils.setMsg(
          "Завантаження підтверджених заявок…",
          true
        );

        const byId =
          new Map();

        const regSnap =
          await db
            .collection(
              CONFIG.COLLECTIONS
                .REGISTRATIONS
            )
            .where(
              "status",
              "==",
              "confirmed"
            )
            .get();

        regSnap.forEach(
          docSnap => {
            byId.set(
              docSnap.id,
              firestore.normalizeReg(
                docSnap.id,
                docSnap.data() ||
                {},
                "registrations"
              )
            );
          }
        );

        /*
         * Fallback:
         * якщо registration зник,
         * але public mirror залишився.
         */
        const pubSnap =
          await db
            .collection(
              CONFIG.COLLECTIONS
                .PUBLIC_PARTICIPANTS
            )
            .get();

        pubSnap.forEach(
          docSnap => {
            const raw =
              docSnap.data() ||
              {};

            const status =
              utils.normLower(
                raw.status
              );

            if (
              [
                "cancelled",
                "canceled",
                "deleted",
                "rejected"
              ].includes(
                status
              )
            ) {
              return;
            }

            const pubRow =
              firestore.normalizeReg(
                docSnap.id,
                raw,
                "public_participants"
              );

            if (
              byId.has(
                docSnap.id
              )
            ) {
              /*
               * Registration головний,
               * але public може мати
               * participantName/uid,
               * яких немає у legacy reg.
               */
              const current =
                byId.get(
                  docSnap.id
                );

              if (
                !current.uid &&
                pubRow.uid
              ) {
                current.uid =
                  pubRow.uid;
              }

              if (
                !current.participantName &&
                pubRow.participantName
              ) {
                current.participantName =
                  pubRow.participantName;
              }

              if (
                !current.displayName &&
                pubRow.displayName
              ) {
                current.displayName =
                  pubRow.displayName;
              }

              if (
                !current.drawKey &&
                pubRow.drawKey
              ) {
                current.drawKey =
                  pubRow.drawKey;
              }

              byId.set(
                docSnap.id,
                current
              );

              return;
            }

            byId.set(
              docSnap.id,
              pubRow
            );
          }
        );

        const rows =
          Array.from(
            byId.values()
          );

        /*
         * Admin має доступ до users.
         * Завчасно підтягуємо ПІБ.
         */
        await Promise.all(
          rows.map(
            async row => {
              const uid =
                rowUid(
                  row
                );

              if (
                !uid
              ) {
                return;
              }

              if (
                participantNameFromRow(
                  row
                )
              ) {
                return;
              }

              row._profileName =
                await getUserNameByUid(
                  uid
                );
            }
          )
        );

        state.regsAllConfirmed =
          rows;

        utils.setMsg(
          "",
          true
        );
      },

    // =======================================================
    // SAVE PRIVATE REGISTRATION
    // =======================================================

    restoreOrSaveRegistration:
      async ({
        docId,
        reg,
        compId,
        stageKey,
        sectorVal,
        zone,
        sectorNum,
        bigFish,
        ts,
        del
      }) => {

        const solo =
          isSoloMode();

        const uid =
          rowUid(
            reg
          );

        const participantName =
          participantNameFromRow(
            reg
          ) ||
          "Учасник";

        const base = {
          status:
            "confirmed",

          competitionId:
            compId,

          stageId:
            stageKey ||
            "main",

          entryType:
            solo
              ? ENTRY_SOLO
              : ENTRY_TEAM,

          bigFishTotal:
            bigFish,

          drawAt:
            ts,

          restoredAt:
            reg._source ===
              "public_participants"
              ? ts
              : undefined
        };

        if (
          solo
        ) {
          base.uid =
            uid ||
            docId;

          base.participantName =
            participantName;

          base.displayName =
            participantName;

          base.teamId =
            null;

          base.teamName =
            null;

        } else {
          base.teamId =
            reg.teamId ||
            "";

          base.teamName =
            reg.teamName ||
            "";

          base.captain =
            reg.captain ||
            "";

          base.phone =
            reg.phone ||
            "";
        }

        Object.keys(
          base
        ).forEach(
          key => {
            if (
              base[key] ===
              undefined
            ) {
              delete base[
                key
              ];
            }
          }
        );

        const ref =
          db
            .collection(
              CONFIG.COLLECTIONS
                .REGISTRATIONS
            )
            .doc(
              docId
            );

        if (
          !sectorVal
        ) {
          await ref.set(
            {
              ...base,

              drawKey:
                del,

              drawZone:
                del,

              drawSector:
                del
            },
            {
              merge:
                true
            }
          );

          return;
        }

        await ref.set(
          {
            ...base,

            drawKey:
              sectorVal,

            drawZone:
              zone,

            drawSector:
              Number.isFinite(
                sectorNum
              )
                ? sectorNum
                : null
          },
          {
            merge:
              true
          }
        );
      },

    // =======================================================
    // PUBLIC MIRROR
    // =======================================================

    publishPublicParticipant:
      async ({
        docId,
        reg,
        compId,
        stageKey,
        sectorVal,
        zone,
        sectorNum,
        bigFish,
        ts,
        del
      }) => {

        const solo =
          isSoloMode();

        const uid =
          rowUid(
            reg
          );

        const participantName =
          participantNameFromRow(
            reg
          ) ||
          "Учасник";

        /*
         * У PUBLIC mirror телефон
         * не публікуємо.
         */
        const base = {
          status:
            "confirmed",

          competitionId:
            compId,

          stageId:
            stageKey ||
            "main",

          entryType:
            solo
              ? ENTRY_SOLO
              : ENTRY_TEAM,

          bigFishTotal:
            bigFish,

          drawAt:
            ts
        };

        if (
          solo
        ) {
          base.uid =
            uid ||
            docId;

          base.participantName =
            participantName;

          base.displayName =
            participantName;

          base.teamId =
            null;

          base.teamName =
            null;

        } else {
          base.teamId =
            reg.teamId ||
            "";

          base.teamName =
            reg.teamName ||
            "";

          base.captain =
            reg.captain ||
            "";
        }

        const ref =
          db
            .collection(
              CONFIG.COLLECTIONS
                .PUBLIC_PARTICIPANTS
            )
            .doc(
              docId
            );

        if (
          !sectorVal
        ) {
          await ref.set(
            {
              ...base,

              drawKey:
                del,

              drawZone:
                del,

              drawSector:
                del
            },
            {
              merge:
                true
            }
          );

          return;
        }

        await ref.set(
          {
            ...base,

            drawKey:
              sectorVal,

            drawZone:
              zone,

            drawSector:
              Number.isFinite(
                sectorNum
              )
                ? sectorNum
                : null
          },
          {
            merge:
              true
          }
        );
      },

    // =======================================================
    // STAGE RESULTS
    // =======================================================

    publishStageResultsTeams:
      async () => {
        if (
          !state.isAdmin
        ) {
          return;
        }

        const selVal =
          utils.currentStageValue();

        if (
          !selVal
        ) {
          return;
        }

        const {
          compId,
          stageKey
        } =
          utils.parseStageValue(
            selVal
          );

        if (
          !compId
        ) {
          return;
        }

        const solo =
          isSoloMode();

        /*
         * КРИТИЧНЕ ВИПРАВЛЕННЯ:
         *
         * було:
         * competition||main
         *
         * стало:
         * competition__main
         */
        const docId =
          stageResultsDocId(
            compId,
            stageKey
          );

        const stageName =
          state.stageNameByKey.get(
            selVal
          ) ||
          "";

        const stageRef =
          db
            .collection(
              CONFIG.COLLECTIONS
                .STAGE_RESULTS
            )
            .doc(
              docId
            );

        /*
         * Читаємо старі результати,
         * щоб не стерти W1-W4,
         * якщо жеребкування випадково
         * перезбережуть пізніше.
         */
        const oldSnap =
          await stageRef.get();

        const oldStage =
          oldSnap.exists
            ? oldSnap.data() ||
              {}
            : {};

        const oldTeams =
          Array.isArray(
            oldStage.teams
          )
            ? oldStage.teams
            : [];

        function findOldRow(
          reg
        ) {
          if (
            solo
          ) {
            const uid =
              rowUid(
                reg
              );

            const entityId =
              entityIdForRow(
                reg
              );

            return (
              oldTeams.find(
                row => {
                  if (
                    !row
                  ) {
                    return false;
                  }

                  if (
                    uid &&
                    utils.norm(
                      row.uid
                    ) ===
                      uid
                  ) {
                    return true;
                  }

                  if (
                    entityId &&
                    utils.norm(
                      row.entityId
                    ) ===
                      entityId
                  ) {
                    return true;
                  }

                  /*
                   * Legacy:
                   * старий row міг бути
                   * записаний як TEAM.
                   */
                  if (
                    reg.teamId &&
                    utils.norm(
                      row.teamId
                    ) ===
                      utils.norm(
                        reg.teamId
                      )
                  ) {
                    return true;
                  }

                  return false;
                }
              ) ||
              null
            );
          }

          const teamId =
            utils.norm(
              reg.teamId
            );

          return (
            oldTeams.find(
              row =>
                utils.norm(
                  row?.teamId
                ) ===
                teamId
            ) ||
            null
          );
        }

        const teams =
          state.regsFiltered.map(
            reg => {
              const drawKey =
                utils.norm(
                  reg.drawKey
                );

              const zone =
                drawKey
                  ? drawKey[0]
                  : null;

              const sector =
                drawKey
                  ? parseInt(
                      drawKey.slice(
                        1
                      ),
                      10
                    )
                  : null;

              const previous =
                findOldRow(
                  reg
                ) ||
                {};

              if (
                solo
              ) {
                const uid =
                  rowUid(
                    reg
                  ) ||
                  reg._id;

                const participantName =
                  participantNameFromRow(
                    reg
                  ) ||
                  "Учасник";

                return {
                  ...previous,

                  regId:
                    reg._id,

                  entryType:
                    ENTRY_SOLO,

                  entityId:
                    uid,

                  uid,

                  participantName,

                  displayName:
                    participantName,

                  /*
                   * SOLO:
                   * команда не є identity.
                   */
                  teamId:
                    null,

                  teamName:
                    null,

                  team:
                    null,

                  drawKey:
                    drawKey ||
                    null,

                  drawZone:
                    zone ||
                    null,

                  drawSector:
                    Number.isFinite(
                      sector
                    )
                      ? sector
                      : null,

                  zone:
                    zone ||
                    null,

                  sector:
                    Number.isFinite(
                      sector
                    )
                      ? sector
                      : null,

                  bigFishTotal:
                    !!reg.bigFishTotal
                };
              }

              /*
               * TEAM
               */
              return {
                ...previous,

                regId:
                  reg._id,

                entryType:
                  ENTRY_TEAM,

                entityId:
                  utils.norm(
                    reg.teamId
                  ),

                teamId:
                  utils.norm(
                    reg.teamId
                  ),

                teamName:
                  reg.teamName ||
                  "",

                team:
                  reg.teamName ||
                  "",

                drawKey:
                  drawKey ||
                  null,

                drawZone:
                  zone ||
                  null,

                drawSector:
                  Number.isFinite(
                    sector
                  )
                    ? sector
                    : null,

                zone:
                  zone ||
                  null,

                sector:
                  Number.isFinite(
                    sector
                  )
                    ? sector
                    : null,

                bigFishTotal:
                  !!reg.bigFishTotal
              };
            }
          );

        // ===================================================
        // BIG FISH TOTAL
        // ===================================================

        const bigFishTotal =
          teams
            .filter(
              row =>
                row.bigFishTotal
            )
            .map(
              row => {
                if (
                  solo
                ) {
                  return {
                    regId:
                      row.regId,

                    entryType:
                      ENTRY_SOLO,

                    entityId:
                      row.entityId,

                    uid:
                      row.uid,

                    participantName:
                      row.participantName,

                    displayName:
                      row.participantName,

                    teamId:
                      null,

                    /*
                     * compatibility display
                     */
                    team:
                      row.participantName,

                    big1Day:
                      null,

                    big2Day:
                      null,

                    maxBig:
                      null,

                    isMax:
                      false
                  };
                }

                return {
                  regId:
                    row.regId,

                  entryType:
                    ENTRY_TEAM,

                  entityId:
                    row.teamId,

                  teamId:
                    row.teamId ||
                    null,

                  team:
                    row.teamName,

                  teamName:
                    row.teamName,

                  big1Day:
                    null,

                  big2Day:
                    null,

                  maxBig:
                    null,

                  isMax:
                    false
                };
              }
            );

        const ts =
          window.firebase
            .firestore
            .FieldValue
            .serverTimestamp();

        // ===================================================
        // SAVE CANONICAL STAGE RESULT
        // ===================================================

        await stageRef.set(
          {
            compId,

            stageId:
              stageKey ||
              "main",

            stageKey:
              stageKey ||
              "main",

            entryType:
              solo
                ? ENTRY_SOLO
                : ENTRY_TEAM,

            stageName,

            updatedAt:
              ts,

            teams,

            bigFishTotal,

            /*
             * Після зміни жеребкування
             * зони краще перебудувати
             * з teams + weighings.
             */
            zones: {
              A: [],
              B: [],
              C: []
            },

            /*
             * Не стираємо total,
             * якщо він уже існує.
             */
            total:
              Array.isArray(
                oldStage.total
              )
                ? oldStage.total
                : [],

            archived:
              false,

            isLive:
              true,

            isActive:
              true
          },
          {
            merge:
              true
          }
        );

        // ===================================================
        // SETTINGS / APP
        // ===================================================

        await db
          .collection(
            CONFIG.COLLECTIONS
              .SETTINGS
          )
          .doc(
            "app"
          )
          .set(
            {
              /*
               * КРИТИЧНО:
               * activeKey тепер
               * competition__main
               */
              activeKey:
                docId,

              activeStageResultsId:
                docId,

              activeCompetitionId:
                compId,

              activeStageId:
                stageKey ||
                "main",

              activeStageTitle:
                stageName,

              liveClosed:
                false,

              updatedAt:
                ts
            },
            {
              merge:
                true
            }
          );
      }
  };

  // =========================================================
  // FILTERS
  // =========================================================

  const filters = {

    rebuildUsedSectors:
      () => {
        state.usedSectorSet =
          new Set();

        state.regsFiltered.forEach(
          row => {
            const key =
              utils.norm(
                row.drawKey
              );

            if (
              key
            ) {
              state.usedSectorSet.add(
                key
              );
            }
          }
        );
      },

    apply:
      () => {
        const selVal =
          utils.currentStageValue();

        const {
          compId,
          stageKey
        } =
          utils.parseStageValue(
            selVal
          );

        if (
          !compId
        ) {
          state.regsFiltered =
            [];

          state.usedSectorSet =
            new Set();

          render.list();

          if (
            els.countInfo
          ) {
            els.countInfo.textContent =
              "";
          }

          return;
        }

        state.regsFiltered =
          state.regsAllConfirmed.filter(
            row => {
              if (
                utils.norm(
                  row.compId
                ) !==
                utils.norm(
                  compId
                )
              ) {
                return false;
              }

              const rowStage =
                utils.norm(
                  row.stageId
                ) ||
                "main";

              const wantedStage =
                utils.norm(
                  stageKey
                ) ||
                "main";

              return (
                rowStage ===
                wantedStage
              );
            }
          );

        const q =
          utils
            .norm(
              els.qInput
                ?.value ||
              ""
            )
            .toLowerCase();

        if (
          q
        ) {
          state.regsFiltered =
            state.regsFiltered.filter(
              row => {
                const text =
                  `${
                    displayRowName(
                      row
                    )
                  } ${
                    row.teamName ||
                    ""
                  } ${
                    row.phone ||
                    ""
                  } ${
                    row.captain ||
                    ""
                  }`
                    .toLowerCase();

                return text.includes(
                  q
                );
              }
            );
        }

        state.regsFiltered.sort(
          (
            a,
            b
          ) => {
            const sa =
              utils.parseSector(
                a.drawKey
              );

            const sb =
              utils.parseSector(
                b.drawKey
              );

            if (
              sa &&
              !sb
            ) {
              return -1;
            }

            if (
              !sa &&
              sb
            ) {
              return 1;
            }

            if (
              !sa &&
              !sb
            ) {
              return (
                displayRowName(
                  a
                )
                  .localeCompare(
                    displayRowName(
                      b
                    ),
                    "uk"
                  )
              );
            }

            const zoneDiff =
              utils.zoneRank(
                sa.z
              ) -
              utils.zoneRank(
                sb.z
              );

            if (
              zoneDiff
            ) {
              return zoneDiff;
            }

            const sectorDiff =
              sa.n -
              sb.n;

            if (
              sectorDiff
            ) {
              return sectorDiff;
            }

            return (
              displayRowName(
                a
              )
                .localeCompare(
                  displayRowName(
                    b
                  ),
                  "uk"
                )
            );
          }
        );

        filters.rebuildUsedSectors();

        render.list();

        if (
          els.countInfo
        ) {
          const totalAll =
            state
              .regsAllConfirmed
              .length;

          const totalSelected =
            state
              .regsFiltered
              .length;

          const restored =
            state
              .regsFiltered
              .filter(
                row =>
                  row._source ===
                  "public_participants"
              )
              .length;

          const label =
            isSoloMode()
              ? "учасників"
              : "команд";

          els.countInfo.textContent =
            `Для вибраного: ${totalSelected} ${label} ` +
            `(з підтверджених/резерву ${totalAll})` +
            (
              restored
                ? ` · до відновлення: ${restored}`
                : ""
            );
        }
      }
  };

  // =========================================================
  // RENDER
  // =========================================================

  const render = {

    sectorOptionsHTML:
      (
        currentValue,
        docId
      ) => {
        const current =
          utils.norm(
            currentValue
          );

        return `
          <select
            class="select sectorPick"
            data-docid="${utils.esc(
              docId
            )}"
          >
            <option value="">
              — Оберіть сектор —
            </option>

            ${
              SECTORS.map(
                sector => {
                  const taken =
                    state
                      .usedSectorSet
                      .has(
                        sector
                      ) &&
                    sector !==
                      current;

                  return `
                    <option
                      value="${sector}"
                      ${
                        sector ===
                        current
                          ? "selected"
                          : ""
                      }
                      ${
                        taken
                          ? "disabled"
                          : ""
                      }
                    >
                      ${sector}${
                        taken
                          ? " (зайнято)"
                          : ""
                      }
                    </option>
                  `;
                }
              ).join("")
            }
          </select>
        `;
      },

    rowHTML:
      row => {
        const name =
          displayRowName(
            row
          );

        const solo =
          isSoloMode();

        const meta =
          solo
            ? (
                rowUid(
                  row
                ) ||
                row._id
              )
            : (
                row.teamId ||
                row._id
              );

        return `
          <div
            class="draw-row"
            data-docid="${utils.esc(
              row._id
            )}"
          >

            <div class="draw-team">

              ${utils.esc(
                name ||
                "—"
              )}

              ${
                solo
                  ? `<span class="muted"> · SOLO</span>`
                  : ""
              }

              ${
                row._source ===
                  "public_participants"
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

            </div>

            ${render.sectorOptionsHTML(
              row.drawKey,
              row._id
            )}

            <input
              type="checkbox"
              class="chk bigFishChk"
              ${
                row.bigFishTotal
                  ? "checked"
                  : ""
              }
            >

            <button
              class="btn-icon saveBtnRow"
              type="button"
              title="Зберегти"
            >
              💾
            </button>

            <div class="rowMsg"></div>

          </div>
        `;
      },

    list:
      () => {
        if (
          !els.drawRows
        ) {
          return;
        }

        if (
          !state
            .regsFiltered
            .length
        ) {
          els.drawRows.innerHTML =
            `<div class="muted" style="padding:12px 2px;">${
              isSoloMode()
                ? "Нема учасників для жеребкування."
                : "Нема команд для жеребкування."
            }</div>`;

          return;
        }

        els.drawRows.innerHTML =
          `<div class="draw-wrap">${
            state.regsFiltered
              .map(
                render.rowHTML
              )
              .join("")
          }</div>`;
      },

    showRowMsg:
      (
        wrap,
        text,
        ok = true
      ) => {
        const el =
          wrap.querySelector(
            ".rowMsg"
          );

        if (
          !el
        ) {
          return;
        }

        el.textContent =
          text ||
          "";

        el.classList.toggle(
          "ok",
          !!ok
        );

        el.classList.toggle(
          "err",
          !ok
        );
      },

    setRowState:
      (
        wrap,
        stateName
      ) => {
        wrap.classList.remove(
          "is-saving",
          "is-ok",
          "is-err"
        );

        if (
          stateName
        ) {
          wrap.classList.add(
            stateName
          );
        }
      },

    setBtnIcon:
      (
        wrap,
        icon
      ) => {
        const btn =
          wrap.querySelector(
            ".saveBtnRow"
          );

        if (
          !btn
        ) {
          return;
        }

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

  // =========================================================
  // HANDLERS
  // =========================================================

  const handlers = {

    saveRow:
      async event => {
        const btn =
          event.target.closest(
            ".saveBtnRow"
          );

        if (
          !btn
        ) {
          return;
        }

        const wrap =
          event.target.closest(
            ".draw-row"
          );

        if (
          !wrap
        ) {
          return;
        }

        if (
          !state.isAdmin
        ) {
          render.setRowState(
            wrap,
            "is-err"
          );

          render.setBtnIcon(
            wrap,
            "err"
          );

          render.showRowMsg(
            wrap,
            "Нема адмін-доступу",
            false
          );

          setTimeout(
            () => {
              render.setRowState(
                wrap,
                null
              );

              render.setBtnIcon(
                wrap,
                "save"
              );
            },
            1400
          );

          return;
        }

        const selVal =
          utils.currentStageValue();

        const {
          compId,
          stageKey
        } =
          utils.parseStageValue(
            selVal
          );

        if (
          !compId
        ) {
          utils.setMsg(
            "Оберіть змагання/етап.",
            false
          );

          return;
        }

        utils.saveStageToLS(
          selVal
        );

        const docId =
          wrap.getAttribute(
            "data-docid"
          );

        const sectorVal =
          utils.norm(
            wrap.querySelector(
              ".sectorPick"
            )?.value ||
            ""
          );

        const bigFish =
          !!wrap.querySelector(
            ".bigFishChk"
          )?.checked;

        const ts =
          window.firebase
            .firestore
            .FieldValue
            .serverTimestamp();

        const del =
          window.firebase
            .firestore
            .FieldValue
            .delete();

        if (
          !docId
        ) {
          return;
        }

        const reg =
          state
            .regsAllConfirmed
            .find(
              row =>
                row._id ===
                docId
            );

        if (
          !reg
        ) {
          utils.setMsg(
            isSoloMode()
              ? "Учасника не знайдено в локальному списку."
              : "Команду не знайдено в локальному списку.",
            false
          );

          return;
        }

        if (
          sectorVal &&
          state
            .usedSectorSet
            .has(
              sectorVal
            )
        ) {
          const other =
            state
              .regsFiltered
              .find(
                row =>
                  utils.norm(
                    row.drawKey
                  ) ===
                    sectorVal &&
                  row._id !==
                    docId
              );

          if (
            other
          ) {
            render.setRowState(
              wrap,
              "is-err"
            );

            render.setBtnIcon(
              wrap,
              "err"
            );

            render.showRowMsg(
              wrap,
              `Зайнято: ${
                displayRowName(
                  other
                )
              }`,
              false
            );

            setTimeout(
              () => {
                render.setRowState(
                  wrap,
                  null
                );

                render.setBtnIcon(
                  wrap,
                  "save"
                );
              },
              1700
            );

            return;
          }
        }

        const zone =
          sectorVal
            ? sectorVal[0]
            : null;

        const sectorNum =
          sectorVal
            ? parseInt(
                sectorVal.slice(
                  1
                ),
                10
              )
            : null;

        try {
          render.setRowState(
            wrap,
            "is-saving"
          );

          render.setBtnIcon(
            wrap,
            "saving"
          );

          render.showRowMsg(
            wrap,
            sectorVal
              ? "Збереження…"
              : "Очищення…",
            true
          );

          await firestore
            .restoreOrSaveRegistration({
              docId,
              reg,
              compId,
              stageKey,
              sectorVal,
              zone,
              sectorNum,
              bigFish,
              ts,
              del
            });

          await firestore
            .publishPublicParticipant({
              docId,
              reg,
              compId,
              stageKey,
              sectorVal,
              zone,
              sectorNum,
              bigFish,
              ts,
              del
            });

          /*
           * Оновлюємо local row.
           */
          reg._source =
            "registrations";

          reg.compId =
            compId;

          reg.stageId =
            stageKey ||
            "main";

          reg.drawKey =
            sectorVal ||
            "";

          reg.drawZone =
            zone ||
            "";

          reg.drawSector =
            Number.isFinite(
              sectorNum
            )
              ? sectorNum
              : null;

          reg.bigFishTotal =
            bigFish;

          if (
            isSoloMode()
          ) {
            reg.entryType =
              ENTRY_SOLO;

            reg.uid =
              rowUid(
                reg
              ) ||
              docId;

            reg.participantName =
              participantNameFromRow(
                reg
              ) ||
              "Учасник";

            reg.displayName =
              reg.participantName;

            reg.teamId =
              "";

            reg.teamName =
              "";
          }

          filters.apply();

          /*
           * Тут створюється
           * canonical LIVE:
           *
           * comp__stage
           */
          await firestore
            .publishStageResultsTeams();

          render.setRowState(
            wrap,
            "is-ok"
          );

          render.setBtnIcon(
            wrap,
            "ok"
          );

          render.showRowMsg(
            wrap,
            sectorVal
              ? `Збережено ${utils.fmtTimeNow()}`
              : `Очищено ${utils.fmtTimeNow()}`,
            true
          );

          utils.setMsg(
            sectorVal
              ? (
                  isSoloMode()
                    ? "✅ Учасника збережено. UID + ПІБ передано в LIVE."
                    : "✅ Команду збережено. Live оновлено."
                )
              : (
                  isSoloMode()
                    ? "✅ Учасника забрано з сектора. Live оновлено."
                    : "✅ Команду забрано з сектора. Live оновлено."
                ),
            true
          );

          setTimeout(
            () =>
              utils.setMsg(
                "",
                true
              ),
            1400
          );

        } catch (error) {
          console.error(
            error
          );

          render.setRowState(
            wrap,
            "is-err"
          );

          render.setBtnIcon(
            wrap,
            "err"
          );

          render.showRowMsg(
            wrap,
            "Помилка (Rules/доступ)",
            false
          );

          utils.setMsg(
            "Помилка збереження. Перевір Firestore Rules.",
            false
          );

          setTimeout(
            () => {
              render.setRowState(
                wrap,
                null
              );

              render.setBtnIcon(
                wrap,
                "save"
              );
            },
            1700
          );
        }
      }
  };

  // =========================================================
  // EVENTS
  // =========================================================

  const bindEvents =
    () => {
      document.addEventListener(
        "click",
        handlers.saveRow
      );

      els.stageSelect
        ?.addEventListener(
          "change",
          () => {
            utils.saveStageToLS(
              els.stageSelect
                .value ||
              ""
            );

            filters.apply();
          }
        );

      els.qInput
        ?.addEventListener(
          "input",
          () =>
            filters.apply()
        );
    };

  // =========================================================
  // BOOT
  // =========================================================

  const boot =
    () => {
      auth.onAuthStateChanged(
        async user => {
          if (
            !user
          ) {
            utils.setMsg(
              "Увійдіть як адмін.",
              false
            );

            if (
              els.stageSelect
            ) {
              els.stageSelect.innerHTML =
                `<option value="">Увійдіть як адмін</option>`;
            }

            state.regsAllConfirmed =
              [];

            state.regsFiltered =
              [];

            render.list();

            return;
          }

          try {
            state.isAdmin =
              await authModule
                .requireAdmin(
                  user
                );

            if (
              !state.isAdmin
            ) {
              utils.setMsg(
                "Доступ заборонено. Цей акаунт не адмін.",
                false
              );

              state.regsAllConfirmed =
                [];

              state.regsFiltered =
                [];

              render.list();

              return;
            }

            await firestore
              .loadStagesToSelect();

            await firestore
              .loadAllConfirmed();

            const saved =
              utils.loadStageFromLS();

            if (
              saved
            ) {
              const option =
                Array.from(
                  els.stageSelect
                    ?.options ||
                  []
                ).find(
                  item =>
                    String(
                      item.value
                    ) ===
                    String(
                      saved
                    )
                );

              if (
                option
              ) {
                els.stageSelect.value =
                  saved;
              }
            }

            if (
              els.stageSelect
                ?.value
            ) {
              filters.apply();

              utils.setMsg(
                "",
                true
              );

            } else {
              utils.setMsg(
                "Оберіть змагання/етап.",
                true
              );
            }

          } catch (error) {
            console.error(
              error
            );

            utils.setMsg(
              "Помилка завантаження/перевірки адміна.",
              false
            );
          }
        }
      );
    };

  bindEvents();
  boot();

})();

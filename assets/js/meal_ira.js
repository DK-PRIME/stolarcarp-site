// assets/js/meal_ira.js
// STOLAR CARP • Пані Іра • Харчування
// READ ONLY
//
// ✅ одна постійна сторінка meal_ira.html
// ✅ НЕ потрібні competitionId/stageId в URL
// ✅ активне харчування береться з mealPublic/current
// ✅ автоматично перемикається на нове змагання
// ✅ TEAM -> назва команди
// ✅ SOLO -> ПІБ учасника
// ✅ сектор береться з актуального жеребкування
// ✅ заявки оновлюються LIVE
// ✅ побажання видно під командою / учасником
// ✅ після закриття показує порожній список

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20260917-permanent-v3"
  );

  /*
   * УВАГА:
   * тут має бути UID акаунта,
   * під яким заходить пані Іра.
   *
   * Зараз залишаю значення,
   * яке було у твоєму файлі.
   */
  const FOOD_OWNER_UID =
    "T1BNuXaDM2f2Tf8KZosgFlAGmTu1";

  const JUDGES_ID =
    "__judges__";

  const $ = id =>
    document.getElementById(id);

  const norm = value =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const clean = value =>
    norm(value).toLowerCase();

  const esc = value =>
    String(value ?? "")
      .replace(
        /[&<>"']/g,
        char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[char])
      );

  let db = null;
  let auth = null;

  let competitionId = "";
  let stageId = "";
  let mealIsOpen = false;

  let orders = [];

  let parentDrawRows = [];
  let subDrawRows = [];

  let drawMap = {
    byUid:
      new Map(),

    byEntity:
      new Map(),

    byTeamId:
      new Map(),

    byName:
      new Map()
  };

  let unsubCurrent = null;
  let unsubOrders = null;
  let unsubDrawParent = null;
  let unsubDrawTeams = null;

  // =========================================================
  // BASIC
  // =========================================================

  function num(value) {
    const n =
      Number(value);

    return (
      Number.isFinite(n) &&
      n > 0
    )
      ? Math.floor(n)
      : 0;
  }

  function totalOrder(order) {
    return (
      num(order?.day1?.lunch) +
      num(order?.day1?.dinner) +
      num(order?.day1?.breakfast) +
      num(order?.day2?.lunch) +
      num(order?.day2?.dinner) +
      num(order?.day2?.breakfast)
    );
  }

  function stageResultsId(
    compId,
    stageKey
  ) {
    return (
      `${norm(compId)}__` +
      `${norm(stageKey) || "main"}`
    );
  }

  function isJudges(row) {
    return (
      clean(row?.type) ===
        "judges" ||
      norm(row?.entityId) ===
        JUDGES_ID
    );
  }

  function isSolo(row) {
    return (
      clean(row?.entryType) ===
        "solo" ||
      clean(row?.type) ===
        "solo"
    );
  }

  function rowName(row) {
    if (isJudges(row)) {
      return "СУДДІ";
    }

    if (isSolo(row)) {
      return norm(
        row?.participantName ||
        row?.displayName ||
        row?.teamName ||
        row?.name ||
        "—"
      );
    }

    return norm(
      row?.teamName ||
      row?.displayName ||
      row?.team ||
      "—"
    );
  }

  // =========================================================
  // UI STATE
  // =========================================================

  function setState(
    text,
    type = ""
  ) {
    const el =
      $("state");

    if (!el) {
      return;
    }

    el.textContent =
      text || "";

    el.className =
      `state ${type}`.trim();
  }

  function showContent() {
    if ($("content")) {
      $("content").hidden =
        false;
    }
  }

  function clearTable(
    message =
      "Заявок на харчування ще немає."
  ) {
    const tbody =
      $("mealBody");

    const tfoot =
      $("mealFoot");

    const count =
      $("orderCount");

    if (count) {
      count.textContent =
        "0";
    }

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty"
          >
            ${esc(message)}
          </td>
        </tr>
      `;
    }

    if (tfoot) {
      tfoot.innerHTML =
        "";
    }
  }

  // =========================================================
  // DRAW
  // =========================================================

  function parseDraw(item) {
    const direct =
      norm(
        item?.drawKey
      ).toUpperCase();

    if (direct) {
      const match =
        direct.match(
          /^([ABC])\s*(\d+)$/i
        );

      if (match) {
        return {
          zone:
            match[1]
              .toUpperCase(),

          sector:
            match[2],

          drawKey:
            `${match[1].toUpperCase()}${match[2]}`
        };
      }
    }

    const zone =
      norm(
        item?.drawZone ||
        item?.zone
      ).toUpperCase();

    const sectorRaw =
      norm(
        item?.drawSector ||
        item?.sector ||
        item?.place
      );

    if (
      zone &&
      sectorRaw
    ) {
      const sector =
        sectorRaw.replace(
          /^[ABC]\s*/i,
          ""
        );

      return {
        zone,
        sector,

        drawKey:
          `${zone}${sector}`
      };
    }

    return {
      zone: "",
      sector: "",
      drawKey: ""
    };
  }

  function rebuildDrawMap() {
    const byUid =
      new Map();

    const byEntity =
      new Map();

    const byTeamId =
      new Map();

    const byName =
      new Map();

    const allRows = [
      ...parentDrawRows,
      ...subDrawRows
    ];

    allRows.forEach(item => {
      const draw =
        parseDraw(item);

      if (!draw.drawKey) {
        return;
      }

      const uid =
        norm(
          item.uid ||
          item.participantUid ||
          item.userId
        );

      const entityId =
        norm(
          item.entityId
        );

      const teamId =
        norm(
          item.teamId
        );

      const displayName =
        norm(
          item.participantName ||
          item.displayName ||
          item.teamName ||
          item.team ||
          item.name
        );

      const row = {
        ...draw,
        uid,
        entityId,
        teamId,
        displayName
      };

      if (uid) {
        byUid.set(
          uid,
          row
        );
      }

      if (entityId) {
        byEntity.set(
          entityId,
          row
        );
      }

      /*
       * У SOLO може бути кілька
       * людей з одним teamId,
       * тому teamId тут лише fallback.
       */
      if (
        teamId &&
        !byTeamId.has(teamId)
      ) {
        byTeamId.set(
          teamId,
          row
        );
      }

      if (displayName) {
        byName.set(
          clean(displayName),
          row
        );
      }
    });

    drawMap = {
      byUid,
      byEntity,
      byTeamId,
      byName
    };

    render();
  }

  function withCurrentDraw(order) {
    if (isJudges(order)) {
      return order;
    }

    let draw = null;

    const solo =
      isSolo(order);

    const uid =
      norm(
        order.uid ||
        order.participantUid
      );

    const entityId =
      norm(
        order.entityId
      );

    const teamId =
      norm(
        order.teamId
      );

    const displayName =
      clean(
        rowName(order)
      );

    /*
     * SOLO:
     * UID -> entityId -> ім'я -> teamId fallback
     */
    if (solo) {
      if (
        uid &&
        drawMap.byUid.has(uid)
      ) {
        draw =
          drawMap.byUid.get(uid);
      }

      if (
        !draw &&
        entityId &&
        drawMap.byEntity.has(
          entityId
        )
      ) {
        draw =
          drawMap.byEntity.get(
            entityId
          );
      }

      if (
        !draw &&
        displayName &&
        drawMap.byName.has(
          displayName
        )
      ) {
        draw =
          drawMap.byName.get(
            displayName
          );
      }

      if (
        !draw &&
        teamId &&
        drawMap.byTeamId.has(
          teamId
        )
      ) {
        draw =
          drawMap.byTeamId.get(
            teamId
          );
      }
    }

    /*
     * TEAM:
     * teamId -> ім'я
     */
    if (!solo) {
      if (
        teamId &&
        drawMap.byTeamId.has(
          teamId
        )
      ) {
        draw =
          drawMap.byTeamId.get(
            teamId
          );
      }

      if (
        !draw &&
        displayName &&
        drawMap.byName.has(
          displayName
        )
      ) {
        draw =
          drawMap.byName.get(
            displayName
          );
      }
    }

    /*
     * Якщо жереб ще не знайдений,
     * залишаємо сектор,
     * записаний у заявці.
     */
    if (!draw) {
      return order;
    }

    return {
      ...order,

      zone:
        draw.zone,

      sector:
        draw.sector,

      drawKey:
        draw.drawKey
    };
  }

  // =========================================================
  // SORT
  // =========================================================

  function sortOrders(
    a,
    b
  ) {
    if (
      isJudges(a) &&
      !isJudges(b)
    ) {
      return 1;
    }

    if (
      isJudges(b) &&
      !isJudges(a)
    ) {
      return -1;
    }

    const zones = {
      A: 1,
      B: 2,
      C: 3
    };

    const za =
      zones[
        norm(
          a.zone
        ).toUpperCase()
      ] || 9;

    const zb =
      zones[
        norm(
          b.zone
        ).toUpperCase()
      ] || 9;

    if (za !== zb) {
      return za - zb;
    }

    const sa =
      Number(
        a.sector ||
        999
      );

    const sb =
      Number(
        b.sector ||
        999
      );

    if (sa !== sb) {
      return sa - sb;
    }

    return rowName(a)
      .localeCompare(
        rowName(b),
        "uk"
      );
  }

  // =========================================================
  // RENDER
  // =========================================================

  function render() {
    const tbody =
      $("mealBody");

    const tfoot =
      $("mealFoot");

    const countEl =
      $("orderCount");

    if (
      !tbody ||
      !tfoot
    ) {
      return;
    }

    if (!mealIsOpen) {
      clearTable(
        "Харчування зараз не відкрите."
      );

      return;
    }

    const rows =
      orders
        .filter(order =>
          order.status ===
            "submitted" &&
          totalOrder(order) > 0
        )
        .map(
          withCurrentDraw
        )
        .sort(
          sortOrders
        );

    if (countEl) {
      countEl.textContent =
        String(
          rows.length
        );
    }

    if (!rows.length) {
      clearTable(
        "Заявок на харчування ще немає."
      );

      return;
    }

    const totals = {
      d1l: 0,
      d1d: 0,
      d1b: 0,

      d2l: 0,
      d2d: 0,
      d2b: 0
    };

    tbody.innerHTML =
      rows.map(row => {
        const d1 =
          row.day1 || {};

        const d2 =
          row.day2 || {};

        const d1l =
          num(
            d1.lunch
          );

        const d1d =
          num(
            d1.dinner
          );

        const d1b =
          num(
            d1.breakfast
          );

        const d2l =
          num(
            d2.lunch
          );

        const d2d =
          num(
            d2.dinner
          );

        const d2b =
          num(
            d2.breakfast
          );

        totals.d1l +=
          d1l;

        totals.d1d +=
          d1d;

        totals.d1b +=
          d1b;

        totals.d2l +=
          d2l;

        totals.d2d +=
          d2d;

        totals.d2b +=
          d2b;

        const sector =
          isJudges(row)
            ? "—"
            : (
                row.drawKey ||
                (
                  (
                    row.zone ||
                    ""
                  ) +
                  (
                    row.sector ||
                    ""
                  )
                ) ||
                "—"
              );

        const name =
          rowName(row);

        const note =
          norm(
            row.note
          );

        return `
          <tr>

            <td class="sector">
              ${esc(sector)}
            </td>

            <td class="team">

              <div class="team-name">
                ${
                  isJudges(row)
                    ? "👨‍⚖️ СУДДІ"
                    : esc(name)
                }
              </div>

              ${
                isSolo(row)
                  ? `
                    <div
                      style="
                        margin-top:2px;
                        color:#94a3b8;
                        font-size:.72rem;
                        font-weight:700;
                      "
                    >
                      SOLO
                    </div>
                  `
                  : ""
              }

              ${
                note
                  ? `
                    <div class="note">
                      ⚠ ${esc(note)}
                    </div>
                  `
                  : ""
              }

            </td>

            <td>${d1l || ""}</td>
            <td>${d1d || ""}</td>
            <td>${d1b || ""}</td>

            <td>${d2l || ""}</td>
            <td>${d2d || ""}</td>
            <td>${d2b || ""}</td>

          </tr>
        `;
      }).join("");

    tfoot.innerHTML = `
      <tr>

        <td colspan="2">
          Разом
        </td>

        <td>${totals.d1l}</td>
        <td>${totals.d1d}</td>
        <td>${totals.d1b}</td>

        <td>${totals.d2l}</td>
        <td>${totals.d2d}</td>
        <td>${totals.d2b}</td>

      </tr>
    `;
  }

  // =========================================================
  // TITLE
  // =========================================================

  async function loadTitle() {
    if (
      !competitionId ||
      !stageId
    ) {
      return;
    }

    try {
      const snap =
        await db
          .collection(
            "competitions"
          )
          .doc(
            competitionId
          )
          .get();

      const competition =
        snap.exists
          ? (
              snap.data() ||
              {}
            )
          : {};

      const title =
        norm(
          competition.name ||
          competition.title ||
          competitionId
        );

      const events =
        Array.isArray(
          competition.events
        )
          ? competition.events
          : [];

      const event =
        events.find(
          (item, index) =>
            norm(
              item?.key ||
              item?.stageId ||
              item?.id ||
              `stage-${index + 1}`
            ) ===
            stageId
        );

      let stageTitle =
        norm(
          event?.title ||
          event?.name ||
          event?.label ||
          ""
        );

      /*
       * Для oneoff / main
       * не пишемо просто "main".
       */
      if (
        !stageTitle &&
        stageId === "main"
      ) {
        stageTitle =
          "Основне змагання";
      }

      if (!stageTitle) {
        stageTitle =
          stageId;
      }

      if (
        $("competitionTitle")
      ) {
        $("competitionTitle")
          .textContent =
          title;
      }

      if (
        $("stageTitle")
      ) {
        $("stageTitle")
          .textContent =
          stageTitle;
      }

    } catch (e) {
      console.warn(
        "[meal_ira] title:",
        e
      );
    }
  }

  // =========================================================
  // STOP CURRENT LISTENERS
  // =========================================================

  function stopCompetitionListeners() {
    try {
      unsubOrders?.();
    } catch {}

    try {
      unsubDrawParent?.();
    } catch {}

    try {
      unsubDrawTeams?.();
    } catch {}

    unsubOrders =
      null;

    unsubDrawParent =
      null;

    unsubDrawTeams =
      null;

    orders = [];

    parentDrawRows = [];
    subDrawRows = [];

    drawMap = {
      byUid:
        new Map(),

      byEntity:
        new Map(),

      byTeamId:
        new Map(),

      byName:
        new Map()
    };
  }

  // =========================================================
  // DRAW REALTIME
  // =========================================================

  function startDrawRealtime() {
    if (
      !competitionId ||
      !stageId
    ) {
      return;
    }

    const resultRef =
      db
        .collection(
          "stageResults"
        )
        .doc(
          stageResultsId(
            competitionId,
            stageId
          )
        );

    /*
     * Сумісність зі старим форматом:
     * stageResults/{id}.teams[]
     */
    unsubDrawParent =
      resultRef.onSnapshot(
        snap => {
          const data =
            snap.exists
              ? (
                  snap.data() ||
                  {}
                )
              : {};

          parentDrawRows =
            Array.isArray(
              data.teams
            )
              ? data.teams
              : [];

          rebuildDrawMap();
        },
        error => {
          console.warn(
            "[meal_ira] parent draw:",
            error
          );
        }
      );

    /*
     * Канонічний формат:
     * stageResults/{id}/teams/{entityId}
     */
    unsubDrawTeams =
      resultRef
        .collection("teams")
        .onSnapshot(
          snap => {
            subDrawRows =
              snap.docs.map(
                doc => ({
                  id:
                    doc.id,

                  entityId:
                    doc.id,

                  ...(
                    doc.data() ||
                    {}
                  )
                })
              );

            rebuildDrawMap();
          },
          error => {
            console.warn(
              "[meal_ira] teams draw:",
              error
            );
          }
        );
  }

  // =========================================================
  // ORDERS REALTIME
  // =========================================================

  function startOrdersRealtime() {
    if (
      !competitionId ||
      !stageId
    ) {
      return;
    }

    /*
     * Зараз читаємо mealOrders,
     * бо це вже існуюча робоча база.
     *
     * Пізніше можемо перевести Іру
     * повністю на mealPublicOrders,
     * коли доробимо Rules.
     */
    unsubOrders =
      db
        .collection(
          "mealOrders"
        )
        .where(
          "competitionId",
          "==",
          competitionId
        )
        .where(
          "stageId",
          "==",
          stageId
        )
        .onSnapshot(
          snap => {
            orders =
              snap.docs.map(
                doc => ({
                  id:
                    doc.id,

                  ...(
                    doc.data() ||
                    {}
                  )
                })
              );

            render();

            setState(
              "Оновлюється автоматично",
              "ok"
            );
          },
          error => {
            console.error(
              "[meal_ira] orders:",
              error
            );

            setState(
              "Немає доступу до списку харчування.",
              "err"
            );
          }
        );
  }

  function startCompetitionListeners() {
    stopCompetitionListeners();

    if (!mealIsOpen) {
      render();
      return;
    }

    startDrawRealtime();
    startOrdersRealtime();
  }

  // =========================================================
  // CURRENT MEAL
  // =========================================================

  function startCurrentMealRealtime() {
    /*
     * Це серце постійної сторінки Іри.
     *
     * meal_orders.js при відкритті харчування
     * записує сюди:
     *
     * mealPublic/current
     * {
     *   competitionId,
     *   stageId,
     *   isOpen:true
     * }
     */

    unsubCurrent =
      db
        .collection(
          "mealPublic"
        )
        .doc("current")
        .onSnapshot(
          async snap => {
            const data =
              snap.exists
                ? (
                    snap.data() ||
                    {}
                  )
                : {};

            const nextCompetitionId =
              norm(
                data.competitionId
              );

            const nextStageId =
              norm(
                data.stageId
              );

            const nextIsOpen =
              data.isOpen === true;

            const changed =
              nextCompetitionId !==
                competitionId ||
              nextStageId !==
                stageId;

            competitionId =
              nextCompetitionId;

            stageId =
              nextStageId;

            mealIsOpen =
              nextIsOpen;

            showContent();

            /*
             * Ще жодного харчування
             * не було створено.
             */
            if (
              !competitionId ||
              !stageId
            ) {
              stopCompetitionListeners();

              if (
                $("competitionTitle")
              ) {
                $("competitionTitle")
                  .textContent =
                  "STOLAR CARP";
              }

              if (
                $("stageTitle")
              ) {
                $("stageTitle")
                  .textContent =
                  "Харчування зараз не відкрите";
              }

              setState(
                "Очікую відкриття харчування.",
                ""
              );

              clearTable(
                "Харчування зараз не відкрите."
              );

              return;
            }

            /*
             * Назву перезавантажуємо
             * при зміні змагання/етапу.
             */
            if (changed) {
              await loadTitle();
            }

            if (!mealIsOpen) {
              stopCompetitionListeners();

              setState(
                "Харчування завершено.",
                ""
              );

              clearTable(
                "Харчування зараз не відкрите."
              );

              return;
            }

            setState(
              "Харчування відкрите · оновлення LIVE",
              "ok"
            );

            startCompetitionListeners();
          },
          error => {
            console.error(
              "[meal_ira] mealPublic/current:",
              error
            );

            setState(
              "Не вдалося визначити активне харчування.",
              "err"
            );
          }
        );
  }

  // =========================================================
  // AUTH
  // =========================================================

  async function getAuthUser() {
    if (auth.currentUser) {
      return auth.currentUser;
    }

    return new Promise(
      resolve => {
        const unsub =
          auth.onAuthStateChanged(
            user => {
              unsub();

              resolve(
                user || null
              );
            }
          );
      }
    );
  }

  // =========================================================
  // BOOT
  // =========================================================

  async function boot() {
    try {
      if (window.scReady) {
        await window.scReady;
      }

      db =
        window.scDb;

      auth =
        window.scAuth;

      if (
        !db ||
        !auth
      ) {
        throw new Error(
          "Firebase не готовий"
        );
      }

      const user =
        await getAuthUser();

      if (!user) {
        setState(
          "Спочатку увійдіть у свій акаунт STOLAR CARP.",
          "err"
        );

        if (
          $("loginLink")
        ) {
          $("loginLink").hidden =
            false;
        }

        return;
      }

      if (
        user.uid !==
        FOOD_OWNER_UID
      ) {
        setState(
          "Ця сторінка доступна тільки пані Ірі.",
          "err"
        );

        return;
      }

      if (
        $("loginLink")
      ) {
        $("loginLink").hidden =
          true;
      }

      showContent();

      clearTable(
        "Перевіряю активне харчування…"
      );

      startCurrentMealRealtime();

    } catch (e) {
      console.error(
        "[meal_ira] boot:",
        e
      );

      setState(
        "Помилка: " +
        (
          e?.message ||
          e
        ),
        "err"
      );
    }
  }

  // =========================================================
  // CLEANUP
  // =========================================================

  window.addEventListener(
    "beforeunload",
    () => {
      stopCompetitionListeners();

      try {
        unsubCurrent?.();
      } catch {}
    }
  );

  boot();

})();

// assets/js/meal_ira.js
// STOLAR CARP • Пані Іра • Харчування
// READ ONLY
//
// ✅ TEAM -> назва команди + сектор
// ✅ SOLO -> ПІБ учасника + сектор
// ✅ SOLO шукається по UID
// ✅ TEAM шукається по teamId
// ✅ сектор оновлюється LIVE з жеребкування
// ✅ підтримка:
//    stageResults/{comp__stage}.teams
//    stageResults/{comp__stage}/teams/{id}
// ✅ побажання видно під учасником / командою
// ✅ заявки оновлюються LIVE

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20260917-solo-sector-v2"
  );

  const FOOD_OWNER_UID =
    "T1BNuXaDM2f2Tf8KZosgFlAGmTu1";

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

  let orders = [];

  let parentDrawRows = [];
  let subDrawRows = [];

  let drawMap = {
    byId: new Map(),
    byName: new Map()
  };

  let unsubOrders = null;
  let unsubDrawParent = null;
  let unsubDrawTeams = null;

  // =========================================================
  // BASIC
  // =========================================================

  function num(value) {
    const n = Number(value);

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
      row?.type === "judges" ||
      row?.entityId === "__judges__"
    );
  }

  function isSolo(row) {
    return (
      clean(row?.type) === "solo" ||
      clean(row?.entryType) === "solo"
    );
  }

  // =========================================================
  // DISPLAY NAME
  // =========================================================

  function rowName(row) {
    if (isJudges(row)) {
      return "👨‍⚖️ СУДДІ";
    }

    if (isSolo(row)) {
      return norm(
        row?.participantName ||
        row?.displayName ||
        row?.name ||
        row?.teamName ||
        "—"
      );
    }

    return norm(
      row?.teamName ||
      row?.team ||
      row?.displayName ||
      row?.participantName ||
      "—"
    );
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
            match[1].toUpperCase(),

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
        item?.sector
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

  function addId(
    map,
    value,
    row
  ) {
    const key =
      norm(value);

    if (key) {
      map.set(
        key,
        row
      );
    }
  }

  function addName(
    map,
    value,
    row
  ) {
    const key =
      clean(value);

    if (key) {
      map.set(
        key,
        row
      );
    }
  }

  function rebuildDrawMap() {
    const byId =
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

      const row = {
        ...draw,

        teamId:
          norm(
            item.teamId
          ),

        uid:
          norm(
            item.uid ||
            item.participantUid
          ),

        entityId:
          norm(
            item.entityId
          ),

        teamName:
          norm(
            item.teamName ||
            item.team
          ),

        participantName:
          norm(
            item.participantName ||
            item.displayName ||
            item.name
          )
      };

      /*
       * TEAM
       */
      addId(
        byId,
        item.teamId,
        row
      );

      /*
       * SOLO / participant
       */
      addId(
        byId,
        item.uid,
        row
      );

      addId(
        byId,
        item.participantUid,
        row
      );

      addId(
        byId,
        item.entityId,
        row
      );

      /*
       * Fallback по назвах
       */
      addName(
        byName,
        item.participantName,
        row
      );

      addName(
        byName,
        item.displayName,
        row
      );

      addName(
        byName,
        item.teamName,
        row
      );

      addName(
        byName,
        item.team,
        row
      );

      addName(
        byName,
        item.name,
        row
      );
    });

    drawMap = {
      byId,
      byName
    };

    render();
  }

  function withCurrentDraw(order) {
    if (isJudges(order)) {
      return order;
    }

    let draw = null;

    /*
     * SOLO:
     * головний ключ — UID / entityId.
     *
     * TEAM:
     * головний ключ — teamId.
     */
    const idCandidates = [
      order?.entityId,
      order?.participantUid,
      order?.uid,
      order?.teamId
    ];

    for (
      const candidate of
      idCandidates
    ) {
      const key =
        norm(candidate);

      if (
        key &&
        drawMap.byId.has(key)
      ) {
        draw =
          drawMap.byId.get(key);

        break;
      }
    }

    /*
     * Fallback по ПІБ / назві.
     */
    if (!draw) {
      const nameCandidates = [
        order?.participantName,
        order?.displayName,
        order?.teamName,
        order?.team
      ];

      for (
        const candidate of
        nameCandidates
      ) {
        const key =
          clean(candidate);

        if (
          key &&
          drawMap.byName.has(key)
        ) {
          draw =
            drawMap.byName.get(key);

          break;
        }
      }
    }

    /*
     * Якщо LIVE-жереб ще не знайшли,
     * залишаємо сектор, який уже
     * був записаний у mealOrders.
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

      drawZone:
        draw.zone,

      drawSector:
        draw.sector,

      drawKey:
        draw.drawKey
    };
  }

  // =========================================================
  // SORT
  // =========================================================

  function sortOrders(a, b) {
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

    const zoneOrder = {
      A: 1,
      B: 2,
      C: 3
    };

    const za =
      zoneOrder[
        norm(a.zone)
          .toUpperCase()
      ] || 9;

    const zb =
      zoneOrder[
        norm(b.zone)
          .toUpperCase()
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
  // STATE
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
      tbody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty"
          >
            Заявок на харчування
            ще немає.
          </td>
        </tr>
      `;

      tfoot.innerHTML =
        "";

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
          num(d1.lunch);

        const d1d =
          num(d1.dinner);

        const d1b =
          num(d1.breakfast);

        const d2l =
          num(d2.lunch);

        const d2d =
          num(d2.dinner);

        const d2b =
          num(d2.breakfast);

        totals.d1l += d1l;
        totals.d1d += d1d;
        totals.d1b += d1b;

        totals.d2l += d2l;
        totals.d2d += d2d;
        totals.d2b += d2b;

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

        const note =
          norm(
            row.note
          );

        const name =
          rowName(row);

        return `
          <tr>

            <td class="sector">
              ${esc(sector)}
            </td>

            <td class="team">

              <div class="team-name">
                ${esc(name)}
              </div>

              ${
                isSolo(row)
                  ? `
                    <div
                      style="
                        margin-top:2px;
                        font-size:.72em;
                        opacity:.6;
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

      const stageTitle =
        norm(
          event?.title ||
          event?.name ||
          event?.label ||
          stageId
        );

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

    } catch (error) {
      console.warn(
        "[meal_ira] title:",
        error
      );
    }
  }

  // =========================================================
  // REALTIME DRAW
  // =========================================================

  function startDrawRealtime() {
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
     * Старий / сумісний формат:
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
     * stageResults/{id}/teams/{entity}
     */
    unsubDrawTeams =
      resultRef
        .collection(
          "teams"
        )
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
  // REALTIME ORDERS
  // =========================================================

  function startOrdersRealtime() {
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

  function startRealtime() {
    startDrawRealtime();
    startOrdersRealtime();
  }

  // =========================================================
  // BOOT
  // =========================================================

  async function boot() {
    const params =
      new URLSearchParams(
        location.search
      );

    competitionId =
      norm(
        params.get(
          "competitionId"
        )
      );

    stageId =
      norm(
        params.get(
          "stageId"
        )
      );

    if (
      !competitionId ||
      !stageId
    ) {
      setState(
        "Посилання неповне: немає competitionId або stageId.",
        "err"
      );

      return;
    }

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
        await new Promise(
          resolve => {
            if (
              auth.currentUser
            ) {
              resolve(
                auth.currentUser
              );

              return;
            }

            const unsub =
              auth.onAuthStateChanged(
                current => {
                  unsub();

                  resolve(
                    current ||
                    null
                  );
                }
              );
          }
        );

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
          "Це посилання доступне тільки пані Ірі.",
          "err"
        );

        return;
      }

      if ($("content")) {
        $("content").hidden =
          false;
      }

      await loadTitle();

      startRealtime();

    } catch (error) {
      console.error(
        "[meal_ira] boot:",
        error
      );

      setState(
        "Помилка: " +
        (
          error?.message ||
          error
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
      try {
        unsubOrders?.();
      } catch {}

      try {
        unsubDrawParent?.();
      } catch {}

      try {
        unsubDrawTeams?.();
      } catch {}
    }
  );

  boot();

})();

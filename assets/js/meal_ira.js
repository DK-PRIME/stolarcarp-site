// assets/js/meal_ira.js
// STOLAR CARP • Пані Іра • Харчування
// PUBLIC • READ ONLY
//
// ✅ без входу
// ✅ без реєстрації
// ✅ одна постійна сторінка meal_ira.html
// ✅ активне харчування = mealPublic/current
// ✅ заявки = mealPublicOrders
// ✅ TEAM -> назва команди
// ✅ SOLO -> ім'я учасника
// ✅ сектор показується
// ✅ побажання показуються
// ✅ LIVE оновлення
// ✅ після очищення список порожній

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20260917-public-v4"
  );

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

  let competitionId = "";
  let stageId = "";
  let mealIsOpen = false;

  let orders = [];

  let unsubCurrent = null;
  let unsubOrders = null;

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

  function isJudges(row) {
    return (
      clean(row?.type) ===
        "judges" ||
      norm(row?.entityId) ===
        "__judges__"
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
        "—"
      );
    }

    return norm(
      row?.teamName ||
      row?.displayName ||
      "—"
    );
  }

  function rowSector(row) {
    if (isJudges(row)) {
      return "—";
    }

    const direct =
      norm(
        row?.drawKey
      ).toUpperCase();

    if (direct) {
      return direct;
    }

    const zone =
      norm(
        row?.zone
      ).toUpperCase();

    const sector =
      norm(
        row?.sector
      );

    if (
      zone &&
      sector
    ) {
      return (
        zone +
        sector.replace(
          /^[ABC]/i,
          ""
        )
      );
    }

    return "—";
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

    const zoneOrder = {
      A: 1,
      B: 2,
      C: 3
    };

    const za =
      zoneOrder[
        norm(
          a.zone
        ).toUpperCase()
      ] || 9;

    const zb =
      zoneOrder[
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
        .filter(
          row =>
            row.status ===
              "submitted" &&
            totalOrder(row) > 0
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
          rowSector(row);

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

    } catch (error) {
      console.warn(
        "[meal_ira] title:",
        error
      );
    }
  }

  // =========================================================
  // ORDERS
  // =========================================================

  function stopOrdersRealtime() {
    try {
      unsubOrders?.();
    } catch {}

    unsubOrders =
      null;

    orders = [];
  }

  function startOrdersRealtime() {
    stopOrdersRealtime();

    if (
      !competitionId ||
      !stageId ||
      !mealIsOpen
    ) {
      render();
      return;
    }

    /*
     * ВАЖЛИВО:
     * Іра читає ТІЛЬКИ публічне дзеркало.
     */
    unsubOrders =
      db
        .collection(
          "mealPublicOrders"
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
              "[meal_ira] public orders:",
              error
            );

            setState(
              "Не вдалося завантажити харчування.",
              "err"
            );
          }
        );
  }

  // =========================================================
  // CURRENT MEAL
  // =========================================================

  function startCurrentMealRealtime() {
    /*
     * Постійна точка входу Іри.
     *
     * mealPublic/current
     * автоматично каже:
     * яке змагання зараз активне.
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

            const nextOpen =
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
              nextOpen;

            showContent();

            if (
              !competitionId ||
              !stageId
            ) {
              stopOrdersRealtime();

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
                  "Харчування";
              }

              setState(
                "Харчування зараз не відкрите.",
                ""
              );

              clearTable(
                "Харчування зараз не відкрите."
              );

              return;
            }

            if (changed) {
              await loadTitle();
            }

            if (!mealIsOpen) {
              stopOrdersRealtime();

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
              "Харчування відкрите · LIVE",
              "ok"
            );

            startOrdersRealtime();
          },
          error => {
            console.error(
              "[meal_ira] current:",
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
  // BOOT
  // =========================================================

  async function boot() {
    try {
      if (window.scReady) {
        await window.scReady;
      }

      db =
        window.scDb;

      if (!db) {
        throw new Error(
          "Firebase не готовий"
        );
      }

      /*
       * НІ auth.
       * НІ login.
       * НІ UID.
       */

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

      setState(
        "Завантаження…",
        ""
      );

      startCurrentMealRealtime();

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
      stopOrdersRealtime();

      try {
        unsubCurrent?.();
      } catch {}
    }
  );

  boot();

})();

// assets/js/meal_ira.js
// STOLAR CARP • Пані Іра • Харчування
// READ ONLY
//
// ✅ окрема сторінка
// ✅ тільки акаунт пані Іри
// ✅ заявки оновлюються LIVE
// ✅ сектор береться з актуального жеребу
// ✅ побажання видно під командою

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20260917"
  );

  const FOOD_OWNER_UID =
    "T1BNuXaDM2f2Tf8KZosgFlAGmTu1";

  const $ =
    (id) =>
      document.getElementById(
        id
      );

  const norm =
    (v) =>
      String(v ?? "")
        .replace(/\s+/g, " ")
        .trim();

  const clean =
    (v) =>
      norm(v)
        .toLowerCase();

  const esc =
    (s) =>
      String(s ?? "")
        .replace(
          /[&<>"']/g,
          (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
          }[m])
        );

  let db =
    null;

  let auth =
    null;

  let competitionId =
    "";

  let stageId =
    "";

  let orders =
    [];

  let drawMap = {
    byId:
      new Map(),

    byName:
      new Map()
  };

  let unsubOrders =
    null;

  let unsubDraw =
    null;

  function num(v) {
    const n =
      Number(v);

    return (
      Number.isFinite(n) &&
      n > 0
    )
      ? Math.floor(n)
      : 0;
  }

  function totalOrder(o) {
    return (
      num(o?.day1?.lunch) +
      num(o?.day1?.dinner) +
      num(o?.day1?.breakfast) +
      num(o?.day2?.lunch) +
      num(o?.day2?.dinner) +
      num(o?.day2?.breakfast)
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

  function parseDraw(
    team
  ) {
    const direct =
      norm(
        team?.drawKey
      ).toUpperCase();

    if (direct) {
      const m =
        direct.match(
          /^([ABC])(\d+)$/i
        );

      if (m) {
        return {
          zone:
            m[1].toUpperCase(),

          sector:
            m[2],

          drawKey:
            `${m[1].toUpperCase()}${m[2]}`
        };
      }
    }

    const zone =
      norm(
        team?.drawZone ||
        team?.zone
      ).toUpperCase();

    const sectorRaw =
      norm(
        team?.drawSector ||
        team?.sector
      );

    if (
      zone &&
      sectorRaw
    ) {
      const sector =
        sectorRaw.replace(
          /^[ABC]/i,
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

  function buildDrawMap(
    data
  ) {
    const teams =
      Array.isArray(
        data?.teams
      )
        ? data.teams
        : [];

    const byId =
      new Map();

    const byName =
      new Map();

    teams.forEach(
      (team) => {
        const draw =
          parseDraw(team);

        if (
          !draw.drawKey
        ) {
          return;
        }

        const item = {
          ...draw,

          teamId:
            norm(
              team.teamId ||
              team.entityId
            ),

          teamName:
            norm(
              team.teamName ||
              team.team ||
              team.displayName
            )
        };

        if (
          item.teamId
        ) {
          byId.set(
            item.teamId,
            item
          );
        }

        if (
          item.teamName
        ) {
          byName.set(
            clean(
              item.teamName
            ),
            item
          );
        }
      }
    );

    return {
      byId,
      byName
    };
  }

  function withCurrentDraw(
    order
  ) {
    let draw =
      null;

    const teamId =
      norm(
        order.teamId
      );

    const teamName =
      clean(
        order.teamName
      );

    if (
      teamId &&
      drawMap.byId.has(
        teamId
      )
    ) {
      draw =
        drawMap.byId.get(
          teamId
        );
    }

    if (
      !draw &&
      teamName &&
      drawMap.byName.has(
        teamName
      )
    ) {
      draw =
        drawMap.byName.get(
          teamName
        );
    }

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

  function sortOrders(
    a,
    b
  ) {
    const zOrder = {
      A: 1,
      B: 2,
      C: 3
    };

    const za =
      zOrder[
        norm(
          a.zone
        ).toUpperCase()
      ] || 9;

    const zb =
      zOrder[
        norm(
          b.zone
        ).toUpperCase()
      ] || 9;

    if (
      za !== zb
    ) {
      return za - zb;
    }

    const sa =
      Number(
        a.sector || 999
      );

    const sb =
      Number(
        b.sector || 999
      );

    if (
      sa !== sb
    ) {
      return sa - sb;
    }

    return norm(
      a.teamName
    ).localeCompare(
      norm(
        b.teamName
      ),
      "uk"
    );
  }

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
        .filter(
          (o) =>
            o.status ===
              "submitted" &&
            totalOrder(o) > 0
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

    if (
      !rows.length
    ) {
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
      rows.map(
        (r) => {
          const d1 =
            r.day1 || {};

          const d2 =
            r.day2 || {};

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
            r.drawKey ||
            (
              (r.zone || "") +
              (r.sector || "")
            ) ||
            "—";

          const note =
            norm(
              r.note
            );

          return `
            <tr>

              <td class="sector">
                ${esc(sector)}
              </td>

              <td class="team">

                <div class="team-name">
                  ${esc(
                    r.teamName ||
                    "—"
                  )}
                </div>

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
        }
      ).join("");

    tfoot.innerHTML = `
      <tr>

        <td colspan="2">
          Разом
        </td>

        <td>
          ${totals.d1l}
        </td>

        <td>
          ${totals.d1d}
        </td>

        <td>
          ${totals.d1b}
        </td>

        <td>
          ${totals.d2l}
        </td>

        <td>
          ${totals.d2d}
        </td>

        <td>
          ${totals.d2b}
        </td>

      </tr>
    `;
  }

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

      const c =
        snap.exists
          ? (snap.data() || {})
          : {};

      const title =
        norm(
          c.name ||
          competitionId
        );

      const events =
        Array.isArray(c.events)
          ? c.events
          : [];

      const ev =
        events.find(
          (x, i) =>
            norm(
              x?.key ||
              `stage-${i + 1}`
            ) === stageId
        );

      const stageTitle =
        norm(
          ev?.name ||
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

    } catch (e) {
      console.warn(
        "[meal_ira] title error:",
        e
      );
    }
  }

  function startRealtime() {
    const drawRef =
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

    unsubDraw =
      drawRef.onSnapshot(
        (snap) => {
          drawMap =
            buildDrawMap(
              snap.exists
                ? (
                    snap.data() ||
                    {}
                  )
                : {}
            );

          render();
        },
        (e) => {
          console.warn(
            "[meal_ira] draw snapshot error:",
            e
          );
        }
      );

    const q =
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
        );

    unsubOrders =
      q.onSnapshot(
        (snap) => {
          orders =
            snap.docs.map(
              (doc) => ({
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
        (e) => {
          console.error(
            "[meal_ira] orders snapshot error:",
            e
          );

          setState(
            "Немає доступу до списку харчування.",
            "err"
          );
        }
      );
  }

  async function boot() {
    const qs =
      new URLSearchParams(
        location.search
      );

    competitionId =
      norm(
        qs.get(
          "competitionId"
        )
      );

    stageId =
      norm(
        qs.get(
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
      if (
        window.scReady
      ) {
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
          (resolve) => {
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
                (u) => {
                  unsub();

                  resolve(
                    u || null
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

    } catch (e) {
      console.error(e);

      setState(
        "Помилка: " +
        (e.message || e),
        "err"
      );
    }
  }

  window.addEventListener(
    "beforeunload",
    () => {
      try {
        if (unsubOrders) {
          unsubOrders();
        }
      } catch {}

      try {
        if (unsubDraw) {
          unsubDraw();
        }
      } catch {}
    }
  );

  boot();

})();

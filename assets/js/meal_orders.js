// assets/js/meal_orders.js
// STOLAR CARP • Харчування 2 доби
//
// ✅ команди подають тільки власне харчування
// ✅ Дячок Роман керує харчуванням зі свого звичайного кабінету
// ✅ СУДДІ завжди є окремим рядком
// ✅ кількість для суддів змінює тільки OWNER_UID
// ✅ сектор команд автоматично береться з жеребкування
// ✅ побажання видно під назвою команди
// ✅ судді входять у загальний підсумок
// ✅ без role === "admin"
// ✅ підготовка даних для окремої публічної meal-app

(function () {
  "use strict";

  console.log("✅ meal_orders.js LOADED v20260917-owner-judges-v3");

  let ctx = window.scMealContext || null;

  let currentUser = null;
  let userTeamId = "";

  let isOwner = false;
  let mealIsOpen = false;

  const OWNER_UID = "T1BNuXaDM2f2Tf8KZosgFlAGmTu1";

  const JUDGES_ID = "__judges__";

  const PAID_STATUSES = [
    "confirmed",
    "paid",
    "payment_confirmed"
  ];

  const $ = (id) =>
    document.getElementById(id);

  const norm = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const clean = (value) =>
    norm(value).toLowerCase();

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char])
    );

  function num(value) {
    const n = Number(value);

    return Number.isFinite(n) && n > 0
      ? Math.floor(n)
      : 0;
  }

  function safeId(value) {
    return String(value || "")
      .replace(/[\/#?\[\]]/g, "_");
  }

  function orderId(
    competitionId,
    stageId,
    entityId
  ) {
    return safeId(
      `${competitionId}__${stageId}__${entityId}`
    );
  }

  function stageResultsId(
    competitionId,
    stageId
  ) {
    return (
      `${norm(competitionId)}__` +
      `${norm(stageId) || "main"}`
    );
  }

  function mealSettingsId() {
    if (
      !ctx?.competitionId ||
      !ctx?.stageId
    ) {
      return "";
    }

    return safeId(
      `${ctx.competitionId}__${ctx.stageId}`
    );
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

  // =========================================================
  // UI
  // =========================================================

  function setStatus(
    text,
    ok = true
  ) {
    const el =
      $("mealStatus");

    if (!el) {
      return;
    }

    el.textContent =
      text || "";

    el.className =
      "mealStatus " +
      (
        text
          ? (
              ok
                ? "ok"
                : "err"
            )
          : ""
      );
  }

  function setPopupStatus(
    text,
    ok = true
  ) {
    const el =
      $("mealPopupStatus");

    if (!el) {
      return;
    }

    el.textContent =
      text || "";

    el.className =
      "mealStatus " +
      (
        text
          ? (
              ok
                ? "ok"
                : "err"
            )
          : ""
      );
  }

  function openPopup(
    title,
    html
  ) {
    if ($("mealPopupTitle")) {
      $("mealPopupTitle").textContent =
        title;
    }

    if ($("mealPopupBody")) {
      $("mealPopupBody").innerHTML =
        html;
    }

    if ($("mealPopup")) {
      $("mealPopup").style.display =
        "flex";
    }
  }

  function closePopup() {
    if ($("mealPopup")) {
      $("mealPopup").style.display =
        "none";
    }
  }

  // =========================================================
  // FIREBASE
  // =========================================================

  async function waitReady() {
    if (window.scReady) {
      await window.scReady;
    }

    if (
      !window.scDb ||
      !window.scAuth ||
      !window.firebase
    ) {
      throw new Error(
        "Firebase не готовий"
      );
    }

    return {
      db: window.scDb,
      auth: window.scAuth,
      fb: window.firebase
    };
  }

  async function waitMealContext(
    maxMs = 10000
  ) {
    const started =
      Date.now();

    while (
      Date.now() - started <
      maxMs
    ) {
      ctx =
        window.scMealContext ||
        ctx;

      if (
        ctx &&
        ctx.competitionId &&
        ctx.stageId &&
        Array.isArray(ctx.teams)
      ) {
        return ctx;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            150
          )
      );
    }

    throw new Error(
      "Нема competitionId/stageId"
    );
  }

  async function getAuthUser() {
    const { auth } =
      await waitReady();

    if (auth.currentUser) {
      return auth.currentUser;
    }

    return new Promise(
      (resolve) => {
        const unsub =
          auth.onAuthStateChanged(
            (user) => {
              unsub();

              resolve(
                user || null
              );
            }
          );
      }
    );
  }

  async function loadUserData() {
    const { db } =
      await waitReady();

    currentUser =
      await getAuthUser();

    userTeamId = "";
    isOwner = false;

    if (!currentUser) {
      return;
    }

    isOwner =
      currentUser.uid ===
      OWNER_UID;

    try {
      const snap =
        await db
          .collection("users")
          .doc(currentUser.uid)
          .get();

      const data =
        snap.exists
          ? (
              snap.data() ||
              {}
            )
          : {};

      userTeamId =
        norm(
          data.teamId ||
          data.currentTeamId ||
          ""
        );

    } catch (e) {
      console.warn(
        "[Meals] user data:",
        e
      );
    }
  }

  // =========================================================
  // OPEN / CLOSE
  // =========================================================

  async function loadMealGate() {
    const { db } =
      await waitReady();

    const id =
      mealSettingsId();

    if (!id) {
      mealIsOpen = false;

      return false;
    }

    const snap =
      await db
        .collection("mealSettings")
        .doc(id)
        .get();

    const data =
      snap.exists
        ? (
            snap.data() ||
            {}
          )
        : {};

    mealIsOpen =
      data.isOpen === true;

    return mealIsOpen;
  }

  async function publishMealAppState(
    isOpenValue
  ) {
    if (
      !ctx?.competitionId ||
      !ctx?.stageId
    ) {
      return;
    }

    try {
      const {
        db,
        fb
      } = await waitReady();

      await db
        .collection("mealPublic")
        .doc("current")
        .set({
          competitionId:
            ctx.competitionId,

          stageId:
            ctx.stageId,

          isOpen:
            !!isOpenValue,

          updatedAt:
            fb.firestore
              .FieldValue
              .serverTimestamp()
        }, {
          merge: true
        });

    } catch (e) {
      console.warn(
        "[Meals] mealPublic/current:",
        e?.message || e
      );
    }
  }

  async function setMealGate(
    openValue
  ) {
    if (!isOwner) {
      throw new Error(
        "Керування доступне тільки Дячок Роман"
      );
    }

    const {
      db,
      fb
    } = await waitReady();

    const id =
      mealSettingsId();

    if (!id) {
      throw new Error(
        "Нема competitionId/stageId"
      );
    }

    await db
      .collection("mealSettings")
      .doc(id)
      .set({
        competitionId:
          ctx.competitionId,

        stageId:
          ctx.stageId,

        isOpen:
          !!openValue,

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp(),

        updatedBy:
          currentUser.uid
      }, {
        merge: true
      });

    mealIsOpen =
      !!openValue;

    await publishMealAppState(
      mealIsOpen
    );
  }

  // =========================================================
  // OWNER BUTTONS
  // =========================================================

  function ensureJudgesButton() {
    const mealBox =
      $("mealBox");

    const listBtn =
      $("btnOpenMealList");

    if (!mealBox) {
      return;
    }

    let btn =
      $("btnOpenJudgesMeal");

    if (!btn) {
      btn =
        document.createElement(
          "button"
        );

      btn.id =
        "btnOpenJudgesMeal";

      btn.type =
        "button";

      btn.className =
        listBtn?.className ||
        "mealBtn";

      btn.textContent =
        "👨‍⚖️ Судді";

      if (
        listBtn &&
        listBtn.parentNode
      ) {
        listBtn.parentNode
          .insertBefore(
            btn,
            listBtn.nextSibling
          );

      } else {
        mealBox.appendChild(
          btn
        );
      }
    }

    btn.hidden =
      !(
        mealIsOpen &&
        isOwner
      );

    btn.onclick =
      openJudgesOrder;
  }

  function applyVisibility() {
    const openWrap =
      $("mealOpenWrap");

    const mealBox =
      $("mealBox");

    const orderBtn =
      $("btnOpenMealOrder");

    const listBtn =
      $("btnOpenMealList");

    const clearBtn =
      $("btnClearMealOrders");

    if (openWrap) {
      openWrap.hidden =
        mealIsOpen ||
        !isOwner;
    }

    if (mealBox) {
      mealBox.hidden =
        !mealIsOpen;
    }

    if (orderBtn) {
      orderBtn.hidden =
        !mealIsOpen;
    }

    if (listBtn) {
      listBtn.hidden =
        !mealIsOpen;
    }

    if (clearBtn) {
      clearBtn.hidden =
        !(
          mealIsOpen &&
          isOwner
        );
    }

    ensureJudgesButton();

    if (mealIsOpen) {
      setStatus(
        "Харчування відкрите.",
        true
      );

    } else {
      setStatus("");
    }
  }

  // =========================================================
  // TEAMS
  // =========================================================

  function getMainPaidTeams() {
    if (
      !ctx ||
      !Array.isArray(ctx.teams)
    ) {
      return [];
    }

    const maxTeams =
      Number(
        ctx.maxTeams ||
        21
      );

    return ctx.teams
      .filter(
        (team) =>
          PAID_STATUSES.includes(
            clean(
              team.status
            )
          )
      )
      .slice(
        0,
        maxTeams
      );
  }

  function getMyTeam() {
    const teams =
      getMainPaidTeams();

    if (userTeamId) {
      const byTeamId =
        teams.find(
          (team) =>
            norm(
              team.teamId
            ) ===
            userTeamId
        );

      if (byTeamId) {
        return byTeamId;
      }
    }

    if (currentUser) {
      const byUid =
        teams.find(
          (team) =>
            norm(
              team.uid
            ) ===
            currentUser.uid
        );

      if (byUid) {
        return byUid;
      }
    }

    return null;
  }

  // =========================================================
  // DRAW
  // =========================================================

  function parseDraw(team) {
    const direct =
      norm(
        team?.drawKey
      ).toUpperCase();

    if (direct) {
      const match =
        direct.match(
          /^([ABC])(\d+)$/i
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

  function teamDrawKey(team) {
    return parseDraw(team)
      .drawKey;
  }

  async function loadDrawMap() {
    const { db } =
      await waitReady();

    const id =
      stageResultsId(
        ctx.competitionId,
        ctx.stageId
      );

    try {
      const snap =
        await db
          .collection("stageResults")
          .doc(id)
          .get();

      const data =
        snap.exists
          ? (
              snap.data() ||
              {}
            )
          : {};

      const teams =
        Array.isArray(
          data.teams
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

          if (!draw.drawKey) {
            return;
          }

          const teamId =
            norm(
              team.teamId ||
              team.entityId ||
              ""
            );

          const teamName =
            norm(
              team.teamName ||
              team.team ||
              team.displayName ||
              ""
            );

          const row = {
            ...draw,
            teamId,
            teamName
          };

          if (teamId) {
            byId.set(
              teamId,
              row
            );
          }

          if (teamName) {
            byName.set(
              clean(teamName),
              row
            );
          }
        }
      );

      return {
        byId,
        byName
      };

    } catch (e) {
      console.warn(
        "[Meals] draw map:",
        e
      );

      return {
        byId:
          new Map(),

        byName:
          new Map()
      };
    }
  }

  function applyCurrentDraw(
    order,
    drawMap
  ) {
    if (
      order?.type ===
      "judges"
    ) {
      return order;
    }

    let draw = null;

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

  // =========================================================
  // READ ORDER
  // =========================================================

  async function readOrderByEntity(
    entityId
  ) {
    const { db } =
      await waitReady();

    const id =
      orderId(
        ctx.competitionId,
        ctx.stageId,
        entityId
      );

    const snap =
      await db
        .collection("mealOrders")
        .doc(id)
        .get();

    return snap.exists
      ? (
          snap.data() ||
          {}
        )
      : null;
  }

  // =========================================================
  // FORM HELPERS
  // =========================================================

  function mealFieldsHtml(
    old,
    prefix
  ) {
    const d1 =
      old?.day1 || {};

    const d2 =
      old?.day2 || {};

    const note =
      old?.note || "";

    return `
      <div class="mealDayTitle">
        Доба 1
      </div>

      <div class="mealGrid">

        <div class="mealField">
          <label>Обід</label>

          <input
            id="${prefix}D1Lunch"
            type="number"
            min="0"
            max="50"
            value="${esc(d1.lunch || 0)}"
          >
        </div>

        <div class="mealField">
          <label>Вечеря</label>

          <input
            id="${prefix}D1Dinner"
            type="number"
            min="0"
            max="50"
            value="${esc(d1.dinner || 0)}"
          >
        </div>

        <div class="mealField">
          <label>Сніданок</label>

          <input
            id="${prefix}D1Breakfast"
            type="number"
            min="0"
            max="50"
            value="${esc(d1.breakfast || 0)}"
          >
        </div>

      </div>

      <div class="mealDayTitle">
        Доба 2
      </div>

      <div class="mealGrid">

        <div class="mealField">
          <label>Обід</label>

          <input
            id="${prefix}D2Lunch"
            type="number"
            min="0"
            max="50"
            value="${esc(d2.lunch || 0)}"
          >
        </div>

        <div class="mealField">
          <label>Вечеря</label>

          <input
            id="${prefix}D2Dinner"
            type="number"
            min="0"
            max="50"
            value="${esc(d2.dinner || 0)}"
          >
        </div>

        <div class="mealField">
          <label>Сніданок</label>

          <input
            id="${prefix}D2Breakfast"
            type="number"
            min="0"
            max="50"
            value="${esc(d2.breakfast || 0)}"
          >
        </div>

      </div>

      <div class="mealField">

        <label>
          Побажання до харчування
        </label>

        <textarea
          id="${prefix}Note"
          placeholder="Наприклад: без цибулі, без мʼяса тощо"
        >${esc(note)}</textarea>

      </div>
    `;
  }

  function readFields(
    prefix
  ) {
    return {
      day1: {
        lunch:
          num(
            $(`${prefix}D1Lunch`)
              ?.value
          ),

        dinner:
          num(
            $(`${prefix}D1Dinner`)
              ?.value
          ),

        breakfast:
          num(
            $(`${prefix}D1Breakfast`)
              ?.value
          )
      },

      day2: {
        lunch:
          num(
            $(`${prefix}D2Lunch`)
              ?.value
          ),

        dinner:
          num(
            $(`${prefix}D2Dinner`)
              ?.value
          ),

        breakfast:
          num(
            $(`${prefix}D2Breakfast`)
              ?.value
          )
      },

      note:
        norm(
          $(`${prefix}Note`)
            ?.value
        )
    };
  }

  function orderFormHtml(
    team,
    old
  ) {
    return `
      <div class="mealDayTitle">

        Команда:
        ${esc(
          team.teamName ||
          team.team ||
          "—"
        )}

        ·

        ${esc(
          teamDrawKey(team) ||
          "сектор ще не визначено"
        )}

      </div>

      ${mealFieldsHtml(
        old,
        "meal"
      )}

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:14px;
        "
      >

        <button
          class="mealBtn mealBtn--primary"
          id="btnSaveMealOrder"
          type="button"
        >
          Зберегти заявку
        </button>

        <button
          class="mealBtn"
          id="btnCloseMealPopup"
          type="button"
        >
          Закрити
        </button>

      </div>

      <div
        class="mealStatus"
        id="mealPopupStatus"
      ></div>
    `;
  }

  function judgesFormHtml(
    old
  ) {
    return `
      <div
        class="mealDayTitle"
        style="
          color:#facc15;
          font-weight:900;
        "
      >
        👨‍⚖️ СУДДІ
      </div>

      <div
        style="
          margin-bottom:12px;
          opacity:.8;
          font-size:.9rem;
        "
      >
        Кількість для суддів задає Дячок Роман.
      </div>

      ${mealFieldsHtml(
        old,
        "judgeMeal"
      )}

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:14px;
        "
      >

        <button
          class="mealBtn mealBtn--primary"
          id="btnSaveJudgesMeal"
          type="button"
        >
          Зберегти суддів
        </button>

        <button
          class="mealBtn"
          id="btnCloseMealPopup"
          type="button"
        >
          Закрити
        </button>

      </div>

      <div
        class="mealStatus"
        id="mealPopupStatus"
      ></div>
    `;
  }

  // =========================================================
  // PUBLIC APP MIRROR
  // =========================================================

  async function publishPublicOrder(
    data,
    id
  ) {
    try {
      const {
        db,
        fb
      } = await waitReady();

      await db
        .collection(
          "mealPublicOrders"
        )
        .doc(id)
        .set({
          competitionId:
            data.competitionId,

          stageId:
            data.stageId,

          type:
            data.type ||
            "team",

          entityId:
            data.entityId ||
            "",

          teamId:
            data.teamId ||
            null,

          teamName:
            data.teamName ||
            "—",

          zone:
            data.zone ||
            "",

          sector:
            data.sector ||
            "",

          drawKey:
            data.drawKey ||
            "",

          day1:
            data.day1 ||
            {},

          day2:
            data.day2 ||
            {},

          note:
            data.note ||
            "",

          status:
            data.status ||
            "empty",

          updatedAt:
            fb.firestore
              .FieldValue
              .serverTimestamp()
        }, {
          merge: true
        });

    } catch (e) {
      console.warn(
        "[Meals] public mirror:",
        e?.message || e
      );
    }
  }

  // =========================================================
  // TEAM ORDER
  // =========================================================

  async function openOrder() {
    try {
      await waitMealContext();
      await loadUserData();
      await loadMealGate();

      applyVisibility();

      if (!mealIsOpen) {
        return;
      }

      if (!currentUser) {
        setStatus(
          "Увійди в кабінет, щоб подати заявку.",
          false
        );

        return;
      }

      const team =
        getMyTeam();

      if (!team) {
        setStatus(
          "Заявку можуть подати тільки оплачені команди основного списку.",
          false
        );

        return;
      }

      const old =
        await readOrderByEntity(
          team.teamId
        );

      openPopup(
        "🍽 Заявка на харчування",
        orderFormHtml(
          team,
          old
        )
      );

      if (
        $("btnCloseMealPopup")
      ) {
        $("btnCloseMealPopup").onclick =
          closePopup;
      }

      if (
        $("btnSaveMealOrder")
      ) {
        $("btnSaveMealOrder").onclick =
          () =>
            saveOrder(
              team,
              old
            );
      }

    } catch (e) {
      console.error(e);

      setStatus(
        "Помилка: " +
        (e.message || e),
        false
      );
    }
  }

  async function saveOrder(
    team,
    oldOrder
  ) {
    try {
      const {
        db,
        fb
      } = await waitReady();

      const fields =
        readFields(
          "meal"
        );

      const draw =
        parseDraw(
          team
        );

      const data = {
        competitionId:
          ctx.competitionId,

        stageId:
          ctx.stageId,

        type:
          "team",

        entityId:
          team.teamId,

        teamId:
          team.teamId,

        teamName:
          team.teamName ||
          team.team ||
          "—",

        zone:
          draw.zone,

        sector:
          draw.sector,

        drawKey:
          draw.drawKey,

        day1:
          fields.day1,

        day2:
          fields.day2,

        note:
          fields.note,

        uid:
          currentUser.uid,

        status:
          totalOrder(fields) > 0
            ? "submitted"
            : "empty",

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp()
      };

      if (!oldOrder?.createdAt) {
        data.createdAt =
          fb.firestore
            .FieldValue
            .serverTimestamp();
      }

      const id =
        orderId(
          ctx.competitionId,
          ctx.stageId,
          team.teamId
        );

      await db
        .collection("mealOrders")
        .doc(id)
        .set(
          data,
          {
            merge: true
          }
        );

      await publishPublicOrder(
        data,
        id
      );

      setPopupStatus(
        "✅ Заявку збережено.",
        true
      );

      setStatus(
        "✅ Заявку на харчування збережено.",
        true
      );

    } catch (e) {
      console.error(e);

      setPopupStatus(
        "❌ " +
        (e.message || e),
        false
      );
    }
  }

  // =========================================================
  // JUDGES
  // =========================================================

  async function openJudgesOrder() {
    try {
      await waitMealContext();
      await loadUserData();
      await loadMealGate();

      if (!mealIsOpen) {
        return;
      }

      if (!isOwner) {
        setStatus(
          "Суддів може змінювати тільки Дячок Роман.",
          false
        );

        return;
      }

      const old =
        await readOrderByEntity(
          JUDGES_ID
        );

      openPopup(
        "👨‍⚖️ Харчування суддів",
        judgesFormHtml(
          old
        )
      );

      if (
        $("btnCloseMealPopup")
      ) {
        $("btnCloseMealPopup").onclick =
          closePopup;
      }

      if (
        $("btnSaveJudgesMeal")
      ) {
        $("btnSaveJudgesMeal").onclick =
          () =>
            saveJudgesOrder(
              old
            );
      }

    } catch (e) {
      console.error(e);

      setStatus(
        "Помилка: " +
        (e.message || e),
        false
      );
    }
  }

  async function saveJudgesOrder(
    oldOrder
  ) {
    try {
      await loadUserData();

      if (!isOwner) {
        throw new Error(
          "Доступ тільки для Дячок Роман"
        );
      }

      const {
        db,
        fb
      } = await waitReady();

      const fields =
        readFields(
          "judgeMeal"
        );

      const data = {
        competitionId:
          ctx.competitionId,

        stageId:
          ctx.stageId,

        type:
          "judges",

        entityId:
          JUDGES_ID,

        teamId:
          null,

        teamName:
          "СУДДІ",

        zone:
          "",

        sector:
          "",

        drawKey:
          "",

        day1:
          fields.day1,

        day2:
          fields.day2,

        note:
          fields.note,

        uid:
          currentUser.uid,

        status:
          totalOrder(fields) > 0
            ? "submitted"
            : "empty",

        updatedBy:
          currentUser.uid,

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp()
      };

      if (!oldOrder?.createdAt) {
        data.createdAt =
          fb.firestore
            .FieldValue
            .serverTimestamp();
      }

      const id =
        orderId(
          ctx.competitionId,
          ctx.stageId,
          JUDGES_ID
        );

      await db
        .collection("mealOrders")
        .doc(id)
        .set(
          data,
          {
            merge: true
          }
        );

      await publishPublicOrder(
        data,
        id
      );

      setPopupStatus(
        "✅ Харчування суддів збережено.",
        true
      );

      setStatus(
        "✅ Суддів додано до загальної кількості.",
        true
      );

    } catch (e) {
      console.error(e);

      setPopupStatus(
        "❌ " +
        (e.message || e),
        false
      );
    }
  }

  // =========================================================
  // LIST
  // =========================================================

  function emptyJudgesRow() {
    return {
      id:
        orderId(
          ctx.competitionId,
          ctx.stageId,
          JUDGES_ID
        ),

      type:
        "judges",

      entityId:
        JUDGES_ID,

      teamId:
        null,

      teamName:
        "СУДДІ",

      zone:
        "",

      sector:
        "",

      drawKey:
        "",

      day1: {
        lunch: 0,
        dinner: 0,
        breakfast: 0
      },

      day2: {
        lunch: 0,
        dinner: 0,
        breakfast: 0
      },

      note:
        "",

      status:
        "empty",

      _synthetic:
        true
    };
  }

  function sortOrders(
    a,
    b
  ) {
    if (
      a.type === "judges" &&
      b.type !== "judges"
    ) {
      return 1;
    }

    if (
      b.type === "judges" &&
      a.type !== "judges"
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

    return norm(
      a.teamName
    ).localeCompare(
      norm(
        b.teamName
      ),
      "uk"
    );
  }

  async function loadOrders() {
    await waitMealContext();

    const { db } =
      await waitReady();

    const [
      snap,
      drawMap
    ] =
      await Promise.all([
        db
          .collection("mealOrders")
          .where(
            "competitionId",
            "==",
            ctx.competitionId
          )
          .where(
            "stageId",
            "==",
            ctx.stageId
          )
          .get(),

        loadDrawMap()
      ]);

    const rows = [];

    let judges = null;

    snap.forEach(
      (doc) => {
        const data =
          doc.data() || {};

        const judgesDoc =
          data.type ===
            "judges" ||
          data.entityId ===
            JUDGES_ID ||
          doc.id.endsWith(
            `__${JUDGES_ID}`
          );

        if (judgesDoc) {
          judges = {
            id:
              doc.id,

            ...data,

            type:
              "judges",

            entityId:
              JUDGES_ID,

            teamName:
              "СУДДІ"
          };

          return;
        }

        if (
          data.status !==
          "submitted"
        ) {
          return;
        }

        if (
          totalOrder(data) <= 0
        ) {
          return;
        }

        rows.push(
          applyCurrentDraw(
            {
              id:
                doc.id,

              ...data
            },
            drawMap
          )
        );
      }
    );

    // СУДДІ Є ЗАВЖДИ
    rows.push(
      judges ||
      emptyJudgesRow()
    );

    rows.sort(
      sortOrders
    );

    return rows;
  }

  function listHtml(rows) {
    const totals = {
      d1l: 0,
      d1d: 0,
      d1b: 0,

      d2l: 0,
      d2d: 0,
      d2b: 0
    };

    const body =
      rows.map(
        (row) => {
          const judges =
            row.type ===
            "judges";

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

          totals.d1l += d1l;
          totals.d1d += d1d;
          totals.d1b += d1b;

          totals.d2l += d2l;
          totals.d2d += d2d;
          totals.d2b += d2b;

          const sector =
            judges
              ? "—"
              : (
                  row.drawKey ||
                  (
                    (row.zone || "") +
                    (row.sector || "")
                  ) ||
                  "—"
                );

          const note =
            norm(
              row.note
            );

          const editButton =
            (
              judges &&
              isOwner
            )
              ? `
                <button
                  id="btnEditJudgesFromList"
                  type="button"
                  class="mealBtn"
                  style="
                    margin-top:6px;
                    padding:4px 8px;
                    font-size:.72rem;
                  "
                >
                  ✏️ Вказати
                </button>
              `
              : "";

          return `
            <tr
              ${
                judges
                  ? `
                    style="
                      background:
                        rgba(
                          250,
                          204,
                          21,
                          .06
                        );
                    "
                  `
                  : ""
              }
            >

              <td
                class="m-sector"
                style="${
                  judges
                    ? `
                      color:#facc15;
                      font-weight:900;
                    `
                    : ""
                }"
              >
                ${esc(sector)}
              </td>

              <td class="m-team">

                <div
                  style="${
                    judges
                      ? `
                        color:#facc15;
                        font-weight:900;
                      `
                      : ""
                  }"
                >
                  ${
                    judges
                      ? "👨‍⚖️ СУДДІ"
                      : esc(
                          row.teamName ||
                          "—"
                        )
                  }
                </div>

                ${
                  note
                    ? `
                      <div
                        style="
                          margin-top:3px;
                          color:#facc15;
                          font-size:.78em;
                          line-height:1.25;
                          white-space:normal;
                        "
                      >
                        ⚠ ${esc(note)}
                      </div>
                    `
                    : ""
                }

                ${editButton}

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

    return `
      <div class="mealScreenTableWrap">

        <table class="mealScreenTable">

          <thead>
            <tr>
              <th>С</th>
              <th>Команда</th>

              <th>1О</th>
              <th>1В</th>
              <th>1С</th>

              <th>2О</th>
              <th>2В</th>
              <th>2С</th>
            </tr>
          </thead>

          <tbody>
            ${body}
          </tbody>

          <tfoot>
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
          </tfoot>

        </table>

      </div>
    `;
  }

  async function openList() {
    try {
      await waitMealContext();
      await loadUserData();
      await loadMealGate();

      applyVisibility();

      if (!mealIsOpen) {
        return;
      }

      openPopup(
        "🍽 Харчування",
        `
          <div class="team-loading">
            Завантаження…
          </div>
        `
      );

      const rows =
        await loadOrders();

      if (
        $("mealPopupBody")
      ) {
        $("mealPopupBody").innerHTML =
          listHtml(
            rows
          );
      }

      if (
        $("btnEditJudgesFromList")
      ) {
        $("btnEditJudgesFromList")
          .onclick =
          openJudgesOrder;
      }

    } catch (e) {
      console.error(e);

      openPopup(
        "Помилка",
        `
          <div class="team-loading">
            ❌ ${esc(
              e.message || e
            )}
          </div>
        `
      );
    }
  }

  // =========================================================
  // OWNER OPEN
  // =========================================================

  async function openMeals() {
    try {
      await waitMealContext();
      await loadUserData();

      if (!isOwner) {
        alert(
          "Відкрити харчування може тільки Дячок Роман."
        );

        return;
      }

      await setMealGate(
        true
      );

      await loadMealGate();

      applyVisibility();

    } catch (e) {
      console.error(e);

      alert(
        "Не вдалося відкрити харчування: " +
        (e.message || e)
      );
    }
  }

  // =========================================================
  // CLEAR
  // =========================================================

  async function deletePublicOrders() {
    try {
      const { db } =
        await waitReady();

      const snap =
        await db
          .collection(
            "mealPublicOrders"
          )
          .where(
            "competitionId",
            "==",
            ctx.competitionId
          )
          .where(
            "stageId",
            "==",
            ctx.stageId
          )
          .get();

      let batch =
        db.batch();

      let count = 0;

      for (
        const doc of snap.docs
      ) {
        batch.delete(
          doc.ref
        );

        count++;

        if (count >= 400) {
          await batch.commit();

          batch =
            db.batch();

          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

    } catch (e) {
      console.warn(
        "[Meals] public clear:",
        e
      );
    }
  }

  async function clearOrders() {
    try {
      await waitMealContext();
      await loadUserData();

      if (!isOwner) {
        setStatus(
          "Очищення доступне тільки Дячок Роман.",
          false
        );

        return;
      }

      if (
        !confirm(
          "Точно видалити всі заявки і закрити харчування?"
        )
      ) {
        return;
      }

      const { db } =
        await waitReady();

      const snap =
        await db
          .collection("mealOrders")
          .where(
            "competitionId",
            "==",
            ctx.competitionId
          )
          .where(
            "stageId",
            "==",
            ctx.stageId
          )
          .get();

      let batch =
        db.batch();

      let count = 0;
      let total = 0;

      for (
        const doc of snap.docs
      ) {
        batch.delete(
          doc.ref
        );

        count++;
        total++;

        if (count >= 400) {
          await batch.commit();

          batch =
            db.batch();

          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      await deletePublicOrders();

      await setMealGate(
        false
      );

      await loadMealGate();

      closePopup();

      applyVisibility();

      setStatus(
        `✅ Заявки видалено: ${total}`,
        true
      );

    } catch (e) {
      console.error(e);

      setStatus(
        "Помилка очищення: " +
        (e.message || e),
        false
      );
    }
  }

  // =========================================================
  // INIT
  // =========================================================

  async function refreshButtons() {
    try {
      await waitMealContext();
      await loadUserData();
      await loadMealGate();

      applyVisibility();

      if (
        $("btnMealGateOpen")
      ) {
        $("btnMealGateOpen").onclick =
          openMeals;
      }

      if (
        $("btnOpenMealOrder")
      ) {
        $("btnOpenMealOrder").onclick =
          openOrder;
      }

      if (
        $("btnOpenMealList")
      ) {
        $("btnOpenMealList").onclick =
          openList;
      }

      if (
        $("btnClearMealOrders")
      ) {
        $("btnClearMealOrders").onclick =
          clearOrders;
      }

      ensureJudgesButton();

    } catch (e) {
      console.warn(
        "[Meals] refresh:",
        e
      );

      mealIsOpen =
        false;

      applyVisibility();
    }
  }

  function setContext(
    nextCtx
  ) {
    ctx =
      nextCtx ||
      ctx;

    refreshButtons();
  }

  document.addEventListener(
    "click",
    (event) => {
      if (
        event.target.id ===
          "mealPopupClose" ||
        event.target.id ===
          "btnCloseMealPopup"
      ) {
        closePopup();

        return;
      }

      const popup =
        $("mealPopup");

      if (
        popup?.style.display ===
          "flex" &&
        event.target === popup
      ) {
        closePopup();
      }
    }
  );

  window.scMeals = {
    setContext,
    openOrder,
    openList,
    openJudgesOrder,
    clearOrders,
    refreshButtons,
    refreshAdminButtons:
      refreshButtons,
    loadMealGate,
    setMealGate,
    openMeals
  };

  if (ctx) {
    setContext(ctx);
  }

  const boot =
    setInterval(
      () => {
        if (
          window.scMealContext &&
          window.scMealContext
            .competitionId &&
          window.scMealContext
            .stageId
        ) {
          clearInterval(
            boot
          );

          setContext(
            window.scMealContext
          );
        }
      },
      200
    );

  setTimeout(
    () =>
      clearInterval(
        boot
      ),
    12000
  );

})();

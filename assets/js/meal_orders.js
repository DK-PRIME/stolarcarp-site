// assets/js/meal_orders.js
// STOLAR CARP • Харчування 2 доби
// ✅ команди подають свої заявки
// ✅ актуальний сектор береться з stageResults після жеребкування
// ✅ побажання показуються у списку
// ✅ окреме харчування для СУДДІВ — тільки admin
// ✅ без подвійних click-handler'ів
// ✅ готує безпечний public mirror для окремої апки харчування

(function () {
  "use strict";

  console.log("✅ meal_orders.js LOADED v20260917-judges-public-app-v1");

  let ctx = window.scMealContext || null;
  let currentUser = null;
  let userTeamId = "";
  let userRole = "";
  let canManageMeals = false;
  let canManageJudges = false;
  let mealIsOpen = false;

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const FOOD_OWNER_UID = "T1BNuXaDM2f2Tf8KZosgFlAGmTu1";
  const JUDGES_ID = "__judges__";

  const PAID_STATUSES = [
    "confirmed",
    "paid",
    "payment_confirmed"
  ];

  const $ = (id) => document.getElementById(id);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));

  const norm = (v) =>
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const clean = (v) =>
    norm(v).toLowerCase();

  function num(v) {
    const n = Number(v);

    return Number.isFinite(n) && n > 0
      ? Math.floor(n)
      : 0;
  }

  function safeId(v) {
    return String(v || "").replace(/[\/#?\[\]]/g, "_");
  }

  function orderId(compId, stageId, entityId) {
    return safeId(`${compId}__${stageId}__${entityId}`);
  }

  function stageResultsId(compId, stageId) {
    return `${norm(compId)}__${norm(stageId) || "main"}`;
  }

  function mealSettingsId() {
    if (!ctx?.competitionId || !ctx?.stageId) {
      return "";
    }

    return safeId(
      `${ctx.competitionId}__${ctx.stageId}`
    );
  }

  function setStatus(text, ok = true) {
    const el = $("mealStatus");

    if (!el) {
      return;
    }

    el.textContent = text || "";

    el.className =
      "mealStatus " +
      (
        text
          ? (ok ? "ok" : "err")
          : ""
      );
  }

  function setPopupStatus(text, ok = true) {
    const el = $("mealPopupStatus");

    if (!el) {
      return;
    }

    el.textContent = text || "";

    el.className =
      "mealStatus " +
      (
        text
          ? (ok ? "ok" : "err")
          : ""
      );
  }

  function openPopup(title, html) {
    if ($("mealPopupTitle")) {
      $("mealPopupTitle").textContent = title;
    }

    if ($("mealPopupBody")) {
      $("mealPopupBody").innerHTML = html;
    }

    if ($("mealPopup")) {
      $("mealPopup").style.display = "flex";
    }
  }

  function closePopup() {
    if ($("mealPopup")) {
      $("mealPopup").style.display = "none";
    }
  }

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

  async function waitMealContext(maxMs = 10000) {
    const started = Date.now();

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
        (r) =>
          setTimeout(
            r,
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

    if (!currentUser) {
      userTeamId = "";
      userRole = "";
      canManageMeals = false;
      canManageJudges = false;

      return;
    }

    const snap =
      await db
        .collection("users")
        .doc(currentUser.uid)
        .get();

    const u =
      snap.exists
        ? (snap.data() || {})
        : {};

    userTeamId =
      norm(
        u.teamId ||
        u.currentTeamId ||
        ""
      );

    userRole =
      clean(
        u.role ||
        ""
      );

    const isAdmin =
      currentUser.uid ===
        ADMIN_UID ||
      userRole ===
        "admin";

    canManageJudges =
      isAdmin;

    canManageMeals =
      currentUser.uid ===
        FOOD_OWNER_UID ||
      isAdmin;
  }

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
        .collection(
          "mealSettings"
        )
        .doc(id)
        .get();

    const d =
      snap.exists
        ? (snap.data() || {})
        : {};

    mealIsOpen =
      d.isOpen === true;

    return mealIsOpen;
  }

  async function publishMealAppState(isOpen) {
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
        .collection(
          "mealPublic"
        )
        .doc(
          "current"
        )
        .set({
          competitionId:
            ctx.competitionId,

          stageId:
            ctx.stageId,

          isOpen:
            !!isOpen,

          updatedAt:
            fb.firestore
              .FieldValue
              .serverTimestamp()
        }, {
          merge: true
        });

    } catch (e) {
      console.warn(
        "[Meals] public current mirror skipped:",
        e?.message || e
      );
    }
  }

  async function setMealGate(isOpen) {
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
      .collection(
        "mealSettings"
      )
      .doc(id)
      .set({
        competitionId:
          ctx.competitionId,

        stageId:
          ctx.stageId,

        isOpen:
          !!isOpen,

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp(),

        updatedBy:
          currentUser
            ? currentUser.uid
            : ""
      }, {
        merge: true
      });

    mealIsOpen =
      !!isOpen;

    await publishMealAppState(
      mealIsOpen
    );
  }

  function ensureJudgesButton() {
    const mealBox =
      $("mealBox");

    const listBtn =
      $("btnOpenMealList");

    let btn =
      $("btnOpenJudgesMeal");

    if (
      !btn &&
      mealBox
    ) {
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
        listBtn?.parentNode
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

    if (btn) {
      btn.hidden =
        !(
          mealIsOpen &&
          canManageJudges
        );

      btn.onclick =
        openJudgesOrder;
    }
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
        !canManageMeals;
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
          canManageMeals
        );
    }

    ensureJudgesButton();

    if (!mealIsOpen) {
      setStatus("");
    }

    if (mealIsOpen) {
      setStatus(
        "Харчування відкрите.",
        true
      );
    }
  }

  function getMainPaidTeams() {
    if (
      !ctx ||
      !Array.isArray(ctx.teams)
    ) {
      return [];
    }

    const maxTeams =
      Number(
        ctx.maxTeams || 21
      );

    return ctx.teams
      .filter(
        (t) =>
          PAID_STATUSES.includes(
            norm(t.status)
              .toLowerCase()
          )
      )
      .slice(
        0,
        maxTeams
      );
  }

  function getMyTeam() {
    const mainPaidTeams =
      getMainPaidTeams();

    if (userTeamId) {
      const byTeamId =
        mainPaidTeams.find(
          (t) =>
            norm(
              t.teamId
            ) ===
            userTeamId
        );

      if (byTeamId) {
        return byTeamId;
      }
    }

    if (currentUser) {
      const byUid =
        mainPaidTeams.find(
          (t) =>
            norm(
              t.uid
            ) ===
            currentUser.uid
        );

      if (byUid) {
        return byUid;
      }
    }

    return null;
  }

  function teamDrawKey(t) {
    const direct =
      norm(
        t?.drawKey
      ).toUpperCase();

    if (direct) {
      return direct;
    }

    const zone =
      norm(
        t?.drawZone ||
        t?.zone
      ).toUpperCase();

    const sectorRaw =
      norm(
        t?.drawSector ||
        t?.sector
      );

    if (
      !zone ||
      !sectorRaw
    ) {
      return "";
    }

    const sector =
      sectorRaw.replace(
        /^[ABC]/i,
        ""
      );

    return `${zone}${sector}`;
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

  async function readOrderByEntity(entityId) {
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
        .collection(
          "mealOrders"
        )
        .doc(id)
        .get();

    return snap.exists
      ? (snap.data() || {})
      : null;
  }

  function mealFieldsHtml(
    old,
    prefix = "meal"
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

  function judgesFormHtml(old) {
    return `
      <div
        class="mealDayTitle"
        style="
          color:#facc15;
        "
      >
        👨‍⚖️ СУДДІ
      </div>

      <div
        class="hint"
        style="
          margin-bottom:10px;
        "
      >
        Цю кількість може змінювати
        тільки адміністратор.
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

  function readFields(prefix) {
    const day1 = {
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
    };

    const day2 = {
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
    };

    const note =
      norm(
        $(`${prefix}Note`)
          ?.value
      );

    return {
      day1,
      day2,
      note
    };
  }

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
        $("btnCloseMealPopup")
          .onclick =
          closePopup;
      }

      if (
        $("btnSaveMealOrder")
      ) {
        $("btnSaveMealOrder")
          .onclick =
          () =>
            saveOrder(
              team,
              old
            );
      }

    } catch (e) {
      console.error(e);

      setStatus(
        "Помилка відкриття заявки: " +
        (e.message || e),
        false
      );
    }
  }

  async function publishPublicOrder(
    privateData,
    id
  ) {
    try {
      const {
        db,
        fb
      } = await waitReady();

      const publicData = {
        competitionId:
          privateData.competitionId,

        stageId:
          privateData.stageId,

        type:
          privateData.type ||
          "team",

        entityId:
          privateData.entityId ||
          privateData.teamId ||
          "",

        teamId:
          privateData.teamId ||
          null,

        teamName:
          privateData.teamName ||
          "—",

        zone:
          privateData.zone ||
          "",

        sector:
          privateData.sector ||
          "",

        drawKey:
          privateData.drawKey ||
          "",

        day1:
          privateData.day1 ||
          {},

        day2:
          privateData.day2 ||
          {},

        note:
          privateData.note ||
          "",

        status:
          privateData.status ||
          "empty",

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp()
      };

      await db
        .collection(
          "mealPublicOrders"
        )
        .doc(id)
        .set(
          publicData,
          {
            merge: true
          }
        );

    } catch (e) {
      console.warn(
        "[Meals] public order mirror skipped:",
        e?.message || e
      );
    }
  }

  async function saveOrder(
    team,
    oldOrder = null
  ) {
    try {
      await waitMealContext();

      const {
        db,
        fb
      } = await waitReady();

      const {
        day1,
        day2,
        note
      } =
        readFields(
          "meal"
        );

      const zone =
        norm(
          team.drawZone ||
          team.zone
        ).toUpperCase();

      const sector =
        norm(
          team.drawSector ||
          team.sector
        ).replace(
          /^[ABC]/i,
          ""
        );

      const drawKey =
        teamDrawKey(
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

        zone,

        sector,

        drawKey,

        day1,

        day2,

        note,

        uid:
          currentUser.uid,

        status:
          totalOrder({
            day1,
            day2
          }) > 0
            ? "submitted"
            : "empty",

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp()
      };

      if (
        !oldOrder?.createdAt
      ) {
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
        .collection(
          "mealOrders"
        )
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

  async function openJudgesOrder() {
    try {
      await waitMealContext();
      await loadUserData();
      await loadMealGate();

      applyVisibility();

      if (!mealIsOpen) {
        return;
      }

      if (!canManageJudges) {
        setStatus(
          "Суддів може редагувати тільки адміністратор.",
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
        $("btnCloseMealPopup")
          .onclick =
          closePopup;
      }

      if (
        $("btnSaveJudgesMeal")
      ) {
        $("btnSaveJudgesMeal")
          .onclick =
          () =>
            saveJudgesOrder(
              old
            );
      }

    } catch (e) {
      console.error(e);

      setStatus(
        "Помилка харчування суддів: " +
        (e.message || e),
        false
      );
    }
  }

  async function saveJudgesOrder(
    oldOrder = null
  ) {
    try {
      await waitMealContext();
      await loadUserData();

      if (!canManageJudges) {
        throw new Error(
          "admin-only"
        );
      }

      const {
        db,
        fb
      } = await waitReady();

      const {
        day1,
        day2,
        note
      } =
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
          "СУДДІ",

        day1,

        day2,

        note,

        uid:
          currentUser.uid,

        status:
          totalOrder({
            day1,
            day2
          }) > 0
            ? "submitted"
            : "empty",

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp(),

        updatedBy:
          currentUser.uid
      };

      if (
        !oldOrder?.createdAt
      ) {
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
        .collection(
          "mealOrders"
        )
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
        "✅ Суддів додано до загального харчування.",
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

  function parseDraw(team) {
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
            m[1]
              .toUpperCase(),

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
          .collection(
            "stageResults"
          )
          .doc(id)
          .get();

      const data =
        snap.exists
          ? (snap.data() || {})
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
            parseDraw(
              team
            );

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

    } catch (e) {
      console.warn(
        "[Meals] draw map error:",
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

    const byId =
      drawMap?.byId ||
      new Map();

    const byName =
      drawMap?.byName ||
      new Map();

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
      byId.has(
        teamId
      )
    ) {
      draw =
        byId.get(
          teamId
        );
    }

    if (
      !draw &&
      teamName &&
      byName.has(
        teamName
      )
    ) {
      draw =
        byName.get(
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
    if (
      a?.type ===
        "judges" &&
      b?.type !==
        "judges"
    ) {
      return 1;
    }

    if (
      b?.type ===
        "judges" &&
      a?.type !==
        "judges"
    ) {
      return -1;
    }

    const zOrder = {
      A: 1,
      B: 2,
      C: 3
    };

    const za =
      zOrder[
        String(
          a.zone || ""
        ).toUpperCase()
      ] || 9;

    const zb =
      zOrder[
        String(
          b.zone || ""
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

    return String(
      a.teamName || ""
    ).localeCompare(
      String(
        b.teamName || ""
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
          .collection(
            "mealOrders"
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
          .get(),

        loadDrawMap()
      ]);

    const rows =
      [];

    snap.forEach(
      (doc) => {
        const d =
          doc.data() || {};

        if (
          d.status !==
          "submitted"
        ) {
          return;
        }

        if (
          totalOrder(d) <= 0
        ) {
          return;
        }

        rows.push(
          applyCurrentDraw(
            {
              id:
                doc.id,

              ...d
            },
            drawMap
          )
        );
      }
    );

    rows.sort(
      sortOrders
    );

    return rows;
  }

  function listHtml(rows) {
    if (!rows.length) {
      return `
        <div class="team-loading">
          Заявок на харчування ще немає.
        </div>
      `;
    }

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

          const isJudges =
            r.type ===
            "judges";

          const sector =
            isJudges
              ? "СУДДІ"
              : (
                  r.drawKey ||
                  (
                    (r.zone || "") +
                    (r.sector || "")
                  ) ||
                  "—"
                );

          const note =
            norm(
              r.note
            );

          return `
            <tr>

              <td
                class="m-sector"
                style="${
                  isJudges
                    ? "color:#facc15;font-weight:900;"
                    : ""
                }"
              >
                ${esc(sector)}
              </td>

              <td class="m-team">

                <div
                  style="${
                    isJudges
                      ? "color:#facc15;font-weight:900;"
                      : ""
                  }"
                >
                  ${esc(
                    r.teamName ||
                    "—"
                  )}
                </div>

                ${
                  note
                    ? `
                      <div
                        style="
                          margin-top:3px;
                          font-size:.78em;
                          color:#facc15;
                          white-space:normal;
                          line-height:1.25;
                        "
                      >
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
        $("mealPopupBody")
          .innerHTML =
          listHtml(
            rows
          );
      }

    } catch (e) {
      console.error(e);

      openPopup(
        "Помилка",
        `
          <div class="team-loading">
            ❌ ${esc(e.message || e)}
          </div>
        `
      );
    }
  }

  async function openMeals() {
    try {
      await waitMealContext();
      await loadUserData();

      if (!canManageMeals) {
        alert(
          "Ця кнопка доступна тільки відповідальному або адміністратору."
        );

        return;
      }

      await setMealGate(
        true
      );

      await loadMealGate();

      applyVisibility();

    } catch (e) {
      console.error(
        "[Meals] openMeals error:",
        e
      );

      alert(
        "Не вдалося відкрити харчування: " +
        (e.message || e)
      );
    }
  }

  async function deletePublicOrdersForCurrentStage() {
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

      let count =
        0;

      for (
        const doc of snap.docs
      ) {
        batch.delete(
          doc.ref
        );

        count++;

        if (
          count >= 400
        ) {
          await batch.commit();

          batch =
            db.batch();

          count =
            0;
        }
      }

      if (
        count > 0
      ) {
        await batch.commit();
      }

    } catch (e) {
      console.warn(
        "[Meals] public clear skipped:",
        e?.message || e
      );
    }
  }

  async function clearOrders() {
    try {
      await waitMealContext();
      await loadUserData();

      if (!canManageMeals) {
        setStatus(
          "Очищення недоступне.",
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
          .collection(
            "mealOrders"
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

      let count =
        0;

      let total =
        0;

      for (
        const doc of snap.docs
      ) {
        batch.delete(
          doc.ref
        );

        count++;
        total++;

        if (
          count >= 400
        ) {
          await batch.commit();

          batch =
            db.batch();

          count =
            0;
        }
      }

      if (
        count > 0
      ) {
        await batch.commit();
      }

      await deletePublicOrdersForCurrentStage();

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

  async function refreshAdminButtons() {
    try {
      await waitMealContext();
      await loadUserData();
      await loadMealGate();

      applyVisibility();

      if (
        $("btnMealGateOpen")
      ) {
        $("btnMealGateOpen")
          .onclick =
          openMeals;
      }

      if (
        $("btnOpenMealOrder")
      ) {
        $("btnOpenMealOrder")
          .onclick =
          openOrder;
      }

      if (
        $("btnOpenMealList")
      ) {
        $("btnOpenMealList")
          .onclick =
          openList;
      }

      if (
        $("btnClearMealOrders")
      ) {
        $("btnClearMealOrders")
          .onclick =
          clearOrders;
      }

      ensureJudgesButton();

    } catch (e) {
      console.warn(
        "[Meals] refresh error:",
        e
      );

      mealIsOpen =
        false;

      applyVisibility();
    }
  }

  function setContext(nextCtx) {
    ctx =
      nextCtx ||
      ctx;

    refreshAdminButtons();
  }

  document.addEventListener(
    "click",
    (e) => {
      if (
        e.target.id ===
        "mealPopupClose"
      ) {
        closePopup();
      }

      if (
        e.target.id ===
        "btnCloseMealPopup"
      ) {
        closePopup();
      }

      const popup =
        $("mealPopup");

      if (
        popup?.style.display ===
          "flex" &&
        e.target === popup
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
    refreshAdminButtons,
    loadMealGate,
    setMealGate,
    openMeals
  };

  if (ctx) {
    setContext(
      ctx
    );
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

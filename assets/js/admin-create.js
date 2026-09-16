// assets/js/admin-create.js
// STOLAR CARP • Create / Edit competitions
//
// КАНОНІЧНА ЛОГІКА:
//
// format: stalker-solo -> entryType: solo
// усі інші формати    -> entryType: team
//
// entryType записується:
// • competition.entryType
// • competition.engine.entryType
// • events[].entryType
//
// FINAL завжди team.
//
// ONE-OFF:
// • events = []
// • використовує поля самого competition
//
// Без зайвих дубльованих payment/date полів.

(function () {
  "use strict";

  // =========================================================
  // HELPERS
  // =========================================================

  const $ = id =>
    document.getElementById(id);

  const DRAFT_KEY =
    "sc_admin_create_draft_v2";

  const sleep = ms =>
    new Promise(resolve =>
      setTimeout(resolve, ms)
    );

  const esc = value =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const normalize = value =>
    String(value ?? "").trim();

  function setStatus(text) {
    const el = $("createStatus");
    if (el) el.textContent = text || "";
  }

  function setDebug(text) {
    const el = $("createDebug");
    if (el) el.textContent = text || "";
  }

  function setMsg(html) {
    const el = $("createMsg");
    if (el) el.innerHTML = html || "";
  }

  function show(el) {
    el?.classList.remove("hidden");
  }

  function hide(el) {
    el?.classList.add("hidden");
  }

  // =========================================================
  // FIREBASE
  // =========================================================

  let auth = null;
  let db = null;
  let fb = null;

  async function waitForFirebase() {
    for (let i = 0; i < 140; i++) {
      if (
        window.scAuth &&
        window.scDb &&
        window.firebase
      ) {
        auth = window.scAuth;
        db = window.scDb;
        fb = window.firebase;
        return;
      }

      await sleep(100);
    }

    throw new Error(
      "Firebase init не завантажився."
    );
  }

  // =========================================================
  // MODE
  // =========================================================

  const url =
    new URL(location.href);

  const isEditMode =
    normalize(
      url.searchParams.get("mode")
    ).toLowerCase() === "edit";

  let currentSavedCompId = "";

  // =========================================================
  // DOM
  // =========================================================

  const gate = $("createGate");
  const app = $("createApp");

  const tabCreate = $("tabCreate");
  const tabEdit = $("tabEdit");

  const editPicker = $("editPicker");
  const deleteWrap = $("deleteWrap");

  const inpType = $("inpType");
  const inpYear = $("inpYear");
  const inpName = $("inpName");
  const inpFormat = $("inpFormat");
  const inpLake = $("inpLake");

  const inpStartAt = $("inpStartAt");
  const inpFinishAt = $("inpFinishAt");

  const outDuration = $("outDuration");
  const outDurationHours = $("outDurationHours");
  const outDurationDays = $("outDurationDays");

  const seasonOnly = $("seasonOnly");
  const inpStagesCount = $("inpStagesCount");
  const inpHasFinal = $("inpHasFinal");

  const inpRegMode = $("inpRegMode");
  const inpRegOpen = $("inpRegOpen");
  const inpRegClose = $("inpRegClose");

  const inpPayEnabled = $("inpPayEnabled");
  const inpPrice = $("inpPrice");
  const inpCurrency = $("inpCurrency");
  const inpPayDetails = $("inpPayDetails");

  const regPreview = $("regPreview");

  const btnSave = $("btnSave");
  const btnMakeActive = $("btnMakeActive");
  const btnResetDraft = $("btnResetDraft");
  const btnDelete = $("btnDelete");

  const selCompetition = $("selCompetition");
  const btnReloadList = $("btnReloadList");
  const editPickerMsg = $("editPickerMsg");

  const formatFieldsEl = $("formatFields");

  // =========================================================
  // FORMAT REGISTRY
  // =========================================================

  let activeFormat = null;

  function getRegistry() {
    const sc =
      window.SC_FORMATS;

    if (!sc) return null;

    if (typeof sc.get === "function") {
      return sc;
    }

    if (
      sc.registry &&
      typeof sc.registry.get === "function"
    ) {
      return sc.registry;
    }

    return null;
  }

  function getPreset(name) {
    const registry =
      getRegistry();

    if (!registry) return null;

    try {
      return (
        registry.get(
          normalize(name).toLowerCase()
        ) || null
      );
    } catch {
      return null;
    }
  }

  function renderFormatFields(html = "") {
    if (formatFieldsEl) {
      formatFieldsEl.innerHTML = html;
    }
  }

  async function activateFormat(
    formatName,
    deserializeData = null
  ) {
    activeFormat =
      getPreset(formatName);

    renderFormatFields("");

    if (!activeFormat) {
      return;
    }

    if (
      typeof activeFormat.init ===
      "function"
    ) {
      await activeFormat.init({
        render: renderFormatFields,
        $,
        esc
      });
    }

    if (
      deserializeData &&
      typeof activeFormat.deserialize ===
        "function"
    ) {
      await activeFormat.deserialize(
        deserializeData,
        {
          render: renderFormatFields,
          $,
          esc
        }
      );
    }
  }

  // =========================================================
  // ENTRY TYPE
  // =========================================================

  function entryTypeFromFormat(format) {
    return (
      normalize(format)
        .toLowerCase() ===
      "stalker-solo"
    )
      ? "solo"
      : "team";
  }

  // =========================================================
  // DATE
  // =========================================================

  function parseDateTime(value) {
    const match =
      normalize(value).match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
      );

    if (!match) return null;

    const date =
      new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        0,
        0
      );

    return Number.isFinite(
      date.getTime()
    )
      ? date
      : null;
  }

  function pad2(value) {
    return String(value)
      .padStart(2, "0");
  }

  function dateOnly(date) {
    if (!date) return "";

    return (
      `${date.getFullYear()}-` +
      `${pad2(date.getMonth() + 1)}-` +
      `${pad2(date.getDate())}`
    );
  }

  function dateTimeLocal(date) {
    if (!date) return "";

    return (
      `${dateOnly(date)}T` +
      `${pad2(date.getHours())}:` +
      `${pad2(date.getMinutes())}`
    );
  }

  function timestampToDate(value) {
    if (!value) return null;

    try {
      if (value instanceof Date) {
        return value;
      }

      if (
        typeof value.toDate ===
        "function"
      ) {
        return value.toDate();
      }

      if (
        typeof value.seconds ===
        "number"
      ) {
        return new Date(
          value.seconds * 1000
        );
      }

      const date =
        new Date(value);

      return Number.isFinite(
        date.getTime()
      )
        ? date
        : null;
    } catch {
      return null;
    }
  }

  function addDays(dateString, days) {
    if (!dateString) return "";

    const [y, m, d] =
      dateString
        .split("-")
        .map(Number);

    const date =
      new Date(
        Date.UTC(
          y,
          m - 1,
          d,
          12
        )
      );

    date.setUTCDate(
      date.getUTCDate() + days
    );

    return (
      `${date.getUTCFullYear()}-` +
      `${pad2(date.getUTCMonth() + 1)}-` +
      `${pad2(date.getUTCDate())}`
    );
  }

  function registrationDates(
    form
  ) {
    if (
      form.regMode === "manual"
    ) {
      return {
        mode: "manual",
        openDate:
          form.regOpen,
        closeDate:
          form.regClose
      };
    }

    const start =
      dateOnly(form.startDt);

    return {
      mode: "auto",
      openDate:
        addDays(start, -28),
      closeDate:
        addDays(start, -14)
    };
  }

  function registrationStatus(reg) {
    const today =
      dateOnly(new Date());

    if (
      reg.openDate &&
      today < reg.openDate
    ) {
      return "pending";
    }

    if (
      reg.closeDate &&
      today > reg.closeDate
    ) {
      return "closed";
    }

    return "open";
  }

  // =========================================================
  // UI
  // =========================================================

  function setSeasonVisibility() {
    if (!seasonOnly) return;

    if (
      inpType?.value === "season"
    ) {
      show(seasonOnly);
    } else {
      hide(seasonOnly);
    }
  }

  function updateDurationUI() {
    const start =
      parseDateTime(
        inpStartAt?.value
      );

    const finish =
      parseDateTime(
        inpFinishAt?.value
      );

    if (!start || !finish) {
      if (outDuration) {
        outDuration.value = "—";
      }

      if (outDurationHours) {
        outDurationHours.value = "—";
      }

      if (outDurationDays) {
        outDurationDays.value = "—";
      }

      return;
    }

    const hours =
      (
        finish.getTime() -
        start.getTime()
      ) / 3600000;

    if (hours <= 0) {
      if (outDuration) {
        outDuration.value =
          "❌ Фініш після старту";
      }

      return;
    }

    if (outDuration) {
      outDuration.value =
        `${hours.toFixed(0)} год (${(
          hours / 24
        ).toFixed(2)} доби)`;
    }

    if (outDurationHours) {
      outDurationHours.value =
        hours.toFixed(2);
    }

    if (outDurationDays) {
      outDurationDays.value =
        (hours / 24).toFixed(2);
    }
  }

  function updateRegUI() {
    const mode =
      inpRegMode?.value ||
      "auto";

    if (inpRegOpen) {
      inpRegOpen.disabled =
        mode !== "manual";
    }

    if (inpRegClose) {
      inpRegClose.disabled =
        mode !== "manual";
    }

    if (!regPreview) return;

    const startDt =
      parseDateTime(
        inpStartAt?.value
      );

    const reg =
      mode === "manual"
        ? {
            mode,
            openDate:
              normalize(
                inpRegOpen?.value
              ),
            closeDate:
              normalize(
                inpRegClose?.value
              )
          }
        : {
            mode,
            openDate:
              startDt
                ? addDays(
                    dateOnly(startDt),
                    -28
                  )
                : "",
            closeDate:
              startDt
                ? addDays(
                    dateOnly(startDt),
                    -14
                  )
                : ""
          };

    if (
      !reg.openDate &&
      !reg.closeDate
    ) {
      regPreview.textContent =
        "Реєстрація: —";

      return;
    }

    const state =
      registrationStatus(reg);

    const label =
      state === "open"
        ? "✅ ВІДКРИТО"
        : state === "pending"
          ? "⏳ Очікується"
          : "❌ Закрито";

    regPreview.innerHTML =
      `Реєстрація: <b>${esc(
        reg.openDate || "—"
      )}</b> → <b>${esc(
        reg.closeDate || "—"
      )}</b> ${label}`;
  }

  // =========================================================
  // FORM
  // =========================================================

  function collectForm() {
    const format =
      normalize(
        inpFormat?.value ||
        "classic"
      ).toLowerCase();

    return {
      type:
        normalize(
          inpType?.value ||
          "season"
        ).toLowerCase(),

      year:
        normalize(
          inpYear?.value
        ),

      name:
        normalize(
          inpName?.value
        ),

      format,

      /*
       * ВАЖЛИВО:
       * тільки format визначає
       * entryType.
       */
      entryType:
        entryTypeFromFormat(
          format
        ),

      lakeId:
        normalize(
          inpLake?.value
        ),

      startDt:
        parseDateTime(
          inpStartAt?.value
        ),

      finishDt:
        parseDateTime(
          inpFinishAt?.value
        ),

      stagesCount:
        Number(
          inpStagesCount?.value ||
          3
        ),

      hasFinal:
        inpHasFinal?.value !==
        "no",

      regMode:
        normalize(
          inpRegMode?.value ||
          "auto"
        ).toLowerCase(),

      regOpen:
        normalize(
          inpRegOpen?.value
        ),

      regClose:
        normalize(
          inpRegClose?.value
        ),

      payEnabled:
        inpPayEnabled?.value !==
        "no",

      price:
        normalize(
          inpPrice?.value
        )
          ? Number(
              String(
                inpPrice.value
              ).replace(",", ".")
            )
          : null,

      currency:
        normalize(
          inpCurrency?.value ||
          "UAH"
        ).toUpperCase(),

      payDetails:
        normalize(
          inpPayDetails?.value
        )
    };
  }

  function validateForm(form) {
    if (
      !/^\d{4}$/.test(
        form.year
      )
    ) {
      throw new Error(
        "Вкажи рік."
      );
    }

    if (!form.name) {
      throw new Error(
        "Вкажи назву."
      );
    }

    if (!form.startDt) {
      throw new Error(
        "Вкажи старт."
      );
    }

    if (!form.finishDt) {
      throw new Error(
        "Вкажи фініш."
      );
    }

    if (
      form.finishDt <=
      form.startDt
    ) {
      throw new Error(
        "Фініш має бути після старту."
      );
    }

    if (
      form.payEnabled &&
      form.price !== null &&
      !Number.isFinite(form.price)
    ) {
      throw new Error(
        "Внесок має бути числом."
      );
    }

    if (
      form.regMode ===
        "manual" &&
      Boolean(form.regOpen) !==
        Boolean(form.regClose)
    ) {
      throw new Error(
        "Для manual заповни обидві дати."
      );
    }

    if (
      form.regOpen &&
      form.regClose &&
      form.regOpen >
        form.regClose
    ) {
      throw new Error(
        "Дата відкриття більша за дату закриття."
      );
    }
  }

  // =========================================================
  // DRAFT
  // =========================================================

  function saveDraft() {
    if (isEditMode) return;

    try {
      const form =
        collectForm();

      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          type:
            form.type,

          year:
            form.year,

          name:
            form.name,

          format:
            form.format,

          lakeId:
            form.lakeId,

          startAt:
            inpStartAt?.value ||
            "",

          finishAt:
            inpFinishAt?.value ||
            "",

          stagesCount:
            form.stagesCount,

          hasFinal:
            form.hasFinal,

          regMode:
            form.regMode,

          regOpen:
            form.regOpen,

          regClose:
            form.regClose,

          payEnabled:
            form.payEnabled,

          price:
            form.price,

          currency:
            form.currency,

          payDetails:
            form.payDetails
        })
      );
    } catch {}
  }

  function loadDraft() {
    try {
      return JSON.parse(
        localStorage.getItem(
          DRAFT_KEY
        ) || "null"
      );
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(
        DRAFT_KEY
      );
    } catch {}
  }

  function applyForm(data) {
    if (!data) return;

    if (inpType) {
      inpType.value =
        data.type || "season";
    }

    if (inpYear) {
      inpYear.value =
        data.year || "";
    }

    if (inpName) {
      inpName.value =
        data.name || "";
    }

    if (inpFormat) {
      inpFormat.value =
        data.format || "classic";
    }

    if (inpLake) {
      inpLake.value =
        data.lakeId || "";
    }

    if (inpStartAt) {
      inpStartAt.value =
        data.startAt || "";
    }

    if (inpFinishAt) {
      inpFinishAt.value =
        data.finishAt || "";
    }

    if (inpStagesCount) {
      inpStagesCount.value =
        String(
          data.stagesCount || 3
        );
    }

    if (inpHasFinal) {
      inpHasFinal.value =
        data.hasFinal === false
          ? "no"
          : "yes";
    }

    if (inpRegMode) {
      inpRegMode.value =
        data.regMode || "auto";
    }

    if (inpRegOpen) {
      inpRegOpen.value =
        data.regOpen || "";
    }

    if (inpRegClose) {
      inpRegClose.value =
        data.regClose || "";
    }

    if (inpPayEnabled) {
      inpPayEnabled.value =
        data.payEnabled === false
          ? "no"
          : "yes";
    }

    if (inpPrice) {
      inpPrice.value =
        data.price === null ||
        data.price === undefined
          ? ""
          : String(data.price);
    }

    if (inpCurrency) {
      inpCurrency.value =
        data.currency || "UAH";
    }

    if (inpPayDetails) {
      inpPayDetails.value =
        data.payDetails || "";
    }
  }

  // =========================================================
  // CACHE
  // =========================================================

  function clearCompetitionCaches() {
    try {
      Object.keys(localStorage)
        .filter(key =>
          key.startsWith(
            "sc_competitions_cache_"
          )
        )
        .forEach(key =>
          localStorage.removeItem(key)
        );
    } catch {}
  }

  // =========================================================
  // IDS
  // =========================================================

  function slugify(value) {
    return normalize(value)
      .toLowerCase()
      .replace(
        /[^a-z0-9а-яіїєґ]+/gi,
        "-"
      )
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }

  function makeCompetitionId(
    form
  ) {
    return (
      `${form.type}-` +
      `${form.year}-` +
      `${slugify(form.name) || "event"}-` +
      Math.random()
        .toString(36)
        .slice(2, 6)
    );
  }

  // =========================================================
  // ADMIN
  // =========================================================

  async function isAdminUser(user) {
    if (!user) return false;

    try {
      const snap =
        await db
          .collection("users")
          .doc(user.uid)
          .get();

      return (
        normalize(
          snap.data()?.role
        ).toLowerCase() ===
        "admin"
      );
    } catch {
      return false;
    }
  }

  // =========================================================
  // LAKES
  // =========================================================

  async function loadLakes() {
    if (!inpLake) return;

    const snap =
      await db
        .collection("lakes")
        .get();

    const lakes =
      snap.docs
        .map(doc => ({
          id: doc.id,
          name:
            doc.data()?.name ||
            doc.id
        }))
        .sort((a, b) =>
          a.name.localeCompare(
            b.name,
            "uk"
          )
        );

    inpLake.innerHTML =
      '<option value="">— вибери водойму —</option>' +
      lakes
        .map(
          lake =>
            `<option value="${esc(
              lake.id
            )}">${esc(
              lake.name
            )}</option>`
        )
        .join("");
  }

  async function getLake(lakeId) {
    if (!lakeId) {
      return {
        id: "",
        name: ""
      };
    }

    try {
      const snap =
        await db
          .collection("lakes")
          .doc(lakeId)
          .get();

      return {
        id:
          lakeId,

        name:
          snap.exists
            ? (
                snap.data()?.name ||
                lakeId
              )
            : lakeId
      };
    } catch {
      return {
        id:
          lakeId,
        name:
          lakeId
      };
    }
  }

  // =========================================================
  // EVENTS
  // =========================================================

  function makeEvent({
    key,
    title,
    order,
    entryType,
    form,
    reg,
    payment,
    isFinal = false
  }) {
    return {
      key,
      stageId:
        key,

      order,

      title,

      isFinal,

      /*
       * Фінал завжди TEAM.
       */
      entryType:
        isFinal
          ? "team"
          : entryType,

      format:
        form.format,

      startAt:
        fb.firestore.Timestamp
          .fromDate(
            form.startDt
          ),

      finishAt:
        fb.firestore.Timestamp
          .fromDate(
            form.finishDt
          ),

      registration: {
        ...reg
      },

      payment: {
        ...payment
      },

      status:
        registrationStatus(reg),

      isOpen:
        registrationStatus(reg) ===
        "open"
    };
  }

  function buildEvents(
    form,
    reg,
    payment
  ) {
    if (
      form.type !== "season"
    ) {
      return [];
    }

    const result = [];

    const count =
      Math.max(
        1,
        Number(
          form.stagesCount || 1
        )
      );

    for (
      let i = 1;
      i <= count;
      i++
    ) {
      result.push(
        makeEvent({
          key:
            `stage-${i}`,

          title:
            `Етап ${i}`,

          order:
            i,

          entryType:
            form.entryType,

          form,
          reg,
          payment
        })
      );
    }

    if (form.hasFinal) {
      result.push(
        makeEvent({
          key:
            "final",

          title:
            "Фінал",

          order:
            count + 1,

          entryType:
            "team",

          form,
          reg,
          payment,

          isFinal:
            true
        })
      );
    }

    return result;
  }

  // =========================================================
  // SAVE
  // =========================================================

  async function saveCompetition(
    editingId = ""
  ) {
    const form =
      collectForm();

    validateForm(form);

    /*
     * ЩЕ РАЗ ВИЗНАЧАЄМО ПЕРЕД SAVE.
     *
     * Не довіряємо draft,
     * старому document чи plugin.
     */
    const entryType =
      entryTypeFromFormat(
        form.format
      );

    let formatExtra = {};

    if (
      activeFormat &&
      typeof activeFormat.validate ===
        "function"
    ) {
      await activeFormat.validate({
        $,
        format:
          form.format
      });
    }

    if (
      activeFormat &&
      typeof activeFormat.serialize ===
        "function"
    ) {
      formatExtra =
        (
          await activeFormat.serialize({
            $,
            format:
              form.format
          })
        ) || {};
    }

    const compId =
      editingId ||
      currentSavedCompId ||
      makeCompetitionId(form);

    const ref =
      db
        .collection("competitions")
        .doc(compId);

    const oldSnap =
      await ref.get();

    const lake =
      await getLake(
        form.lakeId
      );

    const reg =
      registrationDates(form);

    const payment = {
      enabled:
        Boolean(
          form.payEnabled
        ),

      price:
        form.price,

      currency:
        form.currency ||
        "UAH",

      details:
        form.payDetails ||
        ""
    };

    const status =
      registrationStatus(reg);

    const durationHours =
      (
        form.finishDt.getTime() -
        form.startDt.getTime()
      ) / 3600000;

    /*
     * КРИТИЧНО:
     *
     * formatExtra йде ПЕРШИМ.
     *
     * baseFormat та entryType
     * записуємо ПІСЛЯ нього,
     * щоб plugin їх не затер.
     */
    const engine = {
      ...formatExtra,

      baseFormat:
        form.format,

      entryType
    };

    const data = {
      compId,

      type:
        form.type,

      year:
        Number(form.year),

      name:
        form.name,

      title:
        form.name,

      brand:
        "STOLAR CARP",

      format:
        form.format,

      /*
       * ОСНОВНЕ ПОЛЕ.
       */
      entryType,

      engine,

      lake,

      lakeId:
        lake.id,

      startAt:
        fb.firestore.Timestamp
          .fromDate(
            form.startDt
          ),

      finishAt:
        fb.firestore.Timestamp
          .fromDate(
            form.finishDt
          ),

      schedule: {
        startAt:
          fb.firestore.Timestamp
            .fromDate(
              form.startDt
            ),

        finishAt:
          fb.firestore.Timestamp
            .fromDate(
              form.finishDt
            ),

        durationHours:
          Number(
            durationHours.toFixed(2)
          )
      },

      stagesCount:
        form.type === "season"
          ? Math.max(
              1,
              Number(
                form.stagesCount
              )
            )
          : 1,

      hasFinal:
        form.type === "season"
          ? Boolean(
              form.hasFinal
            )
          : false,

      registration: {
        ...reg
      },

      /*
       * Залишаємо тільки потрібні
       * legacy-поля.
       */
      regMode:
        reg.mode,

      regOpen:
        reg.openDate,

      regClose:
        reg.closeDate,

      payment,

      payEnabled:
        payment.enabled,

      price:
        payment.price,

      currency:
        payment.currency,

      payDetails:
        payment.details,

      status,

      registrationStatus:
        status,

      isOpen:
        status === "open",

      events:
        buildEvents(
          {
            ...form,
            entryType
          },
          reg,
          payment
        ),

      updatedAt:
        fb.firestore
          .FieldValue
          .serverTimestamp()
    };

    if (!oldSnap.exists) {
      data.createdAt =
        fb.firestore
          .FieldValue
          .serverTimestamp();
    }

    /*
     * Для EDIT merge лишаємо,
     * щоб не стерти специфічні
     * дані формату.
     *
     * Але entryType / engine
     * все одно перепишуться правильно.
     */
    await ref.set(
      data,
      {
        merge: true
      }
    );

    currentSavedCompId =
      compId;

    clearCompetitionCaches();

    return compId;
  }

  // =========================================================
  // LOAD COMPETITION
  // =========================================================

  async function loadCompetition(
    compId
  ) {
    if (!compId) return;

    const snap =
      await db
        .collection("competitions")
        .doc(compId)
        .get();

    if (!snap.exists) {
      throw new Error(
        "Змагання не знайдено."
      );
    }

    const data =
      snap.data() || {};

    const start =
      timestampToDate(
        data.startAt ||
        data.schedule?.startAt
      );

    const finish =
      timestampToDate(
        data.finishAt ||
        data.schedule?.finishAt
      );

    const reg =
      data.registration || {};

    const payment =
      data.payment || {};

    applyForm({
      type:
        data.type || "season",

      year:
        String(
          data.year || ""
        ),

      name:
        data.name ||
        data.title ||
        "",

      format:
        data.format ||
        data.engine?.baseFormat ||
        "classic",

      lakeId:
        data.lakeId ||
        data.lake?.id ||
        "",

      startAt:
        dateTimeLocal(start),

      finishAt:
        dateTimeLocal(finish),

      stagesCount:
        data.stagesCount ||
        3,

      hasFinal:
        data.hasFinal === true,

      regMode:
        reg.mode ||
        data.regMode ||
        "auto",

      regOpen:
        reg.openDate ||
        data.regOpen ||
        "",

      regClose:
        reg.closeDate ||
        data.regClose ||
        "",

      payEnabled:
        (
          payment.enabled ??
          data.payEnabled
        ) !== false,

      price:
        payment.price ??
        data.price ??
        null,

      currency:
        payment.currency ||
        data.currency ||
        "UAH",

      payDetails:
        payment.details ||
        data.payDetails ||
        ""
    });

    await activateFormat(
      data.format ||
      data.engine?.baseFormat ||
      "classic",
      data.engine || {}
    );

    currentSavedCompId =
      compId;

    setSeasonVisibility();
    updateDurationUI();
    updateRegUI();

    setStatus(
      "Завантажено ✅"
    );
  }

  // =========================================================
  // COMPETITION LIST
  // =========================================================

  async function loadCompetitionsList() {
    if (!selCompetition) return;

    selCompetition.innerHTML =
      '<option value="">Завантаження…</option>';

    const snap =
      await db
        .collection("competitions")
        .get();

    const items =
      snap.docs
        .map(doc => {
          const data =
            doc.data() || {};

          return {
            id:
              doc.id,

            year:
              Number(
                data.year || 0
              ),

            name:
              data.name ||
              data.title ||
              doc.id
          };
        })
        .sort(
          (a, b) =>
            b.year - a.year ||
            a.name.localeCompare(
              b.name,
              "uk"
            )
        );

    selCompetition.innerHTML =
      '<option value="">— вибери —</option>' +
      items
        .map(
          item =>
            `<option value="${esc(
              item.id
            )}">${esc(
              `${item.id} — ${item.name}`
            )}</option>`
        )
        .join("");
  }

  // =========================================================
  // ACTIVE
  // =========================================================

  async function makeActive(
    compId
  ) {
    if (!compId) {
      throw new Error(
        "Спочатку збережи змагання."
      );
    }

    await db
      .collection("settings")
      .doc("app")
      .set(
        {
          activeCompetitionId:
            compId,

          updatedAt:
            fb.firestore
              .FieldValue
              .serverTimestamp()
        },
        {
          merge: true
        }
      );

    clearCompetitionCaches();
  }

  // =========================================================
  // DELETE
  // =========================================================

  function belongsToCompetition(
    doc,
    compId
  ) {
    const data =
      doc.data() || {};

    return (
      doc.id === compId ||
      doc.id.startsWith(
        `${compId}__`
      ) ||
      doc.id.startsWith(
        `${compId}||`
      ) ||
      normalize(
        data.competitionId
      ) === compId ||
      normalize(
        data.compId
      ) === compId
    );
  }

  async function deleteRefs(refs) {
    for (
      let i = 0;
      i < refs.length;
      i += 400
    ) {
      const batch =
        db.batch();

      refs
        .slice(i, i + 400)
        .forEach(ref =>
          batch.delete(ref)
        );

      await batch.commit();
    }

    return refs.length;
  }

  async function cleanupCollection(
    name,
    compId
  ) {
    const snap =
      await db
        .collection(name)
        .get();

    return deleteRefs(
      snap.docs
        .filter(doc =>
          belongsToCompetition(
            doc,
            compId
          )
        )
        .map(doc => doc.ref)
    );
  }

  async function deleteStageResults(
    compId
  ) {
    const snap =
      await db
        .collection("stageResults")
        .get();

    const docs =
      snap.docs.filter(doc =>
        belongsToCompetition(
          doc,
          compId
        )
      );

    let deleted = 0;

    for (const doc of docs) {
      const teams =
        await doc.ref
          .collection("teams")
          .get();

      deleted +=
        await deleteRefs(
          teams.docs.map(
            item => item.ref
          )
        );
    }

    deleted +=
      await deleteRefs(
        docs.map(doc => doc.ref)
      );

    return deleted;
  }

  async function deleteCompetition(
    compId
  ) {
    const ref =
      db
        .collection("competitions")
        .doc(compId);

    const snap =
      await ref.get();

    if (!snap.exists) {
      throw new Error(
        "Змагання не знайдено."
      );
    }

    const competition =
      snap.data() || {};

    const oneoff =
      competition.type ===
        "oneoff" ||
      compId.startsWith(
        "oneoff-"
      );

    const typed =
      prompt(
        oneoff
          ? (
              `ONE-OFF буде видалено повністю:\n\n` +
              `${compId}\n\n` +
              `Введи DELETE`
            )
          : (
              `Видалити:\n${compId}\n\n` +
              `Введи DELETE`
            )
      );

    if (
      normalize(typed)
        .toUpperCase() !==
      "DELETE"
    ) {
      throw new Error(
        "Видалення скасовано."
      );
    }

    let deleted = 0;

    if (oneoff) {
      for (
        const collectionName of [
          "registrations",
          "registrations_deleted",
          "public_participants",
          "weighings",
          "judgeTokens",
          "mealOrders",
          "mealSettings"
        ]
      ) {
        deleted +=
          await cleanupCollection(
            collectionName,
            compId
          );
      }

      deleted +=
        await deleteStageResults(
          compId
        );
    }

    await ref.delete();

    deleted++;

    const settingsRef =
      db
        .collection("settings")
        .doc("app");

    const settingsSnap =
      await settingsRef.get();

    if (
      settingsSnap.data()
        ?.activeCompetitionId ===
      compId
    ) {
      await settingsRef.set(
        {
          activeCompetitionId:
            "",

          updatedAt:
            fb.firestore
              .FieldValue
              .serverTimestamp()
        },
        {
          merge: true
        }
      );
    }

    clearCompetitionCaches();

    return deleted;
  }

  // =========================================================
  // TABS
  // =========================================================

  function gotoMode(edit) {
    const next =
      new URL(location.href);

    if (edit) {
      next.searchParams.set(
        "mode",
        "edit"
      );
    } else {
      next.searchParams.delete(
        "mode"
      );
      next.searchParams.delete(
        "compId"
      );
    }

    location.href =
      next.toString();
  }

  function setModeUI() {
    tabCreate?.classList.toggle(
      "pill--active",
      !isEditMode
    );

    tabEdit?.classList.toggle(
      "pill--active",
      isEditMode
    );

    if (isEditMode) {
      show(editPicker);
      show(deleteWrap);
    } else {
      hide(editPicker);
      hide(deleteWrap);
    }
  }

  // =========================================================
  // RESET
  // =========================================================

  async function resetForm() {
    clearDraft();

    currentSavedCompId = "";

    if (inpType) {
      inpType.value =
        "season";
    }

    if (inpYear) {
      inpYear.value = "";
    }

    if (inpName) {
      inpName.value = "";
    }

    if (inpFormat) {
      inpFormat.value =
        "classic";
    }

    if (inpLake) {
      inpLake.value = "";
    }

    if (inpStartAt) {
      inpStartAt.value = "";
    }

    if (inpFinishAt) {
      inpFinishAt.value = "";
    }

    if (inpStagesCount) {
      inpStagesCount.value =
        "3";
    }

    if (inpHasFinal) {
      inpHasFinal.value =
        "yes";
    }

    if (inpRegMode) {
      inpRegMode.value =
        "auto";
    }

    if (inpRegOpen) {
      inpRegOpen.value = "";
    }

    if (inpRegClose) {
      inpRegClose.value = "";
    }

    if (inpPayEnabled) {
      inpPayEnabled.value =
        "yes";
    }

    if (inpPrice) {
      inpPrice.value = "";
    }

    if (inpCurrency) {
      inpCurrency.value =
        "UAH";
    }

    if (inpPayDetails) {
      inpPayDetails.value = "";
    }

    await activateFormat(
      "classic"
    );

    setSeasonVisibility();
    updateDurationUI();
    updateRegUI();

    setMsg(
      '<span class="ok">✅ Чернетку скинуто</span>'
    );
  }

  // =========================================================
  // EVENTS
  // =========================================================

  function bindUI() {
    if (tabCreate) {
      tabCreate.onclick =
        () => gotoMode(false);
    }

    if (tabEdit) {
      tabEdit.onclick =
        () => gotoMode(true);
    }

    inpType?.addEventListener(
      "change",
      () => {
        setSeasonVisibility();
        saveDraft();
      }
    );

    inpFormat?.addEventListener(
      "change",
      async () => {
        await activateFormat(
          inpFormat.value
        );

        saveDraft();
      }
    );

    [
      inpYear,
      inpName,
      inpLake,
      inpStartAt,
      inpFinishAt,
      inpStagesCount,
      inpHasFinal,
      inpRegMode,
      inpRegOpen,
      inpRegClose,
      inpPayEnabled,
      inpPrice,
      inpCurrency,
      inpPayDetails
    ]
      .filter(Boolean)
      .forEach(el => {
        const handler = () => {
          updateDurationUI();
          updateRegUI();
          saveDraft();
        };

        el.addEventListener(
          "change",
          handler
        );

        el.addEventListener(
          "input",
          handler
        );
      });

    if (btnResetDraft) {
      btnResetDraft.onclick =
        resetForm;
    }

    if (btnReloadList) {
      btnReloadList.onclick =
        loadCompetitionsList;
    }

    if (selCompetition) {
      selCompetition.onchange =
        async () => {
          if (
            selCompetition.value
          ) {
            await loadCompetition(
              selCompetition.value
            );
          }
        };
    }

    if (btnSave) {
      btnSave.onclick =
        async () => {
          try {
            setStatus(
              "Збереження…"
            );

            setMsg(
              '<span class="muted">Збереження…</span>'
            );

            const editingId =
              isEditMode
                ? (
                    selCompetition
                      ?.value || ""
                  )
                : "";

            const id =
              await saveCompetition(
                editingId
              );

            setStatus(
              "Збережено ✅"
            );

            setMsg(
              `<span class="ok">✅ Збережено:</span> ${esc(
                id
              )}`
            );

            setDebug("");

          } catch (error) {
            setStatus(
              "Помилка ❌"
            );

            setMsg(
              `<span class="err">❌ ${esc(
                error.message
              )}</span>`
            );

            setDebug(
              error.message
            );
          }
        };
    }

    if (btnMakeActive) {
      btnMakeActive.onclick =
        async () => {
          try {
            let id =
              isEditMode
                ? (
                    selCompetition
                      ?.value || ""
                  )
                : currentSavedCompId;

            if (!id) {
              id =
                await saveCompetition();

              currentSavedCompId =
                id;
            }

            await makeActive(id);

            setMsg(
              `<span class="ok">✅ Активне:</span> ${esc(
                id
              )}`
            );

          } catch (error) {
            setMsg(
              `<span class="err">❌ ${esc(
                error.message
              )}</span>`
            );
          }
        };
    }

    if (btnDelete) {
      btnDelete.onclick =
        async () => {
          try {
            const id =
              selCompetition?.value;

            if (!id) {
              throw new Error(
                "Вибери змагання."
              );
            }

            setStatus(
              "Видалення…"
            );

            const count =
              await deleteCompetition(
                id
              );

            await loadCompetitionsList();

            setStatus(
              "Видалено ✅"
            );

            setMsg(
              `<span class="ok">✅ Видалено.</span> Документів: ${count}`
            );

          } catch (error) {
            setStatus(
              "Помилка ❌"
            );

            setMsg(
              `<span class="err">❌ ${esc(
                error.message
              )}</span>`
            );
          }
        };
    }
  }

  // =========================================================
  // INIT
  // =========================================================

  async function init() {
    try {
      await waitForFirebase();

      bindUI();

      auth.onAuthStateChanged(
        async user => {
          if (
            !user ||
            !await isAdminUser(user)
          ) {
            show(gate);
            hide(app);

            setStatus(
              user
                ? "Доступ заборонено ❌"
                : "Нема сесії"
            );

            return;
          }

          hide(gate);
          show(app);

          setModeUI();

          await loadLakes();

          if (isEditMode) {
            await loadCompetitionsList();

            const compId =
              url.searchParams.get(
                "compId"
              );

            if (
              compId &&
              selCompetition
            ) {
              selCompetition.value =
                compId;

              await loadCompetition(
                compId
              );
            }

          } else {
            const draft =
              loadDraft();

            if (draft) {
              applyForm(draft);

              await activateFormat(
                draft.format ||
                "classic"
              );

              setStatus(
                "Чернетку відновлено ✅"
              );

            } else {
              await activateFormat(
                inpFormat?.value ||
                "classic"
              );

              setStatus(
                "Створення"
              );
            }
          }

          setSeasonVisibility();
          updateDurationUI();
          updateRegUI();
        }
      );

    } catch (error) {
      show(gate);
      hide(app);

      setStatus(
        "Firebase ❌"
      );

      setDebug(
        error.message
      );
    }
  }

  init();

})();

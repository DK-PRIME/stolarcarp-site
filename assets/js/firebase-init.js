// assets/js/register_firebase.js
// STOLAR CARP • Registration
//
// TEAM:
// • потрібна команда
// • одна заявка на teamId
// • displayName = teamName
//
// SOLO:
// • користувач теж повинен бути учасником команди
// • заявка окрема на UID
// • teamId/teamName зберігаються як прив'язка
// • displayName = Ім'я Прізвище
//
// FINAL:
// • тільки TEAM
// • перевірка через finalQualifications/{year}/teams/{teamId}

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let auth = null;
  let db = null;
  let fb = null;

  let user = null;
  let profile = null;
  let items = [];

  const finalAccess = new Map();

  const form = $("regForm");
  const eventOptions = $("eventOptions");
  const msg = $("msg");
  const submitBtn = $("submitBtn");
  const spinner = $("spinner");
  const rules = $("rules");
  const hp = $("hp");

  const profileSummary = $("profileSummary");

  const payAmount = $("payAmount");
  const payCurrency = $("payCurrency");
  const payDetails = $("payDetails");
  const cardNum = $("cardNum");
  const copyCard = $("copyCard");

  let copyPaymentText = "";

  // =========================================================
  // HELPERS
  // =========================================================

  function text(v) {
    return String(v ?? "").trim();
  }

  function lower(v) {
    return text(v).toLowerCase();
  }

  function first(...values) {
    return values.find(
      v => v !== undefined && v !== null && v !== ""
    ) ?? null;
  }

  function esc(v) {
    return text(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function number(v) {
    if (v === 0) return 0;
    if (v === null || v === undefined || v === "") return null;

    const n = Number(
      String(v)
        .replace(",", ".")
        .trim()
    );

    return Number.isFinite(n) ? n : null;
  }

  function bool(v) {
    if (v === true || v === 1 || v === "1") return true;

    return [
      "true",
      "yes",
      "on"
    ].includes(lower(v));
  }

  function setMsg(value, ok = true) {
    if (!msg) return;

    msg.textContent = value || "";
    msg.classList.remove("ok", "err");

    if (value) {
      msg.classList.add(ok ? "ok" : "err");
    }
  }

  function setLoading(on) {
    if (spinner) {
      spinner.classList.toggle(
        "spinner--on",
        Boolean(on)
      );
    }

    refreshSubmit();
  }

  function dateFrom(value, endOfDay = false) {
    if (!value) return null;

    if (value instanceof Date) {
      return value;
    }

    if (typeof value?.toDate === "function") {
      return value.toDate();
    }

    if (typeof value?.seconds === "number") {
      return new Date(value.seconds * 1000);
    }

    if (typeof value === "string") {
      const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

      if (match) {
        return new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          endOfDay ? 23 : 0,
          endOfDay ? 59 : 0,
          endOfDay ? 59 : 0,
          endOfDay ? 999 : 0
        );
      }
    }

    const d = new Date(value);

    return Number.isFinite(d.getTime())
      ? d
      : null;
  }

  function fmtDate(value) {
    const d = dateFrom(value);

    return d
      ? d.toLocaleDateString("uk-UA")
      : "—";
  }

  // =========================================================
  // FIREBASE
  // =========================================================

  async function waitFirebase() {
    for (let i = 0; i < 150; i++) {
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
      "Firebase не вдалося запустити."
    );
  }

  // =========================================================
  // COMPETITION HELPERS
  // =========================================================

  function isFinal(eventKey, event) {
    const value = lower(
      `${eventKey || ""} ` +
      `${event?.key || ""} ` +
      `${event?.stageId || ""} ` +
      `${event?.title || ""} ` +
      `${event?.name || ""}`
    );

    return (
      event?.isFinal === true ||
      value.includes("final") ||
      value.includes("фінал")
    );
  }

  function getEntryType(event, competition, final) {
    if (final) {
      return "team";
    }

    const explicit = lower(
      first(
        event?.entryType,
        competition?.entryType
      )
    );

    if (
      explicit === "team" ||
      explicit === "solo"
    ) {
      return explicit;
    }

    const format = lower(
      first(
        event?.format,
        competition?.format,
        competition?.engine?.baseFormat
      )
    );

    return format === "stalker-solo"
      ? "solo"
      : "team";
  }

  function getPayment(event, competition) {
    const ep = event?.payment || {};
    const cp = competition?.payment || {};

    const price = number(
      first(
        ep.price,
        event?.price,
        event?.fee,
        event?.entryFee,
        cp.price,
        competition?.price,
        competition?.fee,
        competition?.entryFee
      )
    );

    const details = text(
      first(
        ep.details,
        event?.payDetails,
        event?.paymentDetails,
        event?.requisites,
        cp.details,
        competition?.payDetails,
        competition?.paymentDetails,
        competition?.requisites
      )
    );

    const enabled =
      bool(
        first(
          ep.enabled,
          event?.payEnabled,
          event?.paymentEnabled,
          cp.enabled,
          competition?.payEnabled,
          competition?.paymentEnabled
        )
      ) ||
      (
        price !== null &&
        price > 0
      ) ||
      Boolean(details);

    return {
      enabled,
      price,
      currency: text(
        first(
          ep.currency,
          event?.currency,
          cp.currency,
          competition?.currency,
          "UAH"
        )
      ).toUpperCase(),
      details
    };
  }

  function buildItem(
    competition,
    compId,
    event = null,
    index = 0
  ) {
    const ev = event || {};

    const stageKey = event
      ? text(
          ev.key ||
          ev.stageId ||
          ev.id ||
          `stage-${index + 1}`
        )
      : "";

    const final = event
      ? isFinal(stageKey, ev)
      : false;

    const schedule =
      ev.schedule || {};

    const compSchedule =
      competition.schedule || {};

    const registration =
      ev.registration || {};

    const compRegistration =
      competition.registration || {};

    const payment =
      getPayment(
        ev,
        competition
      );

    return {
      compId,

      year: text(
        first(
          ev.year,
          ev.seasonYear,
          competition.year,
          competition.seasonYear
        )
      ),

      brand:
        competition.brand ||
        "STOLAR CARP",

      title:
        competition.name ||
        competition.title ||
        compId,

      stageKey,

      stageTitle:
        event
          ? (
              ev.title ||
              ev.name ||
              (
                final
                  ? "Фінал"
                  : `Етап ${index + 1}`
              )
            )
          : "",

      isFinal:
        final,

      entryType:
        getEntryType(
          ev,
          competition,
          final
        ),

      startAt:
        dateFrom(
          first(
            ev.startAt,
            ev.startDate,
            schedule.startAt,
            competition.startAt,
            competition.startDate,
            compSchedule.startAt
          )
        ),

      finishAt:
        dateFrom(
          first(
            ev.finishAt,
            ev.finishDate,
            schedule.finishAt,
            competition.finishAt,
            competition.finishDate,
            compSchedule.finishAt
          )
        ),

      regOpen:
        first(
          ev.regOpen,
          ev.registrationOpenDate,
          registration.openDate,
          competition.regOpen,
          competition.registrationOpenDate,
          compRegistration.openDate
        ),

      regClose:
        first(
          ev.regClose,
          ev.registrationCloseDate,
          registration.closeDate,
          competition.regClose,
          competition.registrationCloseDate,
          compRegistration.closeDate
        ),

      regMode:
        lower(
          first(
            registration.mode,
            ev.regMode,
            compRegistration.mode,
            competition.regMode,
            "auto"
          )
        ),

      manualOpen:
        bool(
          first(
            registration.manualOpen,
            ev.manualOpen,
            compRegistration.manualOpen,
            competition.manualOpen
          )
        ),

      payEnabled:
        payment.enabled,

      price:
        payment.price,

      currency:
        payment.currency,

      payDetails:
        payment.details
    };
  }

  function registrationState(item) {
    const now = new Date();

    if (
      item.finishAt &&
      now.getTime() >
        item.finishAt.getTime() +
        86400000
    ) {
      return "closed";
    }

    const open =
      dateFrom(
        item.regOpen,
        false
      );

    const close =
      dateFrom(
        item.regClose,
        true
      );

    if (open && now < open) {
      return "pending";
    }

    if (close && now > close) {
      return "closed";
    }

    if (open || close) {
      return "open";
    }

    if (
      item.regMode === "manual" &&
      item.manualOpen
    ) {
      return "open";
    }

    return "unavailable";
  }

  function visible(item) {
    if (!item.finishAt) return true;

    return (
      Date.now() <=
      item.finishAt.getTime() +
        86400000
    );
  }

  function valueOf(item) {
    return (
      `${item.compId}||` +
      `${item.stageKey || ""}`
    );
  }

  function seasonYear(item) {
    if (/^\d{4}$/.test(item.year)) {
      return item.year;
    }

    const match =
      `${item.compId} ${item.title}`
        .match(/\b20\d{2}\b/);

    return match
      ? match[0]
      : "";
  }

  function registrationId(
    competitionId,
    stageId,
    entryType
  ) {
    const stage =
      stageId || "main";

    if (entryType === "solo") {
      return (
        `${competitionId}__` +
        `${stage}__solo__` +
        `${profile.uid}`
      );
    }

    return (
      `${competitionId}__` +
      `${stage}__team__` +
      `${profile.teamId}`
    );
  }

  // =========================================================
  // PROFILE
  // =========================================================

  async function loadProfile(currentUser) {
    const snap =
      await db
        .collection("users")
        .doc(currentUser.uid)
        .get();

    if (!snap.exists) {
      throw new Error(
        "Профіль користувача не знайдено."
      );
    }

    const data =
      snap.data() || {};

    const teamId =
      text(data.teamId);

    let teamName = "";

    if (teamId) {
      const teamSnap =
        await db
          .collection("teams")
          .doc(teamId)
          .get();

      if (teamSnap.exists) {
        teamName = text(
          (
            teamSnap.data() ||
            {}
          ).name
        );
      }
    }

    profile = {
      uid:
        currentUser.uid,

      email:
        currentUser.email || "",

      fullName:
        text(
          data.fullName ||
          data.name ||
          ""
        ),

      phone:
        text(data.phone),

      teamId:
        teamId || null,

      teamName
    };
  }

  function participantName() {
    return text(
      profile?.fullName ||
      profile?.email
    );
  }

  function profileReady() {
    return Boolean(
      profile?.teamId &&
      profile?.teamName
    );
  }

  function renderProfile(item = null) {
    if (
      !profileSummary ||
      !profile
    ) {
      return;
    }

    const name =
      participantName();

    if (
      item?.entryType === "solo" &&
      !item.isFinal
    ) {
      profileSummary.innerHTML =
        `Учасник: <b>${esc(name || "—")}</b><br>` +
        `Телефон: <b>${esc(profile.phone || "не вказано")}</b>`;

      return;
    }

    if (
      item?.entryType === "team" ||
      item?.isFinal
    ) {
      profileSummary.innerHTML =
        `Команда: <b>${esc(profile.teamName || "—")}</b><br>` +
        `Заявник: <b>${esc(name || "—")}</b><br>` +
        `Телефон: <b>${esc(profile.phone || "не вказано")}</b>`;

      return;
    }

    profileSummary.innerHTML =
      `Користувач: <b>${esc(name || "—")}</b><br>` +
      `Телефон: <b>${esc(profile.phone || "не вказано")}</b>`;
  }

  // =========================================================
  // FINAL
  // =========================================================

  async function loadFinalAccess() {
    finalAccess.clear();

    const finals =
      items.filter(
        item => item.isFinal
      );

    for (const item of finals) {
      const key =
        valueOf(item);

      if (
        !user ||
        !profileReady()
      ) {
        finalAccess.set(
          key,
          {
            status:
              user
                ? "no_team"
                : "login",
            registrationExists:
              false
          }
        );

        continue;
      }

      const year =
        seasonYear(item);

      if (!year) {
        finalAccess.set(
          key,
          {
            status:
              "error",
            registrationExists:
              false
          }
        );

        continue;
      }

      const stageId =
        item.stageKey ||
        "final";

      const regId =
        registrationId(
          item.compId,
          stageId,
          "team"
        );

      try {
        const [
          qSnap,
          regSnap
        ] =
          await Promise.all([
            db
              .collection(
                "finalQualifications"
              )
              .doc(year)
              .collection("teams")
              .doc(profile.teamId)
              .get(),

            db
              .collection("registrations")
              .doc(regId)
              .get()
          ]);

        const q =
          qSnap.exists
            ? qSnap.data() || {}
            : {};

        const valid =
          qSnap.exists &&
          (
            !q.teamId ||
            text(q.teamId) ===
              profile.teamId
          ) &&
          (
            !q.competitionId ||
            text(q.competitionId) ===
              item.compId
          ) &&
          (
            !q.stageId ||
            text(q.stageId) ===
              stageId
          );

        finalAccess.set(
          key,
          {
            status:
              valid
                ? lower(
                    q.status ||
                    "reserve"
                  )
                : "not_invited",

            rank:
              Number(
                q.rank ||
                q.place ||
                0
              ),

            registrationExists:
              regSnap.exists
          }
        );

      } catch (error) {
        console.warn(
          "[Registration] final:",
          error
        );

        finalAccess.set(
          key,
          {
            status:
              "error",
            registrationExists:
              false
          }
        );
      }
    }
  }

  function canRegister(item) {
    if (
      registrationState(item) !==
      "open"
    ) {
      return false;
    }

    if (!item.isFinal) {
      return true;
    }

    const access =
      finalAccess.get(
        valueOf(item)
      );

    return Boolean(
      access &&
      access.status === "invited" &&
      !access.registrationExists
    );
  }

  // =========================================================
  // PAYMENT
  // =========================================================

  function renderPayment(item) {
    if (!item) return;

    const price =
      item.price === null
        ? "—"
        : item.price;

    if (payAmount) {
      payAmount.textContent =
        item.payEnabled
          ? String(price)
          : "0";
    }

    if (payCurrency) {
      payCurrency.textContent =
        item.currency || "UAH";
    }

    const details =
      item.payEnabled
        ? (
            item.payDetails ||
            "Реквізити не вказані."
          )
        : "Оплата не потрібна.";

    if (payDetails) {
      payDetails.textContent =
        details;
    }

    if (cardNum) {
      cardNum.textContent =
        details;
    }

    copyPaymentText =
      item.payEnabled
        ? item.payDetails
        : "";
  }

  if (copyCard) {
    copyCard.onclick =
      async () => {
        if (!copyPaymentText) {
          alert(
            "Нема реквізитів."
          );
          return;
        }

        try {
          await navigator.clipboard
            .writeText(
              copyPaymentText
            );

          const old =
            copyCard.textContent;

          copyCard.textContent =
            "Скопійовано ✔";

          setTimeout(
            () => {
              copyCard.textContent =
                old;
            },
            1200
          );

        } catch {
          alert(
            "Не вдалося скопіювати."
          );
        }
      };
  }

  // =========================================================
  // STATUS
  // =========================================================

  function statusData(item) {
    if (item.isFinal) {
      const access =
        finalAccess.get(
          valueOf(item)
        );

      if (
        access?.registrationExists
      ) {
        return {
          short: "Заявка подана",
          badge: "ЗАЯВКА Є",
          cls: "pill-b--open"
        };
      }

      if (
        access?.status === "invited"
      ) {
        return {
          short: "Фіналіст",
          badge: "ФІНАЛІСТ",
          cls: canRegister(item)
            ? "pill-b--open"
            : "pill-b--closed"
        };
      }

      if (
        access?.status === "reserve"
      ) {
        return {
          short: "Резерв",
          badge:
            access.rank
              ? `РЕЗЕРВ №${access.rank}`
              : "РЕЗЕРВ",
          cls: "pill-b--closed"
        };
      }

      if (
        access?.status === "declined"
      ) {
        return {
          short: "Відмова",
          badge: "ВІДМОВА",
          cls: "pill-b--closed"
        };
      }

      return {
        short: "Фінал",
        badge: "ЗА РЕЙТИНГОМ",
        cls: "pill-b--closed"
      };
    }

    const state =
      registrationState(item);

    if (state === "open") {
      return {
        short: "Відкрито",
        badge: "ВІДКРИТО",
        cls: "pill-b--open"
      };
    }

    if (state === "pending") {
      return {
        short: "Очікується",
        badge: "ОЧІКУЄТЬСЯ",
        cls: "pill-b--closed"
      };
    }

    return {
      short: "Закрито",
      badge: "ЗАКРИТО",
      cls: "pill-b--closed"
    };
  }

  // =========================================================
  // RENDER COMPETITIONS
  // =========================================================

  function renderItems() {
    if (!eventOptions) return;

    eventOptions.innerHTML = "";

    const visibleItems =
      items.filter(visible);

    if (!visibleItems.length) {
      eventOptions.innerHTML =
        '<p class="form__hint">Немає доступних змагань.</p>';

      return;
    }

    visibleItems.forEach(
      item => {
        const value =
          valueOf(item);

        const status =
          statusData(item);

        const enabled =
          canRegister(item);

        const label =
          document.createElement(
            "label"
          );

        label.className =
          `event-item${
            enabled
              ? ""
              : " is-closed"
          }`;

        label.innerHTML = `
          <input
            type="radio"
            name="stagePick"
            value="${esc(value)}"
            ${enabled ? "" : "disabled"}
          >

          <div class="event-content">

            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:10px;
                margin-bottom:8px;
              "
            >
              <span
                style="
                  color:var(--muted);
                  font-size:12px;
                  font-weight:800;
                "
              >
                ${esc(status.short)}
              </span>

              <span
                class="pill-b ${status.cls}"
              >
                ${esc(status.badge)}
              </span>
            </div>

            <div
              style="
                font-size:16px;
                font-weight:900;
                line-height:1.3;
              "
            >
              ${esc(item.brand)} ·
              ${esc(item.title)}
              ${
                item.stageTitle
                  ? ` — ${esc(item.stageTitle)}`
                  : ""
              }
            </div>

            <div class="event-meta">
              ${esc(fmtDate(item.startAt))}
              —
              ${esc(fmtDate(item.finishAt))}
            </div>

            <div class="event-meta">
              Реєстрація:
              ${esc(fmtDate(item.regOpen))}
              —
              ${esc(fmtDate(item.regClose))}
            </div>

          </div>
        `;

        eventOptions.appendChild(
          label
        );
      }
    );

    const defaultItem =
      visibleItems.find(
        item =>
          registrationState(item) ===
          "open"
      ) ||
      visibleItems[0];

    renderPayment(
      defaultItem
    );

    refreshSubmit();
  }

  // =========================================================
  // LOAD COMPETITIONS
  // =========================================================

  async function loadCompetitions() {
    const snap =
      await db
        .collection("competitions")
        .get();

    const result = [];

    snap.forEach(
      doc => {
        const c =
          doc.data() || {};

        const events =
          Array.isArray(c.events)
            ? c.events
            : [];

        if (events.length) {
          events.forEach(
            (event, index) => {
              result.push(
                buildItem(
                  c,
                  doc.id,
                  event,
                  index
                )
              );
            }
          );

        } else {
          result.push(
            buildItem(
              c,
              doc.id
            )
          );
        }
      }
    );

    result.sort(
      (a, b) =>
        (
          a.startAt?.getTime() ||
          Number.MAX_SAFE_INTEGER
        ) -
        (
          b.startAt?.getTime() ||
          Number.MAX_SAFE_INTEGER
        )
    );

    items =
      result.filter(visible);

    await loadFinalAccess();

    renderItems();
  }

  // =========================================================
  // SELECT
  // =========================================================

  document.addEventListener(
    "change",
    event => {
      if (
        event.target?.name ===
        "stagePick"
      ) {
        const item =
          selectedItem();

        renderProfile(item);
        renderPayment(item);

        if (
          item &&
          !profileReady()
        ) {
          setMsg(
            item.entryType === "solo"
              ? "Для SOLO профіль повинен бути прив’язаний до команди."
              : "Спочатку приєднайтесь до команди в «Мій кабінет».",
            false
          );

        } else {
          setMsg("");
        }
      }

      if (
        event.target?.name ===
          "stagePick" ||
        event.target?.id ===
          "rules"
      ) {
        refreshSubmit();
      }
    }
  );

  function selectedItem() {
    const radio =
      document.querySelector(
        'input[name="stagePick"]:checked'
      );

    if (!radio) return null;

    return items.find(
      item =>
        valueOf(item) ===
        radio.value
    ) || null;
  }

  function refreshSubmit() {
    if (!submitBtn) return;

    const loading =
      spinner?.classList.contains(
        "spinner--on"
      );

    const item =
      selectedItem();

    submitBtn.disabled =
      Boolean(
        loading ||
        !user ||
        !profile ||
        !item ||
        !profileReady() ||
        (
          item.entryType === "solo" &&
          !participantName()
        ) ||
        (
          rules &&
          !rules.checked
        ) ||
        !canRegister(item)
      );
  }

  // =========================================================
  // CREATE REGISTRATION
  // =========================================================

  async function createRegistration(
    ref,
    payload,
    item
  ) {
    await db.runTransaction(
      async transaction => {
        if (item.isFinal) {
          const year =
            seasonYear(item);

          const qRef =
            db
              .collection(
                "finalQualifications"
              )
              .doc(year)
              .collection("teams")
              .doc(profile.teamId);

          const qSnap =
            await transaction.get(
              qRef
            );

          if (!qSnap.exists) {
            throw new Error(
              "Команда не має права участі у Фіналі."
            );
          }

          const q =
            qSnap.data() || {};

          if (
            lower(q.status) !==
            "invited"
          ) {
            throw new Error(
              "Право участі у Фіналі зараз неактивне."
            );
          }
        }

        const existing =
          await transaction.get(ref);

        if (existing.exists) {
          throw new Error(
            payload.entryType === "solo"
              ? "Ви вже подали заявку."
              : "Команда вже подала заявку."
          );
        }

        transaction.set(
          ref,
          payload
        );
      }
    );
  }

  function publicPayload(payload) {
    return {
      uid:
        payload.uid,

      competitionId:
        payload.competitionId,

      stageId:
        payload.stageId,

      entryType:
        payload.entryType,

      teamId:
        payload.teamId,

      teamName:
        payload.teamName,

      participantName:
        payload.participantName,

      displayName:
        payload.displayName,

      status:
        payload.status,

      finalQualification:
        payload.finalQualification,

      finalInvite:
        payload.finalInvite,

      seasonYear:
        payload.seasonYear,

      source:
        payload.source,

      createdAt:
        fb.firestore
          .FieldValue
          .serverTimestamp()
    };
  }

  // =========================================================
  // SUBMIT
  // =========================================================

  if (form) {
    form.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        if (hp?.value) {
          return;
        }

        const item =
          selectedItem();

        if (
          !user ||
          !profile ||
          !item
        ) {
          setMsg(
            "Не вдалося визначити заявку.",
            false
          );
          return;
        }

        /*
         * TEAM + SOLO:
         * користувач обов'язково
         * повинен мати команду.
         */
        if (!profileReady()) {
          setMsg(
            "Профіль повинен бути прив’язаний до команди.",
            false
          );
          return;
        }

        const name =
          participantName();

        if (
          item.entryType === "solo" &&
          !name
        ) {
          setMsg(
            "Для SOLO потрібно вказати ім’я та прізвище.",
            false
          );
          return;
        }

        if (
          rules &&
          !rules.checked
        ) {
          setMsg(
            "Підтвердіть ознайомлення з регламентом.",
            false
          );
          return;
        }

        if (!canRegister(item)) {
          setMsg(
            "Реєстрація зараз недоступна.",
            false
          );
          return;
        }

        const competitionId =
          item.compId;

        const stageId =
          item.stageKey ||
          null;

        const entryType =
          item.isFinal
            ? "team"
            : item.entryType;

        const id =
          registrationId(
            competitionId,
            stageId,
            entryType
          );

        const status =
          item.payEnabled
            ? "pending_payment"
            : "confirmed";

        const finalYear =
          item.isFinal
            ? seasonYear(item)
            : null;

        const payload = {
          uid:
            profile.uid,

          competitionId,

          stageId,

          entryType,

          /*
           * TEAM і SOLO мають
           * реальну прив'язку до команди.
           */
          teamId:
            profile.teamId,

          teamName:
            profile.teamName,

          /*
           * SOLO:
           * показуємо людину.
           */
          participantName:
            entryType === "solo"
              ? name
              : null,

          displayName:
            entryType === "solo"
              ? name
              : profile.teamName,

          captain:
            entryType === "solo"
              ? name
              : profile.fullName,

          phone:
            profile.phone,

          payEnabled:
            item.payEnabled,

          price:
            item.price,

          currency:
            item.currency,

          payDetails:
            item.payDetails,

          finalQualification:
            item.isFinal,

          finalInvite:
            item.isFinal,

          seasonYear:
            finalYear,

          source:
            item.isFinal
              ? "final_qualification_registration"
              : "registration",

          status,

          createdAt:
            fb.firestore
              .FieldValue
              .serverTimestamp(),

          confirmedAt:
            status === "confirmed"
              ? fb.firestore
                  .FieldValue
                  .serverTimestamp()
              : null
        };

        try {
          setLoading(true);
          setMsg("");

          const ref =
            db
              .collection("registrations")
              .doc(id);

          await createRegistration(
            ref,
            payload,
            item
          );

          /*
           * Публічний список.
           */
          try {
            await db
              .collection(
                "public_participants"
              )
              .doc(id)
              .set(
                publicPayload(
                  payload
                )
              );

          } catch (error) {
            console.warn(
              "[Registration] public mirror:",
              error
            );
          }

          setMsg(
            entryType === "solo"
              ? (
                  item.payEnabled
                    ? `Заявка «${name}» подана ✔ Очікується підтвердження оплати.`
                    : `Заявка «${name}» підтверджена ✔`
                )
              : (
                  item.payEnabled
                    ? "Заявка подана ✔ Очікується підтвердження оплати."
                    : "Заявка підтверджена ✔"
                ),
            true
          );

          form.reset();

          renderProfile();

          await loadFinalAccess();
          renderItems();

        } catch (error) {
          console.error(
            "[Registration] submit:",
            error
          );

          const code =
            lower(
              error?.code
            );

          if (
            code.includes(
              "permission"
            )
          ) {
            setMsg(
              "Firebase не дозволив запис. Перевірте Firestore Rules.",
              false
            );

          } else {
            setMsg(
              error?.message ||
              "Не вдалося подати заявку.",
              false
            );
          }

        } finally {
          setLoading(false);
        }
      }
    );
  }

  // =========================================================
  // AUTH
  // =========================================================

  function listenAuth() {
    auth.onAuthStateChanged(
      async currentUser => {
        user =
          currentUser ||
          null;

        profile =
          null;

        if (!user) {
          if (profileSummary) {
            profileSummary.textContent =
              "Увійдіть у акаунт.";
          }

          setMsg(
            "Увійдіть у акаунт, щоб подати заявку.",
            false
          );

          await loadFinalAccess();
          renderItems();
          refreshSubmit();
          return;
        }

        try {
          await loadProfile(user);

          renderProfile();

          await loadFinalAccess();

          renderItems();

        } catch (error) {
          console.error(
            "[Registration] profile:",
            error
          );

          setMsg(
            error?.message ||
            "Не вдалося завантажити профіль.",
            false
          );
        }

        refreshSubmit();
      }
    );
  }

  // =========================================================
  // INIT
  // =========================================================

  async function init() {
    try {
      if (eventOptions) {
        eventOptions.innerHTML =
          '<p class="form__hint">Завантаження списку...</p>';
      }

      await waitFirebase();

      listenAuth();

      await loadCompetitions();

      console.info(
        "[STOLAR CARP registration] ready"
      );

    } catch (error) {
      console.error(
        "[Registration] init:",
        error
      );

      if (eventOptions) {
        eventOptions.innerHTML =
          `<p class="form__hint" style="color:#ff6c6c;">${
            esc(
              error?.message ||
              "Помилка запуску."
            )
          }</p>`;
      }

      if (profileSummary) {
        profileSummary.textContent =
          "Помилка завантаження.";
      }

      if (submitBtn) {
        submitBtn.disabled =
          true;
      }
    }
  }

  init();

})();

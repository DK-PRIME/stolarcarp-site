// assets/js/final_invite.js
// STOLAR CARP • Запрошення та підтвердження участі у фіналі
//
// Потрібні документи:
//
// settings/app
// {
//   finalRegistrationOpen: true,
//   finalCompetitionId: "competition-id",
//   finalStageId: "final",
//   finalTitle: "Фінал STOLAR CARP 2026",
//   finalConfirmDeadline: Timestamp,
//   finalStartAt: Timestamp,
//   finalEndAt: Timestamp
// }
//
// finalInvites/{competitionId}__{stageId}__{teamId}
// {
//   teamId: "...",
//   teamName: "...",
//   rank: 1,
//   status: "invited" // invited | confirmed | declined | reserve
// }

(function () {
  "use strict";

  console.log("✅ final_invite.js LOADED");

  const SETTINGS_DOC = "app";
  const INVITES_COLLECTION = "finalInvites";

  let auth = null;
  let db = null;

  let currentUser = null;
  let currentProfile = null;
  let currentTeam = null;
  let currentSettings = null;
  let currentInvite = null;
  let currentInviteRef = null;

  let unsubscribeUser = null;
  let unsubscribeTeam = null;
  let unsubscribeSettings = null;
  let unsubscribeInvite = null;

  let actionInProgress = false;

  let cardEl = null;
  let contentEl = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function toDate(value) {
    try {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value.toDate === "function") return value.toDate();

      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    } catch {
      return null;
    }
  }

  function formatDate(value, withTime = false) {
    const date = toDate(value);
    if (!date) return "—";

    const options = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    };

    if (withTime) {
      options.hour = "2-digit";
      options.minute = "2-digit";
    }

    return date.toLocaleString("uk-UA", options);
  }

  function roleCanRespond(profile) {
    const role = normalize(profile?.role).toLowerCase();

    return (
      role === "captain" ||
      role === "admin"
    );
  }

  async function waitFirebase(maxMs = 12000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxMs) {
      if (window.scAuth && window.scDb && window.firebase) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error("Firebase не готовий");
  }

  function injectStyles() {
    if (document.getElementById("sc-final-invite-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "sc-final-invite-styles";

    style.textContent = `
      .final-invite-card {
        display: none;
      }

      .final-invite-card.is-visible {
        display: block;
      }

      .final-invite-box {
        padding: 15px;
        border: 1px solid rgba(250, 204, 21, .30);
        border-radius: 16px;
        background:
          radial-gradient(
            circle at top left,
            rgba(250, 204, 21, .12),
            transparent 52%
          ),
          #020617;
      }

      .final-invite-title {
        margin: 0 0 7px;
        color: #f8fafc;
        font-size: 1.05rem;
        font-weight: 900;
        line-height: 1.3;
      }

      .final-invite-text {
        margin: 0;
        color: #9ca3af;
        font-size: .88rem;
        line-height: 1.55;
      }

      .final-invite-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 12px;
      }

      .final-invite-pill {
        padding: 5px 9px;
        border: 1px solid #374151;
        border-radius: 999px;
        background: #0f172a;
        color: #e5e7eb;
        font-size: .78rem;
      }

      .final-invite-pill strong {
        color: #facc15;
      }

      .final-invite-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .final-invite-btn {
        border-radius: 999px;
        padding: 9px 15px;
        border: 0;
        font-size: .84rem;
        font-weight: 800;
        cursor: pointer;
      }

      .final-invite-btn:disabled {
        opacity: .55;
        cursor: not-allowed;
      }

      .final-invite-btn--confirm {
        color: #041108;
        background: linear-gradient(135deg, #4ade80, #22c55e);
      }

      .final-invite-btn--decline {
        color: #fff;
        border: 1px solid rgba(239, 68, 68, .45);
        background: rgba(127, 29, 29, .55);
      }

      .final-invite-status {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        font-size: .84rem;
        font-weight: 700;
        line-height: 1.45;
      }

      .final-invite-status--confirmed {
        color: #86efac;
        border: 1px solid rgba(34, 197, 94, .35);
        background: rgba(20, 83, 45, .28);
      }

      .final-invite-status--declined {
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, .35);
        background: rgba(127, 29, 29, .25);
      }

      .final-invite-status--waiting {
        color: #fde68a;
        border: 1px solid rgba(250, 204, 21, .30);
        background: rgba(113, 63, 18, .23);
      }

      .final-invite-status--reserve {
        color: #cbd5e1;
        border: 1px solid #334155;
        background: #0f172a;
      }

      .final-invite-error {
        color: #fca5a5;
      }

      @media (max-width: 520px) {
        .final-invite-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .final-invite-btn {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureUI() {
    injectStyles();

    cardEl = document.getElementById("finalInviteCard");
    contentEl = document.getElementById("finalInviteContent");

    if (cardEl && contentEl) {
      return;
    }

    const participationContainer =
      document.getElementById("myCompetitions");

    const participationCard =
      participationContainer?.closest(".card");

    cardEl = document.createElement("div");
    cardEl.id = "finalInviteCard";
    cardEl.className = "card card--soft final-invite-card";

    cardEl.innerHTML = `
      <h2 class="card-title">Фінал STOLAR CARP</h2>

      <div id="finalInviteContent">
        <div class="cabinet-small-muted">
          Перевірка права участі у фіналі…
        </div>
      </div>
    `;

    contentEl = cardEl.querySelector("#finalInviteContent");

    if (participationCard?.parentElement) {
      participationCard.parentElement.insertBefore(
        cardEl,
        participationCard.nextSibling
      );
    } else {
      document.getElementById("cabinetContent")?.appendChild(cardEl);
    }
  }

  function showCard() {
    ensureUI();
    cardEl?.classList.add("is-visible");
  }

  function hideCard() {
    cardEl?.classList.remove("is-visible");
  }

  function getFinalConfig() {
    const settings = currentSettings || {};

    return {
      registrationOpen:
        settings.finalRegistrationOpen === true,

      competitionId: normalize(
        settings.finalCompetitionId
      ),

      stageId:
        normalize(settings.finalStageId) ||
        "final",

      title:
        normalize(settings.finalTitle) ||
        "Фінал STOLAR CARP",

      deadline:
        settings.finalConfirmDeadline ||
        null,

      startAt:
        settings.finalStartAt ||
        null,

      endAt:
        settings.finalEndAt ||
        null
    };
  }

  function isDeadlineExpired(deadline) {
    const date = toDate(deadline);
    return date ? Date.now() > date.getTime() : false;
  }

  function render() {
    ensureUI();

    if (
      !currentUser ||
      !currentProfile ||
      !currentProfile.teamId
    ) {
      hideCard();
      return;
    }

    if (!currentInvite) {
      hideCard();
      return;
    }

    showCard();

    const config = getFinalConfig();
    const status = normalize(currentInvite.status).toLowerCase();
    const rank = Number(currentInvite.rank || 0);
    const deadlineExpired = isDeadlineExpired(config.deadline);
    const canRespond = roleCanRespond(currentProfile);

    const rankHtml = rank > 0
      ? `
        <span class="final-invite-pill">
          Місце в рейтингу:
          <strong>${escapeHtml(rank)}</strong>
        </span>
      `
      : "";

    const datesHtml = config.startAt
      ? `
        <span class="final-invite-pill">
          Дата:
          <strong>
            ${escapeHtml(formatDate(config.startAt))}
            ${
              config.endAt
                ? ` — ${escapeHtml(formatDate(config.endAt))}`
                : ""
            }
          </strong>
        </span>
      `
      : "";

    const deadlineHtml = config.deadline
      ? `
        <span class="final-invite-pill">
          Підтвердити до:
          <strong>${escapeHtml(formatDate(config.deadline, true))}</strong>
        </span>
      `
      : "";

    const header = `
      <div class="final-invite-box">
        <h3 class="final-invite-title">
          🏆 ${escapeHtml(config.title)}
        </h3>

        <p class="final-invite-text">
          Ваша команда отримала право участі у фіналі сезону.
        </p>

        <div class="final-invite-meta">
          ${rankHtml}
          ${datesHtml}
          ${deadlineHtml}
        </div>
    `;

    if (status === "confirmed") {
      contentEl.innerHTML = `
        ${header}

        <div class="
          final-invite-status
          final-invite-status--confirmed
        ">
          ✅ Участь команди у фіналі підтверджена.
          Фінал додано до блоку «Моя участь».
        </div>
      </div>
      `;

      return;
    }

    if (status === "declined") {
      contentEl.innerHTML = `
        ${header}

        <div class="
          final-invite-status
          final-invite-status--declined
        ">
          ❌ Команда відмовилася від участі у фіналі.
        </div>
      </div>
      `;

      return;
    }

    if (status === "reserve") {
      contentEl.innerHTML = `
        ${header}

        <div class="
          final-invite-status
          final-invite-status--reserve
        ">
          Ви перебуваєте у резерві. Запрошення стане активним,
          якщо звільниться місце у фіналі.
        </div>
      </div>
      `;

      return;
    }

    if (!config.registrationOpen) {
      contentEl.innerHTML = `
        ${header}

        <div class="
          final-invite-status
          final-invite-status--waiting
        ">
          Підтвердження участі ще не відкрито.
        </div>
      </div>
      `;

      return;
    }

    if (deadlineExpired) {
      contentEl.innerHTML = `
        ${header}

        <div class="
          final-invite-status
          final-invite-status--declined
        ">
          Термін підтвердження участі завершився.
        </div>
      </div>
      `;

      return;
    }

    const captainWarning = canRespond
      ? ""
      : `
        <div class="
          final-invite-status
          final-invite-status--waiting
        ">
          Підтвердити або відхилити участь може лише капітан команди.
        </div>
      `;

    contentEl.innerHTML = `
      ${header}

      ${captainWarning}

      <div class="final-invite-actions">
        <button
          type="button"
          class="final-invite-btn final-invite-btn--confirm"
          id="confirmFinalInviteBtn"
          ${canRespond || actionInProgress ? "" : "disabled"}
        >
          ✅ Підтвердити участь
        </button>

        <button
          type="button"
          class="final-invite-btn final-invite-btn--decline"
          id="declineFinalInviteBtn"
          ${canRespond || actionInProgress ? "" : "disabled"}
        >
          ❌ Відмовитися
        </button>
      </div>

      <div id="finalInviteActionMessage"></div>
    </div>
    `;

    const confirmButton =
      document.getElementById("confirmFinalInviteBtn");

    const declineButton =
      document.getElementById("declineFinalInviteBtn");

    if (canRespond && confirmButton) {
      confirmButton.addEventListener("click", confirmParticipation);
    }

    if (canRespond && declineButton) {
      declineButton.addEventListener("click", declineParticipation);
    }
  }

  function setActionMessage(text, isError = false) {
    const messageEl =
      document.getElementById("finalInviteActionMessage");

    if (!messageEl) return;

    messageEl.className =
      "final-invite-status " +
      (
        isError
          ? "final-invite-status--declined final-invite-error"
          : "final-invite-status--waiting"
      );

    messageEl.textContent = text || "";
  }

  function buildRegistrationDocId(
    competitionId,
    stageId,
    teamId
  ) {
    return (
      `${competitionId}__` +
      `${stageId || "main"}__` +
      `team__${teamId}`
    );
  }

  async function confirmParticipation() {
    if (actionInProgress) return;

    const config = getFinalConfig();
    const teamId = normalize(currentProfile?.teamId);

    if (
      !currentUser ||
      !teamId ||
      !currentInviteRef
    ) {
      setActionMessage(
        "Не вдалося визначити команду або запрошення.",
        true
      );

      return;
    }

    if (!roleCanRespond(currentProfile)) {
      setActionMessage(
        "Підтвердити участь може лише капітан команди.",
        true
      );

      return;
    }

    if (!config.registrationOpen) {
      setActionMessage(
        "Підтвердження участі ще не відкрито.",
        true
      );

      return;
    }

    if (
      !config.competitionId ||
      !config.stageId
    ) {
      setActionMessage(
        "Адміністратор не вказав фінальне змагання у settings/app.",
        true
      );

      return;
    }

    const confirmed = window.confirm(
      "Підтвердити участь команди у фіналі?"
    );

    if (!confirmed) return;

    try {
      actionInProgress = true;
      render();
      setActionMessage("Зберігаємо підтвердження…");

      const registrationId =
        buildRegistrationDocId(
          config.competitionId,
          config.stageId,
          teamId
        );

      const registrationRef =
        db.collection("registrations").doc(registrationId);

      const publicRef =
        db.collection("public_participants").doc(registrationId);

      await db.runTransaction(async transaction => {
        const inviteSnapshot =
          await transaction.get(currentInviteRef);

        if (!inviteSnapshot.exists) {
          throw new Error("Запрошення не знайдено.");
        }

        const invite =
          inviteSnapshot.data() || {};

        const status =
          normalize(invite.status).toLowerCase();

        if (status === "confirmed") {
          return;
        }

        if (status !== "invited") {
          throw new Error(
            "Це запрошення зараз не можна підтвердити."
          );
        }

        transaction.set(
          currentInviteRef,
          {
            status: "confirmed",
            confirmedAt: serverTimestamp(),
            confirmedByUid: currentUser.uid,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        transaction.set(
          registrationRef,
          {
            uid: currentUser.uid,

            competitionId:
              config.competitionId,

            stageId:
              config.stageId,

            entryType: "team",

            teamId,

            teamName:
              currentTeam?.name ||
              currentInvite.teamName ||
              "Команда",

            captain:
              currentProfile.fullName ||
              currentUser.email ||
              "",

            phone:
              currentProfile.phone ||
              "",

            payEnabled: false,
            price: null,
            currency: "UAH",
            payDetails: "",

            source: "final_invite",
            finalInvite: true,

            status: "confirmed",
            createdAt: serverTimestamp(),
            confirmedAt: serverTimestamp()
          },
          { merge: true }
        );

        transaction.set(
          publicRef,
          {
            uid: currentUser.uid,

            competitionId:
              config.competitionId,

            stageId:
              config.stageId,

            entryType: "team",

            teamId,

            teamName:
              currentTeam?.name ||
              currentInvite.teamName ||
              "Команда",

            source: "final_invite",
            finalInvite: true,

            status: "confirmed",
            createdAt: serverTimestamp(),
            confirmedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      setActionMessage("Участь підтверджено.");
    } catch (error) {
      console.error("confirmParticipation error:", error);

      const code =
        normalize(error?.code).toLowerCase();

      if (code.includes("permission")) {
        setActionMessage(
          "Firebase Rules не дозволяють підтвердити участь.",
          true
        );
      } else {
        setActionMessage(
          error?.message ||
          "Не вдалося підтвердити участь.",
          true
        );
      }
    } finally {
      actionInProgress = false;
      render();
    }
  }

  async function declineParticipation() {
    if (actionInProgress) return;

    if (
      !currentUser ||
      !currentInviteRef
    ) {
      setActionMessage(
        "Запрошення не знайдено.",
        true
      );

      return;
    }

    if (!roleCanRespond(currentProfile)) {
      setActionMessage(
        "Відмовитися може лише капітан команди.",
        true
      );

      return;
    }

    const confirmed = window.confirm(
      "Відмовитися від участі у фіналі? Цю дію має побачити адміністратор."
    );

    if (!confirmed) return;

    try {
      actionInProgress = true;
      render();
      setActionMessage("Зберігаємо відмову…");

      await db.runTransaction(async transaction => {
        const inviteSnapshot =
          await transaction.get(currentInviteRef);

        if (!inviteSnapshot.exists) {
          throw new Error("Запрошення не знайдено.");
        }

        const invite =
          inviteSnapshot.data() || {};

        const status =
          normalize(invite.status).toLowerCase();

        if (status === "declined") {
          return;
        }

        if (status !== "invited") {
          throw new Error(
            "Це запрошення зараз не можна відхилити."
          );
        }

        transaction.set(
          currentInviteRef,
          {
            status: "declined",
            declinedAt: serverTimestamp(),
            declinedByUid: currentUser.uid,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      setActionMessage("Відмову збережено.");
    } catch (error) {
      console.error("declineParticipation error:", error);

      const code =
        normalize(error?.code).toLowerCase();

      if (code.includes("permission")) {
        setActionMessage(
          "Firebase Rules не дозволяють зберегти відмову.",
          true
        );
      } else {
        setActionMessage(
          error?.message ||
          "Не вдалося зберегти відмову.",
          true
        );
      }
    } finally {
      actionInProgress = false;
      render();
    }
  }

  function stopInviteSubscription() {
    if (typeof unsubscribeInvite === "function") {
      unsubscribeInvite();
    }

    unsubscribeInvite = null;
    currentInvite = null;
    currentInviteRef = null;
  }

  function subscribeInvite() {
    stopInviteSubscription();

    const teamId =
      normalize(currentProfile?.teamId);

    const config =
      getFinalConfig();

    if (
      !teamId ||
      !config.competitionId ||
      !config.stageId
    ) {
      hideCard();
      return;
    }

    const inviteId =
      `${config.competitionId}__` +
      `${config.stageId}__` +
      `${teamId}`;

    currentInviteRef =
      db.collection(INVITES_COLLECTION).doc(inviteId);

    unsubscribeInvite =
      currentInviteRef.onSnapshot(
        snapshot => {
          currentInvite = snapshot.exists
            ? {
                id: snapshot.id,
                ...(snapshot.data() || {})
              }
            : null;

          render();
        },
        error => {
          console.error(
            "final invite snapshot error:",
            error
          );

          hideCard();
        }
      );
  }

  function subscribeSettings() {
    if (typeof unsubscribeSettings === "function") {
      unsubscribeSettings();
    }

    unsubscribeSettings =
      db.collection("settings")
        .doc(SETTINGS_DOC)
        .onSnapshot(
          snapshot => {
            currentSettings = snapshot.exists
              ? snapshot.data() || {}
              : {};

            subscribeInvite();
          },
          error => {
            console.error(
              "settings/app final invite error:",
              error
            );

            currentSettings = {};
            hideCard();
          }
        );
  }

  function subscribeTeam(teamId) {
    if (typeof unsubscribeTeam === "function") {
      unsubscribeTeam();
    }

    unsubscribeTeam = null;
    currentTeam = null;

    if (!teamId) {
      render();
      return;
    }

    unsubscribeTeam =
      db.collection("teams")
        .doc(teamId)
        .onSnapshot(
          snapshot => {
            currentTeam = snapshot.exists
              ? snapshot.data() || {}
              : null;

            render();
          },
          error => {
            console.warn(
              "final invite team error:",
              error
            );
          }
        );
  }

  function subscribeUser(uid) {
    if (typeof unsubscribeUser === "function") {
      unsubscribeUser();
    }

    unsubscribeUser =
      db.collection("users")
        .doc(uid)
        .onSnapshot(
          snapshot => {
            currentProfile = snapshot.exists
              ? snapshot.data() || {}
              : null;

            subscribeTeam(
              currentProfile?.teamId || null
            );

            subscribeInvite();
            render();
          },
          error => {
            console.error(
              "final invite user error:",
              error
            );

            currentProfile = null;
            hideCard();
          }
        );
  }

  function cleanup() {
    [
      unsubscribeUser,
      unsubscribeTeam,
      unsubscribeSettings,
      unsubscribeInvite
    ].forEach(unsubscribe => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });

    unsubscribeUser = null;
    unsubscribeTeam = null;
    unsubscribeSettings = null;
    unsubscribeInvite = null;

    currentUser = null;
    currentProfile = null;
    currentTeam = null;
    currentSettings = null;
    currentInvite = null;
    currentInviteRef = null;

    hideCard();
  }

  async function init() {
    try {
      ensureUI();
      await waitFirebase();

      auth = window.scAuth;
      db = window.scDb;

      subscribeSettings();

      auth.onAuthStateChanged(user => {
        if (!user) {
          cleanup();
          return;
        }

        currentUser = user;
        subscribeUser(user.uid);
      });
    } catch (error) {
      console.error("final_invite init error:", error);
    }
  }

  init();
})();

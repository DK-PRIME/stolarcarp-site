// assets/js/bigfish_total_live.js
// STOLAR CARP • BigFish Total (public)
//
// ✅ Підтверджені учасники відображаються ДО першої риби.
// ✅ Без риби: ПІБ / команда + прочерки у вазі.
// ✅ TEAM -> teamId.
// ✅ SOLO -> UID.
// ✅ stageId null = main.
// ✅ W1/W2 -> 1 доба; W3/W4 -> 2 доба.
// ✅ Старі числові та нові об'єктні weights.
// ✅ eligible: status == confirmed + bigFishTotal == true.
// ✅ Прізвища на -евич / -ович обробляються коректно.

(function () {
  "use strict";

  const btn = document.getElementById(
    "toggleBigFishBtn"
  );

  const wrap = document.getElementById(
    "bigFishWrap"
  );

  const tbody = document.querySelector(
    "#bigFishTable tbody"
  );

  const countEl = document.getElementById(
    "bfCount"
  );

  const nameHeader = document.querySelector(
    "#bigFishTable thead th"
  );

  const db = window.scDb;

  if (!btn || !wrap || !tbody || !db) {
    return;
  }

  console.log(
    "✅ bigfish_total_live.js LOADED v20261009-participants-v2"
  );

  // =========================================================
  // HELPERS
  // =========================================================

  function normalize(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );
  }

  function fmtKg(value) {
    return Number.isFinite(value) && value > 0
      ? value.toFixed(2)
      : "—";
  }

  /*
   * ONE-OFF registration: stageId = null.
   * LIVE: stageId = main.
   */
  function normalizeStageId(value) {
    return normalize(value) || "main";
  }

  function fishWeight(value) {
    const raw = value && typeof value === "object"
      ? value.kg ?? value.weight ?? value.value ?? 0
      : value;

    const number = Number(
      String(raw ?? 0).replace(",", ".")
    );

    return Number.isFinite(number)
      ? number
      : 0;
  }

  function readStageFromApp(app) {
    return {
      compId: normalize(
        app?.activeCompetitionId ||
        app?.activeCompetition ||
        app?.competitionId
      ),

      stageId: normalizeStageId(
        app?.activeStageId ||
        app?.stageId
      )
    };
  }

  // =========================================================
  // PARTICIPANT TYPE / KEY
  // =========================================================

  function registrationEntryType(
    registration,
    documentId = ""
  ) {
    const explicit = normalize(
      registration?.entryType
    ).toLowerCase();

    if (
      explicit === "solo" ||
      explicit === "team"
    ) {
      return explicit;
    }

    return documentId.includes("__solo__")
      ? "solo"
      : "team";
  }

  function registrationParticipantKey(
    registration,
    documentId = ""
  ) {
    if (
      registrationEntryType(
        registration,
        documentId
      ) === "solo"
    ) {
      const uid = normalize(
        registration?.uid ||
        registration?.participantUid ||
        registration?.userId
      );

      if (uid) return uid;

      const marker = "__solo__";
      const index = documentId.lastIndexOf(marker);

      if (index >= 0) {
        const id = normalize(
          documentId.slice(
            index + marker.length
          )
        );

        if (id) return id;
      }

      return normalize(
        registration?.entityId
      );
    }

    return normalize(
      registration?.teamId ||
      registration?.entityId
    );
  }

  // =========================================================
  // PARTICIPANT NAMES
  // =========================================================

  function cleanSoloName(value) {
    const name = normalize(value);

    const lower = name
      .toLowerCase()
      .replace(/[.!]/g, "")
      .trim();

    if (
      !name ||
      name.includes("@") ||
      [
        "учасник",
        "учасниця",
        "учасник команди",
        "participant",
        "player",
        "користувач",
        "user",
        "команда",
        "team",
        "невідомо",
        "unknown",
        "—",
        "-"
      ].includes(lower) ||
      /^(?:учасник|учасниця|participant|user)\s*\d+$/i.test(lower)
    ) {
      return "";
    }

    return name;
  }

  function firstCleanName(...values) {
    for (const value of values) {
      const name = cleanSoloName(value);

      if (name) return name;
    }

    return "";
  }

  function isPatronymicPart(value) {
    return /(?:ович|евич|євич|йович|івна|ївна|овна|евна|євна)$/i.test(
      normalize(value)
    );
  }

  function normalizeSoloName(value) {
    const raw = cleanSoloName(value);

    if (!raw) return "";

    const parts = raw
      .split(" ")
      .filter(Boolean);

    // Двослівні та інші формати не переставляємо.
    if (parts.length !== 3) return raw;

    /*
     * Мазуркевич Роман Миколайович
     * -> Мазуркевич Роман.
     */
    if (
      isPatronymicPart(parts[2]) &&
      !isPatronymicPart(parts[1])
    ) {
      return `${parts[0]} ${parts[1]}`;
    }

    /*
     * Роман Миколайович Мазуркевич
     * -> Мазуркевич Роман.
     */
    if (
      isPatronymicPart(parts[1]) &&
      !isPatronymicPart(parts[0])
    ) {
      return `${parts[2]} ${parts[0]}`;
    }

    return raw;
  }

  function registrationDisplayName(
    registration,
    documentId = ""
  ) {
    const r = registration || {};

    if (
      registrationEntryType(
        r,
        documentId
      ) === "solo"
    ) {
      const firstName = firstCleanName(
        r.firstName,
        r.givenName,
        r.first_name
      );

      const lastName = firstCleanName(
        r.lastName,
        r.surname,
        r.familyName,
        r.last_name
      );

      if (firstName && lastName) {
        return `${lastName} ${firstName}`;
      }

      const teamName = normalize(
        r.teamName || r.team
      ).toLowerCase();

      for (const value of [
        r.participantName,
        r.fullName,
        r.userName,
        r.displayName,
        r.name,
        r.captain
      ]) {
        const name = normalizeSoloName(value);

        if (
          name &&
          (
            !teamName ||
            name.toLowerCase() !== teamName
          )
        ) {
          return name;
        }
      }

      return "Учасник";
    }

    return normalize(
      r.teamName ||
      r.team ||
      r.displayName ||
      r.name
    ) || "—";
  }

  function weighingParticipantKey(
    weighing,
    participants
  ) {
    const entryType = normalize(
      weighing?.entryType
    ).toLowerCase();

    const candidates = entryType === "team"
      ? [
          weighing?.teamId,
          weighing?.entityId
        ]
      : [
          weighing?.participantUid,
          weighing?.uid,
          weighing?.userId,
          weighing?.participantId,
          weighing?.entityId,

          // Legacy: UID міг записуватися у teamId.
          weighing?.teamId
        ];

    for (const candidate of candidates) {
      const id = normalize(candidate);

      if (id && participants.has(id)) {
        return id;
      }
    }

    return "";
  }

  // =========================================================
  // WINNERS
  // =========================================================

  /*
   * Збережено наявну логіку:
   * 1. MAX BIG.
   * 2. BIG 1 доба без уже використаної риби.
   * 3. BIG 2 доба без уже використаної риби.
   */

  function pickBest(list, excludedIds) {
    const arr = (
      Array.isArray(list) ? list : []
    )
      .filter(item => (
        item &&
        item.weight > 0
      ))
      .sort((a, b) => (
        b.weight - a.weight
      ));

    for (const candidate of arr) {
      if (
        !excludedIds.has(
          candidate.fishId
        )
      ) {
        return candidate;
      }
    }

    return null;
  }

  function computeWinners(allFish) {
    const excluded = new Set();

    const overall = pickBest(
      allFish,
      excluded
    );

    if (overall) {
      excluded.add(overall.fishId);
    }

    const day1 = pickBest(
      allFish.filter(fish => (
        fish.day === 1
      )),
      excluded
    );

    if (day1) {
      excluded.add(day1.fishId);
    }

    const day2 = pickBest(
      allFish.filter(fish => (
        fish.day === 2
      )),
      excluded
    );

    if (day2) {
      excluded.add(day2.fishId);
    }

    return {
      day1,
      day2,
      overall
    };
  }

  // =========================================================
  // STATE
  // =========================================================

  let eligibleParticipants = new Map();
  let weighingDocs = [];

  let registrationsLoaded = false;
  let registrationsError = false;
  let weighingsError = false;

  // =========================================================
  // RENDER HELPERS
  // =========================================================

  function showMessage(
    message,
    countText = "Учасників: —"
  ) {
    if (countEl) {
      countEl.textContent = countText;
    }

    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          ${esc(message)}
        </td>
      </tr>
    `;
  }

  function collectFish() {
    const allFish = [];

    weighingDocs.forEach(
      ({ id, data: weighing }) => {
        const participantId = weighingParticipantKey(
          weighing,
          eligibleParticipants
        );

        if (!participantId) return;

        const weighNo = Number(
          weighing.weighNo
        );

        if (
          !Number.isInteger(weighNo) ||
          weighNo < 1 ||
          weighNo > 4
        ) {
          return;
        }

        const day = weighNo <= 2
          ? 1
          : 2;

        const weights = Array.isArray(
          weighing.weights
        )
          ? weighing.weights
          : [];

        weights.forEach(
          (value, index) => {
            const weight = fishWeight(value);

            if (weight <= 0) return;

            allFish.push({
              fishId: `${id}::${index}`,

              // TEAM -> teamId; SOLO -> UID.
              teamId: participantId,

              teamName: eligibleParticipants
                .get(participantId)
                .name,

              weighNo,
              day,
              weight
            });
          }
        );
      }
    );

    return allFish;
  }

  // =========================================================
  // RENDER
  // =========================================================

  function render() {
    if (registrationsError) {
      showMessage(
        "Помилка читання учасників BigFish Total."
      );

      return;
    }

    if (!registrationsLoaded) {
      showMessage(
        "Завантаження учасників BigFish Total…",
        "Учасників: …"
      );

      return;
    }

    const eligibleCount = eligibleParticipants.size;

    if (countEl) {
      countEl.textContent =
        `Учасників: ${eligibleCount}`;
    }

    if (!eligibleCount) {
      showMessage(
        "Немає підтверджених учасників BigFish Total.",
        "Учасників: 0"
      );

      return;
    }

    if (nameHeader) {
      const types = new Set(
        [...eligibleParticipants.values()]
          .map(item => item.entryType)
      );

      nameHeader.textContent = types.size > 1
        ? "Учасник / команда"
        : types.has("solo")
          ? "Учасник"
          : "Команда";
    }

    const allFish = collectFish();
    const winners = computeWinners(allFish);

    const perParticipant = new Map();

    /*
     * ГОЛОВНЕ ВИПРАВЛЕННЯ:
     *
     * Створюємо рядок кожному підтвердженому учаснику.
     * Наявність риби не є умовою показу.
     */
    for (
      const [
        participantId,
        participant
      ] of eligibleParticipants
    ) {
      perParticipant.set(
        participantId,
        {
          teamId: participantId,
          teamName: participant.name,

          d1: 0,
          d2: 0,
          all: 0
        }
      );
    }

    for (const fish of allFish) {
      const participant = perParticipant.get(
        fish.teamId
      );

      if (!participant) continue;

      participant.all = Math.max(
        participant.all,
        fish.weight
      );

      if (fish.day === 1) {
        participant.d1 = Math.max(
          participant.d1,
          fish.weight
        );
      }

      if (fish.day === 2) {
        participant.d2 = Math.max(
          participant.d2,
          fish.weight
        );
      }
    }

    const list = Array.from(
      perParticipant.values()
    ).sort((a, b) => (
      b.all - a.all ||
      b.d1 - a.d1 ||
      b.d2 - a.d2 ||
      String(a.teamName).localeCompare(
        String(b.teamName),
        "uk"
      )
    ));

    const wOverallTeam =
      winners.overall?.teamId || "";

    const wDay1Team =
      winners.day1?.teamId || "";

    const wDay2Team =
      winners.day2?.teamId || "";

    const wOverallW =
      winners.overall?.weight ?? null;

    const wDay1W =
      winners.day1?.weight ?? null;

    const wDay2W =
      winners.day2?.weight ?? null;

    tbody.innerHTML = list.map(
      participant => {
        const day1Cell = (
          participant.teamId === wDay1Team &&
          wDay1W !== null
        )
          ? `<strong>${fmtKg(wDay1W)}</strong> 🏆`
          : fmtKg(participant.d1);

        const day2Cell = (
          participant.teamId === wDay2Team &&
          wDay2W !== null
        )
          ? `<strong>${fmtKg(wDay2W)}</strong> 🏆`
          : fmtKg(participant.d2);

        const overallCell = (
          participant.teamId === wOverallTeam &&
          wOverallW !== null
        )
          ? `<strong>${fmtKg(wOverallW)}</strong> 🏆`
          : `<strong>${fmtKg(participant.all)}</strong>`;

        const rowClass =
          participant.teamId === wOverallTeam
            ? "bigfish-row--max"
            : "";

        return `
          <tr class="${rowClass}">
            <td>
              ${esc(participant.teamName)}
            </td>

            <td>
              ${day1Cell}
            </td>

            <td>
              ${day2Cell}
            </td>

            <td>
              ${overallCell}
            </td>
          </tr>
        `;
      }
    ).join("");

    /*
     * Помилка зважувань не приховує список учасників.
     */
    if (weighingsError) {
      tbody.innerHTML += `
        <tr>
          <td colspan="4">
            Не вдалося оновити зважування.
            Показано останні отримані дані;
            прочерк може означати, що результат
            ще не завантажено.
          </td>
        </tr>
      `;
    }
  }

  // =========================================================
  // SUBSCRIPTIONS
  // =========================================================

  let started = false;

  let activeStageKey = "";
  let stageGeneration = 0;

  let unsubSettings = null;
  let unsubRegs = null;
  let unsubWeigh = null;

  function stopAllStageSubs() {
    stageGeneration += 1;

    if (unsubRegs) {
      unsubRegs();
      unsubRegs = null;
    }

    if (unsubWeigh) {
      unsubWeigh();
      unsubWeigh = null;
    }
  }

  function subscribeStage(
    compId,
    stageId
  ) {
    const key = `${compId}||${stageId}`;

    if (key === activeStageKey) return;

    activeStageKey = key;

    stopAllStageSubs();

    const generation = stageGeneration;

    eligibleParticipants = new Map();
    weighingDocs = [];

    registrationsLoaded = false;
    registrationsError = false;
    weighingsError = false;

    if (!compId) {
      showMessage(
        "Немає активного змагання.",
        "Учасників: 0"
      );

      return;
    }

    render();

    // =======================================================
    // REGISTRATIONS
    // =======================================================

    /*
     * Заявки завантажуються незалежно від зважувань.
     *
     * stageId не включаємо в запит:
     * null у заявці відповідає main.
     */
    unsubRegs = db
      .collection("registrations")
      .where(
        "competitionId",
        "==",
        compId
      )
      .where(
        "status",
        "==",
        "confirmed"
      )
      .where(
        "bigFishTotal",
        "==",
        true
      )
      .onSnapshot(
        snapshot => {
          if (
            generation !== stageGeneration
          ) {
            return;
          }

          const participants = new Map();

          snapshot.forEach(doc => {
            const registration =
              doc.data() || {};

            if (
              normalizeStageId(
                registration.stageId
              ) !== normalizeStageId(stageId)
            ) {
              return;
            }

            const participantId =
              registrationParticipantKey(
                registration,
                doc.id
              );

            if (!participantId) return;

            participants.set(
              participantId,
              {
                name: registrationDisplayName(
                  registration,
                  doc.id
                ),

                entryType: registrationEntryType(
                  registration,
                  doc.id
                )
              }
            );
          });

          eligibleParticipants = participants;

          registrationsLoaded = true;
          registrationsError = false;

          /*
           * Показуємо учасників одразу.
           * Не чекаємо ані риби, ані snapshot зважувань.
           */
          render();
        },

        error => {
          if (
            generation !== stageGeneration
          ) {
            return;
          }

          console.error(
            "[BigFish] registrations error:",
            error
          );

          registrationsError = true;

          render();
        }
      );

    // =======================================================
    // WEIGHINGS
    // =======================================================

    /*
     * Одна підписка на зважування поточного етапу.
     *
     * Зміна заявок не перезапускає її.
     */
    unsubWeigh = db
      .collection("weighings")
      .where(
        "compId",
        "==",
        compId
      )
      .where(
        "stageId",
        "==",
        normalizeStageId(stageId)
      )
      .where(
        "status",
        "==",
        "submitted"
      )
      .onSnapshot(
        snapshot => {
          if (
            generation !== stageGeneration
          ) {
            return;
          }

          const docs = [];

          snapshot.forEach(doc => {
            docs.push({
              id: doc.id,
              data: doc.data() || {}
            });
          });

          weighingDocs = docs;
          weighingsError = false;

          render();
        },

        error => {
          if (
            generation !== stageGeneration
          ) {
            return;
          }

          console.error(
            "[BigFish] weighings error:",
            error
          );

          weighingsError = true;

          render();
        }
      );
  }

  function startSubscribe() {
    if (started) return;

    started = true;

    if (unsubSettings) {
      unsubSettings();
      unsubSettings = null;
    }

    unsubSettings = db
      .collection("settings")
      .doc("app")
      .onSnapshot(
        snapshot => {
          const app = snapshot.exists
            ? snapshot.data() || {}
            : {};

          const {
            compId,
            stageId
          } = readStageFromApp(app);

          subscribeStage(
            compId,
            stageId
          );
        },

        error => {
          console.error(
            "[BigFish] settings/app error:",
            error
          );

          stopAllStageSubs();

          activeStageKey = "";
          started = false;

          showMessage(
            "Помилка налаштувань BigFish Total."
          );
        }
      );
  }

  // =========================================================
  // UI / START
  // =========================================================

  function setOpen(open) {
    wrap.hidden = !open;

    btn.setAttribute(
      "aria-expanded",
      String(open)
    );

    btn.textContent = open
      ? "Сховати BigFish Total"
      : "BigFish Total";
  }

  let isOpen = false;

  try {
    isOpen = localStorage.getItem(
      "bf-is-open"
    ) === "1";
  } catch {}

  setOpen(isOpen);

  btn.addEventListener(
    "click",
    () => {
      isOpen = !isOpen;

      try {
        localStorage.setItem(
          "bf-is-open",
          isOpen ? "1" : "0"
        );
      } catch {}

      setOpen(isOpen);

      if (isOpen) {
        startSubscribe();
      }
    }
  );

  if (isOpen) {
    startSubscribe();
  }

  window.addEventListener(
    "beforeunload",
    () => {
      stopAllStageSubs();

      if (unsubSettings) {
        unsubSettings();
        unsubSettings = null;
      }
    }
  );
})();

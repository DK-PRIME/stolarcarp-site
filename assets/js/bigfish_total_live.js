// assets/js/bigfish_total_live.js
// STOLAR CARP • BigFish Total (public)
//
// ✅ TEAM -> ключ teamId
// ✅ SOLO -> ключ UID
// ✅ oneoff stageId null = main
// ✅ old weights: [9.800]
// ✅ new weights: [{ kg: 9.800, fishType: "carp" }]
// ✅ eligible: confirmed + bigFishTotal == true

(function () {
  "use strict";

  const btn =
    document.getElementById(
      "toggleBigFishBtn"
    );

  const wrap =
    document.getElementById(
      "bigFishWrap"
    );

  const tbody =
    document.querySelector(
      "#bigFishTable tbody"
    );

  const countEl =
    document.getElementById(
      "bfCount"
    );

  if (
    !btn ||
    !wrap ||
    !tbody
  ) {
    return;
  }

  const db =
    window.scDb;

  if (!db) {
    return;
  }

  // =========================================================
  // UI
  // =========================================================

  function setOpen(isOpen) {
    wrap.hidden =
      !isOpen;

    btn.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

    btn.textContent =
      isOpen
        ? "Сховати BigFish Total"
        : "BigFish Total";
  }

  let isOpen =
    localStorage.getItem(
      "bf-is-open"
    ) === "1";

  setOpen(isOpen);

  btn.addEventListener(
    "click",
    () => {
      isOpen =
        !isOpen;

      localStorage.setItem(
        "bf-is-open",
        isOpen
          ? "1"
          : "0"
      );

      setOpen(isOpen);

      if (isOpen) {
        startSubscribe();
      }
    }
  );

  // =========================================================
  // HELPERS
  // =========================================================

  const fmt = value =>
    (
      value === null ||
      value === undefined ||
      value === ""
    )
      ? "—"
      : String(value);

  const fmtKg = value =>
    (
      Number.isFinite(value) &&
      value > 0
    )
      ? value.toFixed(2)
      : "—";

  function normalize(value) {
    return String(
      value ?? ""
    ).trim();
  }

  /*
   * ONE-OFF registration:
   * stageId = null
   *
   * LIVE:
   * stageId = main
   *
   * Для нас це один і той самий етап.
   */
  function normalizeStageId(value) {
    return normalize(value) ||
      "main";
  }

  function fishWeight(value) {
    if (
      typeof value === "number" ||
      typeof value === "string"
    ) {
      const number =
        Number(
          String(value)
            .replace(
              ",",
              "."
            )
        );

      return Number.isFinite(
        number
      )
        ? number
        : 0;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const raw =
        value.kg ??
        value.weight ??
        value.value ??
        0;

      const number =
        Number(
          String(raw)
            .replace(
              ",",
              "."
            )
        );

      return Number.isFinite(
        number
      )
        ? number
        : 0;
    }

    return 0;
  }

  function readStageFromApp(app) {
    const compId =
      app?.activeCompetitionId ||
      app?.competitionId ||
      "";

    const stageId =
      app?.activeStageId ||
      app?.stageId ||
      "";

    return {
      compId:
        normalize(compId),

      stageId:
        normalizeStageId(
          stageId
        )
    };
  }

  // =========================================================
  // PARTICIPANT KEY
  // =========================================================

  /*
   * TEAM:
   * використовує teamId.
   *
   * SOLO:
   * використовує UID.
   *
   * Це важливо, бо кілька SOLO-учасників
   * можуть бути з однієї команди.
   */
  function registrationParticipantKey(
    registration
  ) {
    const entryType =
      normalize(
        registration?.entryType
      ).toLowerCase();

    if (
      entryType === "solo"
    ) {
      return normalize(
        registration?.uid
      );
    }

    return normalize(
      registration?.teamId
    );
  }

  function registrationDisplayName(
    registration
  ) {
    const entryType =
      normalize(
        registration?.entryType
      ).toLowerCase();

    if (
      entryType === "solo"
    ) {
      return (
        normalize(
          registration?.displayName
        ) ||
        normalize(
          registration?.participantName
        ) ||
        normalize(
          registration?.name
        ) ||
        "—"
      );
    }

    return (
      normalize(
        registration?.teamName
      ) ||
      normalize(
        registration?.team
      ) ||
      normalize(
        registration?.displayName
      ) ||
      normalize(
        registration?.name
      ) ||
      "—"
    );
  }

  /*
   * Для weighings підтримуємо:
   *
   * SOLO:
   * participantUid / uid / participantId /
   * teamId (якщо LIVE використовує UID в teamId)
   *
   * TEAM:
   * teamId
   */
  function weighingParticipantKey(
    weighing,
    eligibleParticipants
  ) {
    const candidates = [
      weighing?.participantUid,
      weighing?.uid,
      weighing?.userId,
      weighing?.participantId,
      weighing?.teamId
    ];

    for (
      const candidate of candidates
    ) {
      const id =
        normalize(candidate);

      if (
        id &&
        eligibleParticipants.has(id)
      ) {
        return id;
      }
    }

    return "";
  }

  // =========================================================
  // WINNERS
  // =========================================================

  function byWeightDesc(
    a,
    b
  ) {
    return (
      b.weight -
      a.weight
    );
  }

  function pickBest(
    list,
    excludedIds
  ) {
    const arr =
      (
        Array.isArray(list)
          ? list
          : []
      )
        .filter(
          item =>
            item &&
            item.weight > 0
        )
        .sort(
          byWeightDesc
        );

    for (
      const candidate of arr
    ) {
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

  function computeWinners(
    allFish
  ) {
    const excluded =
      new Set();

    const overall =
      pickBest(
        allFish,
        excluded
      );

    if (overall) {
      excluded.add(
        overall.fishId
      );
    }

    const day1 =
      pickBest(
        allFish.filter(
          fish =>
            fish.day === 1
        ),
        excluded
      );

    if (day1) {
      excluded.add(
        day1.fishId
      );
    }

    const day2 =
      pickBest(
        allFish.filter(
          fish =>
            fish.day === 2
        ),
        excluded
      );

    if (day2) {
      excluded.add(
        day2.fishId
      );
    }

    return {
      day1,
      day2,
      overall
    };
  }

  // =========================================================
  // RENDER
  // =========================================================

  function render(
    eligibleParticipants,
    allFish,
    winners
  ) {
    const eligibleCount =
      eligibleParticipants.size;

    if (countEl) {
      countEl.textContent =
        `Учасників: ${eligibleCount}`;
    }

    if (!eligibleCount) {
      tbody.innerHTML =
        `<tr>
          <td colspan="4">
            Немає підтверджених учасників BigFish Total.
          </td>
        </tr>`;

      return;
    }

    if (!allFish.length) {
      tbody.innerHTML =
        `<tr>
          <td colspan="4">
            Учасники підтверджені, але уловів BigFish Total ще нема.
          </td>
        </tr>`;

      return;
    }

    const perParticipant =
      new Map();

    for (
      const [
        participantId,
        participantName
      ] of eligibleParticipants.entries()
    ) {
      perParticipant.set(
        participantId,
        {
          teamId:
            participantId,

          teamName:
            participantName,

          d1:
            0,

          d2:
            0,

          all:
            0
        }
      );
    }

    for (
      const fish of allFish
    ) {
      const participant =
        perParticipant.get(
          fish.teamId
        );

      if (!participant) {
        continue;
      }

      participant.all =
        Math.max(
          participant.all,
          fish.weight
        );

      if (
        fish.day === 1
      ) {
        participant.d1 =
          Math.max(
            participant.d1,
            fish.weight
          );
      }

      if (
        fish.day === 2
      ) {
        participant.d2 =
          Math.max(
            participant.d2,
            fish.weight
          );
      }
    }

    const list =
      Array.from(
        perParticipant.values()
      ).sort(
        (a, b) =>
          (
            b.all -
            a.all
          ) ||
          (
            b.d1 -
            a.d1
          ) ||
          (
            b.d2 -
            a.d2
          ) ||
          String(
            a.teamName
          ).localeCompare(
            String(
              b.teamName
            ),
            "uk"
          )
      );

    const wOverallTeam =
      winners?.overall?.teamId ||
      "";

    const wDay1Team =
      winners?.day1?.teamId ||
      "";

    const wDay2Team =
      winners?.day2?.teamId ||
      "";

    const wOverallW =
      winners?.overall?.weight ??
      null;

    const wDay1W =
      winners?.day1?.weight ??
      null;

    const wDay2W =
      winners?.day2?.weight ??
      null;

    tbody.innerHTML =
      list.map(
        participant => {
          const day1Cell =
            (
              participant.teamId ===
                wDay1Team &&
              wDay1W !== null
            )
              ? `<strong>${fmtKg(
                  wDay1W
                )}</strong> 🏆`
              : fmtKg(
                  participant.d1
                );

          const day2Cell =
            (
              participant.teamId ===
                wDay2Team &&
              wDay2W !== null
            )
              ? `<strong>${fmtKg(
                  wDay2W
                )}</strong> 🏆`
              : fmtKg(
                  participant.d2
                );

          const overallCell =
            (
              participant.teamId ===
                wOverallTeam &&
              wOverallW !== null
            )
              ? `<strong>${fmtKg(
                  wOverallW
                )}</strong> 🏆`
              : `<strong>${fmtKg(
                  participant.all
                )}</strong>`;

          const isMaxRow =
            participant.teamId ===
            wOverallTeam;

          return `
            <tr class="${
              isMaxRow
                ? "bigfish-row--max"
                : ""
            }">
              <td>${fmt(
                participant.teamName
              )}</td>

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
  }

  // =========================================================
  // SUBSCRIPTIONS
  // =========================================================

  let started =
    false;

  let unsubSettings =
    null;

  let unsubRegs =
    null;

  let unsubWeigh =
    null;

  function stopAllStageSubs() {
    if (unsubRegs) {
      unsubRegs();
      unsubRegs =
        null;
    }

    if (unsubWeigh) {
      unsubWeigh();
      unsubWeigh =
        null;
    }
  }

  function startSubscribe() {
    if (started) {
      return;
    }

    started =
      true;

    unsubSettings =
      db
        .collection(
          "settings"
        )
        .doc(
          "app"
        )
        .onSnapshot(
          snap => {
            const app =
              snap.exists
                ? (
                    snap.data() ||
                    {}
                  )
                : {};

            const {
              compId,
              stageId
            } =
              readStageFromApp(
                app
              );

            stopAllStageSubs();

            if (!compId) {
              if (countEl) {
                countEl.textContent =
                  "Учасників: 0";
              }

              tbody.innerHTML =
                `<tr>
                  <td colspan="4">
                    Немає активного змагання.
                  </td>
                </tr>`;

              return;
            }

            /*
             * ВАЖЛИВО:
             *
             * stageId НЕ ставимо у Firestore query.
             *
             * Чому:
             * ONE-OFF registration має stageId = null,
             * а LIVE використовує stageId = main.
             *
             * Нижче нормалізуємо:
             * null -> main.
             */
            unsubRegs =
              db
                .collection(
                  "registrations"
                )
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
                  qs => {
                    const eligibleParticipants =
                      new Map();

                    qs.forEach(
                      doc => {
                        const registration =
                          doc.data() ||
                          {};

                        /*
                         * null і main вважаємо
                         * одним етапом.
                         */
                        if (
                          normalizeStageId(
                            registration.stageId
                          ) !==
                          normalizeStageId(
                            stageId
                          )
                        ) {
                          return;
                        }

                        const participantId =
                          registrationParticipantKey(
                            registration
                          );

                        if (!participantId) {
                          return;
                        }

                        const participantName =
                          registrationDisplayName(
                            registration
                          );

                        eligibleParticipants.set(
                          participantId,
                          participantName
                        );
                      }
                    );

                    if (unsubWeigh) {
                      unsubWeigh();

                      unsubWeigh =
                        null;
                    }

                    // =========================================
                    // WEIGHINGS
                    // =========================================

                    unsubWeigh =
                      db
                        .collection(
                          "weighings"
                        )
                        .where(
                          "compId",
                          "==",
                          compId
                        )
                        .where(
                          "stageId",
                          "==",
                          normalizeStageId(
                            stageId
                          )
                        )
                        .where(
                          "status",
                          "==",
                          "submitted"
                        )
                        .onSnapshot(
                          wqs => {
                            const allFish =
                              [];

                            wqs.forEach(
                              doc => {
                                const weighing =
                                  doc.data() ||
                                  {};

                                const participantId =
                                  weighingParticipantKey(
                                    weighing,
                                    eligibleParticipants
                                  );

                                if (!participantId) {
                                  return;
                                }

                                const weighNo =
                                  Number(
                                    weighing.weighNo ||
                                    0
                                  );

                                if (
                                  weighNo < 1 ||
                                  weighNo > 4
                                ) {
                                  return;
                                }

                                const day =
                                  weighNo <= 2
                                    ? 1
                                    : 2;

                                const participantName =
                                  eligibleParticipants.get(
                                    participantId
                                  ) ||
                                  normalize(
                                    weighing.teamName
                                  ) ||
                                  normalize(
                                    weighing.participantName
                                  ) ||
                                  "—";

                                const weights =
                                  Array.isArray(
                                    weighing.weights
                                  )
                                    ? weighing.weights
                                    : [];

                                weights.forEach(
                                  (
                                    value,
                                    index
                                  ) => {
                                    const weight =
                                      fishWeight(
                                        value
                                      );

                                    if (
                                      !Number.isFinite(
                                        weight
                                      ) ||
                                      weight <= 0
                                    ) {
                                      return;
                                    }

                                    allFish.push({
                                      fishId:
                                        `${doc.id}::${index}`,

                                      /*
                                       * Тут teamId фактично є
                                       * універсальним participant key:
                                       *
                                       * TEAM -> teamId
                                       * SOLO -> UID
                                       */
                                      teamId:
                                        participantId,

                                      teamName:
                                        participantName,

                                      weighNo,

                                      day,

                                      weight
                                    });
                                  }
                                );
                              }
                            );

                            const winners =
                              computeWinners(
                                allFish
                              );

                            render(
                              eligibleParticipants,
                              allFish,
                              winners
                            );
                          },
                          error => {
                            console.error(
                              "[BigFish] weighings error:",
                              error
                            );

                            tbody.innerHTML =
                              `<tr>
                                <td colspan="4">
                                  Помилка читання weighings.
                                </td>
                              </tr>`;
                          }
                        );

                    /*
                     * Важливо показати учасника
                     * одразу навіть до появи риби.
                     */
                    if (
                      !eligibleParticipants.size
                    ) {
                      render(
                        eligibleParticipants,
                        [],
                        {
                          day1: null,
                          day2: null,
                          overall: null
                        }
                      );
                    }
                  },
                  error => {
                    console.error(
                      "[BigFish] registrations error:",
                      error
                    );

                    if (countEl) {
                      countEl.textContent =
                        "Учасників: 0";
                    }

                    tbody.innerHTML =
                      `<tr>
                        <td colspan="4">
                          Помилка читання registrations.
                        </td>
                      </tr>`;
                  }
                );
          },
          error => {
            console.error(
              "[BigFish] settings/app error:",
              error
            );

            if (countEl) {
              countEl.textContent =
                "Учасників: 0";
            }

            tbody.innerHTML =
              `<tr>
                <td colspan="4">
                  Помилка налаштувань.
                </td>
              </tr>`;
          }
        );
  }

  // =========================================================
  // START
  // =========================================================

  if (isOpen) {
    startSubscribe();
  }

  window.addEventListener(
    "beforeunload",
    () => {
      stopAllStageSubs();

      if (unsubSettings) {
        unsubSettings();

        unsubSettings =
          null;
      }
    }
  );

})();

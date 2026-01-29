// assets/js/bigfish_total_live.js
// STOLAR CARP • BigFish Total (public) — optimized with liveCache
// Джерело учасників: public_participants (bigFishTotal=true)
// Джерело результатів: liveCache/{stageId}.bigFishTotal
// Логіка 3 призів збережена: Overall, Day1, Day2 — 3 різні риби

(function () {
  "use strict";

  const btn     = document.getElementById("toggleBigFishBtn");
  const wrap    = document.getElementById("bigFishWrap");
  const tbody   = document.querySelector("#bigFishTable tbody");
  const countEl = document.getElementById("bfCount");

  if (!btn || !wrap || !tbody) return;

  const db = window.scDb;
  if (!db) {
    console.error("[BigFish] Firebase not loaded");
    return;
  }

  // ===== UI toggle =====
  function setOpen(isOpen) {
    wrap.hidden = !isOpen;
    btn.setAttribute("aria-expanded", String(isOpen));
    btn.textContent = isOpen ? "Сховати BigFish Total" : "BigFish Total";
  }

  let isOpen = localStorage.getItem("bf-is-open") === "1";
  setOpen(isOpen);

  btn.addEventListener("click", () => {
    isOpen = !isOpen;
    localStorage.setItem("bf-is-open", isOpen ? "1" : "0");
    setOpen(isOpen);
    if (isOpen) startSubscribe();
  });

  // ===== Helpers =====
  const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const fmtKg = (n) => (Number.isFinite(n) && n > 0 ? n.toFixed(2) : "—");

  function readStageFromApp(app) {
    const compId  = app?.activeCompetitionId || app?.competitionId || "";
    const stageId = app?.activeStageId || app?.stageId || "";
    return { 
      compId: String(compId || ""), 
      stageId: String(stageId || "") 
    };
  }

  // ===== Render from cache =====
  function renderFromCache(bfData, eligibleMap) {
    const table = bfData?.table || [];
    const winners = bfData?.winners || {};

    // Фільтруємо тільки eligible команди
    const filtered = table.filter(row => eligibleMap.has(row.teamId));

    if (countEl) {
      countEl.textContent = `Учасників: ${eligibleMap.size} / Таблиця: ${filtered.length}`;
    }

    if (!eligibleMap.size) {
      tbody.innerHTML = `<tr><td colspan="4">Немає учасників BigFish Total.</td></tr>`;
      return;
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="4">Учасники підтверджені, але уловів ще нема.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(row => {
      const day1Cell = row.isDay1Winner 
        ? `<strong>${fmtKg(row.day1)}</strong> 🏆`
        : fmtKg(row.day1);

      const day2Cell = row.isDay2Winner
        ? `<strong>${fmtKg(row.day2)}</strong> 🏆`
        : fmtKg(row.day2);

      const overallCell = row.isOverallWinner
        ? `<strong>${fmtKg(row.overall)}</strong> 🏆`
        : `<strong>${fmtKg(row.overall)}</strong>`;

      return `
        <tr class="${row.isOverallWinner ? 'bigfish-row--max' : ''}">
          <td>${fmt(row.teamName)}</td>
          <td>${day1Cell}</td>
          <td>${day2Cell}</td>
          <td>${overallCell}</td>
        </tr>
      `;
    }).join('');
  }

  // ===== Subscriptions =====
  let started = false;
  let unsubSettings = null;
  let unsubPublic = null;
  let unsubCache = null;

  let currentStageId = "";
  let eligibleTeams = new Map();

  function stopAllSubs() {
    if (unsubPublic) { unsubPublic(); unsubPublic = null; }
    if (unsubCache) { unsubCache(); unsubCache = null; }
  }

  function startSubscribe() {
    if (started) return;
    started = true;

    unsubSettings = db.collection("settings").doc("app").onSnapshot(
      (snap) => {
        const app = snap.exists ? (snap.data() || {}) : {};
        const { compId, stageId } = readStageFromApp(app);

        if (!compId || !stageId) {
          if (countEl) countEl.textContent = `Учасників: 0`;
          tbody.innerHTML = `<tr><td colspan="4">Немає активного етапу.</td></tr>`;
          stopAllSubs();
          return;
        }

        // Не перепідписуємось якщо етап не змінився
        if (stageId === currentStageId) return;
        currentStageId = stageId;

        stopAllSubs();

        // 1️⃣ Підписка на public_participants (eligible teams)
        unsubPublic = db.collection("public_participants")
          .where("competitionId", "==", compId)
          .where("stageId", "==", stageId)
          .where("bigFishTotal", "==", true)
          .onSnapshot(
            (qs) => {
              eligibleTeams = new Map();
              qs.forEach(doc => {
                const d = doc.data();
                if (d.teamId) {
                  eligibleTeams.set(d.teamId, d.teamName || "—");
                }
              });

              // Якщо кеш вже завантажений — рендеримо
              if (unsubCache) {
                // Тригериться оновленням кешу
              }
            },
            (err) => {
              console.error("[BigFish] public_participants error:", err);
              tbody.innerHTML = `<tr><td colspan="4">Помилка завантаження учасників.</td></tr>`;
            }
          );

        // 2️⃣ Підписка на liveCache (результати)
        unsubCache = db.collection("liveCache").doc(stageId)
          .onSnapshot(
            (doc) => {
              if (!doc.exists) {
                tbody.innerHTML = `<tr><td colspan="4">Дані завантажуються...</td></tr>`;
                return;
              }

              const data = doc.data();
              const bf = data?.bigFishTotal;

              if (!bf?.enabled) {
                tbody.innerHTML = `<tr><td colspan="4">BigFish Total не активний для цього етапу.</td></tr>`;
                return;
              }

              renderFromCache(bf, eligibleTeams);
            },
            (err) => {
              console.error("[BigFish] liveCache error:", err);
              tbody.innerHTML = `<tr><td colspan="4">Помилка завантаження результатів.</td></tr>`;
            }
          );
      },
      (err) => {
        console.error("[BigFish] settings error:", err);
        tbody.innerHTML = `<tr><td colspan="4">Помилка налаштувань.</td></tr>`;
      }
    );
  }

  // Auto-start if open
  if (isOpen) startSubscribe();

})();

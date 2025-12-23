// assets/js/bigfish_total_live.js
// STOLAR CARP • BigFish Total (public)
// - одна відповідальність: toggle + підписка на stageResults
// - читає активний етап із settings/app
// - показує bigFishTotal з stageResults/{activeStageDocId}

(function () {
  "use strict";

  const db = window.scDb;
  if (!db) return;

  const btn      = document.getElementById("toggleBigFishBtn");
  const wrap     = document.getElementById("bigFishWrap");
  const tbody    = document.querySelector("#bigFishTable tbody");
  const countEl  = document.getElementById("bfCount");

  if (!btn || !wrap || !tbody) return;

  const fmt = (v) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  let started = false;
  let unsubSettings = null;
  let unsubStage = null;

  function stopStageSub() {
    if (unsubStage) {
      unsubStage();
      unsubStage = null;
    }
  }

  // Отримати ID документа stageResults
  function stageDocIdFromApp(app) {
    const key = app?.activeKey || app?.activeStageKey || "";
    if (key) return String(key);

    const compId  = app?.activeCompetitionId || app?.competitionId || "";
    const stageId = app?.activeStageId || app?.stageId || "";

    if (compId && stageId) return `${compId}||${stageId}`;
    if (compId && !stageId) return `${compId}||`;
    return "";
  }

  function render(list) {
    const arr = Array.isArray(list) ? list : [];

    if (countEl) {
      countEl.textContent = `Учасників: ${arr.length || 0}`;
    }

    if (!arr.length) {
      tbody.innerHTML =
        `<tr><td colspan="4">Немає учасників BigFish Total або ще нема даних.</td></tr>`;
      return;
    }

    tbody.innerHTML = arr
      .map((row) => {
        const team  = row.team || row.teamName || "—";
        const big1  = row.big1Day ?? row.day1 ?? row.bigDay1 ?? "—";
        const big2  = row.big2Day ?? row.day2 ?? row.bigDay2 ?? "—";
        const max   = row.maxBig ?? row.max ?? row.maxBIG ?? "—";
        const isMax = !!row.isMax;

        return `
          <tr class="${isMax ? "bigfish-row--max" : ""}">
            <td>${fmt(team)}</td>
            <td>${fmt(big1)}</td>
            <td>${fmt(big2)}</td>
            <td><strong>${fmt(max)}</strong>${isMax ? " 🏆" : ""}</td>
          </tr>
        `;
      })
      .join("");
  }

  function startSubscribe() {
    if (started) return;
    started = true;

    unsubSettings = db
      .collection("settings")
      .doc("app")
      .onSnapshot(
        (snap) => {
          const app = snap.exists ? snap.data() || {} : {};
          const docId = stageDocIdFromApp(app);

          stopStageSub();

          if (!docId) {
            render([]);
            return;
          }

          unsubStage = db
            .collection("stageResults")
            .doc(docId)
            .onSnapshot(
              (s) => {
                if (!s.exists) {
                  render([]);
                  return;
                }
                const data = s.data() || {};
                render(data.bigFishTotal || data.bigFish || []);
              },
              (err) => {
                console.error("[BigFish] stageResults error:", err);
                render([]);
              }
            );
        },
        (err) => {
          console.error("[BigFish] settings/app error:", err);
          render([]);
        }
      );
  }

  // Натискання на кнопку: відкриваємо/ховаємо панель + стартуємо підписку при першому відкритті
  btn.addEventListener("click", () => {
    wrap.classList.toggle("is-open");
    if (wrap.classList.contains("is-open")) {
      startSubscribe();
    }
  });

  // Якщо раптом уже відкрито при завантаженні
  if (wrap.classList.contains("is-open")) {
    startSubscribe();
  }
})();

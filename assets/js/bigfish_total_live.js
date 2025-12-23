// assets/js/bigfish_total_live.js
// STOLAR CARP • BigFish Total (public)
// ✅ одна відповідальність: toggle + підписка на stageResults
// ✅ читає активний етап із settings/app (activeKey = "compId||stageKey")
// ✅ ID документа stageResults: "compId__stageKey" (подвійне підкреслення)
// ✅ показує:
//    - якщо є stageResults.bigFishTotal → повноцінні результати (1 доба / 2 доба / MAX)
//    - якщо bigFishTotal ще нема, але є teams[].bigFishTotal == true → список учасників з прочерками

(function () {
  "use strict";

  const db = window.scDb;
  if (!db) return;

  const btn     = document.getElementById("toggleBigFishBtn");
  const wrap    = document.getElementById("bigFishWrap");
  const tbody   = document.querySelector("#bigFishTable tbody");
  const countEl = document.getElementById("bfCount");

  if (!btn || !wrap || !tbody) return;

  const fmt = (v) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  let started       = false;
  let unsubSettings = null;
  let unsubStage    = null;

  function stopStageSub() {
    if (unsubStage) {
      unsubStage();
      unsubStage = null;
    }
  }

  // Той самий формат, що й у live_firebase.js:
  // settings/app.activeKey = "compId||stageKey" -> stageResults docId = "compId__stageKey"
  function stageDocIdFromApp(app) {
    const keyRaw = app?.activeKey || app?.activeStageKey || "";
    if (keyRaw) {
      const [compId, stageKeyRaw] = String(keyRaw).split("||");
      const comp  = (compId || "").trim();
      const stage = (stageKeyRaw || "").trim();
      if (!comp) return "";
      return stage ? `${comp}__${stage}` : `${comp}__main`;
    }

    const compId  = (app?.activeCompetitionId || app?.competitionId || "").trim();
    const stageId = (app?.activeStageId || app?.stageId || "").trim();
    if (!compId) return "";
    return stageId ? `${compId}__${stageId}` : `${compId}__main`;
  }

  // Нормалізація 1 рядка BigFish
  function normBigFishRow(row) {
    const team = row.team || row.teamName || "—";

    const big1 = row.big1Day ?? row.day1 ?? row.bigDay1 ?? "—";
    const big2 = row.big2Day ?? row.day2 ?? row.bigDay2 ?? "—";

    const max =
      row.teamMaxBig ??
      row.maxBig ??
      row.maxBIG ??
      row.max ??
      "—";

    const isMax = !!row.isMax;

    return { team, big1, big2, max, isMax };
  }

  function render(list, teamsFallback) {
    let arr = [];

    // 1) Якщо є повноцінний масив bigFishTotal з результатами — використовуємо його
    if (Array.isArray(list) && list.length) {
      arr = list.map(normBigFishRow);
    }
    // 2) Інакше, якщо є teams[] з жеребкування, показуємо тільки учасників (галочка bigFishTotal)
    else if (Array.isArray(teamsFallback) && teamsFallback.length) {
      const participants = teamsFallback.filter(
        (t) => !!t.bigFishTotal || !!t.bigFish || !!t.bigFishOpt
      );

      arr = participants.map((t) =>
        normBigFishRow({
          team: t.teamName || t.team || "—",
          big1Day: "—",
          big2Day: "—",
          teamMaxBig: "—",
          isMax: false
        })
      );
    }

    if (countEl) {
      countEl.textContent = `Учасників: ${arr.length || 0}`;
    }

    if (!arr.length) {
      tbody.innerHTML =
        `<tr><td colspan="4">Немає учасників BigFish Total або ще нема даних.</td></tr>`;
      return;
    }

    tbody.innerHTML = arr
      .map((r) => {
        return `
          <tr class="${r.isMax ? "bigfish-row--max" : ""}">
            <td>${fmt(r.team)}</td>
            <td>${fmt(r.big1)}</td>
            <td>${fmt(r.big2)}</td>
            <td><strong>${fmt(r.max)}</strong>${r.isMax ? " 🏆" : ""}</td>
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
            render([], []);
            return;
          }

          unsubStage = db
            .collection("stageResults")
            .doc(docId)
            .onSnapshot(
              (s) => {
                if (!s.exists) {
                  render([], []);
                  return;
                }
                const data = s.data() || {};

                const list  = data.bigFishTotal || data.bigFish || [];
                const teams = Array.isArray(data.teams) ? data.teams : [];

                render(list, teams);
              },
              (err) => {
                console.error("[BigFish] stageResults error:", err);
                render([], []);
              }
            );
        },
        (err) => {
          console.error("[BigFish] settings/app error:", err);
          render([], []);
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

  // Якщо вже відкрито при завантаженні (раптом додаси клас is-open у HTML)
  if (wrap.classList.contains("is-open")) {
    startSubscribe();
  }
})();

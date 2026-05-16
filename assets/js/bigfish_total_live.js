// assets/js/bigfish_total_live.js
// STOLAR CARP • BigFish Total (public)
// Джерело риб: collection "weighings" (weights[] + weighNo)
// Фільтр учасників: collection "registrations" (status="confirmed" + bigFishTotal=true)
// Призи: Day1 (W1-2), Day2 (W3-4), Overall (W1-4)
// 3 призи = 3 різні риби. Overall-риба не може забрати приз своєї доби.

(function () {
  "use strict";

  const btn     = document.getElementById("toggleBigFishBtn");
  const wrap    = document.getElementById("bigFishWrap");
  const tbody   = document.querySelector("#bigFishTable tbody");
  const countEl = document.getElementById("bfCount");

  if (!btn || !wrap || !tbody) return;

  // ===== UI toggle (через hidden) =====
  function setOpen(isOpen) {
    // isOpen=true => показати (hidden прибрати)
    wrap.hidden = !isOpen;

    // доступність + текст
    btn.setAttribute("aria-expanded", String(isOpen));
    btn.textContent = isOpen ? "Сховати BigFish Total" : "BigFish Total";
  }

  let isOpen = localStorage.getItem("bf-is-open") === "1";
  setOpen(isOpen);

  btn.addEventListener("click", () => {
    isOpen = !isOpen;
    localStorage.setItem("bf-is-open", isOpen ? "1" : "0");
    setOpen(isOpen);
    if (isOpen) startSubscribe(); // перше відкриття — старт підписок
  });

  // ===== Firestore =====
  const db = window.scDb;
  if (!db) return;

  const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const fmtKg = (n) => (Number.isFinite(n) && n > 0 ? n.toFixed(2) : "—");

  function readStageFromApp(app) {
    const compId  = app?.activeCompetitionId || app?.competitionId || "";
    const stageId = app?.activeStageId || app?.stageId || "";
    return { compId: String(compId || ""), stageId: String(stageId || "") };
  }

  // ===== логіка 3 призів (3 різні риби) =====
  function byWeightDesc(a, b) { return b.weight - a.weight; }

  function pickBest(list, excludedIds) {
    const arr = (Array.isArray(list) ? list : []).filter(x => x && x.weight > 0);
    arr.sort(byWeightDesc);
    for (const c of arr) {
      if (!excludedIds.has(c.fishId)) return c;
    }
    return null;
  }

  function computeWinners(allFish) {
    const excluded = new Set();

    // Overall (W1-4)
    const overall = pickBest(allFish, excluded);
    if (overall) excluded.add(overall.fishId);

    // Day1 (W1-2), без overall-риби
    const day1 = pickBest(allFish.filter(f => f.day === 1), excluded);
    if (day1) excluded.add(day1.fishId);

    // Day2 (W3-4), без overall-риби
    const day2 = pickBest(allFish.filter(f => f.day === 2), excluded);
    if (day2) excluded.add(day2.fishId);

    return { day1, day2, overall };
  }

  // ===== рендер таблиці BigFish Total =====
  function render(eligibleTeamsMap, allFish, winners) {
    const eligibleCount = eligibleTeamsMap.size;
    if (countEl) countEl.textContent = `Учасників: ${eligibleCount}`;

    if (!eligibleCount) {
      tbody.innerHTML = `<tr><td colspan="4">Немає підтверджених учасників BigFish Total.</td></tr>`;
      return;
    }

    // per-team max по Day1/Day2/Overall
    const perTeam = new Map(); // teamId -> {teamName, d1, d2, all}
    for (const [teamId, teamName] of eligibleTeamsMap.entries()) {
      perTeam.set(teamId, { teamId, teamName, d1: 0, d2: 0, all: 0 });
    }

    for (const f of allFish) {
      const t = perTeam.get(f.teamId);
      if (!t) continue;
      t.all = Math.max(t.all, f.weight);
      if (f.day === 1) t.d1 = Math.max(t.d1, f.weight);
      if (f.day === 2) t.d2 = Math.max(t.d2, f.weight);
    }

    const list = Array.from(perTeam.values())
      .sort((a, b) => (b.all - a.all) || (b.d1 - a.d1) || (b.d2 - a.d2));

    const wOverallTeam = winners?.overall?.teamId || "";
    const wDay1Team    = winners?.day1?.teamId || "";
    const wDay2Team    = winners?.day2?.teamId || "";

    const wOverallW = winners?.overall?.weight ?? null;
    const wDay1W    = winners?.day1?.weight ?? null;
    const wDay2W    = winners?.day2?.weight ?? null;

    // якщо риб ще нема — покажемо текст, але учасники є
    if (!allFish.length) {
      tbody.innerHTML = `<tr><td colspan="4">Учасники підтверджені, але уловів BigFish Total ще нема.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(t => {
      const day1Cell = (t.teamId === wDay1Team && wDay1W !== null)
        ? `<strong>${fmtKg(wDay1W)}</strong> 🏆`
        : fmtKg(t.d1);

      const day2Cell = (t.teamId === wDay2Team && wDay2W !== null)
        ? `<strong>${fmtKg(wDay2W)}</strong> 🏆`
        : fmtKg(t.d2);

      const overallCell = (t.teamId === wOverallTeam && wOverallW !== null)
        ? `<strong>${fmtKg(wOverallW)}</strong> 🏆`
        : `<strong>${fmtKg(t.all)}</strong>`;

      const isMaxRow = (t.teamId === wOverallTeam);

      return `
        <tr class="${isMaxRow ? "bigfish-row--max" : ""}">
          <td>${fmt(t.teamName)}</td>
          <td>${day1Cell}</td>
          <td>${day2Cell}</td>
          <td>${overallCell}</td>
        </tr>
      `;
    }).join("");
  }

  // ===== підписки Firestore =====
  let started = false;
  let unsubSettings = null;
  let unsubRegs = null;
  let unsubWeigh = null;

  function stopAllStageSubs() {
    if (unsubRegs)  { unsubRegs();  unsubRegs = null; }
    if (unsubWeigh) { unsubWeigh(); unsubWeigh = null; }
  }

  function startSubscribe() {
    if (started) return;
    started = true;

    unsubSettings = db.collection("settings").doc("app").onSnapshot(
      (snap) => {
        const app = snap.exists ? (snap.data() || {}) : {};
        const { compId, stageId } = readStageFromApp(app);

        stopAllStageSubs();

        if (!compId || !stageId) {
          if (countEl) countEl.textContent = `Учасників: 0`;
          tbody.innerHTML = `<tr><td colspan="4">Немає активного етапу (compId/stageId).</td></tr>`;
          return;
        }

        // 1) confirmed + bigFishTotal=true (або bigfishTotal)
        unsubRegs = db.collection("registrations")
          .where("competitionId", "==", compId)
          .where("stageId", "==", stageId)
          .where("status", "==", "confirmed")
          .onSnapshot(
            (qs) => {
              const eligibleTeams = new Map(); // teamId -> teamName

              qs.forEach(doc => {
                const r = doc.data() || {};
                const flag = (r.bigFishTotal === true) || (r.bigfishTotal === true);
                if (!flag) return;

                const teamId = String(r.teamId || "");
                const teamName = String(r.teamName || "—");
                if (teamId) eligibleTeams.set(teamId, teamName);
              });

              // 2) weighings цього етапу, фільтр по eligibleTeams
              if (unsubWeigh) { unsubWeigh(); unsubWeigh = null; }

              unsubWeigh = db.collection("weighings")
                .where("compId", "==", compId)
                .where("stageId", "==", stageId)
                .onSnapshot(
                  (wqs) => {
                    const allFish = [];

                    wqs.forEach(d => {
                      const w = d.data() || {};
                      const teamId = String(w.teamId || "");
                      if (!teamId || !eligibleTeams.has(teamId)) return;

                      const weighNo = Number(w.weighNo || 0);
                      if (!(weighNo >= 1 && weighNo <= 4)) return;

                      const day = weighNo <= 2 ? 1 : 2;
                      const teamName = String(w.teamName || eligibleTeams.get(teamId) || "—");

                      const weights = Array.isArray(w.weights) ? w.weights : [];
                      weights.forEach((val, idx) => {
                        const weight = Number(val);
                        if (!Number.isFinite(weight) || weight <= 0) return;

                        allFish.push({
                          fishId: `${d.id}::${idx}`, // унікально => 1 риба не бере 2 призи
                          teamId,
                          teamName,
                          weighNo,
                          day,
                          weight
                        });
                      });
                    });

                    const winners = computeWinners(allFish);
                    render(eligibleTeams, allFish, winners);
                  },
                  (err) => {
                    console.error("[BigFish] weighings error:", err);
                    if (countEl) countEl.textContent = `Учасників: 0`;
                    tbody.innerHTML = `<tr><td colspan="4">Помилка читання weighings.</td></tr>`;
                  }
                );
            },
            (err) => {
              console.error("[BigFish] registrations error:", err);
              if (countEl) countEl.textContent = `Учасників: 0`;
              tbody.innerHTML = `<tr><td colspan="4">Помилка читання registrations.</td></tr>`;
            }
          );
      },
      (err) => {
        console.error("[BigFish] settings/app error:", err);
        if (countEl) countEl.textContent = `Учасників: 0`;
        tbody.innerHTML = `<tr><td colspan="4">Помилка налаштувань.</td></tr>`;
      }
    );
  }

  // Якщо таблиця відкрита з localStorage — одразу підписуємось
  if (isOpen) startSubscribe();
})();

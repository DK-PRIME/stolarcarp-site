// assets/js/bigfish_total.js
// STOLAR CARP • BigFish Total (Live)
// - participants: registrations where bigFishTotal == true
// - Day1 = weighings 1-2, Day2 = weighings 3-4
// - MAX BIG winner cannot win Day1/Day2 prizes
(function () {
  "use strict";

  const db = window.scDb;

  const tbody = document.getElementById("bigfishTotalBody");
  const winnersEl = document.getElementById("bigfishWinners");

  if (!db || !window.firebase || !tbody) return;

  const norm = (v) => String(v ?? "").trim();

  // ---------- Як визначаємо активний етап ----------
  // 1) з URL ?competitionId=...&stageId=...
  // 2) або з settings/app (activeCompetitionId, activeStageId)
  function getQS(name) {
    const u = new URL(location.href);
    return u.searchParams.get(name);
  }

  async function getActiveStage() {
    const qsComp = getQS("competitionId") || getQS("compId");
    const qsStage = getQS("stageId") || getQS("stageKey");

    if (qsComp) return { competitionId: norm(qsComp), stageId: norm(qsStage || "") || null };

    // settings/app
    const snap = await db.collection("settings").doc("app").get();
    const s = snap.exists ? (snap.data() || {}) : {};
    const competitionId = norm(s.activeCompetitionId || s.activeCompId || s.activeCompetition || "");
    const stageId = norm(s.activeStageId || s.activeStageKey || s.activeStage || "") || null;

    return { competitionId, stageId };
  }

  // ---------- Витяг ваги з будь-якого формату ----------
  // Підтримує:
  // - bigFishKg / bigFish / maxFish / biggestFishKg
  // - fishWeights / fish / fishes (масив чисел або об'єктів)
  // - якщо ваги вводили "в грамах" (7890) -> 7.890 кг
  function toKg(x) {
    if (x == null) return null;

    // string: "7,890" / "7.890" / "7890"
    if (typeof x === "string") {
      let s = x.trim().replace(",", ".").replace(/\s+/g, "");
      if (!s) return null;
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      // якщо дуже велике — це грами
      if (n > 100) return n / 1000;
      return n;
    }

    if (typeof x === "number") {
      if (!Number.isFinite(x)) return null;
      if (x > 100) return x / 1000;
      return x;
    }

    return null;
  }

  function getWeighNo(d) {
    const v = d.weighNo ?? d.weighingNo ?? d.weighing ?? d.w ?? d.index ?? d.weighIndex;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  function getTeamId(d) {
    return norm(d.teamId || d.teamID || d.team || d.teamUid || d.team_id || "");
  }

  function getTeamName(d) {
    return norm(d.teamName || d.team || d.name || "");
  }

  function getStageFromDoc(d) {
    return {
      competitionId: norm(d.competitionId || d.compId || d.competition || d.seasonId || d.season || ""),
      stageId: norm(d.stageId || d.stageKey || d.stage || d.eventId || d.eventKey || "") || null
    };
  }

  function extractBiggestFishKg(d) {
    // 1) пряме поле "biggest"
    const direct =
      toKg(d.bigFishKg) ??
      toKg(d.bigFish) ??
      toKg(d.biggestFishKg) ??
      toKg(d.maxFishKg) ??
      toKg(d.maxFish);

    if (direct != null) return direct;

    // 2) масиви (числа або об'єкти)
    const arr =
      d.fishWeights ||
      d.fishes ||
      d.fish ||
      d.fishList ||
      d.items ||
      null;

    if (Array.isArray(arr) && arr.length) {
      let max = null;
      for (const it of arr) {
        const w =
          toKg(it?.kg) ??
          toKg(it?.w) ??
          toKg(it?.weight) ??
          toKg(it?.weightKg) ??
          toKg(it);
        if (w != null && (max == null || w > max)) max = w;
      }
      return max;
    }

    return null;
  }

  function fmtKg(x) {
    if (x == null) return "—";
    return `${x.toFixed(3)}`; // 3 знаки як у тебе
  }

  // ---------- Основна логіка призів ----------
  // day1Winner/day2Winner беруться з учасників total, але
  // overallWinner НЕ може бути day1/day2.
  function pickWinnerFromList(list, excludedTeamId) {
    // list: [{teamId, teamName, kg, weighNo}]
    const filtered = excludedTeamId ? list.filter(x => x.teamId !== excludedTeamId) : list.slice();
    filtered.sort((a, b) => (b.kg - a.kg));
    return filtered.length ? filtered[0] : null;
  }

  async function loadBigFishTotal() {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Завантаження…</td></tr>`;
    if (winnersEl) winnersEl.textContent = "";

    const { competitionId, stageId } = await getActiveStage();
    if (!competitionId) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Нема активного змагання/етапу.</td></tr>`;
      return;
    }

    // 1) Учасники BigFishTotal з registrations
    let regsQ = db.collection("registrations")
      .where("competitionId", "==", competitionId)
      .where("bigFishTotal", "==", true);

    // якщо stageId є — фільтруємо
    if (stageId) regsQ = regsQ.where("stageId", "==", stageId);

    const regsSnap = await regsQ.get();

    const participants = [];
    regsSnap.forEach(doc => {
      const d = doc.data() || {};
      const teamId = norm(d.teamId || "");
      const teamName = norm(d.teamName || "");
      if (teamId || teamName) {
        participants.push({
          teamId: teamId || doc.id,      // fallback
          teamName: teamName || teamId,  // fallback
        });
      }
    });

    if (!participants.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Поки що немає зафіксованих учасників BigFish Total.</td></tr>`;
      return;
    }

    // 2) Зчитуємо weighings цього етапу (одним махом)
    // Правила дозволяють read для всіх, ок.
    // Ми беремо тільки ті доки, що match competitionId/stageId.
    let wQ = db.collection("weighings")
      .where("competitionId", "==", competitionId);

    if (stageId) wQ = wQ.where("stageId", "==", stageId);

    const wSnap = await wQ.get();

    // 3) Побудова максимумів по команді
    const partById = new Map(participants.map(p => [p.teamId, p.teamName]));

    // day1Candidates/day2Candidates/allCandidates: по одній найкращій рибі команди (для кандидата)
    const bestDay1 = new Map(); // teamId -> {kg, weighNo}
    const bestDay2 = new Map();
    const bestAll  = new Map();

    wSnap.forEach(doc => {
      const d = doc.data() || {};
      const st = getStageFromDoc(d);
      if (norm(st.competitionId) !== norm(competitionId)) return;
      if (stageId && norm(st.stageId) !== norm(stageId)) return;

      const teamId = getTeamId(d);
      if (!teamId) return;

      // тільки учасники BigFishTotal
      if (!partById.has(teamId)) return;

      const weighNo = getWeighNo(d);
      if (!weighNo) return;

      const bigKg = extractBiggestFishKg(d);
      if (bigKg == null) return;

      // all
      const curAll = bestAll.get(teamId);
      if (!curAll || bigKg > curAll.kg) bestAll.set(teamId, { kg: bigKg, weighNo });

      // day1/day2
      if (weighNo === 1 || weighNo === 2) {
        const cur = bestDay1.get(teamId);
        if (!cur || bigKg > cur.kg) bestDay1.set(teamId, { kg: bigKg, weighNo });
      } else if (weighNo === 3 || weighNo === 4) {
        const cur = bestDay2.get(teamId);
        if (!cur || bigKg > cur.kg) bestDay2.set(teamId, { kg: bigKg, weighNo });
      }
    });

    // 4) Формуємо рядки таблиці для всіх учасників (навіть якщо ще 0 даних)
    const rows = participants.map(p => {
      const d1 = bestDay1.get(p.teamId);
      const d2 = bestDay2.get(p.teamId);
      const all = bestAll.get(p.teamId);

      return {
        teamId: p.teamId,
        teamName: p.teamName,
        d1kg: d1?.kg ?? null,
        d2kg: d2?.kg ?? null,
        allkg: all?.kg ?? null,
        allWeighNo: all?.weighNo ?? null
      };
    });

    // 5) Визначаємо переможця MAX BIG
    const allCand = rows
      .filter(r => r.allkg != null)
      .map(r => ({ teamId: r.teamId, teamName: r.teamName, kg: r.allkg, weighNo: r.allWeighNo }));

    allCand.sort((a, b) => b.kg - a.kg);
    const overall = allCand.length ? allCand[0] : null;
    const overallTeamId = overall?.teamId || null;

    // 6) Day1/Day2 переможці (виключаємо overall з обох)
    const day1List = rows
      .filter(r => r.d1kg != null)
      .map(r => ({ teamId: r.teamId, teamName: r.teamName, kg: r.d1kg, weighNo: 0 }));
    const day2List = rows
      .filter(r => r.d2kg != null)
      .map(r => ({ teamId: r.teamId, teamName: r.teamName, kg: r.d2kg, weighNo: 0 }));

    const day1Winner = pickWinnerFromList(day1List, overallTeamId);
    const day2Winner = pickWinnerFromList(day2List, overallTeamId);

    // 7) Сортування таблиці: спочатку MAX BIG (desc), потім day1, потім day2
    rows.sort((a, b) => {
      const A = a.allkg ?? -1;
      const B = b.allkg ?? -1;
      if (B !== A) return B - A;
      const A1 = a.d1kg ?? -1, B1 = b.d1kg ?? -1;
      if (B1 !== A1) return B1 - A1;
      const A2 = a.d2kg ?? -1, B2 = b.d2kg ?? -1;
      return B2 - A2;
    });

    // 8) Рендер
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><b>${escapeHtml(r.teamName)}</b></td>
        <td>${fmtKg(r.d1kg)}</td>
        <td>${fmtKg(r.d2kg)}</td>
        <td><b>${fmtKg(r.allkg)}</b></td>
      </tr>
    `).join("");

    // 9) Підсумок переможців
    if (winnersEl) {
      const w1 = day1Winner ? `${day1Winner.teamName} — ${fmtKg(day1Winner.kg)}` : "—";
      const w2 = day2Winner ? `${day2Winner.teamName} — ${fmtKg(day2Winner.kg)}` : "—";
      const wAll = overall ? `${overall.teamName} — ${fmtKg(overall.kg)}` : "—";

      winnersEl.innerHTML = `
        <div style="display:grid;gap:6px;margin-top:6px;">
          <div>🏆 <b>1 доба</b>: ${escapeHtml(w1)}</div>
          <div>🏆 <b>2 доба</b>: ${escapeHtml(w2)}</div>
          <div>👑 <b>MAX BIG</b>: ${escapeHtml(wAll)}</div>
          <div class="muted" style="margin-top:4px;">
            Примітка: переможець MAX BIG не може взяти приз 1/2 доби — тому в добі перемагає наступна найбільша риба.
          </div>
        </div>
      `;
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Авто-оновлення: кожні 15 секунд (щоб в лайві підхоплювало)
  let timer = null;
  async function boot() {
    try {
      await loadBigFishTotal();
      timer = setInterval(loadBigFishTotal, 15000);
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Помилка завантаження BigFish Total.</td></tr>`;
    }
  }

  boot();
})();

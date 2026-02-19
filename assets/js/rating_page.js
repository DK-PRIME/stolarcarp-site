/**
 * rating_page.js — Рейтинг сезону STOLAR CARP
 * ✅ season doc: seasons/{seasonId} або competitions/{seasonId} з events:[{key:"stage1"...}]
 * ✅ команди: public_participants (competitionId, stageId, status, teamId, teamName)
 * ✅ результати: public_stageResults або stageResults (авто-підбір docId)
 *
 * Важливо:
 * - data-stages = КІЛЬКІСТЬ ЕТАПІВ СЕЗОНУ (а не finished)
 * - у "Претендентах" нумерація починається з 19, етапи показуються так само як у ТОП-18
 */

(function () {
  'use strict';

  const CONFIG = {
    collections: {
      settings: 'settings',
      seasons: 'seasons',
      competitions: 'competitions',
      publicParticipants: 'public_participants',
      publicStageResults: 'public_stageResults',
      stageResults: 'stageResults',
    },
    docIds: { appSettings: 'app' },
    defaults: {
      finalSpots: 18,
      maxStages: 5, // максимум колонок Е1..Е5 у таблиці
    },
    paidStatuses: ['confirmed', 'paid', 'payment_confirmed'],
  };

  const state = {
    seasonId: null,
    seasonDocPath: null,
    seasonData: null,
    stages: [],              // [{key, idx, startAt, finishAt, isFinished}]
    teams: [],               // [{id,name, regsByStage:Set}]
    stageResults: new Map(), // stageKey -> Map(teamId->result)
    ratingData: [],
    finishedStagesCount: 0,
    seasonStagesCount: 0,    // ✅ СКІЛЬКИ етапів у сезоні (events.length, max 5)
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      setRatingError(''); // очистити помилку
      showLoadingState();

      const db = getDb();
      if (!db) throw new Error('Firebase DB не доступний');

      await loadActiveSeasonId(db);
      await loadSeasonDoc(db);
      buildStagesFromSeason();       // ✅ тут ми знаємо seasonStagesCount
      updateStagesAttribute();       // ✅ ставимо data-stages одразу

      await loadTeamsFromPublicParticipants(db);
      await loadResultsForStages(db);

      calculateRatings();
      renderTable();

      console.log(
        `[Rating] season=${state.seasonId} stages=${state.stages.length} teams=${state.teams.length} finished=${state.finishedStagesCount}`
      );
    } catch (err) {
      console.error('[Rating] Помилка:', err);
      setRatingError(`⚠️ Помилка завантаження: ${escapeHtml(safeMsg(err))}`);
      // таблицю не валимо — просто лишається те що було/скелет
    }
  }

  function getDb() {
    return window.firebase?.db || window.db || window.scDb || null;
  }

  function showLoadingState() {
    // показуємо хоча б 0, далі оновимо після buildStagesFromSeason()
    document.body.setAttribute('data-stages', '0');
  }

  // ==================== Active seasonId ====================

  async function loadActiveSeasonId(db) {
    const snap = await db.collection(CONFIG.collections.settings).doc(CONFIG.docIds.appSettings).get();
    if (!snap.exists) throw new Error('Не знайдено settings/app');

    const s = snap.data() || {};
    state.seasonId = s.activeSeasonId || s.activeCompetitionId || s.activeCompId || null;

    if (!state.seasonId) throw new Error('У settings/app не знайдено activeSeasonId/activeCompetitionId');
  }

  // ==================== Season doc ====================

  async function loadSeasonDoc(db) {
    const tryPaths = [
      { col: CONFIG.collections.seasons, doc: state.seasonId },
      { col: CONFIG.collections.competitions, doc: state.seasonId },
    ];

    for (const p of tryPaths) {
      const snap = await db.collection(p.col).doc(p.doc).get();
      if (snap.exists) {
        state.seasonDocPath = `${p.col}/${p.doc}`;
        state.seasonData = snap.data() || {};
        return;
      }
    }

    throw new Error(`Не знайдено документ сезону ${state.seasonId} ні в seasons, ні в competitions`);
  }

  // ==================== Build stages from season.events[] ====================

  function buildStagesFromSeason() {
    const events = Array.isArray(state.seasonData?.events) ? state.seasonData.events : [];

    if (!events.length) {
      state.stages = [];
      state.finishedStagesCount = 0;
      state.seasonStagesCount = 0;
      return;
    }

    const now = Date.now();

    const stages = events
      .map((ev, i) => {
        const key = String(ev.key || ev.stageId || ev.id || `stage${i + 1}`);
        const startAt = parseDateLike(ev.startDate || ev.startAt || ev.start || null);
        const finishAt = parseDateLike(ev.finishDate || ev.finishAt || ev.finish || null);

        const isFinished =
          (String(ev.status || '').toLowerCase() === 'finished') ||
          (!!finishAt && finishAt.getTime() < now);

        const idx = inferStageIndex(key, i);
        return { key, idx, startAt, finishAt, isFinished };
      })
      .sort((a, b) => (a.idx || 999) - (b.idx || 999));

    state.stages = stages;
    state.finishedStagesCount = stages.filter(s => s.isFinished).length;

    // ✅ СКІЛЬКИ етапів у сезоні (для таблиці Е1..Еn)
    state.seasonStagesCount = Math.min(stages.length, CONFIG.defaults.maxStages);
  }

  function inferStageIndex(key, fallbackI) {
    const m = String(key).match(/(\d+)/);
    if (m) return Number(m[1]);
    return fallbackI + 1;
  }

  function parseDateLike(v) {
    if (!v) return null;
    if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v + 'T00:00:00');
    if (typeof v === 'string') {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  // ==================== Teams from public_participants ====================

  async function loadTeamsFromPublicParticipants(db) {
    let snap;

    // Спочатку пробуємо "status in" (краще)
    try {
      snap = await db
        .collection(CONFIG.collections.publicParticipants)
        .where('competitionId', '==', state.seasonId)
        .where('status', 'in', CONFIG.paidStatuses)
        .get();
    } catch (e) {
      console.warn('[Rating] public_participants query with status IN failed, fallback:', safeMsg(e));
      snap = await db
        .collection(CONFIG.collections.publicParticipants)
        .where('competitionId', '==', state.seasonId)
        .get();
    }

    const map = new Map();

    snap.docs.forEach((doc) => {
      const r = doc.data() || {};
      const status = String(r.status || '').toLowerCase();

      // якщо fallback — відсікаємо зайве тут
      if (status && !CONFIG.paidStatuses.includes(status)) return;

      const teamId = r.teamId;
      if (!teamId) return;

      if (!map.has(teamId)) {
        map.set(teamId, {
          id: teamId,
          name: r.teamName || r.name || 'Без назви',
          regsByStage: new Set(),
        });
      }

      const t = map.get(teamId);
      if (r.stageId) t.regsByStage.add(String(r.stageId));
    });

    state.teams = Array.from(map.values());
  }

  // ==================== Results loading ====================

  async function loadResultsForStages(db) {
    state.stageResults.clear();
    if (!state.stages.length) return;

    for (const st of state.stages) {
      const docIds = [
        `${state.seasonId}_${st.key}`,
        `${state.seasonId}__${st.key}`,
        `${state.seasonId}||${st.key}`,
        `${st.key}`,
      ];

      const data = await tryReadStageResult(db, docIds);
      if (data) {
        state.stageResults.set(st.key, normalizeStageTeams(data));
      } else {
        state.stageResults.set(st.key, new Map());
      }
    }
  }

  async function tryReadStageResult(db, docIds) {
    const cols = [CONFIG.collections.publicStageResults, CONFIG.collections.stageResults];

    for (const col of cols) {
      for (const id of docIds) {
        try {
          const snap = await db.collection(col).doc(id).get();
          if (snap.exists) return snap.data() || {};
        } catch (e) {
          // якщо permission — не валимо все, просто пропускаємо цей docId
          const msg = String(e?.message || '');
          if (msg.includes('Missing or insufficient permissions') || msg.toLowerCase().includes('permission')) {
            // просто continue
            continue;
          }
          // інші помилки краще показати
          console.warn('[Rating] stageResults read failed:', safeMsg(e));
        }
      }
    }
    return null;
  }

  function normalizeStageTeams(stageData) {
    const map = new Map();
    if (!stageData) return map;

    const by = stageData.teamsByTeamId;
    if (by && typeof by === 'object' && !Array.isArray(by)) {
      Object.keys(by).forEach((teamId) => map.set(teamId, by[teamId] || {}));
      return map;
    }

    const teams = stageData.teams;

    if (teams && typeof teams === 'object' && !Array.isArray(teams)) {
      Object.keys(teams).forEach((teamId) => map.set(teamId, teams[teamId] || {}));
      return map;
    }

    if (Array.isArray(teams)) {
      teams.forEach((t) => {
        const teamId = t?.teamId || t?.id;
        if (teamId) map.set(String(teamId), t);
      });
    }

    return map;
  }

  // ==================== CALC ====================

  function calculateRatings() {
    const absentByStage = new Map();

    state.stages.forEach((st) => {
      if (!st.isFinished) return;
      const m = state.stageResults.get(st.key) || new Map();
      let maxPlace = 0;

      m.forEach((r) => {
        const p = toNum(r?.place ?? r?.rank);
        if (p && p > maxPlace) maxPlace = p;
      });

      const fallback = Math.max(0, state.teams.length);
      const useMax = maxPlace > 0 ? maxPlace : fallback;
      absentByStage.set(st.key, useMax + 1);
    });

    state.ratingData = state.teams.map((team) => {
      const stageScores = [];
      let totalPoints = 0;
      let totalWeight = 0;
      let maxBigFish = 0;

      state.stages.forEach((st) => {
        const isFinished = !!st.isFinished;
        const absentPoints = absentByStage.get(st.key) ?? (state.teams.length + 1);

        const score = {
          stageKey: st.key,
          stageIndex: st.idx,
          isFinished,
          place: '—',
          points: '—',
          weight: 0,
          bigFish: 0,
          participated: false,
        };

        // якщо етап ще не завершено — показуємо —
        if (!isFinished) {
          stageScores.push(score);
          return;
        }

        const stageMap = state.stageResults.get(st.key) || new Map();
        const tr = stageMap.get(team.id) || null;

        const hasReg = team.regsByStage?.has(st.key);

        if (tr) {
          const placeNum = toNum(tr.place ?? tr.rank);
          const pointsNum = toNum(tr.points);

          score.place = placeNum ?? '—';
          score.points = (pointsNum ?? placeNum ?? absentPoints);

          score.weight = toNum0(tr.totalWeight ?? tr.totalWeightKg ?? tr.weight);
          score.bigFish = toNum0(tr.bigFish ?? tr.bigFishKg);
          score.participated = true;
        } else {
          score.place = '—';
          score.points = absentPoints;
          score.participated = !!hasReg;
        }

        const p = (typeof score.points === 'number' && isFinite(score.points)) ? score.points : absentPoints;
        totalPoints += p;
        totalWeight += score.weight;
        maxBigFish = Math.max(maxBigFish, score.bigFish);

        stageScores.push(score);
      });

      stageScores.sort((a, b) => (a.stageIndex ?? 999) - (b.stageIndex ?? 999));

      return {
        teamId: team.id,
        teamName: team.name,
        stageScores,
        totalPoints,
        totalWeight,
        maxBigFish,
      };
    });

    state.ratingData.sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
      if (a.totalWeight !== b.totalWeight) return b.totalWeight - a.totalWeight;
      return b.maxBigFish - a.maxBigFish;
    });

    state.ratingData.forEach((r, i) => {
      r.seasonPlace = i + 1;
      r.isFinalist = i < CONFIG.defaults.finalSpots;
      r.finalStatus = r.isFinalist ? 'Так' : '—';
    });
  }

  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function toNum0(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // ==================== RENDER ====================

  function renderTable() {
    const topTbody = document.getElementById('season-top');
    const contendersTbody = document.getElementById('season-contenders');

    if (!topTbody || !contendersTbody) return;

    if (!state.ratingData.length) {
      topTbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:20px;opacity:0.7;">
            Поки що немає підтверджених/оплачених команд у сезоні
          </td>
        </tr>
      `;
      contendersTbody.innerHTML = '';
      return;
    }

    const finalists = state.ratingData.filter(r => r.isFinalist);
    const contenders = state.ratingData.filter(r => !r.isFinalist);

    topTbody.innerHTML = finalists.map(r => createRowHTML(r, true)).join('');

    if (contenders.length) {
      contendersTbody.innerHTML = contenders.map(r => createRowHTML(r, false)).join('');
    } else {
      contendersTbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:20px;opacity:0.7;">
            Поки що немає команд поза зоною фіналу
          </td>
        </tr>
      `;
    }
  }

  function createRowHTML(rating, isFinalist) {
    const fmtWeight = (w) => (w > 0 ? w.toFixed(3) : '—');
    const fmtBigFish = (bf) => (bf > 0 ? bf.toFixed(3) : '—');

    const max = CONFIG.defaults.maxStages; // таблиця має Е1..Е5, зайве сховає CSS
    const scores = Array.isArray(rating.stageScores) ? rating.stageScores.slice(0, max) : [];

    const stageCells = scores.map(sc => {
      if (!sc.isFinished) {
        return `<td class="col-stage"><div class="stage-cell"><span class="stage-place">—</span></div></td>`;
      }
      const placeDisplay = (typeof sc.place === 'number') ? sc.place : '—';
      const pointsDisplay = (typeof sc.points === 'number') ? sc.points : '—';
      return `
        <td class="col-stage">
          <div class="stage-cell">
            <span class="stage-place">${placeDisplay}</span>
            <span class="stage-slash">/</span>
            <span class="stage-points">${pointsDisplay}</span>
          </div>
        </td>
      `;
    }).join('');

    const missing = Math.max(0, max - scores.length);
    const emptyCells = Array(missing).fill(
      `<td class="col-stage"><div class="stage-cell"><span class="stage-place">—</span></div></td>`
    ).join('');

    return `
      <tr class="${isFinalist ? 'row-qualified' : ''}">
        <td class="col-place"><span class="place-num">${rating.seasonPlace}</span></td>
        <td class="col-move"><span class="move move--same">—</span></td>
        <td class="col-team">${escapeHtml(rating.teamName)}</td>
        ${stageCells}${emptyCells}
        <td class="col-points"><b>${rating.totalPoints}</b></td>
        <td class="col-final">${rating.finalStatus}</td>
        <td class="col-weight">${fmtWeight(rating.totalWeight)}</td>
        <td class="col-big">${fmtBigFish(rating.maxBigFish)}</td>
      </tr>
    `;
  }

  // ✅ ГОЛОВНЕ: data-stages = кількість етапів сезону (events.length), а не finishedStagesCount
  function updateStagesAttribute() {
    document.body.setAttribute('data-stages', String(state.seasonStagesCount || 0));
  }

  // ==================== UI ====================

  function setRatingError(html) {
    const box = document.getElementById('ratingError');
    if (!box) return;
    if (!html) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  function safeMsg(err) {
    return (err && (err.message || err.code))
      ? `${err.code ? err.code + ': ' : ''}${err.message || ''}`
      : String(err);
  }

  // ==================== PUBLIC API ====================

  window.SeasonRating = {
    refresh: init,
    getState: () => JSON.parse(JSON.stringify(state)),
    getConfig: () => JSON.parse(JSON.stringify(CONFIG)),
  };
})();

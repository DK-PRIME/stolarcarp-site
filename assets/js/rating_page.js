/**
 * rating_page.js — Рейтинг сезону STOLAR CARP (під твою структуру Firestore)
 *
 * ✅ Сезон: document "season-2026" з полем events: [{key:"stage1", startDate:"YYYY-MM-DD", finishDate:"YYYY-MM-DD", ...}, ...]
 * ✅ Реєстрації: collection public_participants (поля competitionId, stageId, status, teamId, teamName)
 * ✅ Результати: stageResults або public_stageResults (авто-підбір docId)
 *
 * Якщо результатів нема або не дозволено читати — сторінка НЕ падає, а показує зрозумілий текст.
 */

(function () {
  'use strict';

  const CONFIG = {
    collections: {
      settings: 'settings',
      seasons: 'seasons',
      competitions: 'competitions',

      // твоє (зі скріну)
      publicParticipants: 'public_participants',

      // результати (може бути так або так)
      publicStageResults: 'public_stageResults',
      stageResults: 'stageResults',
      seasonRating: 'seasonRating',
    },
    docIds: {
      appSettings: 'app',
    },
    defaults: {
      finalSpots: 18,
      maxStages: 5,
    },
  };

  const state = {
    seasonId: null,         // типу "season-2026"
    seasonDocPath: null,    // де реально лежить документ сезону (seasons або competitions)
    seasonData: null,
    stages: [],             // [{ key:"stage1", idx:1, startAt, finishAt, isFinished }]
    teams: [],              // [{ id: teamId, name, regsByStage:Set }]
    stageResults: new Map(),// key(stageKey) -> normalized map by teamId
    ratingData: [],
    finishedStagesCount: 0,
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      showLoadingState();

      const db = getDb();
      if (!db) throw new Error('Firebase DB не доступний');

      await loadActiveSeasonId(db);
      await loadSeasonDoc(db);
      buildStagesFromSeason();
      await loadTeamsFromPublicParticipants(db);
      await loadResultsForStages(db);

      calculateRatings();
      renderTable();
      updateStagesAttribute();

      console.log(
        `[Rating] season=${state.seasonId} stages=${state.stages.length} teams=${state.teams.length} finished=${state.finishedStagesCount}`
      );
    } catch (err) {
      console.error('[Rating] Помилка:', err);
      showError('Не вдалося завантажити рейтинг. Причина: ' + safeMsg(err));
    }
  }

  function getDb() {
    return window.firebase?.db || window.db || window.scDb || null;
  }

  function showLoadingState() {
    document.body.setAttribute('data-stages', '0');
  }

  // ==================== 1) Active seasonId ====================

  async function loadActiveSeasonId(db) {
    const snap = await db.collection(CONFIG.collections.settings).doc(CONFIG.docIds.appSettings).get();
    if (!snap.exists) throw new Error('Не знайдено settings/app');

    const s = snap.data() || {};
    // у тебе може бути activeSeasonId або activeCompetitionId — підстрахуюсь
    state.seasonId = s.activeSeasonId || s.activeCompetitionId || s.activeCompId || null;

    if (!state.seasonId) throw new Error('У settings/app не знайдено activeSeasonId/activeCompetitionId');
  }

  // ==================== 2) Season doc ====================

  async function loadSeasonDoc(db) {
    // ТИПОВО: season лежить або в seasons/{seasonId}, або в competitions/{seasonId}
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

  // ==================== 3) Build stages from season.events[] ====================

  function buildStagesFromSeason() {
    const events = Array.isArray(state.seasonData?.events) ? state.seasonData.events : [];
    if (!events.length) {
      // не валимо, просто буде 0 етапів
      state.stages = [];
      state.finishedStagesCount = 0;
      return;
    }

    // Нормалізуємо
    const now = Date.now();
    const stages = events
      .map((ev, i) => {
        const key = String(ev.key || ev.stageId || ev.id || `stage${i + 1}`);
        const startAt = parseDateLike(ev.startDate || ev.startAt || ev.start || null);
        const finishAt = parseDateLike(ev.finishDate || ev.finishAt || ev.finish || null);

        // finished: якщо є finishAt і вона в минулому (або ev.status=="finished")
        const isFinished = (String(ev.status || '').toLowerCase() === 'finished') ||
          (!!finishAt && finishAt.getTime() < now);

        // індекс для красивого E1..E5
        const idx = inferStageIndex(key, i);

        return { key, idx, startAt, finishAt, isFinished };
      })
      .sort((a, b) => (a.idx || 999) - (b.idx || 999));

    state.stages = stages;
    state.finishedStagesCount = stages.filter(s => s.isFinished).length;
  }

  function inferStageIndex(key, fallbackI) {
    const m = String(key).match(/(\d+)/);
    if (m) return Number(m[1]);
    return fallbackI + 1;
  }

  function parseDateLike(v) {
    if (!v) return null;
    // якщо Timestamp (Firestore)
    if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
    // якщо "YYYY-MM-DD"
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v + 'T00:00:00');
    // якщо ISO
    if (typeof v === 'string') {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  // ==================== 4) Teams from public_participants ====================

  async function loadTeamsFromPublicParticipants(db) {
    // Беремо confirmed команди сезону
    // У тебе поле competitionId = "season-2026"
    let snap;
    try {
      snap = await db
        .collection(CONFIG.collections.publicParticipants)
        .where('competitionId', '==', state.seasonId)
        .where('status', '==', 'confirmed')
        .get();
    } catch (e) {
      // Якщо нема індексу — пробуємо без status і фільтруємо в JS
      console.warn('[Rating] public_participants query with status failed, fallback:', safeMsg(e));
      snap = await db
        .collection(CONFIG.collections.publicParticipants)
        .where('competitionId', '==', state.seasonId)
        .get();
    }

    const map = new Map();

    snap.docs.forEach((doc) => {
      const r = doc.data() || {};
      const status = String(r.status || '');
      if (status && status !== 'confirmed') return; // якщо fallback — відсіюємо тут

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

  // ==================== 5) Results loading ====================

  async function loadResultsForStages(db) {
    state.stageResults.clear();

    // Якщо команд 0 — не валимо, просто не буде що рахувати
    if (!state.stages.length) return;

    for (const st of state.stages) {
      // Підбираємо docId: у різних варіантах може бути так:
      // 1) `${seasonId}_${stageId}`
      // 2) `${seasonId}__${stageId}`
      // 3) `${stageId}`
      // 4) `${seasonId}||${stageId}`
      const docIds = [
        `${state.seasonId}_${st.key}`,
        `${state.seasonId}__${st.key}`,
        `${state.seasonId}||${st.key}`,
        `${st.key}`,
      ];

      const data = await tryReadStageResult(db, docIds);
      if (data) {
        // нормалізуємо до map teamId->result
        const normalized = normalizeStageTeams(data);
        state.stageResults.set(st.key, normalized);
      } else {
        // нема опублікованих результатів для цього етапу
        state.stageResults.set(st.key, new Map());
      }
    }
  }

  async function tryReadStageResult(db, docIds) {
    // спочатку public_stageResults, потім stageResults
    const cols = [CONFIG.collections.publicStageResults, CONFIG.collections.stageResults];

    for (const col of cols) {
      for (const id of docIds) {
        try {
          const snap = await db.collection(col).doc(id).get();
          if (snap.exists) return snap.data() || {};
        } catch (e) {
          // якщо PERMISSION — просто продовжуємо, але якщо все PERMISSION — далі впаде в init -> showError
          // тут не ковтаю повністю, бо нам треба знати проблему
          if (String(e?.code || '').includes('permission') || String(e?.message || '').includes('PERMISSION')) {
            throw e;
          }
        }
      }
    }
    return null;
  }

  function normalizeStageTeams(stageData) {
    // підтримує:
    // - teamsByTeamId: {teamId:{...}}
    // - teams: {teamId:{...}}
    // - teams: [{teamId,...}]
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
      return map;
    }

    return map;
  }

  // ==================== CALC ====================

  function calculateRatings() {
    // absentPoints по кожному finished етапу: maxPlace+1, якщо нема даних — teamsCount+1
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

        if (!isFinished) {
          stageScores.push(score);
          return;
        }

        const stageMap = state.stageResults.get(st.key) || new Map();
        const tr = stageMap.get(team.id) || null;

        // участь визначимо так:
        // - або є результат
        // - або є confirmed реєстрація на цей stageId (в public_participants)
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
          // нема результату — штраф
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

      // сортуємо stageScores по idx
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

    if (!topTbody || !contendersTbody) {
      console.error('[Rating] Не знайдено season-top або season-contenders');
      return;
    }

    // Якщо немає команд — показуємо нормальний текст
    if (!state.ratingData.length) {
      topTbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:20px;opacity:0.7;">
            Поки що немає підтверджених команд (confirmed) у сезоні
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

    const visibleScores = rating.stageScores.slice(0, CONFIG.defaults.maxStages);

    const stageCells = visibleScores.map(sc => {
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

    const missing = Math.max(0, CONFIG.defaults.maxStages - visibleScores.length);
    const emptyCells = Array(missing).fill(
      `<td class="col-stage"><div class="stage-cell"><span class="stage-place">—</span></div></td>`
    ).join('');

    const moveClass = 'move--same';
    const moveIcon = '—';

    return `
      <tr class="${isFinalist ? 'row-qualified' : ''}">
        <td class="col-place"><span class="place-num">${rating.seasonPlace}</span></td>
        <td class="col-move"><span class="move ${moveClass}">${moveIcon}</span></td>
        <td class="col-team">${escapeHtml(rating.teamName)}</td>
        ${stageCells}${emptyCells}
        <td class="col-points"><b>${rating.totalPoints}</b></td>
        <td class="col-final">${rating.finalStatus}</td>
        <td class="col-weight">${fmtWeight(rating.totalWeight)}</td>
        <td class="col-big">${fmtBigFish(rating.maxBigFish)}</td>
      </tr>
    `;
  }

  function updateStagesAttribute() {
    document.body.setAttribute('data-stages', String(state.finishedStagesCount || 0));
  }

  // ==================== UI ====================

  function showError(msg) {
    const container = document.querySelector('.card--season');
    if (!container) return;

    container.innerHTML = `
      <div style="color:#ef4444;padding:40px 20px;text-align:center;background:#0b0d14;border-radius:14px;">
        <div style="font-size:1.2rem;margin-bottom:10px;">⚠️ Помилка завантаження</div>
        <div style="opacity:0.85;white-space:pre-line;">${escapeHtml(msg)}</div>
      </div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  function safeMsg(err) {
    return (err && (err.message || err.code)) ? `${err.code ? err.code + ': ' : ''}${err.message || ''}` : String(err);
  }

  // ==================== PUBLIC API ====================

  window.SeasonRating = {
    refresh: init,
    getState: () => JSON.parse(JSON.stringify(state)),
    getConfig: () => JSON.parse(JSON.stringify(CONFIG)),
  };
})();

/**
 * rating_page.js — Рейтинг сезону STOLAR CARP (FIXED)
 * Архітектура: Firebase Firestore, колекції competitions/registrations/stageResults/seasonRating
 *
 * ✅ FIX: fallback якщо нема composite index на competitions (where+where+orderBy)
 * ✅ FIX: stageResults teams може бути map або array або teamsByTeamId
 * ✅ FIX: absentPoints = (maxPlaceInStage + 1) динамічно, не "8"
 * ✅ FIX: points завжди number
 * ✅ FIX: missingStages рахується по visibleStages
 * ✅ FIX: фінал шукаємо по isFinal==true без привʼязки до type
 */

(function () {
  'use strict';

  const CONFIG = {
    collections: {
      settings: 'settings',
      seasons: 'seasons',
      competitions: 'competitions',
      registrations: 'registrations',
      seasonRating: 'seasonRating',
      stageResults: 'stageResults',
    },
    docIds: {
      appSettings: 'app',
    },
    defaults: {
      finalSpots: 18,
      maxStages: 5,
    },
  };

  let state = {
    seasonId: null,
    seasonData: null,
    competitions: [],
    finalComp: null,
    teams: [],
    stageResults: [],
    ratingData: [],
    finishedStagesCount: 0,
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      showLoadingState();

      const db = getDb();
      if (!db) throw new Error('Firebase DB не доступний');

      await loadCurrentSeason(db);
      await loadCompetitions(db);
      await loadTeams(db);
      await loadStageResults(db);

      calculateRatings();
      renderTable();
      updateStagesAttribute();

      console.log(
        `[Rating] season=${state.seasonId} teams=${state.teams.length} finished=${state.finishedStagesCount} stages=${state.competitions.length}`
      );
    } catch (err) {
      console.error('[Rating] Помилка:', err);
      showError('Не вдалося завантажити рейтинг. Спробуйте оновити сторінку.');
    }
  }

  function getDb() {
    // compat init: window.firebase.db або window.db
    return window.firebase?.db || window.db || window.scDb || null;
  }

  function showLoadingState() {
    document.body.setAttribute('data-stages', '0');
  }

  // ==================== LOADERS ====================

  async function loadCurrentSeason(db) {
    const settingsSnap = await db
      .collection(CONFIG.collections.settings)
      .doc(CONFIG.docIds.appSettings)
      .get();

    if (!settingsSnap.exists) throw new Error('Не знайдено settings/app');

    const settings = settingsSnap.data() || {};
    state.seasonId = settings.activeSeasonId;

    if (!state.seasonId) throw new Error('Не встановлено activeSeasonId у settings/app');

    const seasonSnap = await db
      .collection(CONFIG.collections.seasons)
      .doc(state.seasonId)
      .get();

    state.seasonData = seasonSnap.exists ? (seasonSnap.data() || {}) : {};
  }

  async function loadCompetitions(db) {
    // 1) Пробуємо канонічний запит з orderBy
    // 2) Якщо впаде через index — fallback без orderBy і сортуємо в JS

    let docs = [];
    try {
      const snap = await db
        .collection(CONFIG.collections.competitions)
        .where('seasonId', '==', state.seasonId)
        .where('type', '==', 'season')
        .orderBy('stageNumber')
        .get();
      docs = snap.docs;
    } catch (e) {
      console.warn('[Rating] competitions query (orderBy) failed, fallback без orderBy:', e?.message || e);

      const snap = await db
        .collection(CONFIG.collections.competitions)
        .where('seasonId', '==', state.seasonId)
        .where('type', '==', 'season')
        .get();
      docs = snap.docs;
    }

    state.competitions = docs
      .map((doc) => {
        const d = doc.data() || {};
        const stageNumber = toNumberOrNull(d.stageNumber);
        return {
          id: doc.id,
          ...d,
          stageNumber: stageNumber,
          isFinished: d.status === 'finished',
        };
      })
      // stageNumber може бути null — ставимо в кінець
      .sort((a, b) => {
        const aa = a.stageNumber ?? 9999;
        const bb = b.stageNumber ?? 9999;
        return aa - bb;
      });

    state.finishedStagesCount = state.competitions.filter((c) => c.isFinished).length;

    // Фінал: шукаємо просто isFinal==true (без type)
    try {
      const finalSnap = await db
        .collection(CONFIG.collections.competitions)
        .where('seasonId', '==', state.seasonId)
        .where('isFinal', '==', true)
        .limit(1)
        .get();

      if (!finalSnap.empty) {
        state.finalComp = { id: finalSnap.docs[0].id, ...(finalSnap.docs[0].data() || {}) };
      }
    } catch (e) {
      // якщо нема індексу — не критично для рейтингу
      console.warn('[Rating] final query failed (not critical):', e?.message || e);
      state.finalComp = null;
    }
  }

  async function loadTeams(db) {
    // Беремо всі confirmed реєстрації сезону — формуємо roster команд
    const regsSnap = await db
      .collection(CONFIG.collections.registrations)
      .where('seasonId', '==', state.seasonId)
      .where('status', '==', 'confirmed')
      .get();

    const teamsMap = new Map();

    regsSnap.docs.forEach((doc) => {
      const reg = doc.data() || {};
      const teamId = reg.teamId;
      if (!teamId) return;

      if (!teamsMap.has(teamId)) {
        teamsMap.set(teamId, {
          id: teamId,
          name: reg.teamName || reg.name || 'Без назви',
          registrations: [], // { compId, stageNumber, regId }
        });
      }

      const team = teamsMap.get(teamId);

      const compId = reg.competitionId || reg.compId || null;
      const comp = compId ? state.competitions.find((c) => c.id === compId) : null;

      team.registrations.push({
        compId: compId,
        stageNumber: comp?.stageNumber ?? null,
        regId: doc.id,
      });
    });

    state.teams = Array.from(teamsMap.values());
  }

  async function loadStageResults(db) {
    // Для кожного етапу читаємо stageResults/{compId}
    // Якщо правил/доступу нема — це дасть помилку і ми покажемо showError.
    const promises = state.competitions.map(async (comp) => {
      try {
        const snap = await db.collection(CONFIG.collections.stageResults).doc(comp.id).get();
        return {
          compId: comp.id,
          stageNumber: comp.stageNumber,
          isFinished: comp.isFinished,
          data: snap.exists ? (snap.data() || {}) : null,
        };
      } catch (e) {
        // Важливо: якщо rules забороняють, тут буде PERMISSION_DENIED
        console.error(`[Rating] stageResults read failed comp=${comp.id}:`, e?.message || e);
        throw e;
      }
    });

    state.stageResults = await Promise.all(promises);
  }

  // ==================== CALC ====================

  function calculateRatings() {
    // Підготовка: для кожного етапу визначити absentPoints (maxPlace+1) якщо finished
    const absentByCompId = new Map();
    state.competitions.forEach((comp) => {
      if (!comp.isFinished) return;
      const sr = state.stageResults.find((r) => r.compId === comp.id);
      const maxPlace = inferMaxPlaceFromStageResult(sr?.data);
      // якщо взагалі нема даних — absent = teamsCount + 1
      const fallbackMax = Math.max(0, state.teams.length);
      const useMax = Number.isFinite(maxPlace) && maxPlace > 0 ? maxPlace : fallbackMax;
      absentByCompId.set(comp.id, useMax + 1);
    });

    state.ratingData = state.teams.map((team) => {
      const stageScores = [];
      let totalPoints = 0;
      let totalWeight = 0;
      let maxBigFish = 0;

      state.competitions.forEach((comp) => {
        const stageResult = state.stageResults.find((r) => r.compId === comp.id);
        const hasRegistration = team.registrations.some((r) => r.compId === comp.id);
        const absentPoints = absentByCompId.get(comp.id) ?? (state.teams.length + 1);

        const score = {
          stageNumber: comp.stageNumber,
          compId: comp.id,
          isFinished: comp.isFinished,
          place: '—',
          points: '—',
          weight: 0,
          bigFish: 0,
          participated: false,
        };

        if (!comp.isFinished) {
          // ще не finished
          stageScores.push(score);
          return;
        }

        // finished: шукаємо результат команди
        const teamResult = pickTeamResult(stageResult?.data, team.id);

        if (teamResult) {
          const placeNum = toNumberOrNull(teamResult.place ?? teamResult.rank ?? teamResult.sectorPlace);
          const pointsNum = toNumberOrNull(teamResult.points);

          score.place = placeNum ?? '—';
          // points: якщо є points — беремо. якщо нема — points = placeNum. якщо нема й place — absentPoints
          score.points = pointsNum ?? placeNum ?? absentPoints;

          score.weight = toNumberOrZero(teamResult.totalWeight ?? teamResult.totalWeightKg ?? teamResult.weight ?? 0);
          score.bigFish = toNumberOrZero(teamResult.bigFish ?? teamResult.bigFishKg ?? 0);
          score.participated = true;
        } else if (hasRegistration) {
          // була confirmed реєстрація, але немає результату
          score.place = '—';
          score.points = absentPoints;
        } else {
          // не було confirmed реєстрації на етап — теж absent
          score.place = '—';
          score.points = absentPoints;
        }

        // підсумки (лише finished)
        const p = typeof score.points === 'number' && Number.isFinite(score.points) ? score.points : absentPoints;
        totalPoints += p;
        totalWeight += score.weight;
        maxBigFish = Math.max(maxBigFish, score.bigFish);

        stageScores.push(score);
      });

      return {
        teamId: team.id,
        teamName: team.name,
        stageScores,
        totalPoints,
        totalWeight,
        maxBigFish,
        registrationsCount: team.registrations.length,
      };
    });

    // Sort: points asc, weight desc, bigFish desc
    state.ratingData.sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
      if (a.totalWeight !== b.totalWeight) return b.totalWeight - a.totalWeight;
      return b.maxBigFish - a.maxBigFish;
    });

    state.ratingData.forEach((r, idx) => {
      r.seasonPlace = idx + 1;
      r.isFinalist = idx < CONFIG.defaults.finalSpots;
      r.finalStatus = r.isFinalist ? 'Так' : '—';
    });
  }

  // ==================== RENDER ====================

  function renderTable() {
    const topTbody = document.getElementById('season-top');
    const contendersTbody = document.getElementById('season-contenders');

    if (!topTbody || !contendersTbody) {
      console.error('[Rating] Не знайдено season-top або season-contenders');
      return;
    }

    const finalists = state.ratingData.filter((r) => r.isFinalist);
    const contenders = state.ratingData.filter((r) => !r.isFinalist);

    topTbody.innerHTML = finalists.map((r) => createRowHTML(r, true)).join('');

    if (contenders.length > 0) {
      contendersTbody.innerHTML = contenders.map((r) => createRowHTML(r, false)).join('');
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

    const stageCells = visibleScores
      .map((sc) => {
        if (!sc.isFinished) {
          return `<td class="col-stage"><div class="stage-cell"><span class="stage-place">—</span></div></td>`;
        }

        const placeDisplay =
          sc.participated && sc.place !== '—' && sc.place !== null && sc.place !== undefined ? sc.place : '—';
        const pointsDisplay = typeof sc.points === 'number' ? sc.points : '—';

        return `
          <td class="col-stage">
            <div class="stage-cell">
              <span class="stage-place">${placeDisplay}</span>
              <span class="stage-slash">/</span>
              <span class="stage-points">${pointsDisplay}</span>
            </div>
          </td>
        `;
      })
      .join('');

    const missingStages = Math.max(0, CONFIG.defaults.maxStages - visibleScores.length);
    const emptyCells = Array(missingStages)
      .fill(`<td class="col-stage"><div class="stage-cell"><span class="stage-place">—</span></div></td>`)
      .join('');

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

  // ==================== HELPERS ====================

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function toNumberOrNull(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function toNumberOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Повертає teamResult з stageResults data для teamId.
   * Підтримує формати:
   * 1) data.teamsByTeamId[teamId]
   * 2) data.teams[teamId] (map)
   * 3) data.teams = [{teamId, ...}, ...] (array)
   * 4) data.teams = [{id: teamId, ...}, ...] (array)
   */
  function pickTeamResult(stageData, teamId) {
    if (!stageData || !teamId) return null;

    // 1) teamsByTeamId
    if (stageData.teamsByTeamId && typeof stageData.teamsByTeamId === 'object') {
      const tr = stageData.teamsByTeamId[teamId];
      if (tr) return tr;
    }

    const teams = stageData.teams;

    // 2) teams map
    if (teams && !Array.isArray(teams) && typeof teams === 'object') {
      const tr = teams[teamId];
      if (tr) return tr;
    }

    // 3) teams array
    if (Array.isArray(teams)) {
      return teams.find((t) => t && (t.teamId === teamId || t.id === teamId)) || null;
    }

    return null;
  }

  /**
   * Визначає maxPlace з stageResults:
   * - якщо teams array: max(place)
   * - якщо teams map: max(place)
   * - якщо є поле maxPlace / teamsCount: беремо як підказку
   */
  function inferMaxPlaceFromStageResult(stageData) {
    if (!stageData) return null;

    const hinted = toNumberOrNull(stageData.maxPlace);
    if (hinted) return hinted;

    const teamsCount = toNumberOrNull(stageData.teamsCount);
    // teamsCount сам по собі може бути “кількість”, але maxPlace не завжди == teamsCount
    // беремо як fallback тільки якщо нема інших даних
    let max = null;

    const teams = stageData.teamsByTeamId || stageData.teams;

    if (Array.isArray(teams)) {
      teams.forEach((t) => {
        const p = toNumberOrNull(t?.place ?? t?.rank);
        if (p && (max === null || p > max)) max = p;
      });
      if (max !== null) return max;
    }

    if (teams && !Array.isArray(teams) && typeof teams === 'object') {
      Object.keys(teams).forEach((k) => {
        const t = teams[k];
        const p = toNumberOrNull(t?.place ?? t?.rank);
        if (p && (max === null || p > max)) max = p;
      });
      if (max !== null) return max;
    }

    if (teamsCount) return teamsCount;
    return null;
  }

  function showError(msg) {
    const container = document.querySelector('.card--season');
    if (container) {
      container.innerHTML = `
        <div style="color:#ef4444;padding:40px 20px;text-align:center;background:#0b0d14;border-radius:14px;">
          <div style="font-size:1.2rem;margin-bottom:10px;">⚠️ Помилка завантаження</div>
          <div style="opacity:0.8;">${escapeHtml(msg)}</div>
        </div>
      `;
    }
  }

  // ==================== PUBLIC API ====================

  window.SeasonRating = {
    refresh: init,
    getState: () => ({ ...state }),
    getConfig: () => ({ ...CONFIG }),
  };
})();

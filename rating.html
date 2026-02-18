/**
 * rating_page.js — Рейтинг сезону STOLAR CARP
 * Архітектура: Firebase Firestore, колекції competitions/registrations/seasonRating
 */

(function() {
  'use strict';

  // ==================== КОНФІГУРАЦІЯ ====================

  const CONFIG = {
    collections: {
      settings: 'settings',
      seasons: 'seasons',
      competitions: 'competitions',
      registrations: 'registrations',
      seasonRating: 'seasonRating',
      stageResults: 'stageResults'
    },
    docIds: {
      appSettings: 'app'
    },
    defaults: {
      absentPoints: 8,      // Бали за неучасть у завершеному етапі
      finalSpots: 18,       // Кількість місць у фіналі
      maxStages: 5          // Максимум етапів для відображення (E1-E5)
    }
  };

  // ==================== СТАТ ====================

  let state = {
    seasonId: null,
    seasonData: null,
    competitions: [],       // Етапи сезону (type: "season", без фіналу)
    finalComp: null,        // Фінал (якщо є)
    teams: [],              // Команди з confirmed реєстраціями
    ratingData: [],         // Обчислені рейтинги
    finishedStagesCount: 0  // Для CSS [data-stages]
  };

  // ==================== ІНІЦІАЛІЗАЦІЯ ====================

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      showLoadingState();
      
      const db = getDb();
      if (!db) throw new Error('Firebase DB не доступний');

      // Крок 1: Отримуємо поточний сезон
      await loadCurrentSeason(db);
      
      // Крок 2: Завантажуємо етапи сезону
      await loadCompetitions(db);
      
      // Крок 3: Завантажуємо команди з confirmed реєстраціями
      await loadTeams(db);
      
      // Крок 4: Завантажуємо агреговані результати етапів
      await loadStageResults(db);
      
      // Крок 5: Обчислюємо рейтинг
      calculateRatings();
      
      // Крок 6: Рендеримо таблицю
      renderTable();
      
      // Крок 7: Оновлюємо CSS-атрибут
      updateStagesAttribute();
      
      console.log(`[Rating] Сезон ${state.seasonId}: ${state.teams.length} команд, ${state.finishedStagesCount} завершених етапів`);
      
    } catch (err) {
      console.error('[Rating] Помилка:', err);
      showError('Не вдалося завантажити рейтинг. Спробуйте оновити сторінку.');
    }
  }

  function getDb() {
    return window.firebase?.db || window.db;
  }

  function showLoadingState() {
    document.body.setAttribute('data-stages', '0');
  }

  // ==================== ЗАВАНТАЖЕННЯ ДАНИХ ====================

  async function loadCurrentSeason(db) {
    const settingsSnap = await db
      .collection(CONFIG.collections.settings)
      .doc(CONFIG.docIds.appSettings)
      .get();
    
    if (!settingsSnap.exists) {
      throw new Error('Не знайдено налаштування app');
    }
    
    const settings = settingsSnap.data();
    state.seasonId = settings.activeSeasonId;
    
    if (!state.seasonId) {
      throw new Error('Не встановлено activeSeasonId');
    }

    // Завантажуємо інфо про сезон
    const seasonSnap = await db
      .collection(CONFIG.collections.seasons)
      .doc(state.seasonId)
      .get();
    
    state.seasonData = seasonSnap.exists ? seasonSnap.data() : {};
  }

  async function loadCompetitions(db) {
    // Всі змагання сезону, type: "season", сортуємо за stageNumber
    const compsSnap = await db
      .collection(CONFIG.collections.competitions)
      .where('seasonId', '==', state.seasonId)
      .where('type', '==', 'season')
      .orderBy('stageNumber')
      .get();

    state.competitions = compsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      isFinished: doc.data().status === 'finished'
    }));

    // Рахуємо завершені етапи для CSS
    state.finishedStagesCount = state.competitions.filter(c => c.isFinished).length;

    // Шукаємо фінал окремо (якщо потрібно буде)
    const finalSnap = await db
      .collection(CONFIG.collections.competitions)
      .where('seasonId', '==', state.seasonId)
      .where('type', '==', 'oneoff')
      .where('isFinal', '==', true)
      .limit(1)
      .get();
    
    if (!finalSnap.empty) {
      state.finalComp = { id: finalSnap.docs[0].id, ...finalSnap.docs[0].data() };
    }
  }

  async function loadTeams(db) {
    // Отримуємо ВСІХ унікальних команд, які мають confirmed реєстрацію на будь-який етап сезону
    const regsSnap = await db
      .collection(CONFIG.collections.registrations)
      .where('seasonId', '==', state.seasonId)
      .where('status', '==', 'confirmed')
      .get();

    // Групуємо по teamId, збираємо на які етапи зареєстрована команда
    const teamsMap = new Map();

    regsSnap.docs.forEach(doc => {
      const reg = doc.data();
      const teamId = reg.teamId;
      
      if (!teamsMap.has(teamId)) {
        teamsMap.set(teamId, {
          id: teamId,
          name: reg.teamName || 'Без назви',
          registrations: [] // { compId, stageNumber }
        });
      }
      
      const team = teamsMap.get(teamId);
      
      // Знаходимо stageNumber для цього compId
      const comp = state.competitions.find(c => c.id === reg.competitionId);
      const stageNumber = comp ? comp.stageNumber : null;
      
      team.registrations.push({
        compId: reg.competitionId,
        stageNumber: stageNumber,
        regId: doc.id
      });
    });

    state.teams = Array.from(teamsMap.values());
  }

  async function loadStageResults(db) {
    // Завантажуємо stageResults для всіх етапів
    const resultsPromises = state.competitions.map(async comp => {
      const resultSnap = await db
        .collection(CONFIG.collections.stageResults)
        .doc(comp.id)
        .get();
      
      return {
        compId: comp.id,
        stageNumber: comp.stageNumber,
        isFinished: comp.isFinished,
        data: resultSnap.exists ? resultSnap.data() : null
      };
    });

    state.stageResults = await Promise.all(resultsPromises);
  }

  // ==================== ОБЧИСЛЕННЯ РЕЙТИНГІВ ====================

  function calculateRatings() {
    state.ratingData = state.teams.map(team => {
      const stageScores = [];
      let totalPoints = 0;
      let totalWeight = 0;
      let maxBigFish = 0;

      // Проходимо по всіх етапах сезону
      state.competitions.forEach(comp => {
        const stageResult = state.stageResults.find(r => r.compId === comp.id);
        const hasRegistration = team.registrations.some(r => r.compId === comp.id);
        
        const score = {
          stageNumber: comp.stageNumber,
          compId: comp.id,
          isFinished: comp.isFinished,
          place: null,
          points: null,
          weight: 0,
          bigFish: 0,
          participated: false
        };

        if (!comp.isFinished) {
          // Етап ще не завершено — показуємо "—"
          score.place = '—';
          score.points = '—';
        } else {
          // Етап завершено
          const teamResult = stageResult?.data?.teams?.[team.id];
          
          if (teamResult) {
            // Команда брала участь і має результати
            score.place = teamResult.place || teamResult.rank || '—';
            score.points = teamResult.points || score.place || CONFIG.defaults.absentPoints;
            score.weight = teamResult.totalWeight || teamResult.weight || 0;
            score.bigFish = teamResult.bigFish || teamResult.bigFishKg || 0;
            score.participated = true;
          } else if (hasRegistration) {
            // Була реєстрація, але немає результатів (можливо, знялась або дискваліфікація)
            score.place = '—';
            score.points = CONFIG.defaults.absentPoints;
            score.weight = 0;
            score.bigFish = 0;
          } else {
            // Не було реєстрації на цей етап — штрафні бали
            score.place = '—';
            score.points = CONFIG.defaults.absentPoints;
            score.weight = 0;
            score.bigFish = 0;
          }

          // Додаємо до підсумків тільки якщо етап завершено
          const pointsNum = typeof score.points === 'number' ? score.points : CONFIG.defaults.absentPoints;
          totalPoints += pointsNum;
          totalWeight += score.weight;
          maxBigFish = Math.max(maxBigFish, score.bigFish);
        }

        stageScores.push(score);
      });

      return {
        teamId: team.id,
        teamName: team.name,
        stageScores,
        totalPoints,
        totalWeight,
        maxBigFish,
        registrationsCount: team.registrations.length
      };
    });

    // Сортування: 1) бали (менше), 2) вага (більше), 3) біг фіш (більше)
    state.ratingData.sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) {
        return a.totalPoints - b.totalPoints;
      }
      if (a.totalWeight !== b.totalWeight) {
        return b.totalWeight - a.totalWeight;
      }
      return b.maxBigFish - a.maxBigFish;
    });

    // Призначаємо місця та статус фіналіста
    state.ratingData.forEach((r, idx) => {
      r.seasonPlace = idx + 1;
      r.isFinalist = idx < CONFIG.defaults.finalSpots;
      r.finalStatus = r.isFinalist ? 'Так' : '—';
    });
  }

  // ==================== РЕНДЕРИНГ ====================

  function renderTable() {
    const topTbody = document.getElementById('season-top');
    const contendersTbody = document.getElementById('season-contenders');

    if (!topTbody || !contendersTbody) {
      console.error('[Rating] Не знайдено елементи таблиць');
      return;
    }

    // Розділяємо на фіналістів і претендентів
    const finalists = state.ratingData.filter(r => r.isFinalist);
    const contenders = state.ratingData.filter(r => !r.isFinalist);

    // Рендеримо фіналістів (1-18 місце)
    topTbody.innerHTML = finalists.map(r => createRowHTML(r, true)).join('');

    // Рендеримо претендентів (19+ місце)
    if (contenders.length > 0) {
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
    // Форматування чисел
    const fmtWeight = (w) => w > 0 ? w.toFixed(3) : '—';
    const fmtBigFish = (bf) => bf > 0 ? bf.toFixed(3) : '—';
    
    // Створюємо комірки етапів (E1-E5) — беремо перші 5 етапів
    const stageCells = rating.stageScores
      .slice(0, CONFIG.defaults.maxStages)
      .map(sc => {
        if (!sc.isFinished) {
          return `<td class="col-stage"><div class="stage-cell"><span class="stage-place">—</span></div></td>`;
        }
        
        const placeDisplay = sc.participated && sc.place !== '—' ? sc.place : '—';
        const pointsDisplay = sc.points !== '—' ? sc.points : '—';
        
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

    // Доповнюємо порожніми колонками, якщо етапів менше 5
    const missingStages = CONFIG.defaults.maxStages - rating.stageScores.length;
    const emptyCells = Array(missingStages).fill(
      `<td class="col-stage"><div class="stage-cell"><span class="stage-place">—</span></div></td>`
    ).join('');

    // Рух (placeholder — можна додати порівняння з попереднім тижнем)
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
    // Встановлюємо атрибут для CSS приховування колонок
    document.body.setAttribute('data-stages', state.finishedStagesCount);
  }

  // ==================== УТИЛІТИ ====================

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showError(msg) {
    const container = document.querySelector('.card--season');
    if (container) {
      container.innerHTML = `
        <div style="color:#ef4444;padding:40px 20px;text-align:center;background:#0b0d14;border-radius:14px;">
          <div style="font-size:1.2rem;margin-bottom:10px;">⚠️ Помилка завантаження</div>
          <div style="opacity:0.8;">${msg}</div>
        </div>
      `;
    }
  }

  // ==================== ПУБЛІЧНИЙ API ====================

  window.SeasonRating = {
    refresh: init,
    getState: () => ({ ...state }),
    getConfig: () => ({ ...CONFIG })
  };

})();

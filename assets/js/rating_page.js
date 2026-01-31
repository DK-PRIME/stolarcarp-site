// assets/js/rating_page.js
// STOLAR CARP — Rating Page (ENTERPRISE GRADE)
// 🔥 ВСЕ ВКЛЮЧЕНО: fault-tolerance, retry, offline, cache, hot-reload

(function () {
  "use strict";

  // ======================================================
  // 0) КОНФІГУРАЦІЯ
  // ======================================================
  const CONFIG = {
    RETRY_MAX_ATTEMPTS: 3,
    RETRY_BASE_DELAY: 1000,
    CACHE_REFRESH_INTERVAL: 5000,
    OFFLINE_CHECK_INTERVAL: 30000
  };

  // ======================================================
  // 1) ІНІЦІАЛІЗАЦІЯ ТА ВАЛІДАЦІЯ
  // ======================================================
  const db = window.scDb;
  if (!db || !window.firebase?.firestore) {
    console.error("[Rating] Firebase не завантажено");
    document.body?.setAttribute('data-error', 'firebase-missing');
    return;
  }

  // ======================================================
  // 2) DOM КЕШ ТА СТАН
  // ======================================================
  const SELECTORS = {
    KICKER: ".season-rating-head .kicker",
    TITLE: ".season-rating-head .page-title",
    DESC: ".season-rating-head .rating-desc",
  };

  const els = {};
  Object.keys(SELECTORS).forEach(key => {
    els[key.toLowerCase()] = document.querySelector(SELECTORS[key]);
  });

  // Кеш колонок з data-stage
  const stageCache = new Map();
  let lastStages = -1;
  let lastYear = -1;
  let snapshotUnsubscribe = null;
  let offlineCheckInterval = null;
  let retryCount = 0;
  let isDestroyed = false;

  // ======================================================
  // 3) УТІЛІТІ-ФУНКЦІЇ
  // ======================================================

  // 🔄 Оновлення кешу DOM-елементів
  function refreshStageCache() {
    const previousSize = Array.from(stageCache.values())
      .reduce((sum, arr) => sum + arr.length, 0);
    
    stageCache.clear();
    
    document.querySelectorAll("[data-stage]").forEach(el => {
      const stageNum = Number(el.dataset.stage);
      if (!isNaN(stageNum)) {
        if (!stageCache.has(stageNum)) {
          stageCache.set(stageNum, []);
        }
        stageCache.get(stageNum).push(el);
      }
    });

    const newSize = Array.from(stageCache.values())
      .reduce((sum, arr) => sum + arr.length, 0);
    
    if (previousSize !== newSize) {
      console.log(`[Rating] Cache refreshed: ${newSize} elements`);
    }
  }

  // 🎯 Перевірка чи є етап фіналом
  function isFinalEvent(event) {
    if (!event) return false;
    
    const eventKey = String(
      event.key || 
      event.stageId || 
      event.id || 
      event.name || 
      ''
    ).toLowerCase();
    
    return !!event.isFinal || 
           eventKey.includes('final') ||
           eventKey.includes('фінал');
  }

  // 📊 Підрахунок етапів без фіналу
  function countNonFinalStages(events) {
    if (!Array.isArray(events)) return 0;
    
    return events.reduce((count, event) => {
      return count + (isFinalEvent(event) ? 0 : 1);
    }, 0);
  }

  // 🌐 Визначення стану з'єднання
  function updateConnectionStatus(isOffline) {
    if (isDestroyed) return;
    
    const body = document.body;
    if (!body) return;
    
    body.toggleAttribute('data-offline', isOffline);
    
    if (isOffline) {
      body.setAttribute('data-last-online', new Date().toLocaleTimeString());
    }
  }

  // ======================================================
  // 4) ОСНОВНА ЛОГІКА ВІДОБРАЖЕННЯ
  // ======================================================

  // 🏆 Застосування кількості етапів до таблиці
  function applyStages(stagesCount) {
    if (isDestroyed) return;
    
    const count = Number(stagesCount) || 0;
    
    // Оптимізація: не робимо нічого якщо нічого не змінилося
    if (count === lastStages) return;
    lastStages = count;
    
    // Оновлюємо атрибут для CSS
    document.body.setAttribute('data-stages', count.toString());
    
    // Швидке оновлення всіх відповідних елементів
    stageCache.forEach((elements, stageNum) => {
      const shouldShow = stageNum >= 1 && stageNum <= count;
      const displayValue = shouldShow ? '' : 'none';
      
      elements.forEach(el => {
        if (el.style.display !== displayValue) {
          el.style.display = displayValue;
        }
      });
    });
    
    // Додатковий захист: приховати всі елементи з data-stage > count
    document.querySelectorAll('[data-stage]').forEach(el => {
      const stageNum = Number(el.dataset.stage);
      if (stageNum > count) {
        el.style.display = 'none';
      }
    });
    
    console.log(`[Rating] Applied ${count} stages`);
  }

  // 📝 Оновлення заголовків
  function updateHeaders(year) {
    if (isDestroyed) return;
    
    const currentYear = year || new Date().getFullYear();
    if (currentYear === lastYear) return;
    lastYear = currentYear;
    
    if (els.kicker) {
      els.kicker.textContent = `СЕЗОН ${currentYear}`;
    }
    
    if (els.title) {
      els.title.textContent = 'Рейтинг сезону STOLAR CARP';
    }
  }

  // 🔽 Кнопка "Детальніше"
  function setupDescriptionToggle() {
    if (!els.desc || !els.title || isDestroyed) return;
    if (document.getElementById('ratingDescToggle')) return;
    
    // Приховуємо опис за замовчуванням
    els.desc.hidden = true;
    
    // Створюємо унікальний ID якщо потрібно
    if (!els.desc.id) {
      els.desc.id = 'ratingDescription_' + Date.now();
    }
    
    // Створюємо кнопку
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'ratingDescToggle';
    toggleBtn.className = 'btn btn--ghost rating-toggle-btn';
    toggleBtn.innerHTML = `
      <span>Детальніше…</span>
      <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24">
        <path fill="currentColor" d="M7 10l5 5 5-5z"/>
      </svg>
    `;
    
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-controls', els.desc.id);
    
    // Обробник кліку
    toggleBtn.addEventListener('click', () => {
      const willBeVisible = els.desc.hidden;
      els.desc.hidden = !willBeVisible;
      
      // Оновлюємо стан
      toggleBtn.setAttribute('aria-expanded', willBeVisible.toString());
      toggleBtn.querySelector('span').textContent = 
        willBeVisible ? 'Згорнути' : 'Детальніше…';
      
      // Анімація іконки
      const icon = toggleBtn.querySelector('.toggle-icon');
      icon.style.transform = willBeVisible ? 'rotate(180deg)' : 'rotate(0)';
      
      // Подія для аналітики
      window.dispatchEvent(new CustomEvent('rating-description-toggle', {
        detail: { expanded: willBeVisible }
      }));
    });
    
    // Додаємо після заголовка
    els.title.insertAdjacentElement('afterend', toggleBtn);
  }

  // ======================================================
  // 5) РОБОТА З ДАНИМИ
  // ======================================================

  // 🔍 Пошук ID сезону (багаторівневий)
  async function findSeasonId() {
    // Рівень 1: Глобальні змінні
    const globalSources = [
      window.SC_ACTIVE_SEASON_ID,
      window.scActiveSeasonId,
      window.scSeasonId,
      window.SC_SEASON_ID,
      window.currentSeasonId,
      window.activeSeasonId
    ];
    
    for (const source of globalSources) {
      if (source) {
        const id = String(source).trim();
        if (id) {
          console.log('[Rating] Found season ID from globals:', id);
          return id;
        }
      }
    }
    
    // Рівень 2: Налаштування Firestore
    try {
      const settingsDoc = await db.collection('settings').doc('active').get();
      
      if (settingsDoc.exists) {
        const data = settingsDoc.data() || {};
        const settingKeys = [
          'seasonId',
          'competitionId',
          'activeSeasonId',
          'currentSeasonId',
          'activeCompetitionId'
        ];
        
        for (const key of settingKeys) {
          if (data[key]) {
            const id = String(data[key]).trim();
            if (id) {
              console.log('[Rating] Found season ID from settings:', id);
              return id;
            }
          }
        }
      }
    } catch (error) {
      console.warn('[Rating] Failed to read settings:', error);
    }
    
    // Рівень 3: Пошук активного сезону
    try {
      const now = new Date().toISOString();
      
      // Спроба 1: Активний сезон за датами
      let snapshot = await db.collection('competitions')
        .where('status', 'in', ['active', 'published', 'running'])
        .where('startDate', '<=', now)
        .where('endDate', '>=', now)
        .orderBy('startDate', 'desc')
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        const id = snapshot.docs[0].id;
        console.log('[Rating] Found active season by date:', id);
        return id;
      }
      
      // Спроба 2: Останній сезон за роком
      const currentYear = new Date().getFullYear();
      snapshot = await db.collection('competitions')
        .where('year', '==', currentYear)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        const id = snapshot.docs[0].id;
        console.log('[Rating] Found season by current year:', id);
        return id;
      }
      
      // Спроба 3: Будь-який сезон
      snapshot = await db.collection('competitions')
        .orderBy('year', 'desc')
        .limit(1)
        .get();
      
      if (!snapshot.empty) {
        const id = snapshot.docs[0].id;
        console.log('[Rating] Found latest season:', id);
        return id;
      }
      
    } catch (error) {
      console.error('[Rating] Season lookup failed:', error);
    }
    
    // Рівень 4: URL параметри
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const seasonFromUrl = urlParams.get('season') || 
                           urlParams.get('competition') || 
                           urlParams.get('seasonId');
      
      if (seasonFromUrl) {
        console.log('[Rating] Found season ID from URL:', seasonFromUrl);
        return seasonFromUrl.trim();
      }
    } catch (error) {
      console.warn('[Rating] Failed to parse URL params:', error);
    }
    
    console.warn('[Rating] No season ID found');
    return null;
  }

  // 🔄 Retry-механізм для snapshot
  function createRetrySubscription(seasonId) {
    let currentUnsubscribe = null;
    let isActive = true;
    
    const attemptSubscribe = (attempt = 1) => {
      if (!isActive || isDestroyed) return;
      
      console.log(`[Rating] Snapshot attempt ${attempt}/${CONFIG.RETRY_MAX_ATTEMPTS}`);
      
      try {
        currentUnsubscribe = db.collection('competitions')
          .doc(seasonId)
          .onSnapshot(
            // Успішна обробка
            (snapshot) => {
              if (!isActive || isDestroyed) return;
              
              retryCount = 0; // Скидаємо лічильник при успіху
              
              // Статус з'єднання
              updateConnectionStatus(snapshot.metadata.fromCache);
              
              // Автооновлення кешу при потребі
              if (performance.now() - lastCacheRefresh > CONFIG.CACHE_REFRESH_INTERVAL) {
                refreshStageCache();
                lastCacheRefresh = performance.now();
              }
              
              // Обробка даних
              if (!snapshot.exists) {
                applyStages(0);
                updateHeaders(new Date().getFullYear());
                document.body.removeAttribute('data-loading');
                return;
              }
              
              const data = snapshot.data();
              const year = data.year || data.seasonYear || new Date().getFullYear();
              
              // Визначення кількості етапів
              let stagesCount = 0;
              if (typeof data.stagesCount === 'number' && data.stagesCount > 0) {
                stagesCount = data.stagesCount;
              } else if (data.events) {
                stagesCount = countNonFinalStages(data.events);
              }
              
              updateHeaders(year);
              applyStages(stagesCount);
              document.body.removeAttribute('data-loading');
            },
            
            // Обробка помилок з retry
            (error) => {
              if (!isActive || isDestroyed) return;
              
              console.error(`[Rating] Snapshot error (attempt ${attempt}):`, error);
              
              // Скасовуємо поточну підписку
              if (currentUnsubscribe) {
                currentUnsubscribe();
                currentUnsubscribe = null;
              }
              
              // Перевіряємо чи варто пробувати ще
              if (attempt < CONFIG.RETRY_MAX_ATTEMPTS) {
                const delay = CONFIG.RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
                
                console.log(`[Rating] Retrying in ${delay}ms...`);
                
                setTimeout(() => {
                  if (isActive && !isDestroyed) {
                    attemptSubscribe(attempt + 1);
                  }
                }, delay);
              } else {
                // Максимальна кількість спроб досягнута
                console.error('[Rating] Max retry attempts reached');
                document.body.setAttribute('data-error', 'snapshot-failed');
                document.body.removeAttribute('data-loading');
              }
            }
          );
          
      } catch (error) {
        console.error('[Rating] Subscription setup failed:', error);
        
        if (attempt < CONFIG.RETRY_MAX_ATTEMPTS) {
          setTimeout(() => attemptSubscribe(attempt + 1), 
                    CONFIG.RETRY_BASE_DELAY * attempt);
        }
      }
    };
    
    // Почати підписку
    attemptSubscribe(1);
    
    // Функція для скасування
    return () => {
      isActive = false;
      if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
      }
    };
  }

  // ======================================================
  // 6) ІНІЦІАЛІЗАЦІЯ ТА ЖИТТЄВИЙ ЦИКЛ
  // ======================================================

  let lastCacheRefresh = 0;
  
  async function initialize() {
    if (isDestroyed) return;
    
    console.log('[Rating] Initializing...');
    
    try {
      // Встановлюємо стан завантаження
      document.body.setAttribute('data-loading', 'true');
      
      // Налаштовуємо UI компоненти
      setupDescriptionToggle();
      refreshStageCache();
      
      // Пошук сезону
      const seasonId = await findSeasonId();
      
      if (!seasonId) {
        // Режим без сезону
        applyStages(0);
        updateHeaders(new Date().getFullYear());
        document.body.removeAttribute('data-loading');
        document.body.setAttribute('data-mode', 'no-season');
        return;
      }
      
      console.log('[Rating] Using season:', seasonId);
      
      // Скасовуємо попередню підписку
      if (snapshotUnsubscribe) {
        snapshotUnsubscribe();
      }
      
      // Створюємо нову підписку з retry
      snapshotUnsubscribe = createRetrySubscription(seasonId);
      
      // Моніторинг offline статусу
      if (offlineCheckInterval) {
        clearInterval(offlineCheckInterval);
      }
      
      offlineCheckInterval = setInterval(() => {
        if (navigator.onLine === false) {
          updateConnectionStatus(true);
        }
      }, CONFIG.OFFLINE_CHECK_INTERVAL);
      
      // Обробник візуального оновлення
      window.addEventListener('visibilitychange', () => {
        if (!document.hidden && performance.now() - lastCacheRefresh > 10000) {
          refreshStageCache();
        }
      });
      
    } catch (error) {
      console.error('[Rating] Initialization failed:', error);
      document.body.setAttribute('data-error', 'init-failed');
      document.body.removeAttribute('data-loading');
    }
  }

  // 🧹 Очищення ресурсів
  function destroy() {
    if (isDestroyed) return;
    
    console.log('[Rating] Cleaning up...');
    isDestroyed = true;
    
    // Скасовуємо snapshot
    if (snapshotUnsubscribe) {
      snapshotUnsubscribe();
      snapshotUnsubscribe = null;
    }
    
    // Очищуємо інтервали
    if (offlineCheckInterval) {
      clearInterval(offlineCheckInterval);
      offlineCheckInterval = null;
    }
    
    // Очищуємо кеш
    stageCache.clear();
    
    // Видаляємо атрибути
    document.body.removeAttribute('data-loading');
    document.body.removeAttribute('data-offline');
    document.body.removeAttribute('data-stages');
    
    // Видаляємо кнопку toggle
    const toggleBtn = document.getElementById('ratingDescToggle');
    if (toggleBtn && toggleBtn.parentNode) {
      toggleBtn.parentNode.removeChild(toggleBtn);
    }
  }

  // ======================================================
  // 7) PUBLIC API ТА INTEGRATION
  // ======================================================
  
  // Експортуємо публічні методи
  window.SC_RatingPage = {
    initialize,
    destroy,
    refreshCache: refreshStageCache,
    getState: () => ({
      stages: lastStages,
      year: lastYear,
      isDestroyed,
      cacheSize: stageCache.size
    }),
    
    // Ручне оновлення (для dev tools)
    forceUpdate: async (customSeasonId) => {
      if (customSeasonId) {
        if (snapshotUnsubscribe) snapshotUnsubscribe();
        snapshotUnsubscribe = createRetrySubscription(customSeasonId);
      } else {
        await initialize();
      }
    }
  };

  // ======================================================
  // 8) HOT RELoad ПІДТРИМКА
  // ======================================================
  
  // Для Vite/Webpack HMR
  if (import.meta?.hot) {
    import.meta.hot.dispose(() => {
      destroy();
    });
    
    import.meta.hot.accept(() => {
      console.log('[Rating] Hot reload detected');
      setTimeout(initialize, 100);
    });
  }

  // Автоматичний запуск
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 0);
  }

  // Глобальний обробник помилок
  window.addEventListener('error', (event) => {
    if (event.message.includes('rating') || event.filename?.includes('rating_page')) {
      console.error('[Rating] Global error caught:', event.error);
      document.body.setAttribute('data-error', 'runtime-error');
    }
  });

})();

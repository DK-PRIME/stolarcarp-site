// assets/js/rating_page.js
// STOLAR CARP — Rating Page (ENTERPRISE FIXED, NO BODY MUTATION)

(function () {
  "use strict";

  // ============================
  // 0) CONFIG
  // ============================
  const CONFIG = {
    RETRY_MAX_ATTEMPTS: 3,
    RETRY_BASE_DELAY: 1000,
    CACHE_REFRESH_INTERVAL: 5000,
    OFFLINE_CHECK_INTERVAL: 30000
  };

  // ============================
  // 1) FIREBASE CHECK
  // ============================
  const db = window.scDb;
  if (!db || !window.firebase?.firestore) {
    console.error("[Rating] Firebase error");
    return;
  }

  // ============================
  // 2) STATE CONTAINER (instead of BODY)
  // ============================
  let ratingState = document.getElementById("rating-state");
  if (!ratingState) {
    ratingState = document.createElement("div");
    ratingState.id = "rating-state";
    ratingState.style.display = "none";
    document.body.appendChild(ratingState);
  }

  function setState(key, value) {
    if (value === null || value === false) {
      ratingState.removeAttribute(`data-${key}`);
    } else {
      ratingState.setAttribute(`data-${key}`, value);
    }
  }

  // ============================
  // 3) DOM CACHING
  // ============================
  const SELECTORS = {
    KICKER: ".season-rating-head .kicker",
    TITLE: ".season-rating-head .page-title",
    DESC: ".season-rating-head .rating-desc",
  };

  const els = {};
  Object.keys(SELECTORS).forEach(key => {
    els[key.toLowerCase()] = document.querySelector(SELECTORS[key]);
  });

  const stageCache = new Map();
  let lastStages = -1;
  let lastYear = -1;
  let snapshotUnsubscribe = null;
  let offlineCheckInterval = null;
  let isDestroyed = false;
  let lastCacheRefresh = 0;

  // ============================
  // 4) CACHE data-stage
  // ============================
  function refreshStageCache() {
    stageCache.clear();
    document.querySelectorAll("[data-stage]").forEach(el => {
      const num = Number(el.dataset.stage);
      if (!isNaN(num)) {
        if (!stageCache.has(num)) stageCache.set(num, []);
        stageCache.get(num).push(el);
      }
    });
  }

  // ============================
  // 5) UTILS
  // ============================
  const isFinalEvent = ev => !!(ev?.isFinal || String(ev?.key || "").toLowerCase().includes("final"));
  const countStages = arr => Array.isArray(arr) ? arr.filter(e => !isFinalEvent(e)).length : 0;

  function applyStages(n) {
    n = Number(n) || 0;
    if (n === lastStages) return;

    lastStages = n;
    stageCache.forEach((elements, stageNum) => {
      const show = stageNum >= 1 && stageNum <= n;
      const val = show ? "" : "none";
      elements.forEach(el => (el.style.display = val));
    });
  }

  function updateHeaders(y) {
    y = y || new Date().getFullYear();
    if (y === lastYear) return;

    lastYear = y;
    if (els.kicker) els.kicker.textContent = `СЕЗОН ${y}`;
    if (els.title) els.title.textContent = "Рейтинг сезону STOLAR CARP";
  }

  function setupDescriptionToggle() {
    if (!els.desc || !els.title) return;
    if (document.getElementById("ratingDescToggle")) return;

    els.desc.hidden = true;
    const btn = document.createElement("button");
    btn.id = "ratingDescToggle";
    btn.className = "btn btn--ghost rating-toggle-btn";
    btn.innerHTML = `<span>Детальніше…</span>`;

    btn.addEventListener("click", () => {
      const show = els.desc.hidden;
      els.desc.hidden = !show;
      btn.querySelector("span").textContent = show ? "Згорнути" : "Детальніше…";
    });

    els.title.insertAdjacentElement("afterend", btn);
  }

  // ============================
  // 6) FIND SEASON
  // ============================
  async function findSeasonId() {
    const g =
      window.SC_ACTIVE_SEASON_ID ||
      window.scActiveSeasonId ||
      window.scSeasonId ||
      window.SC_SEASON_ID;

    if (g) return String(g);

    try {
      const s = await db.collection("settings").doc("active").get();
      if (s.exists) {
        const d = s.data() || {};
        for (const k of ["seasonId", "competitionId", "activeSeasonId"])
          if (d[k]) return String(d[k]);
      }
    } catch {}

    return null;
  }

  // ============================
  // 7) SNAPSHOT WITH RETRY
  // ============================
  function createRetrySubscription(seasonId) {
    let unsub = null;
    let active = true;

    const attempt = (n = 1) => {
      if (!active) return;

      unsub = db.collection("competitions").doc(seasonId).onSnapshot(
        snap => {
          setState("offline", snap.metadata.fromCache ? "1" : null);

          if (!snap.exists) {
            applyStages(0);
            updateHeaders();
            setState("loading", null);
            return;
          }

          const data = snap.data();
          const year = data.year || data.seasonYear;
          const stages =
            typeof data.stagesCount === "number" && data.stagesCount > 0
              ? data.stagesCount
              : countStages(data.events);

          updateHeaders(year);
          applyStages(stages);
          setState("loading", null);
        },
        err => {
          if (n < CONFIG.RETRY_MAX_ATTEMPTS)
            return setTimeout(() => attempt(n + 1), CONFIG.RETRY_BASE_DELAY * n);

          setState("error", "snapshot");
          setState("loading", null);
        }
      );
    };

    attempt();

    return () => {
      active = false;
      unsub && unsub();
    };
  }

  // ============================
  // 8) INITIALIZE
  // ============================
  async function initialize() {
    if (isDestroyed) return;

    setState("loading", "1");
    setupDescriptionToggle();
    refreshStageCache();

    const seasonId = await findSeasonId();

    if (!seasonId) {
      applyStages(0);
      updateHeaders();
      setState("loading", null);
      return;
    }

    snapshotUnsubscribe && snapshotUnsubscribe();
    snapshotUnsubscribe = createRetrySubscription(seasonId);

    offlineCheckInterval && clearInterval(offlineCheckInterval);
    offlineCheckInterval = setInterval(() => {
      if (!navigator.onLine) setState("offline", "1");
    }, CONFIG.OFFLINE_CHECK_INTERVAL);
  }

  // ============================
  // 9) DESTROY
  // ============================
  function destroy() {
    isDestroyed = true;
    snapshotUnsubscribe && snapshotUnsubscribe();
    clearInterval(offlineCheckInterval);

    stageCache.clear();
    ratingState.removeAttribute("data-loading");
    ratingState.removeAttribute("data-offline");
    ratingState.removeAttribute("data-error");
  }

  // ============================
  // 10) HMR
  // ============================
  if (import.meta?.hot) {
    import.meta.hot.dispose(destroy);
  }

  // ============================
  // AUTO START
  // ============================
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize);
  else initialize();

})();

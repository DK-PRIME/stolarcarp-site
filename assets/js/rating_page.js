// assets/js/rating_page.js
// STOLAR CARP • Season Rating page
// Джерело: seasonRating/{year}
// Рейтинг: best 2 of 3
// Якщо зіграно тільки 1 етап → додається 8 балів
// Сортування фіналу: бали ↑, вага зарахованих етапів ↓, Big Fish ↓

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX_IN_HTML = 5;
  const SEASON_YEAR = "2026";
  const BEST_COUNT = 2;
  const ABSENT_POINTS = 8;

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CACHE_KEY = "sc_rating_cache_best2_v1";

  function safeText(v, dash = "—") {
    return v === null || v === undefined || v === "" ? dash : String(v);
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtKg(v) {
    const n = num(v);
    if (n <= 0) return "—";
    return n.toFixed(2).replace(/\.?0+$/, "");
  }

  function setReadyFlag() {
    document.documentElement.setAttribute("data-rating-ready", "1");
  }

  function showError(msgHtml) {
    const box = $("ratingError");
    if (!box) return;
    box.style.display = "block";
    box.innerHTML = msgHtml;
  }

  function hideError() {
    const box = $("ratingError");
    if (!box) return;
    box.style.display = "none";
    box.innerHTML = "";
  }

  function cacheGet() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts) return null;
      if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
      return obj.payload || null;
    } catch {
      return null;
    }
  }

  function cacheSet(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
    } catch {}
  }

  function cacheClear() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }

  function rowHTML(place, qualified) {
    return `
      <tr class="${qualified ? "row-qualified" : ""}">
        <td class="col-place"><span class="place-num">${place}</span></td>
        <td class="col-move"><span class="move move--same">–</span></td>
        <td class="col-team">-</td>

        ${new Array(STAGES_MAX_IN_HTML).fill(0).map(() => `
          <td class="col-stage">
            <div class="stage-cell">
              <span class="stage-place">–</span>
              <span class="stage-slash">/</span>
              <span class="stage-points">–</span>
            </div>
          </td>
        `).join("")}

        <td class="col-points"><b>-</b></td>
        <td class="col-final">–</td>
        <td class="col-weight">-</td>
        <td class="col-big">-</td>
      </tr>
    `;
  }

  function buildSkeleton(contendersCount = 3) {
    const topTbody = $("season-top");
    const contTbody = $("season-contenders");
    if (!topTbody || !contTbody) return;

    topTbody.innerHTML = "";
    for (let i = 1; i <= TOP_COUNT; i++) {
      topTbody.insertAdjacentHTML("beforeend", rowHTML(i, true));
    }

    contTbody.innerHTML = "";
    const cc = Math.max(3, Number(contendersCount || 0));

    for (let i = 0; i < cc; i++) {
      contTbody.insertAdjacentHTML(
        "beforeend",
        rowHTML(TOP_COUNT + i + 1, false)
      );
    }
  }

  function setMove(el, moveDelta) {
    if (!el) return;

    el.classList.remove("move--up", "move--down", "move--same");

    const d = Number(moveDelta || 0);

    if (d > 0) {
      el.classList.add("move--up");
      el.textContent = `▲${d}`;
    } else if (d < 0) {
      el.classList.add("move--down");
      el.textContent = `▼${Math.abs(d)}`;
    } else {
      el.classList.add("move--same");
      el.textContent = "–";
    }
  }

  function renderRow(tr, item) {
    if (!tr || !item) return;

    const tds = tr.querySelectorAll("td");
    if (!tds || tds.length < 3 + STAGES_MAX_IN_HTML + 4) return;

    const pl = tr.querySelector(".place-num");
    if (pl) pl.textContent = safeText(item.place);

    setMove(tds[1].querySelector(".move"), item.moveDelta);

    tds[2].textContent = safeText(item.team);

    const stages = Array.isArray(item.stages) ? item.stages : [];

    for (let i = 0; i < STAGES_MAX_IN_HTML; i++) {
      const cell = tds[3 + i];
      const placeEl = cell.querySelector(".stage-place");
      const ptsEl = cell.querySelector(".stage-points");
      const s = stages[i] || {};

      if (placeEl) placeEl.textContent = safeText(s.p, "–");
      if (ptsEl) ptsEl.textContent = safeText(s.pts, "–");

      cell.classList.remove("stage-counted", "stage-dropped", "stage-noshow");

      if (s.noShow === true) {
        cell.classList.add("stage-noshow");
      } else if (s.counted === true) {
        cell.classList.add("stage-counted");
      } else if (s.counted === false) {
        cell.classList.add("stage-dropped");
      }
    }

    const b = tds[3 + STAGES_MAX_IN_HTML].querySelector("b");
    if (b) b.textContent = safeText(item.points);

    tds[4 + STAGES_MAX_IN_HTML].textContent = safeText(item.finalPlace, "–");
    tds[5 + STAGES_MAX_IN_HTML].textContent = safeText(item.weight);
    tds[6 + STAGES_MAX_IN_HTML].textContent = safeText(item.bigFish);

    if (item.qualifiedForFinal === true) tr.classList.add("row-qualified");
    else tr.classList.remove("row-qualified");
  }

  function applyStageVisibility(stagesCount) {
    const count = Math.max(0, Math.min(STAGES_MAX_IN_HTML, Number(stagesCount || 0)));

    document.querySelectorAll(".table--season").forEach((table) => {
      const ths = table.querySelectorAll("thead th.col-stage");

      ths.forEach((th, i) => {
        const stageNo = i + 1;
        th.style.display = stageNo <= count ? "" : "none";
        if (stageNo <= count) th.innerHTML = `Е${stageNo}<br>м / б`;
      });
    });

    document.querySelectorAll(".table--season tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td.col-stage");

      tds.forEach((td, i) => {
        const stageNo = i + 1;
        td.style.display = stageNo <= count ? "" : "none";
      });
    });

    document.body.setAttribute("data-stages", String(count));
  }

  async function waitReady() {
    if (window.scReady) await window.scReady;

    const db = window.scDb;

    if (!db) throw new Error("Firestore не ініціалізований.");

    return db;
  }

  function stageSortValue(stage) {
    const raw = String(stage.stageId || stage.stageDocId || stage.id || "");
    const m = raw.match(/(\d+)/);
    return m ? Number(m[1]) : 999;
  }

  function getArchivedStages(rating) {
    const arr = Array.isArray(rating.archivedStages) ? rating.archivedStages : [];

    return arr
      .map(s => {
        if (typeof s === "string") {
          return {
            stageDocId: s,
            stageId: s,
            stageName: s
          };
        }

        return {
          stageDocId: String(s.stageDocId || s.id || ""),
          stageId: String(s.stageId || s.stageDocId || s.id || ""),
          stageName: String(s.stageName || s.stageId || s.stageDocId || s.id || "")
        };
      })
      .filter(s => s.stageDocId)
      .sort((a, b) => stageSortValue(a) - stageSortValue(b));
  }

  function readStageResult(stageData) {
    if (!stageData) return null;

    const place = num(stageData.zonePlace || stageData.points || stageData.place);
    const points = num(stageData.points || stageData.zonePlace || stageData.place);

    if (!points) return null;

    return {
      p: place || points,
      pts: points,
      totalWeight: num(stageData.totalWeight),
      bigFish: num(stageData.bigFish),
      totalCount: num(stageData.totalCount)
    };
  }

  function calculateBestResults(stageResults, archivedStages) {
    const played = [];

    archivedStages.forEach(stage => {
      const s =
        stageResults[stage.stageDocId] ||
        stageResults[stage.stageId] ||
        null;

      const result = readStageResult(s);

      if (result) {
        played.push({
          stageDocId: stage.stageDocId,
          ...result
        });
      }
    });

    const sortedPlayed = played.slice().sort((a, b) => {
      if (a.pts !== b.pts) return a.pts - b.pts;
      if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
      return b.bigFish - a.bigFish;
    });

    const countedKeys = new Set();
    const droppedKeys = new Set();

    let counted = sortedPlayed.slice(0, BEST_COUNT);

    if (counted.length < BEST_COUNT && archivedStages.length > 0) {
      const missing = BEST_COUNT - counted.length;

      for (let i = 0; i < missing; i++) {
        counted.push({
          stageDocId: `__absent_${i}`,
          p: "–",
          pts: ABSENT_POINTS,
          totalWeight: 0,
          bigFish: 0,
          totalCount: 0,
          noShowPenalty: true
        });
      }
    }

    counted.forEach(x => countedKeys.add(x.stageDocId));

    sortedPlayed.slice(BEST_COUNT).forEach(x => droppedKeys.add(x.stageDocId));

    const ratingPoints = counted.reduce((s, x) => s + num(x.pts), 0);
    const ratingWeight = counted.reduce((s, x) => s + num(x.totalWeight), 0);
    const ratingBigFish = counted.reduce((m, x) => Math.max(m, num(x.bigFish)), 0);

    return {
      countedKeys,
      droppedKeys,
      ratingPoints,
      ratingWeight,
      ratingBigFish
    };
  }

  function makeStageCells(stageResults, archivedStages, bestInfo) {
    return archivedStages.slice(0, STAGES_MAX_IN_HTML).map(stage => {
      const s =
        stageResults[stage.stageDocId] ||
        stageResults[stage.stageId] ||
        null;

      const result = readStageResult(s);

      if (!result) {
        return {
          p: "–",
          pts: "–",
          noShow: true,
          counted: false
        };
      }

      const isCounted = bestInfo.countedKeys.has(stage.stageDocId);
      const isDropped = bestInfo.droppedKeys.has(stage.stageDocId);

      return {
        p: result.p,
        pts: result.pts,
        counted: isCounted,
        noShow: false,
        dropped: isDropped
      };
    });
  }

  function rankTeams(rawTeams, archivedStages) {
    const rows = rawTeams.map(team => {
      const stagesObj = team.stages || {};
      const bestInfo = calculateBestResults(stagesObj, archivedStages);
      const stageCells = makeStageCells(stagesObj, archivedStages, bestInfo);

      return {
        teamId: String(team.teamId || ""),
        team: team.team || team.teamName || "—",

        stages: stageCells,

        ratingPoints: bestInfo.ratingPoints,
        ratingWeight: bestInfo.ratingWeight,
        ratingBigFish: bestInfo.ratingBigFish,

        displayWeight: num(team.totalWeight),
        displayBigFish: num(team.bigFish),

        totalCount: num(team.totalCount)
      };
    });

    rows.sort((a, b) => {
      if (a.ratingPoints !== b.ratingPoints) return a.ratingPoints - b.ratingPoints;
      if (b.ratingWeight !== a.ratingWeight) return b.ratingWeight - a.ratingWeight;
      return b.ratingBigFish - a.ratingBigFish;
    });

    return rows.map((r, i) => ({
      ...r,
      place: i + 1
    }));
  }

  function calculatePreviousPlaces(rawTeams, archivedStages) {
    if (archivedStages.length <= 1) return new Map();

    const previousStages = archivedStages.slice(0, -1);
    const previousRows = rankTeams(rawTeams, previousStages);

    const map = new Map();

    previousRows.forEach(r => {
      if (r.teamId) map.set(r.teamId, r.place);
    });

    return map;
  }

  function convertRatingToRows(rating) {
    const archivedStages = getArchivedStages(rating);
    const stagesCount = Math.min(archivedStages.length, STAGES_MAX_IN_HTML);

    const rawTeams = Array.isArray(rating.teams) ? rating.teams.slice() : [];

    const currentRows = rankTeams(rawTeams, archivedStages);
    const previousPlaces = calculatePreviousPlaces(rawTeams, archivedStages);

    const rows = currentRows.map(row => {
      const prevPlace = previousPlaces.get(row.teamId) || row.place;
      const moveDelta = prevPlace - row.place;

      return {
        place: row.place,
        team: row.team,
        stages: row.stages,
        points: row.ratingPoints || "—",
        finalPlace: "–",

        // Показуємо всю вагу сезону, не тільки зарахованих етапів
        weight: fmtKg(row.displayWeight),

        // Показуємо найбільшу рибу сезону
        bigFish: fmtKg(row.displayBigFish),

        moveDelta,
        qualifiedForFinal: row.place <= TOP_COUNT
      };
    });

    return {
      stagesCount,
      rows
    };
  }

  function renderRatingPayload(payload, offline = false) {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const stagesCount = Number(payload.stagesCount || 0);

    const contendersCount = Math.max(3, rows.length - TOP_COUNT);

    buildSkeleton(contendersCount);
    applyStageVisibility(stagesCount);

    const topRows = $("season-top") ? $("season-top").querySelectorAll("tr") : [];
    const contRows = $("season-contenders") ? $("season-contenders").querySelectorAll("tr") : [];

    rows.forEach((item, index) => {
      if (index < TOP_COUNT) {
        if (topRows[index]) renderRow(topRows[index], item);
      } else {
        const ci = index - TOP_COUNT;
        if (contRows[ci]) {
          renderRow(contRows[ci], {
            ...item,
            qualifiedForFinal: false
          });
        }
      }
    });

    if ($("seasonTitle")) $("seasonTitle").textContent = "Рейтинг STOLAR CARP";
    if ($("seasonKicker")) $("seasonKicker").textContent = `СЕЗОН ${SEASON_YEAR}`;

    if (!rows.length && !offline) {
      showError("⚠️ Немає даних рейтингу. Спочатку потрібно архівувати хоча б один етап.");
    } else if (!offline) {
      hideError();
    }

    setReadyFlag();
  }

  async function loadRating() {
    hideError();

    buildSkeleton(3);
    setReadyFlag();

    const cached = cacheGet();

    if (cached) {
      try {
        renderRatingPayload(cached, true);
      } catch (e) {
        console.warn("[Rating] cache render error:", e);
      }
    }

    try {
      const db = await waitReady();

      db.collection("seasonRating")
        .doc(SEASON_YEAR)
        .onSnapshot(
          (snap) => {
            if (!snap.exists) {
              showError(`⚠️ Немає документа seasonRating/${SEASON_YEAR}`);
              setReadyFlag();
              return;
            }

            const rating = snap.data() || {};
            const payload = convertRatingToRows(rating);

            cacheSet(payload);
            renderRatingPayload(payload, false);
          },
          (err) => {
            console.error("[Rating] onSnapshot error:", err);

            const c = cacheGet();

            if (c) {
              renderRatingPayload(c, true);
              showError("⚠️ Офлайн-режим. Показано кеш рейтингу.");
            } else {
              showError(
                `⚠️ Помилка читання seasonRating/${SEASON_YEAR}: ${safeText(err.message)}`
              );
            }

            setReadyFlag();
          }
        );

    } catch (e) {
      const c = cacheGet();

      if (c) {
        renderRatingPayload(c, true);
        showError("⚠️ Офлайн-режим. Показано кеш рейтингу.");
      } else {
        showError(
          `⚠️ Помилка завантаження рейтингу: ${safeText(e.message || e)}`
        );
      }

      setReadyFlag();
    }
  }

  window.refreshRating = async function () {
    cacheClear();
    showError("⏳ Оновлення рейтингу...");
    await loadRating();
  };

  document.addEventListener("DOMContentLoaded", loadRating);
})();

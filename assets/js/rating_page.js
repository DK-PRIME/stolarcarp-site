// assets/js/rating_page.js
// STOLAR CARP • Season Rating page
// Джерело: seasonRating/{year} + seasonResults/{year}/stages
// Етапи: бал = місце в зоні.
// Фінал: бал = загальне місце у фіналі.
// Рейтинг сезону = 2 кращі результати з Е1 / Е2 / Е3 / Фінал.
// Якщо команда має тільки 1 результат → додається 8 балів.
// Сортування: бали ↑, загальна вага всього турніру ↓, Big Fish всього турніру ↓.
// 1–3 місце рейтингу = головні переможці сезону.
// Big Fish сезону підсвічується помаранчевим кольором.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX_IN_HTML = 5;
  const SEASON_YEAR = "2026";
  const BEST_COUNT = 2;
  const ABSENT_POINTS = 8;

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CACHE_KEY = "sc_rating_cache_best2_with_final_v4_bigfish";

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

  function clean(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function injectBigFishStyle() {
    if (document.getElementById("sc-rating-bigfish-style")) return;

    const style = document.createElement("style");
    style.id = "sc-rating-bigfish-style";
    style.textContent = `
      .col-big.season-bigfish-winner{
        color:#f59e0b !important;
        font-weight:900 !important;
        text-shadow:0 0 6px rgba(245,158,11,.35);
      }
    `;
    document.head.appendChild(style);
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
      contTbody.insertAdjacentHTML("beforeend", rowHTML(TOP_COUNT + i + 1, false));
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

    const bigCell = tds[6 + STAGES_MAX_IN_HTML];
    bigCell.classList.remove("season-bigfish-winner");

    if (item.seasonBigFishWinner === true) {
      bigCell.classList.add("season-bigfish-winner");
    }

    bigCell.textContent = safeText(item.bigFish);

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

  function isFinalStage(stage) {
    const raw = clean(`${stage.stageDocId} ${stage.stageId} ${stage.stageName} ${stage.type} ${stage.stageType}`);
    return stage.isFinal === true || raw.includes("final") || raw.includes("фінал");
  }

  function stageSortValue(stage) {
    if (isFinalStage(stage)) return 9999;

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
            stageName: s,
            isFinal: isFinalStage({ stageDocId: s, stageId: s, stageName: s })
          };
        }

        const stage = {
          stageDocId: String(s.stageDocId || s.id || ""),
          stageId: String(s.stageId || s.stageDocId || s.id || ""),
          stageName: String(s.stageName || s.stageId || s.stageDocId || s.id || ""),
          type: String(s.type || ""),
          stageType: String(s.stageType || ""),
          isFinal: Boolean(s.isFinal)
        };

        stage.isFinal = isFinalStage(stage);
        return stage;
      })
      .filter(s => s.stageDocId)
      .sort((a, b) => stageSortValue(a) - stageSortValue(b));
  }

  function splitStages(archivedStages) {
    const regularStages = [];
    let finalStage = null;

    archivedStages.forEach(stage => {
      if (isFinalStage(stage)) finalStage = finalStage || stage;
      else regularStages.push(stage);
    });

    return { regularStages, finalStage };
  }

  function normalizeStandingRow(r) {
    return {
      teamId: String(r.teamId || "").trim(),
      team: String(r.team || r.teamName || "—").trim(),
      zone: String(r.zone || "").toUpperCase().trim(),
      sector: String(r.sector || "").trim(),

      overallPlace: num(r.overallPlace || r.finalPlace || r.place),
      zonePlace: num(r.zonePlace),
      points: num(r.points || r.zonePlace),

      totalWeight: num(r.totalWeight),
      bigFish: num(r.bigFish),
      totalCount: num(r.totalCount)
    };
  }

  function computeStageMap(standings) {
    const rows = (Array.isArray(standings) ? standings : []).map(normalizeStandingRow);
    const byTeamId = new Map();
    const byTeamName = new Map();

    const overallRows = rows.slice().sort((a, b) => {
      if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
      if (b.bigFish !== a.bigFish) return b.bigFish - a.bigFish;
      return String(a.team).localeCompare(String(b.team), "uk");
    });

    const overallPlaceByKey = new Map();

    overallRows.forEach((r, i) => {
      const key = r.teamId || clean(r.team);
      if (key) overallPlaceByKey.set(key, r.overallPlace || (i + 1));
    });

    ["A", "B", "C"].forEach(zone => {
      const zoneRows = rows
        .filter(r => r.zone === zone)
        .sort((a, b) => {
          if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
          if (b.bigFish !== a.bigFish) return b.bigFish - a.bigFish;
          return String(a.team).localeCompare(String(b.team), "uk");
        });

      zoneRows.forEach((r, i) => {
        const key = r.teamId || clean(r.team);
        const zonePlace = r.zonePlace || (i + 1);
        const fixed = {
          ...r,
          overallPlace: r.overallPlace || overallPlaceByKey.get(key) || 0,
          zonePlace,
          points: zonePlace
        };

        if (fixed.teamId) byTeamId.set(fixed.teamId, fixed);
        if (fixed.team) byTeamName.set(clean(fixed.team), fixed);
      });
    });

    rows
      .filter(r => !["A", "B", "C"].includes(r.zone))
      .forEach(r => {
        const key = r.teamId || clean(r.team);
        const fixed = {
          ...r,
          overallPlace: r.overallPlace || overallPlaceByKey.get(key) || 0,
          points: r.points || r.zonePlace || 0
        };

        if (fixed.teamId) byTeamId.set(fixed.teamId, fixed);
        if (fixed.team) byTeamName.set(clean(fixed.team), fixed);
      });

    return { byTeamId, byTeamName };
  }

  async function loadArchiveStageMaps(db, seasonYear, archivedStages) {
    const result = new Map();

    await Promise.all(archivedStages.map(async stage => {
      try {
        const snap = await db
          .collection("seasonResults")
          .doc(seasonYear)
          .collection("stages")
          .doc(stage.stageDocId)
          .get();

        if (!snap.exists) return;

        const d = snap.data() || {};
        const standings = Array.isArray(d.standings) ? d.standings : [];

        result.set(stage.stageDocId, computeStageMap(standings));
      } catch (e) {
        console.warn("[Rating] Не вдалося прочитати архів етапу:", stage.stageDocId, e);
      }
    }));

    return result;
  }

  function findArchiveRowForTeam(stageMap, team) {
    if (!stageMap || !team) return null;

    const teamId = String(team.teamId || "").trim();
    const teamName = clean(team.team || team.teamName || "");

    if (teamId && stageMap.byTeamId.has(teamId)) return stageMap.byTeamId.get(teamId);
    if (teamName && stageMap.byTeamName.has(teamName)) return stageMap.byTeamName.get(teamName);

    return null;
  }

  function readStageResultFromArchiveOrRating(team, stage, archiveMaps) {
    const final = isFinalStage(stage);
    const archiveMap = archiveMaps.get(stage.stageDocId);
    const archiveRow = findArchiveRowForTeam(archiveMap, team);

    if (archiveRow) {
      const place = final
        ? num(archiveRow.overallPlace || archiveRow.finalPlace || archiveRow.place || archiveRow.points)
        : num(archiveRow.zonePlace || archiveRow.points);

      if (!place) return null;

      return {
        p: place,
        pts: place,
        totalWeight: num(archiveRow.totalWeight),
        bigFish: num(archiveRow.bigFish),
        totalCount: num(archiveRow.totalCount),
        isFinal: final
      };
    }

    const stagesObj = team.stages || {};
    const s = stagesObj[stage.stageDocId] || stagesObj[stage.stageId] || null;

    if (!s) return null;

    const place = final
      ? num(s.overallPlace || s.finalPlace || s.points || s.place)
      : num(s.zonePlace || s.points || s.place);

    if (!place) return null;

    return {
      p: place,
      pts: place,
      totalWeight: num(s.totalWeight),
      bigFish: num(s.bigFish),
      totalCount: num(s.totalCount),
      isFinal: final
    };
  }

  function calculateBestResults(team, ratingStages, archiveMaps) {
    const allStagePoints = [];

    ratingStages.forEach(stage => {
      const result = readStageResultFromArchiveOrRating(team, stage, archiveMaps);

      if (result) {
        allStagePoints.push({
          stageDocId: stage.stageDocId,
          ...result,
          isNoShow: false
        });
      } else {
        allStagePoints.push({
          stageDocId: stage.stageDocId,
          p: "–",
          pts: ABSENT_POINTS,
          totalWeight: 0,
          bigFish: 0,
          totalCount: 0,
          isNoShow: true
        });
      }
    });

    const sorted = allStagePoints.slice().sort((a, b) => {
      if (a.pts !== b.pts) return a.pts - b.pts;
      if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
      return b.bigFish - a.bigFish;
    });

    const counted = sorted.slice(0, BEST_COUNT);
    const dropped = sorted.slice(BEST_COUNT);

    const countedKeys = new Set(counted.map(x => x.stageDocId));
    const droppedKeys = new Set(dropped.map(x => x.stageDocId));

    return {
      countedKeys,
      droppedKeys,
      ratingPoints: counted.reduce((s, x) => s + num(x.pts), 0)
    };
  }

  function makeStageCells(team, regularStages, bestInfo, archiveMaps) {
    return regularStages.slice(0, STAGES_MAX_IN_HTML).map(stage => {
      const result = readStageResultFromArchiveOrRating(team, stage, archiveMaps);

      if (!result) {
        const isCounted = bestInfo.countedKeys.has(stage.stageDocId);
        return {
          p: "–",
          pts: ABSENT_POINTS,
          noShow: true,
          counted: isCounted,
          dropped: !isCounted && bestInfo.droppedKeys.has(stage.stageDocId)
        };
      }

      return {
        p: result.p,
        pts: result.pts,
        counted: bestInfo.countedKeys.has(stage.stageDocId),
        noShow: false,
        dropped: bestInfo.droppedKeys.has(stage.stageDocId)
      };
    });
  }

  function getTournamentWeight(team, tournamentStages, archiveMaps) {
    let w = 0;

    tournamentStages.forEach(stage => {
      const r = readStageResultFromArchiveOrRating(team, stage, archiveMaps);
      if (r) w += num(r.totalWeight);
    });

    return w || num(team.totalWeight);
  }

  function getTournamentBigFish(team, tournamentStages, archiveMaps) {
    let bf = 0;

    tournamentStages.forEach(stage => {
      const r = readStageResultFromArchiveOrRating(team, stage, archiveMaps);
      if (r) bf = Math.max(bf, num(r.bigFish));
    });

    return bf || num(team.bigFish);
  }

  function rankTeams(rawTeams, regularStages, finalStage, archiveMaps) {
    const ratingStages = finalStage
      ? regularStages.concat([finalStage])
      : regularStages.slice();

    const tournamentStages = ratingStages.slice();

    const rows = rawTeams.map(team => {
      const bestInfo = calculateBestResults(team, ratingStages, archiveMaps);
      const stageCells = makeStageCells(team, regularStages, bestInfo, archiveMaps);

      const finalResult = finalStage
        ? readStageResultFromArchiveOrRating(team, finalStage, archiveMaps)
        : null;

      return {
        teamId: String(team.teamId || ""),
        team: team.team || team.teamName || "—",

        stages: stageCells,
        finalPlace: finalResult ? finalResult.p : "–",

        ratingPoints: bestInfo.ratingPoints,

        displayWeight: getTournamentWeight(team, tournamentStages, archiveMaps),
        displayBigFish: getTournamentBigFish(team, tournamentStages, archiveMaps)
      };
    });

    rows.sort((a, b) => {
      if (a.ratingPoints !== b.ratingPoints) return a.ratingPoints - b.ratingPoints;
      if (b.displayWeight !== a.displayWeight) return b.displayWeight - a.displayWeight;
      return b.displayBigFish - a.displayBigFish;
    });

    return rows.map((r, i) => ({
      ...r,
      place: i + 1
    }));
  }

  function calculatePreviousPlaces(rawTeams, archivedStages, archiveMaps) {
    if (archivedStages.length <= 1) return new Map();

    const previousArchivedStages = archivedStages.slice(0, -1);
    const { regularStages, finalStage } = splitStages(previousArchivedStages);
    const previousRows = rankTeams(rawTeams, regularStages, finalStage, archiveMaps);

    const map = new Map();

    previousRows.forEach(r => {
      if (r.teamId) map.set(r.teamId, r.place);
    });

    return map;
  }

  async function convertRatingToRows(db, rating) {
    const archivedStages = getArchivedStages(rating);
    const { regularStages, finalStage } = splitStages(archivedStages);

    const stagesCount = Math.min(regularStages.length, STAGES_MAX_IN_HTML);
    const rawTeams = Array.isArray(rating.teams) ? rating.teams.slice() : [];

    const archiveMaps = await loadArchiveStageMaps(db, SEASON_YEAR, archivedStages);

    const currentRows = rankTeams(rawTeams, regularStages, finalStage, archiveMaps);
    const previousPlaces = calculatePreviousPlaces(rawTeams, archivedStages, archiveMaps);

    const seasonBigFish = currentRows.reduce((max, row) => {
      return Math.max(max, num(row.displayBigFish));
    }, 0);

    const rows = currentRows.map(row => {
      const prevPlace = previousPlaces.get(row.teamId) || row.place;
      const moveDelta = prevPlace - row.place;

      return {
        place: row.place,
        team: row.team,
        stages: row.stages,
        points: row.ratingPoints || "—",
        finalPlace: row.finalPlace || "–",
        weight: fmtKg(row.displayWeight),
        bigFish: fmtKg(row.displayBigFish),
        seasonBigFishWinner: seasonBigFish > 0 && num(row.displayBigFish) === seasonBigFish,
        moveDelta,
        qualifiedForFinal: row.place <= TOP_COUNT
      };
    });

    return { stagesCount, rows };
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
          renderRow(contRows[ci], { ...item, qualifiedForFinal: false });
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
    injectBigFishStyle();
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
          async (snap) => {
            if (!snap.exists) {
              showError(`⚠️ Немає документа seasonRating/${SEASON_YEAR}`);
              setReadyFlag();
              return;
            }

            const rating = snap.data() || {};
            const payload = await convertRatingToRows(db, rating);

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
              showError(`⚠️ Помилка читання seasonRating/${SEASON_YEAR}: ${safeText(err.message)}`);
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
        showError(`⚠️ Помилка завантаження рейтингу: ${safeText(e.message || e)}`);
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

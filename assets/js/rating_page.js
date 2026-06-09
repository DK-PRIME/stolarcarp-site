// assets/js/rating_page.js
// STOLAR CARP • Season Rating page
// Джерело: seasonRating/{year}
// Дані вже підраховані під час архівації етапів

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX_IN_HTML = 5;
  const SEASON_YEAR = "2026";

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CACHE_KEY = "sc_rating_cache_archive_v1";

  function safeText(v, dash = "—") {
    return v === null || v === undefined || v === "" ? dash : String(v);
  }

  function fmtKg(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
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
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), payload })
      );
    } catch {}
  }

  function cacheClear() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }

  function rowHTML(place, qualified) {
    const trClass = qualified ? "row-qualified" : "";
    const placeStr = place === "—" ? "—" : String(place);

    return `
      <tr class="${trClass}">
        <td class="col-place"><span class="place-num">${placeStr}</span></td>
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

    const cc = Math.max(3, Number(contendersCount || 0));
    contTbody.innerHTML = "";

    for (let i = 0; i < cc; i++) {
      contTbody.insertAdjacentHTML(
        "beforeend",
        rowHTML(TOP_COUNT + i + 1, false)
      );
    }
  }

  function setMove(el, mv) {
    if (!el) return;

    el.classList.remove("move--up", "move--down", "move--same");
    el.classList.add("move--same");
    el.textContent = "–";
  }

  function renderRow(tr, item) {
    if (!tr || !item) return;

    const tds = tr.querySelectorAll("td");
    if (!tds || tds.length < 3 + STAGES_MAX_IN_HTML + 4) return;

    const pl = tr.querySelector(".place-num");
    if (pl) pl.textContent = safeText(item.place);

    setMove(tds[1].querySelector(".move"), item.move);

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
      }
    }

    const b = tds[3 + STAGES_MAX_IN_HTML].querySelector("b");
    if (b) b.textContent = safeText(item.points);

    tds[4 + STAGES_MAX_IN_HTML].textContent = safeText(item.finalPlace, "–");
    tds[5 + STAGES_MAX_IN_HTML].textContent = safeText(item.weight);
    tds[6 + STAGES_MAX_IN_HTML].textContent = safeText(item.bigFish);

    if (item.qualifiedForFinal === true) {
      tr.classList.add("row-qualified");
    } else {
      tr.classList.remove("row-qualified");
    }
  }

  function applyStageVisibility(stagesCount) {
    const count = Math.max(
      0,
      Math.min(STAGES_MAX_IN_HTML, Number(stagesCount || 0))
    );

    document.querySelectorAll(".table--season").forEach((table) => {
      const ths = table.querySelectorAll("thead th.col-stage");

      ths.forEach((th, i) => {
        const stageNo = i + 1;
        th.style.display = stageNo <= count ? "" : "none";

        if (stageNo <= count) {
          th.innerHTML = `Е${stageNo}<br>м / б`;
        }
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
    if (window.scReady) {
      await window.scReady;
    }

    const db = window.scDb;

    if (!db) {
      throw new Error("Firestore не ініціалізований.");
    }

    return db;
  }

  function stageSortValue(stage) {
    const raw = String(
      stage.stageId ||
      stage.stageDocId ||
      stage.id ||
      ""
    );

    const m = raw.match(/(\d+)/);
    return m ? Number(m[1]) : 999;
  }

  function getArchivedStageIds(rating) {
    const arr = Array.isArray(rating.archivedStages)
      ? rating.archivedStages
      : [];

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

  function convertRatingToRows(rating) {
    const teams = Array.isArray(rating.teams) ? rating.teams.slice() : [];
    const archivedStages = getArchivedStageIds(rating);

    const stagesCount = Math.min(archivedStages.length, STAGES_MAX_IN_HTML);

    teams.sort((a, b) => {
      if (Number(a.totalPoints || 0) !== Number(b.totalPoints || 0)) {
        return Number(a.totalPoints || 0) - Number(b.totalPoints || 0);
      }

      if (Number(b.totalWeight || 0) !== Number(a.totalWeight || 0)) {
        return Number(b.totalWeight || 0) - Number(a.totalWeight || 0);
      }

      return Number(b.bigFish || 0) - Number(a.bigFish || 0);
    });

    const rows = teams.map((team, index) => {
      const stagesObj = team.stages || {};

      const stageCells = archivedStages.slice(0, STAGES_MAX_IN_HTML).map(stage => {
        const s =
          stagesObj[stage.stageDocId] ||
          stagesObj[stage.stageId] ||
          null;

        if (!s) {
          return {
            p: "–",
            pts: "–",
            noShow: true
          };
        }

        return {
          p: s.place || "–",
          pts: s.points || s.place || "–",
          counted: true,
          noShow: false
        };
      });

      return {
        place: team.seasonPlace || index + 1,
        team: team.team || team.teamName || "—",
        stages: stageCells,
        points: Number(team.totalPoints || 0) || "—",
        finalPlace: "–",
        weight: fmtKg(team.totalWeight),
        bigFish: fmtKg(team.bigFish),
        qualifiedForFinal: index < TOP_COUNT
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

    const topRows = $("season-top")
      ? $("season-top").querySelectorAll("tr")
      : [];

    const contRows = $("season-contenders")
      ? $("season-contenders").querySelectorAll("tr")
      : [];

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

    if ($("seasonTitle")) {
      $("seasonTitle").textContent = `Рейтинг STOLAR CARP`;
    }

    if ($("seasonKicker")) {
      $("seasonKicker").textContent = `СЕЗОН ${SEASON_YEAR}`;
    }

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
        console.warn("[Rating] Помилка кешу:", e);
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

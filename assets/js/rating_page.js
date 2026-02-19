// assets/js/rating_page.js
// STOLAR CARP • Season Rating page (CANON FINAL, NO EXTRA SCREENS)
// ✅ Немає окремого "екрану завантаження" — одразу таблиця
// ✅ Етапи з competitions/{seasonCompId}.events (stage-1, stage1, Stage_2, "етап 3"...)
// ✅ TOP-18 + Претенденти (19+) з правильною нумерацією
// ✅ Етапи (Е1..Е5) видно і в верхній, і в нижній таблиці (FIX idx)
// ✅ Preview з public_participants (ВСІ етапи сезону, унікальні команди), потім realtime перезаписує TOP
// ✅ Кеш 5 хв + м’які помилки

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX_IN_HTML = 5; // у верстці E1..E5
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CACHE_KEY = "sc_rating_cache_v4";

  const PAID_STATUSES = ["confirmed", "paid", "payment_confirmed"];

  const norm = (v) => String(v ?? "").trim();
  const safeText = (v, dash = "—") =>
    v === null || v === undefined || v === "" ? dash : String(v);

  // ===================== READY FLAG =====================
  // 🔹 Головна фішка: ми БІЛЬШЕ не вмикаємо стан "0".
  // Завжди кажемо верстці, що сторінка готова → ніяких проміжних екранів.
  function setReadyFlag(isReady) {
    document.documentElement.setAttribute("data-rating-ready", "1");
  }

  // ===================== ERROR BOX =====================
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

  // ===================== CACHE =====================
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

  // ===================== TABLE SKELETON =====================
  function rowHTML(place, qualified) {
    const trClass = qualified ? "row-qualified" : "";
    const placeStr = place === "—" ? "—" : String(place);

    return `
      <tr class="${trClass}">
        <td class="col-place"><span class="place-num">${placeStr}</span></td>
        <td class="col-move"><span class="move move--same">–</span></td>
        <td class="col-team">-</td>

        ${new Array(STAGES_MAX_IN_HTML)
          .fill(0)
          .map(
            () => `
          <td class="col-stage">
            <div class="stage-cell">
              <span class="stage-place">–</span>
              <span class="stage-slash">/</span>
              <span class="stage-points">–</span>
            </div>
          </td>
        `
          )
          .join("")}

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

    // TOP
    topTbody.innerHTML = "";
    for (let i = 1; i <= TOP_COUNT; i++) {
      topTbody.insertAdjacentHTML("beforeend", rowHTML(i, true));
    }

    // CONTENDERS
    const cc = Math.max(3, Number(contendersCount || 0));
    contTbody.innerHTML = "";
    for (let i = 0; i < cc; i++) {
      // 19,20,21...
      contTbody.insertAdjacentHTML(
        "beforeend",
        rowHTML(TOP_COUNT + i + 1, false)
      );
    }
  }

  // ===================== MOVE =====================
  function setMove(el, mv) {
    if (!el) return;
    el.classList.remove("move--up", "move--down", "move--same");

    if (mv === "up") {
      el.classList.add("move--up");
      el.textContent = "▲";
      return;
    }
    if (mv === "down") {
      el.classList.add("move--down");
      el.textContent = "▼";
      return;
    }
    if (
      mv === "same" ||
      mv === 0 ||
      mv === "0" ||
      mv === "-" ||
      mv === "—" ||
      mv === "–"
    ) {
      el.classList.add("move--same");
      el.textContent = "–";
      return;
    }
    if (typeof mv === "number") {
      el.classList.add(mv > 0 ? "move--up" : mv < 0 ? "move--down" : "move--same");
      el.textContent =
        mv > 0 ? `▲${mv}` : mv < 0 ? `▼${Math.abs(mv)}` : "–";
      return;
    }
    el.classList.add("move--same");
    el.textContent = safeText(mv, "–");
  }

  // ===================== RENDER ROW =====================
  function renderRow(tr, item) {
    if (!tr || !item) return;
    const tds = tr.querySelectorAll("td");
    if (!tds || tds.length < 3 + STAGES_MAX_IN_HTML + 4) return;

    if (item.place !== undefined && item.place !== null) {
      const pl = tr.querySelector(".place-num");
      if (pl) pl.textContent = String(item.place);
    }

    setMove(tds[1].querySelector(".move"), item.move);

    tds[2].textContent = safeText(item.team, tds[2].textContent);

    const stages = Array.isArray(item.stages) ? item.stages : [];
    for (let i = 0; i < STAGES_MAX_IN_HTML; i++) {
      const cell = tds[3 + i];
      const placeEl = cell.querySelector(".stage-place");
      const ptsEl = cell.querySelector(".stage-points");
      const s = stages[i] || {};
      if (placeEl) placeEl.textContent = safeText(s.p, "–");
      if (ptsEl) ptsEl.textContent = safeText(s.pts, "–");
    }

    const b = tds[3 + STAGES_MAX_IN_HTML].querySelector("b");
    if (b) b.textContent = safeText(item.points, b.textContent);

    tds[4 + STAGES_MAX_IN_HTML].textContent = safeText(
      item.finalPlace,
      tds[4 + STAGES_MAX_IN_HTML].textContent
    );
    tds[5 + STAGES_MAX_IN_HTML].textContent = safeText(
      item.weight,
      tds[5 + STAGES_MAX_IN_HTML].textContent
    );
    tds[6 + STAGES_MAX_IN_HTML].textContent = safeText(
      item.bigFish,
      tds[6 + STAGES_MAX_IN_HTML].textContent
    );
  }

  // ===================== STAGES VISIBILITY (для 2 таблиць) =====================
  function applyStageVisibility(stagesCount) {
    const count = Math.max(
      0,
      Math.min(STAGES_MAX_IN_HTML, Number(stagesCount || 0))
    );

    // заголовки
    document.querySelectorAll(".table--season").forEach((table) => {
      const ths = table.querySelectorAll("thead th.col-stage");
      ths.forEach((th, i) => {
        const stageNo = i + 1;
        th.style.display = stageNo <= count ? "" : "none";
        if (stageNo <= count) th.innerHTML = `Е${stageNo}<br>м / б`;
      });
    });

    // клітинки
    document.querySelectorAll(".table--season tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td.col-stage");
      tds.forEach((td, i) => {
        const stageNo = i + 1;
        td.style.display = stageNo <= count ? "" : "none";
      });
    });

    document.body.setAttribute("data-stages", String(count));
  }

  // ===================== FIRESTORE READY =====================
  async function waitFirestore(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const db =
        window.scDb ||
        window.db ||
        (window.firebase &&
          window.firebase.firestore &&
          window.firebase.firestore());
      if (db) return db;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase DB не готовий (нема scDb).");
  }

  // ===================== SEASON COMP ID =====================
  async function resolveSeasonCompId(db) {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("season");
    if (fromUrl) return fromUrl;

    try {
      const s = await db.collection("settings").doc("app").get();
      if (s.exists) {
        const d = s.data() || {};
        if (d.activeSeasonId) return String(d.activeSeasonId);
        if (d.activeCompetitionId) return String(d.activeCompetitionId);
        if (d.activeCompId) return String(d.activeCompId);
      }
    } catch {}

    return "season-2026";
  }

  // ===================== PARSE EVENTS -> STAGES =====================
  function extractStageEvents(events) {
    const list = [];
    for (const e of Array.isArray(events) ? events : []) {
      const raw = String(e?.key || e?.stageId || e?.id || "").trim();
      if (!raw) continue;

      const low = raw.toLowerCase();
      const looksLikeStage =
        low.includes("stage") || low.includes("етап") || low.startsWith("e");
      const m = raw.match(/(\d+)/);
      if (!m) continue;

      const n = parseInt(m[1], 10);
      if (!Number.isFinite(n)) continue;

      if (looksLikeStage) list.push({ key: raw, n });
    }

    list.sort((a, b) => a.n - b.n);

    const uniq = [];
    const used = new Set();
    for (const it of list) {
      if (used.has(it.n)) continue;
      used.add(it.n);
      uniq.push(it);
    }
    return uniq;
  }

  async function getSeasonConfig(db, seasonCompId) {
    let stagesCount = 0;
    let hasFinal = false;

    try {
      const c = await db.collection("competitions").doc(seasonCompId).get();
      if (c.exists) {
        const data = c.data() || {};
        const events = Array.isArray(data.events) ? data.events : [];

        const stageEvents = extractStageEvents(events);
        stagesCount = stageEvents.length;

        hasFinal = events.some((e) => {
          const k = String(e?.key || e?.stageId || e?.id || "").toLowerCase();
          return k === "final" || k.includes("final") || k.includes("фінал");
        });

        if ($("seasonTitle") && (data.name || data.title))
          $("seasonTitle").textContent = String(data.name || data.title);
        if ($("seasonKicker") && (data.year || data.seasonYear))
          $("seasonKicker").textContent = `СЕЗОН ${
            data.year || data.seasonYear
          }`;
      }
    } catch {}

    if (!Number.isFinite(stagesCount) || stagesCount < 0) stagesCount = 0;
    if (stagesCount > STAGES_MAX_IN_HTML) stagesCount = STAGES_MAX_IN_HTML;

    document.body.setAttribute("data-has-final", hasFinal ? "1" : "0");

    return { stagesCount, hasFinal };
  }

  // ===================== TS HELPERS =====================
  function getTsMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts._seconds) return ts._seconds * 1000;
    return 0;
  }

  // ===================== PAID TEAMS (SEASON: ANY STAGE) =====================
  async function loadPaidTeamsForSeason(db, seasonCompId) {
    let snap;

    try {
      snap = await db
        .collection("public_participants")
        .where("competitionId", "==", seasonCompId)
        .where("entryType", "==", "team")
        .where("status", "in", PAID_STATUSES)
        .get();
    } catch (e) {
      // fallback без entryType
      snap = await db
        .collection("public_participants")
        .where("competitionId", "==", seasonCompId)
        .where("status", "in", PAID_STATUSES)
        .get();
    }

    const map = new Map(); // teamId -> {teamId, team, firstTs}

    snap.forEach((doc) => {
      const r = doc.data() || {};
      const teamId = r.teamId || doc.id;
      if (!teamId) return;

      const teamName = norm(r.teamName || "—");
      const ts =
        getTsMillis(r.confirmedAt) || getTsMillis(r.createdAt) || 0;

      const prev = map.get(teamId);
      if (!prev) {
        map.set(teamId, { teamId, team: teamName, firstTs: ts });
      } else {
        if (ts && (!prev.firstTs || ts < prev.firstTs)) prev.firstTs = ts;
        if (
          (prev.team === "—" || prev.team === "-") &&
          teamName &&
          teamName !== "—"
        )
          prev.team = teamName;
      }
    });

    const rows = Array.from(map.values());
    rows.sort((a, b) => (a.firstTs || 0) - (b.firstTs || 0));

    return rows;
  }

  // ===================== REALTIME RESULTS =====================
  async function loadRealtimeIfAllowed(db) {
    try {
      const snap = await db.collection("results").doc("realtime").get();
      if (!snap.exists) return null;
      return snap.data() || {};
    } catch (e) {
      return { __error: String(e?.message || e) };
    }
  }

  // ===================== RENDER DATA =====================
  function renderData(
    { stagesCount, paidTeams = [], realtime = null },
    isOffline = false
  ) {
    const contendersCount = Math.max(0, paidTeams.length - TOP_COUNT);
    buildSkeleton(contendersCount);

    applyStageVisibility(stagesCount);

    const topRows = $("season-top")
      ? $("season-top").querySelectorAll("tr")
      : [];
    const contRows = $("season-contenders")
      ? $("season-contenders").querySelectorAll("tr")
      : [];

    // Preview TOP
    for (
      let i = 0;
      i < Math.min(TOP_COUNT, paidTeams.length, topRows.length);
      i++
    ) {
      renderRow(topRows[i], { place: i + 1, team: paidTeams[i].team });
    }

    // Preview contenders 19+
    if (paidTeams.length > TOP_COUNT) {
      const rest = paidTeams.slice(TOP_COUNT);
      for (let i = 0; i < Math.min(rest.length, contRows.length); i++) {
        renderRow(contRows[i], {
          place: TOP_COUNT + i + 1,
          team: rest[i].team,
        });
      }
    }

    // Realtime overwrite TOP (як у каноні)
    if (realtime && !realtime.__error) {
      if ($("seasonTitle") && realtime.seasonTitle)
        $("seasonTitle").textContent = String(realtime.seasonTitle);
      if ($("seasonKicker") && realtime.seasonYear)
        $("seasonKicker").textContent = `СЕЗОН ${realtime.seasonYear}`;

      if (realtime.seasonStages)
        applyStageVisibility(Number(realtime.seasonStages));

      const top = Array.isArray(realtime.seasonRatingTop)
        ? realtime.seasonRatingTop
        : [];
      if (top.length && topRows.length) {
        for (let i = 0; i < Math.min(topRows.length, top.length); i++) {
          renderRow(topRows[i], top[i]);
        }
      }
    }

    if (!paidTeams.length && !isOffline) {
      showError(
        "⚠️ Немає даних: немає жодної команди зі статусом confirmed/paid у public_participants для цього сезону."
      );
    } else if (!isOffline) {
      hideError();
    }

    setReadyFlag(true);
  }

  // ===================== MAIN LOAD =====================
  async function loadRating() {
    hideError();

    // 1) Одразу малюємо таблицю (скелет) і кажемо верстці, що все ОК
    buildSkeleton(3);
    setReadyFlag(true);

    // 2) Якщо є кеш — миттєво показуємо останній живий рейтинг
    const cached = cacheGet();
    if (cached) {
      try {
        renderData(cached, true);
      } catch (e) {
        console.warn("Render from cache failed", e);
      }
    }

    // 3) У фоні тягнемо свіжі дані з Firestore
    try {
      const db = await waitFirestore();
      const seasonCompId = await resolveSeasonCompId(db);
      const { stagesCount } = await getSeasonConfig(db, seasonCompId);

      let paidTeams = [];
      try {
        paidTeams = await loadPaidTeamsForSeason(db, seasonCompId);
      } catch {}

      const realtime = await loadRealtimeIfAllowed(db);
      if (realtime && realtime.__error) {
        showError(
          `⚠️ <b>Realtime недоступний</b><br><span class="hint">${safeText(
            realtime.__error
          )}</span>`
        );
      }

      const payload = { stagesCount, paidTeams, realtime };
      cacheSet(payload);

      renderData(payload, false);
    } catch (e) {
      const c = cacheGet();
      if (c) {
        renderData(c, true);
        showError(
          `⚠️ <b>Офлайн-режим</b><br>Показано кеш. Спробуй оновити сторінку.`
        );
      } else {
        showError(
          `⚠️ <b>Помилка завантаження</b><br>Причина: <span class="hint">${safeText(
            e?.message || e
          )}</span>`
        );
      }
      setReadyFlag(true);
    }
  }

  // ручне оновлення з кнопки
  window.refreshRating = async function () {
    cacheClear();
    showError("⏳ Оновлення...");
    await loadRating();
  };

  document.addEventListener("DOMContentLoaded", () => {
    loadRating();
  });
})();

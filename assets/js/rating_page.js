
# Створюю виправлений rating_page.js — миттєвий показ таблиці

rating_page_js = '''// assets/js/rating_page.js
// STOLAR CARP • Season Rating page (STALKER SYSTEM — Командний Сталкер)
// ✅ МИТТЄВИЙ ПОКАЗ: таблиця з'являється відразу, дані підвантажуються потім
// ✅ Кеш 5 хв — показуємо кеш одразу, потім оновлюємо
// ✅ Fallback: якщо немає Firestore — показуємо порожню таблицю
// ✅ Завантаження зважувань з колекції weighings
// ✅ Розрахунок місць в зонах по сумарній вазі

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX_IN_HTML = 5;
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CACHE_KEY = "sc_rating_cache_v6_stalker";

  const PAID_STATUSES = ["confirmed", "paid", "payment_confirmed"];

  const norm = (v) => String(v ?? "").trim();
  const safeText = (v, dash = "—") =>
    v === null || v === undefined || v === "" ? dash : String(v);

  // ===================== READY FLAG =====================
  function setReadyFlag() {
    document.documentElement.setAttribute("data-rating-ready", "1");
    // Ховаємо екран завантаження якщо є
    const loader = document.querySelector('.rating-loader, .season-loader, [class*="loader"]');
    if (loader) loader.style.display = 'none';
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

  // ===================== STAGES VISIBILITY =====================
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

  // ===================== FIRESTORE READY (з таймаутом) =====================
  async function waitFirestore(maxMs = 3000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const db =
        window.scDb ||
        window.db ||
        (window.firebase &&
          window.firebase.firestore &&
          window.firebase.firestore());
      if (db) return db;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null; // Не кидаємо помилку, просто повертаємо null
  }

  // ===================== SEASON COMP ID =====================
  async function resolveSeasonCompId(db) {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("season");
    if (fromUrl) return fromUrl;

    if (db) {
      try {
        const s = await db.collection("settings").doc("app").get();
        if (s.exists) {
          const d = s.data() || {};
          if (d.activeSeasonId) return String(d.activeSeasonId);
          if (d.activeCompetitionId) return String(d.activeCompetitionId);
          if (d.activeCompId) return String(d.activeCompId);
        }
      } catch {}
    }

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
      const m = raw.match(/(\\d+)/);
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

    if (db) {
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
    }

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

  // ===================== PAID TEAMS =====================
  async function loadPaidTeamsForSeason(db, seasonCompId) {
    if (!db) return [];
    let snap;

    try {
      snap = await db
        .collection("public_participants")
        .where("competitionId", "==", seasonCompId)
        .where("entryType", "==", "team")
        .where("status", "in", PAID_STATUSES)
        .get();
    } catch (e) {
      try {
        snap = await db
          .collection("public_participants")
          .where("competitionId", "==", seasonCompId)
          .where("status", "in", PAID_STATUSES)
          .get();
      } catch {
        return [];
      }
    }

    const map = new Map();

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

  // ===================== STALKER RATING ENGINE =====================

  async function loadWeighingsForStage(db, seasonCompId, stageId) {
    if (!db) return [];
    const weighings = [];
    
    try {
      const snap = await db
        .collection("weighings")
        .where("compId", "==", seasonCompId)
        .where("stageId", "==", stageId)
        .get();

      snap.forEach((doc) => {
        const w = doc.data() || {};
        if (w.status !== "submitted" && w.status !== "confirmed") return;
        
        weighings.push({
          teamId: w.teamId || "",
          teamName: w.teamName || "—",
          zone: (w.zone || "").toUpperCase(),
          weighNo: parseInt(w.weighNo) || 0,
          weight: parseFloat(w.totalWeightKg) || 0,
          bigFish: parseFloat(w.bigFishKg) || 0,
          fishCount: parseInt(w.fishCount) || 0
        });
      });
    } catch (e) {
      console.warn(`Failed to load weighings for ${stageId}:`, e);
    }

    return weighings;
  }

  function calculateStageResults(weighings) {
    const teamMap = new Map();
    
    for (const w of weighings) {
      const existing = teamMap.get(w.teamId);
      if (!existing) {
        teamMap.set(w.teamId, {
          teamId: w.teamId,
          teamName: w.teamName,
          zone: w.zone,
          totalWeight: w.weight,
          bigFish: w.bigFish,
          fishCount: w.fishCount
        });
      } else {
        existing.totalWeight += w.weight;
        existing.fishCount += w.fishCount;
        if (w.bigFish > existing.bigFish) {
          existing.bigFish = w.bigFish;
        }
      }
    }

    const zones = { A: [], B: [], C: [] };
    for (const team of teamMap.values()) {
      const zone = team.zone;
      if (zones[zone]) {
        zones[zone].push(team);
      }
    }

    const results = [];
    
    for (const [zoneName, teams] of Object.entries(zones)) {
      teams.sort((a, b) => b.totalWeight - a.totalWeight);
      
      teams.forEach((team, idx) => {
        team.place = idx + 1;
        team.points = idx + 1;
        team.zone = zoneName;
        results.push(team);
      });
    }

    return results;
  }

  function calculateSeasonRating(stageResults, paidTeams) {
    const teamMap = new Map();
    
    for (const pt of paidTeams) {
      teamMap.set(pt.teamId, {
        teamId: pt.teamId,
        teamName: pt.team,
        totalPoints: 0,
        totalWeight: 0,
        maxBigFish: 0,
        stages: []
      });
    }
    
    for (let stageIdx = 0; stageIdx < stageResults.length; stageIdx++) {
      const stage = stageResults[stageIdx];
      
      for (const team of stage) {
        let entry = teamMap.get(team.teamId);
        if (!entry) {
          entry = {
            teamId: team.teamId,
            teamName: team.teamName,
            totalPoints: 0,
            totalWeight: 0,
            maxBigFish: 0,
            stages: []
          };
          teamMap.set(team.teamId, entry);
        }

        entry.totalPoints += team.points;
        entry.totalWeight += team.totalWeight;
        if (team.bigFish > entry.maxBigFish) {
          entry.maxBigFish = team.bigFish;
        }

        entry.stages[stageIdx] = {
          p: team.place,
          pts: team.points,
          w: team.totalWeight.toFixed(2),
          bf: team.bigFish.toFixed(2),
          z: team.zone
        };
      }
    }

    const teams = Array.from(teamMap.values());
    
    teams.sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) {
        return a.totalPoints - b.totalPoints;
      }
      if (a.totalWeight !== b.totalWeight) {
        return b.totalWeight - a.totalWeight;
      }
      return b.maxBigFish - a.maxBigFish;
    });

    return teams.map((team, idx) => ({
      place: idx + 1,
      team: team.teamName,
      points: team.totalPoints,
      weight: team.totalWeight.toFixed(2),
      bigFish: team.maxBigFish.toFixed(2),
      stages: team.stages.map(s => s ? { p: s.p, pts: s.pts } : { p: "—", pts: "—" })
    }));
  }

  async function loadAllStageData(db, seasonCompId, stageEvents) {
    const stageResults = [];
    
    for (const event of stageEvents) {
      const weighings = await loadWeighingsForStage(db, seasonCompId, event.key);
      
      if (weighings.length > 0) {
        const results = calculateStageResults(weighings);
        stageResults.push(results);
      }
    }
    
    return stageResults;
  }

  // ===================== RENDER DATA =====================
  function renderData(
    { stagesCount, rating = [], paidTeams = [] },
    isOffline = false
  ) {
    const contendersCount = Math.max(0, rating.length - TOP_COUNT);
    buildSkeleton(contendersCount);

    applyStageVisibility(stagesCount);

    const topRows = $("season-top")
      ? $("season-top").querySelectorAll("tr")
      : [];
    const contRows = $("season-contenders")
      ? $("season-contenders").querySelectorAll("tr")
      : [];

    for (let i = 0; i < Math.min(TOP_COUNT, rating.length, topRows.length); i++) {
      renderRow(topRows[i], rating[i]);
    }

    if (rating.length > TOP_COUNT) {
      const rest = rating.slice(TOP_COUNT);
      for (let i = 0; i < Math.min(rest.length, contRows.length); i++) {
        renderRow(contRows[i], rest[i]);
      }
    }

    if (!rating.length && !isOffline) {
      // Не показуємо помилку — просто порожня таблиця
    } else if (!isOffline) {
      hideError();
    }

    setReadyFlag();
  }

  // ===================== MAIN LOAD =====================
  async function loadRating() {
    hideError();

    // 1. ОДРАЗУ показуємо таблицю (скелет)
    buildSkeleton(3);
    applyStageVisibility(0); // Поки 0 етапів видно, потім оновимо
    setReadyFlag();

    // 2. Якщо є кеш — одразу заповнюємо даними
    const cached = cacheGet();
    if (cached) {
      try {
        renderData(cached, true);
      } catch (e) {
        console.warn("Render from cache failed", e);
      }
    }

    // 3. У фоні тягнемо свіжі дані
    try {
      const db = await waitFirestore();
      
      if (!db) {
        console.warn("Firebase DB не доступний");
        return;
      }
      
      const seasonCompId = await resolveSeasonCompId(db);
      const { stagesCount } = await getSeasonConfig(db, seasonCompId);

      let stageEvents = [];
      try {
        const c = await db.collection("competitions").doc(seasonCompId).get();
        if (c.exists) {
          const data = c.data() || {};
          const events = Array.isArray(data.events) ? data.events : [];
          stageEvents = extractStageEvents(events);
        }
      } catch (e) {
        console.warn("Failed to get stage events:", e);
      }

      const stageResults = await loadAllStageData(db, seasonCompId, stageEvents);
      
      let paidTeams = [];
      try {
        paidTeams = await loadPaidTeamsForSeason(db, seasonCompId);
      } catch {}

      const rating = calculateSeasonRating(stageResults, paidTeams);
      
      const payload = { stagesCount, rating, paidTeams };
      cacheSet(payload);

      renderData(payload, false);
    } catch (e) {
      console.warn("Load rating error:", e);
      // Не показуємо помилку — таблиця вже показана
    }
  }

  // ручне оновлення
  window.refreshRating = async function () {
    cacheClear();
    await loadRating();
  };

  document.addEventListener("DOMContentLoaded", () => {
    loadRating();
  });
})();
'''

# Зберігаємо файл
with open('/mnt/agents/output/rating_page_fast.js', 'w', encoding='utf-8') as f:
    f.write(rating_page_js)

print("✅ Файл створено!")
print(f"Розмір: {len(rating_page_js)} символів")
print("\n📋 Ключові зміни для швидкого показу:")
print("1. setReadyFlag() — одразу ховає loader і показує таблицю")
print("2. waitFirestore() — таймаут 3 сек замість 12, не кидає помилку")
print("3. loadRating() — спочатку buildSkeleton(), потім дані")
print("4. Кеш — показується МИТТЄВО, потім оновлюється")
print("5. Немає блокуючих помилок — таблиця завжди видима")

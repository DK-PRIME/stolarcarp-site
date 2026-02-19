// assets/js/rating_page.js
// STOLAR CARP • Season Rating page (IDEAL)
// ✅ ТОП-18 завжди (скелет)
// ✅ Претенденти 19+ (правильна нумерація + етапи)
// ✅ Етапи = з competitions/{seasonCompId}.events (реальна кількість створених)
// ✅ Preview: paid/confirmed команд Етапу 1 з public_participants
// ✅ Results: results/realtime може заповнити ВСЮ таблицю (top + contenders)
// ✅ Кеш по seasonCompId (не плутає сезони)
// ✅ Не ламає сторінку при помилках/permission-denied
// ✅ FIX: фінал розпізнається ТІЛЬКИ як точне "final" (не semifinal, не finalstage, не фінал)

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX_IN_HTML = 5; // у верстці E1..E5
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 хв

  const PAID_STATUSES = ["confirmed", "paid", "payment_confirmed"];

  const norm = (v) => String(v ?? "").trim();
  const safeText = (v, dash = "—") => (v === null || v === undefined || v === "" ? dash : String(v));

  // -------------------- UI (error / info) --------------------

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

  function setLastUpdate(ts) {
    const el = $("ratingLastUpdate");
    if (!el) return;
    if (!ts) { el.textContent = ""; return; }
    try {
      el.textContent = `Оновлено: ${new Date(ts).toLocaleString("uk-UA")}`;
    } catch {
      el.textContent = "";
    }
  }

  // -------------------- Cache (per season) --------------------

  const Cache = {
    keyBase: "sc_rating_cache_v2",
    _key(seasonCompId) { return `${this.keyBase}__${String(seasonCompId || "unknown")}`; },

    get(seasonCompId) {
      try {
        const raw = localStorage.getItem(this._key(seasonCompId));
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data.ts || Date.now() - data.ts > CACHE_TTL_MS) return null;
        return data.payload;
      } catch { return null; }
    },

    set(seasonCompId, payload) {
      try {
        localStorage.setItem(this._key(seasonCompId), JSON.stringify({ ts: Date.now(), payload }));
      } catch {}
    },

    clear(seasonCompId) {
      try { localStorage.removeItem(this._key(seasonCompId)); } catch {}
    }
  };

  // -------------------- Firestore helpers --------------------

  async function waitFirestore(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const db =
        window.scDb ||
        window.db ||
        (window.firebase && window.firebase.firestore && window.firebase.firestore());
      if (db) return db;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase DB не готовий (нема scDb).");
  }

  function getTsMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts._seconds) return ts._seconds * 1000;
    return 0;
  }

  // 1) seasonCompId:
  // - ?season=season-2026
  // - settings/app.activeCompetitionId (або activeSeasonId)
  // - fallback season-2026
  async function resolveSeasonCompId(db) {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("season");
    if (fromUrl) return String(fromUrl);

    try {
      const s = await db.collection("settings").doc("app").get();
      if (s.exists) {
        const d = s.data() || {};
        return String(d.activeCompetitionId || d.activeSeasonId || d.activeCompId || "season-2026");
      }
    } catch {}
    return "season-2026";
  }

  // 2) Season config: stages + final
  // Беремо competitions/{seasonCompId}.events
  // Розпізнаємо stage-1, stage1, Stage_2, "ЕТАП 3", etc (будь-що з цифрою)
  // Фінал = ТІЛЬКИ точне "final" (case-insensitive)
  async function getSeasonConfig(db, seasonCompId) {
    let stagesCount = 0;
    let hasFinal = false;
    let stage1Key = null;

    try {
      const c = await db.collection("competitions").doc(seasonCompId).get();
      if (c.exists) {
        const data = c.data() || {};
        const events = Array.isArray(data.events) ? data.events : [];

        // Заголовок сторінки
        if ($("seasonTitle") && (data.name || data.title)) {
          $("seasonTitle").textContent = String(data.name || data.title);
        }

        // Витяг stage events
        const stageEvents = events
          .map((e) => {
            const keyRaw = String(e?.key || e?.stageId || e?.id || e?.code || "").trim();
            if (!keyRaw) return null;

            // беремо цифру як індекс етапу
            const m = keyRaw.match(/(\d+)/);
            const n = m ? parseInt(m[1], 10) : null;

            // якщо нема цифри — швидше за все це не етап (може "final")
            if (!Number.isFinite(n)) return null;

            // фільтр: щоб не тягнути "2026" з season-2026 випадково — беремо події, де є "stage" або "етап"
            const low = keyRaw.toLowerCase();
            const looksLikeStage = low.includes("stage") || low.includes("етап") || low.startsWith("e");
            if (!looksLikeStage) return null;

            return { key: keyRaw, n };
          })
          .filter(Boolean)
          .sort((a, b) => a.n - b.n);

        stagesCount = stageEvents.length;
        stage1Key = stageEvents[0]?.key || null;

        // ✅ FIX: final event — ТІЛЬКИ точне співпадіння "final" (не semifinal, не finalstage, не фінал)
        hasFinal = events.some((e) => {
          const k = String(e?.key || e?.stageId || e?.id || "").toLowerCase().trim();
          return k === "final";
        });
      }
    } catch {}

    // fallback
    if (!stage1Key) stage1Key = "stage-1";
    if (!stagesCount) stagesCount = 3; // safe fallback

    document.body.setAttribute("data-stages", String(stagesCount || 0));
    document.body.setAttribute("data-has-final", hasFinal ? "1" : "0");

    return { stagesCount, hasFinal, stage1Key };
  }

  // -------------------- Rendering (skeleton + rows) --------------------

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

  // build 18 top + N contenders (min 3)
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
      contTbody.insertAdjacentHTML("beforeend", rowHTML("—", false));
    }
  }

  function setMove(el, mv) {
    if (!el) return;
    el.classList.remove("move--up", "move--down", "move--same");

    if (mv === "up") { el.classList.add("move--up"); el.textContent = "▲"; return; }
    if (mv === "down") { el.classList.add("move--down"); el.textContent = "▼"; return; }
    if (mv === "same" || mv === 0 || mv === "0" || mv === "-" || mv === "—" || mv === "–") {
      el.classList.add("move--same"); el.textContent = "–"; return;
    }
    if (typeof mv === "number") {
      el.classList.add(mv > 0 ? "move--up" : mv < 0 ? "move--down" : "move--same");
      el.textContent = mv > 0 ? `▲${mv}` : mv < 0 ? `▼${Math.abs(mv)}` : "–";
      return;
    }
    el.classList.add("move--same");
    el.textContent = safeText(mv, "–");
  }

  function renderRow(tr, item) {
    if (!tr || !item) return;
    const tds = tr.querySelectorAll("td");
    if (!tds || tds.length < (3 + STAGES_MAX_IN_HTML + 4)) return;

    // place
    if (item.place !== undefined && item.place !== null) {
      const pl = tr.querySelector(".place-num");
      if (pl) pl.textContent = String(item.place);
    }

    // move
    setMove(tds[1].querySelector(".move"), item.move);

    // team
    tds[2].textContent = safeText(item.team, tds[2].textContent);

    // stages cells
    const stages = Array.isArray(item.stages) ? item.stages : [];
    for (let i = 0; i < STAGES_MAX_IN_HTML; i++) {
      const cell = tds[3 + i];
      const place = cell.querySelector(".stage-place");
      const pts = cell.querySelector(".stage-points");
      const s = stages[i] || {};
      if (place) place.textContent = safeText(s.p, "–");
      if (pts) pts.textContent = safeText(s.pts, "–");
    }

    // points/final/weight/big
    const b = tds[3 + STAGES_MAX_IN_HTML].querySelector("b");
    if (b) b.textContent = safeText(item.points, b.textContent);

    tds[4 + STAGES_MAX_IN_HTML].textContent = safeText(item.finalPlace, tds[4 + STAGES_MAX_IN_HTML].textContent);
    tds[5 + STAGES_MAX_IN_HTML].textContent = safeText(item.weight, tds[5 + STAGES_MAX_IN_HTML].textContent);
    tds[6 + STAGES_MAX_IN_HTML].textContent = safeText(item.bigFish, tds[6 + STAGES_MAX_IN_HTML].textContent);
  }

  // hide/show stage columns for BOTH tables, based on stagesCount (created stages)
  function applyStageVisibility(stagesCount) {
    const count = Math.max(0, Math.min(STAGES_MAX_IN_HTML, Number(stagesCount || 0)));

    // headers (both tables)
    document.querySelectorAll(".table--season thead th.col-stage").forEach((th, idx) => {
      const stageNo = idx + 1;
      th.style.display = stageNo <= count ? "" : "none";
      if (stageNo <= count) th.innerHTML = `E${stageNo}<br>м / б`;
    });

    // cells (both tables)
    document.querySelectorAll(".table--season tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td.col-stage");
      tds.forEach((td, idx) => {
        const stageNo = idx + 1;
        td.style.display = stageNo <= count ? "" : "none";
      });
    });
  }

  // -------------------- Data sources --------------------

  // Preview: paid teams of Stage 1 from public_participants
  async function loadPaidTeamsForStage1(db, seasonCompId, stage1Key) {
    const snap = await db.collection("public_participants")
      .where("competitionId", "==", seasonCompId)
      .where("entryType", "==", "team")
      .where("status", "in", PAID_STATUSES)
      .get();

    const map = new Map(); // teamId -> row

    snap.forEach((doc) => {
      const r = doc.data() || {};
      const docStage = String(r.stageId || "").trim();
      if (String(docStage) !== String(stage1Key)) return;

      const teamId = r.teamId || doc.id;
      if (!teamId) return;

      if (!map.has(teamId)) {
        map.set(teamId, {
          teamId,
          team: norm(r.teamName || "—"),
          orderPaid: Number.isFinite(r.orderPaid) ? r.orderPaid : null,
          confirmedAt: r.confirmedAt || null,
          createdAt: r.createdAt || null
        });
      }
    });

    const rows = Array.from(map.values());

    // sort by orderPaid -> confirmedAt -> createdAt
    rows.sort((a, b) => {
      if (Number.isFinite(a.orderPaid) && Number.isFinite(b.orderPaid)) return a.orderPaid - b.orderPaid;
      if (Number.isFinite(a.orderPaid)) return -1;
      if (Number.isFinite(b.orderPaid)) return 1;

      const at = getTsMillis(a.confirmedAt) || getTsMillis(a.createdAt);
      const bt = getTsMillis(b.confirmedAt) || getTsMillis(b.createdAt);
      return at - bt;
    });

    return rows;
  }

  // Results: results/realtime (public)
  async function loadRealtime(db) {
    try {
      const snap = await db.collection("results").doc("realtime").get();
      if (!snap.exists) return null;
      return snap.data() || {};
    } catch (e) {
      return { __error: String(e?.message || e) };
    }
  }

  // normalize result arrays:
  // - seasonRatingAll: full list
  // - or seasonRatingTop + seasonRatingContenders
  function getFullRatingFromRealtime(rt) {
    if (!rt || rt.__error) return null;

    const all = Array.isArray(rt.seasonRatingAll) ? rt.seasonRatingAll : null;
    if (all && all.length) return all;

    const top = Array.isArray(rt.seasonRatingTop) ? rt.seasonRatingTop : [];
    const cont = Array.isArray(rt.seasonRatingContenders) ? rt.seasonRatingContenders : [];

    if (top.length || cont.length) return top.concat(cont);

    return null;
  }

  // -------------------- Main render pipeline --------------------

  async function loadRating() {
    hideError();
    setLastUpdate(null);

    const db = await waitFirestore();
    const seasonCompId = await resolveSeasonCompId(db);

    // 0) show cached immediately
    const cached = Cache.get(seasonCompId);
    if (cached) {
      renderData(cached, { fromCache: true });
      setLastUpdate(cached.ts || null);
    }

    // 1) load season config
    const { stagesCount, stage1Key } = await getSeasonConfig(db, seasonCompId);

    // 2) load preview
    let paidTeams = [];
    try {
      paidTeams = await loadPaidTeamsForStage1(db, seasonCompId, stage1Key);
    } catch {}

    // 3) build skeleton based on known teams count
    const contendersCount = Math.max(0, paidTeams.length - TOP_COUNT);
    buildSkeleton(contendersCount);
    applyStageVisibility(stagesCount);

    // 4) fill from preview (top + contenders)
    const topRows = $("season-top") ? $("season-top").querySelectorAll("tr") : [];
    const contRows = $("season-contenders") ? $("season-contenders").querySelectorAll("tr") : [];

    for (let i = 0; i < Math.min(TOP_COUNT, paidTeams.length, topRows.length); i++) {
      renderRow(topRows[i], { place: i + 1, team: paidTeams[i].team });
    }
    if (paidTeams.length > TOP_COUNT) {
      const rest = paidTeams.slice(TOP_COUNT);
      for (let i = 0; i < Math.min(rest.length, contRows.length); i++) {
        renderRow(contRows[i], { place: TOP_COUNT + i + 1, team: rest[i].team });
      }
    }

    // 5) load realtime results and overwrite BOTH tables if full rating exists
    const realtime = await loadRealtime(db);

    if (realtime && realtime.__error) {
      // m'яко: залишаємо preview, показуємо попередження
      showError(`⚠️ <b>Немає доступу/помилка results</b><br><span class="hint">${safeText(realtime.__error)}</span>`);
    } else if (realtime) {
      // headers
      if ($("seasonTitle") && realtime.seasonTitle) $("seasonTitle").textContent = String(realtime.seasonTitle);
      if ($("seasonKicker") && realtime.seasonYear) $("seasonKicker").textContent = `СЕЗОН ${realtime.seasonYear}`;

      // if admin set seasonStages in realtime, prefer it (optional)
      if (realtime.seasonStages) applyStageVisibility(Number(realtime.seasonStages));
      else applyStageVisibility(stagesCount);

      const full = getFullRatingFromRealtime(realtime);
      if (full && full.length) {
        // re-build skeleton to exact length
        const fullContendersCount = Math.max(0, full.length - TOP_COUNT);
        buildSkeleton(fullContendersCount);
        applyStageVisibility(realtime.seasonStages || stagesCount);

        const topRows2 = $("season-top") ? $("season-top").querySelectorAll("tr") : [];
        const contRows2 = $("season-contenders") ? $("season-contenders").querySelectorAll("tr") : [];

        // fill top
        const top = full.slice(0, TOP_COUNT);
        for (let i = 0; i < Math.min(top.length, topRows2.length); i++) {
          // place can come from data, but якщо нема — ставимо i+1
          const item = Object.assign({ place: i + 1 }, top[i]);
          renderRow(topRows2[i], item);
        }

        // fill contenders 19+
        const cont = full.slice(TOP_COUNT);
        for (let i = 0; i < Math.min(cont.length, contRows2.length); i++) {
          const item = Object.assign({ place: TOP_COUNT + i + 1 }, cont[i]);
          renderRow(contRows2[i], item);
        }

        hideError();
      } else {
        // realtime є, але без рейтингів — лишаємось на preview
        if (!paidTeams.length) {
          showError("⚠️ Немає даних: ще немає оплачених команд Етапу 1 або їх не записано в public_participants.");
        } else {
          hideError();
        }
      }
    } else {
      // no realtime
      if (!paidTeams.length) {
        showError("⚠️ Немає даних: ще немає оплачених команд Етапу 1 або їх не записано в public_participants.");
      } else {
        hideError();
      }
    }

    // 6) save cache
    const payload = {
      seasonCompId,
      stagesCount,
      stage1Key,
      paidTeams,
      realtime,
      ts: Date.now()
    };
    Cache.set(seasonCompId, payload);
    setLastUpdate(payload.ts);
  }

  function renderData(data, { fromCache = false } = {}) {
    if (!data) return;

    const stagesCount = Number(data.stagesCount || 0);
    const paidTeams = Array.isArray(data.paidTeams) ? data.paidTeams : [];
    const realtime = data.realtime || null;

    const contendersCount = Math.max(0, paidTeams.length - TOP_COUNT);
    buildSkeleton(contendersCount);
    applyStageVisibility(stagesCount);

    const topRows = $("season-top") ? $("season-top").querySelectorAll("tr") : [];
    const contRows = $("season-contenders") ? $("season-contenders").querySelectorAll("tr") : [];

    for (let i = 0; i < Math.min(TOP_COUNT, paidTeams.length, topRows.length); i++) {
      renderRow(topRows[i], { place: i + 1, team: paidTeams[i].team });
    }
    if (paidTeams.length > TOP_COUNT) {
      const rest = paidTeams.slice(TOP_COUNT);
      for (let i = 0; i < Math.min(rest.length, contRows.length); i++) {
        renderRow(contRows[i], { place: TOP_COUNT + i + 1, team: rest[i].team });
      }
    }

    // Якщо кеш містить повний рейтинг — показуємо і його (не обов'язково, але корисно)
    const full = getFullRatingFromRealtime(realtime);
    if (full && full.length) {
      const fullContendersCount = Math.max(0, full.length - TOP_COUNT);
      buildSkeleton(fullContendersCount);
      applyStageVisibility(realtime?.seasonStages || stagesCount);

      const topRows2 = $("season-top") ? $("season-top").querySelectorAll("tr") : [];
      const contRows2 = $("season-contenders") ? $("season-contenders").querySelectorAll("tr") : [];

      const top = full.slice(0, TOP_COUNT);
      for (let i = 0; i < Math.min(top.length, topRows2.length); i++) {
        renderRow(topRows2[i], Object.assign({ place: i + 1 }, top[i]));
      }

      const cont = full.slice(TOP_COUNT);
      for (let i = 0; i < Math.min(cont.length, contRows2.length); i++) {
        renderRow(contRows2[i], Object.assign({ place: TOP_COUNT + i + 1 }, cont[i]));
      }
    }

    if (fromCache) {
      // не показуємо помилку, просто "тихо" відмалювали
    }
  }

  // manual refresh
  window.refreshRating = async function () {
    try {
      const db = await waitFirestore();
      const seasonCompId = await resolveSeasonCompId(db);
      Cache.clear(seasonCompId);
    } catch {}
    showError("⏳ Оновлення...");
    await loadRating();
  };

  document.addEventListener("DOMContentLoaded", () => {
    loadRating().catch((e) => {
      showError(`⚠️ <b>Помилка</b><br>Причина: <span class="hint">${safeText(e?.message || e)}</span>`);
    });
  });
})();

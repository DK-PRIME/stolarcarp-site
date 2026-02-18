// assets/js/rating_page.js
// STOLAR CARP • Season Rating page
// ✅ Завжди будує 18 рядків (скелет)
// ✅ Автоматично підтягує команди, що оплатили Етап 1, з public_participants
// ✅ Якщо зʼявляться результати (results/realtime.seasonRatingTop) — підставить їх
// ✅ Колонки етапів автоматично ховає/показує під реальну кількість етапів (навіть якщо у верстці E1..E5)
// ✅ Таблицю не зносить при помилці

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX_IN_HTML = 5; // у твоїй верстці зараз E1..E5

  const norm = (v) => String(v ?? "").trim();
  const safeText = (v, dash = "—") => (v === null || v === undefined || v === "" ? dash : String(v));

  const PAID_STATUSES = ["confirmed", "paid", "payment_confirmed"];
  const isPaidStatus = (s) => PAID_STATUSES.includes(norm(s).toLowerCase());

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

  function rowHTML(place, qualified) {
    const trClass = qualified ? "row-qualified" : "";
    return `
      <tr class="${trClass}">
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

  function buildSkeleton() {
    const topTbody = $("season-top");
    const contTbody = $("season-contenders");
    if (!topTbody || !contTbody) return;

    topTbody.innerHTML = "";
    for (let i = 1; i <= TOP_COUNT; i++) {
      topTbody.insertAdjacentHTML("beforeend", rowHTML(i, true));
    }

    contTbody.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      contTbody.insertAdjacentHTML("beforeend", rowHTML("—", false));
    }
  }

  function setMove(el, mv) {
    if (!el) return;
    el.classList.remove("move--up", "move--down", "move--same");

    if (mv === "up") {
      el.classList.add("move--up"); el.textContent = "▲"; return;
    }
    if (mv === "down") {
      el.classList.add("move--down"); el.textContent = "▼"; return;
    }
    if (mv === "same" || mv === 0 || mv === "0" || mv === "-" || mv === "—") {
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

  function renderRow(tr, item, stagesCount) {
    if (!tr || !item) return;
    const tds = tr.querySelectorAll("td");
    if (!tds || tds.length < (3 + STAGES_MAX_IN_HTML + 4)) return;

    setMove(tds[1].querySelector(".move"), item.move);
    tds[2].textContent = safeText(item.team, tds[2].textContent);

    const stages = Array.isArray(item.stages) ? item.stages : [];
    for (let i = 0; i < STAGES_MAX_IN_HTML; i++) {
      const cell = tds[3 + i];
      const place = cell.querySelector(".stage-place");
      const pts = cell.querySelector(".stage-points");
      const s = stages[i] || {};
      if (place) place.textContent = safeText(s.p, "–");
      if (pts) pts.textContent = safeText(s.pts, "–");
    }

    const b = tds[3 + STAGES_MAX_IN_HTML].querySelector("b");
    if (b) b.textContent = safeText(item.points, b.textContent);

    tds[4 + STAGES_MAX_IN_HTML].textContent = safeText(item.finalPlace, tds[4 + STAGES_MAX_IN_HTML].textContent);
    tds[5 + STAGES_MAX_IN_HTML].textContent = safeText(item.weight, tds[5 + STAGES_MAX_IN_HTML].textContent);
    tds[6 + STAGES_MAX_IN_HTML].textContent = safeText(item.bigFish, tds[6 + STAGES_MAX_IN_HTML].textContent);
  }

  // Ховаємо зайві колонки етапів (E4,E5...) або показуємо, якщо етапів більше
  function applyStageVisibility(stagesCount) {
    const count = Math.max(0, Math.min(STAGES_MAX_IN_HTML, Number(stagesCount || 0)));

    // Підправляємо заголовки E1..E5 (ті, що є)
    document.querySelectorAll(".table--season thead th.col-stage").forEach((th, idx) => {
      const stageNo = idx + 1;
      th.style.display = stageNo <= count ? "" : "none";
      // Не ламаємо стиль: просто міняємо текст
      if (stageNo <= count) th.innerHTML = `E${stageNo}<br>м / б`;
    });

    // Ховаємо td-колонки у всіх рядках обох таблиць
    document.querySelectorAll(".table--season tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td.col-stage");
      tds.forEach((td, idx) => {
        const stageNo = idx + 1;
        td.style.display = stageNo <= count ? "" : "none";
      });
    });
  }

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

  // Беремо compId сезону:
  // 1) ?season=season-2026 (якщо передаси)
  // 2) settings/app.activeCompetitionId (якщо є)
  // 3) fallback "season-2026"
  async function resolveSeasonCompId(db) {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("season");
    if (fromUrl) return fromUrl;

    try {
      const s = await db.collection("settings").doc("app").get();
      if (s.exists) {
        const d = s.data() || {};
        if (d.activeCompetitionId) return String(d.activeCompetitionId);
      }
    } catch {}
    return "season-2026";
  }

  // Визначаємо кількість етапів і чи є фінал з competitions/{seasonCompId}.events
  async function getSeasonConfig(db, seasonCompId) {
    let stagesCount = 3;
    let hasFinal = true;
    let stage1Key = "stage-1";

    try {
      const c = await db.collection("competitions").doc(seasonCompId).get();
      if (c.exists) {
        const data = c.data() || {};
        const events = Array.isArray(data.events) ? data.events : [];

        // подієві ключі типу "stage-1", "stage-2"... "final"
        const stageEvents = events.filter(e => String(e?.key || "").startsWith("stage-"));
        const finalEvent = events.find(e => String(e?.key || "") === "final");

        if (stageEvents.length) stagesCount = stageEvents.length;
        hasFinal = !!finalEvent;

        if (stageEvents[0]?.key) stage1Key = String(stageEvents[0].key);
        // Заголовок сторінки можна теж підхопити
        if ($("seasonTitle") && (data.name || data.title)) $("seasonTitle").textContent = String(data.name || data.title);
      }
    } catch {}

    // Для CSS/атрибутів (не обовʼязково, але корисно)
    document.body.setAttribute("data-stages", String(stagesCount || 0));
    document.body.setAttribute("data-has-final", hasFinal ? "1" : "0");

    return { stagesCount, hasFinal, stage1Key };
  }

  // ✅ Головне: тягнемо оплачені команди 1 етапу з public_participants
  async function loadPaidTeamsForStage1(db, seasonCompId, stage1Key) {
    // Firestore "in" max 10 значень — тут ок
    const snap = await db.collection("public_participants")
      .where("competitionId", "==", seasonCompId)
      .where("entryType", "==", "team")
      .where("status", "in", PAID_STATUSES)
      .get();

    const map = new Map(); // teamId -> row
    snap.forEach((doc) => {
      const r = doc.data() || {};
      const docStage = r.stageId || "main";

      // строго Етап 1 (stage-1). Якщо в когось записано без stageId — не беремо.
      if (String(docStage) !== String(stage1Key)) return;

      const teamId = r.teamId || doc.id;
      if (!teamId) return;

      // уникаємо дубля по teamId
      if (!map.has(teamId)) {
        map.set(teamId, {
          teamId,
          team: norm(r.teamName || "—"),
          status: norm(r.status),
          orderPaid: Number.isFinite(r.orderPaid) ? r.orderPaid : null,
          confirmedAt: r.confirmedAt || null,
          createdAt: r.createdAt || null
        });
      }
    });

    const rows = Array.from(map.values());

    // Сортування: orderPaid → confirmedAt → createdAt
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

  async function loadRealtimeIfAllowed(db) {
    try {
      const snap = await db.collection("results").doc("realtime").get();
      if (!snap.exists) return null;
      return snap.data() || {};
    } catch (e) {
      // permission-denied / missing permissions — просто ігноруємо, таблицю не валимо
      return { __error: String(e?.message || e) };
    }
  }

  async function loadRating() {
    hideError();
    buildSkeleton();

    const db = await waitFirestore();

    // 1) Визначаємо сезонний compId і конфіг етапів
    const seasonCompId = await resolveSeasonCompId(db);
    const { stagesCount, stage1Key } = await getSeasonConfig(db, seasonCompId);

    // 2) Підганяємо таблицю під реальну кількість етапів
    applyStageVisibility(stagesCount);

    const topTbody = $("season-top");
    const topRows = topTbody ? topTbody.querySelectorAll("tr") : [];

    // 3) Спочатку — гарантовано показуємо команди, які оплатили Етап 1 (навіть якщо results/realtime нема)
    let paidTeams = [];
    try {
      paidTeams = await loadPaidTeamsForStage1(db, seasonCompId, stage1Key);
      for (let i = 0; i < Math.min(TOP_COUNT, paidTeams.length, topRows.length); i++) {
        renderRow(topRows[i], { team: paidTeams[i].team }, stagesCount);
      }
    } catch (e) {
      // не валимо сторінку
    }

    // 4) Потім — якщо є results/realtime і там уже є seasonRatingTop → він перезапише скелет/preview
    const realtime = await loadRealtimeIfAllowed(db);

    if (realtime && realtime.__error) {
      // Показуємо мʼяко, але НЕ заважаємо таблиці з оплаченими
      showError(`⚠️ <b>Помилка завантаження</b><br>Причина: <span class="hint">${safeText(realtime.__error)}</span>`);
      return;
    }

    if (realtime) {
      // Заголовки (якщо є)
      if ($("seasonTitle") && realtime.seasonTitle) $("seasonTitle").textContent = String(realtime.seasonTitle);
      if ($("seasonKicker") && realtime.seasonYear) $("seasonKicker").textContent = `СЕЗОН ${realtime.seasonYear}`;

      // Якщо з realtime прийшло stages — підганяємо ще раз (раптом адмін оновив)
      if (realtime.seasonStages) {
        applyStageVisibility(Number(realtime.seasonStages));
      }

      const top = Array.isArray(realtime.seasonRatingTop) ? realtime.seasonRatingTop : [];
      if (top.length && topRows.length) {
        for (let i = 0; i < Math.min(topRows.length, top.length); i++) {
          renderRow(topRows[i], top[i], stagesCount);
        }
        hideError();
        return;
      }
    }

    // Якщо results/realtime немає — теж ок: лишається список оплачених + скелет
    if (!realtime) {
      if (!paidTeams.length) {
        showError("⚠️ Немає даних: ще немає оплачених команд Етапу 1 або їх не записано в public_participants.");
      } else {
        hideError();
      }
      return;
    }

    // Якщо realtime є, але порожній — не страшно
    if (!paidTeams.length) {
      showError("⚠️ Дані рейтингу поки порожні. Додай оплачених у public_participants для stage-1 — і вони автоматично зʼявляться.");
    } else {
      hideError();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadRating().catch((e) => {
      showError(`⚠️ <b>Помилка</b><br>Причина: <span class="hint">${safeText(e?.message || e)}</span>`);
    });
  });
})();

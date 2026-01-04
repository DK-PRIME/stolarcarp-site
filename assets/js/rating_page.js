// assets/js/rating_page.js
// STOLAR CARP • Rating page (dynamic stages columns)
// ✅ НІЧОГО не ламає у стилі: працює тільки з thead + будує тіло-заготовки
// ✅ Показує Е1..ЕN рівно стільки, скільки етапів у competitions/{seasonId}.events (без фіналу)
// ✅ Якщо сезону/етапів нема — Е-колонок нема (N=0)

(function () {
  const db = window.scDb;

  const mainTable = document.querySelector(".table--main");
  const contTable = document.querySelector(".table--contenders");
  const topTbody  = document.getElementById("season-top");
  const contTbody = document.getElementById("season-contenders");

  const kickerEl = document.querySelector(".season-rating-head .kicker");
  const titleEl  = document.querySelector(".season-rating-head .page-title");

  if (!db || !window.firebase) {
    console.warn("rating_page: Firebase init не завантажився (scDb/firebase)");
    return;
  }
  if (!mainTable || !contTable || !topTbody || !contTbody) {
    console.warn("rating_page: missing table DOM");
    return;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 1) пробуємо взяти активний seasonId з глобалів (якщо ти їх маєш у config.js)
  function pickSeasonIdFromGlobals() {
    return (
      window.SC_ACTIVE_SEASON_ID ||
      window.scActiveSeasonId ||
      window.scSeasonId ||
      window.SC_SEASON_ID ||
      null
    );
  }

  // 2) якщо глобалів нема — пробуємо settings/active.seasonId
  async function getSeasonId() {
    const fromGlobals = pickSeasonIdFromGlobals();
    if (fromGlobals) return String(fromGlobals);

    try {
      const s = await db.collection("settings").doc("active").get();
      if (s.exists) {
        const d = s.data() || {};
        if (d.seasonId) return String(d.seasonId);
        if (d.competitionId) return String(d.competitionId);
        if (d.activeSeasonId) return String(d.activeSeasonId);
      }
    } catch {}

    // 3) якщо взагалі нема — беремо будь-який “найсвіжіший” competitions (як fallback)
    // щоб сторінка не була порожня
    try {
      const snap = await db.collection("competitions")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      if (!snap.empty) return snap.docs[0].id;
    } catch {}

    return null;
  }

  function normalizeStagesFromEvents(events) {
    const arr = Array.isArray(events) ? events : [];
    const stages = [];

    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i] || {};
      const key = ev.key || ev.stageId || ev.id || `stage-${i + 1}`;
      const isFinal = String(key).toLowerCase().includes("final") || !!ev.isFinal;
      if (isFinal) continue;

      n += 1;
      stages.push({ index: n, key: String(key) });
    }
    return stages; // тільки етапи, без фіналу
  }

  function buildTheadRow(stagesCount) {
    const left = `
      <th class="col-place">Місце</th>
      <th class="col-move">▲▼</th>
      <th class="col-team">Команда</th>
    `;

    const stageCols = Array.from({ length: stagesCount })
      .map((_, i) => `<th class="col-stage">Е${i + 1}<br>м / б</th>`)
      .join("");

    const right = `
      <th class="col-points">Бали</th>
      <th class="col-final">Фінал</th>
      <th class="col-weight">Вага</th>
      <th class="col-big">Big Fish</th>
    `;

    return `<tr>${left}${stageCols}${right}</tr>`;
  }

  function buildStageCell() {
    return `
      <td class="col-stage">
        <div class="stage-cell">
          <span class="stage-place">–</span>
          <span class="stage-slash">/</span>
          <span class="stage-points">–</span>
        </div>
      </td>
    `;
  }

  function buildRow(place, stagesCount, qualified) {
    const cls = qualified ? "row-qualified" : "";
    const stageCells = Array.from({ length: stagesCount }).map(buildStageCell).join("");

    return `
      <tr class="${cls}">
        <td class="col-place"><span class="place-num">${place}</span></td>
        <td class="col-move"><span class="move move--same">–</span></td>
        <td class="col-team">-</td>
        ${stageCells}
        <td class="col-points"><b>-</b></td>
        <td class="col-final">–</td>
        <td class="col-weight">-</td>
        <td class="col-big">-</td>
      </tr>
    `;
  }

  function renderSkeleton(stagesCount) {
    // Шапки
    const mainThead = mainTable.querySelector("thead");
    const contThead = contTable.querySelector("thead");
    if (mainThead) mainThead.innerHTML = buildTheadRow(stagesCount);
    if (contThead) contThead.innerHTML = buildTheadRow(stagesCount);

    // TOP-18 заготовки
    let html = "";
    for (let i = 1; i <= 18; i++) html += buildRow(i, stagesCount, true);
    topTbody.innerHTML = html;

    // Претенденти — пусто (поки даних нема)
    contTbody.innerHTML = "";
  }

  function renderInfoRow(text, stagesCount) {
    // кол-во колонок = 3 (ліві) + stagesCount + 4 (праві)
    const colSpan = 3 + Number(stagesCount || 0) + 4;
    topTbody.innerHTML = `
      <tr>
        <td colspan="${colSpan}" style="padding:14px 10px; text-align:center; color:#cbd5e1;">
          ${esc(text)}
        </td>
      </tr>
    `;
    contTbody.innerHTML = "";
  }

  async function boot() {
    const seasonId = await getSeasonId();

    if (!seasonId) {
      renderSkeleton(0);
      renderInfoRow("Нема активного сезону або не створено competitions.", 0);
      return;
    }

    let c = null;
    try {
      const snap = await db.collection("competitions").doc(seasonId).get();
      if (!snap.exists) {
        renderSkeleton(0);
        renderInfoRow("Сезон не знайдено в competitions.", 0);
        return;
      }
      c = snap.data() || {};
    } catch (e) {
      console.error("rating_page load season error:", e);
      renderSkeleton(0);
      renderInfoRow("Помилка завантаження сезону (rules/доступ).", 0);
      return;
    }

    const year = c.year || c.seasonYear || "";
    const stages = normalizeStagesFromEvents(c.events);
    const stagesCount = stages.length;

    // Перемальовуємо таблиці рівно під кількість етапів
    renderSkeleton(stagesCount);

    // Хедер (акуратно, без зміни стилю)
    if (kickerEl) kickerEl.textContent = year ? `СЕЗОН ${year}` : "СЕЗОН";
    if (titleEl) titleEl.textContent = "Рейтинг сезону STOLAR CARP";

    // Якщо етапів нема — покажемо пояснення, і не буде колонок Е
    if (stagesCount === 0) {
      renderInfoRow("Сезон створений, але етапи ще не додані (або всі позначені як фінал).", 0);
    }
  }

  boot();
})();

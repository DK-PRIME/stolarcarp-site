// assets/js/rating_page.js
// STOLAR CARP • Season Rating page
// ✅ Таблиця будується ДИНАМІЧНО під фактичну кількість етапів сезону
// ✅ Підтримка "3 етапи + фінал" (і будь-яка інша кількість)
// ✅ Скелет ТОП-18 завжди на місці, при помилці не зникає
// ✅ previewTeams (оплата етапу 1) показуються навіть без результатів

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const SKELETON_CONTENDERS = 3;

  function safeText(v, dash = "—") {
    if (v === null || v === undefined || v === "") return dash;
    return String(v);
  }

  function showError(html) {
    const box = $("ratingError");
    if (!box) return;
    box.style.display = "block";
    box.innerHTML = html;
  }

  function hideError() {
    const box = $("ratingError");
    if (!box) return;
    box.style.display = "none";
    box.innerHTML = "";
  }

  function getDb() {
    return (
      window.scDb ||
      window.db ||
      (window.firebase && window.firebase.firestore && window.firebase.firestore()) ||
      (window.firebase && firebase.firestore && firebase.firestore())
    );
  }

  function normalizeKey(v) {
    return String(v || "").trim().toLowerCase();
  }

  function detectFinalFromEvents(events) {
    if (!Array.isArray(events)) return false;
    return events.some(e => {
      const k = normalizeKey(e && (e.key || e.stageId || e.id));
      const t = normalizeKey(e && (e.title || e.name || e.label));
      return k.includes("final") || k === "stage-final" || t.includes("фінал") || t.includes("final");
    });
  }

  function getStagesCountFromEvents(events) {
    if (!Array.isArray(events)) return 0;

    // У тебе в season-2026 events схоже містять тільки stage-1..stage-3, а фінал може бути окремо/або як event.
    // Беремо кількість stage-* (не final), а якщо просто масив із етапів — працює теж.
    const stageLike = events.filter(e => {
      const k = normalizeKey(e && (e.key || e.stageId || e.id));
      const t = normalizeKey(e && (e.title || e.name || e.label));
      const looksFinal = k.includes("final") || t.includes("фінал") || t.includes("final");
      return !looksFinal;
    });

    // якщо в масиві все одно лише етапи — stageLike = events
    const count = stageLike.length || events.length || 0;
    return Math.max(0, count);
  }

  function buildTheadHTML(stagesCount, hasFinal) {
    const stageHeaders = [];
    for (let i = 1; i <= stagesCount; i++) {
      stageHeaders.push(`<th class="col-stage">Е${i}<br>м / б</th>`);
    }

    return `
      <tr>
        <th class="col-place">Місце</th>
        <th class="col-move">▲▼</th>
        <th class="col-team">Команда</th>
        ${stageHeaders.join("")}
        <th class="col-points">Бали</th>
        ${hasFinal ? `<th class="col-final">Фінал</th>` : ``}
        <th class="col-weight">Вага</th>
        <th class="col-big">Big Fish</th>
      </tr>
    `;
  }

  function buildRowHTML(place, qualified, stagesCount, hasFinal) {
    const trClass = qualified ? "row-qualified" : "";
    const stageCells = new Array(stagesCount).fill(0).map(() => `
      <td class="col-stage">
        <div class="stage-cell">
          <span class="stage-place">–</span>
          <span class="stage-slash">/</span>
          <span class="stage-points">–</span>
        </div>
      </td>
    `).join("");

    return `
      <tr class="${trClass}">
        <td class="col-place"><span class="place-num">${safeText(place, "—")}</span></td>
        <td class="col-move"><span class="move move--same">–</span></td>
        <td class="col-team">-</td>
        ${stageCells}
        <td class="col-points"><b>-</b></td>
        ${hasFinal ? `<td class="col-final">–</td>` : ``}
        <td class="col-weight">-</td>
        <td class="col-big">-</td>
      </tr>
    `;
  }

  function setMove(el, mv) {
    if (!el) return;
    el.classList.remove("move--up", "move--down", "move--same");

    if (mv === "up") { el.classList.add("move--up"); el.textContent = "▲"; return; }
    if (mv === "down") { el.classList.add("move--down"); el.textContent = "▼"; return; }

    if (mv === "same" || mv === 0 || mv === "0" || mv === "-" || mv === "—" || mv === null || mv === undefined) {
      el.classList.add("move--same");
      el.textContent = "–";
      return;
    }

    if (typeof mv === "number") {
      el.classList.add(mv > 0 ? "move--up" : mv < 0 ? "move--down" : "move--same");
      el.textContent = mv > 0 ? `▲${mv}` : mv < 0 ? `▼${Math.abs(mv)}` : "–";
      return;
    }

    el.classList.add("move--same");
    el.textContent = safeText(mv, "–");
  }

  function renderRow(tr, item, stagesCount, hasFinal) {
    if (!tr || !item) return;
    const tds = tr.querySelectorAll("td");
    if (!tds || !tds.length) return;

    // індекси:
    // 0 place
    // 1 move
    // 2 team
    // 3..(3+stagesCount-1) stages
    // after stages: points
    // then (optional) final
    // then weight, bigFish

    const idxMove = 1;
    const idxTeam = 2;
    const idxStageStart = 3;
    const idxPoints = idxStageStart + stagesCount;
    const idxFinal = hasFinal ? idxPoints + 1 : -1;
    const idxWeight = hasFinal ? idxPoints + 2 : idxPoints + 1;
    const idxBig = hasFinal ? idxPoints + 3 : idxPoints + 2;

    // move
    setMove(tds[idxMove]?.querySelector(".move"), item.move);

    // team
    if (tds[idxTeam]) tds[idxTeam].textContent = safeText(item.team || item.teamName, tds[idxTeam].textContent);

    // stages
    const stages = Array.isArray(item.stages) ? item.stages : [];
    for (let i = 0; i < stagesCount; i++) {
      const cell = tds[idxStageStart + i];
      if (!cell) continue;
      const place = cell.querySelector(".stage-place");
      const pts = cell.querySelector(".stage-points");
      const s = stages[i] || {};
      if (place) place.textContent = safeText(s.p, "–");
      if (pts) pts.textContent = safeText(s.pts, "–");
    }

    // points
    const b = tds[idxPoints]?.querySelector("b");
    if (b) b.textContent = safeText(item.points, b.textContent);

    // final
    if (hasFinal && idxFinal >= 0 && tds[idxFinal]) {
      tds[idxFinal].textContent = safeText(item.finalPlace, tds[idxFinal].textContent);
    }

    // weight / big
    if (tds[idxWeight]) tds[idxWeight].textContent = safeText(item.weight, tds[idxWeight].textContent);
    if (tds[idxBig]) tds[idxBig].textContent = safeText(item.bigFish, tds[idxBig].textContent);
  }

  function applyPreviewTeams(topRows, previewTeams, stagesCount, hasFinal) {
    if (!Array.isArray(previewTeams) || !previewTeams.length) return;
    for (let i = 0; i < Math.min(TOP_COUNT, previewTeams.length, topRows.length); i++) {
      const t = previewTeams[i] || {};
      renderRow(topRows[i], { team: t.team || t.teamName || "-" }, stagesCount, hasFinal);
    }
  }

  function rebuildTables(stagesCount, hasFinal) {
    const topTable = document.querySelector(".table--main");
    const contTable = document.querySelector(".table--contenders");
    const topTbody = $("season-top");
    const contTbody = $("season-contenders");
    if (!topTable || !contTable || !topTbody || !contTbody) return;

    // 1) THEAD
    const topThead = topTable.querySelector("thead");
    const contThead = contTable.querySelector("thead");
    if (topThead) topThead.innerHTML = buildTheadHTML(stagesCount, hasFinal);
    if (contThead) contThead.innerHTML = buildTheadHTML(stagesCount, hasFinal);

    // 2) TBODY skeleton
    topTbody.innerHTML = "";
    for (let i = 1; i <= TOP_COUNT; i++) {
      topTbody.insertAdjacentHTML("beforeend", buildRowHTML(i, true, stagesCount, hasFinal));
    }

    contTbody.innerHTML = "";
    for (let i = 0; i < SKELETON_CONTENDERS; i++) {
      contTbody.insertAdjacentHTML("beforeend", buildRowHTML("—", false, stagesCount, hasFinal));
    }
  }

  async function detectSeasonConfig(db, realtimeData) {
    // 1) якщо в results/realtime вже є seasonStages / hasFinal — беремо звідти
    const s1 = Number(realtimeData?.seasonStages);
    const hasFinal1 = (realtimeData?.hasFinal === true);

    if (Number.isFinite(s1) && s1 > 0) {
      return { stagesCount: s1, hasFinal: hasFinal1 };
    }

    // 2) інакше читаємо competitions/season-2026 (як у тебе на скріні)
    // можна буде потім зробити через settings/app.activeCompetitionId, але зараз тримаємо простий і надійний дефолт.
    const seasonCompId =
      realtimeData?.seasonCompId ||
      realtimeData?.compId ||
      "season-2026";

    try {
      const cSnap = await db.collection("competitions").doc(seasonCompId).get();
      if (cSnap.exists) {
        const c = cSnap.data() || {};
        const events = Array.isArray(c.events) ? c.events : [];
        const stagesCount = getStagesCountFromEvents(events) || 3;
        const hasFinal = (c.hasFinal === true) || detectFinalFromEvents(events);
        return { stagesCount, hasFinal };
      }
    } catch (e) {
      // ідемо в fallback
    }

    // 3) fallback
    return { stagesCount: 3, hasFinal: true };
  }

  async function loadRating() {
    hideError();

    const db = getDb();
    if (!db) {
      showError("⚠️ Не знайдено Firebase DB (перевір firebase-init.js).");
      // навіть без db покажемо мінімальний скелет 3+фінал
      rebuildTables(3, true);
      return;
    }

    // спочатку зробимо “безпечний” скелет (3 етапи + фінал)
    rebuildTables(3, true);

    try {
      const snap = await db.doc("results/realtime").get();

      // Якщо results/realtime ще нема — лишається скелет, але без помилки “все зникло”
      if (!snap.exists) {
        showError("⚠️ Дані рейтингу ще не опубліковані (results/realtime не існує).");
        return;
      }

      const data = snap.data() || {};

      // Заголовки
      if ($("seasonTitle") && data.seasonTitle) $("seasonTitle").textContent = data.seasonTitle;
      if ($("seasonKicker") && data.seasonYear) $("seasonKicker").textContent = `СЕЗОН ${data.seasonYear}`;

      // ✅ Визначаємо реальну кількість етапів та фінал
      const cfg = await detectSeasonConfig(db, data);
      const stagesCount = Math.max(1, Number(cfg.stagesCount) || 3);
      const hasFinal = cfg.hasFinal === true;

      // ✅ Перебудова таблиць під реальну конфігурацію
      rebuildTables(stagesCount, hasFinal);

      const topTbody = $("season-top");
      const topRows = topTbody ? topTbody.querySelectorAll("tr") : [];

      // 1) Якщо вже є результати сезону — підставляємо їх
      const top = Array.isArray(data.seasonRatingTop) ? data.seasonRatingTop : [];
      if (top.length && topRows.length) {
        for (let i = 0; i < Math.min(topRows.length, top.length); i++) {
          renderRow(topRows[i], top[i], stagesCount, hasFinal);
        }
        hideError();
        return;
      }

      // 2) Якщо результатів ще нема — але є previewTeams (оплатили етап 1) → показуємо їх як майбутній ТОП-18
      const previewTeams = Array.isArray(data.previewTeams) ? data.previewTeams : [];
      if (previewTeams.length && topRows.length) {
        applyPreviewTeams(topRows, previewTeams, stagesCount, hasFinal);
        hideError();
        return;
      }

      // 3) Нічого нема — лишається скелет
      showError("⚠️ Дані рейтингу поки порожні. Додай previewTeams у results/realtime.");
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      showError(`⚠️ <b>Помилка завантаження</b><br>Причина: <span class="hint">${msg}</span>`);
    }
  }

  document.addEventListener("DOMContentLoaded", loadRating);
})();

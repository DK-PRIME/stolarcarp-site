// assets/js/rating_page.js
// STOLAR CARP • Season Rating page
// ✅ Завжди будує 18 рядків (скелет)
// ✅ Підтягує команди з previewTeams (оплатили 1 етап) навіть без результатів
// ✅ Результати (Е1..Е5) підтягнуться пізніше з seasonRatingTop
// ✅ Таблицю не зносить при помилці

(function () {
  const $ = (id) => document.getElementById(id);

  const TOP_COUNT = 18;
  const STAGES_MAX = 5;

  function showError(msg) {
    const box = $("ratingError");
    if (!box) return;
    box.style.display = "block";
    box.innerHTML = msg;
  }
  function hideError() {
    const box = $("ratingError");
    if (!box) return;
    box.style.display = "none";
    box.innerHTML = "";
  }
  function safeText(v, dash = "—") {
    if (v === null || v === undefined || v === "") return dash;
    return String(v);
  }

  function rowHTML(place, qualified) {
    const trClass = qualified ? "row-qualified" : "";
    return `
      <tr class="${trClass}">
        <td class="col-place"><span class="place-num">${place}</span></td>
        <td class="col-move"><span class="move move--same">–</span></td>
        <td class="col-team">-</td>
        ${new Array(STAGES_MAX).fill(0).map(() => `
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

    // ТОП-18 завжди показуємо
    topTbody.innerHTML = "";
    for (let i = 1; i <= TOP_COUNT; i++) {
      topTbody.insertAdjacentHTML("beforeend", rowHTML(i, true));
    }

    // Претенденти — поки мінімум 3 рядки-заглушки (щоб не було “порожньо”)
    contTbody.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      contTbody.insertAdjacentHTML("beforeend", rowHTML("—", false));
    }
  }

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
    if (mv === "same" || mv === 0 || mv === "0" || mv === "-" || mv === "—") {
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

  function renderRow(tr, item) {
    if (!tr || !item) return;
    const tds = tr.querySelectorAll("td");
    if (!tds || tds.length < 12) return;

    // move
    setMove(tds[1].querySelector(".move"), item.move);

    // team
    tds[2].textContent = safeText(item.team, tds[2].textContent);

    // stages
    const stages = Array.isArray(item.stages) ? item.stages : [];
    for (let i = 0; i < STAGES_MAX; i++) {
      const cell = tds[3 + i];
      const place = cell.querySelector(".stage-place");
      const pts = cell.querySelector(".stage-points");
      const s = stages[i] || {};
      if (place) place.textContent = safeText(s.p, "–");
      if (pts) pts.textContent = safeText(s.pts, "–");
    }

    // points / final / weight / bigFish
    const b = tds[8].querySelector("b");
    if (b) b.textContent = safeText(item.points, b.textContent);

    tds[9].textContent = safeText(item.finalPlace, tds[9].textContent);
    tds[10].textContent = safeText(item.weight, tds[10].textContent);
    tds[11].textContent = safeText(item.bigFish, tds[11].textContent);
  }

  function applyPreviewTeams(topRows, previewTeams) {
    // previewTeams: [{ team:"Назва", teamId?, paidStage:1? }, ...]
    if (!Array.isArray(previewTeams) || !previewTeams.length) return;
    for (let i = 0; i < Math.min(TOP_COUNT, previewTeams.length, topRows.length); i++) {
      const item = previewTeams[i] || {};
      renderRow(topRows[i], { team: item.team || item.teamName || "-" });
    }
  }

  async function loadRating() {
    hideError();
    buildSkeleton(); // ✅ спочатку завжди показуємо 18 рядків

    const db =
      window.scDb ||
      window.db ||
      (window.firebase && firebase.firestore && firebase.firestore());

    if (!db) {
      showError("⚠️ Не знайдено Firebase DB (перевір firebase-init.js).");
      return;
    }

    try {
      const snap = await db.doc("results/realtime").get();

      if (!snap.exists) {
        showError("⚠️ Дані рейтингу ще не опубліковані (results/realtime не існує).");
        return;
      }

      const data = snap.data() || {};

      // Заголовки
      if ($("seasonTitle") && data.seasonTitle) $("seasonTitle").textContent = data.seasonTitle;
      if ($("seasonKicker") && data.seasonYear) $("seasonKicker").textContent = `СЕЗОН ${data.seasonYear}`;

      // Етапи для hide/show колонок
      const stagesCount = Number(data.seasonStages ?? STAGES_MAX);
      document.body.setAttribute("data-stages", String(stagesCount || 0));

      const topTbody = $("season-top");
      const topRows = topTbody ? topTbody.querySelectorAll("tr") : [];

      // 1) Якщо вже є результати сезону (після проведення етапів) — підставляємо їх
      const top = Array.isArray(data.seasonRatingTop) ? data.seasonRatingTop : [];
      if (top.length && topRows.length) {
        for (let i = 0; i < Math.min(topRows.length, top.length); i++) {
          renderRow(topRows[i], top[i]);
        }
        hideError();
        return;
      }

      // 2) Якщо результатів ще нема — але є список “оплатили 1 етап” → показуємо їх як майбутній ТОП-18
      const previewTeams = Array.isArray(data.previewTeams) ? data.previewTeams : [];
      if (previewTeams.length && topRows.length) {
        applyPreviewTeams(topRows, previewTeams);
        hideError();
        return;
      }

      // Якщо нічого нема — лишається скелет
      showError("⚠️ Дані рейтингу поки порожні. Додай previewTeams у results/realtime (команди з оплатою етапу 1).");
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      showError(`⚠️ <b>Помилка завантаження</b><br>Причина: <span class="hint">${msg}</span>`);
    }
  }

  document.addEventListener("DOMContentLoaded", loadRating);
})();

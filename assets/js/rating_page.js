// assets/js/rating_page.js
// STOLAR CARP • Season Rating page
// ✅ Не ламаємо таблицю при помилці (placeholder лишається)
// ✅ Показуємо помилку в #ratingError
// ✅ Читаємо публічний документ results/realtime (рекомендується для public read)

(function () {
  const $ = (id) => document.getElementById(id);

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

  // Очікуваний формат даних у results/realtime:
  // {
  //   seasonTitle: "Рейтинг сезону STOLAR CARP",
  //   seasonYear: 2026,
  //   seasonStages: 5,
  //   seasonRatingTop: [ { place, move, team, stages:[{p,pts}...], points, finalPlace, weight, bigFish } ... ],
  //   seasonRatingContenders: [ ... ]
  // }
  //
  // Якщо поля названі інакше — скажи, я піджену 1-в-1 під твою структуру.

  function renderRow(tr, item) {
    if (!tr || !item) return;

    const tds = tr.querySelectorAll("td");
    if (!tds || tds.length < 12) return;

    // 0 place (span.place-num вже є)
    const placeSpan = tds[0].querySelector(".place-num");
    if (placeSpan) placeSpan.textContent = safeText(item.place, placeSpan.textContent);

    // 1 move
    const moveEl = tds[1].querySelector(".move");
    if (moveEl) {
      const mv = item.move; // "up" | "down" | "same" | number | "—"
      moveEl.classList.remove("move--up", "move--down", "move--same");
      if (mv === "up") {
        moveEl.classList.add("move--up");
        moveEl.textContent = "▲";
      } else if (mv === "down") {
        moveEl.classList.add("move--down");
        moveEl.textContent = "▼";
      } else if (mv === "same" || mv === 0 || mv === "0") {
        moveEl.classList.add("move--same");
        moveEl.textContent = "–";
      } else if (typeof mv === "number") {
        moveEl.classList.add(mv > 0 ? "move--up" : mv < 0 ? "move--down" : "move--same");
        moveEl.textContent = mv > 0 ? `▲${mv}` : mv < 0 ? `▼${Math.abs(mv)}` : "–";
      } else {
        moveEl.classList.add("move--same");
        moveEl.textContent = safeText(mv, "–");
      }
    }

    // 2 team
    tds[2].textContent = safeText(item.team, tds[2].textContent);

    // 3..7 stages
    const stages = Array.isArray(item.stages) ? item.stages : [];
    for (let i = 0; i < 5; i++) {
      const cell = tds[3 + i];
      const place = cell.querySelector(".stage-place");
      const pts = cell.querySelector(".stage-points");
      const s = stages[i] || {};
      if (place) place.textContent = safeText(s.p, "–");
      if (pts) pts.textContent = safeText(s.pts, "–");
    }

    // 8 points
    const b = tds[8].querySelector("b");
    if (b) b.textContent = safeText(item.points, b.textContent);

    // 9 final
    tds[9].textContent = safeText(item.finalPlace, tds[9].textContent);

    // 10 weight
    tds[10].textContent = safeText(item.weight, tds[10].textContent);

    // 11 bigFish
    tds[11].textContent = safeText(item.bigFish, tds[11].textContent);
  }

  function applyQualifiedRows() {
    // якщо у тебе раптом JS додає/знімає row-qualified — ми нічого не ламаємо
  }

  async function loadRating() {
    hideError();

    const db =
      window.scDb ||
      window.db ||
      (window.firebase && firebase.firestore && firebase.firestore());

    if (!db) {
      showError("⚠️ Не знайдено Firebase DB (перевір firebase-init.js).");
      return;
    }

    try {
      // ✅ один публічний документ
      const snap = await db.doc("results/realtime").get();

      if (!snap.exists) {
        showError("⚠️ Дані рейтингу ще не опубліковані (results/realtime не існує).");
        return;
      }

      const data = snap.data() || {};

      // Заголовки
      if ($("seasonTitle") && data.seasonTitle) $("seasonTitle").textContent = data.seasonTitle;
      if ($("seasonKicker") && data.seasonYear) $("seasonKicker").textContent = `СЕЗОН ${data.seasonYear}`;

      // Скільки етапів (для твого CSS hide колонок)
      const stagesCount = Number(data.seasonStages || 0);
      document.body.setAttribute("data-stages", String(stagesCount));

      // ТОП
      const top = Array.isArray(data.seasonRatingTop) ? data.seasonRatingTop : [];
      const topTbody = $("season-top");
      if (topTbody && top.length) {
        const rows = topTbody.querySelectorAll("tr");
        for (let i = 0; i < rows.length; i++) renderRow(rows[i], top[i]);
      }

      // Претенденти
      const cont = Array.isArray(data.seasonRatingContenders) ? data.seasonRatingContenders : [];
      const contTbody = $("season-contenders");
      if (contTbody && cont.length) {
        // якщо є реальні претенденти — перемальовуємо tbody під них
        contTbody.innerHTML = "";
        cont.forEach((item) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td class="col-place"><span class="place-num">${safeText(item.place, "—")}</span></td>
            <td class="col-move"><span class="move move--same">–</span></td>
            <td class="col-team">${safeText(item.team, "—")}</td>
            ${new Array(5).fill(0).map((_,i)=>{
              const s = (item.stages && item.stages[i]) || {};
              return `<td class="col-stage"><div class="stage-cell"><span class="stage-place">${safeText(s.p,"–")}</span><span class="stage-slash">/</span><span class="stage-points">${safeText(s.pts,"–")}</span></div></td>`;
            }).join("")}
            <td class="col-points"><b>${safeText(item.points,"—")}</b></td>
            <td class="col-final">${safeText(item.finalPlace,"—")}</td>
            <td class="col-weight">${safeText(item.weight,"—")}</td>
            <td class="col-big">${safeText(item.bigFish,"—")}</td>
          `;
          contTbody.appendChild(tr);
        });
      }

      applyQualifiedRows();
      hideError();
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      // ✅ Не чіпаємо таблицю, тільки показуємо помилку
      showError(
        `⚠️ <b>Помилка завантаження</b><br>Не вдалося завантажити рейтинг.<br>Причина: <span class="hint">${msg}</span>`
      );
    }
  }

  document.addEventListener("DOMContentLoaded", loadRating);
})();

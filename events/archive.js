// STOLAR CARP — Архів сезонів
// Завантаження завершених змагань за роками

(async function () {
  const db = window.scDb;
  const listEl = document.querySelector(".seasons-grid");
  if (!db || !listEl) return;

  // ---- Налаштування ----
  const TARGET_YEAR = 2026;       // який сезон показуємо
  const NOW = new Date().getTime();

  function toDate(x) {
    try {
      if (!x) return null;
      if (x.toDate) return x.toDate();
      if (x instanceof Date) return x;
      const d = new Date(x);
      return isFinite(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }

  function createCard(compId, data) {
    const title = data.name || data.title || "Турнір";
    const desc = data.description || "Змагання STOLAR CARP";
    const startAt = toDate(data.startAt);
    const finishAt = toDate(data.finishAt);
    const dateStr = startAt
      ? startAt.toLocaleDateString("uk-UA")
      : "Дата невідома";

    const card = document.createElement("a");
    card.className = "season-card";
    card.href = `view.html?comp=${compId}`; // сторінка перегляду турніру

    card.innerHTML = `
      <div>
        <div class="season-year">${title}</div>
        <div class="season-desc">
          ${desc}<br>
          <span style="opacity:.7">${dateStr}</span>
        </div>
      </div>
      <div class="season-btn">Переглянути</div>
    `;

    return card;
  }

  async function loadSeason() {
    // завантажуємо всі змагання
    const snap = await db.collection("competitions")
      .where("year", "==", TARGET_YEAR)
      .get();

    listEl.innerHTML = ""; // очищаємо старий контент

    if (snap.empty) {
      listEl.innerHTML = `<div class="form__hint">Нема даних сезону ${TARGET_YEAR}</div>`;
      return;
    }

    snap.forEach(doc => {
      const data = doc.data() || {};
      const finishAt = toDate(data.finishAt);

      // показуємо тільки завершені
      if (finishAt && finishAt.getTime() < NOW) {
        listEl.appendChild(createCard(doc.id, data));
      }
    });
  }

  try {
    await loadSeason();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="form__hint" style="color:#ff6c6c">Помилка завантаження архіву</div>`;
  }
})();

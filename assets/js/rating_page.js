// assets/js/rating_page.js
// STOLAR CARP • Rating page (dynamic E1..En from competitions/{seasonId}.events + collapsible description)
// ✅ Е1..Еn з’являються одразу після створення етапів (live onSnapshot)
// ✅ Фінал НЕ входить в Е-колонки (залишається окремою колонкою "Фінал" як зараз у таблиці)
// ✅ Не ламає стиль: додає тільки th/td для stage-колонок у правильне місце
// ✅ Якщо етапів 0 — Е-колонок нема
// ✅ Тягне рік сезону з competitions/{seasonId}.year (fallback: поточний рік)
// ✅ Ховає опис і робить кнопку "Детальніше…"

(function () {
  "use strict";

  const db = window.scDb;

  const kickerEl = document.querySelector(".season-rating-head .kicker");
  const titleEl  = document.querySelector(".season-rating-head .page-title");
  const descEl   = document.querySelector(".season-rating-head .rating-desc");

  const mainTable = document.querySelector(".table--main");
  const contTable = document.querySelector(".table--contenders");

  if (!kickerEl || !titleEl) {
    console.warn("rating_page: header DOM missing");
    return;
  }

  // ---------------- helpers ----------------
  function pickSeasonIdFromGlobals() {
    return (
      window.SC_ACTIVE_SEASON_ID ||
      window.scActiveSeasonId ||
      window.scSeasonId ||
      window.SC_SEASON_ID ||
      null
    );
  }

  async function getSeasonId() {
    const fromGlobals = pickSeasonIdFromGlobals();
    if (fromGlobals) return String(fromGlobals);

    // settings/active
    try {
      const s = await db.collection("settings").doc("active").get();
      if (s.exists) {
        const d = s.data() || {};
        if (d.seasonId) return String(d.seasonId);
        if (d.competitionId) return String(d.competitionId);
        if (d.activeSeasonId) return String(d.activeSeasonId);
      }
    } catch (e) {
      console.warn("rating_page: settings/active read failed", e);
    }

    // fallback: будь-який competitions (без orderBy)
    try {
      const snap = await db.collection("competitions").limit(1).get();
      if (!snap.empty) return snap.docs[0].id;
    } catch (e) {
      console.warn("rating_page: competitions fallback failed", e);
    }

    return null;
  }

  // фінал визначаємо максимально надійно
  function isFinalEvent(ev) {
    const key = String(ev?.key || ev?.stageId || ev?.id || "").toLowerCase().trim();
    if (!key) return false;

    // канон: key === "final"
    if (key === "final") return true;

    // резерв: містить "final"
    if (key.includes("final")) return true;

    // резерв: прапор
    if (ev?.isFinal === true) return true;

    // резерв: тип
    const type = String(ev?.type || "").toLowerCase().trim();
    if (type === "final") return true;

    return false;
  }

  // повертає список етапів БЕЗ фіналу в тому ж порядку
  function stagesFromEvents(events) {
    const arr = Array.isArray(events) ? events : [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i] || {};
      if (isFinalEvent(ev)) continue;

      const key = ev.key || ev.stageId || ev.id || `stage-${i + 1}`;
      out.push({ index: out.length + 1, key: String(key) });
    }
    return out; // [{index:1,key:"stage-1"}, ...]
  }

  function buildStageTh(i) {
    const th = document.createElement("th");
    th.className = "col-stage";
    th.setAttribute("data-stage-col", String(i));
    th.innerHTML = `Е${i}<br>м / б`;
    return th;
  }

  function buildStageTd() {
    const td = document.createElement("td");
    td.className = "col-stage";
    td.setAttribute("data-stage-td", "1");
    td.innerHTML = `
      <div class="stage-cell">
        <span class="stage-place">–</span>
        <span class="stage-slash">/</span>
        <span class="stage-points">–</span>
      </div>
    `;
    return td;
  }

  // видаляємо всі stage-колонки в thead/tr (і td в tbody)
  function removeStageCols(table) {
    if (!table) return;

    const theadTr = table.querySelector("thead tr");
    if (theadTr) {
      theadTr.querySelectorAll('th.col-stage, th[data-stage-col]').forEach((x) => x.remove());
    }

    table.querySelectorAll("tbody tr").forEach((tr) => {
      // якщо це рядок з colspan (пояснення/пусто) — не чіпаємо
      const colspanTd = tr.querySelector("td[colspan]");
      if (colspanTd) return;

      tr.querySelectorAll('td.col-stage, td[data-stage-td]').forEach((x) => x.remove());
    });
  }

  // вставляємо stage-колонки після "Команда"
  function applyStageCols(table, stagesCount) {
    if (!table) return;

    removeStageCols(table);

    if (!stagesCount || stagesCount <= 0) return;

    const theadTr = table.querySelector("thead tr");
    if (theadTr) {
      // шукаємо th "Команда"
      const teamTh =
        theadTr.querySelector("th.col-team") ||
        Array.from(theadTr.children).find((th) => (th.textContent || "").trim().toLowerCase() === "команда");

      const insertAfter = teamTh || theadTr.children[2] || null;

      if (insertAfter) {
        for (let i = 1; i <= stagesCount; i++) {
          insertAfter.insertAdjacentElement("afterend", buildStageTh(i));
          // наступні вставляємо після попередньої stage
          // (insertAdjacentElement завжди після того елемента, тому оновимо insertAfter)
          // але тут простіше: знайдемо останню вставлену і вставляємо після неї
          const last = theadTr.querySelector(`th[data-stage-col="${i}"]`);
          if (last) {
            // зробимо його "опорою" для наступної
            // (нічого не робимо тут, бо на наступній ітерації вставка піде afterend від "insertAfter")
          }
        }

        // Важливо: вставляємо в правильному порядку.
        // Щоб гарантовано було Е1..Еn між "Команда" і "Бали",
        // просто перескладуємо: видалили, тепер вставимо перед колонкою "Бали".
        // (якщо "Команда" не знайдена — пропустимо)
      }
    }

    // Тепер tbody: у кожен рядок вставляємо N клітинок після "Команда"
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const colspanTd = tr.querySelector("td[colspan]");
      if (colspanTd) return;

      const tds = Array.from(tr.children);
      // очікувано: [Місце, ▲▼, Команда, ...]
      const teamTd = tr.querySelector("td.col-team") || tds[2] || null;
      if (!teamTd) return;

      // вставляємо після teamTd N stage td
      let anchor = teamTd;
      for (let i = 1; i <= stagesCount; i++) {
        const td = buildStageTd();
        td.setAttribute("data-stage-idx", String(i));
        anchor.insertAdjacentElement("afterend", td);
        anchor = td;
      }
    });
  }

  // ---------------- UI: collapsible description ----------------
  function setupCollapsibleDesc() {
    if (!descEl) return;

    // якщо вже зроблено — не дублюємо
    if (document.getElementById("descToggleBtn")) return;

    // Ховаємо опис спочатку
    descEl.style.display = "none";

    // Кнопка
    const btn = document.createElement("button");
    btn.id = "descToggleBtn";
    btn.type = "button";
    btn.textContent = "Детальніше…";
    btn.className = "btn btn--ghost"; // якщо є — супер; якщо ні — не завадить

    btn.style.marginTop = "12px";
    btn.style.border = "1px solid rgba(251,191,36,.65)";
    btn.style.color = "#fbbf24";
    btn.style.background = "transparent";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "999px";

    let open = false;

    btn.addEventListener("click", () => {
      open = !open;
      descEl.style.display = open ? "block" : "none";
      btn.textContent = open ? "Згорнути" : "Детальніше…";
    });

    titleEl.insertAdjacentElement("afterend", btn);
  }

  // ---------------- main ----------------
  let unsubComp = null;

  async function boot() {
    setupCollapsibleDesc();

    // fallback без Firebase
    if (!db || !window.firebase) {
      const year = (new Date()).getFullYear();
      kickerEl.textContent = `СЕЗОН ${year}`;
      titleEl.textContent = "Рейтинг сезону STOLAR CARP";

      // без етапів
      applyStageCols(mainTable, 0);
      applyStageCols(contTable, 0);
      document.body.setAttribute("data-stages", "0");
      return;
    }

    const seasonId = await getSeasonId();
    const yearFallback = (new Date()).getFullYear();

    if (!seasonId) {
      kickerEl.textContent = `СЕЗОН ${yearFallback}`;
      titleEl.textContent = "Рейтинг сезону STOLAR CARP";

      applyStageCols(mainTable, 0);
      applyStageCols(contTable, 0);
      document.body.setAttribute("data-stages", "0");
      return;
    }

    // live-оновлення competitions/{seasonId} → етапи одразу малюються
    if (unsubComp) { try { unsubComp(); } catch {} unsubComp = null; }

    unsubComp = db.collection("competitions").doc(seasonId).onSnapshot(
      (snap) => {
        try {
          let year = yearFallback;
          let stagesCount = 0;

          if (snap.exists) {
            const c = snap.data() || {};
            year = c.year || c.seasonYear || year;

            const stages = stagesFromEvents(c.events);
            stagesCount = stages.length;
          }

          kickerEl.textContent = `СЕЗОН ${year}`;
          titleEl.textContent = "Рейтинг сезону STOLAR CARP";

          // атрибут на body — корисно для CSS, якщо захочеш
          document.body.setAttribute("data-stages", String(stagesCount || 0));

          // головне: ставимо Е1..Еn
          applyStageCols(mainTable, stagesCount);
          applyStageCols(contTable, stagesCount);

        } catch (e) {
          console.warn("rating_page: competitions snapshot render failed", e);
        }
      },
      (err) => {
        console.warn("rating_page: competitions snapshot error", err);

        // без етапів
        applyStageCols(mainTable, 0);
        applyStageCols(contTable, 0);
        document.body.setAttribute("data-stages", "0");
      }
    );
  }

  boot();
})();

// assets/js/live_firebase.js
// STOLAR CARP • Live (public)
// ✅ super fast: reads ONLY 2 docs (settings/app + stageResults/{key}) via onSnapshot
// ✅ no weighings reads (because rules deny public weighings)
// ✅ renders: zones + total table (W1..W4 count/weight, total, BIG)
// ✅ updates "Оновлено: ..." pill

(function () {
  "use strict";

  const db = window.scDb;

  const stageEl    = document.getElementById("liveStageName");
  const zonesWrap  = document.getElementById("zonesContainer");
  const totalTbody = document.querySelector("#totalTable tbody");
  const updatedEl  = document.getElementById("liveUpdatedAt");

  const loadingEl  = document.getElementById("liveLoading");
  const contentEl  = document.getElementById("liveContent");
  const errorEl    = document.getElementById("liveError");

  if (!db) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = "Firebase init не завантажився.";
    }
    if (loadingEl) loadingEl.style.display = "none";
    return;
  }

  const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

  const fmtTs = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      if (!d) return "—";
      return d.toLocaleString("uk-UA", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    } catch { return "—"; }
  };

  // W formatting: {count, weight} => "c / kg"
  function fmtW(w) {
    if (!w) return "—";
    const c = (w.count ?? w.c ?? w.qty ?? "");
    const kg = (w.weight ?? w.kg ?? w.w ?? "");
    if (c === "" && kg === "") return "—";
    return `${fmt(c)} / ${fmt(kg)}`;
  }

  // Normalizers (щоб не ламалось якщо поле назвеш трошки інакше)
  function normZoneItem(x) {
    // expected:
    // {place, team, w1:{count,weight}, w2, w3, w4, total:{count,weight}, big, weight}
    return {
      place: x.place ?? x.p ?? "—",
      team:  x.team ?? x.teamName ?? "—",
      w1:    x.w1 ?? x.W1 ?? null,
      w2:    x.w2 ?? x.W2 ?? null,
      w3:    x.w3 ?? x.W3 ?? null,
      w4:    x.w4 ?? x.W4 ?? null,
      total: x.total ?? x.sum ?? null,
      big:   x.big ?? x.BIG ?? x.bigFish ?? "—",
      weight:x.weight ?? x.totalWeight ?? (x.total?.weight ?? "") ?? "—",
      zone:  x.zone ?? x.drawZone ?? ""
    };
  }

  function renderZones(zones) {
    const zoneNames = ["A","B","C"];
    zonesWrap.innerHTML = zoneNames.map((z) => {
      const listRaw = zones?.[z] || [];
      const list = listRaw.map(normZoneItem);

      if (!list.length) {
        return `
          <div class="live-zone card">
            <div class="live-zone-title">
              <h3 style="margin:0;">Зона ${z}</h3>
              <span class="badge">немає даних</span>
            </div>
            <p class="form__hint">Результати для цієї зони ще не заповнені.</p>
          </div>
        `;
      }

      const rowsHtml = list.map((row) => `
        <tr>
          <td>${fmt(row.place)}</td>
          <td class="team-col">${fmt(row.team)}</td>
          <td>${fmtW(row.total)}</td>
          <td>${fmt(row.big)}</td>
          <td>${fmt(row.weight)}</td>
        </tr>
      `).join("");

      return `
        <div class="live-zone card">
          <div class="live-zone-title">
            <h3 style="margin:0;">Зона ${z}</h3>
            <span class="badge badge--warn">команд: ${list.length}</span>
          </div>
          <div class="table-wrap" style="overflow-x:auto;">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Команда</th>
                  <th>Разом W</th>
                  <th>BIG</th>
                  <th>Вага</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderTotal(total) {
    const arr = Array.isArray(total) ? total.map(normZoneItem) : [];

    if (!arr.length) {
      totalTbody.innerHTML = `<tr><td colspan="9">Дані ще не заповнені.</td></tr>`;
      return;
    }

    totalTbody.innerHTML = arr.map((row) => `
      <tr>
        <td>${fmt(row.place)}</td>
        <td class="team-col">${fmt(row.team)}</td>
        <td>${fmt(row.zone)}</td>
        <td>${fmtW(row.w1)}</td>
        <td>${fmtW(row.w2)}</td>
        <td>${fmtW(row.w3)}</td>
        <td>${fmtW(row.w4)}</td>
        <td>${fmtW(row.total)}</td>
        <td>${fmt(row.big)}</td>
      </tr>
    `).join("");
  }

  // ---- Fast live: settings/app -> activeKey -> stageResults/{activeKey} ----
  let unsubSettings = null;
  let unsubStage = null;

  function showError(text) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = text;
    }
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "none";
  }

  function showContent() {
    if (errorEl) errorEl.style.display = "none";
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid";
  }

  function stopStageSub() {
    if (unsubStage) { unsubStage(); unsubStage = null; }
  }

  function stageDocIdFromApp(app) {
    // Підтримуємо різні варіанти, щоб тобі було зручно
    // Рекомендовано: app.activeKey = "compId||stageId"
    const key = app?.activeKey || app?.activeStageKey || "";
    if (key) return String(key);

    const compId  = app?.activeCompetitionId || app?.competitionId || "";
    const stageId = app?.activeStageId || app?.stageId || "";
    if (compId && stageId) return `${compId}||${stageId}`;
    if (compId && !stageId) return `${compId}||`; // oneoff
    return "";
  }

  function startStageSub(docId) {
    stopStageSub();

    if (!docId) {
      showError("Нема активного етапу (settings/app).");
      return;
    }

    // Підписка на 1 документ результатів
    const ref = db.collection("stageResults").doc(docId);
    unsubStage = ref.onSnapshot((snap) => {
      if (!snap.exists) {
        showError("Live ще не опублікований для цього етапу (нема stageResults).");
        return;
      }

      const data = snap.data() || {};
      // Очікуваний формат:
      // { stageName, zones:{A:[],B:[],C:[]}, total:[], updatedAt }
      const stageName = data.stageName || data.stage || data.title || docId;
      if (stageEl) stageEl.textContent = stageName;

      const updatedAt = data.updatedAt || data.updated || data.ts || null;
      if (updatedEl) updatedEl.textContent = `Оновлено: ${fmtTs(updatedAt)}`;

      renderZones(data.zones || {A:[],B:[],C:[]});
      renderTotal(data.total || []);

      showContent();
    }, (err) => {
      console.error(err);
      showError("Помилка читання Live (stageResults).");
    });
  }

  // settings/app should be public read (у твоїх rules так і є)
  unsubSettings = db.collection("settings").doc("app").onSnapshot((snap) => {
    const app = snap.exists ? (snap.data() || {}) : {};
    const docId = stageDocIdFromApp(app);
    startStageSub(docId);
  }, (err) => {
    console.error(err);
    showError("Помилка читання settings/app.");
  });

})();

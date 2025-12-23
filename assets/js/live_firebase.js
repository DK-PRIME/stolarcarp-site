// assets/js/live_firebase.js
// STOLAR CARP • Live (public)
// ✅ дуже швидкий: тільки 2 документи (settings/app + stageResults/{compId__stageKey}) через onSnapshot
// ✅ не читає weighings напряму (публічний доступ тільки до stageResults)
// ✅ рендерить:
//    - зони A/B/C
//    - загальну таблицю (W1..W4, Разом, BIG) — якщо є обраховані дані
//    - якщо зон/результатів ще нема, але є teams з жеребкування — показує розклад по зонах
// ✅ оновлює "Оновлено: ..." pill

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

  const fmt = (v) =>
    (v === null || v === undefined || v === "" ? "—" : String(v));

  const fmtTs = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      if (!d) return "—";
      return d.toLocaleString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit"
      });
    } catch {
      return "—";
    }
  };

  // W formatting: {count, weight} => "c / kg"
  function fmtW(w) {
    if (!w) return "—";
    const c  = (w.count  ?? w.c  ?? w.qty ?? "");
    const kg = (w.weight ?? w.kg ?? w.w   ?? "");
    if (c === "" && kg === "") return "—";
    return `${fmt(c)} / ${fmt(kg)}`;
  }

  // ---- нормалізація рядка зони/тоталу ----
  function normZoneItem(x) {
    // Очікуваний формат при готових результатах:
    // {place, team, zone, w1, w2, w3, w4, total, big, weight}
    // але частина полів може бути відсутня — робимо захист
    return {
      place:  x.place  ?? x.p        ?? "—",
      team:   x.team   ?? x.teamName ?? "—",
      zone:   x.zone   ?? x.drawZone ?? "",
      w1:     x.w1     ?? x.W1       ?? null,
      w2:     x.w2     ?? x.W2       ?? null,
      w3:     x.w3     ?? x.W3       ?? null,
      w4:     x.w4     ?? x.W4       ?? null,
      total:  x.total  ?? x.sum      ?? null,
      big:    x.big    ?? x.BIG      ?? x.bigFish ?? "—",
      weight: x.weight ?? x.totalWeight ?? (x.total?.weight ?? "") ?? "—"
    };
  }

  // ---- fallback: будуємо структуру зон/тоталу тільки з жеребкування (teams) ----
  function zoneRank(z) {
    if (z === "A") return 1;
    if (z === "B") return 2;
    if (z === "C") return 3;
    return 9;
  }

  function buildFromTeams(teamsRaw) {
    const teams = (teamsRaw || []).map((t) => {
      const drawKey = t.drawKey || "";
      let zone = t.zone || "";
      let sector = t.sector;

      if ((!zone || sector == null) && drawKey) {
        const up = String(drawKey).toUpperCase();
        zone = zone || up[0] || "";
        const n = parseInt(up.slice(1), 10);
        if (Number.isFinite(n)) sector = n;
      }

      return {
        team:  t.team || t.teamName || "—",
        zone:  zone || "",
        sector: sector
      };
    });

    const sorted = teams.slice().sort((a, b) => {
      const zr = zoneRank(a.zone) - zoneRank(b.zone);
      if (zr) return zr;
      const sA = a.sector ?? 0;
      const sB = b.sector ?? 0;
      if (sA !== sB) return sA - sB;
      return (a.team || "").localeCompare(b.team || "", "uk");
    });

    const zones = { A: [], B: [], C: [] };
    const total = [];

    sorted.forEach((t) => {
      const row = {
        place: "—",           // ще немає місць без зважувань
        team:  t.team,
        zone:  t.zone,
        w1:    null,
        w2:    null,
        w3:    null,
        w4:    null,
        total: null,
        big:   "—",
        weight:"—"
      };
      total.push(row);
      if (zones[t.zone]) {
        zones[t.zone].push(row);
      }
    });

    return { zones, total };
  }

  function zonesHaveData(zones) {
    if (!zones) return false;
    return (
      (Array.isArray(zones.A) && zones.A.length) ||
      (Array.isArray(zones.B) && zones.B.length) ||
      (Array.isArray(zones.C) && zones.C.length)
    );
  }

  // ---- рендер зон ----
  function renderZones(zones) {
    const zoneNames = ["A", "B", "C"];
    zonesWrap.innerHTML = zoneNames
      .map((z) => {
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

        const rowsHtml = list
          .map(
            (row) => `
          <tr>
            <td>${fmt(row.place)}</td>
            <td class="team-col">${fmt(row.team)}</td>
            <td>${fmtW(row.total)}</td>
            <td>${fmt(row.big)}</td>
            <td>${fmt(row.weight)}</td>
          </tr>
        `
          )
          .join("");

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
      })
      .join("");
  }

  // ---- рендер загальної таблиці ----
  function renderTotal(total) {
    const arr = Array.isArray(total) ? total.map(normZoneItem) : [];

    if (!arr.length) {
      totalTbody.innerHTML =
        `<tr><td colspan="9">Дані ще не заповнені.</td></tr>`;
      return;
    }

    totalTbody.innerHTML = arr
      .map(
        (row) => `
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
    `
      )
      .join("");
  }

  // ---- UX helpers ----
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
    if (unsubStage) {
      unsubStage();
      unsubStage = null;
    }
  }

  // ---- перетворюємо settings/app -> id документа stageResults ----
  function stageDocIdFromApp(app) {
    // Рекомендовано: app.activeKey = "compId||stageKey"
    const keyRaw = app?.activeKey || app?.activeStageKey || "";
    if (keyRaw) {
      const [compId, stageKeyRaw] = String(keyRaw).split("||");
      const comp = (compId || "").trim();
      const stage = (stageKeyRaw || "").trim();
      if (!comp) return "";
      return stage ? `${comp}__${stage}` : `${comp}__main`;
    }

    // fallback: окремі поля
    const compId  = (app?.activeCompetitionId || app?.competitionId || "").trim();
    const stageId = (app?.activeStageId || app?.stageId || "").trim();
    if (!compId) return "";
    return stageId ? `${compId}__${stageId}` : `${compId}__main`;
  }

  function startStageSub(docId) {
    stopStageSub();

    if (!docId) {
      showError("Нема активного етапу (settings/app).");
      return;
    }

    const ref = db.collection("stageResults").doc(docId);

    unsubStage = ref.onSnapshot(
      (snap) => {
        if (!snap.exists) {
          showError("Live ще не опублікований для цього етапу (нема stageResults).");
          return;
        }

        const data = snap.data() || {};

        // Назва етапу
        const stageName =
          data.stageName || data.stage || data.title || docId;
        if (stageEl) stageEl.textContent = stageName;

        // Оновлено
        const updatedAt = data.updatedAt || data.updated || data.ts || null;
        if (updatedEl) updatedEl.textContent = `Оновлено: ${fmtTs(updatedAt)}`;

        // Дані для таблиць
        let zones = data.zones || null;
        let total = data.total || null;

        const teams = Array.isArray(data.teams) ? data.teams : [];

        const hasZones = zonesHaveData(zones);
        const hasTotal = Array.isArray(total) && total.length > 0;

        // Якщо ще немає зон/тоталу, але є teams з жеребкування —
        // будуємо простий розклад по зонах з них
        if (!hasZones && teams.length) {
          const built = buildFromTeams(teams);
          zones = built.zones;
          if (!hasTotal) {
            total = built.total;
          }
        }

        renderZones(zones || { A: [], B: [], C: [] });
        renderTotal(total || []);

        showContent();
      },
      (err) => {
        console.error(err);
        showError("Помилка читання Live (stageResults).");
      }
    );
  }

  // ---- підписка на settings/app ----
  unsubSettings = db
    .collection("settings")
    .doc("app")
    .onSnapshot(
      (snap) => {
        const app = snap.exists ? snap.data() || {} : {};
        const docId = stageDocIdFromApp(app);
        startStageSub(docId);
      },
      (err) => {
        console.error(err);
        showError("Помилка читання settings/app.");
      }
    );
})();

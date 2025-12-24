// assets/js/live_firebase.js
// STOLAR CARP • Live (public)
// ✅ супер швидко: читає тільки 2 документи (settings/app + stageResults/{docId}) через onSnapshot
// ✅ НІЯКИХ weighings колекцій для публіки – лише агрегований stageResults
// ✅ показує зони A/B/C (результати або просто команди після жеребкування)
// ✅ показує зважування W1..W4 у нижній таблиці (через кнопки)
// ✅ fallback: якщо зон/зважувань ще нема, але є teams — показує команди з W="—"
// ✅ оновлює "Оновлено: ..."

(function () {
  "use strict";

  const db = window.scDb;

  const stageEl    = document.getElementById("liveStageName");
  const zonesWrap  = document.getElementById("zonesContainer");
  const updatedEl  = document.getElementById("liveUpdatedAt");

  const loadingEl  = document.getElementById("liveLoading");
  const contentEl  = document.getElementById("liveContent");
  const errorEl    = document.getElementById("liveError");

  // Зважування
  const weighTbody = document.querySelector("#weighTable tbody");
  const wFilterEl  = document.getElementById("wFilter");

  if (!db) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = "Firebase init не завантажився.";
    }
    if (loadingEl) loadingEl.style.display = "none";
    return;
  }

  const fmt = (v) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

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

  // W formatting: {count, weight} => "к-сть / кг"
  function fmtW(w) {
    if (!w) return "—";
    const c  = w.count ?? w.c ?? w.qty ?? "";
    const kg = w.weight ?? w.kg ?? w.w ?? "";
    if (c === "" && kg === "") return "—";
    return `${fmt(c)} / ${fmt(kg)}`;
  }

  // --- helpers для секторів/зон ---
  function normStr(v) {
    return String(v ?? "").trim();
  }

  function parseDrawKey(drawKey) {
    const s = normStr(drawKey).toUpperCase();
    if (!s) return null;
    const zone = s[0];
    const n = parseInt(s.slice(1), 10);
    if (!["A", "B", "C"].includes(zone) || !Number.isFinite(n)) return null;
    return { zone, n };
  }

  function zoneRank(z) {
    if (z === "A") return 1;
    if (z === "B") return 2;
    if (z === "C") return 3;
    return 9;
  }

  function sortByZoneSectorTeam(a, b) {
    const pa = parseDrawKey(a.drawKey || a.sectorLabel || "");
    const pb = parseDrawKey(b.drawKey || b.sectorLabel || "");
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;

    if (!pa && !pb) {
      const za = (a.zone || "").toString().toUpperCase();
      const zb = (b.zone || "").toString().toUpperCase();
      const zr = zoneRank(za) - zoneRank(zb);
      if (zr) return zr;
      return (a.team || "").localeCompare(b.team || "", "uk");
    }

    const zr = zoneRank(pa.zone) - zoneRank(pb.zone);
    if (zr) return zr;
    const nr = pa.n - pb.n;
    if (nr) return nr;
    return (a.team || "").localeCompare(b.team || "", "uk");
  }

  // Нормалізуємо 1 рядок для зони/total
  function normZoneItem(x) {
    const rawZone  = x.zone ?? x.drawZone ?? "";
    const rawSect  =
      x.sector ??
      x.drawSector ??
      x.drawKey ??
      "";

    let sectorLabel = normStr(rawSect);
    if (!sectorLabel && rawZone) {
      // якщо нема drawKey, але є zone+sectorNum
      const n = x.drawSector ?? x.sector ?? "";
      if (n) sectorLabel = `${rawZone}${n}`;
    }

    const totalObj = x.total ?? x.sum ?? null;

    return {
      place:  x.place ?? x.p ?? "—",
      team:   x.team ?? x.teamName ?? "—",

      w1: x.w1 ?? x.W1 ?? null,
      w2: x.w2 ?? x.W2 ?? null,
      w3: x.w3 ?? x.W3 ?? null,
      w4: x.w4 ?? x.W4 ?? null,

      total: totalObj,

      big:    x.big ?? x.BIG ?? x.bigFish ?? "—",
      weight: x.weight ?? x.totalWeight ?? (totalObj?.weight ?? "") ?? "—",

      zone: (rawZone || "").toString().toUpperCase(),
      sectorLabel: sectorLabel || null,
      drawKey: normStr(x.drawKey || rawSect || "")
    };
  }

  // fallback з масиву teams (після жеребкування)
  function buildFallbackFromTeams(teamsRaw) {
    const teams = Array.isArray(teamsRaw) ? teamsRaw : [];
    const zones = { A: [], B: [], C: [] };

    teams.forEach((t) => {
      const drawKey = normStr(t.drawKey || t.sector || "");
      const parsed  = parseDrawKey(drawKey);
      const zone    = (t.drawZone || t.zone || (parsed ? parsed.zone : "") || "").toUpperCase();
      if (!["A", "B", "C"].includes(zone)) return;

      const sectorLabel =
        drawKey ||
        (parsed ? `${parsed.zone}${parsed.n}` : zone);

      zones[zone].push({
        place:  "—",
        team:   t.teamName || t.team || "—",
        total:  null,
        big:    "—",
        weight: "—",
        zone,
        sectorLabel,
        drawKey
      });
    });

    // Сортуємо всередині зон по сектору
    ["A", "B", "C"].forEach((z) => {
      zones[z].sort(sortByZoneSectorTeam);
    });

    return zones;
  }

  function renderZones(zonesData, teamsRaw) {
    const zoneNames = ["A", "B", "C"];

    let zones = zonesData || { A: [], B: [], C: [] };
    const hasData =
      (zones.A && zones.A.length) ||
      (zones.B && zones.B.length) ||
      (zones.C && zones.C.length);

    // fallback із teams, якщо зон ще нема
    if (!hasData && Array.isArray(teamsRaw) && teamsRaw.length) {
      zones = buildFallbackFromTeams(teamsRaw);
    }

    zonesWrap.innerHTML = zoneNames.map((z) => {
      const listRaw = zones[z] || [];
      const list    = listRaw.map(normZoneItem);
      list.sort(sortByZoneSectorTeam);

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

      const rowsHtml = list.map((row) => {
        const sectorText =
          row.sectorLabel ||
          (row.zone ? row.zone : "—");

        const totalText = row.total ? fmtW(row.total) : "—";

        return `
          <tr>
            <td>${fmt(sectorText)}</td>
            <td class="team-col">${fmt(row.team)}</td>
            <td>${fmt(totalText)}</td>
            <td>${fmt(row.big)}</td>
            <td>${fmt(row.weight)}</td>
            <td>${fmt(row.place)}</td>
          </tr>
        `;
      }).join("");

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
                  <th>Зона</th>
                  <th>Команда</th>
                  <th>К-сть</th>
                  <th>BIG</th>
                  <th>Вага</th>
                  <th>Місце</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");
  }

  // ---------- ЗВАЖУВАННЯ (нижня таблиця) ----------

  let currentWKey = "W1";
  let lastStageData = null;

  function setActiveWeighButton(key) {
    if (!wFilterEl) return;
    const btns = wFilterEl.querySelectorAll("[data-w-key]");
    btns.forEach((b) => {
      const k = b.getAttribute("data-w-key");
      if (k === key) {
        b.classList.remove("btn--ghost");
        b.classList.add("btn--accent");
      } else {
        b.classList.add("btn--ghost");
        b.classList.remove("btn--accent");
      }
    });
  }

  function renderWeighings(data) {
    if (!weighTbody) return;

    const teamsRaw = Array.isArray(data?.teams) ? data.teams : [];
    const weighings = data?.weighings || data?.weigh || {};

    const key = currentWKey || "W1";
    let listRaw = Array.isArray(weighings[key]) ? weighings[key] : [];

    // Якщо конкретного зважування ще нема, але є команди — показуємо список команд
    if (!listRaw.length && teamsRaw.length) {
      listRaw = teamsRaw.map((t) => {
        const drawKey = normStr(t.drawKey || t.sector || "");
        const parsed  = parseDrawKey(drawKey);
        const zone    = (t.drawZone || t.zone || (parsed ? parsed.zone : "") || "").toUpperCase();
        const sectorLabel =
          drawKey ||
          (parsed ? `${parsed.zone}${parsed.n}` : zone);

        return {
          team: t.teamName || t.team || "—",
          zone,
          sectorLabel,
          count: null,
          weight: null,
          drawKey
        };
      });
    }

    if (!listRaw.length) {
      weighTbody.innerHTML =
        `<tr><td colspan="4">Зважування ще не внесені для ${fmt(key)}.</td></tr>`;
      return;
    }

    const list = listRaw.map((x) => {
      const drawKey = normStr(x.drawKey || x.sector || "");
      const parsed  = parseDrawKey(drawKey);
      const zone    = (x.zone || x.drawZone || (parsed ? parsed.zone : "") || "").toUpperCase();
      const sectorLabel =
        x.sectorLabel ||
        drawKey ||
        (parsed ? `${parsed.zone}${parsed.n}` : zone);

      return {
        team: x.teamName || x.team || "—",
        zone,
        sectorLabel,
        drawKey,
        w: {
          count: x.count ?? x.c ?? x.qty ?? x.pieces ?? null,
          weight: x.weight ?? x.kg ?? x.w ?? null
        }
      };
    });

    list.sort(sortByZoneSectorTeam);

    weighTbody.innerHTML = list.map((row, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="team-col">${fmt(row.team)}</td>
        <td>${fmt(row.sectorLabel || row.zone || "—")}</td>
        <td>${fmtW(row.w)}</td>
      </tr>
    `).join("");
  }

  if (wFilterEl) {
    wFilterEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-w-key]");
      if (!btn) return;
      const key = btn.getAttribute("data-w-key");
      if (!key || key === currentWKey) return;
      currentWKey = key;
      setActiveWeighButton(key);
      if (lastStageData) {
        renderWeighings(lastStageData);
      }
    });

    // Початково активний W1
    setActiveWeighButton(currentWKey);
  }

  // ---- Підписки: settings/app -> activeKey -> stageResults/{docId} ----
  let unsubSettings = null;
  let unsubStage    = null;

  function showError(text) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent   = text;
    }
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "none";
  }

  function showContent() {
    if (errorEl)   errorEl.style.display   = "none";
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid";
  }

  function stopStageSub() {
    if (unsubStage) {
      unsubStage();
      unsubStage = null;
    }
  }

  // settings/app.activeKey = "compId||stageKey"
  function stageDocIdFromApp(app) {
    const key = app?.activeKey || app?.activeStageKey;
    if (key) return String(key);

    const compId  = app?.activeCompetitionId || app?.competitionId || "";
    const stageId = app?.activeStageId || app?.stageId || "";
    if (compId && stageId) return `${compId}||${stageId}`;
    if (compId && !stageId) return `${compId}||main`;
    return "";
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
        lastStageData = data;

        const stageName = data.stageName || data.stage || data.title || docId;
        if (stageEl) stageEl.textContent = stageName;

        const updatedAt = data.updatedAt || data.updated || data.ts || null;
        if (updatedEl) updatedEl.textContent = `Оновлено: ${fmtTs(updatedAt)}`;

        const zonesData = data.zones || { A: [], B: [], C: [] };
        const teamsRaw  = Array.isArray(data.teams) ? data.teams : [];

        renderZones(zonesData, teamsRaw);
        renderWeighings(data);

        showContent();
      },
      (err) => {
        console.error(err);
        showError("Помилка читання Live (stageResults).");
      }
    );
  }

  // settings/app — публічний
  unsubSettings = db
    .collection("settings")
    .doc("app")
    .onSnapshot(
      (snap) => {
        const app = snap.exists ? (snap.data() || {}) : {};
        const docId = stageDocIdFromApp(app);
        startStageSub(docId);
      },
      (err) => {
        console.error(err);
        showError("Помилка читання settings/app.");
      }
    );
})();

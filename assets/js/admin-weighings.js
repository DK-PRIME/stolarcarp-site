// assets/js/admin-weighings.js
// STOLAR CARP • Адмін зважування + архів + очищення LIVE
// ✅ Вага кожної риби окремо
// ✅ Галочка "Амур" біля кожної риби
// ✅ Короп = fishType: "carp"
// ✅ Амур = fishType: "amur"
// ✅ bigCarp = найбільший короп
// ✅ bigAmur = найбільший амур
// ✅ backward compatible зі старими weights: [4.560, 7.100]
// ✅ У зважуваннях показує тільки активний етап із settings/app

(function(){
  "use strict";

  const auth = window.scAuth;
  const db   = window.scDb;
  const fb   = window.firebase;

  const $ = id => document.getElementById(id);

  const stageSelect    = $("stageSelect");
  const wSelect        = $("wSelect");
  const msgEl          = $("msg");
  const dbgEl          = $("debug");
  const zonesWrap      = $("zonesWrap");
  const archiveSection = $("archiveSection");
  const seasonYearInp  = $("seasonYear");
  const btnArchive     = $("btnArchive");
  const btnClearLive   = $("btnClearLive");
  const archiveMsg     = $("archiveMsg");

  let currentTeams = [];

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[m]));
  }

  function norm(s){
    return String(s ?? "").trim();
  }

  function num(v){
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function fishKg(f){
    if (typeof f === "number" || typeof f === "string") return num(f);
    return num(f?.kg ?? f?.weight ?? f?.value);
  }

  function fishIsAmur(f){
    if (!f || typeof f !== "object") return false;
    return f.isAmur === true || f.fishType === "amur" || f.type === "amur";
  }

  function normalizeFishItem(f){
    const kg = fishKg(f);
    if (kg <= 0) return null;

    const isAmur = fishIsAmur(f);

    return {
      kg,
      fishType: isAmur ? "amur" : "carp",
      isAmur
    };
  }

  function normalizeFishArray(arr){
    return Array.isArray(arr)
      ? arr.map(normalizeFishItem).filter(Boolean)
      : [];
  }

  function fishStats(fishArr){
    const fish = normalizeFishArray(fishArr);
    const total = fish.reduce((s, f) => s + num(f.kg), 0);
    const count = fish.length;
    const bigFish = count ? Math.max(...fish.map(f => num(f.kg))) : 0;

    const carp = fish.filter(f => f.fishType === "carp");
    const amur = fish.filter(f => f.fishType === "amur");

    const carpWeight = carp.reduce((s, f) => s + num(f.kg), 0);
    const amurWeight = amur.reduce((s, f) => s + num(f.kg), 0);

    return {
      fish,
      total,
      count,
      bigFish,
      bigCarp: carp.length ? Math.max(...carp.map(f => num(f.kg))) : 0,
      bigAmur: amur.length ? Math.max(...amur.map(f => num(f.kg))) : 0,
      carpCount: carp.length,
      amurCount: amur.length,
      carpWeight,
      amurWeight
    };
  }

  function eventKey(ev, idx){
    return String(ev?.key || ev?.stageId || ev?.id || `stage-${idx + 1}`).trim();
  }

  function eventTitle(ev, idx){
    return String(ev?.name || ev?.title || ev?.label || `Етап ${idx + 1}`).trim();
  }

  function setMsg(t, ok = true){
    if (!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = "muted " + (t ? (ok ? "ok" : "err") : "");
  }

  function setDbg(t){
    if (!dbgEl) return;
    dbgEl.textContent = t || "";
  }

  function setArchiveMsg(t, ok = true){
    if (!archiveMsg) return;
    archiveMsg.textContent = t || "";
    archiveMsg.className = "muted " + (t ? (ok ? "ok" : "err") : "");
  }

  async function requireAdmin(user){
    const snap = await db.collection("users").doc(user.uid).get();
    const role = snap.exists ? String((snap.data() || {}).role || "") : "";
    return role === "admin";
  }

  function parseStageValue(v){
    const parts = String(v || "").split("||");
    return {
      compId: norm(parts[0] || ""),
      stageKey: norm(parts.slice(1).join("||") || "")
    };
  }

  function stageResultsId(compId, stageKey){
    return `${compId}__${stageKey}`;
  }

  function weighingDocId(compId, stageKey, wNo, teamId){
    return `${compId}||${stageKey}||W${Number(wNo)}||${teamId}`;
  }

  function fallbackNextStageKey(stageKey){
    const raw = String(stageKey || "").trim();
    const m = raw.match(/^(.*?)(\d+)$/);
    if (!m) return "";

    const prefix = m[1];
    const n = Number(m[2]);
    if (!Number.isFinite(n)) return "";

    return `${prefix}${n + 1}`;
  }

  async function getNextStageInfo(compId, currentStageKey){
    const compSnap = await db.collection("competitions").doc(compId).get();

    if (compSnap.exists) {
      const c = compSnap.data() || {};
      const events = Array.isArray(c.events) ? c.events : [];

      if (events.length) {
        const keys = events.map((ev, idx) => ({
          key: eventKey(ev, idx),
          title: eventTitle(ev, idx)
        })).filter(x => x.key);

        const idx = keys.findIndex(x => x.key === currentStageKey);

        if (idx >= 0 && keys[idx + 1]) {
          return {
            key: keys[idx + 1].key,
            title: keys[idx + 1].title,
            source: "events"
          };
        }
      }
    }

    const fallback = fallbackNextStageKey(currentStageKey);

    if (fallback) {
      return {
        key: fallback,
        title: fallback,
        source: "fallback"
      };
    }

    return null;
  }

  async function deleteDocsInBatches(docs, label){
    let deleted = 0;

    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + 400);

      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();

      deleted += chunk.length;
      setArchiveMsg(`🧹 ${label}: ${deleted}/${docs.length}`, true);
    }

    return deleted;
  }

  async function loadStages(){
    if (!stageSelect) return;

    stageSelect.innerHTML = `<option value="">— Завантаження активного етапу… —</option>`;

    try {
      const appSnap = await db.collection("settings").doc("app").get();
      const app = appSnap.exists ? (appSnap.data() || {}) : {};

      const activeCompetitionId = norm(app.activeCompetitionId);
      const activeStageId = norm(app.activeStageId);

      if (!activeCompetitionId || !activeStageId) {
        stageSelect.innerHTML = `<option value="">— Немає активного етапу —</option>`;
        setMsg("Немає активного етапу для зважування.", false);

        if (zonesWrap) zonesWrap.innerHTML = "";
        if (archiveSection) archiveSection.style.display = "none";
        currentTeams = [];
        return;
      }

      const compSnap = await db.collection("competitions").doc(activeCompetitionId).get();

      if (!compSnap.exists) {
        stageSelect.innerHTML = `<option value="">— Турнір не знайдено —</option>`;
        setMsg("Активний турнір не знайдено в competitions.", false);

        if (zonesWrap) zonesWrap.innerHTML = "";
        if (archiveSection) archiveSection.style.display = "none";
        currentTeams = [];
        return;
      }

      const c = compSnap.data() || {};
      const brand = c.brand || "STOLAR CARP";
      const year = c.year || c.seasonYear || "";
      const compTitle = c.name || c.title || (year ? `Season ${year}` : activeCompetitionId);
      const events = Array.isArray(c.events) ? c.events : [];

      let activeStageTitle = norm(app.activeStageTitle) || activeStageId;

      events.forEach((ev, idx) => {
        const key = eventKey(ev, idx);
        if (key === activeStageId) {
          activeStageTitle = eventTitle(ev, idx);
        }
      });

      const value = `${activeCompetitionId}||${activeStageId}`;
      const label = `${brand} · ${compTitle} — ${activeStageTitle}`;

      stageSelect.innerHTML = `<option value="${esc(value)}" selected>${esc(label)}</option>`;
      stageSelect.value = value;

      setMsg(`✅ Активний етап для зважування: ${activeStageTitle}`, true);

    } catch(e) {
      console.error(e);
      stageSelect.innerHTML = `<option value="">— Помилка —</option>`;
      setMsg("Помилка завантаження активного етапу: " + e.message, false);
    }
  }

  async function loadTeamsFromRegistrations(compId, stageKey){
    let qRef = db.collection("registrations")
      .where("competitionId", "==", compId)
      .where("status", "==", "confirmed");

    if (stageKey === "main" || !stageKey) {
      qRef = qRef.where("stageId", "in", [null, "main"]);
    } else {
      qRef = qRef.where("stageId", "==", stageKey);
    }

    const q = await qRef.get();
    const teams = [];

    q.forEach(d => {
      const r = d.data() || {};
      const zone = String(r.drawZone || r.zone || "").toUpperCase();
      const sector = r.drawSector ?? r.sector ?? r.place ?? "";
      const teamId = r.teamId || r.uid || d.id;
      const teamName = r.teamName || r.team || r.name || "Команда";

      if (!zone) return;

      teams.push({
        regId: d.id,
        teamId: String(teamId),
        team: String(teamName),
        zone,
        sector: String(sector)
      });
    });

    const zoneOrder = { A:1, B:2, C:3 };

    teams.sort((a, b) => {
      const za = zoneOrder[a.zone] || 9;
      const zb = zoneOrder[b.zone] || 9;
      if (za !== zb) return za - zb;

      const na = Number(String(a.sector).replace(/[^\d.]/g, ""));
      const nb = Number(String(b.sector).replace(/[^\d.]/g, ""));
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;

      return String(a.sector).localeCompare(String(b.sector), "uk");
    });

    return teams;
  }

  async function loadTeamData(compId, stageKey, teamId, wNo){
    const wId = weighingDocId(compId, stageKey, wNo, teamId);

    try {
      const wSnap = await db.collection("weighings").doc(wId).get();

      if (wSnap.exists) {
        const d = wSnap.data() || {};
        const fish = normalizeFishArray(d.weights || d.fish || []);

        return {
          source: d.source === "admin-weigh" ? "admin" : "judge",
          weights: fish,
          totalWeightKg: num(d.totalWeightKg),
          fishCount: num(d.fishCount),
          bigFishKg: num(d.bigFishKg),
          bigCarpKg: num(d.bigCarpKg || d.bigCarp),
          bigAmurKg: num(d.bigAmurKg || d.bigAmur)
        };
      }
    } catch(e) {
      console.warn("weighings read error:", e);
    }

    const stageDocId = stageResultsId(compId, stageKey);

    try {
      const sSnap = await db.collection("stageResults")
        .doc(stageDocId)
        .collection("teams")
        .doc(teamId)
        .get();

      if (sSnap.exists) {
        const d = sSnap.data() || {};
        const slot = (d.weighings || {})[`W${wNo}`] || {};
        const fish = normalizeFishArray(slot.fish || []);

        return {
          source: "admin",
          weights: fish,
          totalWeightKg: num(slot.total),
          fishCount: num(slot.count),
          bigFishKg: num(slot.big),
          bigCarpKg: num(slot.bigCarp),
          bigAmurKg: num(slot.bigAmur)
        };
      }
    } catch(e) {
      console.warn("stageResults read error:", e);
    }

    return {
      source: "none",
      weights: [],
      totalWeightKg: 0,
      fishCount: 0,
      bigFishKg: 0,
      bigCarpKg: 0,
      bigAmurKg: 0
    };
  }

  function zoneBlock(zone, rowsHtml, count){
    return `
      <div class="card">
        <div class="zoneTitle">
          <h3>Зона ${esc(zone)}</h3>
          <span class="badge">команд: ${count}</span>
        </div>
        <div class="table-wrap">${rowsHtml}</div>
      </div>
    `;
  }

  function fishInputHTML(f){
    const fish = normalizeFishItem(f) || { kg: "", fishType: "carp", isAmur: false };
    const val = num(fish.kg) > 0 ? num(fish.kg).toFixed(3) : "";
    const checked = fish.fishType === "amur" ? "checked" : "";
    const cls = fish.fishType === "amur" ? " fishLine-amur" : "";

    return `
      <div class="fishLine${cls}" data-fish-line>
        <input
          class="fishInput"
          inputmode="decimal"
          placeholder="0.000"
          value="${esc(val)}"
          data-fish
        />
        <label class="amurCheck">
          <input type="checkbox" data-amur ${checked}>
          <span>Амур</span>
        </label>
      </div>
    `;
  }

  async function buildTable(zone, teams, wKey, compId, stageKey){
    if (!teams.length) {
      return `<div class="muted">Немає команд у зоні ${esc(zone)}.</div>`;
    }

    const wNo = Number(wKey.replace("W", ""));

    const head = `
      <table>
        <thead>
          <tr>
            <th>Сектор</th>
            <th>Команда</th>
            <th>Риба (${esc(wKey)})</th>
            <th>Сума</th>
            <th>Джерело</th>
            <th>Дія</th>
          </tr>
        </thead>
        <tbody>
    `;

    const bodyRows = await Promise.all(teams.map(async t => {
      const data = await loadTeamData(compId, stageKey, t.teamId, wNo);
      const fish = normalizeFishArray(data.weights || []);
      const inputs = fish.map(fishInputHTML).join("");
      const stats = fishStats(fish);

      let sourceClass = "source-none";
      let sourceText = "—";

      if (data.source === "judge") {
        sourceClass = "source-judge";
        sourceText = "суддя";
      } else if (data.source === "admin") {
        sourceClass = "source-admin";
        sourceText = "адмін";
      }

      return `
        <tr data-team="${esc(t.teamId)}" data-zone="${esc(t.zone)}">
          <td><div class="pill">${esc(t.sector || "—")}</div></td>
          <td>
            <div class="teamName">${esc(t.team)}</div>
            <div class="teamMeta">${esc(t.teamId)}</div>
          </td>
          <td>
            <div class="fishWrap">
              ${inputs || `<span class="muted">Немає риби</span>`}
              <button class="btnPlus" type="button" data-plus>+</button>
            </div>
            <div class="small">Вага окремо. Галочка тільки якщо це амур.</div>
          </td>
          <td style="text-align:right;">
            <div class="sumBox" data-sum>${stats.total.toFixed(3)}</div>
            <div class="small" data-fish-stats>
              Короп BF: ${stats.bigCarp.toFixed(3)} · Амур BF: ${stats.bigAmur.toFixed(3)}
            </div>
          </td>
          <td style="text-align:center;">
            <span class="source-badge ${sourceClass}">${sourceText}</span>
          </td>
          <td style="text-align:right;">
            <button class="btnSaveMini" type="button" data-save>Зберегти</button>
            <div class="small" data-status></div>
          </td>
        </tr>
      `;
    }));

    return head + bodyRows.join("") + `</tbody></table>`;
  }

  function recalcRowSum(tr){
    const fish = collectFish(tr);
    const stats = fishStats(fish);

    const sumEl = tr.querySelector("[data-sum]");
    if (sumEl) sumEl.textContent = stats.total.toFixed(3);

    const statsEl = tr.querySelector("[data-fish-stats]");
    if (statsEl) {
      statsEl.textContent = `Короп BF: ${stats.bigCarp.toFixed(3)} · Амур BF: ${stats.bigAmur.toFixed(3)}`;
    }
  }

  function collectFish(tr){
    const arr = [];

    tr.querySelectorAll("[data-fish-line]").forEach(line => {
      const inp = line.querySelector("input[data-fish]");
      const chk = line.querySelector("input[data-amur]");
      const kg = num(inp?.value);

      if (kg > 0) {
        const isAmur = !!chk?.checked;
        arr.push({
          kg,
          fishType: isAmur ? "amur" : "carp",
          isAmur
        });
      }
    });

    return arr;
  }

  async function saveTeam(compId, stageKey, wKey, team, fish){
    const wNo = Number(wKey.replace("W", ""));
    const stageDocId = stageResultsId(compId, stageKey);
    const ts = fb.firestore.FieldValue.serverTimestamp();

    const stats = fishStats(fish);
    const fishArr = stats.fish;

    const wDocId = weighingDocId(compId, stageKey, wNo, team.teamId);

    await db.collection("weighings").doc(wDocId).set({
      compId,
      stageId: stageKey,
      weighNo: wNo,
      teamId: team.teamId,
      teamName: team.team,
      zone: team.zone,
      sector: Number(team.sector || 0),

      weights: fishArr,
      weightsKg: fishArr.map(f => num(f.kg)),

      fishCount: stats.count,
      totalWeightKg: stats.total,
      bigFishKg: stats.bigFish,

      bigCarpKg: stats.bigCarp,
      bigAmurKg: stats.bigAmur,
      carpCount: stats.carpCount,
      amurCount: stats.amurCount,
      carpWeightKg: stats.carpWeight,
      amurWeightKg: stats.amurWeight,

      status: "submitted",
      source: "admin-weigh",
      updatedAt: ts,
      updatedBy: "admin"
    }, { merge: true });

    const teamRef = db.collection("stageResults")
      .doc(stageDocId)
      .collection("teams")
      .doc(team.teamId);

    const oldSnap = await teamRef.get();
    const old = oldSnap.exists ? (oldSnap.data() || {}) : {};
    const weighings = old.weighings || {};

    weighings[wKey] = {
      fish: fishArr,
      fishKg: fishArr.map(f => num(f.kg)),
      total: stats.total,
      count: stats.count,
      big: stats.bigFish,
      bigCarp: stats.bigCarp,
      bigAmur: stats.bigAmur,
      carpCount: stats.carpCount,
      amurCount: stats.amurCount,
      carpWeight: stats.carpWeight,
      amurWeight: stats.amurWeight
    };

    let totalWeight = 0;
    let bigFish = 0;
    let bigCarp = 0;
    let bigAmur = 0;
    let totalCount = 0;
    let carpCount = 0;
    let amurCount = 0;
    let carpWeight = 0;
    let amurWeight = 0;
    const sums = {};

    ["W1", "W2", "W3", "W4"].forEach(k => {
      const slot = weighings[k] || {};
      const slotTotal = num(slot.total);
      const slotBig = num(slot.big);
      const slotBigCarp = num(slot.bigCarp);
      const slotBigAmur = num(slot.bigAmur);
      const slotCount = num(slot.count);

      sums[k] = slotTotal;
      totalWeight += slotTotal;
      bigFish = Math.max(bigFish, slotBig);
      bigCarp = Math.max(bigCarp, slotBigCarp);
      bigAmur = Math.max(bigAmur, slotBigAmur);
      totalCount += slotCount;
      carpCount += num(slot.carpCount);
      amurCount += num(slot.amurCount);
      carpWeight += num(slot.carpWeight);
      amurWeight += num(slot.amurWeight);
    });

    await teamRef.set({
      compId,
      stageId: stageKey,
      teamId: team.teamId,
      team: team.team,
      teamName: team.team,
      zone: team.zone,
      sector: team.sector,
      drawZone: team.zone,
      drawSector: team.sector,
      drawKey: `${team.zone}${team.sector}`,

      weighings,
      sums,

      totalWeight,
      bigFish,
      bigCarp,
      bigAmur,
      totalCount,
      carpCount,
      amurCount,
      carpWeight,
      amurWeight,

      updatedAt: ts,
      updatedBy: "admin"
    }, { merge: true });

    const stageRef = db.collection("stageResults").doc(stageDocId);
    const stageSnap = await stageRef.get();
    const stageData = stageSnap.exists ? (stageSnap.data() || {}) : {};
    const teamsArr = Array.isArray(stageData.teams) ? stageData.teams.slice() : [];
    const idx = teamsArr.findIndex(x => x && x.teamId === team.teamId);

    const rowObj = {
      teamId: team.teamId,
      team: team.team,
      teamName: team.team,
      zone: team.zone,
      sector: team.sector,
      drawZone: team.zone,
      drawSector: team.sector,
      drawKey: `${team.zone}${team.sector}`,

      w1: {
        c: num((weighings.W1 || {}).count),
        w: num((weighings.W1 || {}).total),
        bigCarp: num((weighings.W1 || {}).bigCarp),
        bigAmur: num((weighings.W1 || {}).bigAmur)
      },
      w2: {
        c: num((weighings.W2 || {}).count),
        w: num((weighings.W2 || {}).total),
        bigCarp: num((weighings.W2 || {}).bigCarp),
        bigAmur: num((weighings.W2 || {}).bigAmur)
      },
      w3: {
        c: num((weighings.W3 || {}).count),
        w: num((weighings.W3 || {}).total),
        bigCarp: num((weighings.W3 || {}).bigCarp),
        bigAmur: num((weighings.W3 || {}).bigAmur)
      },
      w4: {
        c: num((weighings.W4 || {}).count),
        w: num((weighings.W4 || {}).total),
        bigCarp: num((weighings.W4 || {}).bigCarp),
        bigAmur: num((weighings.W4 || {}).bigAmur)
      },

      totalWeight,
      bigFish,
      bigCarp,
      bigAmur,
      totalCount,
      carpCount,
      amurCount,
      carpWeight,
      amurWeight,
      total: totalCount
    };

    if (idx >= 0) teamsArr[idx] = rowObj;
    else teamsArr.push(rowObj);

    await stageRef.set({
      compId,
      stageId: stageKey,
      stageName: stageData.stageName || stageData.name || stageDocId,
      teams: teamsArr,
      archived: false,
      isLive: true,
      isActive: true,
      updatedAt: ts
    }, { merge: true });

    return { totalWeight, bigFish, bigCarp, bigAmur, totalCount };
  }

  async function loadTables(){
    const { compId, stageKey } = parseStageValue(stageSelect.value);
    const wKey = wSelect.value;

    if (!compId || !stageKey) {
      setMsg("Немає активного етапу для зважування.", false);
      return;
    }

    setMsg("Завантажую команди…", true);
    setDbg("");

    try {
      currentTeams = await loadTeamsFromRegistrations(compId, stageKey);
    } catch(e) {
      console.error(e);
      setMsg("Помилка читання registrations: " + e.message, false);
      setDbg(String(e));
      return;
    }

    if (!currentTeams.length) {
      setMsg("Не знайдено підтверджених команд.", false);
      setDbg("Перевір: competitionId, stageId, status=confirmed, drawZone у registrations.");
      if (zonesWrap) zonesWrap.innerHTML = "";
      if (archiveSection) archiveSection.style.display = "none";
      return;
    }

    const zones = { A:[], B:[], C:[] };

    currentTeams.forEach(t => {
      if (zones[t.zone]) zones[t.zone].push(t);
    });

    setMsg(`✅ Команди: ${currentTeams.length}. Завантажую дані…`, true);

    const [htmlA, htmlB, htmlC] = await Promise.all([
      buildTable("A", zones.A, wKey, compId, stageKey),
      buildTable("B", zones.B, wKey, compId, stageKey),
      buildTable("C", zones.C, wKey, compId, stageKey)
    ]);

    if (zonesWrap) {
      zonesWrap.innerHTML =
        zoneBlock("A", htmlA, zones.A.length) +
        zoneBlock("B", htmlB, zones.B.length) +
        zoneBlock("C", htmlC, zones.C.length);
    }

    if (archiveSection) archiveSection.style.display = "block";
    setMsg(`✅ Таблиці готові. ${compId}__${stageKey} · ${wKey}`, true);
  }

  if (zonesWrap) {
    zonesWrap.addEventListener("input", ev => {
      const tr = ev.target.closest("tr[data-team]");
      if (tr && ev.target.matches("input[data-fish]")) recalcRowSum(tr);
    });

    zonesWrap.addEventListener("change", ev => {
      if (!ev.target.matches("input[data-amur]")) return;

      const line = ev.target.closest("[data-fish-line]");
      const tr = ev.target.closest("tr[data-team]");

      if (line) line.classList.toggle("fishLine-amur", ev.target.checked);
      if (tr) recalcRowSum(tr);
    });

    zonesWrap.addEventListener("click", async ev => {
      const btnPlus = ev.target.closest("[data-plus]");
      const btnSave = ev.target.closest("[data-save]");
      const tr = ev.target.closest("tr[data-team]");
      if (!tr) return;

      const { compId, stageKey } = parseStageValue(stageSelect.value);
      const wKey = wSelect.value;

      if (btnPlus) {
        const wrap = tr.querySelector(".fishWrap");
        const noFish = wrap.querySelector(".muted");
        if (noFish) noFish.remove();

        const holder = document.createElement("div");
        holder.innerHTML = fishInputHTML(null).trim();
        const line = holder.firstElementChild;

        wrap.insertBefore(line, wrap.querySelector("[data-plus]"));

        const inp = line.querySelector("input[data-fish]");
        if (inp) inp.focus();

        recalcRowSum(tr);
        return;
      }

      if (btnSave) {
        const statusEl = tr.querySelector("[data-status]");
        const teamId = tr.getAttribute("data-team");
        const teamObj = currentTeams.find(x => x.teamId === teamId);

        if (!teamObj) {
          if (statusEl) statusEl.textContent = "❌ Немає команди";
          return;
        }

        if (statusEl) statusEl.textContent = "Зберігаю…";

        try {
          const fish = collectFish(tr);
          const result = await saveTeam(compId, stageKey, wKey, teamObj, fish);

          if (statusEl) {
            statusEl.innerHTML =
              `<span class='ok'>✅ Збережено</span><br>` +
              `<span>BF короп: ${result.bigCarp.toFixed(3)}</span><br>` +
              `<span>BF амур: ${result.bigAmur.toFixed(3)}</span>`;
          }

          recalcRowSum(tr);

          const sourceBadge = tr.querySelector(".source-badge");
          if (sourceBadge) {
            sourceBadge.className = "source-badge source-admin";
            sourceBadge.textContent = "адмін";
          }

          setMsg("✅ Збережено в weighings + stageResults. Короп/амур враховано.", true);
          setDbg(`weighings/${weighingDocId(compId, stageKey, Number(wKey.replace("W", "")), teamObj.teamId)}`);
        } catch(e) {
          console.error(e);
          if (statusEl) statusEl.innerHTML = "<span class='err'>❌ Помилка</span>";
          setMsg("Помилка збереження: " + e.message, false);
          setDbg(String(e));
        }
      }
    });
  }

  async function buildArchiveTeamsFromWeighings(compId, stageKey){
    const snap = await db.collection("weighings")
      .where("compId", "==", compId)
      .where("stageId", "==", stageKey)
      .get();

    const byTeam = new Map();

    snap.forEach(d => {
      const w = d.data() || {};
      const teamId = String(w.teamId || "");
      if (!teamId) return;

      const weighNo = Number(w.weighNo || 0);
      if (!(weighNo >= 1 && weighNo <= 4)) return;

      const old = byTeam.get(teamId) || {
        teamId,
        team: String(w.teamName || "—"),
        zone: String(w.zone || ""),
        sector: String(w.sector || ""),
        w1: { c:0, w:0, bigCarp:0, bigAmur:0 },
        w2: { c:0, w:0, bigCarp:0, bigAmur:0 },
        w3: { c:0, w:0, bigCarp:0, bigAmur:0 },
        w4: { c:0, w:0, bigCarp:0, bigAmur:0 },
        totalWeight: 0,
        bigFish: 0,
        bigCarp: 0,
        bigAmur: 0,
        totalCount: 0,
        carpCount: 0,
        amurCount: 0,
        carpWeight: 0,
        amurWeight: 0
      };

      const fish = normalizeFishArray(w.weights || []);
      const stats = fishStats(fish);

      old[`w${weighNo}`] = {
        c: stats.count,
        w: stats.total,
        bigCarp: stats.bigCarp,
        bigAmur: stats.bigAmur
      };

      old.totalWeight += stats.total;
      old.totalCount += stats.count;
      old.bigFish = Math.max(old.bigFish, stats.bigFish);
      old.bigCarp = Math.max(old.bigCarp, stats.bigCarp);
      old.bigAmur = Math.max(old.bigAmur, stats.bigAmur);
      old.carpCount += stats.carpCount;
      old.amurCount += stats.amurCount;
      old.carpWeight += stats.carpWeight;
      old.amurWeight += stats.amurWeight;

      byTeam.set(teamId, old);
    });

    return Array.from(byTeam.values());
  }

  async function rebuildSeasonRatingFromArchive(seasonYear, ts){
    const archivedStagesSnap = await db.collection("seasonResults")
      .doc(seasonYear)
      .collection("stages")
      .get();

    const byTeam = new Map();
    const archivedStages = [];

    archivedStagesSnap.forEach(stageDoc => {
      const stage = stageDoc.data() || {};
      const stageDocId = stageDoc.id;
      const rows = Array.isArray(stage.standings) ? stage.standings : [];

      archivedStages.push({
        stageDocId,
        compId: stage.compId || "",
        stageId: stage.stageId || "",
        stageName: stage.stageName || stageDocId,
        archivedAt: stage.archivedAt || null
      });

      rows.forEach(row => {
        const teamId = String(row.teamId || "");
        if (!teamId) return;

        const old = byTeam.get(teamId) || {
          teamId,
          team: String(row.team || "—"),
          stages: {}
        };

        old.team = String(row.team || old.team || "—");

        old.stages[stageDocId] = {
          stageDocId,
          compId: stage.compId || "",
          stageId: stage.stageId || "",
          stageName: stage.stageName || stageDocId,
          place: num(row.place),
          points: num(row.points || row.place),
          totalWeight: num(row.totalWeight),
          bigFish: num(row.bigFish),
          bigCarp: num(row.bigCarp),
          bigAmur: num(row.bigAmur),
          totalCount: num(row.totalCount)
        };

        byTeam.set(teamId, old);
      });
    });

    const teams = Array.from(byTeam.values()).map(t => {
      const vals = Object.values(t.stages || {});
      return {
        ...t,
        played: vals.length,
        totalPoints: vals.reduce((s, x) => s + num(x.points), 0),
        totalWeight: vals.reduce((s, x) => s + num(x.totalWeight), 0),
        bigFish: vals.reduce((m, x) => Math.max(m, num(x.bigFish)), 0),
        bigCarp: vals.reduce((m, x) => Math.max(m, num(x.bigCarp)), 0),
        bigAmur: vals.reduce((m, x) => Math.max(m, num(x.bigAmur)), 0),
        totalCount: vals.reduce((s, x) => s + num(x.totalCount), 0)
      };
    }).sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
      if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
      return b.bigFish - a.bigFish;
    }).map((t, i) => ({
      ...t,
      seasonPlace: i + 1
    }));

    await db.collection("seasonRating").doc(seasonYear).set({
      seasonYear,
      updatedAt: ts,
      source: "seasonResults",
      archivedStages,
      teams
    }, { merge: true });

    return {
      teamsCount: teams.length,
      stagesCount: archivedStages.length
    };
  }

async function hideStageFromCabinet(compId, stageKey, ts) {
  const snap = await db.collection("public_participants")
    .where("competitionId", "==", compId)
    .where("stageId", "==", stageKey)
    .where("entryType", "==", "team")
    .get();

  let updated = 0;

  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + 400);

    chunk.forEach(d => {
      batch.set(d.ref, {
        cabinetHidden: true,
        archivedStage: true,
        archivedAt: ts
      }, { merge: true });
    });

    await batch.commit();
    updated += chunk.length;
  }

  return updated;
}
  
  async function archiveStage(){
    const { compId, stageKey } = parseStageValue(stageSelect.value);
    const seasonYear = norm(seasonYearInp?.value) || "2026";

    if (!compId || !stageKey) {
      setArchiveMsg("Спочатку обери етап.", false);
      return;
    }

    const stageDocId = stageResultsId(compId, stageKey);

    if (!confirm(`Архівувати готовий результат ${stageDocId} у сезон ${seasonYear}?`)) {
      return;
    }

    if (btnArchive) btnArchive.disabled = true;
    setArchiveMsg("STEP 0 — Підготовка…", true);

    try {
      const ts = fb.firestore.FieldValue.serverTimestamp();
      const stageRef = db.collection("stageResults").doc(stageDocId);

      setArchiveMsg("STEP 1 — Читаю stageResults…", true);
      const stageSnap = await stageRef.get();
      const stageData = stageSnap.exists ? (stageSnap.data() || {}) : {};

      setArchiveMsg("STEP 2 — Збираю команди з stageResults/teams…", true);
      const teamsSnap = await stageRef.collection("teams").get();

      let teamsData = [];

      teamsSnap.forEach(d => {
        const t = d.data() || {};
        teamsData.push({
          teamId: String(t.teamId || d.id),
          team: String(t.team || t.teamName || "—"),
          zone: String(t.zone || ""),
          sector: String(t.sector || ""),

          w1: t.weighings?.W1 ? {
            c:num(t.weighings.W1.count),
            w:num(t.weighings.W1.total),
            bigCarp:num(t.weighings.W1.bigCarp),
            bigAmur:num(t.weighings.W1.bigAmur)
          } : { c:0, w:0, bigCarp:0, bigAmur:0 },

          w2: t.weighings?.W2 ? {
            c:num(t.weighings.W2.count),
            w:num(t.weighings.W2.total),
            bigCarp:num(t.weighings.W2.bigCarp),
            bigAmur:num(t.weighings.W2.bigAmur)
          } : { c:0, w:0, bigCarp:0, bigAmur:0 },

          w3: t.weighings?.W3 ? {
            c:num(t.weighings.W3.count),
            w:num(t.weighings.W3.total),
            bigCarp:num(t.weighings.W3.bigCarp),
            bigAmur:num(t.weighings.W3.bigAmur)
          } : { c:0, w:0, bigCarp:0, bigAmur:0 },

          w4: t.weighings?.W4 ? {
            c:num(t.weighings.W4.count),
            w:num(t.weighings.W4.total),
            bigCarp:num(t.weighings.W4.bigCarp),
            bigAmur:num(t.weighings.W4.bigAmur)
          } : { c:0, w:0, bigCarp:0, bigAmur:0 },

          totalWeight: num(t.totalWeight),
          bigFish: num(t.bigFish),
          bigCarp: num(t.bigCarp),
          bigAmur: num(t.bigAmur),
          totalCount: num(t.totalCount),
          carpCount: num(t.carpCount),
          amurCount: num(t.amurCount),
          carpWeight: num(t.carpWeight),
          amurWeight: num(t.amurWeight)
        });
      });

      if (!teamsData.length && Array.isArray(stageData.teams)) {
        setArchiveMsg("STEP 2B — Беру команди з stageResults.teams…", true);

        teamsData = stageData.teams.map(t => ({
          teamId: String(t.teamId || ""),
          team: String(t.team || t.teamName || "—"),
          zone: String(t.zone || ""),
          sector: String(t.sector || ""),
          w1: t.w1 || { c:0, w:0, bigCarp:0, bigAmur:0 },
          w2: t.w2 || { c:0, w:0, bigCarp:0, bigAmur:0 },
          w3: t.w3 || { c:0, w:0, bigCarp:0, bigAmur:0 },
          w4: t.w4 || { c:0, w:0, bigCarp:0, bigAmur:0 },
          totalWeight: num(t.totalWeight),
          bigFish: num(t.bigFish),
          bigCarp: num(t.bigCarp),
          bigAmur: num(t.bigAmur),
          totalCount: num(t.total || t.totalCount),
          carpCount: num(t.carpCount),
          amurCount: num(t.amurCount),
          carpWeight: num(t.carpWeight),
          amurWeight: num(t.amurWeight)
        })).filter(t => t.teamId);
      }

      if (!teamsData.length) {
        setArchiveMsg("STEP 2C — stageResults порожній, збираю напряму з weighings…", true);
        teamsData = await buildArchiveTeamsFromWeighings(compId, stageKey);
      }

      if (!teamsData.length) {
        setArchiveMsg("❌ Немає команд для архівації. Немає даних ні в stageResults, ні в weighings.", false);
        return;
      }

      setArchiveMsg("STEP 3 — Рахую місця…", true);

      const standings = teamsData
        .slice()
        .sort((a, b) => {
          if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
          if (b.bigFish !== a.bigFish) return b.bigFish - a.bigFish;
          return b.totalCount - a.totalCount;
        })
        .map((t, i) => ({
          place: i + 1,
          points: i + 1,
          teamId: t.teamId,
          team: t.team,
          zone: t.zone,
          sector: t.sector,
          w1: t.w1,
          w2: t.w2,
          w3: t.w3,
          w4: t.w4,
          totalWeight: num(t.totalWeight),
          bigFish: num(t.bigFish),
          bigCarp: num(t.bigCarp),
          bigAmur: num(t.bigAmur),
          totalCount: num(t.totalCount),
          carpCount: num(t.carpCount),
          amurCount: num(t.amurCount),
          carpWeight: num(t.carpWeight),
          amurWeight: num(t.amurWeight)
        }));

      setArchiveMsg("STEP 4 — Записую архів етапу…", true);

      const archiveRef = db.collection("seasonResults")
        .doc(seasonYear)
        .collection("stages")
        .doc(stageDocId);

      await archiveRef.set({
        seasonYear,
        compId,
        stageId: stageKey,
        stageDocId,
        stageName: stageData.stageName || stageData.name || stageDocId,
        archivedAt: ts,
        archivedBy: auth.currentUser ? auth.currentUser.uid : "unknown",
        standings,
        summary: {
          teamsCount: standings.length,
          totalWeight: standings.reduce((s, t) => s + num(t.totalWeight), 0),
          maxBigFish: standings.reduce((m, t) => Math.max(m, num(t.bigFish)), 0),
          maxBigCarp: standings.reduce((m, t) => Math.max(m, num(t.bigCarp)), 0),
          maxBigAmur: standings.reduce((m, t) => Math.max(m, num(t.bigAmur)), 0),
          totalCount: standings.reduce((s, t) => s + num(t.totalCount), 0),
          carpCount: standings.reduce((s, t) => s + num(t.carpCount), 0),
          amurCount: standings.reduce((s, t) => s + num(t.amurCount), 0)
        },
        isArchived: true,
        isActive: false
      }, { merge: true });

      const verify = await archiveRef.get();
      if (!verify.exists) throw new Error("Архів не записався.");

      setArchiveMsg("STEP 5 — Перераховую сезонний рейтинг з архіву…", true);
      const ratingInfo = await rebuildSeasonRatingFromArchive(seasonYear, ts);

      setArchiveMsg("STEP 6 — Позначаю LIVE як архівований…", true);

      await stageRef.set({
  archived: true,
  isLive: false,
  isActive: false,
  archivedAt: ts,
  archivedTo: `seasonResults/${seasonYear}/stages/${stageDocId}`
}, { merge: true });

setArchiveMsg("STEP 7 — Ховаю етап з кабінетів команд…", true);
const hiddenCount = await hideStageFromCabinet(compId, stageKey, ts);

setArchiveMsg(
  `✅ Архів готовий. Етап: ${standings.length} команд. Рейтинг: ${ratingInfo.teamsCount} команд / ${ratingInfo.stagesCount} етапів. Приховано в кабінеті: ${hiddenCount}. Тепер можна натиснути «Очистити LIVE».`,
  true
);

      setMsg("✅ Етап архівовано. Тепер можна очистити LIVE перед наступним етапом.", true);

    } catch(e) {
      console.error("Archive error:", e);
      setArchiveMsg(
        `❌ ПОМИЛКА
CODE: ${e.code || "—"}
MSG: ${e.message || "—"}
STACK: ${e.stack || "—"}`,
        false
      );
    } finally {
      if (btnArchive) btnArchive.disabled = false;
    }
  }

  async function activateNextStage(compId, currentStageKey, currentStageDocId){
    const next = await getNextStageInfo(compId, currentStageKey);

    if (!next || !next.key) {
      await db.collection("settings").doc("app").set({
        activeCompetitionId: "",
        activeStageId: "",
        activeKey: "",
        activeStageResultsId: "",
        liveClosed: true,
        liveClosedAt: fb.firestore.FieldValue.serverTimestamp(),
        liveClosedFrom: currentStageDocId
      }, { merge: true });

      return null;
    }

    const nextStageDocId = stageResultsId(compId, next.key);

    await db.collection("settings").doc("app").set({
      activeCompetitionId: compId,
      activeStageId: next.key,
      activeKey: nextStageDocId,
      activeStageResultsId: nextStageDocId,

      liveClosed: false,
      liveClosedAt: null,
      liveClosedFrom: currentStageDocId,

      previousStageId: currentStageKey,
      previousStageResultsId: currentStageDocId,

      activeStageTitle: next.title || next.key,
      updatedAt: fb.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await db.collection("stageResults").doc(nextStageDocId).set({
      compId,
      stageId: next.key,
      stageName: next.title || nextStageDocId,
      teams: [],
      zones: { A: [], B: [], C: [] },
      archived: false,
      isLive: true,
      isActive: true,
      preparedAt: fb.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return {
      stageKey: next.key,
      stageDocId: nextStageDocId,
      title: next.title || next.key,
      source: next.source
    };
  }

  async function clearLiveStage(){
    const { compId, stageKey } = parseStageValue(stageSelect.value);
    const seasonYear = norm(seasonYearInp?.value) || "2026";

    if (!compId || !stageKey) {
      setArchiveMsg("Спочатку обери етап.", false);
      return;
    }

    const stageDocId = stageResultsId(compId, stageKey);

    const archiveRef = db.collection("seasonResults")
      .doc(seasonYear)
      .collection("stages")
      .doc(stageDocId);

    const archiveSnap = await archiveRef.get();

    if (!archiveSnap.exists) {
      setArchiveMsg("❌ Спочатку архівуй етап. Без архіву LIVE чистити не можна.", false);
      return;
    }

    if (!confirm(
      `Очистити LIVE для ${stageDocId}?\n\n` +
      `Буде видалено:\n` +
      `• weighings цього етапу\n` +
      `• stageResults цього етапу\n` +
      `• stageResults/teams цього етапу\n\n` +
      `Архів seasonResults НЕ буде видалено.\n\n` +
      `Після очищення система автоматично активує наступний етап.`
    )) {
      return;
    }

    if (btnClearLive) btnClearLive.disabled = true;

    try {
      setArchiveMsg("🧹 Очищаю LIVE…", true);

      const weighingsSnap = await db.collection("weighings")
        .where("compId", "==", compId)
        .where("stageId", "==", stageKey)
        .get();

      const deletedWeighings = await deleteDocsInBatches(weighingsSnap.docs, "Видалено weighings");

      const stageRef = db.collection("stageResults").doc(stageDocId);
      const teamsSnap = await stageRef.collection("teams").get();

      const deletedTeams = await deleteDocsInBatches(teamsSnap.docs, "Видалено stageResults/teams");

      await stageRef.delete();

      setArchiveMsg("🔁 Активую наступний етап…", true);

      const activated = await activateNextStage(compId, stageKey, stageDocId);

      await loadStages();

      if (zonesWrap) zonesWrap.innerHTML = "";
      if (archiveSection) archiveSection.style.display = "none";

      currentTeams = [];

      if (activated) {
        setArchiveMsg(
          `✅ LIVE очищено. Видалено weighings: ${deletedWeighings}, teams: ${deletedTeams}. Активовано: ${activated.title}.`,
          true
        );

        setMsg(`✅ LIVE очищено. Автоматично активовано наступний етап: ${activated.title}`, true);
      } else {
        setArchiveMsg(
          `✅ LIVE очищено. Видалено weighings: ${deletedWeighings}, teams: ${deletedTeams}. Наступний етап не знайдено.`,
          true
        );

        setMsg("✅ LIVE очищено. Наступний етап не знайдено — активний Live закрито.", true);
      }

      setDbg("");

    } catch(e) {
      console.error(e);
      setArchiveMsg("❌ Помилка очищення LIVE: " + (e.message || e), false);
    } finally {
      if (btnClearLive) btnClearLive.disabled = false;
    }
  }

  async function init(){
    if (!auth || !db || !fb) {
      setMsg("Firebase не ініціалізувався.", false);
      return;
    }

    auth.onAuthStateChanged(async user => {
      if (!user) {
        setMsg("Увійди як адмін.", false);
        return;
      }

      const ok = await requireAdmin(user);

      if (!ok) {
        setMsg("Доступ заборонено.", false);
        setTimeout(() => {
          window.location.href = "index.html";
        }, 2000);
        return;
      }

      await loadStages();

      const btnReloadStages = $("btnReloadStages");
      const btnLoadTables = $("btnLoadTables");

      if (btnReloadStages) {
        btnReloadStages.onclick = async () => {
          setMsg("Оновлюю активний етап…", true);
          await loadStages();
        };
      }

      if (btnLoadTables) {
        btnLoadTables.onclick = loadTables;
      }

      if (btnArchive) {
        btnArchive.onclick = archiveStage;
      }

      if (btnClearLive) {
        btnClearLive.onclick = clearLiveStage;
      }
    });
  }

  init();
})();

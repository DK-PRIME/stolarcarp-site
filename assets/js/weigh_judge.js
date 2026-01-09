// assets/js/weigh_judge.js
// STOLAR CARP • Суддя • Зважування (LIVE-сумісно + BigFish Total-ready)
// ✅ bind zone через ?zone=A + localStorage
// ✅ activeKey береться як LIVE: settings/app.activeKey || compId||stageId
// ✅ FIX: якщо немає activeStageId — беремо перший events[0].key з competitions/{compId}
// ✅ команди беремо зі stageResults/{activeKey}.teams (тільки з жеребом) + фільтр по зоні
// ✅ пишемо в weighings (LIVE-сумісно): docId = `${compId}||${stageId}||W{weighNo}||{teamId}`

(function () {
  "use strict";

  const LS_KEY = "sc_judge_zone_v1";
  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const DEFAULT_MAX_W = 4;

  // ===== UI refs =====
  const zoneTitle = document.getElementById("zoneTitle");
  const statusEl = document.getElementById("status");
  const bindInfo = document.getElementById("bindInfo");
  const msgEl = document.getElementById("msg");
  const authPill = document.getElementById("authPill");

  const btnOpen = document.getElementById("btnOpen");
  const btnReset = document.getElementById("btnReset");
  const btnSaveHint = document.getElementById("btnSaveHint");

  const weighCard = document.getElementById("weighCard");
  const wMsgEl = document.getElementById("wMsg");
  const curWEl = document.getElementById("curW");
  const teamsCountEl = document.getElementById("teamsCount");
  const teamsBox = document.getElementById("teamsBox");
  const netBadge = document.getElementById("netBadge");

  const wBtns = [
    { n: 1, el: document.getElementById("w1") },
    { n: 2, el: document.getElementById("w2") },
    { n: 3, el: document.getElementById("w3") },
    { n: 4, el: document.getElementById("w4") },
  ];

  // ===== Firebase =====
  let db = null;
  let me = null;

  // ===== Active stage =====
  let compId = "";
  let stageId = "";
  let activeKey = ""; // stageResults docId (LIVE)
  let zone = "";

  let maxW = DEFAULT_MAX_W;
  let currentW = 1; // settings/weighing_{activeKey}.current[zone]
  let viewW = 1; // перемикач W1..W4 (редагування)

  // cache: weighings[teamId][wNo] = doc
  const weighCache = Object.create(null);

  // stage teams cache
  let teamsArr = [];
  let teamsMap = {};

  // ---------- helpers ----------
  function setMsg(t, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = "muted " + (t ? (ok ? "ok" : "err") : "");
  }
  function setWMsg(t, ok = true) {
    if (!wMsgEl) return;
    wMsgEl.textContent = t || "";
    wMsgEl.className = "muted " + (t ? (ok ? "ok" : "err") : "");
  }
  function norm(v) {
    return String(v ?? "").trim();
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  async function waitFirebase() {
    for (let i = 0; i < 140; i++) {
      if (window.scDb && window.scAuth && window.firebase) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb.");
  }

  async function requireJudgeOrAdmin(user) {
    if (!user) return { ok: false, role: "" };
    if (user.uid === ADMIN_UID) return { ok: true, role: "admin" };

    const snap = await db.collection("users").doc(user.uid).get();
    const role = (snap.exists ? (snap.data() || {}).role : "") || "";
    const ok = role === "judge" || role === "admin";
    return { ok, role };
  }

  // ---------- bind zone ----------
  function readBindZone() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function writeBindZone(z) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ zone: z }));
    } catch {}
  }
  function clearBindZone() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  }
  function zoneFromUrl() {
    const p = new URLSearchParams(location.search);
    return norm((p.get("zone") || "").toUpperCase());
  }

  // ---------- ACTIVE: robust resolution ----------
  function readActiveIdsFromApp(app) {
    const comp =
      app?.activeCompetitionId ||
      app?.activeCompetition ||
      app?.competitionId ||
      "";

    const st =
      app?.activeStageId ||
      app?.stageId ||
      ""; // ⛔ тут НЕ ставимо stage-1 одразу, щоб мати шанс взяти з competitions

    compId = norm(comp);
    stageId = norm(st);
  }

  // ✅ NEW: якщо stageId пустий — пробуємо взяти перший key з competitions/{compId}.events[0]
  async function resolveStageIdIfMissing() {
    if (!compId) return "";

    if (stageId) return stageId;

    try {
      const cSnap = await db.collection("competitions").doc(compId).get();
      if (!cSnap.exists) return "";

      const c = cSnap.data() || {};
      const events = Array.isArray(c.events) ? c.events : [];
      const first = events[0] || null;
      const key = norm(first?.key || first?.stageId || first?.id || "");
      if (key) {
        stageId = key;
        return stageId;
      }
    } catch (e) {
      console.warn("resolveStageIdIfMissing:", e);
    }

    // fallback
    stageId = "stage-1";
    return stageId;
  }

  function stageDocIdFromApp(app) {
    const key = norm(app?.activeKey || "");
    if (key) return key;

    const comp =
      app?.activeCompetitionId ||
      app?.activeCompetition ||
      app?.competitionId ||
      "";

    const st =
      app?.activeStageId ||
      app?.stageId ||
      "";

    const c = norm(comp);
    const s = norm(st);
    return c && s ? `${c}||${s}` : ""; // якщо s нема — далі дорезолвимо async
  }

  // ---------- UI ----------
  function paintZoneTitle() {
    if (!zoneTitle) return;
    const z = String(zone || "").toUpperCase();

    zoneTitle.classList.remove("zone-a", "zone-b", "zone-c");

    if (!z) {
      zoneTitle.textContent = "Зона —";
      return;
    }

    zoneTitle.textContent = `Зона ${z}`;
    if (z === "A") zoneTitle.classList.add("zone-a");
    else if (z === "B") zoneTitle.classList.add("zone-b");
    else if (z === "C") zoneTitle.classList.add("zone-c");
  }

  function renderBindInfo() {
    const z = zone || "—";
    const c = compId || "—";
    const s = stageId || "—";
    const ak = activeKey || "—";

    paintZoneTitle();

    if (bindInfo) {
      bindInfo.textContent = `zone=${z} | compId=${c} | stageId=${s} | activeKey=${ak}`;
    }
  }

  // ---------- weighing settings per activeKey ----------
  function settingsDocId() {
    return `weighing_${activeKey}`;
  }

  async function getOrCreateWeighingSettings() {
    if (!activeKey) throw new Error("Нема activeKey. Перевір settings/app.");
    const ref = db.collection("settings").doc(settingsDocId());
    const snap = await ref.get();
    if (snap.exists) return { ref, data: snap.data() || {} };

    const init = {
      activeKey,
      compId,
      stageId,
      maxW: DEFAULT_MAX_W,
      current: { A: 1, B: 1, C: 1 },
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(init, { merge: true });
    return { ref, data: init };
  }

  function getCurrentWForZone(d) {
    const cur = d.current || {};
    const mW = Number(d.maxW || DEFAULT_MAX_W);
    const w = Number(cur[zone] || 1);
    return Math.min(Math.max(w, 1), mW);
  }

  async function setCurrentWForZone(nextW) {
    const ref = db.collection("settings").doc(settingsDocId());
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data() || {};
      const mW = Number(d.maxW || DEFAULT_MAX_W);
      const cur = Object.assign({ A: 1, B: 1, C: 1 }, d.current || {});
      const safe = Math.min(Math.max(Number(nextW || 1), 1), mW);
      cur[zone] = safe;
      tx.set(
        ref,
        {
          current: cur,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  }

  function updateWButtons() {
    if (curWEl) curWEl.textContent = `W${currentW}`;
    wBtns.forEach((b) => {
      if (!b.el) return;
      b.el.classList.toggle("isActive", b.n === viewW);
      b.el.disabled = b.n > currentW;
    });
  }

  // ---------- teams from stageResults (LIVE) ----------
  function parseZoneKey(drawKey, drawZone, drawSector) {
    const z = (drawZone || (drawKey ? String(drawKey)[0] : "") || "").toUpperCase();
    const n = Number(drawSector || (drawKey ? parseInt(String(drawKey).slice(1), 10) : 0) || 0);
    const label = drawKey ? String(drawKey).toUpperCase() : z && n ? `${z}${n}` : z || "—";
    const zoneOrder = z === "A" ? 1 : z === "B" ? 2 : z === "C" ? 3 : 9;
    const sortKey = zoneOrder * 100 + (isFinite(n) ? n : 99);
    return { z, n, label, sortKey };
  }

  async function loadTeamsForZone() {
    if (!activeKey) throw new Error("Нема activeKey з settings/app.");

    const snap = await db.collection("stageResults").doc(activeKey).get();
    if (!snap.exists) {
      // ✅ Чітке повідомлення
      return { rows: [], missingStageResults: true };
    }

    const data = snap.data() || {};
    const teamsRaw = Array.isArray(data.teams) ? data.teams : [];

    const rows = [];
    teamsRaw.forEach((t) => {
      const teamId = norm(t.teamId || "");
      if (!teamId) return;

      const hasDraw = !!(t.drawKey || t.drawZone || t.drawSector);
      if (!hasDraw) return;

      const zinfo = parseZoneKey(t.drawKey, t.drawZone, t.drawSector);
      if (zinfo.z !== zone) return;

      rows.push({
        teamId,
        teamName: norm(t.teamName || t.team || "—"),
        sector: zinfo.n || 0,
        drawKey: zinfo.label,
      });
    });

    rows.sort((a, b) => (a.sector || 0) - (b.sector || 0) || (a.teamName || "").localeCompare(b.teamName || "", "uk"));
    return { rows, missingStageResults: false };
  }

  // ---------- weighings ----------
  function weighingDocId(teamId, wNo) {
    return `${compId}||${stageId}||W${Number(wNo)}||${teamId}`;
  }

  async function loadWeighing(teamId, wNo) {
    const id = weighingDocId(teamId, wNo);
    const snap = await db.collection("weighings").doc(id).get();
    return snap.exists ? snap.data() || null : null;
  }

  function toNum(val) {
    const s = String(val ?? "").trim().replace(",", ".");
    if (!s) return NaN;
    return Number(s);
  }
  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  function cleanWeights(rawArr) {
    const arr = (Array.isArray(rawArr) ? rawArr : [])
      .map(toNum)
      .map((n) => (Number.isFinite(n) ? round2(Math.max(0, Math.min(n, 999.99))) : NaN))
      .filter((n) => Number.isFinite(n) && n > 0);
    return arr;
  }

  function calcFromWeights(weights) {
    const fishCount = weights.length;
    const total = round2(weights.reduce((a, b) => a + b, 0));
    const big = fishCount ? Math.max(...weights) : 0;
    return { fishCount, totalWeightKg: total, bigFishKg: round2(big) };
  }

  async function saveWeighingWeights(team, wNo, weightsRaw) {
    const id = weighingDocId(team.teamId, wNo);
    const ts = window.firebase.firestore.FieldValue.serverTimestamp();

    const weights = cleanWeights(weightsRaw);
    const calc = calcFromWeights(weights);

    await db
      .collection("weighings")
      .doc(id)
      .set(
        {
          compId,
          stageId,
          weighNo: Number(wNo),
          teamId: team.teamId,
          weights,

          zone,
          sector: Number(team.sector || 0),
          teamName: team.teamName || "",
          fishCount: calc.fishCount,
          totalWeightKg: calc.totalWeightKg,
          bigFishKg: calc.bigFishKg,
          status: "submitted",
          updatedAt: ts,
          updatedBy: me?.uid || "",
        },
        { merge: true }
      );

    weighCache[team.teamId] = weighCache[team.teamId] || {};
    weighCache[team.teamId][wNo] = {
      weights,
      fishCount: calc.fishCount,
      totalWeightKg: calc.totalWeightKg,
      bigFishKg: calc.bigFishKg,
      status: "submitted",
    };
  }

  async function maybeAdvanceAuto(teams) {
    if (currentW >= maxW) return false;
    if (!teams.length) return false;

    const wsnap = await db
      .collection("weighings")
      .where("compId", "==", compId)
      .where("stageId", "==", stageId)
      .where("weighNo", "==", Number(currentW))
      .where("zone", "==", zone)
      .where("status", "==", "submitted")
      .get();

    const got = new Set();
    wsnap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.teamId) got.add(String(d.teamId));
    });

    for (const t of teams) {
      if (!got.has(String(t.teamId))) return false;
    }

    await setCurrentWForZone(currentW + 1);
    return true;
  }

  async function preloadWeighings(teams) {
    for (const t of teams) {
      weighCache[t.teamId] = weighCache[t.teamId] || {};
      for (let w = 1; w <= DEFAULT_MAX_W; w++) {
        weighCache[t.teamId][w] = await loadWeighing(t.teamId, w);
      }
    }
  }

  // ---------- STYLES ----------
  function injectStyles() {
    if (document.getElementById("wjLiveTableStyles")) return;

    const css = `
      <style id="wjLiveTableStyles">
        .wj-wrapTable{border:1px solid rgba(148,163,184,.18);border-radius:16px;overflow:hidden;background:rgba(2,6,23,.25);}
        .wj-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        table.wj{width:100%;border-collapse:collapse;min-width:720px;font-size:12px;}
        table.wj th, table.wj td{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;}
        table.wj thead th{background:rgba(2,6,23,.92);font-weight:900;text-transform:none;}
        .wj-col-sector{width:92px;white-space:nowrap;}
        .wj-col-team{width:280px;min-width:0;}
        .wj-col-w{width:110px;text-align:center;min-width:0;}
        .wj-pill{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:999px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.35);font-weight:900;}
        .wj-teamName{font-weight:900;margin-bottom:6px;}
        .wj-editor{width:100%;max-width:100%;}
        .wj-fishesScroll{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding:2px 0 6px;}
        .wj-fishes{display:flex;flex-wrap:nowrap;gap:4px;width:max-content;}
        .wj-fish{flex:0 0 auto;display:flex;gap:4px;align-items:center;}
        .wj-inp{width:44px;height:20px;padding:0 2px;font-size:8px;line-height:20px;text-align:center;border-radius:6px;}
        .wj-quick{width:54px;height:20px;padding:0 2px;font-size:8px;line-height:20px;text-align:center;border-radius:6px;}
        .wj-miniBtn{width:20px;height:20px;padding:0;border-radius:6px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.25);color:#e5e7eb;font-weight:900;font-size:12px;}
        .wj-miniBtn:disabled{opacity:.45;}
        .wj-actions{display:flex;gap:8px;align-items:center;margin-top:6px;}
        .wj-actions .btn{padding:4px 10px;font-size:12px;border-radius:12px;font-weight:900;}
        .wj-hint{font-size:11px;margin-top:4px;}
        .wj-sum{font-weight:900;}
        .wj-sub{font-size:11px;margin-top:2px;opacity:.75;}
        table.wj td, table.wj th{overflow:visible;}
      </style>
    `;
    document.head.insertAdjacentHTML("beforeend", css);
  }

  function cellSummary(doc) {
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    if (!weights.length) return `<span class="muted">—</span>`;
    const total = round2(weights.reduce((a, b) => a + b, 0)).toFixed(2);
    const c = weights.length;
    return `<div class="wj-sum">${esc(total)}</div><div class="wj-sub">🐟 ${c}</div>`;
  }

  function editorCell(team, doc) {
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    const safe = weights.length ? weights : [""];

    return `
      <div class="wj-editor" data-team="${esc(team.teamId)}">
        <div class="wj-fishesScroll">
          <div class="wj-fishes">
            ${safe
              .map(
                (v) => `
              <div class="wj-fish">
                <input class="inp wj-inp" inputmode="decimal" placeholder="вага"
                  value="${esc(v === "" ? "" : Number(v).toFixed(2))}">
                <button class="wj-miniBtn wj-del" type="button" title="Видалити" ${safe.length <= 1 ? "disabled" : ""}>×</button>
              </div>
            `
              )
              .join("")}
          </div>
        </div>

        <div class="wj-actions">
          <input class="inp wj-quick" inputmode="decimal" placeholder="+ вага" value="">
          <button class="wj-miniBtn wj-add" type="button" title="Додати рибу">+</button>
          <button class="btn btn--primary wj-save" type="button">OK</button>
        </div>

        <div class="muted wj-hint"></div>
      </div>
    `;
  }

  function renderTable(teams) {
    injectStyles();
    if (!teamsBox) return;

    if (!teams.length) {
      teamsBox.innerHTML = `<div class="muted">Нема команд у зоні ${esc(zone)} (перевір жереб у stageResults).</div>`;
      return;
    }

    const html = `
      <div class="wj-wrapTable">
        <div class="wj-scroll">
          <table class="wj">
            <thead>
              <tr>
                <th class="wj-col-sector">Зона</th>
                <th class="wj-col-team">Команда</th>
                ${[1, 2, 3, 4].map((n) => `<th class="wj-col-w">W${n}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${teams
                .map((t) => {
                  const cells = [1, 2, 3, 4]
                    .map((n) => {
                      const doc = weighCache?.[t.teamId]?.[n] || null;
                      return `<td class="wj-col-w">${cellSummary(doc)}</td>`;
                    })
                    .join("");

                  const activeDoc = weighCache?.[t.teamId]?.[viewW] || null;

                  return `
                  <tr>
                    <td class="wj-col-sector"><span class="wj-pill">${esc(zone)}${esc(t.sector)}</span></td>

                    <td class="wj-col-team">
                      <div class="wj-teamName">${esc(t.teamName)}</div>
                      ${editorCell(t, activeDoc)}
                    </td>

                    ${cells}
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    teamsBox.innerHTML = html;

    teamsBox.querySelectorAll(".wj-editor").forEach((ed) => {
      const teamId = ed.getAttribute("data-team");
      const hint = ed.querySelector(".wj-hint");
      const fishes = ed.querySelector(".wj-fishes");

      function refreshDel() {
        const dels = ed.querySelectorAll(".wj-del");
        if (dels.length === 1) dels[0].disabled = true;
        else dels.forEach((b) => (b.disabled = false));
      }

      ed.querySelector(".wj-quick")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ed.querySelector(".wj-add")?.click();
        }
      });

      ed.querySelector(".wj-add")?.addEventListener("click", () => {
        const quick = ed.querySelector(".wj-quick");
        const scroller = ed.querySelector(".wj-fishesScroll");

        let v = quick ? String(quick.value || "").trim() : "";
        if (!v) {
          const lastInp = fishes ? fishes.querySelector(".wj-fish:last-child .wj-inp") : null;
          v = lastInp ? String(lastInp.value || "").trim() : "";
        }

        const wrap = document.createElement("div");
        wrap.className = "wj-fish";
        wrap.innerHTML = `
          <input class="inp wj-inp" inputmode="decimal" placeholder="вага" value="${esc(v)}">
          <button class="wj-miniBtn wj-del" type="button" title="Видалити">×</button>
        `;
        if (fishes) fishes.appendChild(wrap);

        if (quick) quick.value = "";
        if (hint) hint.textContent = "";
        refreshDel();

        const newInp = wrap.querySelector(".wj-inp");
        setTimeout(() => {
          if (scroller) scroller.scrollLeft = scroller.scrollWidth;
          if (newInp) {
            newInp.focus();
            newInp.select();
          }
        }, 0);
      });

      ed.addEventListener("click", (e) => {
        const btn = e.target;
        if (btn && btn.classList && btn.classList.contains("wj-del")) {
          const row = btn.closest(".wj-fish");
          if (row) {
            row.remove();
            if (hint) hint.textContent = "";
            refreshDel();
          }
        }
      });

      ed.querySelector(".wj-save")?.addEventListener("click", async () => {
        try {
          if (hint) {
            hint.textContent = "Збереження…";
            hint.className = "muted wj-hint";
          }

          const team = (teamsMap || {})[teamId];
          if (!team) throw new Error("Команда не знайдена у списку.");

          const raw = Array.from(ed.querySelectorAll(".wj-inp")).map((i) => i.value);
          await saveWeighingWeights(team, viewW, raw);

          const d = weighCache?.[teamId]?.[viewW] || {};
          if (hint) {
            hint.textContent = `✅ OK: 🐟 ${d.fishCount || 0} • кг ${(d.totalWeightKg || 0).toFixed(2)} • Big ${(d.bigFishKg || 0).toFixed(2)}`;
            hint.className = "muted wj-hint ok";
          }

          const advanced = await maybeAdvanceAuto(teamsArr || []);
          if (advanced) {
            const s = await getOrCreateWeighingSettings();
            maxW = Number(s.data.maxW || DEFAULT_MAX_W);
            currentW = getCurrentWForZone(s.data);
            if (viewW > currentW) viewW = currentW;
            updateWButtons();
            setWMsg(`Авто: всі здані → переключив на W${currentW}`, true);
          }

          await preloadWeighings(teamsArr || []);
          renderTable(teamsArr || []);
          setWMsg("✅ Збережено у Firestore.", true);
        } catch (err) {
          console.error(err);
          if (hint) {
            hint.textContent = "❌ " + (err?.message || err);
            hint.className = "muted wj-hint err";
          }
          setWMsg("❌ Помилка збереження.", false);
        }
      });

      refreshDel();
    });
  }

  // ---------- open zone ----------
  async function openZone(withMsgs = true) {
    if (!zone) {
      if (withMsgs) setMsg("Нема зони. Відкрий посилання типу ?zone=A", false);
      return;
    }
    if (!compId) {
      if (withMsgs) setMsg("Нема activeCompetitionId у settings/app.", false);
      return;
    }

    // ✅ важливе: дорезолвити stageId якщо його нема
    await resolveStageIdIfMissing();

    // ✅ скласти activeKey якщо його нема
    if (!activeKey) activeKey = compId && stageId ? `${compId}||${stageId}` : "";

    renderBindInfo();

    if (!compId || !stageId || !activeKey) {
      if (withMsgs) setMsg("Нема активного етапу (settings/app).", false);
      return;
    }

    const s = await getOrCreateWeighingSettings();
    maxW = Number(s.data.maxW || DEFAULT_MAX_W);
    currentW = getCurrentWForZone(s.data);

    if (!viewW) viewW = 1;
    if (viewW > currentW) viewW = currentW;
    updateWButtons();

    const res = await loadTeamsForZone();
    const teams = res.rows;
    teamsArr = teams;
    teamsMap = teams.reduce((m, x) => ((m[x.teamId] = x), m), {});

    if (teamsCountEl) teamsCountEl.textContent = `Команд: ${teams.length}`;

    if (res.missingStageResults) {
      if (statusEl) statusEl.textContent = "⚠️ Нема stageResults для активного етапу.";
      if (teamsBox) {
        teamsBox.innerHTML =
          `<div class="muted">
            ❗ Не знайдено документ <b>stageResults/${esc(activeKey)}</b>.<br>
            Спочатку зроби жереб (створи stageResults з масивом teams із drawKey/drawZone/drawSector).
          </div>`;
      }
      if (weighCard) weighCard.style.display = "block";
      if (netBadge) netBadge.style.display = "inline-flex";
      setWMsg(`Активний етап є, але нема жеребу (stageResults).`, false);
      return;
    }

    if (statusEl) statusEl.textContent = teams.length ? "✅ Зона відкрита." : "⚠️ Команди не знайдені (перевір жереб у stageResults).";

    if (weighCard) weighCard.style.display = "block";
    if (netBadge) netBadge.style.display = "inline-flex";

    await preloadWeighings(teams);
    renderTable(teams);

    setWMsg(`Активна колонка: W${viewW}. Поточне: W${currentW}.`, true);
  }

  // ---------- settings/app watcher (LIVE) ----------
  let unsubApp = null;
  function watchApp() {
    if (unsubApp) unsubApp();

    unsubApp = db.collection("settings").doc("app").onSnapshot(
      async (snap) => {
        const app = snap.exists ? snap.data() || {} : {};

        // ✅ як Live
        readActiveIdsFromApp(app);
        activeKey = stageDocIdFromApp(app);

        // ✅ якщо stageId пустий — дорезолвимо з competitions
        if (compId && !stageId) {
          await resolveStageIdIfMissing();
          // якщо activeKey теж був пустий — зберемо тут
          if (!activeKey && compId && stageId) activeKey = `${compId}||${stageId}`;
        }

        renderBindInfo();

        if (!compId || !stageId || !activeKey) {
          if (statusEl) statusEl.textContent = "❌ Нема активного етапу.";
          if (weighCard) weighCard.style.display = "none";
          return;
        }

        // якщо вже відкрита зона — оновлюємо
        if (weighCard && weighCard.style.display !== "none" && zone) {
          try {
            await openZone(false);
          } catch (e) {
            setWMsg("Помилка оновлення етапу: " + (e?.message || e), false);
          }
        }
      },
      () => {
        if (statusEl) statusEl.textContent = "❌ Не читається settings/app.";
      }
    );
  }

  // ---------- init ----------
  (async function init() {
    try {
      await waitFirebase();
      db = window.scDb;
      const auth = window.scAuth;

      function updateOnline() {
        if (!netBadge) return;
        const on = navigator.onLine;
        netBadge.style.display = "inline-flex";
        netBadge.textContent = on ? "● online" : "● offline";
        netBadge.style.opacity = on ? "1" : ".55";
      }
      window.addEventListener("online", updateOnline);
      window.addEventListener("offline", updateOnline);
      updateOnline();

      const zUrl = zoneFromUrl();
      if (zUrl) writeBindZone(zUrl);

      const bind = readBindZone();
      zone = bind?.zone ? String(bind.zone).toUpperCase() : "";
      renderBindInfo();

      btnOpen?.addEventListener("click", async () => {
        try {
          setMsg("");
          await openZone(true);
        } catch (e) {
          console.error(e);
          setMsg("❌ " + (e?.message || e), false);
        }
      });

      btnReset?.addEventListener("click", () => {
        clearBindZone();
        zone = "";
        teamsArr = [];
        teamsMap = {};
        if (weighCard) weighCard.style.display = "none";
        renderBindInfo();
        setMsg("✅ Привʼязку зони скинуто. Відкрий QR з ?zone=A/B/C.", true);
      });

      wBtns.forEach((b) => {
        b.el?.addEventListener("click", async () => {
          try {
            if (b.n > currentW) return;
            viewW = b.n;
            updateWButtons();
            renderTable(teamsArr || []);
            setWMsg(`Активна колонка: W${viewW}. Поточне: W${currentW}.`, true);
          } catch (e) {
            console.error(e);
          }
        });
      });

      auth.onAuthStateChanged(async (user) => {
        try {
          if (!user) {
            me = null;
            if (authPill) authPill.textContent = "auth: ❌ увійди (суддя)";
            if (statusEl) statusEl.textContent = "Потрібен вхід судді/адміна.";
            if (weighCard) weighCard.style.display = "none";
            return;
          }

          const r = await requireJudgeOrAdmin(user);
          if (!r.ok) {
            me = null;
            if (authPill) authPill.textContent = "auth: ❌ немає доступу";
            if (statusEl) statusEl.textContent = "Нема доступу (потрібен judge/admin).";
            if (weighCard) weighCard.style.display = "none";
            return;
          }

          me = user;

          const label = user.uid === ADMIN_UID || r.role === "admin" ? "адміністратор" : "суддя";
          if (authPill) authPill.textContent = `auth: ✅ ${label}`;

          watchApp();

          if (zone) {
            try {
              await openZone(false);
            } catch (e) {
              console.error(e);
            }
          } else {
            if (statusEl) statusEl.textContent = "Зона не привʼязана. Відкрий посилання ?zone=A або скинь і зайди з QR.";
          }
        } catch (e) {
          console.error(e);
          if (statusEl) statusEl.textContent = "❌ Помилка авторизації/прав доступу.";
        }
      });
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = "❌ " + (err?.message || err);
      setMsg("❌ " + (err?.message || err), false);
    }
  })();
})();

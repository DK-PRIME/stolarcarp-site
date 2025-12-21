// assets/js/draw_firebase.js
// STOLAR CARP • Admin draw (sector assignment)
// ✅ loads competitions -> stageSelect (value "compId||stageKey" or "compId||")
// ✅ loads ALL confirmed registrations, then filters locally (robust to different field names)
// ✅ assigns unique sectors A1..C8
// ✅ saves: drawKey, drawZone, drawSector, bigFishTotal, drawAt
// ✅ builds "sheet-like rows" data: Stage | Team | Sector | Zone | Big_Total
(function () {
  "use strict";

  const auth = window.scAuth;
  const db   = window.scDb;

  const stageSelect = document.getElementById("stageSelect");
  const qInput      = document.getElementById("q");
  const listNeed    = document.getElementById("listNeed");
  const listDone    = document.getElementById("listDone");
  const msgEl       = document.getElementById("msg");

  // optional (якщо захочеш додати в HTML кнопку/textarea)
  const exportBtn   = document.getElementById("exportDraw");   // <button id="exportDraw">Експорт</button>
  const exportBox   = document.getElementById("exportBox");    // <textarea id="exportBox"></textarea>

  if (!auth || !db || !window.firebase) {
    if (msgEl) msgEl.textContent = "Firebase init не завантажився.";
    return;
  }

  const SECTORS = (() => {
    const arr = [];
    ["A", "B", "C"].forEach((z) => {
      for (let i = 1; i <= 8; i++) arr.push(`${z}${i}`);
    });
    return arr;
  })();

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const setMsg = (text, ok = true) => {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.style.color = text ? (ok ? "#8fe39a" : "#ff6c6c") : "";
  };

  const fmtDT = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      return d ? d.toLocaleString("uk-UA") : "—";
    } catch {
      return "—";
    }
  };

  function parseStageValue(v) {
    const [compId, stageKeyRaw] = String(v || "").split("||");
    const comp = (compId || "").trim();
    const stage = (stageKeyRaw || "").trim();
    return { compId: comp, stageKey: stage ? stage : null };
  }

  async function requireAdmin(user) {
    const snap = await db.collection("users").doc(user.uid).get();
    const role = (snap.exists ? (snap.data() || {}).role : "") || "";
    return role === "admin";
  }

  // ----- Robust field getters (щоб жереб не ламався від назв полів) -----
  function getCompIdFromReg(x) {
    return (
      x.competitionId ||
      x.compId ||
      x.competition ||
      x.seasonId ||
      x.season ||
      x.eventCompetitionId ||
      ""
    );
  }

  function getStageIdFromReg(x) {
    // stageId може бути "", null, undefined — вважаємо як "нема"
    const v =
      x.stageId ||
      x.stageKey ||
      x.stage ||
      x.eventId ||
      x.eventKey ||
      x.roundId ||
      "";
    return String(v || "").trim() || null;
  }

  function normStr(v) {
    return String(v ?? "").trim();
  }

  function boolToNiTak(v) {
    return v ? "так" : "ні";
  }

  // --------- State ----------
  let currentUser = null;
  let isAdmin = false;

  let regsAllConfirmed = []; // all confirmed (raw + normalized)
  let regsFiltered = [];     // for selected comp/stage
  let usedSectorSet = new Set();

  // stage label map: "compId||stageKey" -> "STOLAR CARP · ... — Етап ..."
  let stageNameByKey = new Map();

  // dropdown items from competitions
  let competitionsFlat = []; // [{value,label}]

  // --------- Load competitions -> select + label map ----------
  async function loadStagesToSelect() {
    if (!stageSelect) return;

    stageSelect.innerHTML = `<option value="">Завантаження…</option>`;
    competitionsFlat = [];
    stageNameByKey = new Map();

    const snap = await db.collection("competitions").get();
    snap.forEach((docSnap) => {
      const c = docSnap.data() || {};
      const compId = docSnap.id;

      const brand = c.brand || "STOLAR CARP";
      const year = c.year || c.seasonYear || "";
      const compTitle = c.name || c.title || (year ? `Season ${year}` : compId);

      const eventsArr = Array.isArray(c.events) ? c.events : null;

      if (eventsArr && eventsArr.length) {
        eventsArr.forEach((ev, idx) => {
          const key = String(ev.key || ev.stageId || ev.id || `stage-${idx + 1}`);
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx + 1}`;
          const label = `${brand} · ${compTitle} — ${stageTitle}`;
          const value = `${compId}||${key}`;
          competitionsFlat.push({ value, label });
          stageNameByKey.set(value, label);
        });
      } else {
        const label = `${brand} · ${compTitle}`;
        const value = `${compId}||`;
        competitionsFlat.push({ value, label });
        stageNameByKey.set(value, label);
      }
    });

    competitionsFlat.sort((a, b) => a.label.localeCompare(b.label, "uk"));

    stageSelect.innerHTML =
      `<option value="">— Оберіть —</option>` +
      competitionsFlat
        .map((x) => `<option value="${escapeHtml(x.value)}">${escapeHtml(x.label)}</option>`)
        .join("");
  }

  function labelForSelectedStage() {
    const v = stageSelect?.value || "";
    return stageNameByKey.get(v) || v || "";
  }

  // --------- Load ALL confirmed registrations once ----------
  async function loadAllConfirmed() {
    setMsg("Завантаження підтверджених заявок…", true);

    // ВАЖЛИВО: тут тільки where(status=="confirmed"), без competitionId/stageId,
    // щоб не залежати від полів і не робити індекси під кожен кейс.
    const snap = await db.collection("registrations")
      .where("status", "==", "confirmed")
      .get();

    regsAllConfirmed = [];
    snap.forEach((d) => {
      const x = d.data() || {};
      regsAllConfirmed.push({
        _id: d.id,
        raw: x,

        teamName: x.teamName || x.team || x.name || "",
        captain: x.captain || x.captainName || "",
        phone: x.phone || x.captainPhone || "",
        createdAt: x.createdAt || null,

        compId: normStr(getCompIdFromReg(x)),
        stageId: getStageIdFromReg(x), // null якщо нема

        drawKey: normStr(x.drawKey || ""),
        drawZone: normStr(x.drawZone || ""),
        drawSector: x.drawSector ?? null,

        bigFishTotal: !!x.bigFishTotal
      });
    });

    setMsg("", true);
  }

  // --------- Filtering by selected comp/stage ----------
  function applyStageFilter() {
    const { compId, stageKey } = parseStageValue(stageSelect?.value || "");

    if (!compId) {
      regsFiltered = [];
      usedSectorSet = new Set();
      render();
      buildExportBox();
      return;
    }

    regsFiltered = regsAllConfirmed.filter((r) => {
      // comp must match
      if (normStr(r.compId) !== normStr(compId)) return false;

      // if stageKey selected -> require stage match
      if (stageKey) return normStr(r.stageId) === normStr(stageKey);

      // if stageKey not selected (oneoff) -> accept anything where stage is empty/null OR ignore stage entirely
      // (бо в oneoff в людей може бути stageId="", null, або взагалі нема)
      return true;
    });

    regsFiltered.sort((a, b) => (a.teamName || "").localeCompare(b.teamName || "", "uk"));

    buildUsedSectors();
    render();
    buildExportBox();
  }

  function buildUsedSectors() {
    usedSectorSet = new Set();
    regsFiltered.forEach((r) => {
      const key = normStr(r.drawKey);
      if (key) usedSectorSet.add(key);
    });
  }

  function filteredBySearch(arr) {
    const q = (qInput?.value || "").trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((r) => {
      const t = `${r.teamName || ""} ${r.phone || ""} ${r.captain || ""}`.toLowerCase();
      return t.includes(q);
    });
  }

  // --------- UI ----------
  function sectorSelectHTML(current) {
    const cur = normStr(current);
    return `
      <select class="select sectorPick" style="max-width:160px;">
        <option value="">—</option>
        ${SECTORS.map((s) => {
          const taken = usedSectorSet.has(s) && s !== cur;
          return `<option value="${s}" ${cur === s ? "selected" : ""} ${taken ? "disabled" : ""}>
            ${s}${taken ? " (зайнято)" : ""}
          </option>`;
        }).join("")}
      </select>
    `;
  }

  function bigFishHTML(val) {
    const on = !!val;
    return `
      <label style="display:flex;gap:10px;align-items:center;cursor:pointer;">
        <input type="checkbox" class="bigFishChk" ${on ? "checked" : ""} />
        <span class="form__hint" style="margin:0;">BigFishTotal (платний)</span>
      </label>
    `;
  }

  function cardHTML(r) {
    const statusPill = r.drawKey ? "Призначено" : "Потрібно сектор";
    return `
      <div class="card" data-docid="${escapeHtml(r._id)}" style="padding:14px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;font-size:18px;">${escapeHtml(r.teamName || "—")}</div>
            <div class="form__hint" style="margin-top:2px;">
              Капітан: <b>${escapeHtml(r.captain || "—")}</b><br>
              Телефон: <b>${escapeHtml(r.phone || "—")}</b><br>
              Подано: ${escapeHtml(fmtDT(r.createdAt))}
            </div>
          </div>
          <span class="badge">${escapeHtml(statusPill)}</span>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:12px;">
          <div style="display:flex;gap:10px;align-items:center;">
            <span class="form__hint" style="margin:0;">Сектор:</span>
            ${sectorSelectHTML(r.drawKey || "")}
          </div>

          ${bigFishHTML(r.bigFishTotal)}

          <button class="btn btn--ghost saveBtn" type="button">Зберегти</button>
          ${r.drawKey ? `<button class="btn btn--danger clearBtn" type="button">Скинути</button>` : ``}
        </div>

        <div class="form__hint rowMsg" style="margin-top:10px;"></div>
      </div>
    `;
  }

  function render() {
    if (!listNeed || !listDone) return;

    const items = filteredBySearch(regsFiltered);
    const need = items.filter((x) => !normStr(x.drawKey));
    const done = items.filter((x) => !!normStr(x.drawKey));

    listNeed.innerHTML = need.length
      ? need.map(cardHTML).join("")
      : `<p class="form__hint">Нема команд для жеребкування.</p>`;

    listDone.innerHTML = done.length
      ? done.map(cardHTML).join("")
      : `<p class="form__hint">Поки нічого не призначено.</p>`;
  }

  function showRowMsg(wrap, text, ok = true) {
    const rowMsg = wrap.querySelector(".rowMsg");
    if (!rowMsg) return;
    rowMsg.textContent = text || "";
    rowMsg.style.color = text ? (ok ? "#8fe39a" : "#ff6c6c") : "";
  }

  // --------- Sheet-like rows (як у твоєму скріні) ----------
  // Колонки: Етап | Команда | Сектор | Зона | Big_Total
  function buildDrawRowsTSV() {
    const stageLabel = labelForSelectedStage();

    // беремо всі regsFiltered, навіть якщо сектор ще не призначений
    const rows = regsFiltered.map((r) => {
      const sector = normStr(r.drawKey);
      const zone = sector ? sector[0] : "";
      const big = boolToNiTak(!!r.bigFishTotal);
      return [stageLabel, r.teamName || "", sector, zone, big];
    });

    // TSV (tab-separated) — зручно вставляти в Google Sheets
    const header = ["Етап", "Команда", "Сектор", "Зона", "Big_Total"];
    const lines = [header, ...rows].map((arr) => arr.join("\t"));
    return lines.join("\n");
  }

  function buildExportBox() {
    if (!exportBox) return;
    exportBox.value = buildDrawRowsTSV();
  }

  async function copyExportToClipboard() {
    const tsv = buildDrawRowsTSV();
    try {
      await navigator.clipboard.writeText(tsv);
      setMsg("✅ Скопійовано для вставки в Google Sheets", true);
    } catch {
      // fallback
      if (exportBox) {
        exportBox.focus();
        exportBox.select();
        document.execCommand("copy");
        setMsg("✅ Скопійовано (fallback)", true);
      } else {
        setMsg("Не вдалося скопіювати. Додай textarea exportBox.", false);
      }
    }
  }

  // --------- Actions (delegation) ----------
  document.addEventListener("click", async (e) => {
    const saveBtn = e.target.closest(".saveBtn");
    const clearBtn = e.target.closest(".clearBtn");
    if (!saveBtn && !clearBtn) return;

    const wrap = e.target.closest("[data-docid]");
    if (!wrap) return;

    if (!isAdmin) {
      showRowMsg(wrap, "Нема адмін-доступу.", false);
      return;
    }

    const docId = wrap.getAttribute("data-docid");

    try {
      if (clearBtn) {
        await db.collection("registrations").doc(docId).update({
          drawZone: window.firebase.firestore.FieldValue.delete(),
          drawSector: window.firebase.firestore.FieldValue.delete(),
          drawKey: window.firebase.firestore.FieldValue.delete(),
          bigFishTotal: window.firebase.firestore.FieldValue.delete(),
          drawAt: window.firebase.firestore.FieldValue.delete()
        });

        // локально теж скинемо, щоб не чекати перезавантаження
        const r = regsAllConfirmed.find(x => x._id === docId);
        if (r) {
          r.drawKey = "";
          r.drawZone = "";
          r.drawSector = null;
        }
        showRowMsg(wrap, "Скинуто ✔", true);

        applyStageFilter();
        return;
      }

      // save
      const sectorVal = normStr(wrap.querySelector(".sectorPick")?.value || "");
      const bigFish = !!wrap.querySelector(".bigFishChk")?.checked;

      if (!sectorVal) {
        showRowMsg(wrap, "Оберіть сектор (A1…C8).", false);
        return;
      }

      // перевірка дубля
      if (usedSectorSet.has(sectorVal)) {
        const other = regsFiltered.find((r) => normStr(r.drawKey) === sectorVal && r._id !== docId);
        if (other) {
          showRowMsg(wrap, `Сектор ${sectorVal} вже зайнятий: ${other.teamName}`, false);
          return;
        }
      }

      const zone = sectorVal[0];
      const sectorNum = parseInt(sectorVal.slice(1), 10);

      await db.collection("registrations").doc(docId).update({
        drawZone: zone,
        drawSector: Number.isFinite(sectorNum) ? sectorNum : null,
        drawKey: sectorVal,
        bigFishTotal: bigFish,
        drawAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      // локальне оновлення
      const r = regsAllConfirmed.find(x => x._id === docId);
      if (r) {
        r.drawKey = sectorVal;
        r.drawZone = zone;
        r.drawSector = Number.isFinite(sectorNum) ? sectorNum : null;
        r.bigFishTotal = bigFish;
      }

      showRowMsg(wrap, "Збережено ✔", true);
      applyStageFilter();
    } catch (err) {
      console.error(err);
      showRowMsg(wrap, "Помилка збереження (Rules/доступ).", false);
    }
  });

  // Export click
  exportBtn?.addEventListener("click", async () => {
    await copyExportToClipboard();
  });

  // --------- Boot ----------
  async function boot() {
    auth.onAuthStateChanged(async (user) => {
      currentUser = user || null;
      setMsg("");

      if (!user) {
        setMsg("Увійдіть як адмін.", false);
        if (stageSelect) stageSelect.innerHTML = `<option value="">Увійдіть як адмін</option>`;
        regsAllConfirmed = [];
        regsFiltered = [];
        usedSectorSet = new Set();
        render();
        buildExportBox();
        return;
      }

      try {
        isAdmin = await requireAdmin(user);
        if (!isAdmin) {
          setMsg("Доступ заборонено. Цей акаунт не є адміном.", false);
          regsAllConfirmed = [];
          regsFiltered = [];
          usedSectorSet = new Set();
          render();
          buildExportBox();
          return;
        }

        await loadStagesToSelect();
        await loadAllConfirmed();

        setMsg("Оберіть змагання/етап.", true);
      } catch (e) {
        console.error(e);
        setMsg("Помилка завантаження даних/перевірки адміна.", false);
      }
    });

    stageSelect?.addEventListener("change", () => {
      applyStageFilter();
    });

    qInput?.addEventListener("input", () => {
      render();
    });
  }

  boot();
})();

// assets/js/draw_firebase.js
// Admin • Draw (sector assignment)
// - списки: need sector / assigned
// - unique sector A1..C8
// - BigFishTotal flag
(function () {
  "use strict";

  const auth = window.scAuth;
  const db   = window.scDb;

  const stageSelect = document.getElementById("stageSelect");
  const qInput      = document.getElementById("q");
  const listNeed    = document.getElementById("listNeed");
  const listDone    = document.getElementById("listDone");
  const msgEl       = document.getElementById("msg");

  if (!auth || !db || !window.firebase) {
    if (msgEl) msgEl.textContent = "Firebase init не завантажився.";
    return;
  }

  const SECTORS = (() => {
    const arr = [];
    ["A","B","C"].forEach(z => {
      for (let i=1;i<=8;i++) arr.push(`${z}${i}`);
    });
    return arr;
  })();

  let currentUser = null;
  let isAdmin = false;

  let competitionsFlat = []; // [{value, label}]
  let regs = [];             // registrations for selected stage
  let usedSectorSet = new Set();

  function setMsg(text, ok=true){
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.style.color = text ? (ok ? "#8fe39a" : "#ff6c6c") : "";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDT(ts){
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    if (!d) return "—";
    return d.toLocaleString("uk-UA");
  }

  async function requireAdmin(user){
    const snap = await db.collection("users").doc(user.uid).get();
    const role = (snap.exists ? (snap.data()||{}).role : "") || "";
    return role === "admin";
  }

  function parseStageValue(v){
    // "compId||stageKey"
    const [compId, stageKeyRaw] = String(v||"").split("||");
    return { compId: (compId||"").trim(), stageKey: (stageKeyRaw||"").trim() || null };
  }

  async function loadStagesToSelect(){
    stageSelect.innerHTML = `<option value="">Завантаження…</option>`;
    competitionsFlat = [];

    const snap = await db.collection("competitions").get();
    snap.forEach(docSnap => {
      const c = docSnap.data() || {};
      const compId = docSnap.id;

      const brand = c.brand || "STOLAR CARP";
      const year  = c.year || c.seasonYear || "";
      const compTitle = c.name || c.title || (year ? `Season ${year}` : compId);

      const eventsArr = Array.isArray(c.events) ? c.events : null;

      if (eventsArr && eventsArr.length) {
        eventsArr.forEach((ev, idx) => {
          const key = ev.key || ev.stageId || ev.id || `stage-${idx+1}`;
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx+1}`;
          const label = `${brand} · ${compTitle} — ${stageTitle}`;
          competitionsFlat.push({ value: `${compId}||${key}`, label });
        });
      } else {
        const label = `${brand} · ${compTitle}`;
        competitionsFlat.push({ value: `${compId}||`, label });
      }
    });

    competitionsFlat.sort((a,b)=>a.label.localeCompare(b.label,"uk"));

    stageSelect.innerHTML =
      `<option value="">— Оберіть —</option>` +
      competitionsFlat.map(x => `<option value="${escapeHtml(x.value)}">${escapeHtml(x.label)}</option>`).join("");
  }

  function buildUsedSectors(){
    usedSectorSet = new Set();
    regs.forEach(r => {
      const key = (r.drawKey || "").trim();
      if (key) usedSectorSet.add(key);
    });
  }

  function filteredRegs(){
    const q = (qInput?.value || "").trim().toLowerCase();
    if (!q) return regs;
    return regs.filter(r => {
      const t = `${r.teamName||""} ${r.phone||""} ${r.captain||""}`.toLowerCase();
      return t.includes(q);
    });
  }

  function sectorSelectHTML(current){
    // current: "A4" or ""
    const cur = (current || "").trim();
    return `
      <select class="select sectorPick" style="max-width:160px;">
        <option value="">—</option>
        ${SECTORS.map(s => {
          const taken = usedSectorSet.has(s) && s !== cur;
          return `<option value="${s}" ${cur===s?"selected":""} ${taken?"disabled":""}>${s}${taken?" (зайнято)":""}</option>`;
        }).join("")}
      </select>
    `;
  }

  function bigFishHTML(val){
    const on = !!val;
    return `
      <label style="display:flex;gap:10px;align-items:center;cursor:pointer;">
        <input type="checkbox" class="bigFishChk" ${on?"checked":""} />
        <span class="form__hint" style="margin:0;">BigFishTotal (платний)</span>
      </label>
    `;
  }

  function cardHTML(r){
    const statusPill = r.drawKey ? "Призначено" : "Потрібно сектор";
    const statusClass = r.drawKey ? "badge" : "badge";
    return `
      <div class="card" style="padding:14px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;font-size:18px;">${escapeHtml(r.teamName || "—")}</div>
            <div class="form__hint" style="margin-top:2px;">
              Капітан: <b>${escapeHtml(r.captain || "—")}</b><br>
              Телефон: <b>${escapeHtml(r.phone || "—")}</b><br>
              Подано: ${escapeHtml(fmtDT(r.createdAt))}
            </div>
          </div>
          <span class="${statusClass}">${escapeHtml(statusPill)}</span>
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

  function render(){
    if (!listNeed || !listDone) return;

    const items = filteredRegs();
    const need = items.filter(x => !x.drawKey);
    const done = items.filter(x => !!x.drawKey);

    listNeed.innerHTML = need.length ? need.map(cardHTML).join("") : `<p class="form__hint">Немає команд для жеребкування.</p>`;
    listDone.innerHTML = done.length ? done.map(cardHTML).join("") : `<p class="form__hint">Поки нічого не призначено.</p>`;

    // bind events
    [...document.querySelectorAll(".card")].forEach((cardEl, idx) => {
      const saveBtn = cardEl.querySelector(".saveBtn");
      const clearBtn = cardEl.querySelector(".clearBtn");
      const sectorSel = cardEl.querySelector(".sectorPick");
      const bigFishChk = cardEl.querySelector(".bigFishChk");
      const rowMsg = cardEl.querySelector(".rowMsg");

      // find reg by teamName+createdAt? краще через data-id — тому поставимо нижче:
    });

    // Вішай події через делегування:
  }

  function attachDelegation(){
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(".saveBtn, .clearBtn");
      if (!btn) return;

      const card = e.target.closest(".card");
      if (!card) return;

      // витягнемо teamName з DOM і знайдемо реєстрацію по унікальному id
      // Тому: при рендері додамо data-docid у wrapper. (внесемо тут швидко)
    });
  }

  // Перерендер з data-docid (щоб все було точно)
  function cardHTML2(r){
    return `<div class="card" data-docid="${escapeHtml(r._id)}" style="padding:14px;">${cardHTML(r).replace(/^<div class="card" style="padding:14px;">|<\/div>$/g,"")}</div>`;
  }

  function render2(){
    if (!listNeed || !listDone) return;

    const items = filteredRegs();
    const need = items.filter(x => !x.drawKey);
    const done = items.filter(x => !!x.drawKey);

    listNeed.innerHTML = need.length ? need.map(cardHTML2).join("") : `<p class="form__hint">Немає команд для жеребкування.</p>`;
    listDone.innerHTML = done.length ? done.map(cardHTML2).join("") : `<p class="form__hint">Поки нічого не призначено.</p>`;
  }

  document.addEventListener("click", async (e) => {
    const saveBtn = e.target.closest(".saveBtn");
    const clearBtn = e.target.closest(".clearBtn");
    if (!saveBtn && !clearBtn) return;

    const wrap = e.target.closest("[data-docid]");
    if (!wrap) return;

    const docId = wrap.getAttribute("data-docid");
    const rowMsg = wrap.querySelector(".rowMsg");

    const showRowMsg = (t, ok=true) => {
      if (!rowMsg) return;
      rowMsg.textContent = t || "";
      rowMsg.style.color = t ? (ok ? "#8fe39a" : "#ff6c6c") : "";
    };

    try {
      if (clearBtn) {
        await db.collection("registrations").doc(docId).update({
          drawZone: window.firebase.firestore.FieldValue.delete(),
          drawSector: window.firebase.firestore.FieldValue.delete(),
          drawKey: window.firebase.firestore.FieldValue.delete(),
          bigFishTotal: window.firebase.firestore.FieldValue.delete(),
          drawAt: window.firebase.firestore.FieldValue.delete()
        });
        showRowMsg("Скинуто ✔", true);
        await loadRegistrations(); // refresh
        return;
      }

      // save
      const sectorVal = (wrap.querySelector(".sectorPick")?.value || "").trim();
      const bigFish = !!wrap.querySelector(".bigFishChk")?.checked;

      if (!sectorVal) {
        showRowMsg("Оберіть сектор (A1…C8).", false);
        return;
      }

      // перевірка дубля (на всяк)
      if (usedSectorSet.has(sectorVal)) {
        // якщо це не той самий документ
        const other = regs.find(r => r.drawKey === sectorVal && r._id !== docId);
        if (other) {
          showRowMsg(`Сектор ${sectorVal} вже зайнятий командою: ${other.teamName}`, false);
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

      showRowMsg("Збережено ✔", true);
      await loadRegistrations(); // refresh
    } catch (err) {
      console.error(err);
      showRowMsg("Помилка збереження (Rules/доступ).", false);
    }
  });

  async function loadRegistrations(){
    const v = stageSelect.value;
    const { compId, stageKey } = parseStageValue(v);
    if (!compId) {
      regs = [];
      usedSectorSet = new Set();
      render2();
      return;
    }

    setMsg("Завантаження команд…", true);

    try {
      // Беремо лише paid
      let query = db.collection("registrations")
        .where("competitionId", "==", compId)
        .where("status", "==", "paid");

      // stageId може бути null або строка
      if (stageKey) query = query.where("stageId", "==", stageKey);
      else query = query.where("stageId", "==", null);

      const snap = await query.get();

      regs = [];
      snap.forEach(d => {
        const x = d.data() || {};
        regs.push({
          _id: d.id,
          teamName: x.teamName || "",
          captain: x.captain || "",
          phone: x.phone || "",
          createdAt: x.createdAt || null,

          drawZone: x.drawZone || "",
          drawSector: x.drawSector || null,
          drawKey: x.drawKey || "",

          bigFishTotal: !!x.bigFishTotal
        });
      });

      regs.sort((a,b) => (a.teamName||"").localeCompare(b.teamName||"uk"));

      buildUsedSectors();
      render2();
      setMsg("", true);
    } catch (e) {
      console.error(e);
      regs = [];
      usedSectorSet = new Set();
      render2();
      setMsg("Не вдалося завантажити (Rules/доступ).", false);
    }
  }

  async function boot(){
    auth.onAuthStateChanged(async (user) => {
      currentUser = user || null;
      setMsg("");

      if (!user) {
        setMsg("Увійдіть як адмін.", false);
        stageSelect.innerHTML = `<option value="">Увійдіть як адмін</option>`;
        regs = [];
        render2();
        return;
      }

      try {
        isAdmin = await requireAdmin(user);
        if (!isAdmin) {
          setMsg("Доступ заборонено. Цей акаунт не є адміном.", false);
          regs = [];
          render2();
          return;
        }

        await loadStagesToSelect();
        setMsg("Оберіть змагання/етап.", true);
      } catch (e) {
        console.error(e);
        setMsg("Помилка перевірки адміна.", false);
      }
    });

    stageSelect.addEventListener("change", async () => {
      await loadRegistrations();
    });

    qInput?.addEventListener("input", () => render2());
  }

  boot();
})();

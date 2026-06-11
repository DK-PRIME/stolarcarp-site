// assets/js/meal_orders.js
// STOLAR CARP • Харчування 2 доби

(function () {
  "use strict";

  let ctx = window.scMealContext || null;
  let currentUser = null;
  let userTeamId = "";
  let canManageMeals = false;
  let mealIsOpen = false;

  const FOOD_OWNER_UID = "T1BNuXaDM2f2Tf8KZosgFlAGmTu1";
  const PAID_STATUSES = ["confirmed", "paid", "payment_confirmed"];

  const $ = id => document.getElementById(id);

  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[m]));

  const norm = v => String(v ?? "").trim();

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function safeId(v) {
    return String(v || "").replace(/[\/#?\[\]]/g, "_");
  }

  function orderId(compId, stageId, teamId) {
    return safeId(`${compId}__${stageId}__${teamId}`);
  }

  function mealSettingsId() {
    if (!ctx?.competitionId || !ctx?.stageId) return "";
    return safeId(`${ctx.competitionId}__${ctx.stageId}`);
  }

  function setStatus(text, ok = true) {
    const el = $("mealStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "mealStatus " + (text ? (ok ? "ok" : "err") : "");
  }

  function setPopupStatus(text, ok = true) {
    const el = $("mealPopupStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "mealStatus " + (text ? (ok ? "ok" : "err") : "");
  }

  function openPopup(title, html) {
    if ($("mealPopupTitle")) $("mealPopupTitle").textContent = title;
    if ($("mealPopupBody")) $("mealPopupBody").innerHTML = html;
    if ($("mealPopup")) $("mealPopup").style.display = "flex";
  }

  function closePopup() {
    if ($("mealPopup")) $("mealPopup").style.display = "none";
  }

  async function waitReady() {
    if (window.scReady) await window.scReady;
    if (!window.scDb || !window.scAuth || !window.firebase) {
      throw new Error("Firebase не готовий");
    }
    return { db: window.scDb, auth: window.scAuth, fb: window.firebase };
  }

  async function getAuthUser() {
    const { auth } = await waitReady();

    if (auth.currentUser) return auth.currentUser;

    return new Promise(resolve => {
      const unsub = auth.onAuthStateChanged(user => {
        unsub();
        resolve(user || null);
      });
    });
  }

  async function loadUserData() {
    const { db } = await waitReady();

    currentUser = await getAuthUser();

    if (!currentUser) {
      userTeamId = "";
      canManageMeals = false;
      return;
    }

    const snap = await db.collection("users").doc(currentUser.uid).get();
    const u = snap.exists ? (snap.data() || {}) : {};

    userTeamId = norm(u.teamId || u.currentTeamId || "");
    canManageMeals = currentUser.uid === FOOD_OWNER_UID;
  }

  async function loadMealGate() {
    const { db } = await waitReady();
    const id = mealSettingsId();

    if (!id) {
      mealIsOpen = false;
      return false;
    }

    const snap = await db.collection("mealSettings").doc(id).get();
    const d = snap.exists ? (snap.data() || {}) : {};

    mealIsOpen = d.isOpen === true;
    return mealIsOpen;
  }

  async function setMealGate(isOpen) {
    const { db, fb } = await waitReady();
    const id = mealSettingsId();

    if (!id) throw new Error("Нема competitionId/stageId");

    await db.collection("mealSettings").doc(id).set({
      competitionId: ctx.competitionId,
      stageId: ctx.stageId,
      isOpen: !!isOpen,
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser ? currentUser.uid : ""
    }, { merge: true });

    mealIsOpen = !!isOpen;
  }

  function applyVisibility() {
    const openWrap = $("mealOpenWrap");
    const mealBox = $("mealBox");
    const orderBtn = $("btnOpenMealOrder");
    const listBtn = $("btnOpenMealList");
    const clearBtn = $("btnClearMealOrders");

    if (openWrap) openWrap.hidden = mealIsOpen || !canManageMeals;
    if (mealBox) mealBox.hidden = !mealIsOpen;

    if (orderBtn) orderBtn.hidden = !mealIsOpen;
    if (listBtn) listBtn.hidden = !mealIsOpen;
    if (clearBtn) clearBtn.hidden = !(mealIsOpen && canManageMeals);

    if (!mealIsOpen) setStatus("");
    if (mealIsOpen) setStatus("Харчування відкрите.", true);
  }

  function getMainPaidTeams() {
    if (!ctx || !Array.isArray(ctx.teams)) return [];

    const maxTeams = Number(ctx.maxTeams || 21);

    return ctx.teams
      .filter(t => PAID_STATUSES.includes(norm(t.status).toLowerCase()))
      .slice(0, maxTeams);
  }

  function getMyTeam() {
    const mainPaidTeams = getMainPaidTeams();

    if (userTeamId) {
      const byTeamId = mainPaidTeams.find(t => norm(t.teamId) === userTeamId);
      if (byTeamId) return byTeamId;
    }

    if (currentUser) {
      const byUid = mainPaidTeams.find(t => norm(t.uid) === currentUser.uid);
      if (byUid) return byUid;
    }

    return null;
  }

  function teamDrawKey(t) {
    const z = norm(t.drawZone || t.zone).toUpperCase();
    const s = norm(t.drawSector || t.sector);
    return norm(t.drawKey) || (z && s ? `${z}${s}` : "");
  }

  function totalOrder(o) {
    return (
      num(o?.day1?.lunch) +
      num(o?.day1?.dinner) +
      num(o?.day1?.breakfast) +
      num(o?.day2?.lunch) +
      num(o?.day2?.dinner) +
      num(o?.day2?.breakfast)
    );
  }

  async function readMyOrder(team) {
    const { db } = await waitReady();
    const id = orderId(ctx.competitionId, ctx.stageId, team.teamId);
    const snap = await db.collection("mealOrders").doc(id).get();
    return snap.exists ? (snap.data() || {}) : null;
  }

  function orderFormHtml(team, old) {
    const d1 = old?.day1 || {};
    const d2 = old?.day2 || {};
    const note = old?.note || "";

    return `
      <div class="mealDayTitle">Команда: ${esc(team.teamName || "—")} · ${esc(teamDrawKey(team) || "сектор не вказано")}</div>

      <div class="mealDayTitle">Доба 1</div>
      <div class="mealGrid">
        <div class="mealField"><label>Обід</label><input id="mealD1Lunch" type="number" min="0" max="20" value="${esc(d1.lunch || 0)}"></div>
        <div class="mealField"><label>Вечеря</label><input id="mealD1Dinner" type="number" min="0" max="20" value="${esc(d1.dinner || 0)}"></div>
        <div class="mealField"><label>Сніданок</label><input id="mealD1Breakfast" type="number" min="0" max="20" value="${esc(d1.breakfast || 0)}"></div>
      </div>

      <div class="mealDayTitle">Доба 2</div>
      <div class="mealGrid">
        <div class="mealField"><label>Обід</label><input id="mealD2Lunch" type="number" min="0" max="20" value="${esc(d2.lunch || 0)}"></div>
        <div class="mealField"><label>Вечеря</label><input id="mealD2Dinner" type="number" min="0" max="20" value="${esc(d2.dinner || 0)}"></div>
        <div class="mealField"><label>Сніданок</label><input id="mealD2Breakfast" type="number" min="0" max="20" value="${esc(d2.breakfast || 0)}"></div>
      </div>

      <div class="mealField">
        <label>Коментар</label>
        <textarea id="mealNote" placeholder="Наприклад: без цибулі, без мʼяса тощо">${esc(note)}</textarea>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
        <button class="mealBtn mealBtn--primary" id="btnSaveMealOrder" type="button">Зберегти заявку</button>
        <button class="mealBtn" id="btnCloseMealPopup" type="button">Закрити</button>
      </div>

      <div class="mealStatus" id="mealPopupStatus"></div>
    `;
  }

  async function openOrder() {
    try {
      await loadUserData();
      await loadMealGate();
      applyVisibility();

      if (!mealIsOpen) return;

      if (!currentUser) {
        setStatus("Увійди в кабінет, щоб подати заявку.", false);
        return;
      }

      const team = getMyTeam();

      if (!team) {
        setStatus("Заявку можуть подати тільки оплачені команди основного списку.", false);
        return;
      }

      const old = await readMyOrder(team);

      openPopup("🍽 Заявка на харчування", orderFormHtml(team, old));

      if ($("btnCloseMealPopup")) $("btnCloseMealPopup").onclick = closePopup;
      if ($("btnSaveMealOrder")) $("btnSaveMealOrder").onclick = () => saveOrder(team);

    } catch (e) {
      console.error(e);
      setStatus("Помилка відкриття заявки: " + (e.message || e), false);
    }
  }

  async function saveOrder(team) {
    try {
      const { db, fb } = await waitReady();

      const day1 = {
        lunch: num($("mealD1Lunch")?.value),
        dinner: num($("mealD1Dinner")?.value),
        breakfast: num($("mealD1Breakfast")?.value)
      };

      const day2 = {
        lunch: num($("mealD2Lunch")?.value),
        dinner: num($("mealD2Dinner")?.value),
        breakfast: num($("mealD2Breakfast")?.value)
      };

      const data = {
        competitionId: ctx.competitionId,
        stageId: ctx.stageId,
        teamId: team.teamId,
        teamName: team.teamName || "—",
        zone: norm(team.drawZone || team.zone).toUpperCase(),
        sector: norm(team.drawSector || team.sector),
        drawKey: teamDrawKey(team),
        day1,
        day2,
        note: norm($("mealNote")?.value),
        uid: currentUser.uid,
        status: totalOrder({ day1, day2 }) > 0 ? "submitted" : "empty",
        updatedAt: fb.firestore.FieldValue.serverTimestamp(),
        createdAt: fb.firestore.FieldValue.serverTimestamp()
      };

      const id = orderId(ctx.competitionId, ctx.stageId, team.teamId);
      await db.collection("mealOrders").doc(id).set(data, { merge: true });

      setPopupStatus("✅ Заявку збережено.", true);
      setStatus("✅ Заявку на харчування збережено.", true);

    } catch (e) {
      console.error(e);
      setPopupStatus("❌ " + (e.message || e), false);
    }
  }

  function sortOrders(a, b) {
    const zOrder = { A: 1, B: 2, C: 3 };
    const za = zOrder[String(a.zone || "").toUpperCase()] || 9;
    const zb = zOrder[String(b.zone || "").toUpperCase()] || 9;

    if (za !== zb) return za - zb;

    const sa = Number(a.sector || 999);
    const sb = Number(b.sector || 999);

    if (sa !== sb) return sa - sb;

    return String(a.teamName || "").localeCompare(String(b.teamName || ""), "uk");
  }

  async function loadOrders() {
    const { db } = await waitReady();

    const snap = await db.collection("mealOrders")
      .where("competitionId", "==", ctx.competitionId)
      .where("stageId", "==", ctx.stageId)
      .get();

    const rows = [];

    snap.forEach(doc => {
      const d = doc.data() || {};
      if (d.status !== "submitted") return;
      if (totalOrder(d) <= 0) return;
      rows.push(d);
    });

    rows.sort(sortOrders);
    return rows;
  }

  function listHtml(rows) {
    if (!rows.length) return `<div class="team-loading">Заявок на харчування ще немає.</div>`;

    const totals = { d1l:0, d1d:0, d1b:0, d2l:0, d2d:0, d2b:0 };

    const body = rows.map(r => {
      const d1 = r.day1 || {};
      const d2 = r.day2 || {};

      const d1l = num(d1.lunch);
      const d1d = num(d1.dinner);
      const d1b = num(d1.breakfast);
      const d2l = num(d2.lunch);
      const d2d = num(d2.dinner);
      const d2b = num(d2.breakfast);

      totals.d1l += d1l;
      totals.d1d += d1d;
      totals.d1b += d1b;
      totals.d2l += d2l;
      totals.d2d += d2d;
      totals.d2b += d2b;

      const sector = r.drawKey || ((r.zone || "") + (r.sector || "")) || "—";

      return `
        <tr>
          <td class="m-sector">${esc(sector)}</td>
          <td class="m-team">${esc(r.teamName || "—")}</td>
          <td>${d1l || ""}</td>
          <td>${d1d || ""}</td>
          <td>${d1b || ""}</td>
          <td>${d2l || ""}</td>
          <td>${d2d || ""}</td>
          <td>${d2b || ""}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="mealScreenTableWrap">
        <table class="mealScreenTable">
          <thead>
            <tr>
              <th>С</th>
              <th>Команда</th>
              <th>1О</th>
              <th>1В</th>
              <th>1С</th>
              <th>2О</th>
              <th>2В</th>
              <th>2С</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr>
              <td colspan="2">Разом</td>
              <td>${totals.d1l}</td>
              <td>${totals.d1d}</td>
              <td>${totals.d1b}</td>
              <td>${totals.d2l}</td>
              <td>${totals.d2d}</td>
              <td>${totals.d2b}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  async function openList() {
    try {
      await loadUserData();
      await loadMealGate();
      applyVisibility();

      if (!mealIsOpen) return;

      openPopup("🍽 Харчування", `<div class="team-loading">Завантаження…</div>`);

      const rows = await loadOrders();
      if ($("mealPopupBody")) $("mealPopupBody").innerHTML = listHtml(rows);

    } catch (e) {
      console.error(e);
      openPopup("Помилка", `<div class="team-loading">❌ ${esc(e.message || e)}</div>`);
    }
  }

  async function openMeals() {
    try {
      await loadUserData();

      if (!canManageMeals) return;

      await setMealGate(true);
      await loadMealGate();
      applyVisibility();

    } catch (e) {
      console.error(e);
      setStatus("Помилка відкриття харчування: " + (e.message || e), false);
    }
  }

  async function clearOrders() {
    try {
      await loadUserData();

      if (!canManageMeals) {
        setStatus("Очищення недоступне.", false);
        return;
      }

      if (!confirm("Точно видалити всі заявки і закрити харчування?")) return;

      const { db } = await waitReady();

      const snap = await db.collection("mealOrders")
        .where("competitionId", "==", ctx.competitionId)
        .where("stageId", "==", ctx.stageId)
        .get();

      let batch = db.batch();
      let count = 0;
      let total = 0;

      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        count++;
        total++;

        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }

      if (count > 0) await batch.commit();

      await setMealGate(false);
      await loadMealGate();

      closePopup();
      applyVisibility();

      setStatus(`✅ Заявки видалено: ${total}`, true);

    } catch (e) {
      console.error(e);
      setStatus("Помилка очищення: " + (e.message || e), false);
    }
  }

  async function refreshAdminButtons() {
    try {
      await loadUserData();
      await loadMealGate();
      applyVisibility();

      if ($("btnMealGateOpen")) $("btnMealGateOpen").onclick = openMeals;
      if ($("btnOpenMealOrder")) $("btnOpenMealOrder").onclick = openOrder;
      if ($("btnOpenMealList")) $("btnOpenMealList").onclick = openList;
      if ($("btnClearMealOrders")) $("btnClearMealOrders").onclick = clearOrders;

    } catch (e) {
      console.warn("[Meals] refresh error:", e);
      mealIsOpen = false;
      applyVisibility();
    }
  }

  function setContext(nextCtx) {
    ctx = nextCtx || ctx;
    refreshAdminButtons();
  }

  document.addEventListener("click", e => {
    if (e.target.id === "mealPopupClose") closePopup();
    if (e.target.id === "btnCloseMealPopup") closePopup();

    const popup = $("mealPopup");
    const content = $("mealPopupContent");

    if (popup?.style.display === "flex" && e.target === popup && !content?.contains(e.target)) {
      closePopup();
    }
  });

  window.scMeals = {
    setContext,
    openOrder,
    openList,
    clearOrders,
    refreshAdminButtons,
    loadMealGate,
    setMealGate,
    openMeals
  };

  if (ctx) setContext(ctx);

  setTimeout(() => {
    if (window.scMealContext) setContext(window.scMealContext);
  }, 800);
})();

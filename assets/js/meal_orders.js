// assets/js/meal_orders.js
// STOLAR CARP • Харчування 2 доби
// ✅ Харчування закрите за замовчуванням
// ✅ Відкрити / закрити харчування бачить тільки FOOD_OWNER_UID
// ✅ Подати / Список бачать всі тільки коли харчування відкрите
// ✅ Очистити харчування бачить тільки FOOD_OWNER_UID

(function () {
  "use strict";

  let ctx = window.scMealContext || null;
  let currentUser = null;
  let userTeamId = "";
  let canClearMeals = false;
  let mealIsOpen = false;

  const FOOD_OWNER_UID = "T1BNuXaDM2f2Tf8KZosgFlAGmTu1";

  const PAID_STATUSES = ["confirmed", "paid", "payment_confirmed"];

  const $ = id => document.getElementById(id);

  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
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
    const titleEl = $("mealPopupTitle");
    const bodyEl = $("mealPopupBody");
    const popupEl = $("mealPopup");

    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = html;
    if (popupEl) popupEl.style.display = "flex";
  }

  function closePopup() {
    const p = $("mealPopup");
    if (p) p.style.display = "none";
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
      canClearMeals = false;
      return;
    }

    const snap = await db.collection("users").doc(currentUser.uid).get();
    const u = snap.exists ? (snap.data() || {}) : {};

    userTeamId = norm(u.teamId || u.currentTeamId || "");
    canClearMeals = currentUser.uid === FOOD_OWNER_UID;
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
    try {
      const { db } = await waitReady();
      const id = orderId(ctx.competitionId, ctx.stageId, team.teamId);
      const snap = await db.collection("mealOrders").doc(id).get();
      return snap.exists ? (snap.data() || {}) : null;
    } catch (e) {
      console.warn("[Meals] readMyOrder skipped:", e.message || e);
      return null;
    }
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

      if (!mealIsOpen && !canClearMeals) {
        setStatus("Харчування ще закрите.", false);
        return;
      }

      if (!currentUser) {
        setStatus("Увійди в кабінет, щоб подати заявку.", false);
        return;
      }

      const team = getMyTeam();

      if (!team) {
        setStatus("Заявку на харчування можуть подати тільки оплачені команди основного списку.", false);
        return;
      }

      const old = await readMyOrder(team);

      openPopup("🍽 Заявка на харчування", orderFormHtml(team, old));

      const closeBtn = $("btnCloseMealPopup");
      const saveBtn = $("btnSaveMealOrder");

      if (closeBtn) closeBtn.onclick = closePopup;
      if (saveBtn) saveBtn.onclick = () => saveOrder(team);

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

      const z = norm(team.drawZone || team.zone).toUpperCase();
      const s = norm(team.drawSector || team.sector);
      const key = teamDrawKey(team);

      const data = {
        competitionId: ctx.competitionId,
        stageId: ctx.stageId,
        teamId: team.teamId,
        teamName: team.teamName || "—",
        zone: z,
        sector: s,
        drawKey: key,
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
    if (!rows.length) {
      return `<div class="team-loading">Заявок на харчування ще немає.</div>`;
    }

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
              <th>1дО</th>
              <th>1дВ</th>
              <th>1дС</th>
              <th>2дО</th>
              <th>2дВ</th>
              <th>2дС</th>
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

      if (!mealIsOpen && !canClearMeals) {
        setStatus("Список харчування ще закритий.", false);
        return;
      }

      openPopup("🍽 Харчування", `<div class="team-loading">Завантаження…</div>`);

      const rows = await loadOrders();
      const body = $("mealPopupBody");
      if (body) body.innerHTML = listHtml(rows);

    } catch (e) {
      console.error(e);
      openPopup("Помилка", `<div class="team-loading">❌ ${esc(e.message || e)}</div>`);
    }
  }

  async function clearOrders() {
    try {
      await loadUserData();

      if (!canClearMeals) {
        setStatus("Очищення недоступне.", false);
        return;
      }

      if (!confirm("Точно видалити всі заявки?")) return;

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

      setStatus(`✅ Видалено заявок: ${total}`, true);
      closePopup();

    } catch (e) {
      console.error(e);
      setStatus("Помилка очищення: " + (e.message || e), false);
    }
  }

  function findMealActionsContainer() {
    return document.querySelector(".mealActions") ||
           $("mealActions") ||
           $("mealBox") ||
           document.querySelector(".mealBox");
  }

  function findOrderBtn() {
    return $("btnOpenMealOrder") ||
           $("btnMealOrder") ||
           $("btnMealApply") ||
           document.querySelector("[data-meal-order]");
  }

  function findListBtn() {
    return $("btnOpenMealList") ||
           $("btnMealList") ||
           document.querySelector("[data-meal-list]");
  }

  function findClearBtn() {
    return $("btnClearMealOrders") ||
           $("btnClearMeals") ||
           document.querySelector("[data-meal-clear]");
  }

  async function refreshAdminButtons() {
    const orderBtn = findOrderBtn();
    const listBtn = findListBtn();
    const clearBtn = findClearBtn();

    try {
      await loadUserData();
      await loadMealGate();

      const isOwner = !!currentUser && currentUser.uid === FOOD_OWNER_UID;
      const actions = findMealActionsContainer();

      let toggleBtn = $("btnToggleMealGate");

      if (isOwner && !toggleBtn && actions) {
        toggleBtn = document.createElement("button");
        toggleBtn.id = "btnToggleMealGate";
        toggleBtn.type = "button";
        toggleBtn.className = "mealBtn mealBtn--primary";

        actions.prepend(toggleBtn);

        toggleBtn.onclick = async () => {
          try {
            await loadUserData();

            if (!currentUser || currentUser.uid !== FOOD_OWNER_UID) {
              setStatus("Керування харчуванням доступне тільки відповідальному.", false);
              return;
            }

            const next = !mealIsOpen;
            await setMealGate(next);
            await refreshAdminButtons();

            setStatus(
              next ? "✅ Харчування відкрито для всіх." : "✅ Харчування закрито.",
              true
            );

          } catch (e) {
            console.error(e);
            setStatus("Помилка зміни статусу харчування: " + (e.message || e), false);
          }
        };
      }

      toggleBtn = $("btnToggleMealGate");

      if (toggleBtn) {
        toggleBtn.hidden = !isOwner;
        toggleBtn.textContent = mealIsOpen
          ? "Закрити харчування"
          : "Відкрити харчування";
      }

      if (orderBtn) orderBtn.hidden = !mealIsOpen;
      if (listBtn) listBtn.hidden = !mealIsOpen;
      if (clearBtn) clearBtn.hidden = !isOwner;

      if (!mealIsOpen && !isOwner) {
        setStatus("Харчування ще закрите.", true);
      } else if (mealIsOpen) {
        setStatus("Харчування відкрите.", true);
      } else if (isOwner) {
        setStatus("Харчування закрите. Відкрий, коли потрібно.", true);
      }

    } catch (e) {
      console.warn("[Meals] refresh buttons error:", e);

      if (orderBtn) orderBtn.hidden = true;
      if (listBtn) listBtn.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
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
    setMealGate
  };

  if (ctx) setContext(ctx);
})();

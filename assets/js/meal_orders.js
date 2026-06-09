// assets/js/meal_orders.js
// STOLAR CARP • Харчування 2 доби

(function () {
  "use strict";

  let ctx = window.scMealContext || null;
  let currentUser = null;
  let userTeamId = "";

  const $ = id => document.getElementById(id);

  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[m]));

  const norm = v => String(v ?? "").trim();

  const PAID_STATUSES = ["confirmed", "paid", "payment_confirmed"];

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function orderId(compId, stageId, teamId) {
    return `${compId}__${stageId}__${teamId}`.replace(/[\/#?\[\]]/g, "_");
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
    $("mealPopupTitle").textContent = title;
    $("mealPopupBody").innerHTML = html;
    $("mealPopup").style.display = "flex";
  }

  function closePopup() {
    const p = $("mealPopup");
    if (p) p.style.display = "none";
  }

  async function waitReady() {
    if (window.scReady) await window.scReady;
    if (!window.scDb || !window.scAuth) throw new Error("Firebase не готовий");
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
      return;
    }

    const snap = await db.collection("users").doc(currentUser.uid).get();
    const u = snap.exists ? (snap.data() || {}) : {};

    userTeamId = norm(u.teamId || u.currentTeamId || "");
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

      $("btnCloseMealPopup").onclick = closePopup;
      $("btnSaveMealOrder").onclick = () => saveOrder(team);

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
    if (!rows.length) return `<div class="team-loading">Заявок на харчування ще немає.</div>`;

    const totals = { d1l:0, d1d:0, d1b:0, d2l:0, d2d:0, d2b:0 };

    const body = rows.map(r => {
      const d1 = r.day1 || {};
      const d2 = r.day2 || {};

      totals.d1l += num(d1.lunch);
      totals.d1d += num(d1.dinner);
      totals.d1b += num(d1.breakfast);
      totals.d2l += num(d2.lunch);
      totals.d2d += num(d2.dinner);
      totals.d2b += num(d2.breakfast);

      return `
        <tr>
          <td><b>${esc(r.drawKey || ((r.zone || "") + (r.sector || "")) || "—")}</b></td>
          <td class="teamCell">${esc(r.teamName || "—")}</td>
          <td>${num(d1.lunch)}</td>
          <td>${num(d1.dinner)}</td>
          <td>${num(d1.breakfast)}</td>
          <td>${num(d2.lunch)}</td>
          <td>${num(d2.dinner)}</td>
          <td>${num(d2.breakfast)}</td>
          <td>${esc(r.note || "")}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="mealTableWrap">
        <table class="mealTable">
          <thead>
            <tr>
              <th>Сектор</th>
              <th>Команда</th>
              <th>Д1 Обід</th>
              <th>Д1 Вечеря</th>
              <th>Д1 Сніданок</th>
              <th>Д2 Обід</th>
              <th>Д2 Вечеря</th>
              <th>Д2 Сніданок</th>
              <th>Коментар</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>

      <div class="mealTotals">
        Разом:<br>
        Доба 1 — Обід: ${totals.d1l}, Вечеря: ${totals.d1d}, Сніданок: ${totals.d1b}<br>
        Доба 2 — Обід: ${totals.d2l}, Вечеря: ${totals.d2d}, Сніданок: ${totals.d2b}
      </div>
    `;
  }

  async function openList() {
    try {
      openPopup("🍽 Список заявок на харчування", `<div class="team-loading">Завантаження…</div>`);

      const rows = await loadOrders();
      $("mealPopupBody").innerHTML = listHtml(rows);

    } catch (e) {
      console.error(e);
      openPopup("Помилка", `<div class="team-loading">❌ ${esc(e.message || e)}</div>`);
    }
  }

  function clearOrders() {
    setStatus("Очищення заявок буде в адмінці.", false);
  }

  function refreshAdminButtons() {
    const listBtn = $("btnOpenMealList");
    const clearBtn = $("btnClearMealOrders");

    if (listBtn) listBtn.hidden = false;
    if (clearBtn) clearBtn.hidden = true;
  }

  function setContext(nextCtx) {
    ctx = nextCtx || ctx;
    refreshAdminButtons();
  }

  document.addEventListener("click", e => {
    if (e.target.id === "mealPopupClose") closePopup();

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
    refreshAdminButtons
  };

  if (ctx) setContext(ctx);
})();

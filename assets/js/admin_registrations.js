// assets/js/admin_registrations.js
// STOLAR CARP • Admin registrations
// ✅ confirm / cancel / DELETE (archive -> delete), filters, search
// ✅ After CONFIRM: hide confirmed from list (doesn't delete)
// ✅ After finishAt + 24h: hide ALL registrations for that stage/event
// ✅ Archive uses fresh doc + removes undefined recursively to avoid Firestore errors
// ✅ MIRROR: confirm/cancel/delete синхронить public_participants (щоб participation.html бачив оплату)

(function () {
  const auth = window.scAuth;
  const db = window.scDb;

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2"; // твій адмін UID (як у rules)

  const msgEl = document.getElementById("msg");
  const listEl = document.getElementById("list");
  const statusFilter = document.getElementById("statusFilter");
  const qInput = document.getElementById("q");

  if (!auth || !db || !window.firebase) {
    if (msgEl) msgEl.textContent = "Firebase init не завантажився.";
    return;
  }

  const GRACE_HOURS_AFTER_FINISH = 24;
  const GRACE_MS = GRACE_HOURS_AFTER_FINISH * 60 * 60 * 1000;

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const fmtTs = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      return d ? d.toLocaleString("uk-UA") : "—";
    } catch {
      return "—";
    }
  };

  const setMsg = (text, ok = true) => {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.style.color = text ? (ok ? "#7CFFB2" : "#ff6c6c") : "";
  };

  function showError(prefix, e) {
    console.error(prefix, e);
    const t = `${prefix}: ${e?.code ? e.code + " " : ""}${e?.message || e}`;
    setMsg(t, false);
  }

  // ✅ прибирає undefined рекурсивно (Firestore не дозволяє undefined)
  function stripUndefinedDeep(v) {
    if (Array.isArray(v)) {
      return v.map(stripUndefinedDeep).filter((x) => x !== undefined);
    }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const out = {};
      Object.keys(v).forEach((k) => {
        const cleaned = stripUndefinedDeep(v[k]);
        if (cleaned !== undefined) out[k] = cleaned;
      });
      return out;
    }
    return v === undefined ? undefined : v;
  }

  function toDateMaybe(x) {
    if (!x) return null;
    try {
      if (x instanceof Date) return x;
      if (typeof x === "string") {
        const d = new Date(x);
        return isFinite(d.getTime()) ? d : null;
      }
      if (x && typeof x.toDate === "function") return x.toDate(); // Firestore Timestamp
    } catch {}
    return null;
  }

  function now() {
    return new Date();
  }

  function norm(v) { return String(v ?? "").trim(); }

  let currentUser = null;
  let isAdminByRules = false;
  let isAdminByRole = false;

  // map: "compId||stageId" -> label
  let stageNameByKey = new Map();

  // map: "compId||stageId" -> endAt(Date|null)
  let stageEndAtByKey = new Map();

  async function loadCompetitionsMap() {
    stageNameByKey = new Map();
    stageEndAtByKey = new Map();

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
          const stageId = String(ev.key || ev.stageId || ev.id || `stage-${idx + 1}`);
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx + 1}`;

          const key = `${compId}||${stageId}`;
          stageNameByKey.set(key, `${brand} · ${compTitle} — ${stageTitle}`);

          const endRaw = ev.finishAt || ev.finishDate || ev.endAt || ev.endDate || null;
          stageEndAtByKey.set(key, toDateMaybe(endRaw));
        });
      } else {
        // одноразове без events[]
        const key = `${compId}||`;
        stageNameByKey.set(key, `${brand} · ${compTitle}`);

        const endRaw = c.endAt || c.endDate || c.finishAt || c.finishDate || null;
        stageEndAtByKey.set(key, toDateMaybe(endRaw));
      }
    });
  }

  function getStageKeyFromReg(r) {
    return `${r.competitionId || ""}||${r.stageId || ""}`;
  }

  function getStageLabel(r) {
    const key = getStageKeyFromReg(r);
    return stageNameByKey.get(key) || key;
  }

  function isFinishedAndExpired(r) {
    const key = getStageKeyFromReg(r);
    const endAt = stageEndAtByKey.get(key) || null;
    if (!endAt) return false; // якщо нема endAt — не ховаємо
    return now().getTime() > (endAt.getTime() + GRACE_MS);
  }

  function matchQuery(r, q) {
    if (!q) return true;
    const hay = [
      r.teamName,
      r.participantName, // для SOLO
      r.captain,
      r.phone,
      r.competitionId,
      r.stageId,
      r.status,
      r._id
    ].join(" ").toLowerCase();
    return hay.includes(q);
  }

  function badgeForStatus(status) {
    const s = status || "unknown";
    const label =
      s === "pending_payment" ? "Очікує оплату" :
      s === "confirmed" ? "Підтверджено" :
      s === "cancelled" ? "Скасовано" :
      s;

    const style = 
      s === "confirmed" ? "background:rgba(124,255,178,.12);border-color:rgba(124,255,178,.35);" :
      s === "pending_payment" ? "background:rgba(255,204,0,.10);border-color:rgba(255,204,0,.35);" :
      "background:rgba(255,108,108,.10);border-color:rgba(255,108,108,.35);";

    return { label, style };
  }

  function ensureAdmin() {
    if (!isAdminByRules) {
      setMsg("Нема адмін-доступу за правилами (UID).", false);
      return false;
    }
    return true;
  }

  // ✅ mirror helper: синхронізує public_participants
  // ВАЖЛИВО: docId public_participants == docId registrations (r._id)
  function pubRefFor(id){ return db.collection("public_participants").doc(String(id)); }
  function regRefFor(id){ return db.collection("registrations").doc(String(id)); }

  function render(regs) {
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!regs.length) {
    listEl.innerHTML = `<div class="form__hint">Нема заявок по цьому фільтру.</div>`;
    return;
  }

  // 🟡 ГРУПУВАННЯ ПО ЕТАПАХ
  const groups = {};

  regs.forEach(r => {
    const key = `${r.competitionId || ""}||${r.stageId || ""}`;
    const label = stageNameByKey.get(key) || `Етап: ${r.stageId || "main"}`;

    if (!groups[label]) groups[label] = [];
    groups[label].push(r);
  });

  // 🔥 ВИВОДИМО ГРУПАМИ
  Object.keys(groups).forEach(label => {
    const group = groups[label];

    // Заголовок групи
    const h = document.createElement("div");
    h.style.cssText = "padding:12px 4px;font-size:18px;font-weight:700;color:#ffc300;";
    h.textContent = `${label} (${group.length})`;
    listEl.appendChild(h);

    // Виведення кожної заявки
    group.forEach(r => {
      const { label: statusLabel, style: badgeStyle } = badgeForStatus(r.status);

      const titleMain =
        r.teamName ? r.teamName :
        (r.participantName ? r.participantName : "Без назви");

      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "14px";

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:900;font-size:16px;line-height:1.25;">
              ${escapeHtml(titleMain)}
            </div>
            <div class="form__hint" style="margin-top:4px;">
              ${escapeHtml(label)}
            </div>
          </div>

          <span class="badge" style="${badgeStyle}">
            ${escapeHtml(statusLabel)}
          </span>
        </div>

        <div class="form__hint" style="margin-top:10px;">
          Капітан: <b>${escapeHtml(r.captain || "—")}</b><br>
          Телефон: <b>${escapeHtml(r.phone || "—")}</b><br>
          Подано: <b>${escapeHtml(fmtTs(r.createdAt))}</b>
          ${r.confirmedAt ? `<br>Підтверджено: <b>${escapeHtml(fmtTs(r.confirmedAt))}</b>` : ""}
          ${r.cancelledAt ? `<br>Скасовано: <b>${escapeHtml(fmtTs(r.cancelledAt))}</b>` : ""}
          <br>ID: <span style="opacity:.7;">${escapeHtml(r._id || "—")}</span>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn--primary" data-act="confirm" ${String(r.status) === "confirmed" ? "disabled" : ""}>Підтвердити оплату</button>
          <button class="btn btn--ghost" data-act="cancel" ${String(r.status) === "cancelled" ? "disabled" : ""}>Скасувати</button>
          <button class="btn btn--danger" data-act="delete">Видалити заявку</button>
        </div>
      `;

      listEl.appendChild(card);
    });
  });
}

  let unsub = null;
  let allRegs = [];

  function applyFiltersAndRender() {
    const sfRaw = (statusFilter?.value || "all");
    const sf = String(sfRaw || "all").toLowerCase();

    const q = (qInput?.value || "").trim().toLowerCase();

    const filtered = allRegs
      .filter((r) => !isFinishedAndExpired(r))
      .filter((r) => {
        const st = String(r.status || "").toLowerCase();

        if (sf === "confirmed") return st === "confirmed";

        if (sf === "all") {
          // ✅ щоб не заважали: confirmed ховаємо у "all"
          return st !== "confirmed";
        }

        return st === sf;
      })
      .filter((r) => matchQuery(r, q));

    render(filtered);
  }

  function watchRegistrations() {
    if (unsub) unsub();

    unsub = db.collection("registrations")
      .orderBy("createdAt", "desc")
      .onSnapshot((snap) => {
        allRegs = [];
        snap.forEach((d) => allRegs.push({ _id: d.id, ...(d.data() || {}) }));
        // 🔥 Правильне сортування напряму в allRegs
// 1) confirmed → по confirmedAt (старші зверху)
// 2) pending → по createdAt
// 3) cancelled → внизу
allRegs.sort((a, b) => {
  const order = { confirmed: 1, pending_payment: 2, cancelled: 3 };
  const A = order[a.status] || 99;
  const B = order[b.status] || 99;

  if (A !== B) return A - B;

  // confirmed — сортуємо по confirmedAt ↑
  if (A === 1) {
    const tA = a.confirmedAt?.toMillis?.() || 0;
    const tB = b.confirmedAt?.toMillis?.() || 0;
    return tA - tB;
  }

  // pending — по createdAt ↑
  if (A === 2) {
    const tA = a.createdAt?.toMillis?.() || 0;
    const tB = b.createdAt?.toMillis?.() || 0;
    return tA - tB;
  }

  return 0;
});
        applyFiltersAndRender();
      }, (err) => {
        console.error(err);
        setMsg("Не вдалося завантажити заявки.", false);
      });
  }

  statusFilter?.addEventListener("change", applyFiltersAndRender);
  qInput?.addEventListener("input", applyFiltersAndRender);

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    if (!user) {
      setMsg("Увійдіть як адмін, щоб бачити заявки.", false);
      return;
    }

    try {
      const uSnap = await db.collection("users").doc(user.uid).get();
      const role = (uSnap.data() || {}).role || "";
      isAdminByRole = role === "admin";

      isAdminByRules = user.uid === ADMIN_UID;

      if (!isAdminByRole && !isAdminByRules) {
        setMsg("Доступ заборонено: цей акаунт не адмін.", false);
        return;
      }

      setMsg(
        isAdminByRules
          ? "Адмін-доступ ✅"
          : "Увага: role=admin, але rules дозволяють адмін-доступ лише основному UID.",
        !!isAdminByRules
      );

      await loadCompetitionsMap();
      watchRegistrations();
    } catch (e) {
      console.error(e);
      setMsg("Помилка перевірки доступу/даних.", false);
    }
  });
})();

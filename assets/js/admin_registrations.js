// assets/js/admin_registrations.js
// STOLAR CARP • Admin registrations
// confirm / cancel / DELETE (archive -> delete), filters, search
// FIX: archive uses fresh doc + removes undefined recursively to avoid Firestore errors

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
      return v
        .map(stripUndefinedDeep)
        .filter((x) => x !== undefined);
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

  let currentUser = null;
  let isAdminByRules = false;
  let isAdminByRole = false;

  // map: "compId||stageId" -> "STOLAR CARP · ... — Етап ..."
  let stageNameByKey = new Map();

  async function loadCompetitionsMap() {
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
          const stageId = String(ev.key || ev.stageId || ev.id || `stage-${idx + 1}`);
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx + 1}`;
          const key = `${compId}||${stageId}`;
          stageNameByKey.set(key, `${brand} · ${compTitle} — ${stageTitle}`);
        });
      } else {
        const key = `${compId}||`;
        stageNameByKey.set(key, `${brand} · ${compTitle}`);
      }
    });
  }

  function getStageLabel(r) {
    const key = `${r.competitionId || ""}||${r.stageId || ""}`;
    return stageNameByKey.get(key) || key;
  }

  function matchQuery(r, q) {
    if (!q) return true;
    const hay = [
      r.teamName,
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

  function render(regs) {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!regs.length) {
      listEl.innerHTML = `<div class="form__hint">Нема заявок по цьому фільтру.</div>`;
      return;
    }

    regs.forEach((r) => {
      const { label: statusLabel, style: badgeStyle } = badgeForStatus(r.status);

      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "14px";

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:900;font-size:16px;line-height:1.25;">
              ${escapeHtml(r.teamName || "Без назви")}
            </div>
            <div class="form__hint" style="margin-top:4px;">
              ${escapeHtml(getStageLabel(r))}
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
          <button class="btn btn--primary" data-act="confirm" ${r.status === "confirmed" ? "disabled" : ""}>Підтвердити оплату</button>
          <button class="btn btn--ghost" data-act="cancel" ${r.status === "cancelled" ? "disabled" : ""}>Скасувати</button>
          <button class="btn btn--danger" data-act="delete">Видалити заявку</button>
        </div>
      `;

      const btnConfirm = card.querySelector('[data-act="confirm"]');
      const btnCancel  = card.querySelector('[data-act="cancel"]');
      const btnDelete  = card.querySelector('[data-act="delete"]');

      btnConfirm?.addEventListener("click", async () => {
        if (!ensureAdmin()) return;
        if (!confirm(`Підтвердити оплату для "${r.teamName}"?`)) return;

        try {
          setMsg("Підтверджую...", true);
          await db.collection("registrations").doc(r._id).update({
            status: "confirmed",
            confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
            confirmedBy: currentUser.uid
          });
          setMsg("Оплату підтверджено ✅", true);
        } catch (e) {
          showError("Помилка підтвердження", e);
        }
      });

      btnCancel?.addEventListener("click", async () => {
        if (!ensureAdmin()) return;
        if (!confirm(`Скасувати заявку "${r.teamName}"?`)) return;

        try {
          setMsg("Скасовую...", true);
          await db.collection("registrations").doc(r._id).update({
            status: "cancelled",
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelledBy: currentUser.uid
          });
          setMsg("Заявку скасовано ✅", true);
        } catch (e) {
          showError("Помилка скасування", e);
        }
      });

      // ✅ DELETE (archive -> delete) через fresh read + stripUndefinedDeep
      btnDelete?.addEventListener("click", async () => {
        if (!ensureAdmin()) return;

        const warn =
          `ТОЧНО видалити заявку?\n\n` +
          `Команда: ${r.teamName || "—"}\n` +
          `Етап: ${getStageLabel(r)}\n\n` +
          `Я збережу копію в registrations_deleted і тоді видалю.`;

        if (!confirm(warn)) return;

        try {
          setMsg("Видаляю...", true);

          const regRef = db.collection("registrations").doc(r._id);

          // 1) беремо свіжі дані з бази (а не UI-об’єкт)
          const freshSnap = await regRef.get();
          if (!freshSnap.exists) {
            setMsg("Заявка вже видалена/не існує.", false);
            return;
          }

          const freshData = stripUndefinedDeep(freshSnap.data() || {});
          const batch = db.batch();

          // 2) архів
          batch.set(
            db.collection("registrations_deleted").doc(r._id),
            stripUndefinedDeep({
              ...freshData,
              originalRegId: r._id,
              deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
              deletedBy: currentUser.uid
            }),
            { merge: true }
          );

          // 3) видалення
          batch.delete(regRef);

          await batch.commit();
          setMsg("Заявку видалено ✅ (копія збережена)", true);
        } catch (e) {
          showError("Помилка видалення", e);
        }
      });

      listEl.appendChild(card);
    });
  }

  let unsub = null;
  let allRegs = [];

  function applyFiltersAndRender() {
    const sf = (statusFilter?.value || "all");
    const q  = (qInput?.value || "").trim().toLowerCase();

    const filtered = allRegs
      .filter((r) => (sf === "all" ? true : (r.status === sf)))
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
      // UI role
      const uSnap = await db.collection("users").doc(user.uid).get();
      const role = (uSnap.data() || {}).role || "";
      isAdminByRole = role === "admin";

      // rules admin (по UID)
      isAdminByRules = user.uid === ADMIN_UID;

      if (!isAdminByRole && !isAdminByRules) {
        setMsg("Доступ заборонено: цей акаунт не адмін.", false);
        return;
      }

      setMsg(isAdminByRules ? "Адмін-доступ ✅" : "Увага: role=admin, але rules дозволяють адмін-доступ лише основному UID.", !!isAdminByRules);

      await loadCompetitionsMap();
      watchRegistrations();
    } catch (e) {
      console.error(e);
      setMsg("Помилка перевірки доступу/даних.", false);
    }
  });
})();

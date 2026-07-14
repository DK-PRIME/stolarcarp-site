// assets/js/admin_registrations.js
// STOLAR CARP • Admin registrations
// ✅ confirm / cancel / delete / restore
// ✅ mirror public_participants
// ✅ grouped by competition (active / finished accordion)
// ✅ clean card layout (ID hidden in details)
// ✅ no inline styles, no emoji
// ✅ CSS injected automatically

(function () {
  "use strict";

  const CONFIG = {
    ADMIN_UID: "5Dt6fN64c3aWACYV1WacxV2BHDl2",
    GRACE_HOURS_AFTER_FINISH: 24,
    COLLECTIONS: {
      REGISTRATIONS: "registrations",
      COMPETITIONS: "competitions",
      USERS: "users",
      PUBLIC_PARTICIPANTS: "public_participants",
      REGISTRATIONS_DELETED: "registrations_deleted"
    }
  };

  const GRACE_MS = CONFIG.GRACE_HOURS_AFTER_FINISH * 60 * 60 * 1000;

  const CSS_ID = "sc-admin-registrations-styles";

  const CSS = `
/* ─── Registrations ────────────────────────────────────────────── */

.reg-section-header {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #888;
  padding: 20px 0 8px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 12px;
}

/* ─── Competition group ────────────────────────────────────────── */

.comp-group {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
}

.comp-group__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.comp-group__header:hover {
  background: rgba(255,255,255,0.03);
}

.comp-group__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: rgba(255,255,255,0.06);
  font-size: 11px;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.comp-group__header.is-collapsed .comp-group__arrow {
  transform: rotate(0deg);
}

.comp-group__header:not(.is-collapsed) .comp-group__arrow {
  transform: rotate(90deg);
}

.comp-group__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comp-group__badges {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}

.comp-group__badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 20px;
  font-weight: 600;
}

.comp-group__badge--pending {
  background: rgba(255,204,0,.12);
  color: #ffcc00;
}

.comp-group__badge--confirmed {
  background: rgba(124,255,178,.10);
  color: #7CFFB2;
}

.comp-group__badge--cancelled {
  background: rgba(255,108,108,.10);
  color: #ff6c6c;
}

.comp-group__count {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  padding: 3px 0;
}

.comp-group__body {
  padding: 0 12px 12px;
}

.comp-group__body.is-collapsed {
  display: none;
}

/* ─── Registration card ────────────────────────────────────────── */

.reg-card {
  padding: 14px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: border-color 0.15s, background 0.15s;
}

.reg-card:hover {
  border-color: rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
}

.reg-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.reg-card__info {
  min-width: 0;
  flex: 1;
}

.reg-card__title {
  font-weight: 800;
  font-size: 15px;
  line-height: 1.3;
  color: #fff;
}

.reg-card__meta {
  margin-top: 5px;
  font-size: 13px;
  color: #aaa;
  line-height: 1.5;
}

.reg-card__meta b {
  color: #ddd;
}

.reg-card__dates {
  margin-top: 4px;
  font-size: 12px;
  color: #666;
}

.reg-card__deleted-info {
  margin-top: 8px;
  color: #ff6c6c;
  font-size: 12px;
}

.reg-card__details {
  margin-top: 10px;
}

.reg-card__details summary {
  font-size: 11px;
  color: #666;
  cursor: pointer;
  user-select: none;
  list-style: none;
  display: inline-block;
  border-bottom: 1px dashed rgba(255,255,255,0.15);
}

.reg-card__details-content {
  margin-top: 8px;
  padding: 10px;
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
  font-size: 11px;
  color: #777;
  line-height: 1.8;
}

.reg-card__details-content code {
  color: #999;
}

.reg-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

/* ─── Badges ───────────────────────────────────────────────────── */

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge--confirmed {
  background: rgba(124,255,178,.12);
  border-color: rgba(124,255,178,.35);
  color: #7CFFB2;
}

.badge--pending {
  background: rgba(255,204,0,.10);
  border-color: rgba(255,204,0,.35);
  color: #ffcc00;
}

.badge--cancelled {
  background: rgba(255,108,108,.10);
  border-color: rgba(255,108,108,.35);
  color: #ff6c6c;
}

.badge--deleted {
  background: rgba(255,108,108,.13);
  border-color: rgba(255,108,108,.5);
  color: #ff6c6c;
}

/* ─── Buttons ──────────────────────────────────────────────────── */

.btn--sm {
  font-size: 12px;
  padding: 6px 14px;
}

/* ─── Empty state ──────────────────────────────────────────────── */

.reg-empty {
  padding: 40px 0;
  text-align: center;
}
`;

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const state = {
    currentUser: null,
    isAdminByRules: false,
    isAdminByRole: false,
    allRegs: [],
    allDeleted: [],
    stageNameByKey: new Map(),
    stageEndAtByKey: new Map(),
    stageOrderByKey: new Map(),
    unsubRegs: null,
    unsubDeleted: null
  };

  const els = {
    msg: document.getElementById("msg"),
    list: document.getElementById("list"),
    statusFilter: document.getElementById("statusFilter"),
    qInput: document.getElementById("q")
  };

  const auth = window.scAuth;
  const db = window.scDb;

  if (!auth || !db || !window.firebase) {
    if (els.msg) els.msg.textContent = "Firebase init не завантажився.";
    return;
  }

  injectStyles();

  if (els.statusFilter && !els.statusFilter.querySelector('option[value="deleted"]')) {
    const opt = document.createElement("option");
    opt.value = "deleted";
    opt.textContent = "Видалені";
    els.statusFilter.appendChild(opt);
  }

  const utils = {
    escapeHtml: (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;"),

    fmtTs: (ts) => {
      try {
        const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
        return d ? d.toLocaleString("uk-UA") : "—";
      } catch {
        return "—";
      }
    },

    fmtDateShort: (ts) => {
      try {
        const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
        return d ? d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
      } catch {
        return "—";
      }
    },

    setMsg: (text, ok = true) => {
      if (!els.msg) return;
      els.msg.textContent = text || "";
      els.msg.style.color = text ? (ok ? "#7CFFB2" : "#ff6c6c") : "";
    },

    showError: (prefix, e) => {
      console.error(prefix, e);
      utils.setMsg(`${prefix}: ${e?.code ? e.code + " " : ""}${e?.message || e}`, false);
    },

    stripUndefinedDeep: (v) => {
      if (Array.isArray(v)) {
        return v.map(utils.stripUndefinedDeep).filter((x) => x !== undefined);
      }

      if (v && typeof v === "object" && !(v instanceof Date)) {
        const out = {};
        Object.keys(v).forEach((k) => {
          const cleaned = utils.stripUndefinedDeep(v[k]);
          if (cleaned !== undefined) out[k] = cleaned;
        });
        return out;
      }

      return v === undefined ? undefined : v;
    },

    toDateMaybe: (x) => {
      if (!x) return null;
      try {
        if (x instanceof Date) return x;
        if (typeof x === "string") {
          const d = new Date(x);
          return isFinite(d.getTime()) ? d : null;
        }
        if (x && typeof x.toDate === "function") return x.toDate();
      } catch {}
      return null;
    },

    now: () => new Date(),

    getStageKey: (r) => `${r.competitionId || ""}||${r.stageId || ""}`,

    getStageLabel: (r) => {
      const key = utils.getStageKey(r);
      return state.stageNameByKey.get(key) || key;
    },

    isFinished: (r) => {
      const key = utils.getStageKey(r);
      const endAt = state.stageEndAtByKey.get(key) || null;
      if (!endAt) return false;
      return utils.now().getTime() > endAt.getTime();
    },

    isFinishedAndExpired: (r) => {
      if (r._deleted) return false;
      const key = utils.getStageKey(r);
      const endAt = state.stageEndAtByKey.get(key) || null;
      if (!endAt) return false;
      return utils.now().getTime() > (endAt.getTime() + GRACE_MS);
    },

    matchQuery: (r, q) => {
      if (!q) return true;
      const hay = [
        r.teamName,
        r.participantName,
        r.captain,
        r.phone,
        r.competitionId,
        r.stageId,
        r.status,
        r._id,
        r.originalRegId
      ].join(" ").toLowerCase();

      return hay.includes(q);
    },

    getStageOrder: (r) => {
      const key = utils.getStageKey(r);
      return state.stageOrderByKey.get(key) || 0;
    },

    badgeForStatus: (r) => {
      if (r._deleted) {
        return {
          label: "Видалено",
          cls: "badge--deleted"
        };
      }

      const s = r.status || "unknown";
      const label =
        s === "pending_payment" ? "Очікує оплату" :
        s === "confirmed" ? "Підтверджено" :
        s === "cancelled" ? "Скасовано" :
        s;

      const cls =
        s === "confirmed" ? "badge--confirmed" :
        s === "pending_payment" ? "badge--pending" :
        "badge--cancelled";

      return { label, cls };
    }
  };

  const firestore = {
    pubRef: (id) => db.collection(CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS).doc(String(id)),
    regRef: (id) => db.collection(CONFIG.COLLECTIONS.REGISTRATIONS).doc(String(id)),
    delRef: (id) => db.collection(CONFIG.COLLECTIONS.REGISTRATIONS_DELETED).doc(String(id)),

    loadCompetitionsMap: async () => {
      state.stageNameByKey = new Map();
      state.stageEndAtByKey = new Map();
      state.stageOrderByKey = new Map();

      const snap = await db.collection(CONFIG.COLLECTIONS.COMPETITIONS).get();

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

            state.stageNameByKey.set(key, `${brand} · ${compTitle} — ${stageTitle}`);
            state.stageOrderByKey.set(key, ev.order ?? ev.stageOrder ?? ev.index ?? (idx + 1));

            const endRaw = ev.finishAt || ev.finishDate || ev.endAt || ev.endDate || null;
            state.stageEndAtByKey.set(key, utils.toDateMaybe(endRaw));
          });
        } else {
          const key = `${compId}||`;
          state.stageNameByKey.set(key, `${brand} · ${compTitle}`);
          state.stageOrderByKey.set(key, 1);

          const endRaw = c.endAt || c.endDate || c.finishAt || c.finishDate || null;
          state.stageEndAtByKey.set(key, utils.toDateMaybe(endRaw));
        }
      });
    }
  };

  function cleanRestoredData(d, id) {
    const out = { ...(d || {}) };

    delete out.deletedAt;
    delete out.deletedBy;
    delete out.originalRegId;
    delete out._methodName;

    out.restoredAt = firebase.firestore.FieldValue.serverTimestamp();
    out.restoredBy = state.currentUser.uid;

    if (!out.status || out.status === "deleted") out.status = "confirmed";

    return utils.stripUndefinedDeep(out);
  }

  function publicMirrorData(data) {
    return utils.stripUndefinedDeep({
      uid: data.uid || null,
      competitionId: data.competitionId || null,
      stageId: data.stageId || null,
      entryType: data.entryType || "team",
      teamId: data.teamId || null,
      teamName: data.teamName || null,
      status: data.status || "confirmed",
      confirmedAt: data.confirmedAt || null,
      restoredAt: firebase.firestore.FieldValue.serverTimestamp(),
      restoredBy: state.currentUser.uid
    });
  }

  // ─── Grouping logic ─────────────────────────────────────────────

  function groupByCompetition(regs) {
    const groups = new Map();

    regs.forEach((r) => {
      const key = utils.getStageKey(r);
      const label = utils.getStageLabel(r);
      const isFinished = utils.isFinished(r);

      if (!groups.has(key)) {
        groups.set(key, { key, label, isFinished, regs: [] });
      }
      groups.get(key).regs.push(r);
    });

    return groups;
  }

  // ─── Render helpers ─────────────────────────────────────────────

  function createSectionHeader(title) {
    const h = document.createElement("div");
    h.className = "reg-section-header";
    h.textContent = title;
    return h;
  }

  function createCompGroup(g, isOpenDefault = true) {
    const wrapper = document.createElement("div");
    wrapper.className = "comp-group";

    const pendingCount = g.regs.filter(r => r.status === "pending_payment" && !r._deleted).length;
    const confirmedCount = g.regs.filter(r => r.status === "confirmed" && !r._deleted).length;
    const cancelledCount = g.regs.filter(r => r.status === "cancelled" && !r._deleted).length;

    const header = document.createElement("button");
    header.className = "comp-group__header";
    header.type = "button";
    header.innerHTML = `
      <span class="comp-group__arrow">▶</span>
      <span class="comp-group__title">${utils.escapeHtml(g.label)}</span>
      <span class="comp-group__badges">
        ${pendingCount ? `<span class="comp-group__badge comp-group__badge--pending">${pendingCount} очікує</span>` : ""}
        ${confirmedCount ? `<span class="comp-group__badge comp-group__badge--confirmed">${confirmedCount} підтверджено</span>` : ""}
        ${cancelledCount ? `<span class="comp-group__badge comp-group__badge--cancelled">${cancelledCount} скасовано</span>` : ""}
        <span class="comp-group__count">${g.regs.length} заявок</span>
      </span>
    `;

    const body = document.createElement("div");
    body.className = "comp-group__body";
    if (!isOpenDefault) body.classList.add("is-collapsed");

    const sortedRegs = [...g.regs].sort((a, b) => {
      const stA = a.status || "";
      const stB = b.status || "";
      if (stA === "pending_payment" && stB !== "pending_payment") return -1;
      if (stB === "pending_payment" && stA !== "pending_payment") return -1;
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt || 0);
      return dateB - dateA;
    });

    sortedRegs.forEach((r) => {
      body.appendChild(render.card(r));
    });

    header.addEventListener("click", () => {
      body.classList.toggle("is-collapsed");
      header.classList.toggle("is-collapsed");
    });

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    return wrapper;
  }

  // ─── Card sub-renderers ─────────────────────────────────────────

  function renderCardHeader(r, titleMain, applicantName) {
    const { label: statusLabel, cls: badgeCls } = utils.badgeForStatus(r);

    const header = document.createElement("div");
    header.className = "reg-card__header";

    const info = document.createElement("div");
    info.className = "reg-card__info";

    const title = document.createElement("div");
    title.className = "reg-card__title";
    title.textContent = titleMain;

    const meta = document.createElement("div");
    meta.className = "reg-card__meta";
    meta.innerHTML = `
      ${r.entryType === "solo" ? "SOLO" : "Команда"}
      · Заявник: <b>${utils.escapeHtml(applicantName)}</b>
      · ${utils.escapeHtml(r.phone || "—")}
    `;

    const dates = document.createElement("div");
    dates.className = "reg-card__dates";
    dates.innerHTML = `
      Подано: ${utils.escapeHtml(utils.fmtDateShort(r.createdAt))}
      ${r.confirmedAt ? `· Підтверджено: ${utils.escapeHtml(utils.fmtDateShort(r.confirmedAt))}` : ""}
    `;

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(dates);

    const badge = document.createElement("span");
    badge.className = `badge ${badgeCls}`;
    badge.textContent = statusLabel;

    header.appendChild(info);
    header.appendChild(badge);
    return header;
  }

  function renderCardDetails(r) {
    const details = document.createElement("details");
    details.className = "reg-card__details";

    const summary = document.createElement("summary");
    summary.textContent = "Службова інформація";

    const content = document.createElement("div");
    content.className = "reg-card__details-content";
    content.innerHTML = `
      ID заявки: <code>${utils.escapeHtml(r._id || "—")}</code><br>
      UID користувача: <code>${utils.escapeHtml(r.uid || "—")}</code><br>
      Змагання: <code>${utils.escapeHtml(r.competitionId || "—")}</code><br>
      Етап: <code>${utils.escapeHtml(r.stageId || "—")}</code><br>
      ${r.originalRegId ? `Оригінал: <code>${utils.escapeHtml(r.originalRegId)}</code><br>` : ""}
      ${r.cancelledAt ? `Скасовано: ${utils.escapeHtml(utils.fmtTs(r.cancelledAt))}<br>` : ""}
      ${r.restoredAt ? `Відновлено: ${utils.escapeHtml(utils.fmtTs(r.restoredAt))}<br>` : ""}
    `;

    details.appendChild(summary);
    details.appendChild(content);
    return details;
  }

  function renderCardButtons(r, titleMain) {
    const wrap = document.createElement("div");
    wrap.className = "reg-card__actions";

    if (r._deleted) {
      const btn = document.createElement("button");
      btn.className = "btn btn--primary btn--sm";
      btn.dataset.act = "restore";
      btn.textContent = "↩ Відновити";
      wrap.appendChild(btn);
      return wrap;
    }

    const btnConfirm = document.createElement("button");
    btnConfirm.className = "btn btn--primary btn--sm";
    btnConfirm.dataset.act = "confirm";
    btnConfirm.textContent = "Підтвердити";
    if (String(r.status) === "confirmed") btnConfirm.disabled = true;

    const btnCancel = document.createElement("button");
    btnCancel.className = "btn btn--ghost btn--sm";
    btnCancel.dataset.act = "cancel";
    btnCancel.textContent = "Скасувати";
    if (String(r.status) === "cancelled") btnCancel.disabled = true;

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn btn--danger btn--sm";
    btnDelete.dataset.act = "delete";
    btnDelete.textContent = "Видалити";

    wrap.appendChild(btnConfirm);
    wrap.appendChild(btnCancel);
    wrap.appendChild(btnDelete);
    return wrap;
  }

  function renderDeletedInfo(r) {
    if (!r._deleted) return null;
    const div = document.createElement("div");
    div.className = "reg-card__deleted-info";
    div.innerHTML = `Видалено: <b>${utils.escapeHtml(utils.fmtTs(r.deletedAt))}</b>`;
    return div;
  }

  // ─── Main render ────────────────────────────────────────────────

  const render = {
    card: (r) => {
      const titleMain = r.teamName ? r.teamName : (r.participantName ? r.participantName : "Без назви");
      const applicantName = r.entryType === "solo"
        ? (r.participantName || r.captain || "—")
        : (r.captain || "—");

      const card = document.createElement("div");
      card.className = "card reg-card";

      card.appendChild(renderCardHeader(r, titleMain, applicantName));

      const deletedInfo = renderDeletedInfo(r);
      if (deletedInfo) card.appendChild(deletedInfo);

      card.appendChild(renderCardDetails(r));

      const buttons = renderCardButtons(r, titleMain);
      card.appendChild(buttons);

      const btnConfirm = buttons.querySelector('[data-act="confirm"]');
      const btnCancel = buttons.querySelector('[data-act="cancel"]');
      const btnDelete = buttons.querySelector('[data-act="delete"]');
      const btnRestore = buttons.querySelector('[data-act="restore"]');

      btnRestore?.addEventListener("click", async () => {
        if (!state.isAdminByRules) {
          utils.setMsg("Нема адмін-доступу за правилами UID.", false);
          return;
        }

        if (!confirm(`Відновити заявку "${titleMain}" назад у registrations?`)) return;

        try {
          utils.setMsg("Відновлюю заявку...", true);

          const deletedSnap = await firestore.delRef(r._id).get();
          if (!deletedSnap.exists) {
            utils.setMsg("Архівний документ уже не існує.", false);
            return;
          }

          const deletedData = deletedSnap.data() || {};
          const restoredData = cleanRestoredData(deletedData, r._id);

          const batch = db.batch();

          batch.set(firestore.regRef(r._id), restoredData, { merge: true });
          batch.set(firestore.pubRef(r._id), publicMirrorData(restoredData), { merge: true });
          batch.delete(firestore.delRef(r._id));

          await batch.commit();

          utils.setMsg(`Заявку "${titleMain}" відновлено ✅`, true);

          if (els.statusFilter) els.statusFilter.value = "all";
        } catch (e) {
          utils.showError("Помилка відновлення", e);
        }
      });

      btnConfirm?.addEventListener("click", async () => {
        if (!state.isAdminByRules) {
          utils.setMsg("Нема адмін-доступу за правилами UID.", false);
          return;
        }

        if (!confirm(`Підтвердити оплату для "${titleMain}"?`)) return;

        try {
          utils.setMsg("Підтверджую...", true);

          const ts = firebase.firestore.FieldValue.serverTimestamp();
          const batch = db.batch();

          batch.set(firestore.regRef(r._id), {
            status: "confirmed",
            confirmedAt: ts,
            confirmedBy: state.currentUser.uid
          }, { merge: true });

          batch.set(firestore.pubRef(r._id), {
            status: "confirmed",
            confirmedAt: ts,
            confirmedBy: state.currentUser.uid
          }, { merge: true });

          await batch.commit();

          utils.setMsg("Оплату підтверджено ✅", true);
        } catch (e) {
          utils.showError("Помилка підтвердження", e);
        }
      });

      btnCancel?.addEventListener("click", async () => {
        if (!state.isAdminByRules) {
          utils.setMsg("Нема адмін-доступу за правилами UID.", false);
          return;
        }

        if (!confirm(`Скасувати заявку "${titleMain}"?`)) return;

        try {
          utils.setMsg("Скасовую...", true);

          const ts = firebase.firestore.FieldValue.serverTimestamp();
          const batch = db.batch();

          batch.set(firestore.regRef(r._id), {
            status: "cancelled",
            cancelledAt: ts,
            cancelledBy: state.currentUser.uid
          }, { merge: true });

          batch.set(firestore.pubRef(r._id), {
            status: "cancelled",
            cancelledAt: ts,
            cancelledBy: state.currentUser.uid
          }, { merge: true });

          await batch.commit();

          utils.setMsg("Заявку скасовано ✅", true);
        } catch (e) {
          utils.showError("Помилка скасування", e);
        }
      });

      btnDelete?.addEventListener("click", async () => {
        if (!state.isAdminByRules) {
          utils.setMsg("Нема адмін-доступу за правилами UID.", false);
          return;
        }

        const warn =
          `ТОЧНО видалити заявку?\n\n` +
          `Запис: ${titleMain}\n` +
          `Етап: ${utils.getStageLabel(r)}\n\n` +
          `Копія буде збережена в registrations_deleted.`;

        if (!confirm(warn)) return;

        try {
          utils.setMsg("Видаляю...", true);

          const regRef = firestore.regRef(r._id);
          const pubRef = firestore.pubRef(r._id);

          const freshSnap = await regRef.get();
          if (!freshSnap.exists) {
            utils.setMsg("Заявка вже видалена або не існує.", false);
            return;
          }

          const freshData = utils.stripUndefinedDeep(freshSnap.data() || {});
          const batch = db.batch();

          batch.set(
            firestore.delRef(r._id),
            utils.stripUndefinedDeep({
              ...freshData,
              originalRegId: r._id,
              deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
              deletedBy: state.currentUser.uid
            }),
            { merge: true }
          );

          batch.delete(regRef);
          batch.delete(pubRef);

          await batch.commit();
          utils.setMsg("Заявку видалено ✅", true);
        } catch (e) {
          utils.showError("Помилка видалення", e);
        }
      });

      return card;
    },

    list: (regs) => {
      if (!els.list) return;
      els.list.innerHTML = "";

      if (!regs.length) {
        els.list.innerHTML = `<div class="form__hint reg-empty">Нема заявок по цьому фільтру.</div>`;
        return;
      }

      const sf = String(els.statusFilter?.value || "all").toLowerCase();
      if (sf === "deleted") {
        regs.forEach((r) => {
          els.list.appendChild(render.card(r));
        });
        return;
      }

      const groups = groupByCompetition(regs);

      const activeGroups = [];
      const finishedGroups = [];

      groups.forEach((g) => {
        if (g.isFinished) finishedGroups.push(g);
        else activeGroups.push(g);
      });

      const sortGroups = (arr) => arr.sort((a, b) => {
        const oa = state.stageOrderByKey.get(a.key) || 0;
        const ob = state.stageOrderByKey.get(b.key) || 0;
        return oa - ob;
      });

      sortGroups(activeGroups);
      sortGroups(finishedGroups);

      if (activeGroups.length) {
        els.list.appendChild(createSectionHeader("Активні змагання"));
        activeGroups.forEach((g) => {
          els.list.appendChild(createCompGroup(g, true));
        });
      }

      if (finishedGroups.length) {
        els.list.appendChild(createSectionHeader("Завершені змагання"));
        finishedGroups.forEach((g) => {
          els.list.appendChild(createCompGroup(g, false));
        });
      }
    }
  };

  // ─── Filters ────────────────────────────────────────────────────

  const filters = {
    apply: () => {
      const sf = String(els.statusFilter?.value || "all").toLowerCase();
      const q = String(els.qInput?.value || "").trim().toLowerCase();

      let source = sf === "deleted" ? state.allDeleted : state.allRegs;

      let filtered = source
        .filter((r) => sf === "deleted" || !utils.isFinishedAndExpired(r))
        .filter((r) => {
          if (sf === "deleted") return true;

          const st = String(r.status || "").toLowerCase();

          if (sf === "all") return true;
          if (sf === "confirmed") return st === "confirmed";
          if (sf === "pending") return st === "pending_payment";
          if (sf === "cancelled") return st === "cancelled";
          return st === sf;
        })
        .filter((r) => utils.matchQuery(r, q));

      if (sf === "deleted") {
        filtered.sort((a, b) => {
          const da = a.deletedAt?.toDate ? a.deletedAt.toDate() : (a.deletedAt || 0);
          const db_ = b.deletedAt?.toDate ? b.deletedAt.toDate() : (b.deletedAt || 0);
          return db_ - da;
        });
      }

      render.list(filtered);
    }
  };

  // ─── Watchers ───────────────────────────────────────────────────

  const watchers = {
    registrations: () => {
      if (state.unsubRegs) state.unsubRegs();

      state.unsubRegs = db.collection(CONFIG.COLLECTIONS.REGISTRATIONS)
        .onSnapshot((snap) => {
          state.allRegs = [];
          snap.forEach((d) => state.allRegs.push({ _id: d.id, ...(d.data() || {}) }));
          filters.apply();
        }, (err) => {
          console.error(err);
          utils.setMsg("Не вдалося завантажити заявки.", false);
        });
    },

    deleted: () => {
      if (state.unsubDeleted) state.unsubDeleted();

      state.unsubDeleted = db.collection(CONFIG.COLLECTIONS.REGISTRATIONS_DELETED)
        .onSnapshot((snap) => {
          state.allDeleted = [];
          snap.forEach((d) => {
            state.allDeleted.push({
              _id: d.id,
              _deleted: true,
              ...(d.data() || {})
            });
          });
          filters.apply();
        }, (err) => {
          console.error(err);
          utils.setMsg("Не вдалося завантажити видалені заявки.", false);
        });
    }
  };

  function bindEvents() {
    els.statusFilter?.addEventListener("change", filters.apply);
    els.qInput?.addEventListener("input", filters.apply);
  }

  function initAuth() {
    auth.onAuthStateChanged(async (user) => {
      state.currentUser = user || null;
      utils.setMsg("");

      if (!user) {
        utils.setMsg("Увійдіть як адмін, щоб бачити заявки.", false);
        return;
      }

      try {
        const uSnap = await db.collection(CONFIG.COLLECTIONS.USERS).doc(user.uid).get();
        const role = (uSnap.data() || {}).role || "";

        state.isAdminByRole = role === "admin";
        state.isAdminByRules = user.uid === CONFIG.ADMIN_UID;

        if (!state.isAdminByRole && !state.isAdminByRules) {
          utils.setMsg("Доступ заборонено: цей акаунт не адмін.", false);
          return;
        }

        utils.setMsg(
          state.isAdminByRules
            ? "Адмін-доступ ✅"
            : "role=admin є, але Firestore rules дозволяють запис тільки основному UID.",
          !!state.isAdminByRules
        );

        await firestore.loadCompetitionsMap();

        watchers.registrations();
        watchers.deleted();
      } catch (e) {
        console.error(e);
        utils.setMsg("Помилка перевірки доступу/даних.", false);
      }
    });
  }

  bindEvents();
  initAuth();
})();

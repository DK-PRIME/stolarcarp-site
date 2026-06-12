// assets/js/admin_registrations.js
// STOLAR CARP • Admin registrations
// ✅ confirm / cancel / delete
// ✅ restore from registrations_deleted
// ✅ mirror public_participants
// ✅ filter deleted applications

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
          style: "background:rgba(255,108,108,.13);border-color:rgba(255,108,108,.5);"
        };
      }

      const s = r.status || "unknown";
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

  const render = {
    card: (r) => {
      const { label: statusLabel, style: badgeStyle } = utils.badgeForStatus(r);

      const titleMain =
        r.teamName ? r.teamName :
        (r.participantName ? r.participantName : "Без назви");

      const subLine =
        r.entryType === "solo"
          ? `SOLO · ${utils.escapeHtml(utils.getStageLabel(r))}`
          : utils.escapeHtml(utils.getStageLabel(r));

      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "14px";

      const deletedInfo = r._deleted
        ? `<br>Видалено: <b>${utils.escapeHtml(utils.fmtTs(r.deletedAt))}</b>`
        : "";

      const actionsHtml = r._deleted
        ? `
          <button class="btn btn--primary" data-act="restore">↩ Відновити заявку</button>
        `
        : `
          <button class="btn btn--primary" data-act="confirm" ${String(r.status) === "confirmed" ? "disabled" : ""}>Підтвердити оплату</button>
          <button class="btn btn--ghost" data-act="cancel" ${String(r.status) === "cancelled" ? "disabled" : ""}>Скасувати</button>
          <button class="btn btn--danger" data-act="delete">Видалити заявку</button>
        `;

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:900;font-size:16px;line-height:1.25;">
              ${utils.escapeHtml(titleMain)}
            </div>
            <div class="form__hint" style="margin-top:4px;">
              ${subLine}
            </div>
          </div>

          <span class="badge" style="${badgeStyle}">
            ${utils.escapeHtml(statusLabel)}
          </span>
        </div>

        <div class="form__hint" style="margin-top:10px;">
          ${r.entryType === "solo"
            ? `Учасник: <b>${utils.escapeHtml(r.participantName || r.captain || "—")}</b><br>`
            : `Капітан: <b>${utils.escapeHtml(r.captain || "—")}</b><br>`
          }
          Телефон: <b>${utils.escapeHtml(r.phone || "—")}</b><br>
          Подано: <b>${utils.escapeHtml(utils.fmtTs(r.createdAt))}</b>
          ${r.confirmedAt ? `<br>Підтверджено: <b>${utils.escapeHtml(utils.fmtTs(r.confirmedAt))}</b>` : ""}
          ${r.cancelledAt ? `<br>Скасовано: <b>${utils.escapeHtml(utils.fmtTs(r.cancelledAt))}</b>` : ""}
          ${deletedInfo}
          <br>ID: <span style="opacity:.7;">${utils.escapeHtml(r._id || "—")}</span>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          ${actionsHtml}
        </div>
      `;

      const btnConfirm = card.querySelector('[data-act="confirm"]');
      const btnCancel = card.querySelector('[data-act="cancel"]');
      const btnDelete = card.querySelector('[data-act="delete"]');
      const btnRestore = card.querySelector('[data-act="restore"]');

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
        els.list.innerHTML = `<div class="form__hint">Нема заявок по цьому фільтру.</div>`;
        return;
      }

      regs.forEach((r) => {
        els.list.appendChild(render.card(r));
      });
    }
  };

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

          if (sf === "confirmed") return st === "confirmed";
          if (sf === "all") return st !== "confirmed";
          return st === sf;
        })
        .filter((r) => utils.matchQuery(r, q));

      filtered.sort((a, b) => {
        const orderA = utils.getStageOrder(a);
        const orderB = utils.getStageOrder(b);

        if (orderA !== orderB) return orderA - orderB;

        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt || 0);

        return dateB - dateA;
      });

      render.list(filtered);
    }
  };

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

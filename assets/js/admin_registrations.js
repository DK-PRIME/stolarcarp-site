// assets/js/admin_registrations.js
// STOLAR CARP • Admin registrations
// ✅ confirm / cancel / DELETE (archive -> delete), filters, search
// ✅ After CONFIRM: hide confirmed from list (doesn't delete)
// ✅ After finishAt + 24h: hide ALL registrations for that stage/event
// ✅ Archive uses fresh doc + removes undefined recursively to avoid Firestore errors
// ✅ MIRROR: confirm/cancel/delete синхронить public_participants (щоб participation.html бачив оплату)

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────
  const state = {
    currentUser: null,
    isAdminByRules: false,
    isAdminByRole: false,
    allRegs: [],
    stageNameByKey: new Map(),      // "compId||stageId" -> label
    stageEndAtByKey: new Map(),     // "compId||stageId" -> endAt(Date|null)
    stageOrderByKey: new Map(),     // "compId||stageId" -> order number
    unsub: null
  };

  // ─────────────────────────────────────────────────────────────
  // DOM ELEMENTS
  // ─────────────────────────────────────────────────────────────
  const els = {
    msg: document.getElementById("msg"),
    list: document.getElementById("list"),
    statusFilter: document.getElementById("statusFilter"),
    qInput: document.getElementById("q")
  };

  // ─────────────────────────────────────────────────────────────
  // INIT CHECK
  // ─────────────────────────────────────────────────────────────
  const auth = window.scAuth;
  const db = window.scDb;

  if (!auth || !db || !window.firebase) {
    if (els.msg) els.msg.textContent = "Firebase init не завантажився.";
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────────────────────────
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
      const t = `${prefix}: ${e?.code ? e.code + " " : ""}${e?.message || e}`;
      utils.setMsg(t, false);
    },

    // ✅ прибирає undefined рекурсивно (Firestore не дозволяє undefined)
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

    norm: (v) => String(v ?? "").trim(),

    getStageKey: (r) => `${r.competitionId || ""}||${r.stageId || ""}`,

    getStageLabel: (r) => {
      const key = utils.getStageKey(r);
      return state.stageNameByKey.get(key) || key;
    },

    isFinishedAndExpired: (r) => {
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
        r._id
      ].join(" ").toLowerCase();
      return hay.includes(q);
    },

    // ✅ extract stage order number for sorting
    getStageOrder: (r) => {
      const key = utils.getStageKey(r);
      return state.stageOrderByKey.get(key) || 0;
    },

    badgeForStatus: (status) => {
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
  };

  // ─────────────────────────────────────────────────────────────
  // FIRESTORE HELPERS
  // ─────────────────────────────────────────────────────────────
  const firestore = {
    pubRef: (id) => db.collection(CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS).doc(String(id)),
    regRef: (id) => db.collection(CONFIG.COLLECTIONS.REGISTRATIONS).doc(String(id)),

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

            // ✅ зберігаємо порядок етапу для сортування
            const orderNum = ev.order ?? ev.stageOrder ?? ev.index ?? (idx + 1);
            state.stageOrderByKey.set(key, orderNum);

            const endRaw = ev.finishAt || ev.finishDate || ev.endAt || ev.endDate || null;
            state.stageEndAtByKey.set(key, utils.toDateMaybe(endRaw));
          });
        } else {
          // одноразове без events[]
          const key = `${compId}||`;
          state.stageNameByKey.set(key, `${brand} · ${compTitle}`);
          state.stageOrderByKey.set(key, 1);

          const endRaw = c.endAt || c.endDate || c.finishAt || c.finishDate || null;
          state.stageEndAtByKey.set(key, utils.toDateMaybe(endRaw));
        }
      });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  const render = {
    card: (r) => {
      const { label: statusLabel, style: badgeStyle } = utils.badgeForStatus(r.status);

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
          <br>ID: <span style="opacity:.7;">${utils.escapeHtml(r._id || "—")}</span>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn--primary" data-act="confirm" ${String(r.status) === "confirmed" ? "disabled" : ""}>Підтвердити оплату</button>
          <button class="btn btn--ghost" data-act="cancel" ${String(r.status) === "cancelled" ? "disabled" : ""}>Скасувати</button>
          <button class="btn btn--danger" data-act="delete">Видалити заявку</button>
        </div>
      `;

      // Event listeners
      const btnConfirm = card.querySelector('[data-act="confirm"]');
      const btnCancel  = card.querySelector('[data-act="cancel"]');
      const btnDelete  = card.querySelector('[data-act="delete"]');

      // CONFIRM + MIRROR
      btnConfirm?.addEventListener("click", async () => {
        if (!state.isAdminByRules) {
          utils.setMsg("Нема адмін-доступу за правилами (UID).", false);
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

          utils.setMsg("Оплату підтверджено ✅ (і в public_participants теж)", true);
        } catch (e) {
          utils.showError("Помилка підтвердження", e);
        }
      });

      // CANCEL + MIRROR
      btnCancel?.addEventListener("click", async () => {
        if (!state.isAdminByRules) {
          utils.setMsg("Нема адмін-доступу за правилами (UID).", false);
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

          utils.setMsg("Заявку скасовано ✅ (і в public_participants теж)", true);
        } catch (e) {
          utils.showError("Помилка скасування", e);
        }
      });

      // DELETE (archive -> delete) + delete public_participants
      btnDelete?.addEventListener("click", async () => {
        if (!state.isAdminByRules) {
          utils.setMsg("Нема адмін-доступу за правилами (UID).", false);
          return;
        }

        const warn =
          `ТОЧНО видалити заявку?\n\n` +
          `Запис: ${titleMain}\n` +
          `Етап: ${utils.getStageLabel(r)}\n\n` +
          `Я збережу копію в registrations_deleted і тоді видалю.`;

        if (!confirm(warn)) return;

        try {
          utils.setMsg("Видаляю...", true);

          const regRef = firestore.regRef(r._id);
          const pubRef = firestore.pubRef(r._id);

          const freshSnap = await regRef.get();
          if (!freshSnap.exists) {
            utils.setMsg("Заявка вже видалена/не існує.", false);
            return;
          }

          const freshData = utils.stripUndefinedDeep(freshSnap.data() || {});
          const batch = db.batch();

          batch.set(
            db.collection(CONFIG.COLLECTIONS.REGISTRATIONS_DELETED).doc(r._id),
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
          utils.setMsg("Заявку видалено ✅ (і public_participants теж очищено)", true);
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

  // ─────────────────────────────────────────────────────────────
  // FILTERS & SORTING
  // ─────────────────────────────────────────────────────────────
  const filters = {
    apply: () => {
      const sfRaw = (els.statusFilter?.value || "all");
      const sf = String(sfRaw || "all").toLowerCase();
      const q = (els.qInput?.value || "").trim().toLowerCase();

      let filtered = state.allRegs
        .filter((r) => !utils.isFinishedAndExpired(r))
        .filter((r) => {
          const st = String(r.status || "").toLowerCase();

          if (sf === "confirmed") return st === "confirmed";
          if (sf === "all") return st !== "confirmed";
          return st === sf;
        })
        .filter((r) => utils.matchQuery(r, q));

      // ✅ СОРТУВАННЯ: спочатку по етапу (1,2,3...), потім по даті створення (новіші перші)
      filtered.sort((a, b) => {
        const orderA = utils.getStageOrder(a);
        const orderB = utils.getStageOrder(b);

        // Спочатку за номером етапу
        if (orderA !== orderB) {
          return orderA - orderB;
        }

        // Потім за датою створення (новіші перші)
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt || 0);
        
        return dateB - dateA;
      });

      render.list(filtered);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // WATCHERS
  // ─────────────────────────────────────────────────────────────
  const watchers = {
    registrations: () => {
      if (state.unsub) state.unsub();

      // ✅ Без orderBy — сортуємо на клієнті після фільтрації
      state.unsub = db.collection(CONFIG.COLLECTIONS.REGISTRATIONS)
        .onSnapshot((snap) => {
          state.allRegs = [];
          snap.forEach((d) => state.allRegs.push({ _id: d.id, ...(d.data() || {}) }));
          filters.apply();
        }, (err) => {
          console.error(err);
          utils.setMsg("Не вдалося завантажити заявки.", false);
        });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // EVENT LISTENERS
  // ─────────────────────────────────────────────────────────────
  const bindEvents = () => {
    els.statusFilter?.addEventListener("change", filters.apply);
    els.qInput?.addEventListener("input", filters.apply);
  };

  // ─────────────────────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────────────────────
  const initAuth = () => {
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
            : "Увага: role=admin, але rules дозволяють адмін-доступ лише основному UID.",
          !!state.isAdminByRules
        );

        await firestore.loadCompetitionsMap();
        watchers.registrations();
      } catch (e) {
        console.error(e);
        utils.setMsg("Помилка перевірки доступу/даних.", false);
      }
    });
  };

  // ─────────────────────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────────────────────
  const boot = () => {
    bindEvents();
    initAuth();
  };

  boot();
})();

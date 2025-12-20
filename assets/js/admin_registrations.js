// assets/js/admin_registrations.js
// STOLAR CARP • Admin registrations (confirm payment, list, filters)

(function () {
  const auth = window.scAuth;
  const db = window.scDb;

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

  let currentUser = null;
  let isAdmin = false;

  // map для назв змагань/етапів: "compId||stageId" -> "STOLAR CARP · ... — Етап ..."
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
          const stageId = (ev.key || ev.stageId || ev.id || `stage-${idx + 1}`) + "";
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx + 1}`;
          const key = `${compId}||${stageId}`;
          stageNameByKey.set(key, `${brand} · ${compTitle} — ${stageTitle}`);
        });
      } else {
        // одноразове без events[]
        const key = `${compId}||`;
        stageNameByKey.set(key, `${brand} · ${compTitle}`);
      }
    });
  }

  function matchQuery(r, q) {
    if (!q) return true;
    const hay = [
      r.teamName,
      r.captain,
      r.phone,
      r.competitionId,
      r.stageId,
      r.status
    ].join(" ").toLowerCase();
    return hay.includes(q);
  }

  function getStageLabel(r) {
    const key = `${r.competitionId || ""}||${r.stageId || ""}`;
    return stageNameByKey.get(key) || key;
  }

  function render(regs) {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!regs.length) {
      listEl.innerHTML = `<div class="form__hint">Нема заявок по цьому фільтру.</div>`;
      return;
    }

    regs.forEach((r) => {
      const status = r.status || "unknown";

      const statusBadge =
        status === "pending_payment" ? "Очікує оплату" :
        status === "confirmed" ? "Підтверджено" :
        status === "cancelled" ? "Скасовано" :
        status;

      const badgeStyle =
        status === "confirmed" ? "background:rgba(124,255,178,.12);border-color:rgba(124,255,178,.35);" :
        status === "pending_payment" ? "background:rgba(255,204,0,.10);border-color:rgba(255,204,0,.35);" :
        "background:rgba(255,108,108,.10);border-color:rgba(255,108,108,.35);";

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
            ${escapeHtml(statusBadge)}
          </span>
        </div>

        <div class="form__hint" style="margin-top:10px;">
          Капітан: <b>${escapeHtml(r.captain || "—")}</b><br>
          Телефон: <b>${escapeHtml(r.phone || "—")}</b><br>
          Подано: <b>${escapeHtml(fmtTs(r.createdAt))}</b>
          ${r.confirmedAt ? `<br>Підтверджено: <b>${escapeHtml(fmtTs(r.confirmedAt))}</b>` : ""}
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn--primary" data-act="confirm" ${status === "confirmed" ? "disabled" : ""}>Підтвердити оплату</button>
          <button class="btn btn--ghost" data-act="cancel" ${status === "cancelled" ? "disabled" : ""}>Скасувати</button>
        </div>
      `;

      const btnConfirm = card.querySelector('[data-act="confirm"]');
      const btnCancel = card.querySelector('[data-act="cancel"]');

      btnConfirm?.addEventListener("click", async () => {
        if (!isAdmin) return setMsg("Нема адмін-доступу.", false);
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
          console.error(e);
          setMsg("Помилка підтвердження (Rules/доступ).", false);
        }
      });

      btnCancel?.addEventListener("click", async () => {
        if (!isAdmin) return setMsg("Нема адмін-доступу.", false);
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
          console.error(e);
          setMsg("Помилка скасування (Rules/доступ).", false);
        }
      });

      listEl.appendChild(card);
    });
  }

  let unsub = null;
  function watchRegistrations() {
    if (unsub) unsub();

    // беремо всі, сортуємо по даті подачі (нові зверху)
    unsub = db.collection("registrations")
      .orderBy("createdAt", "desc")
      .onSnapshot((snap) => {
        const all = [];
        snap.forEach((d) => all.push({ _id: d.id, ...(d.data() || {}) }));

        const sf = (statusFilter?.value || "all");
        const q = (qInput?.value || "").trim().toLowerCase();

        const filtered = all
          .filter((r) => (sf === "all" ? true : (r.status === sf)))
          .filter((r) => matchQuery(r, q));

        render(filtered);
      }, (err) => {
        console.error(err);
        setMsg("Не вдалося завантажити заявки (Rules/доступ).", false);
      });
  }

  statusFilter?.addEventListener("change", watchRegistrations);
  qInput?.addEventListener("input", () => {
    // просто перезапустимо рендер через повторну підписку
    // (щоб не городити стан — швидко і надійно)
    watchRegistrations();
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    if (!user) {
      setMsg("Увійдіть як адмін, щоб бачити заявки.", false);
      return;
    }

    try {
      // перевірка ролі адміна через users/{uid}.role
      const uSnap = await db.collection("users").doc(user.uid).get();
      const role = (uSnap.data() || {}).role || "";
      isAdmin = role === "admin";

      if (!isAdmin) {
        setMsg("Доступ заборонено: цей акаунт не адмін.", false);
        return;
      }

      await loadCompetitionsMap();
      watchRegistrations();
      setMsg("Адмін-доступ ✅", true);
    } catch (e) {
      console.error(e);
      setMsg("Помилка перевірки доступу/даних.", false);
    }
  });
})();

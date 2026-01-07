// assets/js/my_participation.js
(function () {
  const box = document.getElementById("myCompetitions");
  if (!box) return;

  let unsub = null;

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase not ready (scAuth/scDb)");
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMuted(text) {
    box.innerHTML = `<div class="cabinet-small-muted">${esc(text)}</div>`;
  }

  function showError(text) {
    box.innerHTML = `<div class="cabinet-small-muted" style="color:#ef4444;">${esc(text)}</div>`;
  }

  function formatDate(ts) {
    if (!ts) return "—";
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString("uk-UA");
    } catch {
      return "—";
    }
  }

  function norm(v) { return String(v ?? "").trim(); }

  function isPaidStatus(status) {
    const s = norm(status).toLowerCase();
    return s === "confirmed" || s === "paid";
  }

  // ====== META змагання (назва + назва етапу) ======
  const metaCache = Object.create(null);

  async function getCompetitionMeta(compId, stageId) {
    const key = `${compId}||${stageId || "main"}`;
    if (metaCache[key]) return metaCache[key];

    const db = window.scDb;
    let compTitle = "";
    let stageTitle = "";

    try {
      const cSnap = await db.collection("competitions").doc(compId).get();
      if (cSnap.exists) {
        const c = cSnap.data() || {};
        compTitle = c.name || c.title || "";

        const events = Array.isArray(c.events) ? c.events : [];
        const st = stageId || "main";
        const ev = events.find(e => String(e?.key || e?.stageId || e?.id || "").trim() === String(st).trim());
        stageTitle =
          (ev && (ev.title || ev.name || ev.label)) ||
          (st && st !== "main" ? st : "");
      }
    } catch {}

    const res = { compTitle, stageTitle };
    metaCache[key] = res;
    return res;
  }

  function niceTitle(it) {
    const comp = it.compTitle || "Змагання";
    const stage = it.stageTitle || it.stageId || "";
    return stage ? `${esc(comp)} · ${esc(stage)}` : esc(comp);
  }

  function renderItems(items) {
    let html = "";
    items.forEach((it) => {
      const paid = isPaidStatus(it.status);
      const dot = paid ? "#22c55e" : "#ef4444";

      html += `
        <div class="stat-card" style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="min-width:0;">
              <div class="stat-label" style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${dot};box-shadow:0 0 10px rgba(0,0,0,.25)"></span>
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${niceTitle(it)}</span>
              </div>

              <div class="cabinet-small-muted" style="margin-top:6px;">
                Команда: <strong style="color:#e5e7eb;">${esc(it.teamName || "—")}</strong>
                ${it.updatedAt ? ` · Оновлено: ${esc(formatDate(it.updatedAt))}` : ""}
              </div>

              <div class="cabinet-small-muted" style="margin-top:6px;">
                Статус: <strong style="color:${paid ? "#22c55e" : "#ef4444"};">${paid ? "Оплачено" : "Очікується"}</strong>
              </div>
            </div>

            <div style="flex-shrink:0;">
              <a class="btn btn--primary" href="participation.html?comp=${encodeURIComponent(it.competitionId)}&stage=${encodeURIComponent(it.stageId || "main")}">
                Відкрити
              </a>
            </div>
          </div>
        </div>
      `;
    });
    box.innerHTML = html;
  }

  async function subscribeParticipation(user) {
    const db = window.scDb;

    // 1) teamId користувача
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) {
      showError("Немає профілю користувача");
      return;
    }

    const u = uSnap.data() || {};
    const teamId = u.teamId;
    if (!teamId) {
      showMuted("Ви ще не в команді");
      return;
    }

    // 2) Підписка тільки на TEAM-заявки цієї команди (щоб НЕ ловити permission-denied)
    if (typeof unsub === "function") { unsub(); unsub = null; }

    showMuted("Завантаження участі…");

    unsub = db.collection("registrations")
      .where("teamId", "==", teamId)
      .where("entryType", "==", "team")
      .onSnapshot(async (qs) => {
        const regs = [];
        qs.forEach(d => regs.push({ id: d.id, ...(d.data() || {}) }));

        if (!regs.length) {
          showMuted("Команда ще не подавала заявки на змагання");
          return;
        }

        // 3) унікальні по competitionId+stageId (залишаємо "кращий": confirmed перемагає)
        const map = Object.create(null);
        regs.forEach(r => {
          const compId = norm(r.competitionId);
          const stageId = norm(r.stageId) || "main";
          if (!compId) return;

          const k = `${compId}||${stageId}`;
          if (!map[k]) map[k] = r;
          else {
            const a = map[k];
            const ap = isPaidStatus(a.status);
            const bp = isPaidStatus(r.status);
            if (!ap && bp) map[k] = r;
          }
        });

        const uniq = Object.values(map);

        // 4) підтягнемо красиві назви з competitions (без compId на екрані)
        for (const it of uniq) {
          const compId = norm(it.competitionId);
          const stageId = norm(it.stageId) || "main";
          const meta = await getCompetitionMeta(compId, stageId);
          it.compTitle = meta.compTitle || it.competitionTitle || it.competitionName || "Змагання";
          it.stageTitle = meta.stageTitle || it.stageName || "";
          it.teamName = it.teamName || u.teamName || "";
          it.updatedAt = it.updatedAt || it.confirmedAt || it.createdAt || null;
          it.stageId = stageId;
        }

        // 5) сортування: оплачені зверху, далі за датою (новіші зверху)
        uniq.sort((a, b) => {
          const ap = isPaidStatus(a.status);
          const bp = isPaidStatus(b.status);
          if (ap !== bp) return ap ? -1 : 1;

          const at = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt ? +new Date(a.updatedAt) : 0);
          const bt = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt ? +new Date(b.updatedAt) : 0);
          return bt - at;
        });

        renderItems(uniq);
      }, (err) => {
        console.warn(err);
        showError("Не вдалося завантажити участь. Перевір правила доступу Firestore.");
      });
  }

  (async () => {
    try {
      await waitFirebase();
      showMuted("Завантаження участі…");

      window.scAuth.onAuthStateChanged(async (user) => {
        if (!user) {
          showMuted("Увійдіть у акаунт");
          return;
        }
        try {
          await subscribeParticipation(user);
        } catch (e) {
          console.error(e);
          showError("Помилка завантаження участі");
        }
      });
    } catch (e) {
      console.error(e);
      showError("Помилка завантаження участі");
    }
  })();
})();

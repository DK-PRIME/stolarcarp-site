// assets/js/my_participation.js
(function () {
  const box = document.getElementById("myCompetitions");
  if (!box) return;

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

  function renderItems(items) {
    // красивий компактний список у стилі твоїх карточок
    let html = "";
    items.forEach((it) => {
      html += `
        <div class="stat-card" style="margin-bottom:10px;">
          <div class="stat-label">${esc(it.stageName || "Етап")}</div>
          <div class="cabinet-small-muted">
            ${esc(it.compId || "—")}
            ${it.zone ? ` · Зона: <strong style="color:#facc15;">${esc(it.zone)}</strong>` : ""}
            ${it.sectorNumber ? ` · Сектор: <strong style="color:#facc15;">${esc(it.sectorNumber)}</strong>` : ""}
          </div>
          <div class="cabinet-small-muted" style="margin-top:6px;">
            Команда: <strong style="color:#e5e7eb;">${esc(it.teamName || "—")}</strong>
            ${it.updatedAt ? ` · Оновлено: ${esc(formatDate(it.updatedAt))}` : ""}
          </div>
        </div>
      `;
    });
    box.innerHTML = html;
  }

  async function loadParticipation(user) {
    const db = window.scDb;

    // 1) беремо teamId користувача
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

    // 2) читаємо stageResults і шукаємо teamId всередині масиву teams
    //    (так, це повний перегляд колекції — але stageResults небагато і це ок)
    const snap = await db.collection("stageResults").get();

    const items = [];
    snap.forEach((doc) => {
      const data = doc.data() || {};
      const teams = Array.isArray(data.teams) ? data.teams : [];

      teams.forEach((t) => {
        if (!t || t.teamId !== teamId) return;

        items.push({
          stageName: data.stageName || t.stageName || "Етап",
          compId: data.compId || t.compId || "",
          teamName: t.team || data.teamName || "",
          zone: t.zone || "",
          sectorNumber: t.sectorNumber || "",
          updatedAt: data.updatedAt || data.createdAt || null,
          regId: t.regId || data.regId || ""
        });
      });
    });

    if (!items.length) {
      showMuted("Участь у змаганнях не знайдена");
      return;
    }

    // 3) сортування: найновіше зверху (якщо є updatedAt/createdAt)
    items.sort((a, b) => {
      const at = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt ? +new Date(a.updatedAt) : 0);
      const bt = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt ? +new Date(b.updatedAt) : 0);
      return bt - at;
    });

    renderItems(items);
  }

  (async () => {
    try {
      await waitFirebase();

      // якщо вже показано "Завантаження..." — замінимо на реальний статус
      showMuted("Завантаження участі…");

      window.scAuth.onAuthStateChanged(async (user) => {
        if (!user) {
          showMuted("Увійдіть у акаунт");
          return;
        }
        try {
          await loadParticipation(user);
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

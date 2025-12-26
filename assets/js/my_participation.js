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

  function niceTitle(it) {
    // Показуємо красиву назву турніру, якщо вона є.
    // ВАЖЛИВО: compId (oneoff-...) НІКОЛИ не показуємо.
    const compName = it.competitionName || it.compName || it.competition || "";
    const stage = it.stageName || "Етап";
    if (compName) return `${esc(compName)} · ${esc(stage)}`;
    return esc(stage);
  }

  function renderItems(items) {
    let html = "";
    items.forEach((it) => {
      html += `
        <div class="stat-card" style="margin-bottom:10px;">
          <div class="stat-label">${niceTitle(it)}</div>

          <div class="cabinet-small-muted">
            ${it.zone ? `Зона: <strong style="color:#facc15;">${esc(it.zone)}</strong>` : ""}
            ${it.sectorNumber ? `${it.zone ? " · " : ""}Сектор: <strong style="color:#facc15;">${esc(it.sectorNumber)}</strong>` : ""}
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

    // 2) stageResults -> шукаємо teamId всередині data.teams[]
    const snap = await db.collection("stageResults").get();

    const items = [];
    snap.forEach((doc) => {
      const data = doc.data() || {};
      const teams = Array.isArray(data.teams) ? data.teams : [];

      teams.forEach((t) => {
        if (!t || t.teamId !== teamId) return;

        items.push({
          stageName: data.stageName || t.stageName || "Етап",
          // гарні назви (якщо є в stageResults)
          competitionName: data.competitionName || data.compName || data.competition || "",
          compName: data.compName || "",
          // команда/зона/сектор
          teamName: t.team || data.teamName || "",
          zone: t.zone || "",
          sectorNumber: t.sectorNumber || "",
          // дата
          updatedAt: data.updatedAt || data.createdAt || null,
          // технічне лишаємо в даних (на майбутнє), але НЕ показуємо
          compId: data.compId || t.compId || "",
          regId: t.regId || data.regId || ""
        });
      });
    });

    if (!items.length) {
      showMuted("Участь у змаганнях не знайдена");
      return;
    }

    // 3) сортування: найновіше зверху
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

// assets/js/admin-draw.js
(function () {
  "use strict";

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const stageSelect = document.getElementById("stageSelect");
  const drawList = document.getElementById("drawList");

  const auth = window.scAuth;
  const db = window.scDb;

  if (!auth || !db || !window.firebase) {
    if (drawList) drawList.innerHTML = `<div class="muted" style="color:#ff6c6c;">Firebase init не завантажився.</div>`;
    return;
  }

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // A1..A8, B1..B8, C1..C8
  function buildSectors(max = 8) {
    const zones = ["A", "B", "C"];
    const res = [];
    zones.forEach((z) => {
      for (let i = 1; i <= max; i++) res.push(`${z}${i}`);
    });
    return res;
  }
  const ALL_SECTORS = buildSectors(8);

  // поточні заявки (для вибраного етапу)
  let currentStage = null; // { competitionId, stageId }
  let regs = []; // [{id, teamName, captain, phone, status, confirmedAt, sector, bigFishTotal, ...}]

  function stageDocId({ competitionId, stageId }) {
    return `${competitionId}__${stageId || "main"}`;
  }

  function parseStageValue(v) {
    const [competitionId, stageId] = String(v || "").split("||");
    return { competitionId: (competitionId || "").trim(), stageId: (stageId || "").trim() || null };
  }

  function isEligibleForDraw(r) {
    // щоб не було “не підтягує”, беремо ширше:
    // 1) status confirmed/paid/drawn
    // 2) або confirmedAt існує
    const st = String(r.status || "").toLowerCase();
    if (["confirmed", "paid", "drawn"].includes(st)) return true;
    if (r.confirmedAt) return true;
    return false;
  }

  function render() {
    if (!drawList) return;

    const eligible = regs.filter(isEligibleForDraw);

    if (!currentStage?.competitionId) {
      drawList.innerHTML = `<div class="muted">Вибери змагання/етап.</div>`;
      return;
    }

    if (!eligible.length) {
      drawList.innerHTML = `<div class="muted">Нема підтверджених команд для жеребкування по цьому етапу.</div>`;
      return;
    }

    // зібрати зайняті сектори
    const used = new Set();
    eligible.forEach((r) => {
      if (r.sector) used.add(String(r.sector).toUpperCase());
    });

    drawList.innerHTML = eligible
      .map((r) => {
        const sectorVal = (r.sector || "").toUpperCase();
        const bigVal = r.bigFishTotal === true ? "yes" : "";

        const sectorOptions =
          `<option value="">— вибери сектор —</option>` +
          ALL_SECTORS.map((s) => {
            const taken = used.has(s) && s !== sectorVal; // зайнятий кимось іншим
            return `<option value="${s}" ${s === sectorVal ? "selected" : ""} ${taken ? "disabled" : ""}>
              ${s}${taken ? " (зайнято)" : ""}
            </option>`;
          }).join("");

        return `
          <div class="card" style="padding:14px; border-radius:16px;">
            <div style="font-weight:900; margin-bottom:10px;">${esc(r.teamName || "Без назви")}</div>

            <div class="grid2">
              <div>
                <div class="muted" style="font-size:.82rem; margin-bottom:6px;">Сектор</div>
                <select class="input" data-sector="${esc(r.id)}" style="width:100%; padding:10px 12px; border-radius:12px;">
                  ${sectorOptions}
                </select>
              </div>

              <div>
                <div class="muted" style="font-size:.82rem; margin-bottom:6px;">BigFishTotal</div>
                <select class="input" data-big="${esc(r.id)}" style="width:100%; padding:10px 12px; border-radius:12px;">
                  <option value="" ${bigVal === "" ? "selected" : ""}>—</option>
                  <option value="yes" ${bigVal === "yes" ? "selected" : ""}>Так</option>
                </select>
              </div>
            </div>

            <div class="muted" style="margin-top:10px; font-size:.85rem;">
              Статус: <b>${esc(r.status || "—")}</b>
              ${r.confirmedAt ? ` · підтверджено` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    // реакція: коли змінюєш сектор — перемальовуємо disabled щоб 2 рази A4 не можна було
    drawList.querySelectorAll("select[data-sector]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const rid = sel.getAttribute("data-sector");
        const picked = (sel.value || "").toUpperCase();

        // оновити в regs
        regs = regs.map((x) => (x.id === rid ? { ...x, sector: picked || null } : x));
        render();
      });
    });

    drawList.querySelectorAll("select[data-big]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const rid = sel.getAttribute("data-big");
        const v = sel.value === "yes";
        regs = regs.map((x) => (x.id === rid ? { ...x, bigFishTotal: sel.value ? v : null } : x));
      });
    });
  }

  async function loadStagesToSelect() {
    stageSelect.innerHTML = `<option value="">Завантаження…</option>`;

    const snap = await db.collection("competitions").get();
    const items = [];

    snap.forEach((doc) => {
      const c = doc.data() || {};
      const compId = doc.id;

      const title = c.name || c.title || compId;
      const events = Array.isArray(c.events) ? c.events : [];

      if (events.length) {
        events.forEach((ev, idx) => {
          const key = ev.key || ev.stageId || ev.id || `stage-${idx + 1}`;
          const stageTitle = ev.title || ev.name || ev.label || (String(key).toLowerCase() === "final" ? "Фінал" : `Етап ${idx + 1}`);
          items.push({
            value: `${compId}||${key}`,
            label: `${title} — ${stageTitle}`,
          });
        });
      } else {
        items.push({ value: `${compId}||`, label: `${title}` });
      }
    });

    items.sort((a, b) => a.label.localeCompare(b.label, "uk"));

    stageSelect.innerHTML =
      `<option value="">Змагання / етап</option>` +
      items.map((it) => `<option value="${esc(it.value)}">${esc(it.label)}</option>`).join("");
  }

  async function loadRegistrationsForStage(stage) {
    regs = [];
    render();

    // ВАЖЛИВО: щоб не впиратись в індекси/OR — беремо по competitionId, а далі фільтруємо
    const snap = await db.collection("registrations").where("competitionId", "==", stage.competitionId).get();

    const arr = [];
    snap.forEach((d) => {
      const r = d.data() || {};
      const sid = (r.stageId || null);
      const matchStage = (stage.stageId || null) === (sid || null);
      if (!matchStage) return;

      arr.push({
        id: d.id,
        teamId: r.teamId || null,
        teamName: r.teamName || "",
        captain: r.captain || "",
        phone: r.phone || "",
        status: r.status || "",
        confirmedAt: r.confirmedAt ? true : false,
        sector: r.sector || null,
        bigFishTotal: r.bigFishTotal ?? null,
      });
    });

    // сортуємо по назві команди
    arr.sort((a, b) => (a.teamName || "").localeCompare(b.teamName || "", "uk"));
    regs = arr;
    render();
  }

  // Глобальна функція, бо в HTML onclick="saveDraw()"
  window.saveDraw = async function saveDraw() {
    if (!currentStage?.competitionId) {
      alert("Вибери змагання/етап.");
      return;
    }

    const eligible = regs.filter(isEligibleForDraw);

    // перевірка дублів секторів
    const pick = eligible
      .map((r) => ({ id: r.id, teamName: r.teamName, sector: (r.sector || "").toUpperCase() }))
      .filter((x) => x.sector);

    const seen = new Set();
    const dup = new Set();
    pick.forEach((x) => {
      if (seen.has(x.sector)) dup.add(x.sector);
      seen.add(x.sector);
    });

    if (dup.size) {
      alert("Є дублікати секторів: " + Array.from(dup).join(", ") + ". Один сектор не може бути двічі.");
      return;
    }

    // можна вимагати щоб всім призначили сектор:
    const notSet = eligible.filter((r) => !r.sector);
    if (notSet.length) {
      if (!confirm(`Не всім командам призначено сектор (${notSet.length} шт). Все одно зберегти?`)) return;
    }

    const docId = stageDocId(currentStage);
    const payload = {
      competitionId: currentStage.competitionId,
      stageId: currentStage.stageId || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      items: eligible.map((r) => ({
        registrationId: r.id,
        teamId: r.teamId || null,
        teamName: r.teamName || "",
        sector: r.sector || null,
        bigFishTotal: r.bigFishTotal === true ? true : null,
      })),
    };

    try {
      // 1) записуємо зліпок жеребкування
      await db.collection("draws").doc(docId).set(payload, { merge: true });

      // 2) оновлюємо кожну заявку → щоб “пішла” на зважування
      const batch = db.batch();
      eligible.forEach((r) => {
        const ref = db.collection("registrations").doc(r.id);
        batch.set(
          ref,
          {
            sector: r.sector || null,
            bigFishTotal: r.bigFishTotal === true ? true : null,
            status: r.sector ? "drawn" : (r.status || "confirmed"),
            drawnAt: r.sector ? firebase.firestore.FieldValue.serverTimestamp() : null,
          },
          { merge: true }
        );
      });
      await batch.commit();

      alert("Жеребкування збережено ✅");
    } catch (e) {
      console.error(e);
      alert("Помилка збереження (Rules/доступ/індекс).");
    }
  };

  // auth gate
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      if (drawList) drawList.innerHTML = `<div class="muted" style="color:#ff6c6c;">Потрібен вхід в адмін.</div>`;
      return;
    }
    if (user.uid !== ADMIN_UID) {
      if (drawList) drawList.innerHTML = `<div class="muted" style="color:#ff6c6c;">Доступ заборонено.</div>`;
      return;
    }

    await loadStagesToSelect();

    stageSelect.addEventListener("change", async () => {
      const stage = parseStageValue(stageSelect.value);
      currentStage = stage.competitionId ? stage : null;
      if (!currentStage) {
        regs = [];
        render();
        return;
      }
      await loadRegistrationsForStage(currentStage);
    });

    render();
  });
})();

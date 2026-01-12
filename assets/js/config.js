/* STOLAR CARP config — shared JS across pages (helpers only, NO Firebase init) */
(function () {
  "use strict";

  /* =========================
     Small helpers
     ========================= */
  const $ = (sel, root = document) => root.querySelector(sel);

  const safeURL = (path) => {
    // builds absolute URL respecting <base href="...">
    try {
      return new URL(path, document.baseURI).href;
    } catch {
      return path;
    }
  };

  /* =========================
     Header / burger (STABLE)
     ========================= */
  (function headerBurger() {
    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");
    if (!burger || !nav) return;

    const OPEN_CLASS = "open";

    const isOpen = () => nav.classList.contains(OPEN_CLASS);

    const openMenu = () => {
      nav.classList.add(OPEN_CLASS);
      burger.setAttribute("aria-expanded", "true");
      document.documentElement.classList.add("nav-open");
      document.body.classList.add("nav-open");
    };

    const closeMenu = () => {
      nav.classList.remove(OPEN_CLASS);
      burger.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("nav-open");
      document.body.classList.remove("nav-open");
    };

    const toggleMenu = () => (isOpen() ? closeMenu() : openMenu());

    burger.setAttribute("aria-controls", "nav");
    burger.setAttribute("aria-expanded", "false");

    burger.addEventListener("click", (e) => {
      e.preventDefault();
      toggleMenu();
    });

    nav.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (a && isOpen()) closeMenu();
    });

    document.addEventListener("click", (e) => {
      if (!isOpen()) return;
      if (!nav.contains(e.target) && !burger.contains(e.target)) closeMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) closeMenu();
    });

    const mq = window.matchMedia("(max-width: 860px)");
    const onMQ = () => {
      if (!mq.matches) closeMenu();
    };
    if (mq.addEventListener) mq.addEventListener("change", onMQ);
    else mq.addListener(onMQ);

    window.__scCloseMenu = closeMenu;
  })();

  /* =========================
     Inject favicon & theme meta (once)
     FIXED PATHS for <base href>
     ========================= */
  (function injectIcons() {
    const head = document.head;
    if (!head) return;

    const addLink = (rel, href, type) => {
      if (head.querySelector(`link[rel="${rel}"]`)) return;
      const l = document.createElement("link");
      l.rel = rel;
      l.href = safeURL(href);
      if (type) l.type = type;
      head.appendChild(l);
    };

    const addMeta = (name, content) => {
      let m = head.querySelector(`meta[name="${name}"]`);
      if (!m) {
        m = document.createElement("meta");
        m.setAttribute("name", name);
        head.appendChild(m);
      }
      m.setAttribute("content", content);
    };

    // IMPORTANT: resolve from baseURI
    addLink("icon", "assets/favicon.png", "image/png");
    addLink("apple-touch-icon", "assets/favicon.png");

    // ✅ DARK STATUS BAR
    addMeta("theme-color", "#0b0f1a");
    addMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
  })();

  /* =========================
     Utils
     ========================= */
  const escapeHTML = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  function parseCSV(text) {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim().length);

    return lines.map((line) => {
      const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
      return line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    });
  }

  function toNum(x) {
    const v = String(x || "").replace(",", ".").replace(/\s+/g, "");
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  const kg = (v) => toNum(v).toFixed(3);

  /* =========================
     LIVE PAGE (optional)
     ========================= */
  (function livePage() {
    const paste = document.getElementById("csv-paste");
    const renderBtn = document.getElementById("render-csv");
    const liveBody = document.getElementById("live-body");
    const csvUrlInput = document.getElementById("csv-url");
    const fetchBtn = document.getElementById("fetch-csv");
    const autoToggle = document.getElementById("auto-refresh");
    const statusText = document.getElementById("statusText");
    const statusDot = document.getElementById("statusDot");
    let autoTimer = null;

    if (!paste && !renderBtn && !liveBody && !csvUrlInput && !fetchBtn && !autoToggle) return;

    const setStatus = (type, text) => {
      if (!statusText || !statusDot) return;
      statusDot.classList.remove("ok", "err");
      if (type === "ok") statusDot.classList.add("ok");
      if (type === "err") statusDot.classList.add("err");
      statusText.textContent = text || "";
    };

    const renderLiveTable = (rows) => {
      if (!liveBody) return;
      liveBody.innerHTML = rows
        .map((r) => `<tr>${r.map((c) => `<td>${escapeHTML(c || "")}</td>`).join("")}</tr>`)
        .join("");
    };

    const fetchCSV = async (url) => {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return parseCSV(await res.text());
    };

    const tick = async () => {
      const url = (csvUrlInput?.value || "").trim();
      if (!url) return;
      try {
        setStatus("", "Завантаження…");
        const rows = await fetchCSV(url);
        renderLiveTable(rows);
        setStatus("ok", "Оновлено: " + new Date().toLocaleTimeString("uk-UA"));
      } catch (e) {
        setStatus("err", "Помилка: " + (e?.message || e));
      }
    };

    if (renderBtn && paste && liveBody) {
      renderBtn.addEventListener("click", () => {
        try {
          const rows = parseCSV(paste.value);
          renderLiveTable(rows);
          setStatus("ok", "Оновлено з буфера");
        } catch (e) {
          setStatus("err", "Помилка CSV: " + (e?.message || e));
        }
      });
    }

    if (fetchBtn && csvUrlInput) {
      fetchBtn.addEventListener("click", async () => {
        const url = csvUrlInput.value.trim();
        if (!url) return alert("Вкажіть посилання на CSV");
        localStorage.setItem("live_url", url);
        await tick();
      });
    }

    if (autoToggle && csvUrlInput) {
      autoToggle.addEventListener("change", async (e) => {
        const on = !!e.target.checked;
        localStorage.setItem("live_auto", on ? "1" : "0");
        if (autoTimer) clearInterval(autoTimer);
        autoTimer = null;
        if (on) {
          await tick();
          autoTimer = setInterval(tick, 60000);
        }
      });

      const savedUrl = localStorage.getItem("live_url") || "";
      const savedAuto = localStorage.getItem("live_auto") === "1";
      csvUrlInput.value = savedUrl;
      autoToggle.checked = savedAuto;
      if (savedUrl && savedAuto) {
        tick();
        autoTimer = setInterval(tick, 60000);
      }
    }
  })();

  /* =========================
     RATING + AWARDS (optional)
     ========================= */
  (function ratingAwards() {
    const rateCSV = document.getElementById("rating-csv");
    const calcBtn = document.getElementById("calc-awards");
    const topLake = document.getElementById("top-lake");
    const zonesWrap = document.getElementById("zones-awards");
    if (!calcBtn || !rateCSV) return;

    const groupByZone = (rows) => {
      const byZ = { A: [], B: [], C: [] };
      rows.forEach((r) => {
        const team = r[0] || "";
        const zone = (r[1] || "").toUpperCase();
        const weight = toNum(r[4]);
        if (team && ["A", "B", "C"].includes(zone)) byZ[zone].push({ team, weight });
      });
      ["A", "B", "C"].forEach((z) => byZ[z].sort((a, b) => b.weight - a.weight));
      return byZ;
    };

    const renderTopLake = (byZ) => {
      if (!topLake) return;
      const winners = ["A", "B", "C"].map((z) => byZ[z][0]).filter(Boolean);
      winners.sort((a, b) => b.weight - a.weight);
      topLake.innerHTML = winners.length
        ? winners
            .map((w, i) => `<tr><td>${i + 1}</td><td>${escapeHTML(w.team)}</td><td>${kg(w.weight)}</td></tr>`)
            .join("")
        : `<tr><td colspan="3">Немає даних</td></tr>`;
    };

    const renderZonesAwards = (byZ) => {
      if (!zonesWrap) return;
      zonesWrap.innerHTML = ["A", "B", "C"]
        .map((z) => {
          const arr = byZ[z];
          const awards = [arr[1], arr[2], arr[3]].filter(Boolean);
          const rows = awards.length
            ? awards
                .map((w, i) => `<tr><td>${i + 1}</td><td>${escapeHTML(w.team)}</td><td>${kg(w.weight)}</td></tr>`)
                .join("")
            : '<tr><td colspan="3">Недостатньо даних</td></tr>';
          return `
            <div class="card">
              <h3>Зона ${z} — нагородження (2→1, 3→2, 4→3)</h3>
              <table class="table">
                <thead><tr><th>Місце</th><th>Команда</th><th>Вага, кг</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          `;
        })
        .join("");
    };

    calcBtn.addEventListener("click", () => {
      try {
        const rows = parseCSV(rateCSV.value);
        const body = rows[0] && /команда/i.test(rows[0][0] || "") ? rows.slice(1) : rows;
        const byZ = groupByZone(body);
        renderTopLake(byZ);
        renderZonesAwards(byZ);
        const ready = document.getElementById("awards-ready");
        if (ready) ready.style.display = "block";
      } catch (e) {
        alert("Помилка CSV: " + (e?.message || e));
      }
    });
  })();

  /* =========================
     AUTO REGISTRATION WINDOWS (turnir-2026.html)
     ========================= */
  (function autoRegButtons() {
    const stagesWrap = document.getElementById("stages");
    if (!stagesWrap) return;

    const DAY = 86400000;
    const toDate = (s) => (s ? new Date(s + "T00:00:00") : null);

    stagesWrap.querySelectorAll(".card[data-id][data-start]").forEach((card) => {
      const id = card.dataset.id;
      const s = toDate(card.dataset.start || "2026-01-01");
      if (!id || !s) return;

      const open = card.dataset.regOpen ? toDate(card.dataset.regOpen) : new Date(s.getTime() - 14 * DAY);
      const close = card.dataset.regClose ? toDate(card.dataset.regClose) : new Date(s.getTime() - 6 * 3600 * 1000);

      let regBtn = card.querySelector("[data-reg]");
      if (!regBtn) {
        const btns =
          card.querySelector(".btns") ||
          card.appendChild(Object.assign(document.createElement("div"), { className: "btns" }));
        regBtn = document.createElement("a");
        regBtn.className = "btn btn--primary";
        regBtn.setAttribute("data-reg", "");
        regBtn.href = `register.html?stage=${encodeURIComponent(id)}`;
        btns.prepend(regBtn);
      }

      const now = new Date();
      if (now < open) {
        regBtn.textContent = "Реєстрація скоро";
        regBtn.style.opacity = ".6";
        regBtn.style.pointerEvents = "none";
      } else if (now > close) {
        regBtn.textContent = "Реєстрацію закрито";
        regBtn.style.opacity = ".6";
        regBtn.style.pointerEvents = "none";
      } else {
        regBtn.textContent = "Реєстрація";
        regBtn.style.opacity = "";
        regBtn.style.pointerEvents = "";
      }
    });
  })();
})();
// ===============================
// GO TO CABINET (burger + desktop)
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const goCabinet = document.getElementById("goCabinet");
  if (!goCabinet) return;

  goCabinet.addEventListener("click", (e) => {
    e.preventDefault();

    // Firebase ще не ініціалізований
    if (!window.firebase || !firebase.auth) {
      window.location.href = "/auth.html";
      return;
    }

    const user = firebase.auth().currentUser;

    if (user) {
      window.location.href = "/cabinet.html";
    } else {
      window.location.href = "/auth.html";
    }
  });
});

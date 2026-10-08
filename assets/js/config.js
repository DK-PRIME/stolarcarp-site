/* =========================================================
   assets/js/config.js

   STOLAR CARP • GLOBAL CONFIG

   VERSION: 20261008-burger-fix

   ✅ Автоматичний рік сезону
   ✅ Єдиний контролер бургер-меню
   ✅ Працює з defer та без defer
   ✅ Захист від повторної ініціалізації
   ✅ Закриття меню після вибору сторінки
   ✅ Закриття після натискання поза меню
   ✅ Закриття клавішею Escape
   ✅ Закриття при переході на desktop
   ✅ Favicon / Theme
   ✅ CSV helpers
   ✅ Live CSV
   ✅ Rating / Awards
   ✅ Registration windows
   ✅ Go to cabinet

   Firebase тут НЕ ініціалізується.
   ========================================================= */

(function () {
  "use strict";

  console.log(
    "✅ STOLAR CARP config.js LOADED v20261008-burger-fix"
  );

  /* =========================================================
     1. GLOBAL CONFIG
     ========================================================= */

  const CURRENT_SEASON_YEAR = String(
    new Date().getFullYear()
  );

  window.SC_CONFIG = {
    ...(window.SC_CONFIG || {}),
    seasonYear: CURRENT_SEASON_YEAR
  };

  window.SC_SEASON_YEAR = CURRENT_SEASON_YEAR;

  console.log(
    "✅ STOLAR CARP season:",
    CURRENT_SEASON_YEAR
  );

  /* =========================================================
     2. HELPERS
     ========================================================= */

  const $ = (selector, root = document) => {
    return root.querySelector(selector);
  };

  function safeURL(path) {
    try {
      return new URL(
        path,
        document.baseURI
      ).href;
    } catch (_) {
      return path;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseCSV(text) {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .filter(line => line.trim().length);

    return lines.map(line => {
      const separator = line.includes("\t")
        ? "\t"
        : line.includes(";")
          ? ";"
          : ",";

      return line
        .split(separator)
        .map(cell =>
          cell
            .trim()
            .replace(/^"(.*)"$/, "$1")
        );
    });
  }

  function toNum(value) {
    const normalized = String(value ?? "")
      .replace(",", ".")
      .replace(/\s+/g, "");

    const number = parseFloat(normalized);

    return Number.isFinite(number)
      ? number
      : 0;
  }

  const kg = value => toNum(value).toFixed(3);

  /* =========================================================
     3. HEADER / BURGER MENU

     ЄДИНИЙ ГЛОБАЛЬНИЙ КОНТРОЛЕР

     HTML:

     <nav class="nav" id="nav">...</nav>

     <button
       class="burger"
       id="burger"
       type="button"
       aria-controls="nav"
       aria-expanded="false"
     >
       <span></span>
       <span></span>
       <span></span>
     </button>

     ========================================================= */

  function initHeaderBurger() {
    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");

    if (!burger || !nav) {
      return;
    }

    /*
     * Захист від повторного запуску config.js.
     */

    if (burger.dataset.scBurgerInitialized === "1") {
      return;
    }

    burger.dataset.scBurgerInitialized = "1";

    const OPEN_CLASS = "open";

    const desktopMedia = window.matchMedia(
      "(min-width: 861px)"
    );

    function isOpen() {
      return nav.classList.contains(OPEN_CLASS);
    }

    function setMenuState(open) {
      const shouldOpen = Boolean(open);

      nav.classList.toggle(
        OPEN_CLASS,
        shouldOpen
      );

      burger.classList.toggle(
        OPEN_CLASS,
        shouldOpen
      );

      burger.setAttribute(
        "aria-expanded",
        String(shouldOpen)
      );

      burger.setAttribute(
        "aria-label",
        shouldOpen
          ? "Закрити меню"
          : "Відкрити меню"
      );

      document.documentElement.classList.toggle(
        "nav-open",
        shouldOpen
      );

      document.body.classList.toggle(
        "nav-open",
        shouldOpen
      );
    }

    function openMenu() {
      setMenuState(true);
    }

    function closeMenu() {
      setMenuState(false);
    }

    function toggleMenu() {
      setMenuState(!isOpen());
    }

    /*
     * Початковий стан.
     */

    burger.setAttribute(
      "aria-controls",
      "nav"
    );

    closeMenu();

    /*
     * Основне натискання на бургер.
     */

    burger.addEventListener(
      "click",
      function (event) {
        event.preventDefault();

        /*
         * Не дозволяємо кліку потрапити
         * до інших делегованих обробників.
         */

        event.stopPropagation();

        toggleMenu();
      }
    );

    /*
     * Закриття після вибору пункту меню.
     */

    nav.addEventListener(
      "click",
      function (event) {
        const link = event.target.closest(
          "a"
        );

        if (link && isOpen()) {
          closeMenu();
        }
      }
    );

    /*
     * Закриття при натисканні
     * поза меню.
     */

    document.addEventListener(
      "click",
      function (event) {
        if (!isOpen()) {
          return;
        }

        const clickedInsideNav = nav.contains(
          event.target
        );

        const clickedBurger = burger.contains(
          event.target
        );

        if (
          !clickedInsideNav &&
          !clickedBurger
        ) {
          closeMenu();
        }
      }
    );

    /*
     * Escape.
     */

    document.addEventListener(
      "keydown",
      function (event) {
        if (
          event.key === "Escape" &&
          isOpen()
        ) {
          closeMenu();
          burger.focus();
        }
      }
    );

    /*
     * Закриття при переході
     * з мобільного режиму на desktop.
     */

    function handleDesktopChange() {
      if (desktopMedia.matches) {
        closeMenu();
      }
    }

    if (
      typeof desktopMedia.addEventListener === "function"
    ) {
      desktopMedia.addEventListener(
        "change",
        handleDesktopChange
      );
    } else {
      desktopMedia.addListener(
        handleDesktopChange
      );
    }

    /*
     * Закриття після повернення
     * на сторінку через історію браузера.
     */

    window.addEventListener(
      "pageshow",
      function (event) {
        if (event.persisted) {
          closeMenu();
        }
      }
    );

    /*
     * Глобальні функції для інших модулів.
     */

    window.__scCloseMenu = closeMenu;
    window.__scOpenMenu = openMenu;
    window.__scToggleMenu = toggleMenu;

    console.log(
      "✅ STOLAR CARP burger initialized"
    );
  }

  /* =========================================================
     4. FAVICON / THEME
     ========================================================= */

  function injectIcons() {
    const head = document.head;

    if (!head) {
      return;
    }

    function addLink(rel, href, type) {
      if (
        head.querySelector(
          `link[rel="${rel}"]`
        )
      ) {
        return;
      }

      const link = document.createElement("link");

      link.rel = rel;
      link.href = safeURL(href);

      if (type) {
        link.type = type;
      }

      head.appendChild(link);
    }

    function addMeta(name, content) {
      let meta = head.querySelector(
        `meta[name="${name}"]`
      );

      if (!meta) {
        meta = document.createElement("meta");

        meta.setAttribute(
          "name",
          name
        );

        head.appendChild(meta);
      }

      meta.setAttribute(
        "content",
        content
      );
    }

    addLink(
      "icon",
      "assets/favicon.png",
      "image/png"
    );

    addLink(
      "apple-touch-icon",
      "assets/favicon.png"
    );

    addMeta(
      "theme-color",
      "#0b0f1a"
    );

    addMeta(
      "apple-mobile-web-app-status-bar-style",
      "black-translucent"
    );
  }

  /* =========================================================
     5. LIVE PAGE / CSV
     ========================================================= */

  function initLivePage() {
    const paste = document.getElementById(
      "csv-paste"
    );

    const renderBtn = document.getElementById(
      "render-csv"
    );

    const liveBody = document.getElementById(
      "live-body"
    );

    const csvUrlInput = document.getElementById(
      "csv-url"
    );

    const fetchBtn = document.getElementById(
      "fetch-csv"
    );

    const autoToggle = document.getElementById(
      "auto-refresh"
    );

    const statusText = document.getElementById(
      "statusText"
    );

    const statusDot = document.getElementById(
      "statusDot"
    );

    let autoTimer = null;

    if (
      !paste &&
      !renderBtn &&
      !liveBody &&
      !csvUrlInput &&
      !fetchBtn &&
      !autoToggle
    ) {
      return;
    }

    function setStatus(type, message) {
      if (!statusText || !statusDot) {
        return;
      }

      statusDot.classList.remove(
        "ok",
        "err"
      );

      if (type === "ok") {
        statusDot.classList.add("ok");
      }

      if (type === "err") {
        statusDot.classList.add("err");
      }

      statusText.textContent = message || "";
    }

    function renderLiveTable(rows) {
      if (!liveBody) {
        return;
      }

      liveBody.innerHTML = rows
        .map(row => {
          return (
            "<tr>" +
            row
              .map(cell => {
                return (
                  "<td>" +
                  escapeHTML(cell || "") +
                  "</td>"
                );
              })
              .join("") +
            "</tr>"
          );
        })
        .join("");
    }

    async function fetchCSV(url) {
      const response = await fetch(url, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(
          "HTTP " + response.status
        );
      }

      return parseCSV(
        await response.text()
      );
    }

    async function tick() {
      const url = (
        csvUrlInput?.value || ""
      ).trim();

      if (!url) {
        return;
      }

      try {
        setStatus(
          "",
          "Завантаження…"
        );

        const rows = await fetchCSV(url);

        renderLiveTable(rows);

        setStatus(
          "ok",
          "Оновлено: " +
            new Date().toLocaleTimeString(
              "uk-UA"
            )
        );

      } catch (error) {
        setStatus(
          "err",
          "Помилка: " +
            (error?.message || error)
        );
      }
    }

    /*
     * Render pasted CSV.
     */

    if (
      renderBtn &&
      paste &&
      liveBody
    ) {
      renderBtn.addEventListener(
        "click",
        function () {
          try {
            const rows = parseCSV(
              paste.value
            );

            renderLiveTable(rows);

            setStatus(
              "ok",
              "Оновлено з буфера"
            );

          } catch (error) {
            setStatus(
              "err",
              "Помилка CSV: " +
                (error?.message || error)
            );
          }
        }
      );
    }

    /*
     * Fetch CSV.
     */

    if (
      fetchBtn &&
      csvUrlInput
    ) {
      fetchBtn.addEventListener(
        "click",
        async function () {
          const url = csvUrlInput.value.trim();

          if (!url) {
            alert(
              "Вкажіть посилання на CSV"
            );

            return;
          }

          localStorage.setItem(
            "live_url",
            url
          );

          await tick();
        }
      );
    }

    /*
     * Auto refresh.
     */

    if (
      autoToggle &&
      csvUrlInput
    ) {
      autoToggle.addEventListener(
        "change",
        async function (event) {
          const enabled = Boolean(
            event.target.checked
          );

          localStorage.setItem(
            "live_auto",
            enabled ? "1" : "0"
          );

          if (autoTimer) {
            clearInterval(autoTimer);
          }

          autoTimer = null;

          if (enabled) {
            await tick();

            autoTimer = setInterval(
              tick,
              60000
            );
          }
        }
      );

      const savedUrl =
        localStorage.getItem("live_url") || "";

      const savedAuto =
        localStorage.getItem("live_auto") === "1";

      csvUrlInput.value = savedUrl;
      autoToggle.checked = savedAuto;

      if (
        savedUrl &&
        savedAuto
      ) {
        tick();

        autoTimer = setInterval(
          tick,
          60000
        );
      }
    }
  }

  /* =========================================================
     6. RATING / AWARDS
     ========================================================= */

  function initRatingAwards() {
    const rateCSV = document.getElementById(
      "rating-csv"
    );

    const calcBtn = document.getElementById(
      "calc-awards"
    );

    const topLake = document.getElementById(
      "top-lake"
    );

    const zonesWrap = document.getElementById(
      "zones-awards"
    );

    if (
      !calcBtn ||
      !rateCSV
    ) {
      return;
    }

    function groupByZone(rows) {
      const byZone = {
        A: [],
        B: [],
        C: []
      };

      rows.forEach(row => {
        const team = row[0] || "";

        const zone = (
          row[1] || ""
        ).toUpperCase();

        const weight = toNum(
          row[4]
        );

        if (
          team &&
          ["A", "B", "C"].includes(zone)
        ) {
          byZone[zone].push({
            team,
            weight
          });
        }
      });

      ["A", "B", "C"].forEach(zone => {
        byZone[zone].sort(
          (a, b) => b.weight - a.weight
        );
      });

      return byZone;
    }

    function renderTopLake(byZone) {
      if (!topLake) {
        return;
      }

      const winners = ["A", "B", "C"]
        .map(zone => byZone[zone][0])
        .filter(Boolean);

      winners.sort(
        (a, b) => b.weight - a.weight
      );

      topLake.innerHTML = winners.length
        ? winners
            .map((winner, index) => {
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHTML(winner.team)}</td>
                  <td>${kg(winner.weight)}</td>
                </tr>
              `;
            })
            .join("")
        : `
          <tr>
            <td colspan="3">
              Немає даних
            </td>
          </tr>
        `;
    }

    function renderZonesAwards(byZone) {
      if (!zonesWrap) {
        return;
      }

      zonesWrap.innerHTML = [
        "A",
        "B",
        "C"
      ]
        .map(zone => {
          const teams = byZone[zone];

          const awards = [
            teams[1],
            teams[2],
            teams[3]
          ].filter(Boolean);

          const rows = awards.length
            ? awards
                .map((winner, index) => {
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${escapeHTML(winner.team)}</td>
                      <td>${kg(winner.weight)}</td>
                    </tr>
                  `;
                })
                .join("")
            : `
              <tr>
                <td colspan="3">
                  Недостатньо даних
                </td>
              </tr>
            `;

          return `
            <div class="card">
              <h3>
                Зона ${zone} — нагородження
                (2→1, 3→2, 4→3)
              </h3>

              <table class="table">
                <thead>
                  <tr>
                    <th>Місце</th>
                    <th>Команда</th>
                    <th>Вага, кг</th>
                  </tr>
                </thead>

                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
          `;
        })
        .join("");
    }

    calcBtn.addEventListener(
      "click",
      function () {
        try {
          const rows = parseCSV(
            rateCSV.value
          );

          const body =
            rows[0] &&
            /команда/i.test(
              rows[0][0] || ""
            )
              ? rows.slice(1)
              : rows;

          const byZone = groupByZone(
            body
          );

          renderTopLake(byZone);
          renderZonesAwards(byZone);

          const ready = document.getElementById(
            "awards-ready"
          );

          if (ready) {
            ready.style.display = "block";
          }

        } catch (error) {
          alert(
            "Помилка CSV: " +
              (error?.message || error)
          );
        }
      }
    );
  }

  /* =========================================================
     7. AUTO REGISTRATION WINDOWS
     ========================================================= */

  function initAutoRegButtons() {
    const stagesWrap = document.getElementById(
      "stages"
    );

    if (!stagesWrap) {
      return;
    }

    const DAY = 86400000;

    function toDate(value) {
      return value
        ? new Date(
            value + "T00:00:00"
          )
        : null;
    }

    stagesWrap
      .querySelectorAll(
        ".card[data-id][data-start]"
      )
      .forEach(card => {
        const id = card.dataset.id;

        const fallbackStart =
          `${CURRENT_SEASON_YEAR}-01-01`;

        const start = toDate(
          card.dataset.start ||
          fallbackStart
        );

        if (
          !id ||
          !start
        ) {
          return;
        }

        const open = card.dataset.regOpen
          ? toDate(
              card.dataset.regOpen
            )
          : new Date(
              start.getTime() -
              14 * DAY
            );

        const close = card.dataset.regClose
          ? toDate(
              card.dataset.regClose
            )
          : new Date(
              start.getTime() -
              6 * 3600 * 1000
            );

        let regBtn = card.querySelector(
          "[data-reg]"
        );

        if (!regBtn) {
          const buttons = card.querySelector(
            ".btns"
          ) || card.appendChild(
            Object.assign(
              document.createElement("div"),
              {
                className: "btns"
              }
            )
          );

          regBtn = document.createElement("a");

          regBtn.className =
            "btn btn--primary";

          regBtn.setAttribute(
            "data-reg",
            ""
          );

          regBtn.href =
            `register.html?stage=${encodeURIComponent(id)}`;

          buttons.prepend(regBtn);
        }

        const now = new Date();

        if (now < open) {
          regBtn.textContent =
            "Реєстрація скоро";

          regBtn.style.opacity = ".6";
          regBtn.style.pointerEvents = "none";

        } else if (now > close) {
          regBtn.textContent =
            "Реєстрацію закрито";

          regBtn.style.opacity = ".6";
          regBtn.style.pointerEvents = "none";

        } else {
          regBtn.textContent =
            "Реєстрація";

          regBtn.style.opacity = "";
          regBtn.style.pointerEvents = "";
        }
      });
  }

  /* =========================================================
     8. GO TO CABINET
     ========================================================= */

  function initGoCabinet() {
    const goCabinet = document.getElementById(
      "goCabinet"
    );

    if (!goCabinet) {
      return;
    }

    if (
      goCabinet.dataset.scCabinetInitialized === "1"
    ) {
      return;
    }

    goCabinet.dataset.scCabinetInitialized = "1";

    goCabinet.addEventListener(
      "click",
      function (event) {
        event.preventDefault();

        if (
          !window.firebase ||
          !window.firebase.auth
        ) {
          window.location.href =
            "/auth.html";

          return;
        }

        const user = window.firebase
          .auth()
          .currentUser;

        window.location.href = user
          ? "/cabinet.html"
          : "/auth.html";
      }
    );
  }

  /* =========================================================
     9. DOM INITIALIZATION

     Головне виправлення:

     Не запускаємо burger раніше,
     ніж HTML буде готовий.
     ========================================================= */

  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    /*
     * Header.
     */

    initHeaderBurger();

    /*
     * Icons.
     */

    injectIcons();

    /*
     * Optional modules.
     */

    initLivePage();
    initRatingAwards();
    initAutoRegButtons();
    initGoCabinet();

    console.log(
      "✅ STOLAR CARP config initialized"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );

  } else {
    init();
  }

})();

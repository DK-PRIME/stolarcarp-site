// assets/js/cabinet.js
// STOLAR CARP — Кабінет учасника
// Firebase compat 10.12.2
//
// VERSION: 20261008-cabinet-burger-fix-v9
//
// ✅ Мобільне меню
// ✅ Автоматичне створення кнопки burger
// ✅ Відкриття / закриття меню
// ✅ Закриття при натисканні поза меню
// ✅ Закриття після вибору пункту
// ✅ Підтримка Escape
//
// ✅ firstName = Ім'я
// ✅ lastName = Прізвище
// ✅ fullName = Прізвище Ім'я
// ✅ legacy fullName автоматично НЕ розбиваємо
//
// ✅ Редагування:
//    - Прізвище
//    - Ім'я
//    - Телефон
//    - Місто
//
// ✅ SOLO public_participants синхронізується
//    при зміні ПІБ
//
// ✅ TEAM-заявки НЕ перейменовуються
//
// ✅ Профіль
// ✅ Аватар Cloudinary
// ✅ Команда
// ✅ Склад команди
//
// ❌ cabinet.js НЕ працює з "Моя участь"
// ❌ cabinet.js НЕ читає competitions
// ❌ cabinet.js НЕ читає registrations
// ❌ cabinet.js НЕ рендерить #myCompetitions
//
// "Моя участь":
// assets/js/my_participation.js

(function () {
  "use strict";

  console.log(
    "✅ cabinet.js LOADED v20261008-cabinet-burger-fix-v9"
  );

  // =========================================================
  // BURGER MENU
  // =========================================================

  function initBurgerMenu() {
    const header = document.querySelector(".header");

    if (!header) {
      console.warn(
        "[cabinet] Header .header не знайдено"
      );
      return;
    }

    const nav = header.querySelector(".nav");

    if (!nav) {
      console.warn(
        "[cabinet] Навігацію .nav не знайдено"
      );
      return;
    }

    const headerRow =
      header.querySelector(".header__row") || header;

    let burger =
      header.querySelector("#burger") ||
      header.querySelector(".burger");

    // Якщо кнопки немає — створюємо.
    if (!burger) {
      burger = document.createElement("button");

      burger.id = "burger";
      burger.className = "burger";
      burger.type = "button";

      burger.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
      `;

      headerRow.appendChild(burger);

      console.log(
        "✅ Burger button created automatically"
      );
    }

    if (!burger.id) {
      burger.id = "burger";
    }

    burger.classList.add("burger");

    if (burger.tagName === "BUTTON") {
      burger.type = "button";
    }

    // Якщо HTML має інший вміст кнопки,
    // залишаємо три смужки.
    if (!burger.querySelector("span")) {
      burger.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
      `;
    }

    if (!nav.id) {
      nav.id = "cabinetMobileNav";
    }

    burger.setAttribute(
      "aria-controls",
      nav.id
    );

    burger.setAttribute(
      "aria-expanded",
      "false"
    );

    burger.setAttribute(
      "aria-label",
      "Відкрити меню"
    );

    // Не підключаємо події повторно.
    if (burger.dataset.scMenuInitialized === "1") {
      return;
    }

    burger.dataset.scMenuInitialized = "1";

    // =======================================================
    // MOBILE MENU STYLES
    // =======================================================

    // Додаткові стилі для випадків, коли
    // сторінка перевизначає main.css.

    if (!document.getElementById("scCabinetBurgerStyles")) {
      const style = document.createElement("style");

      style.id = "scCabinetBurgerStyles";

      style.textContent = `
        @media (max-width:860px) {

          .header .header__row {
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
          }

          .header .burger {
            display:flex !important;
            flex-direction:column;
            align-items:center;
            justify-content:center;

            flex:0 0 48px;

            width:48px;
            height:48px;

            padding:8px;

            position:relative;
            z-index:2100;

            visibility:visible !important;
            opacity:1 !important;

            pointer-events:auto !important;

            border:1px solid rgba(255,255,255,.15);
            border-radius:12px;

            background:rgba(255,255,255,.06);

            cursor:pointer;

            -webkit-tap-highlight-color:transparent;
          }

          .header .burger span {
            display:block;

            width:26px;
            height:3px;

            margin:3px 0;

            border-radius:3px;

            background:#ffffff;

            transition:
              transform .22s ease,
              opacity .22s ease;
          }

          .header .burger.active span:nth-child(1) {
            transform:translateY(9px) rotate(45deg);
          }

          .header .burger.active span:nth-child(2) {
            opacity:0;
          }

          .header .burger.active span:nth-child(3) {
            transform:translateY(-9px) rotate(-45deg);
          }

          .header .nav {
            position:absolute;

            left:12px;
            right:12px;

            top:calc(100% + 8px);

            z-index:2050;

            display:flex;
            flex-direction:column;
            align-items:center;

            gap:10px;

            width:auto;
            height:auto;

            max-height:calc(100dvh - 100px);

            padding:16px 14px;

            overflow-y:auto;
            -webkit-overflow-scrolling:touch;

            border:1px solid rgba(255,255,255,.12);
            border-radius:22px;

            background:
              linear-gradient(
                rgba(0,0,0,.58),
                rgba(0,0,0,.76)
              ),
              url("../dk-dva-kuma-banner.jpg")
              center / cover no-repeat;

            box-shadow:0 22px 60px rgba(0,0,0,.65);

            opacity:0;
            visibility:hidden;

            transform:translateY(-12px);

            pointer-events:none;

            transition:
              opacity .22s ease,
              transform .22s ease,
              visibility .22s ease;
          }

          .header .nav.open,
          .header .nav.active {
            opacity:1;
            visibility:visible;

            transform:translateY(0);

            pointer-events:auto;
          }

          .header .nav__link {
            display:inline-flex;
            align-items:center;
            justify-content:center;

            min-width:190px;
            max-width:78vw;

            padding:12px 18px;

            border-radius:999px;

            border:1px solid rgba(255,255,255,.20);

            background:rgba(0,0,0,.28);

            color:#f2f3f5;

            text-align:center;
            white-space:nowrap;

            font-size:1.02rem;
          }

        }

        @media (min-width:861px) {
          .header .burger {
            display:none !important;
          }
        }
      `;

      document.head.appendChild(style);
    }

    // =======================================================
    // OPEN / CLOSE
    // =======================================================

    function setMenuOpen(open) {
      const isOpen = Boolean(open);

      nav.classList.toggle("open", isOpen);

      // Прибираємо можливий конфлікт двох класів.
      nav.classList.remove("active");

      burger.classList.toggle("active", isOpen);

      burger.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

      burger.setAttribute(
        "aria-label",
        isOpen ? "Закрити меню" : "Відкрити меню"
      );
    }

    burger.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const isOpen =
        nav.classList.contains("open") ||
        nav.classList.contains("active");

      setMenuOpen(!isOpen);
    });

    nav.addEventListener("click", event => {
      const link = event.target.closest(".nav__link");

      if (link) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("click", event => {
      if (
        !burger.contains(event.target) &&
        !nav.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 860) {
        setMenuOpen(false);
      }
    });

    console.log(
      "✅ STOLAR CARP mobile burger initialized"
    );
  }

  // =========================================================
  // ADMIN
  // =========================================================

  const ADMIN_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  // =========================================================
  // FIREBASE WAIT
  // =========================================================

  async function waitFirebase(maxMs = 12000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxMs) {
      if (
        window.scAuth &&
        window.scDb &&
        window.firebase
      ) {
        return;
      }

      await new Promise(resolve => {
        setTimeout(resolve, 100);
      });
    }

    throw new Error("Firebase не готовий");
  }

  // =========================================================
  // CACHE
  // =========================================================

  const Cache = {
    data: {
      user: null,
      team: null,
      members: [],
      userLastUpdate: 0
    },

    isUserValid(maxAgeMs = 60000) {
      return Boolean(
        this.data.userLastUpdate &&
        Date.now() - this.data.userLastUpdate < maxAgeMs
      );
    },

    setUser(value) {
      this.data.user = value;
      this.data.userLastUpdate = Date.now();
    },

    setTeam(value) {
      this.data.team = value;
    },

    setMembers(value) {
      this.data.members = Array.isArray(value)
        ? value
        : [];
    },

    get(key) {
      return this.data[key];
    },

    clear() {
      this.data = {
        user: null,
        team: null,
        members: [],
        userLastUpdate: 0
      };
    }
  };

  // =========================================================
  // DOM
  // =========================================================

  let statusEl = null;
  let contentEl = null;
  let teamNameEl = null;
  let userFullNameEl = null;
  let userCityEl = null;
  let captainTextEl = null;
  let userRoleEl = null;
  let userPhoneEl = null;
  let joinCodePillEl = null;
  let joinCodeTextEl = null;
  let avatarWrapper = null;
  let avatarImgEl = null;
  let avatarPhEl = null;
  let membersEl = null;

  let editProfileBtn = null;
  let saveProfileBtn = null;
  let cancelProfileBtn = null;
  let profileEditBox = null;
  let lastNameInput = null;
  let firstNameInput = null;
  let phoneInput = null;
  let cityInput = null;
  let profileEditMsg = null;

  function initDom() {
    statusEl =
      document.getElementById("cabinetStatus");

    contentEl =
      document.getElementById("cabinetContent");

    teamNameEl =
      document.getElementById("teamNameText");

    userFullNameEl =
      document.getElementById("userFullName");

    userCityEl =
      document.getElementById("userCity");

    captainTextEl =
      document.getElementById("captainText");

    userRoleEl =
      document.getElementById("userRoleText");

    userPhoneEl =
      document.getElementById("userPhoneText");

    joinCodePillEl =
      document.getElementById("joinCodePill");

    joinCodeTextEl =
      document.getElementById("joinCodeText");

    avatarWrapper =
      document.getElementById("avatarWrapper");

    avatarImgEl =
      document.getElementById("cabinetAvatarImg");

    avatarPhEl =
      document.getElementById("cabinetAvatarPlaceholder");

    membersEl =
      document.getElementById("membersContainer");

    editProfileBtn =
      document.getElementById("editProfileBtn");

    saveProfileBtn =
      document.getElementById("saveProfileBtn");

    cancelProfileBtn =
      document.getElementById("cancelProfileBtn");

    profileEditBox =
      document.getElementById("profileEditBox");

    lastNameInput =
      document.getElementById("lastNameInput");

    firstNameInput =
      document.getElementById("firstNameInput");

    phoneInput =
      document.getElementById("phoneInput");

    cityInput =
      document.getElementById("cityInput");

    profileEditMsg =
      document.getElementById("profileEditMsg");
  }

  // =========================================================
  // STATE
  // =========================================================

  let isEditingProfile = false;
  let isSavingProfile = false;

  let lastProfileSnap = null;

  let unsubUser = null;
  let unsubTeam = null;
  let unsubMembers = null;

  let activeTeamId = "__INIT__";

  // =========================================================
  // HELPERS
  // =========================================================

  function setStatus(text) {
    if (statusEl) {
      statusEl.textContent = text || "";
    }
  }

  function showContent() {
    if (contentEl) {
      contentEl.style.display = "block";
    }
  }

  function hideContent() {
    if (contentEl) {
      contentEl.style.display = "none";
    }
  }

  function norm(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normLower(value) {
    return norm(value).toLowerCase();
  }

  function roleText(role) {
    if (role === "admin") {
      return "Адміністратор";
    }

    if (role === "judge") {
      return "Суддя";
    }

    if (role === "captain") {
      return "Капітан команди";
    }

    return "Учасник команди";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function serverTimestamp() {
    try {
      return window.firebase.firestore
        .FieldValue.serverTimestamp();
    } catch {
      return null;
    }
  }

  // =========================================================
  // NAME HELPERS
  // =========================================================

  function cleanNamePart(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
  }

  function buildFullName(lastName, firstName) {
    const last = cleanNamePart(lastName);
    const first = cleanNamePart(firstName);

    if (!last || !first) {
      return "";
    }

    return `${last} ${first}`;
  }

  function getDisplayName(userData) {
    const data = userData || {};

    const canonical = buildFullName(
      data.lastName,
      data.firstName
    );

    if (canonical) {
      return canonical;
    }

    return (
      norm(data.fullName) ||
      norm(data.name) ||
      ""
    );
  }

  function cleanPhone(value) {
    return String(value || "")
      .trim()
      .replace(/[^\d+\-\s()]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 25);
  }

  function cleanCity(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
  }

  // =========================================================
  // SOLO PUBLIC SYNC
  // =========================================================

  function isSoloPublicDoc(docId, data) {
    const d = data || {};

    if (normLower(d.entryType) === "solo") {
      return true;
    }

    if (norm(docId).includes("__solo__")) {
      return true;
    }

    return false;
  }

  async function syncSoloPublicParticipants(
    db,
    uid,
    firstName,
    lastName,
    fullName
  ) {
    const userUid = norm(uid);

    if (!userUid) {
      return {
        found: 0,
        updated: 0
      };
    }

    const snap = await db
      .collection("public_participants")
      .where("uid", "==", userUid)
      .get();

    if (snap.empty) {
      return {
        found: 0,
        updated: 0
      };
    }

    const refs = [];

    snap.forEach(doc => {
      const data = doc.data() || {};

      if (!isSoloPublicDoc(doc.id, data)) {
        return;
      }

      refs.push(doc.ref);
    });

    if (!refs.length) {
      return {
        found: snap.size,
        updated: 0
      };
    }

    // Firestore batch має обмеження.
    // Використовуємо невеликі групи.
    const BATCH_SIZE = 400;

    for (let start = 0; start < refs.length; start += BATCH_SIZE) {
      const chunk = refs.slice(
        start,
        start + BATCH_SIZE
      );

      const batch = db.batch();

      chunk.forEach(ref => {
        const upd = {
          firstName,
          lastName,
          fullName,

          participantName: fullName,
          displayName: fullName,

          // Legacy compatibility
          captain: fullName
        };

        const ts = serverTimestamp();

        if (ts) {
          upd.updatedAt = ts;
        }

        batch.set(ref, upd, {
          merge: true
        });
      });

      await batch.commit();
    }

    console.log(
      "✅ SOLO public_participants synced:",
      refs.length,
      fullName
    );

    return {
      found: snap.size,
      updated: refs.length
    };
  }

  // =========================================================
  // AVATAR
  // =========================================================

  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPhEl) {
      return;
    }

    const cleanUrl = norm(url);

    if (cleanUrl) {
      avatarImgEl.src = cleanUrl;
      avatarImgEl.style.display = "block";

      avatarPhEl.style.display = "none";

      if (avatarWrapper) {
        avatarWrapper.style.cursor = "pointer";
      }

      return;
    }

    avatarImgEl.removeAttribute("src");
    avatarImgEl.style.display = "none";

    avatarPhEl.style.display = "block";

    if (avatarWrapper) {
      avatarWrapper.style.cursor = "default";
    }
  }

  // =========================================================
  // CLEANUP
  // =========================================================

  function stopTeamSubscriptions() {
    if (typeof unsubTeam === "function") {
      unsubTeam();
    }

    if (typeof unsubMembers === "function") {
      unsubMembers();
    }

    unsubTeam = null;
    unsubMembers = null;
  }

  function cleanup() {
    if (typeof unsubUser === "function") {
      unsubUser();
    }

    unsubUser = null;

    stopTeamSubscriptions();

    activeTeamId = "__INIT__";
  }

  // =========================================================
  // PROFILE EDIT HELPERS
  // =========================================================

  function setEditMsg(text, type) {
    if (!profileEditMsg) {
      return;
    }

    profileEditMsg.textContent = text || "";

    profileEditMsg.classList.remove(
      "ok",
      "err"
    );

    if (type === "ok") {
      profileEditMsg.classList.add("ok");
    }

    if (type === "err") {
      profileEditMsg.classList.add("err");
    }
  }

  function fillProfileInputs(userData) {
    const data = userData || {};

    // Legacy fullName не розділяємо.

    if (lastNameInput) {
      lastNameInput.value = norm(data.lastName);
    }

    if (firstNameInput) {
      firstNameInput.value = norm(data.firstName);
    }

    if (phoneInput) {
      phoneInput.value = norm(data.phone);
    }

    if (cityInput) {
      cityInput.value = norm(data.city);
    }
  }

  function openEditProfile(userData) {
    if (
      !profileEditBox ||
      !lastNameInput ||
      !firstNameInput ||
      !phoneInput ||
      !cityInput
    ) {
      return;
    }

    const data =
      userData ||
      lastProfileSnap ||
      {};

    isEditingProfile = true;

    lastProfileSnap = data;

    profileEditBox.style.display = "block";

    if (editProfileBtn) {
      editProfileBtn.style.display = "none";
    }

    if (saveProfileBtn) {
      saveProfileBtn.style.display = "inline-flex";
    }

    if (cancelProfileBtn) {
      cancelProfileBtn.style.display = "inline-flex";
    }

    fillProfileInputs(data);

    if (
      getDisplayName(data) &&
      (
        !norm(data.lastName) ||
        !norm(data.firstName)
      )
    ) {
      setEditMsg(
        "Вкажіть окремо прізвище та імʼя. Старий ПІБ автоматично не розділяється.",
        ""
      );

      return;
    }

    setEditMsg("", "");
  }

  function closeEditProfile() {
    isEditingProfile = false;

    if (profileEditBox) {
      profileEditBox.style.display = "none";
    }

    if (editProfileBtn) {
      editProfileBtn.style.display = "inline-flex";
    }

    if (saveProfileBtn) {
      saveProfileBtn.style.display = "none";
    }

    if (cancelProfileBtn) {
      cancelProfileBtn.style.display = "none";
    }

    setEditMsg("", "");
  }

  // =========================================================
  // USER RENDER
  // =========================================================

  function renderUserInfo(userData) {
    const data = userData || {};

    const name =
      getDisplayName(data) ||
      "Без імені";

    const city = norm(data.city);

    if (userFullNameEl) {
      userFullNameEl.textContent = name;
    }

    if (userCityEl) {
      if (city) {
        userCityEl.textContent = city;
        userCityEl.style.display = "block";
      } else {
        userCityEl.textContent = "";
        userCityEl.style.display = "none";
      }
    }

    // Legacy HTML support
    if (captainTextEl) {
      captainTextEl.textContent =
        name + (city ? ` · ${city}` : "");
    }

    if (userRoleEl) {
      userRoleEl.textContent =
        roleText(data.role);
    }

    if (userPhoneEl) {
      userPhoneEl.textContent =
        norm(data.phone) || "—";
    }

    setAvatarUrl(
      data.avatarUrl ||
      data.photoURL ||
      ""
    );

    // Не змінюємо поля під час редагування.
    if (!isEditingProfile) {
      fillProfileInputs(data);
    }
  }

  // =========================================================
  // AVATAR POPUP
  // =========================================================

  function openImagePopup(imageUrl) {
    const popup =
      document.getElementById("avatarPopup");

    const popupImg =
      document.getElementById("avatarPopupImg");

    if (!popup || !popupImg || !imageUrl) {
      return;
    }

    popupImg.src = imageUrl;
    popup.style.display = "flex";

    document.body.style.overflow = "hidden";
  }

  function closeImagePopup() {
    const popup =
      document.getElementById("avatarPopup");

    if (!popup) {
      return;
    }

    popup.style.display = "none";
    document.body.style.overflow = "";
  }

  function enableAvatarPopup() {
    const popup =
      document.getElementById("avatarPopup");

    if (!popup) {
      return;
    }

    if (avatarWrapper && avatarImgEl) {
      avatarWrapper.addEventListener(
        "click",
        () => {
          if (
            avatarImgEl.style.display !== "none" &&
            avatarImgEl.src
          ) {
            openImagePopup(avatarImgEl.src);
          }
        }
      );
    }

    popup.addEventListener(
      "click",
      event => {
        if (
          event.target === popup ||
          event.target.id === "avatarPopupImg"
        ) {
          closeImagePopup();
        }
      }
    );

    document.addEventListener(
      "keydown",
      event => {
        if (event.key === "Escape") {
          closeImagePopup();
        }
      }
    );
  }

  // =========================================================
  // MEMBERS
  // =========================================================

  function renderMembers(list) {
    if (!membersEl) {
      return;
    }

    const members = Array.isArray(list)
      ? list
      : [];

    membersEl.innerHTML = "";

    if (members.length === 0) {
      membersEl.innerHTML =
        '<div class="form__hint">Склад команди поки порожній.</div>';

      return;
    }

    members
      .slice()
      .sort((a, b) => {
        const aCaptain =
          a?.role === "captain" ? 1 : 0;

        const bCaptain =
          b?.role === "captain" ? 1 : 0;

        if (aCaptain !== bCaptain) {
          return bCaptain - aCaptain;
        }

        return getDisplayName(a).localeCompare(
          getDisplayName(b),
          "uk"
        );
      })
      .forEach(member => {
        const name =
          getDisplayName(member) ||
          member.email ||
          "Учасник";

        const role =
          roleText(member.role);

        const avatarUrl = norm(
          member.avatarUrl ||
          member.photoURL ||
          ""
        );

        const hasAvatar =
          Boolean(avatarUrl);

        const row =
          document.createElement("div");

        row.className = "card";

        row.style.cssText =
          "padding:12px;margin-top:10px;display:flex;align-items:center;gap:12px;";

        const avatarHtml = hasAvatar
          ? `
            <div
              class="member-avatar-wrap"
              style="
                width:50px;
                height:50px;
                border-radius:50%;
                overflow:hidden;
                border:2px solid #facc15;
                cursor:pointer;
                flex-shrink:0;
              "
            >
              <img
                src="${escapeHtml(avatarUrl)}"
                alt=""
                style="
                  width:100%;
                  height:100%;
                  object-fit:cover;
                "
              >
            </div>
          `
          : `
            <div
              style="
                width:50px;
                height:50px;
                border-radius:50%;
                background:#1f2937;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:24px;
                flex-shrink:0;
              "
            >
              👤
            </div>
          `;

        row.innerHTML = `
          ${avatarHtml}

          <div style="min-width:0;">
            <div
              style="
                font-weight:800;
                overflow:hidden;
                text-overflow:ellipsis;
              "
            >
              ${escapeHtml(name)}
            </div>

            <div class="form__hint">
              ${escapeHtml(role)}
            </div>
          </div>
        `;

        if (hasAvatar) {
          const avatarWrap =
            row.querySelector(".member-avatar-wrap");

          if (avatarWrap) {
            avatarWrap.addEventListener(
              "click",
              event => {
                event.stopPropagation();
                openImagePopup(avatarUrl);
              }
            );
          }
        }

        membersEl.appendChild(row);
      });
  }

  // =========================================================
  // CACHE RENDER
  // =========================================================

  function renderFromCache() {
    const user = Cache.get("user");

    if (!Cache.isUserValid() || !user) {
      return false;
    }

    renderUserInfo(user);

    const team = Cache.get("team");
    const members = Cache.get("members");

    if (team) {
      if (teamNameEl) {
        teamNameEl.textContent =
          team.name || "Команда";
      }

      if (
        team.joinCode &&
        joinCodePillEl &&
        joinCodeTextEl
      ) {
        joinCodePillEl.style.display =
          "inline-flex";

        joinCodeTextEl.textContent =
          team.joinCode;
      } else if (joinCodePillEl) {
        joinCodePillEl.style.display = "none";
      }
    } else {
      if (teamNameEl) {
        teamNameEl.textContent = "Без команди";
      }

      if (joinCodePillEl) {
        joinCodePillEl.style.display = "none";
      }
    }

    renderMembers(members);

    return true;
  }

  // =========================================================
  // TEAM
  // =========================================================

  function subscribeTeam(db, teamId) {
    const id = norm(teamId);

    if (!id) {
      Cache.setTeam(null);
      Cache.setMembers([]);

      if (teamNameEl) {
        teamNameEl.textContent = "Без команди";
      }

      if (joinCodePillEl) {
        joinCodePillEl.style.display = "none";
      }

      renderMembers([]);

      return;
    }

    // TEAM DOCUMENT

    unsubTeam = db
      .collection("teams")
      .doc(id)
      .onSnapshot(
        snap => {
          if (!snap.exists) {
            Cache.setTeam(null);

            if (teamNameEl) {
              teamNameEl.textContent = "Команда";
            }

            if (joinCodePillEl) {
              joinCodePillEl.style.display = "none";
            }

            return;
          }

          const team = snap.data() || {};

          Cache.setTeam(team);

          if (teamNameEl) {
            teamNameEl.textContent =
              team.name || "Команда";
          }

          if (
            team.joinCode &&
            joinCodePillEl &&
            joinCodeTextEl
          ) {
            joinCodePillEl.style.display =
              "inline-flex";

            joinCodeTextEl.textContent =
              team.joinCode;
          } else if (joinCodePillEl) {
            joinCodePillEl.style.display = "none";
          }
        },

        err => {
          console.warn(
            "[cabinet] team:",
            err
          );
        }
      );

    // TEAM MEMBERS

    unsubMembers = db
      .collection("users")
      .where("teamId", "==", id)
      .onSnapshot(
        qs => {
          const list = [];

          qs.forEach(doc => {
            list.push({
              id: doc.id,
              ...(doc.data() || {})
            });
          });

          Cache.setMembers(list);
          renderMembers(list);
        },

        err => {
          console.warn(
            "[cabinet] members:",
            err
          );

          renderMembers(
            Cache.get("members") || []
          );
        }
      );
  }

  function ensureTeamSubscription(db, teamId) {
    const nextTeamId = norm(teamId);

    if (nextTeamId === activeTeamId) {
      return;
    }

    stopTeamSubscriptions();

    activeTeamId = nextTeamId;

    subscribeTeam(db, nextTeamId);
  }

  // =========================================================
  // USER
  // =========================================================

  function subscribeUser(db, uid) {
    const hasCache = renderFromCache();

    if (!hasCache) {
      setStatus("Завантаження…");
    }

    showContent();

    unsubUser = db
      .collection("users")
      .doc(uid)
      .onSnapshot(
        snap => {
          if (!snap.exists) {
            setStatus(
              "Анкета користувача не знайдена."
            );

            showContent();
            return;
          }

          const userData = snap.data() || {};

          Cache.setUser(userData);

          lastProfileSnap = userData;

          renderUserInfo(userData);

          ensureTeamSubscription(
            db,
            userData.teamId || ""
          );

          setStatus("Кабінет завантажено.");

          showContent();

          setTimeout(() => {
            if (
              statusEl?.textContent ===
              "Кабінет завантажено."
            ) {
              statusEl.textContent = "";
            }
          }, 700);
        },

        err => {
          console.error(
            "[cabinet] user:",
            err
          );

          if (!hasCache) {
            setStatus(
              "Помилка читання профілю."
            );
          }

          showContent();
        }
      );
  }

  // =========================================================
  // CLOUDINARY
  // =========================================================

  function setupCloudinaryWidget(auth, db) {
    const CLOUDINARY_CLOUD = "dxlr12gzc";
    const CLOUDINARY_PRESET = "avatar_upload";

    const openWidgetBtn =
      document.getElementById(
        "openCloudinaryWidget"
      );

    const msgEl =
      document.getElementById("avatarMsg");

    if (!openWidgetBtn || !window.cloudinary) {
      console.warn(
        "[cabinet] Cloudinary Widget не доступний"
      );
      return;
    }

    function setMsg(text, type) {
      if (!msgEl) {
        return;
      }

      msgEl.textContent = text || "";

      msgEl.classList.remove(
        "ok",
        "err"
      );

      if (type === "ok") {
        msgEl.classList.add("ok");
      }

      if (type === "err") {
        msgEl.classList.add("err");
      }
    }

    openWidgetBtn.addEventListener(
      "click",
      () => {
        const user = auth.currentUser;

        if (!user) {
          setMsg(
            "Увійдіть у акаунт",
            "err"
          );
          return;
        }

        const widget =
          window.cloudinary.createUploadWidget(
            {
              cloudName: CLOUDINARY_CLOUD,
              uploadPreset: CLOUDINARY_PRESET,

              folder: `avatars/${user.uid}`,

              sources: [
                "local",
                "camera"
              ],

              multiple: false,
              maxFileSize: 5000000,

              cropping: true,
              croppingAspectRatio: 1,
              showSkipCropButton: false,

              language: "uk",

              styles: {
                palette: {
                  window: "#0f172a",
                  sourceBg: "#1e293b",
                  windowBorder: "#facc15",
                  tabIcon: "#facc15",
                  inactiveTabIcon: "#94a3b8",
                  menuIcons: "#facc15",
                  link: "#facc15",
                  action: "#facc15",
                  inProgress: "#f97316",
                  complete: "#22c55e",
                  error: "#ef4444",
                  textDark: "#020617",
                  textLight: "#e2e8f0"
                }
              }
            },

            async (error, result) => {
              if (error) {
                console.error(
                  "[cabinet] cloudinary:",
                  error
                );

                setMsg(
                  "Помилка завантаження",
                  "err"
                );

                return;
              }

              if (
                !result ||
                result.event !== "success"
              ) {
                return;
              }

              const secureUrl = norm(
                result.info?.secure_url
              );

              if (!secureUrl) {
                setMsg(
                  "Cloudinary не повернув URL",
                  "err"
                );
                return;
              }

              try {
                setMsg("Зберігаю…", "");

                const update = {
                  avatarUrl: secureUrl
                };

                const ts = serverTimestamp();

                if (ts) {
                  update.updatedAt = ts;
                }

                await db
                  .collection("users")
                  .doc(user.uid)
                  .set(update, {
                    merge: true
                  });

                setAvatarUrl(secureUrl);

                setMsg(
                  "Аватар оновлено!",
                  "ok"
                );

                setTimeout(() => {
                  setMsg("", "");
                }, 3000);
              } catch (err) {
                console.error(
                  "[cabinet] avatar save:",
                  err
                );

                setMsg(
                  "Помилка збереження",
                  "err"
                );
              }
            }
          );

        widget.open();
      }
    );
  }

  // =========================================================
  // PROFILE EDIT EVENTS
  // =========================================================

  function setupProfileEdit(auth, db) {
    if (
      !editProfileBtn ||
      !saveProfileBtn ||
      !cancelProfileBtn ||
      !profileEditBox ||
      !lastNameInput ||
      !firstNameInput ||
      !phoneInput ||
      !cityInput
    ) {
      console.warn(
        "⚠️ Profile Edit UI not found in HTML"
      );

      return;
    }

    // EDIT

    editProfileBtn.addEventListener(
      "click",
      () => {
        openEditProfile(
          lastProfileSnap ||
          Cache.get("user") ||
          {}
        );
      }
    );

    // CANCEL

    cancelProfileBtn.addEventListener(
      "click",
      () => {
        const current =
          lastProfileSnap ||
          Cache.get("user") ||
          {};

        fillProfileInputs(current);

        closeEditProfile();
      }
    );

    // SAVE

    saveProfileBtn.addEventListener(
      "click",
      async () => {
        if (isSavingProfile) {
          return;
        }

        const user = auth.currentUser;

        if (!user) {
          setEditMsg(
            "Увійдіть у акаунт.",
            "err"
          );
          return;
        }

        const lastName = cleanNamePart(
          lastNameInput.value
        );

        const firstName = cleanNamePart(
          firstNameInput.value
        );

        const phone = cleanPhone(
          phoneInput.value
        );

        const city = cleanCity(
          cityInput.value
        );

        if (!lastName) {
          setEditMsg(
            "Вкажіть прізвище.",
            "err"
          );

          lastNameInput.focus();
          return;
        }

        if (!firstName) {
          setEditMsg(
            "Вкажіть імʼя.",
            "err"
          );

          firstNameInput.focus();
          return;
        }

        if (!phone) {
          setEditMsg(
            "Вкажіть номер телефону.",
            "err"
          );

          phoneInput.focus();
          return;
        }

        const fullName = buildFullName(
          lastName,
          firstName
        );

        if (!fullName) {
          setEditMsg(
            "Не вдалося сформувати ПІБ.",
            "err"
          );
          return;
        }

        const previous =
          lastProfileSnap ||
          Cache.get("user") ||
          {};

        const nameChanged =
          norm(previous.lastName) !== lastName ||
          norm(previous.firstName) !== firstName;

        try {
          isSavingProfile = true;
          saveProfileBtn.disabled = true;

          setEditMsg("Зберігаю…", "");

          // ===============================================
          // 1. USERS
          // ===============================================

          const localUpdate = {
            lastName,
            firstName,
            fullName,
            phone,
            city: city || ""
          };

          const firestoreUpdate = {
            ...localUpdate
          };

          const ts = serverTimestamp();

          if (ts) {
            firestoreUpdate.updatedAt = ts;
          }

          await db
            .collection("users")
            .doc(user.uid)
            .set(firestoreUpdate, {
              merge: true
            });

          // ===============================================
          // 2. SOLO PUBLIC SYNC
          // ===============================================

          let publicSyncError = null;
          let publicSyncResult = null;

          if (nameChanged) {
            try {
              publicSyncResult =
                await syncSoloPublicParticipants(
                  db,
                  user.uid,
                  firstName,
                  lastName,
                  fullName
                );
            } catch (syncError) {
              publicSyncError = syncError;

              console.error(
                "❌ SOLO public_participants sync error:",
                syncError
              );
            }
          }

          // ===============================================
          // 3. LOCAL CACHE
          // ===============================================

          lastProfileSnap = {
            ...previous,
            ...localUpdate
          };

          Cache.setUser(lastProfileSnap);

          renderUserInfo(lastProfileSnap);

          // ===============================================
          // RESULT
          // ===============================================

          if (publicSyncError) {
            setEditMsg(
              `Профіль збережено: ${fullName}. Але SOLO-заявки не синхронізовано.`,
              "err"
            );

            return;
          }

          if (
            nameChanged &&
            publicSyncResult?.updated > 0
          ) {
            setEditMsg(
              `Збережено: ${fullName}. SOLO-заявки оновлено.`,
              "ok"
            );
          } else {
            setEditMsg(
              `Збережено: ${fullName}`,
              "ok"
            );
          }

          setTimeout(() => {
            closeEditProfile();
          }, 700);
        } catch (error) {
          console.error(
            "[cabinet] profile save:",
            error
          );

          setEditMsg(
            "Помилка збереження. Перевірте правила доступу.",
            "err"
          );
        } finally {
          isSavingProfile = false;
          saveProfileBtn.disabled = false;
        }
      }
    );
  }

  // =========================================================
  // INIT
  // =========================================================

  async function initCabinet() {
    // DOM завантажений.
    initDom();

    // Мобільне меню не залежить від Firebase.
    initBurgerMenu();

    try {
      const hasUserCache =
        renderFromCache();

      if (hasUserCache) {
        showContent();
        setStatus("Оновлення…");
      } else {
        setStatus("Завантаження…");
      }

      await waitFirebase();

      const auth = window.scAuth;
      const db = window.scDb;

      auth.onAuthStateChanged(user => {
        cleanup();

        if (!user) {
          Cache.clear();

          setStatus(
            "Ви не увійшли. Переходимо…"
          );

          hideContent();

          setTimeout(() => {
            window.location.href = "auth.html";
          }, 400);

          return;
        }

        if (user.uid === ADMIN_UID) {
          setStatus(
            "Адмін-акаунт → перехід…"
          );

          hideContent();

          setTimeout(() => {
            window.location.href = "admin.html";
          }, 200);

          return;
        }

        subscribeUser(db, user.uid);
      });

      setupCloudinaryWidget(auth, db);

      enableAvatarPopup();

      setupProfileEdit(auth, db);
    } catch (error) {
      console.error(
        "[cabinet] init:",
        error
      );

      setStatus(
        "Помилка: " +
        (error?.message || error)
      );

      showContent();
    }
  }

  // =========================================================
  // DOM READY
  // =========================================================

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initCabinet,
      { once: true }
    );
  } else {
    initCabinet();
  }

})();

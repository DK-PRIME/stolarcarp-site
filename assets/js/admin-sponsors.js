// assets/js/admin-sponsors.js
// STOLAR CARP • Sponsors Admin
//
// ✅ доступ тільки users/{uid}.role === "admin"
// ✅ перегляд заявок
// ✅ підтвердження / відхилення
// ✅ додавання / редагування спонсорів
// ✅ приховування / видалення
// ✅ Firestore compat SDK

(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  let auth = null;
  let db = null;

  let applications = [];
  let sponsors = [];

  const accessCard = $("saAccessCard");
  const accessStatus = $("saAccessStatus");
  const adminContent = $("saAdminContent");

  const applicationsList = $("saApplicationsList");
  const sponsorsList = $("saSponsorsList");

  const sponsorForm = $("saSponsorForm");
  const formMessage = $("saFormMessage");

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function setMessage(message) {
    if (formMessage) {
      formMessage.textContent = message || "";
    }
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = text(content);
    }

    return node;
  }

  function addLine(parent, label, value) {
    const line = el("div", "sa-item-line");

    const strong = el("strong", "", label + ": ");

    line.appendChild(strong);
    line.appendChild(document.createTextNode(text(value) || "—"));

    parent.appendChild(line);
  }

  function addButton(parent, label, className, callback) {
    const button = el("button", "sa-btn " + className, label);

    button.type = "button";

    button.addEventListener("click", callback);

    parent.appendChild(button);

    return button;
  }

  function validUrl(value) {
    const raw = text(value);

    if (!raw) return "";

    try {
      const url = new URL(raw, window.location.href);

      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        return "";
      }

      return url.href;
    } catch (_) {
      return "";
    }
  }

  async function waitForFirebase() {
    for (let i = 0; i < 140; i++) {
      if (window.scAuth && window.scDb) {
        auth = window.scAuth;
        db = window.scDb;
        return;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 100)
      );
    }

    throw new Error("Firebase недоступний.");
  }

  async function requireAdmin(user) {
    if (!user) return false;

    const snapshot = await db
      .collection("users")
      .doc(user.uid)
      .get();

    return snapshot.exists &&
      text(snapshot.data().role).toLowerCase() === "admin";
  }

  function showAccess(message, allowed) {
    if (accessStatus) {
      accessStatus.textContent = message;
    }

    if (allowed) {
      accessCard?.classList.add("sa-hidden");
      adminContent?.classList.remove("sa-hidden");
    } else {
      accessCard?.classList.remove("sa-hidden");
      adminContent?.classList.add("sa-hidden");
    }
  }

  function renderApplications() {
    if (!applicationsList) return;

    applicationsList.innerHTML = "";

    if (!applications.length) {
      applicationsList.appendChild(
        el("p", "sa-muted", "Заявок поки немає.")
      );
      return;
    }

    const typeLabels = {
      prizes: "Призи",
      products: "Продукція",
      financial: "Фінансова підтримка",
      other: "Інше"
    };

    applications.forEach(application => {
      const card = el("div", "sa-item");

      card.appendChild(
        el("div", "sa-item-title", application.name)
      );

      const statusLabels = {
        pending: "Нова заявка",
        approved: "Підтверджена",
        rejected: "Відхилена"
      };

      card.appendChild(
        el(
          "div",
          "sa-status",
          statusLabels[application.status] ||
          application.status
        )
      );

      addLine(card, "Контакт", application.contactName);
      addLine(card, "Телефон", application.contactPhone);
      addLine(card, "Email", application.contactEmail);
      addLine(card, "Сайт", application.websiteUrl);

      addLine(
        card,
        "Формат",
        typeLabels[application.supportType] ||
        application.supportType
      );

      addLine(card, "Пропозиція", application.message);

      const actions = el("div", "sa-actions");

      if (application.status === "pending") {
        addButton(
          actions,
          "✅ Підтвердити",
          "sa-btn--green",
          () => approveApplication(application)
        );

        addButton(
          actions,
          "❌ Відхилити",
          "sa-btn--red",
          () => rejectApplication(application)
        );
      }

      card.appendChild(actions);
      applicationsList.appendChild(card);
    });
  }

  function renderSponsors() {
    if (!sponsorsList) return;

    sponsorsList.innerHTML = "";

    if (!sponsors.length) {
      sponsorsList.appendChild(
        el("p", "sa-muted", "Спонсорів ще немає.")
      );
      return;
    }

    sponsors.forEach(sponsor => {
      const card = el("div", "sa-item");

      card.appendChild(
        el("div", "sa-item-title", sponsor.name)
      );

      addLine(
        card,
        "Статус",
        sponsor.active ? "Активний" : "Прихований"
      );

      addLine(card, "Сайт", sponsor.websiteUrl);
      addLine(card, "Логотип", sponsor.logoUrl);

      if (sponsor.logoUrl && validUrl(sponsor.logoUrl)) {
        const img = el("img", "sa-sponsor-logo");

        img.src = validUrl(sponsor.logoUrl);
        img.alt = sponsor.name;

        card.appendChild(img);
      }

      const actions = el("div", "sa-actions");

      addButton(
        actions,
        "✏️ Редагувати",
        "",
        () => editSponsor(sponsor)
      );

      addButton(
        actions,
        sponsor.active ? "🙈 Приховати" : "👁 Показати",
        "",
        () => toggleSponsor(sponsor)
      );

      addButton(
        actions,
        "🗑 Видалити",
        "sa-btn--red",
        () => deleteSponsor(sponsor)
      );

      card.appendChild(actions);
      sponsorsList.appendChild(card);
    });
  }

  async function loadApplications() {
    applicationsList.textContent = "Завантаження заявок…";

    const snapshot = await db
      .collection("sponsorApplications")
      .get();

    applications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    applications.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;

      return bTime - aTime;
    });

    renderApplications();
  }

  async function loadSponsors() {
    sponsorsList.textContent = "Завантаження спонсорів…";

    const snapshot = await db
      .collection("sponsors")
      .get();

    sponsors = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    sponsors.sort((a, b) =>
      (Number(a.sortOrder) || 999) -
      (Number(b.sortOrder) || 999)
    );

    renderSponsors();
  }

  async function approveApplication(application) {
    if (!confirm(
      "Підтвердити спонсора " + application.name + "?"
    )) return;

    try {
      const sponsorRef = db.collection("sponsors").doc();

      const batch = db.batch();

      batch.set(sponsorRef, {
        name: application.name,
        websiteUrl: application.websiteUrl || "",
        logoUrl: "",
        level: "partner",
        sortOrder: 100,
        active: true,
        applicationId: application.id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      batch.update(
        db.collection("sponsorApplications").doc(application.id),
        {
          status: "approved",
          sponsorId: sponsorRef.id,
          reviewedAt:
            firebase.firestore.FieldValue.serverTimestamp()
        }
      );

      await batch.commit();

      await Promise.all([
        loadApplications(),
        loadSponsors()
      ]);

      alert(
        "Спонсора підтверджено! Тепер можна додати логотип."
      );

    } catch (error) {
      console.error(error);
      alert("Помилка підтвердження: " + error.message);
    }
  }

  async function rejectApplication(application) {
    if (!confirm(
      "Відхилити заявку " + application.name + "?"
    )) return;

    try {
      await db
        .collection("sponsorApplications")
        .doc(application.id)
        .update({
          status: "rejected",
          reviewedAt:
            firebase.firestore.FieldValue.serverTimestamp()
        });

      await loadApplications();

    } catch (error) {
      console.error(error);
      alert("Помилка відхилення: " + error.message);
    }
  }

  function editSponsor(sponsor) {
    $("saEditId").value = sponsor.id;
    $("saName").value = sponsor.name || "";
    $("saWebsite").value = sponsor.websiteUrl || "";
    $("saLogo").value = sponsor.logoUrl || "";
    $("saLevel").value = sponsor.level || "partner";
    $("saSortOrder").value = sponsor.sortOrder ?? 100;
    $("saActive").value = String(sponsor.active === true);

    $("saFormTitle").textContent = "✏️ Редагувати спонсора";

    sponsorForm.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function resetForm() {
    sponsorForm.reset();

    $("saEditId").value = "";
    $("saFormTitle").textContent = "➕ Додати спонсора";

    setMessage("");
  }

  async function saveSponsor(event) {
    event.preventDefault();

    const id = text($("saEditId").value);

    const name = text($("saName").value);
    const websiteUrl = text($("saWebsite").value);
    const logoUrl = text($("saLogo").value);

    const level = text($("saLevel").value);
    const sortOrder = Number($("saSortOrder").value) || 100;

    const active = $("saActive").value === "true";

    if (!name) {
      setMessage("Вкажіть назву спонсора.");
      return;
    }

    if (websiteUrl && !validUrl(websiteUrl)) {
      setMessage("Невірне посилання на сайт.");
      return;
    }

    if (logoUrl && !validUrl(logoUrl)) {
      setMessage("Невірне посилання на логотип.");
      return;
    }

    const data = {
      name,
      websiteUrl,
      logoUrl,
      level,
      sortOrder,
      active,
      updatedAt:
        firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (id) {
        await db.collection("sponsors").doc(id).update(data);
      } else {
        data.createdAt =
          firebase.firestore.FieldValue.serverTimestamp();

        await db.collection("sponsors").add(data);
      }

      resetForm();
      await loadSponsors();

      setMessage("✅ Спонсора збережено.");

    } catch (error) {
      console.error(error);
      setMessage("❌ Помилка: " + error.message);
    }
  }

  async function toggleSponsor(sponsor) {
    try {
      await db
        .collection("sponsors")
        .doc(sponsor.id)
        .update({
          active: !sponsor.active,
          updatedAt:
            firebase.firestore.FieldValue.serverTimestamp()
        });

      await loadSponsors();

    } catch (error) {
      console.error(error);
      alert("Помилка: " + error.message);
    }
  }

  async function deleteSponsor(sponsor) {
    if (!confirm(
      "Видалити спонсора " + sponsor.name + "?"
    )) return;

    try {
      await db
        .collection("sponsors")
        .doc(sponsor.id)
        .delete();

      await loadSponsors();

    } catch (error) {
      console.error(error);
      alert("Помилка видалення: " + error.message);
    }
  }

  async function init() {
    showAccess("Підключення Firebase…", false);

    try {
      await waitForFirebase();

      auth.onAuthStateChanged(async user => {
        if (!user) {
          showAccess(
            "Потрібно увійти через admin.html.",
            false
          );
          return;
        }

        try {
          const isAdmin = await requireAdmin(user);

          if (!isAdmin) {
            showAccess(
              "Доступ заборонено. Потрібна роль admin.",
              false
            );
            return;
          }

          showAccess("", true);

          await Promise.all([
            loadApplications(),
            loadSponsors()
          ]);

        } catch (error) {
          console.error(error);

          showAccess(
            "Помилка доступу або завантаження: " +
            error.message,
            false
          );
        }
      });

      sponsorForm?.addEventListener("submit", saveSponsor);

      $("saCancelEdit")?.addEventListener(
        "click",
        resetForm
      );

    } catch (error) {
      console.error(error);
      showAccess(error.message, false);
    }
  }

  init();

})();

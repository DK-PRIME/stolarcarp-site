// assets/js/cabinet.js — STOLAR CARP (cabinet.html)

import { auth, db } from "../../firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const guestView = document.getElementById("guestView");
  const userView  = document.getElementById("userView");
  const errorView = document.getElementById("errorView");

  const teamNameEl    = document.getElementById("teamNameValue");
  const captainNameEl = document.getElementById("captainNameValue");
  const phoneEl       = document.getElementById("phoneValue");
  const emailEl       = document.getElementById("emailValue");
  const roleEl        = document.getElementById("roleValue");
  const appsBody      = document.getElementById("applicationsBody");

  const showGuest = () => {
    if (guestView) guestView.style.display = "block";
    if (userView)  userView.style.display  = "none";
    if (errorView) errorView.style.display = "none";
  };
  const showUser = () => {
    if (guestView) guestView.style.display = "none";
    if (userView)  userView.style.display  = "grid";
    if (errorView) errorView.style.display = "none";
  };
  const showError = () => {
    if (guestView) guestView.style.display = "none";
    if (userView)  userView.style.display  = "none";
    if (errorView) errorView.style.display = "block";
  };

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showGuest();
      return;
    }

    showUser();
    if (emailEl) emailEl.textContent = user.email || "—";

    try {
      // 1. профіль з users/{uid}
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) {
        if (teamNameEl)    teamNameEl.textContent    = "Профіль ще не заповнено";
        if (captainNameEl) captainNameEl.textContent = "—";
        if (phoneEl)       phoneEl.textContent       = "—";
        if (roleEl)        roleEl.textContent        = "—";
        if (appsBody) {
          appsBody.innerHTML =
            '<tr><td colspan="4">Немає заявок або профіль ще не завершено.</td></tr>';
        }
        return;
      }

      const u = userSnap.data();
      const teamId = u.teamId || null;

      if (roleEl) {
        roleEl.textContent =
          u.role === "captain"
            ? "Капітан"
            : u.role === "member"
            ? "Учасник"
            : "—";
      }

      if (phoneEl) phoneEl.textContent = u.phone || "—";

      // 2. команда
      if (teamId) {
        const teamSnap = await getDoc(doc(db, "teams", teamId));
        if (teamSnap.exists()) {
          const t = teamSnap.data();
          if (teamNameEl)    teamNameEl.textContent    = t.name || "—";
          if (captainNameEl) captainNameEl.textContent = t.captainName || u.fullName || "—";
        } else {
          if (teamNameEl)    teamNameEl.textContent    = "Команда не знайдена";
          if (captainNameEl) captainNameEl.textContent = u.fullName || "—";
        }
      } else {
        if (teamNameEl)    teamNameEl.textContent    = "Без команди";
        if (captainNameEl) captainNameEl.textContent = u.fullName || "—";
      }

      // 3. заявки на етапи (колекція registrations, фільтр по userUid)
      if (appsBody) {
        const q = query(
          collection(db, "registrations"),
          where("userUid", "==", user.uid),
          orderBy("createdAt", "asc")
        );
        const appsSnap = await getDocs(q);

        if (appsSnap.empty) {
          appsBody.innerHTML =
            '<tr><td colspan="4">Поки що немає поданих заявок.</td></tr>';
        } else {
          let rows = "";
          appsSnap.forEach((docSnap) => {
            const a = docSnap.data();
            const stageName = a.stageName || a.stageId || "Етап";
            const status    = a.status || "в обробці";
            const pay       = a.paymentStatus || "очікує";
            const sector    = a.sector || "—";
            const zone      = a.zone ? `Зона ${a.zone}` : "—";

            const statusClass =
              status === "confirmed"
                ? "status-pill status-pill--ok"
                : "status-pill status-pill--pending";

            rows += `
              <tr>
                <td>${stageName}</td>
                <td><span class="${statusClass}">${status}</span></td>
                <td>${pay}</td>
                <td>${sector} / ${zone}</td>
              </tr>
            `;
          });
          appsBody.innerHTML = rows;
        }
      }
    } catch (err) {
      console.error("Помилка кабінету:", err);
      showError();
    }
  });
});

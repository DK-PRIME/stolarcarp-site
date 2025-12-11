// assets/js/auth.js
// Реєстрація акаунта + вхід. Пише у Firestore: users, teams.
// ПРАЦЮЄ ЧЕРЕЗ firebase-init.js (scAuth, scDb).

(function () {
  const auth = window.scAuth || window.auth;
  const db   = window.scDb   || window.db;

  if (!auth || !db) {
    console.error("Firebase не ініціалізовано. Перевір firebase-*-compat та firebase-init.js");
    return;
  }

  // Елементи форм
  const signupForm = document.getElementById("signupForm");
  const loginForm  = document.getElementById("loginForm");
  const signupMsg  = document.getElementById("signupMsg");
  const loginMsg   = document.getElementById("loginMsg");
  const signupBtn  = document.getElementById("signupBtn");
  const loginBtn   = document.getElementById("loginBtn");

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg" + (type ? " " + type : "");
  }

  function setLoading(btn, loading, labelDefault) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? "Зачекайте..." : labelDefault;
  }

  // ----------------- РЕЄСТРАЦІЯ -----------------
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(signupMsg, "", "");
      setLoading(signupBtn, true, "Створити акаунт");

      try {
        const email     = document.getElementById("signupEmail").value.trim();
        const password  = document.getElementById("signupPassword").value;
        const fullName  = document.getElementById("signupFullName").value.trim();
        const phoneFull = document.getElementById("signupPhone").value.trim();
        const city      = document.getElementById("signupCity").value.trim();

        const isCaptain = document.getElementById("signupRoleCaptain").checked;
        const teamName  = document.getElementById("signupTeamName").value.trim();
        let   joinCode  = document.getElementById("signupJoinCode").value.trim().toUpperCase();

        if (!email || !password || !fullName || !phoneFull || !city) {
          throw new Error("Заповніть усі обовʼязкові поля.");
        }
        if (password.length < 6) {
          throw new Error("Пароль має містити щонайменше 6 символів.");
        }
        if (isCaptain && !teamName) {
          throw new Error("Вкажіть назву команди.");
        }
        if (!isCaptain && !joinCode) {
          throw new Error("Вкажіть код приєднання до команди.");
        }

        // 1. Створюємо користувача в Auth
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid  = cred.user.uid;

        // 2. Створюємо / шукаємо команду
        let teamId = null;
        let finalJoinCode = joinCode;

        if (isCaptain) {
          // Новий teamId
          const teamRef = db.collection("teams").doc();
          teamId = teamRef.id;

          // Примітивний joinCode 6 символів
          finalJoinCode = (
            Math.random().toString(36).slice(2, 8) +
            Date.now().toString(36)
          ).toUpperCase().slice(0, 6);

          await teamRef.set({
            name: teamName,
            ownerUid: uid,
            joinCode: finalJoinCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          showMsg(
            signupMsg,
            `Акаунт створено! Код команди: ${finalJoinCode}. Зараз відкриється кабінет.`,
            "ok"
          );
        } else {
          // Учасник приєднується по joinCode
          const snap = await db.collection("teams")
            .where("joinCode", "==", finalJoinCode)
            .limit(1)
            .get();

          if (snap.empty) {
            throw new Error("Команду з таким кодом не знайдено.");
          }

          teamId = snap.docs[0].id;

          showMsg(
            signupMsg,
            "Акаунт створено та приєднано до команди. Зараз відкриється кабінет.",
            "ok"
          );
        }

        // 3. users/{uid} — ЄДИНА СХЕМА
        await db.collection("users").doc(uid).set({
          fullName,
          email,
          phone: phoneFull,
          city,
          role: isCaptain ? "captain" : "member",
          teamId: teamId || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 4. Редірект у кабінет
        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 800);

      } catch (err) {
        console.error(err);
        let text = err.message || "Сталася помилка під час реєстрації.";
        if (String(text).includes("auth/email-already-in-use")) {
          text = "Такий email вже використовується.";
        } else if (String(text).includes("auth/invalid-email")) {
          text = "Email має некоректний формат.";
        }
        showMsg(signupMsg, text, "err");
      } finally {
        setLoading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // ----------------- ВХІД -----------------
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(loginMsg, "", "");
      setLoading(loginBtn, true, "Увійти");

      try {
        const email    = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        if (!email || !password) {
          throw new Error("Введіть email та пароль.");
        }

        await auth.signInWithEmailAndPassword(email, password);

        showMsg(loginMsg, "Вхід успішний, переходимо у кабінет…", "ok");

        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 500);

      } catch (err) {
        console.error(err);
        let text = err.message || "Помилка входу.";
        if (String(text).includes("auth/wrong-password")) {
          text = "Невірний пароль.";
        } else if (String(text).includes("auth/user-not-found")) {
          text = "Користувача з таким email не знайдено.";
        }
        showMsg(loginMsg, text, "err");
      } finally {
        setLoading(loginBtn, false, "Увійти");
      }
    });
  }

  // Якщо вже залогінений і зайшов на auth.html — кидаємо у кабінет
  auth.onAuthStateChanged((user) => {
    if (user && window.location.pathname.endsWith("auth.html")) {
      window.location.href = "cabinet.html";
    }
  });
})();

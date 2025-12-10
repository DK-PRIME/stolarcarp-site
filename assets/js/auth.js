// assets/js/auth.js
// Реєстрація акаунта + вхід. Пише у Firestore: users, teams.

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований (auth.js)");
    return;
  }

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
        const joinCode  = document.getElementById("signupJoinCode").value.trim().toUpperCase();

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

        // 1. створюємо користувача в Auth
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid  = cred.user.uid;

        // 2. створюємо / знаходимо команду
        let teamId = null;
        let finalJoinCode = joinCode;

        if (isCaptain) {
          const teamRef = db.collection("teams").doc();
          teamId = teamRef.id;

          // Генеруємо joinCode, якщо не хочеш вручну
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
          // шукаємо команду по joinCode
          const snap = await db
            .collection("teams")
            .where("joinCode", "==", finalJoinCode)
            .get();

          if (snap.empty) {
            throw new Error("Команду з таким кодом не знайдено.");
          }
          const doc = snap.docs[0];
          teamId = doc.id;

          showMsg(
            signupMsg,
            "Акаунт створено та приєднано до команди. Зараз відкриється кабінет.",
            "ok"
          );
        }

        // 3. запис у users/{uid}
        await db.collection("users").doc(uid).set({
          fullName,
          email,
          phone: phoneFull,
          city,
          role: isCaptain ? "captain" : "member",
          teamId: teamId || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 900);

      } catch (err) {
        console.error(err);
        let text = err.message || "Сталася помилка під час реєстрації.";
        if (text.includes("auth/email-already-in-use")) {
          text = "Такий email вже використовується.";
        }
        if (text.includes("auth/invalid-email")) {
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
        }, 600);

      } catch (err) {
        console.error(err);
        let text = err.message || "Помилка входу.";
        if (text.includes("auth/wrong-password")) {
          text = "Невірний пароль.";
        } else if (text.includes("auth/user-not-found")) {
          text = "Користувача з таким email не знайдено.";
        }
        showMsg(loginMsg, text, "err");
      } finally {
        setLoading(loginBtn, false, "Увійти");
      }
    });
  }

  // якщо вже залогінений і зайшов на auth.html — кидаємо у кабінет
  auth.onAuthStateChanged((user) => {
    if (user && window.location.pathname.endsWith("auth.html")) {
      window.location.href = "cabinet.html";
    }
  });
})();

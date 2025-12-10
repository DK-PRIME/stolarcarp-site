// assets/js/auth.js
// Реєстрація акаунта + вхід для STOLAR CARP (COMPAT)

document.addEventListener("DOMContentLoaded", () => {
  // Перевіряємо, що Firebase ініціалізовано
  if (!window.firebase || !window.auth || !window.db) {
    console.error("Firebase не ініціалізовано. Перевір firebase-init.js");
    return;
  }

  const signupForm = document.getElementById("signupForm");
  const loginForm  = document.getElementById("loginForm");
  const signupMsg  = document.getElementById("signupMsg");
  const loginMsg   = document.getElementById("loginMsg");
  const signupBtn  = document.getElementById("signupBtn");
  const loginBtn   = document.getElementById("loginBtn");

  const showMsg = (el, text, type) => {
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg" + (type ? " " + type : "");
  };

  const setLoading = (btn, loading, labelDefault) => {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? "Зачекайте..." : labelDefault;
  };

  // ---------------------------------------------------
  // РЕЄСТРАЦІЯ НОВОГО АКАУНТА
  // ---------------------------------------------------
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(signupMsg, "", "");
      setLoading(signupBtn, true, "Створити акаунт");

      try {
        const email    = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;
        const fullName = document.getElementById("signupFullName").value.trim();

        const phoneCleanEl = document.getElementById("signupPhoneClean");
        const cityEl       = document.getElementById("signupCity");

        const phoneDigits = phoneCleanEl.value.replace(/\D/g, "").slice(0, 9);
        const phone       = phoneDigits ? "+380" + phoneDigits : "";

        const city        = cityEl.value.trim();

        const isCaptain   = document.getElementById("signupRoleCaptain").checked;
        const teamName    = document.getElementById("signupTeamName").value.trim();
        const joinCodeRaw = document.getElementById("signupJoinCode").value.trim();

        // Валідація
        if (!email || !password || !fullName || !phoneDigits || !city) {
          throw new Error("Заповніть всі обовʼязкові поля.");
        }
        if (password.length < 6) {
          throw new Error("Пароль має містити щонайменше 6 символів.");
        }
        if (isCaptain && !teamName) {
          throw new Error("Вкажіть назву команди для капітана.");
        }
        if (!isCaptain && !joinCodeRaw) {
          throw new Error("Вкажіть код приєднання до команди.");
        }

        // 1. Створюємо користувача в Firebase Auth
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid  = cred.user.uid;

        // 2. Команда: або створюємо (капітан), або шукаємо по коду (учасник)
        let teamId;
        let finalJoinCode = joinCodeRaw;

        if (isCaptain) {
          // Створюємо нову команду
          const teamRef = db.collection("teams").doc();
          teamId = teamRef.id;

          // Генеруємо код приєднання (6 символів)
          finalJoinCode = (
            Math.random().toString(36).slice(2, 8) +
            Date.now().toString(36)
          )
            .toUpperCase()
            .slice(0, 6);

          await teamRef.set({
            name: teamName,
            ownerUid: uid,
            joinCode: finalJoinCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Шукаємо існуючу команду по joinCode
          const joinCode = joinCodeRaw.trim().toUpperCase();
          const snap = await db
            .collection("teams")
            .where("joinCode", "==", joinCode)
            .limit(1)
            .get();

          if (snap.empty) {
            throw new Error("Команду з таким кодом не знайдено.");
          }
          teamId = snap.docs[0].id;
        }

        // 3. Записуємо профіль користувача в Firestore
        await db.collection("users").doc(uid).set({
          fullName,
          email,
          phone,
          city,
          role: isCaptain ? "captain" : "member",
          teamId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 4. Повідомлення
        if (isCaptain) {
          showMsg(
            signupMsg,
            `Акаунт створено! Код вашої команди: ${finalJoinCode}. Зараз відкриється кабінет.`,
            "ok"
          );
        } else {
          showMsg(
            signupMsg,
            "Акаунт створено та приєднано до команди. Зараз відкриється кабінет.",
            "ok"
          );
        }

        // 5. Редірект у кабінет
        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 900);

      } catch (err) {
        console.error(err);
        let text = err.message || "Сталася помилка під час реєстрації.";

        if (text.includes("auth/email-already-in-use")) {
          text = "Такий email вже використовується.";
        } else if (text.includes("auth/weak-password")) {
          text = "Пароль занадто простий (мінімум 6 символів).";
        }

        showMsg(signupMsg, text, "err");
      } finally {
        setLoading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // ---------------------------------------------------
  // ВХІД У ВЖЕ ІСНУЮЧИЙ АКАУНТ
  // ---------------------------------------------------
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

  // Якщо вже залогінений і відкрив auth.html — кидаємо у кабінет
  auth.onAuthStateChanged((user) => {
    if (user && window.location.pathname.endsWith("auth.html")) {
      window.location.href = "cabinet.html";
    }
  });
});

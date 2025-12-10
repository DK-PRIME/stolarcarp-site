// assets/js/auth.js  — STOLAR CARP (auth.html)

import { auth, db } from "../../firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
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

  // -------------------- РЕЄСТРАЦІЯ --------------------
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(signupMsg, "", "");
      setLoading(signupBtn, true, "Створити акаунт");

      try {
        const email     = document.getElementById("signupEmail").value.trim();
        const password  = document.getElementById("signupPassword").value;
        const fullName  = document.getElementById("signupFullName").value.trim();
        const phone     = document.getElementById("signupPhone").value.trim();
        const city      = document.getElementById("signupCity").value.trim();
        const isCaptain = document.getElementById("signupRoleCaptain").checked;
        const teamName  = document.getElementById("signupTeamName").value.trim();
        const joinCode  = document.getElementById("signupJoinCode").value.trim();

        if (!email || !password || !fullName || !phone || !city) {
          throw new Error("Заповніть усі обовʼязкові поля.");
        }
        if (isCaptain && !teamName) {
          throw new Error("Вкажіть назву команди.");
        }
        if (!isCaptain && !joinCode) {
          throw new Error("Вкажіть код приєднання до команди.");
        }

        // 1. створюємо користувача
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid  = cred.user.uid;

        // 2. створюємо / знаходимо команду
        let teamId;
        let finalJoinCode = joinCode;

        if (isCaptain) {
          // нова команда
          const teamRef = doc(collection(db, "teams"));
          teamId = teamRef.id;

          // простий код 6 символів
          finalJoinCode = (
            Math.random().toString(36).slice(2, 8) +
            Date.now().toString(36)
          )
            .toUpperCase()
            .slice(0, 6);

          await setDoc(teamRef, {
            name: teamName,
            ownerUid: uid,
            joinCode: finalJoinCode,
            createdAt: serverTimestamp()
          });
        } else {
          // шукаємо існуючу команду по joinCode
          const q = query(
            collection(db, "teams"),
            where("joinCode", "==", joinCode.toUpperCase())
          );
          const snap = await getDocs(q);

          if (snap.empty) {
            throw new Error("Команду з таким кодом не знайдено.");
          }
          teamId = snap.docs[0].id;
        }

        // 3. записуємо профіль користувача в users/{uid}
        await setDoc(doc(db, "users", uid), {
          fullName,
          email,
          phone,
          city,
          role: isCaptain ? "captain" : "member",
          teamId,
          createdAt: serverTimestamp()
        });

        showMsg(
          signupMsg,
          isCaptain
            ? `Акаунт створено! Код команди: ${finalJoinCode}. Зараз відкриється кабінет.`
            : "Акаунт створено та приєднано до команди. Зараз відкриється кабінет.",
          "ok"
        );

        // 4. редірект у кабінет
        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 900);

      } catch (err) {
        console.error(err);
        let text = err.message || "Сталася помилка під час реєстрації.";

        if (text.includes("auth/email-already-in-use")) {
          text = "Такий email вже використовується.";
        } else if (text.includes("auth/weak-password")) {
          text = "Пароль занадто простий. Мінімум 6 символів.";
        }

        showMsg(signupMsg, text, "err");
      } finally {
        setLoading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // -------------------- ВХІД --------------------
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

        await signInWithEmailAndPassword(auth, email, password);

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
  onAuthStateChanged(auth, (user) => {
    if (user && window.location.pathname.endsWith("auth.html")) {
      window.location.href = "cabinet.html";
    }
  });
});

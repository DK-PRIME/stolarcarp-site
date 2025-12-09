// assets/js/auth.js

document.addEventListener("DOMContentLoaded", () => {
  const regEmail       = document.getElementById("regEmail");
  const regPassword    = document.getElementById("regPassword");
  const regFullName    = document.getElementById("regFullName");
  const regPhone       = document.getElementById("regPhone");
  const regCity        = document.getElementById("regCity");
  const regTeamName    = document.getElementById("regTeamName");
  const regJoinCode    = document.getElementById("regJoinCode");
  const regMessage     = document.getElementById("regMessage");

  const loginEmail     = document.getElementById("loginEmail");
  const loginPassword  = document.getElementById("loginPassword");
  const loginMessage   = document.getElementById("loginMessage");

  const btnRegister    = document.getElementById("btnRegister");
  const btnLogin       = document.getElementById("btnLogin");

  const blockCaptain   = document.getElementById("teamBlockCaptain");
  const blockMember    = document.getElementById("teamBlockMember");
  const roleRadios     = document.querySelectorAll('input[name="role"]');

  // Перемикач ролі (капітан / учасник)
  roleRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked && radio.value === "captain") {
        blockCaptain.style.display = "block";
        blockMember.style.display = "none";
      }
      if (radio.checked && radio.value === "member") {
        blockCaptain.style.display = "none";
        blockMember.style.display = "block";
      }
    });
  });

  // Допоміжна функція генерації JOIN-коду
  function generateJoinCode() {
    const num = Math.floor(100000 + Math.random() * 900000); // 6 цифр
    return "SC-" + num;
  }

  // -------------------------
  //   РЕЄСТРАЦІЯ НОВОГО АКАНТА
  // -------------------------
  btnRegister.addEventListener("click", async () => {
    regMessage.textContent = "";

    const email    = regEmail.value.trim();
    const password = regPassword.value.trim();
    const fullName = regFullName.value.trim();
    const phone    = regPhone.value.trim();
    const city     = regCity.value.trim();

    // Яку роль вибрано
    const roleEl = Array.from(roleRadios).find(r => r.checked);
    const role   = roleEl ? roleEl.value : "captain";

    if (!email || !password || !fullName || !phone || !city) {
      regMessage.textContent = "Заповни всі поля.";
      return;
    }

    if (password.length < 6) {
      regMessage.textContent = "Пароль має містити мінімум 6 символів.";
      return;
    }

    try {
      // 1. Створюємо користувача у Firebase Auth
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid  = cred.user.uid;

      // 2. Якщо КАПІТАН – створюємо команду
      if (role === "captain") {
        const teamName = regTeamName.value.trim();
        if (!teamName) {
          regMessage.textContent = "Введи назву команди.";
          return;
        }

        const joinCode = generateJoinCode();

        // Команда
        await db.collection("teams").doc(uid).set({
          teamName,
          captainUid: uid,
          members: [uid], // масив учасників, капітан теж у списку
          joinCode,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Учасник (капітан) у participants
        await db.collection("participants").doc(uid).set({
          email,
          fullName,
          phone,
          city,
          roleInTeam: "captain",
          teamId: uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        regMessage.style.color = "#22c55e";
        regMessage.textContent = "Акаунт капітана та команди створено успішно.";

      } else {
        // 3. Якщо УЧАСНИК – шукаємо команду за JOIN-кодом
        const joinCode = regJoinCode.value.trim();
        if (!joinCode) {
          regMessage.textContent = "Введи JOIN-код команди від капітана.";
          return;
        }

        const teamSnap = await db.collection("teams")
          .where("joinCode", "==", joinCode)
          .limit(1)
          .get();

        if (teamSnap.empty) {
          regMessage.textContent = "Команду з таким кодом не знайдено.";
          return;
        }

        const teamDoc  = teamSnap.docs[0];
        const teamData = teamDoc.data();
        const teamId   = teamDoc.id;

        const members = Array.isArray(teamData.members) ? teamData.members : [];

        // 1 капітан + 2 учасники = максимум 3 в масиві
        if (members.length >= 3) {
          regMessage.textContent = "Команда вже у повному складі (3 учасники).";
          return;
        }

        // Додаємо учасника в participants
        await db.collection("participants").doc(uid).set({
          email,
          fullName,
          phone,
          city,
          roleInTeam: "member",
          teamId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Додаємо uid у масив members
        await db.collection("teams").doc(teamId).update({
          members: firebase.firestore.FieldValue.arrayUnion(uid)
        });

        regMessage.style.color = "#22c55e";
        regMessage.textContent = "Акаунт учасника створено та прив'язано до команди.";
      }

      // Якщо все добре – перекидаємо в кабінет (пізніше його оформимо)
      setTimeout(() => {
        window.location.href = "/cabinet.html";
      }, 800);

    } catch (err) {
      console.error(err);
      regMessage.style.color = "#f97316";
      regMessage.textContent = "Помилка реєстрації: " + (err.message || err);
    }
  });

  // -------------------------
  //   ВХІД (LOGIN)
  // -------------------------
  btnLogin.addEventListener("click", async () => {
    loginMessage.textContent = "";

    const email    = loginEmail.value.trim();
    const password = loginPassword.value.trim();

    if (!email || !password) {
      loginMessage.textContent = "Введи email та пароль.";
      return;
    }

    try {
      await auth.signInWithEmailAndPassword(email, password);
      loginMessage.style.color = "#22c55e";
      loginMessage.textContent = "Успішний вхід.";
      setTimeout(() => {
        window.location.href = "/cabinet.html";
      }, 600);
    } catch (err) {
      console.error(err);
      loginMessage.style.color = "#f97316";
      loginMessage.textContent = "Помилка входу: " + (err.message || err);
    }
  });
});

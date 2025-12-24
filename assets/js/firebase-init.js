// assets/js/firebase-init.js
// STOLAR CARP • Firebase Init (глобальна ініціалізація)
(function () {
  if (window.scApp) return; // щоб не дублювалось

  const firebaseConfig = {
    apiKey: "AIzaSy...твій_ключ...",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxxxx",
    measurementId: "G-XXXXXXXXXX"
  };

  try {
    const app = firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    window.scApp = app;
    window.scAuth = auth;
    window.scDb = db;
    window.scStorage = storage;

    console.log("✅ Firebase ініціалізовано успішно.");
  } catch (err) {
    console.error("🔥 Помилка ініціалізації Firebase:", err);
  }
})();

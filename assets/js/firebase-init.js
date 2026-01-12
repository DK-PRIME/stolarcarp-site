// assets/js/firebase-init.js
(function () {
  "use strict";

  // ✅ ЄДИНИЙ глобальний ready (auth / admin / cabinet / register)
  if (window.scReady) return;

  window.scReady = (async () => {
    const firebaseConfig = {
      apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
      authDomain: "stolar-carp.firebaseapp.com",
      projectId: "stolar-carp",
      storageBucket: "stolar-carp.appspot.com",
      messagingSenderId: "1019636788370",
      appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
      measurementId: "G-VWC07QNS7P"
    };

    // ❗ Firebase compat SDK має бути підключений ДО цього файла
    if (!window.firebase) {
      console.error("❌ Firebase compat SDK не підключений на сторінці");
      throw new Error("firebase-sdk-missing");
    }

    // ✅ Ініціалізація ТІЛЬКИ один раз
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    } else {
      // ⚠️ якщо інший apiKey — це ламає auth
      const opt = window.firebase.apps[0]?.options || {};
      if (opt.apiKey && opt.apiKey !== firebaseConfig.apiKey) {
        console.warn(
          "⚠️ Firebase вже ініціалізований іншим apiKey!",
          opt.apiKey
        );
      }
    }

    // ✅ Єдина схема STOLAR CARP
    window.scApp  = window.firebase.apps[0];
    window.scAuth = window.firebase.auth();
    window.scDb   = window.firebase.firestore();

    try {
      window.scStorage = window.firebase.storage();
    } catch {
      window.scStorage = null;
    }

    // ✅ Firestore — стабільна поведінка + без сюрпризів кешу
    try {
      window.scDb.settings({
        cacheSizeBytes: window.firebase.firestore.CACHE_SIZE_UNLIMITED
      });
    } catch (e) {
      // settings можна викликати лише ДО першого запиту
      // якщо вже був доступ — просто ігноруємо
    }

    // ✅ AUTH: сесія не злітає при reload
    try {
      await window.scAuth.setPersistence(
        window.firebase.auth.Auth.Persistence.LOCAL
      );
    } catch (e) {
      console.warn("Auth persistence не встановлено", e);
    }

    // ✅ Anti-cache мітка (для Android reload)
    window.__scInitAt = Date.now();

    return true;
  })();
})();

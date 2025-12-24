// assets/js/firebase-init.js
(function () {
  "use strict";

  // ✅ один глобальний "ready", щоб auth/admin/cabinet/register чекали однаково
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

    // Firebase SDK (compat) має бути підключений на сторінці ДО цього файла
    if (!window.firebase) {
      console.warn("Firebase compat SDK не підключений на сторінці.");
      throw new Error("no-firebase-sdk");
    }

    // ✅ ініціалізація тільки один раз
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    } else {
      // якщо вже ініціалізовано іншим ключем — буде auth/api-key-not-valid
      const opt = window.firebase.apps[0]?.options || {};
      if (opt.apiKey && opt.apiKey !== firebaseConfig.apiKey) {
        console.warn("Firebase вже інітнутий іншим apiKey! Це ламає auth.", opt.apiKey);
      }
    }

    // ✅ експортуємо у твою “єдину схему”
    window.scApp  = window.firebase.apps[0];
    window.scAuth = window.firebase.auth();
    window.scDb   = window.firebase.firestore();

    try {
      window.scStorage = window.firebase.storage();
    } catch {
      window.scStorage = null;
    }

    // ✅ щоб сесія не злітала
    try {
      await window.scAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
    } catch {}

    return true;
  })();
})();

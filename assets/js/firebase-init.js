(function () {
  "use strict";

  // ✅ захист від подвійної ініціалізації (інколи скрипт можуть підключити двічі)
  if (window.__SC_FIREBASE_READY__) return;

  function init() {
    const firebaseConfig = window.__SC_FIREBASE_CONFIG__;
    if (!firebaseConfig) {
      console.warn("Firebase config missing: window.__SC_FIREBASE_CONFIG__");
      return;
    }

    if (!window.firebase) {
      console.warn("Firebase SDK not loaded");
      return;
    }

    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }

    window.scAuth = window.firebase.auth();
    window.scDb = window.firebase.firestore();

    // ✅ дуже корисно: Firestore ігнорує undefined (менше шансів на “undefined is not allowed”)
    try {
      window.scDb.settings({ ignoreUndefinedProperties: true });
    } catch {}

    window.__SC_FIREBASE_READY__ = true;
  }

  // якщо SDK вже підвантажився — інітимо одразу
  // якщо ні — defer скрипти все одно виконаються в порядку, і init відпрацює
  init();
})();

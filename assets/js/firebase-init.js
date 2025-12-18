// assets/js/firebase-init.js
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
    measurementId: "G-VWC07QNS7P"
  };

  function fail(msg, err) {
    console.error("[firebase-init]", msg, err || "");
    window.scFirebaseInitError = msg + (err?.message ? (": " + err.message) : "");
  }

  try {
    if (typeof window.firebase === "undefined") {
      fail("Firebase SDK (compat) не підключений. Перевір firebase-*-compat.js у HTML.");
      return;
    }

    // init app (один раз)
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }

    // auth
    try {
      window.scAuth = window.firebase.auth();
    } catch (e) {
      fail("Не підключений firebase-auth-compat.js", e);
    }

    // firestore
    try {
      window.scDb = window.firebase.firestore();
      // (опційно) щоб не було сюрпризів з офлайном на мобільному:
      // window.scDb.enablePersistence({ synchronizeTabs: true }).catch(()=>{});
    } catch (e) {
      fail("Не підключений firebase-firestore-compat.js", e);
    }

    // storage (не критично для адмінки)
    try {
      window.scStorage = window.firebase.storage();
    } catch (e) {}

    // сигнал “готово”
    window.dispatchEvent(new Event("sc-firebase-ready"));
    console.log("[firebase-init] OK");
  } catch (e) {
    fail("Критична помилка ініту", e);
  }
})();

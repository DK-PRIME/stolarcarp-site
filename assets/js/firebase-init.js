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
    window.scFirebaseError = msg;
  }

  if (typeof window.firebase === "undefined") {
    fail("Firebase SDK compat НЕ завантажився. Перевір script src firebase-*-compat.js");
    return;
  }

  try {
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {
    fail("initializeApp впав", e);
    return;
  }

  try { window.scAuth = window.firebase.auth(); }
  catch (e) { fail("auth() недоступний — нема firebase-auth-compat.js", e); }

  try { window.scDb = window.firebase.firestore(); }
  catch (e) { fail("firestore() недоступний — нема firebase-firestore-compat.js", e); }

  try { window.scStorage = window.firebase.storage(); }
  catch (e) { /* не критично */ }

  window.scFirebaseReady = !!(window.scAuth && window.scDb);
  console.log("[firebase-init] ready:", window.scFirebaseReady);
})();

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
    console.warn("[firebase-init]", msg, err || "");
    // щоб адмінка могла показати зрозумілу причину
    window.__SC_FB_ERROR__ = msg;
  }

  if (typeof window.firebase === "undefined") {
    fail("Firebase SDK compat не підключений (нема window.firebase).");
    return;
  }

  try {
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {
    fail("Не вдалося initializeApp()", e);
    return;
  }

  try {
    window.scAuth = window.firebase.auth();
  } catch (e) {
    fail("Не підключений firebase-auth-compat.js", e);
  }

  try {
    window.scDb = window.firebase.firestore();
  } catch (e) {
    fail("Не підключений firebase-firestore-compat.js", e);
  }

  try {
    window.scStorage = window.firebase.storage();
  } catch (e) {
    // не критично
  }
})();

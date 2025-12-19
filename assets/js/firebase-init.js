// assets/js/firebase-init.js
(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.appspot.com", // ✅ ВАЖЛИВО: правильний bucket
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
    measurementId: "G-VWC07QNS7P"
  };

  function init() {
    if (!window.firebase) {
      console.warn("Firebase compat SDK не підключений на сторінці.");
      return;
    }

    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }

    window.scAuth = window.firebase.auth();
    window.scDb = window.firebase.firestore();

    // storage буде тільки якщо підключений firebase-storage-compat.js
    try {
      window.scStorage = window.firebase.storage();
    } catch (e) {
      window.scStorage = null;
    }
  }

  init();
})();

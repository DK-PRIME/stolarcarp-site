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

  function init() {
    if (!window.firebase) {
      console.warn("Firebase compat SDK не підключений на сторінці.");
      return;
    }

    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }

    // глобальні хендли (єдина схема, як ми домовлялись)
    window.scAuth = window.firebase.auth();
    window.scDb = window.firebase.firestore();

    try {
      window.scStorage = window.firebase.storage();
    } catch (_) {}
  }

  init();
})();

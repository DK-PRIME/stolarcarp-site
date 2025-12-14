// assets/js/firebase-init.js
// ЄДИНА ініціалізація Firebase для STOLAR CARP + DK Prime
// Використовуємо compat-версію SDK (10.12.2) і глобальний об'єкт firebase.

(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b"
  };

  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  window.scAuth = auth;
  window.scDb = db;
  window.scStorage = storage;

  // сумісність
  window.auth = auth;
  window.db = db;
  window.storage = storage;
})();

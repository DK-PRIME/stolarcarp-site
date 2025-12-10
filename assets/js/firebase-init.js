// assets/js/firebase-init.js
// Єдиний ініт Firebase для STOLAR CARP (і далі для DK Prime)

(function () {
  // Конфіг твого проекту STOLAR CARP
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b"
  };

  // Ініціалізація (щоб не інітити двічі)
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // Наші "офіційні" хендли для всіх скриптів STOLAR CARP
  window.scAuth = auth;
  window.scDb = db;
  window.scStorage = storage;

  // Для сумісності зі старими скриптами
  window.auth = auth;
  window.db = db;
  window.storage = storage;
})();

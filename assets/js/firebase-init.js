// assets/js/firebase-init.js
// Підключається ПІСЛЯ compat-скриптів Firebase з CDN

(function () {
  // Конфіг твого проекту STOLAR CARP
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
    // measurementId можна не чіпати
  };

  // Ініціалізація (перевірка, щоб не інітити двічі)
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }

  // Глобальні змінні для всіх твоїх скриптів
  window.auth = firebase.auth();
  window.db = firebase.firestore();
  window.storage = firebase.storage();
})();

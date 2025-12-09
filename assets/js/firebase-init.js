// assets/js/firebase-init.js

// Конфіг твого проекту STOLAR CARP
const firebaseConfig = {
  apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
  authDomain: "stolar-carp.firebaseapp.com",
  projectId: "stolar-carp",
  storageBucket: "stolar-carp.firebasestorage.app",
  messagingSenderId: "1019636788370",
  appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
  measurementId: "G-VWC07QNS7P"
};

// Ініціалізація Firebase (compat-версія, щоб було простіше)
firebase.initializeApp(firebaseConfig);

// Робимо глобальні змінні, щоб можна було юзати в інших скриптах
window.auth = firebase.auth();
window.db = firebase.firestore();

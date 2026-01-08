<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Акаунт · STOLAR CARP</title>

  <link rel="icon" type="image/png" href="assets/favicon.png" />
  <link rel="apple-touch-icon" href="assets/favicon.png" />
  <meta name="theme-color" content="#020617" />

  <link rel="stylesheet" href="assets/css/main.css" />
  <script defer src="assets/js/config.js"></script>

  <style>
    body{ background: radial-gradient(circle at top,#111827 0,#020617 55%); }
    .wrap{ max-width:1100px; margin:0 auto; padding:22px 12px 80px; }

    .card{
      background:rgba(15,23,42,.92);
      border:1px solid rgba(148,163,184,.28);
      border-radius:18px;
      padding:16px;
      box-shadow:0 18px 40px rgba(0,0,0,.55);
    }

    .title{ font-weight:950; font-size:1.15rem; margin:0 0 6px; }
    .muted{ color:#9ca3af; }

    .grid2{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:14px;
      margin-top:14px;
    }
    @media (max-width: 900px){
      .grid2{ grid-template-columns:1fr; }
    }

    .field{ display:grid; gap:6px; margin-top:10px; }
    label{ color:#cbd5e1; font-size:.9rem; }
    input{
      width:100%;
      padding:10px 12px;
      border-radius:12px;
      border:1px solid rgba(148,163,184,.28);
      background:rgba(2,6,23,.55);
      color:#e5e7eb;
      outline:none;
    }
    input::placeholder{ color:#6b7280; }

    .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:12px; }

    .btn{
      display:inline-flex; align-items:center; justify-content:center;
      padding:12px 16px; border-radius:14px; text-decoration:none;
      border:1px solid rgba(148,163,184,.28);
      background:rgba(30,41,59,.65);
      color:#e5e7eb; font-weight:900;
      cursor:pointer;
    }
    .btn--accent{
      border-color: rgba(245,158,11,.35);
      background: linear-gradient(135deg, rgba(245,158,11,.22), rgba(190,18,60,.18));
    }

    .hr{ height:1px; background:rgba(148,163,184,.18); margin:12px 0; border-radius:99px; }

    .msg{ margin-top:10px; font-size:.92rem; }
    .msg.ok{ color:#22c55e; }
    .msg.err{ color:#ef4444; }

    /* Блок "вже увійшли" */
    .pill{
      display:inline-flex; gap:8px; align-items:center;
      padding:8px 10px; border-radius:999px;
      border:1px solid rgba(148,163,184,.28);
      background:rgba(2,6,23,.45);
      color:#e5e7eb; font-weight:800;
    }

    .role-box{
      display:flex; gap:14px; flex-wrap:wrap; padding:6px 0;
      color:#e5e7eb; font-size:.95rem;
    }
    .hint{ font-size:.86rem; color:#9ca3af; line-height:1.35; }
    .hidden{ display:none; }
  </style>
</head>

<body>

<header class="header">
  <div class="container header__row">
    <a class="logo" href="index.html">
      <span class="logo__mark">SC</span>
      <span class="logo__text">STOLAR CARP</span>
    </a>
    <nav class="nav" id="nav">
      <a href="index.html" class="nav__link">Головна</a>
      <a href="rules.html" class="nav__link">Регламент</a>
      <a href="register.html" class="nav__link">Реєстрація</a>
      <a href="live.html" class="nav__link">Live</a>
      <a href="rating.html" class="nav__link">Рейтинг</a>
      <a href="cabinet.html" class="nav__link">Мій кабінет</a>
    </nav>
    <button class="burger" id="burger"><span></span><span></span><span></span></button>
  </div>
</header>

<main class="main">
  <div class="wrap">

    <div class="card">
      <div class="title">Акаунт STOLAR CARP</div>
      <div class="muted">Вхід зліва, реєстрація справа. Сесія зберігається — повторно вводити пароль не потрібно.</div>

      <!-- ✅ loggedBox: показується коли вже є сесія -->
      <div id="loggedBox" class="row" style="margin-top:12px; display:none;">
        <span class="pill" id="loggedMsg">Ви вже увійшли у свій акаунт.</span>
        <a class="btn btn--accent" id="goCabinetBtn" href="cabinet.html">Перейти в кабінет</a>
        <button class="btn" id="logoutBtn" type="button">Вийти</button>
      </div>
    </div>

    <!-- ✅ authBox: показується коли НЕ залогінений -->
    <div id="authBox" class="grid2">

      <!-- ===== LEFT: LOGIN ===== -->
      <div class="card">
        <div class="title">Вхід</div>
        <div class="muted">Увійди в свій акаунт (email/пароль).</div>

        <form id="loginForm" autocomplete="on">
          <div class="field">
            <label>Email</label>
            <input id="loginEmail" type="email" placeholder="name@example.com" required />
          </div>

          <div class="field">
            <label>Пароль</label>
            <input id="loginPassword" type="password" placeholder="••••••••" required />
          </div>

          <div class="row">
            <button class="btn btn--accent" id="loginBtn" type="submit">Увійти</button>
            <a class="btn" href="index.html">На головну</a>
          </div>

          <div class="msg" id="loginMsg"></div>
        </form>
      </div>

      <!-- ===== RIGHT: SIGNUP ===== -->
      <div class="card">
        <div class="title">Реєстрація</div>
        <div class="muted">Капітан створює команду. Учасник приєднується по joinCode.</div>

        <form id="signupForm" autocomplete="on">
          <div class="field">
            <label>Email</label>
            <input id="signupEmail" type="email" placeholder="name@example.com" required />
          </div>

          <div class="field">
            <label>Пароль (мін. 6)</label>
            <input id="signupPassword" type="password" placeholder="мінімум 6 символів" required />
          </div>

          <div class="field">
            <label>ПІБ</label>
            <input id="signupFullName" type="text" placeholder="Прізвище Імʼя" required />
          </div>

          <div class="field">
            <label>Телефон</label>
            <input id="signupPhone" type="text" placeholder="+380…" required />
          </div>

          <div class="field">
            <label>Місто</label>
            <input id="signupCity" type="text" placeholder="Львів / Винники…" required />
          </div>

          <div class="hr"></div>

          <div class="role-box">
            <label><input type="radio" name="signupRole" value="captain" checked> Капітан</label>
            <label><input type="radio" name="signupRole" value="member"> Учасник</label>
          </div>

          <div id="captainFields">
            <div class="field">
              <label>Назва команди</label>
              <input id="signupTeamName" type="text" placeholder="Назва команди (для капітана)" />
            </div>
            <div class="hint">Після створення команди ти отримаєш <b>joinCode</b> для інших учасників.</div>
          </div>

          <div id="memberFields" class="hidden">
            <div class="field">
              <label>joinCode</label>
              <input id="signupJoinCode" type="text" placeholder="Код команди (6 символів)" />
            </div>
            <div class="hint">Код дає капітан (наприклад: <b>AB12CD</b>).</div>
          </div>

          <div class="row">
            <button class="btn btn--accent" id="signupBtn" type="submit">Зареєструватись</button>
            <a class="btn" href="index.html">На головну</a>
          </div>

          <div class="msg" id="signupMsg"></div>
        </form>
      </div>

    </div>

  </div>
</main>

<!-- Firebase compat CDN -->
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>

<!-- Єдина ініціалізація -->
<script src="assets/js/firebase-init.js"></script>

<!-- Твій auth logic (старий, робочий) -->
<script src="assets/js/auth.js"></script>

<script>
  // Перемикач captain/member полів (потрібно для нової верстки)
  (function(){
    const captainFields = document.getElementById("captainFields");
    const memberFields  = document.getElementById("memberFields");

    function update(){
      const v = document.querySelector('input[name="signupRole"]:checked')?.value || "captain";
      if(v === "captain"){
        captainFields?.classList.remove("hidden");
        memberFields?.classList.add("hidden");
      } else {
        memberFields?.classList.remove("hidden");
        captainFields?.classList.add("hidden");
      }
    }

    document.querySelectorAll('input[name="signupRole"]').forEach(r=>{
      r.addEventListener("change", update);
    });
    update();
  })();
</script>

</body>
</html>

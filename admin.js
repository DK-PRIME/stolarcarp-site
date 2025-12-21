// assets/js/admin.js
(function(){
  const view = document.getElementById("adminView");
  const buttons = document.querySelectorAll("[data-view]");

  buttons.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const v = btn.dataset.view;
      loadView(v);
    });
  });

  function loadView(v){
    switch(v){
      case "create": renderCreate(); break;
      case "edit": renderEdit(); break;
      case "registrations": renderRegistrations(); break;
      case "draw": renderDraw(); break;
      case "weighing": renderWeighing(); break;
      case "bigfish": renderBigFish(); break;
      case "users": renderUsers(); break;
    }
  }

  function renderCreate(){
    view.innerHTML = `
      <h2>➕ Створення змагань</h2>
      <p class="form__hint">Тут форма створення змагання</p>
    `;
  }

  function renderEdit(){
    view.innerHTML = `
      <h2>✏️ Редагувати змагання</h2>
      <p class="form__hint">Вибір змагання → редагування</p>
    `;
  }

  function renderRegistrations(){
    view.innerHTML = `
      <h2>📋 Реєстр команд</h2>
      <div id="adminRegistrations">Завантаження...</div>
    `;
    // тут підключимо реальний код реєстру (він у тебе вже є)
  }

  function renderDraw(){
    view.innerHTML = `
      <h2>🎣 Жеребкування</h2>
      <p class="form__hint">Команда → зона/сектор</p>
    `;
  }

  function renderWeighing(){
    view.innerHTML = `
      <h2>⚖️ Зважування</h2>
      <p class="form__hint">Внесення ваг суддею</p>
    `;
  }

  function renderBigFish(){
    view.innerHTML = `
      <h2>🐟 BigFish Total</h2>
      <p class="form__hint">Окремий платний івент</p>
    `;
  }

  function renderUsers(){
    view.innerHTML = `
      <h2>👤 STOLAR USER</h2>
      <p class="form__hint">Всі користувачі сайту</p>
    `;
  }
})();

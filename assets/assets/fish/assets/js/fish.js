// Запускаємо анімацію тільки на головній сторінці
if (!location.pathname.endsWith('index.html') && location.pathname !== '/') {
    console.log("Fish disabled on this page");
    return;
}

// --- Goldfish Animation for STOLAR CARP ---
const fishImg = "/assets/fish/goldfish.png";

function createFish() {
    const img = document.createElement("img");
    img.src = fishImg;
    img.className = "floating-fish";
    img.style.position = "fixed";
    img.style.width = (80 + Math.random()*80) + "px";
    img.style.left = Math.random() * window.innerWidth + "px";
    img.style.top = Math.random() * window.innerHeight + "px";
    img.style.pointerEvents = "none";
    img.style.zIndex = "5";
    img.style.transition = "5s linear";

    document.body.appendChild(img);

    moveFish(img);
    setInterval(() => moveFish(img), 5000);
}

function moveFish(fish) {
    const newX = Math.random() * window.innerWidth;
    const newY = Math.random() * window.innerHeight;
    fish.style.left = newX + "px";
    fish.style.top = newY + "px";

    // Поворот за напрямком руху
    fish.style.transform = `rotate(${Math.random()*40 - 20}deg)`;
}

// Створюємо 1–3 рибки
setTimeout(() => {
    const count = 1 + Math.floor(Math.random()*2);
    for (let i = 0; i < count; i++) createFish();
}, 500);

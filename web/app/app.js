const root = document.getElementById("app");
let currentGame = null;

const games = [
    {
        id: "puzzle",
        icon: "🧩",
        title: "汉字拼图",
        description: "交换拼图块，还原目标汉字。完成后会自动读出这个字。",
        create: createPuzzleGame,
    },
];

function stopCurrentGame() {
    if (currentGame?.unmount) {
        currentGame.unmount();
    }
    currentGame = null;
}

function showHome() {
    stopCurrentGame();
    root.innerHTML = `
        <section class="home-screen">
            <h1>识字游戏</h1>
            <p class="home-subtitle">选择一个游戏开始识字</p>
            <div class="game-list">
                ${games.map(game => `
                    <article class="game-card">
                        <div class="game-icon">${game.icon}</div>
                        <h2 class="game-card-title">${game.title}</h2>
                        <p class="game-card-description">${game.description}</p>
                        <button class="btn-primary" data-game-id="${game.id}">开始游戏</button>
                    </article>
                `).join("")}
            </div>
        </section>
    `;

    root.querySelectorAll("[data-game-id]").forEach(button => {
        button.addEventListener("click", () => showGame(button.dataset.gameId));
    });
}

function showGame(id) {
    const game = games.find(item => item.id === id);
    if (!game) return;

    stopCurrentGame();
    currentGame = game.create({ root, onBack: showHome });
    currentGame.mount();
}

showHome();

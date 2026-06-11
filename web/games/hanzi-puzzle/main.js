function createPuzzleGame({ root, onBack }) {
    let currentHanzi = "";
    let gridSize = 3;
    let tiles = [];
    let correctOrder = [];
    let selectedTile = null;
    let moves = 0;
    let startTime = null;
    let timerInterval = null;
    let hanziCanvas = null;
    let tileCanvases = [];
    let hintTimeout = null;
    let mounted = false;
    let levelCount = 0;
    let puzzleCompleted = false;

    function updateLevelDisplay() {
        root.querySelector("#gameTotalCompleted").textContent = levelCount;
        root.querySelector("#totalCompleted").textContent = levelCount;
    }

    function mount() {
        mounted = true;
        root.innerHTML = `
            <div class="game-container">
                <div class="game-header">
                    <button class="btn-secondary" id="backHome">← 返回</button>
                    <h1>🧩 汉字拼图</h1>
                    <button class="btn-icon" id="speakBtn" title="朗读发音">🔊</button>
                </div>

                <div class="controls">
                    <label>
                        难度：
                        <select id="difficulty">
                            <option value="2">简单 2×2</option>
                            <option value="3" selected>普通 3×3</option>
                            <option value="4">困难 4×4</option>
                        </select>
                    </label>
                    <button class="btn-primary" id="newGame">🔄 新游戏</button>
                    <button class="btn-primary" id="nextLevelMain">➜ 下一关</button>
                    <button class="btn-warning" id="showHint">💡 提示</button>
                </div>

                <div class="target-area">
                    <div class="target-label">目标汉字</div>
                    <div class="target-hanzi" id="targetHanzi">
                        <span class="target-char" id="targetChar">汉</span>
                        <span class="target-pinyin" id="targetPinyin">hàn</span>
                    </div>
                </div>

                <div class="stats">
                    <span>步数: <strong id="moves">0</strong></span>
                    <span>时间: <strong id="time">0s</strong></span>
                    <span class="cumulative-stat">🏆 <strong id="gameTotalCompleted">0</strong> 关</span>
                </div>

                <div class="puzzle-grid" id="puzzleGrid"></div>
                <div class="hint">点击两个方块交换位置</div>
            </div>

            <div class="modal" id="winModal">
                <div class="modal-content">
                    <h2>🎉 恭喜！</h2>
                    <p>拼图完成！</p>
                    <p>汉字：<strong id="winHanzi"></strong> <span id="winPinyin" style="color:#999;font-weight:normal;"></span></p>
                    <p>用时：<strong id="winTime"></strong></p>
                    <p>步数：<strong id="winMoves"></strong></p>
                    <p class="cumulative-stat">🏆 累计完成：<strong id="totalCompleted">0</strong> 关</p>
                    <br>
                    <button class="btn-primary" id="nextLevel">下一关 ➜</button>
                    <button id="closeModal">关闭</button>
                </div>
            </div>
        `;

        root.querySelector("#backHome").addEventListener("click", onBack);
        root.querySelector("#difficulty").addEventListener("change", regeneratePuzzle);
        root.querySelector("#newGame").addEventListener("click", newGame);
        root.querySelector("#nextLevelMain").addEventListener("click", advanceLevel);
        root.querySelector("#showHint").addEventListener("click", showHint);
        root.querySelector("#nextLevel").addEventListener("click", () => {
            closeModal();
            advanceLevel();
        });
        root.querySelector("#closeModal").addEventListener("click", closeModal);
        root.querySelector("#speakBtn").addEventListener("click", () => {
            speakHanzi(currentHanzi, PINYIN_MAP[currentHanzi] || "");
        });
        window.addEventListener("resize", handleResize);

        updateLevelDisplay();

        newGame();
    }

    function unmount() {
        mounted = false;
        clearInterval(timerInterval);
        clearTimeout(hintTimeout);
        window.removeEventListener("resize", handleResize);
        timerInterval = null;
        hintTimeout = null;
        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }
    }

    function handleResize() {
        if (mounted && tiles.length) {
            renderPuzzle();
        }
    }

    function generateHanziImage(hanzi, size = 300) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = "#1976d2";
        const fontSize = size * 0.75;
        ctx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", "STHeiti", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";

        ctx.shadowColor = "rgba(0,0,0,0.1)";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(hanzi, size / 2, size * 0.78);

        return canvas;
    }

    function splitCanvas(canvas, gridSize) {
        const parts = [];
        const tileWidth = canvas.width / gridSize;
        const tileHeight = canvas.height / gridSize;

        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                const tileCanvas = document.createElement("canvas");
                tileCanvas.width = tileWidth;
                tileCanvas.height = tileHeight;
                const tileCtx = tileCanvas.getContext("2d");

                tileCtx.drawImage(
                    canvas,
                    col * tileWidth, row * tileHeight, tileWidth, tileHeight,
                    0, 0, tileWidth, tileHeight
                );

                parts.push(tileCanvas);
            }
        }

        return parts;
    }

    function startPuzzle() {
        gridSize = parseInt(root.querySelector("#difficulty").value);

        root.querySelector("#targetChar").textContent = currentHanzi;
        root.querySelector("#targetPinyin").textContent = PINYIN_MAP[currentHanzi] || "";
        speakHanzi(currentHanzi, PINYIN_MAP[currentHanzi] || "");

        hanziCanvas = generateHanziImage(currentHanzi);
        tileCanvases = splitCanvas(hanziCanvas, gridSize);

        correctOrder = Array.from({length: gridSize * gridSize}, (_, i) => i);
        tiles = [...correctOrder];

        do {
            tiles.sort(() => Math.random() - 0.5);
        } while (tiles.join() === correctOrder.join());

        moves = 0;
        selectedTile = null;
        puzzleCompleted = false;

        root.querySelector("#moves").textContent = moves;
        root.querySelector("#time").textContent = "0s";

        root.querySelector("#nextLevelMain").disabled = true;

        closeModal();
        renderPuzzle();
        startTimer();
    }

    function newGame() {
        currentHanzi = HANZI_LIST[Math.floor(Math.random() * HANZI_LIST.length)];
        levelCount = 0;
        updateLevelDisplay();
        startPuzzle();
    }

    function advanceLevel() {
        currentHanzi = HANZI_LIST[Math.floor(Math.random() * HANZI_LIST.length)];
        startPuzzle();
    }

    function regeneratePuzzle() {
        startPuzzle();
    }

    function getTileSize() {
        const container = root.querySelector(".game-container");
        const containerWidth = container?.clientWidth || window.innerWidth;
        const availableWidth = Math.min(containerWidth, window.innerWidth) - 32;
        const availableHeight = window.innerHeight * 0.48;
        const gapAndPadding = (gridSize - 1) * 2 + 6;
        const byWidth = (availableWidth - gapAndPadding) / gridSize;
        const byHeight = (availableHeight - gapAndPadding) / gridSize;

        return Math.floor(Math.max(44, Math.min(100, byWidth, byHeight)));
    }

    function renderPuzzle() {
        const grid = root.querySelector("#puzzleGrid");
        const tileSize = getTileSize();

        grid.innerHTML = "";
        grid.style.setProperty("--tile-size", `${tileSize}px`);
        grid.style.gridTemplateColumns = `repeat(${gridSize}, var(--tile-size))`;

        tiles.forEach((tileIdx, pos) => {
            const tile = document.createElement("div");
            tile.className = "tile";

            const canvasClone = document.createElement("canvas");
            canvasClone.width = tileSize;
            canvasClone.height = tileSize;
            const ctx = canvasClone.getContext("2d");
            ctx.drawImage(tileCanvases[tileIdx], 0, 0, tileSize, tileSize);

            tile.appendChild(canvasClone);
            tile.addEventListener("click", () => onTileClick(pos));
            grid.appendChild(tile);
        });
    }

    function onTileClick(pos) {
        if (selectedTile === null) {
            selectedTile = pos;
            root.querySelectorAll(".tile")[pos].classList.add("selected");
        } else {
            if (selectedTile !== pos) {
                [tiles[selectedTile], tiles[pos]] = [tiles[pos], tiles[selectedTile]];
                moves++;
                root.querySelector("#moves").textContent = moves;
                renderPuzzle();
                checkWin();
            }
            selectedTile = null;
        }
    }

    function checkWin() {
        if (tiles.join() === correctOrder.join()) {
            clearInterval(timerInterval);
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const pinyin = PINYIN_MAP[currentHanzi] || "";

            root.querySelector("#winHanzi").textContent = currentHanzi;
            root.querySelector("#winPinyin").textContent = pinyin;
            root.querySelector("#winTime").textContent = elapsed + "秒";
            root.querySelector("#winMoves").textContent = moves;

            levelCount++;
            updateLevelDisplay();
            puzzleCompleted = true;
            root.querySelector("#nextLevelMain").disabled = false;

            root.querySelector("#winModal").classList.add("show");
            speakHanzi(currentHanzi, pinyin);
        }
    }

    function showHint() {
        if (hintTimeout) clearTimeout(hintTimeout);

        const tileElements = root.querySelectorAll(".tile");
        tiles.forEach((tileIdx, pos) => {
            const tile = tileElements[pos];
            tile.classList.remove("selected", "correct", "wrong");
            const oldOverlay = tile.querySelector(".hint-overlay");
            if (oldOverlay) oldOverlay.remove();

            const overlay = document.createElement("div");
            overlay.className = "hint-overlay";

            if (tileIdx === pos) {
                tile.classList.add("correct");
                overlay.textContent = "✓";
            } else {
                tile.classList.add("wrong");
                overlay.textContent = "✗";
            }
            tile.appendChild(overlay);
        });

        hintTimeout = setTimeout(() => {
            tileElements.forEach(tile => {
                tile.classList.remove("correct", "wrong");
                const ov = tile.querySelector(".hint-overlay");
                if (ov) ov.remove();
            });
            hintTimeout = null;
        }, 2500);
    }

    function startTimer() {
        startTime = Date.now();
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const timeEl = root.querySelector("#time");
            if (timeEl) timeEl.textContent = elapsed + "s";
        }, 1000);
    }

    function closeModal() {
        const modal = root.querySelector("#winModal");
        if (modal) modal.classList.remove("show");
    }

    return { mount, unmount };
}

window.createPuzzleGame = createPuzzleGame;

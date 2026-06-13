function createShootingGame({ root, onBack }) {
    /* ===== 状态 ===== */
    let mounted = false;
    let mode = ""; // "pinyin-to-hanzi" | "hanzi-to-pinyin" | "mixed" | "endless"
    let targetCount = 1; // 玩家选择的难度：1/2/3 个目标
    let score = 0;
    let combo = 0;
    let level = 1;
    let correctCount = 0;
    let targets = []; // [{hanzi, pinyin, hit, cardType}]
    let fallingCards = []; // [{element, hanzi, pinyin, resolved}]
    let gameActive = false;
    let timeLeft = 60;
    let timerInterval = null;
    let spawnIntervalId = null;
    let highScore = 0;
    let fallDuration = 5;
    let starElements = [];
    let audioCtx = null;
    let mistakes = []; // 仅 endless 模式：[{hanzi, pinyin}]

    const TOTAL_TIME = 60;
    const HITS_PER_LEVEL = 10;
    const BASE_SPAWN_INTERVAL = 900;
    const MIN_SPAWN_INTERVAL = 350;
    const MIN_FALL_DURATION = 2.2;
    const MAX_MISTAKES = 5;

    /* ===== 音效系统（Web Audio API，非汉字读音） ===== */

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function playTone(freq, duration, type, volume) {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type || "sine";
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* ignore audio errors */ }
    }

    function playHitSound() {
        // 清脆的命中音效：两声短促上升音
        playTone(880, 0.08, "square", 0.1);
        setTimeout(() => playTone(1320, 0.12, "square", 0.08), 60);
    }

    function playWrongSound() {
        // 低沉的错误音效
        playTone(200, 0.15, "sawtooth", 0.1);
        setTimeout(() => playTone(160, 0.2, "sawtooth", 0.08), 80);
    }

    function playComboSound(comboVal) {
        // 连击越高音调越高
        const baseFreq = 600 + Math.min(comboVal, 10) * 80;
        playTone(baseFreq, 0.06, "sine", 0.07);
        setTimeout(() => playTone(baseFreq * 1.5, 0.1, "sine", 0.06), 50);
    }

    function playLevelUpSound() {
        // 升级音效：三连升调
        playTone(523, 0.1, "square", 0.1);
        setTimeout(() => playTone(659, 0.1, "square", 0.1), 100);
        setTimeout(() => playTone(784, 0.15, "square", 0.1), 200);
    }

    function playGameOverSound() {
        // 游戏结束：下降音
        playTone(440, 0.2, "sawtooth", 0.1);
        setTimeout(() => playTone(350, 0.2, "sawtooth", 0.1), 150);
        setTimeout(() => playTone(260, 0.4, "sawtooth", 0.08), 300);
    }

    function playCountdownBeep() {
        // 最后5秒倒计时提示音
        playTone(1000, 0.08, "sine", 0.08);
    }

    /* ===== 工具函数 ===== */

    function getDifficultyTier() {
        const tierSizes = [500, 1000, 1500, 2000, 2500, 3500];
        const idx = Math.min(level - 1, tierSizes.length - 1);
        return HANZI_LIST.slice(0, tierSizes[idx]);
    }

    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getStorageKey() {
        const prefix = mode === "endless" ? "shooting_endless" : "shooting";
        return `${prefix}_highscore_${targetCount}`;
    }

    function loadHighScore() {
        try {
            return parseInt(localStorage.getItem(getStorageKey())) || 0;
        } catch (e) {
            return 0;
        }
    }

    function saveHighScore(s) {
        try {
            localStorage.setItem(getStorageKey(), s);
        } catch (e) { /* ignore */ }
    }

    function getDifficultyLabel() {
        const labels = { 1: "简单", 2: "普通", 3: "困难" };
        return labels[targetCount] || "普通";
    }

    function getSpawnInterval() {
        // 目标越多，生成越快
        const targetBonus = (targets.length - 1) * 40;
        const interval = BASE_SPAWN_INTERVAL - (level - 1) * 50 - targetBonus;
        return Math.max(MIN_SPAWN_INTERVAL, interval);
    }

    function getFallDuration() {
        // 目标越多，下落稍慢给玩家更多时间
        const targetBonus = (targets.length - 1) * 0.3;
        const dur = fallDuration + targetBonus - (level - 1) * 0.12;
        return Math.max(MIN_FALL_DURATION, dur);
    }

    /* ===== 渲染函数 ===== */

    function renderStartScreen() {
        // 回到起始界面时清空 mode，使最高分显示走默认（非 endless）storage key
        mode = "";
        highScore = loadHighScore();

        root.innerHTML = `
            <div class="shooting-wrapper" id="shootingWrapper">
                <div class="shooting-start" id="shootingStart">
                    <h2>🎯 汉字射击</h2>
                    <p class="shooting-start-subtitle">选择游戏模式</p>
                    <div class="mode-group">
                        <button class="mode-btn" data-mode="pinyin-to-hanzi">
                            📖 看拼音点汉字
                        </button>
                        <button class="mode-btn" data-mode="hanzi-to-pinyin">
                            🔤 看汉字点拼音
                        </button>
                        <button class="mode-btn mode-btn-mixed" data-mode="mixed">
                            🔀 混合模式
                        </button>
                        <button class="mode-btn mode-btn-endless" data-mode="endless">
                            ⏳ 无时间限制
                        </button>
                    </div>

                    <div class="difficulty-group">
                        <p class="difficulty-label">目标数量：</p>
                        <div class="difficulty-options">
                            <button class="diff-btn${targetCount === 1 ? " active" : ""}" data-count="1">1个 简单</button>
                            <button class="diff-btn${targetCount === 2 ? " active" : ""}" data-count="2">2个 普通</button>
                            <button class="diff-btn${targetCount === 3 ? " active" : ""}" data-count="3">3个 困难</button>
                        </div>
                    </div>

                    ${highScore > 0 ? `<div class="highscore-display">🏆 最高分（${getDifficultyLabel()}）：${highScore}</div>` : ""}
                    <button class="mode-btn mode-btn-back" id="startBack">← 返回主界面</button>
                </div>
            </div>
        `;

        generateStars();

        // 难度选择
        root.querySelectorAll(".diff-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                targetCount = parseInt(btn.dataset.count);
                root.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                // 刷新高分显示
                highScore = loadHighScore();
                const hsEl = root.querySelector(".highscore-display");
                if (hsEl) {
                    if (highScore > 0) {
                        hsEl.textContent = `🏆 最高分（${getDifficultyLabel()}）：${highScore}`;
                        hsEl.style.display = "";
                    } else {
                        hsEl.style.display = "none";
                    }
                }
            });
        });

        root.querySelectorAll(".mode-btn[data-mode]").forEach(btn => {
            btn.addEventListener("click", () => {
                startGame(btn.dataset.mode);
            });
        });

        const backBtn = root.querySelector("#startBack");
        if (backBtn) {
            backBtn.addEventListener("click", onBack);
        }
    }

    function renderGameScreen() {
        const wrapper = root.querySelector("#shootingWrapper") || root.querySelector(".shooting-wrapper");
        const isEndless = mode === "endless";
        const timeOrChanceStat = isEndless
            ? `<span class="stat-item">
                    <span class="stat-label">机会</span>
                    <span class="stat-value mistakes" id="shootingMistakes">0/${MAX_MISTAKES}</span>
                </span>`
            : `<span class="stat-item">
                    <span class="stat-label">时间</span>
                    <span class="stat-value time" id="shootingTime">${TOTAL_TIME}s</span>
                </span>`;

        const slotsRow = isEndless
            ? `<div class="shooting-mistake-slots" id="shootingMistakeSlots"></div>`
            : "";

        wrapper.innerHTML = `
            <div class="shooting-header">
                <button class="btn-back" id="shootingBack">← 返回</button>
                <h1>🎯 汉字射击</h1>
                <div class="header-spacer"></div>
            </div>

            <div class="shooting-stats">
                <span class="stat-item">
                    <span class="stat-label">分数</span>
                    <span class="stat-value score" id="shootingScore">0</span>
                </span>
                <span class="stat-item">
                    <span class="stat-label">连击</span>
                    <span class="stat-value combo" id="shootingCombo">0</span>
                </span>
                <span class="stat-item">
                    <span class="stat-label">等级</span>
                    <span class="stat-value" id="shootingLevel">1</span>
                </span>
                ${timeOrChanceStat}
                <span class="stat-item">
                    <span class="stat-label">最高</span>
                    <span class="stat-value highscore" id="shootingHighScore">${highScore}</span>
                </span>
            </div>

            ${slotsRow}

            <div class="shooting-targets" id="shootingTargets">
                <span class="shooting-target-label">目标：</span>
            </div>

            <div class="shooting-play-area" id="shootingPlayArea"></div>
        `;

        root.querySelector("#shootingBack").addEventListener("click", () => {
            gameActive = false;
            clearInterval(timerInterval);
            clearTimeout(spawnIntervalId);
            timerInterval = null;
            spawnIntervalId = null;
            // 返回模式选择界面，而非主界面
            fallingCards.forEach(c => {
                if (c.element && c.element.parentNode) {
                    c.element.remove();
                }
            });
            fallingCards = [];
            renderStartScreen();
        });

        root.querySelector("#shootingPlayArea").addEventListener("pointerdown", onPlayAreaClick);

        if (mode === "endless") {
            renderMistakeSlots();
        }

        generateStars();
    }

    /* ===== 星空背景 ===== */

    function generateStars() {
        const wrapper = root.querySelector(".shooting-wrapper");
        if (!wrapper) return;

        starElements.forEach(el => el.remove());
        starElements = [];

        const count = 60;
        for (let i = 0; i < count; i++) {
            const star = document.createElement("div");
            star.className = "shooting-star";
            star.style.left = Math.random() * 100 + "%";
            star.style.top = Math.random() * 100 + "%";
            star.style.width = (Math.random() * 2 + 1) + "px";
            star.style.height = star.style.width;
            star.style.animation = `twinkle ${2 + Math.random() * 3}s ${Math.random() * 3}s ease-in-out infinite`;
            wrapper.appendChild(star);
            starElements.push(star);
        }
    }

    /* ===== 游戏流程 ===== */

    function startGame(selectedMode) {
        mode = selectedMode;
        score = 0;
        combo = 0;
        level = 1;
        correctCount = 0;
        timeLeft = mode === "endless" ? Infinity : TOTAL_TIME;
        fallDuration = 5;
        fallingCards = [];
        targets = [];
        mistakes = [];
        gameActive = true;

        // 切换 mode 后再读取，使 endless 拥有独立 storage key
        highScore = loadHighScore();

        renderGameScreen();
        pickTargets();
        updateUI();

        if (mode !== "endless") {
            timerInterval = setInterval(() => {
                if (!mounted || !gameActive) return;
                timeLeft--;
                updateTimeDisplay();
                if (timeLeft <= 5 && timeLeft > 0) {
                    playCountdownBeep();
                }
                if (timeLeft <= 0) {
                    endGame();
                }
            }, 1000);
        }

        scheduleSpawn();
    }

    function scheduleSpawn() {
        if (!mounted || !gameActive) return;
        const interval = getSpawnInterval();
        spawnIntervalId = setTimeout(() => {
            if (!mounted || !gameActive) return;
            spawnCard();
            scheduleSpawn();
        }, interval + Math.random() * 200);
    }

    function pickTargets() {
        const tier = getDifficultyTier();
        const count = targetCount;
        targets = [];
        const used = new Set();

        for (let i = 0; i < count; i++) {
            let hanzi;
            do {
                hanzi = randomFrom(tier);
            } while (used.has(hanzi));
            used.add(hanzi);

            // 混合 / 无时间限制 模式下，每个目标随机决定显示汉字还是拼音
            let cardType;
            if (mode === "pinyin-to-hanzi") {
                cardType = "show-pinyin"; // 目标显示拼音，下落汉字
            } else if (mode === "hanzi-to-pinyin") {
                cardType = "show-hanzi"; // 目标显示汉字，下落拼音
            } else {
                // mixed / endless：随机
                cardType = Math.random() < 0.5 ? "show-pinyin" : "show-hanzi";
            }

            targets.push({ hanzi, pinyin: PINYIN_MAP[hanzi] || "", hit: false, cardType });
        }

        renderTargets();
    }

    function renderTargets() {
        const container = root.querySelector("#shootingTargets");
        if (!container) return;

        container.innerHTML = `<span class="shooting-target-label">目标：</span>`;
        targets.forEach((t, i) => {
            const item = document.createElement("span");
            item.className = "shooting-target-item" + (t.hit ? " hit" : "");
            item.dataset.index = i;

            if (t.cardType === "show-pinyin") {
                // 看拼音找汉字：目标显示拼音
                item.textContent = t.pinyin;
            } else {
                // 看汉字找拼音：目标显示汉字
                item.textContent = t.hanzi;
            }
            container.appendChild(item);
        });
    }

    /* ===== 卡片生成 ===== */

    function spawnCard() {
        if (!mounted || !gameActive) return;

        const playArea = root.querySelector("#shootingPlayArea");
        if (!playArea) return;

        const areaWidth = playArea.clientWidth;
        // 目标卡片概率：目标越多概率越高，保证目标卡片充足
        // 1个目标 ~30%, 2个目标 ~40%, 3个目标 ~45%
        const unhitCount = targets.filter(t => !t.hit).length;
        const targetProb = 0.20 + unhitCount * 0.1;
        const isTarget = Math.random() < targetProb && unhitCount > 0;
        let hanzi, pinyin, cardType;

        if (isTarget) {
            const unhitTargets = targets.filter(t => !t.hit);
            if (unhitTargets.length === 0) return;
            const chosen = randomFrom(unhitTargets);
            hanzi = chosen.hanzi;
            pinyin = chosen.pinyin;
            cardType = chosen.cardType;
        } else {
            const tier = getDifficultyTier();
            const targetSet = new Set(targets.map(t => t.hanzi));
            let attempts = 0;
            do {
                hanzi = randomFrom(tier);
                attempts++;
            } while (targetSet.has(hanzi) && attempts < 20);
            pinyin = PINYIN_MAP[hanzi] || "";
            // 干扰卡片类型随机（混合模式下）
            cardType = Math.random() < 0.5 ? "show-pinyin" : "show-hanzi";
            if (mode === "pinyin-to-hanzi") cardType = "show-pinyin";
            else if (mode === "hanzi-to-pinyin") cardType = "show-hanzi";
        }

        const isPinyinCard = cardType === "show-hanzi"; // 显示汉字找拼音时，下落的是拼音卡片

        const card = document.createElement("div");
        card.className = "shooting-char" + (isPinyinCard ? " pinyin-card" : "");

        if (isPinyinCard) {
            card.textContent = pinyin;
        } else {
            card.textContent = hanzi;
        }

        const cardWidth = isPinyinCard ? Math.min(90, areaWidth * 0.2) : Math.min(72, areaWidth * 0.15);
        const maxLeft = areaWidth - cardWidth - 8;
        const left = Math.max(4, Math.random() * maxLeft);
        card.style.left = left + "px";

        const rotate = (Math.random() - 0.5) * 6;
        card.style.setProperty("--card-rotate", rotate + "deg");

        const duration = getFallDuration() + (Math.random() - 0.5) * 0.8;
        const areaHeight = playArea.clientHeight;
        card.style.setProperty("--fall-distance", (areaHeight + 100) + "px");
        card.style.animationDuration = duration + "s";
        card.style.transform = `rotate(${rotate}deg)`;

        card.dataset.hanzi = hanzi;
        card.dataset.pinyin = pinyin;
        card.dataset.cardType = cardType;

        card.addEventListener("animationend", () => {
            onCardFallOut(card, hanzi);
        });

        playArea.appendChild(card);

        fallingCards.push({ element: card, hanzi, pinyin, resolved: false });
    }

    /* ===== 点击处理 ===== */

    function onPlayAreaClick(e) {
        if (!gameActive) return;

        const card = e.target.closest(".shooting-char");
        if (!card) return;

        const hanzi = card.dataset.hanzi;
        const cardType = card.dataset.cardType;

        // 匹配逻辑：目标需要找同类型的卡片
        // show-pinyin 目标 → 需要点汉字卡片（cardType=show-pinyin 的目标匹配 hanzi 相同且是汉字卡片）
        // show-hanzi 目标 → 需要点拼音卡片（cardType=show-hanzi 的目标匹配 hanzi 相同且是拼音卡片）
        const matchedTarget = targets.find(t =>
            !t.hit &&
            t.hanzi === hanzi &&
            t.cardType === cardType
        );

        if (matchedTarget) {
            onCorrectHit(card, matchedTarget);
        } else {
            onWrongHit(card);
        }
    }

    function onCorrectHit(cardEl, target) {
        target.hit = true;
        combo++;
        correctCount++;

        const multiplier = Math.min(combo, 10);
        const points = 10 * multiplier;
        score += points;

        const rect = cardEl.getBoundingClientRect();
        const playArea = root.querySelector("#shootingPlayArea");
        const areaRect = playArea.getBoundingClientRect();
        const cx = rect.left - areaRect.left + rect.width / 2;
        const cy = rect.top - areaRect.top + rect.height / 2;

        // 音效
        playHitSound();
        if (combo > 1) playComboSound(combo);

        spawnExplosion(cx, cy);
        showFloatingText(cx, cy, `+${points}${combo > 1 ? " x" + multiplier : ""}`, "#69f0ae");

        cardEl.remove();
        markCardResolved(cardEl);

        // 命中一个后立即替换为新目标
        replaceHitTarget(target);

        renderTargets();
        updateUI();

        checkLevelUp();
    }

    function replaceHitTarget(hitTarget) {
        // 从 targets 中移除已命中的目标
        const idx = targets.indexOf(hitTarget);
        if (idx === -1) return;

        // 生成一个新目标替换
        const tier = getDifficultyTier();
        const existingHanzi = new Set(targets.map(t => t.hanzi));
        let hanzi;
        let attempts = 0;
        do {
            hanzi = randomFrom(tier);
            attempts++;
        } while (existingHanzi.has(hanzi) && attempts < 30);

        let cardType;
        if (mode === "pinyin-to-hanzi") {
            cardType = "show-pinyin";
        } else if (mode === "hanzi-to-pinyin") {
            cardType = "show-hanzi";
        } else {
            cardType = Math.random() < 0.5 ? "show-pinyin" : "show-hanzi";
        }

        targets[idx] = { hanzi, pinyin: PINYIN_MAP[hanzi] || "", hit: false, cardType };
    }

    function onWrongHit(cardEl) {
        combo = 0;
        score = Math.max(0, score - 5);

        playWrongSound();

        cardEl.classList.add("wrong-click");
        setTimeout(() => {
            cardEl.classList.remove("wrong-click");
        }, 350);

        const rect = cardEl.getBoundingClientRect();
        const playArea = root.querySelector("#shootingPlayArea");
        const areaRect = playArea.getBoundingClientRect();
        const cx = rect.left - areaRect.left + rect.width / 2;
        const cy = rect.top - areaRect.top + rect.height / 2;

        showFloatingText(cx, cy, "-5", "#ef5350");

        updateUI();

        // 无时间限制模式：将错卡加入卡槽，满 5 个则失败
        if (mode === "endless") {
            const hanzi = cardEl.dataset.hanzi;
            const pinyin = cardEl.dataset.pinyin || (PINYIN_MAP[hanzi] || "");
            mistakes.push({ hanzi, pinyin });
            renderMistakeSlots();
            updateMistakeCounter();
            if (mistakes.length >= MAX_MISTAKES) {
                endGame();
            }
        }
    }

    function onCardFallOut(cardEl, hanzi) {
        cardEl.remove();
        markCardResolved(cardEl);
    }

    function markCardResolved(cardEl) {
        const entry = fallingCards.find(c => c.element === cardEl);
        if (entry) entry.resolved = true;
    }

    /* ===== 特效 ===== */

    function spawnExplosion(x, y) {
        const playArea = root.querySelector("#shootingPlayArea");
        if (!playArea) return;

        const count = 10;
        const colors = ["#ffd740", "#69f0ae", "#40c4ff", "#ff80ab", "#b388ff"];

        for (let i = 0; i < count; i++) {
            const particle = document.createElement("div");
            particle.className = "shooting-particle";

            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const distance = 30 + Math.random() * 40;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;

            particle.style.left = (x - 4) + "px";
            particle.style.top = (y - 4) + "px";
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.setProperty("--dx", dx + "px");
            particle.style.setProperty("--dy", dy + "px");

            playArea.appendChild(particle);

            setTimeout(() => particle.remove(), 500);
        }
    }

    function showFloatingText(x, y, text, color) {
        const playArea = root.querySelector("#shootingPlayArea");
        if (!playArea) return;

        const el = document.createElement("div");
        el.className = "shooting-float-text";
        el.textContent = text;
        el.style.left = x + "px";
        el.style.top = y + "px";
        el.style.color = color;

        playArea.appendChild(el);

        setTimeout(() => el.remove(), 900);
    }

    function showLevelUp() {
        const playArea = root.querySelector("#shootingPlayArea");
        if (!playArea) return;

        const el = document.createElement("div");
        el.className = "shooting-level-up";
        el.textContent = `⬆ 等级 ${level}`;

        playArea.appendChild(el);

        setTimeout(() => el.remove(), 1300);
    }

    /* ===== 升级 ===== */

    function checkLevelUp() {
        if (correctCount >= level * HITS_PER_LEVEL) {
            level++;
            playLevelUpSound();
            showLevelUp();
            updateUI();
            // 升级后刷新所有目标（字库扩大了）
            setTimeout(() => {
                if (mounted && gameActive) {
                    pickTargets();
                }
            }, 800);
        }
    }

    /* ===== UI 更新 ===== */

    function renderMistakeSlots() {
        const c = root.querySelector("#shootingMistakeSlots");
        if (!c) return;
        c.innerHTML = "";
        for (let i = 0; i < MAX_MISTAKES; i++) {
            const m = mistakes[i];
            const slot = document.createElement("div");
            slot.className = "mistake-slot" + (m ? " filled" : " empty");
            if (m) {
                slot.innerHTML = `
                    <span class="mistake-hanzi">${m.hanzi}</span>
                    <span class="mistake-pinyin">${m.pinyin}</span>
                `;
            }
            c.appendChild(slot);
        }
    }

    function updateMistakeCounter() {
        const el = root.querySelector("#shootingMistakes");
        if (el) {
            el.textContent = `${mistakes.length}/${MAX_MISTAKES}`;
            if (mistakes.length >= MAX_MISTAKES - 1) {
                el.classList.add("warning");
            } else {
                el.classList.remove("warning");
            }
        }
    }

    function updateUI() {
        const scoreEl = root.querySelector("#shootingScore");
        const comboEl = root.querySelector("#shootingCombo");
        const levelEl = root.querySelector("#shootingLevel");

        if (scoreEl) scoreEl.textContent = score;
        if (comboEl) comboEl.textContent = combo;
        if (levelEl) levelEl.textContent = level;
    }

    function updateTimeDisplay() {
        const timeEl = root.querySelector("#shootingTime");
        if (timeEl) {
            timeEl.textContent = timeLeft + "s";
            if (timeLeft <= 10) {
                timeEl.classList.add("warning");
            } else {
                timeEl.classList.remove("warning");
            }
        }
    }

    /* ===== 游戏结束 ===== */

    function endGame() {
        gameActive = false;
        clearInterval(timerInterval);
        clearTimeout(spawnIntervalId);
        timerInterval = null;
        spawnIntervalId = null;

        playGameOverSound();

        fallingCards.forEach(c => {
            if (c.element && c.element.parentNode) {
                c.element.remove();
            }
        });
        fallingCards = [];

        const isNewRecord = score > highScore;
        if (isNewRecord) {
            highScore = score;
            saveHighScore(highScore);
        }

        const wrapper = root.querySelector(".shooting-wrapper");
        if (!wrapper) return;

        const modeLabel = mode === "pinyin-to-hanzi" ? "看拼音点汉字"
            : mode === "hanzi-to-pinyin" ? "看汉字点拼音"
            : mode === "endless" ? "无时间限制"
            : "混合模式";

        const diffLabel = getDifficultyLabel();
        const isEndless = mode === "endless";

        const titleHtml = isEndless
            ? `<h2>💔 机会用完了！</h2>`
            : `<h2>⏰ 时间到！</h2>`;

        const timeOrMistakeRow = isEndless
            ? `<div class="result-row">
                    <span class="result-label">错题数</span>
                    <span class="result-value">${mistakes.length}/${MAX_MISTAKES}</span>
                </div>`
            : "";

        const mistakeListHtml = isEndless && mistakes.length > 0
            ? `<div class="mistake-recap">
                    <div class="mistake-recap-label">错题回顾</div>
                    <div class="shooting-mistake-slots recap">
                        ${mistakes.map(m => `
                            <div class="mistake-slot filled">
                                <span class="mistake-hanzi">${m.hanzi}</span>
                                <span class="mistake-pinyin">${m.pinyin}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>`
            : "";

        const overlay = document.createElement("div");
        overlay.className = "shooting-gameover";
        overlay.innerHTML = `
            <div class="shooting-gameover-card">
                ${titleHtml}
                <div class="result-row">
                    <span class="result-label">游戏模式</span>
                    <span class="result-value">${modeLabel}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">难度</span>
                    <span class="result-value">${diffLabel}（${targetCount}个目标）</span>
                </div>
                <div class="result-row">
                    <span class="result-label">最终得分</span>
                    <span class="result-value ${isNewRecord ? "new-record" : ""}">${score}${isNewRecord ? '<span class="new-record-badge">新纪录</span>' : ""}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">最高分</span>
                    <span class="result-value">${highScore}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">到达等级</span>
                    <span class="result-value">${level}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">命中次数</span>
                    <span class="result-value">${correctCount}</span>
                </div>
                ${timeOrMistakeRow}
                ${mistakeListHtml}
                <div class="btn-group">
                    <button class="btn-primary" id="shootingRestart">再来一局</button>
                    <button class="btn-secondary" id="shootingChangeMode">换个模式</button>
                    <button class="btn-secondary" id="shootingGoHome">返回主界面</button>
                </div>
            </div>
        `;

        wrapper.appendChild(overlay);

        overlay.querySelector("#shootingRestart").addEventListener("click", () => {
            overlay.remove();
            startGame(mode);
        });

        overlay.querySelector("#shootingChangeMode").addEventListener("click", () => {
            overlay.remove();
            renderStartScreen();
        });

        overlay.querySelector("#shootingGoHome").addEventListener("click", () => {
            onBack();
        });
    }

    /* ===== mount / unmount ===== */

    function mount() {
        mounted = true;
        renderStartScreen();
    }

    function unmount() {
        mounted = false;
        gameActive = false;

        clearInterval(timerInterval);
        clearTimeout(spawnIntervalId);
        timerInterval = null;
        spawnIntervalId = null;

        fallingCards.forEach(c => {
            if (c.element && c.element.parentNode) {
                c.element.remove();
            }
        });
        fallingCards = [];

        starElements.forEach(el => el.remove());
        starElements = [];

        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
    }

    return { mount, unmount };
}

window.createShootingGame = createShootingGame;

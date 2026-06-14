function createRacingGame({ root, onBack }) {
    /* ===== 状态 ===== */
    let mounted = false;
    let gameActive = false;

    let lives = 3;
    let score = 0;
    let combo = 0;
    let level = 1;
    let correctCount = 0;
    let distance = 0; // 累计「米」
    let highScore = 0;

    // 当前目标 { hanzi, pinyin, cardType: "show-pinyin" | "show-hanzi" }
    let target = null;

    // 赛车造型 id（在起始页选择，传入 startGame 后写入 carEl 的 class）
    let selectedCarStyle = "classic";

    // 路障：[{ el, hanzi, pinyin, cardType, x, y, w, h, resolved }]
    let obstacles = [];

    // 赛车 x：以 carTargetX 为锚点，每帧阻尼平滑跟随
    let carX = 0;
    let carTargetX = 0;
    let carEl = null;
    let carHalfW = 24;
    let carH = 80;

    // 赛道尺寸（每帧从 DOM 取，spawn/clamp 用）
    let roadW = 0;
    let roadH = 0;

    // 输入
    let keyLeft = false;
    let keyRight = false;
    let pointerActive = false;
    let pointerId = -1;

    // 时间循环
    let rafId = null;
    let lastTs = 0;
    let lastSpawnAt = 0;
    let invincibleUntil = 0;

    let starElements = [];
    let audioCtx = null;

    /* ===== 常量 ===== */
    const MAX_LIVES = 3;
    const HITS_PER_LEVEL = 8;
    const BASE_SPAWN_INTERVAL = 900;   // ms
    const MIN_SPAWN_INTERVAL = 360;
    const BASE_SPEED = 180;            // px/s
    const MAX_SPEED = 460;
    const CAR_FOLLOW = 0.18;           // 阻尼
    const KEY_SPEED = 540;             // px/s（键盘左右移动）
    const INVINCIBLE_MS = 700;
    const STORAGE_KEY = "racing_highscore";
    const STORAGE_CAR_KEY = "racing_car_style";

    // 4 种造型：classic 经典红、neon 霓虹蓝（科技）、stealth 隐形黑（高端）、bolt 闪电黄（速度）
    const CAR_STYLES = [
        { id: "classic", name: "经典红", emoji: "🚗" },
        { id: "neon",    name: "霓虹蓝", emoji: "🛸" },
        { id: "stealth", name: "隐形黑", emoji: "🏁" },
        { id: "bolt",    name: "闪电黄", emoji: "⚡" },
    ];

    /* ===== 音效（独立 Web Audio） ===== */

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === "suspended") audioCtx.resume();
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
        } catch (e) { /* ignore */ }
    }

    function playHitSound() {
        playTone(880, 0.08, "square", 0.1);
        setTimeout(() => playTone(1320, 0.12, "square", 0.08), 60);
    }
    function playCrashSound() {
        playTone(180, 0.18, "sawtooth", 0.12);
        setTimeout(() => playTone(120, 0.25, "sawtooth", 0.10), 80);
    }
    function playLevelUpSound() {
        playTone(523, 0.1, "square", 0.1);
        setTimeout(() => playTone(659, 0.1, "square", 0.1), 100);
        setTimeout(() => playTone(784, 0.15, "square", 0.1), 200);
    }
    function playGameOverSound() {
        playTone(440, 0.2, "sawtooth", 0.1);
        setTimeout(() => playTone(330, 0.2, "sawtooth", 0.1), 150);
        setTimeout(() => playTone(220, 0.4, "sawtooth", 0.08), 300);
    }

    /* ===== 工具 ===== */

    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getDifficultyTier() {
        const tierSizes = [500, 1000, 1500, 2000, 2500, 3500];
        const idx = Math.min(level - 1, tierSizes.length - 1);
        return HANZI_LIST.slice(0, tierSizes[idx]);
    }

    function loadHighScore() {
        try {
            return parseInt(localStorage.getItem(STORAGE_KEY)) || 0;
        } catch (e) { return 0; }
    }
    function saveHighScore(s) {
        try { localStorage.setItem(STORAGE_KEY, s); } catch (e) { /* ignore */ }
    }

    function loadCarStyle() {
        try {
            const v = localStorage.getItem(STORAGE_CAR_KEY);
            if (v && CAR_STYLES.some(c => c.id === v)) return v;
        } catch (e) { /* ignore */ }
        return "classic";
    }
    function saveCarStyle(id) {
        try { localStorage.setItem(STORAGE_CAR_KEY, id); } catch (e) { /* ignore */ }
    }

    // 赛车 SVG 内部结构（4 种造型共用同样的 HTML，class 切换样式）
    function carInnerHtml() {
        return `
            <div class="car-glow"></div>
            <div class="car-body">
                <div class="car-spoiler"></div>
                <div class="car-canopy"></div>
                <div class="car-stripe"></div>
                <div class="car-headlight left"></div>
                <div class="car-headlight right"></div>
                <div class="car-tail left"></div>
                <div class="car-tail right"></div>
                <div class="car-fin left"></div>
                <div class="car-fin right"></div>
            </div>
            <div class="car-thrust">
                <div class="thrust-flame left"></div>
                <div class="thrust-flame right"></div>
            </div>
        `;
    }

    function getSpeed() {
        return Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * 35);
    }

    function getSpawnInterval() {
        return Math.max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - (level - 1) * 60);
    }

    /* ===== 渲染：起始 / 游戏 / 结算 ===== */

    function renderStartScreen() {
        highScore = loadHighScore();
        selectedCarStyle = loadCarStyle();

        root.innerHTML = `
            <div class="racing-wrapper">
                <div class="racing-bg-stars" id="racingBgStars"></div>
                <div class="racing-start">
                    <h2>🏎️ 汉字赛车</h2>
                    <p class="racing-start-subtitle">看顶部目标，左右驾驶赛车撞上正确路障！</p>

                    <div class="racing-car-picker">
                        <p class="racing-car-picker-label">选择赛车</p>
                        <div class="racing-car-preview-wrapper">
                            <button class="racing-car-arrow" id="racingCarPrev" aria-label="上一款">‹</button>
                            <div class="racing-car-preview-stage">
                                <div class="racing-car preview style-${selectedCarStyle}" id="racingCarPreview">
                                    ${carInnerHtml()}
                                </div>
                            </div>
                            <button class="racing-car-arrow" id="racingCarNext" aria-label="下一款">›</button>
                        </div>
                        <div class="racing-car-name" id="racingCarName"></div>
                        <div class="racing-car-dots" id="racingCarDots"></div>
                    </div>

                    <ul class="racing-rules">
                        <li>👆 手指/鼠标在路面任意处滑动 — 赛车跟随</li>
                        <li>⌨️ 键盘 ← / → 或 A / D 也能控制</li>
                        <li>💥 撞中正确路障 = 得分；撞错 = 扣 1 条命</li>
                    </ul>
                    ${highScore > 0 ? `<div class="racing-highscore-display">🏆 最高分：${highScore}</div>` : ""}
                    <button class="racing-btn racing-btn-primary" id="racingStartBtn">🚦 开始驾驶</button>
                    <button class="racing-btn racing-btn-back" id="racingStartBack">← 返回主界面</button>
                </div>
            </div>
        `;

        generateBgStars();
        renderCarPicker();

        root.querySelector("#racingCarPrev").addEventListener("click", () => cycleCarStyle(-1));
        root.querySelector("#racingCarNext").addEventListener("click", () => cycleCarStyle(1));
        root.querySelector("#racingStartBtn").addEventListener("click", () => startGame());
        root.querySelector("#racingStartBack").addEventListener("click", onBack);
    }

    function renderCarPicker() {
        const nameEl = root.querySelector("#racingCarName");
        const dotsEl = root.querySelector("#racingCarDots");
        const previewEl = root.querySelector("#racingCarPreview");
        const cur = CAR_STYLES.find(c => c.id === selectedCarStyle) || CAR_STYLES[0];

        if (nameEl) nameEl.textContent = `${cur.emoji} ${cur.name}`;
        if (previewEl) {
            previewEl.className = `racing-car preview style-${cur.id}`;
        }
        if (dotsEl) {
            dotsEl.innerHTML = "";
            CAR_STYLES.forEach(s => {
                const dot = document.createElement("button");
                dot.className = "racing-car-dot" + (s.id === cur.id ? " active" : "");
                dot.dataset.id = s.id;
                dot.setAttribute("aria-label", s.name);
                dot.addEventListener("click", () => {
                    selectedCarStyle = s.id;
                    saveCarStyle(s.id);
                    renderCarPicker();
                });
                dotsEl.appendChild(dot);
            });
        }
    }

    function cycleCarStyle(delta) {
        const idx = CAR_STYLES.findIndex(c => c.id === selectedCarStyle);
        const next = (idx + delta + CAR_STYLES.length) % CAR_STYLES.length;
        selectedCarStyle = CAR_STYLES[next].id;
        saveCarStyle(selectedCarStyle);
        renderCarPicker();
    }

    function renderGameScreen() {
        const wrapper = root.querySelector(".racing-wrapper");
        wrapper.innerHTML = `
            <div class="racing-bg-stars" id="racingBgStars"></div>

            <div class="racing-header">
                <button class="btn-back" id="racingBack">← 返回</button>
                <h1>🏎️ 汉字赛车</h1>
                <div class="racing-lives" id="racingLives"></div>
            </div>

            <div class="racing-stats">
                <span class="stat-item">
                    <span class="stat-label">分数</span>
                    <span class="stat-value score" id="racingScore">0</span>
                </span>
                <span class="stat-item">
                    <span class="stat-label">连击</span>
                    <span class="stat-value combo" id="racingCombo">0</span>
                </span>
                <span class="stat-item">
                    <span class="stat-label">距离</span>
                    <span class="stat-value distance" id="racingDistance">0m</span>
                </span>
                <span class="stat-item">
                    <span class="stat-label">最高</span>
                    <span class="stat-value highscore" id="racingHighScore">${highScore}</span>
                </span>
            </div>

            <div class="racing-target-bar">
                <span class="racing-target-label">目标</span>
                <span class="racing-target" id="racingTarget"></span>
                <span class="racing-target-hint" id="racingTargetHint"></span>
            </div>

            <div class="racing-road" id="racingRoad">
                <div class="racing-lane-lines" id="racingLaneLines"></div>
                <div class="racing-roadside left"></div>
                <div class="racing-roadside right"></div>
                <div class="racing-car style-${selectedCarStyle}" id="racingCar">
                    ${carInnerHtml()}
                </div>
            </div>
        `;

        generateBgStars();
        bindGameControls();
    }

    function generateBgStars() {
        const container = root.querySelector("#racingBgStars");
        if (!container) return;
        starElements.forEach(el => el.remove());
        starElements = [];
        const count = 40;
        for (let i = 0; i < count; i++) {
            const s = document.createElement("div");
            s.className = "racing-star";
            s.style.left = Math.random() * 100 + "%";
            s.style.top = Math.random() * 100 + "%";
            const size = Math.random() * 1.5 + 1;
            s.style.width = size + "px";
            s.style.height = size + "px";
            s.style.animation = `racingTwinkle ${2 + Math.random() * 3}s ${Math.random() * 3}s ease-in-out infinite`;
            container.appendChild(s);
            starElements.push(s);
        }
    }

    /* ===== 控制（pointer + 键盘） ===== */

    function bindGameControls() {
        // 防止重复绑定（startGame 多次调用：起始页 → 游戏 → 结算 → 再来一局）
        unbindGameControls();

        const road = root.querySelector("#racingRoad");
        carEl = root.querySelector("#racingCar");

        road.addEventListener("pointerdown", onPointerDown);
        road.addEventListener("pointermove", onPointerMove);
        road.addEventListener("pointerup", onPointerUp);
        road.addEventListener("pointercancel", onPointerUp);
        road.addEventListener("pointerleave", onPointerUp);

        // 防止移动端拖动滚动 / 长按选中
        road.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
        road.addEventListener("contextmenu", e => e.preventDefault());

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        const backBtn = root.querySelector("#racingBack");
        backBtn.addEventListener("click", () => {
            // 返回起始页（不返回主界面）
            stopLoop();
            unbindGameControls();
            clearObstacles();
            renderStartScreen();
        });
    }

    function unbindGameControls() {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        // pointer 监听挂在 #racingRoad 上，DOM 重渲染时一并消失
    }

    function pointerToCarTargetX(e) {
        const road = root.querySelector("#racingRoad");
        if (!road) return;
        const rect = road.getBoundingClientRect();
        const x = e.clientX - rect.left;
        carTargetX = clampCarX(x);
    }

    function onPointerDown(e) {
        if (!gameActive) return;
        pointerActive = true;
        pointerId = e.pointerId;
        try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        pointerToCarTargetX(e);
    }
    function onPointerMove(e) {
        if (!gameActive || !pointerActive) return;
        if (e.pointerId !== pointerId) return;
        pointerToCarTargetX(e);
    }
    function onPointerUp(e) {
        if (!pointerActive) return;
        if (e && e.pointerId !== undefined && e.pointerId !== pointerId && e.type !== "pointerleave") return;
        pointerActive = false;
        pointerId = -1;
    }

    function onKeyDown(e) {
        if (!gameActive) return;
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { keyLeft = true; e.preventDefault(); }
        else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { keyRight = true; e.preventDefault(); }
    }
    function onKeyUp(e) {
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keyLeft = false;
        else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keyRight = false;
    }

    function clampCarX(x) {
        const minX = carHalfW + 8;
        const maxX = Math.max(minX + 1, roadW - carHalfW - 8);
        return Math.max(minX, Math.min(maxX, x));
    }

    /* ===== 游戏开始 ===== */

    function startGame() {
        // 重置状态
        lives = MAX_LIVES;
        score = 0;
        combo = 0;
        level = 1;
        correctCount = 0;
        distance = 0;
        obstacles = [];
        keyLeft = false;
        keyRight = false;
        pointerActive = false;
        pointerId = -1;
        invincibleUntil = 0;
        gameActive = true;

        renderGameScreen();
        measureRoad();

        // 赛车初始化在中央
        carX = roadW / 2;
        carTargetX = carX;
        applyCarTransform();

        renderLives();
        renderStats();
        pickNewTarget();

        lastTs = performance.now();
        lastSpawnAt = lastTs;
        rafId = requestAnimationFrame(tick);
    }

    function measureRoad() {
        const road = root.querySelector("#racingRoad");
        if (!road) return;
        const rect = road.getBoundingClientRect();
        roadW = rect.width;
        roadH = rect.height;

        if (carEl) {
            const carRect = carEl.getBoundingClientRect();
            carHalfW = carRect.width / 2;
            carH = carRect.height;
        }
    }

    /* ===== 目标 ===== */

    function pickNewTarget() {
        const tier = getDifficultyTier();
        const prevHanzi = target ? target.hanzi : null;
        let hanzi;
        let attempts = 0;
        do {
            hanzi = randomFrom(tier);
            attempts++;
        } while (hanzi === prevHanzi && attempts < 5);

        const cardType = Math.random() < 0.5 ? "show-pinyin" : "show-hanzi";
        target = {
            hanzi,
            pinyin: PINYIN_MAP[hanzi] || "",
            cardType,
        };
        renderTarget();
    }

    function renderTarget() {
        const tEl = root.querySelector("#racingTarget");
        const hintEl = root.querySelector("#racingTargetHint");
        if (!tEl || !target) return;

        if (target.cardType === "show-pinyin") {
            // 显示拼音 → 玩家撞汉字路障
            tEl.textContent = target.pinyin;
            tEl.classList.add("is-pinyin");
            tEl.classList.remove("is-hanzi");
            if (hintEl) hintEl.textContent = "撞汉字";
        } else {
            // 显示汉字 → 玩家撞拼音路障
            tEl.textContent = target.hanzi;
            tEl.classList.add("is-hanzi");
            tEl.classList.remove("is-pinyin");
            if (hintEl) hintEl.textContent = "撞拼音";
        }
        tEl.classList.remove("flash");
        // 触发短暂高亮动画
        // eslint-disable-next-line no-unused-expressions
        void tEl.offsetWidth;
        tEl.classList.add("flash");
    }

    /* ===== 路障 ===== */

    function spawnObstacle() {
        if (!gameActive || !target) return;
        const road = root.querySelector("#racingRoad");
        if (!road) return;

        // 当前路障 cardType 与 target 同步：所有路障同类
        const cardType = target.cardType;
        const isObstaclePinyin = cardType === "show-hanzi"; // 看汉字撞拼音 → 路障是拼音

        // 决定该路障内容是否就是当前目标
        const targetProb = Math.min(0.55, 0.30 + level * 0.04);
        const isTarget = Math.random() < targetProb;

        let hanzi;
        if (isTarget) {
            hanzi = target.hanzi;
        } else {
            const tier = getDifficultyTier();
            let attempts = 0;
            do {
                hanzi = randomFrom(tier);
                attempts++;
            } while (hanzi === target.hanzi && attempts < 10);
        }
        const pinyin = PINYIN_MAP[hanzi] || "";

        const el = document.createElement("div");
        el.className = "racing-obstacle" + (isObstaclePinyin ? " is-pinyin" : "");
        el.textContent = isObstaclePinyin ? pinyin : hanzi;
        // 先放外面、隐藏，量尺寸再定位
        el.style.transform = `translate(-9999px, -9999px)`;
        road.appendChild(el);
        const obRect = el.getBoundingClientRect();
        const w = obRect.width;
        const h = obRect.height;

        // 随机 x，避开现有未消失路障的拥堵区
        const minX = w / 2 + 12;
        const maxX = roadW - w / 2 - 12;
        let x = minX + Math.random() * (maxX - minX);
        let attempts = 0;
        while (attempts < 8) {
            const tooClose = obstacles.some(o =>
                !o.resolved && o.y < h * 1.5 && Math.abs(o.x - x) < (o.w + w) / 2 + 8
            );
            if (!tooClose) break;
            x = minX + Math.random() * (maxX - minX);
            attempts++;
        }

        const y = -h - 8;
        const ob = { el, hanzi, pinyin, cardType, x, y, w, h, resolved: false };
        applyObstacleTransform(ob);
        obstacles.push(ob);
    }

    function applyObstacleTransform(o) {
        // x/y 是中心点
        o.el.style.transform = `translate(${o.x - o.w / 2}px, ${o.y}px)`;
    }

    function clearObstacles() {
        obstacles.forEach(o => { if (o.el && o.el.parentNode) o.el.remove(); });
        obstacles = [];
    }

    /* ===== 主循环 ===== */

    function tick(ts) {
        if (!mounted || !gameActive) return;
        const dt = Math.min(0.1, (ts - lastTs) / 1000);
        lastTs = ts;

        // 输入：键盘
        if (keyLeft) carTargetX -= KEY_SPEED * dt;
        if (keyRight) carTargetX += KEY_SPEED * dt;
        carTargetX = clampCarX(carTargetX);

        // 阻尼跟随
        carX += (carTargetX - carX) * CAR_FOLLOW;
        applyCarTransform();

        // 速度
        const speed = getSpeed();
        // 车道线滚动速度（CSS 动画 duration）
        const lane = root.querySelector("#racingLaneLines");
        if (lane) {
            // 数字越小越快；BASE_SPEED → ~0.55s；MAX_SPEED → ~0.22s
            const dur = Math.max(0.18, 100 / speed);
            if (lane.dataset.dur !== dur.toFixed(2)) {
                lane.style.animationDuration = dur.toFixed(2) + "s";
                lane.dataset.dur = dur.toFixed(2);
            }
        }

        // 距离
        distance += speed * dt / 30;

        // 路障下落 + 碰撞
        const carBox = getCarBox();
        const now = ts;
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const o = obstacles[i];
            if (o.resolved) {
                obstacles.splice(i, 1);
                continue;
            }
            o.y += speed * dt;
            applyObstacleTransform(o);

            // 出屏 → 消失
            if (o.y > roadH + 4) {
                o.resolved = true;
                if (o.el && o.el.parentNode) o.el.remove();
                obstacles.splice(i, 1);
                continue;
            }

            // 碰撞（无敌窗口内不计）
            if (now < invincibleUntil) continue;
            const obBox = {
                left: o.x - o.w / 2,
                right: o.x + o.w / 2,
                top: o.y,
                bottom: o.y + o.h,
            };
            if (boxOverlap(carBox, obBox)) {
                o.resolved = true;
                if (o.el && o.el.parentNode) o.el.remove();
                obstacles.splice(i, 1);
                if (o.hanzi === target.hanzi) {
                    onCorrectHit(o);
                } else {
                    onWrongHit(o);
                }
            }
        }

        // 生成路障
        const interval = getSpawnInterval();
        if (now - lastSpawnAt >= interval) {
            spawnObstacle();
            lastSpawnAt = now;
        }

        // 更新需要的统计
        renderStats();

        rafId = requestAnimationFrame(tick);
    }

    function applyCarTransform() {
        if (!carEl) return;
        carEl.style.transform = `translateX(${carX - carHalfW}px)`;
    }

    function getCarBox() {
        // 视觉车身略向内收缩，碰撞框更宽容
        const shrinkX = 4;
        const shrinkY = 8;
        const bottomMargin = roadH * 0.06;
        const carTop = roadH - bottomMargin - carH;
        return {
            left: carX - carHalfW + shrinkX,
            right: carX + carHalfW - shrinkX,
            top: carTop + shrinkY,
            bottom: carTop + carH - shrinkY,
        };
    }

    function boxOverlap(a, b) {
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    function stopLoop() {
        gameActive = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    /* ===== 命中处理 ===== */

    function onCorrectHit(o) {
        combo++;
        correctCount++;
        const multiplier = Math.min(combo, 10);
        const points = 10 * multiplier;
        score += points;

        playHitSound();
        spawnSparkles(o.x, getCarBox().top + 4);
        showFloatingText(o.x, getCarBox().top, `+${points}${combo > 1 ? " x" + multiplier : ""}`, "#69f0ae");

        if (window.speakHanzi) {
            try { window.speakHanzi(o.hanzi); } catch (_) {}
        }

        pickNewTarget();
        renderStats();
        checkLevelUp();
    }

    function onWrongHit(o) {
        combo = 0;
        lives--;
        invincibleUntil = performance.now() + INVINCIBLE_MS;

        playCrashSound();
        flashCar();
        shakeRoad();
        showFloatingText(o.x, getCarBox().top, "-1 ❤", "#ef5350");

        renderLives();
        renderStats();

        if (lives <= 0) {
            endGame();
        }
    }

    function checkLevelUp() {
        if (correctCount >= level * HITS_PER_LEVEL) {
            level++;
            playLevelUpSound();
            showLevelUp();
        }
    }

    /* ===== 视觉特效 ===== */

    function spawnSparkles(x, y) {
        const road = root.querySelector("#racingRoad");
        if (!road) return;
        const colors = ["#ffd740", "#69f0ae", "#40c4ff", "#ff80ab", "#b388ff"];
        const count = 10;
        for (let i = 0; i < count; i++) {
            const p = document.createElement("div");
            p.className = "racing-particle";
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const dist = 30 + Math.random() * 35;
            p.style.left = (x - 4) + "px";
            p.style.top = (y - 4) + "px";
            p.style.background = colors[Math.floor(Math.random() * colors.length)];
            p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
            p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
            road.appendChild(p);
            setTimeout(() => p.remove(), 500);
        }
    }

    function showFloatingText(x, y, text, color) {
        const road = root.querySelector("#racingRoad");
        if (!road) return;
        const el = document.createElement("div");
        el.className = "racing-float-text";
        el.textContent = text;
        el.style.left = x + "px";
        el.style.top = y + "px";
        el.style.color = color;
        road.appendChild(el);
        setTimeout(() => el.remove(), 900);
    }

    function showLevelUp() {
        const road = root.querySelector("#racingRoad");
        if (!road) return;
        const el = document.createElement("div");
        el.className = "racing-level-up";
        el.textContent = `⬆ 等级 ${level}`;
        road.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    function flashCar() {
        if (!carEl) return;
        carEl.classList.remove("flash");
        // eslint-disable-next-line no-unused-expressions
        void carEl.offsetWidth;
        carEl.classList.add("flash");
        setTimeout(() => carEl && carEl.classList.remove("flash"), 600);
    }

    function shakeRoad() {
        const road = root.querySelector("#racingRoad");
        if (!road) return;
        road.classList.remove("shake");
        // eslint-disable-next-line no-unused-expressions
        void road.offsetWidth;
        road.classList.add("shake");
        setTimeout(() => road && road.classList.remove("shake"), 400);
    }

    /* ===== UI 更新 ===== */

    function renderStats() {
        const sEl = root.querySelector("#racingScore");
        const cEl = root.querySelector("#racingCombo");
        const dEl = root.querySelector("#racingDistance");
        if (sEl) sEl.textContent = score;
        if (cEl) cEl.textContent = combo;
        if (dEl) dEl.textContent = Math.floor(distance) + "m";
    }

    function renderLives() {
        const el = root.querySelector("#racingLives");
        if (!el) return;
        el.innerHTML = "";
        for (let i = 0; i < MAX_LIVES; i++) {
            const heart = document.createElement("span");
            heart.className = "racing-heart" + (i < lives ? " full" : " empty");
            heart.textContent = i < lives ? "❤" : "🖤";
            el.appendChild(heart);
        }
    }

    /* ===== 结束 ===== */

    function endGame() {
        stopLoop();
        playGameOverSound();
        clearObstacles();

        const isNewRecord = score > highScore;
        if (isNewRecord) {
            highScore = score;
            saveHighScore(highScore);
        }

        const wrapper = root.querySelector(".racing-wrapper");
        if (!wrapper) return;

        const overlay = document.createElement("div");
        overlay.className = "racing-gameover";
        overlay.innerHTML = `
            <div class="racing-gameover-card">
                <h2>💥 撞车了！</h2>
                <div class="result-row">
                    <span class="result-label">最终得分</span>
                    <span class="result-value ${isNewRecord ? "new-record" : ""}">${score}${isNewRecord ? '<span class="new-record-badge">新纪录</span>' : ""}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">最高分</span>
                    <span class="result-value">${highScore}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">行驶距离</span>
                    <span class="result-value">${Math.floor(distance)}m</span>
                </div>
                <div class="result-row">
                    <span class="result-label">到达等级</span>
                    <span class="result-value">${level}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">命中次数</span>
                    <span class="result-value">${correctCount}</span>
                </div>
                <div class="btn-group">
                    <button class="racing-btn racing-btn-primary" id="racingRestart">再来一局</button>
                    <button class="racing-btn racing-btn-back" id="racingGoHome">返回主界面</button>
                </div>
            </div>
        `;
        wrapper.appendChild(overlay);

        overlay.querySelector("#racingRestart").addEventListener("click", () => {
            overlay.remove();
            startGame();
        });
        overlay.querySelector("#racingGoHome").addEventListener("click", onBack);
    }

    /* ===== mount / unmount ===== */

    function mount() {
        mounted = true;
        renderStartScreen();
    }

    function unmount() {
        mounted = false;
        stopLoop();
        unbindGameControls();
        clearObstacles();
        starElements.forEach(el => el.remove());
        starElements = [];
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
    }

    return { mount, unmount };
}

window.createRacingGame = createRacingGame;

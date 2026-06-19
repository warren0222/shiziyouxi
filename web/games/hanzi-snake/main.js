/* 汉字贪吃蛇 —— 识字模式 / 组词模式
 *
 * 玩法：
 *   - 识字：HUD 显示拼音，蛇吃对应汉字
 *   - 组词：HUD 显示一个头字，蛇吃任意能组成两字词的搭档字
 * 规则：
 *   - 吃对：增长 1 节、+10 分、朗读、刷新 4 个食物、可能加速
 *   - 吃错：缩短 1 节，那个错食物补一个新的干扰字
 *   - 撞墙 / 撞自己 / 缩到 0 节：游戏结束
 */

/* ===== 龙头 SVG（青龙侧面，默认朝右；左/上/下由 .dragon-head-rotator.dir-X 转向） ===== */
const DRAGON_HEAD_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" overflow="visible" aria-hidden="true">
  <defs>
    <linearGradient id="snkBodyBase" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4db6ac"/>
      <stop offset="0.6" stop-color="#00897b"/>
      <stop offset="1" stop-color="#00564a"/>
    </linearGradient>
    <radialGradient id="snkHeadFace" cx="55%" cy="40%" r="58%">
      <stop offset="0" stop-color="#a7e9e0"/>
      <stop offset="0.55" stop-color="#26a69a"/>
      <stop offset="1" stop-color="#003c30"/>
    </radialGradient>
    <linearGradient id="snkHeadHorn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff59d"/>
      <stop offset="1" stop-color="#f9a825"/>
    </linearGradient>
    <linearGradient id="snkHeadMane" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#00695c"/>
      <stop offset="1" stop-color="#003c30"/>
    </linearGradient>
  </defs>

  <!-- 头后鬃毛（在头与龙身之间的过渡） -->
  <path d="M4,28 Q-2,46 4,75 Q12,84 24,78 Q20,58 18,38 Q14,26 8,26 Z"
        fill="url(#snkHeadMane)" stroke="#003c30" stroke-width="1.4" stroke-linejoin="round"/>
  <!-- 鬃毛上的一缕高光丝 -->
  <path d="M14,32 Q22,30 26,38 Q20,38 16,44 Z"
        fill="#80cbc4" opacity="0.7"/>

  <!-- 龙头主体（侧面，snout 朝右） -->
  <path d="M15,28
           Q28,18 50,22
           Q72,26 88,36
           Q96,46 92,55
           Q86,62 76,62
           Q66,68 52,72
           Q28,76 18,68
           Q10,48 15,28 Z"
        fill="url(#snkHeadFace)" stroke="#003c30" stroke-width="2" stroke-linejoin="round"/>

  <!-- 后龙角（靠后、稍高） -->
  <path d="M30,24 L18,2 L24,12 L30,9 L36,22 Z"
        fill="url(#snkHeadHorn)" stroke="#3e2723" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- 前龙角（靠前、稍小） -->
  <path d="M46,22 L34,3 L40,13 L46,10 L52,20 Z"
        fill="url(#snkHeadHorn)" stroke="#3e2723" stroke-width="1.5" stroke-linejoin="round"/>

  <!-- 眉骨 -->
  <path d="M48,36 Q58,32 68,38" stroke="#003c30" stroke-width="2.2" fill="none" stroke-linecap="round"/>

  <!-- 单眼（侧面只露一只） -->
  <ellipse cx="58" cy="44" rx="6.5" ry="6" fill="white" stroke="#003c30" stroke-width="1.5"/>
  <ellipse cx="60" cy="45" rx="3.2" ry="3.8" fill="#1a1a1a"/>
  <circle cx="61.5" cy="43" r="1.3" fill="white"/>

  <!-- 鼻孔（snout 末端上侧） -->
  <ellipse cx="87" cy="45" rx="1.8" ry="2.2" fill="#003c30"/>

  <!-- 嘴线（从颊到 snout） -->
  <path d="M65,60 Q76,63 89,57" stroke="#003c30" stroke-width="2" fill="none" stroke-linecap="round"/>

  <!-- 一颗小尖牙 -->
  <path d="M76,60 L78,66 L81,60 Z" fill="white" stroke="#003c30" stroke-width="0.7" stroke-linejoin="round"/>

  <!-- 下巴胡须丛 -->
  <path d="M52,72 Q44,88 32,88 Q42,80 48,72 Z"
        fill="#fff59d" stroke="#bf6f00" stroke-width="0.8"/>

  <!-- 飘逸金色龙须（两条，从 snout 下方拉向后方） -->
  <path d="M68,55 Q40,70 6,66" stroke="#fff59d" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M72,60 Q36,80 2,88" stroke="#fff59d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
</svg>
`;

/* ===== 龙尾 SVG（青绿色三尖扇；扇尖朝左、接合段在右） ===== */
const DRAGON_TAIL_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="snkTailFan" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#00695c"/>
      <stop offset="0.5" stop-color="#26a69a"/>
      <stop offset="1" stop-color="#a7e9e0"/>
    </linearGradient>
  </defs>

  <!-- 粗壮三尖扇尾（接合段在右、扇叶展向左） -->
  <polygon points="100,28 100,72 60,68 5,82 30,50 5,18 60,32"
           fill="url(#snkTailFan)" stroke="#003c30" stroke-width="2.2" stroke-linejoin="round"/>

  <!-- 中央脊线 -->
  <line x1="100" y1="50" x2="30" y2="50" stroke="#003c30" stroke-width="1" opacity="0.6"/>

  <!-- 鳞片高光 -->
  <circle cx="82" cy="50" r="4" fill="#a7e9e0" opacity="0.7"/>
  <circle cx="68" cy="48" r="2" fill="#a7e9e0" opacity="0.55"/>
  <circle cx="68" cy="52" r="1.6" fill="#a7e9e0" opacity="0.55"/>
</svg>
`;

function createSnakeGame({ root, onBack }) {
    /* ===== 常量 ===== */
    const COLS = 14;
    const ROWS = 14;
    const FOOD_COUNT = 4;          // 棋盘上同时出现的食物数量
    const INITIAL_SNAKE_LEN = 3;
    const INITIAL_STEP_MS = 220;
    const MIN_STEP_MS = 90;
    const SPEEDUP_EVERY = 5;       // 每吃对几个加速一次
    const SPEEDUP_FACTOR = 0.92;
    const KEY_MIN_INTERVAL = 60;   // 键盘 debounce
    const SWIPE_THRESHOLD = 28;
    const STORAGE_KEY = "snake_highscore";

    /* ===== 状态 ===== */
    let mounted = false;
    let gameActive = false;
    let mode = "literacy";          // "literacy" | "word"
    let snake = [];                 // [{x,y}]，head 在 [0]
    let dir = { dx: 1, dy: 0 };
    let queuedDir = null;
    let foods = [];                 // [{x,y,char,correct}]
    let target = null;              // 识字: {char,pinyin}；组词: {head,pinyin,partners}
    let score = 0;
    let highScore = loadHighest();
    let stepMs = INITIAL_STEP_MS;
    let correctEaten = 0;
    let tickId = null;
    let lastKeyAt = 0;
    let swipeStart = null;
    let resizeObserver = null;
    let toastTimer = null;

    /* ===== 工具函数 ===== */
    function randInt(n) { return Math.floor(Math.random() * n); }
    function randPick(arr) { return arr[randInt(arr.length)]; }
    function pinyinOf(c) { return (window.PINYIN_MAP && window.PINYIN_MAP[c]) || ""; }

    function loadHighest() {
        try { return parseInt(localStorage.getItem(STORAGE_KEY)) || 0; }
        catch (_) { return 0; }
    }
    function saveHighest(n) {
        try { localStorage.setItem(STORAGE_KEY, n); } catch (_) {}
    }

    function speak(s) {
        if (!s) return;
        try { if (window.speakHanzi) window.speakHanzi(s); } catch (_) {}
    }

    /* ===== 开始页 ===== */
    function renderStartScreen() {
        root.innerHTML = `
            <section class="snake-start">
                <h1>🐲 汉字贪吃龙</h1>
                <p class="snake-tagline">操控小龙，边玩边练识字 · 组词</p>

                <div class="snake-mode-cards">
                    <button class="snake-mode-card" data-mode="literacy">
                        <div class="snake-mode-emoji">🔤</div>
                        <h2>识字模式</h2>
                        <p>看龙头标签的拼音，吃对应汉字</p>
                        <div class="snake-mode-eg">例：龙头亮 <b>shuǐ</b> → 吃 <b>水</b></div>
                    </button>
                    <button class="snake-mode-card" data-mode="word">
                        <div class="snake-mode-emoji">📚</div>
                        <h2>组词模式</h2>
                        <p>看龙头标签的头字，吃能组词的搭档字</p>
                        <div class="snake-mode-eg">例：龙头亮 <b>水</b> → 吃 <b>杯</b> = 水杯</div>
                    </button>
                </div>

                <div class="snake-rules">
                    <div>⬆️⬇️⬅️➡️ / WASD / 滑动控制方向</div>
                    <div>✅ 吃对：长 1 节 +10 分 &nbsp;&nbsp; ❌ 吃错：缩 1 节</div>
                    <div>💥 撞墙 / 撞自己 / 缩到没节都会结束</div>
                </div>

                <div class="snake-best">🏆 最高分：<b>${highScore}</b></div>

                <button class="btn-secondary snake-back-btn" id="snakeStartBack">← 返回</button>
            </section>
        `;

        root.querySelectorAll(".snake-mode-card").forEach(btn => {
            btn.addEventListener("click", () => startGame(btn.dataset.mode));
        });
        root.querySelector("#snakeStartBack").addEventListener("click", onBack);
    }

    /* ===== 游戏页 ===== */
    function renderGameScreen() {
        const modeLabel = mode === "literacy" ? "识字模式" : "组词模式";
        const targetLabel = mode === "literacy" ? "请吃出" : "头字";
        root.innerHTML = `
            <section class="snake-stage" id="snakeStage">
                <div class="snake-hud">
                    <div class="snake-hud-target">
                        <div class="snake-hud-mode">${modeLabel}</div>
                        <div class="snake-hud-line">
                            <span class="snake-hud-label">${targetLabel}</span>
                            <span class="snake-target-main" id="snakeTargetMain">—</span>
                            <span class="snake-target-sub" id="snakeTargetSub"></span>
                        </div>
                    </div>
                    <div class="snake-hud-stats">
                        <div class="snake-stat"><span>得分</span><b id="snakeScore">0</b></div>
                        <div class="snake-stat"><span>最高</span><b id="snakeHigh">${highScore}</b></div>
                        <div class="snake-stat"><span>速度</span><b id="snakeSpeed">⚡</b></div>
                    </div>
                </div>

                <div class="snake-board-wrap" id="snakeBoardWrap">
                    <div class="snake-toast" id="snakeToast"></div>
                    <div class="snake-grid" id="snakeGrid"
                         style="--cols:${COLS}; --rows:${ROWS};"></div>
                </div>

                <div class="snake-controls">
                    <button class="btn-secondary" id="snakeBack">← 返回</button>
                    <button class="btn-warning" id="snakePause">⏸ 暂停</button>
                </div>
            </section>
        `;

        root.querySelector("#snakeBack").addEventListener("click", onBack);
        root.querySelector("#snakePause").addEventListener("click", togglePause);

        bindGridInputs();
        bindKeyboard();
        bindResize();
        // 等下一帧让 layout 完成再算 cell 尺寸
        requestAnimationFrame(fitGrid);
    }

    /* ===== 启动一局 ===== */
    function startGame(chosenMode) {
        mode = chosenMode === "word" ? "word" : "literacy";
        score = 0;
        correctEaten = 0;
        stepMs = INITIAL_STEP_MS;
        dir = { dx: 1, dy: 0 };
        queuedDir = null;

        // 蛇放在中间，朝右，3 节
        const cy = Math.floor(ROWS / 2);
        const cx = Math.floor(COLS / 2);
        snake = [];
        for (let i = 0; i < INITIAL_SNAKE_LEN; i++) {
            snake.push({ x: cx - i, y: cy });
        }

        renderGameScreen();
        pickTarget();
        spawnAllFoods();
        renderHUD();
        renderBoard();

        gameActive = true;
        startTick();
    }

    function startTick() {
        clearInterval(tickId);
        tickId = setInterval(tick, stepMs);
    }

    function togglePause() {
        if (!gameActive) return;
        const btn = root.querySelector("#snakePause");
        if (tickId) {
            clearInterval(tickId);
            tickId = null;
            if (btn) btn.textContent = "▶ 继续";
        } else {
            startTick();
            if (btn) btn.textContent = "⏸ 暂停";
        }
    }

    /* ===== 主循环 ===== */
    function tick() {
        if (!gameActive) return;

        // 应用排队的方向（防止一拍内反向）
        if (queuedDir) {
            if (queuedDir.dx !== -dir.dx || queuedDir.dy !== -dir.dy) {
                dir = queuedDir;
            }
            queuedDir = null;
        }

        const head = snake[0];
        const nx = head.x + dir.dx;
        const ny = head.y + dir.dy;

        // 撞墙
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
            return endGame("撞墙了！");
        }
        // 撞自己（注意：移动时会去尾，所以末节即将让位，本不该判碰；但简化：直接看与全身相撞）
        for (let i = 0; i < snake.length - 1; i++) {
            if (snake[i].x === nx && snake[i].y === ny) {
                return endGame("撞到自己了！");
            }
        }

        // 找命中的食物
        const foodIdx = foods.findIndex(f => f.x === nx && f.y === ny);

        // 把头加上去
        snake.unshift({ x: nx, y: ny });

        if (foodIdx >= 0) {
            const food = foods[foodIdx];
            if (food.correct) {
                eatCorrect(food, foodIdx);
            } else {
                eatWrong(food, foodIdx);
            }
        } else {
            // 没吃到东西，去尾保持长度
            snake.pop();
        }

        if (gameActive) renderBoard();
    }

    /* ===== 吃对 / 吃错 ===== */
    function eatCorrect(food, foodIdx) {
        score += 10;
        correctEaten += 1;

        // 朗读 + 飘字
        if (mode === "literacy") {
            speak(food.char);
            showToast(`✅ ${food.char}（${pinyinOf(food.char)}）`, "good");
        } else {
            const word = target.head + food.char;
            speak(word);
            showToast(`✅ ${target.head} + ${food.char} = ${word}`, "good");
        }

        // 选新目标 + 重刷所有食物
        pickTarget();
        spawnAllFoods();

        // 加速
        if (correctEaten % SPEEDUP_EVERY === 0 && stepMs > MIN_STEP_MS) {
            stepMs = Math.max(MIN_STEP_MS, Math.round(stepMs * SPEEDUP_FACTOR));
            startTick();
        }

        renderHUD();
    }

    function eatWrong(food, foodIdx) {
        // 缩短：去掉刚 unshift 的头之后再多去一节，相当于净减 1
        // （此前已经 unshift，所以从 length-1 端去 1 + 1 = 2 节，净增 -1）
        snake.pop();
        snake.pop();

        if (snake.length <= 0) {
            return endGame("缩没了！");
        }

        // 抖动反馈 + 飘字
        const wrap = root.querySelector("#snakeBoardWrap");
        if (wrap) {
            wrap.classList.remove("snake-shake");
            // force reflow 重启动画
            void wrap.offsetWidth;
            wrap.classList.add("snake-shake");
        }
        if (mode === "literacy") {
            showToast(`❌ ${food.char}（${pinyinOf(food.char)}）`, "bad");
        } else {
            const tryWord = target.head + food.char;
            showToast(`❌ ${target.head} + ${food.char} ≠ 词`, "bad");
        }

        // 把这个错食物换成新的干扰字
        foods.splice(foodIdx, 1);
        addOneDistractor();

        renderHUD();
    }

    function endGame(reason) {
        gameActive = false;
        clearInterval(tickId);
        tickId = null;

        let isNewHigh = false;
        if (score > highScore) {
            highScore = score;
            saveHighest(highScore);
            isNewHigh = true;
        }

        const overlay = document.createElement("div");
        overlay.className = "modal show snake-modal";
        overlay.innerHTML = `
            <div class="modal-content">
                <h2>${isNewHigh ? "🎉 新纪录！" : "游戏结束"}</h2>
                <p class="snake-end-reason">${reason}</p>
                <p>本局得分：<b>${score}</b></p>
                <p>最高分：<b>${highScore}</b></p>
                <p>共吃对：<b>${correctEaten}</b> 个</p>
                <div class="snake-modal-btns">
                    <button class="btn-primary" id="snakeAgain">再来一局</button>
                    <button class="btn-secondary" id="snakeMenu">回开始页</button>
                </div>
            </div>
        `;
        root.appendChild(overlay);

        overlay.querySelector("#snakeAgain").addEventListener("click", () => {
            overlay.remove();
            startGame(mode);
        });
        overlay.querySelector("#snakeMenu").addEventListener("click", () => {
            overlay.remove();
            unbindKeyboard();
            unbindResize();
            renderStartScreen();
        });
    }

    /* ===== 目标 / 食物 ===== */
    function pickTarget() {
        if (mode === "literacy") {
            // 从 HANZI_LIST 里挑一个有拼音的
            const list = window.HANZI_LIST || [];
            for (let tries = 0; tries < 50; tries++) {
                const c = randPick(list);
                const py = pinyinOf(c);
                if (c && py) {
                    target = { char: c, pinyin: py };
                    return;
                }
            }
            // 兜底
            target = { char: "水", pinyin: "shuǐ" };
        } else {
            const pairs = window.WORD_PAIRS || {};
            const keys = Object.keys(pairs).filter(k => Array.isArray(pairs[k]) && pairs[k].length > 0);
            if (keys.length === 0) {
                target = { head: "水", pinyin: "shuǐ", partners: ["杯"] };
                return;
            }
            const head = randPick(keys);
            target = { head, pinyin: pinyinOf(head), partners: pairs[head].slice() };
        }
    }

    function spawnAllFoods() {
        foods = [];
        // 1 个正确字
        foods.push(makeFood(true, getCorrectChar(), occupiedSet()));
        // 3 个干扰字
        for (let i = 0; i < FOOD_COUNT - 1; i++) {
            addOneDistractor();
        }
    }

    function addOneDistractor() {
        const c = pickDistractorChar();
        foods.push(makeFood(false, c, occupiedSet()));
    }

    function getCorrectChar() {
        if (mode === "literacy") return target.char;
        // 组词模式：随机一个搭档
        return randPick(target.partners);
    }

    function pickDistractorChar() {
        const list = window.HANZI_LIST || ["木", "火", "山", "石"];
        const usedChars = new Set(foods.map(f => f.char));
        if (mode === "literacy") {
            const tpy = target.pinyin;
            for (let tries = 0; tries < 80; tries++) {
                const c = randPick(list);
                if (!c) continue;
                if (c === target.char) continue;
                if (usedChars.has(c)) continue;
                if (pinyinOf(c) === tpy) continue;     // 拼音相同也算正确，避免歧义
                return c;
            }
            return list[0] || "木";
        } else {
            const partners = new Set(target.partners);
            const head = target.head;
            for (let tries = 0; tries < 80; tries++) {
                const c = randPick(list);
                if (!c) continue;
                if (c === head) continue;
                if (usedChars.has(c)) continue;
                if (partners.has(c)) continue;          // 也是搭档就不算干扰
                return c;
            }
            return list[0] || "木";
        }
    }

    function makeFood(correct, char, occupied) {
        // 找一个空格
        for (let tries = 0; tries < 200; tries++) {
            const x = randInt(COLS);
            const y = randInt(ROWS);
            const key = x + "," + y;
            if (!occupied.has(key)) {
                occupied.add(key);
                return { x, y, char, correct };
            }
        }
        // 兜底：扫一遍找第一个空格
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const key = x + "," + y;
                if (!occupied.has(key)) {
                    occupied.add(key);
                    return { x, y, char, correct };
                }
            }
        }
        return { x: 0, y: 0, char, correct };
    }

    function occupiedSet() {
        const s = new Set();
        for (const seg of snake) s.add(seg.x + "," + seg.y);
        for (const f of foods) s.add(f.x + "," + f.y);
        return s;
    }

    /* ===== HUD / 渲染 ===== */
    function renderHUD() {
        const mainEl = root.querySelector("#snakeTargetMain");
        const subEl = root.querySelector("#snakeTargetSub");
        if (mainEl && subEl) {
            if (mode === "literacy") {
                mainEl.textContent = target.pinyin || "";
                subEl.textContent = "";
                mainEl.classList.add("is-pinyin");
            } else {
                mainEl.textContent = target.head || "";
                subEl.textContent = target.pinyin ? `(${target.pinyin})` : "";
                mainEl.classList.remove("is-pinyin");
            }
        }
        const scEl = root.querySelector("#snakeScore");
        const hiEl = root.querySelector("#snakeHigh");
        const spEl = root.querySelector("#snakeSpeed");
        if (scEl) scEl.textContent = String(score);
        if (hiEl) hiEl.textContent = String(highScore);
        if (spEl) {
            // 速度按 1-5 档渐进显示 ⚡
            const total = INITIAL_STEP_MS - MIN_STEP_MS;
            const used = INITIAL_STEP_MS - stepMs;
            const lvl = Math.max(1, Math.min(5, 1 + Math.floor((used / total) * 4 + 0.0001)));
            spEl.textContent = "⚡".repeat(lvl);
        }
    }

    function renderBoard() {
        const grid = root.querySelector("#snakeGrid");
        if (!grid) return;
        // 简单粗暴：整体重建棋盘的 actor 层
        grid.innerHTML = "";

        // 食物
        for (const f of foods) {
            const el = document.createElement("div");
            el.className = "snake-cell food";
            el.style.setProperty("--x", f.x);
            el.style.setProperty("--y", f.y);
            el.textContent = f.char;
            grid.appendChild(el);
        }
        // 龙身（从尾到头，让头压在最上面）
        const lastIdx = snake.length - 1;
        const labelText = mode === "literacy" ? (target?.pinyin || "") : (target?.head || "");
        for (let i = lastIdx; i >= 0; i--) {
            const seg = snake[i];
            const el = document.createElement("div");

            if (i === 0) {
                // ===== 龙头 =====
                el.className = "snake-cell head";
                let dirCls = "dir-right";
                if (dir.dx === 1)       dirCls = "dir-right";
                else if (dir.dx === -1) dirCls = "dir-left";
                else if (dir.dy === 1)  dirCls = "dir-down";
                else                    dirCls = "dir-up";

                el.style.setProperty("--x", seg.x);
                el.style.setProperty("--y", seg.y);

                // 标签：在棋盘最上 2 行时翻到龙头下方，避免被裁
                const labelPos = seg.y < 2 ? "below" : "above";
                const labelKindCls = mode === "literacy" ? " is-pinyin" : "";

                el.innerHTML = `
                    <div class="dragon-head-rotator ${dirCls}">${DRAGON_HEAD_SVG}</div>
                    <span class="snake-head-label ${labelPos}${labelKindCls}">${labelText || "—"}</span>
                `;
            } else {
                // ===== 龙身 / 龙尾 =====
                const isTail = i === lastIdx && lastIdx > 0;
                el.className = "snake-cell " + (isTail ? "tail" : "body");
                el.style.setProperty("--x", seg.x);
                el.style.setProperty("--y", seg.y);
                if (isTail && lastIdx >= 1) {
                    // 计算"上一节相对于尾巴的方向"，决定扇尾的旋转
                    const prev = snake[lastIdx - 1];
                    const tdx = Math.sign(prev.x - seg.x);
                    const tdy = Math.sign(prev.y - seg.y);
                    let dirCls = "dir-right";
                    if (tdx === 1)       dirCls = "dir-right";
                    else if (tdx === -1) dirCls = "dir-left";
                    else if (tdy === 1)  dirCls = "dir-down";
                    else                 dirCls = "dir-up";
                    el.innerHTML = `<div class="dragon-tail-rotator ${dirCls}">${DRAGON_TAIL_SVG}</div>`;
                }
            }
            grid.appendChild(el);
        }
    }

    function showToast(text, kind) {
        const el = root.querySelector("#snakeToast");
        if (!el) return;
        el.textContent = text;
        el.className = "snake-toast show " + (kind || "");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.classList.remove("show");
        }, 1500);
    }

    /* ===== 自适应 ===== */
    function fitGrid() {
        const wrap = root.querySelector("#snakeBoardWrap");
        const grid = root.querySelector("#snakeGrid");
        if (!wrap || !grid) return;
        const rect = wrap.getBoundingClientRect();
        const availW = rect.width - 8;
        const availH = rect.height - 8;
        if (availW <= 0 || availH <= 0) return;
        const byW = Math.floor(availW / COLS);
        const byH = Math.floor(availH / ROWS);
        const cell = Math.max(20, Math.min(48, Math.min(byW, byH)));
        grid.style.setProperty("--cell", cell + "px");
    }

    function bindResize() {
        unbindResize();
        if (typeof ResizeObserver !== "undefined") {
            const wrap = root.querySelector("#snakeBoardWrap");
            if (wrap) {
                resizeObserver = new ResizeObserver(fitGrid);
                resizeObserver.observe(wrap);
            }
        }
        window.addEventListener("resize", fitGrid);
        window.addEventListener("orientationchange", fitGrid);
    }
    function unbindResize() {
        if (resizeObserver) {
            try { resizeObserver.disconnect(); } catch (_) {}
            resizeObserver = null;
        }
        window.removeEventListener("resize", fitGrid);
        window.removeEventListener("orientationchange", fitGrid);
    }

    /* ===== 输入 ===== */
    function setQueuedDir(dx, dy) {
        // 拒绝 180° 反向（与当前 dir 比较）
        if (dx === -dir.dx && dy === -dir.dy) return;
        // 也拒绝与队首相同（无意义）
        queuedDir = { dx, dy };
    }

    function onKeyDown(e) {
        if (!gameActive) return;
        const now = performance.now();
        if (now - lastKeyAt < KEY_MIN_INTERVAL) return;
        let handled = true;
        switch (e.key) {
            case "ArrowUp":    case "w": case "W": setQueuedDir(0, -1); break;
            case "ArrowDown":  case "s": case "S": setQueuedDir(0,  1); break;
            case "ArrowLeft":  case "a": case "A": setQueuedDir(-1, 0); break;
            case "ArrowRight": case "d": case "D": setQueuedDir( 1, 0); break;
            case " ":          case "p": case "P": togglePause(); break;
            default: handled = false;
        }
        if (handled) { e.preventDefault(); lastKeyAt = now; }
    }

    function bindKeyboard() {
        unbindKeyboard();
        window.addEventListener("keydown", onKeyDown);
    }
    function unbindKeyboard() {
        window.removeEventListener("keydown", onKeyDown);
    }

    function bindGridInputs() {
        const grid = root.querySelector("#snakeGrid");
        if (!grid) return;
        grid.addEventListener("pointerdown", onGridPointerDown);
        grid.addEventListener("pointerup", onGridPointerUp);
        grid.addEventListener("pointercancel", onGridPointerCancel);
        grid.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
        grid.addEventListener("contextmenu", e => e.preventDefault());
    }
    function onGridPointerDown(e) {
        if (!gameActive) return;
        swipeStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function onGridPointerUp(e) {
        if (!swipeStart || swipeStart.id !== e.pointerId) return;
        const dx = e.clientX - swipeStart.x;
        const dy = e.clientY - swipeStart.y;
        swipeStart = null;
        if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
        if (Math.abs(dx) > Math.abs(dy)) setQueuedDir(Math.sign(dx), 0);
        else                              setQueuedDir(0, Math.sign(dy));
    }
    function onGridPointerCancel() { swipeStart = null; }

    /* ===== 生命周期 ===== */
    function mount() {
        mounted = true;
        renderStartScreen();
    }

    function unmount() {
        mounted = false;
        gameActive = false;
        clearInterval(tickId);
        tickId = null;
        clearTimeout(toastTimer);
        unbindKeyboard();
        unbindResize();
        root.innerHTML = "";
    }

    return { mount, unmount };
}

window.createSnakeGame = createSnakeGame;

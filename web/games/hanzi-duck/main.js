function createDuckGame({ root, onBack }) {
    /* ===== 状态 ===== */
    let mounted = false;
    let gameActive = false;
    let level = 1;
    let lives = 5;
    let hunger = 0;         // 0~100
    let currentTarget = null; // { label, type:"hanzi"|"pinyin", answer }
    let ducks = [];         // [{ id, x, y, label, isCorrect, el, dir, speed, labelType }]
    let kidEl = null;
    let crocEl = null;
    let animFrameId = null;
    let audioCtx = null;
    let lastFrameTime = 0;
    let duckIdCounter = 0;
    let waveToken = 0;   // 用于作废上一波尚未生成完的延迟鸭子

    /* ===== 常量 ===== */
    const MAX_LIVES = 5;
    const HUNGER_PER_HIT = 25;   // 4次命中喂饱鳄鱼
    const DUCK_BODY_W = 74;      // 鸭子宽度（含边框），用于弹跳边界

    /* ===== 关卡配置 =====
       duckSpeed 单位为 px/s（鸭子在上方来回弹跳的水平速度），数值越小越慢。 */
    function getLevelConfig(lv) {
        const ph = lv <= 5 ? "pinyin" : "word";
        if (lv <= 1) return { duckSpeed:48, distractors:3, lives:5, phase:ph };
        if (lv <= 2) return { duckSpeed:56, distractors:4, lives:5, phase:ph };
        if (lv <= 3) return { duckSpeed:64, distractors:5, lives:5, phase:ph };
        if (lv <= 4) return { duckSpeed:72, distractors:6, lives:5, phase:ph };
        if (lv <= 5) return { duckSpeed:80, distractors:6, lives:5, phase:ph };
        if (lv <= 6) return { duckSpeed:58, distractors:3, lives:5, phase:ph };
        if (lv <= 8) return { duckSpeed:68, distractors:4, lives:5, phase:ph };
        if (lv <= 10) return { duckSpeed:78, distractors:5, lives:5, phase:ph };
        return { duckSpeed:88, distractors:6, lives:4, phase:ph };
    }

    /* ===== 音效 ===== */
    function getAudioCtx() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        return audioCtx;
    }
    function playTone(freq, dur, type, vol) {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type || "sine";
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
        } catch(e) {}
    }
    function playShootSound() { playTone(300, 0.08, "square", 0.1); setTimeout(()=>playTone(500, 0.06, "square", 0.08), 40); }
    function playHitSound() { playTone(880, 0.08, "square", 0.1); setTimeout(()=>playTone(1320, 0.12, "square", 0.08), 60); }
    function playWrongSound() { playTone(200, 0.15, "sawtooth", 0.1); setTimeout(()=>playTone(160, 0.2, "sawtooth", 0.08), 80); }
    function playBiteSound() { playTone(150, 0.1, "sawtooth", 0.12); setTimeout(()=>playTone(100, 0.15, "sawtooth", 0.1), 60); }
    function playWinSound() { playTone(523,0.1,"square",0.1); setTimeout(()=>playTone(659,0.1,"square",0.1),100); setTimeout(()=>playTone(784,0.15,"square",0.1),200); }
    function playLoseSound() { playTone(440,0.2,"sawtooth",0.1); setTimeout(()=>playTone(350,0.2,"sawtooth",0.1),150); setTimeout(()=>playTone(260,0.4,"sawtooth",0.08),300); }

    /* ===== 工具 ===== */
    function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
    function pickRandom(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

    /* ===== 目标生成 ===== */
    function generateTarget() {
        const allHanzi = window.HANZI_LIST || [];
        const pinyinMap = window.PINYIN_MAP || {};
        const wordPairs = window.WORD_PAIRS || {};
        const config = getLevelConfig(level);

        if (config.phase === "pinyin") {
            // 汉字-拼音配对
            const eligible = allHanzi.filter(h => pinyinMap[h]);
            const h = pickRandom(eligible);
            const py = pinyinMap[h];
            const dir = Math.random() < 0.5 ? "hp" : "ph";
            // hp: 目标=拼音, 答案=汉字; ph: 目标=汉字, 答案=拼音
            currentTarget = {
                label: dir === "hp" ? py : h,
                type: dir === "hp" ? "pinyin" : "hanzi",
                answer: dir === "hp" ? h : py,
                answerHanzi: h,
                answerType: dir === "hp" ? "hanzi" : "pinyin",
                dir
            };
        } else {
            // 组词练习
            const keys = Object.keys(wordPairs).filter(k => wordPairs[k].length > 0);
            const key = pickRandom(keys);
            const partners = wordPairs[key];
            const answer = pickRandom(partners);
            currentTarget = {
                label: key,
                type: "hanzi",
                answer: answer,
                answerHanzi: answer,
                answerType: "hanzi",
                dir: "word"
            };
        }
    }

    /* ===== 生成干扰标签 ===== */
    function getDistractorLabels(count) {
        const allHanzi = window.HANZI_LIST || [];
        const pinyinMap = window.PINYIN_MAP || {};
        const labels = new Set();
        // 干扰项类型只取决于答案类型，与 dir 无关
        const wantPinyin = currentTarget.answerType === "pinyin";
        const eligibleHanzi = wantPinyin ? allHanzi.filter(h => pinyinMap[h]) : null;
        let tries = 0;
        while (labels.size < count && tries < 200) {
            tries++;
            if (wantPinyin) {
                // 答案是拼音，干扰也用拼音
                const h = pickRandom(eligibleHanzi);
                const py = pinyinMap[h];
                if (py && py !== currentTarget.answer) labels.add(py);
            } else {
                // 答案是汉字（hp 汉字答案 / word 组词），干扰用其他汉字
                const h = pickRandom(allHanzi);
                if (h !== currentTarget.answer) labels.add(h);
            }
        }
        return [...labels].slice(0, count);
    }

    /* ===== 鸭子管理 ===== */
    function spawnDuck(isCorrect, label) {
        const config = getLevelConfig(level);
        const id = ++duckIdCounter;
        const stageEl = root.querySelector("#duckStage");
        if (!stageEl) return;
        const stageRect = stageEl.getBoundingClientRect();
        const stageW = stageRect.width;

        // 在上方区域随机出现，左右来回弹跳
        const dir = Math.random() < 0.5 ? 1 : -1;
        const margin = 8;
        const x = margin + Math.random() * Math.max(1, stageW - DUCK_BODY_W - margin * 2);
        // y 限定在屏幕上方 8%~38%，鸭子始终在天空中
        const minY = stageRect.height * 0.10;
        const maxY = Math.max(minY + 20, stageRect.height * 0.38);
        const y = minY + Math.random() * (maxY - minY);

        const speed = config.duckSpeed; // px/s

        const el = document.createElement("div");
        el.className = "duck";
        el.dataset.duckId = id;
        // 鸭嘴默认朝左，向右移动时翻转使其朝向运动方向
        if (dir > 0) el.classList.add("flip");

        // 身体（含翅膀、眼睛、尾巴，均有动画）
        const body = document.createElement("div");
        body.className = "duck-body";

        const tail = document.createElement("div");
        tail.className = "duck-tail";
        body.appendChild(tail);

        const wing = document.createElement("div");
        wing.className = "duck-wing";
        body.appendChild(wing);

        const eye = document.createElement("div");
        eye.className = "duck-eye";
        const pupil = document.createElement("div");
        pupil.className = "duck-pupil";
        eye.appendChild(pupil);
        body.appendChild(eye);

        // 标签牌（对错同色，必须读字才能分辨）
        const tag = document.createElement("div");
        tag.className = "duck-tag";
        tag.textContent = label;

        el.appendChild(body);
        el.appendChild(tag);

        el.style.left = x + "px";
        el.style.top = y + "px";
        stageEl.appendChild(el);

        const duck = {
            id, x, y, label, isCorrect, el, dir,
            speed, born: performance.now(),
            labelType: currentTarget.answerType
        };
        ducks.push(duck);

        // 点击射击
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!gameActive) return;
            shootDuck(duck);
        });
        el.addEventListener("touchstart", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!gameActive) return;
            shootDuck(duck);
        }, { passive: false });
    }

    function spawnWave() {
        if (!gameActive) return;
        // 清除上一波残留鸭子，避免来回弹跳时鸭子堆积
        ducks.forEach(d => { if (d.el && d.el.parentNode) d.el.parentNode.removeChild(d.el); });
        ducks = [];

        const config = getLevelConfig(level);
        generateTarget();
        updateTargetDisplay();
        updateHUD();

        // 生成 1 只正确鸭 + 干扰鸭
        const distractorLabels = getDistractorLabels(config.distractors);
        const allLabels = [currentTarget.answer, ...distractorLabels];
        shuffle(allLabels);

        // 分批生成，每只间隔 300ms；新波次开始时作废上一波的延迟生成
        const myToken = ++waveToken;
        allLabels.forEach((label, i) => {
            setTimeout(() => {
                if (!gameActive || myToken !== waveToken) return;
                const isCorrect = label === currentTarget.answer;
                spawnDuck(isCorrect, label);
            }, i * 300);
        });
    }

    function removeDuck(duck, animClass) {
        if (duck.el && animClass) duck.el.classList.add(animClass);
        const idx = ducks.indexOf(duck);
        if (idx >= 0) ducks.splice(idx, 1);
        if (duck.el) {
            setTimeout(() => { if (duck.el && duck.el.parentNode) duck.el.parentNode.removeChild(duck.el); }, 600);
        }
    }

    /* ===== 射击 ===== */
    function shootDuck(duck) {
        if (duck.hit) return;
        duck.hit = true;
        playShootSound();

        // 小孩发射弹弓的拉弓-释放动作
        if (kidEl) {
            kidEl.classList.add("shooting");
            setTimeout(() => kidEl.classList.remove("shooting"), 360);
        }

        // 弹珠动画（从弹弓叉口的弹珠兜飞向鸭子）
        const stageEl = root.querySelector("#duckStage");
        if (stageEl && kidEl) {
            const pouch = kidEl.querySelector(".sling-pouch");
            const pouchRect = (pouch || kidEl).getBoundingClientRect();
            const stageRect = stageEl.getBoundingClientRect();
            const duckRect = duck.el.getBoundingClientRect();

            const bullet = document.createElement("div");
            bullet.className = "bullet";
            bullet.style.left = (pouchRect.left - stageRect.left + pouchRect.width / 2) + "px";
            bullet.style.top = (pouchRect.top - stageRect.top + pouchRect.height / 2) + "px";
            stageEl.appendChild(bullet);

            // 飞向鸭子
            const dx = (duckRect.left - stageRect.left + duckRect.width / 2) - parseFloat(bullet.style.left);
            const dy = (duckRect.top - stageRect.top + duckRect.height / 2) - parseFloat(bullet.style.top);
            bullet.style.transition = "transform 0.15s linear";
            requestAnimationFrame(() => {
                bullet.style.transform = `translate(${dx}px, ${dy}px)`;
            });
            setTimeout(() => { if (bullet.parentNode) bullet.parentNode.removeChild(bullet); }, 200);
        }

        setTimeout(() => {
            if (duck.isCorrect) {
                onCorrectHit(duck);
            } else {
                onWrongHit(duck);
            }
        }, 160);
    }

    async function onCorrectHit(duck) {
        playHitSound();

        // 饥饿度增加
        hunger = Math.min(100, hunger + HUNGER_PER_HIT);
        updateHUD();

        // 朗读
        if (window.speakHanzi && duck.labelType === "hanzi") {
            window.speakHanzi(duck.label);
        } else if (window.speakHanzi && currentTarget.answerHanzi) {
            window.speakHanzi(currentTarget.answerHanzi);
        }

        // 鸭子掉到地上，鳄鱼爬过去吃掉（连续动画）
        await feedCroc(duck);
        if (!gameActive) return;

        // 喂饱即胜利，否则进入下一波（新目标）
        if (hunger >= 100) {
            onWin();
        } else {
            spawnWave();
        }
    }

    /* 鸭子从天上掉到地上，鳄鱼爬过去张嘴吃掉 —— 连续动画序列 */
    async function feedCroc(duck) {
        const wrapper = root.querySelector(".duck-wrapper");
        if (!wrapper || !duck.el || !crocEl) {
            removeDuck(duck);
            crocEat();
            return;
        }

        // 取一次尺寸作为整段动画的基准（期间不重读，避免数值跳动）
        const wrapRect = wrapper.getBoundingClientRect();
        const footer = root.querySelector(".duck-footer");
        const footerRect = footer ? footer.getBoundingClientRect() : wrapRect;
        const crocRect = crocEl.getBoundingClientRect();

        // 地面 y：footer 顶部（草地表面）
        const groundY = footerRect.top - wrapRect.top;
        // 鳄鱼嘴在 wrapper 中的 x（静态时）
        const crocMouthX = (crocRect.right - crocRect.width * 0.08) - wrapRect.left;

        // 鸭子当前（相对 wrapper）坐标
        const duckRect = duck.el.getBoundingClientRect();
        const dx0 = duckRect.left - wrapRect.left;
        const dy0 = duckRect.top - wrapRect.top;

        // 迁移到 wrapper，置顶避免被 footer 遮挡
        wrapper.appendChild(duck.el);
        duck.el.style.left = dx0 + "px";
        duck.el.style.top = dy0 + "px";
        duck.el.style.zIndex = 30;
        // 关掉飞行时的浮动动画 duckBob，否则它会持续覆盖下面的 transform，掉落动画看不到
        duck.el.style.animation = "none";
        duck.el.style.transition = "";
        // 先重置 transform 并强制重排，确保后续过渡从“无 transform”开始
        duck.el.style.transform = "translate(0,0) scale(1) rotate(0)";
        void duck.el.offsetWidth;

        // 从 ducks 移除，animate 不再移动它
        const idx = ducks.indexOf(duck);
        if (idx >= 0) ducks.splice(idx, 1);

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        // —— 第1段：受击僵直（一缩一抖）——
        duck.el.style.transition = "transform 0.16s ease";
        duck.el.style.transform = "scale(0.82) rotate(-10deg)";
        await sleep(160);
        duck.el.style.transform = "scale(1.1) rotate(8deg)";
        await sleep(80);

        // —— 第2段：自由落体到地上（加速 + 翻滚）——
        duck.el.style.transition = "transform 0.62s cubic-bezier(.55,0,.85,.25)";
        // 落到地面：鸭子底部贴近草地
        const ty = groundY - dy0 - duckRect.height * 0.5;
        duck.el.style.transform = `translate(0, ${ty}px) scale(0.55) rotate(200deg)`;
        await sleep(620);

        // —— 第3段：鳄鱼爬到鸭子所在位置并张嘴 ——
        const duckCenterX = dx0 + duckRect.width / 2;
        const dash = duckCenterX - crocMouthX;
        crocEl.classList.add("biting");   // 张大嘴
        crocDashTo(dash);
        await sleep(260);

        // —— 第4段：鳄鱼低头把地上的鸭子咬进嘴里（鸭子被吞）——
        crocEl.classList.remove("biting");
        duck.el.style.transition = "transform 0.32s ease-in, opacity 0.32s ease";
        // 鸭子滑向鳄鱼嘴方向并缩小消失
        const eatDx = (crocMouthX + dash) - duckCenterX;
        duck.el.style.transform = `translate(${eatDx}px, ${ty - 6}px) scale(0.1) rotate(260deg)`;
        duck.el.style.opacity = "0";
        crocEat();   // 鳄鱼抬头咀嚼
        await sleep(620);

        // —— 第5段：鳄鱼退回原位 ——
        crocDashBack();
        await sleep(340);

        if (duck.el && duck.el.parentNode) duck.el.parentNode.removeChild(duck.el);
    }

    function onWrongHit(duck) {
        playWrongSound();
        // 鸭子受惊逃走（朝飞行方向斜上方飞出屏幕）
        escapeDuck(duck);

        // 鳄鱼咬人
        crocBite();
        lives--;
        updateHUD();

        // 屏幕震动
        const wrapper = root.querySelector(".duck-wrapper");
        if (wrapper) { wrapper.classList.add("shake"); setTimeout(()=>wrapper.classList.remove("shake"), 400); }

        if (lives <= 0) {
            onLose();
        }
        // 正确鸭仍在屏幕上来回飞，玩家可继续找，无需补鸭
    }

    /* 错误鸭受惊逃走：一缩一惊，随即朝飞行方向斜上方飞出屏幕淡出 */
    function escapeDuck(duck) {
        const el = duck.el;
        if (!el) { removeDuck(duck); return; }

        // 关掉飞行浮动动画 duckBob，避免覆盖 transform
        el.style.animation = "none";
        el.style.pointerEvents = "none";
        el.style.zIndex = 30;

        // 从 ducks 移除，animate 不再移动它
        const idx = ducks.indexOf(duck);
        if (idx >= 0) ducks.splice(idx, 1);

        // 朝当前飞行方向斜上方逃出：dir>0 向右上，dir<0 向左上
        const dirX = duck.dir > 0 ? 1 : -1;

        // 第1段：受惊一缩
        el.style.transition = "transform 0.14s ease";
        el.style.transform = "scale(0.8) rotate(-12deg)";
        setTimeout(() => {
            // 第2段：扑棱加速飞走
            el.style.transition = "transform 0.5s cubic-bezier(.4,0,.8,.4), opacity 0.5s ease 0.15s";
            el.style.transform = `translate(${dirX * 260}px, -200px) scale(0.4) rotate(${dirX * 60}deg)`;
            el.style.opacity = "0";
        }, 140);

        setTimeout(() => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }, 680);
    }

    /* ===== 鳄鱼动画 ===== */
    /* 鳄鱼横向冲刺到指定位移，再退回原位 */
    /* 鳄鱼横向冲刺到指定位移（不自动返回，由调用方安排返回） */
    function crocDashTo(deltaX) {
        if (!crocEl) return;
        crocEl.style.transition = "transform 0.22s ease-out";
        crocEl.style.transform = `translateX(${deltaX}px)`;
    }
    /* 鳄鱼退回原位 */
    function crocDashBack() {
        if (!crocEl) return;
        crocEl.style.transition = "transform 0.32s ease-in";
        crocEl.style.transform = "";
    }

    function crocEat() {
        if (crocEl) {
            crocEl.classList.add("eating");
            setTimeout(() => crocEl.classList.remove("eating"), 600);
        }
    }

    function crocBite() {
        playBiteSound();
        if (crocEl) {
            // 冲到小男孩身边：嘴抵达男孩左半身并略微咬进
            let delta = 90;
            if (kidEl) {
                const crocRect = crocEl.getBoundingClientRect();
                const kidRect = kidEl.getBoundingClientRect();
                const mouthX = crocRect.right - crocRect.width * 0.08;
                const targetX = kidRect.left + kidRect.width * 0.3;
                delta = Math.max(30, targetX - mouthX + 10);
            }
            crocEl.classList.add("biting");
            crocDashTo(delta);
            setTimeout(() => crocEl.classList.remove("biting"), 520);
            setTimeout(() => crocDashBack(), 260);
        }
    }

    /* ===== 动画循环 ===== */
    function animate(ts) {
        if (!gameActive) return;
        const stageEl = root.querySelector("#duckStage");
        if (!stageEl) return;
        const stageW = stageEl.clientWidth;
        const dt = lastFrameTime ? Math.min((ts - lastFrameTime) / 1000, 0.05) : 1 / 60;
        lastFrameTime = ts;

        for (const d of ducks) {
            if (d.hit) continue;
            d.x += d.dir * d.speed * dt;

            // 到达边缘就反向，在上方来回弹跳
            if (d.dir > 0 && d.x > stageW - DUCK_BODY_W) {
                d.x = stageW - DUCK_BODY_W;
                d.dir = -1;
                d.el.classList.remove("flip");
            } else if (d.dir < 0 && d.x < 0) {
                d.x = 0;
                d.dir = 1;
                d.el.classList.add("flip");
            }
            d.el.style.left = d.x + "px";
        }

        animFrameId = requestAnimationFrame(animate);
    }

    /* ===== 胜负 ===== */
    function onWin() {
        gameActive = false;
        playWinSound();
        renderWinScreen();
    }

    function onLose() {
        gameActive = false;
        playLoseSound();
        renderLoseScreen();
    }

    /* ===== UI 渲染 ===== */
    function updateTargetDisplay() {
        const el = root.querySelector("#duckTargetLabel");
        const hintEl = root.querySelector("#duckTargetHint");
        if (!el) return;
        el.textContent = currentTarget.label;

        if (hintEl) {
            if (currentTarget.dir === "word") {
                hintEl.textContent = "组词";
            } else if (currentTarget.type === "pinyin") {
                hintEl.textContent = "找汉字";
            } else {
                hintEl.textContent = "找拼音";
            }
        }
        // 样式
        el.className = "target-label-text " + currentTarget.type;
    }

    function updateHUD() {
        const lvEl = root.querySelector("#duckLevel");
        const livesEl = root.querySelector("#duckLives");
        const hungerEl = root.querySelector("#duckHungerBar");
        const hungerText = root.querySelector("#duckHungerText");
        if (lvEl) lvEl.textContent = level;
        if (livesEl) {
            livesEl.innerHTML = "";
            for (let i = 0; i < MAX_LIVES; i++) {
                const heart = document.createElement("span");
                heart.className = "heart" + (i < lives ? " alive" : " dead");
                livesEl.appendChild(heart);
            }
        }
        if (hungerEl) hungerEl.style.width = hunger + "%";
        if (hungerText) hungerText.textContent = hunger + "%";
    }

    /* ===== 画面 ===== */
    function renderStartScreen() {
        root.innerHTML = `
            <div class="duck-wrapper">
                <div class="duck-start">
                    <div class="duck-title">🐊 鳄口求生 🦆</div>
                    <div class="duck-subtitle">打鸭子喂鳄鱼，学汉字组词</div>
                    <div class="duck-story">
                        小男孩被鳄鱼困住了！<br>
                        用弹弓打鸭子喂饱鳄鱼，才能获救！<br>
                        打错鸭子，鳄鱼会咬人哦~
                    </div>
                    <button class="duck-btn" id="duckStartBtn">开始游戏</button>
                    <button class="duck-btn secondary" id="duckBackBtn">返回</button>
                </div>
            </div>
        `;
        root.querySelector("#duckStartBtn").addEventListener("click", startGame);
        root.querySelector("#duckBackBtn").addEventListener("click", onBack);
    }

    function renderGameScreen() {
        root.innerHTML = `
            <div class="duck-wrapper">
                <header class="duck-header">
                    <button class="duck-btn small" id="duckBackGame">← 返回</button>
                    <div class="duck-target-box">
                        <span class="duck-target-hint" id="duckTargetHint">找汉字</span>
                        <span class="target-label-text pinyin" id="duckTargetLabel">—</span>
                    </div>
                    <div class="duck-stats">
                        <div class="duck-stat">关卡 <span id="duckLevel">1</span></div>
                        <div class="duck-stat" id="duckLives"></div>
                    </div>
                </header>
                <main class="duck-stage" id="duckStage">
                    <div class="duck-clouds">
                        <div class="cloud c1"></div>
                        <div class="cloud c2"></div>
                        <div class="cloud c3"></div>
                    </div>
                </main>
                <footer class="duck-footer">
                    <div class="duck-croc" id="duckCroc">
                        <svg class="croc-svg" viewBox="0 0 160 92" width="128" height="74" aria-label="鳄鱼">
                            <!-- 尾巴 -->
                            <path class="croc-tail" d="M30 58 C 8 52, 2 40, 14 34 C 20 38, 26 46, 34 52 Z" fill="#388e3c" stroke="#1b5e20" stroke-width="2"/>
                            <!-- 身体（含背部鳞脊） -->
                            <path d="M28 60 C 28 50, 40 44, 56 44 L 120 44 C 140 44, 150 50, 152 58 C 152 64, 144 68, 130 68 L 50 68 C 36 68, 28 66, 28 60 Z"
                                  fill="#4caf50" stroke="#1b5e20" stroke-width="2"/>
                            <!-- 背部鳞刺 -->
                            <g fill="#2e7d32" stroke="#1b5e20" stroke-width="1">
                                <polygon points="52,44 56,32 60,44"/>
                                <polygon points="66,44 70,30 74,44"/>
                                <polygon points="82,44 86,32 90,44"/>
                                <polygon points="98,44 102,34 106,44"/>
                                <polygon points="114,44 118,36 122,44"/>
                            </g>
                            <!-- 后腿 -->
                            <path d="M58 68 L 52 84 L 60 84 L 64 70 Z" fill="#43a047" stroke="#1b5e20" stroke-width="2"/>
                            <path d="M86 68 L 82 84 L 90 84 L 92 70 Z" fill="#43a047" stroke="#1b5e20" stroke-width="2"/>
                            <!-- 上颚（顶部，可张合）—— 下沿改为水平 y=58，让牙齿能稳贴内侧 -->
                            <g class="croc-jaw-top">
                                <path d="M120 44 C 138 42, 150 44, 156 50 C 158 54, 158 57, 156 58 L 120 58 Z"
                                      fill="#66bb6a" stroke="#1b5e20" stroke-width="2"/>
                                <!-- 鼻孔 -->
                                <circle cx="150" cy="49" r="1.6" fill="#1b5e20"/>
                                <!-- 上排利齿（贴在上颚内侧水平嘴沿上方，齿尖朝下到嘴中线 y=58） -->
                                <path d="M124 53 l 4 5 l 4 -5 l 4 5 l 4 -5 l 4 5 l 4 -5 l 4 5 l 4 -5 Z" fill="#fff" stroke="#9e9e9e" stroke-width="0.6"/>
                            </g>
                            <!-- 下颚（底部，可张合）—— 上沿改为水平 y=58 -->
                            <g class="croc-jaw-bottom">
                                <path d="M120 58 L 156 58 C 158 60, 158 64, 156 68 C 150 72, 138 70, 120 70 Z"
                                      fill="#81c784" stroke="#1b5e20" stroke-width="2"/>
                                <!-- 下排利齿（贴在下颚内侧水平嘴沿下方，齿尖朝上到嘴中线 y=58） -->
                                <path d="M124 63 l 4 -5 l 4 5 l 4 -5 l 4 5 l 4 -5 l 4 5 l 4 -5 l 4 5 Z" fill="#fff" stroke="#9e9e9e" stroke-width="0.6"/>
                            </g>
                            <!-- 眼睛（隆起眼眶 + 竖瞳） -->
                            <g>
                                <ellipse cx="118" cy="36" rx="9" ry="8" fill="#4caf50" stroke="#1b5e20" stroke-width="2"/>
                                <circle cx="120" cy="36" r="5" fill="#fffde7"/>
                                <ellipse class="croc-pupil" cx="120" cy="36" rx="1.8" ry="4.2" fill="#1b1b1b"/>
                            </g>
                        </svg>
                        <div class="croc-hunger">
                            <div class="croc-hunger-bar" id="duckHungerBar" style="width:0%"></div>
                        </div>
                        <div class="croc-hunger-text" id="duckHungerText">0%</div>
                    </div>
                    <div class="duck-kid" id="duckKid">
                        <div class="kid-inner">
                            <svg class="kid-svg" viewBox="0 0 64 104" width="58" height="94" aria-label="小男孩">
                                <!-- 腿 -->
                                <rect x="23" y="74" width="7" height="22" rx="3" fill="#1565c0"/>
                                <rect x="33" y="74" width="7" height="22" rx="3" fill="#1565c0"/>
                                <!-- 鞋 -->
                                <ellipse cx="26" cy="98" rx="6" ry="3.5" fill="#3e2723"/>
                                <ellipse cx="37" cy="98" rx="6" ry="3.5" fill="#3e2723"/>
                                <!-- 身体（上衣） -->
                                <path d="M19 42 Q30 37 41 42 L43 76 Q30 80 17 76 Z" fill="#42a5f5" stroke="#1565c0" stroke-width="1.5"/>
                                <!-- 左臂（自然垂下） -->
                                <path d="M22 45 Q15 58 18 70" stroke="#ffe0b2" stroke-width="7" fill="none" stroke-linecap="round"/>
                                <!-- 右臂 + 弹弓（可动） -->
                                <g class="kid-arm">
                                    <path d="M39 45 Q47 41 53 37" stroke="#ffe0b2" stroke-width="7" fill="none" stroke-linecap="round"/>
                                    <!-- 弹弓把手 -->
                                    <line x1="53" y1="37" x2="49" y2="27" stroke="#795548" stroke-width="4.5" stroke-linecap="round"/>
                                    <!-- 弹弓两叉 -->
                                    <line x1="49" y1="27" x2="44" y2="14" stroke="#795548" stroke-width="3.5" stroke-linecap="round"/>
                                    <line x1="49" y1="27" x2="57" y2="16" stroke="#795548" stroke-width="3.5" stroke-linecap="round"/>
                                    <!-- 皮筋 -->
                                    <path class="sling-band" d="M44 14 Q51 22 57 16" stroke="#3e2723" stroke-width="1.6" fill="none"/>
                                    <!-- 弹珠兜 -->
                                    <circle class="sling-pouch" cx="51" cy="18" r="2.8" fill="#5d4037"/>
                                </g>
                                <!-- 头 -->
                                <circle cx="30" cy="22" r="13" fill="#ffe0b2" stroke="#a1887f" stroke-width="1.5"/>
                                <!-- 头发 -->
                                <path d="M18 21 Q19 8 30 8 Q41 8 42 21 Q37 13 30 13 Q23 13 18 21 Z" fill="#5d4037"/>
                                <!-- 眼睛 -->
                                <circle cx="26" cy="22" r="1.7" fill="#3e2723"/>
                                <circle cx="34" cy="22" r="1.7" fill="#3e2723"/>
                                <!-- 嘴 -->
                                <path d="M27 28 Q30 31 33 28" stroke="#3e2723" stroke-width="1.3" fill="none" stroke-linecap="round"/>
                            </svg>
                        </div>
                    </div>
                </footer>
            </div>
        `;
        kidEl = root.querySelector("#duckKid");
        crocEl = root.querySelector("#duckCroc");
        root.querySelector("#duckBackGame").addEventListener("click", () => {
            gameActive = false;
            cancelAnimationFrame(animFrameId);
            renderStartScreen();
        });
    }

    function renderWinScreen() {
        root.innerHTML = `
            <div class="duck-wrapper">
                <div class="duck-result win">
                    <div class="result-title">🎉 过关！</div>
                    <div class="result-info">鳄鱼吃饱了，你获救了！</div>
                    <div class="result-level">第 ${level} 关完成</div>
                    <button class="duck-btn" id="duckNextBtn">下一关</button>
                    <button class="duck-btn secondary" id="duckHomeBtn">返回主页</button>
                </div>
            </div>
        `;
        root.querySelector("#duckNextBtn").addEventListener("click", () => { level++; startLevel(false); });
        root.querySelector("#duckHomeBtn").addEventListener("click", renderStartScreen);
    }

    function renderLoseScreen() {
        root.innerHTML = `
            <div class="duck-wrapper">
                <div class="duck-result lose">
                    <div class="result-title">💀 被鳄鱼咬到了！</div>
                    <div class="result-info">坚持到了第 ${level} 关</div>
                    <button class="duck-btn" id="duckRetryBtn">重新挑战</button>
                    <button class="duck-btn secondary" id="duckHomeBtn2">返回主页</button>
                </div>
            </div>
        `;
        root.querySelector("#duckRetryBtn").addEventListener("click", () => { level = 1; startLevel(true); });
        root.querySelector("#duckHomeBtn2").addEventListener("click", renderStartScreen);
    }

    /* ===== 游戏控制 ===== */
    function startGame() {
        level = 1;
        lives = MAX_LIVES;   // 血量仅在开始新游戏时回满
        startLevel();
    }

    function startLevel(resetLives) {
        const config = getLevelConfig(level);
        // 血量累计：进入下一关不重置；仅开始新游戏或失败重试时回满
        if (resetLives) lives = MAX_LIVES;
        hunger = 0;
        ducks = [];
        duckIdCounter = 0;

        renderGameScreen();
        updateHUD();

        gameActive = true;
        lastFrameTime = 0;
        // 延迟一帧确保 DOM 就绪
        requestAnimationFrame(() => {
            spawnWave();
            animFrameId = requestAnimationFrame(animate);
        });
    }

    /* ===== 生命周期 ===== */
    function mount() {
        mounted = true;
        renderStartScreen();
    }

    function unmount() {
        mounted = false;
        gameActive = false;
        cancelAnimationFrame(animFrameId);
        root.innerHTML = "";
    }

    return { mount, unmount };
}

window.createDuckGame = createDuckGame;

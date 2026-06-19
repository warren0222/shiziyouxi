/**
 * 造句大作战 (hanzi-sentence)
 *
 * 玩法: 控制底部坦克炮管瞄准, 按句子顺序击落顶部带词组的飞碟.
 * 错击 → 飞碟反击导弹; HP 为 0 → 失败; 完整命中一句 → 过关, 难度递增.
 *
 * 数据: window.SENTENCE_BANK (common/js/sentences.js)
 * 工厂: window.createSentenceGame({ root, onBack }) → { mount, unmount }
 */

function createSentenceGame({ root, onBack }) {
    /* ============================ 状态 ============================ */
    let mounted = false;
    let gameActive = false;
    let gameMode = "level";   // "level" = 闯关模式 (转炮管, 飞碟被错击才反击)
                              // "battle" = 对战模式 (炮管锁定, 坦克左右移动, 飞碟自动开火)

    // 关卡 / HP
    let level = 1;
    let tankHp = 5;
    let highScore = 0;

    // 句子相关
    let currentSentence = null;       // {id, text, fragments}
    let nextFragmentIndex = 0;        // 下一个该击落的飞碟在 sentence.fragments 中的索引
    let lockedFragments = [];         // 已锁定的词组 (用于 UI 渲染)
    let seenSentenceIds = new Set();  // 单局已用过的句子, 避免重复

    // 实体集合
    let ufos = [];      // {el, fragmentEl, fragment, index, x, y, w, h, alive, driftSpeed, driftDir, vyDriftSpeed, vyDriftDir, yMin, yMax, nextFireAt}
    let bullets = [];   // {el, x, y, vx, vy, w, h}
    let missiles = [];  // {el, x, y, vx, vy, w, h, angle}

    // 坦克 / 炮管
    let tankEl = null;
    let barrelEl = null;
    let tankPivotX = 0;   // 炮管旋转支点 (相对 arena)
    let tankPivotY = 0;
    let tankBoxW = 60;    // 坦克车身碰撞框宽
    let tankBoxH = 36;    // 高
    let barrelLen = 40;   // 炮管长度 (用于计算子弹生成点)
    let barrelAngle = 0;  // 当前炮管角度 (rad), 0=正上, 负=左偏, 正=右偏 (CSS 旋转标准)
    let targetAngle = 0;  // 目标角度, 平滑跟随

    // 对战模式: 坦克左右移动 (闯关模式不用)
    let tankCenterX = 0;
    let tankBodyMeasuredW = 60;
    let tankMoveLeft = false;
    let tankMoveRight = false;

    // 输入
    let keyLeft = false;
    let keyRight = false;
    let dragAimActive = false;     // 在 arena 上按住拖动调炮管时为 true
    let dragAimPointerId = -1;
    let dragAimLastX = 0;
    let firePressed = false;       // 🔥 按钮按下时为 true (支持长按连发)

    // 舞台尺寸 (每帧 / resize 重测)
    let arenaW = 0;
    let arenaH = 0;

    // 时间循环
    let rafId = null;
    let lastTs = 0;
    let nextBulletAt = 0;
    let invincibleUntil = 0;

    // 关卡过场标志: true 时 tick 不再判 win/lose, 等过场动画结束
    let inLevelTransition = false;

    let starElements = [];
    let audioCtx = null;

    /* ============================ 常量 ============================ */
    const MAX_HP = 5;
    const FIRE_INTERVAL_MS = 200;       // ~5 发/秒
    const BULLET_SPEED = 720;            // px/s
    const BARREL_FOLLOW = 0.25;          // 平滑系数
    const KEY_TURN_RATE = 2.5;           // 键盘转向 rad/s
    const ANGLE_LIMIT = Math.PI / 2 - 0.1; // 炮管最大左右偏角 (避免水平)
    const INVINCIBLE_MS = 600;
    const TANK_MOVE_SPEED = 240;         // 对战模式坦克左右移动速度 px/s
    const STORAGE_KEY = "sentence_highscore";
    const STORAGE_KEY_BATTLE = "sentence_highscore_battle";

    /* ============================ 关卡配置 (两个维度) ============================ */
    // 设计原则: 每升一关, 两个维度中只有一个会动, 让玩家有适应时间.
    // 维度 1: 句子长度 (即飞碟数)
    //   L1=3, L2=4, L3=5, L4=6, L5=6, L6=7, L7=7, L8=8, L9=8, L10+=9
    function sentenceDifficulty(lv) {
        if (lv <= 4) return lv + 2;
        return Math.min(6 + Math.floor((lv - 4) / 2), 9);
    }
    // 兼容旧名 (pickSentenceForLevel 还在用)
    function levelToFragmentCount(lv) { return sentenceDifficulty(lv); }

    // 维度 2: 打击难度档位
    //   L1-L4 = 0 (静止), L5-L6 = 1, L7-L8 = 2, L9-L10 = 3, L11+ = 4 (cap)
    function shootingTier(lv) {
        if (lv <= 4) return 0;
        return Math.min(Math.floor((lv - 3) / 2), 4);
    }

    // 打击档位 → 飞碟漂移速度范围 / 反击导弹速度
    // 每个飞碟在 spawn 时从 [driftMin, driftMax] 内独立抽样自己的速度,
    // 这样即使在同一关, 不同飞碟也不会同步运动, 重叠时会自然散开.
    // 速度曲线设计: 前 3 档保留明显成长, 后 2 档收紧并接近 (tier 4 = cap),
    // 避免高关卡飞碟快到玩家根本反应不过来. 垂直分量再 ×0.6 整体感觉更柔和.
    function getShootingConfig(lv) {
        const t = shootingTier(lv);
        const driftMinByTier = [5,  18, 30, 42, 50];   // tier 0 也给微弱漂移防止持续重叠
        const driftMaxByTier = [15, 32, 48, 60, 70];   // tier 4 = cap, 与 tier 3 仅差 10
        const missileByTier  = [220, 235, 250, 265, 275];
        return {
            tier: t,
            driftMin: driftMinByTier[t],
            driftMax: driftMaxByTier[t],
            missileSpeed: missileByTier[t],
        };
    }

    /* ============================ 音频 ============================ */
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

    function playFireSound()         { playTone(720, 0.04, "square", 0.05); }
    function playHitSound() {
        playTone(880, 0.08, "square", 0.10);
        setTimeout(() => playTone(1320, 0.12, "square", 0.08), 60);
    }
    function playWrongSound()        { playTone(220, 0.15, "sawtooth", 0.10); }
    function playMissileLaunchSound(){ playTone(380, 0.06, "triangle", 0.04); }
    function playDamageSound() {
        playTone(180, 0.18, "sawtooth", 0.12);
        setTimeout(() => playTone(120, 0.22, "sawtooth", 0.10), 80);
    }
    function playLevelUpSound() {
        playTone(523, 0.1, "square", 0.10);
        setTimeout(() => playTone(659, 0.1, "square", 0.10), 100);
        setTimeout(() => playTone(784, 0.12, "square", 0.10), 200);
        setTimeout(() => playTone(1047, 0.16, "square", 0.10), 300);
    }
    function playGameOverSound() {
        playTone(440, 0.2, "sawtooth", 0.10);
        setTimeout(() => playTone(330, 0.2, "sawtooth", 0.10), 150);
        setTimeout(() => playTone(220, 0.4, "sawtooth", 0.08), 300);
    }

    /* ============================ 持久化 ============================ */
    function storageKeyFor(mode) {
        return mode === "battle" ? STORAGE_KEY_BATTLE : STORAGE_KEY;
    }
    function loadHighScoreFor(mode) {
        try { return parseInt(localStorage.getItem(storageKeyFor(mode))) || 0; } catch (e) { return 0; }
    }
    function saveHighScoreFor(mode, s) {
        try { localStorage.setItem(storageKeyFor(mode), s); } catch (e) { /* ignore */ }
    }

    // 对战模式开火节奏 (每飞碟独立计时, 间隔随 shootingTier 变短)
    function autoFireInterval(lv) {
        const t = shootingTier(lv);
        const baseByTier   = [3500, 3000, 2500, 2200, 2000];
        const jitterByTier = [1500, 1500, 1500, 1300, 1000];
        return baseByTier[t] + Math.random() * jitterByTier[t];
    }

    /* ============================ 句子选择 ============================ */
    function pickSentenceForLevel(lv) {
        const bank = window.SENTENCE_BANK || [];
        const targetCount = levelToFragmentCount(lv);

        // 优先匹配目标词组数; 不足回退到相邻档 (优先低难度)
        const tryCounts = [targetCount];
        for (let delta = 1; delta <= 6; delta++) {
            tryCounts.push(targetCount - delta);
            tryCounts.push(targetCount + delta);
        }

        for (const cnt of tryCounts) {
            const pool = bank.filter(s => s.fragments.length === cnt && !seenSentenceIds.has(s.id));
            if (pool.length) {
                return pool[Math.floor(Math.random() * pool.length)];
            }
        }
        // 全部用完 → 重置 seen
        seenSentenceIds = new Set();
        const pool = bank.filter(s => s.fragments.length === targetCount);
        if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
        // 兜底: 随便挑
        return bank[Math.floor(Math.random() * bank.length)] || null;
    }

    /* ============================ 渲染 ============================ */
    function renderShell() {
        // 整个游戏 wrapper, 起始页和游戏页都嵌在这里面
        root.innerHTML = `
            <div class="sentence-wrapper">
                <div class="sentence-bg-stars" id="sentenceBgStars"></div>
            </div>
        `;
        generateBgStars();
    }

    function renderStartScreen() {
        const wrapper = root.querySelector(".sentence-wrapper");
        if (!wrapper) return;

        // 清掉之前的起始 / 结束遮罩
        wrapper.querySelectorAll(".sentence-start, .sentence-gameover, .sentence-game").forEach(el => el.remove());

        const hsLevel = loadHighScoreFor("level");
        const hsBattle = loadHighScoreFor("battle");
        const hsHtml = (hsLevel > 0 || hsBattle > 0)
            ? `<div class="sentence-highscore-display">
                   🏆 历史最高: 闯关 L${hsLevel || "-"} · 对战 L${hsBattle || "-"}
               </div>`
            : "";

        const card = document.createElement("div");
        card.className = "sentence-start";
        card.innerHTML = `
            <div class="sentence-start-card">
                <h2>🛸 造句大作战</h2>
                <p class="sentence-subtitle">瞄准飞碟, 按顺序击落, 连词成句!</p>
                <ul class="sentence-rules">
                    <li>👆 闯关: 滑屏 / ◀▶ / 键盘 A D 调炮管 · 🔥 发射</li>
                    <li>⚔️ 对战: A/D 或 ← → 移动躲避自动开火 · 🔥 还击</li>
                    <li>✅ 击中正确飞碟: HP +1; 💔 HP 为 0 = 失败</li>
                </ul>
                ${hsHtml}
                <div class="sentence-btn-group">
                    <button class="sentence-btn sentence-btn-primary" id="sentenceLevelBtn">🚀 闯关模式</button>
                    <button class="sentence-btn sentence-btn-battle" id="sentenceBattleBtn">⚔️ 对战模式</button>
                    <button class="sentence-btn sentence-btn-back" id="sentenceStartBack">← 返回主界面</button>
                </div>
            </div>
        `;
        wrapper.appendChild(card);

        card.querySelector("#sentenceLevelBtn").addEventListener("click", () => startGame("level"));
        card.querySelector("#sentenceBattleBtn").addEventListener("click", () => startGame("battle"));
        card.querySelector("#sentenceStartBack").addEventListener("click", onBack);
    }

    function renderGameScreen() {
        const wrapper = root.querySelector(".sentence-wrapper");
        if (!wrapper) return;
        // 移除起始 / 结束遮罩
        wrapper.querySelectorAll(".sentence-start, .sentence-gameover").forEach(el => el.remove());
        // 移除旧的游戏 DOM
        wrapper.querySelectorAll(".sentence-game").forEach(el => el.remove());

        const game = document.createElement("div");
        game.className = "sentence-game" + (gameMode === "battle" ? " mode-battle" : " mode-level");
        game.style.cssText = "display:flex;flex-direction:column;flex:1;position:relative;z-index:1;";
        const modeBadge = gameMode === "battle" ? "⚔️" : "🛸";
        const modeTitle = gameMode === "battle" ? "造句对战" : "造句大作战";
        game.innerHTML = `
            <div class="sentence-header">
                <button class="btn-back" id="sentenceBack">← 返回</button>
                <h1>${modeBadge} ${modeTitle}</h1>
                <div class="sentence-level-hp">
                    <span class="sentence-level-text" id="sentenceLevelText">L${level}</span>
                    <span class="sentence-hp" id="sentenceHp"></span>
                </div>
            </div>
            <div class="sentence-built" id="sentenceBuilt"></div>
            <div class="sentence-arena" id="sentenceArena">
                <div class="sentence-tank" id="sentenceTank">
                    <div class="sentence-tank-treads"></div>
                    <div class="sentence-tank-body"></div>
                    <div class="sentence-tank-turret"></div>
                    <div class="sentence-tank-barrel" id="sentenceBarrel"></div>
                </div>
            </div>
            ${gameMode === "battle" ? `
                <div class="sentence-bottom-bar">
                    <div class="sentence-battle-controls" id="sentenceBattleControls">
                        <button class="sentence-move-btn" id="sentenceMoveLeft" type="button">◀</button>
                        <button class="sentence-move-btn" id="sentenceMoveRight" type="button">▶</button>
                    </div>
                    <div class="sentence-fire-controls">
                        <button class="sentence-fire-btn" id="sentenceFireBtn" type="button" aria-label="发射">🔥</button>
                    </div>
                </div>
            ` : `
                <div class="sentence-bottom-bar">
                    <div class="sentence-aim-controls" id="sentenceAimControls">
                        <button class="sentence-aim-btn" id="sentenceAimLeft"  type="button" aria-label="炮管左转">◀</button>
                        <button class="sentence-aim-btn" id="sentenceAimRight" type="button" aria-label="炮管右转">▶</button>
                    </div>
                    <div class="sentence-fire-controls">
                        <button class="sentence-fire-btn" id="sentenceFireBtn" type="button" aria-label="发射">🔥</button>
                    </div>
                </div>
            `}
        `;
        wrapper.appendChild(game);

        bindGameControls();
        renderHp();
    }

    function generateBgStars() {
        const container = root.querySelector("#sentenceBgStars");
        if (!container) return;
        starElements.forEach(el => el.remove());
        starElements = [];
        const count = 50;
        for (let i = 0; i < count; i++) {
            const s = document.createElement("div");
            s.className = "sentence-star";
            s.style.left = Math.random() * 100 + "%";
            s.style.top = Math.random() * 100 + "%";
            const size = Math.random() * 1.5 + 1;
            s.style.width = size + "px";
            s.style.height = size + "px";
            s.style.animation = `sentenceTwinkle ${2 + Math.random() * 3}s ${Math.random() * 3}s ease-in-out infinite`;
            container.appendChild(s);
            starElements.push(s);
        }
    }

    /* ============================ 输入绑定 ============================ */
    function bindGameControls() {
        unbindGameControls();
        const arena = root.querySelector("#sentenceArena");
        if (!arena) return;

        arena.addEventListener("pointerdown", onPointerDown);
        arena.addEventListener("pointermove", onPointerMove);
        arena.addEventListener("pointerup", onPointerUp);
        arena.addEventListener("pointercancel", onPointerUp);
        arena.addEventListener("pointerleave", onPointerLeave);
        arena.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
        arena.addEventListener("contextmenu", e => e.preventDefault());

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        // 对战模式: 屏幕底部 ◀ ▶ 按钮 (移动坦克)
        if (gameMode === "battle") {
            const left = root.querySelector("#sentenceMoveLeft");
            const right = root.querySelector("#sentenceMoveRight");
            if (left) {
                left.addEventListener("pointerdown", onMoveLeftDown);
                left.addEventListener("pointerup", onMoveLeftUp);
                left.addEventListener("pointercancel", onMoveLeftUp);
                left.addEventListener("pointerleave", onMoveLeftUp);
                left.addEventListener("contextmenu", e => e.preventDefault());
            }
            if (right) {
                right.addEventListener("pointerdown", onMoveRightDown);
                right.addEventListener("pointerup", onMoveRightUp);
                right.addEventListener("pointercancel", onMoveRightUp);
                right.addEventListener("pointerleave", onMoveRightUp);
                right.addEventListener("contextmenu", e => e.preventDefault());
            }
        } else {
            // 闯关模式: 屏幕底部 ◀ ▶ 瞄准按钮 (转炮管)
            const aimL = root.querySelector("#sentenceAimLeft");
            const aimR = root.querySelector("#sentenceAimRight");
            if (aimL) {
                aimL.addEventListener("pointerdown", onAimLeftDown);
                aimL.addEventListener("pointerup", onAimLeftUp);
                aimL.addEventListener("pointercancel", onAimLeftUp);
                aimL.addEventListener("pointerleave", onAimLeftUp);
                aimL.addEventListener("contextmenu", e => e.preventDefault());
            }
            if (aimR) {
                aimR.addEventListener("pointerdown", onAimRightDown);
                aimR.addEventListener("pointerup", onAimRightUp);
                aimR.addEventListener("pointercancel", onAimRightUp);
                aimR.addEventListener("pointerleave", onAimRightUp);
                aimR.addEventListener("contextmenu", e => e.preventDefault());
            }
        }

        // 🔥 发射按钮 (两种模式共用)
        const fire = root.querySelector("#sentenceFireBtn");
        if (fire) {
            fire.addEventListener("pointerdown",   onFirePointerDown);
            fire.addEventListener("pointerup",     onFirePointerUp);
            fire.addEventListener("pointercancel", onFirePointerUp);
            fire.addEventListener("pointerleave",  onFirePointerUp);
            fire.addEventListener("contextmenu",   e => e.preventDefault());
        }

        const backBtn = root.querySelector("#sentenceBack");
        if (backBtn) {
            backBtn.addEventListener("click", () => {
                stopLoop();
                unbindGameControls();
                clearAllEntities();
                renderStartScreen();
            });
        }
    }

    function onMoveLeftDown(e) {
        e.preventDefault(); e.stopPropagation();
        try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        tankMoveLeft = true;
    }
    function onMoveLeftUp(e) {
        if (e) { try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {} }
        tankMoveLeft = false;
    }
    function onMoveRightDown(e) {
        e.preventDefault(); e.stopPropagation();
        try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        tankMoveRight = true;
    }
    function onMoveRightUp(e) {
        if (e) { try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {} }
        tankMoveRight = false;
    }

    function onAimLeftDown(e) {
        e.preventDefault(); e.stopPropagation();
        try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        keyLeft = true;
    }
    function onAimLeftUp(e) {
        if (e) { try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {} }
        keyLeft = false;
    }
    function onAimRightDown(e) {
        e.preventDefault(); e.stopPropagation();
        try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        keyRight = true;
    }
    function onAimRightUp(e) {
        if (e) { try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {} }
        keyRight = false;
    }

    function onFirePointerDown(e) {
        if (!gameActive) return;
        e.preventDefault(); e.stopPropagation();
        try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        firePressed = true;
        tryFire();   // 按下立即发一发, 之后由 tick() 按 FIRE_INTERVAL_MS 连发
    }
    function onFirePointerUp(e) {
        if (e) { try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {} }
        firePressed = false;
    }

    function unbindGameControls() {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        // pointer 事件挂在 arena 上, DOM 重渲染时一并消失
    }

    function onPointerDown(e) {
        if (!gameActive) return;
        if (gameMode === "battle") {
            // 对战模式: 炮管锁定, arena 指针不参与任何输入 (统一用 🔥/移动按钮)
            return;
        }
        // 闯关模式: 在 arena 上按住 + 相对滑动 → 调炮管角度 (不再"指哪打哪")
        dragAimActive = true;
        dragAimPointerId = e.pointerId;
        dragAimLastX = e.clientX;
        try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function onPointerMove(e) {
        if (!gameActive) return;
        if (gameMode === "battle") return;
        if (!dragAimActive || e.pointerId !== dragAimPointerId) return;
        const dx = e.clientX - dragAimLastX;
        if (dx === 0) return;
        dragAimLastX = e.clientX;
        // 灵敏度: 约一屏 (320~400px) 划完整个角度范围 (~170°)
        const AIM_SENS = 0.0085;   // rad/px
        targetAngle = Math.max(
            -ANGLE_LIMIT,
            Math.min(ANGLE_LIMIT, targetAngle + dx * AIM_SENS)
        );
    }
    function onPointerUp(e) {
        if (e && e.pointerId !== undefined && e.pointerId !== dragAimPointerId) return;
        dragAimActive = false;
        dragAimPointerId = -1;
    }
    function onPointerLeave(e) {
        if (e && e.pointerId !== undefined && e.pointerId !== dragAimPointerId) return;
        dragAimActive = false;
        dragAimPointerId = -1;
    }

    function onKeyDown(e) {
        if (!gameActive) return;
        if (gameMode === "battle") {
            // 对战模式: A/D 或 ← → 都是移动坦克 (炮管锁定不需要转向)
            if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
                tankMoveLeft = true; e.preventDefault(); return;
            }
            if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
                tankMoveRight = true; e.preventDefault(); return;
            }
            if (e.key === " " || e.key === "Spacebar") {
                tryFire(); e.preventDefault(); return;
            }
            return;
        }
        // 闯关模式
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
            keyLeft = true; e.preventDefault();
        } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
            keyRight = true; e.preventDefault();
        } else if (e.key === " " || e.key === "Spacebar") {
            tryFire(); e.preventDefault();
        }
    }
    function onKeyUp(e) {
        if (gameMode === "battle") {
            if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") tankMoveLeft = false;
            else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") tankMoveRight = false;
            return;
        }
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keyLeft = false;
        else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keyRight = false;
    }

    /* ============================ 测量 ============================ */
    function measureArena() {
        const arena = root.querySelector("#sentenceArena");
        if (!arena) return;
        const rect = arena.getBoundingClientRect();
        arenaW = rect.width;
        arenaH = rect.height;
    }
    function measureTank() {
        const arena = root.querySelector("#sentenceArena");
        tankEl = root.querySelector("#sentenceTank");
        barrelEl = root.querySelector("#sentenceBarrel");
        if (!arena || !tankEl || !barrelEl) return;

        const arenaRect = arena.getBoundingClientRect();
        const tankRect = tankEl.getBoundingClientRect();
        const barrelRect = barrelEl.getBoundingClientRect();

        // 坦克车身碰撞框 (略小于视觉大小)
        tankBoxW = tankRect.width * 0.78;
        tankBoxH = tankRect.height * 0.7;
        // 炮管旋转支点: 炮管底部中央, 即 barrelRect.bottom 处的中心点
        // (转换到 arena 坐标系)
        tankPivotX = barrelRect.left + barrelRect.width / 2 - arenaRect.left;
        tankPivotY = barrelRect.bottom - arenaRect.top;
        barrelLen = barrelRect.height;
    }

    /* ============================ 游戏开始 ============================ */
    function startGame(mode) {
        gameMode = mode === "battle" ? "battle" : "level";
        // 重置全部状态
        level = 1;
        tankHp = MAX_HP;
        nextFragmentIndex = 0;
        lockedFragments = [];
        seenSentenceIds = new Set();
        ufos = [];
        bullets = [];
        missiles = [];
        keyLeft = false;
        keyRight = false;
        tankMoveLeft = false;
        tankMoveRight = false;
        dragAimActive = false;
        dragAimPointerId = -1;
        firePressed = false;
        invincibleUntil = 0;
        nextBulletAt = 0;
        barrelAngle = 0;
        targetAngle = 0;
        inLevelTransition = false;
        gameActive = true;
        highScore = loadHighScoreFor(gameMode);

        renderGameScreen();
        // 等下一帧再测量 (确保 layout 完成)
        requestAnimationFrame(() => {
            if (!mounted) return;
            measureArena();
            measureTank();
            if (gameMode === "battle") {
                // 对战模式: 坦克起始居中 (用 measureTank 得到的 pivot 作为基准),
                // 之后 tank 移动只更新 tankCenterX 并同步 tankPivotX, 不再 measureTank.
                tankCenterX = tankPivotX;
                tankBodyMeasuredW = tankEl.getBoundingClientRect().width;
                applyTankBattlePos();
            }
            startLevel(level);
            lastTs = performance.now();
            rafId = requestAnimationFrame(tick);
        });
    }

    function applyTankBattlePos() {
        if (!tankEl) return;
        // 用 left + transform 居中, 这样 tankCenterX 即视觉中心
        tankEl.style.left = tankCenterX + "px";
        tankEl.style.transform = "translateX(-50%)";
        tankPivotX = tankCenterX;
    }

    function startLevel(lv) {
        level = lv;
        nextFragmentIndex = 0;
        lockedFragments = [];
        currentSentence = pickSentenceForLevel(lv);
        if (!currentSentence) return;
        seenSentenceIds.add(currentSentence.id);

        clearUfos();
        clearBullets();
        clearMissiles();
        spawnUfosForSentence(currentSentence);

        renderLevelText();
        renderHp();
        renderBuiltStrip();
    }

    function spawnUfosForSentence(sentence) {
        const arena = root.querySelector("#sentenceArena");
        if (!arena || !sentence) return;

        // 随机化 fragments 在飞碟上的分配 (顺序打乱)
        const indexed = sentence.fragments.map((f, i) => ({ fragment: f, index: i }));
        // Fisher-Yates 打乱
        for (let i = indexed.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
        }

        const N = indexed.length;
        const cfg = getShootingConfig(level);
        const compact = N >= 6;   // 6 个以上飞碟换小号样式, 给视觉留出更多空间
        // 数量多 → 启用垂直方向漂移 (和水平漂移同样的线性反弹, 不是正弦振荡).
        // 这样初始位置不必分上下两层, 飞碟会自然散布到整个高度区间.
        const verticalDrift = N >= 6;

        // 布局: X 均匀分布在 88% 可用区. Y 在飞碟可用带内随机.
        // verticalDrift 时把 Y 带拉宽 (6%-58%), 让垂直漂移有足够空间, 也避免初始就显出"两层".
        // 不启用时保持窄带 (6%-42%) — 飞碟基本不动, 不需要额外纵深.
        const usableW = arenaW * 0.88;
        const margin = (arenaW - usableW) / 2;
        const yMin = arenaH * 0.06;
        const yMax = verticalDrift ? arenaH * 0.58 : arenaH * 0.42;

        for (let i = 0; i < N; i++) {
            const ufo = createUfo(indexed[i].fragment, indexed[i].index, compact);
            arena.appendChild(ufo.el);

            // 测量真实尺寸
            const r = ufo.el.getBoundingClientRect();
            ufo.w = r.width;
            ufo.h = r.height;

            ufo.x = margin + (usableW / N) * (i + 0.5);

            // Y 随机, 加 anti-overlap retry: 与左侧已放置飞碟若 X 距离很近且 Y 也很近则重抽
            let yCandidate = yMin + Math.random() * (yMax - yMin);
            for (let retry = 0; retry < 6; retry++) {
                let bad = false;
                for (let k = 0; k < ufos.length; k++) {
                    const other = ufos[k];
                    const dx = Math.abs(ufo.x - other.x);
                    const dy = Math.abs(yCandidate - other.y);
                    // 如果横向相邻 (距离小于宽度 0.85 倍) 且纵向也很近 (UFO 高度 1.1 倍以内) → 视觉重叠
                    if (dx < (ufo.w + other.w) / 2 * 0.85 && dy < (ufo.h + other.h) / 2 * 1.1) {
                        bad = true;
                        break;
                    }
                }
                if (!bad) break;
                yCandidate = yMin + Math.random() * (yMax - yMin);
            }
            ufo.y = yCandidate;

            // 水平漂移: 每个飞碟独立随机速度 + 方向, 即便同一关也不会同步
            const speedMag = cfg.driftMin + Math.random() * (cfg.driftMax - cfg.driftMin);
            ufo.driftSpeed = speedMag;
            ufo.driftDir = Math.random() < 0.5 ? -1 : 1;

            // 垂直漂移: verticalDrift 时启用, 速度比水平慢一些 (60%), 在 [yMin, yMax] 内反弹
            if (verticalDrift) {
                const vySpeed = (cfg.driftMin + Math.random() * (cfg.driftMax - cfg.driftMin)) * 0.6;
                ufo.vyDriftSpeed = vySpeed;
                ufo.vyDriftDir = Math.random() < 0.5 ? -1 : 1;
            } else {
                ufo.vyDriftSpeed = 0;
                ufo.vyDriftDir = 1;
            }
            ufo.yMin = yMin;
            ufo.yMax = yMax;

            // 对战模式: 每个飞碟独立的下次开火时间, 错开 spawn 后第一次发射避免齐射
            if (gameMode === "battle") {
                ufo.nextFireAt = performance.now() + 1500 + Math.random() * 2000;
            } else {
                ufo.nextFireAt = Infinity;
            }

            applyUfoTransform(ufo);
            ufos.push(ufo);
        }
    }

    function createUfo(fragment, index, compact) {
        const el = document.createElement("div");
        el.className = "sentence-ufo" + (compact ? " compact" : "");
        el.innerHTML = `
            <div class="sentence-ufo-dome"></div>
            <div class="sentence-ufo-body"></div>
            <div class="sentence-ufo-text"></div>
            <div class="sentence-ufo-lights">
                <span></span><span></span><span></span><span></span>
            </div>
        `;
        const fragmentEl = el.querySelector(".sentence-ufo-text");
        fragmentEl.textContent = fragment;
        // 长词组自动缩字号
        if (fragment.length >= 5) {
            fragmentEl.style.fontSize = "clamp(9px, 2.2vw, 11px)";
        } else if (fragment.length === 4) {
            fragmentEl.style.fontSize = "clamp(10px, 2.5vw, 12px)";
        }

        return {
            el, fragmentEl, fragment, index,
            x: 0, y: 0, w: 80, h: 50,
            alive: true,
            driftSpeed: 0, driftDir: 1,
            vyDriftSpeed: 0, vyDriftDir: 1,
            yMin: 0, yMax: 0,
            nextFireAt: Infinity,
        };
    }

    function applyUfoTransform(ufo) {
        ufo.el.style.transform = `translate(${ufo.x - ufo.w / 2}px, ${ufo.y - ufo.h / 2}px)`;
    }

    /* ============================ 帧循环 ============================ */
    function tick(ts) {
        if (!mounted || !gameActive) return;
        const dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;

        /* 0. 对战模式: 坦克左右移动 */
        if (gameMode === "battle" && !inLevelTransition) {
            const v = (tankMoveRight ? 1 : 0) - (tankMoveLeft ? 1 : 0);
            if (v !== 0) {
                tankCenterX += v * TANK_MOVE_SPEED * dt;
                const half = tankBodyMeasuredW / 2;
                if (tankCenterX < half + 6) tankCenterX = half + 6;
                if (tankCenterX > arenaW - half - 6) tankCenterX = arenaW - half - 6;
                applyTankBattlePos();
            }
        }

        /* 1. 瞄准更新 */
        updateAim(dt);

        /* 1.5 长按 🔥 按钮: 持续尝试发射 (tryFire 内部按 FIRE_INTERVAL_MS 限频) */
        if (firePressed && !inLevelTransition) {
            tryFire();
        }

        /* 2. 子弹位移 */
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.el.style.transform = `translate(${b.x - b.w / 2}px, ${b.y - b.h / 2}px)`;
            // 出屏销毁
            if (b.y < -30 || b.x < -30 || b.x > arenaW + 30 || b.y > arenaH + 30) {
                if (b.el && b.el.parentNode) b.el.remove();
                bullets.splice(i, 1);
            }
        }

        /* 3. 导弹位移 (保留发射时锁定的 rotate(angle) 视觉) */
        for (let i = missiles.length - 1; i >= 0; i--) {
            const m = missiles[i];
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            m.el.style.transform = `translate(${m.x - m.w / 2}px, ${m.y - m.h / 2}px) rotate(${m.angle}rad)`;
            // 越界 (各方向) → 销毁
            if (m.y > arenaH + 40 || m.y < -40 || m.x < -40 || m.x > arenaW + 40) {
                if (m.el && m.el.parentNode) m.el.remove();
                missiles.splice(i, 1);
            }
        }

        /* 4. 飞碟漂移 (水平 + 垂直双轴线性反弹, 各飞碟速度方向独立) */
        for (const u of ufos) {
            if (!u.alive) continue;

            // 水平
            if (u.driftSpeed > 0) {
                u.x += u.driftDir * u.driftSpeed * dt;
                const halfW = u.w / 2;
                if (u.x < halfW + 4) {
                    u.x = halfW + 4;
                    u.driftDir = 1;
                } else if (u.x > arenaW - halfW - 4) {
                    u.x = arenaW - halfW - 4;
                    u.driftDir = -1;
                }
            }
            // 垂直 (verticalDrift 启用时 vyDriftSpeed > 0)
            if (u.vyDriftSpeed > 0) {
                u.y += u.vyDriftDir * u.vyDriftSpeed * dt;
                const halfH = u.h / 2;
                if (u.y < u.yMin + halfH) {
                    u.y = u.yMin + halfH;
                    u.vyDriftDir = 1;
                } else if (u.y > u.yMax - halfH) {
                    u.y = u.yMax - halfH;
                    u.vyDriftDir = -1;
                }
            }
            applyUfoTransform(u);
        }

        /* 5. 碰撞 */
        if (!inLevelTransition) {
            checkBulletUfoCollisions(ts);
            checkMissileTankCollisions(ts);
        }

        /* 6. 对战模式: 飞碟到点自动开火 */
        if (gameMode === "battle" && !inLevelTransition) {
            const now = performance.now();
            for (const u of ufos) {
                if (!u.alive) continue;
                if (now >= u.nextFireAt) {
                    spawnMissile(u);
                    u.nextFireAt = now + autoFireInterval(level);
                }
            }
        }

        rafId = requestAnimationFrame(tick);
    }

    function updateAim(dt) {
        if (gameMode === "battle") {
            // 对战模式: 炮管锁定朝正上, 不接受瞄准输入
            if (Math.abs(barrelAngle) > 0.001) {
                barrelAngle = 0;
                targetAngle = 0;
                if (barrelEl) barrelEl.style.transform = `rotate(0rad)`;
            }
            return;
        }

        // 键盘 / ◀▶ 按钮 (两者都通过 keyLeft/keyRight 驱动)
        let newTarget = targetAngle;
        if (keyLeft)  newTarget -= KEY_TURN_RATE * dt;
        if (keyRight) newTarget += KEY_TURN_RATE * dt;

        // 钳到上半弧
        newTarget = Math.max(-ANGLE_LIMIT, Math.min(ANGLE_LIMIT, newTarget));
        targetAngle = newTarget;

        // 平滑跟随
        barrelAngle += (targetAngle - barrelAngle) * BARREL_FOLLOW;
        if (barrelEl) {
            barrelEl.style.transform = `rotate(${barrelAngle}rad)`;
        }
    }

    /* ============================ 发射 ============================ */
    function tryFire() {
        if (!gameActive || inLevelTransition) return;
        const now = performance.now();
        if (now < nextBulletAt) return;
        nextBulletAt = now + FIRE_INTERVAL_MS;

        // 不再做"指哪打哪"的 snap: 玩家自行用 ◀▶ / 键盘 / 滑屏 调好炮管再发射.
        spawnBullet();
        playFireSound();
    }

    function spawnBullet() {
        const arena = root.querySelector("#sentenceArena");
        if (!arena) return;
        // 子弹生成点: 炮管末端 (旋转后的世界坐标)
        const sx = tankPivotX + Math.sin(barrelAngle) * barrelLen;
        const sy = tankPivotY - Math.cos(barrelAngle) * barrelLen;
        const vx = Math.sin(barrelAngle) * BULLET_SPEED;
        const vy = -Math.cos(barrelAngle) * BULLET_SPEED;

        const el = document.createElement("div");
        el.className = "sentence-bullet";
        const w = 8, h = 16;
        el.style.transform = `translate(${sx - w / 2}px, ${sy - h / 2}px)`;
        arena.appendChild(el);
        bullets.push({ el, x: sx, y: sy, vx, vy, w, h });
    }

    function spawnMissile(ufo) {
        const arena = root.querySelector("#sentenceArena");
        if (!arena || !ufo) return;
        const w = 10, h = 22;
        const sx = ufo.x;
        const sy = ufo.y + ufo.h / 2 + 4;

        // 瞄准坦克车身中心 (发射时锁定, 之后直线飞行不再变向)
        const tx = tankPivotX;
        const ty = tankPivotY + tankBoxH / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const speed = getShootingConfig(level).missileSpeed;
        const vx = dx / dist * speed;
        const vy = dy / dist * speed;
        // 视觉旋转: 0 = 朝下 (导弹精灵的自然朝向), 正 = 顺时针 (朝右下)
        const angle = Math.atan2(dx, dy);

        const el = document.createElement("div");
        el.className = "sentence-missile";
        el.style.transform = `translate(${sx - w / 2}px, ${sy - h / 2}px) rotate(${angle}rad)`;
        arena.appendChild(el);
        missiles.push({ el, x: sx, y: sy, vx, vy, w, h, angle });
        playMissileLaunchSound();
    }

    /* ============================ 碰撞 ============================ */
    function boxOverlap(a, b) {
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    function checkBulletUfoCollisions(ts) {
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            const bBox = {
                left: b.x - b.w / 2, right: b.x + b.w / 2,
                top: b.y - b.h / 2, bottom: b.y + b.h / 2,
            };
            for (const u of ufos) {
                if (!u.alive) continue;
                const uBox = {
                    left: u.x - u.w / 2, right: u.x + u.w / 2,
                    top: u.y - u.h / 2, bottom: u.y + u.h / 2,
                };
                if (boxOverlap(bBox, uBox)) {
                    // 子弹销毁
                    if (b.el && b.el.parentNode) b.el.remove();
                    bullets.splice(bi, 1);

                    if (u.index === nextFragmentIndex) {
                        onCorrectHit(u, ts);
                    } else {
                        onWrongHit(u, ts);
                    }
                    break; // 一发子弹只命中一个
                }
            }
        }
    }

    function checkMissileTankCollisions(ts) {
        if (ts < invincibleUntil) return;
        // 坦克碰撞框
        const tankBox = {
            left: tankPivotX - tankBoxW / 2,
            right: tankPivotX + tankBoxW / 2,
            top: tankPivotY,             // 炮管底部 ~= 车身顶部
            bottom: tankPivotY + tankBoxH,
        };
        for (let mi = missiles.length - 1; mi >= 0; mi--) {
            const m = missiles[mi];
            const mBox = {
                left: m.x - m.w / 2, right: m.x + m.w / 2,
                top: m.y - m.h / 2, bottom: m.y + m.h / 2,
            };
            if (boxOverlap(tankBox, mBox)) {
                if (m.el && m.el.parentNode) m.el.remove();
                missiles.splice(mi, 1);
                onTankDamage();
                break; // 一帧最多扣一次
            }
        }
    }

    /* ============================ 命中处理 ============================ */
    function onCorrectHit(ufo, ts) {
        ufo.alive = false;
        nextFragmentIndex++;
        lockedFragments.push(ufo.fragment);

        playHitSound();
        spawnExplosion(ufo.x, ufo.y);
        showFloatingText(ufo.x, ufo.y - 18, `✓ ${ufo.fragment}`, "#69f0ae");

        // HP 回 1 (上限 5)
        tankHp = Math.min(MAX_HP, tankHp + 1);
        renderHp();

        // 朗读该词组 (短)
        if (window.speakHanzi) {
            try { window.speakHanzi(ufo.fragment); } catch (_) {}
        }

        // 飞碟坠落动画
        crashUfo(ufo);

        renderBuiltStrip();

        // 是否完成全句?
        if (nextFragmentIndex >= currentSentence.fragments.length) {
            onSentenceComplete();
        }
    }

    function onWrongHit(ufo, ts) {
        playWrongSound();
        ufo.el.classList.remove("flash-wrong");
        // eslint-disable-next-line no-unused-expressions
        void ufo.el.offsetWidth;
        ufo.el.classList.add("flash-wrong");
        showFloatingText(ufo.x, ufo.y - 18, "顺序错!", "#ef5350");

        // 被打中的飞碟反击一发导弹
        spawnMissile(ufo);
    }

    function onTankDamage() {
        tankHp--;
        invincibleUntil = performance.now() + INVINCIBLE_MS;
        playDamageSound();
        flashTank();
        shakeArena();
        showFloatingText(tankPivotX, tankPivotY - 6, "-1 ❤", "#ef5350");
        renderHp();

        if (tankHp <= 0) {
            endGame();
        }
    }

    function crashUfo(ufo) {
        // 用 CSS 变量记录"坠落起点"(当前 transform 的 translate 部分)
        const baseTx = ufo.x - ufo.w / 2;
        const baseTy = ufo.y - ufo.h / 2;
        ufo.el.style.setProperty("--crash-base", `translate(${baseTx}px, ${baseTy}px)`);
        ufo.el.classList.add("crashing");
        // 0.5s 后从 DOM 移除
        setTimeout(() => {
            if (ufo.el && ufo.el.parentNode) ufo.el.remove();
        }, 520);
    }

    /* ============================ 视觉特效 ============================ */
    function spawnExplosion(x, y) {
        const arena = root.querySelector("#sentenceArena");
        if (!arena) return;
        const colors = ["#ffd740", "#ff9800", "#69f0ae", "#40c4ff", "#ff80ab"];
        const count = 14;
        for (let i = 0; i < count; i++) {
            const p = document.createElement("div");
            p.className = "sentence-particle";
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const dist = 35 + Math.random() * 35;
            p.style.left = (x - 3.5) + "px";
            p.style.top = (y - 3.5) + "px";
            p.style.background = colors[Math.floor(Math.random() * colors.length)];
            p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
            p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
            arena.appendChild(p);
            setTimeout(() => p.remove(), 520);
        }
    }

    function showFloatingText(x, y, text, color) {
        const arena = root.querySelector("#sentenceArena");
        if (!arena) return;
        const el = document.createElement("div");
        el.className = "sentence-float-text";
        el.textContent = text;
        el.style.left = x + "px";
        el.style.top = y + "px";
        el.style.color = color;
        arena.appendChild(el);
        setTimeout(() => el.remove(), 920);
    }

    function showLevelUp(label) {
        const arena = root.querySelector("#sentenceArena");
        if (!arena) return;
        const el = document.createElement("div");
        el.className = "sentence-level-up";
        el.textContent = label;
        arena.appendChild(el);
        setTimeout(() => el.remove(), 1400);
    }

    function flashTank() {
        if (!tankEl) return;
        tankEl.classList.remove("flash");
        // eslint-disable-next-line no-unused-expressions
        void tankEl.offsetWidth;
        tankEl.classList.add("flash");
        setTimeout(() => tankEl && tankEl.classList.remove("flash"), 600);
    }

    function shakeArena() {
        const arena = root.querySelector("#sentenceArena");
        if (!arena) return;
        arena.classList.remove("shake");
        // eslint-disable-next-line no-unused-expressions
        void arena.offsetWidth;
        arena.classList.add("shake");
        setTimeout(() => arena && arena.classList.remove("shake"), 400);
    }

    /* ============================ HUD ============================ */
    function renderLevelText() {
        const el = root.querySelector("#sentenceLevelText");
        if (el) el.textContent = `L${level}`;
    }

    function renderHp() {
        const el = root.querySelector("#sentenceHp");
        if (!el) return;
        el.innerHTML = "";
        for (let i = 0; i < MAX_HP; i++) {
            const heart = document.createElement("span");
            const full = i < tankHp;
            heart.className = "sentence-heart" + (full ? " full" : " empty");
            heart.textContent = full ? "❤" : "🖤";
            el.appendChild(heart);
        }
    }

    function renderBuiltStrip() {
        const strip = root.querySelector("#sentenceBuilt");
        if (!strip || !currentSentence) return;
        strip.innerHTML = "";
        currentSentence.fragments.forEach((f, idx) => {
            const slot = document.createElement("span");
            const isLocked = idx < nextFragmentIndex;
            slot.className = "sentence-slot" + (isLocked ? " locked" : "");
            slot.textContent = isLocked ? lockedFragments[idx] : "▢";
            strip.appendChild(slot);
        });
    }

    /* ============================ 过关 / 游戏结束 ============================ */
    function onSentenceComplete() {
        inLevelTransition = true;
        playLevelUpSound();
        // 朗读完整句子
        if (window.speakHanzi) {
            try { window.speakHanzi(currentSentence.text); } catch (_) {}
        }
        showLevelUp(`✨ ${currentSentence.text}`);

        // 1.4s 后进入下一关
        setTimeout(() => {
            if (!mounted || !gameActive) return;
            level++;
            inLevelTransition = false;
            startLevel(level);
        }, 1500);
    }

    function endGame() {
        gameActive = false;
        stopLoop();
        playGameOverSound();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        clearAllEntities();

        const reachedLevel = level;
        const isNewRecord = reachedLevel > highScore;
        if (isNewRecord) {
            highScore = reachedLevel;
            saveHighScoreFor(gameMode, highScore);
        }

        const wrapper = root.querySelector(".sentence-wrapper");
        if (!wrapper) return;

        const titleEmoji = gameMode === "battle" ? "💥" : "💥";
        const modeLabel = gameMode === "battle" ? "对战" : "闯关";
        const overlay = document.createElement("div");
        overlay.className = "sentence-gameover";
        overlay.innerHTML = `
            <div class="sentence-gameover-card">
                <h2>${titleEmoji} 坦克被击毁!</h2>
                <div class="sentence-result-row">
                    <span class="sentence-result-label">${modeLabel} · 到达关卡</span>
                    <span class="sentence-result-value ${isNewRecord ? "new-record" : ""}">L${reachedLevel}${isNewRecord ? '<span class="sentence-record-badge">新纪录</span>' : ""}</span>
                </div>
                <div class="sentence-result-row">
                    <span class="sentence-result-label">${modeLabel} · 历史最高</span>
                    <span class="sentence-result-value">L${highScore}</span>
                </div>
                <div class="sentence-result-row">
                    <span class="sentence-result-label">这关词组</span>
                    <span class="sentence-result-value">${currentSentence ? currentSentence.fragments.length + " 个" : "-"}</span>
                </div>
                <div class="sentence-btn-group">
                    <button class="sentence-btn sentence-btn-primary" id="sentenceRestart">再来一局</button>
                    <button class="sentence-btn sentence-btn-back" id="sentenceGoHome">返回主界面</button>
                </div>
            </div>
        `;
        wrapper.appendChild(overlay);

        overlay.querySelector("#sentenceRestart").addEventListener("click", () => {
            overlay.remove();
            startGame(gameMode);
        });
        overlay.querySelector("#sentenceGoHome").addEventListener("click", onBack);
    }

    /* ============================ 清理 ============================ */
    function clearUfos() {
        ufos.forEach(u => { if (u.el && u.el.parentNode) u.el.remove(); });
        ufos = [];
    }
    function clearBullets() {
        bullets.forEach(b => { if (b.el && b.el.parentNode) b.el.remove(); });
        bullets = [];
    }
    function clearMissiles() {
        missiles.forEach(m => { if (m.el && m.el.parentNode) m.el.remove(); });
        missiles = [];
    }
    function clearAllEntities() {
        clearUfos();
        clearBullets();
        clearMissiles();
    }

    function stopLoop() {
        gameActive = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    /* ============================ mount / unmount ============================ */
    function mount() {
        mounted = true;
        renderShell();
        renderStartScreen();
    }

    function unmount() {
        mounted = false;
        stopLoop();
        unbindGameControls();
        clearAllEntities();
        starElements.forEach(el => el.remove());
        starElements = [];
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
        if (window.speechSynthesis) {
            try { window.speechSynthesis.cancel(); } catch (_) {}
        }
    }

    return { mount, unmount };
}

window.createSentenceGame = createSentenceGame;

function createSokobanGame({ root, onBack }) {
    /* ===== 状态 ===== */
    let mounted = false;
    let gameActive = false;
    let isWinning = false;

    let gameMode = "pixel";     // "pixel" = 像素字模式, "match" = 配对模式
    let baseDifficulty = 1;     // 0 EASY / 1 NORMAL / 2 HARD
    let level = 1;
    let lives = 3;
    let moves = 0;
    let totalMoves = 0;
    let highest = 0;

    let player = null;          // { y, x, face: 'up'|'down'|'left'|'right' }
    let playerStart = null;
    let playerEl = null;

    let boxes = [];             // [{ y, x, el, onTarget, pairId?, label?, dir? }]
    let enemies = [];           // [{ y, x, el, behavior, dir }]

    let grid = null;            // 2D char array '.' | '#' | 'T'
    let mask = null;
    let currentHanzi = "";

    // 配对模式专用
    let matchPairs = [];        // [{hanzi, pinyin, dir:"hp"|"ph"}]  hp=箱汉字→目标拼音
    let matchTargets = [];      // [{y, x, label, pairId, type:"hanzi"|"pinyin"}]

    let history = [];           // undo 栈
    let usedHanzi = new Set();

    let enemyTimerId = null;
    let lastKeyAt = 0;
    let swipeStart = null;

    let audioCtx = null;

    /* ===== 常量 ===== */
    const COLS = 13;
    const ROWS = 13;
    const MASK_SIZE = 9;        // 9×9 像素汉字（中文像素字体的可识别下限）
    const MASK_OFFSET_Y = 2;    // mask 起点行（居中：2..10）
    const MASK_OFFSET_X = 2;
    const PLAYER_START_Y = 11;
    const PLAYER_START_X = 6;
    const HISTORY_LIMIT = 30;
    const SWIPE_THRESHOLD = 30;
    const KEY_MIN_INTERVAL = 80;   // ms
    const STORAGE_KEY = "sokoban_highest_level";

    const DIFF_NAMES = ["简单", "普通", "困难"];

    // 配对模式常量
    const MATCH_COLS = 13;
    const MATCH_ROWS = 13;
    const MATCH_PAIR_BASE = 3;      // 起步 3 对
    const MATCH_PAIR_STEP = 2;      // 每 2 关 +1 对
    const MATCH_PAIR_MAX = 7;       // 上限 7 对
    const MATCH_PLAYER_Y = 11;
    const MATCH_PLAYER_X = 6;

    // 手工绘制的 9×9 像素汉字字库
    // 设计原则：
    //   1) 横/竖严格水平/垂直，左右对称（中心轴 col 4）
    //   2) 撇/捺为严格 45° 对角线（每行偏移 1 像素，没有重复行）
    //   3) 该分开的笔画用至少 1 个空白行/列隔开（"二"两横之间留空）
    //   4) 列号 0..8，中心列为 4
    const HANZI_BITMAPS = {
        // —— 横竖结构 ——
        "一": [
            ".........",
            ".........",
            ".........",
            ".........",
            "#########",
            ".........",
            ".........",
            ".........",
            ".........",
        ],
        "二": [
            ".........",
            ".........",
            "..#####..",
            ".........",
            ".........",
            ".........",
            ".........",
            "#########",
            ".........",
        ],
        "三": [
            ".........",
            "..#####..",
            ".........",
            ".........",
            "..#####..",
            ".........",
            ".........",
            "#########",
            ".........",
        ],
        "十": [
            ".........",
            "....#....",
            "....#....",
            "....#....",
            "#########",
            "....#....",
            "....#....",
            "....#....",
            "....#....",
        ],
        "丁": [
            ".........",
            "#########",
            "....#....",
            "....#....",
            "....#....",
            "....#....",
            "..#.#....",
            "...##....",
            ".........",
        ],
        "上": [
            ".........",
            "....#....",
            "....#....",
            "....#....",
            "....####.",
            "....#....",
            "....#....",
            "....#....",
            "#########",
        ],
        "下": [
            ".........",
            "#########",
            "....#....",
            "....#....",
            "....##...",
            "....#.#..",
            "....#....",
            "....#....",
            ".........",
        ],
        "土": [
            ".........",
            "....#....",
            "....#....",
            "..#####..",
            "....#....",
            "....#....",
            "....#....",
            "#########",
            ".........",
        ],
        "工": [
            ".........",
            ".........",
            ".#######.",
            "....#....",
            "....#....",
            "....#....",
            "....#....",
            "#########",
            ".........",
        ],
        "干": [
            ".........",
            "..#####..",
            "....#....",
            "#########",
            "....#....",
            "....#....",
            "....#....",
            "....#....",
            "....#....",
        ],
        "王": [
            ".........",
            ".#######.",
            "....#....",
            "....#....",
            ".#######.",
            "....#....",
            "....#....",
            "#########",
            ".........",
        ],
        "主": [
            "....#....",
            ".#######.",
            "....#....",
            "....#....",
            ".#######.",
            "....#....",
            "....#....",
            "#########",
            ".........",
        ],
        "正": [
            ".........",
            "#########",
            "....#....",
            "....#....",
            ".#..####.",
            ".#..#....",
            ".#..#....",
            "#########",
            ".........",
        ],

        // —— 框结构 ——
        "口": [
            ".........",
            ".........",
            "#########",
            "#.......#",
            "#.......#",
            "#.......#",
            "#.......#",
            "#########",
            ".........",
        ],
        "日": [
            ".........",
            "#########",
            "#.......#",
            "#.......#",
            "#########",
            "#.......#",
            "#.......#",
            "#########",
            ".........",
        ],
        "目": [
            ".........",
            ".#######.",
            ".#.....#.",
            ".#######.",
            ".#.....#.",
            ".#######.",
            ".#.....#.",
            ".#######.",
            ".........",
        ],
        "田": [
            ".........",
            "#########",
            "#...#...#",
            "#...#...#",
            "#########",
            "#...#...#",
            "#...#...#",
            "#########",
            ".........",
        ],
        "回": [
            "#########",
            "#.......#",
            "#.#####.#",
            "#.#...#.#",
            "#.#...#.#",
            "#.#...#.#",
            "#.#####.#",
            "#.......#",
            "#########",
        ],
        "中": [
            "....#....",
            "....#....",
            ".#######.",
            ".#..#..#.",
            ".#..#..#.",
            ".#..#..#.",
            ".#######.",
            "....#....",
            "....#....",
        ],
        "山": [
            ".........",
            "....#....",
            "....#....",
            "....#....",
            "#...#...#",
            "#...#...#",
            "#...#...#",
            "#...#...#",
            "#########",
        ],
        "由": [
            "....#....",
            "....#....",
            "#########",
            "#...#...#",
            "#########",
            "#...#...#",
            "#...#...#",
            "#########",
            ".........",
        ],
        "甲": [
            ".........",
            "#########",
            "#...#...#",
            "#########",
            "#...#...#",
            "#########",
            "....#....",
            "....#....",
            "....#....",
        ],
        "申": [
            "....#....",
            "....#....",
            "#########",
            "#...#...#",
            "#########",
            "....#....",
            "#########",
            "....#....",
            "....#....",
        ],
        "古": [
            ".........",
            "....#....",
            "#########",
            "....#....",
            ".#######.",
            ".#.....#.",
            ".#.....#.",
            ".#.....#.",
            ".#######.",
        ],
        "白": [
            ".........",
            "....#....",
            ".#######.",
            ".#.....#.",
            ".#######.",
            ".#.....#.",
            ".#.....#.",
            ".#######.",
            ".........",
        ],
        "门": [
            "#........",
            ".#.######",
            "........#",
            "#.......#",
            "#.......#",
            "#.......#",
            "#.....#.#",
            "#......##",
            "#.......#",
        ],
        "月": [
            ".........",
            ".#######.",
            ".#.....#.",
            ".#######.",
            ".#.....#.",
            ".#######.",
            ".#.....#.",
            ".#...#.#.",
            ".#....##.",
        ],
        "用": [
            ".........",
            "#########",
            "#...#...#",
            "#########",
            "#...#...#",
            "#########",
            "#...#...#",
            "#...#...#",
            ".........",
        ],
        "车": [
            "......#..",
            "#########",
            "....#....",
            "...#.....",
            "..#.#....",
            ".#######.",
            "....#....",
            "#########",
            "....#....",
        ],

        // —— 撇捺类（严格 45°）——
        "人": [
            ".........",
            "....#....",
            "....#....",
            "...#.#...",
            "..#...#..",
            ".#.....#.",
            "#.......#",
            ".........",
            ".........",
        ],
        "八": [
            ".........",
            ".........",
            "....#....",
            ".....#...",
            "..#...#..",
            ".#.....#.",
            "#.......#",
            ".........",
            ".........",
        ],
        "大": [
            ".........",
            ".........",
            "....#....",
            "#########",
            "....#....",
            "...#.#...",
            "..#...#..",
            ".#.....#.",
            "#.......#",
        ],
        "天": [
            ".#######.",
            "....#....",
            "#########",
            "....#....",
            "....#....",
            "...#.#...",
            "..#...#..",
            ".#.....#.",
            "#.......#",
        ],
        "夫": [
            "....#....",
            "....#....",
            ".#######.",
            "....#....",
            "#########",
            "...#.#...",
            "..#...#..",
            ".#.....#.",
            "#.......#",
        ],
        "太": [
            ".........",
            "....#....",
            "....#....",
            "#########",
            "....#....",
            "...#.#...",
            "..##..#..",
            ".#..#..#.",
            "#.......#",
        ],
        "木": [
            ".........",
            "....#....",
            "....#....",
            "#########",
            "....#....",
            "...###...",
            "..#.#.#..",
            ".#..#..#.",
            "#...#...#",
        ],
        "本": [
            "....#....",
            "....#....",
            "#########",
            "...###...",
            "..#.#.#..",
            ".#..#..#.",
            "#..###..#",
            "....#....",
            "....#....",
        ],
        "禾": [
            "......#..",
            "...###...",
            "....#....",
            "#########",
            "....#....",
            "...###...",
            "..#.#.#..",
            ".#..#..#.",
            "#...#...#",
        ],
        "米": [
            "....#....",
            ".#..#..#.",
            "..#.#.#..",
            "...###...",
            "#########",
            "...###...",
            "..#.#.#..",
            ".#..#..#.",
            "#...#...#",
        ],
        "火": [
            "....#....",
            ".#..#..#.",
            "..#.#.#..",
            "....#....",
            "....#....",
            "...#.#...",
            "..#...#..",
            ".#.....#.",
            "#.......#",
        ],

        // —— 弯钩类 ——
        "几": [
            ".........",
            ".........",
            ".#######.",
            ".#.....#.",
            ".#.....#.",
            ".#.....#.",
            ".#.....#.",
            ".#.....#.",
            "#.......#",
        ],
        "力": [
            "...#.....",
            "...#.....",
            "########.",
            "...#...#.",
            "...#...#.",
            "...#...#.",
            "..#..#.#.",
            ".#....##.",
            ".........",
        ],
        "刀": [
            ".........",
            ".........",
            "########.",
            "...#...#.",
            "...#...#.",
            "...#...#.",
            "..#..#.#.",
            ".#....##.",
            ".........",
        ],
        "了": [
            ".........",
            ".#######.",
            "......#..",
            ".....#...",
            "....#....",
            "....#....",
            "....#....",
            "..#.#....",
            "...##....",
        ],
        "子": [
            ".........",
            ".#######.",
            "......#..",
            ".....#...",
            "#########",
            "....#....",
            "....#....",
            "..#.#....",
            "...##....",
        ],
        "女": [
            ".........",
            "....#....",
            "#########",
            "...#..#..",
            "..#..#...",
            ".##.#....",
            "...#.....",
            "..#.#....",
            ".#...#...",
        ],

        // —— 其他 ——
        "石": [
            ".........",
            "#########",
            "...#.....",
            "..#......",
            ".########",
            "#.#.....#",
            "..#.....#",
            "..#######",
            ".........",
        ],
        "可": [
            ".........",
            "#########",
            ".......#.",
            ".#####.#.",
            ".#...#.#.",
            ".#####.#.",
            ".......#.",
            ".....#.#.",
            "......##.",
        ],
        "半": [
            "....#....",
            "..#.#.#..",
            "...###...",
            ".#######.",
            "....#....",
            "#########",
            "....#....",
            "....#....",
            "....#....",
        ],
        "生": [
            ".........",
            ".#..#....",
            ".#######.",
            "#...#....",
            "....#....",
            ".#######.",
            "....#....",
            "....#....",
            "#########",
        ],
        "小": [
            "....#....",
            "....#....",
            "....#....",
            "..#.#.#..",
            ".#..#..#.",
            "#...#...#",
            "....#....",
            "..#.#....",
            "...##....",
        ],
    };

    const SOKOBAN_HANZI_POOL = Object.keys(HANZI_BITMAPS);

    /* ===== 音效 ===== */

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
            gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* ignore */ }
    }

    function playPushSound()  { playTone(220, 0.05, "square", 0.08); }
    function playLightSound() {
        playTone(880, 0.06, "square", 0.1);
        setTimeout(() => playTone(1320, 0.08, "square", 0.08), 50);
    }
    function playWinSound() {
        playTone(523, 0.1, "square", 0.1);
        setTimeout(() => playTone(659, 0.1, "square", 0.1), 100);
        setTimeout(() => playTone(784, 0.15, "square", 0.1), 200);
        setTimeout(() => playTone(1047, 0.2, "square", 0.1), 350);
    }
    function playHurtSound() {
        playTone(160, 0.18, "sawtooth", 0.12);
        setTimeout(() => playTone(110, 0.25, "sawtooth", 0.1), 80);
    }
    function playGameOverSound() {
        playTone(440, 0.2, "sawtooth", 0.1);
        setTimeout(() => playTone(330, 0.2, "sawtooth", 0.1), 150);
        setTimeout(() => playTone(220, 0.4, "sawtooth", 0.08), 300);
    }
    function playBumpSound() { playTone(120, 0.04, "square", 0.06); }

    /* ===== 工具：汉字 → 9×9 像素字掩码（手工字库查表） ===== */

    const maskCache = new Map();
    function hanziToMask(hanzi) {
        if (maskCache.has(hanzi)) return maskCache.get(hanzi);
        const rows = HANZI_BITMAPS[hanzi];
        const m = [];
        for (let r = 0; r < MASK_SIZE; r++) {
            const row = [];
            const src = rows[r] || "";
            for (let c = 0; c < MASK_SIZE; c++) {
                row.push(src.charAt(c) === "#");
            }
            m.push(row);
        }
        maskCache.set(hanzi, m);
        return m;
    }

    /* ===== 选字 ===== */

    function pickNextHanzi() {
        let pool = SOKOBAN_HANZI_POOL.slice();

        // 去重（避免重复出现）
        const fresh = pool.filter(h => !usedHanzi.has(h));
        const candidates = fresh.length > 0 ? fresh : (usedHanzi.clear(), pool);
        const hanzi = candidates[Math.floor(Math.random() * candidates.length)];
        usedHanzi.add(hanzi);
        return hanzi;
    }

    /* ===== 关卡生成 ===== */

    function inBounds(y, x) {
        const rows = grid ? grid.length : ROWS;
        const cols = grid && grid[0] ? grid[0].length : COLS;
        return y >= 0 && y < rows && x >= 0 && x < cols;
    }

    function createEmptyGrid() {
        const g = [];
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            for (let c = 0; c < COLS; c++) row.push(".");
            g.push(row);
        }
        return g;
    }

    function addBorderWalls(g) {
        for (let c = 0; c < COLS; c++) {
            g[0][c] = "#";
            g[ROWS - 1][c] = "#";
        }
        for (let r = 0; r < ROWS; r++) {
            g[r][0] = "#";
            g[r][COLS - 1] = "#";
        }
    }

    function placeMaskAsTargets(g, m) {
        const targets = [];
        for (let r = 0; r < MASK_SIZE; r++) {
            for (let c = 0; c < MASK_SIZE; c++) {
                if (m[r][c]) {
                    const yy = MASK_OFFSET_Y + r;
                    const xx = MASK_OFFSET_X + c;
                    g[yy][xx] = "T";
                    targets.push({ y: yy, x: xx });
                }
            }
        }
        return targets;
    }

    function isTargetCell(y, x) {
        return inBounds(y, x) && grid[y][x] === "T";
    }

    function isWallCell(y, x) {
        return inBounds(y, x) && grid[y][x] === "#";
    }

    function boxAt(y, x) {
        return boxes.find(b => b.y === y && b.x === x);
    }

    function enemyAt(y, x) {
        return enemies.find(e => e.y === y && e.x === x);
    }

    function placeBoxes(g, count, playerStart, targets) {
        const placed = [];
        const banned = new Set();
        // 不能把箱子放在目标格上（关卡看起来是"已完成"），不能放在玩家起点
        targets.forEach(t => banned.add(t.y + "," + t.x));
        banned.add(playerStart.y + "," + playerStart.x);

        // 收集候选：正交 4 邻居全部是非墙、非边界（即贴边和贴墙的位置都被排除）
        // 这样玩家从任意方向都能进入箱子的对面，不会出现"贴边推不动"的卡死局面
        const gRows = g.length;
        const gCols = g[0] ? g[0].length : 0;
        const candidates = [];
        for (let r = 2; r < gRows - 2; r++) {
            for (let c = 2; c < gCols - 2; c++) {
                if (g[r][c] !== "." && g[r][c] !== "T") continue;
                if (g[r][c] === "T") continue;
                if (banned.has(r + "," + c)) continue;
                // 四个正交邻居必须都不是墙
                const allSidesOpen = [[-1,0],[1,0],[0,-1],[0,1]].every(([dy, dx]) => {
                    const ny = r + dy, nx = c + dx;
                    return inBounds(ny, nx) && g[ny][nx] !== "#";
                });
                if (!allSidesOpen) continue;
                candidates.push({ y: r, x: c });
            }
        }

        // 偏好：靠近边角、远离目标；用 shuffle 取前 count 个
        shuffle(candidates);
        // 已放箱子的位置集合：用于保证任意两个箱子之间至少隔 1 格
        // （否则一旦相邻又贴墙/角落，箱子之间会互相挡死，玩家推不动）
        const occupied = new Set();
        for (const pos of candidates) {
            if (placed.length >= count) break;
            // 4 个正交邻居中不能已经有别的箱子
            const tooClose = [[-1,0],[1,0],[0,-1],[0,1]].some(([dy, dx]) =>
                occupied.has((pos.y + dy) + "," + (pos.x + dx))
            );
            if (tooClose) continue;
            placed.push({ y: pos.y, x: pos.x, onTarget: false });
            occupied.add(pos.y + "," + pos.x);
            banned.add(pos.y + "," + pos.x);
        }
        return placed;
    }

    function addInteriorWalls(g, count, targets, playerStart, boxes) {
        // 候选：非边、非目标、非箱子、非玩家、与目标至少留一条进入方向
        const banned = new Set();
        targets.forEach(t => banned.add(t.y + "," + t.x));
        boxes.forEach(b => banned.add(b.y + "," + b.x));
        // 关键：箱子四个正交邻居也禁止放墙（避免推不动）
        boxes.forEach(b => {
            [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dy, dx]) => {
                banned.add((b.y + dy) + "," + (b.x + dx));
            });
        });
        banned.add(playerStart.y + "," + playerStart.x);
        // 玩家起点周围 4 邻也保留为空，避免被墙堵死
        [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dy, dx]) => {
            banned.add((playerStart.y + dy) + "," + (playerStart.x + dx));
        });

        const gRows = g.length;
        const gCols = g[0] ? g[0].length : 0;
        const candidates = [];
        for (let r = 1; r < gRows - 1; r++) {
            for (let c = 1; c < gCols - 1; c++) {
                if (g[r][c] !== ".") continue;
                if (banned.has(r + "," + c)) continue;
                candidates.push({ y: r, x: c });
            }
        }
        shuffle(candidates);

        let placed = 0;
        for (const pos of candidates) {
            if (placed >= count) break;
            // 模拟放墙：检查每个目标周围是否仍至少有一个非墙邻居（粗略保证可达）
            g[pos.y][pos.x] = "#";
            const ok = targets.every(t => {
                return [[-1,0],[1,0],[0,-1],[0,1]].some(([dy, dx]) => {
                    const ny = t.y + dy, nx = t.x + dx;
                    return inBounds(ny, nx) && g[ny][nx] !== "#";
                });
            });
            if (!ok) {
                g[pos.y][pos.x] = ".";
                continue;
            }
            placed++;
        }
    }

    function spawnEnemies(g, count, speed, behaviors, playerStart, boxes) {
        const banned = new Set();
        boxes.forEach(b => banned.add(b.y + "," + b.x));
        // 不在玩家起点的 3×3 范围内出生
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            banned.add((playerStart.y + dy) + "," + (playerStart.x + dx));
        }
        // 不在目标格上出生
        const gRows = g.length;
        const gCols = g[0] ? g[0].length : 0;
        for (let r = 0; r < gRows; r++) for (let c = 0; c < gCols; c++) {
            if (g[r][c] === "T" || g[r][c] === "#") banned.add(r + "," + c);
        }

        const candidates = [];
        for (let r = 1; r < gRows - 1; r++) {
            for (let c = 1; c < gCols - 1; c++) {
                if (g[r][c] !== ".") continue;
                if (banned.has(r + "," + c)) continue;
                candidates.push({ y: r, x: c });
            }
        }
        shuffle(candidates);

        const result = [];
        const DIRS_4 = [
            { dy: -1, dx: 0 }, { dy: 1, dx: 0 },
            { dy: 0, dx: -1 }, { dy: 0, dx: 1 },
        ];
        for (let i = 0; i < count && i < candidates.length; i++) {
            const pos = candidates[i];
            // 「单格全拼巡逻」：所有敌人都是 patrol，4 方向随机起步
            const dir = DIRS_4[Math.floor(Math.random() * 4)];
            result.push({ y: pos.y, x: pos.x, behavior: "patrol", dir });
        }
        return result;
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /* ===== 难度档 ===== */

    function computeTier(level, baseDiff) {
        const tier = Math.min(5, baseDiff + Math.floor((level - 1) / 5));
        // 简单档永久 0 敌
        if (baseDiff === 0) {
            return { walls: 0, enemies: 0, enemySpeed: 0, behaviors: [] };
        }
        // 普通档永久 0 敌
        if (baseDiff === 1) {
            const walls = 2 + Math.floor((level - 1) / 5) * 2; // 2,4,6,8...
            return { walls, enemies: 0, enemySpeed: 0, behaviors: [] };
        }
        // 困难档：所有敌人统一为「单格全拼巡逻」（patrol），随等级提升数量与速度
        if (tier === 2) return { walls: 4, enemies: 1, enemySpeed: 700, behaviors: ["patrol"] };
        if (tier === 3) return { walls: 6, enemies: 1, enemySpeed: 600, behaviors: ["patrol"] };
        if (tier === 4) return { walls: 8, enemies: 2, enemySpeed: 600, behaviors: ["patrol", "patrol"] };
        return { walls: 10, enemies: 2, enemySpeed: 500, behaviors: ["patrol", "patrol"] };
    }

    /* ===== 配对模式专属难度 ===== */

    function computeMatchTier(level, baseDiff) {
        if (baseDiff === 0) {
            // 简单：极少墙，无敌人
            return { walls: 1, enemies: 0, enemySpeed: 0, behaviors: [] };
        }
        if (baseDiff === 1) {
            // 普通：少量墙，无敌人
            const walls = 2 + Math.floor(level / 4);
            return { walls, enemies: 0, enemySpeed: 0, behaviors: [] };
        }
        // 困难：第1关就有敌人，数量和速度随关卡增长但有上限
        const walls = 3 + Math.floor(level / 4);
        const enemyCount = Math.min(3, 1 + Math.floor((level - 1) / 4));
        const enemySpeed = Math.max(400, 750 - (level - 1) * 30);
        const behaviors = Array(enemyCount).fill("patrol");
        return { walls, enemies: enemyCount, enemySpeed, behaviors };
    }

    /* ===== 关卡构建（数据 → DOM） ===== */

    function buildLevel() {
        currentHanzi = pickNextHanzi();
        mask = hanziToMask(currentHanzi);
        grid = createEmptyGrid();
        addBorderWalls(grid);
        const targets = placeMaskAsTargets(grid, mask);

        playerStart = { y: PLAYER_START_Y, x: PLAYER_START_X, face: "up" };
        // 如果起点恰好是墙（不应该，但保险），找替代
        if (grid[playerStart.y][playerStart.x] !== ".") {
            playerStart = findFirstEmpty(grid);
        }
        player = { y: playerStart.y, x: playerStart.x, face: "up" };

        const tier = computeTier(level, baseDifficulty);
        boxes = placeBoxes(grid, targets.length, playerStart, targets);
        addInteriorWalls(grid, tier.walls, targets, playerStart, boxes);
        enemies = spawnEnemies(grid, tier.enemies, tier.enemySpeed, tier.behaviors, playerStart, boxes);

        moves = 0;
        history = [];
        isWinning = false;

        renderGrid();
        renderActors();
        renderHUD();
        renderTargetBar();
        fitGrid();

        // 检查初始已上目标的箱子（理论不应该发生，但放心起见）
        boxes.forEach(b => {
            b.onTarget = isTargetCell(b.y, b.x);
            if (b.onTarget) b.el.classList.add("on-target");
        });

        startEnemyLoop(tier.enemySpeed);
    }

    function findFirstEmpty(g) {
        for (let r = ROWS - 2; r >= 1; r--) {
            for (let c = 1; c < COLS - 1; c++) {
                if (g[r][c] === ".") return { y: r, x: c, face: "up" };
            }
        }
        return { y: 1, x: 1, face: "up" };
    }

    /* ===== 配对模式关卡构建 ===== */

    function buildLevelMatch() {
        // 1. 计算本关配对数
        const pairCount = Math.min(MATCH_PAIR_MAX,
            MATCH_PAIR_BASE + Math.floor((level - 1) / MATCH_PAIR_STEP));

        // 2. 从 HANZI_LIST + PINYIN_MAP 选字（有拼音的才用）
        const allHanzi = (window.HANZI_LIST || []);
        const pinyinMap = (window.PINYIN_MAP || {});
        const eligible = allHanzi.filter(h => pinyinMap[h]);
        shuffle(eligible);

        matchPairs = [];
        const picked = new Set();
        for (let i = 0; i < eligible.length && matchPairs.length < pairCount; i++) {
            const h = eligible[i];
            if (picked.has(h)) continue;
            picked.add(h);
            const py = pinyinMap[h];
            // 随机分配方向：hp=箱汉字→目标拼音, ph=箱拼音→目标汉字
            const dir = Math.random() < 0.5 ? "hp" : "ph";
            matchPairs.push({ hanzi: h, pinyin: py, dir });
        }

        // 3. 创建 9×9 网格 + 边框墙
        grid = [];
        for (let r = 0; r < MATCH_ROWS; r++) {
            const row = [];
            for (let c = 0; c < MATCH_COLS; c++) row.push(".");
            grid.push(row);
        }
        // 边框墙
        for (let c = 0; c < MATCH_COLS; c++) { grid[0][c] = "#"; grid[MATCH_ROWS-1][c] = "#"; }
        for (let r = 0; r < MATCH_ROWS; r++) { grid[r][0] = "#"; grid[r][MATCH_COLS-1] = "#"; }

        // 4. 放目标格
        matchTargets = [];
        const usedCells = new Set();
        const targetPositions = pickScatteredCells(grid, matchPairs.length, usedCells);
        matchPairs.forEach((pair, idx) => {
            const pos = targetPositions[idx];
            const type = pair.dir === "hp" ? "pinyin" : "hanzi";   // 目标格类型
            const label = pair.dir === "hp" ? pair.pinyin : pair.hanzi;  // 目标格标签
            grid[pos.y][pos.x] = "T";
            matchTargets.push({ y: pos.y, x: pos.x, label, pairId: idx, type });
            usedCells.add(pos.y + "," + pos.x);
        });

        // 5. 玩家起点
        playerStart = { y: MATCH_PLAYER_Y, x: MATCH_PLAYER_X, face: "up" };
        // 如果起点被占，找替代
        if (grid[playerStart.y][playerStart.x] !== ".") {
            playerStart = findFirstEmptyInGrid(grid, MATCH_ROWS, MATCH_COLS);
        }
        usedCells.add(playerStart.y + "," + playerStart.x);
        player = { y: playerStart.y, x: playerStart.x, face: "up" };

        // 6. 放箱子（与目标分离，不放在目标格上）
        boxes = [];
        const boxPositions = pickScatteredCells(grid, matchPairs.length, usedCells);
        matchPairs.forEach((pair, idx) => {
            const pos = boxPositions[idx];
            const label = pair.dir === "hp" ? pair.hanzi : pair.pinyin;  // 箱子标签
            boxes.push({
                y: pos.y, x: pos.x, onTarget: false,
                pairId: idx, label, dir: pair.dir
            });
            usedCells.add(pos.y + "," + pos.x);
        });

        // 6.5 配对数≥5时加1个干扰箱（无目标，只占空间碍事）
        if (pairCount >= 5) {
            // 选一个与现有配对不重复的汉字做标签
            const usedLabels = new Set(matchPairs.map(p => p.hanzi));
            const distractorHanzi = allHanzi.find(h => pinyinMap[h] && !usedLabels.has(h));
            const distractorLabel = distractorHanzi || "?";
            const distractorPositions = pickScatteredCells(grid, 1, usedCells);
            if (distractorPositions.length > 0) {
                const dp = distractorPositions[0];
                boxes.push({
                    y: dp.y, x: dp.x, onTarget: false,
                    pairId: -1, label: distractorLabel, dir: "hp",
                    isDistractor: true
                });
                usedCells.add(dp.y + "," + dp.x);
            }
        }

        // 7. 按配对模式专属难度放内墙和敌人
        const tier = computeMatchTier(level, baseDifficulty);
        addInteriorWalls(grid, tier.walls, matchTargets, playerStart, boxes);
        enemies = spawnEnemies(grid, tier.enemies, tier.enemySpeed, tier.behaviors, playerStart, boxes);

        moves = 0;
        history = [];
        isWinning = false;
        currentHanzi = matchPairs.map(p => p.hanzi).join("");

        renderGrid();
        renderActors();
        renderHUD();
        renderTargetBar();
        fitGrid();

        startEnemyLoop(tier.enemySpeed);
    }

    /** 在可玩区域随机选 count 个位置，保证不贴墙（四邻非墙）、互不相邻 */
    function pickScatteredCells(g, count, usedCells) {
        const gRows = g.length;
        const gCols = g[0] ? g[0].length : 0;

        // 候选条件：r/c 在 [2, N-3] 范围内，且四邻都不是墙，确保玩家总能从对面推
        const candidates = [];
        for (let r = 2; r < gRows - 2; r++) {
            for (let c = 2; c < gCols - 2; c++) {
                if (g[r][c] !== "." && g[r][c] !== "T") continue;
                if (usedCells.has(r + "," + c)) continue;
                // 四个正交邻居必须都不是墙
                const allSidesOpen = [[-1,0],[1,0],[0,-1],[0,1]].every(([dy, dx]) => {
                    const ny = r + dy, nx = c + dx;
                    return ny >= 0 && ny < gRows && nx >= 0 && nx < gCols && g[ny][nx] !== "#";
                });
                if (!allSidesOpen) continue;
                candidates.push({ y: r, x: c });
            }
        }
        shuffle(candidates);

        const result = [];
        const occupied = new Set(usedCells);
        // 第一轮：严格不相邻（保证箱子之间有操作空间）
        for (const pos of candidates) {
            if (result.length >= count) break;
            const tooClose = [[-1,0],[1,0],[0,-1],[0,1]].some(([dy, dx]) =>
                occupied.has((pos.y + dy) + "," + (pos.x + dx))
            );
            if (tooClose) continue;
            result.push(pos);
            occupied.add(pos.y + "," + pos.x);
        }
        // 第二轮：退化为只排除已占位置（容忍相邻，但仍不贴墙）
        if (result.length < count) {
            for (const pos of candidates) {
                if (result.length >= count) break;
                if (occupied.has(pos.y + "," + pos.x)) continue;
                result.push(pos);
                occupied.add(pos.y + "," + pos.x);
            }
        }
        return result;
    }

    function findFirstEmptyInGrid(g, rows, cols) {
        for (let r = rows - 2; r >= 1; r--) {
            for (let c = 1; c < cols - 1; c++) {
                if (g[r][c] === ".") return { y: r, x: c, face: "up" };
            }
        }
        return { y: 1, x: 1, face: "up" };
    }

    /* ===== 渲染：起始页 / 游戏页 / 结算页 ===== */

    function renderStartScreen() {
        highest = loadHighest();

        root.innerHTML = `
            <div class="sokoban-wrapper">
                <div class="sokoban-crt-frame start-frame">
                    <div class="sokoban-scanlines"></div>

                    <div class="sokoban-start">
                        <h2 class="sokoban-pixel-title">📦 汉字推箱子</h2>
                        <p class="sokoban-pixel-sub">推箱子点亮汉字笔画</p>

                        <div class="sokoban-arcade-menu">
                            <div class="sokoban-arcade-prompt">▶ 选择模式</div>
                            <button class="sokoban-pixel-btn mode" data-mode="pixel">[ 像素字模式 ]<small>推箱子拼出像素汉字</small></button>
                            <button class="sokoban-pixel-btn mode" data-mode="match">[ 配对模式 ]<small>汉字↔拼音配对推箱</small></button>
                        </div>

                        <div class="sokoban-arcade-menu sokoban-diff-menu" style="display:none">
                            <div class="sokoban-arcade-prompt">▶ 选择难度</div>
                            <button class="sokoban-pixel-btn diff" data-diff="0">[ 简单 ]<small>无墙 · 无敌人</small></button>
                            <button class="sokoban-pixel-btn diff" data-diff="1">[ 普通 ]<small>有墙 · 无敌人</small></button>
                            <button class="sokoban-pixel-btn diff" data-diff="2">[ 困难 ]<small>有墙 + 拼音巡逻敌</small></button>
                        </div>

                        <p class="sokoban-pixel-hint">每过 5 关难度自动递增</p>
                        ${highest > 0 ? `<div class="sokoban-pixel-record">🏆 最高关卡：${String(highest).padStart(2, "0")}</div>` : ""}

                        <div class="sokoban-press-start">▶ 准备出发 ◀</div>

                        <button class="sokoban-pixel-btn back" id="sokobanStartBack">[ ← 返回主界面 ]</button>
                    </div>
                </div>
            </div>
        `;

        // 模式选择 → 显示难度
        root.querySelectorAll(".sokoban-pixel-btn.mode").forEach(btn => {
            btn.addEventListener("click", () => {
                gameMode = btn.dataset.mode;
                root.querySelectorAll(".sokoban-pixel-btn.mode").forEach(b =>
                    b.style.borderColor = b === btn ? "#ffeb3b" : "");
                root.querySelector(".sokoban-diff-menu").style.display = "";
            });
        });

        root.querySelectorAll(".sokoban-pixel-btn.diff").forEach(btn => {
            btn.addEventListener("click", () => {
                baseDifficulty = parseInt(btn.dataset.diff);
                startGame();
            });
        });
        root.querySelector("#sokobanStartBack").addEventListener("click", onBack);
    }

    function renderGameScreen() {
        const isMatch = gameMode === "match";
        const gridCols = isMatch ? MATCH_COLS : COLS;
        const gridRows = isMatch ? MATCH_ROWS : ROWS;
        const title = isMatch ? "📦 汉字配对" : "📦 汉字推箱子";
        const litLabel = isMatch ? "配对" : "点亮";

        const wrapper = root.querySelector(".sokoban-wrapper");
        wrapper.innerHTML = `
            <div class="sokoban-crt-frame">
                <div class="sokoban-scanlines"></div>

                <header class="sokoban-topbar">
                    <button class="sokoban-pixel-btn small" id="sokobanBack">[ ← 返回 ]</button>
                    <div class="sokoban-title">${title}</div>
                </header>

                <div class="sokoban-target-bar" id="sokobanTargetBar">
                    <span class="sokoban-target-label">目标</span>
                    <span class="sokoban-target-hanzi" id="sokobanTargetHanzi">—</span>
                    <span class="sokoban-target-pinyin" id="sokobanTargetPinyin"></span>
                </div>

                <div class="sokoban-body">
                    <aside class="sokoban-side left">
                        <div class="sokoban-side-block">
                            <div class="side-label">命数</div>
                            <div class="side-lives" id="sokobanLives"></div>
                        </div>
                        <div class="sokoban-side-block">
                            <div class="side-label">关卡</div>
                            <div class="side-value lv" id="sokobanLevel">01</div>
                        </div>
                    </aside>

                    <main class="sokoban-stage" id="sokobanStage">
                        <div class="sokoban-grid" id="sokobanGrid" style="--cols:${gridCols}; --rows:${gridRows}"></div>
                    </main>

                    <aside class="sokoban-side right">
                        <div class="sokoban-side-block">
                            <div class="side-label">步数</div>
                            <div class="side-value" id="sokobanMoves">000</div>
                        </div>
                        <div class="sokoban-side-block">
                            <div class="side-label">${litLabel}</div>
                            <div class="side-value" id="sokobanLit">0/0</div>
                        </div>
                        <div class="sokoban-side-block">
                            <div class="side-label">难度</div>
                            <div class="side-value diff" id="sokobanDiff">${DIFF_NAMES[baseDifficulty]}</div>
                        </div>
                    </aside>
                </div>

                <footer class="sokoban-footer">
                    <button class="sokoban-pixel-btn small" id="sokobanUndo">[ 撤销 ]</button>
                    <button class="sokoban-pixel-btn small" id="sokobanReset">[ 重置 ]</button>
                    <span class="sokoban-hint">键盘 ↑↓←→ / 屏幕滑动</span>
                </footer>
            </div>
        `;

        root.querySelector("#sokobanBack").addEventListener("click", () => {
            stopEnemyLoop();
            renderStartScreen();
        });
        root.querySelector("#sokobanUndo").addEventListener("click", () => undo());
        root.querySelector("#sokobanReset").addEventListener("click", () => resetCurrentLevel());

        bindGridInputs();
        bindResize();
    }

    /* ===== 网格 / 演员渲染 ===== */

    function renderGrid() {
        const gridEl = root.querySelector("#sokobanGrid");
        if (!gridEl) return;
        gridEl.innerHTML = "";

        const rows = grid.length;
        const cols = grid[0] ? grid[0].length : 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement("div");
                cell.className = "sokoban-cell";
                cell.style.setProperty("--x", c);
                cell.style.setProperty("--y", r);
                if (grid[r][c] === "#") cell.classList.add("wall");
                else if (grid[r][c] === "T") {
                    cell.classList.add("target");
                    // 配对模式：目标格显示标签
                    if (gameMode === "match") {
                        const mt = matchTargets.find(t => t.y === r && t.x === c);
                        if (mt) {
                            cell.classList.add("type-" + mt.type);
                            const label = document.createElement("span");
                            label.className = "target-label";
                            label.textContent = mt.label;
                            cell.appendChild(label);
                        }
                    }
                }
                gridEl.appendChild(cell);
            }
        }
    }

    function renderActors() {
        const gridEl = root.querySelector("#sokobanGrid");
        if (!gridEl) return;

        // boxes
        boxes.forEach(b => {
            const el = document.createElement("div");
            el.className = "sokoban-actor sokoban-box";
            if (b.onTarget) el.classList.add("on-target");
            if (b.isDistractor) el.classList.add("distractor");
            el.style.setProperty("--x", b.x);
            el.style.setProperty("--y", b.y);

            // 配对模式：箱子显示标签
            if (gameMode === "match" && b.label) {
                el.classList.add("has-label", "dir-" + (b.dir || "hp"));
                const label = document.createElement("span");
                label.className = "box-label";
                label.textContent = b.label;
                // 拼音标签缩小字号
                if (b.dir === "ph") {
                    const len = b.label.length;
                    const sizeFactor =
                        len <= 2 ? 0.56 :
                        len <= 3 ? 0.46 :
                        len <= 4 ? 0.36 :
                        len <= 5 ? 0.30 : 0.26;
                    label.style.fontSize = `calc(var(--cell) * ${sizeFactor})`;
                    label.style.fontWeight = "400";
                } else {
                    label.style.fontSize = `calc(var(--cell) * 0.68)`;
                }
                el.appendChild(label);
            }

            gridEl.appendChild(el);
            b.el = el;
        });

        // enemies：单格 tile，整格内显示当前汉字的「全拼」（含声调）
        let enemyPinyin;
        if (gameMode === "match") {
            // 配对模式：敌人显示随机一个配对汉字的拼音
            const rp = matchPairs.length > 0 ? matchPairs[Math.floor(Math.random() * matchPairs.length)] : null;
            enemyPinyin = rp ? rp.pinyin : "?";
        } else {
            enemyPinyin = (window.PINYIN_MAP && window.PINYIN_MAP[currentHanzi]) || currentHanzi || "?";
        }
        enemies.forEach(e => {
            const el = document.createElement("div");
            el.className = "sokoban-actor sokoban-enemy";
            el.style.setProperty("--x", e.x);
            el.style.setProperty("--y", e.y);
            const label = document.createElement("span");
            label.className = "enemy-pinyin";
            label.textContent = enemyPinyin;
            // 字数越多字号越小，保证单格内塞得下
            const len = enemyPinyin.length;
            const sizeFactor =
                len <= 2 ? 0.42 :
                len <= 3 ? 0.32 :
                len <= 4 ? 0.26 :
                len <= 5 ? 0.22 : 0.18;
            label.style.fontSize = `calc(var(--cell) * ${sizeFactor})`;
            el.appendChild(label);
            gridEl.appendChild(el);
            e.el = el;
        });

        // player
        const pEl = document.createElement("div");
        pEl.className = "sokoban-actor sokoban-player face-" + player.face;
        pEl.style.setProperty("--x", player.x);
        pEl.style.setProperty("--y", player.y);
        const head = document.createElement("span");
        head.className = "player-head";
        const body = document.createElement("span");
        body.className = "player-body";
        const arrow = document.createElement("span");
        arrow.className = "player-arrow";
        pEl.appendChild(head);
        pEl.appendChild(body);
        pEl.appendChild(arrow);
        gridEl.appendChild(pEl);
        playerEl = pEl;
    }

    function applyBoxTransform(b) {
        if (!b.el) return;
        b.el.style.setProperty("--x", b.x);
        b.el.style.setProperty("--y", b.y);
        b.el.classList.toggle("on-target", !!b.onTarget);
        // 配对模式：正确匹配加 correct-match（干扰箱不算）
        if (gameMode === "match") {
            const isCorrect = b.onTarget && b.pairId !== undefined && b.pairId !== -1;
            b.el.classList.toggle("correct-match", isCorrect);
        }
    }

    function applyPlayerTransform() {
        if (!playerEl) return;
        playerEl.style.setProperty("--x", player.x);
        playerEl.style.setProperty("--y", player.y);
        playerEl.classList.remove("face-up", "face-down", "face-left", "face-right");
        playerEl.classList.add("face-" + player.face);
    }

    function applyEnemyTransform(e) {
        if (!e.el) return;
        e.el.style.setProperty("--x", e.x);
        e.el.style.setProperty("--y", e.y);
    }

    /* ===== HUD ===== */

    function renderTargetBar() {
        const hzEl = root.querySelector("#sokobanTargetHanzi");
        const pyEl = root.querySelector("#sokobanTargetPinyin");
        if (gameMode === "match") {
            const lit = boxes.filter(b => b.onTarget).length;
            const total = boxes.length;
            if (hzEl) hzEl.textContent = `配对 ${lit}/${total}`;
            if (pyEl) pyEl.textContent = "";
        } else {
            if (hzEl) hzEl.textContent = currentHanzi || "—";
            if (pyEl) pyEl.textContent = (window.PINYIN_MAP && window.PINYIN_MAP[currentHanzi]) || "";
        }
    }

    /* ===== 自适应：计算格子尺寸塞满可用空间 ===== */

    function fitGrid() {
        const stage = root.querySelector("#sokobanStage");
        const gridEl = root.querySelector("#sokobanGrid");
        if (!stage || !gridEl) return;
        // 取 stage 容器的真实可用尺寸
        const rect = stage.getBoundingClientRect();
        const availW = rect.width - 8;
        const availH = rect.height - 8;
        if (availW <= 0 || availH <= 0) return;
        const cols = grid ? (grid[0] ? grid[0].length : COLS) : COLS;
        const rows = grid ? grid.length : ROWS;
        const cellByW = Math.floor(availW / cols);
        const cellByH = Math.floor(availH / rows);
        // 范围 22–56px，避免过小或撑爆
        const cell = Math.max(22, Math.min(56, Math.min(cellByW, cellByH)));
        gridEl.style.setProperty("--cell", cell + "px");
    }

    let resizeObserver = null;
    function bindResize() {
        unbindResize();
        if (typeof ResizeObserver !== "undefined") {
            const stage = root.querySelector("#sokobanStage");
            if (stage) {
                resizeObserver = new ResizeObserver(() => fitGrid());
                resizeObserver.observe(stage);
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

    function renderHUD() {
        const lvEl = root.querySelector("#sokobanLevel");
        const mvEl = root.querySelector("#sokobanMoves");
        const litEl = root.querySelector("#sokobanLit");
        const liveEl = root.querySelector("#sokobanLives");
        const diffEl = root.querySelector("#sokobanDiff");
        const totalTargets = boxes.length;
        const lit = boxes.filter(b => b.onTarget).length;

        if (lvEl) lvEl.textContent = String(level).padStart(2, "0");
        if (mvEl) mvEl.textContent = String(moves).padStart(3, "0");
        if (litEl) litEl.textContent = `${lit}/${totalTargets}`;
        if (diffEl) diffEl.textContent = DIFF_NAMES[baseDifficulty];

        if (liveEl) {
            liveEl.innerHTML = "";
            for (let i = 0; i < 3; i++) {
                const h = document.createElement("span");
                h.className = "side-life" + (i < lives ? " full" : " gone");
                h.textContent = i < lives ? "♥" : "·";
                liveEl.appendChild(h);
            }
        }
    }

    /* ===== 游戏开始 / 重置 ===== */

    function startGame() {
        level = 1;
        lives = 3;
        totalMoves = 0;
        usedHanzi = new Set();
        gameActive = true;
        isWinning = false;

        renderGameScreen();
        if (gameMode === "match") buildLevelMatch();
        else buildLevel();

        bindKeyboard();
    }

    function resetCurrentLevel() {
        if (!gameActive) return;
        stopEnemyLoop();
        // 同关，但重新生成（保证一定能解开新布局）
        if (gameMode === "match") buildLevelMatch();
        else buildLevel();
    }

    /* ===== 移动 / 推箱子 ===== */

    function tryMove(dy, dx) {
        if (!gameActive || isWinning) return;

        // 朝向更新（即使无法移动也要面向那个方向）
        const newFace = directionFromDelta(dy, dx);
        if (newFace) {
            player.face = newFace;
            applyPlayerTransform();
        }

        const ny = player.y + dy, nx = player.x + dx;
        if (!inBounds(ny, nx) || isWallCell(ny, nx)) {
            playBumpSound();
            return;
        }

        const box = boxAt(ny, nx);
        if (box) {
            const by = ny + dy, bx = nx + dx;
            if (!inBounds(by, bx) || isWallCell(by, bx) || boxAt(by, bx)) {
                playBumpSound();
                return;
            }
            pushHistory();
            box.y = by; box.x = bx;
            const wasOnTarget = box.onTarget;
            // 配对模式：只有正确匹配才算 onTarget
            if (gameMode === "match") {
                const mt = matchTargets.find(t => t.pairId === box.pairId);
                box.onTarget = !!(mt && mt.y === by && mt.x === bx);
            } else {
                box.onTarget = isTargetCell(by, bx);
            }
            applyBoxTransform(box);
            playPushSound();
            if (box.onTarget && !wasOnTarget) playLightSound();
        } else {
            pushHistory();
        }

        player.y = ny; player.x = nx;
        applyPlayerTransform();
        moves++; totalMoves++;
        renderHUD();

        checkEnemyCollision();
        if (allTargetsLit() && !isWinning) onLevelComplete();
    }

    function directionFromDelta(dy, dx) {
        if (dy === -1) return "up";
        if (dy === 1) return "down";
        if (dx === -1) return "left";
        if (dx === 1) return "right";
        return null;
    }

    function allTargetsLit() {
        if (gameMode === "match") {
            // 配对模式：每个非干扰箱必须在正确匹配的目标上
            const realBoxes = boxes.filter(b => b.pairId !== -1);
            return realBoxes.length > 0 && realBoxes.every(b => {
                const mt = matchTargets.find(t => t.pairId === b.pairId);
                return mt && b.y === mt.y && b.x === mt.x;
            });
        }
        return boxes.length > 0 && boxes.every(b => b.onTarget);
    }

    /* ===== 撤销栈 ===== */

    function pushHistory() {
        const snap = {
            player: { y: player.y, x: player.x, face: player.face },
            boxes: boxes.map(b => ({ y: b.y, x: b.x, onTarget: b.onTarget })),
            moves,
        };
        history.push(snap);
        if (history.length > HISTORY_LIMIT) history.shift();
    }

    function undo() {
        if (!gameActive || isWinning) return;
        const snap = history.pop();
        if (!snap) return;
        player.y = snap.player.y;
        player.x = snap.player.x;
        player.face = snap.player.face;
        applyPlayerTransform();
        snap.boxes.forEach((s, i) => {
            const b = boxes[i];
            b.y = s.y; b.x = s.x; b.onTarget = s.onTarget;
            applyBoxTransform(b);
        });
        moves = snap.moves;
        renderHUD();
    }

    /* ===== 敌人循环 ===== */

    function startEnemyLoop(speed) {
        stopEnemyLoop();
        if (enemies.length === 0 || speed <= 0) return;
        enemyTimerId = setInterval(() => {
            if (!gameActive || isWinning) return;
            enemies.forEach(stepEnemy);
            checkEnemyCollision();
        }, speed);
    }

    function stopEnemyLoop() {
        if (enemyTimerId) {
            clearInterval(enemyTimerId);
            enemyTimerId = null;
        }
    }

    function canEnemyStep(y, x) {
        if (!inBounds(y, x)) return false;
        if (isWallCell(y, x)) return false;
        if (boxAt(y, x)) return false;
        // 敌人之间不重叠
        if (enemies.some(e => e.y === y && e.x === x)) return false;
        return true;
    }

    function stepEnemy(e) {
        // 「全屏巡逻」= 偏向当前方向的随机游走：
        //   - 若当前方向可走：70% 继续直行，30% 主动转向（让它会拐弯）
        //   - 若当前方向被堵：在剩余可走方向里挑（优先非 180° 调头），实在没得选才掉头
        const ALL_DIRS = [
            { dy: -1, dx: 0 }, { dy: 1, dx: 0 },
            { dy: 0, dx: -1 }, { dy: 0, dx: 1 },
        ];
        const valid = ALL_DIRS.filter(d => canEnemyStep(e.y + d.dy, e.x + d.dx));
        if (valid.length === 0) return;

        const sameDir = valid.find(d => d.dy === e.dir.dy && d.dx === e.dir.dx);
        const reverse = { dy: -e.dir.dy, dx: -e.dir.dx };
        const turns = valid.filter(d =>
            !(d.dy === e.dir.dy && d.dx === e.dir.dx) &&
            !(d.dy === reverse.dy && d.dx === reverse.dx)
        );

        let pick;
        if (sameDir && Math.random() < 0.7) {
            pick = sameDir;                                 // 大概率沿原方向继续
        } else if (turns.length > 0) {
            pick = turns[Math.floor(Math.random() * turns.length)]; // 主动转弯（左/右拐）
        } else if (sameDir) {
            pick = sameDir;                                 // 没法转弯就继续直行
        } else {
            pick = valid[Math.floor(Math.random() * valid.length)]; // 实在被堵才走 180°
        }

        e.dir = { dy: pick.dy, dx: pick.dx };
        e.y += pick.dy; e.x += pick.dx;
        applyEnemyTransform(e);
    }

    function checkEnemyCollision() {
        const hit = enemies.some(e => e.y === player.y && e.x === player.x);
        if (!hit) return;
        lives--;
        playHurtSound();
        flashScreen();
        renderHUD();
        if (lives <= 0) {
            endGame();
            return;
        }
        // 玩家回起点；箱子保留
        player.y = playerStart.y;
        player.x = playerStart.x;
        player.face = "up";
        applyPlayerTransform();
    }

    function flashScreen() {
        const frame = root.querySelector(".sokoban-crt-frame");
        if (!frame) return;
        frame.classList.remove("hurt");
        // eslint-disable-next-line no-unused-expressions
        void frame.offsetWidth;
        frame.classList.add("hurt");
        setTimeout(() => frame && frame.classList.remove("hurt"), 400);
    }

    /* ===== 过关 ===== */

    function onLevelComplete() {
        isWinning = true;
        stopEnemyLoop();
        playWinSound();

        // 配对模式：朗读每个配对汉字
        if (gameMode === "match" && window.speakHanzi) {
            matchPairs.forEach(p => {
                try { window.speakHanzi(p.hanzi); } catch (_) {}
            });
        } else if (window.speakHanzi) {
            try { window.speakHanzi(currentHanzi); } catch (_) {}
        }

        showLevelCompleteOverlay(() => {
            level++;
            const newHighest = Math.max(highest, level - 1);
            if (newHighest > highest) {
                highest = newHighest;
                saveHighest(highest);
            }
            if (gameMode === "match") buildLevelMatch();
            else buildLevel();
        });
    }

    function showLevelCompleteOverlay(onDone) {
        const wrapper = root.querySelector(".sokoban-wrapper");
        if (!wrapper) return;
        const overlay = document.createElement("div");
        overlay.className = "sokoban-win-overlay";

        if (gameMode === "match") {
            // 配对模式：展示配对结果
            const pairsHtml = matchPairs.map(p => {
                const dirLabel = p.dir === "hp" ? `${p.hanzi}→${p.pinyin}` : `${p.pinyin}→${p.hanzi}`;
                return `<span class="sokoban-win-pair">${dirLabel}</span>`;
            }).join(" ");
            overlay.innerHTML = `
                <div class="sokoban-win-card">
                    <div class="sokoban-win-hanzi">✓</div>
                    <div class="sokoban-win-pairs">${pairsHtml}</div>
                    <div class="sokoban-win-label">★ 第 ${String(level).padStart(2, "0")} 关 通关 ★</div>
                </div>
            `;
        } else {
            const pinyin = (window.PINYIN_MAP && window.PINYIN_MAP[currentHanzi]) || "";
            overlay.innerHTML = `
                <div class="sokoban-win-card">
                    <div class="sokoban-win-mask" id="sokobanWinMask"></div>
                    <div class="sokoban-win-hanzi">${currentHanzi}</div>
                    <div class="sokoban-win-pinyin">${pinyin}</div>
                    <div class="sokoban-win-label">★ 第 ${String(level).padStart(2, "0")} 关 通关 ★</div>
                </div>
            `;
        }

        wrapper.appendChild(overlay);

        if (gameMode !== "match") {
            // 用 mask 渲染像素拼字（作为放大版"过关纪念"）
            const maskEl = overlay.querySelector("#sokobanWinMask");
            for (let r = 0; r < MASK_SIZE; r++) {
                for (let c = 0; c < MASK_SIZE; c++) {
                    const cell = document.createElement("div");
                    cell.className = "win-mask-cell" + (mask[r][c] ? " lit" : "");
                    cell.style.animationDelay = ((r + c) * 60) + "ms";
                    maskEl.appendChild(cell);
                }
            }
        }

        setTimeout(() => {
            overlay.remove();
            onDone();
        }, 2000);
    }

    /* ===== 失败结算 ===== */

    function endGame() {
        gameActive = false;
        stopEnemyLoop();
        playGameOverSound();

        const newHighest = Math.max(highest, level - 1);
        if (newHighest > highest) {
            highest = newHighest;
            saveHighest(highest);
        }

        const wrapper = root.querySelector(".sokoban-wrapper");
        if (!wrapper) return;
        const overlay = document.createElement("div");
        overlay.className = "sokoban-gameover";
        overlay.innerHTML = `
            <div class="sokoban-gameover-inner">
                <div class="sokoban-go-title" id="sokobanGoTitle">游戏结束</div>
                <pre class="sokoban-go-stats" id="sokobanGoStats"></pre>
                <div class="sokoban-go-btns">
                    <button class="sokoban-pixel-btn" id="sokobanRetry">[ 再来一局 ]</button>
                    <button class="sokoban-pixel-btn" id="sokobanGoHome">[ 返回主界面 ]</button>
                </div>
            </div>
        `;
        wrapper.appendChild(overlay);

        const lines = [
            `> 关  卡 : ${String(level).padStart(2, "0")}`,
            `> 步  数 : ${String(totalMoves).padStart(3, "0")}`,
            `> 最  高 : ${String(highest).padStart(2, "0")}`,
            `> 难  度 : ${DIFF_NAMES[baseDifficulty]}`,
            `> ▮`,
        ];
        const pre = overlay.querySelector("#sokobanGoStats");
        let idx = 0;
        function typeNext() {
            if (!overlay.parentNode) return;
            if (idx >= lines.length) return;
            pre.textContent = lines.slice(0, idx + 1).join("\n");
            idx++;
            setTimeout(typeNext, 240);
        }
        setTimeout(typeNext, 380);

        overlay.querySelector("#sokobanRetry").addEventListener("click", () => {
            overlay.remove();
            startGame();
        });
        overlay.querySelector("#sokobanGoHome").addEventListener("click", onBack);
    }

    /* ===== Storage ===== */

    function loadHighest() {
        try {
            return parseInt(localStorage.getItem(STORAGE_KEY)) || 0;
        } catch (e) { return 0; }
    }
    function saveHighest(n) {
        try { localStorage.setItem(STORAGE_KEY, n); } catch (e) { /* ignore */ }
    }

    /* ===== 输入 ===== */

    function onKeyDown(e) {
        if (!gameActive) return;
        const now = performance.now();
        if (now - lastKeyAt < KEY_MIN_INTERVAL) return;

        let handled = true;
        switch (e.key) {
            case "ArrowUp": case "w": case "W":    tryMove(-1, 0); break;
            case "ArrowDown": case "s": case "S":  tryMove(1, 0); break;
            case "ArrowLeft": case "a": case "A":  tryMove(0, -1); break;
            case "ArrowRight": case "d": case "D": tryMove(0, 1); break;
            case "z": case "Z":                    undo(); break;
            case "r": case "R":                    resetCurrentLevel(); break;
            default: handled = false;
        }
        if (handled) {
            e.preventDefault();
            lastKeyAt = now;
        }
    }

    function bindKeyboard() {
        unbindKeyboard();
        document.addEventListener("keydown", onKeyDown);
    }
    function unbindKeyboard() {
        document.removeEventListener("keydown", onKeyDown);
    }

    function bindGridInputs() {
        const grid = root.querySelector("#sokobanGrid");
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
        if (Math.abs(dx) > Math.abs(dy)) tryMove(0, Math.sign(dx));
        else                              tryMove(Math.sign(dy), 0);
    }
    function onGridPointerCancel() { swipeStart = null; }

    /* ===== mount / unmount ===== */

    function mount() {
        mounted = true;
        renderStartScreen();
    }

    function unmount() {
        mounted = false;
        gameActive = false;
        stopEnemyLoop();
        unbindKeyboard();
        unbindResize();
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
    }

    return { mount, unmount };
}

window.createSokobanGame = createSokobanGame;

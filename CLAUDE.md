# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

shiziyouxi is a Hanzi (Chinese character) game collection. The current primary app is the standalone browser version under `web/`; shared browser resources live in `common/`; each mini-game lives under `web/games/<game-name>/`; Python Flet implementations are grouped under `flet_app/` for later maintenance.

## File Ownership

### Whole project / collection shell

These files belong to the overall shiziyouxi project, not a specific game:

- `game.html` — Compatibility entry that redirects to `web/index.html`.
- `web/index.html` — Browser collection entry. Loads common files, game files, and the app shell.
- `web/app/app.js` — Game selection page and game switching logic.
- `web/app/home.css` — Game selection page styles.
- `common/css/base.css` — Shared reset/body/buttons/modal styles.
- `common/js/data.js` — Shared browser `HANZI_LIST` and `PINYIN_MAP`.
- `common/js/speech.js` — Shared browser Web Speech API helper.
- `hanzi_data.json`, `common_3500.txt`, `generate_data.py` — Shared data/tooling for Python/Flet data generation.

### Hanzi puzzle mini-game subproject

Only these files belong to the current Hanzi puzzle game subproject:

- `web/games/hanzi-puzzle/main.js` — Hanzi puzzle game logic.
- `web/games/hanzi-puzzle/style.css` — Hanzi puzzle game styles.

Future games should follow the same pattern:

```text
web/games/<game-name>/
  main.js
  style.css
```

### Flet versions

- `flet_app/main.py` — Full Flet app. Uses PIL to render a hanzi to an image, slices it into tiles, and uses Flet's `Draggable`/`DragTarget` for swap-by-drag interaction.
- `flet_app/main_simple.py` — Simplified Flet app. No PIL image slicing; tiles are colored blocks labeled by index. Uses click-to-select-then-click-to-swap interaction.
- `flet_app/test.py` — Manual smoke test that writes PNGs to `/tmp/`.
- `flet_app/requirements.txt` — Flet version dependencies.

## Commands

```bash
# Browser version
# Open game.html or web/index.html directly in a browser
python -m http.server 8000        # Optional: serve static web files from the repo root

# Flet versions
pip install -r flet_app/requirements.txt   # flet>=0.21.0, Pillow>=10.0.0

python flet_app/main.py                    # Full version, launches in browser
python flet_app/main.py -d                 # Full version, launches as desktop app (Flet native window)
python flet_app/main_simple.py             # Simplified version (Flet default view)

python flet_app/test.py                    # Smoke-tests image generation + slicing, outputs PNGs to /tmp/
```

## Architecture

### Browser collection (`web/` + `common/`)

- Shared files stay in `common/` so future games can reuse them.
- The launcher/app shell lives in `web/index.html` and `web/app/`.
- Each mini-game lives in its own subdirectory under `web/games/` and should expose a factory returning `{ mount, unmount }`.
- The current puzzle game is `web/games/hanzi-puzzle/`.
- `web/games/hanzi-puzzle/main.js` draws the hanzi to Canvas, slices it into tiles, implements click-to-swap interaction, checks wins, and calls `speakHanzi()` after completion.
- Puzzle tiles are sized dynamically from viewport/container size so the screen stays centered and normally avoids vertical scrolling.

### Shared puzzle flow

1. Pick a random hanzi from `HANZI_LIST`.
2. Render the hanzi as a square image (PIL in `flet_app/main.py`/`flet_app/test.py`, Canvas in `web/games/hanzi-puzzle/main.js`).
3. Slice the image into `grid_size^2` tiles in row-major order (index = row * grid_size + col).
4. Shuffle the tile ordering; the player must restore row-major order.
5. Track moves count and elapsed time; detect win by comparing current tile ordering to `correct_order`.

## Key Details

- The browser version keeps its shared `HANZI_LIST`/`PINYIN_MAP` in `common/js/data.js`; the Flet versions load `hanzi_data.json` from the repo root.
- `flet_app/main.py` requires a CJK font installed on the system for proper rendering. Without one, tiles show blank squares with a border — the game is still playable but visually degraded.
- The shuffle in `flet_app/main_simple.py` uses `random.shuffle` in a loop to guarantee the puzzle isn't already solved; `flet_app/main.py` uses `random.shuffle` without that guard.
- The browser puzzle uses `Array.sort(() => Math.random() - 0.5)` for shuffling, which is biased but acceptable for this game size.

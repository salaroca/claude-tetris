# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step. Open directly or serve locally:

```bash
open index.html                 # macOS quick open
python3 -m http.server 8000     # then visit http://localhost:8000
```

## Architecture

Three files, no dependencies, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px), sidebar panel (score/lines/level/next-piece preview), and a single `#overlay` div reused for both PAUSE and GAME OVER states.
- **`style.css`** — Dark/retro arcade theme.
- **`game.js`** — All game logic (~300 lines, `'use strict'`).

### game.js key concepts

- **Board**: `ROWS×COLS` matrix; cells hold `0` (empty) or a color index (1–7).
- **Piece object**: `{ type, shape, x, y }`. `shape` is a 2D matrix; rotation via `rotateCW` (transpose + reverse rows).
- **Collision**: `collide(shape, ox, oy)` — single source of truth for bounds and overlap checks.
- **Wall kicks**: `tryRotate` tries offsets `[0, -1, 1, -2, 2]` before discarding a rotation.
- **Game loop**: `requestAnimationFrame`-based; `dropAccum` accumulates elapsed ms, triggers gravity when it exceeds `dropInterval`.
- **Speed formula**: `dropInterval = max(100, 1000 − (level−1) × 90)` ms; level increments every 10 lines.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × level; hard drop +2 pts/cell, soft drop +1 pt/row.
- **Ghost piece**: `ghostY()` projects current piece straight down; drawn at `globalAlpha = 0.2`.

### Tunable constants (top of game.js)

`COLS`, `ROWS`, `BLOCK` (px), `COLORS` (array of 8, index 0 = null), `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update canvas `width`/`height` in `index.html` accordingly (`COLS×BLOCK` and `ROWS×BLOCK`).

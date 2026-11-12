'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris metálico
  '#eceff1', // Power-up - blanco hielo
];

const POWERS = ['bomb', 'ray', 'dye', 'gravity', 'freeze'];
const POWER_ICONS = { bomb: '💣', ray: '⚡', dye: '🎨', gravity: '⬇', freeze: '❄' };

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const ENERGY_GAIN = [0, 25, 40, 60, 90];
const ENERGY_MAX = 100;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const next5Canvas = document.getElementById('next5-canvas');
const next5Ctx = next5Canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const energyBar = document.getElementById('energy-bar');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const skillMenu = document.getElementById('skill-menu');
const next5Overlay = document.getElementById('next5-overlay');

const themeColors = { grid: '#22222e', shine: 'rgba(255,255,255,0.12)' };
const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-label');

function readThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  themeColors.grid = cs.getPropertyValue('--grid').trim() || themeColors.grid;
  themeColors.shine = cs.getPropertyValue('--block-shine').trim() || themeColors.shine;
}

function applyTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Modo oscuro' : 'Modo claro');
  themeLabel.textContent = isLight ? 'Claro' : 'Oscuro';
  if (persist) {
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }
  readThemeColors();
  if (board && current && next) { draw(); drawNext(); drawHold(); }
}

let board, current, next, pieceQueue, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let powerUpPending, nextPowerAt, frozenUntil;
let energy, holdPiece, slowUntil;
let lastBoardState, lastCurrent, lastScore;
let skillMenuOpen, next5Visible;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerUp() {
  const power = POWERS[Math.floor(Math.random() * POWERS.length)];
  return { type: 'power', power, shape: [[9]], x: Math.floor(COLS / 2), y: 0 };
}

function applyPower(power, cx, cy) {
  score += 50 * level;
  if (power === 'bomb') {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const r = cy + dr, c = cx + dc;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      }
  } else if (power === 'ray') {
    if (cy >= 0 && cy < ROWS) board[cy].fill(0);
    for (let r = 0; r < ROWS; r++) board[r][cx] = 0;
  } else if (power === 'dye') {
    const present = new Set();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c] >= 1 && board[r][c] <= 8) present.add(board[r][c]);
    if (present.size > 0) {
      const targets = [...present];
      const victim = targets[Math.floor(Math.random() * targets.length)];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c] === victim) board[r][c] = 0;
    }
  } else if (power === 'gravity') {
    for (let c = 0; c < COLS; c++) {
      const col = [];
      for (let r = 0; r < ROWS; r++) if (board[r][c]) col.push(board[r][c]);
      for (let r = 0; r < ROWS; r++) board[r][c] = r < ROWS - col.length ? 0 : col[r - (ROWS - col.length)];
    }
  } else if (power === 'freeze') {
    frozenUntil = performance.now() + 5000;
  }
  updateHUD();
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    energy = Math.min(ENERGY_MAX, energy + (ENERGY_GAIN[cleared] || 90));
    if (lines >= nextPowerAt) {
      powerUpPending = true;
      nextPowerAt += 10;
    }
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function saveUndoState() {
  lastBoardState = board.map(r => [...r]);
  lastCurrent = { ...current, shape: current.shape.map(r => [...r]) };
  lastScore = score;
}

function lockPiece() {
  saveUndoState();
  if (current.power) applyPower(current.power, current.x, current.y);
  else merge();
  clearLines();
  spawn();
}

function fillQueue() {
  while (pieceQueue.length < 4) pieceQueue.push(randomPiece());
}

function spawn() {
  current = next;
  if (powerUpPending) {
    powerUpPending = false;
    next = randomPowerUp();
  } else {
    next = pieceQueue.shift();
    pieceQueue.push(randomPiece());
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

// ---- Skills ----

function showSkillMenu() {
  if (energy < ENERGY_MAX || gameOver || paused) return;
  skillMenuOpen = true;
  cancelAnimationFrame(animId);
  skillMenu.classList.remove('hidden');
}

function hideSkillMenu() {
  skillMenuOpen = false;
  skillMenu.classList.add('hidden');
  resumeAfterSkill();
}

function resumeAfterSkill() {
  if (!paused && !gameOver && !skillMenuOpen && !next5Visible) {
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function activateSkill(n) {
  if (energy < ENERGY_MAX) return;
  energy = 0;
  skillMenuOpen = false;
  skillMenu.classList.add('hidden');
  updateHUD();

  if (n === 0) {
    // Ver 5 siguientes
    showNext5();
    return;
  }

  if (n === 1) {
    // Intercambiar pieza actual por otra del pool
    current = randomPiece();
    draw();
    resumeAfterSkill();
    return;
  }

  if (n === 2) {
    // Ralentizar tiempo 10s
    slowUntil = performance.now() + 10000;
    resumeAfterSkill();
    return;
  }

  if (n === 3) {
    // Deshacer última colocación
    if (lastBoardState) {
      board = lastBoardState.map(r => [...r]);
      current = { ...lastCurrent, shape: lastCurrent.shape.map(r => [...r]) };
      score = lastScore;
      lastBoardState = null;
      updateHUD();
      draw();
    }
    resumeAfterSkill();
    return;
  }

  if (n === 4) {
    // Reservar pieza (hold)
    if (!holdPiece) {
      holdPiece = { type: current.type, power: current.power, shape: current.shape.map(r => [...r]) };
      current = next;
      if (powerUpPending) {
        powerUpPending = false;
        next = randomPowerUp();
      } else {
        next = pieceQueue.shift();
        pieceQueue.push(randomPiece());
      }
      if (collide(current.shape, current.x, current.y)) { endGame(); return; }
      drawNext();
    } else {
      const shape = holdPiece.shape.map(r => [...r]);
      const incoming = {
        type: holdPiece.type, power: holdPiece.power, shape,
        x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0,
      };
      holdPiece = { type: current.type, power: current.power, shape: current.shape.map(r => [...r]) };
      current = incoming;
    }
    drawHold();
    draw();
    resumeAfterSkill();
    return;
  }

  resumeAfterSkill();
}

// ---- Next-5 overlay ----

function showNext5() {
  next5Visible = true;
  drawNext5();
  next5Overlay.classList.remove('hidden');
}

function hideNext5() {
  next5Visible = false;
  next5Overlay.classList.add('hidden');
  resumeAfterSkill();
}

function drawNext5() {
  const NB = 20;
  const AREA = 4 * NB;
  const GAP = 6;
  next5Ctx.clearRect(0, 0, next5Canvas.width, next5Canvas.height);
  const pieces = [next, ...pieceQueue];
  pieces.forEach((p, i) => {
    if (!p) return;
    const shape = p.shape;
    const offX = Math.floor((4 - shape[0].length) / 2);
    const offY = Math.floor((4 - shape.length) / 2);
    const baseYpx = i * (AREA + GAP);
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const px = (offX + c) * NB + 1;
        const py = baseYpx + (offY + r) * NB + 1;
        next5Ctx.fillStyle = COLORS[shape[r][c]];
        next5Ctx.fillRect(px, py, NB - 2, NB - 2);
        next5Ctx.fillStyle = themeColors.shine;
        next5Ctx.fillRect(px, py, NB - 2, 3);
      }
    if (p.power) {
      const icon = POWER_ICONS[p.power];
      next5Ctx.font = `${Math.floor(NB * 0.65)}px serif`;
      next5Ctx.textAlign = 'center';
      next5Ctx.textBaseline = 'middle';
      next5Ctx.fillText(icon, (offX + 0) * NB + NB / 2, baseYpx + (offY + 0) * NB + NB / 2);
    }
  });
}

// ---- HUD & Drawing ----

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  const pct = Math.min(100, Math.round((energy / ENERGY_MAX) * 100));
  energyBar.style.width = pct + '%';
  if (energy >= ENERGY_MAX) energyBar.classList.add('full');
  else energyBar.classList.remove('full');
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = themeColors.shine;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function drawPowerIcon(context, px, py, power, size, alpha) {
  const icon = POWER_ICONS[power];
  if (!icon) return;
  context.globalAlpha = alpha ?? 1;
  context.font = `${Math.floor(size * 0.65)}px serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(icon, px * size + size / 2, py * size + size / 2);
  context.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  if (current.power) drawPowerIcon(ctx, current.x, current.y, current.power, BLOCK);

  const now = performance.now();
  let badgeY = 6;
  if (now < frozenUntil) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#90caf9';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('❄ CONGELADO', canvas.width / 2, badgeY);
    ctx.globalAlpha = 1;
    badgeY += 18;
  }
  if (now < slowUntil) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('⏱ RALENTIZADO', canvas.width / 2, badgeY);
    ctx.globalAlpha = 1;
  }
}

function drawNext() {
  const NB = 21;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.power) drawPowerIcon(nextCtx, offX, offY, next.power, NB);
}

function drawHold() {
  const NB = 21;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!holdPiece) return;
  const shape = holdPiece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB);
  if (holdPiece.power) drawPowerIcon(holdCtx, offX, offY, holdPiece.power, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver || skillMenuOpen || next5Visible) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  const effectiveInterval = performance.now() < slowUntil ? dropInterval * 3 : dropInterval;
  if (ts < frozenUntil) {
    dropAccum = 0;
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= effectiveInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  powerUpPending = false;
  nextPowerAt = 10;
  frozenUntil = 0;
  energy = 0;
  holdPiece = null;
  slowUntil = 0;
  lastBoardState = null;
  lastCurrent = null;
  lastScore = 0;
  skillMenuOpen = false;
  next5Visible = false;
  pieceQueue = Array.from({ length: 4 }, randomPiece);
  next = randomPiece();
  spawn();
  updateHUD();
  drawHold();
  overlay.classList.add('hidden');
  skillMenu.classList.add('hidden');
  next5Overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (next5Visible) { hideNext5(); return; }

  if (skillMenuOpen) {
    if (e.code === 'Escape') { hideSkillMenu(); return; }
    const n = parseInt(e.key) - 1;
    if (n >= 0 && n <= 4) activateSkill(n);
    return;
  }

  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyQ') { showSkillMenu(); return; }
  if (paused || gameOver) return;

  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  themeToggle.blur();
});

applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);

init();

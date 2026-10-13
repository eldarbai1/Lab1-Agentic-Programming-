const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;
const LEVEL_WIDTH = 2400;

const GRAVITY = 0.6;
const MOVE_SPEED = 4;
const JUMP_SPEED = -12;

// Ground segments (with gaps), floating brick blocks, and a pipe.
const platforms = [
  { type: "ground", x: 0, y: 360, w: 800, h: 40 },
  { type: "ground", x: 880, y: 360, w: 700, h: 40 },
  { type: "ground", x: 1660, y: 360, w: 740, h: 40 },
  { type: "brick", x: 300, y: 260, w: 120, h: 20 },
  { type: "brick", x: 550, y: 200, w: 100, h: 20 },
  { type: "pipe", x: 650, y: 300, w: 50, h: 60 },
  { type: "brick", x: 1000, y: 250, w: 150, h: 20 },
  { type: "brick", x: 1300, y: 280, w: 100, h: 20 },
  { type: "brick", x: 1800, y: 240, w: 120, h: 20 },
];

const flag = { x: 2300, y: 110, w: 8, h: 250 };

// Difficulty levels, named by time complexity: more enemies (and faster) as it grows.
// bricks = how many enemies also patrol the floating brick platforms.
const LEVELS = [
  { name: "O(1)",       enemies: 1,  speed: 1,   bricks: 0 },
  { name: "O(log n)",   enemies: 3,  speed: 1,   bricks: 0 },
  { name: "O(n)",       enemies: 6,  speed: 1.2, bricks: 1 },
  { name: "O(n log n)", enemies: 10, speed: 1.4, bricks: 2 },
  { name: "O(n²)",      enemies: 16, speed: 1.7, bricks: 4 },
  { name: "O(2ⁿ)",      enemies: 24, speed: 2,   bricks: 5 },
];
let levelIndex = 2;

// Ground stretches where enemies may spawn (away from the start, gaps, pipe and flag).
const SPAWN_ZONES = [[250, 610], [900, 1540], [1690, 2250]];

function spawnGoombas(level) {
  const list = [];
  const bricks = platforms.filter(p => p.type === "brick").slice(0, level.bricks);
  for (const b of bricks) {
    list.push({ x: b.x + b.w / 2 - 16, y: b.y - 32, w: 32, h: 32, vx: level.speed, alive: true });
  }
  // Spread the rest evenly along the ground zones.
  const onGround = level.enemies - bricks.length;
  const total = SPAWN_ZONES.reduce((s, [a, b]) => s + (b - a), 0);
  for (let i = 0; i < onGround; i++) {
    let d = ((i + 0.5) / onGround) * total;
    for (const [a, b] of SPAWN_ZONES) {
      if (d <= b - a) {
        const dir = i % 2 === 0 ? -1 : 1;
        list.push({ x: a + d, y: 328, w: 32, h: 32, vx: dir * level.speed, alive: true });
        break;
      }
      d -= b - a;
    }
  }
  return list;
}

function setLevel(i) {
  levelIndex = Math.max(0, Math.min(i, LEVELS.length - 1));
  document.querySelectorAll("#levels button").forEach((btn, j) => {
    btn.classList.toggle("active", j === levelIndex);
  });
  reset();
}

// Background scenery: [x, y] positions, drawn with parallax.
const clouds = [[100, 60], [420, 100], [760, 50], [1100, 90], [1500, 60], [1850, 100]];
const hills = [[60, 70], [500, 50], [950, 80], [1400, 60], [1800, 70]];
const bushes = [[200], [980], [1450], [2000]];

// --- Pixel-art sprites (each char is one pixel, "." is transparent) ---
function makeSprite(rows, palette, scale) {
  const c = document.createElement("canvas");
  c.width = rows[0].length * scale;
  c.height = rows.length * scale;
  const g = c.getContext("2d");
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = palette[ch];
      g.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  return c;
}

const MARIO_PALETTE = { R: "#e52521", H: "#6b3a10", S: "#fcb878", B: "#2038ec", Y: "#ffd700" };
const MARIO_TOP = [
  "...RRRRR....",
  "..RRRRRRRRR.",
  "..HHHSSHS...",
  ".HSHSSSHSSS.",
  ".HSHHSSSHSSS",
  ".HHSSSSHHHH.",
  "...SSSSSSS..",
  "..RRBRRB....",
  ".RRRBRRBRRR.",
  "RRRRBBBBRRRR",
  "SSRBYBBYBRSS",
  "SSSBBBBBBSSS",
  "SSBBBBBBBBSS",
];
const marioStand = makeSprite([...MARIO_TOP, "..BBB..BBB..", ".HHH....HHH.", "HHHH....HHHH"], MARIO_PALETTE, 2);
const marioWalk = makeSprite([...MARIO_TOP, "..BBBBBBB...", "..HHH.BBB...", ".HHHH..HHH.."], MARIO_PALETTE, 2);
const marioJump = makeSprite([...MARIO_TOP, ".BBBB..BBBBH", "HHB......BHH", "HH.........."], MARIO_PALETTE, 2);

const goombaSprite = makeSprite([
  "......BBBB......",
  ".....BBBBBB.....",
  "....BBBBBBBB....",
  "...BBBBBBBBBB...",
  "..BKKBBBBBBKKB..",
  ".BBBWKBBBBKWBBB.",
  ".BBBWKKBBKKWBBB.",
  "BBBBWWBBBBWWBBBB",
  "BBBBBBBBBBBBBBBB",
  ".BBBBBBBBBBBBBB.",
  "...TTTTTTTTTT...",
  "..TTTTTTTTTTTT..",
  "..TTTTTTTTTTTT..",
  ".KKK.TTTTTT.KKK.",
  "KKKKK......KKKKK",
  "KKKKK......KKKKK",
], { B: "#a0522d", K: "#2b1700", W: "#fff", T: "#f0c890" }, 2);

let player, goombas, coins, score, state, frame;

function reset() {
  player = { x: 50, y: 300, w: 24, h: 32, vx: 0, vy: 0, onGround: false, facing: 1 };
  goombas = spawnGoombas(LEVELS[levelIndex]);
  coins = [
    { x: 360, y: 230 }, { x: 600, y: 170 }, { x: 1075, y: 220 },
    { x: 1350, y: 250 }, { x: 1860, y: 210 },
  ].map(c => ({ ...c, r: 8, taken: false }));
  score = 0;
  frame = 0;
  state = "playing"; // "playing" | "won" | "lost"
}

// --- Input ---
const keys = {};
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyR") reset();
  if (e.code === "KeyN" && state === "won") setLevel(levelIndex + 1);
  const digit = /^Digit([1-6])$/.exec(e.code);
  if (digit) setLevel(Number(digit[1]) - 1);
});

// Level picker buttons (built from LEVELS).
const levelBar = document.getElementById("levels");
LEVELS.forEach((lvl, i) => {
  const btn = document.createElement("button");
  btn.textContent = lvl.name;
  btn.title = `${lvl.enemies} enem${lvl.enemies === 1 ? "y" : "ies"} (key ${i + 1})`;
  btn.addEventListener("click", () => {
    setLevel(i);
    btn.blur(); // so Space jumps instead of re-clicking the button
  });
  levelBar.appendChild(btn);
});
window.addEventListener("keyup", e => { keys[e.code] = false; });

// --- Helpers ---
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isSolidAt(px, py) {
  return platforms.some(p => px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h);
}

// --- Update ---
function updatePlayer() {
  const left = keys.ArrowLeft || keys.KeyA;
  const right = keys.ArrowRight || keys.KeyD;
  const jump = keys.Space || keys.ArrowUp || keys.KeyW;

  player.vx = (right ? MOVE_SPEED : 0) - (left ? MOVE_SPEED : 0);
  if (player.vx !== 0) player.facing = Math.sign(player.vx);
  if (jump && player.onGround) player.vy = JUMP_SPEED;
  player.vy += GRAVITY;

  // Move on X, then resolve collisions.
  player.x += player.vx;
  for (const p of platforms) {
    if (overlaps(player, p)) {
      if (player.vx > 0) player.x = p.x - player.w;
      else if (player.vx < 0) player.x = p.x + p.w;
    }
  }
  player.x = Math.max(0, Math.min(player.x, LEVEL_WIDTH - player.w));

  // Move on Y, then resolve collisions.
  player.y += player.vy;
  player.onGround = false;
  for (const p of platforms) {
    if (overlaps(player, p)) {
      if (player.vy > 0) {
        player.y = p.y - player.h;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = p.y + p.h;
      }
      player.vy = 0;
    }
  }

  if (player.y > H) state = "lost";
}

function updateGoombas() {
  for (const g of goombas) {
    if (!g.alive) continue;

    // Turn around at walls or ledges.
    const frontX = g.vx > 0 ? g.x + g.w + 1 : g.x - 1;
    const hitsWall = isSolidAt(frontX, g.y + g.h / 2);
    const groundAhead = isSolidAt(frontX, g.y + g.h + 1);
    if (hitsWall || !groundAhead) g.vx = -g.vx;
    g.x += g.vx;

    if (overlaps(player, g)) {
      const wasAbove = player.y + player.h - player.vy <= g.y + 4;
      if (player.vy > 0 && wasAbove) {
        g.alive = false;
        player.vy = JUMP_SPEED / 1.5;
        score += 100;
      } else {
        state = "lost";
      }
    }
  }
}

function updateCoins() {
  for (const c of coins) {
    if (c.taken) continue;
    const box = { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
    if (overlaps(player, box)) {
      c.taken = true;
      score += 10;
    }
  }
}

function update() {
  frame++;
  if (state !== "playing") return;
  updatePlayer();
  updateGoombas();
  updateCoins();
  if (overlaps(player, flag)) state = "won";
}

// --- Draw: background ---
function drawCloud(x, y) {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.arc(x + 22, y - 10, 22, 0, Math.PI * 2);
  ctx.arc(x + 46, y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x, y, 46, 18);
}

function drawHill(x, height) {
  ctx.fillStyle = "#3aa83a";
  ctx.beginPath();
  ctx.ellipse(x + 80, 360, 80, height, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#1e7a1e";
  ctx.fillRect(x + 60, 360 - height + 25, 4, 10);
  ctx.fillRect(x + 96, 360 - height + 25, 4, 10);
}

function drawBush(x) {
  ctx.fillStyle = "#5cd65c";
  ctx.beginPath();
  ctx.arc(x, 360, 16, Math.PI, 0);
  ctx.arc(x + 20, 356, 20, Math.PI, 0);
  ctx.arc(x + 40, 360, 16, Math.PI, 0);
  ctx.fill();
}

function drawBackground(camX) {
  for (const [x, y] of clouds) drawCloud(x - camX * 0.3, y);
  for (const [x, h] of hills) drawHill(x - camX * 0.6, h);
}

// --- Draw: level ---
function drawGround(p) {
  ctx.fillStyle = "#c84c0c";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  for (let tx = p.x; tx < p.x + p.w; tx += 40) {
    ctx.strokeRect(tx + 1, p.y + 1, 38, 38);
    ctx.fillStyle = "#fcbcb0";
    ctx.fillRect(tx + 2, p.y + 2, 36, 3);
    ctx.fillRect(tx + 2, p.y + 2, 3, 36);
  }
}

function drawBrick(p) {
  ctx.fillStyle = "#c84c0c";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = "#000";
  ctx.fillRect(p.x, p.y + p.h / 2 - 1, p.w, 2);
  ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
  for (let bx = p.x; bx < p.x + p.w; bx += 20) {
    ctx.fillRect(bx, p.y, 2, p.h / 2);
    ctx.fillRect(bx + 10, p.y + p.h / 2, 2, p.h / 2);
  }
  ctx.fillStyle = "#fcbcb0";
  ctx.fillRect(p.x, p.y, p.w, 2);
}

function drawPipe(p) {
  const lip = 14;
  ctx.fillStyle = "#00a800";
  ctx.fillRect(p.x + 4, p.y + lip, p.w - 8, p.h - lip);
  ctx.fillRect(p.x, p.y, p.w, lip);
  ctx.fillStyle = "#80f080";
  ctx.fillRect(p.x + 10, p.y + lip, 5, p.h - lip);
  ctx.fillRect(p.x + 6, p.y + 2, 5, lip - 4);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x + 4, p.y + lip, p.w - 8, p.h - lip);
  ctx.strokeRect(p.x, p.y, p.w, lip);
}

function drawFlagAndCastle() {
  // Pole with a ball on top and a waving flag.
  ctx.fillStyle = "#9c9c9c";
  ctx.fillRect(flag.x + 2, flag.y, 4, flag.h);
  ctx.fillStyle = "#00a800";
  ctx.beginPath();
  ctx.arc(flag.x + 4, flag.y - 4, 6, 0, Math.PI * 2);
  ctx.fill();
  const wave = Math.sin(frame / 8) * 3;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(flag.x + 2, flag.y + 6);
  ctx.lineTo(flag.x - 36, flag.y + 20 + wave);
  ctx.lineTo(flag.x + 2, flag.y + 36);
  ctx.fill();
  ctx.fillStyle = "#00a800";
  ctx.beginPath();
  ctx.arc(flag.x - 10, flag.y + 21, 5, 0, Math.PI * 2);
  ctx.fill();

  // Small castle at the end.
  const cx = 2330, cy = 280;
  ctx.fillStyle = "#c84c0c";
  ctx.fillRect(cx, cy, 64, 80);
  for (let i = 0; i < 4; i++) ctx.fillRect(cx + i * 18, cy - 10, 10, 10);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(cx + 32, cy + 60, 12, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx + 20, cy + 60, 24, 20);
  ctx.fillRect(cx + 12, cy + 18, 8, 12);
  ctx.fillRect(cx + 44, cy + 18, 8, 12);
}

function drawCoin(c) {
  const squash = Math.abs(Math.cos(frame / 12 + c.x));
  const rx = Math.max(2, c.r * squash);
  ctx.fillStyle = "#ffd700";
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, c.r + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff8b0";
  ctx.fillRect(c.x - 1, c.y - c.r + 3, 2, c.r * 2 - 6);
}

function drawGoomba(g) {
  const flip = Math.floor(frame / 10) % 2 === 0;
  ctx.save();
  if (flip) {
    ctx.translate(g.x + g.w, g.y);
    ctx.scale(-1, 1);
    ctx.drawImage(goombaSprite, 0, 0);
  } else {
    ctx.drawImage(goombaSprite, g.x, g.y);
  }
  ctx.restore();
}

function drawPlayer() {
  let sprite = marioStand;
  if (!player.onGround) sprite = marioJump;
  else if (player.vx !== 0 && Math.floor(frame / 6) % 2 === 0) sprite = marioWalk;

  ctx.save();
  if (player.facing < 0) {
    ctx.translate(player.x + player.w, player.y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
  } else {
    ctx.drawImage(sprite, player.x, player.y);
  }
  ctx.restore();
}

function drawHUD() {
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "left";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#fff";
  ctx.strokeText("SCORE " + String(score).padStart(5, "0"), 12, 28);
  ctx.fillText("SCORE " + String(score).padStart(5, "0"), 12, 28);

  const level = LEVELS[levelIndex];
  const alive = goombas.filter(g => g.alive).length;
  const info = `LEVEL ${level.name}  ENEMIES ${alive}/${goombas.length}`;
  ctx.textAlign = "right";
  ctx.strokeText(info, W - 12, 28);
  ctx.fillText(info, W - 12, 28);

  if (state !== "playing") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 40px monospace";
    ctx.fillText(state === "won" ? "YOU WIN!" : "GAME OVER", W / 2, H / 2);
    ctx.font = "20px monospace";
    const hasNext = state === "won" && levelIndex < LEVELS.length - 1;
    ctx.fillText(hasNext ? `Press N for ${LEVELS[levelIndex + 1].name} · R to replay` : "Press R to restart",
      W / 2, H / 2 + 35);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  const camX = Math.max(0, Math.min(player.x - W / 2, LEVEL_WIDTH - W));
  drawBackground(camX);

  ctx.save();
  ctx.translate(-camX, 0);

  for (const [x] of bushes) drawBush(x);
  drawFlagAndCastle();
  for (const p of platforms) {
    if (p.type === "ground") drawGround(p);
    else if (p.type === "brick") drawBrick(p);
    else drawPipe(p);
  }
  for (const c of coins) if (!c.taken) drawCoin(c);
  for (const g of goombas) if (g.alive) drawGoomba(g);
  drawPlayer();

  ctx.restore();
  drawHUD();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

setLevel(levelIndex);
loop();

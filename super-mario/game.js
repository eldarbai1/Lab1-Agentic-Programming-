const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const LEVEL_WIDTH = 2400;

const GRAVITY = 0.6;
const MOVE_SPEED = 4;
const JUMP_SPEED = -12;

// Ground segments (with gaps), floating blocks, and a pipe.
const platforms = [
  { x: 0, y: 360, w: 800, h: 40 },
  { x: 880, y: 360, w: 700, h: 40 },
  { x: 1660, y: 360, w: 740, h: 40 },
  { x: 300, y: 260, w: 120, h: 20 },
  { x: 550, y: 200, w: 100, h: 20 },
  { x: 650, y: 300, w: 50, h: 60 },
  { x: 1000, y: 250, w: 150, h: 20 },
  { x: 1300, y: 280, w: 100, h: 20 },
  { x: 1800, y: 240, w: 120, h: 20 },
];

const flag = { x: 2300, y: 110, w: 8, h: 250 };

let player, goombas, coins, score, state;

function reset() {
  player = { x: 50, y: 300, w: 28, h: 36, vx: 0, vy: 0, onGround: false };
  goombas = [
    { x: 450, y: 330, w: 30, h: 30, vx: -1, alive: true },
    { x: 1200, y: 330, w: 30, h: 30, vx: -1, alive: true },
    { x: 1900, y: 330, w: 30, h: 30, vx: 1, alive: true },
  ];
  coins = [
    { x: 360, y: 230 }, { x: 600, y: 170 }, { x: 1075, y: 220 },
    { x: 1350, y: 250 }, { x: 1860, y: 210 },
  ].map(c => ({ ...c, r: 8, taken: false }));
  score = 0;
  state = "playing"; // "playing" | "won" | "lost"
}

// --- Input ---
const keys = {};
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyR") reset();
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
  if (state !== "playing") return;
  updatePlayer();
  updateGoombas();
  updateCoins();
  if (overlaps(player, flag)) state = "won";
}

// --- Draw ---
function draw() {
  ctx.clearRect(0, 0, W, H);

  const camX = Math.max(0, Math.min(player.x - W / 2, LEVEL_WIDTH - W));
  ctx.save();
  ctx.translate(-camX, 0);

  ctx.fillStyle = "#c84c0c";
  for (const p of platforms) ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.fillStyle = "#fff";
  ctx.fillRect(flag.x, flag.y, flag.w, flag.h);
  ctx.fillStyle = "#0a0";
  ctx.beginPath();
  ctx.moveTo(flag.x, flag.y);
  ctx.lineTo(flag.x - 40, flag.y + 20);
  ctx.lineTo(flag.x, flag.y + 40);
  ctx.fill();

  ctx.fillStyle = "#ffd700";
  for (const c of coins) {
    if (c.taken) continue;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#8b4513";
  for (const g of goombas) if (g.alive) ctx.fillRect(g.x, g.y, g.w, g.h);

  ctx.fillStyle = "#e52521";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Score: " + score, 10, 25);

  if (state !== "playing") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "40px sans-serif";
    ctx.fillText(state === "won" ? "You Win!" : "Game Over", W / 2, H / 2);
    ctx.font = "20px sans-serif";
    ctx.fillText("Press R to restart", W / 2, H / 2 + 35);
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

reset();
loop();

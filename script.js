/**
 * NEON SNAKE MULTIPLAYER - Client Logic
 */

const socket = io();

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const scoreElement = document.getElementById("current-score");
const highScoreElement = document.getElementById("high-score");
const killElement = document.getElementById("kill-count");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayMsg = document.getElementById("overlay-msg");
const startBtn = document.getElementById("start-btn");
const leaderboardList = document.getElementById("leaderboard-list");
const killFeed = document.getElementById("kill-feed");

const joinScreen = document.getElementById("join-screen");
const joinBtn = document.getElementById("join-btn");
const usernameInput = document.getElementById("username-input");
const passwordInput = document.getElementById("password-input");
const joinError = document.getElementById("join-error");
const gameMain = document.getElementById("game-main");

const GRID_SIZE = 15;
let myId = null;
let myColor = null;
let gameState = null;
let isRespawning = false;
let respawnTimer = null;
let particles = [];
let previousFoods = [];
let previousAliveStates = {};
let cameraOffsetX = 0;
let cameraOffsetY = 0;
let renderGridSize = 20;

// Initialize Canvas
function resizeCanvas() {
  const wrapper = document.querySelector(".canvas-wrapper");
  if (!wrapper) return;
  
  // Use a small delay to ensure clientWidth/Height are updated
  setTimeout(() => {
    canvas.width = wrapper.clientWidth - 10;
    canvas.height = wrapper.clientHeight - 10;
    
    if (gameState) draw();
  }, 50);
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

// Load persistent credentials
const savedName = localStorage.getItem("snakeNickname");
const savedPass = localStorage.getItem("snakePassword");
if (savedName) usernameInput.value = savedName;
if (savedPass) passwordInput.value = savedPass;

joinBtn.addEventListener("click", joinGame);
[usernameInput, passwordInput].forEach((el) => {
  el.addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinGame();
  });
});

function joinGame() {
  const nickname = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!nickname || !password) {
    showError("Both nickname and password are required.");
    return;
  }

  localStorage.setItem("snakeNickname", nickname);
  localStorage.setItem("snakePassword", password);
  socket.emit("join", { nickname, password });
}

function showError(msg) {
  joinError.textContent = msg;
  joinError.classList.remove("hidden");
}

socket.on("authError", (msg) => {
  showError(msg);
});

socket.on("joined", ({ id, color }) => {
  myId = id;
  myColor = color;
  joinScreen.classList.add("hidden");
  gameMain.classList.remove("hidden");
  joinError.classList.add("hidden");
  resizeCanvas();
});

socket.on("killEvent", ({ killer, victim, color }) => {
  const msg = document.createElement("div");
  msg.className = "kill-msg";
  msg.style.borderLeftColor = color;
  msg.innerHTML = `
        <span class="killer-name" style="color: ${color}">${killer}</span>
        <span>⚔️</span>
        <span class="victim-name">${victim}</span>
    `;
  killFeed.appendChild(msg);
  setTimeout(() => msg.remove(), 5000);
});

socket.on("gameUpdate", (state) => {
  gameState = state;
  if (canvas.width === 0) resizeCanvas(state.mapSize);

  const me = state.players[myId];
  if (me) {
    scoreElement.textContent = String(Math.floor(me.score)).padStart(3, "0");
    killElement.textContent = me.kills;

    if (!me.alive) {
      overlayTitle.textContent = "WASTED";
      overlayMsg.textContent = `KILLS: ${me.kills} | SCORE: ${Math.floor(me.score)}`;

      if (!isRespawning) {
        startAutoRespawn();
      }
      overlay.classList.remove("hidden");
    } else {
      isRespawning = false;
      if (respawnTimer) clearInterval(respawnTimer);
      overlay.classList.add("hidden");
    }
  }

    highScoreElement.textContent = `${String(Math.floor(state.globalHighScore)).padStart(3, '0')} (${state.globalHighScoreName})`;
    
    // Effect Detection
    detectEffects(state);
    
    updateLeaderboard();
});

// Particle Animation Loop
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(); // Draw game state
    
    // Update and Draw Particles
    ctx.save();
    ctx.translate(cameraOffsetX, cameraOffsetY);
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.update();
        p.draw(ctx);
    });
    ctx.restore();
    
    requestAnimationFrame(animate);
}
animate();

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 3 + 2;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.02;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
        this.size *= 0.95;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function detectEffects(state) {
    // renderGridSize is managed globally by draw()

    // Food Eaten Detection
    if (previousFoods.length > 0) {
        previousFoods.forEach(prevFood => {
            const isStillThere = state.foods.some(f => f.x === prevFood.x && f.y === prevFood.y);
            if (!isStillThere) {
                createExplosion(
                    prevFood.x * renderGridSize + renderGridSize / 2,
                    prevFood.y * renderGridSize + renderGridSize / 2,
                    '#fff'
                );
            }
        });
    }
    previousFoods = [...state.foods];

    // Player Death Detection
    Object.values(state.players).forEach(p => {
        if (previousAliveStates[p.id] === true && p.alive === false) {
            const head = p.snake[0];
            createExplosion(
                head.x * renderGridSize + renderGridSize / 2,
                head.y * renderGridSize + renderGridSize / 2,
                p.color,
                30
            );
        }
        previousAliveStates[p.id] = p.alive;
    });
}

function startAutoRespawn() {
  isRespawning = true;
  let secondsLeft = 2;
  startBtn.textContent = `RESPAWNING IN ${secondsLeft}...`;

  respawnTimer = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      startBtn.textContent = `RESPAWNING IN ${secondsLeft}...`;
    } else {
      clearInterval(respawnTimer);
      socket.emit("restart");
    }
  }, 1000);
}

function updateLeaderboard() {
  if (!gameState) return;

  const players = Object.values(gameState.players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  leaderboardList.innerHTML = players
    .map(
      (p) => `
        <li class="leader-item ${p.id === myId ? "me" : ""}" style="color: ${p.id === myId ? "#fff" : p.color}">
            <span class="leader-name">${p.nickname}</span>
            <div class="leader-stats-values">
                <span>${p.kills}</span>
                <span>${p.foodEaten}</span>
                <span>${Math.floor(p.score)}</span>
            </div>
        </li>
    `,
    )
    .join("");
}

function draw() {
  if (!gameState) return;

  // Determine grid size based on viewport - we want to show ~25 tiles across the smallest dimension
  renderGridSize = Math.max(15, Math.min(canvas.width, canvas.height) / 25);

  // Calculate Target Camera Offset to center on player
  const me = gameState.players[myId];
  let targetOffsetX, targetOffsetY;

  if (me && me.alive) {
      const head = me.snake[0];
      targetOffsetX = canvas.width / 2 - (head.x * renderGridSize + renderGridSize / 2);
      targetOffsetY = canvas.height / 2 - (head.y * renderGridSize + renderGridSize / 2);
  } else {
      // Center of map if dead or spectating
      targetOffsetX = canvas.width / 2 - (gameState.mapSize * renderGridSize) / 2;
      targetOffsetY = canvas.height / 2 - (gameState.mapSize * renderGridSize) / 2;
  }

  // Smooth Camera Lerp
  cameraOffsetX += (targetOffsetX - cameraOffsetX) * 0.1;
  cameraOffsetY += (targetOffsetY - cameraOffsetY) * 0.1;

  ctx.save();
  ctx.translate(cameraOffsetX, cameraOffsetY);

  const worldSize = gameState.mapSize * renderGridSize;

  // Draw Grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= worldSize; i += renderGridSize) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, worldSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(worldSize, i);
    ctx.stroke();
  }

  // Draw World Border
  ctx.strokeStyle = "rgba(0, 242, 255, 0.2)";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, worldSize, worldSize);

  // Draw Food (Multiple)
  if (gameState.foods) {
    gameState.foods.forEach((food) => {
      ctx.shadowBlur = 10;
      ctx.shadowColor = "white";
      ctx.font = `${renderGridSize * 0.8}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        food.emoji,
        food.x * renderGridSize + renderGridSize / 2,
        food.y * renderGridSize + renderGridSize / 2,
      );
    });
  }

  // Draw Obstacles
  gameState.obstacles.forEach((obs) => {
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff8800";
    ctx.fillStyle = "#ff8800";
    ctx.beginPath();
    ctx.roundRect(
      obs.x * renderGridSize + 1,
      obs.y * renderGridSize + 1,
      renderGridSize - 2,
      renderGridSize - 2,
      2,
    );
    ctx.fill();
  });

  // Draw Players
  Object.values(gameState.players).forEach((player) => {
    if (!player.alive) return;

    player.snake.forEach((segment, index) => {
      const isHead = index === 0;
      const isMe = player.id === myId;

      ctx.shadowBlur = isHead ? (player.isBoosting ? 20 : 10) : 0;
      ctx.shadowColor = player.color;
      ctx.fillStyle = isHead ? player.color : `${player.color}99`;

      ctx.beginPath();
      ctx.roundRect(
        segment.x * renderGridSize + 1,
        segment.y * renderGridSize + 1,
        renderGridSize - 2,
        renderGridSize - 2,
        2,
      );
      ctx.fill();

      if (isHead) {
        ctx.fillStyle = "white";
        const eyeSize = renderGridSize / 5;
        ctx.fillRect(
          segment.x * renderGridSize + renderGridSize / 2 - eyeSize / 2,
          segment.y * renderGridSize + renderGridSize / 2 - eyeSize / 2,
          eyeSize,
          eyeSize,
        );

        ctx.shadowBlur = 4;
        ctx.shadowColor = "black";
        ctx.fillStyle = isMe ? "#fff" : "rgba(255, 255, 255, 0.7)";
        ctx.font = `600 ${Math.max(10, renderGridSize * 0.6)}px Outfit`;
        ctx.textAlign = "center";
        ctx.fillText(
          player.nickname,
          segment.x * renderGridSize + renderGridSize / 2,
          segment.y * renderGridSize - 8,
        );

        // Boost effect
        if (player.isBoosting) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(
            segment.x * renderGridSize + renderGridSize / 2,
            segment.y * renderGridSize + renderGridSize / 2,
            renderGridSize,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

            if (isHead && isMe) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });
    });

    ctx.restore();

    // Draw Minimap
    // Make minimap smaller on mobile (max 80px) and a bit larger on desktop (max 120px)
    const maxMinimapSize = canvas.width < 500 ? 75 : 120;
    const minimapSize = Math.min(maxMinimapSize, canvas.width / 4);
    const minimapPadding = 10;
    const minimapX = canvas.width - minimapSize - minimapPadding;
    const minimapY = minimapPadding;
    const scale = minimapSize / gameState.mapSize;

    // Minimap Background
    ctx.fillStyle = "rgba(10, 10, 12, 0.8)";
    ctx.strokeStyle = "rgba(0, 242, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
    ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

    // Minimap Foods
    ctx.fillStyle = "#ff007a";
    if (gameState.foods) {
        gameState.foods.forEach(f => {
            ctx.fillRect(minimapX + f.x * scale, minimapY + f.y * scale, scale, scale);
        });
    }

    // Minimap Obstacles
    ctx.fillStyle = "#ff8800";
    if (gameState.obstacles) {
        gameState.obstacles.forEach(o => {
            ctx.fillRect(minimapX + o.x * scale, minimapY + o.y * scale, scale, scale);
        });
    }

    // Minimap Players
    Object.values(gameState.players).forEach(p => {
        if (!p.alive) return;
        ctx.fillStyle = p.id === myId ? "#fff" : p.color;
        p.snake.forEach(segment => {
            ctx.fillRect(minimapX + segment.x * scale, minimapY + segment.y * scale, scale, scale);
        });
    });
}

// Mobile Control Event Listeners
const ctrlUp = document.getElementById("ctrl-up");
const ctrlDown = document.getElementById("ctrl-down");
const ctrlLeft = document.getElementById("ctrl-left");
const ctrlRight = document.getElementById("ctrl-right");
const ctrlBoost = document.getElementById("ctrl-boost");

const setDirection = (dir) => socket.emit("direction", dir);

ctrlUp.addEventListener("touchstart", (e) => { e.preventDefault(); setDirection("up"); });
ctrlDown.addEventListener("touchstart", (e) => { e.preventDefault(); setDirection("down"); });
ctrlLeft.addEventListener("touchstart", (e) => { e.preventDefault(); setDirection("left"); });
ctrlRight.addEventListener("touchstart", (e) => { e.preventDefault(); setDirection("right"); });

// Alternative mouse support for testing on desktop
ctrlUp.addEventListener("mousedown", () => setDirection("up"));
ctrlDown.addEventListener("mousedown", () => setDirection("down"));
ctrlLeft.addEventListener("mousedown", () => setDirection("left"));
ctrlRight.addEventListener("mousedown", () => setDirection("right"));

const setBoost = (active) => socket.emit("boost", active);

ctrlBoost.addEventListener("touchstart", (e) => { e.preventDefault(); setBoost(true); });
ctrlBoost.addEventListener("touchend", (e) => { e.preventDefault(); setBoost(false); });
ctrlBoost.addEventListener("mousedown", () => setBoost(true));
ctrlBoost.addEventListener("mouseup", () => setBoost(false));

// Swipe Detection
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    e.preventDefault(); // Prevent scrolling while playing
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    
    if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 30) {
            setDirection(dx > 0 ? "right" : "left");
        }
    } else {
        if (Math.abs(dy) > 30) {
            setDirection(dy > 0 ? "down" : "up");
        }
    }
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.key === "Shift") socket.emit("boost", true);

  let dir = null;
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      dir = "up";
      break;
    case "ArrowDown":
    case "s":
    case "S":
      dir = "down";
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      dir = "left";
      break;
    case "ArrowRight":
    case "d":
    case "D":
      dir = "right";
      break;
    case " ":
      const me = gameState?.players[myId];
      if (me && !me.alive) socket.emit("restart");
      break;
  }
  if (dir) socket.emit("direction", dir);
});

window.addEventListener("keyup", (e) => {
  if (e.key === "Shift") socket.emit("boost", false);
});

startBtn.addEventListener("click", () => {
  if (respawnTimer) clearInterval(respawnTimer);
  socket.emit("restart");
  overlay.classList.add("hidden");
});


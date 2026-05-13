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

// Initialize Canvas
function resizeCanvas() {
  const wrapper = document.querySelector(".canvas-wrapper");
  if (!wrapper) return;
  
  setTimeout(() => {
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
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
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.update();
        p.draw(ctx);
    });
    
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
    // Food Eaten Detection
    if (previousFoods.length > 0) {
        previousFoods.forEach(prevFood => {
            const isStillThere = state.foods.some(f => f.id === prevFood.id);
            if (!isStillThere) {
                createExplosion(prevFood.x, prevFood.y, '#fff');
            }
        });
    }
    previousFoods = [...state.foods];

    // Player Death Detection
    Object.values(state.players).forEach(p => {
        if (previousAliveStates[p.id] === true && p.alive === false) {
            const head = (p.segments && p.segments.length > 0) ? p.segments[0] : {x: p.x, y: p.y};
            createExplosion(head.x, head.y, p.color, 30);
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

// Camera state
let cameraX = 0;
let cameraY = 0;

function draw() {
    if (!gameState) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const me = gameState.players[myId];
    if (me && me.alive) {
        // Smooth camera follow
        cameraX = me.x - canvas.width / 2;
        cameraY = me.y - canvas.height / 2;
    }

    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    // Draw Grid background
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 50;
    const startX = Math.floor(cameraX / gridSize) * gridSize;
    const startY = Math.floor(cameraY / gridSize) * gridSize;
    
    ctx.beginPath();
    for (let x = startX; x < cameraX + canvas.width; x += gridSize) {
        if (x >= 0 && x <= gameState.mapSize) {
            ctx.moveTo(x, Math.max(0, cameraY));
            ctx.lineTo(x, Math.min(gameState.mapSize, cameraY + canvas.height));
        }
    }
    for (let y = startY; y < cameraY + canvas.height; y += gridSize) {
        if (y >= 0 && y <= gameState.mapSize) {
            ctx.moveTo(Math.max(0, cameraX), y);
            ctx.lineTo(Math.min(gameState.mapSize, cameraX + canvas.width), y);
        }
    }
    ctx.stroke();

    // Map Border
    ctx.strokeStyle = "rgba(0, 242, 255, 0.3)";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, gameState.mapSize, gameState.mapSize);

    // Draw Food
    gameState.foods.forEach((food) => {
        // Only draw if visible on screen
        if (food.x > cameraX - 50 && food.x < cameraX + canvas.width + 50 &&
            food.y > cameraY - 50 && food.y < cameraY + canvas.height + 50) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = "white";
            ctx.font = `20px serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(food.emoji, food.x, food.y);
        }
    });

    // Draw Obstacles
    gameState.obstacles.forEach((obs) => {
        if (obs.x > cameraX - 50 && obs.x < cameraX + canvas.width + 50 &&
            obs.y > cameraY - 50 && obs.y < cameraY + canvas.height + 50) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ff8800";
            ctx.fillStyle = "#ff8800";
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, 40, 40, 5); // 40 is OBSTACLE_SIZE
            ctx.fill();
        }
    });

    // Draw Players
    Object.values(gameState.players).forEach((player) => {
        if (!player.alive || !player.segments) return;
        
        // Draw segments in reverse so head is on top
        for (let i = player.segments.length - 1; i >= 0; i--) {
            const segment = player.segments[i];
            
            // Frustum culling
            if (segment.x < cameraX - 50 || segment.x > cameraX + canvas.width + 50 ||
                segment.y < cameraY - 50 || segment.y > cameraY + canvas.height + 50) {
                continue;
            }

            const isHead = i === 0;
            const isMe = player.id === myId;
            
            ctx.shadowBlur = isHead ? (player.isBoosting ? 20 : 10) : 0;
            ctx.shadowColor = player.color;
            ctx.fillStyle = isHead ? player.color : `${player.color}99`;

            ctx.beginPath();
            ctx.arc(segment.x, segment.y, 15, 0, Math.PI * 2); // 15 is SNAKE_RADIUS
            ctx.fill();

            if (isHead) {
                // Draw Eyes
                ctx.fillStyle = "white";
                const eyeOffset = 8;
                const eyeAngle1 = player.angle - Math.PI / 4;
                const eyeAngle2 = player.angle + Math.PI / 4;
                
                ctx.beginPath();
                ctx.arc(segment.x + Math.cos(eyeAngle1) * eyeOffset, segment.y + Math.sin(eyeAngle1) * eyeOffset, 3, 0, Math.PI * 2);
                ctx.arc(segment.x + Math.cos(eyeAngle2) * eyeOffset, segment.y + Math.sin(eyeAngle2) * eyeOffset, 3, 0, Math.PI * 2);
                ctx.fill();

                // Draw Name
                ctx.shadowBlur = 4;
                ctx.shadowColor = "black";
                ctx.fillStyle = isMe ? "#fff" : "rgba(255, 255, 255, 0.7)";
                ctx.font = `600 14px Outfit`;
                ctx.textAlign = "center";
                ctx.fillText(player.nickname, segment.x, segment.y - 25);

                // Boost effect
                if (player.isBoosting) {
                    ctx.strokeStyle = "#fff";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(segment.x, segment.y, 20, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
    });

    // Draw Virtual Joystick
    if (joystickActive) {
        ctx.beginPath();
        ctx.arc(joystickBaseX + cameraX, joystickBaseY + cameraY, 50, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        const me = gameState.players[myId];
        const angle = me ? me.targetAngle : 0;
        ctx.arc(joystickBaseX + cameraX + Math.cos(angle) * 30, joystickBaseY + cameraY + Math.sin(angle) * 30, 20, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 242, 255, 0.5)";
        ctx.fill();
    }

    ctx.restore();
}

// --- Smooth Movement Input ---
let joystickActive = false;
let joystickBaseX = 0;
let joystickBaseY = 0;

// Mouse Tracking (Desktop)
canvas.addEventListener('mousemove', (e) => {
    if (joystickActive) return; // Ignore if using touch
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Angle is relative to center of screen (player head)
    const dx = mouseX - canvas.width / 2;
    const dy = mouseY - canvas.height / 2;
    socket.emit("targetAngle", Math.atan2(dy, dx));
});

// Floating Touch Joystick (Mobile)
canvas.addEventListener('touchstart', (e) => {
    // Only capture if touch is on left half of screen to leave right for boost
    if (e.touches[0].clientX < window.innerWidth / 2) {
        e.preventDefault();
        joystickActive = true;
        const rect = canvas.getBoundingClientRect();
        joystickBaseX = e.touches[0].clientX - rect.left;
        joystickBaseY = e.touches[0].clientY - rect.top;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
    if (!joystickActive) return;
    
    // Find the touch that started the joystick
    let touch = null;
    for(let i=0; i<e.touches.length; i++){
        if (e.touches[i].clientX < window.innerWidth / 2 || e.touches.length === 1) {
            touch = e.touches[i];
            break;
        }
    }
    if (!touch) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;
    
    const dx = currentX - joystickBaseX;
    const dy = currentY - joystickBaseY;
    
    if (Math.hypot(dx, dy) > 10) { 
        socket.emit("targetAngle", Math.atan2(dy, dx));
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    // Check if joystick touch ended
    let hasLeftTouch = false;
    for(let i=0; i<e.touches.length; i++){
        if (e.touches[i].clientX < window.innerWidth / 2) {
            hasLeftTouch = true;
        }
    }
    if (!hasLeftTouch) {
        joystickActive = false;
    }
}, { passive: false });

const setBoost = (active) => socket.emit("boost", active);

// Boost button for mobile
const ctrlBoost = document.getElementById("ctrl-boost");
if (ctrlBoost) {
    ctrlBoost.addEventListener("touchstart", (e) => { e.preventDefault(); setBoost(true); });
    ctrlBoost.addEventListener("touchend", (e) => { e.preventDefault(); setBoost(false); });
    ctrlBoost.addEventListener("mousedown", () => setBoost(true));
    ctrlBoost.addEventListener("mouseup", () => setBoost(false));
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Shift" || e.key === " ") socket.emit("boost", true);
  
  if (e.key === "Enter") {
      const me = gameState?.players[myId];
      if (me && !me.alive) socket.emit("restart");
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key === "Shift" || e.key === " ") socket.emit("boost", false);
});

startBtn.addEventListener("click", () => {
  if (respawnTimer) clearInterval(respawnTimer);
  socket.emit("restart");
  overlay.classList.add("hidden");
});


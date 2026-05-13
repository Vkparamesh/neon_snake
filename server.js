const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Game Constants
const MAP_SIZE = 2500; // Large continuous map
const TICK_RATE = 30; // ~33 fps for smooth server updates
const SNAKE_SPEED = 6;
const BOOST_SPEED = 11;
const SNAKE_RADIUS = 15;
const SEGMENT_SPACING = 15; // Distance between body segments
const FOOD_RADIUS = 12;
const OBSTACLE_SIZE = 40;
const MAX_FOOD = 50;
const OBSTACLE_COUNT = 30;
const TURN_SPEED = 0.15; // Radians per tick

// Game State
let players = {};
let users = {}; // { username: password }
let foods = []; 
let obstacles = [];
let globalHighScore = 0;
let globalHighScoreName = "None";

const FOOD_EMOJIS = [
  "🍎", "🍏", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", 
  "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", 
  "🥦", "🥬", "🥒", "🌽", "🥕", "🫒", "🧄", "🧅", "🍄", "🥜", 
  "🧀", "🍖", "🍗", "🥩", "🥓", "🍔", "🍟", "🍕", "🌭", "🥪", 
  "🌮", "🌯", "🥗", "🥘", "🍩", "🍪", "🎂", "🍰", "🧁", "🍭"
];

function spawnFood() {
  const newFood = {
    id: Math.random().toString(36).substring(2, 9),
    x: Math.floor(Math.random() * MAP_SIZE),
    y: Math.floor(Math.random() * MAP_SIZE),
    emoji: FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)],
  };
  foods.push(newFood);
}

function initFoods() {
  foods = [];
  for (let i = 0; i < MAX_FOOD; i++) {
    spawnFood();
  }
}

function generateObstacles() {
  obstacles = [];
  while (obstacles.length < OBSTACLE_COUNT) {
    const obs = {
      x: Math.floor(Math.random() * MAP_SIZE),
      y: Math.floor(Math.random() * MAP_SIZE),
    };
    obstacles.push(obs);
  }
}

generateObstacles();
initFoods();

function getColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 90%, 60%)`;
}

// Distance helper
function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

io.on("connection", (socket) => {
  console.log(`Connection attempt: ${socket.id}`);

  socket.on("join", ({ nickname, password }) => {
    const name = nickname || "Anonymous";

    if (users[name] && users[name] !== password) {
      socket.emit("authError", "Incorrect password for this nickname.");
      return;
    }
    if (!users[name]) {
      users[name] = password;
    }

    const startX = Math.random() * MAP_SIZE;
    const startY = Math.random() * MAP_SIZE;
    
    players[socket.id] = {
      id: socket.id,
      nickname: name,
      x: startX,
      y: startY,
      angle: 0,
      targetAngle: 0,
      history: [{x: startX, y: startY}], // path history for segments
      segments: [{x: startX, y: startY}], // computed body parts
      color: getColorFromName(name),
      score: 10,
      kills: 0,
      foodEaten: 0,
      isBoosting: false,
      alive: true,
    };
    socket.emit("joined", { id: socket.id, color: players[socket.id].color });
  });

  socket.on("targetAngle", (angle) => {
    const p = players[socket.id];
    if (p && p.alive) {
      p.targetAngle = angle;
    }
  });

  socket.on("boost", (boosting) => {
    const p = players[socket.id];
    if (p && p.alive && p.score > 20) {
      p.isBoosting = boosting;
    } else if (p) {
      p.isBoosting = false;
    }
  });

  socket.on("restart", () => {
    const p = players[socket.id];
    if (p) {
      const startX = Math.random() * MAP_SIZE;
      const startY = Math.random() * MAP_SIZE;
      p.x = startX;
      p.y = startY;
      p.angle = 0;
      p.targetAngle = 0;
      p.history = [{x: startX, y: startY}];
      p.segments = [{x: startX, y: startY}];
      p.score = 10;
      p.alive = true;
      p.isBoosting = false;
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
  });
});

// Game Loop
setInterval(() => {
  const playerIds = Object.keys(players);

  playerIds.forEach((id) => {
    const p = players[id];
    if (!p.alive) return;

    // Smooth Turn Logic (Interpolate angle towards targetAngle)
    let angleDiff = p.targetAngle - p.angle;
    // Normalize difference to -PI to PI
    while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    
    if (Math.abs(angleDiff) < TURN_SPEED) {
        p.angle = p.targetAngle;
    } else {
        p.angle += Math.sign(angleDiff) * TURN_SPEED;
    }

    // Boost Logic
    let speed = p.isBoosting ? BOOST_SPEED : SNAKE_SPEED;
    if (p.isBoosting && p.score < 15) {
      speed = SNAKE_SPEED;
      p.isBoosting = false;
    }

    // Move Head
    p.x += Math.cos(p.angle) * speed;
    p.y += Math.sin(p.angle) * speed;

    // Map Wrapping
    if (p.x < 0) p.x += MAP_SIZE;
    if (p.x >= MAP_SIZE) p.x -= MAP_SIZE;
    if (p.y < 0) p.y += MAP_SIZE;
    if (p.y >= MAP_SIZE) p.y -= MAP_SIZE;

    // Record History
    p.history.unshift({ x: p.x, y: p.y });

    // Calculate Segments based on score (length)
    const targetLength = Math.max(1, Math.floor(p.score / 10));
    p.segments = [];
    
    let historyIdx = 0;
    for (let i = 0; i < targetLength; i++) {
        // Find a point in history that is SEGMENT_SPACING away from previous
        if (i === 0) {
            p.segments.push({x: p.x, y: p.y});
        } else {
            let prevSeg = p.segments[i-1];
            let found = false;
            // Scan history to find the right distance
            while(historyIdx < p.history.length) {
                let hPos = p.history[historyIdx];
                let dist = getDistance(prevSeg.x, prevSeg.y, hPos.x, hPos.y);
                if (dist >= SEGMENT_SPACING) {
                    p.segments.push({x: hPos.x, y: hPos.y});
                    found = true;
                    break;
                }
                historyIdx++;
            }
            if (!found && p.history.length > 0) {
                // Not enough history yet, just stack it at the last known position
                const last = p.history[p.history.length - 1];
                p.segments.push({x: last.x, y: last.y});
            }
        }
    }

    // Truncate history to save memory (only keep what's needed for max length)
    const maxHistoryNeeded = targetLength * (SEGMENT_SPACING / SNAKE_SPEED) * 2;
    if (p.history.length > maxHistoryNeeded) {
        p.history.length = Math.floor(maxHistoryNeeded);
    }

    // Cost of boosting
    if (p.isBoosting) {
      p.score = Math.max(10, p.score - 0.2); // Smooth drain
    }

    // Obstacle Collision
    for (let obs of obstacles) {
        // Obstacles are squares, simple distance approximation is fine
        if (getDistance(p.x, p.y, obs.x + OBSTACLE_SIZE/2, obs.y + OBSTACLE_SIZE/2) < SNAKE_RADIUS + OBSTACLE_SIZE/2) {
            p.alive = false;
            break;
        }
    }

    // Player vs Player Collision
    if (p.alive) {
        let hitPlayer = false;
        playerIds.forEach((otherId) => {
            const otherP = players[otherId];
            if (!otherP.alive || hitPlayer) return;

            // Check against other player's segments
            for (let idx = 0; idx < otherP.segments.length; idx++) {
                if (id === otherId && idx < 3) continue; // Don't collide with own immediate neck
                
                const segment = otherP.segments[idx];
                if (getDistance(p.x, p.y, segment.x, segment.y) < SNAKE_RADIUS * 1.8) {
                    p.alive = false;
                    hitPlayer = true;
                    if (id !== otherId) {
                        otherP.kills++;
                        otherP.score += p.score * 0.5; // Gain 50% of victim's mass
                        io.emit("killEvent", {
                            killer: otherP.nickname,
                            victim: p.nickname,
                            color: otherP.color,
                        });
                    }
                    break;
                }
            }
        });
    }

    // Food Collision
    if (p.alive) {
        for (let i = foods.length - 1; i >= 0; i--) {
            const f = foods[i];
            if (getDistance(p.x, p.y, f.x, f.y) < SNAKE_RADIUS + FOOD_RADIUS) {
                p.score += 15;
                p.foodEaten++;
                foods.splice(i, 1);
                spawnFood();
            }
        }
    }

    // Update Global High Score
    if (p.score > globalHighScore) {
      globalHighScore = p.score;
      globalHighScoreName = p.nickname;
    }
  });

  // Broadcast state
  io.emit("gameUpdate", {
    players,
    foods,
    obstacles,
    mapSize: MAP_SIZE,
    globalHighScore,
    globalHighScoreName,
  });
}, TICK_RATE);

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

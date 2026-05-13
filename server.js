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
const GRID_SIZE = 20;
const MAP_SIZE = 50; // Larger map for better "worm.io" experience
const TICK_RATE = 130; // Slightly slower for better control

// Game State
let players = {};
let users = {}; // { username: password }
let foods = []; // Array of food items
const MAX_FOOD = 3;
let obstacles = [];
let globalHighScore = 0;
let globalHighScoreName = "None";
const OBSTACLE_COUNT = 25;
const FOOD_EMOJIS = [
  "🍎",
  "🍏",
  "🍐",
  "🍊",
  "🍋",
  "🍌",
  "🍉",
  "🍇",
  "🍓",
  "🫐",
  "🍈",
  "🍒",
  "🍑",
  "🥭",
  "🍍",
  "🥥",
  "🥝",
  "🍅",
  "🍆",
  "🥑",
  "🥦",
  "🥬",
  "🥒",
  "🌽",
  "🥕",
  "🫒",
  "🧄",
  "🧅",
  "🍄",
  "🥜",
  "🫘",
  "🌰",
  "🍞",
  "🥐",
  "🥖",
  "🫓",
  "🥨",
  "🥯",
  "🥞",
  "🧇",
  "🧀",
  "🍖",
  "🍗",
  "🥩",
  "🥓",
  "🍔",
  "🍟",
  "🍕",
  "🌭",
  "🥪",
  "🌮",
  "🌯",
  "🫔",
  "🥗",
  "🥘",
  "🫕",
  "🥣",
  "🍝",
  "🍜",
  "🍲",
  "🍛",
  "🍣",
  "🍱",
  "🥟",
  "🍤",
  "🍙",
  "🍚",
  "🍘",
  "🍥",
  "🥠",
  "🥮",
  "🍢",
  "🍡",
  "🍧",
  "🍨",
  "🍦",
  "🥧",
  "🧁",
  "🍰",
  "🎂",
  "🍮",
  "🍭",
  "🍬",
  "🍫",
  "🍿",
  "🍩",
  "🍪",
  "🌰",
  "🥜",
  "🍯",
  "🥛",
  "🍼",
  "☕",
  "🍵",
  "🧃",
  "🥤",
  "🧋",
  "🍶",
  "🍺",
  "🍻",
  "🥂",
  "🍷",
  "🥃",
  "🍸",
  "🍹",
  "🧉",
  "🍾",
  "🧊",
  "🥄",
  "🍴",
  "🍽️",
  "🥣",
  "🥡",
  "🥢",
  "🧂",
];

function spawnFood() {
  const newFood = {
    x: Math.floor(Math.random() * MAP_SIZE),
    y: Math.floor(Math.random() * MAP_SIZE),
    emoji: FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)],
  };

  // Ensure food doesn't spawn on obstacles
  if (obstacles.some((o) => o.x === newFood.x && o.y === newFood.y)) {
    spawnFood();
    return;
  }
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
    if (!obstacles.some((o) => o.x === obs.x && o.y === obs.y)) {
      obstacles.push(obs);
    }
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
  return `hsl(${h}, 90%, 60%)`; // Vibrant neon HSL
}

io.on("connection", (socket) => {
  console.log(`Connection attempt: ${socket.id}`);

  socket.on("join", ({ nickname, password }) => {
    const name = nickname || "Anonymous";

    // Basic Authentication
    if (users[name] && users[name] !== password) {
      socket.emit("authError", "Incorrect password for this nickname.");
      return;
    }

    // Register user if new
    if (!users[name]) {
      users[name] = password;
    }

    // Initialize player
    players[socket.id] = {
      id: socket.id,
      nickname: name,
      snake: [
        {
          x: Math.floor(Math.random() * MAP_SIZE),
          y: Math.floor(Math.random() * MAP_SIZE),
        },
      ],
      direction: "right",
      nextDirection: "right",
      color: getColorFromName(name),
      score: 0,
      kills: 0,
      foodEaten: 0,
      isBoosting: false,
      alive: true,
    };
    socket.emit("joined", { id: socket.id, color: players[socket.id].color });
  });

  socket.on("direction", (dir) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;

    // Prevent 180 degree turns
    if (dir === "up" && p.direction !== "down") p.nextDirection = "up";
    if (dir === "down" && p.direction !== "up") p.nextDirection = "down";
    if (dir === "left" && p.direction !== "right") p.nextDirection = "left";
    if (dir === "right" && p.direction !== "left") p.nextDirection = "right";
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
      p.snake = [
        {
          x: Math.floor(Math.random() * MAP_SIZE),
          y: Math.floor(Math.random() * MAP_SIZE),
        },
      ];
      p.direction = "right";
      p.nextDirection = "right";
      p.score = 0;
      p.alive = true;
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

    // Boost Logic
    let moves = p.isBoosting ? 2 : 1;
    if (p.isBoosting && p.score < 10) {
      moves = 1;
      p.isBoosting = false;
    }

    for (let i = 0; i < moves; i++) {
      p.direction = p.nextDirection;
      const head = { ...p.snake[0] };

      switch (p.direction) {
        case "up":
          head.y--;
          break;
        case "down":
          head.y++;
          break;
        case "left":
          head.x--;
          break;
        case "right":
          head.x++;
          break;
      }

      // Wall Wrap-around
      if (head.x < 0) head.x = MAP_SIZE - 1;
      if (head.x >= MAP_SIZE) head.x = 0;
      if (head.y < 0) head.y = MAP_SIZE - 1;
      if (head.y >= MAP_SIZE) head.y = 0;

      // Obstacle Collision
      if (obstacles.some((o) => o.x === head.x && o.y === head.y)) {
        p.alive = false;
        break;
      }

      // Self and Other Players Collision
      let hitPlayer = false;
      playerIds.forEach((otherId) => {
        const otherP = players[otherId];
        if (!otherP.alive || hitPlayer) return;

        otherP.snake.forEach((segment, idx) => {
          if (id === otherId && idx === 0) return;
          if (head.x === segment.x && head.y === segment.y) {
            p.alive = false;
            hitPlayer = true;
            if (id !== otherId) {
              otherP.kills++;
              otherP.score += 100; // Bigger bonus for kill
              io.emit("killEvent", {
                killer: otherP.nickname,
                victim: p.nickname,
                color: otherP.color,
              });
            }
          }
        });
      });

      if (!p.alive) break;

      p.snake.unshift(head);

      // Food Collision
      const foodIdx = foods.findIndex((f) => f.x === head.x && f.y === head.y);
      if (foodIdx !== -1) {
        p.score += 15;
        p.foodEaten++;
        foods.splice(foodIdx, 1);
        spawnFood();
      } else {
        p.snake.pop();
      }

      // Cost of boosting
      if (p.isBoosting && i === 0) {
        p.score = Math.max(0, p.score - 0.5); // Slow drain
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

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("game.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS player_stats (
    name TEXT PRIMARY KEY,
    profit INTEGER DEFAULT 0
  );
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Game Logic State
  let players: any[] = [];
  let pot = 0;
  let bottomBet = 10;
  let currentTurnIndex = 0;
  let gameState: "waiting" | "playing" = "waiting";
  let currentCards: any = { card1: null, card2: null, card3: null, card3Flipped: false };
  let lastAction: string = "";

  // Load state from DB if exists
  const savedState = db.prepare("SELECT data FROM game_state WHERE id = 1").get() as any;
  if (savedState) {
    const data = JSON.parse(savedState.data);
    pot = data.pot;
    bottomBet = data.bottomBet;
    currentTurnIndex = data.currentTurnIndex;
    gameState = data.gameState;
    currentCards = data.currentCards;
  }

  function saveState() {
    const data = JSON.stringify({ pot, bottomBet, currentTurnIndex, gameState, currentCards });
    db.prepare("INSERT OR REPLACE INTO game_state (id, data) VALUES (1, ?)").run(data);
  }

  function getPlayerStats(name: string) {
    let stats = db.prepare("SELECT profit FROM player_stats WHERE name = ?").get(name) as any;
    if (!stats) {
      db.prepare("INSERT INTO player_stats (name, profit) VALUES (?, 0)").run(name);
      return 0;
    }
    return stats.profit;
  }

  function updatePlayerProfit(name: string, amount: number) {
    db.prepare("UPDATE player_stats SET profit = profit + ? WHERE name = ?").run(amount, name);
  }

  function resetStats() {
    db.prepare("DELETE FROM player_stats").run();
    db.prepare("DELETE FROM game_state").run();
    pot = 0;
    gameState = "waiting";
    currentTurnIndex = 0;
    currentCards = { card1: null, card2: null, card3: null, card3Flipped: false };
    saveState();
  }

  function drawCard() {
    const suits = ["♠", "♥", "♦", "♣"];
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 1=A, 11=J, 12=Q, 13=K
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const value = values[Math.floor(Math.random() * values.length)];
    return { suit, value };
  }

  function broadcastState() {
    const state = {
      players: players.map(p => ({ ...p, profit: getPlayerStats(p.name) })),
      pot,
      bottomBet,
      currentTurnIndex,
      gameState,
      currentCards,
      lastAction
    };
    io.emit("stateUpdate", state);
    saveState();
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", (name) => {
      if (players.length >= 10) {
        socket.emit("error", "Room full");
        return;
      }
      if (gameState === "playing" && pot > 0) {
        socket.emit("error", "Game in progress");
        return;
      }

      const isHost = players.length === 0;
      players.push({ id: socket.id, name, isHost });
      broadcastState();
    });

    socket.on("startGame", (bet) => {
      const player = players.find(p => p.id === socket.id);
      if (player?.isHost) {
        bottomBet = parseInt(bet) || 10;
        pot = players.length * bottomBet;
        players.forEach(p => updatePlayerProfit(p.name, -bottomBet));
        gameState = "playing";
        currentTurnIndex = 0;
        startNewTurn();
      }
    });

    function startNewTurn() {
      currentCards = {
        card1: drawCard(),
        card2: drawCard(),
        card3: drawCard(),
        card3Flipped: false,
        betAmount: 0,
        choice: null // For same card case: 'higher' | 'lower'
      };
      broadcastState();
    }

    socket.on("placeBet", ({ amount, choice }) => {
      const currentPlayer = players[currentTurnIndex];
      if (socket.id !== currentPlayer?.id) return;

      const bet = parseInt(amount);
      if (isNaN(bet) || bet < bottomBet || bet > pot) return;

      currentCards.betAmount = bet;
      currentCards.choice = choice;
      currentCards.card3Flipped = true;

      const c1 = currentCards.card1.value;
      const c2 = currentCards.card2.value;
      const c3 = currentCards.card3.value;

      let result = 0; // profit for player
      let actionMsg = "";

      if (c1 === c2) {
        // Special case: same cards
        if (c3 === c1) {
          // 撞柱
          result = -2 * bet;
          actionMsg = `${currentPlayer.name} 撞柱了！賠了 ${2 * bet}`;
        } else {
          const isHigher = c3 > c1;
          if ((choice === "higher" && isHigher) || (choice === "lower" && !isHigher)) {
            result = bet;
            actionMsg = `${currentPlayer.name} 猜對了！贏了 ${bet}`;
          } else {
            result = -bet;
            actionMsg = `${currentPlayer.name} 猜錯了！輸了 ${bet}`;
          }
        }
      } else {
        const min = Math.min(c1, c2);
        const max = Math.max(c1, c2);

        if (c3 === c1 || c3 === c2) {
          // 撞柱
          result = -2 * bet;
          actionMsg = `${currentPlayer.name} 撞柱了！賠了 ${2 * bet}`;
        } else if (c3 > min && c3 < max) {
          // Win
          result = bet;
          actionMsg = `${currentPlayer.name} 射門成功！贏了 ${bet}`;
        } else {
          // Lose
          result = -bet;
          actionMsg = `${currentPlayer.name} 射偏了！輸了 ${bet}`;
        }
      }

      updatePlayerProfit(currentPlayer.name, result);
      pot -= result; // If result is negative, pot increases
      lastAction = actionMsg;

      if (pot <= 0) {
        pot = 0;
        gameState = "waiting";
        lastAction += " 彩金已清空，遊戲結束！";
      }

      broadcastState();
    });

    socket.on("nextTurn", () => {
      const currentPlayer = players[currentTurnIndex];
      if (socket.id !== currentPlayer?.id) return;
      if (!currentCards.card3Flipped) return;

      currentTurnIndex = (currentTurnIndex + 1) % players.length;
      startNewTurn();
    });

    socket.on("skipTurn", () => {
      const currentPlayer = players[currentTurnIndex];
      if (socket.id !== currentPlayer?.id) return;
      if (currentCards.card3Flipped) return; // Cannot skip after flipping

      lastAction = `${currentPlayer.name} 選擇了跳過。`;
      currentTurnIndex = (currentTurnIndex + 1) % players.length;
      startNewTurn();
    });

    socket.on("resetGame", () => {
      const player = players.find(p => p.id === socket.id);
      if (player?.isHost) {
        resetStats();
        broadcastState();
      }
    });

    socket.on("splitPot", () => {
      // For simplicity, if host requests split, we split it
      const player = players.find(p => p.id === socket.id);
      if (player?.isHost && pot > 0) {
        const share = Math.floor(pot / players.length);
        players.forEach(p => updatePlayerProfit(p.name, share));
        pot = 0;
        gameState = "waiting";
        lastAction = "房主決定平分彩金，遊戲結束。";
        broadcastState();
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      const index = players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const wasHost = players[index].isHost;
        players.splice(index, 1);
        if (wasHost && players.length > 0) {
          players[0].isHost = true;
        }
        if (players.length === 0) {
          // Optional: reset if no one left?
        } else {
          currentTurnIndex = currentTurnIndex % players.length;
        }
        broadcastState();
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

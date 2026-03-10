import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("game.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS game_state (
    room_id TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS player_stats (
    name TEXT PRIMARY KEY,
    profit INTEGER DEFAULT 0,
    lifetime_profit INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS player_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playerName TEXT,
    amount INTEGER,
    type TEXT, -- 'game', 'settle', 'reset'
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT
  );
  CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    playerName TEXT,
    card1 TEXT,
    card2 TEXT,
    card3 TEXT,
    betAmount INTEGER,
    result INTEGER,
    actionMsg TEXT
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

  // Game Logic State per Room
  const rooms: Record<string, any> = {
    "Room 1": createInitialRoomState("Room 1"),
    "Room 2": createInitialRoomState("Room 2"),
    "Room 3": createInitialRoomState("Room 3"),
  };

  function createInitialRoomState(roomId: string) {
    return {
      roomId,
      players: [],
      spectators: [],
      deck: [],
      pot: 0,
      bottomBet: 10,
      currentTurnIndex: 0,
      nextGameStartIndex: 0,
      gameState: "waiting",
      currentCards: { card1: null, card2: null, card3: null, card3Flipped: false },
      lastAction: "",
      turnTimeout: null,
      turnStartTime: null
    };
  }

  function resetTurnTimeout(roomId: string) {
    const room = rooms[roomId];
    if (room.turnTimeout) {
      clearTimeout(room.turnTimeout);
      room.turnTimeout = null;
    }

    if (room.gameState === "playing") {
      room.turnStartTime = Date.now();
      room.turnTimeout = setTimeout(() => {
        const currentPlayer = room.players[room.currentTurnIndex];
        if (currentPlayer) {
          if (room.currentCards.card3Flipped) {
            // Auto next turn
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
            startNewTurn(roomId);
          } else {
            // Auto skip
            room.lastAction = `${currentPlayer.name} 超時，系統自動跳過。`;
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
            startNewTurn(roomId);
          }
        }
      }, 5000);
    }
  }

  // Load state from DB for each room
  Object.keys(rooms).forEach(roomId => {
    const savedState = db.prepare("SELECT data FROM game_state WHERE room_id = ?").get(roomId) as any;
    if (savedState) {
      const data = JSON.parse(savedState.data);
      rooms[roomId].pot = data.pot;
      rooms[roomId].bottomBet = data.bottomBet;
      rooms[roomId].currentTurnIndex = data.currentTurnIndex;
      rooms[roomId].nextGameStartIndex = data.nextGameStartIndex || 0;
      rooms[roomId].gameState = data.gameState;
      rooms[roomId].currentCards = data.currentCards;
      rooms[roomId].deck = data.deck || [];
    }
  });

  function saveRoomState(roomId: string) {
    const room = rooms[roomId];
    const data = JSON.stringify({ 
      pot: room.pot, 
      bottomBet: room.bottomBet, 
      currentTurnIndex: room.currentTurnIndex, 
      nextGameStartIndex: room.nextGameStartIndex,
      gameState: room.gameState, 
      currentCards: room.currentCards, 
      deck: room.deck 
    });
    db.prepare("INSERT OR REPLACE INTO game_state (room_id, data) VALUES (?, ?)").run(roomId, data);
  }

  function getPlayerStats(name: string) {
    let stats = db.prepare("SELECT profit, lifetime_profit FROM player_stats WHERE name = ?").get(name) as any;
    if (!stats) {
      db.prepare("INSERT INTO player_stats (name, profit, lifetime_profit) VALUES (?, 0, 0)").run(name);
      return { profit: 0, lifetime_profit: 0 };
    }
    return stats;
  }

  function updatePlayerProfit(name: string, amount: number, type: string = "game", description: string = "") {
    db.prepare("UPDATE player_stats SET profit = profit + ?, lifetime_profit = lifetime_profit + ? WHERE name = ?").run(amount, amount, name);
    db.prepare("INSERT INTO player_logs (playerName, amount, type, description) VALUES (?, ?, ?, ?)").run(name, amount, type, description);
  }

  function resetRoomStats(roomId: string) {
    const room = rooms[roomId];
    if (room.turnTimeout) {
      clearTimeout(room.turnTimeout);
      room.turnTimeout = null;
    }
    db.prepare("DELETE FROM game_state WHERE room_id = ?").run(roomId);
    db.prepare("DELETE FROM game_history WHERE room_id = ?").run(roomId);
    room.pot = 0;
    room.gameState = "waiting";
    room.currentTurnIndex = 0;
    room.nextGameStartIndex = 0;
    room.currentCards = { card1: null, card2: null, card3: null, card3Flipped: false };
    room.deck = [];
    saveRoomState(roomId);
  }

  function createDeck() {
    const suits = ["♠", "♥", "♦", "♣"];
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const newDeck = [];
    for (const suit of suits) {
      for (const value of values) {
        newDeck.push({ suit, value });
      }
    }
    return newDeck;
  }

  function shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function drawCard(roomId: string) {
    const room = rooms[roomId];
    if (room.deck.length === 0) {
      // Reshuffle: create a new 52-card deck and remove cards currently in play
      let newDeck = createDeck();
      const cardsInPlay = [room.currentCards.card1, room.currentCards.card2, room.currentCards.card3].filter(c => c !== null);
      
      // Filter out cards that are currently on the table to prevent duplicate cards in the same turn
      newDeck = newDeck.filter(card => 
        !cardsInPlay.some(inPlay => inPlay.suit === card.suit && inPlay.value === card.value)
      );
      
      room.deck = shuffle(newDeck);
    }
    return room.deck.pop();
  }

  function broadcastRoomState(roomId: string) {
    const room = rooms[roomId];
    const history = db.prepare("SELECT * FROM game_history WHERE room_id = ? ORDER BY id DESC LIMIT 50").all(roomId);
    const state = {
      roomId,
      players: room.players.map((p: any) => {
        const stats = getPlayerStats(p.name);
        return { ...p, profit: stats.profit, lifetimeProfit: stats.lifetime_profit };
      }),
      spectators: room.spectators.map((s: any) => ({ name: s.name })),
      pot: room.pot,
      bottomBet: room.bottomBet,
      currentTurnIndex: room.currentTurnIndex,
      gameState: room.gameState,
      currentCards: room.currentCards,
      lastAction: room.lastAction,
      deckCount: room.deck.length,
      history
    };
    io.to(roomId).emit("stateUpdate", state);
    saveRoomState(roomId);
  }

  function startNewTurn(roomId: string) {
    const room = rooms[roomId];
    room.currentCards = {
      card1: drawCard(roomId),
      card2: drawCard(roomId),
      card3: drawCard(roomId),
      card3Flipped: false,
      betAmount: 0,
      choice: null // For same card case: 'higher' | 'lower'
    };
    resetTurnTimeout(roomId);
    broadcastRoomState(roomId);
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    let currentRoomId: string | null = null;

    socket.on("join", ({ name, role, roomId }) => {
      if (!rooms[roomId]) {
        socket.emit("error", "無效的房間");
        return;
      }
      
      currentRoomId = roomId;
      socket.join(roomId);
      const room = rooms[roomId];

      if (role === "spectator") {
        room.spectators.push({ id: socket.id, name });
        broadcastRoomState(roomId);
        return;
      }

      if (room.players.length >= 10) {
        socket.emit("error", "房間已滿，請以旁觀者身份加入");
        return;
      }
      if (room.gameState === "playing" && room.pot > 0) {
        socket.emit("error", "遊戲進行中，請先旁觀");
        return;
      }

      const isHost = room.players.length === 0;
      room.players.push({ id: socket.id, name, isHost });
      broadcastRoomState(roomId);
    });

    socket.on("joinAsPlayer", () => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const spectatorIndex = room.spectators.findIndex((s: any) => s.id === socket.id);
      if (spectatorIndex === -1) return;

      if (room.players.length >= 10) {
        socket.emit("error", "房間已滿");
        return;
      }
      if (room.gameState === "playing" && room.pot > 0) {
        socket.emit("error", "遊戲進行中，請等待下一局");
        return;
      }

      const spectator = room.spectators.splice(spectatorIndex, 1)[0];
      const isHost = room.players.length === 0;
      room.players.push({ id: socket.id, name: spectator.name, isHost });
      broadcastRoomState(currentRoomId);
    });

    socket.on("startGame", (bet) => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const player = room.players.find((p: any) => p.id === socket.id);
      if (player?.isHost) {
        room.bottomBet = parseInt(bet) || 10;
        room.pot = room.players.length * room.bottomBet;
        room.players.forEach((p: any) => updatePlayerProfit(p.name, -room.bottomBet, "game", "支付底注"));
        room.gameState = "playing";
        // Start with the calculated next player, ensuring it's within bounds
        room.currentTurnIndex = room.nextGameStartIndex % room.players.length;
        room.deck = shuffle(createDeck());
        startNewTurn(currentRoomId);
      }
    });

    socket.on("placeBet", ({ amount, choice }) => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const currentPlayer = room.players[room.currentTurnIndex];
      if (socket.id !== currentPlayer?.id) return;

      const bet = parseInt(amount);
      if (isNaN(bet) || bet < room.bottomBet || bet > room.pot) return;

      room.currentCards.betAmount = bet;
      room.currentCards.choice = choice;
      room.currentCards.card3Flipped = true;

      const c1 = room.currentCards.card1.value;
      const c2 = room.currentCards.card2.value;
      const c3 = room.currentCards.card3.value;

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

      updatePlayerProfit(currentPlayer.name, result, "game", actionMsg);
      room.pot -= result; // If result is negative, pot increases
      room.lastAction = actionMsg;

      // Record History
      db.prepare(`
        INSERT INTO game_history (room_id, playerName, card1, card2, card3, betAmount, result, actionMsg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        currentRoomId,
        currentPlayer.name,
        `${room.currentCards.card1.suit}${room.currentCards.card1.value}`,
        `${room.currentCards.card2.suit}${room.currentCards.card2.value}`,
        `${room.currentCards.card3.suit}${room.currentCards.card3.value}`,
        bet,
        result,
        actionMsg
      );

      if (room.pot <= 0) {
        room.pot = 0;
        room.gameState = "waiting";
        // Set the next game's starting player to the current player's next neighbor
        room.nextGameStartIndex = (room.currentTurnIndex + 1) % room.players.length;
        room.lastAction += " 彩金已清空，遊戲結束！";
        if (room.turnTimeout) {
          clearTimeout(room.turnTimeout);
          room.turnTimeout = null;
        }
      } else {
        // Reset timeout for the "Next Turn" phase
        resetTurnTimeout(currentRoomId);
      }

      broadcastRoomState(currentRoomId);
    });

    socket.on("nextTurn", () => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const currentPlayer = room.players[room.currentTurnIndex];
      if (socket.id !== currentPlayer?.id) return;
      if (!room.currentCards.card3Flipped) return;

      room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
      startNewTurn(currentRoomId);
    });

    socket.on("skipTurn", () => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const currentPlayer = room.players[room.currentTurnIndex];
      if (socket.id !== currentPlayer?.id) return;
      if (room.currentCards.card3Flipped) return; // Cannot skip after flipping

      room.lastAction = `${currentPlayer.name} 選擇了跳過。`;
      
      room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
      startNewTurn(currentRoomId);
    });

    socket.on("settleProfits", () => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const player = room.players.find((p: any) => p.id === socket.id);
      if (player?.isHost) {
        // Only reset session profit, keep lifetime
        db.prepare("UPDATE player_stats SET profit = 0").run();
        db.prepare("INSERT INTO player_logs (playerName, amount, type, description) SELECT name, 0, 'settle', '房主結算' FROM player_stats").run();
        room.lastAction = "房主已將所有玩家的當局籌碼結算歸零。";
        broadcastRoomState(currentRoomId);
      }
    });

    socket.on("getPersonalHistory", (playerName) => {
      const logs = db.prepare("SELECT * FROM player_logs WHERE playerName = ? ORDER BY id DESC LIMIT 50").all(playerName);
      socket.emit("personalHistory", logs);
    });

    socket.on("resetGame", () => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const player = room.players.find((p: any) => p.id === socket.id);
      if (player?.isHost) {
        resetRoomStats(currentRoomId);
        broadcastRoomState(currentRoomId);
      }
    });

    socket.on("splitPot", () => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      // For simplicity, if host requests split, we split it
      const player = room.players.find((p: any) => p.id === socket.id);
      if (player?.isHost && room.pot > 0) {
        const share = Math.floor(room.pot / room.players.length);
        room.players.forEach((p: any) => updatePlayerProfit(p.name, share, "game", "平分彩金"));
        room.pot = 0;
        room.gameState = "waiting";
        room.lastAction = "房主決定平分彩金，遊戲結束。";
        if (room.turnTimeout) {
          clearTimeout(room.turnTimeout);
          room.turnTimeout = null;
        }
        broadcastRoomState(currentRoomId);
      }
    });

    socket.on("kickPlayer", (playerId) => {
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      const host = room.players.find((p: any) => p.id === socket.id);
      if (!host?.isHost) return;

      const targetSocket = io.sockets.sockets.get(playerId);
      if (targetSocket) {
        targetSocket.emit("error", "你已被房主移出房間");
        targetSocket.disconnect();
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      if (!currentRoomId) return;
      const room = rooms[currentRoomId];
      
      // Check if it was a player
      const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        const wasHost = player.isHost;
        const wasCurrentTurn = room.currentTurnIndex === playerIndex;

        room.players.splice(playerIndex, 1);
        room.lastAction = `${player.name} 離開了遊戲。`;

        if (room.players.length === 0) {
          resetRoomStats(currentRoomId);
        } else {
          if (wasHost) {
            room.players[0].isHost = true;
          }

          if (room.gameState === "playing") {
            if (wasCurrentTurn) {
              // If it was their turn, move to the next player and start a new turn
              room.currentTurnIndex = room.currentTurnIndex % room.players.length;
              startNewTurn(currentRoomId);
            } else if (playerIndex < room.currentTurnIndex) {
              // Adjust index if someone before the current player left
              room.currentTurnIndex--;
            }
          } else {
            // In waiting state, just ensure index is valid
            room.currentTurnIndex = room.players.length > 0 ? room.currentTurnIndex % room.players.length : 0;
          }
        }
        broadcastRoomState(currentRoomId);
        return;
      }

      // Check if it was a spectator
      const spectatorIndex = room.spectators.findIndex((s: any) => s.id === socket.id);
      if (spectatorIndex !== -1) {
        room.spectators.splice(spectatorIndex, 1);
        broadcastRoomState(currentRoomId);
      }
    });
  });

  // Serve images from the root image folder
  app.use("/image", express.static(path.join(process.cwd(), "image")));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, Vite copies public files to dist
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

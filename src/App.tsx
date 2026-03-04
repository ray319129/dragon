import React, { useState, useEffect, useRef } from "react";
import socket from "./socket";
import { motion, AnimatePresence } from "motion/react";
import { Users, Trophy, Coins, Play, RotateCcw, UserCircle, ArrowRight, Split, Info } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  profit: number;
}

interface Card {
  suit: string;
  value: number;
}

interface GameState {
  players: Player[];
  spectators: { name: string }[];
  pot: number;
  bottomBet: number;
  currentTurnIndex: number;
  gameState: "waiting" | "playing";
  currentCards: {
    card1: Card | null;
    card2: Card | null;
    card3: Card | null;
    card3Flipped: boolean;
    betAmount: number;
    choice: "higher" | "lower" | null;
  };
  lastAction: string;
  deckCount: number;
  history: {
    id: number;
    timestamp: string;
    playerName: string;
    card1: string;
    card2: string;
    card3: string | null;
    betAmount: number;
    result: number;
    actionMsg: string;
  }[];
}

const getCardImageUrl = (card: Card | null, flipped: boolean) => {
  if (!flipped) return "/image/Background.png";
  if (!card) return "";

  const { suit, value } = card;
  const suitNames: Record<string, string> = {
    "♣": "Club",
    "♦": "Diamond",
    "♥": "Heart",
    "♠": "Spade"
  };

  const suitName = suitNames[suit];
  if (!suitName) return "";

  let valueStr: string;
  if (value === 1) valueStr = "A";
  else if (value === 11) valueStr = "J";
  else if (value === 12) valueStr = "Q";
  else if (value === 13) valueStr = "K";
  else valueStr = value.toString();

  return `/image/${suitName}${valueStr}.png`;
};

const getCardDisplayName = (card: Card | null, flipped: boolean = true) => {
  if (!card || !flipped) return "";
  const suitMap: Record<string, string> = {
    "♣": "梅花",
    "♦": "方塊",
    "♥": "紅心",
    "♠": "黑桃"
  };
  const valueMap: Record<number, string> = {
    1: "A",
    11: "J",
    12: "Q",
    13: "K"
  };
  const suitName = suitMap[card.suit] || card.suit;
  const valueName = valueMap[card.value] || card.value.toString();
  return `${suitName}${valueName}`;
};

const CardView = ({ card, flipped = true, className = "" }: { card: Card | null; flipped?: boolean; className?: string }) => {
  if (!card && flipped) return <div className={cn("w-24 h-36 border-2 border-dashed border-white/20 rounded-xl flex items-center justify-center text-white/20", className)}>?</div>;

  const imageUrl = getCardImageUrl(card, flipped);

  return (
    <motion.div
      initial={{ rotateY: flipped ? 0 : 180 }}
      animate={{ rotateY: flipped ? 0 : 180 }}
      transition={{ duration: 0.6, type: "spring" }}
      className={cn("relative w-24 h-36 preserve-3d", className)}
    >
      {/* Front (or Back if not flipped) */}
      <div className="absolute inset-0 backface-hidden rounded-xl overflow-hidden shadow-lg border border-white/10">
        <img 
          src={imageUrl} 
          alt={card ? `${card.suit}${card.value}` : "Card"} 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
      {/* Back (shown during flip animation) */}
      <div className="absolute inset-0 backface-hidden rounded-xl overflow-hidden shadow-lg border border-white/10 rotate-y-180">
        <img 
          src="/image/Background.png" 
          alt="Card Back" 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    </motion.div>
  );
};

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("Room 1");
  const [role, setRole] = useState<"player" | "spectator">("player");
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [betInput, setBetInput] = useState("");
  const [bottomBetInput, setBottomBetInput] = useState("10");
  const [error, setError] = useState("");

  useEffect(() => {
    socket.on("stateUpdate", (newState: GameState) => {
      setState(newState);
    });

    socket.on("error", (msg: string) => {
      setError(msg);
      setTimeout(() => setError(""), 3000);
    });

    return () => {
      socket.off("stateUpdate");
      socket.off("error");
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      socket.emit("join", { name: name.trim(), role, roomId });
      setJoined(true);
    }
  };

  const handleJoinAsPlayer = () => {
    socket.emit("joinAsPlayer");
  };

  const handleStart = () => {
    socket.emit("startGame", bottomBetInput);
  };

  const handleBet = (choice?: "higher" | "lower") => {
    const amount = parseInt(betInput);
    if (!amount || amount < (state?.bottomBet || 10) || amount > (state?.pot || 0)) {
      setError("無效的下注金額");
      setTimeout(() => setError(""), 3000);
      return;
    }
    socket.emit("placeBet", { amount, choice });
    setBetInput("");
  };

  const handleNext = () => {
    socket.emit("nextTurn");
  };

  const handleSkip = () => {
    if (window.confirm("確定要跳過這一回合嗎？")) {
      socket.emit("skipTurn");
    }
  };

  const handleReset = () => {
    if (window.confirm("確定要重置所有紀錄（包含彩池與牌組）嗎？")) {
      socket.emit("resetGame");
    }
  };

  const handleSettle = () => {
    if (window.confirm("確定要將所有玩家的籌碼（獲利）結算歸零嗎？")) {
      socket.emit("settleProfits");
    }
  };

  const handleSplit = () => {
    if (window.confirm("確定要平分彩金並結束遊戲嗎？")) {
      socket.emit("splitPot");
    }
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-stone-800 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-white/10"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
              <Trophy className="text-white w-12 h-12" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">射龍門 Online</h1>
            <p className="text-stone-400 mt-2">輸入名稱加入遊戲</p>
          </div>

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase mb-1 block">選擇房間</label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {["Room 1", "Room 2", "Room 3"].map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRoomId(id)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold transition-all border",
                        roomId === id ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-stone-700 border-transparent text-stone-400"
                      )}
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="你的大名"
                  className="w-full bg-stone-700 border-none rounded-xl px-4 py-3 text-white placeholder-stone-500 focus:ring-2 focus:ring-emerald-500 transition-all"
                  maxLength={10}
                  required
                />
              </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole("player")}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-bold transition-all border",
                  role === "player" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-stone-700 border-transparent text-stone-400"
                )}
              >
                玩家身份
              </button>
              <button
                type="button"
                onClick={() => setRole("spectator")}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-bold transition-all border",
                  role === "spectator" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-stone-700 border-transparent text-stone-400"
                )}
              >
                旁觀身份
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              進入遊戲 <ArrowRight size={20} />
            </button>
          </form>
          {error && <p className="text-red-400 text-center mt-4 text-sm">{error}</p>}
        </motion.div>
      </div>
    );
  }

  if (!state) return <div className="min-h-screen bg-stone-900 flex items-center justify-center text-white">載入中...</div>;

  const currentPlayer = state.players[state.currentTurnIndex];
  const isMyTurn = currentPlayer?.id === socket.id;
  const myInfo = state.players.find(p => p.id === socket.id);
  const isSpectator = !myInfo;
  const isHost = myInfo?.isHost;

  const sameCards = state.currentCards.card1?.value === state.currentCards.card2?.value;

  const showHistory = state.gameState === "waiting" || isSpectator || isHost;

  const formatCard = (cardStr: string | null) => {
    if (!cardStr) return "-";
    // cardStr is like "♠1"
    const suit = cardStr[0];
    const val = parseInt(cardStr.slice(1));
    const displayValue = (v: number) => {
      if (v === 1) return "A";
      if (v === 11) return "J";
      if (v === 12) return "Q";
      if (v === 13) return "K";
      return v.toString();
    };
    return `${suit}${displayValue(val)}`;
  };

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col lg:flex-row overflow-x-hidden font-sans">
      {/* Sidebar - Player List */}
      <div className="w-full lg:w-64 bg-stone-800 border-b lg:border-r border-white/5 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/5 flex lg:block items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Coins size={18} />
              <span className="text-sm font-bold uppercase tracking-wider">當前彩池</span>
            </div>
            <div className="text-2xl lg:text-3xl font-mono font-bold">${state.pot}</div>
          </div>
          <div className="lg:hidden flex items-center gap-2">
            <Users size={18} className="text-stone-500" />
            <span className="text-sm font-bold text-stone-500">{state.players.length}/10</span>
          </div>
        </div>

        <div className="flex-1 max-h-48 lg:max-h-none overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-2 text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2">
            <Users size={14} /> 玩家列表 ({state.players.length}/10)
          </div>
          {state.players.map((p, idx) => (
            <div
              key={p.id}
              className={cn(
                "p-3 rounded-xl flex items-center justify-between transition-all",
                idx === state.currentTurnIndex ? "bg-emerald-500/10 border border-emerald-500/20" : "hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  idx === state.currentTurnIndex ? "bg-emerald-500 text-white animate-pulse" : "bg-stone-700 text-stone-400"
                )}>
                  {idx + 1}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className={cn("text-sm font-medium", idx === state.currentTurnIndex ? "text-emerald-400" : "text-stone-200")}>
                      {p.name}
                    </span>
                    {p.isHost && <UserCircle size={12} className="text-amber-400" />}
                    {p.id === socket.id && <span className="text-[10px] bg-stone-700 px-1 rounded text-stone-400">我</span>}
                  </div>
                  <div className={cn("text-xs font-mono", p.profit >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {p.profit >= 0 ? "+" : ""}{p.profit}
                  </div>
                </div>
              </div>
              {idx === state.currentTurnIndex && state.gameState === "playing" && (
                <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              )}
            </div>
          ))}

          {state.spectators.length > 0 && (
            <>
              <div className="px-2 py-2 mt-4 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                旁觀者 ({state.spectators.length})
              </div>
              <div className="px-2 flex flex-wrap gap-1">
                {state.spectators.map((s, i) => (
                  <span key={i} className="text-[10px] bg-stone-700/50 text-stone-400 px-2 py-0.5 rounded-full border border-white/5">
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {isHost && (
          <div className="p-4 border-t border-white/5 space-y-2">
            {state.gameState === "waiting" ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase">底注設定</label>
                <input
                  type="number"
                  value={bottomBetInput}
                  onChange={(e) => setBottomBetInput(e.target.value)}
                  className="w-full bg-stone-700 border-none rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleStart}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                >
                  <Play size={16} /> 開始遊戲
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSettle}
                  className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Coins size={14} /> 籌碼結算歸零
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSplit}
                    className="bg-stone-700 hover:bg-stone-600 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Split size={14} /> 平分彩金
                  </button>
                  <button
                    onClick={handleReset}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <RotateCcw size={14} /> 完全重置
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Game Area */}
      <div className="flex-1 relative flex flex-col">
        {/* Header Info */}
        <div className="p-6 flex justify-between items-start">
          <div>
            <h2 className="text-stone-500 text-xs font-bold uppercase tracking-widest mb-1">最近動態</h2>
            <p className="text-lg font-medium text-stone-200 italic">
              {state.lastAction || "等待遊戲開始..."}
            </p>
          </div>
          <div className="text-right">
            <div className="text-stone-500 text-xs font-bold uppercase tracking-widest mb-1">底注</div>
            <div className="text-xl font-mono">${state.bottomBet}</div>
            {state.gameState === "playing" && (
              <div className="mt-2">
                <div className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-1">剩餘牌數</div>
                <div className="text-sm font-mono text-stone-400">{state.deckCount} / 52</div>
              </div>
            )}
          </div>
        </div>

        {/* Cards Area */}
        <div className="flex-1 flex items-center justify-center gap-4 lg:gap-8 p-4 lg:p-8">
          <div className="flex flex-col items-center gap-2 lg:gap-4">
            <span className="text-xs lg:text-sm font-bold text-emerald-400 h-5">
              {getCardDisplayName(state.currentCards.card1)}
            </span>
            <CardView card={state.currentCards.card1} className="w-20 h-28 lg:w-24 lg:h-36" />
            <span className="text-[10px] lg:text-xs font-bold text-stone-500 uppercase">第一張</span>
          </div>

          <div className="flex flex-col items-center gap-2 lg:gap-4">
            <span className="text-xs lg:text-sm font-bold text-emerald-400 h-5">
              {getCardDisplayName(state.currentCards.card3, state.currentCards.card3Flipped)}
            </span>
            <div className="relative">
              <CardView 
                card={state.currentCards.card3} 
                flipped={state.currentCards.card3Flipped} 
                className={cn(
                  "w-20 h-28 lg:w-24 lg:h-36 scale-110",
                  isMyTurn && !state.currentCards.card3Flipped && state.currentCards.betAmount > 0 ? "cursor-pointer hover:scale-115 transition-transform" : ""
                )}
              />
              {!state.currentCards.card3Flipped && state.currentCards.betAmount > 0 && isMyTurn && (
                <motion.div 
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute -top-3 -right-3 lg:-top-4 lg:-right-4 bg-emerald-500 text-white p-1.5 lg:p-2 rounded-full shadow-lg"
                >
                  <Info size={14} className="lg:w-4 lg:h-4" />
                </motion.div>
              )}
            </div>
            <span className="text-[10px] lg:text-xs font-bold text-stone-500 uppercase">第三張</span>
          </div>

          <div className="flex flex-col items-center gap-2 lg:gap-4">
            <span className="text-xs lg:text-sm font-bold text-emerald-400 h-5">
              {getCardDisplayName(state.currentCards.card2)}
            </span>
            <CardView card={state.currentCards.card2} className="w-20 h-28 lg:w-24 lg:h-36" />
            <span className="text-[10px] lg:text-xs font-bold text-stone-500 uppercase">第二張</span>
          </div>
        </div>

        {/* Controls Overlay */}
        <div className="p-4 lg:p-8 bg-gradient-to-t from-stone-900 via-stone-900/80 to-transparent">
          <div className="max-w-2xl mx-auto">
            {isSpectator && (
              <div className="mb-4 flex justify-center">
                <button
                  onClick={handleJoinAsPlayer}
                  className="bg-emerald-500 hover:bg-emerald-400 px-6 py-2 rounded-full font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                >
                  <Users size={16} /> 加入成為玩家
                </button>
              </div>
            )}

            {/* History Section */}
            {showHistory && state.history.length > 0 && (
              <div className="mb-6 bg-stone-800/80 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-stone-700/30">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
                    <RotateCcw size={14} /> 歷史對局紀錄
                  </h3>
                  <span className="text-[10px] text-stone-500">最近 50 筆</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-stone-800 text-stone-500 uppercase font-bold border-b border-white/5">
                      <tr>
                        <th className="p-3">玩家</th>
                        <th className="p-3">牌面</th>
                        <th className="p-3">下注</th>
                        <th className="p-3">結果</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {state.history.map((h) => (
                        <tr key={h.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 font-medium text-stone-300">{h.playerName}</td>
                          <td className="p-3 font-mono">
                            <span className="text-stone-400">{formatCard(h.card1)}</span>
                            <span className="mx-1 text-stone-600">|</span>
                            <span className="text-stone-400">{formatCard(h.card2)}</span>
                            <span className="mx-1 text-stone-600">→</span>
                            <span className={cn(
                              "font-bold",
                              h.result > 0 ? "text-emerald-400" : h.result < 0 ? "text-red-400" : "text-stone-500"
                            )}>
                              {formatCard(h.card3)}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-stone-400">${h.betAmount}</td>
                          <td className="p-3">
                            <div className={cn(
                              "font-bold",
                              h.result > 0 ? "text-emerald-500" : h.result < 0 ? "text-red-500" : "text-stone-500"
                            )}>
                              {h.result > 0 ? "+" : ""}{h.result}
                            </div>
                            <div className="text-[10px] text-stone-500 truncate max-w-[120px]" title={h.actionMsg}>
                              {h.actionMsg}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {state.gameState === "waiting" ? (
              <div className="bg-stone-800/50 backdrop-blur-sm border border-white/5 p-6 lg:p-8 rounded-3xl text-center">
                <Users className="mx-auto text-stone-600 mb-4" size={32} />
                <h3 className="text-lg lg:text-xl font-bold mb-2">等待房主開始</h3>
                <p className="text-sm text-stone-400">目前共有 {state.players.length} 位玩家在線</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {isMyTurn ? (
                  <motion.div
                    key="my-turn"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-stone-800 p-4 lg:p-6 rounded-3xl shadow-2xl border border-emerald-500/30"
                  >
                    {!state.currentCards.card3Flipped ? (
                      <div className="space-y-4 lg:space-y-6">
                        <div className="flex justify-between items-end">
                          <div>
                            <h3 className="text-xl lg:text-2xl font-bold text-emerald-400">輪到你了！</h3>
                            <p className="text-xs lg:text-sm text-stone-400">請輸入下注金額</p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-stone-500 font-bold uppercase">可投範圍</span>
                            <div className="text-sm lg:text-lg font-mono">${state.bottomBet} ~ ${state.pot}</div>
                          </div>
                        </div>

                        {/* Quick Bet Buttons */}
                        <div className="flex flex-wrap gap-2">
                          {[10, 20, 50].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setBetInput(amount.toString())}
                              className="bg-stone-700 hover:bg-stone-600 px-4 py-2 rounded-lg text-sm font-bold transition-all"
                            >
                              ${amount}
                            </button>
                          ))}
                          <button
                            onClick={() => setBetInput(state.pot.toString())}
                            className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-sm font-bold transition-all text-white shadow-lg shadow-red-600/20"
                          >
                            ALL IN
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="number"
                            value={betInput}
                            onChange={(e) => setBetInput(e.target.value)}
                            placeholder={`下注金額 (底注 ${state.bottomBet})`}
                            className="flex-1 bg-stone-700 border-none rounded-xl px-4 py-3 text-lg font-mono focus:ring-2 focus:ring-emerald-500"
                          />
                          <div className="flex gap-2">
                            {sameCards ? (
                              <>
                                <button
                                  onClick={() => handleBet("higher")}
                                  className="flex-1 sm:flex-none bg-emerald-500 hover:bg-emerald-400 px-6 rounded-xl font-bold transition-all"
                                >
                                  猜大
                                </button>
                                <button
                                  onClick={() => handleBet("lower")}
                                  className="flex-1 sm:flex-none bg-blue-500 hover:bg-blue-400 px-6 rounded-xl font-bold transition-all"
                                >
                                  猜小
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleBet()}
                                className="flex-1 sm:flex-none bg-emerald-500 hover:bg-emerald-400 px-8 rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all"
                              >
                                下注
                              </button>
                            )}
                            <button
                              onClick={handleSkip}
                              className="flex-1 sm:flex-none bg-stone-700 hover:bg-stone-600 px-6 rounded-xl font-bold transition-all text-stone-300"
                            >
                              跳過
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold">回合結束</h3>
                          <p className="text-stone-400">點擊按鈕交棒給下一位</p>
                        </div>
                        <button
                          onClick={handleNext}
                          className="bg-emerald-500 hover:bg-emerald-400 px-8 py-3 rounded-xl font-bold flex items-center gap-2"
                        >
                          下一位 <ArrowRight size={18} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="other-turn"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center p-4"
                  >
                    <p className="text-stone-500 font-medium animate-pulse">
                      等待 <span className="text-stone-300">{currentPlayer?.name}</span> 行動中...
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-full shadow-xl z-50 flex items-center gap-2"
        >
          <Info size={18} /> {error}
        </motion.div>
      )}

      <style>{`
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}

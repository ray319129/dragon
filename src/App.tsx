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
}

const CardView = ({ card, flipped = true, className = "" }: { card: Card | null; flipped?: boolean; className?: string }) => {
  if (!card) return <div className={cn("w-24 h-36 border-2 border-dashed border-white/20 rounded-xl flex items-center justify-center text-white/20", className)}>?</div>;

  const isRed = card.suit === "♥" || card.suit === "♦";
  const displayValue = (val: number) => {
    if (val === 1) return "A";
    if (val === 11) return "J";
    if (val === 12) return "Q";
    if (val === 13) return "K";
    return val.toString();
  };

  return (
    <motion.div
      initial={{ rotateY: flipped ? 0 : 180 }}
      animate={{ rotateY: flipped ? 0 : 180 }}
      transition={{ duration: 0.6, type: "spring" }}
      className={cn("relative w-24 h-36 preserve-3d", className)}
    >
      {/* Front */}
      <div className={cn(
        "absolute inset-0 backface-hidden bg-white rounded-xl shadow-lg flex flex-col justify-between p-2 border border-gray-200",
        isRed ? "text-red-600" : "text-gray-900"
      )}>
        <div className="text-lg font-bold leading-none">
          {displayValue(card.value)}
          <br />
          <span className="text-xl">{card.suit}</span>
        </div>
        <div className="text-3xl self-center">{card.suit}</div>
        <div className="text-lg font-bold leading-none rotate-180">
          {displayValue(card.value)}
          <br />
          <span className="text-xl">{card.suit}</span>
        </div>
      </div>
      {/* Back */}
      <div className="absolute inset-0 backface-hidden bg-indigo-900 rounded-xl shadow-lg border-4 border-white flex items-center justify-center rotate-y-180">
        <div className="w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        <Trophy className="text-white/40 w-10 h-10" />
      </div>
    </motion.div>
  );
};

export default function App() {
  const [name, setName] = useState("");
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
      socket.emit("join", name.trim());
      setJoined(true);
    }
  };

  const handleStart = () => {
    socket.emit("startGame", bottomBetInput);
  };

  const handleBet = (choice?: "higher" | "lower") => {
    const amount = parseInt(betInput);
    if (!amount || amount < (state?.bottomBet || 10) || amount > (state?.pot || 0)) {
      setError("無效的下注金額");
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
    if (window.confirm("確定要重置所有紀錄嗎？")) {
      socket.emit("resetGame");
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
            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              加入房間 <ArrowRight size={20} />
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
  const isHost = myInfo?.isHost;

  const sameCards = state.currentCards.card1?.value === state.currentCards.card2?.value;

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
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSplit}
                  className="bg-stone-700 hover:bg-stone-600 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Split size={14} /> 平分
                </button>
                <button
                  onClick={handleReset}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                >
                  <RotateCcw size={14} /> 重置
                </button>
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
          </div>
        </div>

        {/* Cards Area */}
        <div className="flex-1 flex items-center justify-center gap-4 lg:gap-8 p-4 lg:p-8">
          <div className="flex flex-col items-center gap-2 lg:gap-4">
            <CardView card={state.currentCards.card1} className="w-20 h-28 lg:w-24 lg:h-36" />
            <span className="text-[10px] lg:text-xs font-bold text-stone-500 uppercase">第一張</span>
          </div>

          <div className="flex flex-col items-center gap-2 lg:gap-4">
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
            <CardView card={state.currentCards.card2} className="w-20 h-28 lg:w-24 lg:h-36" />
            <span className="text-[10px] lg:text-xs font-bold text-stone-500 uppercase">第二張</span>
          </div>
        </div>

        {/* Controls Overlay */}
        <div className="p-4 lg:p-8 bg-gradient-to-t from-stone-900 via-stone-900/80 to-transparent">
          <div className="max-w-2xl mx-auto">
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

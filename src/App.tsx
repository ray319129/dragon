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
  probabilities: {
    type: "same" | "range";
    win?: number;
    lose?: number;
    higher?: number;
    lower?: number;
    post: number;
    counts: {
      win?: number;
      lose?: number;
      higher?: number;
      lower?: number;
      post: number;
      total: number;
    };
  } | null;
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

const ProbabilityModal = ({ isOpen, onClose, probabilities }: { isOpen: boolean; onClose: () => void; probabilities: any }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-stone-800 w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-stone-700/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
              <Info size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">機率計算實驗室</h2>
              <p className="text-xs text-stone-500 uppercase tracking-widest">Probability Lab & Math Breakdown</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-white transition-colors">
            <RotateCcw size={24} className="rotate-45" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
          <section>
            <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
              <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
              核心計算原理
            </h3>
            <div className="bg-stone-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
              <p className="text-sm text-stone-300 leading-relaxed">
                本遊戲的機率計算採用 <span className="text-white font-bold">古典機率 (Classical Probability)</span> 模型。
                在一個公平的牌組中，每一張牌被抽中的機率都是相等的。
              </p>
              <div className="bg-stone-800 p-4 rounded-xl text-center font-mono text-lg border border-white/5">
                P(事件) = <span className="text-emerald-400">符合條件的剩餘牌數</span> / <span className="text-stone-400">牌組總剩餘張數</span>
              </div>
              <p className="text-xs text-stone-500 italic">
                * 註：本系統會即時追蹤牌組中「已被抽走」的牌，因此機率會隨著遊戲進行而產生動態變化，這與現實中實體撲克牌的邏輯完全一致。
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
              <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
              射龍門規則與數學
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-stone-900/50 p-4 rounded-2xl border border-white/5">
                <h4 className="font-bold text-white mb-2">1. 射門成功 (Win)</h4>
                <p className="text-stone-400">
                  當第三張牌的點數介於前兩張牌之間（不含邊界）。
                  <br/>
                  <span className="text-[10px] font-mono text-stone-600">Min &lt; Card3 &lt; Max</span>
                </p>
              </div>
              <div className="bg-stone-900/50 p-4 rounded-2xl border border-red-500/10">
                <h4 className="font-bold text-red-400 mb-2">2. 撞柱 (Post)</h4>
                <p className="text-stone-400">
                  當第三張牌點數等於前兩張牌中的任一張。此時需賠付雙倍賭注。
                  <br/>
                  <span className="text-[10px] font-mono text-stone-600">Card3 == Card1 OR Card3 == Card2</span>
                </p>
              </div>
              <div className="bg-stone-900/50 p-4 rounded-2xl border border-white/5">
                <h4 className="font-bold text-white mb-2">3. 射偏 (Lose)</h4>
                <p className="text-stone-400">
                  當第三張牌點數在前兩張牌範圍之外。
                  <br/>
                  <span className="text-[10px] font-mono text-stone-600">Card3 &lt; Min OR Card3 &gt; Max</span>
                </p>
              </div>
              <div className="bg-stone-900/50 p-4 rounded-2xl border border-amber-500/10">
                <h4 className="font-bold text-amber-400 mb-2">4. 相同牌 (Same)</h4>
                <p className="text-stone-400">
                  若前兩張牌點數相同，玩家需選擇「猜大」或「猜小」。
                </p>
              </div>
            </div>
          </section>

          {probabilities && (
            <section>
              <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                當前局勢深度分析
              </h3>
              <div className="bg-emerald-500/5 p-5 rounded-2xl border border-emerald-500/20">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <div className="text-xs text-stone-500 uppercase font-bold">當前牌組狀態</div>
                    <div className="text-2xl font-bold text-white">剩餘 {probabilities.counts.total} 張牌</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-stone-500 uppercase font-bold">洗牌點</div>
                    <div className="text-sm font-mono text-stone-400">0 張時自動洗牌</div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {probabilities.type === "range" ? (
                    <>
                      <ProbBar label="射門成功" percent={probabilities.win} count={probabilities.counts.win} color="bg-emerald-500" />
                      <ProbBar label="射偏" percent={probabilities.lose} count={probabilities.counts.lose} color="bg-stone-600" />
                      <ProbBar label="撞柱 (危險)" percent={probabilities.post} count={probabilities.counts.post} color="bg-red-500" />
                    </>
                  ) : (
                    <>
                      <ProbBar label="猜大" percent={probabilities.higher} count={probabilities.counts.higher} color="bg-emerald-500" />
                      <ProbBar label="猜小" percent={probabilities.lower} count={probabilities.counts.lower} color="bg-blue-500" />
                      <ProbBar label="撞柱 (危險)" percent={probabilities.post} count={probabilities.counts.post} color="bg-red-500" />
                    </>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="p-6 bg-stone-900/50 border-t border-white/5">
          <button 
            onClick={onClose}
            className="w-full bg-stone-700 hover:bg-stone-600 py-3 rounded-xl font-bold transition-all"
          >
            我明白了
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const ProbBar = ({ label, percent, count, color }: { label: string, percent: number, count: number, color: string }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-xs">
      <span className="text-stone-300 font-medium">{label}</span>
      <span className="text-stone-400 font-mono">{percent.toFixed(1)}% ({count} 張)</span>
    </div>
    <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        className={cn("h-full rounded-full", color)}
      />
    </div>
  </div>
);

export default function App() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"player" | "spectator">("player");
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [betInput, setBetInput] = useState("");
  const [bottomBetInput, setBottomBetInput] = useState("10");
  const [error, setError] = useState("");
  const [showProbModal, setShowProbModal] = useState(false);

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
      socket.emit("join", { name: name.trim(), role });
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
          <div className="text-right flex flex-col items-end">
            <button 
              onClick={() => setShowProbModal(true)}
              className="mb-2 bg-stone-800 hover:bg-stone-700 p-2 rounded-lg text-stone-400 hover:text-emerald-400 transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider border border-white/5"
            >
              <Info size={14} /> 機率實驗室
            </button>
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

                        {/* Probability Helper */}
                        {state.probabilities && (
                          <div className="bg-stone-900/50 rounded-xl p-4 border border-white/10">
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-[10px] font-bold text-stone-500 uppercase flex items-center gap-1">
                                <Info size={12} /> 真實機率分析 (基於剩餘牌組)
                              </div>
                              <div className="text-[10px] text-stone-600 font-mono">
                                剩餘 {state.probabilities.counts.total} 張牌
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-3">
                              {state.probabilities.type === "same" ? (
                                <>
                                  <div className="bg-stone-800/50 p-2 rounded-lg border border-white/5">
                                    <div className="text-[10px] text-stone-400 mb-1">猜大</div>
                                    <div className="text-lg font-bold text-emerald-400">
                                      {state.probabilities.higher?.toFixed(1)}%
                                    </div>
                                    <div className="text-[9px] text-stone-500 font-mono">
                                      {state.probabilities.counts.higher} / {state.probabilities.counts.total}
                                    </div>
                                  </div>
                                  <div className="bg-stone-800/50 p-2 rounded-lg border border-white/5">
                                    <div className="text-[10px] text-stone-400 mb-1">猜小</div>
                                    <div className="text-lg font-bold text-blue-400">
                                      {state.probabilities.lower?.toFixed(1)}%
                                    </div>
                                    <div className="text-[9px] text-stone-500 font-mono">
                                      {state.probabilities.counts.lower} / {state.probabilities.counts.total}
                                    </div>
                                  </div>
                                  <div className="bg-stone-800/50 p-2 rounded-lg border border-red-500/20">
                                    <div className="text-[10px] text-red-400 mb-1">撞柱</div>
                                    <div className="text-lg font-bold text-red-500">
                                      {state.probabilities.post.toFixed(1)}%
                                    </div>
                                    <div className="text-[9px] text-stone-500 font-mono">
                                      {state.probabilities.counts.post} / {state.probabilities.counts.total}
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="bg-stone-800/50 p-2 rounded-lg border border-white/5">
                                    <div className="text-[10px] text-stone-400 mb-1">射門成功</div>
                                    <div className="text-lg font-bold text-emerald-400">
                                      {state.probabilities.win?.toFixed(1)}%
                                    </div>
                                    <div className="text-[9px] text-stone-500 font-mono">
                                      {state.probabilities.counts.win} / {state.probabilities.counts.total}
                                    </div>
                                  </div>
                                  <div className="bg-stone-800/50 p-2 rounded-lg border border-white/5">
                                    <div className="text-[10px] text-stone-400 mb-1">射偏</div>
                                    <div className="text-lg font-bold text-stone-400">
                                      {state.probabilities.lose?.toFixed(1)}%
                                    </div>
                                    <div className="text-[9px] text-stone-500 font-mono">
                                      {state.probabilities.counts.lose} / {state.probabilities.counts.total}
                                    </div>
                                  </div>
                                  <div className="bg-stone-800/50 p-2 rounded-lg border border-red-500/20">
                                    <div className="text-[10px] text-red-400 mb-1">撞柱風險</div>
                                    <div className="text-lg font-bold text-red-500">
                                      {state.probabilities.post.toFixed(1)}%
                                    </div>
                                    <div className="text-[9px] text-stone-500 font-mono">
                                      {state.probabilities.counts.post} / {state.probabilities.counts.total}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                            
                            <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-stone-500 leading-relaxed">
                              <p>
                                💡 <span className="text-stone-400">計算公式：</span> 
                                (符合條件的剩餘牌數 / 牌組剩餘總數) × 100%。
                                遊戲使用標準 52 張撲克牌，每次洗牌後隨機抽取，不包含鬼牌。
                              </p>
                            </div>
                          </div>
                        )}

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

      <ProbabilityModal 
        isOpen={showProbModal} 
        onClose={() => setShowProbModal(false)} 
        probabilities={state.probabilities}
      />

      <style>{`
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}

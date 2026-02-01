// hooks/useTwoPlayerGameLogic.ts - PHẦN 1/2
import { useState, useEffect, useRef } from "react";
import { initialBalls } from "../constants/billiard";
import {
  GAME_CONFIG,
  GAME_MESSAGES,
  PLAYER_COLORS,
} from "../constants/game";
import {
  checkCollision,
  resolveCollision,
  checkWallCollision,
  checkPocket,
  applyFriction,
  type Ball,
  BALL_RADIUS,
  TABLE_WIDTH,
  TABLE_HEIGHT,
} from "../utils/physics";
import { clearPredictionCache } from "../utils/predictionHelpers";
import type { Player, GameState, BallType } from "../types/player";

// Payload đồng bộ multiplayer (host → guest)
export interface SerializedGameState {
  balls: Ball[];
  gameState: GameState;
  message: string;
  ballInHand: boolean;
  ballInHandPlaced: boolean;
}

// ✅ Interface cho Game Result
export interface GameResult {
  winner: {
    id: number;
    name: string;
    score: number;
    avatar: string;
    totalBallsPocketed: number;
  };
  loser: {
    id: number;
    name: string;
    score: number;
    avatar: string;
    totalBallsPocketed: number;
  };
  gameStats: {
    totalTurns: number;
    duration: string;
    winReason: "normal" | "forfeit" | "ball8_early" | "ball8_win";
  };
}

const initialPlayers: [Player, Player] = [
  {
    id: 1,
    name: "Người chơi 1",
    score: 0,
    ballType: "none",
    color: PLAYER_COLORS.PLAYER_1,
  },
  {
    id: 2,
    name: "Người chơi 2",
    score: 0,
    ballType: "none",
    color: PLAYER_COLORS.PLAYER_2,
  },
];

export const useTwoPlayerGameLogic = (options?: { onGameOver?: (result: GameResult) => void }) => {
  const [balls, setBalls] = useState<Ball[]>(initialBalls);
  const [gameState, setGameState] = useState<GameState>({
    currentPlayer: 1,
    players: initialPlayers,
    isBreak: true,
    turnEnded: false,
  });
  const [message, setMessage] = useState<string>(GAME_MESSAGES.BREAK_SHOT);
  const [ballInHand, setBallInHand] = useState(false);
  const [ballInHandPlaced, setBallInHandPlaced] = useState(false);

  // ✅ State cho game result
  const [showGameResult, setShowGameResult] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [gameStartTime] = useState(Date.now());

  const animationFrame = useRef<number | null>(null);
  const ballsPocketedThisTurn = useRef<Set<number>>(new Set());
  const cueBallPocketed = useRef(false);
  const firstBallHit = useRef<Ball | null>(null);
  const hasShot = useRef(false);
  const isProcessingTurn = useRef(false);
  const ballsTouchedCushion = useRef(false);
  const turnPhase = useRef<"break" | "open" | "determined">("break");
  const turnCounter = useRef(0);
  const ballsPocketedCount = useRef<{ player1: number; player2: number }>({
    player1: 0,
    player2: 0,
  });

  // ✅ Hàm tính thời gian game
  const getGameDuration = (): string => {
    const duration = Math.floor((Date.now() - gameStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // ✅ Hàm kết thúc game
  const endGame = (
    winnerId: number,
    winReason: "normal" | "forfeit" | "ball8_early" | "ball8_win",
  ) => {
    const winnerIndex = winnerId - 1;
    const loserIndex = winnerIndex === 0 ? 1 : 0;

    const winner = gameState.players[winnerIndex];
    const loser = gameState.players[loserIndex];

    const result: GameResult = {
      winner: {
        id: winner.id,
        name: winner.name,
        score: winner.score,
        avatar: winner.id === 1 ? "😎" : "👩",
        totalBallsPocketed:
          ballsPocketedCount.current[
            `player${winner.id}` as keyof typeof ballsPocketedCount.current
          ],
      },
      loser: {
        id: loser.id,
        name: loser.name,
        score: loser.score,
        avatar: loser.id === 1 ? "😎" : "👩",
        totalBallsPocketed:
          ballsPocketedCount.current[
            `player${loser.id}` as keyof typeof ballsPocketedCount.current
          ],
      },
      gameStats: {
        totalTurns: turnCounter.current,
        duration: getGameDuration(),
        winReason,
      },
    };

    setGameResult(result);
    setShowGameResult(true);
    options?.onGameOver?.(result);
  };

  /* ================= GAME LOOP ================= */
  useEffect(() => {
    const updateGame = () => {
      setBalls((prev) => {
        const next = prev.map((b) =>
          b.isPocketed ? b : { ...b, x: b.x + b.vx, y: b.y + b.vy },
        );

        next.forEach(applyFriction);

        // ✅ KIỂM TRA POCKET TRƯỚC COLLISION
        next.forEach((ball) => {
          if (!ball.isPocketed) {
            const pocket = checkPocket(ball);
            if (pocket) {
              ball.isPocketed = true;
              ball.vx = 0;
              ball.vy = 0;
              ball.x = pocket.x;
              ball.y = pocket.y;

              if (ball.id === 0) {
                cueBallPocketed.current = true;
                console.log("[CUE BALL POCKETED]");
              } else if (hasShot.current) {
                ballsPocketedThisTurn.current.add(ball.id);
                console.log(
                  `[BALL POCKETED] Id: ${ball.id}, Total: ${ballsPocketedThisTurn.current.size}`,
                );
              }
            }
          }
        });

        // ✅ KIỂM TRA COLLISION (CHỈ KHI KHÔNG PHẢI BALL IN HAND)
        if (!ballInHand) {
          for (let i = 0; i < next.length; i++) {
            for (let j = i + 1; j < next.length; j++) {
              if (!next[i].isPocketed && !next[j].isPocketed) {
                if (checkCollision(next[i], next[j])) {
                  if (
                    (next[i].id === 0 || next[j].id === 0) &&
                    !firstBallHit.current &&
                    hasShot.current
                  ) {
                    const hitBall = next[i].id === 0 ? next[j] : next[i];
                    firstBallHit.current = hitBall;
                    console.log(
                      `[FIRST BALL HIT] Id: ${hitBall.id}, Type: ${hitBall.isStriped ? "striped" : "solid"}`,
                    );
                  }
                  resolveCollision(next[i], next[j]);
                }
              }
            }

            const hitWall = checkWallCollision(next[i]);
            if (hitWall && hasShot.current) {
              ballsTouchedCushion.current = true;
            }
          }
        } else {
          // ✅ BALL IN HAND: Chỉ xử lý tường
          for (let i = 0; i < next.length; i++) {
            if (next[i].id !== 0 || !ballInHand) {
              if (next[i].id !== 0) {
                checkWallCollision(next[i]);
              }
            }
          }
          checkWallCollision(next[0]);
        }

        return next;
      });

      animationFrame.current = requestAnimationFrame(updateGame);
    };

    animationFrame.current = requestAnimationFrame(updateGame);
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [ballInHand]);

  /* ================= END TURN CHECK ================= */
  useEffect(() => {
    const moving = balls.some(
      (b) => !b.isPocketed && (Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01),
    );

    if (
      !moving &&
      hasShot.current &&
      !isProcessingTurn.current &&
      !ballInHand
    ) {
      isProcessingTurn.current = true;
      setTimeout(() => {
        const stillMoving = balls.some(
          (b) =>
            !b.isPocketed && (Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01),
        );

        if (stillMoving) {
          console.log("[END TURN CHECK] Bi vẫn đang lăn, chờ thêm...");
          isProcessingTurn.current = false;
        } else {
          endTurn(balls);
        }
      }, 500);
    }
  }, [balls, ballInHand]);

  // ⚠️ TIẾP TỤC Ở PHẦN 2/2// hooks/useTwoPlayerGameLogic.ts - PHẦN 2/2 (TIẾP TỤC TỪ PHẦN 1)

  /* ================= END TURN ================= */
  const endTurn = (currentBalls: Ball[]) => {
    turnCounter.current++;

    const currentIndex = gameState.currentPlayer - 1;
    const opponentIndex = currentIndex === 0 ? 1 : 0;
    const currentPlayer = gameState.players[currentIndex];

    const pocketedBalls = currentBalls.filter(
      (b) =>
        b.isPocketed && b.id !== 0 && ballsPocketedThisTurn.current.has(b.id),
    );

    // ✅ Cập nhật số bi vào lỗ
    if (pocketedBalls.length > 0) {
      ballsPocketedCount.current[
        `player${currentPlayer.id}` as keyof typeof ballsPocketedCount.current
      ] += pocketedBalls.length;
    }

    const solids = pocketedBalls.filter((b) => b.id >= 1 && b.id <= 7);
    const stripes = pocketedBalls.filter((b) => b.id >= 9 && b.id <= 15);
    const ball8 = pocketedBalls.find((b) => b.id === 8);

    let shouldChangeTurn = false;
    let messageText = "";
    let gameOver = false;
    let winner: number | null = null;
    let winReason: "normal" | "forfeit" | "ball8_early" | "ball8_win" =
      "normal";
    let givesBallInHand = false;
    let newPhase = turnPhase.current;

    const newPlayers: [Player, Player] = [
      {
        id: gameState.players[0].id,
        name: gameState.players[0].name,
        score: gameState.players[0].score,
        ballType: gameState.players[0].ballType,
        color: gameState.players[0].color,
      },
      {
        id: gameState.players[1].id,
        name: gameState.players[1].name,
        score: gameState.players[1].score,
        ballType: gameState.players[1].ballType,
        color: gameState.players[1].color,
      },
    ];

    const assignBallType = (type: BallType) => {
      newPlayers[currentIndex].ballType = type;
      newPlayers[opponentIndex].ballType =
        type === "solid" ? "striped" : "solid";
      newPhase = "determined";
    };

    const hasRemainingBalls = (playerIndex: number): boolean => {
      const player = newPlayers[playerIndex];
      if (player.ballType === "none") return true;

      return currentBalls.some((b) => {
        if (b.isPocketed || b.id === 0 || b.id === 8) return false;
        if (player.ballType === "solid") return b.id >= 1 && b.id <= 7;
        return b.id >= 9 && b.id <= 15;
      });
    };

    console.log("=== END TURN DEBUG ===");
    console.log("firstBallHit:", firstBallHit.current?.id);
    console.log("cueBallPocketed:", cueBallPocketed.current);
    console.log(
      "pocketedBalls IDs:",
      pocketedBalls.map((b) => b.id),
    );
    console.log("turnPhase:", turnPhase.current);
    console.log("currentPlayer ballType:", currentPlayer.ballType);
    console.log("======================");

    /* BI 8 VÀO LỖ KHI CHƯA HẾT BI → THUA */
    if (ball8 && hasRemainingBalls(currentIndex)) {
      gameOver = true;
      winner = currentPlayer.id === 1 ? 2 : 1;
      winReason = "ball8_early";
      messageText = `🤖 ${currentPlayer.name} đánh bi 8 khi chưa hết bi - THUA!`;
    } else if (cueBallPocketed.current) {
      /* BI TRẮNG VÀO LỖ */
      if (ball8) {
        gameOver = true;
        winner = currentPlayer.id === 1 ? 2 : 1;
        winReason = "ball8_early";
        messageText = `🤖 ${currentPlayer.name} bi trắng + bi 8 vào lỗ - THUA!`;
      } else {
        shouldChangeTurn = true;
        givesBallInHand = true;
        messageText = "❌ Bi trắng vào lỗ! Đối thủ được ball in hand";

        setBalls((prev) => {
          const next = [...prev];
          next[0].isPocketed = false;
          next[0].x = 175;
          next[0].y = 300;
          next[0].vx = 0;
          next[0].vy = 0;
          return next;
        });
      }
    } else if (gameState.isBreak) {
      /* CỦ KHAI CUỘC */
      if (ball8) {
        messageText = "⚫ Bi 8 vào lỗ khi khai cuộc! Đặt lại bi 8";
        shouldChangeTurn = false;
        newPhase = "break";

        setBalls((prev) => {
          const next = [...prev];
          const ball8Index = next.findIndex((b) => b.id === 8);
          if (ball8Index !== -1) {
            next[ball8Index].isPocketed = false;
            next[ball8Index].x = 525;
            next[ball8Index].y = 300;
            next[ball8Index].vx = 0;
            next[ball8Index].vy = 0;
          }
          return next;
        });
      } else if (pocketedBalls.length === 0) {
        messageText = "⚫ Khai cuộc không vô bi. Đổi lượt!";
        shouldChangeTurn = true;
        newPhase = "open";
      } else if (solids.length > 0 && stripes.length === 0) {
        assignBallType("solid");
        newPlayers[currentIndex].score +=
          solids.length * GAME_CONFIG.POINTS_PER_BALL;
        messageText = `🎯 ${currentPlayer.name} chọn BI MẦU (1-7)! +${solids.length * 10}Đ`;
        shouldChangeTurn = false;
      } else if (stripes.length > 0 && solids.length === 0) {
        assignBallType("striped");
        newPlayers[currentIndex].score +=
          stripes.length * GAME_CONFIG.POINTS_PER_BALL;
        messageText = `🎯 ${currentPlayer.name} chọn BI KHOANG (9-15)! +${stripes.length * 10}Đ`;
        shouldChangeTurn = false;
      } else if (solids.length > 0 && stripes.length > 0) {
        newPlayers[currentIndex].score +=
          pocketedBalls.length * GAME_CONFIG.POINTS_PER_BALL;
        messageText = `⚫ Vô 2 loại bi! Đánh tiếp, bi tiếp theo sẽ quyết định. +${pocketedBalls.length * 10}Đ`;
        shouldChangeTurn = false;
        newPhase = "open";
      }
    } else if (turnPhase.current === "open") {
      /* BÀN MỞ */
      if (!firstBallHit.current) {
        shouldChangeTurn = true;
        givesBallInHand = true;
        messageText = "❌ Không chạm bi! Đối thủ có ball in hand";
        console.log("[OPEN PHASE] Không chạm bi");
      } else if (firstBallHit.current.id === 8) {
        shouldChangeTurn = true;
        givesBallInHand = true;
        messageText =
          "❌ Không được chạm bi 8 đầu tiên! Đối thủ có ball in hand";
        console.log("[OPEN PHASE] Chạm bi 8");
      } else if (pocketedBalls.length > 0) {
        if (solids.length > 0 && stripes.length === 0) {
          assignBallType("solid");
          newPlayers[currentIndex].score +=
            solids.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `🎯 ${currentPlayer.name} chọn BI MẦU (1-7)! +${solids.length * 10}Đ`;
          shouldChangeTurn = false;
          console.log("[OPEN PHASE] Vô solid → xác định solid");
        } else if (stripes.length > 0 && solids.length === 0) {
          assignBallType("striped");
          newPlayers[currentIndex].score +=
            stripes.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `🎯 ${currentPlayer.name} chọn BI KHOANG (9-15)! +${stripes.length * 10}Đ`;
          shouldChangeTurn = false;
          console.log("[OPEN PHASE] Vô striped → xác định striped");
        } else if (solids.length > 0 && stripes.length > 0) {
          newPlayers[currentIndex].score +=
            pocketedBalls.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `⚫ Vô 2 loại! Đánh tiếp để quyết định. +${pocketedBalls.length * 10}Đ`;
          shouldChangeTurn = false;
          console.log("[OPEN PHASE] Vô 2 loại → Đánh tiếp");
        }
      } else {
        shouldChangeTurn = true;
        messageText = "⚫ Không vô bi. Đổi lượt!";
        console.log("[OPEN PHASE] Chạm bi nhưng không vô");
      }
    } else {
      /* ĐÃ CÓ LOẠI BI */
      const hit = firstBallHit.current;

      const isCorrectBall = (ball: Ball): boolean => {
        if (ball.id === 8) return false;
        if (currentPlayer.ballType === "solid")
          return ball.id >= 1 && ball.id <= 7;
        return ball.id >= 9 && ball.id <= 15;
      };

      if (!hit) {
        shouldChangeTurn = true;
        givesBallInHand = true;
        messageText = "❌ Không chạm bi! Đối thủ có ball in hand";
        console.log("[DETERMINED] Không chạm bi");
      } else if (ball8 && !hasRemainingBalls(currentIndex)) {
        gameOver = true;
        winner = currentPlayer.id;
        winReason = "ball8_win";
        newPlayers[currentIndex].score += 50;
        messageText = `🏆 ${currentPlayer.name} CHIẾN THẮNG!`;
        console.log("[DETERMINED] Vô bi 8 → thắng");
      } else if (!hasRemainingBalls(currentIndex)) {
        if (hit.id !== 8) {
          shouldChangeTurn = true;
          givesBallInHand = true;
          messageText = "❌ Phải đánh bi 8! Đối thủ có ball in hand";
          console.log("[DETERMINED] Đã hết bi nhưng chạm sai bi");
        } else {
          shouldChangeTurn = true;
          messageText = "⚫ Trượt bi 8. Đổi lượt!";
          console.log("[DETERMINED] Trượt bi 8");
        }
      } else if (hit.id !== 8 && !isCorrectBall(hit)) {
        shouldChangeTurn = true;
        givesBallInHand = true;
        messageText = "❌ Chạm sai bi! Đối thủ có ball in hand";
        console.log("[DETERMINED] Chạm sai loại bi");
      } else if (pocketedBalls.length > 0) {
        const correctBalls = pocketedBalls.filter(
          (b) => b.id !== 8 && isCorrectBall(b),
        );

        if (correctBalls.length > 0) {
          newPlayers[currentIndex].score +=
            correctBalls.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `🎯 Vô ${correctBalls.length} bi! +${correctBalls.length * 10}Đ`;
          shouldChangeTurn = false;
          console.log("[DETERMINED] Vô bi đúng");
        } else {
          shouldChangeTurn = true;
          messageText = "⚫ Vô bi đối thủ. Đổi lượt!";
          console.log("[DETERMINED] Vô bi sai");
        }
      } else {
        shouldChangeTurn = true;
        messageText = "⚫ Không vô bi. Đổi lượt!";
        console.log("[DETERMINED] Chạm bi nhưng không vô");
      }
    }

    // ✅ KIỂM TRA GAME OVER
    if (gameOver && winner) {
      endGame(winner, winReason);
    } else {
      setGameState((prevState) => ({
        ...prevState,
        players: newPlayers,
        currentPlayer: shouldChangeTurn
          ? prevState.currentPlayer === 1
            ? 2
            : 1
          : prevState.currentPlayer,
        isBreak: false,
        turnEnded: false,
      }));

      turnPhase.current = newPhase;

      setBallInHand(givesBallInHand);
      setBallInHandPlaced(false);
      setMessage(messageText);
      setTimeout(() => setMessage(""), 3000);
    }

    ballsPocketedThisTurn.current.clear();
    cueBallPocketed.current = false;
    firstBallHit.current = null;
    hasShot.current = false;
    isProcessingTurn.current = false;
    ballsTouchedCushion.current = false;
  };

  const shootCueBall = (angle: number, power: number) => {
    if (ballInHand && !ballInHandPlaced) {
      return;
    }

    ballsPocketedThisTurn.current.clear();
    cueBallPocketed.current = false;
    firstBallHit.current = null;
    hasShot.current = false;
    isProcessingTurn.current = false;
    ballsTouchedCushion.current = false;

    setBalls((prev) => {
      const next = [...prev];
      next[0].vx = Math.cos(angle) * power;
      next[0].vy = Math.sin(angle) * power;
      return next;
    });

    hasShot.current = true;

    setBallInHand(false);
    setBallInHandPlaced(false);
  };

  const setCueBallPosition = (x: number, y: number) => {
    setBalls((prev) => {
      const next = [...prev];
      next[0].x = x;
      next[0].y = y;
      next[0].vx = 0;
      next[0].vy = 0;
      next[0].isPocketed = false;
      return next;
    });
  };

  const getStateSnapshot = (): SerializedGameState => ({
    balls: balls.map((b) => ({ ...b })),
    gameState: {
      currentPlayer: gameState.currentPlayer,
      players: [
        { ...gameState.players[0] },
        { ...gameState.players[1] },
      ],
      isBreak: gameState.isBreak,
      turnEnded: gameState.turnEnded,
    },
    message,
    ballInHand,
    ballInHandPlaced,
  });

  const applyRemoteState = (state: SerializedGameState) => {
    setBalls(state.balls.map((b) => ({ ...b })));
    setGameState({
      currentPlayer: state.gameState.currentPlayer,
      players: [
        { ...state.gameState.players[0] },
        { ...state.gameState.players[1] },
      ],
      isBreak: state.gameState.isBreak,
      turnEnded: state.gameState.turnEnded,
    });
    setMessage(state.message);
    setBallInHand(state.ballInHand);
    setBallInHandPlaced(state.ballInHandPlaced);
    hasShot.current = false;
    isProcessingTurn.current = false;
  };

  const applyRemoteGameResult = (result: GameResult) => {
    setGameResult(result);
    setShowGameResult(true);
  };

  const moveCueBall = (x: number, y: number) => {
    if (!ballInHand) return;

    const minX = BALL_RADIUS + 10;
    const maxX = TABLE_WIDTH - BALL_RADIUS - 10;
    const minY = BALL_RADIUS + 10;
    const maxY = TABLE_HEIGHT - BALL_RADIUS - 10;

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return;
    }

    const wouldCollide = balls.some((ball) => {
      if (ball.id === 0 || ball.isPocketed) return false;

      const dx = x - ball.x;
      const dy = y - ball.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      return distance < BALL_RADIUS * 2;
    });

    if (wouldCollide) {
      return;
    }

    setBalls((prev) => {
      const next = [...prev];
      next[0].x = x;
      next[0].y = y;
      next[0].vx = 0;
      next[0].vy = 0;
      return next;
    });

    setBallInHandPlaced(true);
  };

  const canShowPrediction = (aimedBall: Ball | null) => {
    const currentPlayer = gameState.players[gameState.currentPlayer - 1];
    if (!aimedBall || aimedBall.id === 0) return false;

    if (currentPlayer.ballType === "none") {
      return aimedBall.id !== 8;
    }

    if (currentPlayer.ballType === "solid") {
      return aimedBall.id >= 1 && aimedBall.id <= 7;
    } else {
      return aimedBall.id >= 9 && aimedBall.id <= 15;
    }
  };

  const isWrongBall = (aimedBall: Ball | null): boolean => {
    if (!aimedBall || aimedBall.id === 0) return false;

    const currentPlayer = gameState.players[gameState.currentPlayer - 1];

    if (currentPlayer.ballType === "none") {
      return aimedBall.id === 8;
    }

    const hasRemaining = balls.some((b) => {
      if (b.isPocketed || b.id === 0 || b.id === 8) return false;
      if (currentPlayer.ballType === "solid") return b.id >= 1 && b.id <= 7;
      return b.id >= 9 && b.id <= 15;
    });

    if (!hasRemaining) {
      return aimedBall.id !== 8;
    }

    if (aimedBall.id === 8) return true;

    if (currentPlayer.ballType === "solid") {
      return aimedBall.id >= 9 && aimedBall.id <= 15;
    } else {
      return aimedBall.id >= 1 && aimedBall.id <= 7;
    }
  };

  /** Xử lý forfeit: người rời bàn THUA, đối thủ thắng.
   * @param forfeitingPlayerId - ID người chơi đang rời bàn (1 = host, 2 = guest)
   */
  const handleForfeit = (forfeitingPlayerId: 1 | 2) => {
    const winner = forfeitingPlayerId === 1 ? 2 : 1;
    endGame(winner, "forfeit");
  };

  /** Chuyển lượt khi hết giờ (không đánh). Đối thủ được ball in hand. */
  const forceSwitchTurn = () => {
    hasShot.current = false;
    isProcessingTurn.current = false;
    setGameState((prev) => ({
      ...prev,
      currentPlayer: prev.currentPlayer === 1 ? 2 : 1,
    }));
    setBallInHand(true);
    setBallInHandPlaced(false);
    setMessage("⏱ Hết giờ! Đổi lượt. Đối thủ có ball in hand");
    setTimeout(() => setMessage(""), 3000);
  };

  const resetGame = () => {
    setBalls(initialBalls);
    const randomFirstPlayer = (Math.random() < 0.5 ? 1 : 2) as 1 | 2;
    setGameState({
      currentPlayer: randomFirstPlayer,
      players: initialPlayers,
      isBreak: true,
      turnEnded: false,
    });
    setMessage(
      `🎱 Phá bi! ${initialPlayers[randomFirstPlayer - 1].name} đánh trước`,
    );
    setBallInHand(false);
    setBallInHandPlaced(false);
    setShowGameResult(false);
    setGameResult(null);

    ballsPocketedThisTurn.current.clear();
    cueBallPocketed.current = false;
    firstBallHit.current = null;
    hasShot.current = false;
    isProcessingTurn.current = false;
    ballsTouchedCushion.current = false;
    turnPhase.current = "break";
    turnCounter.current = 0;
    ballsPocketedCount.current = { player1: 0, player2: 0 };

    clearPredictionCache();
  };

  return {
    balls,
    gameState,
    message,
    ballInHand,
    ballInHandPlaced,
    shootCueBall,
    moveCueBall,
    resetGame,
    canShowPrediction,
    isWrongBall,
    showGameResult,
    gameResult,
    setShowGameResult,
    handleForfeit,
    forceSwitchTurn,
    // Multiplayer sync
    getStateSnapshot,
    applyRemoteState,
    applyRemoteGameResult,
    setCueBallPosition,
  };
};

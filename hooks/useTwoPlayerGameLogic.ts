// hooks/useTwoPlayerGameLogic.ts - PHẦN 1/2
import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { getInitialBallsByMode } from "../constants/billiard";
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
import type { GameMode } from "../context/gameContext";

export interface SerializedGameState {
  balls: Ball[];
  gameState: GameState;
  message: string;
  ballInHand: boolean;
  ballInHandPlaced: boolean;
  pushOutAvailableFor: 1 | 2 | null;
  pushOutDecisionPending: {
    decider: 1 | 2;
    shooter: 1 | 2;
  } | null;
}

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
    winReason: "normal" | "forfeit" | "ball8_early" | "ball8_win" | "ball9_win" | "carom_win";
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

export const useTwoPlayerGameLogic = (options?: {
  onGameOver?: (result: GameResult) => void;
  gameMode?: GameMode;
}) => {
  const MOTION_EPSILON = 0.01;
  const MAX_SUBSTEPS = Platform.OS === "web" ? 8 : 4;
  const ENABLE_DEBUG_LOGS = false;
  const debugLog = (...args: unknown[]) => {
    if (ENABLE_DEBUG_LOGS) {
      console.log(...args);
    }
  };
  const REMOTE_BLEND_DISTANCE = BALL_RADIUS * 1.8;
  const REMOTE_POSITION_BLEND = 0.45;
  const REMOTE_VELOCITY_BLEND = 0.6;
  const mode = options?.gameMode ?? "8ball";
  const isNineBallMode = mode === "9ball";
  const isThreeCushionMode = mode === "3cushion";
  const [balls, setBalls] = useState<Ball[]>(getInitialBallsByMode(mode));
  const [gameState, setGameState] = useState<GameState>({
    currentPlayer: 1,
    players: initialPlayers,
    isBreak: true,
    turnEnded: false,
  });
  const [message, setMessage] = useState<string>(GAME_MESSAGES.BREAK_SHOT);
  const [ballInHand, setBallInHand] = useState(false);
  const [ballInHandPlaced, setBallInHandPlaced] = useState(false);
  const [pushOutAvailableFor, setPushOutAvailableFor] = useState<1 | 2 | null>(null);
  const [pushOutDecisionPending, setPushOutDecisionPending] = useState<{
    decider: 1 | 2;
    shooter: 1 | 2;
  } | null>(null);

  const [showGameResult, setShowGameResult] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [gameStartTime] = useState(Date.now());

  const animationFrame = useRef<number | null>(null);
  const ballsPocketedThisTurn = useRef<Set<number>>(new Set());
  const cueBallPocketed = useRef(false);
  const firstBallHit = useRef<Ball | null>(null);
  const requiredFirstBallId = useRef<number | null>(1);
  const currentShotIsPushOut = useRef(false);
  const hasShot = useRef(false);
  const isProcessingTurn = useRef(false);
  const ballsTouchedCushion = useRef(false);
  const ballsTouchedCushionIds = useRef<Set<number>>(new Set());
  const turnPhase = useRef<"break" | "open" | "determined">("break");
  const turnCounter = useRef(0);
  const ballsPocketedCount = useRef<{ player1: number; player2: number }>({
    player1: 0,
    player2: 0,
  });
  const caromHitOrder = useRef<number[]>([]);
  const caromCueCushionCount = useRef(0);
  const caromCushionsBeforeSecondHit = useRef(0);

  const getLowestBallIdOnTable = (currentBalls: Ball[]): number | null => {
    const remaining = currentBalls
      .filter((b) => b.id > 0 && !b.isPocketed)
      .map((b) => b.id);
    if (!remaining.length) return null;
    return Math.min(...remaining);
  };

  const spotNineBall = () => {
    setBalls((prev) => {
      const next = prev.map((b) => ({ ...b }));
      const nineIndex = next.findIndex((b) => b.id === 9);
      if (nineIndex === -1) return prev;

      const startX = 370;
      const startY = 175;
      let spotX = startX;
      const step = BALL_RADIUS * 2 + 1;

      const wouldCollide = (x: number) =>
        next.some(
          (b, idx) =>
            idx !== nineIndex &&
            !b.isPocketed &&
            Math.hypot(b.x - x, b.y - startY) < BALL_RADIUS * 2
        );

      while (wouldCollide(spotX) && spotX <= TABLE_WIDTH - BALL_RADIUS - 10) {
        spotX += step;
      }

      next[nineIndex].isPocketed = false;
      next[nineIndex].x = spotX;
      next[nineIndex].y = startY;
      next[nineIndex].vx = 0;
      next[nineIndex].vy = 0;
      return next;
    });
  };

  const getGameDuration = (): string => {
    const duration = Math.floor((Date.now() - gameStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const endGame = (
    winnerId: number,
    winReason: "normal" | "forfeit" | "ball8_early" | "ball8_win" | "ball9_win" | "carom_win",
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

  const getPhysicsSubsteps = (currentBalls: Ball[]): number => {
    const maxSpeed = currentBalls.reduce((max, ball) => {
      if (ball.isPocketed) return max;
      const speed = Math.hypot(ball.vx, ball.vy);
      return speed > max ? speed : max;
    }, 0);
    if (maxSpeed <= BALL_RADIUS * 0.45) return 1;
    return Math.min(
      MAX_SUBSTEPS,
      Math.max(1, Math.ceil(maxSpeed / (BALL_RADIUS * 0.45))),
    );
  };

  /* ================= GAME LOOP ================= */
  useEffect(() => {
    const updateGame = () => {
      setBalls((prev) => {
        const hasActiveMotion = prev.some(
          (b) =>
            !b.isPocketed &&
            (Math.abs(b.vx) > MOTION_EPSILON || Math.abs(b.vy) > MOTION_EPSILON),
        );
        if (!hasActiveMotion) {
          return prev;
        }

        const next = prev.map((b) => ({ ...b }));
        const substeps = getPhysicsSubsteps(next);
        const dt = 1 / substeps;

        for (let step = 0; step < substeps; step++) {
          next.forEach((ball) => {
            if (ball.isPocketed) return;
            ball.x += ball.vx * dt;
            ball.y += ball.vy * dt;
          });

          if (!isThreeCushionMode) {
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
                  } else if (hasShot.current) {
                    ballsPocketedThisTurn.current.add(ball.id);
                  }
                }
              }
            });
          }

          if (!ballInHand) {
            for (let i = 0; i < next.length; i++) {
              for (let j = i + 1; j < next.length; j++) {
                if (!next[i].isPocketed && !next[j].isPocketed) {
                  if (checkCollision(next[i], next[j])) {
                    if (next[i].id === 0 || next[j].id === 0) {
                      const hitBall = next[i].id === 0 ? next[j] : next[i];
                      if (!firstBallHit.current && hasShot.current) {
                        firstBallHit.current = hitBall;
                      }
                      if (isThreeCushionMode && hasShot.current && hitBall.id !== 0) {
                        const alreadyHit = caromHitOrder.current.includes(hitBall.id);
                        if (!alreadyHit) {
                          caromHitOrder.current.push(hitBall.id);
                          if (caromHitOrder.current.length === 2) {
                            caromCushionsBeforeSecondHit.current =
                              caromCueCushionCount.current;
                          }
                        }
                      }
                    }
                    resolveCollision(next[i], next[j]);
                  }
                }
              }

              const hitWall = checkWallCollision(next[i]);
              if (hitWall && hasShot.current) {
                ballsTouchedCushion.current = true;
                ballsTouchedCushionIds.current.add(next[i].id);
                if (isThreeCushionMode && next[i].id === 0) {
                  caromCueCushionCount.current += 1;
                }
              }
            }
          } else {
            for (let i = 0; i < next.length; i++) {
              if (next[i].id !== 0) {
                checkWallCollision(next[i]);
              }
            }
            checkWallCollision(next[0]);
          }
        }

        next.forEach(applyFriction);
        next.forEach((ball) => {
          if (Math.abs(ball.vx) < MOTION_EPSILON) ball.vx = 0;
          if (Math.abs(ball.vy) < MOTION_EPSILON) ball.vy = 0;
        });

        return next;
      });

      animationFrame.current = requestAnimationFrame(updateGame);
    };

    animationFrame.current = requestAnimationFrame(updateGame);
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [ballInHand, isThreeCushionMode]);

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
          debugLog("[END TURN CHECK] Bi vẫn đang lăn, chờ thêm...");
          isProcessingTurn.current = false;
        } else {
          endTurn(balls);
        }
      }, 500);
    }
  }, [balls, ballInHand]);


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
    let winReason: "normal" | "forfeit" | "ball8_early" | "ball8_win" | "ball9_win" | "carom_win" =
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

    if (isThreeCushionMode) {
      const currentPlayerId = gameState.currentPlayer as 1 | 2;
      const opponentPlayerId = (currentPlayerId === 1 ? 2 : 1) as 1 | 2;
      const hasTwoTargetHits = caromHitOrder.current.length >= 2;
      const cushionsBeforeSecondHit = caromCushionsBeforeSecondHit.current;
      const isValidCarom = hasTwoTargetHits && cushionsBeforeSecondHit >= 3;
      let nextPlayerId = currentPlayerId;

      if (isValidCarom) {
        newPlayers[currentIndex].score += GAME_CONFIG.POINTS_PER_BALL;
        const newScore = newPlayers[currentIndex].score;
        if (newScore >= GAME_CONFIG.THREE_CUSHION_TARGET_POINTS) {
          gameOver = true;
          winner = currentPlayerId;
          winReason = "carom_win";
          messageText = "Đủ điểm 3 băng. Thắng trận.";
        } else {
          messageText = `Carom hợp lệ (+${GAME_CONFIG.POINTS_PER_BALL}). Tiếp tục lượt.`;
        }
      } else {
        shouldChangeTurn = true;
        nextPlayerId = opponentPlayerId;
        messageText = !hasTwoTargetHits
          ? "Chưa chạm đủ 2 bi mục tiêu. Đổi lượt."
          : "Chưa đủ 3 băng trước khi chạm bi thứ hai. Đổi lượt.";
      }

      if (gameOver && winner) {
        endGame(winner, winReason);
      } else {
        setGameState((prevState) => ({
          ...prevState,
          players: newPlayers,
          currentPlayer: shouldChangeTurn ? nextPlayerId : currentPlayerId,
          isBreak: false,
          turnEnded: false,
        }));
        setBallInHand(false);
        setBallInHandPlaced(false);
        setPushOutAvailableFor(null);
        setPushOutDecisionPending(null);
        setMessage(messageText);
        setTimeout(() => setMessage(""), 2500);
      }

      ballsPocketedThisTurn.current.clear();
      cueBallPocketed.current = false;
      firstBallHit.current = null;
      hasShot.current = false;
      isProcessingTurn.current = false;
      ballsTouchedCushion.current = false;
      ballsTouchedCushionIds.current.clear();
      currentShotIsPushOut.current = false;
      requiredFirstBallId.current = 1;
      caromHitOrder.current = [];
      caromCueCushionCount.current = 0;
      caromCushionsBeforeSecondHit.current = 0;
      return;
    }

    if (isNineBallMode) {
      const hit = firstBallHit.current;
      const requiredBallId =
        requiredFirstBallId.current ?? getLowestBallIdOnTable(currentBalls);
      const cushionTouches = ballsTouchedCushionIds.current.size;
      const ball9Pocketed = pocketedBalls.some((b) => b.id === 9);
      const pocketedCount = pocketedBalls.filter((b) => b.id !== 9).length;
      const currentPlayerId = gameState.currentPlayer as 1 | 2;
      const opponentPlayerId = (currentPlayerId === 1 ? 2 : 1) as 1 | 2;
      let nextPlayerId = currentPlayerId;
      let nextPushOutAvailableFor: 1 | 2 | null = null;
      let nextPushOutDecision: { decider: 1 | 2; shooter: 1 | 2 } | null = null;

      if (pocketedCount > 0) {
        newPlayers[currentIndex].score +=
          pocketedCount * GAME_CONFIG.POINTS_PER_BALL;
      }

      if (currentShotIsPushOut.current) {
        if (cueBallPocketed.current) {
          shouldChangeTurn = true;
          givesBallInHand = true;
          messageText = "Push-out lỗi: đối thủ được đặt bi tự do.";
          if (ball9Pocketed) spotNineBall();
        } else {
          shouldChangeTurn = true;
          givesBallInHand = false;
          if (ball9Pocketed) spotNineBall();
          nextPushOutDecision = {
            decider: opponentPlayerId,
            shooter: currentPlayerId,
          };
          messageText =
            "Push-out hợp lệ. Đối thủ chọn Đánh tiếp hoặc Trả lượt.";
        }
      } else if (gameState.isBreak) {
        const breakLegal =
          !!hit &&
          hit.id === 1 &&
          !cueBallPocketed.current &&
          (pocketedBalls.length > 0 || cushionTouches >= 4);

        if (!breakLegal) {
          shouldChangeTurn = true;
          givesBallInHand = true;
          messageText = "Phá bi không hợp lệ. Đối thủ được đặt bi tự do.";
          if (ball9Pocketed) spotNineBall();
        } else if (ball9Pocketed) {
          gameOver = true;
          winner = currentPlayerId;
          winReason = "ball9_win";
          newPlayers[currentIndex].score += 50;
          messageText = "Vào bi 9 hợp lệ ở cú phá. Thắng ván.";
        } else {
          shouldChangeTurn = pocketedBalls.length === 0;
          givesBallInHand = false;
          nextPlayerId = shouldChangeTurn ? opponentPlayerId : currentPlayerId;
          nextPushOutAvailableFor = nextPlayerId;
          messageText = shouldChangeTurn
            ? "Phá bi hợp lệ, đổi lượt."
            : "Phá bi hợp lệ, tiếp tục lượt.";
        }
      } else {
        const hasValidFirstContact = !!hit && hit.id === requiredBallId;
        const hasRailOrPocket =
          pocketedBalls.length > 0 || ballsTouchedCushionIds.current.size > 0;

        if (!hasValidFirstContact) {
          shouldChangeTurn = true;
          givesBallInHand = true;
          messageText = "Chưa chạm bi nhỏ nhất trước. Đối thủ được đặt bi tự do.";
          if (ball9Pocketed) spotNineBall();
        } else if (cueBallPocketed.current) {
          shouldChangeTurn = true;
          givesBallInHand = true;
          messageText = "Bi trắng vào lỗ. Đối thủ được đặt bi tự do.";
          if (ball9Pocketed) spotNineBall();
        } else if (!hasRailOrPocket) {
          shouldChangeTurn = true;
          givesBallInHand = true;
          messageText = "Không bi chạm băng/vào lỗ. Đối thủ đặt bi tự do.";
          if (ball9Pocketed) spotNineBall();
        } else if (ball9Pocketed) {
          gameOver = true;
          winner = currentPlayerId;
          winReason = "ball9_win";
          newPlayers[currentIndex].score += 50;
          messageText = "Vào bi 9 hợp lệ. Thắng ván.";
        } else {
          shouldChangeTurn = pocketedBalls.length === 0;
          givesBallInHand = false;
          messageText = shouldChangeTurn
            ? "Không vào bi, đổi lượt."
            : "Vào bi hợp lệ, tiếp tục lượt.";
        }
      }

      if (gameOver && winner) {
        setPushOutAvailableFor(null);
        setPushOutDecisionPending(null);
        endGame(winner, winReason);
      } else {
        if (shouldChangeTurn) {
          nextPlayerId = opponentPlayerId;
        }
        setGameState((prevState) => ({
          ...prevState,
          players: newPlayers,
          currentPlayer: nextPlayerId,
          isBreak: false,
          turnEnded: false,
        }));
        setPushOutAvailableFor(nextPushOutAvailableFor);
        setPushOutDecisionPending(nextPushOutDecision);
        setBallInHand(givesBallInHand);
        setBallInHandPlaced(false);
        setMessage(messageText);
        setTimeout(() => setMessage(""), 3000);
      }

      turnPhase.current = "determined";
      ballsPocketedThisTurn.current.clear();
      cueBallPocketed.current = false;
      firstBallHit.current = null;
      hasShot.current = false;
      isProcessingTurn.current = false;
      ballsTouchedCushion.current = false;
      ballsTouchedCushionIds.current.clear();
      currentShotIsPushOut.current = false;
      requiredFirstBallId.current = getLowestBallIdOnTable(currentBalls);
      return;
    }

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

    debugLog("=== END TURN DEBUG ===");
    debugLog("firstBallHit:", firstBallHit.current?.id);
    debugLog("cueBallPocketed:", cueBallPocketed.current);
    debugLog(
      "pocketedBalls IDs:",
      pocketedBalls.map((b) => b.id),
    );
    debugLog("turnPhase:", turnPhase.current);
    debugLog("currentPlayer ballType:", currentPlayer.ballType);
    debugLog("======================");

    if (ball8 && hasRemainingBalls(currentIndex)) {
      gameOver = true;
      winner = currentPlayer.id === 1 ? 2 : 1;
      winReason = "ball8_early";
      messageText = `🤖 ${currentPlayer.name} đánh bi 8 khi chưa hết bi - THUA!`;
    } else if (cueBallPocketed.current) {
      /* BI TRáº®NG VĂ€O Lá»– */
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
      /* CÚ KHAI CUỘC */
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
        messageText = `🎯 ${currentPlayer.name} chọn BI MÀU (1-7)! +${solids.length * 10}Đ`;
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
        debugLog("[OPEN PHASE] Không chạm bi");
      } else if (firstBallHit.current.id === 8) {
        shouldChangeTurn = true;
        givesBallInHand = true;
        messageText =
          "❌ Không được chạm bi 8 đầu tiên! Đối thủ có ball in hand";
        debugLog("[OPEN PHASE] Chạm bi 8");
      } else if (pocketedBalls.length > 0) {
        if (solids.length > 0 && stripes.length === 0) {
          assignBallType("solid");
          newPlayers[currentIndex].score +=
            solids.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `🎯 ${currentPlayer.name} chọn BI MÀU (1-7)! +${solids.length * 10}Đ`;
          shouldChangeTurn = false;
          debugLog("[OPEN PHASE] Vô solid → xác định solid");
        } else if (stripes.length > 0 && solids.length === 0) {
          assignBallType("striped");
          newPlayers[currentIndex].score +=
            stripes.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `🎯 ${currentPlayer.name} chọn BI KHOANG (9-15)! +${stripes.length * 10}Đ`;
          shouldChangeTurn = false;
          debugLog("[OPEN PHASE] Vô striped → xác định striped");
        } else if (solids.length > 0 && stripes.length > 0) {
          newPlayers[currentIndex].score +=
            pocketedBalls.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `⚫ Vô 2 loại! Đánh tiếp để quyết định. +${pocketedBalls.length * 10}Đ`;
          shouldChangeTurn = false;
          debugLog("[OPEN PHASE] Vô 2 loại → Đánh tiếp");
        }
      } else {
        shouldChangeTurn = true;
        messageText = "⚫ Không vô bi. Đổi lượt!";
        debugLog("[OPEN PHASE] Chạm bi nhưng không vô");
      }
    } else {
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
        debugLog("[DETERMINED] Không chạm bi");
      } else if (ball8 && !hasRemainingBalls(currentIndex)) {
        gameOver = true;
        winner = currentPlayer.id;
        winReason = "ball8_win";
        newPlayers[currentIndex].score += 50;
        messageText = `🏆 ${currentPlayer.name} CHIẾN THẮNG!`;
        debugLog("[DETERMINED] Vô bi 8 → thắng");
      } else if (!hasRemainingBalls(currentIndex)) {
        if (hit.id !== 8) {
          shouldChangeTurn = true;
          givesBallInHand = true;
          messageText = "❌ Phải đánh bi 8! Đối thủ có ball in hand";
          debugLog("[DETERMINED] Đã hết bi nhưng chạm sai bi");
        } else {
          shouldChangeTurn = true;
          messageText = "⚫ Trượt bi 8. Đổi lượt!";
          debugLog("[DETERMINED] Trượt bi 8");
        }
      } else if (hit.id !== 8 && !isCorrectBall(hit)) {
        shouldChangeTurn = true;
        givesBallInHand = true;
        messageText = "❌ Chạm sai bi! Đối thủ có ball in hand";
        debugLog("[DETERMINED] Chạm sai loại bi");
      } else if (pocketedBalls.length > 0) {
        const correctBalls = pocketedBalls.filter(
          (b) => b.id !== 8 && isCorrectBall(b),
        );

        if (correctBalls.length > 0) {
          newPlayers[currentIndex].score +=
            correctBalls.length * GAME_CONFIG.POINTS_PER_BALL;
          messageText = `🎯 Vô ${correctBalls.length} bi! +${correctBalls.length * 10}Đ`;
          shouldChangeTurn = false;
          debugLog("[DETERMINED] Vô bi đúng");
        } else {
          shouldChangeTurn = true;
          messageText = "⚫ Vô bi đối thủ. Đổi lượt!";
          debugLog("[DETERMINED] Vô bi sai");
        }
      } else {
        shouldChangeTurn = true;
        messageText = "⚫ Không vô bi. Đổi lượt!";
        debugLog("[DETERMINED] Chạm bi nhưng không vô");
      }
    }

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
    ballsTouchedCushionIds.current.clear();
    currentShotIsPushOut.current = false;
    requiredFirstBallId.current = getLowestBallIdOnTable(currentBalls);
    setPushOutAvailableFor(null);
    setPushOutDecisionPending(null);
    caromHitOrder.current = [];
    caromCueCushionCount.current = 0;
    caromCushionsBeforeSecondHit.current = 0;
  };

  const shootCueBall = (angle: number, power: number) => {
    if (ballInHand && !ballInHandPlaced) {
      return;
    }
    if (pushOutDecisionPending) {
      return;
    }

    ballsPocketedThisTurn.current.clear();
    cueBallPocketed.current = false;
    firstBallHit.current = null;
    hasShot.current = false;
    isProcessingTurn.current = false;
    ballsTouchedCushion.current = false;
    ballsTouchedCushionIds.current.clear();
    requiredFirstBallId.current = getLowestBallIdOnTable(balls);
    setPushOutAvailableFor(null);
    caromHitOrder.current = [];
    caromCueCushionCount.current = 0;
    caromCushionsBeforeSecondHit.current = 0;

    setBalls((prev) => {
      const next = [...prev];
      next[0].vx = Math.cos(angle) * power;
      next[0].vy = Math.sin(angle) * power;
      return next;
    });

    hasShot.current = true;

    setBallInHand(false);
    setBallInHandPlaced(false);
    setPushOutDecisionPending(null);
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
    pushOutAvailableFor,
    pushOutDecisionPending,
  });

  const applyRemoteState = (state: SerializedGameState) => {
    const remoteMoving = state.balls.some(
      (b) =>
        !b.isPocketed &&
        (Math.abs(b.vx) > MOTION_EPSILON || Math.abs(b.vy) > MOTION_EPSILON),
    );

    setBalls((prev) => {
      const prevById = new Map<number, Ball>();
      prev.forEach((b) => prevById.set(b.id, b));

      return state.balls.map((remoteBall) => {
        const prevBall = prevById.get(remoteBall.id);
        if (!prevBall) return { ...remoteBall };

        const changedPocketState = prevBall.isPocketed !== remoteBall.isPocketed;
        if (!remoteMoving || changedPocketState || remoteBall.isPocketed) {
          return { ...remoteBall };
        }

        const dist = Math.hypot(remoteBall.x - prevBall.x, remoteBall.y - prevBall.y);
        if (dist > REMOTE_BLEND_DISTANCE) {
          return { ...remoteBall };
        }

        return {
          ...remoteBall,
          x: prevBall.x + (remoteBall.x - prevBall.x) * REMOTE_POSITION_BLEND,
          y: prevBall.y + (remoteBall.y - prevBall.y) * REMOTE_POSITION_BLEND,
          vx: prevBall.vx + (remoteBall.vx - prevBall.vx) * REMOTE_VELOCITY_BLEND,
          vy: prevBall.vy + (remoteBall.vy - prevBall.vy) * REMOTE_VELOCITY_BLEND,
        };
      });
    });

    setGameState((prev) => {
      const next = state.gameState;
      const samePlayers =
        prev.players.length === next.players.length &&
        prev.players.every((p, idx) => {
          const n = next.players[idx];
          return (
            p.id === n.id &&
            p.name === n.name &&
            p.score === n.score &&
            p.ballType === n.ballType &&
            p.color === n.color
          );
        });

      const unchanged =
        prev.currentPlayer === next.currentPlayer &&
        prev.isBreak === next.isBreak &&
        prev.turnEnded === next.turnEnded &&
        samePlayers;

      if (unchanged) return prev;
      return {
        currentPlayer: next.currentPlayer,
        players: [{ ...next.players[0] }, { ...next.players[1] }],
        isBreak: next.isBreak,
        turnEnded: next.turnEnded,
      };
    });

    setMessage(state.message);
    setBallInHand(state.ballInHand);
    setBallInHandPlaced(state.ballInHandPlaced);
    setPushOutAvailableFor(state.pushOutAvailableFor ?? null);
    setPushOutDecisionPending(state.pushOutDecisionPending ?? null);
    hasShot.current = false;
    isProcessingTurn.current = false;
    caromHitOrder.current = [];
    caromCueCushionCount.current = 0;
    caromCushionsBeforeSecondHit.current = 0;
  };

  const applyRemoteGameResult = (result: GameResult) => {
    setGameResult(result);
    setShowGameResult(true);
  };

  const declarePushOut = (): boolean => {
    if (!isNineBallMode) return false;
    if (pushOutAvailableFor !== gameState.currentPlayer) return false;
    if (hasShot.current) return false;
    currentShotIsPushOut.current = true;
    setPushOutAvailableFor(null);
    setMessage("Đã khai báo push-out.");
    setTimeout(() => setMessage(""), 1800);
    return true;
  };

  const choosePushOutDecision = (playFromHere: boolean) => {
    if (!pushOutDecisionPending) return;
    const { decider, shooter } = pushOutDecisionPending;
    const nextPlayer = playFromHere ? decider : shooter;
    setGameState((prev) => ({
      ...prev,
      currentPlayer: nextPlayer,
    }));
    setPushOutDecisionPending(null);
    setBallInHand(false);
    setBallInHandPlaced(false);
    setMessage(
      playFromHere
        ? "Đối thủ nhận đánh tiếp từ vị trí push-out."
        : "Đối thủ trả lượt cho người push-out."
    );
    setTimeout(() => setMessage(""), 2200);
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
    if (isThreeCushionMode) {
      return !!aimedBall && aimedBall.id !== 0;
    }

    if (isNineBallMode) {
      if (!aimedBall || aimedBall.id === 0) return false;
      const lowest = getLowestBallIdOnTable(balls);
      return lowest != null && aimedBall.id === lowest;
    }

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
    if (isThreeCushionMode) {
      return false;
    }

    if (isNineBallMode) {
      if (!aimedBall || aimedBall.id === 0) return false;
      const lowest = getLowestBallIdOnTable(balls);
      if (lowest == null) return false;
      return aimedBall.id !== lowest;
    }

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
    setBallInHand(isThreeCushionMode ? false : true);
    setBallInHandPlaced(false);
    setPushOutAvailableFor(null);
    setPushOutDecisionPending(null);
    setMessage(
      isThreeCushionMode
        ? "⏱ Hết giờ! Đổi lượt."
        : "⏱ Hết giờ! Đổi lượt. Đối thủ có ball in hand"
    );
    setTimeout(() => setMessage(""), 3000);
    caromHitOrder.current = [];
    caromCueCushionCount.current = 0;
    caromCushionsBeforeSecondHit.current = 0;
  };

  const resetGame = () => {
    setBalls(getInitialBallsByMode(mode));
    const firstPlayer = (mode === "ai" ? 1 : Math.random() < 0.5 ? 1 : 2) as 1 | 2;
    setGameState({
      currentPlayer: firstPlayer,
      players: initialPlayers,
      isBreak: true,
      turnEnded: false,
    });
    setMessage(
      isThreeCushionMode
        ? `3 băng: ${initialPlayers[firstPlayer - 1].name} đánh trước`
        : `🎱 Phá bi! ${initialPlayers[firstPlayer - 1].name} đánh trước`,
    );
    if (mode === "ai") {
      setMessage("Bạn đánh trước");
    }
    setBallInHand(false);
    setBallInHandPlaced(false);
    setPushOutAvailableFor(null);
    setPushOutDecisionPending(null);
    setShowGameResult(false);
    setGameResult(null);

    ballsPocketedThisTurn.current.clear();
    cueBallPocketed.current = false;
    firstBallHit.current = null;
    hasShot.current = false;
    isProcessingTurn.current = false;
    ballsTouchedCushion.current = false;
    ballsTouchedCushionIds.current.clear();
    currentShotIsPushOut.current = false;
    requiredFirstBallId.current = 1;
    turnPhase.current = "break";
    turnCounter.current = 0;
    ballsPocketedCount.current = { player1: 0, player2: 0 };
    caromHitOrder.current = [];
    caromCueCushionCount.current = 0;
    caromCushionsBeforeSecondHit.current = 0;

    clearPredictionCache();
  };

  return {
    balls,
    gameState,
    message,
    ballInHand,
    ballInHandPlaced,
    pushOutAvailableFor,
    pushOutDecisionPending,
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
    declarePushOut,
    choosePushOutDecision,
    // Multiplayer sync
    getStateSnapshot,
    applyRemoteState,
    applyRemoteGameResult,
    setCueBallPosition,
  };
};

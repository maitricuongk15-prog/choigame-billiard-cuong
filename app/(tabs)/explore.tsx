// app/(tabs)/explore(game).tsx - GAME BI-A + ĐỒNG BỘ MULTIPLAYER
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import Svg, {
  Circle,
  Line,
  Rect,
  Defs,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BALL_RADIUS,
  POCKETS,
  type Ball,
} from "../../utils/physics";
import { GAME_CONFIG, GAME_MESSAGES } from "../../constants/game";
import { getCueVisualTheme } from "../../constants/cueVisuals";
import {
  useTwoPlayerGameLogic,
  type SerializedGameState,
} from "../../hooks/useTwoPlayerGameLogic";
import { useAimControl } from "../../hooks/useAimControl";
import { useGameContext } from "../../context/gameContext";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { getEquippedCue } from "../../services/shopService";
import { settleRoomBet } from "../../services/roomService";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CueRow } from "../../types/cue";
import {
  isGameMoving,
  calculateAimLine,
  calculatePredictionDots,
  calculateCuePosition,
  getPowerLevel,
  getTouchCoordinates,
} from "../../utils/gameHelpers";
import {
  calculateTargetPredictions,
  findClosestTarget,
  calculateCueBallReflection,
} from "../../utils/predictionHelpers";
import GameResultScreen from "../gameResultScreen";

type GameStateBroadcastPacket = {
  seq: number;
  sentAt: number;
  state: SerializedGameState;
};

type AiSkillProfile = {
  elo: number;
  thinkMinMs: number;
  thinkMaxMs: number;
  angleJitter: number;
  powerJitter: number;
  targetPool: number;
  randomTargetChance: number;
  strategicShotChance: number;
  placementAttempts: number;
  placementSpread: number;
  basePower: number;
  distancePowerFactor: number;
  maxPower: number;
  lineClearanceMultiplier: number;
};

const AI_ELO_PRESETS: readonly AiSkillProfile[] = [
  {
    elo: 600,
    thinkMinMs: 700,
    thinkMaxMs: 1200,
    angleJitter: 0.14,
    powerJitter: 1.6,
    targetPool: 2,
    randomTargetChance: 0.18,
    strategicShotChance: 0.55,
    placementAttempts: 28,
    placementSpread: 1.15,
    basePower: 5.1,
    distancePowerFactor: 0.025,
    maxPower: 15.3,
    lineClearanceMultiplier: 1.02,
  },
  {
    elo: 1200,
    thinkMinMs: 500,
    thinkMaxMs: 900,
    angleJitter: 0.08,
    powerJitter: 0.95,
    targetPool: 1,
    randomTargetChance: 0.08,
    strategicShotChance: 0.82,
    placementAttempts: 42,
    placementSpread: 1,
    basePower: 5.3,
    distancePowerFactor: 0.028,
    maxPower: 15.8,
    lineClearanceMultiplier: 1.08,
  },
  {
    elo: 1800,
    thinkMinMs: 320,
    thinkMaxMs: 650,
    angleJitter: 0.035,
    powerJitter: 0.5,
    targetPool: 1,
    randomTargetChance: 0.02,
    strategicShotChance: 0.95,
    placementAttempts: 64,
    placementSpread: 0.9,
    basePower: 5.6,
    distancePowerFactor: 0.03,
    maxPower: 16.2,
    lineClearanceMultiplier: 1.14,
  },
  {
    elo: 2400,
    thinkMinMs: 180,
    thinkMaxMs: 420,
    angleJitter: 0.018,
    powerJitter: 0.22,
    targetPool: 1,
    randomTargetChance: 0,
    strategicShotChance: 1,
    placementAttempts: 96,
    placementSpread: 0.82,
    basePower: 5.8,
    distancePowerFactor: 0.031,
    maxPower: 16.5,
    lineClearanceMultiplier: 1.2,
  },
];

const distancePointToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) => {
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSquared = abx * abx + aby * aby;

  if (abLengthSquared <= 0.0001) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLengthSquared),
  );
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.hypot(px - closestX, py - closestY);
};

export default function BilliardGame() {
  const { roomId, roomHostId, roomConfig, player1Name, player2Name, setPlayerNames } =
    useGameContext();
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const gameChannelRef = useRef<RealtimeChannel | null>(null);
  const isMultiplayer = !!(roomId && roomId !== "RANDOM");
  const isAiMatch = !isMultiplayer && roomConfig?.gameMode === "ai";
  const isNineBallMode = roomConfig?.gameMode === "9ball";
  const isThreeCushionMode = roomConfig?.gameMode === "3cushion";
  const turnTimeLimit = isThreeCushionMode
    ? GAME_CONFIG.THREE_CUSHION_TURN_TIME_SECONDS
    : GAME_CONFIG.TURN_TIME_SECONDS;
  const isHost =
    isMultiplayer &&
    !!user &&
    !!roomHostId &&
    String(user.id) === String(roomHostId);
  const aiElo = isAiMatch
    ? Math.max(600, Math.min(2400, Number(roomConfig?.aiElo ?? 1200)))
    : 1200;
  const aiSkillProfile = useMemo(() => {
    return (
      AI_ELO_PRESETS.find((preset) => aiElo <= preset.elo) ??
      AI_ELO_PRESETS[AI_ELO_PRESETS.length - 1]
    );
  }, [aiElo]);

  const tableLayout = useMemo(() => {
    const isLandscapeViewport = screenWidth > screenHeight;
    const tablePadding = 10;
    const sidePanelWidth = 64;
    const horizontalGap = 15;
    const horizontalSafe = 36;
    const verticalReserved = isLandscapeViewport ? 250 : 320;

    const maxTableWidth =
      screenWidth -
      horizontalSafe -
      sidePanelWidth -
      horizontalGap -
      tablePadding * 2;
    const maxTableHeight = screenHeight - verticalReserved - tablePadding * 2;

    const rawScale = Math.min(
      maxTableWidth / TABLE_WIDTH,
      maxTableHeight / TABLE_HEIGHT,
    );

    // Allow upscaling on large landscape phones/tablets so table is not tiny.
    const tableScale = Math.max(
      0.62,
      Math.min(2.15, Number.isFinite(rawScale) ? rawScale : 1),
    );
    const renderedTableWidth = Math.round(TABLE_WIDTH * tableScale);
    const renderedTableHeight = Math.round(TABLE_HEIGHT * tableScale);
    const sliderHeight = Math.round(
      Math.max(170, Math.min(360, renderedTableHeight - 16)),
    );

    return {
      tablePadding,
      renderedTableWidth,
      renderedTableHeight,
      sliderHeight,
      tableScaleX: TABLE_WIDTH / renderedTableWidth,
      tableScaleY: TABLE_HEIGHT / renderedTableHeight,
    };
  }, [screenHeight, screenWidth]);

  const settledBetKeyRef = useRef<string | null>(null);
  const settleMatchResult = useCallback(
    (winnerSlot: number, source: string) => {
      if (!isMultiplayer || !roomId) return;
      if (!Number.isFinite(winnerSlot) || winnerSlot < 1 || winnerSlot > 4) return;

      const settleKey = `${roomId}:${winnerSlot}`;
      if (settledBetKeyRef.current === settleKey) return;
      settledBetKeyRef.current = settleKey;

      void settleRoomBet(roomId, winnerSlot).then(({ error }) => {
        if (error) {
          settledBetKeyRef.current = null;
          console.warn(`[BET] settle_room_bet (${source}) failed:`, error.message);
        }
      });
    },
    [isMultiplayer, roomId],
  );

  const {
    balls,
    gameState,
    message,
    ballInHand,
    ballInHandPlaced,
    resetGame,
    shootCueBall,
    moveCueBall,
    canShowPrediction,
    isWrongBall,
    showGameResult,
    gameResult,
    setShowGameResult,
    handleForfeit,
    forceSwitchTurn,
    getStateSnapshot,
    applyRemoteState,
    applyRemoteGameResult,
    setCueBallPosition,
    pushOutAvailableFor,
    pushOutDecisionPending,
    declarePushOut,
    choosePushOutDecision,
  } = useTwoPlayerGameLogic({
    gameMode: roomConfig?.gameMode,
    onGameOver: (result) => {
      settleMatchResult(result.winner.id, "onGameOver");

      if (isMultiplayer && gameChannelRef.current) {
        gameChannelRef.current.send({
          type: "broadcast",
          event: "game_over",
          payload: {
            ...result,
            player1Name,
            player2Name,
          },
        });
      }
    },
  });

  const [isDraggingCueBall, setIsDraggingCueBall] = useState(false);
  const [isAimingInBallInHand, setIsAimingInBallInHand] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(turnTimeLimit);
  const [equippedCue, setEquippedCue] = useState<CueRow | null>(null);
  const [turnTimeoutBlockShooting, setTurnTimeoutBlockShooting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const CUE_BALL_DRAG_INTERVAL_MS = 16;
  const CUE_BALL_DRAG_MIN_DELTA = 0.75;
  const mobileHitSlop = useMemo(
    () => ({ top: 14, bottom: 14, left: 14, right: 14 }),
    [],
  );

  const turnTimeoutBlockRef = useRef(false);
  const wasMovingRef = useRef(false);
  const ballsRef = useRef(balls);
  const guestReceivedStateRef = useRef(false);
  const initialBroadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestStateResponseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afterTurnChangeBroadcastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getStateSnapshotRef = useRef(getStateSnapshot);
  getStateSnapshotRef.current = getStateSnapshot;
  const forceSwitchTurnRef = useRef(forceSwitchTurn);
  forceSwitchTurnRef.current = forceSwitchTurn;
  const declarePushOutRef = useRef(declarePushOut);
  declarePushOutRef.current = declarePushOut;
  const choosePushOutDecisionRef = useRef(choosePushOutDecision);
  choosePushOutDecisionRef.current = choosePushOutDecision;
  const lastCueMoveBroadcastAtRef = useRef(0);
  const outgoingStateSeqRef = useRef(0);
  const latestAppliedRemoteSeqRef = useRef(0);
  const pendingRemoteStateRef = useRef<SerializedGameState | null>(null);
  const applyRemoteStateRafRef = useRef<number | null>(null);
  const sendGameStateRef = useRef<() => void>(() => {});
  const aiTurnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveCueBallRef = useRef(moveCueBall);
  const lastCueBallDragAtRef = useRef(0);
  const lastCueBallDragPosRef = useRef<{ x: number; y: number } | null>(null);
  moveCueBallRef.current = moveCueBall;

  const myPlayerNumber = isMultiplayer ? (isHost ? 1 : 2) : isAiMatch ? 1 : null;
  const isMyTurn = !isMultiplayer
    ? myPlayerNumber == null || gameState.currentPlayer === myPlayerNumber
    : isHost
      ? gameState.currentPlayer === myPlayerNumber
      : guestReceivedStateRef.current &&
        gameState.currentPlayer === myPlayerNumber;

  const player1DisplayName = player1Name?.trim() || gameState.players[0].name;
  const player2DisplayName =
    player2Name?.trim() ||
    (isAiMatch ? `Máy ELO ${aiSkillProfile.elo}` : gameState.players[1].name);
  sendGameStateRef.current = () => {
    if (!isHost || !isMultiplayer || !gameChannelRef.current) return;
    outgoingStateSeqRef.current += 1;
    const packet: GameStateBroadcastPacket = {
      seq: outgoingStateSeqRef.current,
      sentAt: Date.now(),
      state: getStateSnapshotRef.current(),
    };
    gameChannelRef.current.send({
      type: "broadcast",
      event: "game_state",
      payload: packet,
    });
  };

  useEffect(() => {
    if (!roomId) return;
    settledBetKeyRef.current = null;
    if (isMultiplayer && !isHost) return;
    resetGame();
  }, [roomId, roomConfig?.gameMode, roomConfig?.aiElo, isMultiplayer, isHost]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => {});

    return () => {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      ).catch(() => {});
    };
  }, []);

  useEffect(() => {
    ballsRef.current = balls;
  }, [balls]);

  useEffect(() => {
    if (!isAiMatch) return;
    const nextAiName = `Máy ELO ${aiSkillProfile.elo}`;
    if (player1Name === "Bạn" && player2Name === nextAiName) return;
    setPlayerNames("Bạn", nextAiName);
  }, [aiSkillProfile.elo, isAiMatch, player1Name, player2Name, setPlayerNames]);

  useEffect(() => {
    if (!user) {
      setEquippedCue(null);
      return;
    }

    getEquippedCue().then(({ cue, error }) => {
      if (error) {
        setEquippedCue(null);
        return;
      }
      setEquippedCue(cue);
    });
  }, [user]);

  useEffect(() => {
    if (!isMultiplayer || !roomId) return;

    if (!isHost) {
      guestReceivedStateRef.current = false;
      latestAppliedRemoteSeqRef.current = 0;
      pendingRemoteStateRef.current = null;
    } else {
      outgoingStateSeqRef.current = 0;
    }

    const channel = supabase.channel(`game:${roomId}`);
    gameChannelRef.current = channel;

    channel
      .on("broadcast", { event: "game_state" }, ({ payload }) => {
        if (isHost) return;
        const maybePacket = payload as
          | GameStateBroadcastPacket
          | SerializedGameState;
        const remoteSeq =
          typeof (maybePacket as GameStateBroadcastPacket).seq === "number"
            ? (maybePacket as GameStateBroadcastPacket).seq
            : null;
        const remoteState =
          (maybePacket as GameStateBroadcastPacket).state ??
          (maybePacket as SerializedGameState);

        if (!remoteState) return;
        if (remoteSeq != null && remoteSeq <= latestAppliedRemoteSeqRef.current) {
          return;
        }
        if (remoteSeq != null) {
          latestAppliedRemoteSeqRef.current = remoteSeq;
        }

        guestReceivedStateRef.current = true;
        pendingRemoteStateRef.current = remoteState;

        if (applyRemoteStateRafRef.current == null) {
          applyRemoteStateRafRef.current = requestAnimationFrame(() => {
            applyRemoteStateRafRef.current = null;
            const nextState = pendingRemoteStateRef.current;
            pendingRemoteStateRef.current = null;
            if (!nextState) return;
            applyRemoteState(nextState);
          });
        }
      })
      .on("broadcast", { event: "shot" }, ({ payload }) => {
        if (!isHost) return;
        const { angle, power: p, cueBallX, cueBallY } = payload as {
          angle: number;
          power: number;
          cueBallX?: number;
          cueBallY?: number;
        };
        if (cueBallX != null && cueBallY != null) {
          setCueBallPosition(cueBallX, cueBallY, true);
        }
        setTimeout(() => {
          shootCueBall(angle, p);
          setTimeout(() => sendGameStateRef.current(), 16);
        }, 50);
      })
      .on("broadcast", { event: "push_out" }, () => {
        if (!isHost) return;
        const didDeclare = declarePushOutRef.current();
        if (didDeclare) {
          setTimeout(() => sendGameStateRef.current(), 16);
        }
      })
      .on("broadcast", { event: "push_out_decision" }, ({ payload }) => {
        if (!isHost) return;
        const { playFromHere } = payload as { playFromHere: boolean };
        choosePushOutDecisionRef.current(playFromHere);
        setTimeout(() => sendGameStateRef.current(), 16);
      })
      .on("broadcast", { event: "cue_ball_move" }, ({ payload }) => {
        const { x, y, player } = payload as {
          x: number;
          y: number;
          player: 1 | 2;
        };
        if (player === myPlayerNumber) return;
        if (x == null || y == null) return;
        setCueBallPosition(x, y, true);
      })
      .on("broadcast", { event: "timeout_switch_turn" }, () => {
        if (!isHost) return;
        forceSwitchTurnRef.current();
        setTimeout(() => {
          sendGameStateRef.current();
        }, 100);
      })
      .on("broadcast", { event: "request_state" }, () => {
        if (!isHost) return;
        if (requestStateResponseTimeoutRef.current) {
          clearTimeout(requestStateResponseTimeoutRef.current);
        }
        requestStateResponseTimeoutRef.current = setTimeout(() => {
          requestStateResponseTimeoutRef.current = null;
          sendGameStateRef.current();
        }, 250);
      })
      .on("broadcast", { event: "game_over" }, ({ payload }) => {
        const { player1Name: p1, player2Name: p2, ...result } = payload as { player1Name?: string; player2Name?: string } & Parameters<typeof applyRemoteGameResult>[0];
        if (p1 != null || p2 != null) {
          setPlayerNames(p1 ?? player1Name, p2 ?? player2Name);
        }
        settleMatchResult(result.winner.id, "remote_game_over");
        applyRemoteGameResult(result);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (isHost) {
            initialBroadcastTimeoutRef.current = setTimeout(() => {
              sendGameStateRef.current();
              initialBroadcastTimeoutRef.current = null;
            }, 200);
          } else {
            channel.send({
              type: "broadcast",
              event: "request_state",
              payload: {},
            });
          }
        }
      });

    return () => {
      if (initialBroadcastTimeoutRef.current) {
        clearTimeout(initialBroadcastTimeoutRef.current);
        initialBroadcastTimeoutRef.current = null;
      }
      if (requestStateResponseTimeoutRef.current) {
        clearTimeout(requestStateResponseTimeoutRef.current);
        requestStateResponseTimeoutRef.current = null;
      }
      if (applyRemoteStateRafRef.current != null) {
        cancelAnimationFrame(applyRemoteStateRafRef.current);
        applyRemoteStateRafRef.current = null;
      }
      pendingRemoteStateRef.current = null;
      supabase.removeChannel(channel);
      gameChannelRef.current = null;
    };
  }, [roomId, isMultiplayer, isHost, myPlayerNumber, settleMatchResult]);

  const isMoving = isGameMoving(balls);

  useEffect(() => {
    if (!isHost || !isMultiplayer || !isMoving) return;
    wasMovingRef.current = true;
    const interval = setInterval(() => {
      sendGameStateRef.current();
    }, 50);
    return () => clearInterval(interval);
  }, [isMoving, isHost, isMultiplayer]);

  useEffect(() => {
    if (!isMoving && wasMovingRef.current && isHost && isMultiplayer) {
      wasMovingRef.current = false;
      sendGameStateRef.current();
      if (afterTurnChangeBroadcastRef.current) {
        clearTimeout(afterTurnChangeBroadcastRef.current);
      }
      afterTurnChangeBroadcastRef.current = setTimeout(() => {
        afterTurnChangeBroadcastRef.current = null;
        sendGameStateRef.current();
      }, 600);
    }
  }, [isMoving, isHost, isMultiplayer]);

  // Clear timeout khi unmount
  useEffect(() => {
    return () => {
      if (afterTurnChangeBroadcastRef.current) {
        clearTimeout(afterTurnChangeBroadcastRef.current);
        afterTurnChangeBroadcastRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setTurnTimeLeft(turnTimeLimit);
    setTurnTimeoutBlockShooting(false);
    turnTimeoutBlockRef.current = false;
  }, [gameState.currentPlayer, turnTimeLimit]);

  const turnTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cueBallPocketed = balls[0]?.isPocketed ?? false;
  useEffect(() => {
    const canCountDown =
      isMyTurn &&
      !isMoving &&
      (!ballInHand || ballInHandPlaced) &&
      !showGameResult &&
      !cueBallPocketed &&
      !pushOutDecisionPending;

    if (!canCountDown) {
      if (turnTimerIntervalRef.current) {
        clearInterval(turnTimerIntervalRef.current);
        turnTimerIntervalRef.current = null;
      }
      return;
    }

    turnTimerIntervalRef.current = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          if (turnTimerIntervalRef.current) {
            clearInterval(turnTimerIntervalRef.current);
            turnTimerIntervalRef.current = null;
          }
          turnTimeoutBlockRef.current = true;
          setTimeout(() => {
            setTurnTimeoutBlockShooting(true);
            if (isHost || !isMultiplayer) {
              forceSwitchTurnRef.current();
              if (isHost && isMultiplayer) {
                setTimeout(() => {
                  sendGameStateRef.current();
                }, 100);
              }
            } else {
              gameChannelRef.current?.send({
                type: "broadcast",
                event: "timeout_switch_turn",
                payload: {},
              });
            }
          }, 0);
          return turnTimeLimit;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (turnTimerIntervalRef.current) {
        clearInterval(turnTimerIntervalRef.current);
        turnTimerIntervalRef.current = null;
      }
    };
  }, [
    isMyTurn,
    isMoving,
    ballInHand,
    ballInHandPlaced,
    showGameResult,
    cueBallPocketed,
    pushOutDecisionPending,
    isHost,
    isMultiplayer,
    turnTimeLimit,
  ]);

  const cueBall = balls[0];

  const broadcastCueBallMove = (x: number, y: number) => {
    if (!isMultiplayer || !gameChannelRef.current || myPlayerNumber == null) {
      return;
    }
    if (!isMyTurn || !ballInHand) return;

    const now = Date.now();
    if (now - lastCueMoveBroadcastAtRef.current < 33) return;
    lastCueMoveBroadcastAtRef.current = now;

    gameChannelRef.current.send({
      type: "broadcast",
      event: "cue_ball_move",
      payload: { x, y, player: myPlayerNumber },
    });
  };

  const handleShoot = (angle: number, power: number) => {
    if (turnTimeoutBlockRef.current) return;
    if (turnTimeoutBlockShooting) return;
    if (pushOutDecisionPending) return;
    setTurnTimeLeft(turnTimeLimit);

    const forceStat = equippedCue?.force ?? 35;
    const controlStat = equippedCue?.control ?? 35;
    const forceMultiplier = 0.85 + (forceStat / 100) * 0.55;
    const controlMultiplier = 0.95 + (controlStat / 100) * 0.1;
    const modePowerBoost = isThreeCushionMode
      ? GAME_CONFIG.THREE_CUSHION_POWER_BOOST
      : 1;
    const maxPowerMultiplier = isThreeCushionMode
      ? GAME_CONFIG.THREE_CUSHION_MAX_POWER_MULTIPLIER
      : 1.6;
    const adjustedPower = Math.min(
      GAME_CONFIG.MAX_POWER * maxPowerMultiplier,
      power * forceMultiplier * controlMultiplier * modePowerBoost,
    );

    if (isHost || !isMultiplayer) {
      shootCueBall(angle, adjustedPower);
      if (isHost && isMultiplayer) {
        setTimeout(() => sendGameStateRef.current(), 16);
      }
    } else {
      gameChannelRef.current?.send({
        type: "broadcast",
        event: "shot",
        payload: {
          angle,
          power: adjustedPower,
          cueBallX: cueBall.x,
          cueBallY: cueBall.y,
        },
      });
    }
  };

  const handleDeclarePushOut = () => {
    if (!isNineBallMode) return;
    if (pushOutAvailableFor !== gameState.currentPlayer) return;
    if (isMoving || turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;

    if (isHost || !isMultiplayer) {
      const didDeclare = declarePushOut();
      if (didDeclare && isHost && isMultiplayer) {
        setTimeout(() => sendGameStateRef.current(), 16);
      }
      return;
    }

    gameChannelRef.current?.send({
      type: "broadcast",
      event: "push_out",
      payload: {},
    });
  };

  const handleChoosePushOutDecision = (playFromHere: boolean) => {
    if (!pushOutDecisionPending) return;
    if (pushOutDecisionPending.decider !== gameState.currentPlayer) return;

    if (isHost || !isMultiplayer) {
      choosePushOutDecision(playFromHere);
      if (isHost && isMultiplayer) {
        setTimeout(() => sendGameStateRef.current(), 16);
      }
      return;
    }

    gameChannelRef.current?.send({
      type: "broadcast",
      event: "push_out_decision",
      payload: { playFromHere },
    });
  };

  const getAiLegalTargetBalls = useCallback(
    (currentBalls: Ball[]) => {
      const aiPlayer = gameState.players[1];
      const hasRemainingOwnBalls = currentBalls.some((ball) => {
        if (ball.isPocketed || ball.id === 0 || ball.id === 8) return false;
        if (aiPlayer.ballType === "solid") return ball.id >= 1 && ball.id <= 7;
        if (aiPlayer.ballType === "striped") return ball.id >= 9 && ball.id <= 15;
        return true;
      });

      return currentBalls.filter((ball) => {
        if (ball.isPocketed || ball.id === 0) return false;

        if (aiPlayer.ballType === "none") {
          return ball.id !== 8;
        }

        if (!hasRemainingOwnBalls) {
          return ball.id === 8;
        }

        if (ball.id === 8) return false;
        if (aiPlayer.ballType === "solid") return ball.id >= 1 && ball.id <= 7;
        return ball.id >= 9 && ball.id <= 15;
      });
    },
    [gameState.players],
  );

  const isAiLaneClear = useCallback(
    (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      currentBalls: Ball[],
      ignoredBallIds: number[] = [],
      clearanceMultiplier = 1,
    ) => {
      const clearanceRadius = BALL_RADIUS * 2.05 * clearanceMultiplier;
      return !currentBalls.some((ball) => {
        if (ball.isPocketed || ignoredBallIds.includes(ball.id)) return false;
        const distanceToLane = distancePointToSegment(
          ball.x,
          ball.y,
          startX,
          startY,
          endX,
          endY,
        );
        return distanceToLane < clearanceRadius;
      });
    },
    [],
  );

  const findBestAiPocketPlan = useCallback(
    (currentBalls: Ball[], cueOrigin?: { x: number; y: number }) => {
      const cue = cueOrigin ?? currentBalls[0];
      if (!cue) return null;

      const legalBalls = getAiLegalTargetBalls(currentBalls);
      const candidates =
        legalBalls.length > 0
          ? legalBalls
          : currentBalls.filter((ball) => !ball.isPocketed && ball.id !== 0);
      if (candidates.length === 0) return null;

      const minX = BALL_RADIUS + 10;
      const maxX = TABLE_WIDTH - BALL_RADIUS - 10;
      const minY = BALL_RADIUS + 10;
      const maxY = TABLE_HEIGHT - BALL_RADIUS - 10;

      let bestPlan: {
        targetBall: Ball;
        aimX: number;
        aimY: number;
        score: number;
      } | null = null;

      for (const targetBall of candidates) {
        for (const pocket of POCKETS) {
          const toPocketX = pocket.x - targetBall.x;
          const toPocketY = pocket.y - targetBall.y;
          const pocketDistance = Math.hypot(toPocketX, toPocketY);
          if (pocketDistance <= BALL_RADIUS * 2.1) continue;

          const unitX = toPocketX / pocketDistance;
          const unitY = toPocketY / pocketDistance;
          const aimX = targetBall.x - unitX * BALL_RADIUS * 2;
          const aimY = targetBall.y - unitY * BALL_RADIUS * 2;

          if (aimX < minX || aimX > maxX || aimY < minY || aimY > maxY) {
            continue;
          }

          const cueLaneClear = isAiLaneClear(
            cue.x,
            cue.y,
            aimX,
            aimY,
            currentBalls,
            [0, targetBall.id],
            aiSkillProfile.lineClearanceMultiplier,
          );
          const objectLaneClear = isAiLaneClear(
            targetBall.x,
            targetBall.y,
            pocket.x,
            pocket.y,
            currentBalls,
            [0, targetBall.id],
            aiSkillProfile.lineClearanceMultiplier * 0.96,
          );

          if (!cueLaneClear || !objectLaneClear) continue;

          const cueDistance = Math.hypot(aimX - cue.x, aimY - cue.y);
          const cueToTargetX = targetBall.x - cue.x;
          const cueToTargetY = targetBall.y - cue.y;
          const cueToTargetDistance = Math.hypot(cueToTargetX, cueToTargetY);
          if (cueToTargetDistance <= BALL_RADIUS * 2) continue;

          const cueDirX = cueToTargetX / cueToTargetDistance;
          const cueDirY = cueToTargetY / cueToTargetDistance;
          const pocketDirX = toPocketX / pocketDistance;
          const pocketDirY = toPocketY / pocketDistance;
          const alignment = Math.max(
            -1,
            Math.min(1, cueDirX * pocketDirX + cueDirY * pocketDirY),
          );
          const cutPenalty = Math.pow(1 - alignment, 2) * 260;
          const railPenalty =
            (Math.abs(targetBall.x - BALL_RADIUS) < 26 ||
            Math.abs(targetBall.x - (TABLE_WIDTH - BALL_RADIUS)) < 26 ||
            Math.abs(targetBall.y - BALL_RADIUS) < 26 ||
            Math.abs(targetBall.y - (TABLE_HEIGHT - BALL_RADIUS)) < 26)
              ? 24
              : 0;
          const edgePenalty =
            Math.abs(targetBall.y - TABLE_HEIGHT / 2) * 0.015 +
            Math.abs(targetBall.x - TABLE_WIDTH / 2) * 0.01;
          const score =
            cutPenalty +
            railPenalty +
            pocketDistance * 0.5 +
            cueDistance * 0.2 +
            cueToTargetDistance * 0.12 +
            edgePenalty;

          if (!bestPlan || score < bestPlan.score) {
            bestPlan = {
              targetBall,
              aimX,
              aimY,
              score,
            };
          }
        }
      }

      return bestPlan;
    },
    [
      aiSkillProfile.lineClearanceMultiplier,
      getAiLegalTargetBalls,
      isAiLaneClear,
    ],
  );

  const pickAiTargetBall = useCallback(
    (currentBalls: Ball[], cueOrigin?: { x: number; y: number }) => {
      const cue = cueOrigin ?? currentBalls[0];
      if (!cue) return null;

      const legalBalls = getAiLegalTargetBalls(currentBalls);
      const candidates =
        legalBalls.length > 0
          ? legalBalls
          : currentBalls.filter((ball) => !ball.isPocketed && ball.id !== 0);

      if (candidates.length === 0) return null;

      const ranked = [...candidates]
        .map((ball) => {
          const cueDistance = Math.hypot(ball.x - cue.x, ball.y - cue.y);
          const nearestPocketDistance = POCKETS.reduce((best, pocket) => {
            return Math.min(best, Math.hypot(pocket.x - ball.x, pocket.y - ball.y));
          }, Number.POSITIVE_INFINITY);
          const laneClear = isAiLaneClear(
            cue.x,
            cue.y,
            ball.x,
            ball.y,
            currentBalls,
            [0, ball.id],
            aiSkillProfile.lineClearanceMultiplier,
          );
          return {
            ball,
            score:
              cueDistance * 0.72 +
              nearestPocketDistance * 0.28 +
              (laneClear ? 0 : 120),
          };
        })
        .sort((a, b) => a.score - b.score);

      if (Math.random() < aiSkillProfile.randomTargetChance) {
        return ranked[Math.floor(Math.random() * ranked.length)]?.ball ?? ranked[0].ball;
      }

      const poolSize = Math.max(
        1,
        Math.min(aiSkillProfile.targetPool, ranked.length),
      );
      return ranked[Math.floor(Math.random() * poolSize)]?.ball ?? ranked[0].ball;
    },
    [
      aiSkillProfile.lineClearanceMultiplier,
      aiSkillProfile.randomTargetChance,
      aiSkillProfile.targetPool,
      getAiLegalTargetBalls,
      isAiLaneClear,
    ],
  );

  const findAiCueBallPlacement = useCallback(
    (currentBalls: Ball[]) => {
      const minX = BALL_RADIUS + 10;
      const maxX = TABLE_WIDTH - BALL_RADIUS - 10;
      const minY = BALL_RADIUS + 10;
      const maxY = TABLE_HEIGHT - BALL_RADIUS - 10;
      const centerX = TABLE_WIDTH * 0.28;
      const centerY = TABLE_HEIGHT / 2;
      const spreadX =
        ((maxX - minX) / 2) * Math.max(0.45, aiSkillProfile.placementSpread);
      const spreadY =
        ((maxY - minY) / 2) * Math.max(0.45, aiSkillProfile.placementSpread);

      let bestPlacement: { x: number; y: number } | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let i = 0; i < aiSkillProfile.placementAttempts; i++) {
        const x = Math.max(
          minX,
          Math.min(maxX, centerX + (Math.random() * 2 - 1) * spreadX),
        );
        const y = Math.max(
          minY,
          Math.min(maxY, centerY + (Math.random() * 2 - 1) * spreadY),
        );
        const collides = currentBalls.some((ball) => {
          if (ball.id === 0 || ball.isPocketed) return false;
          return Math.hypot(x - ball.x, y - ball.y) < BALL_RADIUS * 2;
        });

        if (collides) continue;

        const plan = findBestAiPocketPlan(currentBalls, { x, y });
        if (plan) {
          if (plan.score < bestScore) {
            bestScore = plan.score;
            bestPlacement = { x, y };
          }
          continue;
        }

        const fallbackTarget = pickAiTargetBall(currentBalls, { x, y });
        if (!fallbackTarget) continue;

        const fallbackScore =
          Math.hypot(fallbackTarget.x - x, fallbackTarget.y - y) *
          aiSkillProfile.placementSpread;
        if (fallbackScore < bestScore) {
          bestScore = fallbackScore;
          bestPlacement = { x, y };
        }
      }

      return bestPlacement ?? { x: 175, y: 300 };
    },
    [
      aiSkillProfile.placementAttempts,
      aiSkillProfile.placementSpread,
      findBestAiPocketPlan,
      pickAiTargetBall,
    ],
  );

  useEffect(() => {
    if (!isAiMatch) return;

    const aiTurn = gameState.currentPlayer === 2;
    const canAct =
      aiTurn &&
      !showGameResult &&
      !isMoving &&
      !pushOutDecisionPending &&
      !turnTimeoutBlockRef.current &&
      !turnTimeoutBlockShooting &&
      !gameState.turnEnded;

    if (!canAct) {
      if (aiTurnTimeoutRef.current) {
        clearTimeout(aiTurnTimeoutRef.current);
        aiTurnTimeoutRef.current = null;
      }
      return;
    }

    if (aiTurnTimeoutRef.current) return;

    const thinkDelayMs =
      aiSkillProfile.thinkMinMs +
      Math.floor(
        Math.random() *
          (aiSkillProfile.thinkMaxMs - aiSkillProfile.thinkMinMs + 1),
      );

    aiTurnTimeoutRef.current = setTimeout(() => {
      aiTurnTimeoutRef.current = null;

      if (turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;

      const shootNow = () => {
        const currentBalls = ballsRef.current;
        const cueBallNow = currentBalls[0];
        if (!cueBallNow || cueBallNow.isPocketed) return;
        const aiPlayer = gameState.players[1];
        const mustUseBestPlan = aiPlayer.ballType === "none";

        const pocketPlan =
          mustUseBestPlan || Math.random() < aiSkillProfile.strategicShotChance
            ? findBestAiPocketPlan(currentBalls)
            : null;
        const targetBall = pocketPlan?.targetBall ?? pickAiTargetBall(currentBalls);
        const baseAngle = pocketPlan
          ? Math.atan2(pocketPlan.aimY - cueBallNow.y, pocketPlan.aimX - cueBallNow.x)
          : targetBall
            ? Math.atan2(targetBall.y - cueBallNow.y, targetBall.x - cueBallNow.x)
            : Math.random() * Math.PI * 2;
        const angle =
          baseAngle + (Math.random() - 0.5) * aiSkillProfile.angleJitter;
        const distance = pocketPlan
          ? Math.hypot(pocketPlan.aimX - cueBallNow.x, pocketPlan.aimY - cueBallNow.y)
          : targetBall
            ? Math.hypot(targetBall.x - cueBallNow.x, targetBall.y - cueBallNow.y)
            : 180;
        const rawPower =
          aiSkillProfile.basePower +
          distance * aiSkillProfile.distancePowerFactor +
          (Math.random() - 0.5) * aiSkillProfile.powerJitter;
        const power = Math.max(5, Math.min(aiSkillProfile.maxPower, rawPower));
        handleShoot(angle, power);
      };

      if (ballInHand) {
        let placed = false;
        for (let attempt = 0; attempt < 3 && !placed; attempt++) {
          const placement = findAiCueBallPlacement(ballsRef.current);
          placed = moveCueBallRef.current(placement.x, placement.y) === true;
        }
        if (!placed) {
          return;
        }
        setTimeout(
          shootNow,
          Math.max(120, Math.round(aiSkillProfile.thinkMinMs * 0.25)),
        );
        return;
      }

      shootNow();
    }, thinkDelayMs);

    return () => {
      if (aiTurnTimeoutRef.current) {
        clearTimeout(aiTurnTimeoutRef.current);
        aiTurnTimeoutRef.current = null;
      }
    };
  }, [
    aiSkillProfile,
    ballInHand,
    findAiCueBallPlacement,
    findBestAiPocketPlan,
    gameState.currentPlayer,
    gameState.turnEnded,
    isAiMatch,
    isMoving,
    pickAiTargetBall,
    pushOutDecisionPending,
    showGameResult,
    turnTimeoutBlockShooting,
  ]);

  const {
    aimAngle,
    power,
    isAiming,
    isDraggingPower,
    handleTableTouchStart,
    handleTableTouchMove,
    handleTableTouchEnd,
    handlePowerTouchStart,
    handlePowerTouchMove,
    handlePowerTouchEnd,
  } = useAimControl({
    isMoving,
    cueBall,
    onShoot: handleShoot,
    canPlay: isMyTurn && !turnTimeoutBlockShooting && !pushOutDecisionPending,
    sliderHeight: tableLayout.sliderHeight,
  });

  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  const lowestBallOnTable = balls
    .filter((b) => b.id > 0 && !b.isPocketed)
    .reduce<number | null>((lowest, ball) => {
      if (lowest == null) return ball.id;
      return Math.min(lowest, ball.id);
    }, null);
  const remainingObjectBalls = balls.filter((b) => b.id > 0 && !b.isPocketed).length;
  const showAimGuides =
    isMyTurn &&
    !isMoving &&
    !pushOutDecisionPending &&
    !cueBall.isPocketed &&
    (!ballInHand || ballInHandPlaced);

  const { aimEndX, aimEndY } = useMemo(
    () =>
      showAimGuides
        ? calculateAimLine(cueBall, aimAngle)
        : { aimEndX: cueBall.x, aimEndY: cueBall.y },
    [showAimGuides, cueBall, aimAngle],
  );

  const predictionDots = useMemo(
    () => (showAimGuides ? calculatePredictionDots(cueBall, aimAngle) : []),
    [showAimGuides, cueBall, aimAngle],
  );

  const { cueStartX, cueStartY, cueEndX, cueEndY } = useMemo(
    () =>
      showAimGuides
        ? calculateCuePosition(cueBall, aimAngle)
        : {
            cueStartX: cueBall.x,
            cueStartY: cueBall.y,
            cueEndX: cueBall.x,
            cueEndY: cueBall.y,
          },
    [showAimGuides, cueBall, aimAngle],
  );

  const shouldComputeAdvancedPrediction =
    showAimGuides &&
    !isDraggingCueBall &&
    (Platform.OS === "web" || (isAiming && !isDraggingPower));

  const targetPredictions = useMemo(
    () =>
      shouldComputeAdvancedPrediction
        ? calculateTargetPredictions(cueBall, aimAngle, balls, isMoving)
        : [],
    [shouldComputeAdvancedPrediction, cueBall, aimAngle, balls, isMoving],
  );

  const closestTarget = useMemo(
    () => (targetPredictions.length ? findClosestTarget(targetPredictions, cueBall) : null),
    [targetPredictions, cueBall],
  );

  const cueBallReflection = useMemo(
    () => (closestTarget ? calculateCueBallReflection(closestTarget, cueBall) : null),
    [closestTarget, cueBall],
  );

  const powerLevel = getPowerLevel(power);
  const cueTheme = getCueVisualTheme(equippedCue);
  const cueDx = cueEndX - cueStartX;
  const cueDy = cueEndY - cueStartY;
  const wrapStartX = cueStartX + cueDx * 0.5;
  const wrapStartY = cueStartY + cueDy * 0.5;
  const wrapEndX = cueStartX + cueDx * 0.82;
  const wrapEndY = cueStartY + cueDy * 0.82;
  const accentStartX = cueStartX + cueDx * 0.18;
  const accentStartY = cueStartY + cueDy * 0.18;
  const accentEndX = cueStartX + cueDx * 0.93;
  const accentEndY = cueStartY + cueDy * 0.93;

  const statusMessage = !isMyTurn
    ? `Đang chờ lượt đối thủ (${gameState.currentPlayer === 1 ? player1DisplayName : player2DisplayName})...`
    : ballInHand
        ? ballInHandPlaced
          ? `${gameState.currentPlayer === 1 ? player1DisplayName : player2DisplayName} - Bi trắng đã đặt xong | Kéo ngoài bi để ngắm và bắn`
          : `${gameState.currentPlayer === 1 ? player1DisplayName : player2DisplayName} - Kéo bi trắng để đặt | Kéo bên ngoài để ngắm`
        : isMoving
          ? GAME_MESSAGES.BALLS_MOVING
          : `${gameState.currentPlayer === 1 ? player1DisplayName : player2DisplayName} - ${GAME_MESSAGES.READY_TO_AIM}`;
  const statusMessageWithPushOut =
    pushOutDecisionPending &&
    pushOutDecisionPending.decider === gameState.currentPlayer
      ? "Lượt đẩy tự do: chọn Đánh tiếp hoặc Trả lượt."
      : isNineBallMode &&
          pushOutAvailableFor === gameState.currentPlayer &&
          !isMoving &&
          !showGameResult
        ? "Bạn có thể khai báo lượt đẩy tự do ở lượt này."
        : statusMessage;
  const targetIsWrong = closestTarget ? isWrongBall(closestTarget.ball) : false;
  const aimColor = targetIsWrong ? "#FF0000" : currentPlayer.color;

  const player1Balls = balls.filter(
    (b) =>
      !b.isPocketed &&
      b.id !== 0 &&
      b.id !== 8 &&
      ((gameState.players[0].ballType === "solid" && b.id >= 1 && b.id <= 7) ||
        (gameState.players[0].ballType === "striped" &&
          b.id >= 9 &&
          b.id <= 15)),
  ).length;

  const player2Balls = balls.filter(
    (b) =>
      !b.isPocketed &&
      b.id !== 0 &&
      b.id !== 8 &&
      ((gameState.players[1].ballType === "solid" && b.id >= 1 && b.id <= 7) ||
        (gameState.players[1].ballType === "striped" &&
          b.id >= 9 &&
          b.id <= 15)),
  ).length;
  const nineBallProgressText =
    lowestBallOnTable == null
      ? "Đã dọn hết bi mục tiêu"
      : `Mục tiêu: bi ${lowestBallOnTable} (${remainingObjectBalls} bi còn lại)`;
  const player1BallTypeText = isNineBallMode
    ? nineBallProgressText
    : isThreeCushionMode
      ? "Mục tiêu: carom đủ 3 băng"
    : gameState.players[0].ballType === "none"
      ? "Chưa phân bi"
      : gameState.players[0].ballType === "solid"
        ? `Bi màu 1-7 (${player1Balls})`
        : `Bi khoang 9-15 (${player1Balls})`;
  const player2BallTypeText = isNineBallMode
    ? nineBallProgressText
    : isThreeCushionMode
      ? "Mục tiêu: carom đủ 3 băng"
    : gameState.players[1].ballType === "none"
      ? "Chưa phân bi"
      : gameState.players[1].ballType === "solid"
        ? `Bi màu 1-7 (${player2Balls})`
        : `Bi khoang 9-15 (${player2Balls})`;
  const isEightBallMode = !isNineBallMode && !isThreeCushionMode;
  const progressSlotCount = isEightBallMode ? 7 : 9;
  const player1ProgressValue = isEightBallMode
    ? Math.max(0, Math.min(7, 7 - player1Balls))
    : Math.max(0, Math.min(progressSlotCount, gameState.players[0].score));
  const player2ProgressValue = isEightBallMode
    ? Math.max(0, Math.min(7, 7 - player2Balls))
    : Math.max(0, Math.min(progressSlotCount, gameState.players[1].score));
  const solidBallIds = [1, 2, 3, 4, 5, 6, 7];
  const stripedBallIds = [9, 10, 11, 12, 13, 14, 15];
  const progressIdleColor = "#0b0b0b";
  const ballsById = useMemo(() => {
    const map = new Map<number, Ball>();
    balls.forEach((ball) => {
      map.set(ball.id, ball);
    });
    return map;
  }, [balls]);

  const renderScoreProgressDots = (filled: number, activeColor: string) =>
    Array.from({ length: progressSlotCount }).map((_, idx) => (
      <View
        key={`progress-score-${idx}`}
        style={[
          styles.hudProgressDot,
          idx < filled && {
            backgroundColor: activeColor,
            borderColor: activeColor,
          },
        ]}
      />
    ));

  const renderEightBallProgressDots = (playerIndex: 0 | 1) => {
    const player = gameState.players[playerIndex];
    if (player.ballType === "none") {
      return Array.from({ length: 7 }).map((_, idx) => (
        <View
          key={`progress-player-${playerIndex + 1}-idle-${idx}`}
          style={[
            styles.hudProgressDot,
            {
              backgroundColor: progressIdleColor,
              borderColor: "#1f2937",
            },
          ]}
        />
      ));
    }

    const trackedIds = player.ballType === "solid" ? solidBallIds : stripedBallIds;
    return trackedIds.map((ballId) => {
      const ball = ballsById.get(ballId);
      const isPocketed = !!ball?.isPocketed;
      return (
        <View
          key={`progress-player-${playerIndex + 1}-ball-${ballId}`}
          style={[
            styles.hudProgressDot,
            {
              backgroundColor: isPocketed ? progressIdleColor : (ball?.color ?? progressIdleColor),
              borderColor: isPocketed ? "#1f2937" : "#e2e8f0",
            },
          ]}
        />
      );
    });
  };

  const canDeclarePushOut =
    isNineBallMode &&
    isMyTurn &&
    !isMoving &&
    !showGameResult &&
    !turnTimeoutBlockShooting &&
    !pushOutDecisionPending &&
    pushOutAvailableFor === gameState.currentPlayer;
  const canChoosePushOutDecision =
    isNineBallMode &&
    !!pushOutDecisionPending &&
    isMyTurn &&
    !isMoving &&
    !showGameResult &&
    pushOutDecisionPending.decider === gameState.currentPlayer;

  const getScaledTouchCoordinates = useCallback(
    (event: any): { touchX: number; touchY: number } | null => {
      const nativeEvent = event?.nativeEvent;
      if (!nativeEvent) return null;

      const rawX =
        typeof nativeEvent.locationX === "number"
          ? nativeEvent.locationX
          : nativeEvent.touches?.[0]?.locationX;
      const rawY =
        typeof nativeEvent.locationY === "number"
          ? nativeEvent.locationY
          : nativeEvent.touches?.[0]?.locationY;

      if (typeof rawX !== "number" || typeof rawY !== "number") return null;

      return {
        touchX: rawX * tableLayout.tableScaleX,
        touchY: rawY * tableLayout.tableScaleY,
      };
    },
    [tableLayout.tableScaleX, tableLayout.tableScaleY],
  );

  const toScaledTableEvent = useCallback(
    (event: any) => {
      const scaled = getScaledTouchCoordinates(event);
      if (!scaled) return event;
      return {
        nativeEvent: {
          locationX: scaled.touchX,
          locationY: scaled.touchY,
        },
      };
    },
    [getScaledTouchCoordinates],
  );

  const getTableTouchCoordinates = useCallback(
    (event: any) => getScaledTouchCoordinates(event) ?? getTouchCoordinates(event),
    [getScaledTouchCoordinates],
  );

  const handleTableTouchStartScaled = useCallback(
    (event: any) => {
      handleTableTouchStart(toScaledTableEvent(event));
    },
    [handleTableTouchStart, toScaledTableEvent],
  );

  const handleTableTouchMoveScaled = useCallback(
    (event: any) => {
      handleTableTouchMove(toScaledTableEvent(event));
    },
    [handleTableTouchMove, toScaledTableEvent],
  );

  const isTouchOnCueBall = (touchX: number, touchY: number): boolean => {
    const dx = touchX - cueBall.x;
    const dy = touchY - cueBall.y;
    const radius = BALL_RADIUS + 15;
    return dx * dx + dy * dy <= radius * radius;
  };

  const handleBackToLobbyButton = () => {
    setShowExitModal(true);
  };

  const confirmExitGame = () => {
    setShowExitModal(false);

    const gameInProgress =
      balls.some((b) => Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01) ||
      balls.some((b) => !b.isPocketed && b.id !== 0);

    if (gameInProgress) {
      handleForfeit((myPlayerNumber ?? 1) as 1 | 2);
    } else {
      resetGame();
      router.push("/");
    }
  };

  const cancelExitGame = () => {
    setShowExitModal(false);
  };

  // Handlers cho Game Result Screen
  const handleBackToLobby = () => {
    if (gameResult?.winner?.id) {
      settleMatchResult(gameResult.winner.id, "back_to_lobby");
    }
    setShowGameResult(false);
    resetGame();
    router.push("/");
  };

  const handleExitGame = () => {
    if (gameResult?.winner?.id) {
      settleMatchResult(gameResult.winner.id, "exit_game");
    }
    setShowGameResult(false);
    resetGame();
    router.push("/");
  };

  const handleCueBallTouchStart = (event: any) => {
    if (!isMyTurn) return; // Chỉ người đang có lượt (và ball in hand) mới được kéo/ngắm
    if (!ballInHand) return;
    if (pushOutDecisionPending) return;
    if (turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;

    const { touchX, touchY } = getTableTouchCoordinates(event);
    const onCueBall = isTouchOnCueBall(touchX, touchY);

    if (onCueBall) {
      setIsDraggingCueBall(true);
      lastCueBallDragAtRef.current = 0;
      lastCueBallDragPosRef.current = { x: cueBall.x, y: cueBall.y };
    } else {
      setIsAimingInBallInHand(true);
      handleTableTouchStartScaled(event);
    }
  };

  const handleCueBallTouchMove = (event: any) => {
    if (!isMyTurn) return;
    if (!ballInHand) return;
    if (pushOutDecisionPending) return;
    if (turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;

    if (isDraggingCueBall) {
      const now = Date.now();
      if (now - lastCueBallDragAtRef.current < CUE_BALL_DRAG_INTERVAL_MS) return;
      lastCueBallDragAtRef.current = now;

      const { touchX, touchY } = getTableTouchCoordinates(event);

      const minX = BALL_RADIUS + 10;
      const maxX = TABLE_WIDTH - BALL_RADIUS - 10;
      const minY = BALL_RADIUS + 10;
      const maxY = TABLE_HEIGHT - BALL_RADIUS - 10;

      const clampedX = Math.max(minX, Math.min(maxX, touchX));
      const clampedY = Math.max(minY, Math.min(maxY, touchY));
      const lastPos = lastCueBallDragPosRef.current;
      if (
        lastPos &&
        Math.abs(clampedX - lastPos.x) < CUE_BALL_DRAG_MIN_DELTA &&
        Math.abs(clampedY - lastPos.y) < CUE_BALL_DRAG_MIN_DELTA
      ) {
        return;
      }
      const minDistanceSq = BALL_RADIUS * 2 * (BALL_RADIUS * 2);

      const wouldCollide = balls.some((ball) => {
        if (ball.id === 0 || ball.isPocketed) return false;

        const dx = clampedX - ball.x;
        const dy = clampedY - ball.y;
        return dx * dx + dy * dy < minDistanceSq;
      });

      if (!wouldCollide) {
        lastCueBallDragPosRef.current = { x: clampedX, y: clampedY };
        moveCueBall(clampedX, clampedY);
        broadcastCueBallMove(clampedX, clampedY);
      }
    } else if (isAimingInBallInHand) {
      handleTableTouchMoveScaled(event);
    }
  };

  const handleCueBallTouchEnd = (event?: any) => {
    if (!isMyTurn) return;
    if (pushOutDecisionPending) return;
    if (turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;
    const wasDraggingCueBall = isDraggingCueBall;
    setIsDraggingCueBall(false);
    lastCueBallDragAtRef.current = 0;

    if (wasDraggingCueBall && event) {
      const { touchX, touchY } = getTableTouchCoordinates(event);
      const minX = BALL_RADIUS + 10;
      const maxX = TABLE_WIDTH - BALL_RADIUS - 10;
      const minY = BALL_RADIUS + 10;
      const maxY = TABLE_HEIGHT - BALL_RADIUS - 10;
      const clampedX = Math.max(minX, Math.min(maxX, touchX));
      const clampedY = Math.max(minY, Math.min(maxY, touchY));
      const minDistanceSq = BALL_RADIUS * 2 * (BALL_RADIUS * 2);
      const wouldCollide = balls.some((ball) => {
        if (ball.id === 0 || ball.isPocketed) return false;
        const dx = clampedX - ball.x;
        const dy = clampedY - ball.y;
        return dx * dx + dy * dy < minDistanceSq;
      });

      if (!wouldCollide) {
        lastCueBallDragPosRef.current = { x: clampedX, y: clampedY };
        moveCueBall(clampedX, clampedY);
        broadcastCueBallMove(clampedX, clampedY);
      } else {
        broadcastCueBallMove(cueBall.x, cueBall.y);
      }
    } else if (wasDraggingCueBall) {
      broadcastCueBallMove(cueBall.x, cueBall.y);
    }
    lastCueBallDragPosRef.current = null;

    if (isAimingInBallInHand) {
      setIsAimingInBallInHand(false);
      handleTableTouchEnd();
    }
  };

  const handleTableTouch = ballInHand
    ? {
        onStartShouldSetResponder: () => true,
        onResponderGrant: handleCueBallTouchStart,
        onResponderMove: handleCueBallTouchMove,
        onResponderRelease: handleCueBallTouchEnd,
      }
    : {
        onStartShouldSetResponder: () => true,
        onResponderGrant: handleTableTouchStartScaled,
        onResponderMove: handleTableTouchMoveScaled,
        onResponderRelease: handleTableTouchEnd,
      };


  return (
    <View style={styles.container}>
      <View style={styles.hudTopBar}>
        <TouchableOpacity
          style={styles.hudActionButton}
          onPress={handleBackToLobbyButton}
          hitSlop={mobileHitSlop}
          pressRetentionOffset={mobileHitSlop}
        >
          <Text style={styles.hudActionIcon}>OUT</Text>
        </TouchableOpacity>

        <View style={styles.hudCenter}>
          <View
            style={[
              styles.hudPlayerPanel,
              gameState.currentPlayer === 1 && styles.hudPlayerPanelActive,
            ]}
          >
            <View style={[styles.hudAvatar, styles.hudAvatarBlue]} />
            <View style={styles.hudPlayerContent}>
              <Text style={styles.hudPlayerLabel} numberOfLines={1}>
                {player1DisplayName}
              </Text>
              <View style={styles.hudProgressRow}>
                {isEightBallMode
                  ? renderEightBallProgressDots(0)
                  : renderScoreProgressDots(player1ProgressValue, "#16d9ff")}
              </View>
            </View>
          </View>

          <Text style={styles.hudVsText}>VS</Text>

          <View
            style={[
              styles.hudPlayerPanel,
              gameState.currentPlayer === 2 && styles.hudPlayerPanelActive,
            ]}
          >
            <View style={[styles.hudAvatar, styles.hudAvatarPink]} />
            <View style={styles.hudPlayerContent}>
              <Text style={styles.hudPlayerLabel} numberOfLines={1}>
                {player2DisplayName}
              </Text>
              <View style={styles.hudProgressRow}>
                {isEightBallMode
                  ? renderEightBallProgressDots(1)
                  : renderScoreProgressDots(player2ProgressValue, "#ff4f93")}
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.hudActionButton}
          onPress={() => setIsMuted((prev) => !prev)}
          hitSlop={mobileHitSlop}
          pressRetentionOffset={mobileHitSlop}
        >
          <Text style={styles.hudActionIcon}>{isMuted ? "MUTE" : "SOUND"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusPill}>
        <Text style={styles.statusPillText} numberOfLines={1}>
          {statusMessageWithPushOut}
        </Text>
        <View style={styles.timerBadge}>
          <Text
            style={[
              styles.timerBadgeValue,
              turnTimeLeft <= 5 && isMyTurn && styles.timerValueUrgent,
            ]}
          >
            {turnTimeLeft}s
          </Text>
        </View>
      </View>

      {ballInHand && isMyTurn && !ballInHandPlaced && (
        <View style={styles.ballInHandNotice}>
          <Text style={styles.ballInHandText}>
            KEO BI TRANG DE DAT, KEO NGOAI BI DE NGAM
          </Text>
        </View>
      )}

      <View style={styles.gameArea}>
        <View
          style={[
            styles.tableContainer,
            {
              padding: tableLayout.tablePadding,
              width: tableLayout.renderedTableWidth + tableLayout.tablePadding * 2,
              height: tableLayout.renderedTableHeight + tableLayout.tablePadding * 2,
            },
          ]}
          {...handleTableTouch}
        >
          <Svg
            width={tableLayout.renderedTableWidth}
            height={tableLayout.renderedTableHeight}
            viewBox={`0 0 ${TABLE_WIDTH} ${TABLE_HEIGHT}`}
          >
            <Defs>
              <RadialGradient id="pocketGradient">
                <Stop offset="0%" stopColor="#000" stopOpacity="1" />
                <Stop offset="100%" stopColor="#333" stopOpacity="1" />
              </RadialGradient>
            </Defs>

            <Rect
              x={0}
              y={0}
              width={TABLE_WIDTH}
              height={TABLE_HEIGHT}
              fill="#4fb5e7"
              stroke="#7f2a14"
              strokeWidth={16}
            />

            {!isThreeCushionMode &&
              POCKETS.map((pocket, index) => (
                <React.Fragment key={index}>
                  <Circle
                    cx={pocket.x}
                    cy={pocket.y}
                    r={pocket.radius + 2}
                    fill="#000"
                    opacity={0.5}
                  />
                  <Circle
                    cx={pocket.x}
                    cy={pocket.y}
                    r={pocket.radius}
                    fill="url(#pocketGradient)"
                    stroke="#000"
                    strokeWidth={2}
                  />
                </React.Fragment>
              ))}

            {showAimGuides && (
                <>
                  <Line
                    x1={cueBall.x}
                    y1={cueBall.y}
                    x2={closestTarget ? closestTarget.path.contactX : aimEndX}
                    y2={closestTarget ? closestTarget.path.contactY : aimEndY}
                    stroke={aimColor}
                    strokeWidth={3}
                    opacity={0.8}
                  />

                  {predictionDots.map((dot, index) => {
                    if (closestTarget) {
                      const maxDist = Math.sqrt(
                        (closestTarget.path.contactX - cueBall.x) ** 2 +
                          (closestTarget.path.contactY - cueBall.y) ** 2,
                      );
                      const dotDist =
                        GAME_CONFIG.PREDICTION_DOT_SPACING * (index + 1);
                      if (dotDist > maxDist) return null;
                    }

                    return (
                      <Circle
                        key={index}
                        cx={dot.x}
                        cy={dot.y}
                        r={4}
                        fill={aimColor}
                        opacity={0.7 - index * 0.15}
                      />
                    );
                  })}

                  {closestTarget && (
                    <>
                      {!targetIsWrong && (
                        <>
                          <Circle
                            cx={closestTarget.path.contactX}
                            cy={closestTarget.path.contactY}
                            r={8}
                            fill="none"
                            stroke="#00FF00"
                            strokeWidth={3}
                            opacity={0.9}
                          />

                          <Line
                            x1={closestTarget.ball.x}
                            y1={closestTarget.ball.y}
                            x2={
                              closestTarget.ball.x +
                              closestTarget.path.targetVx * 30
                            }
                            y2={
                              closestTarget.ball.y +
                              closestTarget.path.targetVy * 30
                            }
                            stroke={closestTarget.ball.color}
                            strokeWidth={3}
                            strokeDasharray="8,4"
                            opacity={0.8}
                          />

                          <Circle
                            cx={closestTarget.ball.x}
                            cy={closestTarget.ball.y}
                            r={BALL_RADIUS + 6}
                            fill="none"
                            stroke="#00FF00"
                            strokeWidth={2}
                            strokeDasharray="3,3"
                            opacity={0.7}
                          />

                          {cueBallReflection && (
                            <Line
                              x1={closestTarget.path.contactX}
                              y1={closestTarget.path.contactY}
                              x2={cueBallReflection.endX}
                              y2={cueBallReflection.endY}
                              stroke="#FFFFFF"
                              strokeWidth={3}
                              strokeDasharray="8,4"
                              opacity={0.7}
                            />
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

            {balls.map((ball) => {
              if (ball.isPocketed) return null;

              return (
                <React.Fragment key={ball.id}>
                  <Circle
                    cx={ball.x + 2}
                    cy={ball.y + 2}
                    r={BALL_RADIUS}
                    fill="#000"
                    opacity={0.25}
                  />

                  <Circle
                    cx={ball.x}
                    cy={ball.y}
                    r={BALL_RADIUS}
                    fill={ball.color}
                    stroke="#222"
                    strokeWidth={1.5}
                  />

                  {ball.isStriped && (
                    <>
                      <Line
                        x1={ball.x - BALL_RADIUS * 0.7}
                        y1={ball.y - 3}
                        x2={ball.x + BALL_RADIUS * 0.7}
                        y2={ball.y - 3}
                        stroke="#FFFFFF"
                        strokeWidth={3}
                      />
                      <Line
                        x1={ball.x - BALL_RADIUS * 0.7}
                        y1={ball.y}
                        x2={ball.x + BALL_RADIUS * 0.7}
                        y2={ball.y}
                        stroke="#FFFFFF"
                        strokeWidth={3}
                      />
                      <Line
                        x1={ball.x - BALL_RADIUS * 0.7}
                        y1={ball.y + 3}
                        x2={ball.x + BALL_RADIUS * 0.7}
                        y2={ball.y + 3}
                        stroke="#FFFFFF"
                        strokeWidth={3}
                      />
                    </>
                  )}

                  <Circle
                    cx={ball.x - 3}
                    cy={ball.y - 3}
                    r={3.5}
                    fill="white"
                    opacity={0.8}
                  />

                  {ball.id !== 0 && (
                    <>
                      <Circle
                        cx={ball.x}
                        cy={ball.y}
                        r={5}
                        fill="#FFFFFF"
                        pointerEvents="none"
                      />
                      <SvgText
                        x={ball.x}
                        y={ball.y + 3}
                        fontSize="8"
                        fontWeight="bold"
                        fill={ball.id === 8 ? "#FFFFFF" : "#000000"}
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {ball.id}
                      </SvgText>
                    </>
                  )}

                  {ball.id === 0 && (
                    <>
                      <Circle
                        cx={ball.x}
                        cy={ball.y}
                        r={4}
                        fill="none"
                        stroke="#000"
                        strokeWidth={1}
                      />
                      {ballInHand && isMyTurn && (
                        <Circle
                          cx={ball.x}
                          cy={ball.y}
                          r={BALL_RADIUS + 8}
                          fill="none"
                          stroke={ballInHandPlaced ? "#4CAF50" : "#FFD700"}
                          strokeWidth={3}
                          strokeDasharray="4,4"
                          opacity={0.8}
                        />
                      )}
                    </>
                  )}
                </React.Fragment>
              );
            })}

            {showAimGuides && (
                <>
                  <Circle
                    cx={cueBall.x}
                    cy={cueBall.y}
                    r={BALL_RADIUS + 12}
                    fill="none"
                    stroke={aimColor}
                    strokeWidth={2}
                    strokeDasharray="6,6"
                    opacity={0.6}
                  />
                  <Line
                    x1={cueStartX}
                    y1={cueStartY}
                    x2={cueEndX}
                    y2={cueEndY}
                    stroke={cueTheme.outlineColor}
                    strokeWidth={8}
                    strokeLinecap="round"
                  />
                  <Line
                    x1={cueStartX}
                    y1={cueStartY}
                    x2={cueEndX}
                    y2={cueEndY}
                    stroke={cueTheme.bodyColor}
                    strokeWidth={5}
                    strokeLinecap="round"
                  />
                  <Line
                    x1={wrapStartX}
                    y1={wrapStartY}
                    x2={wrapEndX}
                    y2={wrapEndY}
                    stroke={cueTheme.wrapColor}
                    strokeWidth={5.5}
                    strokeLinecap="round"
                  />
                  <Line
                    x1={accentStartX}
                    y1={accentStartY}
                    x2={accentEndX}
                    y2={accentEndY}
                    stroke={cueTheme.accentColor}
                    strokeWidth={1.6}
                    strokeDasharray={
                      cueTheme.accentDash !== "0,0" ? cueTheme.accentDash : undefined
                    }
                    opacity={0.95}
                  />
                  <Circle cx={cueStartX} cy={cueStartY} r={4} fill={cueTheme.ferruleColor} />
                  <Circle cx={cueStartX} cy={cueStartY} r={2.3} fill={cueTheme.tipColor} />
                  <Circle cx={cueEndX} cy={cueEndY} r={2.6} fill={cueTheme.buttColor} />
                </>
              )}
          </Svg>
        </View>

        {isMyTurn && !pushOutDecisionPending ? (
          <View style={styles.powerSliderContainer}>
            <View
              style={[styles.powerSlider, { height: tableLayout.sliderHeight }]}
              onStartShouldSetResponder={() => true}
              onResponderGrant={handlePowerTouchStart}
              onResponderMove={handlePowerTouchMove}
              onResponderRelease={handlePowerTouchEnd}
            >
              <View style={styles.powerTrack}>
                <View
                  style={[
                    styles.powerFill,
                    {
                      height: `${(power / GAME_CONFIG.MAX_POWER) * 100}%`,
                      backgroundColor: powerLevel.color,
                    },
                  ]}
                />
              </View>

              <View
                style={[
                  styles.powerThumb,
                  { bottom: `${(power / GAME_CONFIG.MAX_POWER) * 100}%` },
                ]}
              >
                <View style={styles.powerThumbInner} />
              </View>
            </View>

            <Text style={styles.powerSliderLabel}>LỰC</Text>
            <Text style={styles.powerValue}>{Math.round(power)}</Text>
            <Text style={styles.powerLevel}>{powerLevel.label}</Text>
          </View>
        ) : (
          <View style={styles.powerSliderContainer}>
            <View style={[styles.waitingTurnBox, { minHeight: tableLayout.sliderHeight }]}>
              <Text style={styles.waitingTurnText}>
                {pushOutDecisionPending
                  ? "Đang chờ chọn lượt đẩy tự do"
                  : isAiMatch
                    ? "Máy đang đánh"
                    : "Đang chờ đối thủ"}
              </Text>
              <Text style={styles.waitingTurnSubtext}>
                {pushOutDecisionPending
                  ? "Bạn cần chọn Đánh tiếp hoặc Trả lượt"
                  : "Thanh lực sẽ ẩn khi không phải lượt của bạn"}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        {canDeclarePushOut && (
          <TouchableOpacity
            style={[styles.button, styles.pushOutButton]}
            onPress={handleDeclarePushOut}
            hitSlop={mobileHitSlop}
            pressRetentionOffset={mobileHitSlop}
          >
            <Text style={styles.buttonText}>Đẩy tự do</Text>
          </TouchableOpacity>
        )}

        {canChoosePushOutDecision && (
          <View style={styles.pushOutDecisionRow}>
            <TouchableOpacity
              style={[styles.button, styles.pushOutDecisionPrimary]}
              onPress={() => handleChoosePushOutDecision(true)}
              hitSlop={mobileHitSlop}
              pressRetentionOffset={mobileHitSlop}
            >
              <Text style={styles.buttonText}>Đánh tiếp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.pushOutDecisionSecondary]}
              onPress={() => handleChoosePushOutDecision(false)}
              hitSlop={mobileHitSlop}
              pressRetentionOffset={mobileHitSlop}
            >
              <Text style={styles.buttonText}>Trả lượt</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isMultiplayer && (
          <TouchableOpacity
            style={styles.button}
            onPress={resetGame}
            hitSlop={mobileHitSlop}
            pressRetentionOffset={mobileHitSlop}
          >
            <Text style={styles.buttonText}>Chơi lại</Text>
          </TouchableOpacity>
        )}
      </View>

      {gameResult && (() => {
        const winner = gameResult.winner;
        const loser = gameResult.loser;
        const isWinnerMe = !isMultiplayer ? winner.id === 1 : (winner.id === 1 && isHost) || (winner.id === 2 && !isHost);
        const isLoserMe = !isMultiplayer ? loser.id === 1 : (loser.id === 1 && isHost) || (loser.id === 2 && !isHost);
        const betAmount = isAiMatch ? 0 : Math.max(0, Number(roomConfig?.betAmount ?? 0));
        const myCoinDelta = betAmount > 0 ? (isWinnerMe ? betAmount : -betAmount) : 0;
        const displayWinnerName = isWinnerMe ? "Bạn" : (winner.id === 1 ? player1DisplayName : player2DisplayName);
        const displayLoserName = isLoserMe ? "Bạn" : (loser.id === 1 ? player1DisplayName : player2DisplayName);
        return (
          <GameResultScreen
            visible={showGameResult}
            winner={{ ...winner, name: displayWinnerName }}
            loser={{ ...loser, name: displayLoserName }}
            gameStats={gameResult.gameStats}
            betAmount={betAmount}
            myCoinDelta={myCoinDelta}
            onBackToLobby={handleBackToLobby}
            onExit={handleExitGame}
          />
        );
      })()}

      <Modal
        visible={showExitModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelExitGame}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Rời bàn đấu</Text>

            <Text style={styles.modalMessage}>
              Bạn có chắc chắn muốn rời bàn không?
            </Text>

            <View style={styles.modalWarning}>
              <Text style={styles.modalWarningText}>
                Bạn sẽ THUA nếu rời giữa trận!
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={cancelExitGame}
                hitSlop={mobileHitSlop}
                pressRetentionOffset={mobileHitSlop}
              >
                <Text style={styles.modalButtonCancelText}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonConfirm}
                onPress={confirmExitGame}
                hitSlop={mobileHitSlop}
                pressRetentionOffset={mobileHitSlop}
              >
                <Text style={styles.modalButtonConfirmText}>Rời bàn</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#08172d",
    alignItems: "center",
    justifyContent: "flex-start",
    userSelect: "none" as any,
    paddingTop: 10,
    paddingBottom: 10,
  },
  hudTopBar: {
    width: "100%",
    maxWidth: 1280,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginBottom: 5,
    position: "relative",
    zIndex: 30,
    elevation: 22,
  },
  hudActionButton: {
    width: 32,
    height: 32,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#129a43",
    borderWidth: 2,
    borderColor: "#0d662d",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  hudActionIcon: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  hudCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginHorizontal: 6,
  },
  hudPlayerPanel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.45)",
    paddingHorizontal: 5,
    paddingVertical: 4,
    minWidth: 115,
    maxWidth: 170,
  },
  hudPlayerPanelActive: {
    borderColor: "#22c55e",
    shadowColor: "#22c55e",
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  hudAvatar: {
    width: 21,
    height: 21,
    borderRadius: 6,
    marginRight: 5,
  },
  hudAvatarBlue: {
    backgroundColor: "#1fa4ff",
  },
  hudAvatarPink: {
    backgroundColor: "#ff3f7f",
  },
  hudPlayerContent: {
    flex: 1,
    minWidth: 0,
  },
  hudPlayerLabel: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "700",
    marginBottom: 3,
  },
  hudProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  hudProgressDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "rgba(30,41,59,0.9)",
    borderWidth: 0.5,
    borderColor: "rgba(148,163,184,0.7)",
  },
  hudVsText: {
    color: "#22c55e",
    fontSize: 19,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statusPill: {
    width: "96%",
    maxWidth: 1200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.45)",
    marginBottom: 4,
    gap: 5,
    position: "relative",
    zIndex: 28,
    elevation: 20,
  },
  statusPillText: {
    flex: 1,
    color: "#dbeafe",
    fontSize: 7,
    fontWeight: "600",
  },
  timerBadge: {
    minWidth: 34,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.7)",
  },
  timerBadgeValue: {
    color: "#22c55e",
    fontSize: 8,
    fontWeight: "900",
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 16,
    backgroundColor: "#2196F3",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  header: {
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  playersContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 5,
  },
  playerCard: {
    backgroundColor: "#1a1a1a",
    borderWidth: 3,
    borderRadius: 12,
    padding: 10,
    minWidth: 150,
    alignItems: "center",
  },
  playerName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  playerScore: {
    fontSize: 14,
    color: "#FFD700",
    fontWeight: "600",
    marginBottom: 2,
  },
  playerBallType: {
    fontSize: 11,
    color: "#aaa",
  },
  messageBox: {
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  messageText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "bold",
  },
  ballInHandNotice: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#FFD700",
  },
  ballInHandText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "bold",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 10,
    gap: 12,
  },
  status: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
  timerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 52,
  },
  timerLabel: {
    color: "#fff",
    fontSize: 14,
    marginRight: 4,
  },
  timerValue: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "bold",
  },
  timerValueUrgent: {
    color: "#F44336",
  },
  gameArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
    width: "100%",
    zIndex: 10,
    elevation: 8,
  },
  tableContainer: {
    backgroundColor: "#782615",
    padding: 10,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(148, 163, 184, 0.65)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 12,
    userSelect: "none" as any,
  },
  powerSliderContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  waitingTurnBox: {
    width: 50,
    minHeight: 300,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
  },
  waitingTurnText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  waitingTurnSubtext: {
    color: "#64748b",
    fontSize: 9,
    marginTop: 6,
    textAlign: "center",
  },
  powerSlider: {
    width: 50,
    height: 300,
    position: "relative",
    justifyContent: "flex-end",
  },
  powerTrack: {
    width: 12,
    height: "100%",
    backgroundColor: "#333",
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#555",
    position: "absolute",
    left: 19,
  },
  powerFill: {
    width: "100%",
    position: "absolute",
    bottom: 0,
    borderRadius: 4,
  },
  powerThumb: {
    position: "absolute",
    left: 10,
    width: 30,
    height: 30,
    marginBottom: -15,
    alignItems: "center",
    justifyContent: "center",
  },
  powerThumbInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFD700",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  powerSliderLabel: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 8,
  },
  powerValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 2,
  },
  powerLevel: {
    color: "#aaa",
    fontSize: 11,
    marginTop: 2,
  },
  controls: {
    marginTop: 10,
    alignItems: "center",
    gap: 8,
    width: "95%",
    maxWidth: 1180,
    position: "relative",
    zIndex: 26,
    elevation: 18,
  },
  pushOutDecisionRow: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  pushOutButton: {
    backgroundColor: "#2563eb",
  },
  pushOutDecisionPrimary: {
    backgroundColor: "#16a34a",
  },
  pushOutDecisionSecondary: {
    backgroundColor: "#475569",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    padding: 24,
    width: "85%",
    maxWidth: 400,
    borderWidth: 2,
    borderColor: "#FFD700",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFD700",
    textAlign: "center",
    marginBottom: 16,
  },
  modalMessage: {
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 24,
  },
  modalWarning: {
    backgroundColor: "#FF5722",
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },
  modalWarningText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: "#666",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonCancelText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalButtonConfirm: {
    flex: 1,
    backgroundColor: "#F44336",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonConfirmText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});

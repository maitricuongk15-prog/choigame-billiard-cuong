// app/(tabs)/explore(game).tsx - GAME BI-A + ĐỒNG BỘ MULTIPLAYER
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Modal } from "react-native";
import { router } from "expo-router";
import Svg, {
  Circle,
  Line,
  Rect,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BALL_RADIUS,
  POCKETS,
} from "../../utils/physics";
import { GAME_CONFIG, GAME_MESSAGES } from "../../constants/game";
import { useTwoPlayerGameLogic } from "../../hooks/useTwoPlayerGameLogic";
import { useAimControl } from "../../hooks/useAimControl";
import { useGameContext } from "../../context/gameContext";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

export default function BilliardGame() {
  const { roomId, roomHostId, player1Name, player2Name, setPlayerNames } = useGameContext();
  const { user } = useAuth();

  const gameChannelRef = useRef<RealtimeChannel | null>(null);
  const isMultiplayer = !!(roomId && roomId !== "RANDOM");
  const isHost =
    isMultiplayer &&
    !!user &&
    !!roomHostId &&
    String(user.id) === String(roomHostId);

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
  } = useTwoPlayerGameLogic({
    onGameOver: (result) => {
      // Cả host và guest đều broadcast khi kết thúc trận (guest khi forfeit, host khi thắng bình thường)
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
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(GAME_CONFIG.TURN_TIME_SECONDS);
  /** Chặn bắn ngay khi hết giờ, trước khi state đổi lượt kịp cập nhật */
  const [turnTimeoutBlockShooting, setTurnTimeoutBlockShooting] = useState(false);

  const turnTimeoutBlockRef = useRef(false);
  const wasMovingRef = useRef(false);
  const guestReceivedStateRef = useRef(false);
  const initialBroadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestStateResponseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afterTurnChangeBroadcastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getStateSnapshotRef = useRef(getStateSnapshot);
  getStateSnapshotRef.current = getStateSnapshot;
  const forceSwitchTurnRef = useRef(forceSwitchTurn);
  forceSwitchTurnRef.current = forceSwitchTurn;

  const myPlayerNumber = isMultiplayer ? (isHost ? 1 : 2) : null;
  const isMyTurn =
    myPlayerNumber === null
      ? true
      : isHost
        ? gameState.currentPlayer === myPlayerNumber
        : guestReceivedStateRef.current &&
          gameState.currentPlayer === myPlayerNumber;

  // Chỉ HOST reset game khi bắt đầu trận (random ai đánh trước). Guest đợi state từ host.
  useEffect(() => {
    if (!roomId) return;
    if (isMultiplayer && !isHost) return;
    resetGame();
  }, [roomId, isMultiplayer, isHost]);

  // Kênh Realtime đồng bộ game (host broadcast state, guest gửi shot)
  useEffect(() => {
    if (!isMultiplayer || !roomId) return;

    if (!isHost) guestReceivedStateRef.current = false;

    const channel = supabase.channel(`game:${roomId}`);
    gameChannelRef.current = channel;

    channel
      .on("broadcast", { event: "game_state" }, ({ payload }) => {
        if (isHost) return;
        guestReceivedStateRef.current = true;
        applyRemoteState(payload as Parameters<typeof applyRemoteState>[0]);
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
          setCueBallPosition(cueBallX, cueBallY);
        }
        setTimeout(() => shootCueBall(angle, p), 50);
      })
      .on("broadcast", { event: "timeout_switch_turn" }, () => {
        if (!isHost) return;
        forceSwitchTurnRef.current();
        // Host đổi lượt xong cần broadcast state để guest nhận (không có bi lăn nên không có broadcast tự động)
        setTimeout(() => {
          gameChannelRef.current?.send({
            type: "broadcast",
            event: "game_state",
            payload: getStateSnapshotRef.current(),
          });
        }, 100);
      })
      .on("broadcast", { event: "request_state" }, () => {
        if (!isHost) return;
        // Trì hoãn gửi state để resetGame() đã commit (setState bất đồng bộ). Nếu gửi ngay thì getStateSnapshot() vẫn currentPlayer: 1 → hai màn hình lệch ai đánh trước.
        if (requestStateResponseTimeoutRef.current) {
          clearTimeout(requestStateResponseTimeoutRef.current);
        }
        requestStateResponseTimeoutRef.current = setTimeout(() => {
          requestStateResponseTimeoutRef.current = null;
          gameChannelRef.current?.send({
            type: "broadcast",
            event: "game_state",
            payload: getStateSnapshotRef.current(),
          });
        }, 250);
      })
      .on("broadcast", { event: "game_over" }, ({ payload }) => {
        // Xử lý khi nhận từ bên kia (vd: guest forfeit → host nhận; host thắng → guest nhận)
        const { player1Name: p1, player2Name: p2, ...result } = payload as { player1Name?: string; player2Name?: string } & Parameters<typeof applyRemoteGameResult>[0];
        if (p1 != null || p2 != null) {
          setPlayerNames(p1 ?? player1Name, p2 ?? player2Name);
        }
        applyRemoteGameResult(result);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (isHost) {
            // Host: gửi state SAU khi resetGame() đã áp dụng (setState bất đồng bộ)
            // Nếu gửi ngay thì getStateSnapshot() vẫn là state cũ → guest và host lệch ai đánh trước
            initialBroadcastTimeoutRef.current = setTimeout(() => {
              gameChannelRef.current?.send({
                type: "broadcast",
                event: "game_state",
                payload: getStateSnapshotRef.current(),
              });
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
      supabase.removeChannel(channel);
      gameChannelRef.current = null;
    };
  }, [roomId, isMultiplayer, isHost]);

  const isMoving = isGameMoving(balls);

  // Host: broadcast state ĐỊNH KỲ khi bi đang lăn để guest thấy animation. Dùng ref để mỗi lần gửi là state mới nhất (vị trí bi đang lăn), tránh closure cũ.
  useEffect(() => {
    if (!isHost || !isMultiplayer || !isMoving) return;
    wasMovingRef.current = true;
    const interval = setInterval(() => {
      gameChannelRef.current?.send({
        type: "broadcast",
        event: "game_state",
        payload: getStateSnapshotRef.current(),
      });
    }, 50);
    return () => clearInterval(interval);
  }, [isMoving, isHost, isMultiplayer]);

  // Host: broadcast state khi bi dừng hẳn (lần cuối). Gửi thêm 1 lần trễ sau khi endTurn đã đổi lượt.
  useEffect(() => {
    if (!isMoving && wasMovingRef.current && isHost && isMultiplayer) {
      wasMovingRef.current = false;
      gameChannelRef.current?.send({
        type: "broadcast",
        event: "game_state",
        payload: getStateSnapshotRef.current(),
      });
      // endTurn chạy trong setTimeout(500ms) ở hook → gửi lại state sau ~600ms để guest nhận đúng currentPlayer (lượt mới).
      if (afterTurnChangeBroadcastRef.current) {
        clearTimeout(afterTurnChangeBroadcastRef.current);
      }
      afterTurnChangeBroadcastRef.current = setTimeout(() => {
        afterTurnChangeBroadcastRef.current = null;
        gameChannelRef.current?.send({
          type: "broadcast",
          event: "game_state",
          payload: getStateSnapshotRef.current(),
        });
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

  // Reset đồng hồ lượt và bỏ chặn bắn khi đổi người chơi
  useEffect(() => {
    setTurnTimeLeft(GAME_CONFIG.TURN_TIME_SECONDS);
    setTurnTimeoutBlockShooting(false);
    turnTimeoutBlockRef.current = false;
  }, [gameState.currentPlayer]);

  // Bộ đếm giờ mỗi lượt: 15s, hết giờ thì chuyển lượt (host gọi forceSwitchTurn, guest gửi event)
  const turnTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cueBallPocketed = balls[0]?.isPocketed ?? false;
  useEffect(() => {
    const canCountDown =
      isMyTurn &&
      !isMoving &&
      (!ballInHand || ballInHandPlaced) &&
      !showGameResult &&
      !cueBallPocketed;

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
          // Chặn bắn ngay (ref) rồi mới đổi lượt, tránh bắn trước khi state cập nhật
          turnTimeoutBlockRef.current = true;
          setTimeout(() => {
            setTurnTimeoutBlockShooting(true);
            if (isHost || !isMultiplayer) {
              forceSwitchTurnRef.current();
              // Host đổi lượt xong cần broadcast state để guest nhận
              if (isHost && isMultiplayer) {
                setTimeout(() => {
                  gameChannelRef.current?.send({
                    type: "broadcast",
                    event: "game_state",
                    payload: getStateSnapshotRef.current(),
                  });
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
          return GAME_CONFIG.TURN_TIME_SECONDS;
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
    isHost,
    isMultiplayer,
  ]);

  const cueBall = balls[0];

  const handleShoot = (angle: number, power: number) => {
    if (turnTimeoutBlockRef.current) return;
    if (turnTimeoutBlockShooting) return;
    setTurnTimeLeft(GAME_CONFIG.TURN_TIME_SECONDS);
    if (isHost || !isMultiplayer) {
      shootCueBall(angle, power);
    } else {
      gameChannelRef.current?.send({
        type: "broadcast",
        event: "shot",
        payload: {
          angle,
          power,
          cueBallX: cueBall.x,
          cueBallY: cueBall.y,
        },
      });
    }
  };

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
    canPlay: isMyTurn && !turnTimeoutBlockShooting,
  });

  const currentPlayer = gameState.players[gameState.currentPlayer - 1];

  const { aimEndX, aimEndY } = calculateAimLine(cueBall, aimAngle);
  const predictionDots = calculatePredictionDots(cueBall, aimAngle);
  const { cueStartX, cueStartY, cueEndX, cueEndY } = calculateCuePosition(
    cueBall,
    aimAngle,
  );

  const targetPredictions = calculateTargetPredictions(
    cueBall,
    aimAngle,
    balls,
    isMoving,
  );
  const closestTarget = findClosestTarget(targetPredictions, cueBall);
  const cueBallReflection = closestTarget
    ? calculateCueBallReflection(closestTarget, cueBall)
    : null;

  const powerLevel = getPowerLevel(power);

  const statusMessage = !isMyTurn
    ? `⏳ Đang chờ lượt đối thủ (${currentPlayer.name})...`
    : cueBall.isPocketed
      ? GAME_MESSAGES.CUE_BALL_IN_HOLE
      : ballInHand
        ? `${currentPlayer.name} - 🎯 Kéo bi trắng để đặt | Kéo ngoài để nhắm`
        : isMoving
          ? GAME_MESSAGES.BALLS_MOVING
          : `${currentPlayer.name} - ${GAME_MESSAGES.READY_TO_AIM}`;

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

  const isTouchOnCueBall = (touchX: number, touchY: number): boolean => {
    const dx = touchX - cueBall.x;
    const dy = touchY - cueBall.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= BALL_RADIUS + 15;
  };

  // ✅ HÀM XỬ LÝ KHI BẤM NÚT LOBBY - HIỆN MODAL
  const handleBackToLobbyButton = () => {
    setShowExitModal(true);
  };

  // ✅ SỬA: Hàm confirmExitGame để xử lý forfeit
  const confirmExitGame = () => {
    setShowExitModal(false);

    // ✅ Kiểm tra game đang chơi: có bi đang lăn HOẶC còn bi chưa vào lỗ (ngoài bi trắng)
    const gameInProgress =
      balls.some((b) => Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01) ||
      balls.some((b) => !b.isPocketed && b.id !== 0);

    if (gameInProgress) {
      // Game đang chơi → Người bấm rời bàn là người thua
      handleForfeit((myPlayerNumber ?? 1) as 1 | 2);
    } else {
      // Game đã kết thúc → Về lobby bình thường
      resetGame();
      router.push("/");
    }
  };

  const cancelExitGame = () => {
    setShowExitModal(false);
  };

  // Handlers cho Game Result Screen
  const handleBackToLobby = () => {
    setShowGameResult(false);
    resetGame();
    router.push("/");
  };

  const handleExitGame = () => {
    setShowGameResult(false);
    resetGame();
    router.push("/");
  };

  const handleCueBallTouchStart = (event: any) => {
    if (!isMyTurn) return; // Chỉ người đang có lượt (và ball in hand) mới được kéo/nhắm
    if (!ballInHand) return;
    if (turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;

    const { touchX, touchY } = getTouchCoordinates(event);
    const onCueBall = isTouchOnCueBall(touchX, touchY);

    if (onCueBall) {
      setIsDraggingCueBall(true);
    } else {
      setIsAimingInBallInHand(true);
      handleTableTouchStart(event);
    }
  };

  const handleCueBallTouchMove = (event: any) => {
    if (!isMyTurn) return;
    if (!ballInHand) return;
    if (turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;

    if (isDraggingCueBall) {
      const { touchX, touchY } = getTouchCoordinates(event);

      const minX = BALL_RADIUS + 10;
      const maxX = TABLE_WIDTH - BALL_RADIUS - 10;
      const minY = BALL_RADIUS + 10;
      const maxY = TABLE_HEIGHT - BALL_RADIUS - 10;

      const clampedX = Math.max(minX, Math.min(maxX, touchX));
      const clampedY = Math.max(minY, Math.min(maxY, touchY));

      const wouldCollide = balls.some((ball) => {
        if (ball.id === 0 || ball.isPocketed) return false;

        const dx = clampedX - ball.x;
        const dy = clampedY - ball.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < BALL_RADIUS * 2;
      });

      if (!wouldCollide) {
        moveCueBall(clampedX, clampedY);
      }
    } else if (isAimingInBallInHand) {
      handleTableTouchMove(event);
    }
  };

  const handleCueBallTouchEnd = () => {
    if (!isMyTurn) return;
    if (turnTimeoutBlockRef.current || turnTimeoutBlockShooting) return;
    setIsDraggingCueBall(false);

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
        onResponderGrant: handleTableTouchStart,
        onResponderMove: handleTableTouchMove,
        onResponderRelease: handleTableTouchEnd,
      };

  // ⚠️ TIẾP TỤC PHẦN 2/2// app/(tabs)/index.tsx - PHẦN 2/2 (TIẾP TỤC TỪ PHẦN 1)

  return (
    <View style={styles.container}>
      {/* ✅ NÚT BACK TO LOBBY VỚI MODAL */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBackToLobbyButton}
      >
        <Text style={styles.backButtonText}>← Lobby</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>🎱 Bi-a 2 Người Chơi</Text>

        <View style={styles.playersContainer}>
          <View
            style={[
              styles.playerCard,
              {
                borderColor:
                  gameState.currentPlayer === 1 ? currentPlayer.color : "#666",
                backgroundColor:
                  gameState.currentPlayer === 1
                    ? "rgba(76, 175, 80, 0.1)"
                    : "#1a1a1a",
              },
            ]}
          >
            <Text
              style={[styles.playerName, { color: gameState.players[0].color }]}
            >
              {gameState.currentPlayer === 1 && "▶ "}
              {gameState.players[0].name}
            </Text>
            <Text style={styles.playerScore}>
              Điểm: {gameState.players[0].score}
            </Text>
            <Text style={styles.playerBallType}>
              {gameState.players[0].ballType === "none"
                ? "Chưa chọn"
                : gameState.players[0].ballType === "solid"
                  ? `🔴 Bi màu 1-7 (${player1Balls})`
                  : `🟣 Bi khoang 9-15 (${player1Balls})`}
            </Text>
          </View>

          <View
            style={[
              styles.playerCard,
              {
                borderColor:
                  gameState.currentPlayer === 2 ? currentPlayer.color : "#666",
                backgroundColor:
                  gameState.currentPlayer === 2
                    ? "rgba(33, 150, 243, 0.1)"
                    : "#1a1a1a",
              },
            ]}
          >
            <Text
              style={[styles.playerName, { color: gameState.players[1].color }]}
            >
              {gameState.currentPlayer === 2 && "▶ "}
              {gameState.players[1].name}
            </Text>
            <Text style={styles.playerScore}>
              Điểm: {gameState.players[1].score}
            </Text>
            <Text style={styles.playerBallType}>
              {gameState.players[1].ballType === "none"
                ? "Chưa chọn"
                : gameState.players[1].ballType === "solid"
                  ? `🔴 Bi màu 1-7 (${player2Balls})`
                  : `🟣 Bi khoang 9-15 (${player2Balls})`}
            </Text>
          </View>
        </View>
      </View>

      {message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      <View style={styles.statusRow}>
        <Text style={styles.status}>{statusMessage}</Text>
        <View style={styles.timerBox}>
          <Text style={styles.timerLabel}>⏱</Text>
          <Text
            style={[
              styles.timerValue,
              turnTimeLeft <= 5 && isMyTurn && styles.timerValueUrgent,
            ]}
          >
            {turnTimeLeft}s
          </Text>
        </View>
      </View>

      {ballInHand && isMyTurn && (
        <View style={styles.ballInHandNotice}>
          <Text style={styles.ballInHandText}>
            ✋ KÉO BI TRẮNG ĐỂ ĐẶT | KÉO NGOÀI ĐỂ NHẮM
          </Text>
        </View>
      )}

      <View style={styles.gameArea}>
        <View style={styles.tableContainer} {...handleTableTouch}>
          <Svg width={TABLE_WIDTH} height={TABLE_HEIGHT}>
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
              fill="#0d5c2d"
              stroke="#8B4513"
              strokeWidth={10}
            />

            {POCKETS.map((pocket, index) => (
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

            {isMyTurn &&
              !isMoving &&
              !cueBall.isPocketed &&
              (!ballInHand || (ballInHand && ballInHandPlaced)) && (
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
                      <text
                        x={ball.x}
                        y={ball.y + 3}
                        fontSize="8"
                        fontWeight="bold"
                        fill={ball.id === 8 ? "#FFFFFF" : "#000000"}
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {ball.id}
                      </text>
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

            {isMyTurn &&
              !isMoving &&
              !cueBall.isPocketed &&
              (!ballInHand || (ballInHand && ballInHandPlaced)) && (
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
                    stroke="#654321"
                    strokeWidth={7}
                    strokeLinecap="round"
                  />
                  <Line
                    x1={cueStartX}
                    y1={cueStartY}
                    x2={cueEndX}
                    y2={cueEndY}
                    stroke="#8B4513"
                    strokeWidth={5}
                    strokeLinecap="round"
                  />
                  <Circle cx={cueStartX} cy={cueStartY} r={3} fill="#E8E8E8" />
                </>
              )}
          </Svg>
        </View>

        {isMyTurn ? (
          <View style={styles.powerSliderContainer}>
            <View
              style={styles.powerSlider}
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
            <View style={styles.waitingTurnBox}>
              <Text style={styles.waitingTurnText}>⏳ Chờ lượt đối thủ</Text>
              <Text style={styles.waitingTurnSubtext}>
                Không hiện thanh lực khi không tới lượt
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        {!isMultiplayer && (
          <TouchableOpacity style={styles.button} onPress={resetGame}>
            <Text style={styles.buttonText}>🔄 Chơi lại</Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ✨ {currentPlayer.name} | Vàng = chưa đặt | Xanh = đã đặt
          </Text>
          <Text style={styles.infoText}>
            🎯 Bi màu (1-7) vs Bi khoang (9-15)
          </Text>
          <Text style={styles.infoText}>
            ⚫ Bi 8 đánh cuối | Bi trắng → Ball in hand (phải chạm bi khác)
          </Text>
        </View>
      </View>

      {/* ✅ GAME RESULT SCREEN */}
      {gameResult && (() => {
        const winner = gameResult.winner;
        const loser = gameResult.loser;
        const isWinnerMe = !isMultiplayer ? winner.id === 1 : (winner.id === 1 && isHost) || (winner.id === 2 && !isHost);
        const isLoserMe = !isMultiplayer ? loser.id === 1 : (loser.id === 1 && isHost) || (loser.id === 2 && !isHost);
        const displayWinnerName = isWinnerMe ? "Bạn" : (winner.id === 1 ? player1Name : player2Name);
        const displayLoserName = isLoserMe ? "Bạn" : (loser.id === 1 ? player1Name : player2Name);
        return (
          <GameResultScreen
            visible={showGameResult}
            winner={{ ...winner, name: displayWinnerName }}
            loser={{ ...loser, name: displayLoserName }}
            gameStats={gameResult.gameStats}
            onBackToLobby={handleBackToLobby}
            onExit={handleExitGame}
          />
        );
      })()}

      {/* ✅ MODAL XÁC NHẬN RỜI BÀN */}
      <Modal
        visible={showExitModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelExitGame}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>🚪 Rời bàn bi-a</Text>

            <Text style={styles.modalMessage}>
              Bạn có chắc chắn muốn rời bàn?
            </Text>

            <View style={styles.modalWarning}>
              <Text style={styles.modalWarningText}>
                ⚠️ Bạn sẽ bị xử THUA nếu rời giữa chừng!
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={cancelExitGame}
              >
                <Text style={styles.modalButtonCancelText}>❌ Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonConfirm}
                onPress={confirmExitGame}
              >
                <Text style={styles.modalButtonConfirmText}>✅ Rời bàn</Text>
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
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none" as any,
    paddingVertical: 10,
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
    gap: 15,
  },
  tableContainer: {
    backgroundColor: "#8B4513",
    padding: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
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
  },
  button: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },
  infoBox: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#444",
  },
  infoText: {
    color: "#888",
    fontSize: 10,
    textAlign: "center",
    marginVertical: 1,
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

import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import {
  FRICTION,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BALL_RADIUS,
  checkCollision,
  resolveCollision,
  checkWallCollision,
} from "./utils/physics";

export default function App() {
  const [balls, setBalls] = useState([
    { id: 0, x: 175, y: 500, vx: 0, vy: 0, color: "#ffffff" }, // Bi trắng
    { id: 1, x: 175, y: 150, vx: 0, vy: 0, color: "#ff0000" },
    { id: 2, x: 160, y: 135, vx: 0, vy: 0, color: "#ffff00" },
    { id: 3, x: 190, y: 135, vx: 0, vy: 0, color: "#0000ff" },
  ]);

  const [cueAngle, setCueAngle] = useState(0);
  const [cuePower, setCuePower] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const animationFrame = useRef(null);

  useEffect(() => {
    const updateGame = () => {
      setBalls((prevBalls) => {
        const newBalls = prevBalls.map((ball) => ({
          ...ball,
          x: ball.x + ball.vx,
          y: ball.y + ball.vy,
          vx: ball.vx * FRICTION,
          vy: ball.vy * FRICTION,
        }));

        // Kiểm tra va chạm giữa các bi
        for (let i = 0; i < newBalls.length; i++) {
          for (let j = i + 1; j < newBalls.length; j++) {
            if (checkCollision(newBalls[i], newBalls[j])) {
              resolveCollision(newBalls[i], newBalls[j]);
            }
          }
          checkWallCollision(newBalls[i]);
        }

        // Dừng các bi chuyển động chậm
        return newBalls.map((ball) => ({
          ...ball,
          vx: Math.abs(ball.vx) < 0.1 ? 0 : ball.vx,
          vy: Math.abs(ball.vy) < 0.1 ? 0 : ball.vy,
        }));
      });

      animationFrame.current = requestAnimationFrame(updateGame);
    };

    animationFrame.current = requestAnimationFrame(updateGame);
    return () => cancelAnimationFrame(animationFrame.current);
  }, []);

  const handleTouchStart = (event) => {
    const touch = event.nativeEvent.touches[0];
    setDragStart({ x: touch.pageX, y: touch.pageY });
    setIsDragging(true);
  };

  const handleTouchMove = (event) => {
    if (!isDragging) return;
    const touch = event.nativeEvent.touches[0];
    const dx = touch.pageX - dragStart.x;
    const dy = touch.pageY - dragStart.y;
    const angle = Math.atan2(dy, dx);
    const power = Math.min(Math.sqrt(dx * dx + dy * dy) / 10, 15);

    setCueAngle(angle);
    setCuePower(power);
  };

  const handleTouchEnd = () => {
    if (isDragging && cuePower > 0) {
      setBalls((prevBalls) => {
        const newBalls = [...prevBalls];
        newBalls[0].vx = -Math.cos(cueAngle) * cuePower;
        newBalls[0].vy = -Math.sin(cueAngle) * cuePower;
        return newBalls;
      });
    }
    setIsDragging(false);
    setCuePower(0);
  };

  const resetGame = () => {
    setBalls([
      { id: 0, x: 175, y: 500, vx: 0, vy: 0, color: "#ffffff" },
      { id: 1, x: 175, y: 150, vx: 0, vy: 0, color: "#ff0000" },
      { id: 2, x: 160, y: 135, vx: 0, vy: 0, color: "#ffff00" },
      { id: 3, x: 190, y: 135, vx: 0, vy: 0, color: "#0000ff" },
    ]);
  };

  const cueBall = balls[0];
  const cueLength = 100;
  const cueX =
    cueBall.x + Math.cos(cueAngle) * (BALL_RADIUS + 10 + cuePower * 3);
  const cueY =
    cueBall.y + Math.sin(cueAngle) * (BALL_RADIUS + 10 + cuePower * 3);
  const cueEndX = cueX + Math.cos(cueAngle) * cueLength;
  const cueEndY = cueY + Math.sin(cueAngle) * cueLength;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>🎱 Game Bi-a</Text>

      <View
        style={styles.tableContainer}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Svg width={TABLE_WIDTH} height={TABLE_HEIGHT}>
          {/* Bàn bi-a */}
          <Rect
            x={0}
            y={0}
            width={TABLE_WIDTH}
            height={TABLE_HEIGHT}
            fill="#0d5c2d"
            stroke="#8B4513"
            strokeWidth={10}
          />

          {/* Các quả bi */}
          {balls.map((ball) => (
            <Circle
              key={ball.id}
              cx={ball.x}
              cy={ball.y}
              r={BALL_RADIUS}
              fill={ball.color}
              stroke="#000"
              strokeWidth={1}
            />
          ))}

          {/* Cơ bi-a */}
          {isDragging && (
            <Line
              x1={cueX}
              y1={cueY}
              x2={cueEndX}
              y2={cueEndY}
              stroke="#8B4513"
              strokeWidth={4}
              strokeLinecap="round"
            />
          )}
        </Svg>
      </View>

      <View style={styles.controls}>
        <Text style={styles.instruction}>Kéo từ bi trắng để đánh</Text>
        <TouchableOpacity style={styles.button} onPress={resetGame}>
          <Text style={styles.buttonText}>Chơi lại</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
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
  },
  controls: {
    marginTop: 30,
    alignItems: "center",
  },
  instruction: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});

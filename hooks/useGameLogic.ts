// hooks/useGameLogic.ts
import { useState, useEffect, useRef } from "react";
import { initialBalls } from "../constants/billiard";
import { GAME_CONFIG, GAME_MESSAGES } from "../constants/game";
import {
  checkCollision,
  resolveCollision,
  checkWallCollision,
  checkPocket,
  applyFriction,
  type Ball,
} from "../utils/physics";

export const useGameLogic = () => {
  const [balls, setBalls] = useState<Ball[]>(initialBalls);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState("");
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    const updateGame = () => {
      setBalls((prevBalls) => {
        const newBalls = prevBalls.map((ball) => {
          if (ball.isPocketed) return ball;
          return {
            ...ball,
            x: ball.x + ball.vx,
            y: ball.y + ball.vy,
          };
        });

        newBalls.forEach((ball) => {
          applyFriction(ball);
        });

        for (let i = 0; i < newBalls.length; i++) {
          for (let j = i + 1; j < newBalls.length; j++) {
            if (checkCollision(newBalls[i], newBalls[j])) {
              resolveCollision(newBalls[i], newBalls[j]);
            }
          }
          checkWallCollision(newBalls[i]);
        }

        newBalls.forEach((ball) => {
          if (!ball.isPocketed) {
            const pocket = checkPocket(ball);
            if (pocket) {
              ball.isPocketed = true;
              ball.vx = 0;
              ball.vy = 0;
              ball.x = pocket.x;
              ball.y = pocket.y;

              if (ball.id === 0) {
                setScore((prev) =>
                  Math.max(0, prev + GAME_CONFIG.CUE_BALL_PENALTY),
                );
                setMessage(GAME_MESSAGES.CUE_BALL_POCKETED);
                setTimeout(() => setMessage(""), GAME_CONFIG.MESSAGE_DURATION);
              } else {
                setScore((prev) => prev + GAME_CONFIG.POINTS_PER_BALL);
                setMessage(GAME_MESSAGES.BALL_POCKETED);
                setTimeout(() => setMessage(""), GAME_CONFIG.MESSAGE_DURATION);
              }
            }
          }
        });

        return newBalls;
      });

      animationFrame.current = requestAnimationFrame(updateGame);
    };

    animationFrame.current = requestAnimationFrame(updateGame);
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, []);

  const resetGame = () => {
    setBalls(initialBalls);
    setScore(0);
    setMessage("");
  };

  const shootCueBall = (aimAngle: number, power: number) => {
    setBalls((prevBalls) => {
      const newBalls = [...prevBalls];
      newBalls[0].vx = Math.cos(aimAngle) * power;
      newBalls[0].vy = Math.sin(aimAngle) * power;
      return newBalls;
    });
  };

  return {
    balls,
    score,
    message,
    resetGame,
    shootCueBall,
    setMessage,
  };
};

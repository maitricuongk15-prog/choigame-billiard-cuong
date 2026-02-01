// utils/gameHelpers.ts - ĐẦY ĐỦ SỬA LỖI
import { GAME_CONFIG, POWER_LEVELS } from "../constants/game";
import type { Ball } from "./physics";

export const calculateAimAngle = (
  touchX: number,
  touchY: number,
  cueBall: Ball,
): number => {
  return Math.atan2(touchY - cueBall.y, touchX - cueBall.x);
};

export const calculatePowerFromTouch = (
  touchY: number,
  sliderHeight: number = GAME_CONFIG.SLIDER_HEIGHT,
): number => {
  const newPower =
    ((sliderHeight - touchY) / sliderHeight) * GAME_CONFIG.MAX_POWER;
  return Math.max(
    GAME_CONFIG.MIN_POWER,
    Math.min(GAME_CONFIG.MAX_POWER, newPower),
  );
};

export const getPowerLevel = (power: number) => {
  if (power < POWER_LEVELS.WEAK.max) return POWER_LEVELS.WEAK;
  if (power < POWER_LEVELS.MEDIUM.max) return POWER_LEVELS.MEDIUM;
  return POWER_LEVELS.STRONG;
};

export const calculateAimLine = (cueBall: Ball, aimAngle: number) => {
  const aimEndX = cueBall.x + Math.cos(aimAngle) * GAME_CONFIG.AIM_LINE_LENGTH;
  const aimEndY = cueBall.y + Math.sin(aimAngle) * GAME_CONFIG.AIM_LINE_LENGTH;
  return { aimEndX, aimEndY };
};

export const calculatePredictionDots = (cueBall: Ball, aimAngle: number) => {
  const dots = [];
  for (let i = 1; i <= GAME_CONFIG.PREDICTION_DOTS; i++) {
    const dotDistance = GAME_CONFIG.PREDICTION_DOT_SPACING * i;
    dots.push({
      x: cueBall.x + Math.cos(aimAngle) * dotDistance,
      y: cueBall.y + Math.sin(aimAngle) * dotDistance,
    });
  }
  return dots;
};

export const calculateCuePosition = (cueBall: Ball, aimAngle: number) => {
  const cueStartX = cueBall.x - Math.cos(aimAngle) * GAME_CONFIG.CUE_DISTANCE;
  const cueStartY = cueBall.y - Math.sin(aimAngle) * GAME_CONFIG.CUE_DISTANCE;
  const cueEndX = cueStartX - Math.cos(aimAngle) * GAME_CONFIG.CUE_LENGTH;
  const cueEndY = cueStartY - Math.sin(aimAngle) * GAME_CONFIG.CUE_LENGTH;
  return { cueStartX, cueStartY, cueEndX, cueEndY };
};

export const getTouchCoordinates = (
  event: any,
): { touchX: number; touchY: number } => {
  const touch = event.nativeEvent;
  const touchX =
    touch.locationX !== undefined
      ? touch.locationX
      : touch.touches[0].locationX;
  const touchY =
    touch.locationY !== undefined
      ? touch.locationY
      : touch.touches[0].locationY;
  return { touchX, touchY };
};

// ✅ SỬA LỖI 4: Giảm threshold từ 0.05 → 0.01
export const isGameMoving = (balls: Ball[]): boolean => {
  return balls.some(
    (ball) =>
      !ball.isPocketed &&
      (Math.abs(ball.vx) > 0.01 || Math.abs(ball.vy) > 0.01), // ✅ SỬA: 0.05 → 0.01
  );
};

export const countPocketedBalls = (balls: Ball[]): number => {
  return balls.filter((ball) => ball.id !== 0 && ball.isPocketed).length;
};

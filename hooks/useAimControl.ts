// hooks/useAimControl.ts
import { useRef, useState } from "react";
import { GAME_CONFIG } from "../constants/game";
import {
  calculateAimAngle,
  calculatePowerFromTouch,
  getTouchCoordinates,
} from "../utils/gameHelpers";
import type { Ball } from "../utils/physics";

interface UseAimControlProps {
  isMoving: boolean;
  cueBall: Ball;
  onShoot: (angle: number, power: number) => void;
  /** Khi false = không tới lượt → không cho ngắm / kéo lực */
  canPlay?: boolean;
  sliderHeight?: number;
}

export const useAimControl = ({
  isMoving,
  cueBall,
  onShoot,
  canPlay = true,
  sliderHeight = GAME_CONFIG.SLIDER_HEIGHT,
}: UseAimControlProps) => {
  const INPUT_UPDATE_INTERVAL_MS = 16;
  const AIM_MIN_DELTA = 0.005;
  const POWER_MIN_DELTA = 0.05;
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [power, setPower] = useState<number>(GAME_CONFIG.DEFAULT_POWER);
  const [isAiming, setIsAiming] = useState<boolean>(false);
  const [isDraggingPower, setIsDraggingPower] = useState<boolean>(false);
  const lastAimUpdateAtRef = useRef(0);
  const lastPowerUpdateAtRef = useRef(0);
  const lastAimValueRef = useRef(0);
  const lastPowerValueRef = useRef(GAME_CONFIG.DEFAULT_POWER);

  // Xử lý chạm trên bàn bi
  const handleTableTouchStart = (event: any) => {
    if (!canPlay || isMoving || cueBall.isPocketed) return;

    const { touchX, touchY } = getTouchCoordinates(event);
    const angle = calculateAimAngle(touchX, touchY, cueBall);
    lastAimValueRef.current = angle;
    lastAimUpdateAtRef.current = Date.now();
    setAimAngle(angle);
    setIsAiming(true);
  };

  const handleTableTouchMove = (event: any) => {
    if (!isAiming || isDraggingPower) return;

    const now = Date.now();
    if (now - lastAimUpdateAtRef.current < INPUT_UPDATE_INTERVAL_MS) return;

    const { touchX, touchY } = getTouchCoordinates(event);
    const angle = calculateAimAngle(touchX, touchY, cueBall);
    if (Math.abs(angle - lastAimValueRef.current) < AIM_MIN_DELTA) return;
    lastAimValueRef.current = angle;
    lastAimUpdateAtRef.current = now;
    setAimAngle(angle);
  };

  const handleTableTouchEnd = () => {
    // Không bắn khi thả tay, chỉ giữ góc ngắm.
    setIsAiming(false);
  };

  // Xử lý thanh kéo lực
  const handlePowerTouchStart = (event: any) => {
    if (!canPlay || isMoving || cueBall.isPocketed) return;
    setIsDraggingPower(true);
    updatePowerFromTouch(event, true);
  };

  const handlePowerTouchMove = (event: any) => {
    if (!isDraggingPower) return;
    updatePowerFromTouch(event, false);
  };

  const handlePowerTouchEnd = () => {
    setIsDraggingPower(false);

    // Tự động bắn khi thả thanh lực (chỉ khi còn lượt, không bị chặn hết giờ)
    if (!canPlay) return;
    if (!isMoving && !cueBall.isPocketed && power > 0.5) {
      onShoot(aimAngle, power);
      setIsAiming(false);
    }
  };

  const updatePowerFromTouch = (event: any, forceUpdate: boolean) => {
    const now = Date.now();
    if (!forceUpdate && now - lastPowerUpdateAtRef.current < INPUT_UPDATE_INTERVAL_MS) return;

    const { touchY } = getTouchCoordinates(event);
    const calculatedPower = calculatePowerFromTouch(touchY, sliderHeight);
    if (!forceUpdate && Math.abs(calculatedPower - lastPowerValueRef.current) < POWER_MIN_DELTA) {
      return;
    }

    lastPowerValueRef.current = calculatedPower;
    lastPowerUpdateAtRef.current = now;
    setPower(calculatedPower);
  };

  return {
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
  };
};

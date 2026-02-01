// hooks/useAimControl.ts
import { useState } from "react";
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
}

export const useAimControl = ({
  isMoving,
  cueBall,
  onShoot,
  canPlay = true,
}: UseAimControlProps) => {
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [power, setPower] = useState<number>(GAME_CONFIG.DEFAULT_POWER);
  const [isAiming, setIsAiming] = useState<boolean>(false);
  const [isDraggingPower, setIsDraggingPower] = useState<boolean>(false);

  // Xử lý chạm trên bàn bi
  const handleTableTouchStart = (event: any) => {
    if (!canPlay || isMoving || cueBall.isPocketed) return;

    const { touchX, touchY } = getTouchCoordinates(event);
    const angle = calculateAimAngle(touchX, touchY, cueBall);
    setAimAngle(angle);
    setIsAiming(true);
  };

  const handleTableTouchMove = (event: any) => {
    if (!isAiming || isDraggingPower) return;

    const { touchX, touchY } = getTouchCoordinates(event);
    const angle = calculateAimAngle(touchX, touchY, cueBall);
    setAimAngle(angle);
  };

  const handleTableTouchEnd = () => {
    // Không bắn khi thả tay, chỉ giữ góc ngắm
  };

  // Xử lý thanh kéo lực
  const handlePowerTouchStart = (event: any) => {
    if (!canPlay || isMoving || cueBall.isPocketed) return;
    setIsDraggingPower(true);
    updatePowerFromTouch(event);
  };

  const handlePowerTouchMove = (event: any) => {
    if (!isDraggingPower) return;
    updatePowerFromTouch(event);
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

  const updatePowerFromTouch = (event: any) => {
    const { touchY } = getTouchCoordinates(event);
    const calculatedPower = calculatePowerFromTouch(touchY);
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

// utils/predictionHelpers.ts - ĐẦY ĐỦ SỬA LỖI
import { predictTargetBallPath, type Ball, BALL_RADIUS } from "./physics";

export interface TargetPrediction {
  ball: Ball;
  path: {
    contactX: number;
    contactY: number;
    targetVx: number;
    targetVy: number;
    cueVx: number;
    cueVy: number;
  };
}

// ✅ SỬA LỖI: Thêm caching để tránh tính lại không cần thiết
const predictionCache = new Map<string, TargetPrediction[]>();

export const calculateTargetPredictions = (
  cueBall: Ball,
  aimAngle: number,
  balls: Ball[],
  isMoving: boolean,
): TargetPrediction[] => {
  if (isMoving || cueBall.isPocketed) return [];

  // Include object-ball positions in cache key to avoid stale predictions.
  const ballsSignature = balls
    .filter((b) => b.id !== 0 && !b.isPocketed)
    .map((b) => `${b.id}:${Math.round(b.x)}:${Math.round(b.y)}`)
    .join("|");
  const cacheKey = `${Math.round(cueBall.x)}_${Math.round(cueBall.y)}_${Math.round(aimAngle * 1000)}_${ballsSignature}`;

  // Kiểm tra cache
  if (predictionCache.has(cacheKey)) {
    const cached = predictionCache.get(cacheKey);
    if (cached) return cached;
  }

  const aimPointX = cueBall.x + Math.cos(aimAngle) * 1000;
  const aimPointY = cueBall.y + Math.sin(aimAngle) * 1000;

  const predictions: TargetPrediction[] = [];

  balls.forEach((ball) => {
    if (ball.id !== 0 && !ball.isPocketed) {
      const prediction = predictTargetBallPath(
        cueBall.x,
        cueBall.y,
        aimPointX,
        aimPointY,
        ball,
      );
      if (prediction) {
        predictions.push({ ball, path: prediction });
      }
    }
  });

  // ✅ SỬA LỖI: Lưu vào cache (giới hạn size để tránh memory leak)
  if (predictionCache.size > 50) {
    // ✅ SỬA LỖI: Dùng cách đúng để lấy first key
    const firstKey = Array.from(predictionCache.keys())[0];
    if (firstKey) {
      predictionCache.delete(firstKey);
    }
  }
  predictionCache.set(cacheKey, predictions);

  return predictions;
};

export const findClosestTarget = (
  predictions: TargetPrediction[],
  cueBall: Ball,
): TargetPrediction | null => {
  if (predictions.length === 0) return null;

  // ✅ SỬA LỖI: Tìm target gần NHẤT theo contactPoint (không phải ball position)
  return predictions.reduce((closest, current) => {
    const closestDist = Math.sqrt(
      (closest.path.contactX - cueBall.x) ** 2 +
        (closest.path.contactY - cueBall.y) ** 2,
    );
    const currentDist = Math.sqrt(
      (current.path.contactX - cueBall.x) ** 2 +
        (current.path.contactY - cueBall.y) ** 2,
    );
    return currentDist < closestDist ? current : closest;
  });
};

export const calculateCueBallReflection = (
  closestTarget: TargetPrediction,
  _cueBall: Ball,
): { endX: number; endY: number } | null => {
  const reflectX = closestTarget.path.cueVx;
  const reflectY = closestTarget.path.cueVy;

  const reflectLen = Math.sqrt(reflectX * reflectX + reflectY * reflectY);
  if (reflectLen < 1e-6) return null;

  const reflectLength = 30;
  return {
    endX: closestTarget.path.contactX + (reflectX / reflectLen) * reflectLength,
    endY: closestTarget.path.contactY + (reflectY / reflectLen) * reflectLength,
  };
};

// ✅ SỬA LỖI MỚI: Thêm hàm kiểm tra xem bi có thể vào lỗ không (Advanced)
export const estimateBallPocket = (
  ball: Ball,
  velocity: { vx: number; vy: number },
  pockets: Array<{ x: number; y: number; radius: number }>,
  maxFrames: number = 200,
): { pocket: { x: number; y: number } | null; framesUntil: number } => {
  let testX = ball.x;
  let testY = ball.y;
  let testVx = velocity.vx;
  let testVy = velocity.vy;

  const FRICTION = 0.985;
  const THRESHOLD = 0.01;

  for (let frame = 0; frame < maxFrames; frame++) {
    // Cập nhật vị trí
    testX += testVx;
    testY += testVy;

    // Áp dụng friction
    testVx *= FRICTION;
    testVy *= FRICTION;

    const speed = Math.sqrt(testVx * testVx + testVy * testVy);
    if (speed < THRESHOLD) {
      return { pocket: null, framesUntil: frame };
    }

    // Kiểm tra xem bi có trong lỗ nào không
    for (const pocket of pockets) {
      const dx = testX - pocket.x;
      const dy = testY - pocket.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < pocket.radius - BALL_RADIUS) {
        // Kiểm tra hướng chuyển động
        const normX = distance > 0 ? dx / distance : 0;
        const normY = distance > 0 ? dy / distance : 0;
        const dotProduct = -testVx * normX - testVy * normY;

        if (dotProduct > 0) {
          return { pocket: { x: pocket.x, y: pocket.y }, framesUntil: frame };
        }
      }
    }
  }

  return { pocket: null, framesUntil: maxFrames };
};

// ✅ SỬA LỖI MỚI: Clear cache khi reset game (gọi từ resetGame)
export const clearPredictionCache = (): void => {
  predictionCache.clear();
};

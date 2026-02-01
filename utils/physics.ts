// utils/physics.ts - ĐẦY ĐỦ SỬA LỖI + TỐI ƯU ĐỂ BI DỄ VÀO LỖ
export const FRICTION = 0.985;
export const SLIDING_FRICTION = 0.2;

// ✅ KÍCH THƯỚC BÀN NẰM NGANG
export const TABLE_WIDTH = 600;
export const TABLE_HEIGHT = 350;

export const BALL_RADIUS = 10;
export const POCKET_RADIUS = 18;

// ✅ SỬA LỖI: Tăng kích thước lỗ ảo để bi dễ vào hơn
// Khi tính toán pocket, dùng POCKET_RADIUS_LOGIC lớn hơn POCKET_RADIUS_VISUAL
const POCKET_RADIUS_LOGIC = 22; // Dùng cho physics (lớn hơn)
const POCKET_RADIUS_VISUAL = 18; // Dùng cho render (như cũ)

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isPocketed?: boolean;
  isStriped?: boolean;
}

export interface Pocket {
  x: number;
  y: number;
  radius: number;
}

// ✅ 6 LỖ BI CHO BÀN NẰM NGANG
export const POCKETS: Pocket[] = [
  { x: 15, y: 15, radius: POCKET_RADIUS },
  { x: TABLE_WIDTH / 2, y: 10, radius: POCKET_RADIUS - 2 },
  { x: TABLE_WIDTH - 15, y: 15, radius: POCKET_RADIUS },
  { x: 15, y: TABLE_HEIGHT - 15, radius: POCKET_RADIUS },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - 10, radius: POCKET_RADIUS - 2 },
  { x: TABLE_WIDTH - 15, y: TABLE_HEIGHT - 15, radius: POCKET_RADIUS },
];

// ✅ SỬA LỖI 1, 2: checkPocket() - Điều kiện chuẩn + kiểm tra hướng
export const checkPocket = (ball: Ball): Pocket | null => {
  if (ball.isPocketed) return null;

  for (const pocket of POCKETS) {
    const dx = ball.x - pocket.x;
    const dy = ball.y - pocket.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // ✅ SỬA LỖI 1: Dùng POCKET_RADIUS_LOGIC (lớn hơn) để bi dễ vào
    // Điều kiện: distance < radiusLogic - ballRadius
    if (distance < POCKET_RADIUS_LOGIC - BALL_RADIUS) {
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

      // ✅ SỬA LỖI 2: Kiểm tra vận tốc và hướng chuyển động
      if (speed > 0.1) {
        const normX = distance > 0 ? dx / distance : 0;
        const normY = distance > 0 ? dy / distance : 0;

        // Tích vô hướng: nếu > 0 = chuyển động hướng VÀO lỗ
        const dotProduct = -ball.vx * normX - ball.vy * normY;

        if (dotProduct > 0) {
          console.log(
            `[POCKET CHECK] Ball ${ball.id} entering pocket at (${pocket.x}, ${pocket.y})`,
          );
          return pocket;
        }
      }
    }
  }
  return null;
};

export const checkCollision = (ball1: Ball, ball2: Ball): boolean => {
  if (ball1.isPocketed || ball2.isPocketed) return false;

  const dx = ball2.x - ball1.x;
  const dy = ball2.y - ball1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < BALL_RADIUS * 2;
};

export const resolveCollision = (ball1: Ball, ball2: Ball): void => {
  const dx = ball2.x - ball1.x;
  const dy = ball2.y - ball1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) {
    ball1.x -= 0.5;
    ball2.x += 0.5;
    return;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  const tx = -ny;
  const ty = nx;

  const v1n = ball1.vx * nx + ball1.vy * ny;
  const v1t = ball1.vx * tx + ball1.vy * ty;
  const v2n = ball2.vx * nx + ball2.vy * ny;
  const v2t = ball2.vx * tx + ball2.vy * ty;

  const restitution = 0.97;
  const v1nNew = ((1 - restitution) * v1n + (1 + restitution) * v2n) / 2;
  const v2nNew = ((1 + restitution) * v1n + (1 - restitution) * v2n) / 2;

  const frictionFactor = 0.92;
  const v1tNew = v1t * frictionFactor;
  const v2tNew = v2t * frictionFactor;

  ball1.vx = v1nNew * nx + v1tNew * tx;
  ball1.vy = v1nNew * ny + v1tNew * ty;
  ball2.vx = v2nNew * nx + v2tNew * tx;
  ball2.vy = v2nNew * ny + v2tNew * ty;

  const overlap = BALL_RADIUS * 2 - distance;
  if (overlap > 0) {
    const separationX = (nx * overlap) / 2;
    const separationY = (ny * overlap) / 2;

    ball1.x -= separationX;
    ball1.y -= separationY;
    ball2.x += separationX;
    ball2.y += separationY;
  }
};

export const checkWallCollision = (ball: Ball): boolean => {
  if (ball.isPocketed) return false;

  const minX = BALL_RADIUS + 5;
  const maxX = TABLE_WIDTH - BALL_RADIUS - 5;
  const minY = BALL_RADIUS + 5;
  const maxY = TABLE_HEIGHT - BALL_RADIUS - 5;

  const wallRestitution = 0.75;
  let hitWall = false;

  if (ball.x <= minX) {
    ball.x = minX;
    ball.vx = -ball.vx * wallRestitution;
    ball.vy *= 0.95;
    hitWall = true;
  } else if (ball.x >= maxX) {
    ball.x = maxX;
    ball.vx = -ball.vx * wallRestitution;
    ball.vy *= 0.95;
    hitWall = true;
  }

  if (ball.y <= minY) {
    ball.y = minY;
    ball.vy = -ball.vy * wallRestitution;
    ball.vx *= 0.95;
    hitWall = true;
  } else if (ball.y >= maxY) {
    ball.y = maxY;
    ball.vy = -ball.vy * wallRestitution;
    ball.vx *= 0.95;
    hitWall = true;
  }

  return hitWall;
};

// ✅ SỬA LỖI 3: applyFriction() - Giảm threshold từ 0.05 thành 0.01
export const applyFriction = (ball: Ball): void => {
  if (ball.isPocketed) {
    ball.vx = 0;
    ball.vy = 0;
    return;
  }

  ball.vx *= FRICTION;
  ball.vy *= FRICTION;

  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (speed < 0.01) {
    // ✅ SỬA: Giảm từ 0.05 → 0.01
    ball.vx = 0;
    ball.vy = 0;
  }
};

export const predictTargetBallPath = (
  cueBallX: number,
  cueBallY: number,
  aimX: number,
  aimY: number,
  targetBall: Ball,
): {
  contactX: number;
  contactY: number;
  targetVx: number;
  targetVy: number;
} | null => {
  const aimDx = aimX - cueBallX;
  const aimDy = aimY - cueBallY;
  const aimLength = Math.sqrt(aimDx * aimDx + aimDy * aimDy);

  if (aimLength === 0) return null;

  const aimUnitX = aimDx / aimLength;
  const aimUnitY = aimDy / aimLength;

  const toBallX = targetBall.x - cueBallX;
  const toBallY = targetBall.y - cueBallY;
  const distanceToBall = Math.sqrt(toBallX * toBallX + toBallY * toBallY);

  const projection = toBallX * aimUnitX + toBallY * aimUnitY;

  if (projection < 0) return null;

  const perpX = toBallX - projection * aimUnitX;
  const perpY = toBallY - projection * aimUnitY;
  const perpDistance = Math.sqrt(perpX * perpX + perpY * perpY);

  if (perpDistance > BALL_RADIUS * 2) return null;

  const sqrtArg = (BALL_RADIUS * 2) ** 2 - perpDistance ** 2;
  if (sqrtArg < 0) return null; // Tránh sqrt âm khi perpDistance ≈ 2R (grazing)
  const contactDistance = projection - Math.sqrt(sqrtArg);
  const contactX = cueBallX + aimUnitX * contactDistance;
  const contactY = cueBallY + aimUnitY * contactDistance;

  // contactX/Y = tâm bi cơ tại va chạm. Đường nối tâm = targetBall - contact (khớp resolveCollision)
  const targetDx = targetBall.x - contactX;
  const targetDy = targetBall.y - contactY;
  const targetDist = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
  if (targetDist < 1e-6) return null;

  const targetVx = targetDx / targetDist;
  const targetVy = targetDy / targetDist;

  return {
    contactX,
    contactY,
    targetVx,
    targetVy,
  };
};

export const getDistance = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
};

export const getAngle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  return Math.atan2(y2 - y1, x2 - x1);
};

export const isPointInCircle = (
  pointX: number,
  pointY: number,
  circleX: number,
  circleY: number,
  radius: number,
): boolean => {
  return getDistance(pointX, pointY, circleX, circleY) <= radius;
};

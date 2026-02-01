// constants/billiard.ts
import type { Ball } from "../utils/physics";

export const initialBalls: Ball[] = [
  // ✅ BI TRẮNG Ở VÒNG TRÒN TRẮNG (BÊN TRÁI)
  {
    id: 0,
    x: 150, // 25% của 600 = 150
    y: 175, // Giữa của 350 = 175
    vx: 0,
    vy: 0,
    color: "#ffffff",
    isPocketed: false,
  },

  // ══════════════════════════════════════
  // ✅ RACK BI Ở VÒNG TRÒN ĐỎ (BÊN PHẢI)
  // ĐẦU NHỌN HƯỚNG SANG TRÁI (về phía bi trắng)
  // Trung tâm: x=420 (70% của 600), y=175
  // ══════════════════════════════════════

  // Hàng 1: Bi 1 - ĐẦU NHỌN (vàng - solid/màu)
  {
    id: 1,
    x: 370,
    y: 175,
    vx: 0,
    vy: 0,
    color: "#FFD700",
    isPocketed: false,
    isStriped: false,
  },

  // Hàng 2
  {
    id: 9, // Bi khoang (vàng)
    x: 390,
    y: 163,
    vx: 0,
    vy: 0,
    color: "#FFD700",
    isPocketed: false,
    isStriped: true,
  },
  {
    id: 2, // Bi màu (xanh dương)
    x: 390,
    y: 187,
    vx: 0,
    vy: 0,
    color: "#0000FF",
    isPocketed: false,
    isStriped: false,
  },

  // Hàng 3
  {
    id: 3, // Bi màu (đỏ)
    x: 410,
    y: 151,
    vx: 0,
    vy: 0,
    color: "#FF0000",
    isPocketed: false,
    isStriped: false,
  },
  {
    id: 8, // Bi đen (bi 8)
    x: 410,
    y: 175,
    vx: 0,
    vy: 0,
    color: "#000000",
    isPocketed: false,
    isStriped: false,
  },
  {
    id: 10, // Bi khoang (xanh dương)
    x: 410,
    y: 199,
    vx: 0,
    vy: 0,
    color: "#0000FF",
    isPocketed: false,
    isStriped: true,
  },

  // Hàng 4
  {
    id: 11, // Bi khoang (đỏ)
    x: 430,
    y: 139,
    vx: 0,
    vy: 0,
    color: "#FF0000",
    isPocketed: false,
    isStriped: true,
  },
  {
    id: 4, // Bi màu (tím)
    x: 430,
    y: 163,
    vx: 0,
    vy: 0,
    color: "#800080",
    isPocketed: false,
    isStriped: false,
  },
  {
    id: 12, // Bi khoang (tím)
    x: 430,
    y: 187,
    vx: 0,
    vy: 0,
    color: "#800080",
    isPocketed: false,
    isStriped: true,
  },
  {
    id: 5, // Bi màu (cam)
    x: 430,
    y: 211,
    vx: 0,
    vy: 0,
    color: "#FF8C00",
    isPocketed: false,
    isStriped: false,
  },

  // Hàng 5 - ĐÁNH CUỐI (rộng nhất)
  {
    id: 13, // Bi khoang (cam)
    x: 450,
    y: 127,
    vx: 0,
    vy: 0,
    color: "#FF8C00",
    isPocketed: false,
    isStriped: true,
  },
  {
    id: 6, // Bi màu (xanh lá)
    x: 450,
    y: 151,
    vx: 0,
    vy: 0,
    color: "#228B22",
    isPocketed: false,
    isStriped: false,
  },
  {
    id: 14, // Bi khoang (xanh lá)
    x: 450,
    y: 175,
    vx: 0,
    vy: 0,
    color: "#228B22",
    isPocketed: false,
    isStriped: true,
  },
  {
    id: 7, // Bi màu (nâu)
    x: 450,
    y: 199,
    vx: 0,
    vy: 0,
    color: "#8B4513",
    isPocketed: false,
    isStriped: false,
  },
  {
    id: 15, // Bi khoang (nâu)
    x: 450,
    y: 223,
    vx: 0,
    vy: 0,
    color: "#8B4513",
    isPocketed: false,
    isStriped: true,
  },
];

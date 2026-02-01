// constants/game.ts
export const GAME_CONFIG = {
  DEFAULT_POWER: 7.5,
  MAX_POWER: 25,
  MIN_POWER: 0,
  POINTS_PER_BALL: 10,
  CUE_BALL_PENALTY: -10,
  MESSAGE_DURATION: 2000,
  /** Thời gian mỗi lượt (giây). Hết giờ không đánh thì chuyển lượt. */
  TURN_TIME_SECONDS: 15,

  // Góc và khoảng cách
  AIM_LINE_LENGTH: 250,
  PREDICTION_DOTS: 3,
  PREDICTION_DOT_SPACING: 30,
  CUE_DISTANCE: 25,
  CUE_LENGTH: 100,

  // Slider
  SLIDER_HEIGHT: 300,
} as const;

export const GAME_MESSAGES = {
  CUE_BALL_POCKETED: "❌ Bi trắng vào lỗ! Đối thủ có ball in hand",
  BALL_POCKETED: "🎯 Tuyệt vời! +10 điểm",
  VICTORY: "🏆 CHIẾN THẮNG!",
  CUE_BALL_IN_HOLE: "❌ Bi trắng đã vào lỗ - Bấm Chơi lại",
  BALLS_MOVING: "⚪ Bi đang lăn...",
  READY_TO_AIM: "🎯 Chạm bàn để ngắm → Kéo thả thanh lực để bắn!",
  BREAK_SHOT: "🎱 Phá bi! Người chơi 1 bắt đầu",
  WRONG_BALL: "❌ Đánh sai bi! Đổi lượt",
  TURN_CHANGE: "🔄 Đổi lượt chơi",
  MISS_BALL: "❌ Không chạm bi! Đối thủ có ball in hand",
  WRONG_FIRST_BALL: "❌ Chạm sai bi trước! Đối thủ có ball in hand",
  INVALID_BREAK: "❌ Khai cuộc sai! Cần 4 bi chạm băng hoặc bi vào lỗ",
  BALL_8_EARLY: "💀 Đánh bi 8 quá sớm - THUA!",
  BALL_8_WIN: "🏆 CHIẾN THẮNG! Bi 8 vào lỗ",
  TABLE_OPEN: "⚪ Bàn đang mở - Chọn nhóm bi",
} as const;

export const PLAYER_COLORS = {
  PLAYER_1: "#4CAF50",
  PLAYER_2: "#2196F3",
} as const;

export const POWER_LEVELS = {
  WEAK: { max: 5, label: "🟢 Nhẹ", color: "#4CAF50" },
  MEDIUM: { max: 10, label: "🟡 Vừa", color: "#FFC107" },
  STRONG: { max: 15, label: "🔴 Mạnh", color: "#F44336" },
} as const;

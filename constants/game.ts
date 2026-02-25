// constants/game.ts
export const GAME_CONFIG = {
  DEFAULT_POWER: 7.5,
  MAX_POWER: 25,
  MIN_POWER: 0,
  POINTS_PER_BALL: 10,
  CUE_BALL_PENALTY: -10,
  MESSAGE_DURATION: 2000,
  // Per-turn timer (seconds)
  TURN_TIME_SECONDS: 15,
  THREE_CUSHION_TURN_TIME_SECONDS: 45,
  THREE_CUSHION_TARGET_POINTS: 30,
  THREE_CUSHION_POWER_BOOST: 1.55,
  THREE_CUSHION_MAX_POWER_MULTIPLIER: 2.8,

  // Aiming and cue visuals
  AIM_LINE_LENGTH: 250,
  PREDICTION_DOTS: 3,
  PREDICTION_DOT_SPACING: 30,
  CUE_DISTANCE: 25,
  CUE_LENGTH: 100,

  // Power slider
  SLIDER_HEIGHT: 300,
} as const;

export const GAME_MESSAGES = {
  CUE_BALL_POCKETED: "Phạm lỗi: bi trắng vào lỗ. Đối thủ được đặt bi tự do.",
  BALL_POCKETED: "Đánh đẹp! +10 điểm",
  VICTORY: "Chiến thắng!",
  CUE_BALL_IN_HOLE: "Bi trắng vào lỗ",
  BALLS_MOVING: "Bi đang lăn...",
  READY_TO_AIM: "Ngắm và thả thanh lực để bắn",
  BREAK_SHOT: "Phá bi: Người chơi 1 đánh trước",
  WRONG_BALL: "Chạm sai bi. Đổi lượt.",
  TURN_CHANGE: "Đã đổi lượt",
  MISS_BALL: "Không chạm bi. Đối thủ được đặt bi tự do.",
  WRONG_FIRST_BALL: "Chạm bi đầu sai. Đối thủ được đặt bi tự do.",
  INVALID_BREAK: "Lượt phá bi không hợp lệ.",
  BALL_8_EARLY: "Vào bi số 8 quá sớm: thua.",
  BALL_8_WIN: "Vào bi số 8: thắng.",
  TABLE_OPEN: "Bàn mở - chọn nhóm bi.",
} as const;

export const PLAYER_COLORS = {
  PLAYER_1: "#4CAF50",
  PLAYER_2: "#2196F3",
} as const;

export const POWER_LEVELS = {
  WEAK: { max: 5, label: "Thấp", color: "#4CAF50" },
  MEDIUM: { max: 10, label: "Vừa", color: "#FFC107" },
  STRONG: { max: 15, label: "Cao", color: "#F44336" },
} as const;

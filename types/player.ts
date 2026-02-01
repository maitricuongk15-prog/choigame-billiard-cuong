// types/player.ts
export type BallType = "solid" | "striped" | "none";

export interface Player {
  id: 1 | 2;
  name: string;
  score: number;
  ballType: BallType;
  color: string;
}

export interface GameState {
  currentPlayer: 1 | 2;
  players: [Player, Player];
  isBreak: boolean; // Lượt phá bi
  turnEnded: boolean;
}

// context/gameContext.tsx - CẬP NHẬT ĐẦY ĐỦ
import React, { createContext, useContext, useState, ReactNode } from "react";

export type GameMode = "8ball" | "9ball" | "3cushion" | "ai";
export type PlayerCount = 2 | 4;

export interface RoomConfig {
  roomName: string;
  password?: string;
  gameMode: GameMode;
  playerCount: PlayerCount;
  isRanked: boolean;
}

interface GameContextType {
  roomId: string | null;
  setRoomId: (id: string | null) => void;
  roomCode: string | null;
  setRoomCode: (code: string | null) => void;
  roomHostId: string | null;
  setRoomHostId: (id: string | null) => void;
  roomConfig: RoomConfig | null;
  setRoomConfig: (config: RoomConfig | null) => void;
  player1Name: string;
  player2Name: string;
  setPlayerNames: (player1: string, player2: string) => void;
}

const GameContext = createContext<GameContextType>({
  roomId: null,
  setRoomId: () => {},
  roomCode: null,
  setRoomCode: () => {},
  roomHostId: null,
  setRoomHostId: () => {},
  roomConfig: null,
  setRoomConfig: () => {},
  player1Name: "Người chơi 1",
  player2Name: "Người chơi 2",
  setPlayerNames: () => {},
});

export const useGameContext = () => useContext(GameContext);

export function GameProvider({ children }: { children: ReactNode }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomHostId, setRoomHostId] = useState<string | null>(null);
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
  const [player1Name, setPlayer1Name] = useState<string>("Người chơi 1");
  const [player2Name, setPlayer2Name] = useState<string>("Người chơi 2");

  const setPlayerNames = (p1: string, p2: string) => {
    setPlayer1Name(p1 || "Người chơi 1");
    setPlayer2Name(p2 || "Người chơi 2");
  };

  return (
    <GameContext.Provider
      value={{ roomId, setRoomId, roomCode, setRoomCode, roomHostId, setRoomHostId, roomConfig, setRoomConfig, player1Name, player2Name, setPlayerNames }}
    >
      {children}
    </GameContext.Provider>
  );
}

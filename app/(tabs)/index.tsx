// app/(tabs)/index.tsx - LOBBY + MULTIPLAYER THẬT (SUPABASE)
import { useEffect, useState } from "react";
import MainScreen from "../../components/mainScreen";
import { router } from "expo-router";
import { useGameContext } from "../../context/gameContext";
import { useAuth } from "../../context/AuthContext";
import { listRooms, joinRoomById, joinRoomByCode } from "../../services/roomService";
import type { Room } from "../../components/mainScreen";
import type { RoomRow } from "../../types/room";

export default function ExploreScreen() {
  const { setRoomId, setRoomCode, setRoomConfig } = useGameContext();
  const { user, loading: authLoading } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [joinByCodeLoading, setJoinByCodeLoading] = useState(false);

  useEffect(() => {
    setRoomId(null);
    setRoomCode(null);
    setRoomConfig(null);
  }, []);

  useEffect(() => {
    if (!user) {
      setRooms([]);
      setRoomsLoading(false);
      return;
    }
    setRoomsLoading(true);
    listRooms().then(async ({ rooms: list, error }) => {
      if (error || !list.length) {
        setRooms([]);
        setRoomsLoading(false);
        return;
      }
      const { supabase } = await import("../../lib/supabase");
      const { data: counts } = await supabase
        .from("room_players")
        .select("room_id")
        .in("room_id", list.map((r) => r.id));
      const countByRoom: Record<string, number> = {};
      (counts || []).forEach((row: { room_id: string }) => {
        countByRoom[row.room_id] = (countByRoom[row.room_id] || 0) + 1;
      });
      setRooms(
        list.map((r: RoomRow) => ({
          id: r.id,
          name: r.name,
          host: "Host",
          avatar: "👤",
          gameType: r.game_mode === "8ball" ? "8-Ball" : r.game_mode,
          coins: "Free",
          players: `${countByRoom[r.id] ?? 0}/${r.player_count}`,
          status: (countByRoom[r.id] >= r.player_count ? "full" : "waiting") as "live" | "waiting" | "full",
        }))
      );
      setRoomsLoading(false);
    });
  }, [user]);

  const requireAuth = (action: () => void) => {
    if (!user) {
      router.push({ pathname: "/login", params: { redirect: "/create-room" } });
      return;
    }
    action();
  };

  const handleCreateRoom = () => {
    requireAuth(() => router.push("/create-room"));
  };

  const handleJoinRandom = () => {
    requireAuth(() => {
      setRoomId("RANDOM");
      router.push("./explore");
    });
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!user) {
      router.push({ pathname: "/login", params: { redirect: "/create-room" } });
      return;
    }
    const { error } = await joinRoomById(roomId);
    if (error) {
      alert(error.message);
      return;
    }
    setRoomId(roomId);
    router.push("/waiting-room");
  };

  const handleJoinByCode = async (roomCode: string) => {
    if (!user) {
      router.push({ pathname: "/login", params: { redirect: "/create-room" } });
      return;
    }
    setJoinByCodeLoading(true);
    const { roomId, error } = await joinRoomByCode(roomCode);
    setJoinByCodeLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setRoomId(roomId);
    router.push("/waiting-room");
  };

  return (
    <MainScreen
      user={user}
      authLoading={authLoading}
      rooms={rooms}
      onCreateRoom={handleCreateRoom}
      onJoinRandom={handleJoinRandom}
      onJoinRoom={handleJoinRoom}
      onJoinByCode={handleJoinByCode}
      joinByCodeLoading={joinByCodeLoading}
    />
  );
}

// app/(tabs)/index.tsx - LOBBY + MULTIPLAYER THẬT (SUPABASE)
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MainScreen from "../../components/mainScreen";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useGameContext } from "../../context/gameContext";
import { useAuth } from "../../context/AuthContext";
import { listRooms, joinRoomById, joinRoomByCode } from "../../services/roomService";
import { getMyCoins } from "../../services/shopService";
import type { Room } from "../../components/mainScreen";
import type { RoomRow } from "../../types/room";

export default function ExploreScreen() {
  const { setRoomId, setRoomCode, setRoomConfig, setPlayerNames } = useGameContext();
  const { user, loading: authLoading, signOut } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [joinByCodeLoading, setJoinByCodeLoading] = useState(false);
  const [coinsBalance, setCoinsBalance] = useState<number | null>(null);
  const [joinPopupVisible, setJoinPopupVisible] = useState(false);
  const [joinPopupMessage, setJoinPopupMessage] = useState("");

  const showJoinPopup = (message: string) => {
    setJoinPopupMessage(message);
    setJoinPopupVisible(true);
  };

  const loadCoins = useCallback(async () => {
    if (!user) {
      setCoinsBalance(null);
      return;
    }
    const { coins, error } = await getMyCoins();
    if (error) {
      setCoinsBalance(null);
      return;
    }
    setCoinsBalance(coins);
  }, [user]);

  useEffect(() => {
    setRoomId(null);
    setRoomCode(null);
    setRoomConfig(null);
    setPlayerNames("Người chơi 1", "Người chơi 2");
  }, []);

  useEffect(() => {
    if (!user) {
      setRooms([]);
      setRoomsLoading(false);
      setCoinsBalance(null);
      return;
    }

    loadCoins();

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
      const visibleRooms = list.filter((r: RoomRow) => (countByRoom[r.id] ?? 0) > 0);
      setRooms(
        visibleRooms.map((r: RoomRow) => ({
          id: r.id,
          name: r.name,
          host: "Chủ phòng",
          avatar: "👤",
          gameType:
            r.game_mode === "8ball"
              ? "8-Ball"
              : r.game_mode === "9ball"
                ? "9-Ball"
                : r.game_mode === "3cushion"
                  ? "3 Băng"
                  : r.game_mode,
          coins:
            r.bet_amount > 0
              ? `${r.bet_amount.toLocaleString("vi-VN")} xu`
              : "Free",
          players: `${countByRoom[r.id] ?? 0}/${r.player_count}`,
          status: (countByRoom[r.id] >= r.player_count ? "full" : "waiting") as "live" | "waiting" | "full",
        }))
      );
      setRoomsLoading(false);
    });
  }, [user, loadCoins]);

  useFocusEffect(
    useCallback(() => {
      void loadCoins();
    }, [loadCoins])
  );

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
      setRoomCode(null);
      setRoomConfig({
        roomName: "Bàn offline",
        gameMode: "8ball",
        playerCount: 2,
        betAmount: 0,
        isRanked: false,
      });
      setPlayerNames("Người chơi 1", "Người chơi 2");
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
      showJoinPopup(error.message);
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
      showJoinPopup(error.message);
      return;
    }
    setRoomId(roomId);
    router.push("/waiting-room");
  };

  const handleOpenShop = () => {
    requireAuth(() => router.push("/shop"));
  };

  const handleOpenRanking = () => {
    router.push("/ranking");
  };

  const handleOpenFriends = () => {
    requireAuth(() => router.push("/friends"));
  };

  const handleSignOut = async () => {
    if (!user) return;
    await signOut();
  };

  return (
    <>
      <MainScreen
        user={user}
        authLoading={authLoading}
        coinsBalance={coinsBalance}
        rooms={rooms}
        onCreateRoom={handleCreateRoom}
        onJoinRandom={handleJoinRandom}
        onJoinRoom={handleJoinRoom}
        onJoinByCode={handleJoinByCode}
        joinByCodeLoading={joinByCodeLoading}
        onOpenShop={handleOpenShop}
        onOpenRanking={handleOpenRanking}
        onOpenFriends={handleOpenFriends}
        onSignOut={handleSignOut}
      />

      <Modal
        transparent
        visible={joinPopupVisible}
        animationType="fade"
        onRequestClose={() => setJoinPopupVisible(false)}
      >
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <Text style={styles.popupTitle}>Không thể vào phòng</Text>
            <Text style={styles.popupMessage}>{joinPopupMessage}</Text>
            <TouchableOpacity
              style={styles.popupButton}
              onPress={() => setJoinPopupVisible(false)}
            >
              <Text style={styles.popupButtonText}>Đã hiểu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  popupCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#1a3524",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#334155",
  },
  popupTitle: {
    color: "#f87171",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  popupMessage: {
    color: "#e2e8f0",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  popupButton: {
    alignSelf: "flex-end",
    backgroundColor: "#11d452",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  popupButtonText: {
    color: "#000",
    fontWeight: "700",
  },
});

// app/waiting-room.tsx - PHÒNG CHỜ THẬT (SUPABASE + REALTIME)
import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useGameContext } from "../context/gameContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  getRoomById,
  setReady,
  leaveRoom,
  startMatch,
} from "../services/roomService";
import type { RoomWithPlayers } from "../types/room";

export default function WaitingRoomScreen() {
  const { roomId, roomCode, roomConfig, setRoomId, setRoomCode, setRoomConfig, setRoomHostId, setPlayerNames } = useGameContext();
  const { user } = useAuth();

  const [room, setRoom] = useState<RoomWithPlayers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ id: number; playerName: string; avatar: string; message: string; time: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<ScrollView>(null);

  const currentUserId = user?.id ?? null;
  const isHost = room && currentUserId && String(room.host_id) === String(currentUserId);
  const myPlayer = room?.room_players?.find((p) => String(p.user_id) === String(currentUserId));
  const allPlayersReady = room?.room_players?.length
    ? room.room_players.every((p) => p.is_ready)
    : false;
  const playerCount = room?.room_players?.length ?? 0;
  const maxPlayers = room?.player_count ?? roomConfig?.playerCount ?? 2;

  const loadRoom = async (id: string) => {
    setLoading(true);
    setError(null);
    const { room: r, error: err } = await getRoomById(id);
    setLoading(false);
    if (err) {
      setError(err.message);
      setRoom(null);
      return;
    }
    setRoom(r ?? null);
    if (r?.host_id) setRoomHostId(r.host_id);
    // Lưu tên người chơi theo slot (slot 1 = Player 1, slot 2 = Player 2) để hiển thị trên màn hình kết quả
    if (r?.room_players?.length) {
      const p1 = r.room_players.find((rp) => rp.slot === 1);
      const p2 = r.room_players.find((rp) => rp.slot === 2);
      const name1 = p1?.profiles?.display_name?.trim() || "Người chơi 1";
      const name2 = p2?.profiles?.display_name?.trim() || "Người chơi 2";
      setPlayerNames(name1, name2);
    }
  };

  useEffect(() => {
    if (!roomId || !currentUserId) {
      router.replace("/");
      return;
    }
    loadRoom(roomId);
  }, [roomId, currentUserId]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => loadRoom(roomId)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const r = payload.new as { status: string };
          if (r?.status === "playing") {
            router.replace("/explore");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollToEnd({ animated: true });
    }
  }, [chatMessages]);

  const handleToggleReady = async () => {
    if (!roomId || !myPlayer) return;
    const newReady = !myPlayer.is_ready;
    await setReady(roomId, newReady);
    loadRoom(roomId);
  };

  const handleStartMatch = async () => {
    if (!roomId || !isHost) return;
    if (!allPlayersReady || playerCount < 2) {
      Alert.alert("Chưa sẵn sàng", "Cần ít nhất 2 người và tất cả đều Ready.");
      return;
    }
    const { error: err } = await startMatch(roomId);
    if (err) {
      Alert.alert("Lỗi", err.message);
      return;
    }
    router.replace("/explore");
  };

  const handleLeaveRoom = async () => {
    if (!roomId) {
      router.back();
      return;
    }
    await leaveRoom(roomId);
    setRoomId(null);
    setRoomCode(null);
    setRoomConfig(null);
    router.replace("/");
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const name = room?.room_players?.find((p) => p.user_id === currentUserId)?.profiles?.display_name || user?.email?.split("@")[0] || "You";
    setChatMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        playerName: name,
        avatar: "😎",
        message: chatInput,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setChatInput("");
  };

  const gameModeName =
    roomConfig?.gameMode === "8ball"
      ? "8-Ball"
      : roomConfig?.gameMode === "9ball"
        ? "9-Ball"
        : roomConfig?.gameMode === "3cushion"
          ? "3 Băng"
          : "AI Mode";

  if (!roomId) return null;

  if (loading && !room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#11d452" />
          <Text style={styles.loadingText}>Đang tải phòng...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>{error || "Không tìm thấy phòng"}</Text>
          <TouchableOpacity style={styles.backButtonFull} onPress={handleLeaveRoom}>
            <Text style={styles.backButtonFullText}>← Về Lobby</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const displayRoomCode = roomCode || room.room_code;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleLeaveRoom}>
          <Text style={styles.headerIcon}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Phòng #{displayRoomCode}</Text>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Đang chờ ({playerCount}/{maxPlayers})</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.headerButton}>
          <Text style={styles.headerIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.roomTitleSection}>
          <Text style={styles.roomTitle}>{room.name}</Text>
          <View style={styles.badgesContainer}>
            <View style={styles.badge}>
              <Text style={styles.badgeIcon}>🎲</Text>
              <Text style={styles.badgeText}>{gameModeName}</Text>
            </View>
            {roomConfig?.password && (
              <View style={[styles.badge, styles.badgeBlue]}>
                <Text style={styles.badgeIcon}>🔒</Text>
                <Text style={styles.badgeText}>Private</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.playersSection}>
          <View style={styles.playersSectionHeader}>
            <Text style={styles.playersSectionTitle}>
              NGƯỜI CHƠI ({playerCount}/{maxPlayers})
            </Text>
          </View>

          <View style={styles.playersGrid}>
            {(room.room_players || []).map((rp) => (
              <View key={rp.id} style={styles.playerCard}>
                {String(rp.user_id) === String(room.host_id) && (
                  <View style={styles.crownBadge}>
                    <Text style={styles.crownIcon}>👑</Text>
                  </View>
                )}
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatar, rp.is_ready && styles.avatarReady]}>
                    <Text style={styles.avatarEmoji}>
                      {rp.slot === 1 ? "😎" : rp.slot === 2 ? "👩" : "👤"}
                    </Text>
                  </View>
                  <View style={[styles.readyBadge, !rp.is_ready && styles.notReadyBadge]}>
                    <Text style={styles.readyIcon}>{rp.is_ready ? "✓" : "⋯"}</Text>
                  </View>
                </View>
                <Text style={styles.playerName}>
                  {rp.profiles?.display_name || `Player ${rp.slot}`}
                  {String(rp.user_id) === String(room.host_id) ? " (Host)" : ""}
                </Text>
                {String(rp.user_id) === String(currentUserId) && (
                  <TouchableOpacity
                    style={[styles.readyButton, rp.is_ready && styles.readyButtonActive]}
                    onPress={handleToggleReady}
                  >
                    <Text style={rp.is_ready ? styles.readyButtonTextActive : styles.readyButtonText}>
                      {rp.is_ready ? "✓ Ready" : "Chưa sẵn sàng"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {Array.from({ length: maxPlayers - playerCount }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.emptySlot}>
                <View style={styles.emptySlotIcon}>
                  <Text style={styles.emptySlotPlus}>+</Text>
                </View>
                <Text style={styles.emptySlotText}>Chỗ trống</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Nút Sẵn sàng luôn hiển thị cho người chơi hiện tại (host + khách) */}
        {myPlayer && (
          <View style={styles.readySection}>
            <Text style={styles.readySectionLabel}>
              Bạn đã sẵn sàng chơi?
            </Text>
            <TouchableOpacity
              style={[
                styles.readySectionButton,
                myPlayer.is_ready && styles.readySectionButtonActive,
              ]}
              onPress={handleToggleReady}
            >
              <Text
                style={
                  myPlayer.is_ready
                    ? styles.readySectionButtonTextActive
                    : styles.readySectionButtonText
                }
              >
                {myPlayer.is_ready ? "✓ ĐÃ SẴN SÀNG" : "BẤM ĐỂ SẴN SÀNG"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.chatSection}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>Chat phòng</Text>
          </View>
          <ScrollView ref={chatScrollRef} style={styles.chatMessages} showsVerticalScrollIndicator={false}>
            {chatMessages.map((msg) => (
              <View key={msg.id} style={styles.chatMessage}>
                <View style={styles.chatAvatar}>
                  <Text style={styles.chatAvatarEmoji}>{msg.avatar}</Text>
                </View>
                <View style={styles.chatContent}>
                  <View style={styles.chatMessageHeader}>
                    <Text style={styles.chatPlayerName}>{msg.playerName}</Text>
                    <Text style={styles.chatTime}>{msg.time}</Text>
                  </View>
                  <Text style={styles.chatMessageText}>{msg.message}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.chatInputContainer}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Nhắn tin..."
              placeholderTextColor="#64748b"
              onSubmitEditing={handleSendMessage}
            />
            <TouchableOpacity style={styles.chatSendButton} onPress={handleSendMessage}>
              <Text style={styles.chatSendIcon}>📤</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.actionBar}>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveRoom}>
            <Text style={styles.leaveIcon}>🚪 Rời phòng</Text>
          </TouchableOpacity>

          {isHost ? (
            <TouchableOpacity
              style={[styles.startButton, (!allPlayersReady || playerCount < 2) && styles.startButtonDisabled]}
              onPress={handleStartMatch}
              disabled={!allPlayersReady || playerCount < 2}
            >
              <Text style={styles.startButtonText}>BẮT ĐẦU TRẬN</Text>
              <Text style={styles.startButtonIcon}>▶️</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.startButton, styles.startButtonDisabled]}>
              <Text style={styles.startButtonText}>Chờ host bắt đầu</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#102216" },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { color: "#94a3b8", marginTop: 12 },
  errorText: { color: "#f87171", textAlign: "center", marginBottom: 16 },
  backButtonFull: { backgroundColor: "#11d452", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  backButtonFullText: { color: "#000", fontWeight: "bold" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 24,
    backgroundColor: "rgba(16, 34, 22, 0.9)",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  headerIcon: { fontSize: 20 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#11d452" },
  statusText: { fontSize: 12, fontWeight: "500", color: "#11d452" },
  content: { flex: 1, paddingBottom: 32 },
  roomTitleSection: { paddingHorizontal: 24, paddingVertical: 16, alignItems: "center" },
  roomTitle: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 12, textAlign: "center" },
  badgesContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(17, 212, 82, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(17, 212, 82, 0.2)",
    gap: 4,
  },
  badgeBlue: { backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.2)" },
  badgeIcon: { fontSize: 14 },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#11d452" },
  playersSection: { marginTop: 8, paddingHorizontal: 16 },
  playersSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingHorizontal: 8 },
  playersSectionTitle: { fontSize: 12, fontWeight: "600", color: "#94a3b8", letterSpacing: 1 },
  playersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  playerCard: {
    width: "48%",
    backgroundColor: "#1a3524",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    position: "relative",
  },
  crownBadge: { position: "absolute", top: 8, right: 8 },
  crownIcon: { fontSize: 20 },
  avatarContainer: { position: "relative", marginBottom: 12, marginTop: 8 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#2a4535",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#64748b",
  },
  avatarReady: { borderColor: "#11d452", borderWidth: 3 },
  avatarEmoji: { fontSize: 32 },
  readyBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#11d452",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1a3524",
  },
  notReadyBadge: { backgroundColor: "#64748b" },
  readyIcon: { fontSize: 10, fontWeight: "bold", color: "#000" },
  playerName: { fontSize: 14, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  readyButton: { backgroundColor: "#334155", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  readyButtonActive: { backgroundColor: "#11d452" },
  readyButtonText: { fontSize: 12, color: "#94a3b8" },
  readyButtonTextActive: { fontSize: 12, fontWeight: "bold", color: "#000" },
  emptySlot: {
    width: "48%",
    minHeight: 140,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  emptySlotIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#334155", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptySlotPlus: { fontSize: 24, color: "#64748b" },
  emptySlotText: { fontSize: 13, fontWeight: "500", color: "#64748b" },
  readySection: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: "rgba(17, 212, 82, 0.12)",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(17, 212, 82, 0.4)",
    alignItems: "center",
  },
  readySectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 12,
  },
  readySectionButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  readySectionButtonActive: {
    backgroundColor: "#11d452",
  },
  readySectionButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#94a3b8",
  },
  readySectionButtonTextActive: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000",
  },
  chatSection: { marginTop: 24, marginHorizontal: 16, backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 16, padding: 16 },
  chatHeader: { marginBottom: 12 },
  chatTitle: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
  chatMessages: { maxHeight: 128, marginBottom: 12 },
  chatMessage: { flexDirection: "row", gap: 12, marginBottom: 12 },
  chatAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#2a4535", alignItems: "center", justifyContent: "center" },
  chatAvatarEmoji: { fontSize: 18 },
  chatContent: { flex: 1 },
  chatMessageHeader: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 2 },
  chatPlayerName: { fontSize: 12, fontWeight: "bold", color: "#fff" },
  chatTime: { fontSize: 10, color: "#64748b" },
  chatMessageText: { fontSize: 14, color: "#cbd5e1", lineHeight: 20 },
  chatInputContainer: { flexDirection: "row", gap: 8 },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: "#fff",
  },
  chatSendButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#11d452", alignItems: "center", justifyContent: "center" },
  chatSendIcon: { fontSize: 18 },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#102216",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  actionButtons: { flexDirection: "row", gap: 12 },
  leaveButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
  },
  leaveIcon: { fontSize: 16, color: "#fff" },
  startButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#11d452",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  startButtonDisabled: { backgroundColor: "#334155" },
  startButtonText: { fontSize: 16, fontWeight: "bold", color: "#000" },
  startButtonIcon: { fontSize: 20 },
});

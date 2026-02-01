// app/create-room.tsx - TẠO PHÒNG THẬT (SUPABASE)
import React, { useState } from "react";
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
import {
  useGameContext,
  GameMode,
  PlayerCount,
  RoomConfig,
} from "../context/gameContext";
import { createRoom } from "../services/roomService";

export default function CreateRoomScreen() {
  const { setRoomId, setRoomCode, setRoomConfig } = useGameContext();

  const [roomName, setRoomName] = useState("Bàn của Alex");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("8ball");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(2);
  const [creating, setCreating] = useState(false);

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập tên phòng");
      return;
    }
    setCreating(true);
    const { roomId, roomCode, error } = await createRoom({
      name: roomName.trim(),
      gameMode,
      playerCount,
      password: password || undefined,
    });
    setCreating(false);
    if (error) {
      Alert.alert("Tạo phòng thất bại", error.message);
      return;
    }
    const config: RoomConfig = {
      roomName: roomName.trim(),
      password: password || undefined,
      gameMode,
      playerCount,
      isRanked: false,
    };
    setRoomId(roomId);
    setRoomCode(roomCode);
    setRoomConfig(config);
    router.push("/waiting-room");
  };

  const handleCancel = () => {
    // ✅ ĐÚNG: Quay lại màn hình trước (explore)
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tạo Phòng Mới</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.decorativeBlur} />

        <View style={styles.section}>
          <Text style={styles.label}>Tên phòng</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={roomName}
              onChangeText={setRoomName}
              placeholder="Nhập tên phòng..."
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.inputIcon}>✏️</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>
            Mật khẩu <Text style={styles.labelOptional}>(Tùy chọn)</Text>
          </Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Nhập mật khẩu..."
              placeholderTextColor="#475569"
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.inputIcon}>{showPassword ? "👁️" : "🔒"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chế độ chơi</Text>
          <View style={styles.gameModeGrid}>
            <TouchableOpacity
              style={[
                styles.gameModeCard,
                gameMode === "8ball" && styles.gameModeCardActive,
              ]}
              onPress={() => setGameMode("8ball")}
            >
              <View
                style={[
                  styles.gameModeIcon,
                  gameMode === "8ball" && styles.gameModeIconActive,
                ]}
              >
                <Text style={styles.gameModeNumber}>8</Text>
              </View>
              <Text
                style={[
                  styles.gameModeLabel,
                  gameMode === "8ball" && styles.gameModeLabelActive,
                ]}
              >
                8 Bi
              </Text>
              {gameMode === "8ball" && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkIcon}>✓</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={[styles.gameModeCard, styles.gameModeCardDisabled]}>
              <View style={styles.gameModeIconDisabled}>
                <Text style={styles.gameModeNumberDisabled}>9</Text>
              </View>
              <Text style={styles.gameModeLabelDisabled}>9 Bi</Text>
              <View style={styles.devBadge}>
                <Text style={styles.devBadgeText}>Đang phát triển</Text>
              </View>
            </View>

            <View style={[styles.gameModeCard, styles.gameModeCardDisabled]}>
              <View style={styles.gameModeIconDisabled}>
                <Text style={styles.gameModeNumberDisabled}>3</Text>
              </View>
              <Text style={styles.gameModeLabelDisabled}>3 Băng</Text>
              <View style={styles.devBadge}>
                <Text style={styles.devBadgeText}>Đang phát triển</Text>
              </View>
            </View>

            <View style={[styles.gameModeCard, styles.gameModeCardDisabled]}>
              <View style={styles.gameModeIconDisabled}>
                <Text style={styles.gameModeNumberDisabled}>🤖</Text>
              </View>
              <Text style={styles.gameModeLabelDisabled}>Với Máy</Text>
              <View style={styles.devBadge}>
                <Text style={styles.devBadgeText}>Đang phát triển</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.playerCountHeader}>
            <Text style={styles.sectionTitle}>Số lượng người chơi</Text>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>Solo / Team</Text>
            </View>
          </View>

          <View style={styles.playerCountToggle}>
            <View style={styles.playerCountSlider} />

            <TouchableOpacity
              style={styles.playerCountButton}
              onPress={() => setPlayerCount(2)}
            >
              <Text style={styles.playerCountButtonTextActive}>👤 2 Người</Text>
            </TouchableOpacity>

            <View
              style={[
                styles.playerCountButton,
                styles.playerCountButtonDisabled,
              ]}
            >
              <Text style={styles.playerCountButtonTextDisabled}>
                👥 4 Người
              </Text>
              <View style={styles.smallDevBadge}>
                <Text style={styles.smallDevBadgeText}>Sắp ra mắt</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createButton, creating && styles.createButtonDisabled]}
          onPress={handleCreateRoom}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.createButtonIcon}>🎮</Text>
              <Text style={styles.createButtonText}>Tạo Phòng</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Hủy</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#102216",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  backIcon: {
    fontSize: 28,
    color: "#fff",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
    textAlign: "center",
    marginRight: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  decorativeBlur: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 256,
    height: 256,
    backgroundColor: "rgba(17, 212, 82, 0.05)",
    borderRadius: 999,
    opacity: 0.3,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#cbd5e1",
    marginBottom: 8,
    marginLeft: 4,
  },
  labelOptional: {
    color: "#94a3b8",
    fontWeight: "400",
  },
  inputContainer: {
    position: "relative",
    backgroundColor: "#1a3524",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  input: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
  },
  inputIcon: {
    position: "absolute",
    right: 16,
    top: "50%",
    transform: [{ translateY: -10 }],
    fontSize: 20,
  },
  passwordToggle: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#cbd5e1",
    marginBottom: 12,
    marginLeft: 4,
  },
  gameModeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  gameModeCard: {
    width: "47%",
    height: 128,
    backgroundColor: "#1a3524",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  gameModeCardActive: {
    backgroundColor: "rgba(17, 212, 82, 0.1)",
    borderColor: "#11d452",
  },
  gameModeCardDisabled: {
    opacity: 0.4,
  },
  gameModeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gameModeIconActive: {
    backgroundColor: "#11d452",
  },
  gameModeIconDisabled: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gameModeNumber: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
  },
  gameModeNumberDisabled: {
    fontSize: 24,
    fontWeight: "900",
    color: "#64748b",
  },
  gameModeLabel: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
  gameModeLabelActive: {
    color: "#11d452",
  },
  gameModeLabelDisabled: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#64748b",
  },
  checkmark: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#11d452",
    alignItems: "center",
    justifyContent: "center",
  },
  checkmarkIcon: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
  },
  devBadge: {
    position: "absolute",
    bottom: 8,
    backgroundColor: "#ef4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  devBadgeText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#fff",
  },
  playerCountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  modeBadge: {
    backgroundColor: "rgba(17, 212, 82, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#11d452",
  },
  playerCountToggle: {
    position: "relative",
    backgroundColor: "#1a3524",
    borderRadius: 999,
    padding: 4,
    flexDirection: "row",
  },
  playerCountSlider: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    width: "48%",
    backgroundColor: "#11d452",
    borderRadius: 999,
    shadowColor: "#11d452",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  playerCountButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    zIndex: 1,
  },
  playerCountButtonTextActive: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000",
  },
  footer: {
    padding: 20,
    paddingBottom: 32,
    backgroundColor: "rgba(16, 34, 22, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  createButton: {
    flexDirection: "row",
    backgroundColor: "#11d452",
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#11d452",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    marginBottom: 12,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonIcon: {
    fontSize: 20,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
  },
  cancelButton: {
    backgroundColor: "transparent",
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#94a3b8",
  },
  playerCountButtonDisabled: {
    opacity: 0.4,
    position: "relative",
  },
  playerCountButtonTextDisabled: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
  },
  smallDevBadge: {
    position: "absolute",
    bottom: -16,
    backgroundColor: "#ef4444",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  smallDevBadgeText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#fff",
  },
});

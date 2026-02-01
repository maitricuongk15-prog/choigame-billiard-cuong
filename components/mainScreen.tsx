// components/MainScreen.tsx - LOBBY SCREEN + AUTH + TÌM MÃ PHÒNG
import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import type { User } from "@supabase/supabase-js";
import { router } from "expo-router";

export interface Room {
  id: string;
  name: string;
  host: string;
  avatar: string;
  gameType: string;
  coins: string;
  players: string;
  status: "live" | "waiting" | "full";
}

interface MainScreenProps {
  user: User | null;
  authLoading?: boolean;
  rooms?: Room[];
  onCreateRoom: () => void;
  onJoinRandom: () => void;
  onJoinRoom: (roomId: string) => void;
  onJoinByCode?: (roomCode: string) => void;
  joinByCodeLoading?: boolean;
}

export default function MainScreen({
  user,
  authLoading = false,
  rooms: roomsProp,
  onCreateRoom,
  onJoinRandom,
  onJoinRoom,
  onJoinByCode,
  joinByCodeLoading = false,
}: MainScreenProps) {
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const defaultRooms: Room[] = [
    {
      id: "402",
      name: "Sarah's Lounge",
      host: "Sarah",
      avatar: "👩",
      gameType: "8-Ball",
      coins: "500 Coins",
      players: "1/2",
      status: "live",
    },
    {
      id: "882",
      name: "High Rollers Only",
      host: "Mike",
      avatar: "👨",
      gameType: "9-Ball",
      coins: "1K Coins",
      players: "0/2",
      status: "waiting",
    },
    {
      id: "105",
      name: "Practice Match",
      host: "Kevin",
      avatar: "🧑",
      gameType: "Snooker",
      coins: "Free",
      players: "1/2",
      status: "live",
    },
    {
      id: "392",
      name: "Pro League Quals",
      host: "TuanAn",
      avatar: "👤",
      gameType: "8-Ball",
      coins: "200 Coins",
      players: "2/2",
      status: "full",
    },
  ];
  const rooms = roomsProp ?? defaultRooms;

  const getStatusColor = (status: Room["status"]) => {
    switch (status) {
      case "live":
        return "#11d452";
      case "waiting":
        return "#eab308";
      case "full":
        return "#ef4444";
    }
  };

  const getStatusText = (status: Room["status"]) => {
    switch (status) {
      case "live":
        return "LIVE";
      case "waiting":
        return "WAITING";
      case "full":
        return "FULL";
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{user ? "😎" : "👤"}</Text>
            {user && <View style={styles.onlineIndicator} />}
          </View>
          <View>
            <Text style={styles.welcomeText}>
              {user ? "Welcome back," : "Chào bạn,"}
            </Text>
            {authLoading ? (
              <ActivityIndicator size="small" color="#11d452" />
            ) : (
              <Text style={styles.userName}>
                {user?.user_metadata?.display_name ||
                  user?.email?.split("@")[0] ||
                  "Đăng nhập để chơi multiplayer"}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.headerButtons}>
          {!user && !authLoading && (
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.push("/login")}
            >
              <Text style={styles.loginButtonText}>Đăng nhập</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconButton}>
            <Text style={styles.iconText}>🔔</Text>
            <View style={styles.notificationDot} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Text style={styles.iconText}>☰</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={styles.bannerOverlay}>
            <View style={styles.bannerContent}>
              <View style={styles.playNowBadge}>
                <Text style={styles.playNowText}>PLAY NOW</Text>
              </View>
              <Text style={styles.bannerTitle}>Start Match</Text>
              <Text style={styles.bannerSubtitle}>
                Host a room or join a random game instantly.
              </Text>

              <View style={styles.bannerButtons}>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={onCreateRoom}
                >
                  <Text style={styles.createButtonIcon}>➕</Text>
                  <Text style={styles.createButtonText}>Create Room</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={onJoinRandom}
                >
                  <Text style={styles.joinButtonIcon}>🔀</Text>
                  <Text style={styles.joinButtonText}>Join Random</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Tìm phòng theo mã */}
        <View style={styles.joinByCodeSection}>
          <Text style={styles.joinByCodeLabel}>🔍 Tìm phòng theo mã</Text>
          <View style={styles.joinByCodeRow}>
            <TextInput
              style={styles.joinByCodeInput}
              value={roomCodeInput}
              onChangeText={(text) => setRoomCodeInput(text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="Nhập mã phòng (VD: ABC123)"
              placeholderTextColor="#64748b"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!joinByCodeLoading}
            />
            <TouchableOpacity
              style={[styles.joinByCodeButton, (joinByCodeLoading || !roomCodeInput.trim()) && styles.joinByCodeButtonDisabled]}
              onPress={() => onJoinByCode?.(roomCodeInput.trim())}
              disabled={joinByCodeLoading || !roomCodeInput.trim()}
            >
              {joinByCodeLoading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.joinByCodeButtonText}>Vào phòng</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterTabs}
        >
          <TouchableOpacity style={styles.filterTabActive}>
            <Text style={styles.filterTabActiveText}>All Rooms</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterTab}>
            <Text style={styles.filterTabText}>Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterTab}>
            <Text style={styles.filterTabText}>Ranked</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterTab}>
            <Text style={styles.filterTabText}>Casual</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterTab}>
            <Text style={styles.filterTabText}>Tournaments</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Room List Header */}
        <View style={styles.roomListHeader}>
          <Text style={styles.roomListTitle}>Active Rooms</Text>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>

        {/* Room Cards */}
        <View style={styles.roomList}>
          {rooms.map((room) => (
            <View key={room.id} style={styles.roomCard}>
              {/* Room Status Header */}
              <View style={styles.roomHeader}>
                <View style={styles.roomStatus}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: getStatusColor(room.status) },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(room.status) },
                    ]}
                  >
                    {getStatusText(room.status)}
                  </Text>
                </View>
                <View style={styles.roomInfo}>
                  <Text style={styles.roomInfoText}>
                    {room.gameType} • {room.coins}
                  </Text>
                </View>
              </View>

              {/* Room Content */}
              <View style={styles.roomContent}>
                <View style={styles.roomHostInfo}>
                  <View style={styles.hostAvatar}>
                    <Text style={styles.hostAvatarText}>{room.avatar}</Text>
                  </View>
                  <View style={styles.roomDetails}>
                    <Text style={styles.roomName}>{room.name}</Text>
                    <Text style={styles.roomMeta}>
                      Room #{room.id} • {room.players} Players
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.joinRoomButton,
                    room.status === "full" && styles.joinRoomButtonDisabled,
                  ]}
                  onPress={() => room.status !== "full" && onJoinRoom(room.id)}
                  disabled={room.status === "full"}
                >
                  <Text
                    style={[
                      styles.joinRoomButtonText,
                      room.status === "full" &&
                        styles.joinRoomButtonTextDisabled,
                    ]}
                  >
                    {room.status === "full" ? "Full" : "Join"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIconActive}>🏠</Text>
          <Text style={styles.navTextActive}>Home</Text>
          <View style={styles.navIndicator} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>🔍</Text>
          <Text style={styles.navText}>Find</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItemCenter}>
          <Text style={styles.navIconCenter}>🎮</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>📊</Text>
          <Text style={styles.navText}>Rank</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>🎱</Text>
          <Text style={styles.navText}>Cues</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#102216",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#102216",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarContainer: {
    position: "relative",
  },
  avatarText: {
    fontSize: 32,
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: "#11d452",
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#102216",
  },
  welcomeText: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
  },
  userName: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "bold",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  loginButton: {
    backgroundColor: "#11d452",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000",
  },
  iconButton: {
    width: 40,
    height: 40,
    backgroundColor: "#1c3024",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconText: {
    fontSize: 20,
  },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    backgroundColor: "#ef4444",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#1c3024",
  },
  content: {
    flex: 1,
  },
  heroBanner: {
    marginHorizontal: 16,
    marginVertical: 8,
    height: 220,
    backgroundColor: "#0d5c2d",
    borderRadius: 16,
    overflow: "hidden",
  },
  bannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  bannerContent: {
    padding: 20,
  },
  playNowBadge: {
    backgroundColor: "#11d452",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  playNowText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#000",
  },
  bannerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 13,
    color: "#cbd5e1",
    marginBottom: 16,
  },
  bannerButtons: {
    flexDirection: "row",
    gap: 12,
  },
  createButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#11d452",
    height: 48,
    borderRadius: 24,
    gap: 8,
  },
  createButtonIcon: {
    fontSize: 18,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#102216",
  },
  joinButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    height: 48,
    borderRadius: 24,
    gap: 8,
  },
  joinButtonIcon: {
    fontSize: 18,
  },
  joinButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0f172a",
  },
  joinByCodeSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: "#1a3524",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(17, 212, 82, 0.2)",
  },
  joinByCodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 10,
  },
  joinByCodeRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  joinByCodeInput: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
    borderWidth: 2,
    borderColor: "#334155",
    letterSpacing: 2,
  },
  joinByCodeButton: {
    backgroundColor: "#11d452",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  joinByCodeButtonDisabled: {
    backgroundColor: "#334155",
    opacity: 0.8,
  },
  joinByCodeButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#000",
  },
  filterTabs: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  filterTabActive: {
    backgroundColor: "#11d452",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  filterTabActiveText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#102216",
  },
  filterTab: {
    backgroundColor: "#1c3024",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#2a4535",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
  },
  roomListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  roomListTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#11d452",
  },
  roomList: {
    paddingHorizontal: 16,
    gap: 16,
  },
  roomCard: {
    backgroundColor: "#1c3024",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2a4535",
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  roomStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  roomInfo: {
    backgroundColor: "#102216",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roomInfoText: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
  },
  roomContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomHostInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  hostAvatar: {
    width: 48,
    height: 48,
    backgroundColor: "#2a4535",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#2a4535",
  },
  hostAvatarText: {
    fontSize: 24,
  },
  roomDetails: {
    flex: 1,
  },
  roomName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 2,
  },
  roomMeta: {
    fontSize: 11,
    color: "#94a3b8",
  },
  joinRoomButton: {
    backgroundColor: "#2a4535",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  joinRoomButtonDisabled: {
    backgroundColor: "#1a2e23",
  },
  joinRoomButtonText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#fff",
  },
  joinRoomButtonTextDisabled: {
    color: "#64748b",
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#1c3024",
    borderTopWidth: 1,
    borderTopColor: "#2a4535",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    justifyContent: "space-between",
  },
  navItem: {
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  navItemCenter: {
    width: 56,
    height: 56,
    backgroundColor: "#11d452",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -32,
  },
  navIconActive: {
    fontSize: 24,
  },
  navIcon: {
    fontSize: 24,
    opacity: 0.5,
  },
  navIconCenter: {
    fontSize: 28,
  },
  navTextActive: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#11d452",
  },
  navText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748b",
  },
  navIndicator: {
    position: "absolute",
    bottom: -8,
    width: 4,
    height: 4,
    backgroundColor: "#11d452",
    borderRadius: 2,
  },
});

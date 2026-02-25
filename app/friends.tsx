import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useGameContext } from "../context/gameContext";
import {
  listFriends,
  listIncomingFriendRequests,
  listMyRoomInvites,
  respondFriendRequest,
  respondRoomInvite,
  searchUsersForFriends,
  sendFriendRequest,
  type FriendItem,
  type FriendSearchUser,
  type IncomingFriendRequest,
  type RoomInvite,
} from "../services/friendService";
import { getAvatarEmoji, normalizeAvatarUrl } from "../utils/avatar";

type BusyAction =
  | `send:${string}`
  | `friend:accept:${string}`
  | `friend:decline:${string}`
  | `room:accept:${string}`
  | `room:decline:${string}`;

export default function FriendsScreen() {
  const { user } = useAuth();
  const { setRoomId, setRoomCode, setRoomConfig } = useGameContext();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FriendSearchUser[]>([]);

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequest[]>([]);
  const [roomInvites, setRoomInvites] = useState<RoomInvite[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const loadLists = useCallback(async () => {
    if (!user) return;

    setLoadingLists(true);
    setErrorMessage(null);

    const [friendsRes, incomingRes, invitesRes] = await Promise.all([
      listFriends(100),
      listIncomingFriendRequests(50),
      listMyRoomInvites(30),
    ]);

    if (friendsRes.error || incomingRes.error || invitesRes.error) {
      setErrorMessage(
        friendsRes.error?.message ||
          incomingRes.error?.message ||
          invitesRes.error?.message ||
          "Không thể tải danh sách bạn bè."
      );
    } else {
      setFriends(friendsRes.friends);
      setIncomingRequests(incomingRes.requests);
      setRoomInvites(invitesRes.invites);
    }

    setLoadingLists(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadLists();
  }, [user?.id, loadLists]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void loadLists();
    }, [user, loadLists])
  );

  const onSearch = async () => {
    if (!user) return;
    clearMessages();
    setSearching(true);
    const { users, error } = await searchUsersForFriends(query.trim(), 30);
    setSearching(false);

    if (error) {
      setSearchResults([]);
      setErrorMessage(error.message);
      return;
    }
    setSearchResults(users);
  };

  const onSendFriendRequest = async (toUserId: string) => {
    clearMessages();
    const key: BusyAction = `send:${toUserId}`;
    setBusyAction(key);

    const { error, alreadyFriends, alreadyPending } = await sendFriendRequest(toUserId);
    setBusyAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (alreadyFriends) {
      setSuccessMessage("Hai người đã là bạn bè.");
    } else if (alreadyPending) {
      setSuccessMessage("Lời mời kết bạn đã được gửi trước đó.");
    } else {
      setSuccessMessage("Đã gửi lời mời kết bạn.");
    }

    await Promise.all([onSearch(), loadLists()]);
  };

  const onRespondFriendRequest = async (requestId: string, accept: boolean) => {
    clearMessages();
    const key: BusyAction = `friend:${accept ? "accept" : "decline"}:${requestId}`;
    setBusyAction(key);
    const { error } = await respondFriendRequest(requestId, accept);
    setBusyAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage(accept ? "Đã chấp nhận lời mời kết bạn." : "Đã từ chối lời mời kết bạn.");
    await Promise.all([loadLists(), onSearch()]);
  };

  const onRespondRoomInvite = async (inviteId: string, accept: boolean) => {
    clearMessages();
    const key: BusyAction = `room:${accept ? "accept" : "decline"}:${inviteId}`;
    setBusyAction(key);

    const { roomId, error } = await respondRoomInvite(inviteId, accept);
    setBusyAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (accept && roomId) {
      setRoomId(roomId);
      setRoomCode(null);
      setRoomConfig(null);
      router.push("/waiting-room");
      return;
    }

    setSuccessMessage("Đã từ chối lời mời vào phòng.");
    await loadLists();
  };

  const hasAnyContent = useMemo(() => {
    return (
      searchResults.length > 0 ||
      friends.length > 0 ||
      incomingRequests.length > 0 ||
      roomInvites.length > 0
    );
  }, [searchResults.length, friends.length, incomingRequests.length, roomInvites.length]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tìm kiếm bạn bè</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Bạn cần đăng nhập để dùng tính năng bạn bè.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/login")}>
            <Text style={styles.primaryButtonText}>Đăng nhập</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tìm kiếm bạn bè</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void loadLists()}>
          <Text style={styles.refreshButtonText}>Làm mới</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.searchBox}>
          <Text style={styles.sectionTitle}>Tìm người chơi</Text>
          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Nhập tên hoặc ID người chơi"
              placeholderTextColor="#64748b"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.searchButton} onPress={onSearch} disabled={searching}>
              {searching ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.searchButtonText}>Tìm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {successMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kết quả tìm kiếm</Text>
          {searchResults.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có kết quả. Hãy nhập tên và bấm Tìm.</Text>
          ) : (
            searchResults.map((player) => {
              const avatarUrl = normalizeAvatarUrl(player.avatar_url);
              const avatarEmoji = getAvatarEmoji(
                `${player.user_id}:${player.display_name || "player"}`
              );
              const busy = busyAction === `send:${player.user_id}`;

              return (
                <View key={player.user_id} style={styles.itemCard}>
                  <View style={styles.itemLeft}>
                    <View style={styles.avatarWrap}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
                      )}
                      <View
                        style={[
                          styles.onlineDot,
                          !player.is_online && styles.onlineDotOffline,
                        ]}
                      />
                    </View>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemName}>
                        {player.display_name || player.user_id.slice(0, 8)}
                      </Text>
                      <Text style={styles.itemSubText}>
                        {player.is_online ? "Đang online" : "Offline"}
                      </Text>
                    </View>
                  </View>

                  {player.is_friend ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>Bạn bè</Text>
                    </View>
                  ) : player.has_pending_sent ? (
                    <View style={styles.tagMuted}>
                      <Text style={styles.tagMutedText}>Đã gửi</Text>
                    </View>
                  ) : player.has_pending_received ? (
                    <View style={styles.tagWarning}>
                      <Text style={styles.tagWarningText}>Chờ phản hồi của bạn</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionButton, busy && styles.actionButtonDisabled]}
                      disabled={busy}
                      onPress={() => void onSendFriendRequest(player.user_id)}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <Text style={styles.actionButtonText}>Kết bạn</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lời mời kết bạn ({incomingRequests.length})</Text>
          {incomingRequests.length === 0 ? (
            <Text style={styles.emptyText}>Không có lời mời mới.</Text>
          ) : (
            incomingRequests.map((req) => {
              const avatarUrl = normalizeAvatarUrl(req.avatar_url);
              const avatarEmoji = getAvatarEmoji(
                `${req.from_user_id}:${req.display_name || "player"}`
              );
              const accepting = busyAction === `friend:accept:${req.request_id}`;
              const declining = busyAction === `friend:decline:${req.request_id}`;

              return (
                <View key={req.request_id} style={styles.itemCard}>
                  <View style={styles.itemLeft}>
                    <View style={styles.avatarWrap}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
                      )}
                      <View
                        style={[
                          styles.onlineDot,
                          !req.is_online && styles.onlineDotOffline,
                        ]}
                      />
                    </View>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemName}>
                        {req.display_name || req.from_user_id.slice(0, 8)}
                      </Text>
                      <Text style={styles.itemSubText}>Muốn kết bạn với bạn</Text>
                    </View>
                  </View>
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.smallButton, styles.smallButtonGhost]}
                      disabled={declining || accepting}
                      onPress={() => void onRespondFriendRequest(req.request_id, false)}
                    >
                      {declining ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.smallButtonGhostText}>Từ chối</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallButton}
                      disabled={accepting || declining}
                      onPress={() => void onRespondFriendRequest(req.request_id, true)}
                    >
                      {accepting ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <Text style={styles.smallButtonText}>Đồng ý</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lời mời vào phòng ({roomInvites.length})</Text>
          {roomInvites.length === 0 ? (
            <Text style={styles.emptyText}>Không có lời mời vào phòng.</Text>
          ) : (
            roomInvites.map((invite) => {
              const accepting = busyAction === `room:accept:${invite.invite_id}`;
              const declining = busyAction === `room:decline:${invite.invite_id}`;
              return (
                <View key={invite.invite_id} style={styles.itemCardColumn}>
                  <Text style={styles.itemName}>
                    {invite.from_display_name || invite.from_user_id.slice(0, 8)} mời bạn vào phòng{" "}
                    {invite.room_name}
                  </Text>
                  <Text style={styles.itemSubText}>
                    Mã phòng: {invite.room_code} | Cược:{" "}
                    {invite.bet_amount > 0
                      ? `${invite.bet_amount.toLocaleString("vi-VN")} xu`
                      : "Không cược"}
                  </Text>
                  <View style={styles.actionRowBottom}>
                    <TouchableOpacity
                      style={[styles.smallButton, styles.smallButtonGhost]}
                      disabled={accepting || declining}
                      onPress={() => void onRespondRoomInvite(invite.invite_id, false)}
                    >
                      {declining ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.smallButtonGhostText}>Từ chối</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallButton}
                      disabled={accepting || declining}
                      onPress={() => void onRespondRoomInvite(invite.invite_id, true)}
                    >
                      {accepting ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <Text style={styles.smallButtonText}>Vào phòng</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bạn bè ({friends.length})</Text>
          {loadingLists ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#11d452" />
              <Text style={styles.loadingText}>Đang tải danh sách bạn bè...</Text>
            </View>
          ) : friends.length === 0 ? (
            <Text style={styles.emptyText}>Bạn chưa có bạn bè nào.</Text>
          ) : (
            friends.map((f) => {
              const avatarUrl = normalizeAvatarUrl(f.avatar_url);
              const avatarEmoji = getAvatarEmoji(`${f.user_id}:${f.display_name || "friend"}`);
              return (
                <View key={f.user_id} style={styles.itemCard}>
                  <View style={styles.itemLeft}>
                    <View style={styles.avatarWrap}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
                      )}
                      <View
                        style={[
                          styles.onlineDot,
                          !f.is_online && styles.onlineDotOffline,
                        ]}
                      />
                    </View>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemName}>{f.display_name || f.user_id.slice(0, 8)}</Text>
                      <Text style={styles.itemSubText}>
                        {f.is_online ? "Đang online" : "Offline"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>Bạn bè</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {!hasAnyContent && !loadingLists ? (
          <Text style={styles.emptyText}>Chưa có dữ liệu để hiển thị.</Text>
        ) : null}
      </ScrollView>
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
    paddingVertical: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  backButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  refreshButton: {
    minWidth: 68,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2a4535",
    backgroundColor: "#1a3524",
  },
  refreshButtonText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 14,
  },
  searchBox: {
    backgroundColor: "#1a3524",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a4535",
    padding: 12,
    marginTop: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#fff",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchButton: {
    minWidth: 72,
    backgroundColor: "#11d452",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  searchButtonText: {
    color: "#000",
    fontWeight: "700",
  },
  section: {
    backgroundColor: "#1a3524",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a4535",
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "700",
  },
  itemCard: {
    backgroundColor: "#12281b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#244030",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  itemCardColumn: {
    backgroundColor: "#12281b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#244030",
    padding: 12,
    gap: 8,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2a4535",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarEmoji: {
    fontSize: 24,
  },
  onlineDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#11d452",
    borderWidth: 1,
    borderColor: "#102216",
  },
  onlineDotOffline: {
    backgroundColor: "#64748b",
  },
  itemMeta: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  itemSubText: {
    color: "#94a3b8",
    fontSize: 12,
  },
  actionButton: {
    backgroundColor: "#11d452",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
  },
  actionRowBottom: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  smallButton: {
    backgroundColor: "#11d452",
    borderRadius: 999,
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallButtonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#64748b",
  },
  smallButtonText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 12,
  },
  smallButtonGhostText: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 12,
  },
  tag: {
    backgroundColor: "rgba(17, 212, 82, 0.2)",
    borderWidth: 1,
    borderColor: "#11d452",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: "#86efac",
    fontSize: 12,
    fontWeight: "700",
  },
  tagMuted: {
    backgroundColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagMutedText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  tagWarning: {
    backgroundColor: "rgba(250, 204, 21, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#facc15",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagWarningText: {
    color: "#fde68a",
    fontSize: 12,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 12,
  },
  successBox: {
    backgroundColor: "rgba(17, 212, 82, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(17, 212, 82, 0.4)",
    borderRadius: 12,
    padding: 10,
  },
  successText: {
    color: "#bbf7d0",
    fontSize: 13,
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderRadius: 12,
    padding: 10,
  },
  errorText: {
    color: "#fecaca",
    fontSize: 13,
    fontWeight: "600",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: "#11d452",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#000",
    fontWeight: "700",
  },
});

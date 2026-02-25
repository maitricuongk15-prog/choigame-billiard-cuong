import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useGameContext } from "../context/gameContext";
import { supabase } from "../lib/supabase";
import {
  listIncomingFriendRequests,
  listMyRoomInvites,
  respondFriendRequest,
  respondRoomInvite,
  type IncomingFriendRequest,
  type RoomInvite,
} from "../services/friendService";

type NotificationItem =
  | {
      key: string;
      kind: "friend";
      createdAt: number;
      request: IncomingFriendRequest;
    }
  | {
      key: string;
      kind: "room";
      createdAt: number;
      invite: RoomInvite;
    };

export default function InviteNotifications() {
  const { user } = useAuth();
  const { setRoomId, setRoomCode, setRoomConfig } = useGameContext();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [actionLoading, setActionLoading] = useState<null | "accept" | "decline">(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const POLL_MS = 5000;

  const refreshPending = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }

    const [friendRes, roomRes] = await Promise.all([
      listIncomingFriendRequests(20),
      listMyRoomInvites(20),
    ]);

    if (friendRes.error || roomRes.error) {
      setErrorMessage(friendRes.error?.message || roomRes.error?.message || "Không thể tải thông báo.");
      return;
    }

    const friendItems: NotificationItem[] = friendRes.requests.map((request) => ({
      key: `friend:${request.request_id}`,
      kind: "friend",
      createdAt: new Date(request.created_at).getTime(),
      request,
    }));

    const roomItems: NotificationItem[] = roomRes.invites.map((invite) => ({
      key: `room:${invite.invite_id}`,
      kind: "room",
      createdAt: new Date(invite.created_at).getTime(),
      invite,
    }));

    const merged = [...friendItems, ...roomItems].sort((a, b) => b.createdAt - a.createdAt);
    setItems(merged);
    setErrorMessage(null);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    void refreshPending();

    const channel = supabase
      .channel(`invite_notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `to_user_id=eq.${user.id}`,
        },
        () => void refreshPending()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_invites",
          filter: `to_user_id=eq.${user.id}`,
        },
        () => void refreshPending()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshPending]);

  useEffect(() => {
    if (!user) return;

    const intervalId = setInterval(() => {
      if (AppState.currentState === "active") {
        void refreshPending();
      }
    }, POLL_MS);

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshPending();
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [user?.id, refreshPending]);

  const topItem = useMemo(() => (items.length > 0 ? items[0] : null), [items]);

  const handleRespond = async (accept: boolean) => {
    if (!topItem) return;
    setActionLoading(accept ? "accept" : "decline");
    setErrorMessage(null);

    if (topItem.kind === "friend") {
      const { error } = await respondFriendRequest(topItem.request.request_id, accept);
      setActionLoading(null);
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      await refreshPending();
      return;
    }

    const { roomId, error } = await respondRoomInvite(topItem.invite.invite_id, accept);
    setActionLoading(null);
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
    await refreshPending();
  };

  if (!user || !topItem) {
    return null;
  }

  const title =
    topItem.kind === "friend" ? "Lời mời kết bạn mới" : "Lời mời vào phòng mới";
  const message =
    topItem.kind === "friend"
      ? `${topItem.request.display_name || "Người chơi"} muốn kết bạn với bạn`
      : `${topItem.invite.from_display_name || "Người chơi"} mời bạn vào phòng ${topItem.invite.room_name}`;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.declineButton]}
            onPress={() => void handleRespond(false)}
            disabled={actionLoading !== null}
          >
            {actionLoading === "decline" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.declineText}>Từ chối</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => void handleRespond(true)}
            disabled={actionLoading !== null}
          >
            {actionLoading === "accept" ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.acceptText}>Đồng ý</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 12,
    bottom: 12,
    right: 120,
    zIndex: 9999,
  },
  card: {
    backgroundColor: "#10281a",
    borderColor: "rgba(17, 212, 82, 0.45)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  title: {
    color: "#bbf7d0",
    fontSize: 13,
    fontWeight: "700",
  },
  message: {
    color: "#e2e8f0",
    fontSize: 12,
    lineHeight: 16,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 11,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionButton: {
    minWidth: 76,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  declineButton: {
    backgroundColor: "#334155",
  },
  acceptButton: {
    backgroundColor: "#11d452",
  },
  declineText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  acceptText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
  },
});

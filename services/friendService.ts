import { supabase } from "../lib/supabase";

export type FriendSearchUser = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  is_friend: boolean;
  has_pending_sent: boolean;
  has_pending_received: boolean;
};

export type FriendItem = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string | null;
};

export type IncomingFriendRequest = {
  request_id: string;
  from_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_online: boolean;
};

export type InvitablePlayer = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  is_friend: boolean;
};

export type RoomInvite = {
  invite_id: string;
  room_id: string;
  room_name: string;
  room_code: string;
  game_mode: string;
  bet_amount: number;
  from_user_id: string;
  from_display_name: string | null;
  created_at: string;
};

export async function updateOnlinePresence(
  isOnline: boolean
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("upsert_presence", {
    p_is_online: isOnline,
  });
  return { error: error as Error | null };
}

export async function cleanupStalePlayers(
  idleSeconds: number = 45
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("cleanup_stale_players", {
    p_idle_seconds: idleSeconds,
  });
  return { error: error as Error | null };
}

export async function searchUsersForFriends(
  query: string,
  limit: number = 20
): Promise<{ users: FriendSearchUser[]; error: Error | null }> {
  const { data, error } = await supabase.rpc("search_users_for_friends", {
    p_query: query,
    p_limit: limit,
  });

  if (error) {
    return { users: [], error: error as Error };
  }
  return { users: (data as FriendSearchUser[]) || [], error: null };
}

export async function sendFriendRequest(
  toUserId: string
): Promise<{
  requestId?: string;
  alreadyPending?: boolean;
  alreadyFriends?: boolean;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc("send_friend_request", {
    p_to_user_id: toUserId,
  });
  if (error) {
    return { error: error as Error };
  }

  const payload = (data || {}) as Record<string, unknown>;
  return {
    requestId: payload.request_id ? String(payload.request_id) : undefined,
    alreadyPending: Boolean(payload.already_pending),
    alreadyFriends: Boolean(payload.already_friends),
    error: null,
  };
}

export async function listFriends(
  limit: number = 100
): Promise<{ friends: FriendItem[]; error: Error | null }> {
  const { data, error } = await supabase.rpc("list_friends", {
    p_limit: limit,
  });
  if (error) {
    return { friends: [], error: error as Error };
  }
  return { friends: (data as FriendItem[]) || [], error: null };
}

export async function listIncomingFriendRequests(
  limit: number = 50
): Promise<{ requests: IncomingFriendRequest[]; error: Error | null }> {
  const { data, error } = await supabase.rpc("list_incoming_friend_requests", {
    p_limit: limit,
  });
  if (error) {
    return { requests: [], error: error as Error };
  }
  return { requests: (data as IncomingFriendRequest[]) || [], error: null };
}

export async function respondFriendRequest(
  requestId: string,
  accept: boolean
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("respond_friend_request", {
    p_request_id: requestId,
    p_accept: accept,
  });
  return { error: error as Error | null };
}

export async function listInvitablePlayers(
  roomId: string,
  limit: number = 30
): Promise<{ players: InvitablePlayer[]; error: Error | null }> {
  const { data, error } = await supabase.rpc("list_invitable_players", {
    p_room_id: roomId,
    p_limit: limit,
  });
  if (error) {
    return { players: [], error: error as Error };
  }
  return { players: (data as InvitablePlayer[]) || [], error: null };
}

export async function sendRoomInvite(
  roomId: string,
  toUserId: string
): Promise<{
  inviteId?: string;
  alreadyPending?: boolean;
  alreadyInRoom?: boolean;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc("send_room_invite", {
    p_room_id: roomId,
    p_to_user_id: toUserId,
  });
  if (error) {
    return { error: error as Error };
  }

  const payload = (data || {}) as Record<string, unknown>;
  return {
    inviteId: payload.invite_id ? String(payload.invite_id) : undefined,
    alreadyPending: Boolean(payload.already_pending),
    alreadyInRoom: Boolean(payload.already_in_room),
    error: null,
  };
}

export async function listMyRoomInvites(
  limit: number = 30
): Promise<{ invites: RoomInvite[]; error: Error | null }> {
  const { data, error } = await supabase.rpc("list_my_room_invites", {
    p_limit: limit,
  });
  if (error) {
    return { invites: [], error: error as Error };
  }
  return { invites: (data as RoomInvite[]) || [], error: null };
}

export async function respondRoomInvite(
  inviteId: string,
  accept: boolean
): Promise<{ roomId?: string; error: Error | null }> {
  const { data, error } = await supabase.rpc("respond_room_invite", {
    p_invite_id: inviteId,
    p_accept: accept,
  });
  if (error) {
    return { error: error as Error };
  }

  const roomId =
    data && typeof data === "object" && "room_id" in (data as Record<string, unknown>)
      ? String((data as Record<string, unknown>).room_id || "")
      : "";

  return { roomId: roomId || undefined, error: null };
}

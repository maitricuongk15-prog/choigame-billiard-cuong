import { supabase } from "../lib/supabase";
import type { RoomRow, RoomWithPlayers } from "../types/room";
import type { GameMode } from "../context/gameContext";

type CreateRoomRpcRow = {
  room_id: string;
  room_code: string;
};

export async function createRoom(params: {
  name: string;
  gameMode: GameMode;
  playerCount: number;
  betAmount: number;
  password?: string;
}): Promise<{ roomId: string; roomCode: string; error: Error | null }> {
  const { data, error } = await supabase.rpc("create_room_with_bet", {
    p_name: params.name,
    p_game_mode: params.gameMode,
    p_player_count: params.playerCount,
    p_bet_amount: params.betAmount,
    p_password_hash: params.password ?? null,
  });

  if (error) {
    const msg = (error as Error).message || "";
    if (
      msg.includes("create_room_with_bet") &&
      (msg.includes("Could not find the function") || msg.includes("does not exist"))
    ) {
      return {
        roomId: "",
        roomCode: "",
        error: new Error("Chưa cập nhật SQL betting. Hãy chạy migration 003 trên Supabase."),
      };
    }
    if (msg.includes("Not enough coins")) {
      return {
        roomId: "",
        roomCode: "",
        error: new Error("Không đủ xu để tạo phòng với mức cược này."),
      };
    }
    return { roomId: "", roomCode: "", error: error as Error };
  }

  const row = (Array.isArray(data) ? data[0] : data) as CreateRoomRpcRow | null;
  if (!row?.room_id) {
    return {
      roomId: "",
      roomCode: "",
      error: new Error("Tạo phòng thất bại: RPC không trả room_id. Kiểm tra migration 003."),
    };
  }

  return {
    roomId: row.room_id,
    roomCode: row.room_code || "",
    error: null,
  };
}

export async function joinRoomById(roomId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("join_room_with_bet", {
    p_room_id: roomId,
  });

  if (!error) {
    return { error: null };
  }

  const msg = (error as Error).message || "";
  if (msg.includes("Not enough coins")) {
    return { error: new Error("Không đủ xu để vào phòng này.") };
  }

  return { error: error as Error };
}

export async function joinRoomByCode(
  roomCode: string
): Promise<{ roomId: string; error: Error | null }> {
  const code = roomCode.trim().toUpperCase();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, status")
    .eq("room_code", code)
    .single();

  if (roomError || !room) {
    return { roomId: "", error: new Error("Không tìm thấy phòng") };
  }
  if (room.status !== "waiting") {
    return { roomId: "", error: new Error("Phòng đã bắt đầu hoặc đã kết thúc") };
  }

  const { error: joinError } = await joinRoomById(room.id);
  if (joinError) {
    return { roomId: "", error: joinError };
  }

  return { roomId: room.id, error: null };
}

export async function getRoomById(
  roomId: string
): Promise<{ room: RoomWithPlayers | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      `
      *,
      room_players (
        id,
        room_id,
        user_id,
        slot,
        is_ready,
        stake_paid,
        joined_at
      )
    `
    )
    .eq("id", roomId)
    .single();

  if (error) {
    return { room: null, error: error as Error };
  }

  const room = data as RoomWithPlayers;
  if (room?.room_players?.length) {
    const userIds = room.room_players.map((p) => p.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    const map = new Map((profiles || []).map((p) => [p.id, p]));
    room.room_players = room.room_players.map((p) => ({
      ...p,
      profiles: map.get(p.user_id)
        ? {
            display_name: map.get(p.user_id)!.display_name,
            avatar_url: map.get(p.user_id)!.avatar_url,
          }
        : null,
    })) as RoomWithPlayers["room_players"];
  }

  return { room, error: null };
}

export async function listRooms(): Promise<{ rooms: RoomRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("status", "waiting")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return { rooms: [], error: error as Error };
  }

  return { rooms: (data as RoomRow[]) || [], error: null };
}

export async function setReady(
  roomId: string,
  isReady: boolean
): Promise<{ error: Error | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: authError || new Error("Chưa đăng nhập") };
  }

  const { error } = await supabase
    .from("room_players")
    .update({ is_ready: isReady })
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  return { error: error as Error | null };
}

export async function leaveRoom(roomId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("leave_room_with_bet", {
    p_room_id: roomId,
  });

  return { error: error as Error | null };
}

export async function startMatch(roomId: string): Promise<{ error: Error | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: authError || new Error("Chưa đăng nhập") };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("host_id, status")
    .eq("id", roomId)
    .single();

  if (!room || room.host_id !== user.id) {
    return { error: new Error("Chỉ chủ phòng mới được bắt đầu") };
  }
  if (room.status !== "waiting") {
    return { error: new Error("Phòng không ở trạng thái chờ") };
  }

  const { error } = await supabase
    .from("rooms")
    .update({ status: "playing", updated_at: new Date().toISOString() })
    .eq("id", roomId);

  return { error: error as Error | null };
}

export async function settleRoomBet(
  roomId: string,
  winnerSlot: number
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("settle_room_bet", {
    p_room_id: roomId,
    p_winner_slot: winnerSlot,
  });

  return { error: error as Error | null };
}

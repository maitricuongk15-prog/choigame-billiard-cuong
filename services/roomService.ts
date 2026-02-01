import { supabase } from "../lib/supabase";
import type { RoomRow, RoomWithPlayers } from "../types/room";
import type { GameMode } from "../context/gameContext";

export async function createRoom(params: {
  name: string;
  gameMode: GameMode;
  playerCount: number;
  password?: string;
}): Promise<{ roomId: string; roomCode: string; error: Error | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { roomId: "", roomCode: "", error: authError || new Error("Chưa đăng nhập") };
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({
      name: params.name,
      host_id: user.id,
      game_mode: params.gameMode,
      player_count: params.playerCount,
      status: "waiting",
      room_code: undefined,
    })
    .select("id, room_code")
    .single();

  if (error) {
    return { roomId: "", roomCode: "", error: error as Error };
  }

  const roomId = data.id;
  const roomCode = data.room_code || "";

  await supabase.from("room_players").insert({
    room_id: roomId,
    user_id: user.id,
    slot: 1,
    is_ready: true,
  });

  return { roomId, roomCode, error: null };
}

export async function joinRoomById(roomId: string): Promise<{ error: Error | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: authError || new Error("Chưa đăng nhập") };
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, player_count, status")
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    return { error: new Error("Không tìm thấy phòng") };
  }
  if (room.status !== "waiting") {
    return { error: new Error("Phòng đã bắt đầu hoặc đã kết thúc") };
  }

  const { data: existing } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return { error: null };
  }

  const { count } = await supabase
    .from("room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);

  if ((count ?? 0) >= room.player_count) {
    return { error: new Error("Phòng đã đủ người") };
  }

  const slot = (count ?? 0) + 1;
  const { error: joinError } = await supabase.from("room_players").insert({
    room_id: room.id,
    user_id: user.id,
    slot,
    is_ready: false,
  });

  if (joinError) {
    return { error: joinError as Error };
  }
  return { error: null };
}

export async function joinRoomByCode(roomCode: string): Promise<{ roomId: string; error: Error | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { roomId: "", error: authError || new Error("Chưa đăng nhập") };
  }

  const code = roomCode.trim().toUpperCase();
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, player_count, status")
    .eq("room_code", code)
    .single();

  if (roomError || !room) {
    return { roomId: "", error: new Error("Không tìm thấy phòng") };
  }
  if (room.status !== "waiting") {
    return { roomId: "", error: new Error("Phòng đã bắt đầu hoặc đã kết thúc") };
  }

  const { data: existing } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return { roomId: room.id, error: null };
  }

  const { count } = await supabase
    .from("room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);

  if ((count ?? 0) >= room.player_count) {
    return { roomId: "", error: new Error("Phòng đã đủ người") };
  }

  const slot = (count ?? 0) + 1;
  const { error: joinError } = await supabase.from("room_players").insert({
    room_id: room.id,
    user_id: user.id,
    slot,
    is_ready: false,
  });

  if (joinError) {
    return { roomId: "", error: joinError as Error };
  }
  return { roomId: room.id, error: null };
}

export async function getRoomById(roomId: string): Promise<{ room: RoomWithPlayers | null; error: Error | null }> {
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
      profiles: map.get(p.user_id) ? { display_name: map.get(p.user_id)!.display_name, avatar_url: map.get(p.user_id)!.avatar_url } : null,
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

export async function setReady(roomId: string, isReady: boolean): Promise<{ error: Error | null }> {
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
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: authError || new Error("Chưa đăng nhập") };
  }

  await supabase.from("room_players").delete().eq("room_id", roomId).eq("user_id", user.id);

  const { data: players } = await supabase.from("room_players").select("id").eq("room_id", roomId);
  if (!players || players.length === 0) {
    await supabase.from("rooms").delete().eq("id", roomId);
  }
  return { error: null };
}

export async function startMatch(roomId: string): Promise<{ error: Error | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: authError || new Error("Chưa đăng nhập") };
  }

  const { data: room } = await supabase.from("rooms").select("host_id, status").eq("id", roomId).single();
  if (!room || room.host_id !== user.id) {
    return { error: new Error("Chỉ host mới được bắt đầu") };
  }
  if (room.status !== "waiting") {
    return { error: new Error("Phòng không ở trạng thái chờ") };
  }

  const { error } = await supabase.from("rooms").update({ status: "playing", updated_at: new Date().toISOString() }).eq("id", roomId);

  return { error: error as Error | null };
}

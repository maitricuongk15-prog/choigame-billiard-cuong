export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomRow {
  id: string;
  room_code: string;
  name: string;
  host_id: string;
  game_mode: string;
  player_count: number;
  password_hash: string | null;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
}

export interface RoomPlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  slot: number;
  is_ready: boolean;
  joined_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
}

export interface RoomWithPlayers extends RoomRow {
  room_players: (RoomPlayerRow & { profiles: { display_name: string | null } | null })[];
}

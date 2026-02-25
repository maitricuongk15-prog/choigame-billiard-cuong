import { supabase } from "../lib/supabase";

export interface CoinRankingPlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
}

export async function getCoinLeaderboard(
  limit = 50
): Promise<{ players: CoinRankingPlayer[]; error: Error | null }> {
  const safeLimit = Math.max(1, Math.min(100, limit));

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, coins")
    .order("coins", { ascending: false })
    .limit(safeLimit);

  if (error) {
    return { players: [], error: error as Error };
  }

  const players: CoinRankingPlayer[] = (data || []).map(
    (row: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      coins?: number | null;
    }) => ({
      id: row.id,
      displayName: row.display_name?.trim() || "Người chơi",
      avatarUrl: row.avatar_url ?? null,
      coins: Number(row.coins ?? 0),
    })
  );

  return { players, error: null };
}


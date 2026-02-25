import { supabase } from "../lib/supabase";
import type { CueRow, ShopCue } from "../types/cue";

async function requireUserId(): Promise<{ userId: string | null; error: Error | null }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      userId: null,
      error: (error as Error) || new Error("Chua dang nhap"),
    };
  }

  return { userId: user.id, error: null };
}

export async function getMyCoins(): Promise<{ coins: number; error: Error | null }> {
  const { userId, error: authError } = await requireUserId();
  if (authError || !userId) return { coins: 0, error: authError };

  const { data, error } = await supabase
    .from("profiles")
    .select("coins")
    .eq("id", userId)
    .single();

  if (error) {
    return { coins: 0, error: error as Error };
  }

  return { coins: Number(data?.coins ?? 0), error: null };
}

export async function listShopCues(): Promise<{ cues: ShopCue[]; error: Error | null }> {
  const { userId, error: authError } = await requireUserId();
  if (authError || !userId) return { cues: [], error: authError };

  const { data: cuesData, error: cuesError } = await supabase
    .from("cues")
    .select("*")
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (cuesError) {
    return { cues: [], error: cuesError as Error };
  }

  const { data: ownedData, error: ownedError } = await supabase
    .from("user_cues")
    .select("cue_id, is_equipped")
    .eq("user_id", userId);

  if (ownedError) {
    return { cues: [], error: ownedError as Error };
  }

  const ownedMap = new Map<string, { equipped: boolean }>();
  (ownedData || []).forEach((row: { cue_id: string; is_equipped: boolean }) => {
    ownedMap.set(row.cue_id, { equipped: !!row.is_equipped });
  });

  const cues: ShopCue[] = ((cuesData || []) as CueRow[]).map((cue) => {
    const ownedInfo = ownedMap.get(cue.id);
    return {
      ...cue,
      owned: !!ownedInfo,
      equipped: !!ownedInfo?.equipped,
    };
  });

  return { cues, error: null };
}

export async function buyCue(
  cueSlug: string
): Promise<{ coins: number; error: Error | null }> {
  const { data, error } = await supabase.rpc("purchase_cue", {
    p_cue_slug: cueSlug,
  });

  if (error) {
    return { coins: 0, error: error as Error };
  }

  const coins = Number((data as { coins?: number } | null)?.coins ?? 0);
  return { coins, error: null };
}

export async function equipCue(cueSlug: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("equip_cue", {
    p_cue_slug: cueSlug,
  });

  return { error: error as Error | null };
}

export async function getEquippedCue(): Promise<{ cue: CueRow | null; error: Error | null }> {
  const { userId, error: authError } = await requireUserId();
  if (authError || !userId) return { cue: null, error: authError };

  const { data, error } = await supabase
    .from("user_cues")
    .select(
      `
      is_equipped,
      cues (*)
    `
    )
    .eq("user_id", userId)
    .eq("is_equipped", true)
    .maybeSingle();

  if (error) {
    return { cue: null, error: error as Error };
  }

  const cue = (data as { cues?: CueRow | null } | null)?.cues ?? null;
  return { cue, error: null };
}

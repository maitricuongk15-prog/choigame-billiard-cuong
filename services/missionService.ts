import { supabase } from "../lib/supabase";
import type { DailyMission } from "../types/mission";

type MissionRpcRow = {
  mission_key: string;
  name: string;
  description: string | null;
  reward_coins: number;
  requirement_type: DailyMission["requirementType"];
  target_count: number;
  is_claimed_today: boolean;
  progress_count: number;
  can_claim: boolean;
};

type ClaimMissionRpcResponse = {
  mission_key?: string;
  reward_coins?: number;
  coins?: number;
};

export async function listDailyMissions(): Promise<{
  missions: DailyMission[];
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc("list_daily_missions");

  if (error) {
    return { missions: [], error: error as Error };
  }

  const rows = (Array.isArray(data) ? data : []) as MissionRpcRow[];
  const missions: DailyMission[] = rows.map((row) => ({
    missionKey: row.mission_key,
    name: row.name,
    description: row.description || "",
    rewardCoins: Number(row.reward_coins ?? 0),
    requirementType: row.requirement_type,
    targetCount: Number(row.target_count ?? 1),
    isClaimedToday: !!row.is_claimed_today,
    progressCount: Number(row.progress_count ?? 0),
    canClaim: !!row.can_claim,
  }));

  return { missions, error: null };
}

export async function claimDailyMission(missionKey: string): Promise<{
  missionKey: string;
  rewardCoins: number;
  coins: number;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc("claim_daily_mission", {
    p_mission_key: missionKey,
  });

  if (error) {
    const message = (error as Error).message || "";
    if (message.includes("Mission already claimed today")) {
      return {
        missionKey: "",
        rewardCoins: 0,
        coins: 0,
        error: new Error("Nhiệm vụ này đã nhận thưởng hôm nay."),
      };
    }
    if (message.includes("Mission not completed yet")) {
      return {
        missionKey: "",
        rewardCoins: 0,
        coins: 0,
        error: new Error("Nhiệm vụ chưa đạt điều kiện để nhận thưởng."),
      };
    }
    if (message.includes("Mission not found")) {
      return {
        missionKey: "",
        rewardCoins: 0,
        coins: 0,
        error: new Error("Không tìm thấy nhiệm vụ."),
      };
    }
    return { missionKey: "", rewardCoins: 0, coins: 0, error: error as Error };
  }

  const payload = (data || {}) as ClaimMissionRpcResponse;
  return {
    missionKey: String(payload.mission_key || missionKey),
    rewardCoins: Number(payload.reward_coins ?? 0),
    coins: Number(payload.coins ?? 0),
    error: null,
  };
}

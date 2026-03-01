export type DailyMissionRequirement = "login" | "play_match" | "win_match";

export interface DailyMission {
  missionKey: string;
  name: string;
  description: string;
  rewardCoins: number;
  requirementType: DailyMissionRequirement;
  targetCount: number;
  isClaimedToday: boolean;
  progressCount: number;
  canClaim: boolean;
}


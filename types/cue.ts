export interface CueRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  force: number;
  aim: number;
  spin: number;
  control: number;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface UserCueRow {
  user_id: string;
  cue_id: string;
  is_equipped: boolean;
  purchased_at: string;
}

export interface ShopCue extends CueRow {
  owned: boolean;
  equipped: boolean;
}

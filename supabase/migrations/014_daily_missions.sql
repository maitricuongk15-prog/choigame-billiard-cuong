-- ============================================
-- DAILY MISSIONS
-- ============================================

-- 1) Mission catalog
CREATE TABLE IF NOT EXISTS public.daily_missions (
  mission_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward_coins INT NOT NULL CHECK (reward_coins >= 0),
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('login', 'play_match', 'win_match')),
  target_count INT NOT NULL DEFAULT 1 CHECK (target_count >= 1),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_missions_active
  ON public.daily_missions(is_active, sort_order);

-- 2) Daily claim tracking
CREATE TABLE IF NOT EXISTS public.user_daily_mission_claims (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mission_key TEXT NOT NULL REFERENCES public.daily_missions(mission_key) ON DELETE CASCADE,
  claim_date DATE NOT NULL DEFAULT ((timezone('utc', now()))::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mission_key, claim_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_mission_claims_user_date
  ON public.user_daily_mission_claims(user_id, claim_date DESC);

-- 3) RLS
ALTER TABLE public.daily_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_mission_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_missions'
      AND policyname = 'Daily missions readable by authenticated'
  ) THEN
    CREATE POLICY "Daily missions readable by authenticated"
      ON public.daily_missions
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_daily_mission_claims'
      AND policyname = 'User mission claims read own'
  ) THEN
    CREATE POLICY "User mission claims read own"
      ON public.user_daily_mission_claims
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_daily_mission_claims'
      AND policyname = 'User mission claims insert own'
  ) THEN
    CREATE POLICY "User mission claims insert own"
      ON public.user_daily_mission_claims
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 4) Seed missions (idempotent)
INSERT INTO public.daily_missions (
  mission_key,
  name,
  description,
  reward_coins,
  requirement_type,
  target_count,
  sort_order,
  is_active,
  updated_at
)
VALUES
  ('daily_login', 'Đăng nhập mỗi ngày', 'Đăng nhập vào game và nhận 1.000 xu.', 1000, 'login', 1, 1, TRUE, NOW()),
  ('daily_play_1', 'Chơi 1 trận', 'Hoàn thành 1 trận đấu mỗi ngày.', 1500, 'play_match', 1, 2, TRUE, NOW()),
  ('daily_win_1', 'Thắng 1 trận', 'Thắng tối thiểu 1 trận trong ngày.', 2500, 'win_match', 1, 3, TRUE, NOW())
ON CONFLICT (mission_key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  reward_coins = EXCLUDED.reward_coins,
  requirement_type = EXCLUDED.requirement_type,
  target_count = EXCLUDED.target_count,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 5) Helper: calculate progress by requirement type
CREATE OR REPLACE FUNCTION public.get_daily_mission_progress(
  p_user_id UUID,
  p_requirement_type TEXT
)
RETURNS INT AS $$
DECLARE
  v_progress INT := 0;
  v_today DATE := (timezone('utc', now()))::date;
BEGIN
  IF p_requirement_type = 'login' THEN
    RETURN 1;
  END IF;

  IF p_requirement_type = 'play_match' THEN
    SELECT COUNT(DISTINCT r.id)::INT
    INTO v_progress
    FROM public.rooms r
    JOIN public.room_players rp ON rp.room_id = r.id
    WHERE rp.user_id = p_user_id
      AND r.status = 'finished'
      AND r.finished_at IS NOT NULL
      AND (timezone('utc', r.finished_at))::date = v_today;

    RETURN COALESCE(v_progress, 0);
  END IF;

  IF p_requirement_type = 'win_match' THEN
    SELECT COUNT(DISTINCT r.id)::INT
    INTO v_progress
    FROM public.rooms r
    JOIN public.room_players rp ON rp.room_id = r.id
    WHERE rp.user_id = p_user_id
      AND r.status = 'finished'
      AND r.finished_at IS NOT NULL
      AND r.winner_slot = rp.slot
      AND (timezone('utc', r.finished_at))::date = v_today;

    RETURN COALESCE(v_progress, 0);
  END IF;

  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6) RPC: list missions for current user
CREATE OR REPLACE FUNCTION public.list_daily_missions()
RETURNS TABLE (
  mission_key TEXT,
  name TEXT,
  description TEXT,
  reward_coins INT,
  requirement_type TEXT,
  target_count INT,
  is_claimed_today BOOLEAN,
  progress_count INT,
  can_claim BOOLEAN
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (timezone('utc', now()))::date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  RETURN QUERY
  SELECT
    m.mission_key,
    m.name,
    m.description,
    m.reward_coins,
    m.requirement_type,
    m.target_count,
    (c.user_id IS NOT NULL) AS is_claimed_today,
    public.get_daily_mission_progress(v_user_id, m.requirement_type) AS progress_count,
    (
      c.user_id IS NULL
      AND public.get_daily_mission_progress(v_user_id, m.requirement_type) >= m.target_count
    ) AS can_claim
  FROM public.daily_missions m
  LEFT JOIN public.user_daily_mission_claims c
    ON c.user_id = v_user_id
   AND c.mission_key = m.mission_key
   AND c.claim_date = v_today
  WHERE m.is_active = TRUE
  ORDER BY m.sort_order ASC, m.reward_coins ASC, m.mission_key ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.list_daily_missions() TO authenticated;

-- 7) RPC: claim mission reward
CREATE OR REPLACE FUNCTION public.claim_daily_mission(
  p_mission_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (timezone('utc', now()))::date;
  v_mission RECORD;
  v_progress INT;
  v_balance INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_mission_key IS NULL OR btrim(p_mission_key) = '' THEN
    RAISE EXCEPTION 'Mission not found';
  END IF;

  SELECT *
  INTO v_mission
  FROM public.daily_missions
  WHERE mission_key = btrim(p_mission_key)
    AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found';
  END IF;

  SELECT coins
  INTO v_balance
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_daily_mission_claims
    WHERE user_id = v_user_id
      AND mission_key = v_mission.mission_key
      AND claim_date = v_today
  ) THEN
    RAISE EXCEPTION 'Mission already claimed today';
  END IF;

  v_progress := public.get_daily_mission_progress(v_user_id, v_mission.requirement_type);

  IF v_progress < v_mission.target_count THEN
    RAISE EXCEPTION 'Mission not completed yet';
  END IF;

  INSERT INTO public.user_daily_mission_claims (user_id, mission_key, claim_date)
  VALUES (v_user_id, v_mission.mission_key, v_today);

  UPDATE public.profiles
  SET coins = coins + v_mission.reward_coins,
      updated_at = NOW()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'mission_key', v_mission.mission_key,
    'reward_coins', v_mission.reward_coins,
    'coins', v_balance + v_mission.reward_coins
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.claim_daily_mission(TEXT) TO authenticated;

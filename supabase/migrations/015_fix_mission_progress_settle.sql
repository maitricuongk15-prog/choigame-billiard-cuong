-- ============================================
-- FIX MISSION PROGRESS ON MATCH SETTLE
-- ============================================

-- 1) Persistent per-day match stats (independent from room_players lifecycle)
CREATE TABLE IF NOT EXISTS public.user_daily_match_stats (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  stat_date DATE NOT NULL DEFAULT ((timezone('utc', now()))::date),
  matches_played INT NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  matches_won INT NOT NULL DEFAULT 0 CHECK (matches_won >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_match_stats_date
  ON public.user_daily_match_stats(stat_date DESC);

ALTER TABLE public.user_daily_match_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_daily_match_stats'
      AND policyname = 'User daily match stats read own'
  ) THEN
    CREATE POLICY "User daily match stats read own"
      ON public.user_daily_match_stats
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2) Allow any room participant to settle (idempotent), and write mission stats atomically.
CREATE OR REPLACE FUNCTION public.settle_room_bet(
  p_room_id UUID,
  p_winner_slot INT
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_winner_user_id UUID;
  v_stake_count INT;
  v_pot INT;
  v_today DATE := (timezone('utc', now()))::date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_winner_slot < 1 OR p_winner_slot > 4 THEN
    RAISE EXCEPTION 'Invalid winner slot';
  END IF;

  SELECT *
  INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.room_players
    WHERE room_id = p_room_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Only room player can settle bet';
  END IF;

  IF v_room.bet_settled THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_settled', TRUE);
  END IF;

  SELECT user_id INTO v_winner_user_id
  FROM public.room_players
  WHERE room_id = p_room_id
    AND slot = p_winner_slot
  LIMIT 1;

  IF v_winner_user_id IS NULL THEN
    RAISE EXCEPTION 'Winner not found in room';
  END IF;

  IF v_room.bet_amount > 0 THEN
    SELECT COUNT(*) INTO v_stake_count
    FROM public.room_players
    WHERE room_id = p_room_id
      AND stake_paid = TRUE;

    v_pot := v_room.bet_amount * v_stake_count;

    IF v_pot > 0 THEN
      UPDATE public.profiles
      SET coins = coins + v_pot,
          updated_at = NOW()
      WHERE id = v_winner_user_id;
    END IF;
  ELSE
    v_stake_count := 0;
    v_pot := 0;
  END IF;

  -- Persist daily mission stats for all participants before any room cleanup.
  INSERT INTO public.user_daily_match_stats (
    user_id,
    stat_date,
    matches_played,
    matches_won,
    updated_at
  )
  SELECT
    rp.user_id,
    v_today,
    1,
    CASE WHEN rp.slot = p_winner_slot THEN 1 ELSE 0 END,
    NOW()
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
  ON CONFLICT (user_id, stat_date)
  DO UPDATE SET
    matches_played = public.user_daily_match_stats.matches_played + EXCLUDED.matches_played,
    matches_won = public.user_daily_match_stats.matches_won + EXCLUDED.matches_won,
    updated_at = NOW();

  UPDATE public.rooms
  SET bet_settled = TRUE,
      winner_slot = p_winner_slot,
      status = 'finished',
      finished_at = NOW(),
      updated_at = NOW()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'already_settled', FALSE,
    'pot', COALESCE(v_pot, 0),
    'winner_user_id', v_winner_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.settle_room_bet(UUID, INT) TO authenticated;

-- 3) Mission progress reads from persistent daily stats (fallback to old room query if needed)
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
    SELECT s.matches_played
    INTO v_progress
    FROM public.user_daily_match_stats s
    WHERE s.user_id = p_user_id
      AND s.stat_date = v_today;

    IF v_progress IS NOT NULL THEN
      RETURN GREATEST(v_progress, 0);
    END IF;

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
    SELECT s.matches_won
    INTO v_progress
    FROM public.user_daily_match_stats s
    WHERE s.user_id = p_user_id
      AND s.stat_date = v_today;

    IF v_progress IS NOT NULL THEN
      RETURN GREATEST(v_progress, 0);
    END IF;

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


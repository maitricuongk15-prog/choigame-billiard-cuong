-- ============================================
-- BETTING + CUE REBALANCE
-- ============================================

-- 1) Add bet fields to rooms
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS bet_amount INT NOT NULL DEFAULT 0 CHECK (bet_amount >= 0);

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS bet_settled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS winner_slot INT CHECK (winner_slot BETWEEN 1 AND 4);

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rooms_bet_amount ON public.rooms(bet_amount);

-- 2) Track whether player stake is paid
ALTER TABLE public.room_players
ADD COLUMN IF NOT EXISTS stake_paid BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) RPC: create room with host stake lock
CREATE OR REPLACE FUNCTION public.create_room_with_bet(
  p_name TEXT,
  p_game_mode TEXT,
  p_player_count INT,
  p_bet_amount INT DEFAULT 0,
  p_password_hash TEXT DEFAULT NULL
)
RETURNS TABLE(room_id UUID, room_code TEXT) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance INT;
  v_room_id UUID;
  v_room_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Room name is required';
  END IF;

  IF p_player_count IS NULL OR p_player_count < 2 OR p_player_count > 4 THEN
    RAISE EXCEPTION 'Invalid player count';
  END IF;

  IF p_bet_amount IS NULL OR p_bet_amount < 0 THEN
    RAISE EXCEPTION 'Invalid bet amount';
  END IF;

  IF p_bet_amount > 0 THEN
    SELECT coins INTO v_balance
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_balance < p_bet_amount THEN
      RAISE EXCEPTION 'Not enough coins';
    END IF;
  END IF;

  INSERT INTO public.rooms (
    name,
    host_id,
    game_mode,
    player_count,
    password_hash,
    status,
    room_code,
    bet_amount,
    bet_settled
  )
  VALUES (
    btrim(p_name),
    v_user_id,
    p_game_mode,
    p_player_count,
    p_password_hash,
    'waiting',
    NULL,
    p_bet_amount,
    FALSE
  )
  RETURNING id, public.rooms.room_code INTO v_room_id, v_room_code;

  IF p_bet_amount > 0 THEN
    UPDATE public.profiles
    SET coins = coins - p_bet_amount,
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.room_players (room_id, user_id, slot, is_ready, stake_paid)
  VALUES (v_room_id, v_user_id, 1, TRUE, p_bet_amount > 0);

  room_id := v_room_id;
  room_code := v_room_code;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_room_with_bet(TEXT, TEXT, INT, INT, TEXT) TO authenticated;

-- 4) RPC: join room and lock stake
CREATE OR REPLACE FUNCTION public.join_room_with_bet(
  p_room_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_balance INT;
  v_count INT;
  v_slot INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT *
  INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.status <> 'waiting' THEN
    RAISE EXCEPTION 'Room is not waiting';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = v_room.id
      AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('ok', TRUE, 'room_id', v_room.id, 'already_joined', TRUE);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.room_players
  WHERE room_id = v_room.id;

  IF v_count >= v_room.player_count THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  IF v_room.bet_amount > 0 THEN
    SELECT coins INTO v_balance
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_balance < v_room.bet_amount THEN
      RAISE EXCEPTION 'Not enough coins';
    END IF;

    UPDATE public.profiles
    SET coins = coins - v_room.bet_amount,
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- Choose the smallest available slot instead of count+1.
  -- This avoids duplicate slot conflicts when a middle slot becomes empty.
  SELECT gs.slot
  INTO v_slot
  FROM generate_series(1, v_room.player_count) AS gs(slot)
  LEFT JOIN public.room_players rp
    ON rp.room_id = v_room.id
   AND rp.slot = gs.slot
  WHERE rp.slot IS NULL
  ORDER BY gs.slot ASC
  LIMIT 1;

  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  INSERT INTO public.room_players (room_id, user_id, slot, is_ready, stake_paid)
  VALUES (v_room.id, v_user_id, v_slot, FALSE, v_room.bet_amount > 0);

  RETURN jsonb_build_object('ok', TRUE, 'room_id', v_room.id, 'slot', v_slot);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.join_room_with_bet(UUID) TO authenticated;

-- 5) RPC: leave room + refund stake when waiting
CREATE OR REPLACE FUNCTION public.leave_room_with_bet(
  p_room_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_player RECORD;
  v_remaining INT;
  v_next_host UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT *
  INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', TRUE, 'room_deleted', TRUE);
  END IF;

  SELECT *
  INTO v_player
  FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', TRUE, 'room_deleted', FALSE);
  END IF;

  IF v_room.status = 'waiting' AND v_room.bet_amount > 0 AND v_player.stake_paid THEN
    UPDATE public.profiles
    SET coins = coins + v_room.bet_amount,
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  DELETE FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = v_user_id;

  SELECT COUNT(*) INTO v_remaining
  FROM public.room_players
  WHERE room_id = p_room_id;

  IF v_remaining = 0 THEN
    DELETE FROM public.rooms
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'room_deleted', TRUE,
      'host_changed', FALSE
    );
  END IF;

  IF v_room.host_id = v_user_id THEN
    SELECT rp.user_id INTO v_next_host
    FROM public.room_players rp
    WHERE rp.room_id = p_room_id
    ORDER BY rp.slot ASC, rp.joined_at ASC
    LIMIT 1;

    IF v_next_host IS NOT NULL THEN
      UPDATE public.rooms
      SET host_id = v_next_host,
          updated_at = NOW()
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', TRUE,
        'room_deleted', FALSE,
        'host_changed', TRUE,
        'new_host_id', v_next_host
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'room_deleted', FALSE,
    'host_changed', FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.leave_room_with_bet(UUID) TO authenticated;

-- 6) RPC: settle bet at match end (host only)
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

  IF v_room.host_id <> v_user_id THEN
    RAISE EXCEPTION 'Only host can settle bet';
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

-- 7) Cue rebalance + new premium cues
INSERT INTO public.cues (slug, name, description, price, force, aim, spin, control, color, is_active)
VALUES
  ('starter', 'Starter Cue', 'Balanced starter cue', 0, 48, 48, 38, 52, '#8B5A2B', true),
  ('oak-pro', 'Oak Pro', 'Stable control for accurate shots', 12000, 60, 76, 44, 74, '#6B4A2F', true),
  ('carbon-x', 'Carbon X', 'Strong power with medium control', 18000, 82, 64, 58, 61, '#333333', true),
  ('phoenix', 'Phoenix', 'High-end cue with all-round stats', 30000, 88, 84, 74, 82, '#C0392B', true),
  ('viper-strike', 'Viper Strike', 'High spin and speed for advanced players', 36000, 90, 70, 92, 66, '#14532D', true),
  ('aurora-balance', 'Aurora Balance', 'Balanced pro cue with precise aim', 42000, 78, 90, 76, 88, '#0EA5E9', true),
  ('titanium-z', 'Titanium Z', 'Power-heavy cue with hard impact', 52000, 97, 68, 70, 62, '#64748B', true),
  ('nebula-elite', 'Nebula Elite', 'Elite mixed-stat cue for top players', 68000, 92, 92, 88, 90, '#7C3AED', true)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  force = EXCLUDED.force,
  aim = EXCLUDED.aim,
  spin = EXCLUDED.spin,
  control = EXCLUDED.control,
  color = EXCLUDED.color,
  is_active = EXCLUDED.is_active;

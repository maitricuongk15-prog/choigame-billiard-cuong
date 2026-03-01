-- ============================================
-- MATCHMAKING START FLOW
-- ============================================

-- 1) Allow refund when leaving a searching room (same behavior as waiting)
CREATE OR REPLACE FUNCTION public.leave_room_with_bet(
  p_room_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_player RECORD;
  v_remaining INT;
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

  IF v_room.status IN ('waiting', 'searching') AND v_room.bet_amount > 0 AND v_player.stake_paid THEN
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

  IF v_remaining = 0 OR v_room.host_id = v_user_id THEN
    IF v_room.status IN ('waiting', 'searching') AND v_room.bet_amount > 0 THEN
      UPDATE public.profiles p
      SET coins = p.coins + v_room.bet_amount,
          updated_at = NOW()
      FROM public.room_players rp
      WHERE rp.room_id = p_room_id
        AND rp.user_id = p.id
        AND rp.stake_paid = TRUE;
    END IF;

    DELETE FROM public.rooms
    WHERE id = p_room_id;

    RETURN jsonb_build_object('ok', TRUE, 'room_deleted', TRUE);
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'room_deleted', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.leave_room_with_bet(UUID) TO authenticated;

-- 2) Start flow:
--    - If room already has >=2 players: start match immediately.
--    - If room has only host: move room to searching and try to match
--      with another searching room that has same mode + same bet.
CREATE OR REPLACE FUNCTION public.start_matchmaking_or_start(
  p_room_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_player_count INT;
  v_opponent_room_id UUID;
  v_opponent_host_id UUID;
  v_opponent_bet INT;
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

  IF v_room.host_id <> v_user_id THEN
    RAISE EXCEPTION 'Only host can start';
  END IF;

  IF v_room.status NOT IN ('waiting', 'searching') THEN
    RAISE EXCEPTION 'Room is not in startable state';
  END IF;

  SELECT COUNT(*) INTO v_player_count
  FROM public.room_players
  WHERE room_id = p_room_id;

  IF v_player_count >= 2 THEN
    UPDATE public.rooms
    SET status = 'playing',
        updated_at = NOW()
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'mode', 'started',
      'room_id', p_room_id,
      'host_id', v_room.host_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.room_players
    WHERE room_id = p_room_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Host player not found in room';
  END IF;

  -- Find an existing searching room with same mode + same bet and only 1 player
  SELECT r.id, r.host_id, r.bet_amount
  INTO v_opponent_room_id, v_opponent_host_id, v_opponent_bet
  FROM public.rooms r
  WHERE r.status = 'searching'
    AND r.id <> p_room_id
    AND r.game_mode = v_room.game_mode
    AND COALESCE(r.bet_amount, 0) = COALESCE(v_room.bet_amount, 0)
    AND EXISTS (
      SELECT 1
      FROM public.room_players rp
      WHERE rp.room_id = r.id
        AND rp.slot = 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.room_players rp2
      WHERE rp2.room_id = r.id
        AND rp2.slot <> 1
    )
  ORDER BY r.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_opponent_room_id IS NULL THEN
    UPDATE public.rooms
    SET status = 'searching',
        updated_at = NOW()
    WHERE id = p_room_id;

    UPDATE public.room_players
    SET is_ready = TRUE
    WHERE room_id = p_room_id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'mode', 'searching',
      'room_id', p_room_id,
      'host_id', v_room.host_id
    );
  END IF;

  -- Move current host into opponent room as slot 2.
  -- Keep stake_paid true when bet > 0 because stake already locked on room creation.
  INSERT INTO public.room_players (room_id, user_id, slot, is_ready, stake_paid)
  VALUES (
    v_opponent_room_id,
    v_user_id,
    2,
    TRUE,
    COALESCE(v_opponent_bet, 0) > 0
  )
  ON CONFLICT (room_id, user_id)
  DO UPDATE
  SET slot = EXCLUDED.slot,
      is_ready = EXCLUDED.is_ready,
      stake_paid = EXCLUDED.stake_paid;

  -- Delete the caller's old solo room without refund:
  -- stake remains in escrow and is represented by stake_paid in matched room.
  DELETE FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = v_user_id;

  DELETE FROM public.rooms
  WHERE id = p_room_id;

  UPDATE public.rooms
  SET status = 'playing',
      updated_at = NOW()
  WHERE id = v_opponent_room_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'mode', 'matched',
    'room_id', v_opponent_room_id,
    'host_id', v_opponent_host_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.start_matchmaking_or_start(UUID) TO authenticated;

-- 3) Cancel matchmaking (host toggles searching -> waiting)
CREATE OR REPLACE FUNCTION public.cancel_matchmaking(
  p_room_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
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

  IF v_room.host_id <> v_user_id THEN
    RAISE EXCEPTION 'Only host can cancel matchmaking';
  END IF;

  IF v_room.status <> 'searching' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'already_waiting', TRUE,
      'room_id', p_room_id
    );
  END IF;

  UPDATE public.rooms
  SET status = 'waiting',
      updated_at = NOW()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'already_waiting', FALSE,
    'room_id', p_room_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_matchmaking(UUID) TO authenticated;

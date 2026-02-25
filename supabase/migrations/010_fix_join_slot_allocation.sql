-- 010) Fix slot allocation when joining room
-- Use smallest free slot instead of count + 1 to prevent duplicate slot key.

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

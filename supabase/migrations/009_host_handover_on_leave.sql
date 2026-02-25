-- 009) Handover host when current host leaves room

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

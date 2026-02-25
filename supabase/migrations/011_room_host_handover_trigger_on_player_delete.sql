-- 011) Keep room host valid after any player deletion
-- - If room becomes empty: delete room
-- - If deleted player was host and room still has players: assign new host

CREATE OR REPLACE FUNCTION public.cleanup_empty_room_after_player_leave()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining INT;
  v_next_host UUID;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.room_players rp
  WHERE rp.room_id = OLD.room_id;

  IF v_remaining = 0 THEN
    DELETE FROM public.rooms r
    WHERE r.id = OLD.room_id;
    RETURN OLD;
  END IF;

  SELECT rp.user_id INTO v_next_host
  FROM public.room_players rp
  WHERE rp.room_id = OLD.room_id
  ORDER BY rp.slot ASC, rp.joined_at ASC
  LIMIT 1;

  UPDATE public.rooms r
  SET host_id = v_next_host,
      updated_at = NOW()
  WHERE r.id = OLD.room_id
    AND r.host_id = OLD.user_id
    AND v_next_host IS NOT NULL;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_cleanup_empty_room_after_player_leave ON public.room_players;
CREATE TRIGGER trg_cleanup_empty_room_after_player_leave
AFTER DELETE ON public.room_players
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_empty_room_after_player_leave();

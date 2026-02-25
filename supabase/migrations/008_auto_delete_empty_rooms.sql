-- 008) Auto delete room when it has no players left

CREATE OR REPLACE FUNCTION public.cleanup_empty_room_after_player_leave()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.room_players rp
    WHERE rp.room_id = OLD.room_id
  ) THEN
    DELETE FROM public.rooms r
    WHERE r.id = OLD.room_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_cleanup_empty_room_after_player_leave ON public.room_players;
CREATE TRIGGER trg_cleanup_empty_room_after_player_leave
AFTER DELETE ON public.room_players
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_empty_room_after_player_leave();

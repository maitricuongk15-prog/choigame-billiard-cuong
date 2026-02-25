-- 012) Cleanup stale presence and kick disconnected players from rooms
-- Players with old presence heartbeat are marked offline and removed from room_players.
-- Room cleanup/host handover is handled by trigger on room_players delete.

CREATE OR REPLACE FUNCTION public.cleanup_stale_players(
  p_idle_seconds INT DEFAULT 45
)
RETURNS JSONB AS $$
DECLARE
  v_idle_seconds INT := GREATEST(COALESCE(p_idle_seconds, 45), 5);
  v_marked_offline INT := 0;
  v_kicked_players INT := 0;
BEGIN
  WITH stale_targets AS (
    SELECT up.user_id
    FROM public.user_presence up
    WHERE up.updated_at < NOW() - make_interval(secs => v_idle_seconds)
  ),
  marked AS (
    UPDATE public.user_presence up
    SET is_online = FALSE,
        last_seen = NOW(),
        updated_at = NOW()
    FROM stale_targets st
    WHERE up.user_id = st.user_id
      AND up.is_online = TRUE
    RETURNING up.user_id
  ),
  kicked AS (
    DELETE FROM public.room_players rp
    USING stale_targets st
    WHERE rp.user_id = st.user_id
    RETURNING rp.user_id
  )
  SELECT
    (SELECT COUNT(*) FROM marked),
    (SELECT COUNT(*) FROM kicked)
  INTO v_marked_offline, v_kicked_players;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'idle_seconds', v_idle_seconds,
    'marked_offline', v_marked_offline,
    'kicked_players', v_kicked_players
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_players(INT) TO authenticated;

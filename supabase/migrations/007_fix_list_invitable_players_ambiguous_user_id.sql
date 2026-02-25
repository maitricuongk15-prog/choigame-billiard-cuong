-- 007) Fix ambiguous user_id in list_invitable_players

CREATE OR REPLACE FUNCTION public.list_invitable_players(
  p_room_id UUID,
  p_limit INT DEFAULT 30
)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  is_online BOOLEAN,
  is_friend BOOLEAN
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.room_players rp_self
    WHERE rp_self.room_id = p_room_id
      AND rp_self.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are not in this room';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    COALESCE(up.is_online, FALSE) AS online_now,
    EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.user_id = v_user_id
        AND f.friend_id = p.id
    ) AS friend_now
  FROM public.profiles p
  LEFT JOIN public.user_presence up ON up.user_id = p.id
  WHERE p.id <> v_user_id
    AND COALESCE(up.is_online, FALSE) = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.room_players rp
      WHERE rp.room_id = p_room_id
        AND rp.user_id = p.id
    )
  ORDER BY friend_now DESC, p.display_name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.list_invitable_players(UUID, INT) TO authenticated;

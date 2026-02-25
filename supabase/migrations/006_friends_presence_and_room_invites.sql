-- 006) Friends, presence, and room invites

-- 1) Presence
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_online
  ON public.user_presence(is_online, last_seen DESC);

-- 2) Friend requests + friendships
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status
  ON public.friend_requests(to_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from_status
  ON public.friend_requests(from_user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_pending_pair
  ON public.friend_requests(
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id)
  )
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.friendships (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user
  ON public.friendships(user_id, created_at DESC);

-- 3) Room invites
CREATE TABLE IF NOT EXISTS public.room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_invites_to_status
  ON public.room_invites(to_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_invites_room_status
  ON public.room_invites(room_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_invites_pending_unique
  ON public.room_invites(room_id, to_user_id)
  WHERE status = 'pending';

-- 4) RLS
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_invites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_presence' AND policyname = 'Presence read authenticated'
  ) THEN
    CREATE POLICY "Presence read authenticated"
      ON public.user_presence FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_presence' AND policyname = 'Presence insert own'
  ) THEN
    CREATE POLICY "Presence insert own"
      ON public.user_presence FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_presence' AND policyname = 'Presence update own'
  ) THEN
    CREATE POLICY "Presence update own"
      ON public.user_presence FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'friend_requests' AND policyname = 'Friend requests read own'
  ) THEN
    CREATE POLICY "Friend requests read own"
      ON public.friend_requests FOR SELECT
      TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'friend_requests' AND policyname = 'Friend requests insert sender'
  ) THEN
    CREATE POLICY "Friend requests insert sender"
      ON public.friend_requests FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = from_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'friend_requests' AND policyname = 'Friend requests update own'
  ) THEN
    CREATE POLICY "Friend requests update own"
      ON public.friend_requests FOR UPDATE
      TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'friendships' AND policyname = 'Friendships read own'
  ) THEN
    CREATE POLICY "Friendships read own"
      ON public.friendships FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_invites' AND policyname = 'Room invites read own'
  ) THEN
    CREATE POLICY "Room invites read own"
      ON public.room_invites FOR SELECT
      TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_invites' AND policyname = 'Room invites insert sender'
  ) THEN
    CREATE POLICY "Room invites insert sender"
      ON public.room_invites FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = from_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'room_invites' AND policyname = 'Room invites update own'
  ) THEN
    CREATE POLICY "Room invites update own"
      ON public.room_invites FOR UPDATE
      TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
  END IF;
END $$;

-- 5) RPCs
CREATE OR REPLACE FUNCTION public.upsert_presence(p_is_online BOOLEAN DEFAULT TRUE)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  INSERT INTO public.user_presence (user_id, is_online, last_seen, updated_at)
  VALUES (v_user_id, p_is_online, NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    is_online = EXCLUDED.is_online,
    last_seen = CASE WHEN EXCLUDED.is_online THEN NOW() ELSE public.user_presence.last_seen END,
    updated_at = NOW();

  RETURN jsonb_build_object('ok', TRUE, 'is_online', p_is_online);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.upsert_presence(BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_to_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_request_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing target user';
  END IF;

  IF p_to_user_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot add yourself';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_id = v_user_id
      AND friend_id = p_to_user_id
  ) THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_friends', TRUE);
  END IF;

  SELECT id
  INTO v_existing_request_id
  FROM public.friend_requests
  WHERE status = 'pending'
    AND LEAST(from_user_id, to_user_id) = LEAST(v_user_id, p_to_user_id)
    AND GREATEST(from_user_id, to_user_id) = GREATEST(v_user_id, p_to_user_id)
  LIMIT 1;

  IF v_existing_request_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_pending', TRUE, 'request_id', v_existing_request_id);
  END IF;

  INSERT INTO public.friend_requests (from_user_id, to_user_id, status)
  VALUES (v_user_id, p_to_user_id, 'pending')
  RETURNING id INTO v_existing_request_id;

  RETURN jsonb_build_object('ok', TRUE, 'request_id', v_existing_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_friend_request(
  p_request_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req RECORD;
  v_other_user UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT *
  INTO v_req
  FROM public.friend_requests
  WHERE id = p_request_id
    AND status = 'pending'
    AND to_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  v_other_user := v_req.from_user_id;

  IF p_accept THEN
    UPDATE public.friend_requests
    SET status = 'accepted', responded_at = NOW()
    WHERE id = p_request_id;

    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (v_user_id, v_other_user)
    ON CONFLICT (user_id, friend_id) DO NOTHING;

    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (v_other_user, v_user_id)
    ON CONFLICT (user_id, friend_id) DO NOTHING;

    RETURN jsonb_build_object('ok', TRUE, 'accepted', TRUE);
  END IF;

  UPDATE public.friend_requests
  SET status = 'declined', responded_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', TRUE, 'accepted', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_users_for_friends(
  p_query TEXT DEFAULT '',
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  is_online BOOLEAN,
  is_friend BOOLEAN,
  has_pending_sent BOOLEAN,
  has_pending_received BOOLEAN
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_query TEXT := COALESCE(btrim(p_query), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      COALESCE(up.is_online, FALSE) AS online_now
    FROM public.profiles p
    LEFT JOIN public.user_presence up ON up.user_id = p.id
    WHERE p.id <> v_user_id
      AND (
        v_query = ''
        OR p.display_name ILIKE '%' || v_query || '%'
        OR p.id::TEXT ILIKE '%' || v_query || '%'
      )
    ORDER BY online_now DESC, p.display_name ASC NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50))
  )
  SELECT
    c.id,
    c.display_name,
    c.avatar_url,
    c.online_now,
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = v_user_id
        AND f.friend_id = c.id
    ) AS is_friend,
    EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'pending'
        AND fr.from_user_id = v_user_id
        AND fr.to_user_id = c.id
    ) AS has_pending_sent,
    EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'pending'
        AND fr.from_user_id = c.id
        AND fr.to_user_id = v_user_id
    ) AS has_pending_received
  FROM candidates c;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.search_users_for_friends(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_friends(p_limit INT DEFAULT 100)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  is_online BOOLEAN,
  last_seen TIMESTAMPTZ
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  RETURN QUERY
  SELECT
    f.friend_id,
    p.display_name,
    p.avatar_url,
    COALESCE(up.is_online, FALSE),
    up.last_seen
  FROM public.friendships f
  JOIN public.profiles p ON p.id = f.friend_id
  LEFT JOIN public.user_presence up ON up.user_id = f.friend_id
  WHERE f.user_id = v_user_id
  ORDER BY COALESCE(up.is_online, FALSE) DESC, p.display_name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.list_friends(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_incoming_friend_requests(p_limit INT DEFAULT 50)
RETURNS TABLE(
  request_id UUID,
  from_user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ,
  is_online BOOLEAN
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  RETURN QUERY
  SELECT
    fr.id,
    fr.from_user_id,
    p.display_name,
    p.avatar_url,
    fr.created_at,
    COALESCE(up.is_online, FALSE)
  FROM public.friend_requests fr
  JOIN public.profiles p ON p.id = fr.from_user_id
  LEFT JOIN public.user_presence up ON up.user_id = fr.from_user_id
  WHERE fr.to_user_id = v_user_id
    AND fr.status = 'pending'
  ORDER BY fr.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.list_incoming_friend_requests(INT) TO authenticated;

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
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = v_user_id
        AND f.friend_id = p.id
    ) AS friend_now
  FROM public.profiles p
  LEFT JOIN public.user_presence up ON up.user_id = p.id
  WHERE p.id <> v_user_id
    AND COALESCE(up.is_online, FALSE) = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id = p_room_id
        AND rp.user_id = p.id
    )
  ORDER BY friend_now DESC, p.display_name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.list_invitable_players(UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_room_invite(
  p_room_id UUID,
  p_to_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_invite_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_to_user_id IS NULL OR p_to_user_id = v_user_id THEN
    RAISE EXCEPTION 'Invalid target user';
  END IF;

  SELECT *
  INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  LIMIT 1;

  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.status <> 'waiting' THEN
    RAISE EXCEPTION 'Room is not waiting';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = p_room_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are not in this room';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = p_room_id
      AND user_id = p_to_user_id
  ) THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_in_room', TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_presence
    WHERE user_id = p_to_user_id
      AND is_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Target user is offline';
  END IF;

  SELECT id
  INTO v_invite_id
  FROM public.room_invites
  WHERE room_id = p_room_id
    AND to_user_id = p_to_user_id
    AND status = 'pending'
  LIMIT 1;

  IF v_invite_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_pending', TRUE, 'invite_id', v_invite_id);
  END IF;

  INSERT INTO public.room_invites (room_id, from_user_id, to_user_id, status)
  VALUES (p_room_id, v_user_id, p_to_user_id, 'pending')
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object('ok', TRUE, 'invite_id', v_invite_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.send_room_invite(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_room_invites(p_limit INT DEFAULT 30)
RETURNS TABLE(
  invite_id UUID,
  room_id UUID,
  room_name TEXT,
  room_code TEXT,
  game_mode TEXT,
  bet_amount INT,
  from_user_id UUID,
  from_display_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  RETURN QUERY
  SELECT
    ri.id,
    r.id,
    r.name,
    r.room_code,
    r.game_mode,
    COALESCE(r.bet_amount, 0),
    ri.from_user_id,
    p.display_name,
    ri.created_at
  FROM public.room_invites ri
  JOIN public.rooms r ON r.id = ri.room_id
  JOIN public.profiles p ON p.id = ri.from_user_id
  WHERE ri.to_user_id = v_user_id
    AND ri.status = 'pending'
    AND r.status = 'waiting'
  ORDER BY ri.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.list_my_room_invites(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_room_invite(
  p_invite_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.room_invites
  WHERE id = p_invite_id
    AND to_user_id = v_user_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF p_accept THEN
    PERFORM public.join_room_with_bet(v_invite.room_id);
    UPDATE public.room_invites
    SET status = 'accepted', responded_at = NOW()
    WHERE id = p_invite_id;

    RETURN jsonb_build_object('ok', TRUE, 'accepted', TRUE, 'room_id', v_invite.room_id);
  END IF;

  UPDATE public.room_invites
  SET status = 'declined', responded_at = NOW()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', TRUE, 'accepted', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.respond_room_invite(UUID, BOOLEAN) TO authenticated;

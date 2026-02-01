-- ============================================
-- BILLIARD GAME - MULTIPLAYER SCHEMA
-- Chạy trong Supabase Dashboard -> SQL Editor
-- ============================================

-- 1. Bảng profiles (mở rộng auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: tạo profile khi user đăng ký
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles public read"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "User update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Bảng rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  host_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  game_mode TEXT NOT NULL DEFAULT '8ball',
  player_count INT NOT NULL DEFAULT 2,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hàm tạo mã phòng 6 ký tự
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger: tự sinh room_code nếu chưa có
CREATE OR REPLACE FUNCTION set_room_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.room_code IS NULL OR NEW.room_code = '' THEN
    NEW.room_code := generate_room_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_room_code_trigger ON public.rooms;
CREATE TRIGGER set_room_code_trigger
  BEFORE INSERT ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION set_room_code();

-- RLS rooms
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rooms list for authenticated"
  ON public.rooms FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "User create room"
  ON public.rooms FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host update own room"
  ON public.rooms FOR UPDATE
  TO authenticated USING (auth.uid() = host_id);

CREATE POLICY "Host delete own room"
  ON public.rooms FOR DELETE
  TO authenticated USING (auth.uid() = host_id);

-- 3. Bảng room_players
CREATE TABLE IF NOT EXISTS public.room_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  slot INT NOT NULL CHECK (slot >= 1 AND slot <= 4),
  is_ready BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, slot)
);

-- RLS room_players
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room players visible to authenticated"
  ON public.room_players FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "User join room"
  ON public.room_players FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User update own ready"
  ON public.room_players FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "User leave room"
  ON public.room_players FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON public.room_players(room_id);

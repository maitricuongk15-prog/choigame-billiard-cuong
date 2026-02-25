-- ============================================
-- COINS + CUE SHOP
-- ============================================

-- 1) Add coins to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS coins INT NOT NULL DEFAULT 10000;

-- Backfill safety for old rows
UPDATE public.profiles
SET coins = 10000
WHERE coins IS NULL;

-- 2) Cue catalog
CREATE TABLE IF NOT EXISTS public.cues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL DEFAULT 0 CHECK (price >= 0),
  force INT NOT NULL CHECK (force BETWEEN 1 AND 100),
  aim INT NOT NULL CHECK (aim BETWEEN 1 AND 100),
  spin INT NOT NULL CHECK (spin BETWEEN 1 AND 100),
  control INT NOT NULL CHECK (control BETWEEN 1 AND 100),
  color TEXT NOT NULL DEFAULT '#8B4513',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cues_price ON public.cues(price);

-- 3) User owned cues
CREATE TABLE IF NOT EXISTS public.user_cues (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  cue_id UUID REFERENCES public.cues ON DELETE CASCADE NOT NULL,
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(user_id, cue_id)
);

CREATE INDEX IF NOT EXISTS idx_user_cues_user_id ON public.user_cues(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cues_one_equipped
  ON public.user_cues(user_id)
  WHERE is_equipped = TRUE;

-- 4) RLS
ALTER TABLE public.cues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cues ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cues' AND policyname = 'Cues readable by authenticated'
  ) THEN
    CREATE POLICY "Cues readable by authenticated"
      ON public.cues FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_cues' AND policyname = 'User cues read own'
  ) THEN
    CREATE POLICY "User cues read own"
      ON public.user_cues FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_cues' AND policyname = 'User cues insert own'
  ) THEN
    CREATE POLICY "User cues insert own"
      ON public.user_cues FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_cues' AND policyname = 'User cues update own'
  ) THEN
    CREATE POLICY "User cues update own"
      ON public.user_cues FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5) Seed cues (idempotent)
INSERT INTO public.cues (slug, name, description, price, force, aim, spin, control, color, is_active)
VALUES
  ('starter', 'Starter Cue', 'Balanced starter cue', 0, 50, 50, 40, 55, '#8B5A2B', true),
  ('oak-pro', 'Oak Pro', 'Stable control for accurate shots', 2500, 58, 74, 42, 72, '#6B4A2F', true),
  ('carbon-x', 'Carbon X', 'Strong power with medium control', 5000, 78, 62, 55, 60, '#333333', true),
  ('phoenix', 'Phoenix', 'High-end cue with all-round stats', 9000, 86, 82, 70, 80, '#C0392B', true)
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

-- Ensure old users own starter cue
INSERT INTO public.user_cues (user_id, cue_id, is_equipped)
SELECT p.id, c.id, FALSE
FROM public.profiles p
CROSS JOIN public.cues c
WHERE c.slug = 'starter'
ON CONFLICT (user_id, cue_id) DO NOTHING;

-- Ensure every user has exactly one equipped cue (fallback starter)
UPDATE public.user_cues uc
SET is_equipped = TRUE
FROM public.cues c
WHERE uc.cue_id = c.id
  AND c.slug = 'starter'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_cues u2
    WHERE u2.user_id = uc.user_id
      AND u2.is_equipped = TRUE
  );

-- 6) Update new-user trigger so account starts with 10,000 coins + starter cue
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  starter_cue_id UUID;
BEGIN
  INSERT INTO public.profiles (id, display_name, coins)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    10000
  );

  SELECT id INTO starter_cue_id
  FROM public.cues
  WHERE slug = 'starter'
  LIMIT 1;

  IF starter_cue_id IS NOT NULL THEN
    INSERT INTO public.user_cues (user_id, cue_id, is_equipped)
    VALUES (NEW.id, starter_cue_id, TRUE)
    ON CONFLICT (user_id, cue_id)
    DO UPDATE SET is_equipped = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7) RPC: buy cue (atomic coin deduction + ownership)
CREATE OR REPLACE FUNCTION public.purchase_cue(p_cue_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cue_id UUID;
  v_price INT;
  v_balance INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT id, price INTO v_cue_id, v_price
  FROM public.cues
  WHERE slug = p_cue_slug
    AND is_active = TRUE
  LIMIT 1;

  IF v_cue_id IS NULL THEN
    RAISE EXCEPTION 'Cue not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_cues
    WHERE user_id = v_user_id
      AND cue_id = v_cue_id
  ) THEN
    RAISE EXCEPTION 'Cue already owned';
  END IF;

  SELECT coins INTO v_balance
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Not enough coins';
  END IF;

  UPDATE public.profiles
  SET coins = coins - v_price,
      updated_at = NOW()
  WHERE id = v_user_id;

  INSERT INTO public.user_cues (user_id, cue_id, is_equipped)
  VALUES (v_user_id, v_cue_id, FALSE);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'coins', v_balance - v_price,
    'cue_id', v_cue_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.purchase_cue(TEXT) TO authenticated;

-- 8) RPC: equip owned cue
CREATE OR REPLACE FUNCTION public.equip_cue(p_cue_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cue_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  SELECT c.id INTO v_cue_id
  FROM public.cues c
  JOIN public.user_cues uc ON uc.cue_id = c.id
  WHERE c.slug = p_cue_slug
    AND uc.user_id = v_user_id
  LIMIT 1;

  IF v_cue_id IS NULL THEN
    RAISE EXCEPTION 'Cue not owned';
  END IF;

  UPDATE public.user_cues
  SET is_equipped = FALSE
  WHERE user_id = v_user_id
    AND is_equipped = TRUE;

  UPDATE public.user_cues
  SET is_equipped = TRUE
  WHERE user_id = v_user_id
    AND cue_id = v_cue_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'cue_id', v_cue_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.equip_cue(TEXT) TO authenticated;

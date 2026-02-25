-- 004) Reduce all cue stats by 30%
-- This migration is intended to run once in sequence.

UPDATE public.cues
SET
  force = GREATEST(1, ROUND(force * 0.7)::INT),
  aim = GREATEST(1, ROUND(aim * 0.7)::INT),
  spin = GREATEST(1, ROUND(spin * 0.7)::INT),
  control = GREATEST(1, ROUND(control * 0.7)::INT),
  updated_at = NOW();

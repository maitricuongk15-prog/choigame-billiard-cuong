-- 005) Close and remove all currently open rooms
-- Remove waiting/playing rooms and dependent players (ON DELETE CASCADE).

DELETE FROM public.rooms
WHERE status IN ('waiting', 'playing');


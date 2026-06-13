-- user_progress was never added to the supabase_realtime publication.
-- The dashboard subscribes to UPDATE events on this table to refresh streak/XP/gems
-- after mark_attendance runs (from AppShell on every page load). Without the
-- publication entry and REPLICA IDENTITY FULL, that subscription never fires and
-- the streak only becomes visible on the next manual page refresh.

-- Explicit table-level grant (safe even if Supabase default privileges cover it)
GRANT SELECT ON public.user_progress TO authenticated;

-- Required for Postgres WAL to emit full row data for UPDATE/DELETE events
ALTER TABLE public.user_progress REPLICA IDENTITY FULL;

-- Add to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'user_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_progress;
  END IF;
END $$;

-- Fix attendance_block_direct_writes: same FOR ALL RESTRICTIVE bug as payments.
-- Postgres requires one policy per command — no multi-command shorthand.
DROP POLICY IF EXISTS attendance_block_direct_writes ON public.attendance;
CREATE POLICY attendance_block_direct_writes_ins ON public.attendance
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY attendance_block_direct_writes_upd ON public.attendance
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY attendance_block_direct_writes_del ON public.attendance
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- Ensure authenticated users can query their own attendance rows
GRANT SELECT ON public.attendance TO authenticated;

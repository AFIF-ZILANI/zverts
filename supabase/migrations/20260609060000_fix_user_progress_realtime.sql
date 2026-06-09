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

-- Fix attendance_block_direct_writes: same FOR ALL RESTRICTIVE bug as payments
-- (see 20260609050000). The permissive attendance_select_own policy is overridden
-- by USING(false) on the RESTRICTIVE policy, silently returning 0 rows for SELECT.
-- Fix: scope it to write commands only.
DROP POLICY IF EXISTS attendance_block_direct_writes ON public.attendance;
CREATE POLICY attendance_block_direct_writes ON public.attendance
  AS RESTRICTIVE FOR INSERT, UPDATE, DELETE TO authenticated, anon
  WITH CHECK (false);

-- Ensure authenticated users can query their own attendance rows
GRANT SELECT ON public.attendance TO authenticated;

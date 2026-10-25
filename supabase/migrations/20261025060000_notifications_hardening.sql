-- Notifications: close an open sender, add the missing streak reminder, a
-- self-test, and a retention job.

-- ── 1. Only the database may create notifications ─────────────────────────
-- dispatch_notification() is SECURITY DEFINER and takes any _user_id, and it
-- was executable by PUBLIC/anon/authenticated: anyone holding the public API
-- key could send any learner a notification (and a Web Push) with any text
-- and link. Every legitimate caller is itself a SECURITY DEFINER function
-- owned by postgres, so they keep working.
REVOKE EXECUTE ON FUNCTION public.dispatch_notification(uuid, notification_category, text, text, notification_priority, text, jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification(uuid, notification_category, text, text, notification_priority, text, jsonb, text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.notify_push() FROM PUBLIC, anon, authenticated;

-- The per-user helpers act on auth.uid(); signed-out visitors have no use for them.
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dismiss_notification(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unread_notification_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_notification_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_notification_event(uuid, text) TO authenticated;

-- ── 2. Streak at risk ─────────────────────────────────────────────────────
-- Learners on a streak who last attended yesterday (Bangladesh day) and
-- haven't opened ZverTs today. The notifications-scan Edge Function meant to
-- send this was never scheduled and read streak columns that moved to
-- user_progress, so it never fired.
CREATE OR REPLACE FUNCTION public.send_streak_risk_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  _sent int := 0;
  _u record;
BEGIN
  FOR _u IN
    SELECT up.user_id, up.current_streak
    FROM user_progress up
    JOIN profiles p ON p.id = up.user_id
    WHERE up.current_streak > 0
      AND up.last_attendance_date = _today - 1
      AND NOT p.locked
  LOOP
    IF public.dispatch_notification(
         _u.user_id, 'streak_risk',
         'আজকে না পড়লে streak break 😶',
         _u.current_streak || ' দিনের streak বাঁচাতে আজকে একটা video দেখেন — ৫ মিনিটই যথেষ্ট।',
         'high', '/dashboard',
         jsonb_build_object('streak', _u.current_streak),
         'streak_risk:' || _today, 20
       ) IS NOT NULL THEN
      _sent := _sent + 1;
    END IF;
  END LOOP;
  RETURN _sent;
END $$;

REVOKE EXECUTE ON FUNCTION public.send_streak_risk_reminders() FROM PUBLIC, anon, authenticated;

-- 20:30 Bangladesh time (14:30 UTC): late enough that most learners who will
-- study today already have, early enough to still save the streak.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'streak-risk-reminders';
SELECT cron.schedule('streak-risk-reminders', '30 14 * * *', 'SELECT public.send_streak_risk_reminders()');

-- ── 3. Test notification (Settings → Notifications) ───────────────────────
-- Sends one to the caller only, straight into the table so mute and quiet
-- hours don't hide it; at most one a minute.
CREATE OR REPLACE FUNCTION public.send_test_notification()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = _uid AND dedupe_key = 'test' AND sent_at > now() - interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'Wait a minute before sending another test' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO notifications(user_id, category, priority, title, body, deep_link, dedupe_key)
  VALUES (_uid, 'system_success', 'high', 'Notifications are working ✅',
          'ZverTs থেকে আপডেট এখানেই আসবে।', '/settings', 'test')
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE EXECUTE ON FUNCTION public.send_test_notification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_test_notification() TO authenticated;

-- ── 4. Retention ──────────────────────────────────────────────────────────
-- Keep the table small: read or dismissed notifications go after 90 days
-- (their notification_events cascade). Unread ones stay.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notifications-cleanup';
SELECT cron.schedule(
  'notifications-cleanup', '0 21 * * 0',
  $$DELETE FROM public.notifications
    WHERE sent_at < now() - interval '90 days'
      AND (read_at IS NOT NULL OR dismissed_at IS NOT NULL)$$
);

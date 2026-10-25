-- Inactivity reminders and the admin "learners by course" view.
--
-- 1. A learner who hasn't opened ZverTs for 3 days gets a reminder that day
--    and on each of the next two (days 3, 4 and 5 of the gap), naming the
--    course they were on and linking back to the video they stopped at.
--    dispatch_notification() still applies their comeback mute, quiet hours
--    and daily cap. pg_cron sends them every evening.
-- 2. admin_learners_by_course(): every learner of every course with how long
--    they've been away and the phone number they shared, so admins can call.
-- Days follow Bangladesh time (UTC+6), like the rest of the app.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- ── 1. Reminders ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_inactivity_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  _sent int := 0;
  _u record;
  _title text;
  _body text;
  _course text;
BEGIN
  FOR _u IN
    SELECT p.id,
           _today - (p.last_active AT TIME ZONE 'Asia/Dhaka')::date AS days,
           last_mod.module_id,
           last_mod.course_title
    FROM profiles p
    LEFT JOIN LATERAL (
      SELECT mp.module_id, c.title AS course_title
      FROM module_progress mp
      JOIN modules m ON m.id = mp.module_id
      JOIN courses c ON c.id = m.course_id
      WHERE mp.user_id = p.id AND NOT mp.completed
      ORDER BY mp.updated_at DESC
      LIMIT 1
    ) last_mod ON true
    WHERE NOT p.locked
      AND p.last_active IS NOT NULL
      AND _today - (p.last_active AT TIME ZONE 'Asia/Dhaka')::date BETWEEN 3 AND 5
  LOOP
    _course := COALESCE(_u.course_title, 'আপনার course');
    IF _u.days = 3 THEN
      _title := '৩ দিন দেখা নাই 👀';
      _body  := _course || ' এর পরের video অপেক্ষায় আছে। আজকে ১০ মিনিট দিবেন?';
    ELSIF _u.days = 4 THEN
      _title := 'যেখানে থামছিলেন, সেখান থেকেই শুরু 🔥';
      _body  := _course || ' — একটা video দেখলেই streak আবার চালু।';
    ELSE
      _title := 'ZverTs আপনাকে miss করতেছে 😄';
      _body  := 'আজকে ফিরে আসেন — ' || _course || ' শেষ করার সময় এখনই।';
    END IF;

    IF public.dispatch_notification(
         _u.id, 'comeback_3d', _title, _body, 'normal',
         CASE WHEN _u.module_id IS NOT NULL THEN '/learn/' || _u.module_id ELSE '/dashboard' END,
         jsonb_build_object('inactive_days', _u.days, 'reminder', _u.days - 2),
         'inactive:' || _today, 20
       ) IS NOT NULL THEN
      _sent := _sent + 1;
    END IF;
  END LOOP;
  RETURN _sent;
END $$;

-- Only the scheduler runs it.
REVOKE EXECUTE ON FUNCTION public.send_inactivity_reminders() FROM PUBLIC, anon, authenticated;

-- Every day at 19:30 Bangladesh time (13:30 UTC), outside default quiet hours.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'inactivity-reminders';
SELECT cron.schedule('inactivity-reminders', '30 13 * * *', 'SELECT public.send_inactivity_reminders()');

-- ── 2. Learners by course (admin) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_learners_by_course()
RETURNS TABLE(
  course_key text, course_title text, thumbnail_url text,
  user_id uuid, name text, email text, last_active timestamptz, inactive_days integer,
  videos_total integer, videos_done integer,
  country_code text, phone_number text, whatsapp_enabled boolean,
  reminders_sent integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(c.source_playlist_id, c.id::text),
    c.title,
    c.thumbnail_url,
    p.id,
    p.name,
    p.email,
    p.last_active,
    CASE WHEN p.last_active IS NULL THEN NULL
         ELSE _today - (p.last_active AT TIME ZONE 'Asia/Dhaka')::date END,
    (SELECT count(*)::int FROM modules m WHERE m.course_id = c.id),
    (SELECT count(*)::int FROM modules m JOIN module_progress mp ON mp.module_id = m.id
      WHERE m.course_id = c.id AND mp.user_id = c.user_id AND mp.completed),
    sc.country_code,
    sc.phone_number,
    COALESCE(sc.whatsapp_enabled, false),
    (SELECT count(*)::int FROM notifications n
      WHERE n.user_id = p.id AND n.category = 'comeback_3d'
        AND n.dedupe_key LIKE 'inactive:%'
        AND n.created_at > COALESCE(p.last_active, '-infinity'))
  FROM courses c
  JOIN profiles p ON p.id = c.user_id
  LEFT JOIN LATERAL (
    SELECT s.country_code, s.phone_number, s.whatsapp_enabled
    FROM support_contacts s WHERE s.user_id = p.id
    ORDER BY s.submitted_at DESC LIMIT 1
  ) sc ON true
  WHERE NOT c.is_system
  ORDER BY c.title, p.last_active NULLS FIRST;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_learners_by_course() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_learners_by_course() TO authenticated;

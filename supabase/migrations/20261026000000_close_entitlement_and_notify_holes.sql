-- Three holes found in review.

BEGIN;

-- ── 1. Learners could grant themselves a paid plan ─────────────────────────
-- The "*_select_own" / "*_update_own" policies on the split tables had no FOR
-- clause, so they applied to ALL commands. protect_*_fields() only guards
-- UPDATE, so a learner could DELETE their own user_entitlements row and INSERT
-- it again with is_paid_user = true and any credits (and the same for gems/XP
-- in user_progress). Rows are created by handle_new_user(); learners only read
-- and update them.
DROP POLICY IF EXISTS "user_entitlements_select_own" ON public.user_entitlements;
DROP POLICY IF EXISTS "user_entitlements_update_own" ON public.user_entitlements;
DROP POLICY IF EXISTS "user_entitlements_admin_select" ON public.user_entitlements;
CREATE POLICY "user_entitlements_select_own" ON public.user_entitlements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_entitlements_update_own" ON public.user_entitlements
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_entitlements_admin_select" ON public.user_entitlements
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "user_progress_select_own" ON public.user_progress;
DROP POLICY IF EXISTS "user_progress_update_own" ON public.user_progress;
DROP POLICY IF EXISTS "user_progress_admin_select" ON public.user_progress;
CREATE POLICY "user_progress_select_own" ON public.user_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_progress_update_own" ON public.user_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_progress_admin_select" ON public.user_progress
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "user_preferences_select_own" ON public.user_preferences;
DROP POLICY IF EXISTS "user_preferences_update_own" ON public.user_preferences;
DROP POLICY IF EXISTS "user_preferences_admin_select" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own" ON public.user_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_preferences_update_own" ON public.user_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_preferences_admin_select" ON public.user_preferences
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

REVOKE INSERT, DELETE ON public.user_entitlements, public.user_progress, public.user_preferences
  FROM anon, authenticated;

-- ── 2. Anyone could post fake payment alerts to the admin's Telegram ───────
-- notify-admin has verify_jwt = false and checked nothing, so a forged
-- "৳5000" alert carrying the id of a real ৳10 payment would approve the real
-- one when the admin tapped Confirm. The trigger now sends the same internal
-- secret push-send uses, and notify-admin checks it.
CREATE OR REPLACE FUNCTION public.notify_admin_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload   jsonb;
  prior_ct  integer;
BEGIN
  SELECT count(*) INTO prior_ct
    FROM public.payments
   WHERE lower(trx_id) = lower(NEW.trx_id)
     AND id <> NEW.id;

  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id',            NEW.id,
      'user_id',       NEW.user_id,
      'credits',       NEW.credits,
      'amount',        NEW.amount,
      'method',        NEW.method,
      'sender_number', NEW.sender_number,
      'trx_id',        NEW.trx_id,
      'status',        NEW.status,
      'prior_count',   prior_ct
    )
  );

  BEGIN
    PERFORM net.http_post(
      url     := 'https://jiprvhotnoobsutdlnrf.supabase.co/functions/v1/notify-admin',
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-push-secret', public.push_webhook_secret()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_payment: failed to queue HTTP request: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_admin_payment() FROM PUBLIC, anon, authenticated;

-- ── 3. Parallel imports spent one free conversion many times ───────────────
-- import-youtube-playlist read playlist_conversions_left, imported, then wrote
-- left - 1, so N requests fired together all passed the check. This claims
-- one conversion atomically; NULL means none were left. _delta = 1 refunds.
CREATE OR REPLACE FUNCTION public.svc_use_conversion(_user_id uuid, _delta integer DEFAULT -1)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_entitlements
     SET playlist_conversions_left = playlist_conversions_left + _delta
   WHERE user_id = _user_id
     AND playlist_conversions_left + _delta >= 0
  RETURNING playlist_conversions_left
$$;
REVOKE EXECUTE ON FUNCTION public.svc_use_conversion(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_use_conversion(uuid, integer) TO service_role;

COMMIT;

BEGIN;

-- Web Push: deliver notifications to devices even when ZverTs is closed.
--
--   push_subscriptions  — one row per subscribed browser / installed app
--                         (written by the app from Settings → Notifications).
--   notify_push()       — after a notification is inserted, asks the push-send
--                         Edge Function to deliver it to the user's devices.
--   push_webhook_secret — random shared secret in Vault; the trigger sends it and
--                         push-send checks it (via push_webhook_secret(), which only
--                         the service role can call), since push-send has
--                         verify_jwt = false.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_webhook_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_webhook_secret');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.push_webhook_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret' $$;

REVOKE EXECUTE ON FUNCTION public.push_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_webhook_secret() TO service_role;

CREATE OR REPLACE FUNCTION public.notify_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Scheduled notifications aren't due yet; only push the ones meant for now.
  IF NEW.scheduled_for IS NOT NULL AND NEW.scheduled_for > now() THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := 'https://jiprvhotnoobsutdlnrf.supabase.co/functions/v1/push-send',
      body    := jsonb_build_object('record', jsonb_build_object(
                   'id',        NEW.id,
                   'user_id',   NEW.user_id,
                   'title',     NEW.title,
                   'body',      NEW.body,
                   'deep_link', NEW.deep_link,
                   'priority',  NEW.priority
                 )),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-push-secret', public.push_webhook_secret()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Push is best-effort; never block the notification itself.
    RAISE WARNING 'notify_push: failed to queue HTTP request: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notifications_push ON public.notifications;
CREATE TRIGGER notifications_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_push();

COMMIT;

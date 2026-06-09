-- Two bugs in the original notify_admin_payment trigger:
--
-- 1. Missing Authorization + apikey headers. Supabase Edge Functions use the
--    apikey header for project routing even when verify_jwt = false. Without it
--    the request arrives at the function runtime but may be rejected before
--    the function handler is invoked.
--
-- 2. No exception guard around net.http_post. If pg_net fails to queue the
--    request (extension unavailable, wrong schema, etc.) the exception propagates
--    and rolls back the payment INSERT — the user's row disappears silently.
--    The notification is important but the payment record is more important.
--
-- Fix: add the anon key headers (read from Supabase's built-in Postgres setting)
-- and wrap the HTTP call in an exception block that logs a WARNING instead of
-- rolling back. Also recreate the trigger explicitly to ensure it is active.

CREATE OR REPLACE FUNCTION public.notify_admin_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  payload   jsonb;
  prior_ct  integer;
  anon_key  text := current_setting('app.settings.anon_key', true);
BEGIN
  SELECT count(*) INTO prior_ct
    FROM public.payments
   WHERE lower(trx_id) = lower(NEW.trx_id)
     AND id <> NEW.id;

  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id',            NEW.id,
      'user_id',       NEW.user_id,
      'package_type',  NEW.package_type,
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
      url     := 'https://rehgfihjeuvtixjphzku.supabase.co/functions/v1/notify-admin',
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || COALESCE(anon_key, ''),
        'apikey',        COALESCE(anon_key, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Payment INSERT must not be rolled back due to a notification failure.
    RAISE WARNING 'notify_admin_payment: failed to queue HTTP request: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admin_payment() FROM PUBLIC, anon, authenticated;

-- Recreate the trigger explicitly to guarantee it is active and points to the
-- current function definition.
DROP TRIGGER IF EXISTS trg_notify_admin_payment ON public.payments;
CREATE TRIGGER trg_notify_admin_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_payment();

-- Three bugs in the original notify_admin_payment trigger:
--
-- 1. Wrong project URL — was calling the old project (rehgfihjeuvtixjphzku)
--    instead of the active project (jiprvhotnoobsutdlnrf).
--
-- 2. Missing Authorization + apikey headers. Supabase Edge Functions use the
--    apikey header for project routing even when verify_jwt = false.
--
-- 3. No exception guard around net.http_post. A pg_net failure would propagate
--    and roll back the payment INSERT, silently losing the user's payment row.
--
-- Fix: correct the URL, hardcode the anon key (ALTER DATABASE is not available
-- on managed Supabase), and wrap the HTTP call in an exception block.

CREATE OR REPLACE FUNCTION public.notify_admin_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
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
      url     := 'https://jiprvhotnoobsutdlnrf.supabase.co/functions/v1/notify-admin',
      body    := payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcHJ2aG90bm9vYnN1dGRsbnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MzU4NzUsImV4cCI6MjA5NjMxMTg3NX0.bs4n5HxjnfVDBEr9Qzsg9fntu_ANZhsVoiEB5Uj7suU',
        'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcHJ2aG90bm9vYnN1dGRsbnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MzU4NzUsImV4cCI6MjA5NjMxMTg3NX0.bs4n5HxjnfVDBEr9Qzsg9fntu_ANZhsVoiEB5Uj7suU'
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

-- Replace the global trx_id unique index with a partial one.
--
-- The old index (payments_trx_unique) was UNIQUE ON lower(trx_id) globally.
-- This blocked a user from resubmitting a legitimately rejected payment using
-- the same transaction ID — a valid real-world scenario.
--
-- The new partial index only enforces uniqueness for non-rejected rows.
-- A rejected trx_id can be resubmitted; an active (pending/approved) one
-- still cannot, preserving the fraud guard.

DROP INDEX IF EXISTS public.payments_trx_unique;

CREATE UNIQUE INDEX payments_trx_unique_active
  ON public.payments (lower(trx_id))
  WHERE status <> 'rejected';

-- Add prior_count to the notification trigger payload.
-- This lets notify-admin warn if the same trx_id has been seen before
-- (including in rejected rows), catching the pattern of re-using a fake ID.
CREATE OR REPLACE FUNCTION public.notify_admin_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  payload  jsonb;
  prior_ct integer;
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

  PERFORM net.http_post(
    url     := 'https://rehgfihjeuvtixjphzku.supabase.co/functions/v1/notify-admin',
    body    := payload,
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admin_payment() FROM PUBLIC, anon, authenticated;

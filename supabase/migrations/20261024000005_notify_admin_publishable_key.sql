-- notify_admin_payment() called notify-admin with the legacy anon JWT hardcoded
-- in its headers. Legacy JWT keys are being disabled, so switch to the new
-- publishable key. notify-admin runs with verify_jwt = false, so no Authorization
-- header is needed. The publishable key is public (it ships in the frontend
-- bundle); access control relies on RLS, not on this key being secret.

CREATE OR REPLACE FUNCTION public.notify_admin_payment()
RETURNS trigger
LANGUAGE plpgsql
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
        'Content-Type', 'application/json',
        'apikey',       'sb_publishable_Hn9V-eqoxEXg_viVcrtvgw_zCGut5K-'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_payment: failed to queue HTTP request: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

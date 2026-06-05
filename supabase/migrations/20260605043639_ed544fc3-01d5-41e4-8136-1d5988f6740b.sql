
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_admin_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'package_type', NEW.package_type,
      'credits', NEW.credits,
      'amount', NEW.amount,
      'method', NEW.method,
      'sender_number', NEW.sender_number,
      'trx_id', NEW.trx_id,
      'status', NEW.status
    )
  );

  PERFORM extensions.http_post(
    url := 'https://rehgfihjeuvtixjphzku.supabase.co/functions/v1/notify-admin',
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_payment ON public.payments;
CREATE TRIGGER trg_notify_admin_payment
AFTER INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_payment();

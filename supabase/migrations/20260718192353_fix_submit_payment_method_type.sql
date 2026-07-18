-- Migration: fix submit_payment() method param type mismatch
-- Root cause: _method was declared as `text`, but payments.method is the
-- `payment_method` enum. Postgres does not implicitly cast text -> enum,
-- causing: column "method" is of type payment_method but expression is of type text
--
-- Fix: type the parameter as payment_method directly. Invalid values now
-- fail at the function-call boundary with a clear Postgres enum error,
-- rather than failing inside the INSERT.
--
-- NOTE: CREATE OR REPLACE does NOT replace a function whose parameter
-- signature differs (text -> payment_method counts as a different
-- signature). Without an explicit DROP, both overloads end up coexisting,
-- which can cause "ambiguous function call" errors depending on caller
-- argument types. Drop the old text-signature version first.

DROP FUNCTION IF EXISTS public.submit_payment(text, text, text);

CREATE OR REPLACE FUNCTION public.submit_payment(
  _method payment_method,
  _sender_number text,
  _trx_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _pending int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _sender_number := regexp_replace(coalesce(_sender_number,''),'\s','','g');
  _trx_id := upper(regexp_replace(coalesce(_trx_id,''),'\s','','g'));
  IF length(_sender_number) < 8 OR length(_sender_number) > 20 THEN RAISE EXCEPTION 'Invalid sender number'; END IF;
  IF length(_trx_id) < 4 OR length(_trx_id) > 40 THEN RAISE EXCEPTION 'Invalid transaction id'; END IF;
  SELECT count(*) INTO _pending FROM public.payments WHERE user_id = _uid AND status = 'pending';
  IF _pending >= 3 THEN RAISE EXCEPTION 'Too many pending requests'; END IF;
  INSERT INTO public.payments(user_id, credits, amount, method, sender_number, trx_id)
    VALUES (_uid, 100, 179, _method, _sender_number, _trx_id)
    RETURNING id INTO _id;
  PERFORM public.dispatch_notification(
    _uid, 'system_success', 'Payment submitted',
    'Your payment request is awaiting admin approval.',
    'normal', '/payments', jsonb_build_object('payment_id', _id),
    'pay_sub:'|| _id::text, 1);
  RETURN _id;
END;
$$;
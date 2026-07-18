-- Migration: remove remaining package_type references in payment approval functions
-- Root cause: same as prior migrations -- DROP TYPE package_type CASCADE
-- removed the column, but function bodies are plain text to Postgres'
-- dependency graph, so these two functions kept referencing
-- _p.package_type in their audit_logs metadata and would fail at
-- execution time with "record ... has no field package_type".
--
-- Confirmed via pg_get_functiondef() sweep of every function referencing
-- payments/package_type: these are the only two remaining offenders.
-- notify_admin_payment, submit_payment, reject_payment, svc_reject_payment,
-- request_refund, and process_refund are already clean.
--
-- Fix: drop the 'package' key from the jsonb_build_object metadata in
-- both functions. No other logic changed.

CREATE OR REPLACE FUNCTION public.svc_approve_payment(_payment_id uuid, _actor_label text DEFAULT 'telegram_admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p            public.payments%ROWTYPE;
  _first_paid   boolean;
  _rows_written int;
BEGIN
  SELECT * INTO _p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _p.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;

  UPDATE public.payments SET status = 'approved', approved_at = now() WHERE id = _payment_id;

  -- Read first-purchase flag BEFORE the UPSERT changes is_paid_user.
  -- COALESCE handles the impossible-but-safe case of no entitlements row.
  SELECT NOT COALESCE(is_paid_user, false) INTO _first_paid
    FROM public.user_entitlements WHERE user_id = _p.user_id;
  _first_paid := COALESCE(_first_paid, true);

  INSERT INTO public.user_entitlements (user_id, convert_credits, total_paid, is_paid_user, ai_enabled)
  VALUES (_p.user_id, _p.credits, _p.amount, true, true)
  ON CONFLICT (user_id) DO UPDATE
    SET convert_credits = user_entitlements.convert_credits + EXCLUDED.convert_credits,
        total_paid      = user_entitlements.total_paid + EXCLUDED.total_paid,
        is_paid_user    = true,
        ai_enabled      = true;

  GET DIAGNOSTICS _rows_written = ROW_COUNT;
  IF _rows_written = 0 THEN
    RAISE EXCEPTION 'Entitlement write returned 0 rows for user %', _p.user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_user, metadata)
    VALUES (NULL, 'payment_approved', _p.user_id,
      jsonb_build_object(
        'payment_id', _p.id, 'credits', _p.credits, 'amount', _p.amount,
        'first_paid', _first_paid, 'via', _actor_label));

  PERFORM public.dispatch_notification(
    _p.user_id, 'system_success', 'Payment approved 🎉',
    _p.credits::text || ' convert credits added!'
      || CASE WHEN _first_paid THEN ' AI unlocked for lifetime ✨' ELSE '' END,
    'high', '/dashboard', jsonb_build_object('payment_id', _p.id),
    'pay_ok:' || _p.id::text, 1);

  RETURN jsonb_build_object('ok', true, 'first_paid', _first_paid);
END $function$
;

CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor        uuid := auth.uid();
  _p            public.payments%ROWTYPE;
  _first_paid   boolean;
  _rows_written int;
BEGIN
  IF NOT (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO _p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _p.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;

  UPDATE public.payments
    SET status = 'approved', approved_by = _actor, approved_at = now()
    WHERE id = _payment_id;

  SELECT NOT COALESCE(is_paid_user, false) INTO _first_paid
    FROM public.user_entitlements WHERE user_id = _p.user_id;
  _first_paid := COALESCE(_first_paid, true);

  INSERT INTO public.user_entitlements (user_id, convert_credits, total_paid, is_paid_user, ai_enabled)
  VALUES (_p.user_id, _p.credits, _p.amount, true, true)
  ON CONFLICT (user_id) DO UPDATE
    SET convert_credits = user_entitlements.convert_credits + EXCLUDED.convert_credits,
        total_paid      = user_entitlements.total_paid + EXCLUDED.total_paid,
        is_paid_user    = true,
        ai_enabled      = true;

  GET DIAGNOSTICS _rows_written = ROW_COUNT;
  IF _rows_written = 0 THEN
    RAISE EXCEPTION 'Entitlement write returned 0 rows for user %', _p.user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_user, metadata)
    VALUES (_actor, 'payment_approved', _p.user_id,
      jsonb_build_object(
        'payment_id', _p.id, 'credits', _p.credits, 'amount', _p.amount,
        'first_paid', _first_paid));

  PERFORM public.dispatch_notification(
    _p.user_id, 'system_success', 'Payment approved',
    _p.credits::text || ' convert credits added!'
      || CASE WHEN _first_paid THEN ' AI unlocked for lifetime' ELSE '' END,
    'high', '/dashboard', jsonb_build_object('payment_id', _p.id),
    'pay_ok:' || _p.id::text, 1);

  RETURN jsonb_build_object('ok', true, 'first_paid', _first_paid);
END $function$
;
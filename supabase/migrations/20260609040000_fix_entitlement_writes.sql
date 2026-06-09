-- Fix B: svc_approve_payment, approve_payment, and admin_adjust_credits all
--        UPDATE public.profiles for entitlement fields (convert_credits, total_paid,
--        is_paid_user, ai_enabled) that were dropped in 20260608020000 and moved to
--        public.user_entitlements. Every approval call fails at runtime.
--        Rewrite all three to UPSERT into user_entitlements with a ROW_COUNT guard.
--
-- Fix C: protect_entitlement_fields() references NEW/OLD.free_playlist_used but the
--        live column name is playlist_conversions_left (reflected in generated types
--        and the frontend hook). Rename the column (idempotent) and update the
--        trigger function and compatibility view accordingly.

BEGIN;

-- ── Fix C: Rename column (idempotent — no-op if already renamed) ──────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_entitlements'
      AND column_name  = 'free_playlist_used'
  ) THEN
    ALTER TABLE public.user_entitlements
      RENAME COLUMN free_playlist_used TO playlist_conversions_left;
  END IF;
END $$;

-- ── Fix C: Trigger uses corrected column name ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_entitlement_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') THEN RETURN NEW; END IF;
  NEW.is_paid_user              := OLD.is_paid_user;
  NEW.ai_enabled                := OLD.ai_enabled;
  NEW.total_paid                := OLD.total_paid;
  NEW.convert_credits           := OLD.convert_credits;
  NEW.playlist_conversions_left := OLD.playlist_conversions_left;
  RETURN NEW;
END $$;

-- ── Fix C: Compatibility view references renamed column ───────────────────────
CREATE OR REPLACE VIEW public.user_full_profile AS
SELECT
  p.*,
  up.total_gems, up.total_xp, up.current_streak, up.longest_streak,
  up.last_attendance_date,
  ue.is_paid_user, ue.ai_enabled, ue.total_paid, ue.convert_credits,
  ue.playlist_conversions_left,
  upref.daily_goal_minutes, upref.study_reminders_enabled, upref.notify_email,
  upref.notify_inactivity, upref.notify_completion, upref.profile_public
FROM public.profiles p
LEFT JOIN public.user_progress     up    ON up.user_id    = p.id
LEFT JOIN public.user_entitlements ue    ON ue.user_id    = p.id
LEFT JOIN public.user_preferences  upref ON upref.user_id = p.id;

-- ── Fix B: svc_approve_payment (Telegram path) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.svc_approve_payment(
  _payment_id  uuid,
  _actor_label text DEFAULT 'telegram_admin'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        'package', _p.package_type, 'first_paid', _first_paid, 'via', _actor_label));

  PERFORM public.dispatch_notification(
    _p.user_id, 'system_success', 'Payment approved 🎉',
    _p.credits::text || ' convert credits added!'
      || CASE WHEN _first_paid THEN ' AI unlocked for lifetime ✨' ELSE '' END,
    'high', '/dashboard', jsonb_build_object('payment_id', _p.id),
    'pay_ok:' || _p.id::text, 1);

  RETURN jsonb_build_object('ok', true, 'first_paid', _first_paid);
END $$;

REVOKE ALL  ON FUNCTION public.svc_approve_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_approve_payment(uuid, text) TO service_role;

-- ── Fix B: approve_payment (admin panel path) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        'package', _p.package_type, 'first_paid', _first_paid));

  PERFORM public.dispatch_notification(
    _p.user_id, 'system_success', 'Payment approved 🎉',
    _p.credits::text || ' convert credits added!'
      || CASE WHEN _first_paid THEN ' AI unlocked for lifetime ✨' ELSE '' END,
    'high', '/dashboard', jsonb_build_object('payment_id', _p.id),
    'pay_ok:' || _p.id::text, 1);

  RETURN jsonb_build_object('ok', true, 'first_paid', _first_paid);
END $$;

-- ── Fix B: admin_adjust_credits ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_target uuid, _delta int, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.user_entitlements (user_id, convert_credits)
  VALUES (_target, GREATEST(0, _delta))
  ON CONFLICT (user_id) DO UPDATE
    SET convert_credits = GREATEST(0, user_entitlements.convert_credits + _delta);

  INSERT INTO public.audit_logs (actor_id, action, target_user, metadata)
    VALUES (_actor, 'credits_adjusted', _target,
      jsonb_build_object('delta', _delta, 'reason', _reason));
END $$;

COMMIT;

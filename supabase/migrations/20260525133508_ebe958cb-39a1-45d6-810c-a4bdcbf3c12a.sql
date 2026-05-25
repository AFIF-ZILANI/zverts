
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_playlist_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS convert_credits int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_paid_user boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_paid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('bkash','nagad','rocket');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.package_type AS ENUM ('single','mini','pro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_type public.package_type NOT NULL,
  credits int NOT NULL,
  amount int NOT NULL,
  method public.payment_method NOT NULL,
  sender_number text NOT NULL,
  trx_id text NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  admin_note text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_trx_unique ON public.payments (lower(trx_id));
CREATE INDEX IF NOT EXISTS payments_user_idx ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status, created_at DESC);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_select_own ON public.payments;
CREATE POLICY payments_select_own ON public.payments FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS payments_insert_own ON public.payments;
CREATE POLICY payments_insert_own ON public.payments FOR INSERT
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_user uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_admin_read ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(),'super_admin') THEN
    RETURN NEW;
  END IF;
  NEW.total_xp := OLD.total_xp;
  NEW.total_gems := OLD.total_gems;
  NEW.current_streak := OLD.current_streak;
  NEW.longest_streak := OLD.longest_streak;
  NEW.last_attendance_date := OLD.last_attendance_date;
  NEW.free_playlist_used := OLD.free_playlist_used;
  NEW.convert_credits := OLD.convert_credits;
  NEW.ai_enabled := OLD.ai_enabled;
  NEW.is_paid_user := OLD.is_paid_user;
  NEW.total_paid := OLD.total_paid;
  NEW.locked := OLD.locked;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_profile') THEN
    CREATE TRIGGER trg_protect_profile
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, certificate_name)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)));
  IF lower(NEW.email) IN ('tauhidrana00@gmail.com','tauhidrana03@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'super_admin'::public.app_role FROM public.profiles
  WHERE lower(email) IN ('tauhidrana00@gmail.com','tauhidrana03@gmail.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin'::public.app_role FROM public.profiles
  WHERE lower(email) IN ('tauhidrana00@gmail.com','tauhidrana03@gmail.com')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.consume_conversion()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _p public.profiles%ROWTYPE; _used_kind text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO _p FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _p.locked THEN RAISE EXCEPTION 'Account locked' USING ERRCODE='42501'; END IF;
  IF _p.free_playlist_used < 3 THEN
    UPDATE public.profiles SET free_playlist_used = free_playlist_used + 1 WHERE id = _uid;
    _used_kind := 'free';
  ELSIF _p.convert_credits > 0 THEN
    UPDATE public.profiles SET convert_credits = convert_credits - 1 WHERE id = _uid;
    _used_kind := 'paid';
  ELSE
    RAISE EXCEPTION 'NO_CREDITS' USING ERRCODE='P0001';
  END IF;
  RETURN jsonb_build_object(
    'used', _used_kind,
    'free_left', GREATEST(0, 3 - (CASE WHEN _used_kind='free' THEN _p.free_playlist_used+1 ELSE _p.free_playlist_used END)),
    'credits_left', CASE WHEN _used_kind='paid' THEN _p.convert_credits-1 ELSE _p.convert_credits END
  );
END $$;

CREATE OR REPLACE FUNCTION public.submit_payment(
  _package public.package_type, _method public.payment_method, _sender_number text, _trx_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _credits int; _amount int; _id uuid; _pending int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _sender_number := regexp_replace(coalesce(_sender_number,''),'\s','','g');
  _trx_id := upper(regexp_replace(coalesce(_trx_id,''),'\s','','g'));
  IF length(_sender_number) < 8 OR length(_sender_number) > 20 THEN RAISE EXCEPTION 'Invalid sender number'; END IF;
  IF length(_trx_id) < 4 OR length(_trx_id) > 40 THEN RAISE EXCEPTION 'Invalid transaction id'; END IF;
  CASE _package
    WHEN 'single' THEN _credits := 1; _amount := 10;
    WHEN 'mini'   THEN _credits := 5; _amount := 40;
    WHEN 'pro'    THEN _credits := 10; _amount := 70;
  END CASE;
  SELECT count(*) INTO _pending FROM public.payments WHERE user_id = _uid AND status = 'pending';
  IF _pending >= 3 THEN RAISE EXCEPTION 'Too many pending requests'; END IF;
  INSERT INTO public.payments(user_id, package_type, credits, amount, method, sender_number, trx_id)
    VALUES (_uid, _package, _credits, _amount, _method, _sender_number, _trx_id)
    RETURNING id INTO _id;
  PERFORM public.dispatch_notification(
    _uid, 'system_success', 'Payment submitted ⏳',
    'Your '|| _package ||' package request is awaiting admin approval.',
    'normal', '/payments', jsonb_build_object('payment_id', _id),
    'pay_sub:'|| _id::text, 1);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.approve_payment(_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _p public.payments%ROWTYPE; _first_paid boolean := false;
BEGIN
  IF NOT (public.has_role(_actor,'admin') OR public.has_role(_actor,'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT * INTO _p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _p.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;
  UPDATE public.payments SET status='approved', approved_by=_actor, approved_at=now() WHERE id=_payment_id;
  SELECT NOT is_paid_user INTO _first_paid FROM public.profiles WHERE id = _p.user_id;
  UPDATE public.profiles
    SET convert_credits = convert_credits + _p.credits,
        total_paid = total_paid + _p.amount,
        is_paid_user = true,
        ai_enabled = true
    WHERE id = _p.user_id;
  INSERT INTO public.audit_logs(actor_id, action, target_user, metadata)
    VALUES (_actor,'payment_approved',_p.user_id,
      jsonb_build_object('payment_id',_p.id,'credits',_p.credits,'amount',_p.amount,'package',_p.package_type,'first_paid',_first_paid));
  PERFORM public.dispatch_notification(
    _p.user_id, 'system_success', 'Payment approved 🎉',
    _p.credits || ' convert credits added!' || CASE WHEN _first_paid THEN ' AI unlocked for lifetime ✨' ELSE '' END,
    'high', '/dashboard', jsonb_build_object('payment_id',_p.id),
    'pay_ok:'|| _p.id::text, 1);
  RETURN jsonb_build_object('ok',true,'first_paid',_first_paid);
END $$;

CREATE OR REPLACE FUNCTION public.reject_payment(_payment_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _p public.payments%ROWTYPE;
BEGIN
  IF NOT (public.has_role(_actor,'admin') OR public.has_role(_actor,'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT * INTO _p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _p.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;
  UPDATE public.payments SET status='rejected', rejected_by=_actor, rejected_at=now(), admin_note=_note WHERE id=_payment_id;
  INSERT INTO public.audit_logs(actor_id, action, target_user, metadata)
    VALUES (_actor,'payment_rejected',_p.user_id, jsonb_build_object('payment_id',_p.id,'note',_note));
  PERFORM public.dispatch_notification(
    _p.user_id, 'system_failure', 'Payment rejected',
    COALESCE(_note,'Your payment was rejected. Please contact admin if this is a mistake.'),
    'high', '/payments', jsonb_build_object('payment_id',_p.id),
    'pay_no:'|| _p.id::text, 1);
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_target uuid, _delta int, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_actor,'admin') OR public.has_role(_actor,'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET convert_credits = GREATEST(0, convert_credits + _delta) WHERE id = _target;
  INSERT INTO public.audit_logs(actor_id, action, target_user, metadata)
    VALUES (_actor,'credits_adjusted',_target, jsonb_build_object('delta',_delta,'reason',_reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_locked(_target uuid, _locked boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_actor,'admin') OR public.has_role(_actor,'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET locked = _locked WHERE id = _target;
  INSERT INTO public.audit_logs(actor_id, action, target_user, metadata)
    VALUES (_actor, CASE WHEN _locked THEN 'user_locked' ELSE 'user_unlocked' END, _target,
      jsonb_build_object('reason',_reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_email text, _role public.app_role, _grant boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _target uuid;
BEGIN
  IF NOT public.has_role(_actor,'super_admin') THEN RAISE EXCEPTION 'Only super_admin can manage roles'; END IF;
  IF _role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Only admin/super_admin assignable here'; END IF;
  SELECT id INTO _target FROM public.profiles WHERE lower(email) = lower(_email);
  IF _target IS NULL THEN RAISE EXCEPTION 'No user with that email'; END IF;
  IF _grant THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_target, _role) ON CONFLICT DO NOTHING;
    INSERT INTO public.audit_logs(actor_id, action, target_user, metadata)
      VALUES (_actor,'role_granted',_target, jsonb_build_object('role',_role));
  ELSE
    IF _target = _actor AND _role = 'super_admin' THEN RAISE EXCEPTION 'Cannot demote yourself'; END IF;
    DELETE FROM public.user_roles WHERE user_id = _target AND role = _role;
    INSERT INTO public.audit_logs(actor_id, action, target_user, metadata)
      VALUES (_actor,'role_revoked',_target, jsonb_build_object('role',_role));
  END IF;
  RETURN jsonb_build_object('ok',true,'user_id',_target);
END $$;

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE(user_id uuid, email text, name text, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.email, p.name, array_agg(ur.role::text ORDER BY ur.role::text)
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('admin','super_admin')
  GROUP BY p.id, p.email, p.name
  ORDER BY p.email;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(_limit int DEFAULT 100, _search text DEFAULT NULL)
RETURNS TABLE(
  id uuid, email text, name text, ai_enabled boolean, is_paid_user boolean,
  free_playlist_used int, convert_credits int, total_paid int, locked boolean,
  created_at timestamptz, last_active timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, email, name, ai_enabled, is_paid_user, free_playlist_used, convert_credits,
         total_paid, locked, created_at, last_active
  FROM public.profiles
  WHERE (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    AND (_search IS NULL OR _search = '' OR email ILIKE '%'||_search||'%' OR name ILIKE '%'||_search||'%')
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;

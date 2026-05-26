
-- Transcripts: one per module
CREATE TABLE IF NOT EXISTS public.transcripts (
  module_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'queued', -- queued | processing | ready | failed
  text text,
  segments jsonb, -- [{start: number, end: number, text: string}]
  model text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY transcripts_select_scoped ON public.transcripts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = transcripts.module_id
      AND (c.user_id = auth.uid() OR c.is_public = true OR c.is_system = true OR has_role(auth.uid(),'admin'))
  )
);

CREATE POLICY transcripts_owner_write ON public.transcripts
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = transcripts.module_id
      AND (c.user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = transcripts.module_id
      AND (c.user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  )
);

CREATE INDEX IF NOT EXISTS transcripts_status_idx ON public.transcripts(status);

-- AI usage counter
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_select_own ON public.ai_usage
FOR SELECT USING (auth.uid() = user_id);

-- writes happen via SECURITY DEFINER RPC; no direct insert/update policy needed

-- RPC: consume 1 AI message; enforces free-preview daily limit
CREATE OR REPLACE FUNCTION public.consume_ai_message(_daily_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _is_paid boolean;
  _count int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT is_paid_user INTO _is_paid FROM public.profiles WHERE id = _uid;

  INSERT INTO public.ai_usage(user_id, day, count) VALUES (_uid, _today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;

  -- lock row
  SELECT count INTO _count FROM public.ai_usage
    WHERE user_id = _uid AND day = _today FOR UPDATE;

  IF NOT COALESCE(_is_paid,false) AND _count >= _daily_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'limit_reached',
      'count', _count,
      'limit', _daily_limit,
      'remaining', 0,
      'paid', false
    );
  END IF;

  UPDATE public.ai_usage SET count = count + 1
    WHERE user_id = _uid AND day = _today
    RETURNING count INTO _count;

  RETURN jsonb_build_object(
    'ok', true,
    'count', _count,
    'limit', _daily_limit,
    'remaining', CASE WHEN COALESCE(_is_paid,false) THEN NULL ELSE GREATEST(0, _daily_limit - _count) END,
    'paid', COALESCE(_is_paid,false)
  );
END $$;

-- Read-only: get today's usage without incrementing
CREATE OR REPLACE FUNCTION public.get_ai_usage_today(_daily_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _is_paid boolean;
  _count int;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT is_paid_user INTO _is_paid FROM public.profiles WHERE id = _uid;
  SELECT count INTO _count FROM public.ai_usage WHERE user_id = _uid AND day = _today;
  _count := COALESCE(_count, 0);
  RETURN jsonb_build_object(
    'count', _count,
    'limit', _daily_limit,
    'remaining', CASE WHEN COALESCE(_is_paid,false) THEN NULL ELSE GREATEST(0, _daily_limit - _count) END,
    'paid', COALESCE(_is_paid,false)
  );
END $$;

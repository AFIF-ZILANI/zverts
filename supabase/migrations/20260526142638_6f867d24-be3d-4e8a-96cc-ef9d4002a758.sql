
-- Support contacts table
CREATE TABLE public.support_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text,
  country_code text DEFAULT '+880',
  phone_number text NOT NULL,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'support_popup',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_contacts TO authenticated;
GRANT ALL ON public.support_contacts TO service_role;

ALTER TABLE public.support_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_contacts_select_own_or_admin"
  ON public.support_contacts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "support_contacts_insert_own"
  ON public.support_contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "support_contacts_update_own"
  ON public.support_contacts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Dismissal tracking (Maybe Later)
CREATE TABLE public.support_contact_dismissals (
  user_id uuid PRIMARY KEY,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  dismiss_count integer NOT NULL DEFAULT 1
);

GRANT SELECT, INSERT, UPDATE ON public.support_contact_dismissals TO authenticated;
GRANT ALL ON public.support_contact_dismissals TO service_role;

ALTER TABLE public.support_contact_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_dismissals_select_own_or_admin"
  ON public.support_contact_dismissals FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "support_dismissals_insert_own"
  ON public.support_contact_dismissals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "support_dismissals_update_own"
  ON public.support_contact_dismissals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_contacts;

-- Admin listing function (joins profiles for premium status / last active)
CREATE OR REPLACE FUNCTION public.admin_list_support_contacts(_search text DEFAULT NULL, _limit integer DEFAULT 500)
RETURNS TABLE(
  id uuid, user_id uuid, name text, email text, country_code text, phone_number text,
  whatsapp_enabled boolean, source text, submitted_at timestamptz,
  joined_at timestamptz, last_active timestamptz, is_paid_user boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sc.id, sc.user_id, sc.name, COALESCE(sc.email, p.email) AS email,
         sc.country_code, sc.phone_number, sc.whatsapp_enabled, sc.source, sc.submitted_at,
         p.created_at AS joined_at, p.last_active, p.is_paid_user
  FROM public.support_contacts sc
  LEFT JOIN public.profiles p ON p.id = sc.user_id
  WHERE (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    AND (_search IS NULL OR _search = ''
         OR sc.name ILIKE '%'||_search||'%'
         OR sc.phone_number ILIKE '%'||_search||'%'
         OR COALESCE(sc.email, p.email) ILIKE '%'||_search||'%')
  ORDER BY sc.submitted_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 2000));
$$;

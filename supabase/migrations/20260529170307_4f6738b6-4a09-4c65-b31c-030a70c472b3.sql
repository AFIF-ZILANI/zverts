-- Fix missing grants on payments table (PostgREST needs explicit grants beyond RLS)
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

-- Enable realtime so admin panel updates instantly when users submit
ALTER TABLE public.payments REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
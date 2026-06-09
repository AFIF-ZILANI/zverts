-- Revoke anonymous execution from all payment/admin RPCs.
--
-- svc_approve_payment and svc_reject_payment are already service_role-only
-- (migration 20260605072336). This migration covers the remaining functions
-- that are meant for authenticated callers only. Revoking from anon means the
-- Postgres executor rejects the call before even entering the function body,
-- rather than relying on the has_role() / auth.uid() guards inside.

REVOKE EXECUTE ON FUNCTION public.submit_payment(
  public.package_type, public.payment_method, text, text
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.approve_payment(uuid)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_payment(uuid, text)                     FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_locked(uuid, boolean, text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(text, public.app_role, boolean) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.list_admin_users()                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_users(integer, text)                FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, text)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, boolean, text)            FROM PUBLIC, anon;

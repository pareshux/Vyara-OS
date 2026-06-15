-- ============================================================
-- setup-auth-hook.sql
-- Run this in the Supabase Dashboard → SQL Editor
--
-- After running, go to:
--   Dashboard → Authentication → Hooks
--   → Custom Access Token hook
--   → select schema: public, function: custom_access_token_hook
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := (event ->> 'user_id')::UUID;

  SELECT tenant_id, role
  INTO v_tenant_id, v_role
  FROM public.user_profile
  WHERE id = v_user_id AND is_active = true;

  IF FOUND THEN
    RETURN jsonb_set(
      jsonb_set(event, '{claims,tenant_id}', to_jsonb(v_tenant_id::TEXT)),
      '{claims,role}',
      to_jsonb(v_role)
    );
  END IF;

  RETURN event;
END;
$$;

-- Allow Supabase Auth to call this function
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO authenticated;

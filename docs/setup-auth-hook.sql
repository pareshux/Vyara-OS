-- ============================================================
-- setup-auth-hook.sql
-- Run this in the Supabase Dashboard → SQL Editor
--
-- After running, go to:
--   Dashboard → Authentication → Hooks
--   → Custom Access Token hook
--   → select schema: public, function: custom_access_token_hook
--
-- This hook injects tenant_id, role, AND (for dealer-role users)
-- dealer_id into every JWT issued by Supabase Auth. RLS policies
-- across the platform rely on these claims:
--   - current_tenant_id()  — tenant scoping (all modules)
--   - current_actor_role() — role-based gating (mask sensitive cols,
--                            allow/deny operations)
--   - current_dealer_id()  — dealer-portal scoping (Slice 3 onwards)
--
-- This file is the source of truth. Re-run it after every schema
-- change that affects what the hook needs to emit.
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_tenant_id UUID;
  v_role      TEXT;
  v_dealer_id UUID;
  v_claims    JSONB;
BEGIN
  v_user_id := (event ->> 'user_id')::UUID;

  -- Tenant + role come from user_profile
  SELECT tenant_id, role
  INTO v_tenant_id, v_role
  FROM public.user_profile
  WHERE id = v_user_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN event;
  END IF;

  v_claims := COALESCE(event -> 'claims', '{}'::jsonb);
  v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant_id::TEXT));
  v_claims := jsonb_set(v_claims, '{role}',      to_jsonb(v_role));

  -- For dealer-role users, also inject dealer_id so RLS can scope
  -- dealer-portal queries to the right dealer firm. Picks the
  -- single active dealer_user link (the multi-dealer-per-user case
  -- is rare and out of scope for the pilot).
  IF v_role = 'dealer' THEN
    SELECT du.dealer_id INTO v_dealer_id
    FROM public.dealer_user du
    WHERE du.auth_user_id = v_user_id AND du.is_active = true
    ORDER BY du.accepted_at NULLS LAST, du.invited_at
    LIMIT 1;

    IF v_dealer_id IS NOT NULL THEN
      v_claims := jsonb_set(v_claims, '{dealer_id}', to_jsonb(v_dealer_id::TEXT));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Allow Supabase Auth to call this function
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO authenticated;

# `scripts/` — operational tooling

Node CLI scripts for ops tasks that don't have a UI yet. Each script is
idempotent and self-contained — safe to re-run.

## Available scripts

### `onboard-tenant.ts` — Tenant provisioning (Blueprint PLAT-011)

Provisions a new tenant from a JSON config. Replaces the manual SQL
sequence from `docs/customer-onboarding-runbook.md` §3.

**What it does (in order):**
1. INSERT or UPDATE the `tenant` row (idempotent by slug).
2. UPSERT `tenant_feature` rows for the 10 known flag codes.
3. Create the admin auth user (`supabase.auth.admin.createUser`) with
   `email_confirm: true` so no verification email is sent.
4. UPSERT the admin's `user_profile` row.

**Run:**

```bash
# Pre-flight
export NEXT_PUBLIC_SUPABASE_URL=https://...
export SUPABASE_SERVICE_ROLE_KEY=eyJ...   # NEVER commit this

# Copy + edit the example
cp scripts/onboard-tenant-config.example.json /tmp/nitco.json
# (set tenant.name, slug, codes prefix, admin email/password, features)

# Run
tsx scripts/onboard-tenant.ts /tmp/nitco.json
```

**Output** (stdout):

```json
{
  "ok": true,
  "tenant": { "id": "...", "slug": "nitco", "action": "created" },
  "features": { "count": 10, "codes": [ ... ] },
  "admin": { "user_id": "...", "email": "admin@nitco.example", "action": "created" }
}
```

**Failure modes:**
- Missing `SUPABASE_SERVICE_ROLE_KEY` → exit 1 with stderr message
- Invalid config (Zod) → exit 2 with field-level error list
- Tenant slug already exists → updates instead of failing (idempotent)
- Admin email already exists → links existing auth user to this tenant's profile (warn-then-link)

**Then what?** (from the runbook)
1. Test login with the admin credentials at `/login`.
2. Admin enters per-tenant masters (taxes, payment terms, vehicles, etc.)
   via the existing `/admin/*` UIs.
3. Field reps invite via `/admin/users` (FUTURE — script needed; today
   manual SQL).
4. Hand off Tally + AiSensy credentials separately.

**Security notes:**
- Service-role key bypasses RLS — the script can write to any tenant.
  Run only in trusted environments.
- Don't commit any populated config JSON; the admin password is in clear text.
- Rotate the admin password after first login.

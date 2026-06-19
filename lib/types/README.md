# `lib/types/database.ts` — generated Supabase types

`database.ts` is **machine-generated** from the linked Supabase project's
schema. Do not edit by hand. Regenerate any time the schema changes.

## Regenerate

```bash
supabase gen types typescript --linked > lib/types/database.ts
```

(Once `package.json` is settled, this will be added as `npm run db:types`.)

## How it's wired

The `Database` type is passed as a generic to the Supabase client so every
`.from('<table>')` call gets typed columns / inserts / updates without
manual annotations:

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

export function createClient() {
  return createBrowserClient<Database>(...)
}
```

The server client (`lib/supabase/server.ts`) wires `<Database>` the same way
once the local server.ts WIP lands — see Blueprint Status Tracker for
PLAT-008's follow-up note.

## Why

- Catches schema drift at typecheck (renamed columns, dropped tables, etc.)
- Removes the `as unknown as { ... }[]` casts scattered across actions
- New columns become available immediately after a regen — no manual ts type rewrite

## Conventions

- Regenerate as part of every migration PR (manually until the npm script lands).
- Commit the regenerated file with the migration in the same commit.
- Do not import `Database` directly in business logic — use the typed
  client's `.from()` and let the types flow.

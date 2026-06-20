-- 0040_activity_actor_fk_to_user_profile.sql
--
-- activity.actor_id was referencing auth.users(id).
-- PostgREST only exposes the public schema, so the embedded join
-- actor:actor_id(full_name) silently returned null for the entire
-- activities query, causing every timeline on every detail page to
-- render empty even when rows existed in the DB.
--
-- Fix: retarget the FK to user_profile(id), which is in public schema
-- and carries the full_name column PostgREST needs.
-- user_profile.id IS auth.users.id (it's a PK that references auth.users),
-- so FK integrity is preserved. Only actors who have completed onboarding
-- (i.e. have a user_profile row) can write activities — that invariant
-- already holds in getActorContext().

ALTER TABLE activity
  DROP CONSTRAINT IF EXISTS activity_actor_id_fkey;

ALTER TABLE activity
  ADD CONSTRAINT activity_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES user_profile(id);

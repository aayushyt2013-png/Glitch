-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run. This migration adds the server-enforced guest message quota
-- and disables browser access to the old file bucket.

-- 1) Guest message usage. One row per anonymous Supabase user.
create table if not exists public.glitch_guest_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_count integer not null default 0
    check (message_count >= 0 and message_count <= 30),
  updated_at timestamptz not null default now()
);

alter table public.glitch_guest_usage enable row level security;
-- No direct table policies: clients cannot read or change counters directly.
revoke all on public.glitch_guest_usage from anon, authenticated;

-- 2) Atomically consume one message for the currently authenticated guest.
-- auth.uid() comes from the verified Supabase JWT, never from request JSON.
create or replace function public.consume_guest_message()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_used integer;
  v_allowed boolean := false;
begin
  if v_user is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception 'This function is only for anonymous guest accounts';
  end if;

  insert into public.glitch_guest_usage (user_id, message_count, updated_at)
  values (v_user, 1, now())
  on conflict (user_id) do update
    set message_count = public.glitch_guest_usage.message_count + 1,
        updated_at = now()
    where public.glitch_guest_usage.message_count < 30
  returning message_count into v_used;

  if found then
    v_allowed := true;
  else
    select message_count into v_used
    from public.glitch_guest_usage
    where user_id = v_user;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'used', coalesce(v_used, 0),
    'remaining', greatest(0, 30 - coalesce(v_used, 0)),
    'limit', 30
  );
end;
$$;

-- 3) Read the current guest allowance without exposing another user's row.
create or replace function public.get_guest_message_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_used integer := 0;
begin
  if v_user is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception 'This function is only for anonymous guest accounts';
  end if;

  select message_count into v_used
  from public.glitch_guest_usage
  where user_id = v_user;

  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'remaining', greatest(0, 30 - coalesce(v_used, 0)),
    'limit', 30
  );
end;
$$;

revoke all on function public.consume_guest_message() from public, anon;
revoke all on function public.get_guest_message_usage() from public, anon;
grant execute on function public.consume_guest_message() to authenticated;
grant execute on function public.get_guest_message_usage() to authenticated;

-- 4) Disable all browser access to the previous upload/download bucket.
-- Existing objects remain private; remove them manually from Storage if desired.
drop policy if exists "glitch: read own files" on storage.objects;
drop policy if exists "glitch: upload to own uploads folder" on storage.objects;
drop policy if exists "glitch: write own generated files" on storage.objects;
drop policy if exists "glitch: update own generated files" on storage.objects;
drop policy if exists "glitch: delete own files" on storage.objects;

-- Refresh PostgREST's function schema cache so the new RPCs are immediately visible.
notify pgrst, 'reload schema';

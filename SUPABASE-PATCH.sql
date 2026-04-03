-- ============================================================
-- Salarn — Supabase Patch (run if you already ran SUPABASE-SCHEMA.sql)
-- This adds the auto-profile trigger that fixes the sign-in bug.
-- Run this in Supabase SQL Editor → New Query → Run
-- ============================================================

-- Auto-create user profile + balance row on every signup
-- Runs server-side (security definer), so it bypasses RLS entirely.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (auth_id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    'user'
  )
  on conflict (auth_id) do nothing;

  insert into public.user_balances (user_email, balance_usd, total_invested, total_profit_loss)
  values (new.email, 0, 0, 0)
  on conflict (user_email) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- For EXISTING users who already signed up before this patch:
-- Run this to create missing profile rows for them.
-- ============================================================
insert into public.users (auth_id, email, full_name, role)
select
  au.id,
  au.email,
  au.raw_user_meta_data->>'full_name',
  'user'
from auth.users au
left join public.users pu on pu.auth_id = au.id
where pu.id is null
on conflict (auth_id) do nothing;

insert into public.user_balances (user_email, balance_usd, total_invested, total_profit_loss)
select u.email, 0, 0, 0
from public.users u
left join public.user_balances ub on ub.user_email = u.email
where ub.id is null
on conflict (user_email) do nothing;

-- Verify the trigger was created:
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'on_auth_user_created';
-- Should return 1 row with tgenabled = 'O' (enabled)

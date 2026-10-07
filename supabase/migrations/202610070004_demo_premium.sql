-- The project owner explicitly enabled a simulated checkout. Demo access is a
-- separate entitlement: it never creates a payment, order, or revenue record.
alter table public.profiles add column demo_premium boolean not null default false;
-- The existing column-level profile UPDATE grant excludes this new column.
revoke update(demo_premium) on public.profiles from public, anon, authenticated;

create table public.demo_premium_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true
);
insert into public.demo_premium_settings(singleton, enabled) values(true, true);
alter table public.demo_premium_settings enable row level security;
revoke all on public.demo_premium_settings from public, anon, authenticated;

-- Administrators can disable this demo at the database level without touching
-- real purchases. A browser may read only the public availability flag.
create function public.demo_premium_available() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.demo_premium_settings where singleton), false)
$$;
revoke all on function public.demo_premium_available() from public;
grant execute on function public.demo_premium_available() to anon, authenticated;

create or replace function public.has_premium() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.auth_user_id = (select auth.uid()) and (
    p.is_premium or (p.demo_premium and public.demo_premium_available())
    or exists(select 1 from public.billing_orders b where b.user_id=p.id
      and b.status='paid' and b.revoked_at is null and b.starts_at<=now() and b.expires_at>now())
  ))
$$;

create or replace function public.premium_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_premium', p.is_premium or (p.demo_premium and demo.enabled) or paid.expires_at is not null,
    'manual_premium', p.is_premium,
    'demo_premium', p.demo_premium,
    'demo_enabled', demo.enabled,
    'can_cancel', p.is_premium or p.demo_premium,
    'plan', case when p.is_premium then 'premium'
      when paid.expires_at is not null then 'premium_30_days'
      when p.demo_premium and demo.enabled then 'premium_demo' else null end,
    'status', case when p.is_premium or (p.demo_premium and demo.enabled) or paid.expires_at is not null then 'active' else 'free' end,
    'source', case when p.is_premium then 'manual' when paid.expires_at is not null then 'purchase'
      when p.demo_premium and demo.enabled then 'demo' else null end,
    'expires_at', case when p.is_premium or (p.demo_premium and demo.enabled) then null else paid.expires_at end,
    'auto_renew', false
  ) from public.profiles p cross join lateral (
    select public.demo_premium_available() as enabled
  ) demo left join lateral (
    select max(b.expires_at) as expires_at from public.billing_orders b
    where b.user_id=p.id and b.status='paid' and b.revoked_at is null and b.expires_at>now()
      and exists(select 1 from public.billing_orders active where active.user_id=p.id
        and active.status='paid' and active.revoked_at is null and active.starts_at<=now() and active.expires_at>now())
  ) paid on true where p.auth_user_id = (select auth.uid())
$$;

-- No account ID or payment details are accepted. Auth.uid() always chooses the
-- caller, and repeated simulated checkouts only set the same boolean to true.
create function public.activate_demo_premium() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to unlock demo Premium' using errcode='42501'; end if;
  if not public.demo_premium_available() then raise exception 'Demo Premium is disabled' using errcode='42501'; end if;
  update public.profiles set demo_premium=true where auth_user_id=(select auth.uid());
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
  return public.premium_status();
end $$;
revoke all on function public.activate_demo_premium() from public, anon;
grant execute on function public.activate_demo_premium() to authenticated;

-- Simulated access can be cancelled and unlocked again at any time. Real paid
-- time is independent and is not erased by cancelling a complimentary/demo grant.
create or replace function public.cancel_premium() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set is_premium=false, demo_premium=false where auth_user_id=(select auth.uid())
$$;

create or replace function public.manager_premium_count() returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_manager() then raise exception 'Manager access required' using errcode='42501'; end if;
  return (select count(*) from public.profiles p where p.is_premium
    or (p.demo_premium and public.demo_premium_available())
    or exists(select 1 from public.billing_orders b where b.user_id=p.id
      and b.status='paid' and b.revoked_at is null and b.starts_at<=now() and b.expires_at>now()));
end $$;

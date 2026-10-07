-- A purchase is a one-time 30-day pass. Manual manager grants stay in
-- profiles.is_premium; billing never changes that column.
create table public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references public.profiles(id) on delete cascade,
  provider_order_id text unique,
  provider_payment_id text unique,
  amount_minor integer not null check (amount_minor between 100 and 10000000),
  currency text not null default 'INR' check (currency = 'INR'),
  duration_days integer not null default 30 check (duration_days = 30),
  status text not null default 'creating' check (status in ('creating', 'created', 'failed', 'paid', 'refunded')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  refunded_amount_minor integer not null default 0 check (refunded_amount_minor between 0 and amount_minor),
  check ((starts_at is null and expires_at is null) or (starts_at is not null and expires_at = starts_at + interval '30 days')),
  check (status <> 'paid' or (provider_payment_id is not null and starts_at is not null and revoked_at is null))
);
create index billing_orders_user_created on public.billing_orders(user_id, created_at desc);
create index billing_orders_entitlement on public.billing_orders(user_id, expires_at) where status = 'paid';
alter table public.billing_orders enable row level security;
create policy billing_orders_read on public.billing_orders for select to authenticated
using (user_id = (select public.current_profile_id()) or (select public.is_manager()));
revoke all on public.billing_orders from public, anon, authenticated, service_role;
grant select on public.billing_orders to authenticated, service_role;

create table public.billing_events (
  event_id text primary key check (char_length(event_id) between 1 and 180),
  order_id uuid not null references public.billing_orders(id) on delete cascade,
  event_type text not null check (event_type in ('captured', 'refunded')),
  processed_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from public, anon, authenticated, service_role;

alter table public.payments add column billing_order_id uuid unique references public.billing_orders(id);
alter table public.payments add column provider_payment_id text unique;
alter table public.payments add column provider text;

-- Even privileged billing code cannot accidentally extend a paid pass by
-- updating its dates or reassign a checkout to another account.
create function public.protect_billing_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.id,new.user_id,new.amount_minor,new.currency,new.duration_days,new.created_at)
     is distinct from row(old.id,old.user_id,old.amount_minor,old.currency,old.duration_days,old.created_at) then
    raise exception 'Checkout ownership and price are immutable' using errcode = '22023';
  end if;
  if old.provider_order_id is not null and new.provider_order_id is distinct from old.provider_order_id then
    raise exception 'Provider order is immutable' using errcode = '22023';
  end if;
  if old.provider_payment_id is not null and new.provider_payment_id is distinct from old.provider_payment_id then
    raise exception 'Provider payment is immutable' using errcode = '22023';
  end if;
  if old.expires_at is not null and row(new.starts_at,new.expires_at,new.activated_at)
     is distinct from row(old.starts_at,old.expires_at,old.activated_at) then
    raise exception 'Purchased access dates are immutable' using errcode = '22023';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'Refund revocation is permanent' using errcode = '22023';
  end if;
  if new.refunded_amount_minor < old.refunded_amount_minor then
    raise exception 'Refund amount cannot decrease' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger protect_billing_order before update on public.billing_orders
for each row execute function public.protect_billing_order();
revoke all on function public.protect_billing_order() from public;

create or replace function public.has_premium() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.auth_user_id = (select auth.uid()) and (
    p.is_premium or exists(select 1 from public.billing_orders b where b.user_id=p.id
      and b.status='paid' and b.revoked_at is null and b.starts_at<=now() and b.expires_at>now())
  ))
$$;

create function public.premium_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_premium', p.is_premium or paid.expires_at is not null,
    'manual_premium', p.is_premium,
    'plan', case when p.is_premium then 'premium' when paid.expires_at is not null then 'premium_30_days' else null end,
    'status', case when p.is_premium or paid.expires_at is not null then 'active' else 'free' end,
    'source', case when p.is_premium then 'manual' when paid.expires_at is not null then 'purchase' else null end,
    'expires_at', case when p.is_premium then null else paid.expires_at end,
    'auto_renew', false
  ) from public.profiles p left join lateral (
    select max(b.expires_at) as expires_at from public.billing_orders b
    where b.user_id=p.id and b.status='paid' and b.revoked_at is null
      -- Future consecutive renewal passes are included in the displayed end.
      and b.expires_at>now()
      and exists(select 1 from public.billing_orders active where active.user_id=p.id
        and active.status='paid' and active.revoked_at is null and active.starts_at<=now() and active.expires_at>now())
  ) paid on true where p.auth_user_id = (select auth.uid())
$$;

-- Reserve under a per-user lock so retries and concurrent clicks cannot create
-- unbounded provider orders. No browser role may invoke this function.
create function public.billing_reserve_order(target_user_id bigint, checkout_id uuid, price_minor integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare existing public.billing_orders; manual boolean;
begin
  select is_premium into manual from public.profiles where id=target_user_id for update;
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
  if manual then raise exception 'Premium is already granted to this account' using errcode='22023'; end if;
  select * into existing from public.billing_orders where id=checkout_id;
  if found then
    if existing.user_id<>target_user_id then raise exception 'Checkout does not belong to this account' using errcode='42501'; end if;
    return to_jsonb(existing) || jsonb_build_object('reserved',false);
  end if;
  if (select count(*) from public.billing_orders where user_id=target_user_id and created_at>now()-interval '15 minutes')>=5 then
    raise exception 'Too many checkout attempts. Please wait 15 minutes' using errcode='P0001';
  end if;
  insert into public.billing_orders(id,user_id,amount_minor) values(checkout_id,target_user_id,price_minor) returning * into existing;
  return to_jsonb(existing) || jsonb_build_object('reserved',true);
end $$;

create function public.billing_attach_order(checkout_id uuid, razorpay_order_id text) returns public.billing_orders
language plpgsql security definer set search_path = '' as $$
declare result public.billing_orders;
begin
  if razorpay_order_id !~ '^order_[A-Za-z0-9]{1,100}$' then raise exception 'Invalid provider order' using errcode='22023'; end if;
  update public.billing_orders set provider_order_id=razorpay_order_id,status='created'
  where id=checkout_id and status='creating' and provider_order_id is null returning * into result;
  if not found then raise exception 'Checkout is not awaiting an order' using errcode='22023'; end if;
  return result;
end $$;

create function public.billing_fail_order(checkout_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.billing_orders set status='failed' where id=checkout_id and status='creating'
$$;

-- Called only after server signature verification AND an authenticated fetch
-- from Razorpay. Row locks make callback/webhook races and redeliveries atomic.
create function public.billing_apply_payment(
  razorpay_order_id text, razorpay_payment_id text, verified_amount integer,
  verified_currency text, verified_refunded integer, provider_event text
) returns public.billing_orders
language plpgsql security definer set search_path = '' as $$
declare result public.billing_orders; owner_id bigint; previous public.billing_events; start_time timestamptz;
begin
  if razorpay_payment_id !~ '^pay_[A-Za-z0-9]{1,100}$' or char_length(provider_event) not between 1 and 180 then
    raise exception 'Invalid payment identity' using errcode='22023';
  end if;
  select user_id into owner_id from public.billing_orders where provider_order_id=razorpay_order_id;
  if not found then raise exception 'Checkout not found' using errcode='P0002'; end if;
  -- Same lock order for all payments by this user, including different orders.
  perform 1 from public.profiles where id=owner_id for update;
  select * into result from public.billing_orders where provider_order_id=razorpay_order_id for update;
  if verified_amount is distinct from result.amount_minor or verified_currency is distinct from result.currency
     or verified_refunded is null or verified_refunded<0 or verified_refunded>result.amount_minor then
    raise exception 'Payment amount or currency mismatch' using errcode='22023';
  end if;
  if result.provider_payment_id is not null and result.provider_payment_id<>razorpay_payment_id then
    raise exception 'Order already has a different captured payment' using errcode='22023';
  end if;
  select * into previous from public.billing_events where event_id=provider_event;
  if found then
    if previous.order_id<>result.id then raise exception 'Event belongs to another order' using errcode='22023'; end if;
    return result;
  end if;
  if verified_refunded>0 then
    update public.billing_orders set status='refunded',provider_payment_id=razorpay_payment_id,
      revoked_at=coalesce(revoked_at,now()),refunded_amount_minor=greatest(refunded_amount_minor,verified_refunded)
    where id=result.id returning * into result;
  elsif result.revoked_at is null and result.status<>'paid' then
    select greatest(now(),coalesce(max(expires_at),now())) into start_time from public.billing_orders
      where user_id=result.user_id and status='paid' and revoked_at is null;
    update public.billing_orders set status='paid',provider_payment_id=razorpay_payment_id,activated_at=now(),
      starts_at=start_time,expires_at=start_time+interval '30 days'
    where id=result.id returning * into result;
  end if;
  insert into public.payments(user_id,plan,amount,currency,status,provider_event_id,billing_order_id,provider_payment_id,provider)
  values(result.user_id,'premium_30_days',result.amount_minor::numeric/100,result.currency,
    case when result.revoked_at is null then 'success' else 'refunded' end,
    provider_event,result.id,razorpay_payment_id,'razorpay')
  on conflict(billing_order_id) do update set status=excluded.status;
  insert into public.billing_events(event_id,order_id,event_type)
  values(provider_event,result.id,case when result.revoked_at is null then 'captured' else 'refunded' end);
  return result;
end $$;

-- Existing cancellation only removes a complimentary grant; purchased days
-- remain intact and require no cancellation because they never auto-renew.
create or replace function public.cancel_premium() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set is_premium=false where auth_user_id=(select auth.uid())
$$;

create function public.manager_premium_count() returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_manager() then raise exception 'Manager access required' using errcode='42501'; end if;
  return (select count(*) from public.profiles p where p.is_premium or exists(select 1 from public.billing_orders b
    where b.user_id=p.id and b.status='paid' and b.revoked_at is null and b.starts_at<=now() and b.expires_at>now()));
end $$;

revoke all on function public.premium_status(), public.manager_premium_count() from public;
grant execute on function public.premium_status(), public.manager_premium_count() to authenticated;
revoke all on function public.billing_reserve_order(bigint,uuid,integer), public.billing_attach_order(uuid,text),
  public.billing_fail_order(uuid), public.billing_apply_payment(text,text,integer,text,integer,text) from public, anon, authenticated;
grant execute on function public.billing_reserve_order(bigint,uuid,integer), public.billing_attach_order(uuid,text),
  public.billing_fail_order(uuid), public.billing_apply_payment(text,text,integer,text,integer,text) to service_role;

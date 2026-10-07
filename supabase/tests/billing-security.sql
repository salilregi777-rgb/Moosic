begin;
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000001','billing-a@example.test','{"username":"billing_a"}'),
('20000000-0000-4000-8000-000000000002','billing-b@example.test','{"username":"billing_b"}');
select public.billing_reserve_order((select id from public.profiles where username='billing_a'),'aaaaaaaa-0000-4000-8000-000000000001',29900);
select public.billing_attach_order('aaaaaaaa-0000-4000-8000-000000000001','order_example');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.billing_orders) then raise exception 'FAIL: another user can read orders'; end if;
  begin
    perform public.billing_apply_payment('order_example','pay_example',29900,'INR',0,'forged');
    raise exception 'FAIL: listener can grant paid access';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.billing_orders(user_id,amount_minor) values(public.current_profile_id(),100);
    raise exception 'FAIL: listener can create server-owned order';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  begin
    perform public.billing_apply_payment('order_example','pay_example',1,'INR',0,'wrong_amount');
    raise exception 'FAIL: wrong amount accepted';
  exception when invalid_parameter_value then null; end;
end $$;
set local role service_role;
select public.billing_apply_payment('order_example','pay_example',29900,'INR',0,'webhook:first');
select public.billing_apply_payment('order_example','pay_example',29900,'INR',0,'webhook:first');
select public.billing_apply_payment('order_example','pay_example',29900,'INR',0,'verify:first');
reset role;
do $$ begin
  if (select count(*) from public.payments where provider_payment_id='pay_example')<>1 then raise exception 'FAIL: duplicate payment record'; end if;
  if (select expires_at-starts_at from public.billing_orders where provider_order_id='order_example')<>interval '30 days' then raise exception 'FAIL: duplicate event extended pass'; end if;
  if (select is_premium from public.profiles where username='billing_a') then raise exception 'FAIL: purchase overwrote manual grant'; end if;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
  if not public.has_premium() then raise exception 'FAIL: verified purchase missing entitlement'; end if;
  perform public.cancel_premium();
  if not public.has_premium() then raise exception 'FAIL: cancel removed already-paid time'; end if;
end $$;
reset role;
set local role service_role;
select public.billing_apply_payment('order_example','pay_example',29900,'INR',29900,'webhook:refund');
select public.billing_apply_payment('order_example','pay_example',29900,'INR',0,'late_capture');
reset role;
set local role authenticated;
do $$ begin if public.has_premium() then raise exception 'FAIL: refund did not revoke pass or late capture resurrected it'; end if; end $$;
reset role;
insert into public.billing_orders(id,user_id,provider_order_id,provider_payment_id,amount_minor,status,starts_at,expires_at)
values('aaaaaaaa-0000-4000-8000-000000000002',(select id from public.profiles where username='billing_b'),'order_expired','pay_expired',29900,'paid',now()-interval '35 days',now()-interval '5 days');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin if public.has_premium() then raise exception 'FAIL: expired pass is still active'; end if; end $$;
reset role;
rollback;

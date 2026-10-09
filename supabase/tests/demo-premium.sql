begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','demo-a@example.test','{"username":"demo_a"}'),
 ('30000000-0000-4000-8000-000000000002','demo-b@example.test','{"username":"demo_b"}');
set local role anon;
do $$ begin
 if not public.demo_premium_available() then raise exception 'FAIL: demo availability missing'; end if;
 begin perform public.activate_demo_premium(); raise exception 'FAIL: anonymous activation allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if public.has_premium() then raise exception 'FAIL: new user already premium'; end if;
 begin update public.profiles set demo_premium=true; raise exception 'FAIL: direct flag edit allowed'; exception when insufficient_privilege then null; end;
 perform public.activate_demo_premium();
 perform public.activate_demo_premium();
 if not public.has_premium() then raise exception 'FAIL: demo did not unlock gates'; end if;
 if public.premium_status()->>'source'<>'demo' or public.premium_status()->>'can_cancel'<>'true' then raise exception 'FAIL: demo status or cancellation missing'; end if;
 if exists(select 1 from public.payments) then raise exception 'FAIL: demo created fake revenue'; end if;
 perform public.cancel_premium();
 if public.has_premium() then raise exception 'FAIL: demo cancellation failed'; end if;
 perform public.activate_demo_premium();
 if not public.has_premium() then raise exception 'FAIL: demo cannot be unlocked again'; end if;
end $$;
reset role;
do $$ begin
 if (select demo_premium from public.profiles where username='demo_b') then raise exception 'FAIL: other user gained demo access'; end if;
end $$;
update public.demo_premium_settings set enabled=false;
set local role authenticated;
do $$ begin
 if public.has_premium() then raise exception 'FAIL: disabled demo still unlocks gates'; end if;
 begin perform public.activate_demo_premium(); raise exception 'FAIL: disabled demo allowed activation'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

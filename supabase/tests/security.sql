-- Run after migrations in a disposable Supabase DB (or the PGlite harness).
-- These fixture users and data are rolled back, including if an assertion fails.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001','security-a@example.test','{"name":"A","username":"security_a","role":"manager","is_premium":true}'),
  ('10000000-0000-4000-8000-000000000002','security-b@example.test','{"name":"B","username":"security_b"}'),
  ('10000000-0000-4000-8000-000000000003','security-manager@example.test','{"name":"Manager","username":"security_manager"}');
update public.profiles set role = 'manager' where email = 'security-manager@example.test';
insert into public.artists(id,name) values (900000001,'Security fixture artist');
insert into public.songs(id,title,artist_id,audio_url) values
  (900000001,'Security fixture song A',900000001,'https://example.test/a.mp3'),
  (900000002,'Security fixture song B',900000001,'https://example.test/b.mp3'),
  (900000003,'Security fixture streaming song',900000001,'https://www.youtube.com/watch?v=JGwWNGJdvx8');
insert into public.playlists(id,user_id,name) values
  (900000001,(select id from public.profiles where username='security_a'),'A private playlist'),
  (900000002,(select id from public.profiles where username='security_b'),'B private playlist');
insert into public.playlist_songs(playlist_id,song_id,position) values
  (900000001,900000001,0),(900000001,900000002,1),(900000002,900000001,0);
insert into public.payments(user_id,plan,amount,currency,status)
values ((select id from public.profiles where username='security_b'),'premium',1,'USD','success');

do $$ begin
  if exists(select 1 from public.profiles where username='security_a' and (role<>'user' or is_premium)) then
    raise exception 'FAIL: signup metadata escalated privileges';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','artists','albums','songs','playlists','playlist_songs','liked_songs','downloads','listening_history','playback_states','queue_items','payments') and not c.relrowsecurity) then
    raise exception 'FAIL: application table missing RLS';
  end if;
end $$;

set local role anon;
do $$ begin
  if not exists(select 1 from public.songs where id=900000001) then raise exception 'FAIL: anonymous catalog read blocked'; end if;
  begin
    perform 1 from public.profiles;
    raise exception 'FAIL: anonymous profile read permitted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.artists(name) values('Forbidden anonymous artist');
    raise exception 'FAIL: anonymous catalog write permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if public.is_manager() then raise exception 'FAIL: regular user has manager role'; end if;
  if (select count(*) from public.profiles)<>1 then raise exception 'FAIL: regular user sees other profiles'; end if;
  if exists(select 1 from public.playlists where id=900000002) then raise exception 'FAIL: cross-user playlist visible'; end if;
  if exists(select 1 from public.playlist_songs where playlist_id=900000002) then raise exception 'FAIL: cross-user playlist content visible'; end if;
  if exists(select 1 from public.payments) then raise exception 'FAIL: other user payment visible'; end if;
  update public.profiles set profile_note='Own profile update works' where id=public.current_profile_id();
  if not exists(select 1 from public.profiles where profile_note='Own profile update works') then raise exception 'FAIL: own profile update failed'; end if;
  begin
    update public.profiles set role='manager' where id=public.current_profile_id();
    raise exception 'FAIL: user can promote self';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set is_premium=true where id=public.current_profile_id();
    raise exception 'FAIL: user can grant self premium';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set auth_user_id='10000000-0000-4000-8000-000000000002' where id=public.current_profile_id();
    raise exception 'FAIL: user can reassign identity';
  exception when insufficient_privilege then null; end;
  begin
    perform public.manager_set_premium(public.current_profile_id(),true);
    raise exception 'FAIL: manager RPC accepts normal user';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.songs(title) values('Forbidden song');
    raise exception 'FAIL: normal user can write catalog';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.playlist_songs(playlist_id,song_id) values(900000002,900000002);
    raise exception 'FAIL: normal user can alter other playlist';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.downloads(user_id,song_id) values(public.current_profile_id(),900000001);
    raise exception 'FAIL: free user can add premium download';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.payments(user_id,plan,amount,currency,status) values(public.current_profile_id(),'premium',1,'USD','success');
    raise exception 'FAIL: client can fabricate payment';
  exception when insufficient_privilege then null; end;
  perform public.reorder_playlist(900000001,array[900000002,900000001]::bigint[]);
  if not exists(select 1 from public.playlist_songs where playlist_id=900000001 and song_id=900000002 and position=0) then raise exception 'FAIL: reorder failed'; end if;
  begin
    perform public.reorder_playlist(900000001,array[900000001,900000001]::bigint[]);
    raise exception 'FAIL: duplicate reorder accepted';
  exception when invalid_parameter_value then null; end;
  if not exists(select 1 from public.playlist_songs where playlist_id=900000001 and song_id=900000002 and position=0) then raise exception 'FAIL: invalid reorder changed data'; end if;
  begin
    perform public.reorder_playlist(900000002,array[900000001]::bigint[]);
    raise exception 'FAIL: cross-owner reorder accepted';
  exception when no_data_found then null; end;
  insert into public.liked_songs(user_id,song_id) values(public.current_profile_id(),900000001);
  insert into public.listening_history(user_id,song_id,progress_seconds) values(public.current_profile_id(),900000001,30);
  insert into public.playback_states(user_id,song_id) values(public.current_profile_id(),900000001);
  perform public.append_queue(900000001);
  perform public.append_queue(900000002);
  if (select array_agg(position order by position) from public.queue_items where user_id=public.current_profile_id())<>array[0,1] then raise exception 'FAIL: queue order invalid'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.liked_songs) then raise exception 'FAIL: other likes visible'; end if;
  if exists(select 1 from public.listening_history) then raise exception 'FAIL: other history visible'; end if;
  if exists(select 1 from public.playback_states) then raise exception 'FAIL: other playback visible'; end if;
  if exists(select 1 from public.queue_items) then raise exception 'FAIL: other queue visible'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if not public.is_manager() then raise exception 'FAIL: manager role not recognized'; end if;
  if not exists(select 1 from public.profiles where username='security_a') then raise exception 'FAIL: manager cannot list users'; end if;
  perform public.manager_set_premium((select id from public.profiles where username='security_a'),true);
  if not exists(select 1 from public.profiles where username='security_a' and is_premium) then raise exception 'FAIL: manager entitlement update failed'; end if;
  if exists(select 1 from public.playlists where id=900000001) then raise exception 'FAIL: manager sees private listener playlist'; end if;
  insert into public.songs(title,artist_id) values('Manager created song',900000001);
  if not exists(select 1 from public.payments where status='success') then raise exception 'FAIL: manager cannot read billing'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  insert into public.downloads(user_id,song_id) values(public.current_profile_id(),900000001);
  insert into public.downloads(user_id,song_id) values(public.current_profile_id(),900000003)
    on conflict(user_id,song_id) do update set song_id=excluded.song_id;
  insert into public.downloads(user_id,song_id) values(public.current_profile_id(),900000003)
    on conflict(user_id,song_id) do update set song_id=excluded.song_id;
  if (select count(*) from public.downloads where song_id=900000003)<>1 then raise exception 'FAIL: saved streaming track duplicated'; end if;
  if not exists(select 1 from public.downloads d join public.songs s on s.id=d.song_id where s.audio_url='https://www.youtube.com/watch?v=JGwWNGJdvx8') then raise exception 'FAIL: saved stream source unavailable'; end if;
  delete from public.downloads where song_id=900000003;
  if exists(select 1 from public.downloads where song_id=900000003) then raise exception 'FAIL: saved streaming track removal failed'; end if;
  perform public.cancel_premium();
  if public.has_premium() then raise exception 'FAIL: cancellation did not revoke entitlement'; end if;
  if exists(select 1 from public.downloads) then raise exception 'FAIL: downloads accessible after cancellation'; end if;
end $$;
reset role;
rollback;

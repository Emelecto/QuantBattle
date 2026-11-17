-- Exercise the actual signup trigger; all technical identities roll back.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a0410000-0000-4000-8000-000000000001','authenticated','authenticated','signup-collision@example.invalid','{"username":"signup_chosen_a","display_name":"Technical signup A"}');
do $$ begin
 if (select username from public.profiles where id='a0410000-0000-4000-8000-000000000001') <> 'signup_chosen_a' then
  raise exception 'Signup ignored the requested username';
 end if;
end $$;
-- Different email domains can share a local part without breaking registration.
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a0410000-0000-4000-8000-000000000002','authenticated','authenticated','signup-collision@other.invalid','{"username":"signup_chosen_b"}'),
 ('a0410000-0000-4000-8000-000000000003','authenticated','authenticated','signup-case@example.invalid','{"username":"SIGNUP_CHOSEN_A"}'),
 ('a0410000-0000-4000-8000-000000000004','authenticated','authenticated','signup-bad@example.invalid','{"username":"invalid alias!"}'),
 ('a0410000-0000-4000-8000-000000000005','authenticated','authenticated','signup-missing@example.invalid','{}');
do $$ begin
 if (select username from public.profiles where id='a0410000-0000-4000-8000-000000000002') <> 'signup_chosen_b' then
  raise exception 'An email local-part collision changed the chosen username';
 end if;
 if (select count(distinct lower(username)) from public.profiles where id::text like 'a0410000-%') <> 5 then
  raise exception 'Signup did not allocate unique profile names';
 end if;
 if exists(select 1 from public.profiles where id::text like 'a0410000-%' and username !~ '^[A-Za-z0-9_.-]{3,20}$') then
  raise exception 'Signup allocated an invalid profile name';
 end if;
 if (select display_name from public.profiles where id='a0410000-0000-4000-8000-000000000001') <> 'Technical signup A' then
  raise exception 'Signup lost the display name';
 end if;
end $$;
rollback;

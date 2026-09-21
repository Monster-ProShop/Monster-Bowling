-- Monster Bowling only. Apply to the independent Neon project, with Neon Auth
-- and the Data API already enabled. No ProShop tables are referenced.
create table public.bowling_competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('league','tournament')),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create table public.bowling_memberships (
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (competition_id,user_id)
);
create table public.bowling_competition_state (
  competition_id uuid primary key references public.bowling_competitions(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.bowling_results (
  competition_id uuid primary key references public.bowling_competitions(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.bowling_personal_results (
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  email text not null check (email = lower(email)),
  data jsonb not null,
  primary key (competition_id,email)
);

create schema bowling_private;
create function bowling_private.current_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select nullif(auth.user_id(),'')::uuid;
$$;
create function bowling_private.current_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from neon_auth."user" u
  where u.id = (select bowling_private.current_user_id()) and u."emailVerified" = true;
$$;
create function bowling_private.verified_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select bowling_private.current_email()) is not null;
$$;
create function bowling_private.is_registered(p_competition_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bowling_personal_results p
    where p.competition_id = p_competition_id
      and p.email = (select bowling_private.current_email())
  );
$$;
create function bowling_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select bowling_private.current_email()) = 'monsterproshop@outlook.com',false);
$$;
revoke all on schema bowling_private from public;
revoke all on function bowling_private.current_user_id() from public;
revoke all on function bowling_private.current_email() from public;
revoke all on function bowling_private.verified_user() from public;
revoke all on function bowling_private.is_registered(uuid) from public;
revoke all on function bowling_private.is_admin() from public;
grant usage on schema bowling_private to authenticated;
grant execute on function bowling_private.current_user_id(),
  bowling_private.current_email(), bowling_private.verified_user(),
  bowling_private.is_registered(uuid),
  bowling_private.is_admin() to authenticated;

alter table public.bowling_competitions enable row level security;
alter table public.bowling_memberships enable row level security;
alter table public.bowling_competition_state enable row level security;
alter table public.bowling_results enable row level security;
alter table public.bowling_personal_results enable row level security;
revoke all on public.bowling_competitions,public.bowling_memberships,
  public.bowling_competition_state,public.bowling_results,
  public.bowling_personal_results from anonymous,authenticated;
grant usage on schema public to anonymous,authenticated;
grant select on public.bowling_competitions to anonymous,authenticated;
grant insert,update on public.bowling_competitions to authenticated;
grant select,insert on public.bowling_memberships to authenticated;
grant select on public.bowling_competition_state,
  public.bowling_results,public.bowling_personal_results to authenticated;

create policy "Published competitions are listed" on public.bowling_competitions
  for select to anonymous,authenticated using (status = 'open');
create policy "Admin sees all competitions" on public.bowling_competitions
  for select to authenticated using ((select bowling_private.is_admin()));
create policy "Admin creates competitions" on public.bowling_competitions
  for insert to authenticated with check ((select bowling_private.is_admin()));
create policy "Admin updates competitions" on public.bowling_competitions
  for update to authenticated using ((select bowling_private.is_admin()))
  with check ((select bowling_private.is_admin()));
create policy "Members see their own memberships" on public.bowling_memberships
  for select to authenticated using (
    user_id = (select bowling_private.current_user_id()) or (select bowling_private.is_admin())
  );
create policy "Members join open competitions" on public.bowling_memberships
  for insert to authenticated with check (
    user_id = (select bowling_private.current_user_id())
    and (select bowling_private.verified_user())
    and (select bowling_private.is_registered(competition_id)) and exists (
      select 1 from public.bowling_competitions c
      where c.id = competition_id and c.status = 'open'
    )
  );
create policy "Admin reads state" on public.bowling_competition_state
  for select to authenticated using ((select bowling_private.is_admin()));
create policy "Joined members read event results" on public.bowling_results
  for select to authenticated using (
    (select bowling_private.is_admin()) or exists (
      select 1 from public.bowling_memberships m
      where m.competition_id = bowling_results.competition_id
        and m.user_id = (select bowling_private.current_user_id())
    )
  );
create policy "Users read only their own finances" on public.bowling_personal_results
  for select to authenticated using (
    (select bowling_private.is_admin()) or
    (email = (select bowling_private.current_email()) and exists (
      select 1 from public.bowling_memberships m
      where m.competition_id = bowling_personal_results.competition_id
        and m.user_id = (select bowling_private.current_user_id())
    ))
  );

create function public.bowling_save_competition(
  p_competition_id uuid,p_state jsonb,p_results jsonb,p_personal jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not bowling_private.is_admin() then
    raise exception 'Only the confirmed administrator can save competitions';
  end if;
  if not exists (select 1 from public.bowling_competitions where id = p_competition_id) then
    raise exception 'Competition does not exist';
  end if;
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_results) <> 'object'
     or jsonb_typeof(p_personal) <> 'array' then
    raise exception 'Invalid competition data';
  end if;
  insert into public.bowling_competition_state (competition_id,data,updated_at)
    values (p_competition_id,p_state,now())
    on conflict (competition_id) do update set data = excluded.data,updated_at = now();
  insert into public.bowling_results (competition_id,data,updated_at)
    values (p_competition_id,p_results,now())
    on conflict (competition_id) do update set data = excluded.data,updated_at = now();
  delete from public.bowling_personal_results where competition_id = p_competition_id;
  insert into public.bowling_personal_results (competition_id,email,data)
    select p_competition_id,lower(trim(x->>'email')),x->'data'
    from jsonb_array_elements(p_personal) x
    where x ? 'email' and x ? 'data' and trim(x->>'email') <> '';
end;
$$;
revoke all on function public.bowling_save_competition(uuid,jsonb,jsonb,jsonb) from public,anonymous;
grant execute on function public.bowling_save_competition(uuid,jsonb,jsonb,jsonb) to authenticated;

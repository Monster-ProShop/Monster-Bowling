-- Account capabilities, permanent rosters, profile claims, import history,
-- competition ownership/location and six-month bracket-detail retention.
alter table public.bowling_competitions add column if not exists format text not null default 'traditional';
alter table public.bowling_competitions add column if not exists owner_user_id uuid;
alter table public.bowling_competitions add column if not exists manager_name text;
alter table public.bowling_competitions add column if not exists manager_email text;
alter table public.bowling_competitions add column if not exists country text;
alter table public.bowling_competitions add column if not exists region text;
alter table public.bowling_competitions add column if not exists city text;
alter table public.bowling_competitions add column if not exists bowling_center text;
alter table public.bowling_competitions add column if not exists updated_at timestamptz not null default now();
alter table public.bowling_competitions drop constraint if exists bowling_competitions_format_check;
alter table public.bowling_competitions add constraint bowling_competitions_format_check
  check(format in ('traditional','delarosa'));
update public.bowling_competitions c set format='delarosa'
where lower(c.name)='de la rosa masters' or exists(select 1 from public.bowling_competition_state s where s.competition_id=c.id and s.data->>'format'='delarosa-masters-v1');
update public.bowling_competitions c set owner_user_id=u.id,manager_email=lower(u.email),manager_name=coalesce(c.manager_name,'Monster ProShop')
from neon_auth."user" u where c.owner_user_id is null and lower(u.email)='monsterproshop@outlook.com';

create table if not exists public.bowling_roster_profiles (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  membership_number text,
  name text not null check(length(trim(name)) between 1 and 120),
  email text,
  handicap integer not null default 0 check(handicap between 0 and 300),
  active boolean not null default true,
  claimed_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(competition_id,id),
  unique(competition_id,membership_number),
  unique(competition_id,claimed_user_id)
);
create unique index if not exists bowling_roster_profile_email_unique
  on public.bowling_roster_profiles(competition_id,lower(email)) where email is not null and trim(email)<>'';
create index if not exists bowling_roster_profile_name_idx
  on public.bowling_roster_profiles(competition_id,lower(name));

create table if not exists public.bowling_roster_imports (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  imported_by uuid not null,
  file_name text,
  summary jsonb not null default '{}'::jsonb,
  before_snapshot jsonb not null,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bowling_session_archives add column if not exists bracket_details_purged_at timestamptz;
alter table public.bowling_session_archives add column if not exists retained_summary jsonb;

alter table public.bowling_roster_profiles enable row level security;
alter table public.bowling_roster_imports enable row level security;
revoke all on public.bowling_roster_profiles,public.bowling_roster_imports from public,anonymous,authenticated;

-- Preserve every financial/result field while removing bulky bracket graphics and
-- temporary selections after six months. This is safe to call repeatedly.
create or replace function public.bowling_cleanup_old_bracket_details() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  update public.bowling_session_archives
  set retained_summary=coalesce(retained_summary,jsonb_build_object(
        'label',label,'date',session_date,'bowlers',state->'bowlers','scores',results->'bowlers',
        'awards',results->'awards','summary',results->'summary','personal',personal)),
      state=(state-'brackets'-'generated'),
      results=(results-'brackets'-'matchups'-'standings'),
      bracket_details_purged_at=now()
  where session_date < current_date-interval '6 months' and bracket_details_purged_at is null;
  get diagnostics affected=row_count;
  delete from public.bowling_notification_subscriptions where event_date < current_date-interval '6 months';
  return affected;
end $$;
revoke all on function public.bowling_cleanup_old_bracket_details() from public,anonymous,authenticated;

-- Backfill permanent profiles from current rosters without altering session history.
insert into public.bowling_roster_profiles(id,competition_id,name,email,handicap,active)
select case when (b->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       then (b->>'id')::uuid else gen_random_uuid() end,
       s.competition_id,b->>'name',nullif(lower(trim(b->>'email')),''),coalesce(nullif(b->>'handicap','')::int,0),true
from public.bowling_competition_state s cross join lateral jsonb_array_elements(coalesce(s.data->'bowlers','[]')) b
where coalesce(trim(b->>'name'),'')<>''
on conflict do nothing;

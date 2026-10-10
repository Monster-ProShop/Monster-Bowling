begin;
alter table public.bowling_league_sessions add column if not exists status text not null default 'scheduled' check(status in ('scheduled','open','completed','finalized'));
alter table public.bowling_league_configurations add column if not exists connection_code text unique;
create table if not exists public.bowling_league_teams(
 id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
 team_number integer not null, name text not null, division text not null default '', captain_profile_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(competition_id,team_number),unique(competition_id,id)
);
create table if not exists public.bowling_league_team_members(
 competition_id uuid not null, team_id uuid not null, profile_id uuid not null, roster_role text not null check(roster_role in ('active','substitute')),
 bowler_division text not null default '', entering_average integer not null default 0 check(entering_average between 0 and 300), joined_at timestamptz not null default now(), left_at timestamptz,
 primary key(competition_id,team_id,profile_id), foreign key(competition_id,team_id) references public.bowling_league_teams(competition_id,id) on delete cascade,
 foreign key(competition_id,profile_id) references public.bowling_roster_profiles(competition_id,id)
);
create unique index if not exists bowling_active_league_team_member on public.bowling_league_team_members(competition_id,profile_id) where left_at is null;
create table if not exists public.bowling_league_score_edits(
 id bigserial primary key,competition_id uuid not null,session_id uuid not null,profile_id uuid not null,game_number integer not null,
 previous_scratch integer,new_scratch integer not null,reason text not null default '',changed_by uuid not null,changed_at timestamptz not null default now()
);
alter table public.bowling_league_teams enable row level security;
alter table public.bowling_league_team_members enable row level security;
alter table public.bowling_league_score_edits enable row level security;
revoke all on public.bowling_league_teams,public.bowling_league_team_members,public.bowling_league_score_edits from public,anonymous,authenticated;
commit;

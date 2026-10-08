-- Shared league sessions for Tournaments by ProDrillOS. Apply after 005.
-- Existing competitions, locations, accounts and roster identities are reused.
begin;
create table if not exists public.bowling_league_sessions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  label text not null check(length(trim(label)) between 1 and 120),
  session_date date not null,
  state jsonb not null default '{"config":{"totalGames":3},"teams":[],"matches":[]}'::jsonb,
  revision integer not null default 0,
  brackets_linked boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(competition_id,id)
);
create unique index if not exists bowling_one_linked_session
  on public.bowling_league_sessions(competition_id) where brackets_linked;
create index if not exists bowling_league_session_date
  on public.bowling_league_sessions(competition_id,session_date desc);
create table if not exists public.bowling_league_games (
  competition_id uuid not null,
  session_id uuid not null,
  profile_id uuid not null,
  game_number integer not null check(game_number between 1 and 24),
  scratch integer not null check(scratch between 0 and 300),
  source text not null check(source in ('league','brackets')),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key(session_id,profile_id,game_number),
  foreign key(competition_id,session_id) references public.bowling_league_sessions(competition_id,id) on delete cascade,
  foreign key(competition_id,profile_id) references public.bowling_roster_profiles(competition_id,id)
);
alter table public.bowling_league_sessions enable row level security;
alter table public.bowling_league_games enable row level security;
revoke all on public.bowling_league_sessions,public.bowling_league_games from public,anonymous,authenticated;
commit;

begin;
create table if not exists public.bowling_league_configurations (
  competition_id uuid primary key references public.bowling_competitions(id) on delete cascade,
  configuration jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bowling_league_sessions add column if not exists week_number integer;
alter table public.bowling_league_sessions add column if not exists position_round boolean not null default false;
create unique index if not exists bowling_league_week_number on public.bowling_league_sessions(competition_id,week_number) where week_number is not null;
alter table public.bowling_league_configurations enable row level security;
revoke all on public.bowling_league_configurations from public,anonymous,authenticated;
commit;

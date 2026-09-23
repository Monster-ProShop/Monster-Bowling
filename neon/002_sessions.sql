create table if not exists public.bowling_session_archives (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 120),
  session_date date not null,
  state jsonb not null,
  results jsonb not null,
  personal jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bowling_session_archives_competition_date_idx
  on public.bowling_session_archives (competition_id,session_date desc);
alter table public.bowling_session_archives enable row level security;
revoke all on public.bowling_session_archives from anonymous,authenticated;
create table if not exists public.bowling_notification_subscriptions (
  endpoint text primary key,
  user_id uuid not null,
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  bowler_id text not null,
  event_date date not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bowling_notification_lookup_idx
  on public.bowling_notification_subscriptions (competition_id,event_date,bowler_id);
alter table public.bowling_notification_subscriptions enable row level security;
revoke all on public.bowling_notification_subscriptions from anonymous,authenticated;

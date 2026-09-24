create table if not exists public.bowling_user_bowler_links (
  user_id uuid not null,
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  bowler_id text not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,competition_id)
);
alter table public.bowling_user_bowler_links enable row level security;
revoke all on public.bowling_user_bowler_links from anonymous,authenticated;

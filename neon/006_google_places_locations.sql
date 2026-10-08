alter table public.bowling_competitions add column if not exists formatted_address text;
alter table public.bowling_competitions add column if not exists google_place_id text;
alter table public.bowling_competitions add column if not exists latitude double precision;
alter table public.bowling_competitions add column if not exists longitude double precision;

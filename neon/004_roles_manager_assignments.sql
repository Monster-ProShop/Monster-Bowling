create table if not exists public.bowling_user_roles (
  user_id uuid primary key,
  role text not null default 'user' check (role in ('user','manager','superadmin')),
  updated_at timestamptz not null default now()
);

create table if not exists public.bowling_manager_assignments (
  user_id uuid not null,
  competition_id uuid not null references public.bowling_competitions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id,competition_id)
);

alter table public.bowling_user_roles enable row level security;
alter table public.bowling_manager_assignments enable row level security;
revoke all on public.bowling_user_roles,public.bowling_manager_assignments from public,anonymous,authenticated;

insert into public.bowling_user_roles(user_id,role)
select id,'superadmin' from neon_auth."user" where lower(email)='monsterproshop@outlook.com'
on conflict(user_id) do update set role='superadmin',updated_at=now();

insert into public.bowling_user_roles(user_id,role)
select id,'manager' from neon_auth."user" where lower(email)='robertoalbarrannse@gmail.com'
on conflict(user_id) do update set role='manager',updated_at=now();

insert into public.bowling_manager_assignments(user_id,competition_id)
select u.id,c.id from neon_auth."user" u cross join public.bowling_competitions c
where lower(u.email)='robertoalbarrannse@gmail.com' and lower(c.name)='noobs'
on conflict do nothing;

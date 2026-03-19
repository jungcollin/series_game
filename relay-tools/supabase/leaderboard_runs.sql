create table if not exists public.leaderboard_runs (
  id bigint generated always as identity primary key,
  run_id text not null unique,
  player_name text not null check (char_length(trim(player_name)) between 2 and 24),
  clear_count integer not null check (clear_count between 0 and 999),
  duration_sec numeric(8,1) not null default 0 check (duration_sec >= 0),
  finished_all_clear boolean not null default false,
  stages text[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists leaderboard_runs_rank_idx
on public.leaderboard_runs (clear_count desc, duration_sec asc, created_at asc);

alter table public.leaderboard_runs enable row level security;

drop policy if exists "Public leaderboard can read runs" on public.leaderboard_runs;
create policy "Public leaderboard can read runs"
on public.leaderboard_runs
for select
to anon, authenticated
using (true);

drop policy if exists "Public leaderboard can insert runs" on public.leaderboard_runs;
create policy "Public leaderboard can insert runs"
on public.leaderboard_runs
for insert
to anon, authenticated
with check (
  char_length(trim(player_name)) between 2 and 24
  and clear_count between 0 and 999
  and duration_sec >= 0
  and coalesce(array_length(stages, 1), 0) <= 32
);

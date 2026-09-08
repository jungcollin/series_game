create table if not exists leaderboard_runs (
  id bigint generated always as identity primary key,
  run_id text not null unique,
  player_name text not null check (char_length(trim(player_name)) between 2 and 24),
  clear_count integer not null check (clear_count between 0 and 999),
  duration_sec numeric(8,1) not null default 0 check (duration_sec >= 0),
  finished_all_clear boolean not null default false,
  stages text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  constraint leaderboard_runs_stages_len check (coalesce(array_length(stages, 1), 0) <= 32)
);

create index if not exists leaderboard_runs_rank_idx
  on leaderboard_runs (clear_count desc, finished_all_clear desc, duration_sec asc, created_at asc);

create table if not exists stage_rankings (
  id bigint generated always as identity primary key,
  stage_id text not null,
  visitor_id text not null,
  player_name text not null check (char_length(trim(player_name)) between 2 and 24),
  duration_sec numeric(8,1) not null check (duration_sec >= 0.1 and duration_sec <= 36000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (stage_id, visitor_id)
);

create index if not exists stage_rankings_leaderboard_idx
  on stage_rankings (stage_id, duration_sec asc);

create table if not exists stage_votes (
  id bigint generated always as identity primary key,
  stage_id text not null,
  visitor_id text not null,
  vote smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default timezone('utc', now()),
  unique (stage_id, visitor_id)
);

create index if not exists stage_votes_stage_id_idx on stage_votes (stage_id);

create table if not exists stage_comments (
  id bigint generated always as identity primary key,
  stage_id text not null,
  visitor_id text not null,
  author_name text not null check (char_length(trim(author_name)) between 1 and 24),
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists stage_comments_stage_idx
  on stage_comments (stage_id, created_at desc);

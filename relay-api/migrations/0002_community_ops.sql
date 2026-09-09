create table if not exists session_revocations (
  subject text not null,
  jti text not null default '',
  revoked_at timestamptz not null default timezone('utc', now()),
  primary key (subject, jti)
);

alter table stage_comments add column if not exists hidden_at timestamptz;
alter table stage_comments add column if not exists hidden_reason text;

create table if not exists content_reports (
  id bigint generated always as identity primary key,
  subject text not null,
  stage_id text not null,
  reason text not null,
  detail text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists content_reports_stage_idx on content_reports (stage_id, created_at desc);

create table if not exists audit_events (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  target text not null,
  detail jsonb not null default '{}',
  request_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  subject text,
  name text not null,
  stage_id text,
  challenge_id text,
  technical boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_events_name_idx on analytics_events (name, created_at desc);
create index if not exists analytics_events_stage_idx on analytics_events (stage_id, name);

create table if not exists challenge_runs (
  id text primary key,
  subject text not null,
  challenge_id text not null,
  stage_ids text[] not null default '{}',
  status text not null,
  clear_count integer not null default 0,
  duration_sec numeric(8,1) not null default 0,
  finished_all_clear boolean not null default false,
  stages text[] not null default '{}',
  event_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  finalized_at timestamptz
);

create unique index if not exists challenge_runs_open_subject_idx
  on challenge_runs (subject, challenge_id)
  where finalized_at is null;

create table if not exists challenge_run_events (
  run_id text not null references challenge_runs(id),
  event_id text not null,
  seq integer not null,
  name text not null,
  payload jsonb not null default '{}',
  payload_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (run_id, event_id)
);

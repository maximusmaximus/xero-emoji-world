create table if not exists world_milestones (
  id text primary key,
  tick integer not null,
  era text not null,
  title text not null,
  summary text not null,
  city jsonb not null,
  created_at timestamptz not null default now()
);

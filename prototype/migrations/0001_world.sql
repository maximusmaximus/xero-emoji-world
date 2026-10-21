create table if not exists world_state (
  id text primary key,
  city jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists world_changes (
  id bigint generated always as identity primary key,
  kind text not null,
  summary text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists book_holds (
  id text primary key,
  qty integer not null check (qty > 0 and qty <= 50),
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

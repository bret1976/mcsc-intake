create table if not exists desk_settings (
  id integer primary key check (id = 1),
  ping_topic text not null,
  ping_email text not null default '',
  ping_on boolean not null default false,
  updated_at timestamptz not null default now()
);

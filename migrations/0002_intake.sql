-- Commodity intake links + submissions (unowned rows — token is the access key)
create table if not exists intake_links (
  id text primary key,
  token text not null unique,
  public_id text not null unique,
  label text not null default '',
  status text not null default 'sent',
  opened_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id text primary key,
  link_id text not null unique references intake_links (id),
  product text not null,
  quantity text not null,
  unit text not null,
  terms text not null,
  payment_terms text not null default '',
  delivery_window text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists intake_links_created_idx on intake_links (created_at desc);

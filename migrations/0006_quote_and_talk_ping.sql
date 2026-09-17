alter table intake_links
  add column if not exists quote_price text not null default '',
  add column if not exists quote_validity text not null default '',
  add column if not exists quote_incoterms text not null default '',
  add column if not exists quote_notes text not null default '',
  add column if not exists quoted_at timestamptz;

alter table desk_settings
  add column if not exists ping_phone text not null default '',
  add column if not exists ping_whatsapp_key text not null default '',
  add column if not exists ping_signal_key text not null default '',
  add column if not exists ping_webhook text not null default '';

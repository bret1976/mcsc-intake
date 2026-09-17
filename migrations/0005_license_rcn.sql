alter table submissions
  add column if not exists business_license text not null default '',
  add column if not exists rcn text not null default '';

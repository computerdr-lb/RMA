-- =====================================================================
-- Computer Doctor — Supabase schema
-- Paste this whole file into: Supabase dashboard > SQL Editor > Run
-- =====================================================================

-- ---------- clients --------------------------------------------------
create table if not exists clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null default '',
  alt_phone  text not null default '',
  email      text not null default '',
  address    text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists clients_phone_idx on clients (phone);
create index if not exists clients_name_idx  on clients (lower(name));

-- ---------- tickets --------------------------------------------------
-- Postgres hands out the ticket number, so two PCs can never take the same one.
create sequence if not exists ticket_seq start 1;

create table if not exists tickets (
  id           uuid primary key default gen_random_uuid(),
  no           text unique not null default 'CD-' || lpad(nextval('ticket_seq')::text, 5, '0'),
  client_id    uuid not null references clients (id) on delete cascade,
  device_type  text not null default '',
  model        text not null default '',
  with_charger boolean not null default false,
  with_bag     boolean not null default false,
  note         text not null default '',
  cost         numeric(10,2) not null default 0,
  status       text not null default 'Received',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create index if not exists tickets_client_idx on tickets (client_id);
create index if not exists tickets_created_idx on tickets (created_at desc);

-- ---------- device types (the combo box list) ------------------------
create table if not exists items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int  not null default 0
);

-- ---------- shop settings (one JSON row) -----------------------------
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- ---------- SECURITY -------------------------------------------------
-- The app runs in a browser, so its Supabase key is public by design.
-- These policies are what actually keep your customer data private:
-- only a signed-in staff account can read or write anything.
alter table clients  enable row level security;
alter table tickets  enable row level security;
alter table items    enable row level security;
alter table settings enable row level security;

drop policy if exists staff_all on clients;
drop policy if exists staff_all on tickets;
drop policy if exists staff_all on items;
drop policy if exists staff_all on settings;

create policy staff_all on clients  for all to authenticated using (true) with check (true);
create policy staff_all on tickets  for all to authenticated using (true) with check (true);
create policy staff_all on items    for all to authenticated using (true) with check (true);
create policy staff_all on settings for all to authenticated using (true) with check (true);

-- ---------- live sync between the two PCs ----------------------------
alter publication supabase_realtime add table tickets;
alter publication supabase_realtime add table clients;

-- ---------- seed the device list -------------------------------------
insert into items (name, sort_order)
select * from (values
  ('Laptop',0), ('Desktop PC',1), ('All-in-One',2), ('Monitor',3), ('Printer',4),
  ('Tablet',5), ('Phone',6), ('Server',7), ('UPS / Battery',8), ('Other',9)
) as v(name, sort_order)
where not exists (select 1 from items);

-- ---------- seed shop settings ---------------------------------------
insert into settings (key, value) values ('app', '{
  "shopName": "Computer Doctor",
  "shopPhone": "+961 1 000 000",
  "shopAddress": "Beirut, Lebanon",
  "terms": "Estimate only; final cost confirmed before repair. Devices left over 60 days may be disposed of. Data backup is the customer''s responsibility.",
  "currency": "$",
  "receiptWidth": 80,
  "labelWidth": 40,
  "labelHeight": 21
}'::jsonb)
on conflict (key) do nothing;

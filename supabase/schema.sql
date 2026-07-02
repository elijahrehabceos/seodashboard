-- CEOs SEO Dashboard schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)

create table if not exists clients (
  slug text primary key,
  clinic_name text not null,
  owner_name text not null,
  domain text not null,
  site_id bigint not null,
  local_falcon_place_id text,
  updated_at timestamptz default now()
);

create table if not exists keyword_rankings (
  id bigserial primary key,
  client_slug text references clients(slug) on delete cascade,
  keyword text not null,
  position int,          -- current position, 0 or null = not ranked
  position_change int,   -- vs previous check
  site_engine_id int,
  checked_date date,
  best_position_week int,   -- best (lowest) position seen so far this week
  week_start date,          -- Monday of the week best_position_week applies to
  updated_at timestamptz default now(),
  unique (client_slug, keyword, site_engine_id)
);

create table if not exists search_engines (
  client_slug text references clients(slug) on delete cascade,
  site_engine_id int not null,
  region_name text,
  updated_at timestamptz default now(),
  primary key (client_slug, site_engine_id)
);

create table if not exists ai_visibility (
  id bigserial primary key,
  client_slug text references clients(slug) on delete cascade,
  engine text not null,        -- chatgpt, gemini, google_ai_overview, etc.
  mentioned boolean default false,
  mention_percent numeric,
  link_percent numeric,
  last_checked date,
  updated_at timestamptz default now(),
  unique (client_slug, engine)
);

create table if not exists local_pack (
  id bigserial primary key,
  client_slug text references clients(slug) on delete cascade,
  keyword text,
  location_label text,     -- e.g. city/market name for multi-location clients
  arp numeric,
  atrp numeric,
  solv numeric,
  heatmap_url text,
  report_key text,
  scan_date date,
  updated_at timestamptz default now(),
  unique (client_slug, keyword, location_label)
);

create table if not exists refresh_log (
  id bigserial primary key,
  ran_at timestamptz default now(),
  status text,       -- success, partial, failed
  details text
);

create table if not exists client_insights (
  client_slug text primary key references clients(slug) on delete cascade,
  blurb text,
  generated_at timestamptz default now()
);

-- Row Level Security: allow public read (dashboard is read-only for the team),
-- writes only happen via the service_role key from the GitHub Action.
alter table clients enable row level security;
alter table keyword_rankings enable row level security;
alter table ai_visibility enable row level security;
alter table local_pack enable row level security;
alter table refresh_log enable row level security;
alter table client_insights enable row level security;
alter table search_engines enable row level security;

create policy "public read clients" on clients for select using (true);
create policy "public read keyword_rankings" on keyword_rankings for select using (true);
create policy "public read ai_visibility" on ai_visibility for select using (true);
create policy "public read local_pack" on local_pack for select using (true);
create policy "public read refresh_log" on refresh_log for select using (true);
create policy "public read client_insights" on client_insights for select using (true);
create policy "public read search_engines" on search_engines for select using (true);

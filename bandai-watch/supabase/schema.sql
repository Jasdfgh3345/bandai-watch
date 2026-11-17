-- BANDAI WATCH 1.1 schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists products (
 id uuid primary key default gen_random_uuid(), name text not null,
 category text not null check(category in ('奥特曼','假面骑士','超级战队','万代其他收藏品')),
 region text not null check(region in ('日本','中国大陆')), price_text text,
 booking_at timestamptz, booking_end_at timestamptz, release_text text,
 status text not null default '监控中', source_name text, source_url text not null,
 source_product_id text, last_checked_at timestamptz, last_snapshot jsonb,
 enabled boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists products_source_unique on products(source_name,source_product_id) where source_product_id is not null;
create table if not exists watchlist(id uuid primary key default gen_random_uuid(),product_id uuid not null references products(id) on delete cascade,created_at timestamptz default now(),unique(product_id));
create table if not exists monitor_events(
 id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade,
 event_type text not null check(event_type in ('booking_soon','booking_open','restock','booking_closed','info_changed')),
 title text not null, detail text, detected_at timestamptz default now(), source_url text,
 dedupe_key text unique, notification_sent_at timestamptz
);
create table if not exists notification_preferences(id uuid primary key default gen_random_uuid(),booking_24h boolean default true,booking_open boolean default true,restock boolean default true,web_push_enabled boolean default false,ios_push_enabled boolean default false,updated_at timestamptz default now());
create table if not exists web_push_subscriptions(
 id uuid primary key default gen_random_uuid(), endpoint text not null unique, keys jsonb not null, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists ios_push_devices(
 id uuid primary key default gen_random_uuid(), device_token text not null unique, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table products enable row level security;
alter table watchlist enable row level security;
alter table monitor_events enable row level security;
alter table notification_preferences enable row level security;
alter table web_push_subscriptions enable row level security;
alter table ios_push_devices enable row level security;
-- Server uses SUPABASE_SERVICE_ROLE_KEY. Keep it server-side only.
-- Before exposing any client-side DB access, add Supabase Auth and owner-scoped RLS policies.

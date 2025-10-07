-- Schema definition for AI Hairdresser Receptionist
create extension if not exists "uuid-ossp";

-- Helper function to expose tenant id from auth JWT custom claim
create or replace function get_auth_tenant_id()
returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id', '')::uuid;
$$;

create table if not exists tenants (
  id uuid primary key,
  name text not null,
  slug text unique not null,
  contact_email text not null,
  contact_phone text,
  settings jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists users (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  role text not null check (role in ('admin','staff','stylist')),
  password_hash text not null,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists clients (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  notes text,
  consent_marketing boolean default false,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists stylists (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  specialties text[] default array[]::text[],
  working_hours jsonb default '[]'::jsonb,
  timezone text,
  color text,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists stylist_rotas (
  tenant_id uuid references tenants(id) on delete cascade,
  stylist_id uuid references stylists(id) on delete cascade,
  rota jsonb not null,
  updated_at timestamp with time zone default timezone('utc', now()),
  primary key (tenant_id, stylist_id)
);

create table if not exists services (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  duration_minutes integer not null,
  price numeric(10,2) not null,
  requires_deposit boolean default false,
  deposit_type text check (deposit_type in ('fixed','percentage')),
  deposit_value numeric(10,2),
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists appointments (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  client_id uuid references clients(id),
  stylist_id uuid references stylists(id),
  service_id uuid references services(id),
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  status text check (status in ('pending','confirmed','cancelled','no_show','completed')) default 'pending',
  notes text,
  deposit_amount numeric(10,2),
  created_by uuid references users(id),
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

-- Multi-tenant bookings table used for external integrations/aggregations
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_name text not null,
  service text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  status text not null check (status in ('pending','confirmed','cancelled','no_show','completed')) default 'pending',
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create index if not exists bookings_tenant_start_idx on bookings (tenant_id, start_time);

create table if not exists messages (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  direction text check (direction in ('inbound','outbound')),
  channel text check (channel in ('sms','whatsapp','voice')),
  provider_message_id text,
  client_id uuid references clients(id),
  payload jsonb not null,
  response text,
  handled_by text check (handled_by in ('ai','human')) default 'ai',
  created_at timestamp with time zone default timezone('utc', now())
);

create table if not exists payment_transactions (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  appointment_id uuid references appointments(id),
  client_id uuid references clients(id),
  stripe_payment_intent_id text,
  amount numeric(10,2) not null,
  currency text default 'gbp',
  status text,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists plans (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  description text,
  monthly_price numeric(10,2),
  currency text default 'gbp',
  grace_period_days integer default 7,
  is_active boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists features (
  code text primary key,
  name text not null,
  description text,
  created_at timestamp with time zone default timezone('utc', now())
);

create table if not exists plan_features (
  plan_id uuid references plans(id) on delete cascade,
  feature_code text references features(code) on delete cascade,
  created_at timestamp with time zone default timezone('utc', now()),
  primary key (plan_id, feature_code)
);

create table if not exists tenant_plans (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  plan_id uuid references plans(id) on delete set null,
  status text not null check (status in ('trialing','active','past_due','cancelled','expired')) default 'active',
  billing_status text,
  billing_provider text,
  billing_reference text,
  current_period_start timestamp with time zone default timezone('utc', now()),
  current_period_end timestamp with time zone,
  grace_period_ends_at timestamp with time zone,
  cancel_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create index if not exists tenant_plans_tenant_idx on tenant_plans (tenant_id, created_at desc);

create table if not exists audit_logs (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  actor_id uuid references users(id),
  action text not null,
  resource text not null,
  resource_id text,
  changes jsonb,
  created_at timestamp with time zone default timezone('utc', now())
);

create table if not exists usage_metrics (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  metric text not null,
  value numeric not null,
  occurred_at timestamp with time zone default timezone('utc', now())
);

create table if not exists calendar_sync_tokens (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  stylist_id uuid references stylists(id),
  google_calendar_id text not null,
  sync_token text,
  updated_at timestamp with time zone default timezone('utc', now())
);

-- Enable Row Level Security
alter table tenants enable row level security;
alter table users enable row level security;
alter table clients enable row level security;
alter table stylists enable row level security;
alter table stylist_rotas enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table bookings enable row level security;
alter table messages enable row level security;
alter table payment_transactions enable row level security;
alter table audit_logs enable row level security;
alter table usage_metrics enable row level security;
alter table calendar_sync_tokens enable row level security;
alter table tenant_plans enable row level security;

-- Policies
create policy if not exists "tenants_isolation" on tenants
  for select using (auth.uid() in (select id from users where tenant_id = tenants.id));

create policy if not exists "users_isolation" on users
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "users_mutation" on users
  for insert with check (tenant_id = get_auth_tenant_id());

create policy if not exists "clients_isolation" on clients
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "clients_mutation" on clients
  for all using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());

create policy if not exists "appointments_isolation" on appointments
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "appointments_mutation" on appointments
  for all using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());

-- Allow tenants to access only their own booking rows
create policy if not exists "bookings_isolation" on bookings
  for select using (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.tenant_id = bookings.tenant_id
    )
  );

-- Limit mutations (insert/update/delete) to the request tenant context
create policy if not exists "bookings_mutation" on bookings
  for all using (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.tenant_id = bookings.tenant_id
    )
  ) with check (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.tenant_id = bookings.tenant_id
    )
  );

create policy if not exists "messages_isolation" on messages
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "messages_mutation" on messages
  for all using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());

create policy if not exists "payments_isolation" on payment_transactions
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "payments_mutation" on payment_transactions
  for all using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());

create policy if not exists "audit_isolation" on audit_logs
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "metrics_isolation" on usage_metrics
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "tenant_plans_isolation" on tenant_plans
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "tenant_plans_mutation" on tenant_plans
  for all using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());

insert into features (code, name, description)
values
  ('deposits_enabled', 'Deposits & Payments', 'Collect booking deposits and payment intents'),
  ('ai_assistant_enabled', 'AI Assistant', 'Access AI-generated responses and automations'),
  ('team_accounts', 'Team Accounts', 'Invite and manage team members')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

insert into plans (code, name, description, monthly_price, currency, grace_period_days, is_active)
values
  ('free', 'Free', 'Core receptionist tools for solo stylists', 0, 'gbp', 7, true),
  ('basic', 'Basic', 'Deposits and team collaboration toolkit', 49, 'gbp', 10, true),
  ('pro', 'Pro', 'Full AI automation suite with premium support', 99, 'gbp', 14, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  currency = excluded.currency,
  grace_period_days = excluded.grace_period_days,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

insert into plan_features (plan_id, feature_code)
select p.id, f.code
from plans p
join features f on f.code in ('team_accounts', 'deposits_enabled')
where p.code = 'basic'
on conflict do nothing;

insert into plan_features (plan_id, feature_code)
select p.id, f.code
from plans p
join features f on f.code in ('team_accounts', 'deposits_enabled', 'ai_assistant_enabled')
where p.code = 'pro'
on conflict do nothing;

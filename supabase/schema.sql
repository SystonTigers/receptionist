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

do $$
begin
  if not exists (select 1 from pg_type where typname = 'onboarding_email_template') then
    create type onboarding_email_template as enum (
      'welcome_day_0',
      'welcome_day_1',
      'welcome_day_7',
      'nudge_branding',
      'nudge_services',
      'nudge_first_booking'
    );
  end if;
end $$;

create table if not exists notification_jobs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  template onboarding_email_template not null,
  recipient text not null,
  subject text,
  payload jsonb default '{}'::jsonb,
  send_at timestamp with time zone not null,
  status text not null check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')) default 'pending',
  attempts integer default 0,
  last_error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now()),
  unique (tenant_id, template)
);

create index if not exists notification_jobs_pending_idx on notification_jobs (status, send_at);

create table if not exists tenant_onboarding_progress (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  branding_completed_at timestamp with time zone,
  services_completed_at timestamp with time zone,
  first_booking_completed_at timestamp with time zone,
  first_booking_conversion_days integer,
  last_nudged_at timestamp with time zone,
  last_step_reminded text,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists tenant_referral_codes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  code text not null,
  reward_type text not null check (reward_type in ('percentage', 'fixed_amount', 'credit')),
  reward_value numeric(10,2) not null,
  max_redemptions integer,
  redemption_count integer default 0,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now()),
  unique (tenant_id, code)
);

create table if not exists tenant_referral_redemptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  referral_code_id uuid references tenant_referral_codes(id) on delete cascade,
  invitee_email text,
  invitee_tenant_id uuid references tenants(id),
  redeemed_at timestamp with time zone default timezone('utc', now())
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
alter table notification_jobs enable row level security;
alter table tenant_onboarding_progress enable row level security;
alter table tenant_referral_codes enable row level security;
alter table tenant_referral_redemptions enable row level security;

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

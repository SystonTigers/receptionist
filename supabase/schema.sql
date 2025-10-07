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
  tier text not null default 'starter' check (tier in ('starter', 'growth', 'scale')),
  settings jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists tenant_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  plan_id text not null,
  status text not null,
  start_date timestamp with time zone,
  current_period_end timestamp with time zone,
  next_billing_date timestamp with time zone,
  delinquent boolean default false,
  cancel_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create table if not exists users (
  id uuid primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  role text not null check (role in ('owner','admin','staff','viewer')),
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

create table if not exists tenant_user_invitations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','staff','viewer')),
  token text not null,
  status text not null check (status in ('pending','accepted','expired')) default 'pending',
  invited_by uuid references users(id) on delete set null,
  accepted_by uuid references users(id) on delete set null,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now()),
  unique (tenant_id, email)
);

create index if not exists tenant_user_invitations_token_idx on tenant_user_invitations (token);
create index if not exists tenant_user_invitations_tenant_idx on tenant_user_invitations (tenant_id);

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

create table if not exists notification_templates (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  type text not null,
  channel text not null check (channel in ('email','sms')),
  locale text default 'default',
  subject_template text,
  body_html_template text,
  body_text_template text,
  timezone text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create unique index if not exists notification_templates_identity_idx
  on notification_templates (
    coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    type,
    channel,
    coalesce(locale, 'default')
  );

create table if not exists notification_identities (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  config jsonb not null,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

create unique index if not exists notification_identities_tenant_provider_idx
  on notification_identities (tenant_id, provider);

create table if not exists notification_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  notification_type text not null,
  channel text not null,
  provider text,
  template_id uuid references notification_templates(id),
  status text not null check (status in ('queued','sent','failed')),
  recipient_hash text,
  recipient_hint text,
  locale text,
  timezone text,
  error text,
  metadata jsonb default '{}'::jsonb,
  payload jsonb,
  provider_message_id text,
  created_at timestamp with time zone default timezone('utc', now())
);

create index if not exists notification_logs_tenant_created_idx
  on notification_logs (tenant_id, created_at desc);

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
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,
  resource text not null,
  resource_id text,
  before jsonb,
  after jsonb,
  created_at timestamp with time zone default timezone('utc', now())
);

create index if not exists audit_logs_tenant_created_idx on audit_logs (tenant_id, created_at desc);
create table if not exists usage_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  event_type text not null,
  quantity numeric default 1,
  metadata jsonb default '{}'::jsonb,
  occurred_at timestamp with time zone default timezone('utc', now())
);

create index if not exists usage_events_tenant_idx on usage_events (tenant_id, event_type, occurred_at);

create table if not exists usage_metrics (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  metric text not null,
  value numeric not null,
  metadata jsonb default '{}'::jsonb,
  occurred_at timestamp with time zone default timezone('utc', now())
);

create unique index if not exists usage_metrics_period_idx on usage_metrics (tenant_id, metric, occurred_at);

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
alter table tenant_subscriptions enable row level security;
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
alter table usage_events enable row level security;
alter table calendar_sync_tokens enable row level security;
alter table notification_jobs enable row level security;
alter table tenant_onboarding_progress enable row level security;
alter table tenant_referral_codes enable row level security;
alter table tenant_referral_redemptions enable row level security;
alter table notification_templates enable row level security;
alter table notification_identities enable row level security;
alter table notification_logs enable row level security;
alter table tenant_user_invitations enable row level security;
alter table tenant_plans enable row level security;

-- Policies
create policy if not exists "tenants_isolation" on tenants
  for select using (auth.uid() in (select id from users where tenant_id = tenants.id));

create policy if not exists "subscription_isolation" on tenant_subscriptions
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "subscription_update" on tenant_subscriptions
  for update using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());

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

create policy if not exists "notification_templates_read" on notification_templates
  for select using (
    tenant_id = get_auth_tenant_id() or tenant_id is null
  );

create policy if not exists "notification_templates_mutation" on notification_templates
  for all using (tenant_id = get_auth_tenant_id())
  with check (tenant_id = get_auth_tenant_id());

create policy if not exists "notification_identities_tenant" on notification_identities
  for all using (tenant_id = get_auth_tenant_id())
  with check (tenant_id = get_auth_tenant_id());

create policy if not exists "notification_logs_read" on notification_logs
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
      where u.id = auth.uid()
        and u.tenant_id = bookings.tenant_id
        and u.role in ('owner','admin','staff')
    )
  ) with check (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.tenant_id = bookings.tenant_id
        and u.role in ('owner','admin','staff')
    )
  );

create policy if not exists "messages_isolation" on messages
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "messages_mutation" on messages
  for all using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());

create policy if not exists "payments_isolation" on payment_transactions
  for select using (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.tenant_id = payment_transactions.tenant_id
        and u.role in ('owner','admin')
    )
  );

create policy if not exists "payments_mutation" on payment_transactions
  for all using (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.tenant_id = payment_transactions.tenant_id
        and u.role in ('owner','admin')
    )
  ) with check (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.tenant_id = payment_transactions.tenant_id
        and u.role in ('owner','admin')
    )
  );

create policy if not exists "audit_isolation" on audit_logs
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "audit_insert" on audit_logs
  for insert with check (tenant_id = get_auth_tenant_id());

create policy if not exists "metrics_isolation" on usage_metrics
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "usage_events_isolation" on usage_events
  for select using (tenant_id = get_auth_tenant_id());

create policy if not exists "usage_events_mutation" on usage_events
  for insert with check (tenant_id = get_auth_tenant_id());
create policy if not exists "tenant_invites_read" on tenant_user_invitations
  for select using (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.tenant_id = tenant_user_invitations.tenant_id
    )
  );

create policy if not exists "tenant_invites_manage" on tenant_user_invitations
  for all using (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.tenant_id = tenant_user_invitations.tenant_id
        and u.role in ('owner','admin')
    )
  ) with check (
    tenant_id = get_auth_tenant_id()
    and exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.tenant_id = tenant_user_invitations.tenant_id
        and u.role in ('owner','admin')
    )
  );
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


-- Lane Owner Management System: owner records, interactions, open loops,
-- commitments, proactive outreach, NPS and health.
--
-- Sits alongside the existing cleaning tables in the public schema (prefix
-- lane_) so no PostgREST schema exposure is needed. References `properties` and
-- `issues` but never alters them. All timestamps are timestamptz; business
-- hours are Australia/Brisbane (no DST), 8am to 6pm, Monday to Friday.


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type lane_staff_role as enum ('pm', 'gm', 'director');
create type lane_contact_method as enum ('call', 'email', 'sms');
create type lane_health as enum ('green', 'amber', 'red');
create type lane_channel as enum ('email', 'call', 'sms', 'maintenance', 'nps', 'note', 'commitment', 'resly');
create type lane_direction as enum ('inbound', 'outbound', 'internal');
create type lane_loop_type as enum ('email', 'missed_call', 'sms', 'maintenance', 'detractor', 'resly');
create type lane_loop_status as enum ('open', 'closed');
create type lane_close_kind as enum ('evidence', 'manual');
create type lane_close_reason as enum ('resolved_elsewhere', 'no_reply_needed', 'duplicate', 'owner_withdrew');
create type lane_snooze_reason as enum ('waiting_on_owner', 'waiting_on_trade', 'owner_asked_later', 'after_hours');
create type lane_commitment_status as enum ('suggested', 'open', 'kept', 'missed');
create type lane_commitment_close_kind as enum ('evidence', 'confirmed', 'manual');
create type lane_outreach_source as enum ('cadence', 'occupancy', 'review', 'cancellation', 'status_change');
create type lane_outreach_status as enum ('open', 'done', 'skipped');
create type lane_nps_kind as enum ('quarterly', 'onboarding', 'maintenance_closed');
create type lane_intent as enum ('payout', 'maintenance', 'complaint', 'general', 'churn_risk', 'booking');
create type lane_urgency as enum ('low', 'normal', 'high');

-- ---------------------------------------------------------------------------
-- Business-hours arithmetic (Brisbane, 8am to 6pm, Mon to Fri)
-- ---------------------------------------------------------------------------
create or replace function lane_next_business_start(ts timestamptz)
returns timestamptz language plpgsql immutable as $$
declare
  local timestamp := ts at time zone 'Australia/Brisbane';
  d date := local::date;
  t time := local::time;
begin
  -- roll forward past weekends and out-of-hours
  loop
    if extract(isodow from d) >= 6 then
      d := d + 1; t := time '08:00'; continue;
    end if;
    if t < time '08:00' then t := time '08:00'; end if;
    if t >= time '18:00' then d := d + 1; t := time '08:00'; continue; end if;
    exit;
  end loop;
  return (d + t) at time zone 'Australia/Brisbane';
end $$;

-- Adds `minutes` of business time to `ts`. Inbound after hours starts the
-- clock at 8am the next business day.
create or replace function lane_add_business_minutes(ts timestamptz, minutes integer)
returns timestamptz language plpgsql immutable as $$
declare
  cur timestamptz := lane_next_business_start(ts);
  remaining integer := minutes;
  local timestamp;
  day_end timestamp;
  avail integer;
begin
  loop
    local := cur at time zone 'Australia/Brisbane';
    day_end := local::date + time '18:00';
    avail := floor(extract(epoch from (day_end - local)) / 60);
    if remaining <= avail then
      return (local + make_interval(mins => remaining)) at time zone 'Australia/Brisbane';
    end if;
    remaining := remaining - avail;
    cur := lane_next_business_start((day_end) at time zone 'Australia/Brisbane');
  end loop;
end $$;

-- End of the business day that `ts` falls in (or the next business day if
-- after hours). Used for the maintenance "same business day" clock.
create or replace function lane_end_of_business_day(ts timestamptz)
returns timestamptz language sql immutable as $$
  select ((lane_next_business_start(ts) at time zone 'Australia/Brisbane')::date + time '18:00') at time zone 'Australia/Brisbane';
$$;

-- Business minutes elapsed between two timestamps.
create or replace function lane_business_minutes_between(a timestamptz, b timestamptz)
returns integer language plpgsql immutable as $$
declare
  cur timestamptz := lane_next_business_start(a);
  total integer := 0;
  local timestamp;
  day_end timestamp;
  stop timestamptz := b;
begin
  if stop <= cur then return 0; end if;
  loop
    local := cur at time zone 'Australia/Brisbane';
    day_end := local::date + time '18:00';
    if stop <= (day_end at time zone 'Australia/Brisbane') then
      return total + floor(extract(epoch from (stop - cur)) / 60);
    end if;
    total := total + floor(extract(epoch from ((day_end at time zone 'Australia/Brisbane') - cur)) / 60);
    cur := lane_next_business_start(day_end at time zone 'Australia/Brisbane');
    if cur >= stop then return total; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table lane_staff (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  role lane_staff_role not null default 'pm',
  dialpad_user_id text,
  gmail_refresh_token text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Staff who have not signed in yet: pre-registered by email so the first
-- Google sign-in links them.
create table lane_staff_invites (
  email text primary key,
  name text not null,
  role lane_staff_role not null default 'pm',
  dialpad_user_id text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Owners
-- ---------------------------------------------------------------------------
create table lane_owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_email text,
  primary_phone text,
  preferred_contact lane_contact_method not null default 'call',
  assigned_pm_id uuid references lane_staff (id) on delete set null,
  hubspot_contact_id text,
  onboarded_at date,
  expected_occupancy numeric, -- what the owner was told to expect, 0 to 1
  health lane_health not null default 'green',
  health_reason text,
  health_updated_at timestamptz,
  cadence_days integer not null default 90,
  last_contact_at timestamptz,   -- last touch in either direction
  last_outbound_at timestamptz,  -- last time we reached out
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index owners_pm_idx on lane_owners (assigned_pm_id) where is_active;
create index owners_health_idx on lane_owners (health) where is_active;

-- Every email address and phone number an owner writes from. Gmail and
-- Dialpad events are matched to owners through this table.
create table lane_owner_contact_points (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references lane_owners (id) on delete cascade,
  kind lane_contact_method not null, -- 'email' or 'call' (phone)
  value text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
create index owner_contact_points_owner_idx on lane_owner_contact_points (owner_id);

create table lane_owner_properties (
  owner_id uuid not null references lane_owners (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, property_id)
);
create index owner_properties_property_idx on lane_owner_properties (property_id);

-- ---------------------------------------------------------------------------
-- Interactions: every touchpoint on the owner's timeline
-- ---------------------------------------------------------------------------
create table lane_interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references lane_owners (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  staff_id uuid references lane_staff (id) on delete set null,
  channel lane_channel not null,
  direction lane_direction not null,
  occurred_at timestamptz not null,
  subject text,
  body text,
  external_id text,        -- Gmail message id, Dialpad call/sms id, issue id
  thread_id text,          -- Gmail thread id, Dialpad conversation
  is_auto_reply boolean not null default false,
  call_answered boolean,   -- calls only
  call_duration_seconds integer,
  recording_url text,
  transcript text,
  ai_intent lane_intent,
  ai_urgency lane_urgency,
  ai_summary text,
  ai_sentiment numeric,    -- -1 to 1
  churn_flag boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);
create index interactions_owner_time_idx on lane_interactions (owner_id, occurred_at desc);
create index interactions_thread_idx on lane_interactions (thread_id) where thread_id is not null;
create index interactions_staff_time_idx on lane_interactions (staff_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Open loops: an obligation Lane owes an owner, with a clock and a named PM
-- ---------------------------------------------------------------------------
create table lane_loops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references lane_owners (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  assigned_pm_id uuid references lane_staff (id) on delete set null,
  type lane_loop_type not null,
  status lane_loop_status not null default 'open',
  opened_at timestamptz not null default now(),
  due_at timestamptz not null,
  closed_at timestamptz,
  closed_by uuid references lane_staff (id) on delete set null,
  close_kind lane_close_kind,
  close_reason lane_close_reason,
  trigger_interaction_id uuid references lane_interactions (id) on delete set null,
  closing_interaction_id uuid references lane_interactions (id) on delete set null,
  issue_id uuid references public.issues (id) on delete set null,
  thread_id text,
  summary text,            -- AI one-liner of what the owner wants
  ai_draft text,           -- reply drafted before the PM opens the row
  texted_not_called boolean not null default false,
  snoozed_until timestamptz,
  snooze_reason lane_snooze_reason,
  notified_past_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loops_open_pm_idx on lane_loops (assigned_pm_id, due_at) where status = 'open';
create index loops_owner_idx on lane_loops (owner_id, opened_at desc);
create index loops_thread_idx on lane_loops (thread_id) where status = 'open' and thread_id is not null;
create index loops_issue_idx on lane_loops (issue_id) where issue_id is not null;

-- ---------------------------------------------------------------------------
-- Commitments: a promise with a due date, closed by evidence
-- ---------------------------------------------------------------------------
create table lane_commitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references lane_owners (id) on delete cascade,
  loop_id uuid references lane_loops (id) on delete set null,
  made_by uuid references lane_staff (id) on delete set null,
  source_interaction_id uuid references lane_interactions (id) on delete set null,
  issue_id uuid references public.issues (id) on delete set null,
  text text not null,
  due_at timestamptz not null,
  status lane_commitment_status not null default 'suggested',
  made_at timestamptz not null default now(),
  kept_at timestamptz,
  kept_interaction_id uuid references lane_interactions (id) on delete set null,
  close_kind lane_commitment_close_kind,
  close_reason text,
  prompt_interaction_id uuid references lane_interactions (id) on delete set null, -- "did your call cover X?"
  prompt_answered_at timestamptz,
  draft_update text,       -- honest update email drafted at the due date
  reopened_from_id uuid references lane_commitments (id) on delete set null,
  missed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index commitments_open_idx on lane_commitments (made_by, due_at) where status in ('open', 'suggested');
create index commitments_owner_idx on lane_commitments (owner_id, due_at desc);

-- ---------------------------------------------------------------------------
-- Proactive outreach
-- ---------------------------------------------------------------------------
create table lane_outreach_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references lane_owners (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  assigned_pm_id uuid references lane_staff (id) on delete set null,
  source lane_outreach_source not null,
  talking_point text not null,
  due_at timestamptz not null,
  status lane_outreach_status not null default 'open',
  done_at timestamptz,
  done_interaction_id uuid references lane_interactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index outreach_open_idx on lane_outreach_tasks (assigned_pm_id, due_at) where status = 'open';

-- ---------------------------------------------------------------------------
-- NPS
-- ---------------------------------------------------------------------------
create table lane_nps_responses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references lane_owners (id) on delete cascade,
  kind lane_nps_kind not null,
  score integer not null check (score between 0 and 10),
  comment text,
  responded_at timestamptz not null default now(),
  external_id text unique,
  loop_id uuid references lane_loops (id) on delete set null,
  interaction_id uuid references lane_interactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index nps_owner_idx on lane_nps_responses (owner_id, responded_at desc);

-- ---------------------------------------------------------------------------
-- Resly-derived signals
-- ---------------------------------------------------------------------------
create table lane_property_reviews (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  external_id text unique,
  rating numeric not null,
  title text,
  body text,
  reviewed_at timestamptz not null,
  channel text,
  loop_id uuid references lane_loops (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Daily snapshot per property so occupancy trends and forecast gaps can be
-- read without recomputing from reservations every time.
create table lane_property_snapshots (
  property_id uuid not null references public.properties (id) on delete cascade,
  snapshot_date date not null,
  occupancy_month numeric,         -- this calendar month, 0 to 1
  occupancy_month_last_year numeric,
  occupancy_next_30 numeric,
  forecast_next_30 numeric,
  revenue_month numeric,
  bookings_next_30 integer,
  status text,
  primary key (property_id, snapshot_date)
);

-- Things Resly did that opened a loop or an outreach task, kept for dedupe.
create table lane_resly_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind lane_outreach_source not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  loop_id uuid references lane_loops (id) on delete set null,
  outreach_task_id uuid references lane_outreach_tasks (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Health history, notifications, sync state
-- ---------------------------------------------------------------------------
create table lane_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references lane_owners (id) on delete cascade,
  computed_at timestamptz not null default now(),
  health lane_health not null,
  reason text,
  inputs jsonb not null default '{}'::jsonb
);
create index health_snapshots_owner_idx on lane_health_snapshots (owner_id, computed_at desc);

create table lane_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references lane_staff (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table lane_notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references lane_staff (id) on delete cascade,
  kind text not null,      -- 'loop_waiting', 'daily_5pm', 'commitment_prompt', 'detractor', 'weekly_digest'
  title text not null,
  body text not null,
  url text,
  dedupe_key text unique,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_staff_idx on lane_notifications (staff_id, created_at desc);

create table lane_sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function lane_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger staff_touch before update on lane_staff for each row execute function lane_touch_updated_at();
create trigger owners_touch before update on lane_owners for each row execute function lane_touch_updated_at();
create trigger loops_touch before update on lane_loops for each row execute function lane_touch_updated_at();
create trigger commitments_touch before update on lane_commitments for each row execute function lane_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Link a new auth user to a staff row (invited by email, laneproperty.com.au)
-- ---------------------------------------------------------------------------
create or replace function lane_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv lane_staff_invites%rowtype;
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'laneproperty.com.au' then
    return new;
  end if;
  select * into inv from lane_staff_invites where lower(email) = lower(new.email);
  insert into lane_staff (id, email, name, role, dialpad_user_id)
  values (
    new.id,
    lower(new.email),
    coalesce(inv.name, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(inv.role, 'pm'),
    inv.dialpad_user_id
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists lane_on_auth_user_created on auth.users;
create trigger lane_on_auth_user_created
  after insert on auth.users
  for each row execute function lane_handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security: any active staff member can read everything (the
-- dashboard is visible to all). Writes go through the server.
-- ---------------------------------------------------------------------------
create or replace function lane_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role'
      or exists (select 1 from lane_staff s where s.id = auth.uid() and s.is_active);
$$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'lane\_%' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (lane_is_staff())', t);
    execute format('create policy staff_write on public.%I for all to authenticated using (lane_is_staff()) with check (lane_is_staff())', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Read-only views over the cleaning app's tables. Views run with the owner's
-- privileges, so staff can read properties and issues without changes to
-- those tables' policies.
-- ---------------------------------------------------------------------------
create or replace view lane_properties as
select id, name, address, suburb, city, state, post_code, region, bedrooms, bathrooms,
       building_name, building_id, key_number, key_access_type, cleaning_company,
       management_type, is_active, resly_listing_id, resly_room_id, created_at, updated_at
from public.properties
where lane_is_staff();

create or replace view lane_issues as
select id, property_id, category, description, severity, due_type, due_date, status,
       origin, created_at, updated_at, last_activity_at
from public.issues
where lane_is_staff();

create or replace view lane_reservations as
select id, property_id, resly_reservation_id, channel, check_in, check_out, status,
       is_owner_stay, accommodation_value, created_at, updated_at
from public.reservations
where lane_is_staff();

grant select on lane_properties, lane_issues, lane_reservations to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Views for the dashboard
-- ---------------------------------------------------------------------------
create or replace view lane_v_loop_stats with (security_invoker = true) as
select
  l.id,
  l.assigned_pm_id,
  l.owner_id,
  l.type,
  l.status,
  l.opened_at,
  l.due_at,
  l.closed_at,
  l.close_kind,
  l.texted_not_called,
  (l.closed_at is not null and l.closed_at <= l.due_at) as within_sla,
  case when l.closed_at is not null
    then lane_business_minutes_between(l.opened_at, l.closed_at) end as response_minutes,
  (l.status = 'open' and now() > l.opened_at + interval '48 hours') as open_over_48h
from lane_loops l;



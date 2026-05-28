-- ProviderOps Tracker Supabase schema
-- Run this script in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  organization_name text,
  created_at timestamptz default now()
);

create table if not exists public.provider_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider_name text not null,
  npi text,
  provider_email text,
  specialty text,
  credential_type text not null,
  credential_number text,
  state text,
  issue_date date,
  expiration_date date,
  renewal_submitted text,
  renewal_approved text,
  owner text,
  notes text,
  last_updated timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.notification_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider_record_id uuid references public.provider_records(id) on delete cascade,
  provider_name text,
  provider_email text,
  credential_type text,
  reminder_type text,
  status text,
  delivery_method text,
  email_id text,
  error_message text,
  sent_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.provider_records enable row level security;
alter table public.notification_history enable row level security;

-- Profiles: each user can view/update only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Provider records: each user can CRUD only their own records.
drop policy if exists "provider_records_select_own" on public.provider_records;
create policy "provider_records_select_own"
  on public.provider_records for select
  using (auth.uid() = user_id);

drop policy if exists "provider_records_insert_own" on public.provider_records;
create policy "provider_records_insert_own"
  on public.provider_records for insert
  with check (auth.uid() = user_id);

drop policy if exists "provider_records_update_own" on public.provider_records;
create policy "provider_records_update_own"
  on public.provider_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "provider_records_delete_own" on public.provider_records;
create policy "provider_records_delete_own"
  on public.provider_records for delete
  using (auth.uid() = user_id);

-- Notification history: each user can CRUD only their own history.
drop policy if exists "notification_history_select_own" on public.notification_history;
create policy "notification_history_select_own"
  on public.notification_history for select
  using (auth.uid() = user_id);

drop policy if exists "notification_history_insert_own" on public.notification_history;
create policy "notification_history_insert_own"
  on public.notification_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "notification_history_update_own" on public.notification_history;
create policy "notification_history_update_own"
  on public.notification_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notification_history_delete_own" on public.notification_history;
create policy "notification_history_delete_own"
  on public.notification_history for delete
  using (auth.uid() = user_id);

-- Auto profile creation when a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, organization_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'organization_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

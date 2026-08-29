-- Clinic access migration for ProviderOps Tracker
-- Adds clinic/practice assignment metadata and lets the designated clinic contact
-- read provider records assigned to that clinic by matching their authenticated email.

alter table public.provider_records
  add column if not exists clinic_name text,
  add column if not exists clinic_contact_email text;

update public.provider_records
set clinic_name = coalesce(nullif(clinic_name, ''), owner)
where clinic_name is null or clinic_name = '';

create index if not exists provider_records_clinic_contact_email_idx
  on public.provider_records (lower(clinic_contact_email));

-- Owners/editors still retain full CRUD through user_id.
-- A designated clinic contact gets SELECT-only access when their signed-in email
-- matches clinic_contact_email on the record.
drop policy if exists "provider_records_select_own" on public.provider_records;
drop policy if exists "provider_records_select_owner_or_clinic_contact" on public.provider_records;
create policy "provider_records_select_owner_or_clinic_contact"
  on public.provider_records for select
  using (
    auth.uid() = user_id
    or lower(coalesce(clinic_contact_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Existing insert/update/delete policies remain owner-only, making clinic access read-only.

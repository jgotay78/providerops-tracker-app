-- ProviderOps Tracker provider-centric uniqueness migration
-- Keeps one credential record per user + NPI + credential type + state.
-- Different states remain separate credentials for the same provider.

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, npi, lower(trim(credential_type)), upper(coalesce(trim(state), ''))
      order by last_updated desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.provider_records
  where npi is not null and trim(npi) <> ''
)
delete from public.provider_records pr
using ranked r
where pr.id = r.id
  and r.duplicate_rank > 1;

create unique index if not exists provider_records_unique_provider_credential
  on public.provider_records (
    user_id,
    npi,
    lower(trim(credential_type)),
    upper(coalesce(trim(state), ''))
  )
  where npi is not null and trim(npi) <> '';

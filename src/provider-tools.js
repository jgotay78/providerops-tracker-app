function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function upper(value) {
  return clean(value).toUpperCase();
}

export function getProviderIdentity(record) {
  return clean(record?.providerId);
}

export function getCredentialIdentity(record) {
  const npi = getProviderIdentity(record);
  const credentialType = lower(record?.credentialType);
  const state = upper(record?.state);
  return `${npi}|${credentialType}|${state}`;
}

export function findDuplicateCredential(records, candidate, excludeId = "") {
  const candidateKey = getCredentialIdentity(candidate);
  if (!candidateKey || candidateKey.startsWith("|")) {
    return null;
  }
  return (
    records.find(
      (record) =>
        String(record?.id || "") !== String(excludeId || "") &&
        getCredentialIdentity(record) === candidateKey
    ) || null
  );
}

export function dedupeCredentialRecords(records) {
  const winners = new Map();

  for (const record of records || []) {
    const key = getCredentialIdentity(record);
    if (!key || key.startsWith("|")) {
      continue;
    }

    const current = winners.get(key);
    if (!current) {
      winners.set(key, record);
      continue;
    }

    const currentTime = new Date(current.lastUpdated || 0).getTime() || 0;
    const candidateTime = new Date(record.lastUpdated || 0).getTime() || 0;
    if (candidateTime >= currentTime) {
      winners.set(key, record);
    }
  }

  return [...winners.values()];
}

export function groupRecordsByProvider(records) {
  const groups = new Map();

  for (const record of records || []) {
    const npi = getProviderIdentity(record);
    if (!npi) {
      continue;
    }

    const existing = groups.get(npi);
    const recordTime = new Date(record.lastUpdated || 0).getTime() || 0;

    if (!existing) {
      groups.set(npi, {
        npi,
        providerName: clean(record.providerName),
        providerEmail: clean(record.providerEmail),
        specialty: clean(record.specialty),
        owner: clean(record.owner),
        latestRecordTime: recordTime,
        credentials: [record]
      });
      continue;
    }

    existing.credentials.push(record);
    if (recordTime >= existing.latestRecordTime) {
      existing.providerName = clean(record.providerName) || existing.providerName;
      existing.providerEmail = clean(record.providerEmail) || existing.providerEmail;
      existing.specialty = clean(record.specialty) || existing.specialty;
      existing.owner = clean(record.owner) || existing.owner;
      existing.latestRecordTime = recordTime;
    } else {
      existing.providerEmail ||= clean(record.providerEmail);
      existing.specialty ||= clean(record.specialty);
      existing.owner ||= clean(record.owner);
    }
  }

  return [...groups.values()]
    .map((provider) => ({
      ...provider,
      credentials: provider.credentials.slice().sort((a, b) =>
        String(a.credentialType || "").localeCompare(String(b.credentialType || ""))
      )
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}

export function uniqueProviderCount(records) {
  return new Set((records || []).map(getProviderIdentity).filter(Boolean)).size;
}

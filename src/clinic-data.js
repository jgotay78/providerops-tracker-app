const CONTACTS_KEY = "providerops-clinic-contacts-v1";
const RECORDS_KEY = "credentialing-tracker-v1";

const LEGACY_CLINIC_MAP = {
  "Maria Gomez": {
    clinic: "Horizon Medical Clinic",
    email: "credentialing@horizonmedical.example"
  },
  "Noah Reed": {
    clinic: "Lakeside Pediatric & Family Care",
    email: "credentialing@lakesidecare.example"
  },
  "Kira Stone": {
    clinic: "Northstar Specialty Clinic",
    email: "credentialing@northstarspecialty.example"
  }
};

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

export function normalizeClinicName(value) {
  const raw = clean(value);
  return LEGACY_CLINIC_MAP[raw]?.clinic || raw;
}

export function loadClinicContacts() {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTACTS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveClinicContacts(contacts) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts || {}));
}

export function persistClinicContactEmail(clinicName, email) {
  const clinic = normalizeClinicName(clinicName);
  const contactEmail = clean(email);
  if (!clinic) return;
  const contacts = loadClinicContacts();
  if (contactEmail) contacts[clinic] = contactEmail;
  else delete contacts[clinic];
  saveClinicContacts(contacts);
}

export function getClinicContactEmail(clinicName) {
  const clinic = normalizeClinicName(clinicName);
  if (!clinic) return "";
  const contacts = loadClinicContacts();
  if (contacts[clinic]) return clean(contacts[clinic]);

  const legacy = Object.values(LEGACY_CLINIC_MAP).find((entry) => entry.clinic === clinic);
  return legacy?.email || "";
}

export function isEmail(value) {
  const email = clean(value);
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function migrateLocalClinicAssignments() {
  if (typeof localStorage === "undefined") return { changed: false, clinics: [] };

  let records;
  try {
    records = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
  } catch {
    return { changed: false, clinics: [] };
  }
  if (!Array.isArray(records)) return { changed: false, clinics: [] };

  const contacts = loadClinicContacts();
  let changed = false;
  const clinics = new Set();

  for (const record of records) {
    const original = clean(record?.clinicName || record?.owner);
    const clinic = normalizeClinicName(original);
    if (!clinic) continue;

    clinics.add(clinic);
    if (clean(record.owner) !== clinic) {
      record.owner = clinic;
      changed = true;
    }
    if (record.clinicName !== clinic) {
      record.clinicName = clinic;
      changed = true;
    }

    const recordEmail = clean(record.clinicContactEmail);
    const legacyEmail = LEGACY_CLINIC_MAP[original]?.email || "";
    const contactEmail = recordEmail || contacts[clinic] || legacyEmail;
    if (contactEmail) {
      contacts[clinic] = contactEmail;
      if (record.clinicContactEmail !== contactEmail) {
        record.clinicContactEmail = contactEmail;
        changed = true;
      }
    }
  }

  if (changed) localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  saveClinicContacts(contacts);
  return { changed, clinics: [...clinics] };
}

export function clinicForSignedInEmail(records, email) {
  const target = lower(email);
  if (!target) return [];
  const clinics = new Set();
  for (const record of records || []) {
    const clinic = normalizeClinicName(record?.clinicName || record?.owner);
    const contact = lower(record?.clinicContactEmail || getClinicContactEmail(clinic));
    if (clinic && contact && contact === target) clinics.add(clinic);
  }
  return [...clinics];
}

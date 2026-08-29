import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { parseCsvRecords } from "./csv-tools.js";
import {
  dedupeCredentialRecords,
  findDuplicateCredential,
  getCredentialIdentity,
  groupRecordsByProvider,
  uniqueProviderCount
} from "./provider-tools.js";

const STORAGE_KEY = "credentialing-tracker-v1";
const NOTIFICATION_STATE_KEY = "credentialing-tracker-notification-state-v1";
const NOTIFICATION_HISTORY_KEY = "credentialing-tracker-notification-history-v1";
const PREFILL_KEY = "providerops-provider-prefill";
const DEMO_NPIS = new Set(["1234567890", "2345678901", "3456789012", "4567890123", "5678901234", "6789012345"]);
let cachedRecords = [];
let renderTimer = null;
let providerSearch = "";

function addDays(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoNow() {
  return new Date().toISOString();
}

function buildDemoRecords() {
  const now = isoNow();
  return [
    {
      id: "r1",
      providerName: "Avery Brooks",
      providerId: "1234567890",
      providerEmail: "avery.brooks@northstarhealth.org",
      specialty: "Cardiology",
      credentialType: "DEA",
      credentialNumber: "AB1234567",
      state: "TX",
      issueDate: addDays(-720),
      expirationDate: addDays(7),
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Maria Gomez",
      notes: "Renewal outreach in progress",
      lastUpdated: now
    },
    {
      id: "r1-license",
      providerName: "Avery Brooks",
      providerId: "1234567890",
      providerEmail: "avery.brooks@northstarhealth.org",
      specialty: "Cardiology",
      credentialType: "State License",
      credentialNumber: "TX-441820",
      state: "TX",
      issueDate: addDays(-850),
      expirationDate: addDays(150),
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Maria Gomez",
      notes: "Active",
      lastUpdated: now
    },
    {
      id: "r2",
      providerName: "Jordan Patel",
      providerId: "2345678901",
      providerEmail: "jordan.patel@northstarhealth.org",
      specialty: "Internal Medicine",
      credentialType: "State License",
      credentialNumber: "TX-882731",
      state: "TX",
      issueDate: addDays(-700),
      expirationDate: addDays(28),
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Maria Gomez",
      notes: "CE documents requested",
      lastUpdated: now
    },
    {
      id: "r2-malpractice",
      providerName: "Jordan Patel",
      providerId: "2345678901",
      providerEmail: "jordan.patel@northstarhealth.org",
      specialty: "Internal Medicine",
      credentialType: "Malpractice Insurance",
      credentialNumber: "POL-88201",
      state: "TX",
      issueDate: addDays(-180),
      expirationDate: addDays(180),
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Maria Gomez",
      notes: "Current coverage on file",
      lastUpdated: now
    },
    {
      id: "r3",
      providerName: "Casey Nguyen",
      providerId: "3456789012",
      providerEmail: "casey.nguyen@northstarhealth.org",
      specialty: "Pediatrics",
      credentialType: "Board Certification",
      credentialNumber: "BC-44091",
      state: "",
      issueDate: addDays(-1200),
      expirationDate: addDays(-5),
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Noah Reed",
      notes: "Updated documentation needed",
      lastUpdated: now
    },
    {
      id: "r3-bls",
      providerName: "Casey Nguyen",
      providerId: "3456789012",
      providerEmail: "casey.nguyen@northstarhealth.org",
      specialty: "Pediatrics",
      credentialType: "BLS",
      credentialNumber: "BLS-44091",
      state: "TX",
      issueDate: addDays(-500),
      expirationDate: addDays(45),
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Noah Reed",
      notes: "Upcoming renewal window",
      lastUpdated: now
    },
    {
      id: "r4",
      providerName: "Taylor Morris",
      providerId: "4567890123",
      providerEmail: "taylor.morris@northstarhealth.org",
      specialty: "Family Medicine",
      credentialType: "DEA",
      credentialNumber: "BM9876543",
      state: "TX",
      issueDate: addDays(-600),
      expirationDate: addDays(95),
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Kira Stone",
      notes: "Active",
      lastUpdated: now
    },
    {
      id: "r4-acls",
      providerName: "Taylor Morris",
      providerId: "4567890123",
      providerEmail: "taylor.morris@northstarhealth.org",
      specialty: "Family Medicine",
      credentialType: "ACLS",
      credentialNumber: "ACLS-900122",
      state: "TX",
      issueDate: addDays(-420),
      expirationDate: "",
      renewalSubmitted: "0",
      renewalApproved: "No",
      owner: "Kira Stone",
      notes: "Expiration date needs verification",
      lastUpdated: now
    }
  ];
}

function isDemoDataset(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return true;
  }
  return records.every((record) => DEMO_NPIS.has(String(record?.providerId || "").trim()));
}

function seedAndCleanFallbackData() {
  if (isSupabaseConfigured || typeof localStorage === "undefined") {
    return;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    if (isDemoDataset(existing)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildDemoRecords()));
      return;
    }

    if (Array.isArray(existing)) {
      const deduped = dedupeCredentialRecords(existing);
      if (deduped.length !== existing.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
      }
    }
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildDemoRecords()));
  }
}

seedAndCleanFallbackData();

function injectStyles() {
  if (document.querySelector('link[data-provider-view="true"]')) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/src/provider-view.css";
  link.dataset.providerView = "true";
  document.head.append(link);
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function daysUntil(dateString) {
  const raw = clean(dateString);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }
  const target = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateString) {
  const raw = clean(dateString);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "Missing";
  }
  const [year, month, day] = raw.split("-");
  return `${month}/${day}/${year}`;
}

function statusFor(record) {
  const days = daysUntil(record.expirationDate);
  if (days === null) return { label: "Missing Expiration", className: "risk-missing", rank: 4 };
  if (days < 0) return { label: "Expired", className: "risk-expired", rank: 0 };
  if (days <= 30) return { label: `Due in ${days}d`, className: "risk-due", rank: 1 };
  if (days <= 60) return { label: `Due in ${days}d`, className: "risk-watch", rank: 2 };
  return { label: "Active", className: "risk-active", rank: 3 };
}

function providerRisk(provider) {
  return provider.credentials
    .map((record) => statusFor(record))
    .sort((a, b) => a.rank - b.rank)[0] || { label: "Active", className: "risk-active", rank: 3 };
}

function nextExpiration(provider) {
  const dated = provider.credentials
    .map((record) => ({ record, days: daysUntil(record.expirationDate) }))
    .filter((item) => item.days !== null)
    .sort((a, b) => a.days - b.days);
  const future = dated.find((item) => item.days >= 0);
  return future || dated[0] || null;
}

function mapDbRecord(row) {
  return {
    id: row.id,
    providerName: row.provider_name,
    providerId: row.npi,
    providerEmail: row.provider_email,
    specialty: row.specialty,
    credentialType: row.credential_type,
    credentialNumber: row.credential_number,
    state: row.state,
    issueDate: row.issue_date || "",
    expirationDate: row.expiration_date || "",
    renewalSubmitted: row.renewal_submitted || "",
    renewalApproved: row.renewal_approved || "No",
    owner: row.owner || "",
    notes: row.notes || "",
    lastUpdated: row.last_updated || row.created_at || ""
  };
}

async function loadRecords() {
  if (isSupabaseConfigured && supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      const { data, error } = await supabase.from("provider_records").select("*").order("created_at", { ascending: false });
      if (!error) {
        return (data || []).map(mapDbRecord);
      }
    }
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function showProviderToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `provider-toast ${type}`;
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3400);
}

function createDirectoryPanel() {
  let panel = document.querySelector("#provider-directory-panel");
  if (panel) return panel;

  const recordsBody = document.querySelector("#records-body");
  const legacyPanel = recordsBody?.closest("section.panel");
  if (!legacyPanel) return null;

  panel = document.createElement("section");
  panel.id = "provider-directory-panel";
  panel.className = "panel provider-directory-panel";
  panel.innerHTML = `
    <div class="provider-directory-head">
      <div class="provider-directory-title">
        <h2>Provider Directory</h2>
        <p>Each provider appears once. Licenses and credentials are managed inside the provider record.</p>
      </div>
      <div class="provider-directory-summary">
        <span id="provider-count-chip" class="provider-summary-chip">0 Providers</span>
        <span id="credential-count-chip" class="provider-summary-chip">0 Credentials</span>
      </div>
    </div>
    <div class="provider-directory-toolbar">
      <input id="provider-directory-search" class="provider-search" type="search" placeholder="Search provider, NPI, specialty or credential..." />
      <div class="provider-toolbar-actions">
        <button class="btn-soft" type="button" data-provider-toolbar="import">Import CSV</button>
        <button class="btn-soft" type="button" data-provider-toolbar="template">Download Template</button>
        <button class="btn-soft" type="button" data-provider-toolbar="export">Export CSV</button>
        <button class="btn-soft" type="button" data-provider-toolbar="reset">Reset Demo</button>
      </div>
    </div>
    <div id="provider-directory-list" class="provider-list"></div>
  `;

  legacyPanel.before(panel);
  legacyPanel.style.display = "none";
  return panel;
}

function updateLabels() {
  const form = document.querySelector("#record-form");
  const formPanel = form?.closest("section.panel");
  const heading = formPanel?.querySelector("h2");
  if (heading) heading.textContent = "Add / Update Provider Credential";

  if (formPanel && !formPanel.querySelector(".provider-form-note")) {
    const note = document.createElement("p");
    note.className = "provider-form-note";
    note.textContent = "Enter an existing NPI to reuse that provider's information. The app blocks duplicate credential records for the same provider, credential type, and state.";
    heading?.insertAdjacentElement("afterend", note);
  }

  const heroCopy = document.querySelector(".hero-copy");
  if (heroCopy) {
    heroCopy.textContent = "Manage each provider once, keep all credentials together, monitor expiration risk, and coordinate renewal outreach from one operations view.";
  }

  const statusTitle = document.querySelector("#status-pie")?.closest(".chart-card")?.querySelector("h3");
  if (statusTitle) statusTitle.textContent = "Credential Status Distribution";
  const ownerTitle = document.querySelector("#owner-pie")?.closest(".chart-card")?.querySelector("h3");
  if (ownerTitle) ownerTitle.textContent = "Credential Workload by Owner";

  const notifications = document.querySelector("#notifications-body")?.closest("section.panel");
  const notificationHeading = notifications?.querySelector("h2");
  if (notificationHeading) notificationHeading.textContent = "Credential Notifications";
}

function renderDirectory() {
  const panel = createDirectoryPanel();
  const list = panel?.querySelector("#provider-directory-list");
  if (!panel || !list) return;

  const groups = groupRecordsByProvider(cachedRecords);
  const q = providerSearch.toLowerCase();
  const filtered = groups.filter((provider) => {
    if (!q) return true;
    const haystack = [
      provider.providerName,
      provider.npi,
      provider.providerEmail,
      provider.specialty,
      provider.owner,
      ...provider.credentials.flatMap((record) => [record.credentialType, record.credentialNumber, record.state])
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const providerChip = panel.querySelector("#provider-count-chip");
  const credentialChip = panel.querySelector("#credential-count-chip");
  if (providerChip) providerChip.textContent = `${groups.length} Provider${groups.length === 1 ? "" : "s"}`;
  if (credentialChip) credentialChip.textContent = `${cachedRecords.length} Credential${cachedRecords.length === 1 ? "" : "s"}`;

  const totalKpi = document.querySelector("#kpi-total");
  if (totalKpi) totalKpi.textContent = String(uniqueProviderCount(cachedRecords));

  if (!filtered.length) {
    list.innerHTML = `<div class="provider-empty">No providers match your search.</div>`;
    return;
  }

  list.innerHTML = filtered.map((provider) => {
    const risk = providerRisk(provider);
    const next = nextExpiration(provider);
    const nextText = next
      ? `${escapeHtml(next.record.credentialType)} · ${escapeHtml(formatDate(next.record.expirationDate))}`
      : "No expiration dates";

    const credentials = provider.credentials.map((record) => {
      const status = statusFor(record);
      const stateLabel = clean(record.state) || "N/A";
      const days = daysUntil(record.expirationDate);
      const daysText = days === null ? "Date missing" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`;
      return `
        <div class="provider-credential">
          <div class="credential-main">
            <strong>${escapeHtml(record.credentialType || "Credential")}</strong>
            <span>${escapeHtml(stateLabel)} · ${escapeHtml(record.credentialNumber || "No credential number")}</span>
          </div>
          <div class="credential-meta">
            <strong>${escapeHtml(formatDate(record.expirationDate))}</strong>
            <span>${escapeHtml(daysText)}</span>
          </div>
          <div class="credential-meta">
            <span class="provider-risk-badge ${status.className}">${escapeHtml(status.label)}</span>
          </div>
          <div class="credential-meta">
            <strong>${escapeHtml(record.owner || "Unassigned")}</strong>
            <span>Credential owner</span>
          </div>
          <div class="credential-actions">
            <button class="credential-mini-btn" type="button" data-provider-action="details" data-record-id="${escapeHtml(record.id)}">Details</button>
            <button class="credential-mini-btn" type="button" data-provider-action="edit" data-record-id="${escapeHtml(record.id)}">Edit</button>
            <button class="credential-mini-btn" type="button" data-provider-action="reminder" data-record-id="${escapeHtml(record.id)}">Reminder</button>
            <button class="credential-mini-btn danger" type="button" data-provider-action="delete" data-record-id="${escapeHtml(record.id)}">Delete</button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <article class="provider-card" data-provider-npi="${escapeHtml(provider.npi)}">
        <div class="provider-card-head">
          <div>
            <div class="provider-name-line">
              <h3>${escapeHtml(provider.providerName || "Unnamed Provider")}</h3>
              <span class="provider-risk-badge ${risk.className}">${escapeHtml(risk.label)}</span>
            </div>
            <div class="provider-npi">NPI ${escapeHtml(provider.npi)}</div>
            <div class="provider-secondary">${escapeHtml(provider.specialty || "Specialty not set")} · ${escapeHtml(provider.providerEmail || "No email configured")}</div>
          </div>
          <div class="provider-risk">
            <div>
              <div class="provider-secondary">Next expiration</div>
              <strong>${nextText}</strong>
            </div>
            <span class="provider-summary-chip">${provider.credentials.length} Credential${provider.credentials.length === 1 ? "" : "s"}</span>
          </div>
          <div class="provider-card-actions">
            <button class="btn-soft" type="button" data-add-provider-credential="${escapeHtml(provider.npi)}">+ Add Credential</button>
          </div>
        </div>
        <div class="provider-credentials">${credentials}</div>
      </article>
    `;
  }).join("");
}

async function refreshDirectory() {
  cachedRecords = dedupeCredentialRecords(await loadRecords());
  renderDirectory();
  applyPendingPrefill();
}

function scheduleRefresh() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => void refreshDirectory(), 120);
}

function providerForNpi(npi) {
  return groupRecordsByProvider(cachedRecords).find((provider) => provider.npi === clean(npi)) || null;
}

function fillProviderFields(provider) {
  const form = document.querySelector("#record-form");
  if (!form || !provider) return;
  const set = (name, value) => {
    const input = form.elements.namedItem(name);
    if (input && "value" in input) input.value = value || "";
  };
  set("providerName", provider.providerName);
  set("providerId", provider.npi);
  set("providerEmail", provider.providerEmail);
  set("specialty", provider.specialty);
  set("owner", provider.owner);
}

function applyPendingPrefill() {
  const raw = sessionStorage.getItem(PREFILL_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PREFILL_KEY);
  try {
    const data = JSON.parse(raw);
    const provider = providerForNpi(data.npi);
    if (provider) {
      fillProviderFields(provider);
      document.querySelector("#record-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      showProviderToast(`Adding another credential for ${provider.providerName}`, "success");
    }
  } catch {
    // Ignore invalid prefill state.
  }
}

function candidateFromForm() {
  const form = document.querySelector("#record-form");
  if (!form) return null;
  const data = new FormData(form);
  return {
    providerName: clean(data.get("providerName")),
    providerId: clean(data.get("providerId")),
    credentialType: clean(data.get("credentialType")),
    credentialNumber: clean(data.get("credentialNumber")),
    state: clean(data.get("state")).toUpperCase()
  };
}

async function providerCentricImport(file) {
  const text = await file.text();
  const { records } = parseCsvRecords(text);
  const current = await loadRecords();
  const merged = current.slice();
  let added = 0;
  let updated = 0;

  for (const incoming of records) {
    if (!clean(incoming.providerId) || !clean(incoming.credentialType)) continue;
    const duplicate = findDuplicateCredential(merged, incoming);
    if (duplicate) {
      Object.assign(duplicate, incoming, { id: duplicate.id, lastUpdated: isoNow() });
      updated += 1;
    } else {
      merged.push({
        ...incoming,
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        lastUpdated: isoNow()
      });
      added += 1;
    }
  }

  if (isSupabaseConfigured && supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) throw new Error("Please log in before importing records.");

    for (const record of merged) {
      const payload = {
        id: record.id,
        user_id: user.id,
        provider_name: record.providerName,
        npi: record.providerId,
        provider_email: record.providerEmail || "",
        specialty: record.specialty || "",
        credential_type: record.credentialType,
        credential_number: record.credentialNumber || "",
        state: clean(record.state).toUpperCase(),
        issue_date: record.issueDate || null,
        expiration_date: record.expirationDate || null,
        renewal_submitted: record.renewalSubmitted || "",
        renewal_approved: record.renewalApproved || "No",
        owner: record.owner || "",
        notes: record.notes || "",
        last_updated: isoNow()
      };
      const { error } = await supabase.from("provider_records").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    }
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeCredentialRecords(merged)));
  }

  showProviderToast(`CSV processed: ${added} added, ${updated} updated`, "success");
  setTimeout(() => globalThis.location?.reload(), 500);
}

function bindProviderEvents() {
  const panel = createDirectoryPanel();
  const form = document.querySelector("#record-form");
  if (!panel || !form || panel.dataset.bound === "true") return;
  panel.dataset.bound = "true";

  panel.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === "provider-directory-search") {
      providerSearch = target.value.trim();
      renderDirectory();
    }
  });

  panel.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const addCredential = target.closest("[data-add-provider-credential]");
    if (addCredential instanceof HTMLElement) {
      const npi = addCredential.dataset.addProviderCredential;
      if (npi) {
        sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ npi }));
        globalThis.location?.reload();
      }
      return;
    }

    const actionButton = target.closest("[data-provider-action]");
    if (actionButton instanceof HTMLElement) {
      const action = actionButton.dataset.providerAction;
      const recordId = actionButton.dataset.recordId;
      if (!recordId) return;
      const selectorByAction = {
        details: `[data-details-id="${CSS.escape(recordId)}"]`,
        edit: `[data-edit-id="${CSS.escape(recordId)}"]`,
        delete: `[data-delete-id="${CSS.escape(recordId)}"]`,
        reminder: `[data-open-reminder="${CSS.escape(recordId)}"]`
      };
      document.querySelector(selectorByAction[action])?.click();
      return;
    }

    const toolbar = target.closest("[data-provider-toolbar]");
    if (!(toolbar instanceof HTMLElement)) return;
    const action = toolbar.dataset.providerToolbar;
    if (action === "import") document.querySelector("#import-csv")?.click();
    if (action === "template") document.querySelector("#download-template")?.click();
    if (action === "export") document.querySelector("#export-csv")?.click();
    if (action === "reset") {
      if (!isSupabaseConfigured) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildDemoRecords()));
        localStorage.removeItem(NOTIFICATION_STATE_KEY);
        localStorage.removeItem(NOTIFICATION_HISTORY_KEY);
        globalThis.location?.reload();
      } else {
        document.querySelector("#reset-data")?.click();
      }
    }
  });

  const npiInput = form.elements.namedItem("providerId");
  if (npiInput instanceof HTMLInputElement) {
    npiInput.addEventListener("blur", () => {
      const provider = providerForNpi(npiInput.value);
      if (provider) {
        fillProviderFields(provider);
        showProviderToast(`Existing provider found: ${provider.providerName}. Add the new credential below.`, "success");
      }
    });
  }

  form.addEventListener("submit", (event) => {
    const submitButton = document.querySelector("#record-submit");
    const editing = /save changes/i.test(submitButton?.textContent || "");
    if (editing) return;

    const candidate = candidateFromForm();
    if (!candidate) return;
    const duplicate = findDuplicateCredential(cachedRecords, candidate);
    if (duplicate) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showProviderToast(
        `${candidate.credentialType} already exists for NPI ${candidate.providerId}${candidate.state ? ` in ${candidate.state}` : ""}. Edit the existing credential instead of adding a duplicate.`,
        "error"
      );
    }
  }, true);

  const fileInput = document.querySelector("#import-file");
  fileInput?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    if (!file) return;
    event.stopImmediatePropagation();
    void providerCentricImport(file).catch((error) => {
      showProviderToast(error instanceof Error ? error.message : "Import failed", "error");
    });
  }, true);
}

function observeApp() {
  const recordsBody = document.querySelector("#records-body");
  if (recordsBody) {
    new MutationObserver(scheduleRefresh).observe(recordsBody, { childList: true, subtree: true });
  }
  const totalKpi = document.querySelector("#kpi-total");
  if (totalKpi) {
    new MutationObserver(() => {
      totalKpi.textContent = String(uniqueProviderCount(cachedRecords));
    }).observe(totalKpi, { childList: true, characterData: true, subtree: true });
  }
}

async function startProviderView() {
  injectStyles();
  updateLabels();
  createDirectoryPanel();
  bindProviderEvents();
  observeApp();
  await refreshDirectory();
}

setTimeout(() => {
  void startProviderView();
}, 250);

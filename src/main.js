import { createTemplateCsv, parseCsvRecords } from "./csv-tools.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import {
  buildReminderEmail,
  getNotificationStatus,
  getReminderType,
  saveNotificationHistory,
  simulateSendReminder
} from "./notification-tools.js";

const STORAGE_KEY = "credentialing-tracker-v1";
const NOTIFICATION_STATE_KEY = "credentialing-tracker-notification-state-v1";
const NOTIFICATION_HISTORY_KEY = "credentialing-tracker-notification-history-v1";
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const REMINDER_API_URL = `${API_BASE_URL}/api/send-reminder`;
const APP_TIME_ZONE = "America/Chicago";
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

const STATUS_COLORS = {
  Active: "#16a34a",
  "Due <30 Days": "#f59e0b",
  "Due 30-60 Days": "#d97706",
  Expired: "#b42318",
  "Missing Expiration": "#64748b"
};

const OWNER_COLORS = ["#0f766e", "#0ea5e9", "#6366f1", "#f59e0b", "#ef4444", "#84cc16", "#a855f7"];

// Future-ready extension points.
const APP_FEATURE_FLAGS = {
  authentication: false,
  backendDatabase: false,
  emailReminders: false,
  multiUserAccess: false,
  auditLogging: false
};

// Placeholder registry for future real integrations (SendGrid/Resend/SMTP/Gmail/SMS).
const EMAIL_PROVIDER_PLACEHOLDERS = ["sendgrid", "resend", "emailjs", "smtp", "gmail_api", "sms"];

const sampleRecords = [
  {
    id: "r1",
    providerName: "Avery Brooks",
    providerId: "1234567890",
    providerEmail: "avery.brooks@northstarhealth.org",
    specialty: "Cardiology",
    credentialType: "DEA",
    credentialNumber: "AB1234567",
    state: "TX",
    issueDate: "2023-02-12",
    expirationDate: "2026-05-17",
    renewalSubmitted: "04/22/2026",
    renewalApproved: "No",
    owner: "Maria Gomez",
    notes: "Renewal in progress",
    lastUpdated: "2026-05-20T09:15:00.000Z"
  },
  {
    id: "r2",
    providerName: "Jordan Patel",
    providerId: "2345678901",
    providerEmail: "jordan.patel@northstarhealth.org",
    specialty: "Internal Medicine",
    credentialType: "State License",
    credentialNumber: "LIC-882731",
    state: "TX",
    issueDate: "2024-03-18",
    expirationDate: "2026-06-14",
    renewalSubmitted: "05/05/2026",
    renewalApproved: "No",
    owner: "Maria Gomez",
    notes: "Submit CE documents",
    lastUpdated: "2026-05-21T11:42:00.000Z"
  },
  {
    id: "r3",
    providerName: "Casey Nguyen",
    providerId: "3456789012",
    providerEmail: "",
    specialty: "Pediatrics",
    credentialType: "Board Certification",
    credentialNumber: "BC-44091",
    state: "TX",
    issueDate: "2022-04-18",
    expirationDate: "2026-07-12",
    renewalSubmitted: "05/12/2026",
    renewalApproved: "No",
    owner: "Noah Reed",
    notes: "Needs renewal packet",
    lastUpdated: "2026-05-18T07:20:00.000Z"
  },
  {
    id: "r4",
    providerName: "Taylor Morris",
    providerId: "4567890123",
    providerEmail: "taylor.morris@northstarhealth.org",
    specialty: "Family Medicine",
    credentialType: "BLS",
    credentialNumber: "BLS-900122",
    state: "TX",
    issueDate: "2024-06-26",
    expirationDate: "2026-11-13",
    renewalSubmitted: "05/18/2026",
    renewalApproved: "No",
    owner: "Noah Reed",
    notes: "Active and compliant",
    lastUpdated: "2026-05-23T08:10:00.000Z"
  },
  {
    id: "r5",
    providerName: "Riley Johnson",
    providerId: "5678901234",
    providerEmail: "",
    specialty: "Anesthesiology",
    credentialType: "ACLS",
    credentialNumber: "ACLS-712290",
    state: "TX",
    issueDate: "2024-07-16",
    expirationDate: "2026-05-25",
    renewalSubmitted: "05/20/2026",
    renewalApproved: "No",
    owner: "Kira Stone",
    notes: "Expired this week",
    lastUpdated: "2026-05-24T10:35:00.000Z"
  },
  {
    id: "r6",
    providerName: "Morgan Lee",
    providerId: "6789012345",
    providerEmail: "morgan.lee@northstarhealth.org",
    specialty: "Psychiatry",
    credentialType: "Malpractice Insurance",
    credentialNumber: "POL-109382",
    state: "TX",
    issueDate: "2020-05-18",
    expirationDate: "2026-09-15",
    renewalSubmitted: "05/10/2026",
    renewalApproved: "No",
    owner: "Kira Stone",
    notes: "Current coverage on file",
    lastUpdated: "2026-05-22T13:00:00.000Z"
  }
];

const sampleNotificationHistory = [
  {
    id: "demo-reminder-r2",
    recordId: "r2",
    providerName: "Jordan Patel",
    providerEmail: "jordan.patel@northstarhealth.org",
    credentialType: "State License",
    reminderType: "30-Day",
    dateSent: "2026-05-27T15:30:00.000Z",
    status: "Sent",
    deliveryMethod: "Nodemailer Email",
    actionType: "original",
    providerResponseId: "demo-email-001",
    errorMessage: "",
    notes: "Demo reminder sent"
  }
];

const state = {
  records: [],
  notificationState: {},
  notificationHistory: [],
  editingRecordId: null,
  pendingDeleteId: null,
  pendingReminder: null,
  isSendingReminder: false,
  session: null,
  user: null,
  profile: null,
  useSupabase: isSupabaseConfigured,
  filters: {
    search: "",
    status: "ALL",
    owner: "ALL",
    quick: "ALL"
  },
  notificationFilter: "ALL"
};

const counterValues = new Map();

const elements = {
  appShell: document.querySelector("#app-shell"),
  authShell: document.querySelector("#auth-shell"),
  supabaseWarning: document.querySelector("#supabase-warning"),
  loginForm: document.querySelector("#login-form"),
  signupForm: document.querySelector("#signup-form"),
  forgotForm: document.querySelector("#forgot-form"),
  authAlert: document.querySelector("#auth-alert"),
  logoutBtn: document.querySelector("#logout-btn"),
  storageModeChip: document.querySelector("#storage-mode-chip"),
  currentUserEmail: document.querySelector("#current-user-email"),
  asOfDate: document.querySelector("#as-of-date"),
  statusTotal: document.querySelector("#status-total"),
  ownerTotal: document.querySelector("#owner-total"),
  kpiTotal: document.querySelector("#kpi-total"),
  kpiActive: document.querySelector("#kpi-active"),
  kpiDue30: document.querySelector("#kpi-due30"),
  kpiDue60: document.querySelector("#kpi-due60"),
  kpiExpired: document.querySelector("#kpi-expired"),
  kpiMissing: document.querySelector("#kpi-missing"),
  kpiWeek: document.querySelector("#kpi-week"),
  kpiRemindersSent: document.querySelector("#kpi-reminders-sent"),
  kpiPendingReminders: document.querySelector("#kpi-pending-reminders"),
  complianceRing: document.querySelector("#compliance-ring"),
  complianceScore: document.querySelector("#compliance-score"),
  statusPie: document.querySelector("#status-pie"),
  statusLegend: document.querySelector("#status-legend"),
  ownerPie: document.querySelector("#owner-pie"),
  ownerLegend: document.querySelector("#owner-legend"),
  highlightRisk: document.querySelector("#highlight-risk"),
  highlightSubmitted: document.querySelector("#highlight-submitted"),
  highlightOwner: document.querySelector("#highlight-owner"),
  form: document.querySelector("#record-form"),
  formSubmitButton: document.querySelector("#record-submit"),
  recordsBody: document.querySelector("#records-body"),
  tableWrap: document.querySelector("#table-wrap"),
  notificationsTableWrap: document.querySelector("#notifications-table-wrap"),
  notificationsBody: document.querySelector("#notifications-body"),
  filterSearch: document.querySelector("#filter-search"),
  filterStatus: document.querySelector("#filter-status"),
  filterOwner: document.querySelector("#filter-owner"),
  quickFilters: document.querySelectorAll("[data-quick-filter]"),
  notificationFilters: document.querySelectorAll("[data-notification-filter]"),
  clearFilters: document.querySelector("#clear-filters"),
  exportCsv: document.querySelector("#export-csv"),
  resetData: document.querySelector("#reset-data"),
  importCsv: document.querySelector("#import-csv"),
  importFile: document.querySelector("#import-file"),
  downloadTemplate: document.querySelector("#download-template"),
  modalBackdrop: document.querySelector("#modal-backdrop"),
  detailsModal: document.querySelector("#details-modal"),
  deleteModal: document.querySelector("#delete-modal"),
  reminderModal: document.querySelector("#reminder-modal"),
  historyModal: document.querySelector("#history-modal"),
  detailsBody: document.querySelector("#details-body"),
  reminderBody: document.querySelector("#reminder-body"),
  historyBody: document.querySelector("#history-body"),
  deleteMessage: document.querySelector("#delete-message"),
  closeDetailsModal: document.querySelector("#close-details-modal"),
  closeDeleteModal: document.querySelector("#close-delete-modal"),
  closeReminderModal: document.querySelector("#close-reminder-modal"),
  closeHistoryModal: document.querySelector("#close-history-modal"),
  cancelDelete: document.querySelector("#cancel-delete"),
  confirmDelete: document.querySelector("#confirm-delete"),
  cancelReminder: document.querySelector("#cancel-reminder"),
  sendReminderEmail: document.querySelector("#send-reminder-email"),
  confirmReminderSent: document.querySelector("#confirm-reminder-sent"),
  toastRoot: document.querySelector("#toast-root")
};

function nowIso() {
  return new Date().toISOString();
}

function formatCentralDateTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.month} ${byType.day}, ${byType.year}, ${byType.hour}:${byType.minute} ${byType.dayPeriod} CT`;
}

function getDateParts(dateString) {
  const normalized = normalizeDateInput(dateString);
  if (!normalized) {
    return null;
  }
  const [yearRaw, monthRaw, dayRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) {
    return null;
  }
  return { year, month, day, normalized };
}

function getCentralTodayParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day)
  };
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!mdy) {
    return "";
  }
  const month = mdy[1].padStart(2, "0");
  const day = mdy[2].padStart(2, "0");
  const year = mdy[3];
  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  const parts = getDateParts(dateString);
  if (!parts) {
    return "N/A";
  }
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const year = String(parts.year);
  return `${month}/${day}/${year}`;
}

function formatDisplayDate(dateString) {
  const parts = getDateParts(dateString);
  if (!parts) {
    return "N/A";
  }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
  return `${value} CT`;
}

function formatDateTime(dateString) {
  return formatCentralDateTime(dateString);
}

function toInputDate(dateString) {
  return normalizeDateInput(dateString);
}

function formatRenewalSubmitted(dateString) {
  const raw = String(dateString ?? "").trim();
  const lowered = raw.toLowerCase();
  if (lowered === "no") {
    return "";
  }
  if (!raw || raw === "0") {
    return raw;
  }
  const normalized = normalizeDateInput(raw);
  if (normalized) {
    return formatDate(normalized);
  }
  return raw;
}

function toDate(dateString) {
  const normalized = normalizeDateInput(dateString);
  if (!normalized) {
    return null;
  }
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(dateString) {
  const parts = getDateParts(dateString);
  if (!parts) {
    return null;
  }
  const targetEpochDay = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MILLIS_PER_DAY);
  const centralToday = getCentralTodayParts();
  const todayEpochDay = Math.floor(
    Date.UTC(centralToday.year, centralToday.month - 1, centralToday.day) / MILLIS_PER_DAY
  );
  return targetEpochDay - todayEpochDay;
}

function getStatus(record) {
  const days = daysUntil(record.expirationDate);
  if (days === null) {
    return "Missing Expiration";
  }
  if (days < 0) {
    return "Expired";
  }
  if (days < 30) {
    return "Due <30 Days";
  }
  if (days <= 60) {
    return "Due 30-60 Days";
  }
  return "Active";
}

function statusClass(status) {
  switch (status) {
    case "Active":
      return "status-active";
    case "Due <30 Days":
      return "status-due30";
    case "Due 30-60 Days":
      return "status-due60";
    case "Expired":
      return "status-expired";
    default:
      return "status-missing";
  }
}

function getDaysClass(days) {
  if (days === null) {
    return "days-missing";
  }
  if (days < 30) {
    return "days-danger";
  }
  if (days <= 60) {
    return "days-warning";
  }
  return "days-safe";
}

function getUrgencyModel(days) {
  if (days === null) {
    return { percent: 18, className: "urgency-missing", label: "Missing" };
  }
  if (days < 0) {
    return { percent: 100, className: "urgency-danger", label: "Expired" };
  }
  if (days < 30) {
    const percent = Math.max(65, Math.round(((30 - days) / 30) * 100));
    return { percent, className: "urgency-danger", label: "High" };
  }
  if (days <= 60) {
    const percent = Math.max(35, Math.round(((60 - days) / 30) * 60 + 30));
    return { percent, className: "urgency-warning", label: "Medium" };
  }
  const percent = days > 180 ? 10 : Math.max(12, Math.round(32 - ((days - 60) / 120) * 20));
  return { percent, className: "urgency-safe", label: "Low" };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setTableLoading(isLoading) {
  elements.tableWrap.classList.toggle("is-loading", isLoading);
}

function animateCounter(element, nextValue) {
  const current = counterValues.get(element) ?? Number(element.textContent || 0);
  if (current === nextValue) {
    element.textContent = String(nextValue);
    return;
  }

  const start = performance.now();
  const duration = 420;

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const value = Math.round(current + (nextValue - current) * progress);
    element.textContent = String(value);
    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }
    counterValues.set(element, nextValue);
  }

  requestAnimationFrame(frame);
}

function ensureRecordShape(record) {
  return {
    id: record.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    providerName: String(record.providerName || "").trim(),
    providerId: String(record.providerId || "").trim(),
    providerEmail: String(record.providerEmail || "").trim(),
    specialty: String(record.specialty || "").trim(),
    credentialType: String(record.credentialType || "").trim(),
    credentialNumber: String(record.credentialNumber || "").trim(),
    state: String(record.state || "").trim().toUpperCase(),
    issueDate: normalizeDateInput(record.issueDate),
    expirationDate: normalizeDateInput(record.expirationDate),
    renewalSubmitted: formatRenewalSubmitted(record.renewalSubmitted || ""),
    renewalApproved: (String(record.renewalApproved || "No").toLowerCase() === "yes" ? "Yes" : "No"),
    owner: String(record.owner || "").trim(),
    notes: String(record.notes || "").trim(),
    lastUpdated: record.lastUpdated || nowIso()
  };
}

function loadFallbackRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(sampleRecords).map(ensureRecordShape);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return structuredClone(sampleRecords).map(ensureRecordShape);
    }
    return parsed.map(ensureRecordShape);
  } catch {
    return structuredClone(sampleRecords).map(ensureRecordShape);
  }
}

function saveFallbackRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function loadFallbackNotificationState() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_STATE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveFallbackNotificationState() {
  localStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(state.notificationState));
}

function loadFallbackNotificationHistory() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_HISTORY_KEY);
    if (!raw) {
      return structuredClone(sampleNotificationHistory);
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return structuredClone(sampleNotificationHistory);
  }
}

function saveFallbackNotificationHistoryState() {
  localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(state.notificationHistory));
}

function recordToDb(record, userId) {
  return {
    id: record.id,
    user_id: userId,
    provider_name: record.providerName,
    npi: record.providerId,
    provider_email: record.providerEmail || "",
    specialty: record.specialty,
    credential_type: record.credentialType,
    credential_number: record.credentialNumber || "",
    state: record.state || "",
    issue_date: record.issueDate || null,
    expiration_date: record.expirationDate || null,
    renewal_submitted: record.renewalSubmitted || "",
    renewal_approved: record.renewalApproved || "No",
    owner: record.owner || "",
    notes: record.notes || "",
    last_updated: record.lastUpdated || nowIso()
  };
}

function recordFromDb(row) {
  return ensureRecordShape({
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
    lastUpdated: row.last_updated || row.created_at || nowIso()
  });
}

function historyToDb(entry, userId) {
  return {
    user_id: userId,
    provider_record_id: entry.recordId,
    provider_name: entry.providerName,
    provider_email: entry.providerEmail,
    credential_type: entry.credentialType,
    reminder_type: entry.reminderType,
    status: entry.status,
    delivery_method: entry.deliveryMethod || "",
    email_id: entry.providerResponseId || "",
    error_message: entry.errorMessage || "",
    sent_at: entry.dateSent || nowIso()
  };
}

function historyFromDb(row) {
  return {
    id: row.id,
    recordId: row.provider_record_id,
    providerName: row.provider_name,
    providerEmail: row.provider_email,
    credentialType: row.credential_type,
    reminderType: row.reminder_type,
    dateSent: row.sent_at,
    status: row.status,
    deliveryMethod: row.delivery_method || "",
    actionType: inferReminderActionType({ deliveryMethod: row.delivery_method || "", notes: row.error_message ? "Email send failed" : "" }),
    providerResponseId: row.email_id || "",
    errorMessage: row.error_message || "",
    notes: row.error_message ? "Email send failed" : ""
  };
}

function computeNotificationStateFromHistory(entries) {
  const map = {};
  for (const entry of entries) {
    const key = `${entry.recordId}|${entry.reminderType}`;
    if (!map[key] || new Date(entry.dateSent).getTime() > new Date(map[key].sentAt || map[key].failedAt || 0).getTime()) {
      map[key] = {
        status: entry.status,
        sentAt: entry.status === "Sent" ? entry.dateSent : "",
        failedAt: entry.status === "Failed" ? entry.dateSent : "",
        providerResponseId: entry.providerResponseId || "",
        errorMessage: entry.errorMessage || "",
        actionType: entry.actionType || inferReminderActionType(entry)
      };
    }
  }
  return map;
}

async function ensureProfileForCurrentUser() {
  if (!state.useSupabase || !supabase || !state.user) {
    return;
  }

  const email = state.user.email || "";
  const fullName =
    state.user.user_metadata?.full_name ||
    state.user.user_metadata?.name ||
    "";
  const organizationName = state.user.user_metadata?.organization_name || "";

  const { error } = await supabase.from("profiles").upsert(
    {
      id: state.user.id,
      email,
      full_name: fullName,
      organization_name: organizationName
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("Profile upsert warning:", error.message);
  }
}

async function loadRecordsFromSupabase() {
  const { data, error } = await supabase
    .from("provider_records")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data || []).map(recordFromDb);
}

async function loadNotificationHistoryFromSupabase() {
  const { data, error } = await supabase
    .from("notification_history")
    .select("*")
    .order("sent_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data || []).map(historyFromDb);
}

async function saveRecordToSupabase(record) {
  const payload = recordToDb(record, state.user.id);
  const { error } = await supabase.from("provider_records").upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(error.message);
  }
}

async function deleteRecordFromSupabase(recordId) {
  const { error } = await supabase.from("provider_records").delete().eq("id", recordId);
  if (error) {
    throw new Error(error.message);
  }
}

async function clearSupabaseUserData() {
  const { error: historyError } = await supabase.from("notification_history").delete().not("id", "is", null);
  if (historyError) {
    throw new Error(historyError.message);
  }
  const { error: recordsError } = await supabase.from("provider_records").delete().not("id", "is", null);
  if (recordsError) {
    throw new Error(recordsError.message);
  }
}

async function saveNotificationEntry(entry) {
  if (state.useSupabase && supabase && state.user) {
    const payload = historyToDb(entry, state.user.id);
    const { error } = await supabase.from("notification_history").insert(payload);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }
  state.notificationHistory = saveNotificationHistory(state.notificationHistory, entry);
  state.notificationState = {
    ...state.notificationState,
    [`${entry.recordId}|${entry.reminderType}`]: {
      status: entry.status,
      sentAt: entry.status === "Sent" ? entry.dateSent : "",
      failedAt: entry.status === "Failed" ? entry.dateSent : "",
      providerResponseId: entry.providerResponseId || "",
      errorMessage: entry.errorMessage || ""
    }
  };
  saveFallbackNotificationState();
  saveFallbackNotificationHistoryState();
}

async function loadAppData() {
  if (state.useSupabase && supabase && state.user) {
    const [records, history] = await Promise.all([
      loadRecordsFromSupabase(),
      loadNotificationHistoryFromSupabase()
    ]);
    state.records = records;
    state.notificationHistory = history;
    state.notificationState = computeNotificationStateFromHistory(history);
    return;
  }

  state.records = loadFallbackRecords();
  state.notificationHistory = loadFallbackNotificationHistory();
  const savedNotificationState = loadFallbackNotificationState();
  state.notificationState = Object.keys(savedNotificationState).length
    ? savedNotificationState
    : computeNotificationStateFromHistory(state.notificationHistory);
}

function summarizeRecords(records) {
  const metrics = {
    total: records.length,
    active: 0,
    due30: 0,
    due60: 0,
    expired: 0,
    missing: 0
  };
  const ownerCounts = new Map();
  let submittedNotApproved = 0;

  for (const record of records) {
    const status = getStatus(record);
    const owner = record.owner || "Unassigned";
    ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);

    const submitted = formatRenewalSubmitted(record.renewalSubmitted);
    const approved = (record.renewalApproved || "").toLowerCase() === "yes";
    if (submitted && submitted !== "0" && !approved) {
      submittedNotApproved += 1;
    }

    if (status === "Active") {
      metrics.active += 1;
    } else if (status === "Due <30 Days") {
      metrics.due30 += 1;
    } else if (status === "Due 30-60 Days") {
      metrics.due60 += 1;
    } else if (status === "Expired") {
      metrics.expired += 1;
    } else {
      metrics.missing += 1;
    }
  }

  return { metrics, ownerCounts, submittedNotApproved };
}

function formatPercent(part, total) {
  if (!total) {
    return "0%";
  }
  return `${Math.round((part / total) * 100)}%`;
}

function buildPieGradient(segments) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) {
    return "conic-gradient(#e5e7eb 0 360deg)";
  }

  let current = 0;
  const parts = [];
  for (const segment of segments) {
    if (!segment.value) {
      continue;
    }
    const start = (current / total) * 360;
    current += segment.value;
    const end = (current / total) * 360;
    parts.push(`${segment.color} ${start}deg ${end}deg`);
  }
  return `conic-gradient(${parts.join(", ")})`;
}

function renderLegend(container, segments) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  container.innerHTML = segments
    .map(
      (segment) => `
      <li>
        <span class="legend-swatch" style="background:${segment.color}"></span>
        <span class="legend-label">${escapeHtml(segment.label)}</span>
        <span class="legend-value">${segment.value} (${formatPercent(segment.value, total)})</span>
      </li>
    `
    )
    .join("");
}

function updateKpis() {
  const { metrics } = summarizeRecords(state.records);
  const compliance = metrics.total ? Math.round((metrics.active / metrics.total) * 100) : 0;
  const expiringWeek = state.records.filter((record) => {
    const days = daysUntil(record.expirationDate);
    return days !== null && days >= 0 && days <= 7;
  }).length;
  const reminderMetrics = getReminderMetrics();

  animateCounter(elements.kpiTotal, metrics.total);
  animateCounter(elements.kpiActive, metrics.active);
  animateCounter(elements.kpiDue30, metrics.due30);
  animateCounter(elements.kpiDue60, metrics.due60);
  animateCounter(elements.kpiExpired, metrics.expired);
  animateCounter(elements.kpiMissing, metrics.missing);
  animateCounter(elements.kpiWeek, expiringWeek);
  animateCounter(elements.kpiRemindersSent, reminderMetrics.sent);
  animateCounter(elements.kpiPendingReminders, reminderMetrics.pending);

  elements.complianceRing.style.setProperty("--compliance", String(compliance));
  elements.complianceScore.textContent = `${compliance}%`;
  elements.complianceRing.classList.remove("compliance-good", "compliance-warn", "compliance-risk");
  if (compliance >= 80) {
    elements.complianceRing.classList.add("compliance-good");
  } else if (compliance >= 60) {
    elements.complianceRing.classList.add("compliance-warn");
  } else {
    elements.complianceRing.classList.add("compliance-risk");
  }
}

function updateDashboard() {
  const summary = summarizeRecords(state.records);
  const { metrics, ownerCounts, submittedNotApproved } = summary;

  const statusSegments = [
    { label: "61+ Days", value: metrics.active, color: STATUS_COLORS.Active },
    { label: "Due <30 Days", value: metrics.due30, color: STATUS_COLORS["Due <30 Days"] },
    { label: "Due 30-60 Days", value: metrics.due60, color: STATUS_COLORS["Due 30-60 Days"] },
    { label: "Expired", value: metrics.expired, color: STATUS_COLORS.Expired },
    { label: "Missing Expiration", value: metrics.missing, color: STATUS_COLORS["Missing Expiration"] }
  ];

  elements.statusPie.style.setProperty("--pie-gradient", buildPieGradient(statusSegments));
  elements.statusTotal.textContent = String(metrics.total);
  renderLegend(elements.statusLegend, statusSegments);

  const ownerSegments = [...ownerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value,
      color: OWNER_COLORS[index % OWNER_COLORS.length]
    }));

  elements.ownerPie.style.setProperty("--pie-gradient", buildPieGradient(ownerSegments));
  elements.ownerTotal.textContent = String(ownerSegments.length);
  renderLegend(elements.ownerLegend, ownerSegments);

  const atRisk = metrics.expired + metrics.due30 + metrics.due60;
  animateCounter(elements.highlightRisk, atRisk);
  animateCounter(elements.highlightSubmitted, submittedNotApproved);

  const topOwner = ownerSegments[0];
  elements.highlightOwner.textContent = topOwner ? `${topOwner.label} (${topOwner.value})` : "N/A";
}

function recordMatchesFilters(record) {
  const status = getStatus(record);
  const days = daysUntil(record.expirationDate);
  const centralToday = getCentralTodayParts();

  // Quick filters are intentionally layered on top of existing search/status/owner filters.
  if (state.filters.quick === "EXPIRED" && status !== "Expired") {
    return false;
  }
  if (state.filters.quick === "DUE_MONTH") {
    const parts = getDateParts(record.expirationDate);
    if (!parts || days === null || days < 0) {
      return false;
    }
    if (parts.month !== centralToday.month || parts.year !== centralToday.year) {
      return false;
    }
  }
  if (state.filters.quick === "DUE_30" && !(days !== null && days >= 0 && days < 30)) {
    return false;
  }
  if (state.filters.quick === "MISSING" && status !== "Missing Expiration") {
    return false;
  }
  if (state.filters.quick === "ACTIVE" && status !== "Active") {
    return false;
  }

  if (state.filters.status !== "ALL" && status !== state.filters.status) {
    return false;
  }
  if (state.filters.owner !== "ALL" && record.owner !== state.filters.owner) {
    return false;
  }
  if (!state.filters.search) {
    return true;
  }

  const haystack = [
    record.providerName,
    record.providerId,
    record.providerEmail,
    record.specialty,
    record.credentialType,
    record.owner,
    record.state,
    record.notes
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(state.filters.search.toLowerCase());
}

function getSortedFilteredRecords() {
  return state.records
    .filter(recordMatchesFilters)
    .slice()
    .sort((a, b) => {
      const aDate = toDate(a.expirationDate);
      const bDate = toDate(b.expirationDate);
      if (!aDate && !bDate) {
        return a.providerName.localeCompare(b.providerName);
      }
      if (!aDate) {
        return 1;
      }
      if (!bDate) {
        return -1;
      }
      return aDate.getTime() - bDate.getTime();
    });
}

function updateOwnerFilterOptions() {
  const owners = [...new Set(state.records.map((record) => record.owner).filter(Boolean))].sort();
  const currentValue = state.filters.owner;

  elements.filterOwner.innerHTML = `<option value="ALL">All owners</option>`;
  for (const owner of owners) {
    const option = document.createElement("option");
    option.value = owner;
    option.textContent = owner;
    elements.filterOwner.append(option);
  }

  if (owners.includes(currentValue)) {
    elements.filterOwner.value = currentValue;
  } else {
    state.filters.owner = "ALL";
    elements.filterOwner.value = "ALL";
  }
}

function buildActionIcon(type) {
  if (type === "details") {
    return `
      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
  }
  if (type === "edit") {
    return `
      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L8 18l-4 1 1-4 11.5-11.5z"></path>
      </svg>
    `;
  }
  if (type === "delete") {
    return `
      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>
        <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;
  }
  return `
    <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle>
    </svg>
  `;
}

function renderEmptyState() {
  return `
    <tr>
      <td class="empty-state-cell" colspan="15">
        <div class="empty-state">
          <div class="empty-state-icon" aria-hidden="true">🩺</div>
          <h3 class="empty-state-title">No provider credential records found.</h3>
          <p class="empty-state-subtext">Import a spreadsheet or manually add provider credential records to begin tracking expirations and compliance.</p>
          <div class="empty-state-actions">
            <button class="btn-soft" type="button" data-action="import-records">Import Records</button>
            <button class="btn-soft" type="button" data-action="add-record-manual">Add Record Manually</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderTable({ animateFiltering = false } = {}) {
  const records = getSortedFilteredRecords();

  if (animateFiltering) {
    setTableLoading(true);
    elements.recordsBody.classList.add("is-filtering");
  }

  const html =
    records.length === 0
      ? renderEmptyState()
      : records
          .map((record) => {
            const days = daysUntil(record.expirationDate);
            const status = getStatus(record);
            const reminderSnapshot = getLastReminderSnapshot(record.id);
            const renewalSubmitted = formatRenewalSubmitted(record.renewalSubmitted);
            const renewal = renewalSubmitted ? `${renewalSubmitted} / ${record.renewalApproved}` : record.renewalApproved;
            const daysText = days === null ? "Missing" : days;
            const daysClass = getDaysClass(days);
            const urgency = getUrgencyModel(days);

            return `
            <tr>
              <td class="sticky-col sticky-1">${escapeHtml(record.providerId)}</td>
              <td class="sticky-col sticky-2">${escapeHtml(record.providerName)}</td>
              <td class="provider-email">${escapeHtml(formatProviderEmail(record.providerEmail))}</td>
              <td>${escapeHtml(record.specialty)}</td>
              <td>${escapeHtml(record.state || "N/A")}</td>
              <td>${escapeHtml(formatDisplayDate(record.issueDate))}</td>
              <td>${escapeHtml(formatDisplayDate(record.expirationDate))}</td>
              <td><span class="days ${daysClass}">${escapeHtml(daysText)}</span></td>
              <td>
                <div class="urgency-track" title="Urgency: ${urgency.label}">
                  <div class="urgency-fill ${urgency.className}" style="width:${urgency.percent}%"></div>
                </div>
              </td>
              <td><span class="status ${statusClass(status)}">${escapeHtml(status)}</span></td>
              <td>${escapeHtml(record.owner)}</td>
              <td>${escapeHtml(renewal)}</td>
              <td>
                <div class="reminder-summary" title="${escapeHtml(reminderSnapshot.tooltip)}">
                  <span class="reminder-badge ${reminderSnapshot.badgeClass}">${escapeHtml(reminderSnapshot.badgeLabel)}</span>
                  <span class="reminder-meta">${escapeHtml(reminderSnapshot.meta)}</span>
                </div>
              </td>
              <td class="last-updated last-updated-col">${escapeHtml(formatDateTime(record.lastUpdated))}</td>
              <td class="row-actions row-actions-cell">
                <button class="icon-btn details-btn" type="button" data-tooltip="View Details" aria-label="View Details" data-details-id="${escapeHtml(record.id)}">${buildActionIcon("details")}</button>
                <button class="icon-btn edit-btn" type="button" data-tooltip="Edit Record" aria-label="Edit Record" data-edit-id="${escapeHtml(record.id)}">${buildActionIcon("edit")}</button>
                <button class="icon-btn delete-btn" type="button" data-tooltip="Delete Record" aria-label="Delete Record" data-delete-id="${escapeHtml(record.id)}">${buildActionIcon("delete")}</button>
              </td>
            </tr>
          `;
          })
          .join("");

  const paint = () => {
    elements.recordsBody.innerHTML = html;
    updateTableScrollShadows();
    if (animateFiltering) {
      requestAnimationFrame(() => {
        elements.recordsBody.classList.remove("is-filtering");
        setTimeout(() => setTableLoading(false), 130);
      });
    }
  };

  if (animateFiltering) {
    setTimeout(paint, 80);
    return;
  }
  paint();
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastRoot.append(toast);

  const dismiss = () => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 220);
  };

  setTimeout(dismiss, 2800);
}

function openModal(modalEl) {
  elements.modalBackdrop.classList.remove("hidden");
  elements.detailsModal.classList.add("hidden");
  elements.deleteModal.classList.add("hidden");
  elements.reminderModal.classList.add("hidden");
  elements.historyModal.classList.add("hidden");
  modalEl.classList.remove("hidden");
}

function closeModals() {
  elements.modalBackdrop.classList.add("hidden");
  elements.detailsModal.classList.add("hidden");
  elements.deleteModal.classList.add("hidden");
  elements.reminderModal.classList.add("hidden");
  elements.historyModal.classList.add("hidden");
  state.isSendingReminder = false;
  elements.sendReminderEmail.disabled = false;
  elements.confirmReminderSent.disabled = false;
  elements.sendReminderEmail.textContent = "Send Email";
  state.pendingDeleteId = null;
  state.pendingReminder = null;
}

function setAuthAlert(message = "", isError = false) {
  if (!message) {
    elements.authAlert.classList.add("hidden");
    elements.authAlert.textContent = "";
    return;
  }
  elements.authAlert.classList.remove("hidden");
  elements.authAlert.textContent = message;
  elements.authAlert.style.borderColor = isError ? "#fecaca" : "#bae6fd";
  elements.authAlert.style.background = isError ? "#fef2f2" : "#eff6ff";
  elements.authAlert.style.color = isError ? "#991b1b" : "#1e3a8a";
}

function renderAuthGate() {
  if (elements.storageModeChip) {
    elements.storageModeChip.classList.remove("mode-connected", "mode-fallback");
    if (state.useSupabase) {
      elements.storageModeChip.textContent = "Supabase Connected";
      elements.storageModeChip.classList.add("mode-connected");
    } else {
      elements.storageModeChip.textContent = "Local Fallback Mode";
      elements.storageModeChip.classList.add("mode-fallback");
    }
  }

  if (!state.useSupabase) {
    elements.supabaseWarning.classList.remove("hidden");
    elements.authShell.classList.add("hidden");
    elements.appShell.classList.remove("hidden");
    elements.currentUserEmail.textContent = "Fallback Mode";
    elements.logoutBtn.classList.add("hidden");
    return;
  }

  elements.supabaseWarning.classList.add("hidden");
  if (!state.session || !state.user) {
    elements.authShell.classList.remove("hidden");
    elements.appShell.classList.add("hidden");
    return;
  }
  elements.authShell.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  elements.currentUserEmail.textContent = state.user.email || "";
  elements.logoutBtn.classList.remove("hidden");
}

async function syncSessionFromSupabase() {
  if (!state.useSupabase || !supabase) {
    state.session = null;
    state.user = null;
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setAuthAlert(error.message, true);
    return;
  }
  state.session = data.session || null;
  state.user = data.session?.user || null;
}

async function handleSignup(formData) {
  if (!supabase) {
    return;
  }
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const organizationName = String(formData.get("organizationName") || "").trim();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        organization_name: organizationName
      }
    }
  });
  if (error) {
    throw error;
  }
}

async function handleLogin(formData) {
  if (!supabase) {
    return;
  }
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
}

async function handleForgotPassword(formData) {
  if (!supabase) {
    return;
  }
  const email = String(formData.get("email") || "").trim();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: globalThis.location?.origin || "http://localhost:5173"
  });
  if (error) {
    throw error;
  }
}

function openDetailsModal(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }

  const status = getStatus(record);
  const days = daysUntil(record.expirationDate);
  const daysText = days === null ? "Missing" : String(days);
  const renewalSubmitted = formatRenewalSubmitted(record.renewalSubmitted);
  const reminderType = getReminderType(days);
  const reminderKey = getReminderStateKey(record.id, reminderType);
  const notificationStatus = getReminderStatusForRecord(
    record,
    reminderType,
    state.notificationState[reminderKey]
  );
  const history = getReminderHistoryForRecord(record.id);
  const lastReminder = history.find((entry) => entry.status === "Sent");
  const historyMarkup = history.length
    ? `
      <ol class="history-list">
        ${history
          .map(
            (entry) => {
              const delivery = entry.deliveryMethod ? ` | ${escapeHtml(entry.deliveryMethod)}` : "";
              const providerId = entry.providerResponseId ? ` | ID: ${escapeHtml(entry.providerResponseId)}` : "";
              const error = entry.errorMessage ? ` | Error: ${escapeHtml(entry.errorMessage)}` : "";
              const notes = entry.notes ? ` | ${escapeHtml(entry.notes)}` : "";
              const action = formatReminderActionType(entry.actionType || inferReminderActionType(entry));
              return `<li>${escapeHtml(action)} | ${escapeHtml(entry.reminderType)} | ${escapeHtml(entry.status)} | ${escapeHtml(formatDateTime(entry.dateSent))}${delivery}${providerId}${error}${notes}</li>`;
            }
          )
          .join("")}
      </ol>
    `
    : `<p class="history-empty">No notification history yet.</p>`;

  elements.detailsBody.innerHTML = `
    <div class="details-grid">
      <div class="detail-item wide"><label>Provider Information</label></div>
      <div class="detail-item"><label>Provider Name</label><p>${escapeHtml(record.providerName)}</p></div>
      <div class="detail-item"><label>NPI</label><p>${escapeHtml(record.providerId)}</p></div>
      <div class="detail-item"><label>Provider Email</label><p>${escapeHtml(formatProviderEmail(record.providerEmail))}</p></div>
      <div class="detail-item"><label>Specialty</label><p>${escapeHtml(record.specialty)}</p></div>
      <div class="detail-item"><label>State</label><p>${escapeHtml(record.state || "N/A")}</p></div>
      <div class="detail-item wide"><label>Credential Information</label></div>
      <div class="detail-item"><label>Credential Type</label><p>${escapeHtml(record.credentialType)}</p></div>
      <div class="detail-item"><label>Credential Number</label><p>${escapeHtml(record.credentialNumber || "N/A")}</p></div>
      <div class="detail-item"><label>Issue Date</label><p>${escapeHtml(formatDisplayDate(record.issueDate))}</p></div>
      <div class="detail-item"><label>Expiration Date</label><p>${escapeHtml(formatDisplayDate(record.expirationDate))}</p></div>
      <div class="detail-item"><label>Days Remaining</label><p class="days ${getDaysClass(days)}">${escapeHtml(daysText)}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="status ${statusClass(status)}">${escapeHtml(status)}</span></p></div>
      <div class="detail-item"><label>Owner</label><p>${escapeHtml(record.owner)}</p></div>
      <div class="detail-item"><label>Renewal Submitted</label><p>${escapeHtml(renewalSubmitted || "N/A")}</p></div>
      <div class="detail-item"><label>Renewal Approved</label><p>${escapeHtml(record.renewalApproved)}</p></div>
      <div class="detail-item"><label>Last Updated</label><p>${escapeHtml(formatDateTime(record.lastUpdated))}</p></div>
      <div class="detail-item wide"><label>Notes</label><p class="details-notes">${escapeHtml(record.notes || "No notes available")}</p></div>
      <div class="detail-item wide"><label>Notification Information</label></div>
      <div class="detail-item"><label>Reminder Type</label><p>${escapeHtml(reminderType)}</p></div>
      <div class="detail-item"><label>Notification Status</label><p><span class="notification-status ${notificationStatusClass(notificationStatus, reminderType)}">${escapeHtml(notificationStatus)}</span></p></div>
      <div class="detail-item wide"><label>Last Reminder Sent</label><p>${escapeHtml(lastReminder ? formatDateTime(lastReminder.dateSent) : "N/A")}</p></div>
      <div class="detail-item wide"><label>Notification History</label>${historyMarkup}</div>
      <div class="detail-item wide">
        <label>Credential Documents</label>
        <div class="docs-placeholder">
          <p>Document uploads will be available in a future version.</p>
        </div>
      </div>
    </div>
  `;

  openModal(elements.detailsModal);
}

function openDeleteModal(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }
  state.pendingDeleteId = recordId;
  elements.deleteMessage.textContent = "Are you sure you want to permanently delete this credential record?";
  openModal(elements.deleteModal);
}

function resetFormMode() {
  state.editingRecordId = null;
  elements.formSubmitButton.textContent = "Add Record";
}

function startEditRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) {
    return;
  }

  state.editingRecordId = id;
  elements.formSubmitButton.textContent = "Save Changes";
  elements.form.providerName.value = record.providerName || "";
  elements.form.providerId.value = record.providerId || "";
  elements.form.providerEmail.value = record.providerEmail || "";
  elements.form.specialty.value = record.specialty || "";
  elements.form.credentialType.value = record.credentialType || "";
  elements.form.credentialNumber.value = record.credentialNumber || "";
  elements.form.state.value = record.state || "";
  elements.form.issueDate.value = toInputDate(record.issueDate);
  elements.form.expirationDate.value = toInputDate(record.expirationDate);
  elements.form.renewalSubmitted.value = formatRenewalSubmitted(record.renewalSubmitted);
  elements.form.renewalApproved.value = record.renewalApproved || "No";
  elements.form.owner.value = record.owner || "";
  elements.form.notes.value = record.notes || "";

  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createRecordFromForm(formData, existingId = null) {
  const baseRecord = ensureRecordShape({
    id: existingId,
    providerName: formData.get("providerName")?.toString().trim(),
    providerId: formData.get("providerId")?.toString().trim(),
    providerEmail: formData.get("providerEmail")?.toString().trim(),
    specialty: formData.get("specialty")?.toString().trim(),
    credentialType: formData.get("credentialType")?.toString().trim(),
    credentialNumber: formData.get("credentialNumber")?.toString().trim(),
    state: formData.get("state")?.toString().trim(),
    issueDate: formData.get("issueDate")?.toString(),
    expirationDate: formData.get("expirationDate")?.toString(),
    renewalSubmitted: formData.get("renewalSubmitted")?.toString(),
    renewalApproved: formData.get("renewalApproved")?.toString(),
    owner: formData.get("owner")?.toString().trim(),
    notes: formData.get("notes")?.toString().trim(),
    lastUpdated: nowIso()
  });

  return baseRecord;
}

function isRecordValid(record) {
  return Boolean(
    record.providerName &&
      record.providerId &&
      record.specialty &&
      record.credentialType &&
      record.owner
  );
}

function isEmailValidOrBlank(email) {
  const value = String(email || "").trim();
  if (!value) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Frontend helper for real reminder sending.
// API keys must remain server-side only; never put RESEND_API_KEY in frontend code.
async function sendRealReminderEmail(reminderPayload) {
  let response;
  console.log("Sending reminder payload:", reminderPayload);
  try {
    response = await fetch(REMINDER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(reminderPayload)
    });
  } catch {
    throw new Error("Could not reach email service. Verify backend is running on port 3001.");
  }

  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  console.log("Reminder API response:", result);

  if (!response.ok) {
    const detail = Array.isArray(result?.details) ? ` (${result.details.join("; ")})` : "";
    const message = `${result?.error || "Email failed to send."}${detail}`;
    throw new Error(message);
  }

  return {
    emailId: result?.emailId || result?.id || "",
    raw: result
  };
}

function getDuplicateKey(record) {
  return `${String(record.providerId || "").trim()}|${String(record.credentialType || "").trim().toLowerCase()}`;
}

function getReminderStateKey(recordId, reminderType) {
  return `${recordId}|${reminderType}`;
}

function formatProviderEmail(email) {
  const value = String(email || "").trim();
  return value || "No Email Configured";
}

function inferReminderActionType(entry = {}) {
  const raw = `${entry.actionType || ""} ${entry.deliveryMethod || ""} ${entry.notes || ""}`.toLowerCase();
  if (raw.includes("resend")) {
    return "resend";
  }
  if (raw.includes("manual")) {
    return "manual";
  }
  return "original";
}

function formatReminderActionType(actionType) {
  if (actionType === "resend") {
    return "Resend";
  }
  if (actionType === "manual") {
    return "Manual";
  }
  return "Original";
}

function getReminderHistoryForRecord(recordId) {
  return state.notificationHistory
    .filter((entry) => entry.recordId === recordId)
    .slice()
    .sort((a, b) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
}

function getLatestReminderForRecord(recordId) {
  return getReminderHistoryForRecord(recordId)[0] || null;
}

function getReminderStatusForRecord(record, reminderType, reminderState) {
  if (!String(record.providerEmail || "").trim()) {
    return "No Email Configured";
  }

  const latest = getLatestReminderForRecord(record.id);
  if (latest?.status === "Sent") {
    return (latest.actionType || inferReminderActionType(latest)) === "resend" ? "Reminder Resent" : "Reminder Sent";
  }
  if (latest?.status === "Failed") {
    return "Failed";
  }

  const rawStatus = getNotificationStatus({
    reminderType,
    providerEmail: record.providerEmail,
    reminderState
  });
  return rawStatus === "Sent" ? "Reminder Sent" : rawStatus;
}

function getReminderMetrics() {
  const sentRecordIds = new Set(
    state.notificationHistory
      .filter((entry) => entry.status === "Sent")
      .map((entry) => entry.recordId)
  );
  const pending = getNotificationRows().filter((item) => item.notificationStatus === "Pending").length;
  return {
    sent: sentRecordIds.size,
    pending
  };
}

function buildReminderHistoryTooltip(entries) {
  if (!entries.length) {
    return "No reminder history yet.";
  }
  return entries
    .slice(0, 6)
    .map((entry) => {
      const method = entry.deliveryMethod || "Unknown";
      const action = formatReminderActionType(entry.actionType || inferReminderActionType(entry));
      const at = formatDateTime(entry.dateSent);
      const error = entry.errorMessage ? ` (${entry.errorMessage})` : "";
      return `${action} | ${entry.status} | ${method} | ${at}${error}`;
    })
    .join("\n");
}

function getLastReminderSnapshot(recordId) {
  const entries = getReminderHistoryForRecord(recordId);

  if (!entries.length) {
    return {
      badgeClass: "reminder-never",
      badgeLabel: "Never Sent",
      meta: "",
      tooltip: "No reminder history yet."
    };
  }

  const latest = entries[0];
  const when = formatDateTime(latest.dateSent);
  if (latest.status === "Failed") {
    return {
      badgeClass: "reminder-failed",
      badgeLabel: "Failed",
      meta: when,
      tooltip: buildReminderHistoryTooltip(entries)
    };
  }

  const actionType = latest.actionType || inferReminderActionType(latest);
  if (actionType === "manual") {
    return {
      badgeClass: "reminder-manual",
      badgeLabel: "Manual",
      meta: when,
      tooltip: buildReminderHistoryTooltip(entries)
    };
  }

  if (actionType === "resend") {
    return {
      badgeClass: "reminder-resent",
      badgeLabel: "Reminder Resent",
      meta: when,
      tooltip: buildReminderHistoryTooltip(entries)
    };
  }

  return {
    badgeClass: "reminder-sent",
    badgeLabel: "Reminder Sent",
    meta: when,
    tooltip: buildReminderHistoryTooltip(entries)
  };
}

function notificationStatusClass(status, reminderType) {
  switch (status) {
    case "Pending":
      return "notification-pending";
    case "Sent":
    case "Reminder Sent":
      return "notification-sent";
    case "Reminder Resent":
      return "notification-resent";
    case "Failed":
      return "notification-failed";
    case "No Email Configured":
      return "notification-no-email";
    default:
      return reminderType === "Expired" ? "notification-expired" : "notification-not-due";
  }
}

function getNotificationRows() {
  return state.records
    .map((record) => {
      const daysRemaining = daysUntil(record.expirationDate);
      const reminderType = getReminderType(daysRemaining);
      const stateKey = getReminderStateKey(record.id, reminderType);
      const reminderState = state.notificationState[stateKey];
      const notificationStatus = getReminderStatusForRecord(record, reminderType, reminderState);
      const history = getReminderHistoryForRecord(record.id);
      const lastSent = history.find((entry) => entry.status === "Sent");

      return {
        record,
        daysRemaining,
        reminderType,
        notificationStatus,
        lastReminderSent: lastSent ? lastSent.dateSent : "",
        historyCount: history.length,
        reminderState
      };
    })
    .filter((item) => {
      if (item.reminderType !== "Not Due Yet") {
        return true;
      }
      return item.notificationStatus === "No Email Configured";
    })
    .sort((a, b) => {
      const aDays = a.daysRemaining ?? Number.POSITIVE_INFINITY;
      const bDays = b.daysRemaining ?? Number.POSITIVE_INFINITY;
      return aDays - bDays;
    });
}

function notificationMatchesFilter(item) {
  if (state.notificationFilter === "ALL") {
    return true;
  }
  if (state.notificationFilter === "Expired") {
    return item.reminderType === "Expired";
  }
  return item.notificationStatus === state.notificationFilter;
}

function renderNotificationsTable() {
  const rows = getNotificationRows().filter(notificationMatchesFilter);
  if (!rows.length) {
    elements.notificationsBody.innerHTML = `
      <tr>
        <td class="empty-state-cell" colspan="9">
          <div class="empty-state">
            <div class="empty-state-icon" aria-hidden="true">📨</div>
            <h3 class="empty-state-title">No reminders match this filter.</h3>
            <p class="empty-state-subtext">Adjust notification filters to view additional reminder candidates.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  elements.notificationsBody.innerHTML = rows
    .map((item) => {
      const daysText = item.daysRemaining === null ? "Missing" : String(item.daysRemaining);
      const statusClass = notificationStatusClass(item.notificationStatus, item.reminderType);
      const sendDisabled = item.notificationStatus === "No Email Configured" || item.reminderType === "Not Due Yet";
      const actionLabel =
        item.notificationStatus === "Reminder Sent" || item.notificationStatus === "Reminder Resent"
          ? "Resend Reminder"
          : item.notificationStatus === "Failed"
            ? "Retry Reminder"
            : "Send Reminder";
      return `
        <tr>
          <td>${escapeHtml(item.record.providerName)}</td>
          <td class="provider-email">${escapeHtml(formatProviderEmail(item.record.providerEmail))}</td>
          <td>${escapeHtml(item.record.credentialType)}</td>
          <td>${escapeHtml(formatDisplayDate(item.record.expirationDate))}</td>
          <td><span class="days ${getDaysClass(item.daysRemaining)}">${escapeHtml(daysText)}</span></td>
          <td>${escapeHtml(item.reminderType)}</td>
          <td><span class="notification-status ${statusClass}">${escapeHtml(item.notificationStatus)}</span></td>
          <td>${escapeHtml(item.lastReminderSent ? formatDateTime(item.lastReminderSent) : "N/A")}</td>
          <td>
            <div class="notification-actions">
              <button class="btn-soft" type="button" data-open-reminder="${escapeHtml(item.record.id)}" ${sendDisabled ? "disabled" : ""}>
                ${escapeHtml(actionLabel)}
              </button>
              <button class="btn-link" type="button" data-history-id="${escapeHtml(item.record.id)}" ${item.historyCount ? "" : "disabled"}>
                View History
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function openReminderModal(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }
  const daysRemaining = daysUntil(record.expirationDate);
  const reminderType = getReminderType(daysRemaining);
  const email = formatProviderEmail(record.providerEmail);
  if (email === "No Email Configured") {
    showToast("No email configured", "warn");
    return;
  }

  const history = getReminderHistoryForRecord(record.id);
  const latest = history[0] || null;
  const hasSuccessfulReminder = history.some((entry) => entry.status === "Sent");
  const isResend = hasSuccessfulReminder;
  const actionType = isResend ? "resend" : "original";
  const emailPreview = buildReminderEmail({
    providerName: record.providerName,
    providerEmail: email,
    credentialType: record.credentialType,
    expirationDate: record.expirationDate,
    daysRemaining: daysRemaining ?? "N/A",
    reminderType
  });

  state.pendingReminder = {
    recordId: record.id,
    reminderType,
    to: email,
    actionType,
    payload: {
      providerName: record.providerName,
      providerEmail: email,
      credentialType: record.credentialType,
      expirationDate: formatDisplayDate(record.expirationDate),
      daysRemaining: daysRemaining === null ? "Missing" : String(daysRemaining),
      reminderType,
      subject: emailPreview.subject,
      html: emailPreview.html,
      text: emailPreview.text
    }
  };

  const resendNotice = isResend
    ? `
      <div class="resend-confirmation">
        <strong>Confirm resend</strong>
        <p>This reminder was last sent ${escapeHtml(formatDateTime(latest.dateSent))}. Resending will email ${escapeHtml(email)} again and add a new history entry.</p>
      </div>
    `
    : "";

  document.querySelector("#reminder-title").textContent = isResend ? "Confirm Resend Reminder" : "Reminder Email Preview";
  elements.sendReminderEmail.textContent = isResend ? "Confirm Resend" : "Send Email";
  elements.confirmReminderSent.classList.toggle("hidden", isResend);
  elements.reminderBody.innerHTML = `
    <div class="reminder-preview">
      ${resendNotice}
      <div class="preview-block">
        <p class="preview-label">To</p>
        <p class="preview-value">${escapeHtml(emailPreview.to)}</p>
      </div>
      <div class="preview-block">
        <p class="preview-label">Subject</p>
        <p class="preview-value">${escapeHtml(emailPreview.subject)}</p>
      </div>
      <div class="preview-block">
        <p class="preview-label">Credential Type</p>
        <p class="preview-value">${escapeHtml(record.credentialType)}</p>
      </div>
      <div class="preview-block">
        <p class="preview-label">Expiration Date</p>
        <p class="preview-value">${escapeHtml(formatDisplayDate(record.expirationDate))}</p>
      </div>
      <div class="preview-block">
        <p class="preview-label">Days Remaining</p>
        <p class="preview-value">${escapeHtml(daysRemaining === null ? "Missing" : String(daysRemaining))}</p>
      </div>
      <div class="preview-block">
        <p class="preview-label">Reminder Type</p>
        <p class="preview-value">${escapeHtml(reminderType)}</p>
      </div>
      <div class="preview-block">
        <p class="preview-label">Email Body</p>
        <p class="preview-body">${escapeHtml(emailPreview.body)}</p>
      </div>
    </div>
  `;

  openModal(elements.reminderModal);
}

function openReminderHistoryModal(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }
  const entries = getReminderHistoryForRecord(recordId);
  const rows = entries.length
    ? entries
        .map((entry) => {
          const action = formatReminderActionType(entry.actionType || inferReminderActionType(entry));
          const statusClass = notificationStatusClass(entry.status, entry.reminderType);
          const error = entry.errorMessage ? `<span class="history-error">${escapeHtml(entry.errorMessage)}</span>` : "";
          return `
            <tr>
              <td>${escapeHtml(formatDateTime(entry.dateSent))}</td>
              <td>${escapeHtml(entry.providerEmail || formatProviderEmail(record.providerEmail))}</td>
              <td>${escapeHtml(entry.reminderType)}</td>
              <td>${escapeHtml(action)}</td>
              <td><span class="notification-status ${statusClass}">${escapeHtml(entry.status)}</span>${error}</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="5" class="history-empty">No reminder history yet.</td>
      </tr>
    `;

  document.querySelector("#history-title").textContent = `Reminder History - ${record.providerName}`;
  elements.historyBody.innerHTML = `
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Recipient</th>
            <th>Type</th>
            <th>Action</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  openModal(elements.historyModal);
}

async function sendReminderEmailNow() {
  if (state.isSendingReminder) {
    return;
  }
  if (!state.pendingReminder) {
    showToast("No reminder payload loaded. Please open reminder preview again.", "error");
    return;
  }
  const record = state.records.find((item) => item.id === state.pendingReminder.recordId);
  if (!record) {
    return;
  }
  if (!isEmailValidOrBlank(state.pendingReminder.to) || state.pendingReminder.to === "No Email Configured") {
    showToast("No email configured", "warn");
    return;
  }

  const actionType = state.pendingReminder.actionType || "original";
  const isResend = actionType === "resend";
  const previousLabel = elements.sendReminderEmail.textContent;
  state.isSendingReminder = true;
  elements.sendReminderEmail.disabled = true;
  elements.confirmReminderSent.disabled = true;
  elements.sendReminderEmail.textContent = isResend ? "Resending..." : "Sending...";

  try {
    const response = await sendRealReminderEmail(state.pendingReminder.payload);
    const now = nowIso();
    const result = simulateSendReminder({
      record,
      reminderType: state.pendingReminder.reminderType,
      reminderEmail: state.pendingReminder.to,
      reminderState: state.notificationState,
      nowIso: now,
      status: "Sent",
      deliveryMethod: `${formatReminderActionType(actionType)} - Nodemailer Email`,
      actionType,
      providerResponseId: response.emailId,
      notes: isResend ? "Reminder resent via Nodemailer" : "Reminder sent via Nodemailer"
    });

    state.notificationState = result.state;
    if (state.useSupabase && supabase && state.user) {
      state.notificationHistory = saveNotificationHistory(state.notificationHistory, result.historyItem);
      runRender({ animateFiltering: true });
    }

    let historySaved = true;
    try {
      await saveNotificationEntry(result.historyItem);
      if (state.useSupabase && supabase && state.user) {
        state.notificationHistory = await loadNotificationHistoryFromSupabase();
        state.notificationState = computeNotificationStateFromHistory(state.notificationHistory);
      }
    } catch (historyError) {
      historySaved = false;
      console.error("Reminder history save failed:", historyError);
    }

    if (historySaved) {
      showToast(`${isResend ? "Reminder Resent" : "Reminder Sent"} • ${formatDateTime(now)}`, "success");
    } else {
      showToast("Email sent, but reminder history could not be saved.", "warn");
    }
    runRender({ animateFiltering: true });
    closeModals();
  } catch (error) {
    const realError = error instanceof Error ? error.message : "Unknown email error";
    const now = nowIso();
    const result = simulateSendReminder({
      record,
      reminderType: state.pendingReminder.reminderType,
      reminderEmail: state.pendingReminder.to,
      reminderState: state.notificationState,
      nowIso: now,
      status: "Failed",
      deliveryMethod: `${formatReminderActionType(actionType)} - Nodemailer Email`,
      actionType,
      errorMessage: realError,
      notes: isResend ? "Reminder resend failed" : "Email send failed"
    });
    state.notificationState = result.state;
    try {
      await saveNotificationEntry(result.historyItem);
      if (state.useSupabase && supabase && state.user) {
        state.notificationHistory = await loadNotificationHistoryFromSupabase();
        state.notificationState = computeNotificationStateFromHistory(state.notificationHistory);
      }
    } catch (historyError) {
      console.error("Failed reminder history save failed:", historyError);
    }
    showToast(`${isResend ? "Resend" : "Email"} failed: ${realError}`, "error");
    runRender({ animateFiltering: true });
  } finally {
    state.isSendingReminder = false;
    elements.sendReminderEmail.disabled = false;
    elements.confirmReminderSent.disabled = false;
    elements.sendReminderEmail.textContent = previousLabel;
  }
}

async function markReminderAsSentManually() {
  if (!state.pendingReminder) {
    return;
  }
  const record = state.records.find((item) => item.id === state.pendingReminder.recordId);
  if (!record) {
    return;
  }

  const now = nowIso();
  const result = simulateSendReminder({
    record,
    reminderType: state.pendingReminder.reminderType,
    reminderEmail: state.pendingReminder.to,
    reminderState: state.notificationState,
    nowIso: now,
    status: "Sent",
    deliveryMethod: "Manual",
    actionType: "manual",
    notes: "Marked as sent manually"
  });

  try {
    state.notificationState = result.state;
    await saveNotificationEntry(result.historyItem);
    if (state.useSupabase && supabase && state.user) {
      state.notificationHistory = await loadNotificationHistoryFromSupabase();
      state.notificationState = computeNotificationStateFromHistory(state.notificationHistory);
    }
    showToast("Reminder marked as sent", "success");
    runRender({ animateFiltering: true });
    closeModals();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Failed to save reminder history.", "error");
  }
}

function runRender({ animateFiltering = false } = {}) {
  updateOwnerFilterOptions();
  updateKpis();
  updateDashboard();
  renderTable({ animateFiltering });
  renderNotificationsTable();
  updateTableScrollShadows();
}

async function addRecordFromForm(formData) {
  const record = createRecordFromForm(formData, state.editingRecordId || undefined);
  if (!isRecordValid(record)) {
    showToast("Please fill required fields before saving.", "error");
    return false;
  }
  if (!isEmailValidOrBlank(record.providerEmail)) {
    showToast("Please enter a valid provider email.", "error");
    return false;
  }

  if (state.editingRecordId) {
    const index = state.records.findIndex((item) => item.id === state.editingRecordId);
    if (index >= 0) {
      const previousEmail = String(state.records[index].providerEmail || "").trim();
      state.records[index] = record;
      if (state.useSupabase && supabase && state.user) {
        await saveRecordToSupabase(record);
      }
      showToast("Record updated successfully", "success");
      if (!previousEmail && record.providerEmail) {
        showToast("Provider email added", "info");
      }
    }
  } else {
    state.records.unshift(record);
    if (state.useSupabase && supabase && state.user) {
      await saveRecordToSupabase(record);
    }
    showToast("Record added successfully", "success");
    if (record.providerEmail) {
      showToast("Provider email added", "info");
    }
  }

  resetFormMode();
  if (!state.useSupabase) {
    saveFallbackRecords();
  }
  runRender({ animateFiltering: true });
  return true;
}

async function deleteRecord(id) {
  const nextRecords = state.records.filter((record) => record.id !== id);
  if (nextRecords.length === state.records.length) {
    return;
  }

  if (state.useSupabase && supabase && state.user) {
    await deleteRecordFromSupabase(id);
  }

  state.records = nextRecords;
  state.notificationHistory = state.notificationHistory.filter((entry) => entry.recordId !== id);
  state.notificationState = Object.fromEntries(
    Object.entries(state.notificationState).filter(([key]) => !key.startsWith(`${id}|`))
  );
  if (state.editingRecordId === id) {
    resetFormMode();
    elements.form.reset();
  }

  if (!state.useSupabase) {
    saveFallbackRecords();
    saveFallbackNotificationState();
    saveFallbackNotificationHistoryState();
  }
  showToast("Record deleted successfully", "warn");
  runRender({ animateFiltering: true });
}

function exportCsv() {
  const rows = getSortedFilteredRecords();
  const headers = [
    "Provider Name",
    "NPI",
    "Provider Email",
    "Specialty",
    "Credential Type",
    "Credential Number",
    "State",
    "Issue Date",
    "Expiration Date",
    "Renewal Submitted",
    "Renewal Approved",
    "Owner",
    "Notes"
  ];

  const lines = [headers.join(",")];
  for (const record of rows) {
    const values = [
      record.providerName,
      record.providerId,
      record.providerEmail,
      record.specialty,
      record.credentialType,
      record.credentialNumber,
      record.state,
      formatDate(record.issueDate),
      formatDate(record.expirationDate),
      formatRenewalSubmitted(record.renewalSubmitted),
      record.renewalApproved,
      record.owner,
      record.notes
    ];
    lines.push(values.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateLabel = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `providerops_tracker_${dateLabel}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast("CSV exported", "info");
}

function downloadTemplateCsv() {
  const csv = createTemplateCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "providerops_tracker_import_template.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importFromCsvFile(file) {
  try {
    const text = await file.text();
    const { records } = parseCsvRecords(text);

    if (!records.length) {
      showToast("Import failed: no data rows found", "error");
      return;
    }

    // Duplicate detection key: NPI + Credential Type.
    const existingByKey = new Map(state.records.map((record) => [getDuplicateKey(record), record]));
    const importByKey = new Map();

    for (const imported of records) {
      const candidate = ensureRecordShape({
        ...imported,
        issueDate: normalizeDateInput(imported.issueDate),
        expirationDate: normalizeDateInput(imported.expirationDate),
        renewalSubmitted: imported.renewalSubmitted,
        lastUpdated: nowIso()
      });

      if (!isRecordValid(candidate)) {
        continue;
      }

      const key = getDuplicateKey(candidate);
      if (!key || key === "|") {
        continue;
      }
      importByKey.set(key, candidate);
    }

    let created = 0;
    let updated = 0;

    for (const [key, candidate] of importByKey.entries()) {
      const existing = existingByKey.get(key);
      if (existing) {
        // Merge by updating the existing record in place, preserving id continuity.
        Object.assign(existing, {
          ...candidate,
          id: existing.id,
          lastUpdated: nowIso()
        });
        if (state.useSupabase && supabase && state.user) {
          await saveRecordToSupabase(existing);
        }
        updated += 1;
      } else {
        state.records.unshift(candidate);
        if (state.useSupabase && supabase && state.user) {
          await saveRecordToSupabase(candidate);
        }
        created += 1;
      }
    }

    if (!state.useSupabase) {
      saveFallbackRecords();
    }
    runRender({ animateFiltering: true });
    showToast(`CSV imported successfully (${created} added, ${updated} updated)`, "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file format.";
    showToast(`Import failed: ${message}`, "error");
  }
}

function bindEvents() {
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.form);
    try {
      const saved = await addRecordFromForm(formData);
      if (saved) {
        elements.form.reset();
        resetFormMode();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save record.", "error");
    }
  });

  elements.filterSearch.addEventListener("input", () => {
    state.filters.search = elements.filterSearch.value.trim();
    renderTable({ animateFiltering: true });
  });

  elements.filterStatus.addEventListener("change", () => {
    state.filters.status = elements.filterStatus.value;
    renderTable({ animateFiltering: true });
  });

  elements.filterOwner.addEventListener("change", () => {
    state.filters.owner = elements.filterOwner.value;
    renderTable({ animateFiltering: true });
  });

  elements.quickFilters.forEach((button) => {
    button.addEventListener("click", () => {
      state.filters.quick = button.dataset.quickFilter || "ALL";
      elements.quickFilters.forEach((item) => item.classList.toggle("active", item === button));
      renderTable({ animateFiltering: true });
    });
  });

  elements.notificationFilters.forEach((button) => {
    button.addEventListener("click", () => {
      state.notificationFilter = button.dataset.notificationFilter || "ALL";
      elements.notificationFilters.forEach((item) => item.classList.toggle("active", item === button));
      renderNotificationsTable();
    });
  });

  elements.clearFilters.addEventListener("click", () => {
    state.filters = { search: "", status: "ALL", owner: "ALL", quick: "ALL" };
    elements.filterSearch.value = "";
    elements.filterStatus.value = "ALL";
    elements.filterOwner.value = "ALL";
    elements.quickFilters.forEach((item) =>
      item.classList.toggle("active", item.dataset.quickFilter === "ALL")
    );
    renderTable({ animateFiltering: true });
  });

  elements.exportCsv.addEventListener("click", exportCsv);

  elements.importCsv.addEventListener("click", () => elements.importFile.click());

  elements.importFile.addEventListener("change", async () => {
    const file = elements.importFile.files?.[0];
    if (!file) {
      return;
    }
    await importFromCsvFile(file);
    elements.importFile.value = "";
  });

  elements.downloadTemplate.addEventListener("click", downloadTemplateCsv);

  elements.resetData.addEventListener("click", async () => {
    try {
      state.records = structuredClone(sampleRecords).map(ensureRecordShape);
      state.notificationHistory = structuredClone(sampleNotificationHistory);
      state.notificationState = computeNotificationStateFromHistory(state.notificationHistory);
      state.notificationFilter = "ALL";
      if (state.useSupabase && supabase && state.user) {
        await clearSupabaseUserData();
        for (const sample of state.records) {
          await saveRecordToSupabase(sample);
        }
        for (const entry of state.notificationHistory) {
          await saveNotificationEntry(entry);
        }
      }
      resetFormMode();
      elements.form.reset();
      if (!state.useSupabase) {
        saveFallbackRecords();
        saveFallbackNotificationState();
        saveFallbackNotificationHistoryState();
      }
      elements.notificationFilters.forEach((item) =>
        item.classList.toggle("active", item.dataset.notificationFilter === "ALL")
      );
      runRender({ animateFiltering: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to reset data.", "error");
    }
  });

  elements.recordsBody.addEventListener("click", (event) => {
    // Use closest() so SVG/icon clicks still trigger the matching action button.
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const actionButton = target.closest("[data-action]");
    const addFirst = actionButton instanceof HTMLElement ? actionButton.dataset.action : undefined;
    if (addFirst === "add-record-manual") {
      elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (addFirst === "import-records") {
      elements.importFile.click();
      return;
    }

    const detailsButton = target.closest("[data-details-id]");
    const detailsId =
      detailsButton instanceof HTMLElement ? detailsButton.dataset.detailsId : undefined;
    if (detailsId) {
      openDetailsModal(detailsId);
      return;
    }

    const editButton = target.closest("[data-edit-id]");
    const editId = editButton instanceof HTMLElement ? editButton.dataset.editId : undefined;
    if (editId) {
      startEditRecord(editId);
      return;
    }

    const deleteButton = target.closest("[data-delete-id]");
    const deleteId =
      deleteButton instanceof HTMLElement ? deleteButton.dataset.deleteId : undefined;
    if (deleteId) {
      openDeleteModal(deleteId);
    }
  });

  elements.notificationsBody.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const historyButton = target.closest("[data-history-id]");
    const historyId = historyButton instanceof HTMLElement ? historyButton.dataset.historyId : undefined;
    if (historyId) {
      openReminderHistoryModal(historyId);
      return;
    }

    const reminderButton = target.closest("[data-open-reminder]");
    const recordId =
      reminderButton instanceof HTMLElement ? reminderButton.dataset.openReminder : undefined;
    if (recordId) {
      openReminderModal(recordId);
    }
  });

  elements.closeDetailsModal.addEventListener("click", closeModals);
  elements.closeDeleteModal.addEventListener("click", closeModals);
  elements.closeReminderModal.addEventListener("click", closeModals);
  elements.closeHistoryModal.addEventListener("click", closeModals);
  elements.cancelDelete.addEventListener("click", closeModals);
  elements.cancelReminder.addEventListener("click", closeModals);

  elements.confirmDelete.addEventListener("click", async () => {
    try {
      if (state.pendingDeleteId) {
        await deleteRecord(state.pendingDeleteId);
      }
      closeModals();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to delete record.", "error");
    }
  });

  elements.sendReminderEmail.addEventListener("click", async () => {
    await sendReminderEmailNow();
  });

  elements.confirmReminderSent.addEventListener("click", async () => {
    await markReminderAsSentManually();
  });

  elements.signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await handleSignup(new FormData(elements.signupForm));
      setAuthAlert("Sign-up successful. Check your email for verification, then log in.");
      elements.signupForm.reset();
    } catch (error) {
      setAuthAlert(error instanceof Error ? error.message : "Sign-up failed.", true);
    }
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await handleLogin(new FormData(elements.loginForm));
      setAuthAlert("Login successful.");
      elements.loginForm.reset();
    } catch (error) {
      setAuthAlert(error instanceof Error ? error.message : "Login failed.", true);
    }
  });

  elements.forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await handleForgotPassword(new FormData(elements.forgotForm));
      setAuthAlert("Password reset email sent. Check your inbox.");
      elements.forgotForm.reset();
    } catch (error) {
      setAuthAlert(error instanceof Error ? error.message : "Password reset failed.", true);
    }
  });

  elements.logoutBtn.addEventListener("click", async () => {
    if (state.useSupabase && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        showToast(error.message, "error");
      }
    }
  });

  elements.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === elements.modalBackdrop) {
      closeModals();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modalBackdrop.classList.contains("hidden")) {
      closeModals();
    }
  });

  elements.tableWrap.addEventListener("scroll", updateTableScrollShadows);
  elements.notificationsTableWrap.addEventListener("scroll", updateTableScrollShadows);
}

function updateTableScrollShadows() {
  const { scrollLeft, clientWidth, scrollWidth } = elements.tableWrap;
  elements.tableWrap.classList.toggle("show-left", scrollLeft > 4);
  elements.tableWrap.classList.toggle("show-right", scrollLeft + clientWidth < scrollWidth - 4);

  if (elements.notificationsTableWrap) {
    const { scrollLeft: nLeft, clientWidth: nClient, scrollWidth: nWidth } = elements.notificationsTableWrap;
    elements.notificationsTableWrap.classList.toggle("show-left", nLeft > 4);
    elements.notificationsTableWrap.classList.toggle("show-right", nLeft + nClient < nWidth - 4);
  }
}

async function refreshAuthenticatedData() {
  setTableLoading(true);
  try {
    await loadAppData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data.";
    showToast(message, "error");
    if (!state.useSupabase) {
      state.records = loadFallbackRecords();
      state.notificationState = loadFallbackNotificationState();
      state.notificationHistory = loadFallbackNotificationHistory();
    }
  }
  setTableLoading(false);
  runRender();
}

async function init() {
  elements.asOfDate.textContent = formatCentralDateTime(new Date());

  // Keep feature scaffold in place for upcoming backend/auth extensions.
  void APP_FEATURE_FLAGS;
  void EMAIL_PROVIDER_PLACEHOLDERS;

  bindEvents();

  if (!state.useSupabase || !supabase) {
    renderAuthGate();
    await refreshAuthenticatedData();
    return;
  }

  await syncSessionFromSupabase();
  if (state.user) {
    await ensureProfileForCurrentUser();
  }
  renderAuthGate();
  if (state.user) {
    await refreshAuthenticatedData();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session || null;
    state.user = session?.user || null;
    if (state.user) {
      await ensureProfileForCurrentUser();
      setAuthAlert("");
      renderAuthGate();
      await refreshAuthenticatedData();
      return;
    }

    state.records = [];
    state.notificationHistory = [];
    state.notificationState = {};
    renderAuthGate();
    runRender();
  });
}

void init();

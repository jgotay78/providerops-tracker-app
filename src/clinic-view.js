import "./clinic-view.css";
import { parseCsvRecords } from "./csv-tools.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import {
  getClinicContactEmail,
  isEmail,
  migrateLocalClinicAssignments,
  normalizeClinicName,
  persistClinicContactEmail
} from "./clinic-data.js";

const RECORDS_KEY = "credentialing-tracker-v1";
let clinicViewerMode = false;
let viewerClinics = [];
let uiObserver = null;

function clean(value) {
  return String(value ?? "").trim();
}

function setLeadingLabelText(label, text) {
  if (!label) return;
  const first = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (first) first.textContent = `${text} `;
}

function ensureClinicContactInput() {
  const form = document.querySelector("#record-form");
  if (!form || form.elements.namedItem("clinicContactEmail")) return;

  const ownerInput = form.elements.namedItem("owner");
  const ownerLabel = ownerInput?.closest("label");
  if (!ownerLabel) return;

  const label = document.createElement("label");
  label.dataset.clinicContactField = "true";
  label.innerHTML = `Designated Clinic Contact Email
    <input name="clinicContactEmail" type="email" placeholder="practice.manager@clinic.org" />`;
  ownerLabel.insertAdjacentElement("afterend", label);
}

function currentClinicInput() {
  const form = document.querySelector("#record-form");
  const ownerInput = form?.elements.namedItem("owner");
  return ownerInput instanceof HTMLInputElement ? ownerInput : null;
}

function currentContactInput() {
  const form = document.querySelector("#record-form");
  const input = form?.elements.namedItem("clinicContactEmail");
  return input instanceof HTMLInputElement ? input : null;
}

function hydrateContactInput() {
  const clinicInput = currentClinicInput();
  const contactInput = currentContactInput();
  if (!clinicInput || !contactInput) return;

  const normalized = normalizeClinicName(clinicInput.value);
  if (normalized && clinicInput.value !== normalized) clinicInput.value = normalized;
  if (!contactInput.value && normalized) {
    contactInput.value = getClinicContactEmail(normalized);
  }
}

function replaceLegacyClinicNames(root = document) {
  const replacements = [
    ["Maria Gomez", "Horizon Medical Clinic"],
    ["Noah Reed", "Lakeside Pediatric & Family Care"],
    ["Kira Stone", "Northstar Specialty Clinic"]
  ];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    let value = node.nodeValue || "";
    let next = value;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== value) node.nodeValue = next;
  }
}

function relabelUi() {
  ensureClinicContactInput();

  const form = document.querySelector("#record-form");
  const clinicInput = form?.elements.namedItem("owner");
  setLeadingLabelText(clinicInput?.closest("label"), "Clinic / Practice");

  const note = document.querySelector(".provider-form-note");
  if (note) {
    note.textContent = "Enter an existing NPI to reuse provider information. Assign the provider to a clinic and add the designated clinic contact email. Duplicate credentials remain blocked by provider, credential type, and state.";
  }

  const search = document.querySelector("#filter-search");
  if (search instanceof HTMLInputElement) search.placeholder = "Provider, NPI, specialty, clinic...";
  const directorySearch = document.querySelector("#provider-directory-search");
  if (directorySearch instanceof HTMLInputElement) directorySearch.placeholder = "Search provider, NPI, specialty, clinic or credential...";

  const filter = document.querySelector("#filter-owner");
  setLeadingLabelText(filter?.closest("label"), "Clinic");
  const allOption = filter?.querySelector('option[value="ALL"]');
  if (allOption) allOption.textContent = "All clinics";

  const ownerTotalLabel = document.querySelector("#owner-total")?.parentElement?.querySelector("span");
  if (ownerTotalLabel) ownerTotalLabel.textContent = "Clinics";
  const ownerChartTitle = document.querySelector("#owner-pie")?.closest(".chart-card")?.querySelector("h3");
  if (ownerChartTitle) ownerChartTitle.textContent = "Credential Workload by Clinic";

  const topQueue = document.querySelector("#highlight-owner")?.closest(".highlight")?.querySelector("h4");
  if (topQueue) topQueue.textContent = "Largest Clinic Queue";

  document.querySelectorAll("th").forEach((th) => {
    if (th.textContent?.trim() === "Owner") th.textContent = "Clinic";
  });

  document.querySelectorAll(".credential-meta span").forEach((span) => {
    if (span.textContent?.trim() === "Credential owner") span.textContent = "Clinic";
  });

  replaceLegacyClinicNames(document.querySelector("#app-shell") || document);
  hydrateContactInput();
  applyViewerMode();
}

function showClinicToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `provider-toast ${type}`;
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3400);
}

async function persistContactToSupabase(clinic, contactEmail) {
  if (!isSupabaseConfigured || !supabase || !clinic) return;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return;

    const { error } = await supabase
      .from("provider_records")
      .update({
        owner: clinic,
        clinic_name: clinic,
        clinic_contact_email: contactEmail || null
      })
      .eq("user_id", user.id)
      .eq("owner", clinic);

    if (error && !/clinic_name|clinic_contact_email/i.test(error.message || "")) {
      console.warn("Clinic assignment sync warning:", error.message);
    }
  } catch (error) {
    console.warn("Clinic assignment sync warning:", error);
  }
}

function bindFormClinicFields() {
  if (document.documentElement.dataset.clinicFormBound === "true") return;
  document.documentElement.dataset.clinicFormBound = "true";

  document.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "owner") return;
    const clinic = normalizeClinicName(target.value);
    target.value = clinic;
    const contactInput = currentContactInput();
    if (contactInput && !contactInput.value) contactInput.value = getClinicContactEmail(clinic);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    if (target.closest("[data-edit-id], [data-provider-action='edit'], [data-add-provider-credential]")) {
      setTimeout(hydrateContactInput, 180);
      setTimeout(hydrateContactInput, 550);
    }
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "record-form") return;

    const clinicInput = currentClinicInput();
    const contactInput = currentContactInput();
    if (!clinicInput || !contactInput) return;

    const clinic = normalizeClinicName(clinicInput.value);
    const contactEmail = clean(contactInput.value);
    clinicInput.value = clinic;

    if (!isEmail(contactEmail)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showClinicToast("Please enter a valid designated clinic contact email.", "error");
      contactInput.focus();
      return;
    }

    persistClinicContactEmail(clinic, contactEmail);
    setTimeout(() => void persistContactToSupabase(clinic, contactEmail), 650);
  }, true);

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== "import-file") return;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { records } = parseCsvRecords(text);
      for (const record of records) {
        const clinic = normalizeClinicName(record.clinicName || record.owner);
        const contact = clean(record.clinicContactEmail);
        if (clinic && contact) persistClinicContactEmail(clinic, contact);
      }
    } catch {
      // The normal import workflow owns user-facing CSV errors.
    }
  }, true);
}

async function hydrateSupabaseClinicAccess() {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("provider_records")
      .select("user_id,owner,clinic_name,clinic_contact_email");

    if (error) return;

    for (const row of data || []) {
      const clinic = normalizeClinicName(row.clinic_name || row.owner);
      const contact = clean(row.clinic_contact_email);
      if (clinic && contact) persistClinicContactEmail(clinic, contact);
    }

    const email = clean(user.email).toLowerCase();
    const sharedRows = (data || []).filter((row) => {
      const contact = clean(row.clinic_contact_email).toLowerCase();
      return contact && contact === email && row.user_id !== user.id;
    });

    if (sharedRows.length) {
      clinicViewerMode = true;
      viewerClinics = [...new Set(sharedRows.map((row) => normalizeClinicName(row.clinic_name || row.owner)).filter(Boolean))];
      applyViewerMode();
    }
  } catch {
    // Older Supabase schemas simply continue in owner/editor mode.
  }
}

function applyViewerMode() {
  if (!clinicViewerMode) return;
  document.body.classList.add("clinic-viewer-mode");

  const formPanel = document.querySelector("#record-form")?.closest("section.panel");
  if (formPanel) formPanel.hidden = true;

  const panel = document.querySelector("#provider-directory-panel");
  if (panel && !panel.querySelector(".clinic-view-banner")) {
    const banner = document.createElement("div");
    banner.className = "clinic-view-banner";
    banner.innerHTML = `<strong>Clinic View</strong><span>${viewerClinics.join(", ")} · Read-only provider access</span>`;
    panel.prepend(banner);
  }
}

function observeUi() {
  if (uiObserver) return;
  uiObserver = new MutationObserver(() => relabelUi());
  uiObserver.observe(document.body, { childList: true, subtree: true });
}

async function startClinicView() {
  const migration = migrateLocalClinicAssignments();
  if (migration.changed && !isSupabaseConfigured) {
    globalThis.location?.reload();
    return;
  }

  bindFormClinicFields();
  relabelUi();
  observeUi();
  await hydrateSupabaseClinicAccess();
  relabelUi();
}

setTimeout(() => void startClinicView(), 80);

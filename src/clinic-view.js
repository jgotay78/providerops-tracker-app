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

let clinicViewerMode = false;
let viewerClinics = [];
let uiObserver = null;
let relabelTimer = null;

function clean(value) {
  return String(value ?? "").trim();
}

function setTextIfDifferent(element, value) {
  if (!element) return;
  if (element.textContent !== value) element.textContent = value;
}

function setLeadingLabelText(label, value) {
  if (!label) return;
  const first = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  const next = `${value} `;
  if (first && first.nodeValue !== next) first.nodeValue = next;
}

function ensureClinicContactInput() {
  const form = document.querySelector("#record-form");
  if (!form || form.elements.namedItem("clinicContactEmail")) return;

  const clinicInput = form.elements.namedItem("owner");
  const clinicLabel = clinicInput?.closest("label");
  if (!clinicLabel) return;

  const label = document.createElement("label");
  label.dataset.clinicContactField = "true";
  label.innerHTML = `Designated Clinic Contact Email
    <input name="clinicContactEmail" type="email" placeholder="practice.manager@clinic.org" autocomplete="email" />`;
  clinicLabel.insertAdjacentElement("afterend", label);
}

function currentClinicInput() {
  const input = document.querySelector("#record-form")?.elements.namedItem("owner");
  return input instanceof HTMLInputElement ? input : null;
}

function currentContactInput() {
  const input = document.querySelector("#record-form")?.elements.namedItem("clinicContactEmail");
  return input instanceof HTMLInputElement ? input : null;
}

function hydrateContactInput() {
  const clinicInput = currentClinicInput();
  const contactInput = currentContactInput();
  if (!clinicInput || !contactInput) return;

  const clinic = normalizeClinicName(clinicInput.value);
  if (clinic && clinicInput.value !== clinic) clinicInput.value = clinic;
  if (!contactInput.value && clinic) contactInput.value = getClinicContactEmail(clinic);
}

function relabelCredentialClinicText() {
  document.querySelectorAll(".credential-meta").forEach((meta) => {
    const span = meta.querySelector("span");
    if (span?.textContent?.trim() === "Credential owner") setTextIfDifferent(span, "Clinic");
  });
}

function relabelUi() {
  ensureClinicContactInput();

  const form = document.querySelector("#record-form");
  const clinicInput = form?.elements.namedItem("owner");
  setLeadingLabelText(clinicInput?.closest("label"), "Clinic / Practice");

  const note = document.querySelector(".provider-form-note");
  setTextIfDifferent(
    note,
    "Enter an existing NPI to reuse provider information. Assign the provider to a clinic and add the designated clinic contact email. Duplicate credentials remain blocked by provider, credential type, and state."
  );

  const search = document.querySelector("#filter-search");
  if (search instanceof HTMLInputElement && search.placeholder !== "Provider, NPI, specialty, clinic...") {
    search.placeholder = "Provider, NPI, specialty, clinic...";
  }

  const directorySearch = document.querySelector("#provider-directory-search");
  if (
    directorySearch instanceof HTMLInputElement &&
    directorySearch.placeholder !== "Search provider, NPI, specialty, clinic or credential..."
  ) {
    directorySearch.placeholder = "Search provider, NPI, specialty, clinic or credential...";
  }

  const filter = document.querySelector("#filter-owner");
  setLeadingLabelText(filter?.closest("label"), "Clinic");
  setTextIfDifferent(filter?.querySelector('option[value="ALL"]'), "All clinics");

  setTextIfDifferent(document.querySelector("#owner-total")?.parentElement?.querySelector("span"), "Clinics");
  setTextIfDifferent(
    document.querySelector("#owner-pie")?.closest(".chart-card")?.querySelector("h3"),
    "Credential Workload by Clinic"
  );
  setTextIfDifferent(
    document.querySelector("#highlight-owner")?.closest(".highlight")?.querySelector("h4"),
    "Largest Clinic Queue"
  );

  document.querySelectorAll("th").forEach((th) => {
    if (th.textContent?.trim() === "Owner") setTextIfDifferent(th, "Clinic");
  });

  relabelCredentialClinicText();
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

  document.addEventListener(
    "focusout",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.name !== "owner") return;
      const clinic = normalizeClinicName(target.value);
      target.value = clinic;
      const contactInput = currentContactInput();
      if (contactInput && !contactInput.value) contactInput.value = getClinicContactEmail(clinic);
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      if (target.closest("[data-edit-id], [data-provider-action='edit'], [data-add-provider-credential]")) {
        setTimeout(hydrateContactInput, 180);
        setTimeout(hydrateContactInput, 550);
      }
    },
    true
  );

  document.addEventListener(
    "submit",
    (event) => {
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
    },
    true
  );

  document.addEventListener(
    "change",
    async (event) => {
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
        // The regular import flow owns the visible CSV error handling.
      }
    },
    true
  );
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
      viewerClinics = [
        ...new Set(sharedRows.map((row) => normalizeClinicName(row.clinic_name || row.owner)).filter(Boolean))
      ];
      applyViewerMode();
    }
  } catch {
    // Older Supabase schemas continue in normal editor mode.
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
    const strong = document.createElement("strong");
    strong.textContent = "Clinic View";
    const span = document.createElement("span");
    span.textContent = `${viewerClinics.join(", ")} · Read-only provider access`;
    banner.append(strong, span);
    panel.prepend(banner);
  }
}

function scheduleRelabel() {
  clearTimeout(relabelTimer);
  relabelTimer = setTimeout(relabelUi, 40);
}

function observeUi() {
  if (uiObserver || !document.body) return;

  uiObserver = new MutationObserver((records) => {
    const hasNewElement = records.some((record) =>
      [...record.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)
    );
    if (hasNewElement) scheduleRelabel();
  });

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

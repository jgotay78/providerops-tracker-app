import "./provider-view.css";
import "./provider-table-view.css";
import "./clinic-view.css";
import { getClinicContactEmail, normalizeClinicName } from "./clinic-data.js";

const PREFERRED_CREDENTIAL_ORDER = [
  "State License",
  "DEA",
  "Malpractice Insurance",
  "Board Certification",
  "BLS",
  "ACLS"
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(node, selector) {
  return node?.querySelector(selector)?.textContent?.trim() || "";
}

function parseProviderCard(card) {
  const secondary = text(card, ".provider-card-head .provider-secondary");
  const separatorIndex = secondary.indexOf(" · ");
  const specialty = separatorIndex >= 0 ? secondary.slice(0, separatorIndex) : secondary;
  const email = separatorIndex >= 0 ? secondary.slice(separatorIndex + 3) : "";
  const npi = text(card, ".provider-npi").replace(/^NPI\s+/i, "");
  const riskBadge = card.querySelector(".provider-name-line .provider-risk-badge");
  const nextExpiration = text(card, ".provider-risk strong");
  const addButton = card.querySelector("[data-add-provider-credential]");

  const credentials = [...card.querySelectorAll(".provider-credential")].map((credential) => {
    const metas = [...credential.querySelectorAll(".credential-meta")];
    const main = credential.querySelector(".credential-main");
    const type = text(main, "strong") || "Credential";
    const stateNumber = text(main, "span");
    const expiration = text(metas[0], "strong");
    const days = text(metas[0], "span");
    const statusBadge = metas[1]?.querySelector(".provider-risk-badge");
    const clinic = normalizeClinicName(text(metas[2], "strong"));
    const actions = credential.querySelector(".credential-actions");

    return {
      type,
      stateNumber,
      expiration,
      days,
      status: statusBadge?.textContent?.trim() || "",
      statusClass: statusBadge?.className || "provider-risk-badge",
      clinic,
      actionsHtml: actions?.innerHTML || ""
    };
  });

  const clinic = normalizeClinicName(credentials.find((credential) => credential.clinic)?.clinic || "");
  const clinicContactEmail = getClinicContactEmail(clinic);

  return {
    name: text(card, ".provider-name-line h3") || "Unnamed Provider",
    npi,
    specialty,
    email,
    clinic,
    clinicContactEmail,
    risk: riskBadge?.textContent?.trim() || "",
    riskClass: riskBadge?.className || "provider-risk-badge",
    nextExpiration,
    addCredentialHtml: addButton?.outerHTML || "",
    credentials
  };
}

function orderedCredentialTypes(providers) {
  const found = new Set();
  providers.forEach((provider) => provider.credentials.forEach((credential) => found.add(credential.type)));
  const preferred = PREFERRED_CREDENTIAL_ORDER.filter((type) => found.has(type));
  const extras = [...found].filter((type) => !PREFERRED_CREDENTIAL_ORDER.includes(type)).sort((a, b) => a.localeCompare(b));
  return [...preferred, ...extras];
}

function credentialCell(credentials) {
  if (!credentials.length) {
    return `<div class="matrix-empty-cell">—</div>`;
  }

  return credentials.map((credential) => `
    <div class="matrix-credential-record">
      <div class="matrix-credential-number">${escapeHtml(credential.stateNumber || "No number")}</div>
      <div class="matrix-expiration">${escapeHtml(credential.expiration || "Missing")}</div>
      <div class="matrix-days">${escapeHtml(credential.days || "")}</div>
      <span class="${escapeHtml(credential.statusClass)}">${escapeHtml(credential.status)}</span>
      <div class="matrix-actions">${credential.actionsHtml}</div>
    </div>
  `).join("");
}

function buildMatrix(cards) {
  const providers = cards.map(parseProviderCard);
  const credentialTypes = orderedCredentialTypes(providers);

  const header = `
    <thead>
      <tr>
        <th class="matrix-sticky-provider">Provider</th>
        <th>NPI</th>
        <th>Specialty</th>
        <th>Provider Email</th>
        <th>Clinic / Practice</th>
        <th>Clinic Contact Email</th>
        ${credentialTypes.map((type) => `<th class="matrix-credential-heading">${escapeHtml(type)}</th>`).join("")}
        <th>Next Expiration</th>
        <th>Overall Status</th>
        <th>Actions</th>
      </tr>
    </thead>`;

  const rows = providers.map((provider) => `
    <tr>
      <td class="matrix-sticky-provider matrix-provider-name"><strong>${escapeHtml(provider.name)}</strong></td>
      <td class="matrix-npi">${escapeHtml(provider.npi)}</td>
      <td>${escapeHtml(provider.specialty || "—")}</td>
      <td class="matrix-email">${escapeHtml(provider.email || "—")}</td>
      <td class="matrix-clinic"><strong>${escapeHtml(provider.clinic || "Unassigned clinic")}</strong></td>
      <td class="matrix-clinic-contact">${escapeHtml(provider.clinicContactEmail || "No clinic contact configured")}</td>
      ${credentialTypes.map((type) => `<td class="matrix-credential-cell">${credentialCell(provider.credentials.filter((credential) => credential.type === type))}</td>`).join("")}
      <td class="matrix-next-expiration">${escapeHtml(provider.nextExpiration || "—")}</td>
      <td><span class="${escapeHtml(provider.riskClass)}">${escapeHtml(provider.risk)}</span></td>
      <td class="matrix-provider-actions">${provider.addCredentialHtml}</td>
    </tr>
  `).join("");

  return `
    <div class="provider-matrix-scroll" role="region" aria-label="Provider credential matrix" tabindex="0">
      <table class="provider-matrix">
        ${header}
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="matrix-scroll-hint">← Scroll left or right to view clinic and credential columns →</div>
  `;
}

function horizontalizeDirectory() {
  const list = document.querySelector("#provider-directory-list");
  if (!list) return;

  const cards = [...list.querySelectorAll(":scope > .provider-card")];
  if (!cards.length) return;

  list.innerHTML = buildMatrix(cards);
  list.classList.add("provider-list-matrix");

  const subtitle = document.querySelector(".provider-directory-title p");
  if (subtitle) {
    subtitle.textContent = "One provider per row, assigned to a clinic with a designated contact. Scroll horizontally to review credentials.";
  }
}

function startMatrixView() {
  const startObserver = () => {
    const list = document.querySelector("#provider-directory-list");
    if (!list) {
      setTimeout(startObserver, 100);
      return;
    }

    horizontalizeDirectory();
    new MutationObserver(() => horizontalizeDirectory()).observe(list, { childList: true });
  };

  startObserver();
}

startMatrixView();

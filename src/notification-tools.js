const REMINDER_THRESHOLDS = [60, 30, 14, 7];

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${month}/${day}/${year}`;
}

function fallbackEmail(email) {
  return String(email || "").trim() || "No Email Configured";
}

function formatReminderWindow(reminderType, daysRemaining) {
  if (reminderType === "Expired") {
    return "already expired";
  }
  if (reminderType === "7-Day") {
    return "in 7 days";
  }
  if (reminderType === "14-Day") {
    return "in 14 days";
  }
  if (reminderType === "30-Day") {
    return "in 30 days";
  }
  if (reminderType === "60-Day") {
    return "in 60 days";
  }
  if (typeof daysRemaining === "number") {
    return `in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
  }
  return "soon";
}

export function getReminderType(daysRemaining) {
  if (daysRemaining === null || Number.isNaN(daysRemaining)) {
    return "Not Due Yet";
  }
  if (daysRemaining < 0) {
    return "Expired";
  }
  if (daysRemaining <= REMINDER_THRESHOLDS[3]) {
    return "7-Day";
  }
  if (daysRemaining <= REMINDER_THRESHOLDS[2]) {
    return "14-Day";
  }
  if (daysRemaining <= REMINDER_THRESHOLDS[1]) {
    return "30-Day";
  }
  if (daysRemaining <= REMINDER_THRESHOLDS[0]) {
    return "60-Day";
  }
  return "Not Due Yet";
}

export function getNotificationStatus({ reminderType, providerEmail, reminderState }) {
  if (!String(providerEmail || "").trim()) {
    return "No Email Configured";
  }

  if (reminderType === "Not Due Yet") {
    return "Not Due Yet";
  }

  if (reminderState?.status === "Sent") {
    return "Sent";
  }

  if (reminderState?.status === "Failed") {
    return "Failed";
  }

  return "Pending";
}

export function buildReminderSubject({ credentialType, reminderType, daysRemaining }) {
  const credential = String(credentialType || "Credential").trim();
  if (reminderType === "Expired") {
    return `Expired Credential Notice: ${credential} is expired`;
  }
  if (reminderType === "7-Day" || (typeof daysRemaining === "number" && daysRemaining <= 7)) {
    return `Urgent Credential Notice: ${credential} expires in 7 days`;
  }
  return `Credential Expiration Reminder: ${credential} expires ${formatReminderWindow(reminderType, daysRemaining)}`;
}

function buildReminderTextContent({ providerName, credentialType, expirationDate, daysRemaining, reminderType }) {
  const expDate = formatDate(expirationDate);
  const greetingName = String(providerName || "Provider").trim();

  const detailLine =
    reminderType === "Expired"
      ? `Our records show your ${credentialType} credential expired on ${expDate}.`
      : `Our records show your ${credentialType} credential is scheduled to expire on ${expDate} (${formatReminderWindow(reminderType, daysRemaining)}).`;

  return [
    `Hello ${greetingName},`,
    "",
    detailLine,
    "Please submit updated documentation to the credentialing team as soon as possible.",
    "If this has already been submitted, please disregard or contact the credentialing team.",
    "",
    "Thank you,",
    "ProviderOps Tracker Credentialing Team"
  ].join("\n");
}

function buildReminderHtmlContent({ providerName, credentialType, expirationDate, daysRemaining, reminderType }) {
  const expDate = formatDate(expirationDate);
  const windowText = formatReminderWindow(reminderType, daysRemaining);
  const intro =
    reminderType === "Expired"
      ? `Our records show your <strong>${credentialType}</strong> credential expired on <strong>${expDate}</strong>.`
      : `Our records show your <strong>${credentialType}</strong> credential is scheduled to expire on <strong>${expDate}</strong> (${windowText}).`;

  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.5;">
      <p>Hello ${providerName},</p>
      <p>${intro}</p>
      <p>Please submit updated documentation to the credentialing team as soon as possible.</p>
      <p>If this has already been submitted, please disregard or contact the credentialing team.</p>
      <p>Thank you,<br/>ProviderOps Tracker Credentialing Team</p>
    </div>
  `;
}

export function buildReminderEmail({
  providerName,
  providerEmail,
  credentialType,
  expirationDate,
  daysRemaining,
  reminderType
}) {
  const to = fallbackEmail(providerEmail);
  const safeProviderName = String(providerName || "Provider").trim();
  const safeCredentialType = String(credentialType || "Credential").trim();
  const subject = buildReminderSubject({
    credentialType: safeCredentialType,
    reminderType,
    daysRemaining
  });
  const text = buildReminderTextContent({
    providerName: safeProviderName,
    credentialType: safeCredentialType,
    expirationDate,
    daysRemaining,
    reminderType
  });
  const html = buildReminderHtmlContent({
    providerName: safeProviderName,
    credentialType: safeCredentialType,
    expirationDate,
    daysRemaining,
    reminderType
  });

  return {
    to,
    subject,
    body: text,
    text,
    html
  };
}

export function saveNotificationHistory(historyEntries, historyItem) {
  return [historyItem, ...historyEntries].slice(0, 250);
}

export function simulateSendReminder({
  record,
  reminderType,
  reminderEmail,
  reminderState,
  nowIso,
  status = "Sent",
  deliveryMethod = "Manual",
  providerResponseId = "",
  errorMessage = "",
  notes = "",
  actionType = "original"
}) {
  const key = `${record.id}|${reminderType}`;
  const nextState = {
    ...reminderState,
    [key]: {
      status,
      sentAt: status === "Sent" ? nowIso : "",
      failedAt: status === "Failed" ? nowIso : "",
      providerResponseId,
      errorMessage,
      actionType
    }
  };

  return {
    state: nextState,
    historyItem: {
      id: `${nowIso}-${record.id}`,
      recordId: record.id,
      providerName: record.providerName,
      providerEmail: fallbackEmail(reminderEmail),
      credentialType: record.credentialType,
      reminderType,
      dateSent: nowIso,
      status,
      deliveryMethod,
      actionType,
      providerResponseId,
      errorMessage,
      actionType,
      notes
    }
  };
}

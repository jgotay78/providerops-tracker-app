import express from "express";
import { sendReminderEmail } from "../services/emailService.js";

export const reminderRouter = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function validateReminderPayload(body) {
  const errors = [];

  if (!String(body.providerEmail || "").trim()) {
    errors.push("providerEmail is required");
  } else if (!isValidEmail(body.providerEmail)) {
    errors.push("providerEmail must be a valid email address");
  }

  if (!String(body.subject || "").trim()) {
    errors.push("subject is required");
  }

  if (!String(body.html || "").trim() && !String(body.text || "").trim()) {
    errors.push("html or text content is required");
  }

  return errors;
}

reminderRouter.post("/send-reminder", async (req, res) => {
  const payload = req.body || {};
  const errors = validateReminderPayload(payload);

  if (errors.length) {
    res.status(400).json({ error: "Validation failed", details: errors });
    return;
  }

  try {
    const info = await sendReminderEmail({
      to: String(payload.providerEmail).trim(),
      subject: String(payload.subject).trim(),
      html: String(payload.html || "").trim(),
      text: String(payload.text || "").trim(),
      reminderType: payload.reminderType
    });

    res.status(200).json({
      success: true,
      provider: "nodemailer",
      emailId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 502);
    const message = error instanceof Error ? error.message : "Reminder email failed to send.";
    res.status(statusCode).json({
      success: false,
      error: message,
      provider: "nodemailer",
      code: error?.code || "SMTP_SEND_FAILED"
    });
  }
});

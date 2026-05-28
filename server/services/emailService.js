import "../config/env.js";
import nodemailer from "nodemailer";
import { Resend } from "resend";

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function getSafeErrorDetails(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || "UNKNOWN",
    command: error?.command || "",
    responseCode: error?.responseCode || "",
    message: error instanceof Error ? error.message : "Unexpected email provider error"
  };
}

function createProvider() {
  const resendApiKey = env("RESEND_API_KEY");
  if (resendApiKey) {
    return {
      mode: "resend",
      providerName: "Resend",
      provider: new Resend(resendApiKey)
    };
  }

  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");

  if (host && user && pass) {
    console.log("SMTP credentials detected; using Nodemailer fallback");
    return {
      mode: "smtp",
      providerName: "Nodemailer",
      provider: nodemailer.createTransport({
        host,
        port: Number(env("SMTP_PORT", "587")),
        secure: env("SMTP_SECURE", "false").toLowerCase() === "true",
        family: 4,
        auth: { user, pass }
      })
    };
  }

  console.log("Email provider credentials not detected; using demo-json mode");
  return {
    mode: "demo-json",
    providerName: "Nodemailer",
    provider: nodemailer.createTransport({ jsonTransport: true })
  };
}

const { mode, providerName, provider } = createProvider();

export function getEmailProviderName() {
  return providerName;
}

export function getEmailTransportMode() {
  return mode;
}

async function sendWithResend({ from, replyTo, to, subject, html, text, reminderType }) {
  const response = await provider.emails.send({
    from,
    to: [to],
    subject,
    html: html || undefined,
    text: text || undefined,
    replyTo: replyTo || undefined,
    tags: [
      { name: "app", value: "providerops-tracker" },
      { name: "reminder_type", value: String(reminderType || "unknown") }
    ]
  });

  if (response.error) {
    const error = new Error(response.error.message || "Resend email send failed");
    error.code = response.error.name || "RESEND_SEND_FAILED";
    throw error;
  }

  return {
    provider: "resend",
    messageId: response.data?.id || "",
    accepted: [to],
    rejected: []
  };
}

async function sendWithNodemailer({ from, replyTo, to, subject, html, text, reminderType }) {
  const info = await provider.sendMail({
    from,
    to,
    replyTo,
    subject,
    html: html || undefined,
    text: text || undefined,
    headers: {
      "X-ProviderOps-Reminder-Type": String(reminderType || "unknown")
    }
  });

  return {
    provider: mode === "smtp" ? "nodemailer" : "nodemailer-demo",
    messageId: info.messageId || "",
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    preview: typeof info.message === "string" ? info.message : ""
  };
}

export async function sendReminderEmail({ to, subject, html, text, reminderType }) {
  const from = env("FROM_EMAIL", "ProviderOps Tracker <no-reply@providerops.local>");
  const replyTo = env("REPLY_TO_EMAIL", "credentialing@providerops.local");

  try {
    if (mode === "resend") {
      return await sendWithResend({ from, replyTo, to, subject, html, text, reminderType });
    }
    return await sendWithNodemailer({ from, replyTo, to, subject, html, text, reminderType });
  } catch (error) {
    const safeDetails = getSafeErrorDetails(error);
    console.error("Reminder email send failed", { provider: mode, ...safeDetails });
    const publicError = new Error("Reminder email failed to send. Check email provider configuration or connectivity.");
    publicError.code = safeDetails.code;
    publicError.provider = mode === "resend" ? "resend" : "nodemailer";
    publicError.statusCode = 502;
    throw publicError;
  }
}

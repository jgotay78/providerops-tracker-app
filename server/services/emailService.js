import "../config/env.js";
import nodemailer from "nodemailer";

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function createTransporter() {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");

  if (host && user && pass) {
    console.log("SMTP credentials detected");
    return {
      mode: "smtp",
      transporter: nodemailer.createTransport({
        host,
        port: Number(env("SMTP_PORT", "587")),
        secure: env("SMTP_SECURE", "false").toLowerCase() === "true",
        auth: { user, pass }
      })
    };
  }

  console.log("SMTP credentials not detected; using demo-json mode");
  return {
    mode: "demo-json",
    transporter: nodemailer.createTransport({ jsonTransport: true })
  };
}

const { mode, transporter } = createTransporter();

export function getEmailTransportMode() {
  return mode;
}

export async function sendReminderEmail({ to, subject, html, text, reminderType }) {
  const from = env("FROM_EMAIL", "ProviderOps Tracker <no-reply@providerops.local>");
  const replyTo = env("REPLY_TO_EMAIL", "credentialing@providerops.local");

  const info = await transporter.sendMail({
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
    messageId: info.messageId || "",
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    preview: typeof info.message === "string" ? info.message : ""
  };
}

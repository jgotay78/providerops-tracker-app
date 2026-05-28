import "./config/env.js";
import cors from "cors";
import express from "express";
import { reminderRouter } from "./routes/reminders.js";
import { getEmailProviderName, getEmailTransportMode } from "./services/emailService.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const configuredOrigins = String(process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  "https://providerops-tracker-app.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  if (allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS. Set CLIENT_ORIGIN on the backend.`));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "providerops-reminder-service",
    emailProvider: getEmailProviderName(),
    transportMode: getEmailTransportMode()
  });
});

app.use("/api", reminderRouter);

app.listen(port, () => {
  console.log(`ProviderOps reminder API running on port ${port}`);
  const providerName = getEmailProviderName();
  if (providerName === "Resend") {
    console.log("Email provider: Resend");
    return;
  }
  console.log(`Email provider: ${providerName} (${getEmailTransportMode()} mode)`);
});

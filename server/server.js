import "./config/env.js";
import cors from "cors";
import express from "express";
import { reminderRouter } from "./routes/reminders.js";
import { getEmailTransportMode } from "./services/emailService.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const configuredOrigins = String(process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
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
    emailProvider: "nodemailer",
    transportMode: getEmailTransportMode()
  });
});

app.use("/api", reminderRouter);

app.listen(port, () => {
  console.log(`ProviderOps reminder API running on port ${port}`);
  console.log(`Email provider: Nodemailer (${getEmailTransportMode()} mode)`);
});

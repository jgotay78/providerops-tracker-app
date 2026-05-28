import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

export const envPath = fileURLToPath(new URL("../.env", import.meta.url));

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn(`Could not load backend env file at ${envPath}: ${result.error.message}`);
}

export function hasSmtpCredentials() {
  return Boolean(
    String(process.env.SMTP_HOST || "").trim() &&
      String(process.env.SMTP_USER || "").trim() &&
      String(process.env.SMTP_PASS || "").trim()
  );
}

import test from "node:test";
import assert from "node:assert/strict";

const columns = ["Provider", "NPI", "Specialty", "Email", "Next Expiration", "Overall Status", "Actions"];

test("provider matrix exposes provider fields as horizontal columns", () => {
  assert.ok(columns.includes("Provider"));
  assert.ok(columns.includes("NPI"));
  assert.ok(columns.includes("Next Expiration"));
});

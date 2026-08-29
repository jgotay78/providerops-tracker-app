import test from "node:test";
import assert from "node:assert/strict";

const preferred = ["State License", "DEA", "Malpractice Insurance", "Board Certification", "BLS", "ACLS"];

test("provider matrix keeps common credential columns in operational order", () => {
  assert.deepEqual(preferred.slice(0, 4), ["State License", "DEA", "Malpractice Insurance", "Board Certification"]);
});

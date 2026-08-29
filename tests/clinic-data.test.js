import test from "node:test";
import assert from "node:assert/strict";
import { isEmail, normalizeClinicName } from "../src/clinic-data.js";

test("legacy assignee names are normalized to clinic names", () => {
  assert.equal(normalizeClinicName("Maria Gomez"), "Horizon Medical Clinic");
  assert.equal(normalizeClinicName("Noah Reed"), "Lakeside Pediatric & Family Care");
  assert.equal(normalizeClinicName("Kira Stone"), "Northstar Specialty Clinic");
});

test("existing clinic names remain unchanged", () => {
  assert.equal(normalizeClinicName("Rockwall Behavioral Health"), "Rockwall Behavioral Health");
});

test("clinic contact email validation accepts blank or valid email", () => {
  assert.equal(isEmail(""), true);
  assert.equal(isEmail("practice.manager@clinic.org"), true);
  assert.equal(isEmail("not-an-email"), false);
});

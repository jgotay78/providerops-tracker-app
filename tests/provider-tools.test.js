import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeCredentialRecords,
  findDuplicateCredential,
  getCredentialIdentity,
  groupRecordsByProvider,
  uniqueProviderCount
} from "../src/provider-tools.js";

const records = [
  {
    id: "a",
    providerId: "1234567890",
    providerName: "Avery Brooks",
    credentialType: "State License",
    state: "TX",
    credentialNumber: "TX-1",
    lastUpdated: "2026-01-01T00:00:00Z"
  },
  {
    id: "b",
    providerId: "1234567890",
    providerName: "Avery Brooks",
    credentialType: "DEA",
    state: "TX",
    credentialNumber: "DEA-1",
    lastUpdated: "2026-01-02T00:00:00Z"
  },
  {
    id: "c",
    providerId: "2222222222",
    providerName: "Jordan Patel",
    credentialType: "State License",
    state: "FL",
    credentialNumber: "FL-1",
    lastUpdated: "2026-01-03T00:00:00Z"
  }
];

test("one provider can own multiple different credentials without becoming duplicate providers", () => {
  const groups = groupRecordsByProvider(records);
  assert.equal(groups.length, 2);
  const avery = groups.find((provider) => provider.npi === "1234567890");
  assert.equal(avery.credentials.length, 2);
  assert.equal(uniqueProviderCount(records), 2);
});

test("same NPI, credential type, and state is treated as the same credential", () => {
  const candidate = {
    providerId: "1234567890",
    credentialType: "state license",
    state: "tx",
    credentialNumber: "NEW-NUMBER"
  };
  assert.equal(getCredentialIdentity(candidate), "1234567890|state license|TX");
  assert.equal(findDuplicateCredential(records, candidate)?.id, "a");
});

test("same credential type in a different state remains a separate credential", () => {
  const candidate = {
    providerId: "1234567890",
    credentialType: "State License",
    state: "FL"
  };
  assert.equal(findDuplicateCredential(records, candidate), null);
});

test("dedupe keeps the most recently updated version of a credential", () => {
  const duplicate = {
    ...records[0],
    id: "a-new",
    credentialNumber: "TX-NEW",
    lastUpdated: "2026-02-01T00:00:00Z"
  };
  const cleaned = dedupeCredentialRecords([...records, duplicate]);
  assert.equal(cleaned.length, 3);
  const winner = cleaned.find((record) => getCredentialIdentity(record) === "1234567890|state license|TX");
  assert.equal(winner.id, "a-new");
  assert.equal(winner.credentialNumber, "TX-NEW");
});

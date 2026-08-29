import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReminderEmail,
  buildReminderSubject,
  getNotificationStatus,
  getReminderType,
  saveNotificationHistory,
  simulateSendReminder
} from "../src/notification-tools.js";

test("maps expiration windows to the expected reminder bucket", () => {
  assert.equal(getReminderType(61), "Not Due Yet");
  assert.equal(getReminderType(60), "60-Day");
  assert.equal(getReminderType(30), "30-Day");
  assert.equal(getReminderType(14), "14-Day");
  assert.equal(getReminderType(7), "7-Day");
  assert.equal(getReminderType(0), "7-Day");
  assert.equal(getReminderType(-1), "Expired");
});

test("urgent subjects use the actual number of days remaining", () => {
  assert.equal(
    buildReminderSubject({ credentialType: "DEA", reminderType: "7-Day", daysRemaining: 3 }),
    "Urgent Credential Notice: DEA expires in 3 days"
  );
  assert.equal(
    buildReminderSubject({ credentialType: "State License", reminderType: "7-Day", daysRemaining: 1 }),
    "Urgent Credential Notice: State License expires in 1 day"
  );
  assert.equal(
    buildReminderSubject({ credentialType: "BLS", reminderType: "7-Day", daysRemaining: 0 }),
    "Urgent Credential Notice: BLS expires today"
  );
});

test("email HTML escapes provider-entered values", () => {
  const email = buildReminderEmail({
    providerName: '<img src=x onerror="alert(1)">',
    providerEmail: "provider@example.com",
    credentialType: "DEA <script>alert(1)</script>",
    expirationDate: "2026-09-01",
    daysRemaining: 4,
    reminderType: "7-Day"
  });

  assert.equal(email.to, "provider@example.com");
  assert.doesNotMatch(email.html, /<script>|<img/i);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /&lt;img/);
});

test("notification status reflects missing email and send state", () => {
  assert.equal(getNotificationStatus({ reminderType: "7-Day", providerEmail: "", reminderState: {} }), "No Email Configured");
  assert.equal(getNotificationStatus({ reminderType: "Not Due Yet", providerEmail: "a@b.com", reminderState: {} }), "Not Due Yet");
  assert.equal(getNotificationStatus({ reminderType: "7-Day", providerEmail: "a@b.com", reminderState: { status: "Sent" } }), "Sent");
  assert.equal(getNotificationStatus({ reminderType: "7-Day", providerEmail: "a@b.com", reminderState: {} }), "Pending");
});

test("send simulation records a clean history item", () => {
  const nowIso = "2026-08-28T20:00:00.000Z";
  const result = simulateSendReminder({
    record: { id: "r1", providerName: "Avery Brooks", credentialType: "DEA" },
    reminderType: "7-Day",
    reminderEmail: "avery@example.com",
    reminderState: {},
    nowIso,
    providerResponseId: "msg_123"
  });

  assert.equal(result.state["r1|7-Day"].status, "Sent");
  assert.equal(result.historyItem.providerResponseId, "msg_123");
  assert.equal(result.historyItem.actionType, "original");
});

test("notification history keeps the newest 250 entries", () => {
  const existing = Array.from({ length: 250 }, (_, index) => ({ id: `old-${index}` }));
  const next = saveNotificationHistory(existing, { id: "new" });
  assert.equal(next.length, 250);
  assert.equal(next[0].id, "new");
  assert.equal(next.at(-1).id, "old-248");
});

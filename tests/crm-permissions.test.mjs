import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessClient } from "../lib/crm-permissions.ts";

const staff = { id: "staff-a", teamName: "Team A", role: "staff", isActive: true };
const client = { ownerMemberId: "staff-b", teamName: "Team A" };
test("staff can upload only for their own client", () => {
  assert.equal(canAccessClient(staff, client), false);
  assert.equal(canAccessClient(staff, { ...client, ownerMemberId: staff.id }), true);
});
test("team heads can upload for their team but cannot cross teams", () => {
  const head = { ...staff, role: "head" };
  assert.equal(canAccessClient(head, client, "Team A"), true);
  assert.equal(canAccessClient(head, client, "Team B"), false);
});
test("management sees all clients; inactive accounts cannot access files", () => {
  assert.equal(canAccessClient({ ...staff, role: "admin" }, client, "Team B"), true);
  assert.equal(canAccessClient({ ...staff, role: "manager" }, client, "Team B"), true);
  assert.equal(canAccessClient({ ...staff, role: "admin", isActive: false }, client), false);
});
test("blank team names never grant team-wide access", () => {
  assert.equal(canAccessClient({ ...staff, role: "head", teamName: "" }, { ...client, teamName: "" }), false);
});

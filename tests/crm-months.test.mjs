import assert from "node:assert/strict";
import { test } from "node:test";
import { carryForwardPlan } from "../lib/crm-months.ts";

const project = { id: "project-1", clientId: "client-1", ownerMemberId: "staff-1", stage: "l5", completedAt: null, createdAt: "2026-10-05", revenueId: "october", expectedRevenueMinor: 70000000, expectedMarginMinor: 10500000 };
const october = { id: "october", pipelineItemId: null, revenueMonth: "2026-10", projectedRevenueMinor: 50000000, projectedMarginMinor: 7500000, actualRevenueMinor: 12000000 };

test("billed and confirmed projects carry projection only, preserving source actuals", () => {
  const source = structuredClone(october);
  const plan = carryForwardPlan([project], [october], "2026-10", "2026-11");
  assert.equal(plan.entries[0].projectedRevenueMinor, 50000000);
  assert.equal(plan.entries[0].actualRevenueMinor, null);
  assert.equal(plan.entries[0].revenueMonth, "2026-11");
  assert.deepEqual(october, source);
});

test("completed, lost, on-hold and future projects are excluded", () => {
  const rows = [{ ...project, completedAt: "2026-10-31" }, { ...project, stage: "lost" }, { ...project, stage: "on_hold" }, { ...project, createdAt: "2026-11-01" }];
  assert.equal(carryForwardPlan(rows, [october], "2026-10", "2026-11").entries.length, 0);
});

test("repeating the carry-forward skips the existing project/month", () => {
  const november = { ...october, id: "november", pipelineItemId: project.id, revenueMonth: "2026-11" };
  const plan = carryForwardPlan([project], [october, november], "2026-10", "2026-11");
  assert.equal(plan.entries.length, 0);
  assert.equal(plan.skipped, 1);
});

test("separate projects never match another project's source amount", () => {
  const second = { ...project, id: "project-2", revenueId: null, clientId: "client-2" };
  const plan = carryForwardPlan([project, second], [october], "2026-10", "2026-11");
  assert.equal(plan.entries.length, 2);
  assert.equal(plan.entries[1].projectedRevenueMinor, second.expectedRevenueMinor);
});

test("zero projections remain zero and are not replaced by a fallback", () => {
  const plan = carryForwardPlan([project], [{ ...october, projectedRevenueMinor: 0, projectedMarginMinor: 0 }], "2026-10", "2026-11");
  assert.equal(plan.entries[0].projectedRevenueMinor, 0);
});

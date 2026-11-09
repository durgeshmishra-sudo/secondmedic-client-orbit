import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { claimCrmWrite, finishCrmWrite } from "../lib/crm-request-guard.ts";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE crm_write_requests (operation_key TEXT PRIMARY KEY, actor_member_id TEXT, payload_hash TEXT, state TEXT, response_json TEXT, status_code INTEGER, updated_at TEXT)");
  return { sqlite, db: { prepare(query) { return { bind(...values) { return { async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...values).changes) } }; }, async first() { return sqlite.prepare(query).get(...values) || null; } }; } }; } } };
}

test("a simultaneous duplicate cannot claim the same write", async () => {
  const { db, sqlite } = database();
  const results = await Promise.allSettled([claimCrmWrite(db, "staff-1", "operation_123456", { action: "client", legalName: "Example" }), claimCrmWrite(db, "staff-1", "operation_123456", { legalName: "Example", action: "client" })]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM crm_write_requests").get().count, 1);
});

test("a lost response replays the original success without another write", async () => {
  const { db } = database();
  const body = { action: "payment", amount: "1500", clientId: "project-1" };
  const first = await claimCrmWrite(db, "staff-1", "operation_123456", body);
  await finishCrmWrite(db, first.key, { ok: true, id: "original-record" }, 201);
  const repeated = await claimCrmWrite(db, "staff-1", "operation_123456", body);
  assert.deepEqual(repeated.replay, { status: 201, body: { ok: true, id: "original-record" } });
});

test("reusing a reference with altered details is rejected", async () => {
  const { db } = database();
  await claimCrmWrite(db, "staff-1", "operation_123456", { amount: 100 });
  await assert.rejects(claimCrmWrite(db, "staff-1", "operation_123456", { amount: 200 }), /different details/);
});

test("distinct project submissions and different staff remain independent", async () => {
  const { db, sqlite } = database();
  await claimCrmWrite(db, "staff-1", "operation_123456", { legalName: "Visit Health" });
  await claimCrmWrite(db, "staff-1", "operation_987654", { legalName: "Visit Health" });
  await claimCrmWrite(db, "staff-2", "operation_123456", { legalName: "Visit Health" });
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM crm_write_requests").get().count, 3);
});

test("an uncertain failure is replayed and never reapplies a partial write", async () => {
  const { db } = database();
  const first = await claimCrmWrite(db, "staff-1", "operation_123456", { action: "client" });
  await finishCrmWrite(db, first.key, { error: "Review the saved record before retrying." }, 400);
  const retry = await claimCrmWrite(db, "staff-1", "operation_123456", { action: "client" });
  assert.equal(retry.replay.status, 400);
  assert.match(retry.replay.body.error, /Review/);
});

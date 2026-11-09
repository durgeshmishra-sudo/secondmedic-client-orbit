import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const migrations = journal.entries.map(({ tag }) => ({
  tag,
  sql: readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8"),
}));

function apply(db, migration) {
  // Use the same ordered statement boundaries as the deployment migrator.
  for (const statement of migration.sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function fixture(beforeLatest = false) {
  // The immutable 0004 migration uses SQLite's legacy double-quoted-string
  // compatibility when selecting newly introduced nullable columns. Match
  // that historical migrator setting here; the appended migration uses only
  // additive statements and does not depend on it.
  const db = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations.slice(0, beforeLatest ? -1 : undefined)) apply(db, migration);
  db.exec(`
    INSERT INTO crm_members (id, auth_subject, email, full_name)
      VALUES ('member-1', 'test:member', 'schema-test@example.invalid', 'Test Staff');
    INSERT INTO crm_clients (id, client_code, legal_name, owner_member_id, created_by_member_id)
      VALUES ('project-1', 'TEST-1', 'Visit Health', 'member-1', 'member-1'),
             ('project-2', 'TEST-2', 'Visit Health', 'member-1', 'member-1');
    INSERT INTO crm_pipeline_items (id, client_id, title, owner_member_id, stage, expected_revenue_minor)
      VALUES ('pipeline-1', 'project-1', 'Visit Health', 'member-1', 'l5', 70000000),
             ('pipeline-2', 'project-2', 'Visit Health', 'member-1', 'l1', 50000000);
    INSERT INTO crm_revenue_entries
      (id, client_id, owner_member_id, entry_date, revenue_month, revenue_minor, margin_minor, projected_revenue_minor, actual_revenue_minor)
      VALUES ('revenue-1', 'project-1', 'member-1', '2026-10-01', '2026-10', 70000000, 10500000, 70000000, 18732000),
             ('revenue-2', 'project-2', 'member-1', '2026-10-01', '2026-10', 50000000, 7500000, 50000000, NULL);
    INSERT INTO crm_invoices
      (id, client_id, invoice_number, issue_date, due_date, total_minor, created_by_member_id)
      VALUES ('invoice-1', 'project-1', 'TEST/1', '2026-10-01', '2026-11-01', 110000000, 'member-1');
    INSERT INTO crm_payments (id, invoice_id, client_id, received_on, amount_minor, recorded_by_member_id)
      VALUES ('payment-1', 'invoice-1', 'project-1', '2026-10-15', 18732000, 'member-1');
    INSERT INTO crm_vendors (id, vendor_name, client_id, due_date, owner_member_id, amount_minor)
      VALUES ('vendor-1', 'Test Vendor', 'project-1', '2026-11-01', 'member-1', 7320000);
  `);
  return db;
}

function businessSnapshot(db) {
  return {
    clients: db.prepare("SELECT id, legal_name, owner_member_id FROM crm_clients ORDER BY id").all(),
    pipeline: db.prepare("SELECT id, client_id, stage, expected_revenue_minor FROM crm_pipeline_items ORDER BY id").all(),
    revenue: db.prepare("SELECT id, client_id, revenue_month, entry_date, projected_revenue_minor, actual_revenue_minor FROM crm_revenue_entries ORDER BY id").all(),
    invoices: db.prepare("SELECT id, client_id, invoice_number, total_minor FROM crm_invoices ORDER BY id").all(),
    payments: db.prepare("SELECT id, invoice_id, client_id, amount_minor FROM crm_payments ORDER BY id").all(),
    vendors: db.prepare("SELECT id, client_id, amount_minor FROM crm_vendors ORDER BY id").all(),
  };
}

test("all journaled migrations apply with integrity and foreign keys intact", (t) => {
  const db = fixture();
  t.after(() => db.close());
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='crm_write_requests'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='crm_activity_log'").get());
});

test("the consistency migration is additive and preserves historical projects and amounts", (t) => {
  const latest = migrations.at(-1);
  assert.equal(latest.tag, "0005_crm_consistency");
  const statements = latest.sql.split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean);
  assert.ok(statements.every((sql) => /^(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE)/i.test(sql)));
  assert.ok(statements.filter((sql) => /^ALTER TABLE/i.test(sql)).every((sql) => /\bADD\b/i.test(sql)));

  const db = fixture(true);
  t.after(() => db.close());
  const before = businessSnapshot(db);
  apply(db, latest);
  assert.deepEqual(businessSnapshot(db), before);
  assert.equal(db.prepare("SELECT count(*) AS count FROM crm_clients WHERE legal_name='Visit Health'").get().count, 2);
  assert.equal(db.prepare("SELECT sum(projected_revenue_minor) AS total FROM crm_revenue_entries WHERE revenue_month='2026-10'").get().total, 120000000);
  assert.equal(db.prepare("SELECT sum(actual_revenue_minor) AS total FROM crm_revenue_entries WHERE revenue_month='2026-10'").get().total, 18732000);
});

test("one project cannot acquire duplicate revenue for a month, while other projects and months remain independent", (t) => {
  const db = fixture();
  t.after(() => db.close());
  const insert = db.prepare(`INSERT INTO crm_revenue_entries
    (id, client_id, owner_member_id, entry_date, revenue_month, revenue_minor, margin_minor, pipeline_item_id)
    VALUES (?, ?, 'member-1', ?, ?, 70000000, 10500000, ?)`);
  insert.run("month-1", "project-1", "2026-11-01", "2026-11", "pipeline-1");
  assert.throws(() => insert.run("duplicate-month", "project-1", "2026-11-01", "2026-11", "pipeline-1"), /UNIQUE constraint failed/);
  insert.run("other-project", "project-2", "2026-11-01", "2026-11", "pipeline-2");
  insert.run("next-month", "project-1", "2026-12-01", "2026-12", "pipeline-1");
  assert.equal(db.prepare("SELECT count(*) AS count FROM crm_revenue_entries WHERE pipeline_item_id='pipeline-1' AND revenue_month='2026-11'").get().count, 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM crm_revenue_entries WHERE pipeline_item_id IS NULL").get().count, 2);
  assert.equal(db.prepare("SELECT actual_revenue_minor FROM crm_revenue_entries WHERE id='month-1'").get().actual_revenue_minor, null);
});

test("marking a project Done retains its stage, financial history and outstanding invoice", (t) => {
  const db = fixture();
  t.after(() => db.close());
  const before = businessSnapshot(db);
  db.prepare("UPDATE crm_pipeline_items SET completed_at=? WHERE id=?").run("2026-11-09T12:00:00.000Z", "pipeline-1");
  assert.deepEqual(businessSnapshot(db), before);
  assert.equal(db.prepare("SELECT stage, completed_at FROM crm_pipeline_items WHERE id='pipeline-1'").get().stage, "l5");
  assert.equal(db.prepare("SELECT completed_at FROM crm_pipeline_items WHERE id='pipeline-1'").get().completed_at, "2026-11-09T12:00:00.000Z");
  assert.equal(db.prepare("SELECT total_minor - (SELECT sum(amount_minor) FROM crm_payments WHERE invoice_id='invoice-1') AS outstanding FROM crm_invoices WHERE id='invoice-1'").get().outstanding, 91268000);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

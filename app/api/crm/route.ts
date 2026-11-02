import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getLocalSessionMember, hashPassword } from "../../crm-auth";
import { getDb } from "../../../db";
import {
  crmActivityEvents, crmActivityLog, crmAgreements, crmClients, crmColdCalls, crmDocuments,
  crmInvoices, crmMeetings, crmMembers, crmPayments, crmPipelineItems, crmPipelineSettings, crmRevenueEntries, crmVendors,
} from "../../../db/schema";

const uid = () => crypto.randomUUID();
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const meaningfulId = (value: unknown) => { const id = text(value); return id && !/_id$/.test(id) ? id : null; };
const rupeesToMinor = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));
const dateOnly = () => new Date().toISOString().slice(0, 10);
const addDays = (value: string, days: number) => { const date = new Date(value + "T00:00:00"); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const cleanDate = (value: unknown) => { const date = text(value); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""; };
const cleanVendorStatus = (value: unknown) => { const status = text(value); return ["unpaid", "part_paid", "paid"].includes(status) ? status : "unpaid"; };
const stages = ["l1", "l2", "l3", "l4", "l5"];
const defaultProbabilities: Record<string, number> = { l1: 20, l2: 50, l3: 100, l4: 100, l5: 100 };
const leadSources = new Set(["Meta Ads", "Google", "Referral", "Cold call", "LinkedIn", "Walk-in", "Other"]);
const normalizeClientName = (value: string) => {
  const words = value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).filter((word) => word !== "health");
  const normalized = words.join(" ");
  return normalized === "healthians" || normalized === "healthium medtech" ? "healthium medtech" : normalized;
};
function parseCsv(csv: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [] as Record<string, string>[];
  const headers = lines[0].split(",").map((header) => header.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

const importedDashboards = [
  { name: "Pratik Darji", target: 1500000, mtd: 300000, team: "Pratik BD Team", confirmed: [["Future Generali",70000,10500],["SBI Camp",60000,10800],["Doctor Referral",300000,45000],["PolicyQ",50000,10000],["Healthians",50000,5000],["USV",50000,5000],["ICPA",40000,6000],["Zyla",20000,2000],["Taxon",50000,2500],["Iffco Tokio",200000,40000],["Health India",90000,9000],["TSF",10000,1000]], pipeline: [["Salam Foundation",100000,"Camp Â· yet to fix"],["Oppo",300000,"Camp"],["Agilent",0,"Wednesday meeting"],["GoWellNext",400000,"PPME"],["Marsh",100000,"Wellness"],["IFGI Petro Chemicals",10000,"AHC"],["Odyssey Logistic",80000,"Camp"],["Jio Insurance",100000,"Wellness"],["Call Health",200000,"OPD, AHC"],["Quantum",50000,"Camp"],["Vantrock",200000,"Wellness"],["Kotak Life",100000,"AHC"],["Birla IVF",0,"â"],["JB Boda",0,"â"]], payments: [["Healthians",130000,"2026-10-23"],["Iffco Tokio",300000,"2026-10-19"],["Health India",10000,"2026-10-13"],["ICPA",24000,"2026-10-25"]] },
  { name: "Yogesh Pawar", target: 700000, mtd: 100000, team: "Yogesh BD Team", confirmed: [["Ericsson",100000,15000],["Synergy Insurance",50000,7500],["Salasar Broker",125000,18750],["Globe Secure",75000,11250],["Retail OPD",50000,7500],["Singh Tech",25000,3750],["MCX",100000,15000]], pipeline: [["Mcure",600000,"OPD"],["Liberty",300000,"OPD, wellness"],["Prudent Insurance",50000,"AHC"],["Mankad",100000,"OPD"],["Mahale Engineering",250000,"AHC"],["Emirates Logistic",100000,"AHC"],["Futurix Insurance",100000,"AHC"],["FHPL TPA",100000,"AHC"],["Share India Insurance",50000,"Wellness"],["CoverMitra Insurance",50000,"AHC"],["India Insure Broker",150000,"OPD"]], payments: [["Ericsson",48500,"2026-10-25"]] },
  { name: "Mukesh Mishra", target: 1500000, mtd: 250000, team: "Mukesh BD Team", confirmed: [["Transformation Gym",160000,48000],["Occupational Health Service",120000,33600],["ESR Agro",220000,110000],["Vadesh Healthcare",250000,50000],["United Brew",200000,20000],["Elementis",150000,30000],["RafaCure",150000,22500]], pipeline: [["IHC",50000,"Wellness"],["Safe Circle",30000,"Home collection, L2L/B2B"],["Lidchos",20000,"L2L"],["L&T Chennai",10000,"Camp"],["Global Cure Service",100000,"Camp"],["Linux",100000,"Home collection"],["Santan Textile",200000,"OHC"],["Atrall Pipes",270000,"OHC"]], payments: [["Gulf Oil",30000,"2026-10-16"],["Sai Ram",400000,"2026-10-22"]] },
  { name: "Omkar Sawant", target: 1300000, mtd: 200000, team: "Omkar BD Team", confirmed: [["Visit",700000,105000],["Vihance Broker",600000,90000]], pipeline: [["Quibe Health",150000,"AHC, on-site this week"],["Tata Motors",0,"Meeting 16 Oct"],["Call Health",300000,"OPD meeting done"],["Indina Broker",150000,"On-site"],["Visit",500000,"LIC, Radiology Airoli/Dombivli"],["Navi Insurance",0,"100â200 employees AHC"]], payments: [["Visit Health",1100000,"2026-10-15"]] },
];

const importedTeamRoster = [
  { teamName: "Omkar BD Team", head: "Omkar Sawant", memberCount: 2 },
  { teamName: "Mukesh BD Team", head: "Mukesh Mishra", memberCount: 3 },
  { teamName: "Pratik BD Team", head: "Pratik Darji", memberCount: 3 },
  { teamName: "Yogesh BD Team", head: "Yogesh Pawar", memberCount: 1 },
];

async function ensureSchema(db: ReturnType<typeof getDb>) {
  // Some existing D1 databases were created before these columns were added.
  // ALTER TABLE is idempotent here because duplicate-column errors are ignored.
  const statements = [
    // Older live databases predate the BD/Operations role split. Keep this
    // migration additive so creating a team member never fails on legacy D1.
    // Existing member rows remain untouched; new rows receive the BD default.
    "ALTER TABLE `crm_members` ADD `business_role` text DEFAULT 'bd' NOT NULL",
    "ALTER TABLE `crm_clients` ADD `lead_source` text DEFAULT 'Other' NOT NULL",
    "ALTER TABLE `crm_clients` ADD `segment` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_vendors` ADD `customer_type` text DEFAULT 'direct_customer' NOT NULL",
    "ALTER TABLE `crm_vendors` ADD `client_ids` text DEFAULT '[]' NOT NULL",
    "ALTER TABLE `crm_vendors` ADD `invoice_date` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_vendors` ADD `due_date` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_vendors` ADD `payment_status` text DEFAULT 'unpaid' NOT NULL",
    "ALTER TABLE `crm_pipeline_items` ADD `lead_source` text DEFAULT 'Other' NOT NULL",
    "ALTER TABLE `crm_pipeline_items` ADD `stage_entered_at` text",
    "ALTER TABLE `crm_vendors` ADD `staff_member_id` text",
    // Older deployments created the invoice/payment tables before these
    // bookkeeping fields were introduced.  Keep the upgrade additive so a
    // login can never fail just because a legacy D1 table is missing a
    // nullable/display-only column.
    "ALTER TABLE `crm_invoices` ADD `notes` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_invoices` ADD `created_by_member_id` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_invoices` ADD `created_at` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_payments` ADD `revenue_month` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_payments` ADD `tds_minor` integer DEFAULT 0 NOT NULL",
    "ALTER TABLE `crm_payments` ADD `method` text DEFAULT 'bank_transfer' NOT NULL",
    "ALTER TABLE `crm_payments` ADD `reference_no` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_payments` ADD `notes` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_payments` ADD `recorded_by_member_id` text DEFAULT '' NOT NULL",
    "ALTER TABLE `crm_payments` ADD `created_at` text DEFAULT '' NOT NULL",
    "CREATE TABLE IF NOT EXISTS `crm_activity_log` (`id` text PRIMARY KEY NOT NULL, `occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `actor_member_id` text, `actor_name` text DEFAULT '' NOT NULL, `actor_role` text DEFAULT 'staff' NOT NULL, `team_name` text DEFAULT '' NOT NULL, `module` text NOT NULL, `action` text NOT NULL, `record_type` text DEFAULT '' NOT NULL, `record_id` text DEFAULT '' NOT NULL, `old_value` text DEFAULT '' NOT NULL, `new_value` text DEFAULT '' NOT NULL, `details` text DEFAULT '' NOT NULL)",
    "CREATE INDEX IF NOT EXISTS `crm_activity_log_date_idx` ON `crm_activity_log` (`occurred_at`)",
    "CREATE INDEX IF NOT EXISTS `crm_activity_log_actor_idx` ON `crm_activity_log` (`actor_member_id`)",
    "CREATE INDEX IF NOT EXISTS `crm_activity_log_module_idx` ON `crm_activity_log` (`module`,`action`)",
    "CREATE INDEX IF NOT EXISTS `crm_clients_owner_idx` ON `crm_clients` (`owner_member_id`)",
    "CREATE INDEX IF NOT EXISTS `crm_revenue_client_idx` ON `crm_revenue_entries` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `crm_pipeline_client_stage_idx` ON `crm_pipeline_items` (`client_id`,`stage`)",
    "CREATE INDEX IF NOT EXISTS `crm_pipeline_owner_stage_idx` ON `crm_pipeline_items` (`owner_member_id`,`stage`)",
    "CREATE INDEX IF NOT EXISTS `crm_invoices_client_idx` ON `crm_invoices` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `crm_vendors_client_idx` ON `crm_vendors` (`client_id`)",
  ];
  // D1 can execute independent additive upgrades concurrently. Running the
  // migration list serially made the unauthenticated landing page wait on the
  // entire schema pass before it could show the sign-in screen.
  await Promise.all(statements.map(async (statement) => {
    try { await db.run(sql.raw(statement)); } catch { /* already present */ }
  }));
}

// Schema upgrades are additive and safe to retry, but running every ALTER/
// CREATE INDEX on every read and save adds several seconds of D1 latency. Keep
// one promise per warm Worker isolate; if a migration ever fails, clear it so
// the next request can retry instead of permanently caching the failure.
let schemaReady: Promise<void> | null = null;
async function ensureSchemaCached(db: ReturnType<typeof getDb>) {
  if (!schemaReady) {
    schemaReady = ensureSchema(db).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

type CrmCacheEntry = { expiresAt: number; body: Record<string, unknown> };
const crmResponseCache = new Map<string, CrmCacheEntry>();
const CRM_CACHE_TTL_MS = 30_000;

const restoredVendors = [
  ["Balloon", 925998, "2026-10-16", 30], ["Metropolis", 128716, "2026-10-16", 30], ["Apollo", 212630, "2026-10-16", 30],
  ["DDRC", 73200, "2026-10-16", 15], ["Aarthi Scan", 16540, "2026-10-16", 30], ["Vadesh Healthcare", 313250, "2026-10-16", 45],
  ["Alyve", 243400, "2026-10-19", 30], ["Zenzo", 70800, "2026-11-30", 45], ["Healthians", 264956, "2026-11-30", 30],
  ["Dr. Shashank", 3200, "2026-11-30", 30], ["OHC Services", 780825, "2026-11-30", 45], ["Trilok Hospital", 67670, "2026-12-31", 30],
  ["Sachin Diagnostic", 38000, "2026-12-31", 30], ["Surv Surakhsa", 11000, "2026-12-31", 30], ["Go Simplyfy", 165550, "2026-12-31", 30], ["Anshu Hospital", 644840, "2026-12-31", 30],
] as const;

async function restoreVendorsIfEmpty(db: ReturnType<typeof getDb>, memberId: string) {
  const existing = await db.select({ id: crmVendors.id }).from(crmVendors).limit(1);
  if (existing.length) return;
  for (const [vendorName, amount, proposedDate, creditPeriodDays] of restoredVendors) {
    await db.insert(crmVendors).values({ id: uid(), vendorName, amountMinor: amount * 100, clientId: null, clientIds: "[]", customerType: "direct_customer", directCustomerName: vendorName, clientPayment: "no", vendorPaymentStatus: "unpaid", paymentStatus: "unpaid", proposedDate, creditPeriodDays, invoiceDate: "", dueDate: addDays(proposedDate, creditPeriodDays), ownerMemberId: memberId, notes: "Restored from vendor payable schedule" });
  }
}

async function normalizeVendorSchedules(db: ReturnType<typeof getDb>) {
  // Older imports stored the literal placeholder "invoice_date" and copied
  // the scheduled date into due_date.  The CRM rule is unambiguous: due date
  // is always the proposed (scheduled) date plus the credit period.
  const rows = await db.select().from(crmVendors).limit(300);
  for (const row of rows) {
    if (!row.proposedDate) continue;
    const dueDate = addDays(row.proposedDate, row.creditPeriodDays || 0);
    const invoiceDate = row.invoiceDate === "invoice_date" ? "" : (row.invoiceDate || "");
    const paymentStatus = cleanVendorStatus(row.paymentStatus || row.vendorPaymentStatus);
    if (row.dueDate !== dueDate || row.invoiceDate !== invoiceDate || row.paymentStatus !== paymentStatus || row.vendorPaymentStatus !== paymentStatus) {
      await db.update(crmVendors).set({ dueDate, invoiceDate, paymentStatus, vendorPaymentStatus: paymentStatus }).where(eq(crmVendors.id, row.id));
    }
  }
}

const isAssociateMember = (member: { fullName?: string | null; email?: string | null }) => /associate/i.test(member.fullName || "") || /@team\.local$/i.test(member.email || "");

async function removeUnlinkedDemoAssociates(db: ReturnType<typeof getDb>) {
  const demoMembers = (await db.select().from(crmMembers)).filter((row) => row.authSubject.startsWith("demo:") && isAssociateMember(row));
  const removed: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const demo of demoMembers) {
    const [head] = await db.select().from(crmMembers).where(and(eq(crmMembers.teamName, demo.teamName), eq(crmMembers.role, "head"))).limit(1);
    if (!head) { skipped.push({ name: demo.fullName, reason: "No team head found" }); continue; }
    const [{ clients }, { calls }, { revenue }] = await Promise.all([
      db.select({ clients: sql<number>`count(*)` }).from(crmClients).where(eq(crmClients.ownerMemberId, demo.id)),
      db.select({ calls: sql<number>`count(*)` }).from(crmColdCalls).where(eq(crmColdCalls.callerMemberId, demo.id)),
      db.select({ revenue: sql<number>`count(*)` }).from(crmRevenueEntries).where(eq(crmRevenueEntries.ownerMemberId, demo.id)),
    ]);
    if (Number(clients) || Number(calls) || Number(revenue)) {
      skipped.push({ name: demo.fullName, reason: "Has linked client, call, or revenue records" });
      continue;
    }
    // Re-point operational records before deleting the demo member. This does
    // not delete any CRM business record and keeps foreign keys valid.
    await db.update(crmPipelineItems).set({ ownerMemberId: head.id }).where(eq(crmPipelineItems.ownerMemberId, demo.id));
    await db.update(crmMeetings).set({ organizerMemberId: head.id }).where(eq(crmMeetings.organizerMemberId, demo.id));
    await db.update(crmInvoices).set({ createdByMemberId: head.id }).where(eq(crmInvoices.createdByMemberId, demo.id));
    await db.update(crmPayments).set({ recordedByMemberId: head.id }).where(eq(crmPayments.recordedByMemberId, demo.id));
    await db.update(crmVendors).set({ ownerMemberId: head.id }).where(eq(crmVendors.ownerMemberId, demo.id));
    await db.update(crmAgreements).set({ ownerMemberId: head.id }).where(eq(crmAgreements.ownerMemberId, demo.id));
    await db.update(crmDocuments).set({ uploadedByMemberId: head.id }).where(eq(crmDocuments.uploadedByMemberId, demo.id));
    await db.update(crmActivityEvents).set({ actorMemberId: head.id }).where(eq(crmActivityEvents.actorMemberId, demo.id));
    await db.update(crmPipelineSettings).set({ updatedByMemberId: head.id }).where(eq(crmPipelineSettings.updatedByMemberId, demo.id));
    await db.delete(crmMembers).where(eq(crmMembers.id, demo.id));
    removed.push(demo.fullName);
  }
  return { removed, skipped };
}

async function seedImportedDashboards(db: ReturnType<typeof getDb>) {
  // Import each source dashboard independently. A real client added earlier
  // must not prevent the other staff dashboards from being seeded.
  for (let index = 0; index < importedDashboards.length; index += 1) {
    const dashboard = importedDashboards[index];
    const memberId = `demo-${dashboard.name.toLowerCase().replaceAll(" ", "-")}`;
    const [existing] = await db.select().from(crmMembers).where(eq(crmMembers.id, memberId)).limit(1);
    const member = existing || { id: memberId, authSubject: `demo:${memberId}`, email: `${memberId}@imported.local`, fullName: dashboard.name, role: "staff", teamName: dashboard.team, isActive: true };
    if (existing) {
      const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(crmClients).where(eq(crmClients.ownerMemberId, memberId));
      if (Number(total) > 0) continue;
    } else {
      await db.insert(crmMembers).values(member);
    }
    const clientIds = new Map<string, string>();
    const names = [...dashboard.confirmed.map((x) => x[0]), ...dashboard.pipeline.map((x) => x[0]), ...dashboard.payments.map((x) => x[0])];
    for (const rawName of [...new Set(names)]) {
      const name = String(rawName); const id = crypto.randomUUID(); clientIds.set(name, id);
      await db.insert(crmClients).values({ id, clientCode: `IMP-${index + 1}-${id.slice(0, 5).toUpperCase()}`, legalName: name, status: "active", ownerMemberId: member.id, teamName: dashboard.team, notes: `Imported from ${dashboard.name} sales update dashboard.`, createdByMemberId: member.id });
    }
    for (const [name, revenue, margin] of dashboard.confirmed) await db.insert(crmRevenueEntries).values({ id: crypto.randomUUID(), clientId: clientIds.get(String(name))!, ownerMemberId: member.id, entryDate: "2026-10-01", revenueMinor: Number(revenue) * 100, marginMinor: Number(margin) * 100, projectedRevenueMinor: Number(revenue) * 100, projectedMarginMinor: Number(margin) * 100, revenueMonth: "2026-10", actualRevenueMinor: null, actualMarginMinor: null, description: "Confirmed account imported from Oct â26 dashboard", status: "projected" });
    for (const [name, amount, status] of dashboard.pipeline) await db.insert(crmPipelineItems).values({ id: crypto.randomUUID(), clientId: clientIds.get(String(name)) || null, title: String(name), ownerMemberId: member.id, stage: "l1", probability: defaultProbabilities.l1, expectedRevenueMinor: Number(amount) * 100, expectedMarginMinor: 0, expectedCloseDate: "2026-10-31", nextAction: String(status) });
    for (const [name, amount, dueDate] of dashboard.payments) { const clientId = clientIds.get(String(name))!; const invoiceId = crypto.randomUUID(); await db.insert(crmInvoices).values({ id: invoiceId, clientId, invoiceNumber: `IMP-${index + 1}-${String(name).slice(0, 4).toUpperCase()}`, issueDate: "2026-10-01", dueDate: String(dueDate), totalMinor: Number(amount) * 100, status: "sent", notes: "Expected payment imported from Oct â26 dashboard", createdByMemberId: member.id }); }
  }
}

async function syncImportedTeamNames(db: ReturnType<typeof getDb>) {
  for (const dashboard of importedDashboards) {
    const memberId = `demo-${dashboard.name.toLowerCase().replaceAll(" ", "-")}`;
    await db.update(crmMembers).set({ teamName: dashboard.team, role: "head" }).where(eq(crmMembers.id, memberId));
    await db.update(crmClients).set({ teamName: dashboard.team }).where(eq(crmClients.ownerMemberId, memberId));
  }
}

async function dedupeAgreements(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(crmAgreements).orderBy(asc(crmAgreements.createdAt));
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.clientId}|${row.title.trim().toLowerCase()}|${row.valueMinor}|${row.expiryDate}`;
    if (seen.has(key)) await db.delete(crmAgreements).where(eq(crmAgreements.id, row.id));
    else seen.add(key);
  }
}

async function dedupeClients(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(crmClients).orderBy(asc(crmClients.createdAt));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = normalizeClientName(row.legalName);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) { if (key === "healthium medtech" && group[0].legalName.toLowerCase() === "healthians") await db.update(crmClients).set({ legalName: "Healthium MedTech", updatedAt: new Date().toISOString() }).where(eq(crmClients.id, group[0].id)); continue; }
    const canonical = group.slice().sort((a, b) => {
      const aVisit = a.legalName.toLowerCase().includes("visit health") ? 1 : 0;
      const bVisit = b.legalName.toLowerCase().includes("visit health") ? 1 : 0;
      return bVisit - aVisit || b.legalName.length - a.legalName.length;
    })[0];
    if (key === "visit") await db.update(crmClients).set({ legalName: "Visit Health", updatedAt: new Date().toISOString() }).where(eq(crmClients.id, canonical.id));
    if (key === "healthium medtech") await db.update(crmClients).set({ legalName: "Healthium MedTech", updatedAt: new Date().toISOString() }).where(eq(crmClients.id, canonical.id));
    for (const duplicate of group.filter((row) => row.id !== canonical.id)) {
      await db.update(crmRevenueEntries).set({ clientId: canonical.id }).where(eq(crmRevenueEntries.clientId, duplicate.id));
      await db.update(crmPipelineItems).set({ clientId: canonical.id }).where(eq(crmPipelineItems.clientId, duplicate.id));
      await db.update(crmInvoices).set({ clientId: canonical.id }).where(eq(crmInvoices.clientId, duplicate.id));
      await db.update(crmPayments).set({ clientId: canonical.id }).where(eq(crmPayments.clientId, duplicate.id));
      await db.update(crmVendors).set({ clientId: canonical.id }).where(eq(crmVendors.clientId, duplicate.id));
      await db.update(crmDocuments).set({ clientId: canonical.id }).where(eq(crmDocuments.clientId, duplicate.id));
      await db.update(crmAgreements).set({ clientId: canonical.id }).where(eq(crmAgreements.clientId, duplicate.id));
      await db.update(crmMeetings).set({ clientId: canonical.id }).where(eq(crmMeetings.clientId, duplicate.id));
      await db.update(crmActivityEvents).set({ clientId: canonical.id }).where(eq(crmActivityEvents.clientId, duplicate.id));
      await db.delete(crmClients).where(eq(crmClients.id, duplicate.id));
    }
  }
}

async function backfillRevenueFields(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(crmRevenueEntries);
  for (const row of rows) {
    const projectedRevenueMinor = row.projectedRevenueMinor || row.revenueMinor || 0;
    const projectedMarginMinor = row.projectedMarginMinor || row.marginMinor || 0;
    const revenueMonth = row.revenueMonth || row.entryDate.slice(0, 7);
    if (row.projectedRevenueMinor !== projectedRevenueMinor || row.projectedMarginMinor !== projectedMarginMinor || row.revenueMonth !== revenueMonth || row.status === "approved" || row.status === "submitted") {
      await db.update(crmRevenueEntries).set({ projectedRevenueMinor, projectedMarginMinor, revenueMonth, status: row.actualRevenueMinor == null ? "projected" : row.status }).where(eq(crmRevenueEntries.id, row.id));
    }
  }
}

async function normalizePipelineStages(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(crmPipelineItems);
  for (const row of rows) {
    if (stages.includes(row.stage)) continue;
    await db.update(crmPipelineItems).set({ stage: row.stage === "lost" ? "lost" : "l1", probability: row.stage === "lost" ? row.probability : defaultProbabilities.l1, updatedAt: new Date().toISOString() }).where(eq(crmPipelineItems.id, row.id));
  }
}

async function backfillConfirmedPipeline(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(crmRevenueEntries).where(sql`${crmRevenueEntries.description} like 'Confirmed account imported%'`);
  for (const revenue of rows) {
    const [linked] = await db.select().from(crmPipelineItems).where(eq(crmPipelineItems.revenueId, revenue.id)).limit(1);
    if (linked) continue;
    const id = uid(); const month = revenue.revenueMonth || revenue.entryDate.slice(0, 7) || dateOnly().slice(0, 7);
    await db.insert(crmPipelineItems).values({ id, clientId: revenue.clientId, title: `Confirmed Â· ${revenue.description.replace("Confirmed account imported from ", "")}`, ownerMemberId: revenue.ownerMemberId, stage: "l3", probability: 100, expectedRevenueMinor: revenue.projectedRevenueMinor || revenue.revenueMinor, expectedMarginMinor: revenue.projectedMarginMinor || revenue.marginMinor, expectedCloseDate: `${month}-31`, nextAction: "Confirmed imported account", revenueId: revenue.id, invoiceId: null, lostAt: null, lostReason: "" });
  }
}

async function ensurePipelineSettings(db: ReturnType<typeof getDb>) {
  const [settings] = await db.select().from(crmPipelineSettings).where(eq(crmPipelineSettings.id, "global")).limit(1);
  if (settings) return settings;
  const record = { id: "global", probabilities: JSON.stringify(defaultProbabilities), updatedByMemberId: null };
  await db.insert(crmPipelineSettings).values(record);
  return record;
}

async function actor(request?: Request) {
  const db = getDb();
  const localMember = await getLocalSessionMember(db, request);
  if (localMember) return localMember;
  const identity = await getChatGPTUser();
  if (!identity) throw new Error("Please sign in with ChatGPT to use the CRM.");
  const [existing] = await db.select().from(crmMembers).where(eq(crmMembers.authSubject, identity.userId)).limit(1);
  if (existing) {
    if (!existing.isActive) throw new Error("Your CRM access is disabled. Please contact an administrator.");
    return existing;
  }
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(crmMembers);
  const member = { id: uid(), authSubject: identity.userId, email: identity.email, fullName: identity.displayName, role: Number(total) === 0 ? "admin" : "staff", teamName: "General", isActive: true };
  await db.insert(crmMembers).values(member);
  return member;
}

function visibleClientIds(clients: { id: string }[]) { return clients.map((client) => client.id); }

// D1/SQLite limits the number of bound variables in a single statement. The
// admin view can have hundreds of clients, so keep client-scoped reads below
// that limit while preserving the same records and ordering.
function clientIdChunks(ids: string[], size = 50) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

async function batchByClientIds<T>(ids: string[], query: (chunk: string[]) => Promise<T[]>) {
  if (!ids.length) return [] as T[];
  const batches = await Promise.all(clientIdChunks(ids).map(query));
  return batches.flat();
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    // Resolve the local session first. Unauthenticated visitors should reach
    // the sign-in screen immediately instead of waiting for every additive
    // migration/index check to finish.
    const member = await actor(request);
    await ensureSchemaCached(db);
    const elevated = member.role === "admin" || member.role === "manager"; const teamScoped = member.role === "head";
    const cacheKey = `${member.id}:${member.role}:${member.teamName || ""}`;
    const cached = crmResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return Response.json(cached.body);
    if (cached) crmResponseCache.delete(cacheKey);
    const teamMembers = teamScoped ? await db.select({ id: crmMembers.id }).from(crmMembers).where(and(eq(crmMembers.teamName, member.teamName), eq(crmMembers.isActive, true))) : [];
    const teamMemberIds = teamMembers.map((row) => row.id);
    if (elevated) { await ensurePipelineSettings(db); }
    const clients = elevated
      ? await db.select().from(crmClients).orderBy(desc(crmClients.createdAt)).limit(200)
      : teamScoped && teamMemberIds.length
        ? await db.select().from(crmClients).where(inArray(crmClients.ownerMemberId, teamMemberIds)).orderBy(desc(crmClients.createdAt)).limit(200)
      : await db.select().from(crmClients).where(eq(crmClients.ownerMemberId, member.id)).orderBy(desc(crmClients.createdAt)).limit(200);
    const ids = visibleClientIds(clients);
    const scoped = <T,>(table: T, column: { name: string }) => ids.length ? inArray(column as never, ids) : sql`0`;
    const [revenue, pipeline, calls, meetings, invoices, payments, agreements, documents, vendors, memberRows, pipelineSettings, dailyBookings, activityLogs] = await Promise.all([
      elevated ? db.select().from(crmRevenueEntries).orderBy(desc(crmRevenueEntries.entryDate)).limit(300) : teamScoped && teamMemberIds.length ? db.select().from(crmRevenueEntries).where(inArray(crmRevenueEntries.ownerMemberId, teamMemberIds)).orderBy(desc(crmRevenueEntries.entryDate)).limit(300) : db.select().from(crmRevenueEntries).where(eq(crmRevenueEntries.ownerMemberId, member.id)).orderBy(desc(crmRevenueEntries.entryDate)).limit(300),
      elevated ? db.select().from(crmPipelineItems).orderBy(desc(crmPipelineItems.createdAt)).limit(300) : teamScoped && teamMemberIds.length ? db.select().from(crmPipelineItems).where(inArray(crmPipelineItems.ownerMemberId, teamMemberIds)).orderBy(desc(crmPipelineItems.createdAt)).limit(300) : db.select().from(crmPipelineItems).where(eq(crmPipelineItems.ownerMemberId, member.id)).orderBy(desc(crmPipelineItems.createdAt)).limit(300),
      elevated ? db.select().from(crmColdCalls).orderBy(desc(crmColdCalls.calledAt)).limit(300) : teamScoped && teamMemberIds.length ? db.select().from(crmColdCalls).where(inArray(crmColdCalls.callerMemberId, teamMemberIds)).orderBy(desc(crmColdCalls.calledAt)).limit(300) : db.select().from(crmColdCalls).where(eq(crmColdCalls.callerMemberId, member.id)).orderBy(desc(crmColdCalls.calledAt)).limit(300),
      elevated ? db.select().from(crmMeetings).orderBy(desc(crmMeetings.scheduledAt)).limit(300) : teamScoped && teamMemberIds.length ? db.select().from(crmMeetings).where(inArray(crmMeetings.organizerMemberId, teamMemberIds)).orderBy(desc(crmMeetings.scheduledAt)).limit(300) : db.select().from(crmMeetings).where(eq(crmMeetings.organizerMemberId, member.id)).orderBy(desc(crmMeetings.scheduledAt)).limit(300),
      elevated ? db.select().from(crmInvoices).orderBy(asc(crmInvoices.dueDate)).limit(300) : batchByClientIds(ids, (chunk) => db.select().from(crmInvoices).where(inArray(crmInvoices.clientId, chunk)).orderBy(asc(crmInvoices.dueDate)).limit(300)),
      elevated ? db.select().from(crmPayments).orderBy(desc(crmPayments.receivedOn)).limit(300) : batchByClientIds(ids, (chunk) => db.select().from(crmPayments).where(inArray(crmPayments.clientId, chunk)).orderBy(desc(crmPayments.receivedOn)).limit(300)),
      elevated ? db.select().from(crmAgreements).orderBy(desc(crmAgreements.expiryDate)).limit(300) : batchByClientIds(ids, (chunk) => db.select().from(crmAgreements).where(inArray(crmAgreements.clientId, chunk)).orderBy(desc(crmAgreements.expiryDate)).limit(300)),
      elevated ? db.select().from(crmDocuments).orderBy(desc(crmDocuments.uploadedAt)).limit(300) : batchByClientIds(ids, (chunk) => db.select().from(crmDocuments).where(inArray(crmDocuments.clientId, chunk)).orderBy(desc(crmDocuments.uploadedAt)).limit(300)),
      elevated ? db.select().from(crmVendors).orderBy(asc(crmVendors.dueDate)).limit(300) : batchByClientIds(ids, (chunk) => db.select().from(crmVendors).where(inArray(crmVendors.clientId, chunk)).orderBy(asc(crmVendors.dueDate)).limit(300)),
      elevated ? db.select().from(crmMembers).orderBy(crmMembers.fullName).limit(100) : teamScoped && teamMemberIds.length ? db.select().from(crmMembers).where(inArray(crmMembers.id, teamMemberIds)).orderBy(crmMembers.fullName).limit(100) : Promise.resolve([member]),
      elevated ? db.select().from(crmPipelineSettings).where(eq(crmPipelineSettings.id, "global")).limit(1) : Promise.resolve([]),
      elevated ? db.select().from(crmActivityEvents).where(eq(crmActivityEvents.eventType, "daily_booking")).orderBy(desc(crmActivityEvents.occurredAt)).limit(300) : batchByClientIds(ids, (chunk) => db.select().from(crmActivityEvents).where(and(eq(crmActivityEvents.eventType, "daily_booking"), inArray(crmActivityEvents.clientId, chunk))).orderBy(desc(crmActivityEvents.occurredAt)).limit(300)),
      elevated ? db.select().from(crmActivityLog).orderBy(desc(crmActivityLog.occurredAt)).limit(500) : db.select().from(crmActivityLog).where(eq(crmActivityLog.actorMemberId, member.id)).orderBy(desc(crmActivityLog.occurredAt)).limit(500),
    ]);
    void scoped;
    const activeDocuments = documents.filter((doc) => !doc.deletedAt);
    const members = memberRows.filter((row) => !isAssociateMember(row));
    const linkedAgreements = agreements.map((agreement) => { const document = activeDocuments.find((doc) => doc.entityType === "agreement" && doc.entityId === agreement.id); return { ...agreement, documentId: document?.id || "", documentMimeType: document?.mimeType || "", documentName: document?.originalName || "" }; });
    const cleanPipeline = pipeline.map((item) => ({ ...item, revenueId: meaningfulId(item.revenueId), invoiceId: meaningfulId(item.invoiceId) }));
    const heads = members.filter((row) => row.role === "head" && row.isActive);
    const teamSummary = heads.map((head) => ({ teamName: head.teamName, head: head.fullName, memberCount: members.filter((row) => row.teamName === head.teamName && row.isActive).length }));
    const visibleLogs = member.role === "admin" || member.role === "manager" ? activityLogs : member.role === "head" ? activityLogs.filter((row) => row.teamName === member.teamName) : activityLogs.filter((row) => row.actorMemberId === member.id);
    const payload = { member, clients, revenue, pipeline: cleanPipeline, calls, meetings, invoices, payments, dailyBookings, agreements: linkedAgreements, documents: activeDocuments, vendors, members, teamSummary, activityLogs: visibleLogs, pipelineSettings: pipelineSettings[0] || { id: "global", probabilities: JSON.stringify(defaultProbabilities) } };
    crmResponseCache.set(cacheKey, { expiresAt: Date.now() + CRM_CACHE_TTL_MS, body: payload });
    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load CRM data." }, { status: 401 });
  }
}

async function activity(clientId: string, memberId: string, eventType: string, entityType: string, entityId: string, body: string) {
  await getDb().insert(crmActivityEvents).values({ id: uid(), clientId, actorMemberId: memberId, eventType, entityType, entityId, body });
}

async function logActivity(member: typeof crmMembers.$inferSelect, module: string, action: string, recordType = "", recordId = "", oldValue = "", newValue = "", details = "") {
  try { await getDb().insert(crmActivityLog).values({ id: uid(), actorMemberId: member.id, actorName: member.fullName, actorRole: member.role, teamName: member.teamName, module, action, recordType, recordId, oldValue, newValue, details }); } catch { /* audit logging must never block a CRM save */ }
}

async function assignedOwner(db: ReturnType<typeof getDb>, member: typeof crmMembers.$inferSelect, requested: unknown) {
  const candidateId = text(requested);
  const canAssign = member.role === "admin" || member.role === "manager" || member.role === "head";
  if (!candidateId || !canAssign) return member;
  const [candidate] = await db.select().from(crmMembers).where(eq(crmMembers.id, candidateId)).limit(1);
  if (!candidate || !candidate.isActive) throw new Error("Assigned staff member was not found.");
  if (member.role === "head" && candidate.teamName !== member.teamName) throw new Error("You can only assign staff within your team.");
  return candidate;
}

async function recalculateInvoice(db: ReturnType<typeof getDb>, invoiceId: string) {
  const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId)).limit(1);
  if (!invoice) return;
  const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${crmPayments.amountMinor} + ${crmPayments.tdsMinor}), 0)` }).from(crmPayments).where(eq(crmPayments.invoiceId, invoiceId));
  await db.update(crmInvoices).set({ status: Number(total) >= invoice.totalMinor ? "paid" : Number(total) > 0 ? "partially_paid" : "sent" }).where(eq(crmInvoices.id, invoiceId));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const db = getDb();
    // The authenticated workspace always performs the additive schema check on
    // its initial GET. Avoid repeating that many-query migration on every
    // button press; writes should only wait for the requested database change.
    const member = await actor(request); const action = text(body.action);
    let id = uid(); let clientId = text(body.clientId); let response: Record<string, unknown> = { id };
    if (action === "client") {
      const legalName = text(body.legalName); if (!legalName) throw new Error("Client name is required.");
      // Same-name clients are separate projects. Never deduplicate or merge
      // them by display name; each record remains independent by client id.
      const existingProjects = await db.select({ id: crmClients.id }).from(crmClients).where(eq(crmClients.legalName, legalName));
      const projectNumber = existingProjects.length + 1;
      const clientOwner = await assignedOwner(db, member, body.ownerMemberId);
      const ownerMemberId = clientOwner.id;
      const requestedStage = text(body.stage) || text(body.status);
      const startStage = [...stages, "on_hold", "lost"].includes(requestedStage) ? requestedStage : "l1";
      const requestedLeadSource = text(body.leadSource);
      const leadSource = leadSources.has(requestedLeadSource) ? requestedLeadSource : "Other";
      const client = { id, clientCode: `CL-${new Date().getFullYear()}-${id.slice(0, 5).toUpperCase()}`, legalName, contactName: text(body.contactName), contactEmail: text(body.contactEmail), contactPhone: text(body.contactPhone), industry: text(body.industry), segment: text(body.segment), city: text(body.city), status: startStage, leadSource, ownerMemberId, teamName: text(body.teamName) || member.teamName, paymentTermsDays: Math.max(0, Number(body.paymentTermsDays) || 30), notes: text(body.notes), createdByMemberId: member.id };
      await db.insert(crmClients).values(client); await activity(id, member.id, "client_created", "client", id, `Client ${legalName} added.`);
      const startRevenue = rupeesToMinor(body.projectedRevenue);
      if (["l1", "l2"].includes(startStage)) {
        const pct = Math.max(0, Math.min(100, Number(body.marginPercent) || 0));
        const pipeId = uid();
        await db.insert(crmPipelineItems).values({ id: pipeId, clientId: id, title: `${legalName} - opportunity`, ownerMemberId, stage: startStage, probability: defaultProbabilities[startStage], expectedRevenueMinor: startRevenue, expectedMarginMinor: Math.round(startRevenue * pct / 100), expectedCloseDate: "", nextAction: "", revenueId: null, invoiceId: null, lostAt: null, lostReason: "" });
        await activity(id, member.id, "pipeline", "pipeline", pipeId, `Opportunity added at ${startStage.toUpperCase()}.`);
      } else if (["l3", "l4", "l5"].includes(startStage)) {
        const pct = Math.max(0, Math.min(100, Number(body.marginPercent) || 0));
        const month = text(body.revenueMonth) || dateOnly().slice(0, 7);
        const revenueId = uid();
        await db.insert(crmRevenueEntries).values({ id: revenueId, clientId: id, ownerMemberId, entryDate: `${month}-01`, revenueMonth: month, revenueMinor: startRevenue, marginMinor: Math.round(startRevenue * pct / 100), projectedRevenueMinor: startRevenue, projectedMarginMinor: Math.round(startRevenue * pct / 100), actualRevenueMinor: null, actualMarginMinor: null, actualUpdatedByMemberId: null, actualUpdatedAt: null, description: "Client stage revenue", status: "projected" });
        await db.insert(crmPipelineItems).values({ id: uid(), clientId: id, title: `${legalName} - ${startStage.toUpperCase()}`, ownerMemberId, stage: startStage, probability: defaultProbabilities[startStage], expectedRevenueMinor: startRevenue, expectedMarginMinor: Math.round(startRevenue * pct / 100), expectedCloseDate: text(body.expectedCloseDate), nextAction: "", revenueId, invoiceId: null, lostAt: null, lostReason: "" });
      }
      response = { id, client, projectNumber };
    } else if (action === "client_update") {
      if (!clientId) throw new Error("Client is required.");
      const [existingClient] = await db.select().from(crmClients).where(eq(crmClients.id, clientId)).limit(1);
      if (!existingClient) throw new Error("Client was not found.");
      const elevated = member.role === "admin" || member.role === "manager";
      const [existingOwner] = existingClient.ownerMemberId ? await db.select({ teamName: crmMembers.teamName }).from(crmMembers).where(eq(crmMembers.id, existingClient.ownerMemberId)).limit(1) : [];
      const teamHeadAccess = member.role === "head" && existingOwner?.teamName === member.teamName;
      if (!elevated && !teamHeadAccess && existingClient.ownerMemberId !== member.id) throw new Error("You can only edit clients assigned to you.");
      const nextLegalName = text(body.legalName) || existingClient.legalName;
      const selectedOwner = text(body.ownerMemberId) ? await assignedOwner(db, member, body.ownerMemberId) : null;
      const ownerMemberId = selectedOwner?.id || existingClient.ownerMemberId;
      const requestedStage = text(body.stage) || text(body.status);
      const nextStatus = [...stages, "on_hold", "lost"].includes(requestedStage) ? requestedStage : existingClient.status;
      const requestedLeadSource = text(body.leadSource);
      const nextLeadSource = leadSources.has(requestedLeadSource) ? requestedLeadSource : existingClient.leadSource || "Other";
      const projectedRevenueMinor = body.projectedRevenue === undefined || body.projectedRevenue === "" ? null : rupeesToMinor(body.projectedRevenue);
      const marginPercent = Math.max(0, Math.min(100, Number(body.marginPercent) || 15));
      const revenueMonth = text(body.revenueMonth) || dateOnly().slice(0, 7);
      const requestedDealId = text(body.dealId);
      const [deal] = requestedDealId
        ? await db.select().from(crmPipelineItems).where(and(eq(crmPipelineItems.id, requestedDealId), eq(crmPipelineItems.clientId, clientId))).limit(1)
        : await db.select().from(crmPipelineItems).where(eq(crmPipelineItems.clientId, clientId)).orderBy(desc(crmPipelineItems.createdAt)).limit(1);
      if (nextStatus === "l5" && (!deal || deal.stage !== "l5") && !text(body.invoiceDate)) throw new Error("Invoice date is required when a client moves to L5.");
      const client = { legalName: nextLegalName, contactName: text(body.contactName), contactEmail: text(body.contactEmail), contactPhone: text(body.contactPhone), industry: text(body.industry), segment: text(body.segment), city: text(body.city), status: nextStatus, leadSource: nextLeadSource, ownerMemberId, teamName: elevated ? (text(body.teamName) || existingClient.teamName) : existingClient.teamName, paymentTermsDays: Math.max(0, Number(body.paymentTermsDays) || existingClient.paymentTermsDays || 30), notes: text(body.notes), updatedAt: new Date().toISOString() };
      await db.update(crmClients).set(client).where(eq(crmClients.id, clientId));
      if (deal && nextStatus !== "on_hold" && nextStatus !== "lost") {
        const expectedRevenueMinor = projectedRevenueMinor === null ? deal.expectedRevenueMinor : projectedRevenueMinor;
        const expectedMarginMinor = projectedRevenueMinor === null ? deal.expectedMarginMinor : Math.round(expectedRevenueMinor * marginPercent / 100);
        let revenueId = meaningfulId(deal.revenueId);
        if (["l3", "l4", "l5"].includes(nextStatus)) {
          const [existingRevenue] = await db.select().from(crmRevenueEntries).where(and(eq(crmRevenueEntries.clientId, clientId), eq(crmRevenueEntries.revenueMonth, revenueMonth))).limit(1);
          const hadLinkedRevenue = Boolean(revenueId);
          revenueId = existingRevenue?.id || revenueId || uid();
          if (existingRevenue || hadLinkedRevenue) await db.update(crmRevenueEntries).set({ projectedRevenueMinor: expectedRevenueMinor, projectedMarginMinor: expectedMarginMinor, revenueMinor: expectedRevenueMinor, marginMinor: expectedMarginMinor, revenueMonth, entryDate: `${revenueMonth}-01` }).where(eq(crmRevenueEntries.id, revenueId));
          else await db.insert(crmRevenueEntries).values({ id: revenueId, clientId, ownerMemberId, entryDate: `${revenueMonth}-01`, revenueMonth, revenueMinor: expectedRevenueMinor, marginMinor: expectedMarginMinor, projectedRevenueMinor: expectedRevenueMinor, projectedMarginMinor: expectedMarginMinor, actualRevenueMinor: null, actualMarginMinor: null, actualUpdatedByMemberId: null, actualUpdatedAt: null, description: "Client stage revenue", status: "projected" });
        }
        let invoiceId = meaningfulId(deal.invoiceId);
        if (nextStatus === "l5" && deal.stage !== "l5" && !invoiceId) {
          const invoiceDate = text(body.invoiceDate);
          if (!invoiceDate) throw new Error("Invoice date is required when a client moves to L5.");
          const [existingInvoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.clientId, clientId)).orderBy(desc(crmInvoices.issueDate)).limit(1);
          invoiceId = existingInvoice?.id || uid();
          if (!existingInvoice) await db.insert(crmInvoices).values({ id: invoiceId, clientId, invoiceNumber: text(body.invoiceNumber) || `AUTO-${deal.id.slice(0, 8).toUpperCase()}`, issueDate: invoiceDate, dueDate: addDays(invoiceDate, existingClient.paymentTermsDays || 30), totalMinor: rupeesToMinor(body.invoiceAmount) || expectedRevenueMinor, status: "sent", notes: `Created from pipeline ${deal.title}`, createdByMemberId: member.id });
        }
        await db.update(crmPipelineItems).set({ title: `${nextLegalName} - ${nextStatus.toUpperCase()}`, ownerMemberId, stage: nextStatus, probability: defaultProbabilities[nextStatus] || deal.probability, expectedRevenueMinor, expectedMarginMinor, revenueId, invoiceId, updatedAt: new Date().toISOString() }).where(eq(crmPipelineItems.id, deal.id));
      } else if (deal) {
        // Keep the client and its selected deal on the same stage, including
        // On hold and Lost. No new revenue is created for either state.
        await db.update(crmPipelineItems).set({ title: `${nextLegalName} - ${nextStatus.toUpperCase()}`, stage: nextStatus, probability: defaultProbabilities[nextStatus] || deal.probability, lostAt: nextStatus === "lost" ? new Date().toISOString() : null, lostReason: text(body.lostReason), updatedAt: new Date().toISOString() }).where(eq(crmPipelineItems.id, deal.id));
      } else if (nextStatus !== "on_hold" && nextStatus !== "lost") {
        // A client can be created/imported without a deal. Saving its stage
        // must still make it visible on the Pipeline board and, from L3 on,
        // create exactly one revenue record for the selected month.
        const expectedRevenueMinor = projectedRevenueMinor || 0;
        const expectedMarginMinor = Math.round(expectedRevenueMinor * marginPercent / 100);
        let revenueId: string | null = null;
        if (["l3", "l4", "l5"].includes(nextStatus)) {
          revenueId = uid();
          await db.insert(crmRevenueEntries).values({ id: revenueId, clientId, ownerMemberId, entryDate: `${revenueMonth}-01`, revenueMonth, revenueMinor: expectedRevenueMinor, marginMinor: expectedMarginMinor, projectedRevenueMinor: expectedRevenueMinor, projectedMarginMinor: expectedMarginMinor, actualRevenueMinor: null, actualMarginMinor: null, actualUpdatedByMemberId: null, actualUpdatedAt: null, description: "Client stage revenue", status: "projected" });
        }
        let invoiceId: string | null = null;
        if (nextStatus === "l5") {
          invoiceId = uid();
          await db.insert(crmInvoices).values({ id: invoiceId, clientId, invoiceNumber: text(body.invoiceNumber) || `AUTO-${clientId.slice(0, 8).toUpperCase()}`, issueDate: text(body.invoiceDate), dueDate: addDays(text(body.invoiceDate), existingClient.paymentTermsDays || 30), totalMinor: rupeesToMinor(body.invoiceAmount) || expectedRevenueMinor, status: "sent", notes: "Created from client stage L5", createdByMemberId: member.id });
        }
        await db.insert(crmPipelineItems).values({ id: uid(), clientId, title: `${nextLegalName} - ${nextStatus.toUpperCase()}`, ownerMemberId, stage: nextStatus, probability: defaultProbabilities[nextStatus], expectedRevenueMinor, expectedMarginMinor, expectedCloseDate: text(body.expectedCloseDate), nextAction: "", revenueId, invoiceId, lostAt: null, lostReason: "" });
      }
      await activity(clientId, member.id, "client_updated", "client", clientId, `Client ${client.legalName} updated.`); response = { id: clientId, client: { ...existingClient, ...client } };
    } else if (action === "bulk_clients") {
      const csv = text(body.csv); if (!csv) throw new Error("Client CSV is empty.");
      const ownerMemberId = member.role === "admin" && text(body.ownerMemberId) ? text(body.ownerMemberId) : member.id;
      const owner = ownerMemberId ? (await db.select().from(crmMembers).where(eq(crmMembers.id, ownerMemberId)).limit(1))[0] : member;
      if (!owner) throw new Error("Assigned staff member was not found.");
      const rows = parseCsv(csv); let imported = 0; const skipped: string[] = [];
      for (const row of rows) { const legalName = text(row.legalName || row.clientName || row.name); if (!legalName) continue; const rowId = uid(); await db.insert(crmClients).values({ id: rowId, clientCode: text(row.clientCode) || `CL-${new Date().getFullYear()}-${rowId.slice(0, 5).toUpperCase()}`, legalName, contactName: text(row.contactName), contactEmail: text(row.contactEmail), contactPhone: text(row.contactPhone), industry: text(row.industry), city: text(row.city), status: text(row.status) || "prospect", ownerMemberId: owner.id, teamName: text(row.teamName) || owner.teamName, paymentTermsDays: Math.max(0, Number(row.paymentTermsDays) || 30), notes: text(row.notes), createdByMemberId: member.id }); imported += 1; }
      response = { id, imported, skipped };
    } else if (action === "bulk_pipeline") {
      // Pipeline imports deliberately create one independent project per row.
      // A matching client name is not reused: duplicate names are valid
      // projects and the UI labels them by creation order.
      const csv = text(body.csv); if (!csv) throw new Error("Pipeline CSV is empty.");
      const rows = parseCsv(csv); const allMembers = await db.select().from(crmMembers).where(eq(crmMembers.isActive, true));
      const canAssignAny = member.role === "admin" || member.role === "manager";
      const imported: string[] = []; const skipped: string[] = [];
      const month = dateOnly().slice(0, 7);
      for (const row of rows) {
        const legalName = text(row.clientName || row.legalName || row.name);
        if (!legalName) { skipped.push("Missing client name"); continue; }
        const requestedOwner = text(row.ownerMemberId || row.owner);
        const owner = (requestedOwner && (canAssignAny || member.role === "head")
          ? allMembers.find((candidate) => candidate.id === requestedOwner || candidate.email.toLowerCase() === requestedOwner.toLowerCase() || candidate.fullName.toLowerCase() === requestedOwner.toLowerCase())
          : null) || member;
        if (member.role === "head" && owner.teamName !== member.teamName) { skipped.push(`${legalName}: owner is outside your team`); continue; }
        const stageValue = text(row.stage).toLowerCase().replace(/^l([1-5])$/, "l$1");
        if (!stages.includes(stageValue)) { skipped.push(`${legalName}: invalid stage`); continue; }
        const expectedRevenueMinor = rupeesToMinor(row.expectedRevenue || row.expectedValue || row.value);
        const marginPercent = Math.max(0, Math.min(100, Number(row.marginPercent || row.margin || 15) || 15));
        const expectedMarginMinor = Math.round(expectedRevenueMinor * marginPercent / 100);
        const clientRowId = uid();
        await db.insert(crmClients).values({
          id: clientRowId,
          clientCode: `CL-${new Date().getFullYear()}-${clientRowId.slice(0, 5).toUpperCase()}`,
          legalName,
          contactName: text(row.contactName),
          contactEmail: text(row.contactEmail),
          contactPhone: text(row.contactPhone),
          industry: text(row.industry),
          segment: text(row.segment),
          city: text(row.city),
          status: ["l3", "l4", "l5"].includes(stageValue) ? "active" : "prospect",
          leadSource: leadSources.has(text(row.leadSource)) ? text(row.leadSource) : "Other",
          ownerMemberId: owner.id,
          teamName: owner.teamName,
          paymentTermsDays: Math.max(0, Number(row.paymentTermsDays) || 30),
          notes: text(row.notes) || "Imported from Mukesh pipeline workbook.",
          createdByMemberId: member.id,
        });
        const pipelineId = uid();
        let revenueId: string | null = null;
        if (["l3", "l4", "l5"].includes(stageValue)) {
          revenueId = uid();
          await db.insert(crmRevenueEntries).values({
            id: revenueId,
            clientId: clientRowId,
            ownerMemberId: owner.id,
            entryDate: `${text(row.revenueMonth) || month}-01`,
            revenueMonth: text(row.revenueMonth) || month,
            revenueMinor: expectedRevenueMinor,
            marginMinor: expectedMarginMinor,
            projectedRevenueMinor: expectedRevenueMinor,
            projectedMarginMinor: expectedMarginMinor,
            actualRevenueMinor: null,
            actualMarginMinor: null,
            actualUpdatedByMemberId: null,
            actualUpdatedAt: null,
            description: "Imported from Mukesh pipeline workbook.",
            status: "projected",
          });
        }
        await db.insert(crmPipelineItems).values({
          id: pipelineId,
          clientId: clientRowId,
          title: legalName,
          ownerMemberId: owner.id,
          stage: stageValue,
          probability: defaultProbabilities[stageValue],
          expectedRevenueMinor,
          expectedMarginMinor,
          expectedCloseDate: cleanDate(row.expectedCloseDate),
          nextAction: text(row.nextAction),
          leadSource: leadSources.has(text(row.leadSource)) ? text(row.leadSource) : "Other",
          stageEnteredAt: new Date().toISOString(),
          revenueId,
          invoiceId: null,
          lostAt: null,
          lostReason: "",
        });
        await activity(clientRowId, member.id, "pipeline_import", "pipeline", pipelineId, `Imported ${legalName} from Mukesh pipeline workbook.`);
        await logActivity(member, "pipeline", "import", "pipeline", pipelineId, "", `${legalName} Â· ${stageValue.toUpperCase()}`, "Mukesh pipeline workbook");
        imported.push(clientRowId);
      }
      response = { id, imported: imported.length, skipped, createdClientIds: imported };
    } else if (action === "revenue") {
      const revenueMonth = text(body.revenueMonth) || text(body.entryDate).slice(0, 7); if (!clientId || !revenueMonth) throw new Error("Client and revenue month are required.");
      const revenueOwner = await assignedOwner(db, member, body.ownerMemberId);
      const projectedRevenueMinor = rupeesToMinor(body.projectedRevenue ?? body.revenue);
      const marginPercent = Math.max(0, Math.min(100, Number(body.marginPercent) || 0));
      const projectedMarginMinor = body.projectedMargin ? rupeesToMinor(body.projectedMargin) : Math.round(projectedRevenueMinor * marginPercent / 100);
      const entryDate = text(body.entryDate) || `${revenueMonth}-01`;
      const [existingRevenue] = await db.select().from(crmRevenueEntries).where(and(eq(crmRevenueEntries.clientId, clientId), eq(crmRevenueEntries.revenueMonth, revenueMonth))).limit(1);
      if (existingRevenue) {
        const record = { ...existingRevenue, projectedRevenueMinor, projectedMarginMinor, revenueMinor: projectedRevenueMinor, marginMinor: projectedMarginMinor, description: text(body.description) || existingRevenue.description };
        await db.update(crmRevenueEntries).set({ projectedRevenueMinor, projectedMarginMinor, revenueMinor: projectedRevenueMinor, marginMinor: projectedMarginMinor, description: record.description }).where(eq(crmRevenueEntries.id, existingRevenue.id));
        response = { id: existingRevenue.id, record, merged: true };
      } else {
        const record = { id, clientId, ownerMemberId: revenueOwner.id, entryDate, revenueMonth, revenueMinor: projectedRevenueMinor, marginMinor: projectedMarginMinor, projectedRevenueMinor, projectedMarginMinor, actualRevenueMinor: null, actualMarginMinor: null, actualUpdatedByMemberId: null, actualUpdatedAt: null, description: text(body.description), status: "projected" };
        await db.insert(crmRevenueEntries).values(record); response = { id, record };
      }
      await activity(clientId, member.id, "revenue", "revenue", String(response.id), `Revenue entry recorded for ${entryDate}.`);
    } else if (action === "revenue_actual_update") {
      const revenueId = text(body.revenueId); if (!revenueId) throw new Error("Revenue record is required.");
      const [existing] = await db.select().from(crmRevenueEntries).where(eq(crmRevenueEntries.id, revenueId)).limit(1);
      if (!existing) throw new Error("Revenue record was not found.");
      const elevated = member.role === "admin" || member.role === "manager";
      if (!elevated && existing.ownerMemberId !== member.id) throw new Error("You can only update your own revenue records.");
      const actualRevenueMinor = rupeesToMinor(body.actualRevenue);
      const projectedRevenueMinor = existing.projectedRevenueMinor || existing.revenueMinor || 0;
      const projectedMarginMinor = existing.projectedMarginMinor || existing.marginMinor || 0;
      const actualMarginMinor = projectedRevenueMinor ? Math.round(actualRevenueMinor * projectedMarginMinor / projectedRevenueMinor) : 0;
      const status = actualRevenueMinor <= 0 ? "projected" : actualRevenueMinor < projectedRevenueMinor ? "partly_received" : "received";
      await db.update(crmRevenueEntries).set({ actualRevenueMinor, actualMarginMinor, actualUpdatedByMemberId: member.id, actualUpdatedAt: new Date().toISOString(), status }).where(eq(crmRevenueEntries.id, revenueId));
      response = { id: revenueId, status };
    } else if (action === "pipeline") {
      if (!clientId) throw new Error("Choose a client and enter an opportunity.");
      const stage = stages.includes(text(body.stage)) ? text(body.stage) : "l1";
      const pipelineOwner = await assignedOwner(db, member, body.ownerMemberId);
      const [pipelineClient] = await db.select().from(crmClients).where(eq(crmClients.id, clientId)).limit(1);
      const title = text(body.title) || (pipelineClient ? `${pipelineClient.legalName} - ${stage.toUpperCase()}` : "Opportunity");
      const record = { id, clientId: clientId || null, title, ownerMemberId: pipelineOwner.id, stage, probability: defaultProbabilities[stage], expectedRevenueMinor: rupeesToMinor(body.expectedRevenue), expectedMarginMinor: rupeesToMinor(body.expectedMargin), expectedCloseDate: text(body.expectedCloseDate), nextAction: text(body.nextAction), revenueId: null, invoiceId: null, lostAt: null, lostReason: "" };
      await db.insert(crmPipelineItems).values(record); if (clientId) await activity(clientId, member.id, "pipeline", "pipeline", id, `Opportunity ${record.title} added.`); response = { id, record };
    } else if (action === "call") {
      if (!text(body.prospectName) && !clientId) throw new Error("Choose a client or enter a prospect name.");
      const record = { id, clientId: clientId || null, prospectName: text(body.prospectName), callerMemberId: member.id, calledAt: text(body.calledAt) || new Date().toISOString(), outcome: text(body.outcome) || "no_answer", durationSeconds: Math.max(0, Number(body.durationSeconds) || (Number(body.durationMinutes) || 0) * 60), nextFollowUpAt: text(body.nextFollowUpAt), notes: text(body.notes) };
      await db.insert(crmColdCalls).values(record); if (clientId) await activity(clientId, member.id, "call", "call", id, `Cold call logged: ${record.outcome.replaceAll("_", " ")}.`); response = { id, record };
    } else if (action === "meeting") {
      if (!text(body.title) || !text(body.scheduledAt)) throw new Error("Meeting title and date/time are required.");
      const record = { id, clientId: clientId || null, organizerMemberId: member.id, title: text(body.title), attendeeName: text(body.attendeeName), scheduledAt: text(body.scheduledAt), durationMinutes: Math.max(15, Number(body.durationMinutes) || 30), mode: text(body.mode) || "in_person", status: "scheduled", locationOrLink: text(body.locationOrLink), agenda: text(body.agenda), outcome: "" };
      await db.insert(crmMeetings).values(record); if (clientId) await activity(clientId, member.id, "meeting", "meeting", id, `Meeting fixed for ${record.scheduledAt}.`); response = { id, record };
    } else if (action === "invoice") {
      if (!clientId || !text(body.invoiceNumber) || !text(body.issueDate)) throw new Error("Client, invoice number and issue date are required.");
      const [client] = await db.select().from(crmClients).where(eq(crmClients.id, clientId)).limit(1); if (!client) throw new Error("Client was not found.");
      const [duplicateInvoice] = await db.select({ id: crmInvoices.id }).from(crmInvoices).where(eq(crmInvoices.invoiceNumber, text(body.invoiceNumber))).limit(1); if (duplicateInvoice) throw new Error("Invoice number already exists. Use a unique invoice number.");
      const invoiceOwner = await assignedOwner(db, member, body.ownerMemberId);
      const dueDate = text(body.dueDate) || addDays(text(body.issueDate), client.paymentTermsDays || 30);
      const record = { id, clientId, invoiceNumber: text(body.invoiceNumber), issueDate: text(body.issueDate), dueDate, totalMinor: rupeesToMinor(body.total), status: "sent", notes: text(body.notes), createdByMemberId: invoiceOwner.id };
      await db.insert(crmInvoices).values(record); await activity(clientId, member.id, "invoice", "invoice", id, `Invoice ${record.invoiceNumber} raised.`); response = { id, record };
    } else if (action === "invoice_update") {
      const invoiceId = text(body.invoiceId); if (!invoiceId) throw new Error("Invoice is required.");
      const [existingInvoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId)).limit(1); if (!existingInvoice) throw new Error("Invoice was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingInvoice.createdByMemberId !== member.id) throw new Error("You can only edit your own invoices.");
      const invoiceNumber = text(body.invoiceNumber) || existingInvoice.invoiceNumber;
      const [duplicateInvoice] = await db.select({ id: crmInvoices.id }).from(crmInvoices).where(and(eq(crmInvoices.invoiceNumber, invoiceNumber), sql`${crmInvoices.id} <> ${invoiceId}`)).limit(1); if (duplicateInvoice) throw new Error("Invoice number already exists. Use a unique invoice number.");
      const issueDate = cleanDate(body.issueDate) || existingInvoice.issueDate; const dueDate = cleanDate(body.dueDate) || existingInvoice.dueDate;
      if (dueDate < issueDate) throw new Error("Due date cannot be before invoice date.");
      const requestedOwner = text(body.ownerMemberId);
      const ownerChange = requestedOwner && member.role === "admin" ? (await assignedOwner(db, member, requestedOwner)).id : existingInvoice.createdByMemberId;
      const changes = { invoiceNumber, issueDate, dueDate, totalMinor: body.total === undefined || body.total === "" ? existingInvoice.totalMinor : rupeesToMinor(body.total), notes: text(body.notes) || existingInvoice.notes, createdByMemberId: ownerChange };
      await db.update(crmInvoices).set(changes).where(eq(crmInvoices.id, invoiceId)); response = { id: invoiceId, record: { ...existingInvoice, ...changes } };
    } else if (action === "invoice_owner_update") {
      if (member.role !== "admin") throw new Error("Only an administrator can change invoice ownership.");
      const invoiceId = text(body.invoiceId); const requestedOwner = text(body.ownerMemberId);
      if (!invoiceId || !requestedOwner) throw new Error("Invoice and owner are required.");
      const [existingInvoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId)).limit(1); if (!existingInvoice) throw new Error("Invoice was not found.");
      const nextOwner = await assignedOwner(db, member, requestedOwner);
      if (existingInvoice.createdByMemberId !== nextOwner.id) {
        await db.update(crmInvoices).set({ createdByMemberId: nextOwner.id }).where(eq(crmInvoices.id, invoiceId));
        await logActivity(member, "invoices", "owner_change", "invoice", invoiceId, existingInvoice.createdByMemberId, nextOwner.id, existingInvoice.invoiceNumber);
      }
      response = { id: invoiceId, record: { ...existingInvoice, createdByMemberId: nextOwner.id } };
    } else if (action === "invoice_delete") {
      if (member.role !== "admin") throw new Error("Only an administrator can delete invoices.");
      const invoiceId = text(body.invoiceId); if (!invoiceId) throw new Error("Invoice is required.");
      const [existingInvoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId)).limit(1); if (!existingInvoice) throw new Error("Invoice was not found.");
      const linkedPayments = await db.select({ id: crmPayments.id }).from(crmPayments).where(eq(crmPayments.invoiceId, invoiceId)).limit(1);
      if (linkedPayments.length) throw new Error("This invoice has payments. Remove its payments before deleting it.");
      await db.update(crmPipelineItems).set({ invoiceId: null }).where(eq(crmPipelineItems.invoiceId, invoiceId));
      await db.delete(crmInvoices).where(eq(crmInvoices.id, invoiceId));
      await logActivity(member, "invoices", "delete", "invoice", invoiceId, JSON.stringify(existingInvoice), "", "Invoice deleted by administrator");
      response = { id: invoiceId, deleted: true };
    } else if (action === "bulk_invoices") {
      const csv = text(body.csv); if (!csv) throw new Error("Invoice CSV is empty.");
      const rows = parseCsv(csv); const allClients = await db.select().from(crmClients); const allMembers = await db.select().from(crmMembers); const elevated = member.role === "admin" || member.role === "manager"; const availableClients = elevated ? allClients : allClients.filter((candidate) => candidate.ownerMemberId === member.id); let imported = 0; let createdClients = 0; const skipped: string[] = []; const existingNumbers = new Set((await db.select({ invoiceNumber: crmInvoices.invoiceNumber }).from(crmInvoices)).map((row) => row.invoiceNumber.trim()));
      const normalizeImportName = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const aliases: Record<string, string> = { healthiummedtechlimited: "healthiummedtech", ericsoninsurancetpaprivatelimited: "ericsson", iffcotokio: "iffcotokio", healthindia: "healthindia", thetransformation: "transformationgym", ohchealthcare: "ohc", unitedbreweriesltd: "unitedbrewerieslimited", balloonhealthcare: "balloon" };
      const canonicalImportName = (value: string) => aliases[normalizeImportName(value)] || normalizeImportName(value);
      const resolveOwner = (value: string) => {
        const key = normalizeImportName(value); if (!key) return member;
        const alias = key === "bhagwanvanare" ? "bhagawanvanare" : key === "dugeshmishra" ? "durgeshmishra" : key === "omkarsawnt" ? "omkarsawant" : key === "khushalsharma" ? "kushalsharma" : key;
        return allMembers.find((candidate) => canonicalImportName(candidate.fullName) === alias || canonicalImportName(candidate.email) === alias) || member;
      };
      for (const row of rows) {
        const key = text(row.clientId || row.clientCode || row.clientName || row.client || row.company); const invoiceNumber = text(row.invoiceNumber || row.invoice); if (!key || !invoiceNumber) { skipped.push(key || "unknown client"); continue; }
        if (existingNumbers.has(invoiceNumber)) { skipped.push(`${invoiceNumber} (duplicate)`); continue; }
        const owner = resolveOwner(text(row.ownerName || row.owner || row.creator || row.creater));
        const normalized = canonicalImportName(key);
        let client = availableClients.find((candidate) => candidate.id === key || candidate.clientCode === key || candidate.legalName.toLowerCase() === key.toLowerCase());
        if (!client) {
          const candidates = availableClients.filter((candidate) => canonicalImportName(candidate.legalName) === normalized);
          if (candidates.length === 1) client = candidates[0];
        }
        if (!client) {
          const clientId = uid();
          client = { id: clientId, clientCode: `WB-${clientId.slice(0, 8).toUpperCase()}`, legalName: key, contactName: "", contactEmail: "", contactPhone: "", industry: "", segment: "", city: "", status: "prospect", leadSource: "Other", ownerMemberId: owner.id, teamName: owner.teamName || "General", paymentTermsDays: 30, notes: "Imported from Workbook3.xlsx.", createdByMemberId: member.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          await db.insert(crmClients).values(client); allClients.push(client); availableClients.push(client); createdClients += 1;
        }
        const issueDate = cleanDate(row.issueDate || row.date) || dateOnly(); const dueDate = cleanDate(row.dueDate) || addDays(issueDate, client.paymentTermsDays || 30); const rawStatus = text(row.status || row.remark).toLowerCase().replaceAll(" ", "_"); const status = rawStatus === "paid" ? "paid" : rawStatus === "part_paid" || rawStatus === "partially_paid" ? "partially_paid" : "sent";
        await db.insert(crmInvoices).values({ id: uid(), clientId: client.id, invoiceNumber, issueDate, dueDate, totalMinor: rupeesToMinor(row.total || row.amount), status, notes: text(row.notes), createdByMemberId: owner.id }); existingNumbers.add(invoiceNumber); imported += 1;
      }
      response = { id, imported, createdClients, skipped };
    } else if (action === "vendor") {
      if (!text(body.vendorName)) throw new Error("Vendor name is required.");
      const selectedIds = Array.isArray(body.clientIds) ? (body.clientIds as unknown[]).map(text).filter(Boolean) : (clientId ? [clientId] : []);
      const proposedDate = cleanDate(body.proposedDate || body.dueDate);
      const creditPeriodDays = Math.max(0, Number(body.creditPeriodDays) || 0);
      const paymentStatus = cleanVendorStatus(body.paymentStatus || body.vendorPaymentStatus);
      const staffMemberId = (member.role === "admin" || member.role === "manager") && text(body.staffMemberId) ? text(body.staffMemberId) : member.id;
      const record = { id, vendorName: text(body.vendorName), amountMinor: rupeesToMinor(body.amount), clientId: selectedIds[0] || null, clientIds: JSON.stringify(selectedIds), customerType: selectedIds.length ? "linked_client" : "direct_customer", directCustomerName: text(body.directCustomerName) || (selectedIds.length ? "" : text(body.vendorName)), clientPayment: selectedIds.length ? "no" : "no", vendorPaymentStatus: paymentStatus, paymentStatus, proposedDate, creditPeriodDays, invoiceDate: cleanDate(body.invoiceDate), dueDate: proposedDate ? addDays(proposedDate, creditPeriodDays) : "", ownerMemberId: member.id, staffMemberId, notes: text(body.notes) };
      await db.insert(crmVendors).values(record); if (selectedIds[0]) await activity(selectedIds[0], member.id, "vendor", "vendor", id, `Vendor ${record.vendorName} added.`); response = { id, record };
    } else if (action === "vendor_update") {
      const vendorId = text(body.vendorId); if (!vendorId) throw new Error("Vendor payable is required.");
      const [existingVendor] = await db.select().from(crmVendors).where(eq(crmVendors.id, vendorId)).limit(1); if (!existingVendor) throw new Error("Vendor payable was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingVendor.ownerMemberId !== member.id) throw new Error("You can only edit your own vendor payables.");
      let previousIds: string[] = [];
      try { const parsed = JSON.parse(existingVendor.clientIds || "[]"); if (Array.isArray(parsed)) previousIds = parsed.map(String).filter(Boolean); } catch { if (existingVendor.clientId) previousIds = [existingVendor.clientId]; }
      const selectedIds = Array.isArray(body.clientIds) ? (body.clientIds as unknown[]).map(text).filter(Boolean) : (text(body.clientId) ? [text(body.clientId)] : previousIds);
      const proposedDate = cleanDate(body.proposedDate || body.dueDate) || existingVendor.proposedDate;
      const creditPeriodDays = Math.max(0, Number(body.creditPeriodDays) || existingVendor.creditPeriodDays || 0);
      const paymentStatus = cleanVendorStatus(body.paymentStatus || body.vendorPaymentStatus || existingVendor.paymentStatus || existingVendor.vendorPaymentStatus);
      const suppliedInvoiceDate = body.invoiceDate === null || body.invoiceDate === undefined ? existingVendor.invoiceDate : cleanDate(body.invoiceDate);
      const staffMemberId = (member.role === "admin" || member.role === "manager") && text(body.staffMemberId) ? text(body.staffMemberId) : (existingVendor.staffMemberId || member.id);
      const changes = { vendorName: text(body.vendorName) || existingVendor.vendorName, amountMinor: body.amount === undefined || body.amount === "" ? existingVendor.amountMinor : rupeesToMinor(body.amount), clientId: selectedIds[0] || null, clientIds: JSON.stringify(selectedIds), customerType: selectedIds.length ? "linked_client" : "direct_customer", directCustomerName: text(body.directCustomerName) || (selectedIds.length ? "" : existingVendor.directCustomerName || text(body.vendorName)), proposedDate, creditPeriodDays, invoiceDate: suppliedInvoiceDate === "invoice_date" ? "" : suppliedInvoiceDate, dueDate: proposedDate ? addDays(proposedDate, creditPeriodDays) : "", vendorPaymentStatus: paymentStatus, paymentStatus, staffMemberId, notes: text(body.notes) };
      await db.update(crmVendors).set(changes).where(eq(crmVendors.id, vendorId)); response = { id: vendorId, record: { ...existingVendor, ...changes } };
    } else if (action === "vendor_status_update") {
      const vendorId = text(body.vendorId); if (!vendorId) throw new Error("Vendor payable is required.");
      const [existingVendor] = await db.select().from(crmVendors).where(eq(crmVendors.id, vendorId)).limit(1); if (!existingVendor) throw new Error("Vendor payable was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingVendor.ownerMemberId !== member.id) throw new Error("You can only update your own vendor payables.");
      const paymentStatus = cleanVendorStatus(body.paymentStatus || body.vendorPaymentStatus);
      await db.update(crmVendors).set({ paymentStatus, vendorPaymentStatus: paymentStatus }).where(eq(crmVendors.id, vendorId));
      response = { id: vendorId, paymentStatus };
    } else if (action === "daily_booking") {
      if (!clientId || !text(body.bookingDate)) throw new Error("Client and booking date are required.");
      const payload = { clientId, bookingDate: text(body.bookingDate), amountMinor: rupeesToMinor(body.amount), marginPercent: Number(body.marginPercent) || 0, notes: text(body.notes), actorMemberId: member.id };
      await db.insert(crmActivityEvents).values({ id, clientId, actorMemberId: member.id, eventType: "daily_booking", entityType: "daily_booking", entityId: id, body: JSON.stringify(payload) });
      response = { id, record: { id, clientId, actorMemberId: member.id, occurredAt: new Date().toISOString(), body: JSON.stringify(payload) } };
    } else if (action === "payment") {
      const invoiceId = text(body.invoiceId); if (!invoiceId || !clientId || !text(body.receivedOn)) throw new Error("Client, invoice and received date are required.");
      const record = { id, invoiceId, clientId, receivedOn: text(body.receivedOn), amountMinor: rupeesToMinor(body.amount), method: text(body.method) || "bank_transfer", referenceNo: text(body.referenceNo), notes: text(body.notes), recordedByMemberId: member.id };
      if (record.amountMinor <= 0) throw new Error("Payment amount must be greater than zero.");
      await db.insert(crmPayments).values(record);
      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId)).limit(1);
      const linkedPipelines = await db.select().from(crmPipelineItems).where(and(eq(crmPipelineItems.clientId, clientId), eq(crmPipelineItems.invoiceId, invoiceId)));
      const linkedRevenueIds = linkedPipelines.map((item) => meaningfulId(item.revenueId)).filter(Boolean) as string[];
      const revenueRows = linkedRevenueIds.length ? await db.select().from(crmRevenueEntries).where(inArray(crmRevenueEntries.id, linkedRevenueIds)) : await db.select().from(crmRevenueEntries).where(and(eq(crmRevenueEntries.clientId, clientId), eq(crmRevenueEntries.revenueMonth, record.receivedOn.slice(0, 7))));
      const targetRevenue = revenueRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (targetRevenue) {
        const actualRevenueMinor = (targetRevenue.actualRevenueMinor || 0) + record.amountMinor;
        const ratio = targetRevenue.projectedRevenueMinor || targetRevenue.revenueMinor || 0;
        const actualMarginMinor = ratio ? Math.round(actualRevenueMinor * (targetRevenue.projectedMarginMinor || targetRevenue.marginMinor || 0) / ratio) : 0;
        await db.update(crmRevenueEntries).set({ actualRevenueMinor, actualMarginMinor, actualUpdatedByMemberId: member.id, actualUpdatedAt: new Date().toISOString(), status: actualRevenueMinor >= ratio ? "received" : "partly_received" }).where(eq(crmRevenueEntries.id, targetRevenue.id));
      }
      if (invoice) {
        const paidMinor = (await db.select({ total: sql<number>`coalesce(sum(${crmPayments.amountMinor}), 0)` }).from(crmPayments).where(eq(crmPayments.invoiceId, invoiceId)))[0]?.total || 0;
        await db.update(crmInvoices).set({ status: paidMinor >= invoice.totalMinor ? "paid" : paidMinor > 0 ? "partially_paid" : "sent" }).where(eq(crmInvoices.id, invoiceId));
      }
      await activity(clientId, member.id, "payment", "payment", id, `Payment received on ${record.receivedOn}.`); response = { id, record };
    } else if (action === "payment_update") {
      const paymentId = text(body.paymentId); if (!paymentId) throw new Error("Payment entry is required.");
      const [existingPayment] = await db.select().from(crmPayments).where(eq(crmPayments.id, paymentId)).limit(1); if (!existingPayment) throw new Error("Payment entry was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingPayment.recordedByMemberId !== member.id) throw new Error("You can only edit your own payment entries.");
      const changes = { receivedOn: text(body.receivedOn) || existingPayment.receivedOn, revenueMonth: text(body.revenueMonth) || existingPayment.revenueMonth || text(body.receivedOn).slice(0, 7), amountMinor: body.amount === undefined || body.amount === "" ? existingPayment.amountMinor : rupeesToMinor(body.amount), tdsMinor: body.tds === undefined || body.tds === "" ? existingPayment.tdsMinor : rupeesToMinor(body.tds), method: text(body.method) || existingPayment.method, referenceNo: text(body.referenceNo), notes: text(body.notes) };
      await db.update(crmPayments).set(changes).where(eq(crmPayments.id, paymentId)); await recalculateInvoice(db, existingPayment.invoiceId); response = { id: paymentId, record: { ...existingPayment, ...changes } };
    } else if (action === "payment_delete") {
      const paymentId = text(body.paymentId); if (!paymentId) throw new Error("Payment entry is required.");
      const [existingPayment] = await db.select().from(crmPayments).where(eq(crmPayments.id, paymentId)).limit(1); if (!existingPayment) throw new Error("Payment entry was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingPayment.recordedByMemberId !== member.id) throw new Error("You can only delete your own payment entries.");
      await db.delete(crmPayments).where(eq(crmPayments.id, paymentId)); await recalculateInvoice(db, existingPayment.invoiceId); response = { id: paymentId };
    } else if (action === "create_missing_revenue") {
      if (member.role !== "admin" && member.role !== "manager") throw new Error("Only an admin can create a missing revenue record.");
      const pipelineId = text(body.pipelineId); if (!pipelineId) throw new Error("Pipeline item is required.");
      const [item] = await db.select().from(crmPipelineItems).where(eq(crmPipelineItems.id, pipelineId)).limit(1);
      if (!item || !["l3", "l4", "l5"].includes(item.stage) || !item.clientId) throw new Error("This deal is not an eligible missing-revenue item.");
      const linkedId = meaningfulId(item.revenueId);
      if (linkedId) { const [linked] = await db.select({ id: crmRevenueEntries.id }).from(crmRevenueEntries).where(eq(crmRevenueEntries.id, linkedId)).limit(1); if (linked) { response = { id: linked.id, created: false }; }
      } else {
        const month = item.expectedCloseDate?.slice(0, 7) || dateOnly().slice(0, 7);
        const [existingRevenue] = await db.select().from(crmRevenueEntries).where(and(eq(crmRevenueEntries.clientId, item.clientId), eq(crmRevenueEntries.revenueMonth, month))).limit(1);
        const revenueId = existingRevenue?.id || uid();
        if (!existingRevenue) {
          await db.insert(crmRevenueEntries).values({ id: revenueId, clientId: item.clientId, ownerMemberId: item.ownerMemberId, entryDate: `${month}-01`, revenueMonth: month, revenueMinor: item.expectedRevenueMinor || 0, marginMinor: item.expectedMarginMinor || 0, projectedRevenueMinor: item.expectedRevenueMinor || 0, projectedMarginMinor: item.expectedMarginMinor || 0, actualRevenueMinor: null, actualMarginMinor: null, actualUpdatedByMemberId: null, actualUpdatedAt: null, description: `Created from pipeline ${item.id}`, status: "projected" });
        }
        await db.update(crmPipelineItems).set({ revenueId }).where(eq(crmPipelineItems.id, item.id));
        await activity(item.clientId, member.id, "revenue", "revenue", revenueId, `Revenue record created from ${item.title}.`);
        response = { id: revenueId, created: !existingRevenue };
      }
    } else if (action === "pipeline_update") {
      const pipelineId = text(body.pipelineId); const nextStage = text(body.stage); if (!pipelineId || (nextStage !== "lost" && nextStage !== "on_hold" && !stages.includes(nextStage))) throw new Error("A valid pipeline item and stage are required.");
      const [item] = await db.select().from(crmPipelineItems).where(eq(crmPipelineItems.id, pipelineId)).limit(1); if (!item) throw new Error("Pipeline item was not found.");
      const elevated = member.role === "admin" || member.role === "manager";
      const owner = (await db.select({ teamName: crmMembers.teamName }).from(crmMembers).where(eq(crmMembers.id, item.ownerMemberId)).limit(1))[0];
      const withinTeam = member.role === "head" && owner?.teamName === member.teamName;
      if (!elevated && !withinTeam && item.ownerMemberId !== member.id) throw new Error("You can only move pipeline items assigned to you or your team.");
      if (nextStage === "lost" || nextStage === "on_hold") {
        if (nextStage === "lost" && !["l1", "l2", "l3"].includes(item.stage)) throw new Error("Only L1 to L3 deals can be marked lost.");
        await db.update(crmPipelineItems).set({ stage: nextStage, lostAt: nextStage === "lost" ? new Date().toISOString() : null, lostReason: text(body.lostReason), updatedAt: new Date().toISOString() }).where(eq(crmPipelineItems.id, item.id)); if (item.clientId) await db.update(crmClients).set({ status: nextStage, updatedAt: new Date().toISOString() }).where(eq(crmClients.id, item.clientId)); response = { id: item.id };
      }
      else {
        const storedRevenueId = meaningfulId(item.revenueId);
        if (["l1", "l2"].includes(nextStage) && storedRevenueId) {
          const [linkedRevenue] = await db.select().from(crmRevenueEntries).where(eq(crmRevenueEntries.id, storedRevenueId)).limit(1);
          if (linkedRevenue?.actualRevenueMinor && linkedRevenue.actualRevenueMinor > 0) throw new Error("This deal has actual revenue and cannot move back to L1 or L2.");
          await db.delete(crmRevenueEntries).where(eq(crmRevenueEntries.id, storedRevenueId));
        }
        let revenueId = storedRevenueId; let invoiceId = meaningfulId(item.invoiceId);
        if (["l1", "l2"].includes(nextStage)) revenueId = null;
        if (["l3", "l4", "l5"].includes(nextStage) && item.clientId) {
          const month = text(body.revenueMonth) || item.expectedCloseDate.slice(0, 7) || dateOnly().slice(0, 7);
          const projectedRevenueMinor = item.expectedRevenueMinor || 0; const projectedMarginMinor = item.expectedMarginMinor || 0;
          if (revenueId) await db.update(crmRevenueEntries).set({ projectedRevenueMinor, projectedMarginMinor, revenueMinor: projectedRevenueMinor, marginMinor: projectedMarginMinor, revenueMonth: month, entryDate: `${month}-01` }).where(eq(crmRevenueEntries.id, revenueId));
          else {
            const description = `Auto-created from pipeline ${item.id}`; const [existingRevenue] = await db.select().from(crmRevenueEntries).where(eq(crmRevenueEntries.description, description)).limit(1);
            revenueId = existingRevenue?.id || uid();
            if (!existingRevenue) await db.insert(crmRevenueEntries).values({ id: revenueId, clientId: item.clientId, ownerMemberId: item.ownerMemberId, entryDate: `${month}-01`, revenueMonth: month, revenueMinor: projectedRevenueMinor, marginMinor: projectedMarginMinor, projectedRevenueMinor, projectedMarginMinor, actualRevenueMinor: null, actualMarginMinor: null, actualUpdatedByMemberId: null, actualUpdatedAt: null, description, status: "projected" });
          }
          if (nextStage === "l5" && !invoiceId) {
            const invoiceDate = text(body.invoiceDate); if (!invoiceDate) throw new Error("Invoice date is required when a deal moves to L5.");
            const [client] = await db.select().from(crmClients).where(eq(crmClients.id, item.clientId)).limit(1); if (!client) throw new Error("Client was not found.");
            invoiceId = uid(); await db.insert(crmInvoices).values({ id: invoiceId, clientId: item.clientId, invoiceNumber: text(body.invoiceNumber) || `AUTO-${item.id.slice(0, 8).toUpperCase()}`, issueDate: invoiceDate, dueDate: addDays(invoiceDate, client.paymentTermsDays || 30), totalMinor: rupeesToMinor(body.invoiceAmount) || projectedRevenueMinor, status: "sent", notes: `Created from pipeline ${item.title}`, createdByMemberId: member.id });
          }
        }
        await db.update(crmPipelineItems).set({ stage: nextStage, probability: defaultProbabilities[nextStage], revenueId, invoiceId, lostAt: null, updatedAt: new Date().toISOString() }).where(eq(crmPipelineItems.id, item.id)); if (item.clientId) await db.update(crmClients).set({ status: nextStage, updatedAt: new Date().toISOString() }).where(eq(crmClients.id, item.clientId)); response = { id: item.id, revenueId, invoiceId };
      }
    } else if (action === "meeting_update") {
      const meetingId = text(body.meetingId); if (!meetingId) throw new Error("Meeting is required.");
      const [existingMeeting] = await db.select().from(crmMeetings).where(eq(crmMeetings.id, meetingId)).limit(1); if (!existingMeeting) throw new Error("Meeting was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingMeeting.organizerMemberId !== member.id) throw new Error("You can only edit your own meetings.");
      const changes = { clientId: text(body.clientId) || existingMeeting.clientId, title: text(body.title) || existingMeeting.title, attendeeName: text(body.attendeeName), scheduledAt: text(body.scheduledAt) || existingMeeting.scheduledAt, durationMinutes: Math.max(15, Number(body.durationMinutes) || existingMeeting.durationMinutes), mode: text(body.mode) || existingMeeting.mode, locationOrLink: text(body.locationOrLink), agenda: text(body.agenda) };
      await db.update(crmMeetings).set(changes).where(eq(crmMeetings.id, meetingId)); response = { id: meetingId, record: { ...existingMeeting, ...changes } };
    } else if (action === "meeting_delete") {
      const meetingId = text(body.meetingId); if (!meetingId) throw new Error("Meeting is required.");
      const [existingMeeting] = await db.select().from(crmMeetings).where(eq(crmMeetings.id, meetingId)).limit(1); if (!existingMeeting) throw new Error("Meeting was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingMeeting.organizerMemberId !== member.id) throw new Error("You can only delete your own meetings.");
      await db.delete(crmMeetings).where(eq(crmMeetings.id, meetingId)); response = { id: meetingId };
    } else if (action === "bulk_calls") {
      const rows = Array.isArray(body.rows) ? body.rows as Record<string, unknown>[] : []; if (!rows.length) throw new Error("No call rows were supplied."); const allClients = await db.select().from(crmClients); const elevated = member.role === "admin" || member.role === "manager"; const availableClients = elevated ? allClients : allClients.filter((candidate) => candidate.ownerMemberId === member.id); let imported = 0; const skipped: string[] = []; const existingCalls = await db.select().from(crmColdCalls);
      for (const row of rows) { const key = text(row.clientId || row.clientCode || row.clientName || row.client || row.prospectName); const candidate = availableClients.find((item) => item.id === key || item.clientCode === key || item.legalName.toLowerCase() === key.toLowerCase()); const prospectName = text(row.prospectName) || (candidate ? candidate.legalName : ""); const calledAt = text(row.calledAt); const outcome = text(row.outcome) || "no_answer"; const duplicate = existingCalls.some((call) => (candidate ? call.clientId === candidate.id : call.prospectName.toLowerCase() === prospectName.toLowerCase()) && call.calledAt === calledAt && call.outcome === outcome); if ((!candidate && !prospectName) || !calledAt || duplicate) { skipped.push(key || "invalid row"); continue; } const record = { id: uid(), clientId: candidate?.id || null, prospectName, callerMemberId: member.id, calledAt, outcome, durationSeconds: Math.max(0, Number(row.durationSeconds) || 0), nextFollowUpAt: text(row.nextFollowUpAt), notes: text(row.notes) }; await db.insert(crmColdCalls).values(record); existingCalls.push(record); imported += 1; }
      response = { id, imported, skipped };
    } else if (action === "reset_password") {
      if (member.role !== "admin" && member.role !== "manager") throw new Error("Only an administrator can reset passwords."); const targetId = text(body.memberId); const temporaryPassword = `Temp-${crypto.randomUUID().slice(0, 8)}`; await db.update(crmMembers).set({ temporaryPassword: await hashPassword(temporaryPassword), forcePasswordChange: true }).where(eq(crmMembers.id, targetId)); response = { id: targetId, tempPassword: temporaryPassword };
    } else if (action === "team_member_add") {
      const teamName = text(body.teamName); const elevated = member.role === "admin" || member.role === "manager"; const isHead = member.role === "head" && member.teamName === teamName; if (!elevated && !isHead) throw new Error("Only the team head or administrator can add members."); if (!teamName || !text(body.fullName) || !text(body.email)) throw new Error("Name, real email and team are required."); const temporaryPassword = `Temp-${crypto.randomUUID().slice(0, 8)}`; const newMember = { id: uid(), authSubject: `invite:${uid()}`, email: text(body.email), fullName: text(body.fullName), role: text(body.role) === "head" && elevated ? "head" : "staff", teamName, isActive: true, temporaryPassword: await hashPassword(temporaryPassword), forcePasswordChange: true }; await db.insert(crmMembers).values(newMember); response = { id: newMember.id, temporaryPassword };
    } else if (action === "team_member_remove") {
      const targetId = text(body.memberId); const [target] = await db.select().from(crmMembers).where(eq(crmMembers.id, targetId)).limit(1); if (!target) throw new Error("Team member was not found."); const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && !(member.role === "head" && member.teamName === target.teamName)) throw new Error("Only the team head or administrator can remove members."); if (target.role === "head" && !elevated) throw new Error("A team head cannot remove another team head."); await db.update(crmMembers).set({ isActive: false }).where(eq(crmMembers.id, targetId)); response = { id: targetId };
    } else if (action === "agreement") {
      if (!clientId || !text(body.title)) throw new Error("Client and agreement title are required.");
      const record = { id, clientId, title: text(body.title), agreementNumber: text(body.agreementNumber), status: text(body.status) || "pending_signature", effectiveDate: text(body.effectiveDate), expiryDate: text(body.expiryDate), valueMinor: rupeesToMinor(body.value), summary: text(body.summary), paymentTerms: text(body.paymentTerms), renewalTerms: text(body.renewalTerms), ownerMemberId: member.id };
      const [duplicate] = await db.select().from(crmAgreements).where(and(eq(crmAgreements.clientId, record.clientId), eq(crmAgreements.title, record.title), eq(crmAgreements.valueMinor, record.valueMinor), eq(crmAgreements.expiryDate, record.expiryDate))).limit(1);
      if (duplicate) { response = { id: duplicate.id, record: duplicate, duplicate: true }; }
      else { await db.insert(crmAgreements).values(record); await activity(clientId, member.id, "agreement", "agreement", id, `Agreement ${record.title} added.`); response = { id, record }; }
    } else if (action === "agreement_update") {
      const agreementId = text(body.agreementId); if (!agreementId) throw new Error("Agreement is required.");
      const [existing] = await db.select().from(crmAgreements).where(eq(crmAgreements.id, agreementId)).limit(1); if (!existing) throw new Error("Agreement was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existing.ownerMemberId !== member.id) throw new Error("You can only edit your own agreements.");
      await db.update(crmAgreements).set({ summary: text(body.summary), paymentTerms: text(body.paymentTerms), renewalTerms: text(body.renewalTerms) }).where(eq(crmAgreements.id, agreementId)); response = { id: agreementId };
    } else if (action === "agreement_delete") {
      const agreementId = text(body.agreementId); if (!agreementId) throw new Error("Agreement is required.");
      const [existingAgreement] = await db.select().from(crmAgreements).where(eq(crmAgreements.id, agreementId)).limit(1); if (!existingAgreement) throw new Error("Agreement was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && existingAgreement.ownerMemberId !== member.id) throw new Error("You can only delete your own agreements.");
      await db.update(crmDocuments).set({ deletedAt: new Date().toISOString() }).where(and(eq(crmDocuments.entityType, "agreement"), eq(crmDocuments.entityId, agreementId)));
      await db.delete(crmAgreements).where(eq(crmAgreements.id, agreementId)); response = { id: agreementId };
    } else if (action === "cleanup_demo_associates") {
      if (member.role !== "admin") throw new Error("Only an administrator can remove demo associates.");
      response = await removeUnlinkedDemoAssociates(db);
    } else if (action === "pipeline_settings") {
      if (member.role !== "admin") throw new Error("Only an administrator can change stage probabilities.");
      const probabilities = Object.fromEntries(stages.map((stage) => [stage, Math.max(0, Math.min(100, Number((body.probabilities as Record<string, unknown> | undefined)?.[stage]) || defaultProbabilities[stage]))]));
      const [existing] = await db.select().from(crmPipelineSettings).where(eq(crmPipelineSettings.id, "global")).limit(1);
      if (existing) await db.update(crmPipelineSettings).set({ probabilities: JSON.stringify(probabilities), updatedByMemberId: member.id, updatedAt: new Date().toISOString() }).where(eq(crmPipelineSettings.id, "global"));
      else await db.insert(crmPipelineSettings).values({ id: "global", probabilities: JSON.stringify(probabilities), updatedByMemberId: member.id });
      response = { id: "global", probabilities };
    } else { throw new Error("Unknown CRM action."); }
    await logActivity(member, action || "unknown", action || "unknown", action || "", String(response.id || id), "", JSON.stringify(response.record || response), "CRM action completed");
    crmResponseCache.clear();
    return Response.json({ ok: true, ...response }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save this CRM record." }, { status: 400 }); }
}

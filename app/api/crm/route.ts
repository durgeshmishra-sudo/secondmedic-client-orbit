import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  crmActivityEvents, crmAgreements, crmClients, crmColdCalls, crmDocuments,
  crmInvoices, crmMeetings, crmMembers, crmPayments, crmPipelineItems, crmPipelineSettings, crmRevenueEntries, crmVendors,
} from "../../../db/schema";

const uid = () => crypto.randomUUID();
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const rupeesToMinor = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));
const dateOnly = () => new Date().toISOString().slice(0, 10);
const addDays = (value: string, days: number) => { const date = new Date(value + "T00:00:00"); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const stages = ["l1", "l2", "l3", "l4", "l5"];
const defaultProbabilities: Record<string, number> = { l1: 20, l2: 50, l3: 100, l4: 100, l5: 100 };
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
  { name: "Pratik Darji", target: 1500000, mtd: 300000, team: "Pratik BD Team", confirmed: [["Future Generali",70000,10500],["SBI Camp",60000,10800],["Doctor Referral",300000,45000],["PolicyQ",50000,10000],["Healthians",50000,5000],["USV",50000,5000],["ICPA",40000,6000],["Zyla",20000,2000],["Taxon",50000,2500],["Iffco Tokio",200000,40000],["Health India",90000,9000],["TSF",10000,1000]], pipeline: [["Salam Foundation",100000,"Camp · yet to fix"],["Oppo",300000,"Camp"],["Agilent",0,"Wednesday meeting"],["GoWellNext",400000,"PPME"],["Marsh",100000,"Wellness"],["IFGI Petro Chemicals",10000,"AHC"],["Odyssey Logistic",80000,"Camp"],["Jio Insurance",100000,"Wellness"],["Call Health",200000,"OPD, AHC"],["Quantum",50000,"Camp"],["Vantrock",200000,"Wellness"],["Kotak Life",100000,"AHC"],["Birla IVF",0,"—"],["JB Boda",0,"—"]], payments: [["Healthians",130000,"2026-10-23"],["Iffco Tokio",300000,"2026-10-19"],["Health India",10000,"2026-10-13"],["ICPA",24000,"2026-10-25"]] },
  { name: "Yogesh Pawar", target: 700000, mtd: 100000, team: "Yogesh BD Team", confirmed: [["Ericsson",100000,15000],["Synergy Insurance",50000,7500],["Salasar Broker",125000,18750],["Globe Secure",75000,11250],["Retail OPD",50000,7500],["Singh Tech",25000,3750],["MCX",100000,15000]], pipeline: [["Mcure",600000,"OPD"],["Liberty",300000,"OPD, wellness"],["Prudent Insurance",50000,"AHC"],["Mankad",100000,"OPD"],["Mahale Engineering",250000,"AHC"],["Emirates Logistic",100000,"AHC"],["Futurix Insurance",100000,"AHC"],["FHPL TPA",100000,"AHC"],["Share India Insurance",50000,"Wellness"],["CoverMitra Insurance",50000,"AHC"],["India Insure Broker",150000,"OPD"]], payments: [["Ericsson",48500,"2026-10-25"]] },
  { name: "Mukesh Mishra", target: 1500000, mtd: 250000, team: "Mukesh BD Team", confirmed: [["Transformation Gym",160000,48000],["Occupational Health Service",120000,33600],["ESR Agro",220000,110000],["Vadesh Healthcare",250000,50000],["United Brew",200000,20000],["Elementis",150000,30000],["RafaCure",150000,22500]], pipeline: [["IHC",50000,"Wellness"],["Safe Circle",30000,"Home collection, L2L/B2B"],["Lidchos",20000,"L2L"],["L&T Chennai",10000,"Camp"],["Global Cure Service",100000,"Camp"],["Linux",100000,"Home collection"],["Santan Textile",200000,"OHC"],["Atrall Pipes",270000,"OHC"]], payments: [["Gulf Oil",30000,"2026-10-16"],["Sai Ram",400000,"2026-10-22"]] },
  { name: "Omkar Sawant", target: 1300000, mtd: 200000, team: "Omkar BD Team", confirmed: [["Visit",700000,105000],["Vihance Broker",600000,90000]], pipeline: [["Quibe Health",150000,"AHC, on-site this week"],["Tata Motors",0,"Meeting 16 Oct"],["Call Health",300000,"OPD meeting done"],["Indina Broker",150000,"On-site"],["Visit",500000,"LIC, Radiology Airoli/Dombivli"],["Navi Insurance",0,"100–200 employees AHC"]], payments: [["Visit Health",1100000,"2026-10-15"]] },
];

const importedTeamRoster = [
  { teamName: "Omkar BD Team", head: "Omkar Sawant", memberCount: 2 },
  { teamName: "Mukesh BD Team", head: "Mukesh Mishra", memberCount: 3 },
  { teamName: "Pratik BD Team", head: "Pratik Darji", memberCount: 3 },
  { teamName: "Yogesh BD Team", head: "Yogesh Pawar", memberCount: 1 },
];

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
    for (const [name, revenue, margin] of dashboard.confirmed) await db.insert(crmRevenueEntries).values({ id: crypto.randomUUID(), clientId: clientIds.get(String(name))!, ownerMemberId: member.id, entryDate: "2026-10-01", revenueMinor: Number(revenue) * 100, marginMinor: Number(margin) * 100, projectedRevenueMinor: Number(revenue) * 100, projectedMarginMinor: Number(margin) * 100, revenueMonth: "2026-10", actualRevenueMinor: null, actualMarginMinor: null, description: "Confirmed account imported from Oct ’26 dashboard", status: "projected" });
    for (const [name, amount, status] of dashboard.pipeline) await db.insert(crmPipelineItems).values({ id: crypto.randomUUID(), clientId: clientIds.get(String(name)) || null, title: String(name), ownerMemberId: member.id, stage: "l1", probability: defaultProbabilities.l1, expectedRevenueMinor: Number(amount) * 100, expectedMarginMinor: 0, expectedCloseDate: "2026-10-31", nextAction: String(status) });
    for (const [name, amount, dueDate] of dashboard.payments) { const clientId = clientIds.get(String(name))!; const invoiceId = crypto.randomUUID(); await db.insert(crmInvoices).values({ id: invoiceId, clientId, invoiceNumber: `IMP-${index + 1}-${String(name).slice(0, 4).toUpperCase()}`, issueDate: "2026-10-01", dueDate: String(dueDate), totalMinor: Number(amount) * 100, status: "sent", notes: "Expected payment imported from Oct ’26 dashboard", createdByMemberId: member.id }); }
  }
}

async function syncImportedTeamNames(db: ReturnType<typeof getDb>) {
  for (const dashboard of importedDashboards) {
    const memberId = `demo-${dashboard.name.toLowerCase().replaceAll(" ", "-")}`;
    await db.update(crmMembers).set({ teamName: dashboard.team, role: "head" }).where(eq(crmMembers.id, memberId));
    await db.update(crmClients).set({ teamName: dashboard.team }).where(eq(crmClients.ownerMemberId, memberId));
  }
}

async function syncImportedTeamMembers(db: ReturnType<typeof getDb>) {
  for (const roster of importedTeamRoster) {
    const headId = `demo-${roster.head.toLowerCase().replaceAll(" ", "-")}`;
    const existing = await db.select().from(crmMembers).where(eq(crmMembers.teamName, roster.teamName));
    const needed = Math.max(0, roster.memberCount - existing.length);
    for (let index = 0; index < needed; index += 1) {
      const id = `demo-${roster.teamName.toLowerCase().replaceAll(" ", "-")}-member-${index + 1}`;
      const [already] = await db.select().from(crmMembers).where(eq(crmMembers.id, id)).limit(1);
      if (already) continue;
      await db.insert(crmMembers).values({ id, authSubject: `demo:${id}`, email: `${id}@team.local`, fullName: `${roster.head} Associate ${index + 1}`, role: "staff", teamName: roster.teamName, isActive: true });
    }
    await db.update(crmMembers).set({ role: "head", teamName: roster.teamName }).where(eq(crmMembers.id, headId));
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
    await db.insert(crmPipelineItems).values({ id, clientId: revenue.clientId, title: `Confirmed · ${revenue.description.replace("Confirmed account imported from ", "")}`, ownerMemberId: revenue.ownerMemberId, stage: "l3", probability: 100, expectedRevenueMinor: revenue.projectedRevenueMinor || revenue.revenueMinor, expectedMarginMinor: revenue.projectedMarginMinor || revenue.marginMinor, expectedCloseDate: `${month}-31`, nextAction: "Confirmed imported account", revenueId: revenue.id, invoiceId: null, lostAt: null, lostReason: "" });
  }
}

async function ensurePipelineSettings(db: ReturnType<typeof getDb>) {
  const [settings] = await db.select().from(crmPipelineSettings).where(eq(crmPipelineSettings.id, "global")).limit(1);
  if (settings) return settings;
  const record = { id: "global", probabilities: JSON.stringify(defaultProbabilities), updatedByMemberId: null };
  await db.insert(crmPipelineSettings).values(record);
  return record;
}

async function actor() {
  const identity = await getChatGPTUser();
  if (!identity) throw new Error("Please sign in with ChatGPT to use the CRM.");
  const db = getDb();
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

export async function GET() {
  try {
    const db = getDb(); const member = await actor(); const elevated = member.role === "admin" || member.role === "manager";
    if (elevated) { await seedImportedDashboards(db); await dedupeClients(db); await backfillRevenueFields(db); await normalizePipelineStages(db); await backfillConfirmedPipeline(db); await syncImportedTeamNames(db); await syncImportedTeamMembers(db); await dedupeAgreements(db); await ensurePipelineSettings(db); await db.delete(crmVendors).where(eq(crmVendors.vendorName, "Durgesh")); }
    const clients = elevated
      ? await db.select().from(crmClients).orderBy(desc(crmClients.createdAt)).limit(200)
      : await db.select().from(crmClients).where(eq(crmClients.ownerMemberId, member.id)).orderBy(desc(crmClients.createdAt)).limit(200);
    const ids = visibleClientIds(clients);
    const scoped = <T,>(table: T, column: { name: string }) => ids.length ? inArray(column as never, ids) : sql`0`;
    const [revenue, pipeline, calls, meetings, invoices, payments, agreements, documents, vendors, members, pipelineSettings] = await Promise.all([
      elevated ? db.select().from(crmRevenueEntries).orderBy(desc(crmRevenueEntries.entryDate)).limit(300) : db.select().from(crmRevenueEntries).where(eq(crmRevenueEntries.ownerMemberId, member.id)).orderBy(desc(crmRevenueEntries.entryDate)).limit(300),
      elevated ? db.select().from(crmPipelineItems).orderBy(desc(crmPipelineItems.createdAt)).limit(300) : db.select().from(crmPipelineItems).where(eq(crmPipelineItems.ownerMemberId, member.id)).orderBy(desc(crmPipelineItems.createdAt)).limit(300),
      elevated ? db.select().from(crmColdCalls).orderBy(desc(crmColdCalls.calledAt)).limit(300) : db.select().from(crmColdCalls).where(eq(crmColdCalls.callerMemberId, member.id)).orderBy(desc(crmColdCalls.calledAt)).limit(300),
      elevated ? db.select().from(crmMeetings).orderBy(desc(crmMeetings.scheduledAt)).limit(300) : db.select().from(crmMeetings).where(eq(crmMeetings.organizerMemberId, member.id)).orderBy(desc(crmMeetings.scheduledAt)).limit(300),
      ids.length ? db.select().from(crmInvoices).where(inArray(crmInvoices.clientId, ids)).orderBy(asc(crmInvoices.dueDate)).limit(300) : Promise.resolve([]),
      ids.length ? db.select().from(crmPayments).where(inArray(crmPayments.clientId, ids)).orderBy(desc(crmPayments.receivedOn)).limit(300) : Promise.resolve([]),
      ids.length ? db.select().from(crmAgreements).where(inArray(crmAgreements.clientId, ids)).orderBy(desc(crmAgreements.expiryDate)).limit(300) : Promise.resolve([]),
      ids.length ? db.select().from(crmDocuments).where(inArray(crmDocuments.clientId, ids)).orderBy(desc(crmDocuments.uploadedAt)).limit(300) : Promise.resolve([]),
      ids.length ? db.select().from(crmVendors).where(inArray(crmVendors.clientId, ids)).orderBy(asc(crmVendors.dueDate)).limit(300) : Promise.resolve([]),
      elevated ? db.select().from(crmMembers).orderBy(crmMembers.fullName).limit(100) : Promise.resolve([member]),
      elevated ? db.select().from(crmPipelineSettings).where(eq(crmPipelineSettings.id, "global")).limit(1) : Promise.resolve([]),
    ]);
    void scoped;
    const activeDocuments = documents.filter((doc) => !doc.deletedAt);
    const linkedAgreements = agreements.map((agreement) => { const document = activeDocuments.find((doc) => doc.entityType === "agreement" && doc.entityId === agreement.id); return { ...agreement, documentId: document?.id || "", documentMimeType: document?.mimeType || "", documentName: document?.originalName || "" }; });
    return Response.json({ member, clients, revenue, pipeline, calls, meetings, invoices, payments, agreements: linkedAgreements, documents: activeDocuments, vendors, members, teamSummary: importedTeamRoster, pipelineSettings: pipelineSettings[0] || { id: "global", probabilities: JSON.stringify(defaultProbabilities) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load CRM data." }, { status: 401 });
  }
}

async function activity(clientId: string, memberId: string, eventType: string, entityType: string, entityId: string, body: string) {
  await getDb().insert(crmActivityEvents).values({ id: uid(), clientId, actorMemberId: memberId, eventType, entityType, entityId, body });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const member = await actor(); const db = getDb(); const action = text(body.action);
    let id = uid(); let clientId = text(body.clientId); let response: Record<string, unknown> = { id };
    if (action === "client") {
      const legalName = text(body.legalName); if (!legalName) throw new Error("Client name is required.");
      const normalized = normalizeClientName(legalName);
      const existingNames = await db.select({ id: crmClients.id, legalName: crmClients.legalName }).from(crmClients);
      if (existingNames.some((row) => normalizeClientName(row.legalName) === normalized)) throw new Error("A client with this name already exists. Use the existing client record.");
      const ownerMemberId = member.role === "admin" && text(body.ownerMemberId) ? text(body.ownerMemberId) : member.id;
      const client = { id, clientCode: `CL-${new Date().getFullYear()}-${id.slice(0, 5).toUpperCase()}`, legalName, contactName: text(body.contactName), contactEmail: text(body.contactEmail), contactPhone: text(body.contactPhone), industry: text(body.industry), city: text(body.city), status: text(body.status) || "prospect", ownerMemberId, teamName: text(body.teamName) || member.teamName, paymentTermsDays: Math.max(0, Number(body.paymentTermsDays) || 30), notes: text(body.notes), createdByMemberId: member.id };
      await db.insert(crmClients).values(client); await activity(id, member.id, "client_created", "client", id, `Client ${legalName} added.`); response = { id, client };
    } else if (action === "client_update") {
      if (!clientId) throw new Error("Client is required.");
      const [existingClient] = await db.select().from(crmClients).where(eq(crmClients.id, clientId)).limit(1);
      if (!existingClient) throw new Error("Client was not found.");
      const elevated = member.role === "admin" || member.role === "manager";
      if (!elevated && existingClient.ownerMemberId !== member.id) throw new Error("You can only edit clients assigned to you.");
      const nextLegalName = text(body.legalName) || existingClient.legalName;
      const normalized = normalizeClientName(nextLegalName);
      const duplicate = (await db.select({ id: crmClients.id, legalName: crmClients.legalName }).from(crmClients)).some((row) => row.id !== clientId && normalizeClientName(row.legalName) === normalized);
      if (duplicate) throw new Error("A client with this name already exists. Use the existing client record.");
      const ownerMemberId = elevated && text(body.ownerMemberId) ? text(body.ownerMemberId) : existingClient.ownerMemberId;
      const nextStatus = text(body.status) || existingClient.status;
      const client = { legalName: nextLegalName, contactName: text(body.contactName), contactEmail: text(body.contactEmail), contactPhone: text(body.contactPhone), industry: text(body.industry), city: text(body.city), status: nextStatus, ownerMemberId, teamName: elevated ? (text(body.teamName) || existingClient.teamName) : existingClient.teamName, paymentTermsDays: Math.max(0, Number(body.paymentTermsDays) || existingClient.paymentTermsDays || 30), notes: text(body.notes), updatedAt: new Date().toISOString() };
      await db.update(crmClients).set(client).where(eq(crmClients.id, clientId));
      await activity(clientId, member.id, "client_updated", "client", clientId, `Client ${client.legalName} updated.`); response = { id: clientId, client: { ...existingClient, ...client } };
    } else if (action === "bulk_clients") {
      const csv = text(body.csv); if (!csv) throw new Error("Client CSV is empty.");
      const ownerMemberId = member.role === "admin" && text(body.ownerMemberId) ? text(body.ownerMemberId) : member.id;
      const owner = ownerMemberId ? (await db.select().from(crmMembers).where(eq(crmMembers.id, ownerMemberId)).limit(1))[0] : member;
      if (!owner) throw new Error("Assigned staff member was not found.");
      const rows = parseCsv(csv); let imported = 0; const skipped: string[] = []; const seen = new Set((await db.select({ legalName: crmClients.legalName }).from(crmClients)).map((row) => normalizeClientName(row.legalName)));
      for (const row of rows) { const legalName = text(row.legalName || row.clientName || row.name); if (!legalName) continue; const normalized = normalizeClientName(legalName); if (seen.has(normalized)) { skipped.push(legalName); continue; } const rowId = uid(); await db.insert(crmClients).values({ id: rowId, clientCode: text(row.clientCode) || `CL-${new Date().getFullYear()}-${rowId.slice(0, 5).toUpperCase()}`, legalName, contactName: text(row.contactName), contactEmail: text(row.contactEmail), contactPhone: text(row.contactPhone), industry: text(row.industry), city: text(row.city), status: text(row.status) || "prospect", ownerMemberId: owner.id, teamName: text(row.teamName) || owner.teamName, paymentTermsDays: Math.max(0, Number(row.paymentTermsDays) || 30), notes: text(row.notes), createdByMemberId: member.id }); seen.add(normalized); imported += 1; }
      response = { id, imported, skipped };
    } else if (action === "revenue") {
      const revenueMonth = text(body.revenueMonth) || text(body.entryDate).slice(0, 7); if (!clientId || !revenueMonth) throw new Error("Client and revenue month are required.");
      const projectedRevenueMinor = rupeesToMinor(body.projectedRevenue ?? body.revenue);
      const marginPercent = Math.max(0, Math.min(100, Number(body.marginPercent) || 0));
      const projectedMarginMinor = body.projectedMargin ? rupeesToMinor(body.projectedMargin) : Math.round(projectedRevenueMinor * marginPercent / 100);
      const entryDate = text(body.entryDate) || `${revenueMonth}-01`;
      const record = { id, clientId, ownerMemberId: member.id, entryDate, revenueMonth, revenueMinor: projectedRevenueMinor, marginMinor: projectedMarginMinor, projectedRevenueMinor, projectedMarginMinor, actualRevenueMinor: null, actualMarginMinor: null, actualUpdatedByMemberId: null, actualUpdatedAt: null, description: text(body.description), status: "projected" };
      await db.insert(crmRevenueEntries).values(record); await activity(clientId, member.id, "revenue", "revenue", id, `Revenue entry recorded for ${record.entryDate}.`); response = { id, record };
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
      if (!clientId || !text(body.title)) throw new Error("Choose a client and enter an opportunity title.");
      const stage = stages.includes(text(body.stage)) ? text(body.stage) : "l1";
      const record = { id, clientId: clientId || null, title: text(body.title), ownerMemberId: member.id, stage, probability: Math.max(0, Math.min(100, Number(body.probability) || defaultProbabilities[stage])), expectedRevenueMinor: rupeesToMinor(body.expectedRevenue), expectedMarginMinor: rupeesToMinor(body.expectedMargin), expectedCloseDate: text(body.expectedCloseDate), nextAction: text(body.nextAction), revenueId: null, invoiceId: null, lostAt: null, lostReason: "" };
      await db.insert(crmPipelineItems).values(record); if (clientId) await activity(clientId, member.id, "pipeline", "pipeline", id, `Opportunity ${record.title} added.`); response = { id, record };
    } else if (action === "call") {
      if (!text(body.prospectName) && !clientId) throw new Error("Choose a client or enter a prospect name.");
      const record = { id, clientId: clientId || null, prospectName: text(body.prospectName), callerMemberId: member.id, calledAt: text(body.calledAt) || new Date().toISOString(), outcome: text(body.outcome) || "no_answer", durationSeconds: Math.max(0, Number(body.durationSeconds) || 0), nextFollowUpAt: text(body.nextFollowUpAt), notes: text(body.notes) };
      await db.insert(crmColdCalls).values(record); if (clientId) await activity(clientId, member.id, "call", "call", id, `Cold call logged: ${record.outcome.replaceAll("_", " ")}.`); response = { id, record };
    } else if (action === "meeting") {
      if (!text(body.title) || !text(body.scheduledAt)) throw new Error("Meeting title and date/time are required.");
      const record = { id, clientId: clientId || null, organizerMemberId: member.id, title: text(body.title), attendeeName: text(body.attendeeName), scheduledAt: text(body.scheduledAt), durationMinutes: Math.max(15, Number(body.durationMinutes) || 30), mode: text(body.mode) || "in_person", status: "scheduled", locationOrLink: text(body.locationOrLink), agenda: text(body.agenda), outcome: "" };
      await db.insert(crmMeetings).values(record); if (clientId) await activity(clientId, member.id, "meeting", "meeting", id, `Meeting fixed for ${record.scheduledAt}.`); response = { id, record };
    } else if (action === "invoice") {
      if (!clientId || !text(body.invoiceNumber) || !text(body.issueDate)) throw new Error("Client, invoice number and issue date are required.");
      const [client] = await db.select().from(crmClients).where(eq(crmClients.id, clientId)).limit(1); if (!client) throw new Error("Client was not found.");
      const dueDate = text(body.dueDate) || addDays(text(body.issueDate), client.paymentTermsDays || 30);
      const record = { id, clientId, invoiceNumber: text(body.invoiceNumber), issueDate: text(body.issueDate), dueDate, totalMinor: rupeesToMinor(body.total), status: text(body.status) || "sent", notes: text(body.notes), createdByMemberId: member.id };
      await db.insert(crmInvoices).values(record); await activity(clientId, member.id, "invoice", "invoice", id, `Invoice ${record.invoiceNumber} raised.`); response = { id, record };
    } else if (action === "bulk_invoices") {
      const csv = text(body.csv); if (!csv) throw new Error("Invoice CSV is empty.");
      const rows = parseCsv(csv); const allClients = await db.select().from(crmClients); const elevated = member.role === "admin" || member.role === "manager"; const availableClients = elevated ? allClients : allClients.filter((candidate) => candidate.ownerMemberId === member.id); let imported = 0; const skipped: string[] = [];
      for (const row of rows) { const key = text(row.clientId || row.clientCode || row.clientName || row.client); const client = availableClients.find((candidate) => candidate.id === key || candidate.clientCode === key || candidate.legalName.toLowerCase() === key.toLowerCase()); if (!client || !text(row.invoiceNumber)) { skipped.push(key || "unknown client"); continue; } const issueDate = text(row.issueDate) || dateOnly(); await db.insert(crmInvoices).values({ id: uid(), clientId: client.id, invoiceNumber: text(row.invoiceNumber), issueDate, dueDate: text(row.dueDate) || addDays(issueDate, client.paymentTermsDays || 30), totalMinor: rupeesToMinor(row.total || row.amount), status: text(row.status) || "sent", notes: text(row.notes), createdByMemberId: member.id }); imported += 1; }
      response = { id, imported, skipped };
    } else if (action === "vendor") {
      if (!text(body.vendorName) || !clientId || !text(body.dueDate)) throw new Error("Vendor, client and due date are required.");
      const record = { id, vendorName: text(body.vendorName), amountMinor: rupeesToMinor(body.amount), clientId, clientPayment: text(body.clientPayment) === "yes" ? "yes" : "no", dueDate: text(body.dueDate), ownerMemberId: member.id, notes: text(body.notes) };
      await db.insert(crmVendors).values(record); await activity(clientId, member.id, "vendor", "vendor", id, `Vendor ${record.vendorName} added.`); response = { id, record };
    } else if (action === "payment") {
      const invoiceId = text(body.invoiceId); if (!invoiceId || !clientId || !text(body.receivedOn)) throw new Error("Client, invoice and received date are required.");
      const record = { id, invoiceId, clientId, receivedOn: text(body.receivedOn), amountMinor: rupeesToMinor(body.amount), method: text(body.method) || "bank_transfer", referenceNo: text(body.referenceNo), notes: text(body.notes), recordedByMemberId: member.id };
      if (record.amountMinor <= 0) throw new Error("Payment amount must be greater than zero.");
      await db.insert(crmPayments).values(record);
      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId)).limit(1);
      const linkedPipelines = await db.select().from(crmPipelineItems).where(and(eq(crmPipelineItems.clientId, clientId), eq(crmPipelineItems.invoiceId, invoiceId)));
      const linkedRevenueIds = linkedPipelines.map((item) => item.revenueId).filter(Boolean) as string[];
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
    } else if (action === "pipeline_update") {
      const pipelineId = text(body.pipelineId); const nextStage = text(body.stage); if (!pipelineId || (nextStage !== "lost" && !stages.includes(nextStage))) throw new Error("A valid pipeline item and stage are required.");
      const [item] = await db.select().from(crmPipelineItems).where(eq(crmPipelineItems.id, pipelineId)).limit(1); if (!item) throw new Error("Pipeline item was not found.");
      const elevated = member.role === "admin" || member.role === "manager"; if (!elevated && item.ownerMemberId !== member.id) throw new Error("You can only move your own pipeline items.");
      if (nextStage === "lost") { await db.update(crmPipelineItems).set({ stage: "lost", lostAt: new Date().toISOString(), lostReason: text(body.lostReason), updatedAt: new Date().toISOString() }).where(eq(crmPipelineItems.id, item.id)); response = { id: item.id }; }
      else {
        if (["l1", "l2"].includes(nextStage) && item.revenueId) {
          const [linkedRevenue] = await db.select().from(crmRevenueEntries).where(eq(crmRevenueEntries.id, item.revenueId)).limit(1);
          if (linkedRevenue?.actualRevenueMinor && linkedRevenue.actualRevenueMinor > 0) throw new Error("This deal has actual revenue and cannot move back to L1 or L2.");
          await db.delete(crmRevenueEntries).where(eq(crmRevenueEntries.id, item.revenueId));
        }
        let revenueId = item.revenueId || null; let invoiceId = item.invoiceId || null;
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
            invoiceId = uid(); await db.insert(crmInvoices).values({ id: invoiceId, clientId: item.clientId, invoiceNumber: `AUTO-${item.id.slice(0, 8).toUpperCase()}`, issueDate: invoiceDate, dueDate: addDays(invoiceDate, client.paymentTermsDays || 30), totalMinor: projectedRevenueMinor, status: "sent", notes: `Created from pipeline ${item.title}`, createdByMemberId: member.id });
          }
        }
        await db.update(crmPipelineItems).set({ stage: nextStage, probability: defaultProbabilities[nextStage], revenueId, invoiceId, lostAt: null, updatedAt: new Date().toISOString() }).where(eq(crmPipelineItems.id, item.id)); response = { id: item.id, revenueId, invoiceId };
      }
    } else if (action === "bulk_calls") {
      const rows = Array.isArray(body.rows) ? body.rows as Record<string, unknown>[] : []; if (!rows.length) throw new Error("No call rows were supplied."); const allClients = await db.select().from(crmClients); const elevated = member.role === "admin" || member.role === "manager"; const availableClients = elevated ? allClients : allClients.filter((candidate) => candidate.ownerMemberId === member.id); let imported = 0; const skipped: string[] = []; const existingCalls = await db.select().from(crmColdCalls);
      for (const row of rows) { const key = text(row.clientId || row.clientCode || row.clientName || row.client || row.prospectName); const candidate = availableClients.find((item) => item.id === key || item.clientCode === key || item.legalName.toLowerCase() === key.toLowerCase()); const prospectName = text(row.prospectName) || (candidate ? candidate.legalName : ""); const calledAt = text(row.calledAt); const outcome = text(row.outcome) || "no_answer"; const duplicate = existingCalls.some((call) => (candidate ? call.clientId === candidate.id : call.prospectName.toLowerCase() === prospectName.toLowerCase()) && call.calledAt === calledAt && call.outcome === outcome); if ((!candidate && !prospectName) || !calledAt || duplicate) { skipped.push(key || "invalid row"); continue; } const record = { id: uid(), clientId: candidate?.id || null, prospectName, callerMemberId: member.id, calledAt, outcome, durationSeconds: Math.max(0, Number(row.durationSeconds) || 0), nextFollowUpAt: text(row.nextFollowUpAt), notes: text(row.notes) }; await db.insert(crmColdCalls).values(record); existingCalls.push(record); imported += 1; }
      response = { id, imported, skipped };
    } else if (action === "reset_password") {
      if (member.role !== "admin" && member.role !== "manager") throw new Error("Only an administrator can reset passwords."); const targetId = text(body.memberId); const temporaryPassword = `Temp-${crypto.randomUUID().slice(0, 8)}`; await db.update(crmMembers).set({ temporaryPassword, forcePasswordChange: true }).where(eq(crmMembers.id, targetId)); response = { id: targetId, tempPassword: temporaryPassword };
    } else if (action === "team_member_add") {
      const teamName = text(body.teamName); const elevated = member.role === "admin" || member.role === "manager"; const isHead = member.role === "head" && member.teamName === teamName; if (!elevated && !isHead) throw new Error("Only the team head or administrator can add members."); if (!teamName || !text(body.fullName) || !text(body.email)) throw new Error("Name, real email and team are required."); const newMember = { id: uid(), authSubject: `invite:${uid()}`, email: text(body.email), fullName: text(body.fullName), role: text(body.role) === "head" && elevated ? "head" : "staff", teamName, isActive: true, temporaryPassword: `Temp-${crypto.randomUUID().slice(0, 8)}`, forcePasswordChange: true }; await db.insert(crmMembers).values(newMember); response = { id: newMember.id, temporaryPassword: newMember.temporaryPassword };
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
    } else if (action === "pipeline_settings") {
      if (member.role !== "admin") throw new Error("Only an administrator can change stage probabilities.");
      const probabilities = Object.fromEntries(stages.map((stage) => [stage, Math.max(0, Math.min(100, Number((body.probabilities as Record<string, unknown> | undefined)?.[stage]) || defaultProbabilities[stage]))]));
      const [existing] = await db.select().from(crmPipelineSettings).where(eq(crmPipelineSettings.id, "global")).limit(1);
      if (existing) await db.update(crmPipelineSettings).set({ probabilities: JSON.stringify(probabilities), updatedByMemberId: member.id, updatedAt: new Date().toISOString() }).where(eq(crmPipelineSettings.id, "global"));
      else await db.insert(crmPipelineSettings).values({ id: "global", probabilities: JSON.stringify(probabilities), updatedByMemberId: member.id });
      response = { id: "global", probabilities };
    } else { throw new Error("Unknown CRM action."); }
    return Response.json({ ok: true, ...response }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save this CRM record." }, { status: 400 }); }
}

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { crmAgreements, crmClients, crmInvoices, crmMembers } from "../db/schema";
import { getLocalSessionMember } from "../app/crm-auth";
import { canAccessClient } from "./crm-permissions";

export class FileAccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function fileMember(request: Request, db = getDb()) {
  const member = await getLocalSessionMember(db, request);
  if (!member?.isActive) throw new FileAccessError("Please sign in to your CRM workspace.", 401);
  return member;
}

export async function checkFileAccess(db: ReturnType<typeof getDb>, member: typeof crmMembers.$inferSelect, clientId: string, entityType: string, entityId: string) {
  const [client] = await db.select().from(crmClients).where(eq(crmClients.id, clientId)).limit(1);
  if (!client) throw new FileAccessError("Linked client was not found.", 404);
  const [owner] = client.ownerMemberId ? await db.select({ teamName: crmMembers.teamName }).from(crmMembers).where(eq(crmMembers.id, client.ownerMemberId)).limit(1) : [];
  if (!canAccessClient(member, client, owner?.teamName)) throw new FileAccessError("You can only open documents for your own clients or your team.", 403);
  const table = entityType === "invoice" ? crmInvoices : entityType === "agreement" ? crmAgreements : null;
  if (!table) throw new FileAccessError("Choose a linked invoice or agreement.", 400);
  const [entity] = await db.select({ clientId: table.clientId }).from(table).where(eq(table.id, entityId)).limit(1);
  if (!entity || entity.clientId !== clientId) throw new FileAccessError("The document does not match the linked client record.", 400);
}

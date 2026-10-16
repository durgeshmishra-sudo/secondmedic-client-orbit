import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { crmClients, crmDocuments, crmMembers } from "../../../../db/schema";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return new Response("Sign in required", { status: 401 });
    const db = getDb(); const [member] = await db.select().from(crmMembers).where(eq(crmMembers.authSubject, user.userId)).limit(1); if (!member) return new Response("CRM profile not found", { status: 403 });
    const { id } = await context.params; const [document] = await db.select().from(crmDocuments).where(and(eq(crmDocuments.id, id), isNull(crmDocuments.deletedAt))).limit(1); if (!document) return new Response("File not found", { status: 404 });
    if (member.role === "staff") { const [client] = await db.select().from(crmClients).where(eq(crmClients.id, document.clientId)).limit(1); if (client?.ownerMemberId !== member.id) return new Response("Not allowed", { status: 403 }); }
    if (!env.BUCKET) return new Response("Document storage unavailable", { status: 503 }); const object = await env.BUCKET.get(document.objectKey); if (!object) return new Response("File unavailable", { status: 404 });
    return new Response(object.body, { headers: { "content-type": document.mimeType, "content-disposition": `attachment; filename="${document.originalName.replace(/["\\]/g, "_")}"`, "cache-control": "private, no-store" } });
  } catch { return new Response("Could not open document", { status: 500 }); }
}

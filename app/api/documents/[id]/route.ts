import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { crmDocuments } from "../../../../db/schema";
import { checkFileAccess, fileMember, FileAccessError } from "../../../../lib/crm-file-access";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb(); const member = await fileMember(request, db);
    const { id } = await context.params; const [document] = await db.select().from(crmDocuments).where(and(eq(crmDocuments.id, id), isNull(crmDocuments.deletedAt))).limit(1); if (!document) return new Response("File not found", { status: 404 });
    await checkFileAccess(db, member, document.clientId, document.entityType, document.entityId);
    if (!env.BUCKET) return new Response("Document storage unavailable", { status: 503 }); const object = await env.BUCKET.get(document.objectKey); if (!object) return new Response("File unavailable", { status: 404 });
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const name = document.originalName.replace(/["\\\r\n]/g, "_");
    return new Response(object.body, { headers: { "content-type": document.mimeType, "content-length": String(object.size), "content-disposition": `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) { return new Response(error instanceof Error ? error.message : "Could not open document", { status: error instanceof FileAccessError ? error.status : 500 }); }
}

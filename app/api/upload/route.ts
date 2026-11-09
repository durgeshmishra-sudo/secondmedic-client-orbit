import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { crmActivityLog, crmDocuments } from "../../../db/schema";
import { checkFileAccess, fileMember, FileAccessError } from "../../../lib/crm-file-access";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export async function POST(request: Request) {
  try {
    const db = getDb(); const member = await fileMember(request, db);
    const form = await request.formData(); const file = form.get("file"); const clientId = String(form.get("clientId") || ""); const entityId = String(form.get("entityId") || ""); const entityType = String(form.get("entityType") || "");
    if (!(file instanceof File) || !file.size || !clientId || !entityId || !["invoice", "agreement"].includes(entityType)) throw new FileAccessError("Choose a PDF or image and a linked CRM record.", 400);
    if (!allowed.has(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use a PDF, PNG, JPG or WEBP smaller than 10 MB.");
    await checkFileAccess(db, member, clientId, entityType, entityId);
    if (!env.BUCKET) throw new FileAccessError("Document storage is unavailable. Please retry the upload.", 503);
    const bytes = await file.arrayBuffer();
    const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join("");
    const contentHash = hex(await crypto.subtle.digest("SHA-256", bytes));
    const fingerprint = `${clientId}|${entityType}|${entityId}|${contentHash}`;
    const id = "file-" + hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint)));
    const [existing] = await db.select().from(crmDocuments).where(and(eq(crmDocuments.id, id), isNull(crmDocuments.deletedAt))).limit(1);
    if (existing) return Response.json({ ok: true, duplicate: true, document: { id, originalName: existing.originalName } });
    const name = file.name.replace(/["\\\r\n]/g, "_"); const key = `clients/${clientId}/${entityType}s/${id}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: file.type, contentDisposition: `inline; filename="${name}"` } });
    await db.insert(crmDocuments).values({ id, clientId, entityType, entityId, documentKind: entityType, objectKey: key, originalName: name, mimeType: file.type, sizeBytes: file.size, uploadedByMemberId: member.id }).onConflictDoNothing();
    const [saved] = await db.select().from(crmDocuments).where(eq(crmDocuments.id, id)).limit(1);
    if (!saved || saved.deletedAt) throw new FileAccessError("This file was archived. Choose a different file or contact your administrator.", 409);
    await db.insert(crmActivityLog).values({ id: crypto.randomUUID(), actorMemberId: member.id, actorName: member.fullName, actorRole: member.role, teamName: member.teamName, module: entityType === "agreement" ? "Agreements" : "Invoices", action: "document_upload", recordType: entityType, recordId: entityId, details: name }).catch(() => undefined);
    return Response.json({ ok: true, document: { id, originalName: name } }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Upload failed. Please retry.", }, { status: error instanceof FileAccessError ? error.status : 500 }); }
}

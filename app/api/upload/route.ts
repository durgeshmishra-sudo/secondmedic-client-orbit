import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { crmDocuments, crmMembers } from "../../../db/schema";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) throw new Error("Please sign in before uploading a file.");
    const db = getDb(); const [member] = await db.select().from(crmMembers).where(eq(crmMembers.authSubject, user.userId)).limit(1); if (!member) throw new Error("CRM member profile not found.");
    const form = await request.formData(); const file = form.get("file"); const clientId = String(form.get("clientId") || ""); const entityId = String(form.get("entityId") || ""); const entityType = String(form.get("entityType") || "");
    if (!(file instanceof File) || !clientId || !entityId || !["invoice", "agreement"].includes(entityType)) throw new Error("Choose a PDF or image and a linked CRM record.");
    if (!allowed.has(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use a PDF, PNG, JPG or WEBP smaller than 10 MB.");
    if (!env.BUCKET) throw new Error("Document storage is not ready yet.");
    const id = crypto.randomUUID(); const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "file"; const key = `clients/${clientId}/${entityType}s/${id}.${extension}`;
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type, contentDisposition: `attachment; filename="${file.name.replace(/["\\]/g, "_")}"` } });
    try { await db.insert(crmDocuments).values({ id, clientId, entityType, entityId, documentKind: entityType, objectKey: key, originalName: file.name, mimeType: file.type, sizeBytes: file.size, uploadedByMemberId: member.id }); }
    catch (error) { await env.BUCKET.delete(key); throw error; }
    return Response.json({ ok: true, document: { id, originalName: file.name } }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 }); }
}

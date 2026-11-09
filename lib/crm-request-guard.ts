type WriteDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T>(): Promise<T | null>;
    };
  };
};

type StoredRequest = { payload_hash: string; state: string; response_json: string; status_code: number };
export class RequestGuardError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function claimCrmWrite(db: WriteDatabase, actorId: string, operationId: string, body: Record<string, unknown>) {
  if (!/^[A-Za-z0-9_-]{12,160}$/.test(operationId)) throw new RequestGuardError("Refresh this page before saving so this update can be protected against duplicate clicks.", 400);
  const key = `${actorId}:${operationId}`;
  const payload = { ...body }; delete payload.operationId;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(payload)));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const result = await db.prepare("INSERT INTO crm_write_requests (operation_key, actor_member_id, payload_hash, state, response_json, status_code) VALUES (?, ?, ?, 'pending', '', 0) ON CONFLICT(operation_key) DO NOTHING").bind(key, actorId, hash).run();
  if (result.meta?.changes === 1) return { key, replay: null };
  const existing = await db.prepare("SELECT payload_hash, state, response_json, status_code FROM crm_write_requests WHERE operation_key = ?").bind(key).first<StoredRequest>();
  if (!existing || existing.payload_hash !== hash) throw new RequestGuardError("This save reference was already used for different details. Refresh before saving again.");
  if (existing.state === "pending") throw new RequestGuardError("This update is already being saved. Wait a moment, then retry the same update.");
  if (!existing.response_json) throw new RequestGuardError("This update needs review before it can be retried. Refresh to check whether it was saved.");
  return { key, replay: { body: JSON.parse(existing.response_json), status: existing.status_code || 400 } };
}

export async function finishCrmWrite(db: WriteDatabase, key: string, body: Record<string, unknown>, status: number) {
  await db.prepare("UPDATE crm_write_requests SET state = ?, response_json = ?, status_code = ?, updated_at = CURRENT_TIMESTAMP WHERE operation_key = ? AND state = 'pending'").bind(status < 400 ? "complete" : "failed", JSON.stringify(body), status, key).run();
}

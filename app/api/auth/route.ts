import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { crmMembers } from "../../../db/schema";
import { clearSessionCookie, createSessionCookie, ensureLocalAccounts, getLocalSessionMember, hashPassword, publicMember, verifyPassword } from "../../crm-auth";

const json = (body: Record<string, unknown>, status = 200, cookie?: string) => {
  const response = Response.json(body, { status });
  if (cookie) response.headers.set("Set-Cookie", cookie);
  return response;
};

export async function GET() {
  const db = getDb();
  await ensureLocalAccounts(db);
  const member = await getLocalSessionMember(db);
  return member ? json({ authenticated: true, member: publicMember(member), forcePasswordChange: Boolean(member.forcePasswordChange) }) : json({ authenticated: false }, 401);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "login";
    const db = getDb();
    await ensureLocalAccounts(db);

    if (action === "login") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) return json({ error: "Email and password are required." }, 400);
      const [member] = await db.select().from(crmMembers).where(eq(crmMembers.email, email)).limit(1);
      if (!member || !member.isActive || !(await verifyPassword(password, member.temporaryPassword))) return json({ error: "Invalid email or password." }, 401);
      return json({ ok: true, member: publicMember(member), forcePasswordChange: Boolean(member.forcePasswordChange) }, 200, await createSessionCookie(member));
    }

    if (action === "change_password") {
      const member = await getLocalSessionMember(db);
      const password = typeof body.password === "string" ? body.password : "";
      if (!member) return json({ error: "Your session has expired. Please sign in again." }, 401);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
      await db.update(crmMembers).set({ temporaryPassword: await hashPassword(password), forcePasswordChange: false }).where(eq(crmMembers.id, member.id));
      const [updated] = await db.select().from(crmMembers).where(eq(crmMembers.id, member.id)).limit(1);
      return json({ ok: true, member: publicMember(updated) }, 200, await createSessionCookie(updated));
    }

    if (action === "logout") return json({ ok: true }, 200, clearSessionCookie());
    return json({ error: "Unknown authentication action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not complete sign-in." }, 400);
  }
}

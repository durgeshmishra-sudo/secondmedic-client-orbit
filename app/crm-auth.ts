import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { crmMembers } from "../db/schema";

const SESSION_COOKIE = "crm_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const HASH_PREFIX = "sha256:";
const runtimeEnv = env as unknown as Record<string, unknown>;

type Db = ReturnType<typeof import("../db").getDb>;
type Member = typeof crmMembers.$inferSelect;

const localAccounts = [
  { id: "admin-durgesh-mishra", email: "durgesh.mishra@secondmedic.com", fullName: "Durgesh Mishra", role: "admin", teamName: "General", passwordEnv: "CRM_ADMIN_PASSWORD_HASH" },
  { id: "demo-pratik-darji", email: "pratik.darji@secondmedic.com", fullName: "Pratik Darji", role: "head", teamName: "Pratik BD Team", passwordEnv: "CRM_PRATIK_PASSWORD_HASH" },
  { id: "demo-omkar-sawant", email: "omkar.sawant@secondmedic.com", fullName: "Omkar Sawant", role: "head", teamName: "Omkar BD Team", passwordEnv: "CRM_OMKAR_PASSWORD_HASH" },
  { id: "demo-yogesh-pawar", email: "yogesh.pawar@secondmedic.com", fullName: "Yogesh Pawar", role: "head", teamName: "Yogesh BD Team", passwordEnv: "CRM_YOGESH_PASSWORD_HASH" },
  { id: "demo-mukesh-mishra", email: "mukesh.mishra@secondmedic.com", fullName: "Mukesh Mishra", role: "head", teamName: "Mukesh BD Team", passwordEnv: "CRM_MUKESH_PASSWORD_HASH" },
] as const;

function accountPasswordHash(account: (typeof localAccounts)[number]) {
  const value = String(runtimeEnv[account.passwordEnv] ?? "");
  return value.startsWith(HASH_PREFIX) ? value : HASH_PREFIX + value;
}

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hashPassword(password: string) {
  return HASH_PREFIX + Array.from(await digest(password)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith(HASH_PREFIX)) return false;
  return (await hashPassword(password)) === stored;
}

export async function ensureLocalAccounts(db: Db) {
  for (const account of localAccounts) {
    const [byId] = await db.select().from(crmMembers).where(eq(crmMembers.id, account.id)).limit(1);
    const [byEmail] = byId ? [byId] : await db.select().from(crmMembers).where(eq(crmMembers.email, account.email)).limit(1);
    const values = {
      authSubject: `local:${account.email}`,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      teamName: account.teamName,
      isActive: true,
      temporaryPassword: accountPasswordHash(account),
      forcePasswordChange: false,
    };
    if (byEmail) await db.update(crmMembers).set(values).where(eq(crmMembers.id, byEmail.id));
    else await db.insert(crmMembers).values({ id: account.id, ...values });
  }
}

export function publicMember(member: Member) {
  const { temporaryPassword: _temporaryPassword, ...safe } = member;
  return safe;
}

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

async function verifyPayload(payload: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload));
}

export async function createSessionCookie(member: Member) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${member.id}|${expiresAt}`;
  const value = `${base64Url(encoder.encode(payload))}.${await signPayload(payload, member.temporaryPassword)}`;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getLocalSessionMember(db: Db): Promise<Member | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  try {
    const payload = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const [memberId, expiresAt] = payload.split("|");
    if (!memberId || Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;
    const [member] = await db.select().from(crmMembers).where(eq(crmMembers.id, memberId)).limit(1);
    if (!member || !member.isActive || !member.temporaryPassword) return null;
    return await verifyPayload(payload, signature, member.temporaryPassword) ? member : null;
  } catch {
    return null;
  }
}

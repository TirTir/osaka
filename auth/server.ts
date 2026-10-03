import { env } from "cloudflare:workers";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "osaka_session";
const SESSION_DAYS = 30;
// Cloudflare Workers Web Crypto currently accepts PBKDF2 counts up to 100,000.
const ITERATIONS = 100_000;

export type User = { id: string; email: string };
export type ChatGPTIdentity = { userId: string; email: string };

export function db() {
  if (!env.DB) throw new Error("D1 binding unavailable");
  return env.DB;
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function passwordHash(password: string, salt: string, iterations = ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" }, material, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function getSessionUser(request: NextRequest): Promise<User | null> {
  const identity = getChatGPTIdentity(request);
  if (!identity) return null;
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return await db().prepare("SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.chatgpt_user_id = ?")
    .bind(await sha256(token), new Date().toISOString(), identity.userId).first<User>();
}

export function getChatGPTIdentity(request: NextRequest): ChatGPTIdentity | null {
  const userId = request.headers.get("oai-authenticated-user-id")?.trim() || "";
  const email = normalizeEmail(request.headers.get("oai-authenticated-user-email"));
  if (!userId || !validEmail(email)) return null;
  return { userId, email };
}

export async function getOrCreateChatGPTUser(identity: ChatGPTIdentity): Promise<User> {
  const byIdentity = await db().prepare("SELECT id, email FROM users WHERE chatgpt_user_id = ?")
    .bind(identity.userId).first<User>();
  if (byIdentity) return byIdentity;

  const byEmail = await db().prepare("SELECT id, email, chatgpt_user_id AS chatgptUserId FROM users WHERE email = ?")
    .bind(identity.email).first<User & { chatgptUserId: string | null }>();
  if (byEmail) {
    if (byEmail.chatgptUserId && byEmail.chatgptUserId !== identity.userId) {
      throw new Error("This email is already linked to another ChatGPT account.");
    }
    await db().prepare("UPDATE users SET chatgpt_user_id = ? WHERE id = ? AND chatgpt_user_id IS NULL")
      .bind(identity.userId, byEmail.id).run();
    return { id: byEmail.id, email: byEmail.email };
  }

  const user = { id: crypto.randomUUID(), email: identity.email };
  await db().prepare("INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, chatgpt_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(user.id, user.email, randomToken(), randomToken(), identity.userId, new Date().toISOString()).run();
  const created = await db().prepare("SELECT id, email FROM users WHERE chatgpt_user_id = ?")
    .bind(identity.userId).first<User>();
  if (!created) throw new Error("Could not create ChatGPT user.");
  return created;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, expiresAt, new Date().toISOString()).run();
  return { token, expiresAt };
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !!origin && origin === request.nextUrl.origin;
}

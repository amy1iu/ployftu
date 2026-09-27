import { createHash, timingSafeEqual } from "node:crypto";

// The password in front of the deployed demo (SITE_PASSWORD; off when unset).
// Once it's entered on /unlock, a cookie holds a hash of it, never the password
// itself, and changing SITE_PASSWORD signs everyone out.

export const PASS_COOKIE = "ploy_pass";
export const PASS_MAX_AGE = 60 * 60 * 24 * 30;

export const sitePassword = () => process.env.SITE_PASSWORD || null;

/** What the cookie holds for a password. */
export const passKey = (password: string) => createHash("sha256").update(`ploy:${password}`).digest("hex");

export function samePassword(given: string, password: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Where to go after unlocking: a path on this site, never somewhere else. */
export const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");

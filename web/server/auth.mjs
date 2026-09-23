/**
 * Server-side authentication for the API routes.
 *
 * The app's sign-in was client-side only, which is fine for a local demo and
 * useless the moment it is public: a browser check cannot stop anyone POSTing
 * straight to /api/send-email. These routes now require a token this server
 * issued and can verify.
 *
 * No dependencies — Node's crypto gives us HMAC and a constant-time compare,
 * which is all a signed token needs.
 */

import crypto from "node:crypto";

const ALG = "sha256";
const DEFAULT_TTL = 60 * 60 * 12; // 12 hours

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (str) =>
  Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** Constant-time string compare that tolerates length differences. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  // Hash first so differing lengths don't leak via an early return.
  const ha = crypto.createHash(ALG).update(ba).digest();
  const hb = crypto.createHash(ALG).update(bb).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function signToken(payload, secret, ttlSeconds = DEFAULT_TTL) {
  if (!secret) throw httpError(500, "AUTH_SECRET is not configured on the server.");

  const body = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac(ALG, secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!secret) throw httpError(500, "AUTH_SECRET is not configured on the server.");

  const [data, sig] = String(token ?? "").split(".");
  if (!data || !sig) throw httpError(401, "Malformed token.");

  const expected = b64url(crypto.createHmac(ALG, secret).update(data).digest());
  if (!safeEqual(sig, expected)) throw httpError(401, "Invalid token signature.");

  let payload;
  try {
    payload = JSON.parse(fromB64url(data).toString("utf8"));
  } catch {
    throw httpError(401, "Unreadable token.");
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw httpError(401, "Session expired — sign in again.");
  }
  return payload;
}

/**
 * Accounts the server will issue tokens for. Emails and roles come from the
 * app's own account list; the password is a single server-side secret, so no
 * credential is stored in the repo.
 */
export function authenticate({ email, password, accounts, appPassword, secret }) {
  if (!appPassword) {
    throw httpError(
      503,
      "APP_PASSWORD is not configured on the server, so no one can sign in."
    );
  }

  const account = accounts.find(
    (u) => u.email.toLowerCase() === String(email ?? "").trim().toLowerCase()
  );

  // Check the password even when the account is unknown, so a wrong email and
  // a wrong password take the same time and give the same answer.
  const passwordOk = safeEqual(password, appPassword);
  if (!account || !passwordOk) throw httpError(401, "Invalid email or password.");

  return {
    token: signToken({ sub: account.id, email: account.email, role: account.role }, secret),
    user: {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      permissions: account.permissions,
    },
  };
}

/** Throws unless the request carries a valid token for one of `roles`. */
export function requireRole(req, secret, roles = ["admin"]) {
  const header = req.headers?.authorization ?? req.headers?.Authorization ?? "";
  const [scheme, token] = String(header).split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw httpError(401, "Sign in first — this endpoint requires an admin session.");
  }

  const claims = verifyToken(token, secret);
  if (!roles.includes(claims.role)) {
    throw httpError(403, `This endpoint requires one of: ${roles.join(", ")}.`);
  }
  return claims;
}

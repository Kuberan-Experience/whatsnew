import { verifyToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

/**
 * Reads the bearer token, loads the user, and hangs it on req.user.
 *
 * The user is re-read from the DB on every request rather than trusted from
 * the JWT claims: role and permissions change, and a token issued before a
 * demotion must not keep admin access until it expires.
 */
export async function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true, role: true, permissions: true },
  });

  if (!user) return res.status(401).json({ error: "User no longer exists" });

  req.user = user;
  next();
}

/** Must be mounted after requireAuth. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin role required" });
  }
  next();
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

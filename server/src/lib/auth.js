import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function secret() {
  const s = process.env.JWT_SECRET;
  // Failing loudly here beats issuing tokens signed with "undefined".
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    secret(),
    { expiresIn: EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}

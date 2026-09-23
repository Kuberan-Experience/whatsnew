import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { signToken, verifyPassword } from "../lib/auth.js";
import { requireAuth, asyncHandler } from "../middleware/auth.js";

export const authRouter = Router();

/** POST /api/auth/login  { email, password } */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
    });

    // Same response for unknown email and wrong password — don't leak which
    // addresses exist.
    const ok = user && (await verifyPassword(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
      },
    });
  })
);

/** GET /api/auth/me */
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

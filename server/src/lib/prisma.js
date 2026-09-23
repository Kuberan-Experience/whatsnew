import { PrismaClient } from "@prisma/client";

// On Vercel a warm serverless instance is reused across invocations, so the
// client is cached on globalThis. Without this, every invocation opens a new
// pool and Neon starts refusing connections under any real traffic.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

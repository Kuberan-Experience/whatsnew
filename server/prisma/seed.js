import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Permissions are nav-path prefixes; see src/lib/permissions.js. "*" is all.
const USERS = [
  {
    email: "kuberan@experience.com",
    name: "Kuberan Venkatesh",
    role: "admin",
    permissions: ["*"],
  },
  {
    email: "kuberanvenkatesh3@gmail.com",
    name: "Kuberan Venkatesh",
    role: "agent",
    permissions: ["*"],
  },
  {
    email: "nivedth@experience.com",
    name: "Nivedth",
    role: "agent",
    // Account Center only — Command Center releases skip this account.
    permissions: ["Account Center > Profile", "Account Center > Billing"],
  },
];

const PASSWORD = process.env.SEED_PASSWORD || "whatsnew123";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, permissions: u.permissions },
      create: { ...u, passwordHash },
    });
    console.log(`seeded ${u.role.padEnd(5)} ${u.email}`);
  }

  console.log(`\nAll seeded users share the password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

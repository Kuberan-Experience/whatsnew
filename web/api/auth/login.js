import { authenticate } from "../../server/auth.mjs";
import { USERS } from "../../src/lib/appData.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const result = authenticate({
      email: body.email,
      password: body.password,
      accounts: USERS,
      appPassword: process.env.APP_PASSWORD ?? "",
      secret: process.env.AUTH_SECRET ?? "",
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Sign-in failed" });
  }
}

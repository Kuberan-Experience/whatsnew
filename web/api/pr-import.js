/**
 * Vercel serverless function: import a merged GitHub PR as a release-note draft.
 *
 * Same handler the Vite dev middleware runs locally — the logic lives in
 * server/prImport.mjs so dev and production cannot drift apart.
 */
import { requireRole } from "../server/auth.mjs";
import { importPullRequest } from "../server/prImport.mjs";
import { flattenNavPaths } from "../src/lib/appData.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // Admin session required — this endpoint spends Anthropic and GitHub quota.
    requireRole(req, process.env.AUTH_SECRET ?? "", ["admin"]);

    // Vercel parses JSON bodies; fall back for a raw string body.
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

    const note = await importPullRequest({
      ref: body.ref,
      navPaths: flattenNavPaths(),
      secrets: {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
        githubToken: process.env.GITHUB_TOKEN ?? "",
      },
    });
    return res.status(200).json(note);
  } catch (err) {
    console.error("[pr-import]", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Import failed" });
  }
}

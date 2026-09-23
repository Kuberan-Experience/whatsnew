import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Minimal .env parser — KEY=value, ignoring blanks, comments and quotes. */
function readSecrets() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      // First file wins, so .env.local overrides .env.
      if (out[m[1]] !== undefined) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return {
    anthropicApiKey: out.ANTHROPIC_API_KEY ?? out.ANTHROPIC_TOKEN ?? "",
    githubToken: out.GITHUB_TOKEN ?? out.GITHUB_ACCESS_TOKEN ?? "",
    sendgridApiKey: out.SENDGRID_API_KEY ?? "",
    fromEmail: out.SENDGRID_FROM_EMAIL ?? "",
    fromName: out.SENDGRID_FROM_NAME ?? "",
  };
}

/**
 * Dev-only API surface.
 *
 * Importing a PR needs two secrets (an Anthropic key, optionally a GitHub
 * token), so it cannot run in the browser — a key in client JS is a key you
 * have given to every visitor. This keeps the single `npm run dev` command
 * while running that work in the Vite process instead.
 *
 * For production the same handler belongs in a serverless function; see
 * server/ for the Express version of this app's API.
 */
function apiPlugin() {
  return {
    name: "whatsnew-api",
    configureServer(server) {
      server.middlewares.use("/api/pr-import", async (req, res) => {
        // Read the file itself on every request. Vite's loadEnv() with an empty
        // prefix folds process.env back into its result, so a key written there
        // once would shadow later edits to the file — which is exactly the trap
        // that made a replaced key look like it had not been replaced.
        const secrets = readSecrets();

        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };

        if (req.method !== "POST") return send(405, { error: "Use POST" });

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const { ref } = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

          // Imported per-request so edits to either module hot-reload in dev.
          const [{ importPullRequest }, data] = await Promise.all([
            server.ssrLoadModule("/server/prImport.mjs"),
            server.ssrLoadModule("/src/lib/appData.js"),
          ]);

          const note = await importPullRequest({
            ref,
            navPaths: data.flattenNavPaths(),
            secrets,
          });
          send(200, note);
        } catch (err) {
          console.error("[pr-import]", err);
          send(err?.status ?? 500, { error: err?.message ?? "Import failed" });
        }
      });

      server.middlewares.use("/api/send-email", async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };

        if (req.method !== "POST") return send(405, { error: "Use POST" });

        try {
          const secrets = readSecrets();
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const { note, recipients } = JSON.parse(
            Buffer.concat(chunks).toString("utf8") || "{}"
          );

          const [{ sendReleaseNoteEmail }, template] = await Promise.all([
            server.ssrLoadModule("/server/sendEmail.mjs"),
            // The same template the dashboard previews, so what arrives in the
            // inbox is what the admin approved.
            server.ssrLoadModule("/src/email/releaseNoteEmail.js"),
          ]);

          const result = await sendReleaseNoteEmail({
            note,
            recipients,
            renderEmail: template.renderReleaseNoteEmail,
            secrets,
          });
          send(200, result);
        } catch (err) {
          console.error("[send-email]", err);
          send(err?.status ?? 500, { error: err?.message ?? "Send failed" });
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), apiPlugin()],
    server: { port: 5173 },
  };
});

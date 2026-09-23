import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

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
function apiPlugin(env) {
  return {
    name: "whatsnew-api",
    configureServer(server) {
      // Make the secrets visible to the handler without exposing them to Vite's
      // client-side `import.meta.env`, which only carries VITE_* keys.
      process.env.ANTHROPIC_API_KEY ||= env.ANTHROPIC_API_KEY ?? "";
      process.env.GITHUB_TOKEN ||= env.GITHUB_TOKEN ?? "";

      server.middlewares.use("/api/pr-import", async (req, res) => {
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
            server.ssrLoadModule("/src/mock/data.js"),
          ]);

          const note = await importPullRequest({
            ref,
            navPaths: data.flattenNavPaths(),
            components: data.PROFILE_COMPONENTS,
          });
          send(200, note);
        } catch (err) {
          console.error("[pr-import]", err);
          send(err?.status ?? 500, { error: err?.message ?? "Import failed" });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // "" prefix = load every var, including the unprefixed secrets.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), apiPlugin(env)],
    server: { port: 5173 },
  };
});

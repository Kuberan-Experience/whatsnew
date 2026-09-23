import Anthropic from "@anthropic-ai/sdk";

/**
 * Rewrites the raw "What changed" text from a PR into release-note copy.
 *
 * Two hard rules, both enforced in the prompt and in how this is called:
 *  - It may not invent facts. It only rewrites what the PR body already says.
 *  - It may not block ingestion. Every failure path returns null and the
 *    caller keeps the raw text, so a missing API key or a bad day at the API
 *    never costs us a webhook delivery.
 */

const MODEL = "claude-opus-5";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description:
        "Release note title. Under 70 characters, sentence case, no trailing period, no ticket or PR numbers.",
    },
    summary: {
      type: "string",
      description:
        "One or two sentences describing the change from the user's point of view.",
    },
  },
  required: ["title", "summary"],
  additionalProperties: false,
};

const SYSTEM = `You write release notes for a product used by non-technical agents.

You will be given the raw "What changed" text from a merged pull request, plus
the PR title and the nav paths it touches.

Rules:
- Rewrite only what the input says. Never add capabilities, numbers, dates,
  limits, or reasons that are not present in the input.
- If the input is thin, stay thin. A short, plain summary is correct; padding it
  with invented detail is not.
- Write for the person using the app, not the person who wrote the code. Drop
  internal service names, class names, flags, and ticket IDs.
- No marketing language, no exclamation marks, no "we're excited to".
- Address the reader as "you".`;

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

/**
 * @returns {Promise<{title: string, summary: string} | null>} null when polish
 *   is unavailable or failed — the caller falls back to the raw text.
 */
export async function polishReleaseNote({ prTitle, whatChanged, type, paths }) {
  const anthropic = getClient();
  if (!anthropic) return null;
  if (!whatChanged || !whatChanged.trim()) return null;

  const userContent = [
    `PR title: ${prTitle}`,
    `Change type: ${type}`,
    paths?.length ? `Nav paths: ${paths.join(", ")}` : "Nav paths: (none given)",
    "",
    "What changed (verbatim from the PR):",
    whatChanged,
  ].join("\n");

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
      output_config: {
        // Low effort: this is a short rewrite, not a reasoning problem.
        effort: "low",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      console.warn("[polish] model declined:", response.stop_details?.category);
      return null;
    }

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = JSON.parse(text);
    if (typeof parsed?.title !== "string" || typeof parsed?.summary !== "string") {
      return null;
    }
    return { title: parsed.title.trim(), summary: parsed.summary.trim() };
  } catch (err) {
    console.error("[polish] failed, keeping raw PR text:", err?.message ?? err);
    return null;
  }
}

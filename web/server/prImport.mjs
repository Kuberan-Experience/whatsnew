/**
 * Pull a merged GitHub PR and turn it into a release-note draft.
 *
 * Runs server-side only (Vite dev middleware / a serverless function), never in
 * the browser: it holds the Anthropic key and, optionally, a GitHub token.
 *
 * Two passes, in this order and for a reason:
 *  1. A deterministic parse of the PR template. When an author filled in the
 *     template, their words are authoritative — especially the nav paths, which
 *     drive who gets notified. A model should not be free to reword those.
 *  2. Claude, for the editorial copy, and to fill in only what the template
 *     left blank.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";

/* ------------------------------------------------------------------ GitHub */

/** Accepts a PR URL, "owner/repo#123", or "owner/repo/pull/123". */
export function parsePrRef(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw httpError(400, "Enter a pull request URL or owner/repo#number");

  const url = raw.match(
    /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i
  );
  if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };

  const short = raw.match(/^([\w.-]+)\/([\w.-]+)(?:#|\/pull\/)(\d+)$/);
  if (short) return { owner: short[1], repo: short[2], number: Number(short[3]) };

  throw httpError(
    400,
    "Could not read that reference. Use a PR URL like https://github.com/owner/repo/pull/123"
  );
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export async function fetchPullRequest(ref) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "whatsnew-release-notes",
  };
  // Only needed for private repos, or to lift the 60 req/hr anonymous limit.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
    { headers }
  );

  if (res.status === 404) {
    throw httpError(
      404,
      process.env.GITHUB_TOKEN
        ? `PR #${ref.number} not found in ${ref.owner}/${ref.repo}.`
        : `PR #${ref.number} not found in ${ref.owner}/${ref.repo}. If the repo is private, set GITHUB_TOKEN in web/.env.local.`
    );
  }
  if (res.status === 403 || res.status === 429) {
    throw httpError(
      429,
      "GitHub rate limit reached. Set GITHUB_TOKEN in web/.env.local to raise it."
    );
  }
  if (!res.ok) {
    throw httpError(res.status, `GitHub returned ${res.status} for that PR.`);
  }

  const pr = await res.json();
  return {
    number: pr.number,
    title: pr.title ?? "",
    body: pr.body ?? "",
    url: pr.html_url,
    merged: Boolean(pr.merged),
    mergedAt: pr.merged_at,
    state: pr.state,
    author: pr.user?.login ?? null,
    repo: `${ref.owner}/${ref.repo}`,
  };
}

/* ------------------------------------------------------- template parsing */

const TYPE_MAP = new Map([
  ["new field", "new_field"],
  ["new component", "new_component"],
  ["update", "update"],
  ["bug fix", "bug_fix"],
  ["bugfix", "bug_fix"],
  ["fix", "bug_fix"],
]);

const stripComments = (md) => String(md ?? "").replace(/<!--[\s\S]*?-->/g, "");

/** Body text under a heading matching `pattern`, up to the next heading. */
function sectionBody(md, pattern) {
  const headingRe = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
  let collecting = false;
  const out = [];

  for (const line of md.split(/\r?\n/)) {
    const m = line.match(headingRe);
    if (m) {
      if (collecting) break;
      if (pattern.test(m[1].replace(/\*\*/g, "").trim())) collecting = true;
      continue;
    }
    if (collecting) out.push(line);
  }
  const body = out.join("\n").trim();
  return body.length ? body : null;
}

function parseType(md) {
  const raw = sectionBody(md, /^type$/i);
  if (!raw) return null;

  const cleaned = raw.replace(/^[-*•]\s*/gm, "").replace(/\[[ xX]\]/g, "").trim();
  // The untouched template line lists every option — that means unanswered.
  if (/new field\s*\/\s*new component\s*\/\s*update\s*\/\s*bug fix/i.test(cleaned)) {
    return null;
  }
  for (const [label, value] of TYPE_MAP) {
    if (new RegExp(`(^|[^a-z])${label}([^a-z]|$)`, "i").test(cleaned)) return value;
  }
  return null;
}

function parsePaths(md) {
  const raw = sectionBody(md, /^path\(?s?\)?\s+in\s+app$/i);
  if (!raw) return [];

  const bulletRe = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/;
  const bullets = raw
    .split(/\r?\n/)
    .map((l) => l.match(bulletRe)?.[1])
    .filter(Boolean);
  const candidates = bullets.length
    ? bullets
    : raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const seen = new Set();
  const paths = [];
  for (const c of candidates) {
    const label = c
      .replace(/^[`"']|[`"']$/g, "")
      .split(">")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" > ");
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    paths.push(label);
  }
  return paths;
}

export function parseTemplate(body) {
  const md = stripComments(body);
  return {
    type: parseType(md),
    whatChanged: sectionBody(md, /^what changed\??$/i)?.replace(/^[-*•]\s*/gm, "").replace(/\s+/g, " ").trim() ?? null,
    paths: parsePaths(md),
  };
}

/* -------------------------------------------------------------- Claude */

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
      description: "One or two sentences describing the change from the user's point of view.",
    },
    type: {
      type: "string",
      enum: ["new_field", "new_component", "update", "bug_fix"],
    },
    paths: {
      type: "array",
      items: { type: "string" },
      description:
        "Nav paths this change appears under, formatted 'Group > Item > Child'. Empty if the PR does not say.",
    },
    componentKey: {
      type: "string",
      description:
        "Key of the specific control this introduces, from the provided list. Empty string if none applies.",
    },
    confidence: {
      type: "string",
      enum: ["high", "low"],
      description: "low when the PR body gave little to work with.",
    },
  },
  required: ["title", "summary", "type", "paths", "componentKey", "confidence"],
  additionalProperties: false,
};

const SYSTEM = `You turn merged pull requests into release notes for a product used by non-technical agents.

Rules:
- Use only what the pull request says. Never add capabilities, numbers, dates, limits, or reasons that are not in the input. If the PR is thin, write something short — padding it with invented detail is a failure.
- Write for the person using the app, not the person who wrote the code. Drop internal service names, class names, file paths, flags and ticket IDs.
- No marketing language, no exclamation marks, no "we're excited to". Address the reader as "you".
- paths: if the PR lists nav paths, reuse them exactly. Otherwise pick from the known nav paths ONLY when the PR clearly indicates that area. When unsure, return an empty list — a wrong path sends the note to the wrong people.
- componentKey: only when the PR clearly introduces or changes that specific named control. Otherwise return "".
- Set confidence to "low" when the PR body gave you little to work with.`;

export async function generateNote({ pr, parsed, navPaths, components }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw httpError(
      503,
      "ANTHROPIC_API_KEY is not set in web/.env.local, so the note cannot be generated."
    );
  }

  const client = new Anthropic();

  const userContent = [
    `Repository: ${pr.repo}`,
    `PR #${pr.number}: ${pr.title}`,
    pr.merged ? `Merged: yes` : `Merged: no (state ${pr.state})`,
    "",
    "--- PR body ---",
    pr.body?.trim() || "(empty)",
    "",
    "--- Parsed from the PR template ---",
    `Type: ${parsed.type ?? "(not stated)"}`,
    `What changed: ${parsed.whatChanged ?? "(not stated)"}`,
    `Paths: ${parsed.paths.length ? parsed.paths.join(" | ") : "(not stated)"}`,
    "",
    "--- Known nav paths ---",
    navPaths.join("\n"),
    "",
    "--- Known component keys ---",
    components.map((c) => `${c.key} — ${c.label} (${c.path})`).join("\n"),
  ].join("\n");

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
    });
  } catch (err) {
    if (err?.status === 401) {
      throw httpError(401, "Anthropic rejected the API key (401). Check ANTHROPIC_API_KEY in web/.env.local.");
    }
    throw httpError(err?.status || 502, `Anthropic request failed: ${err?.message ?? err}`);
  }

  if (response.stop_reason === "refusal") {
    throw httpError(422, "The model declined to summarise this pull request.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw httpError(502, "The model did not return usable JSON.");
  }
  return out;
}

/* ------------------------------------------------------------- orchestrate */

export async function importPullRequest({ ref, navPaths, components }) {
  const pr = await fetchPullRequest(parsePrRef(ref));
  const parsed = parseTemplate(pr.body);
  const generated = await generateNote({ pr, parsed, navPaths, components });

  // The author's own paths win over the model's. They decide who gets notified,
  // and the human who wrote them knows the product.
  const paths = parsed.paths.length ? parsed.paths : generated.paths ?? [];

  return {
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.url,
    prAuthor: pr.author,
    prRepo: pr.repo,
    merged: pr.merged,
    type: parsed.type ?? generated.type ?? "update",
    title: generated.title,
    summary: generated.summary,
    componentKey: generated.componentKey || null,
    paths,
    rawWhatChanged: parsed.whatChanged,
    confidence: generated.confidence,
    pathsFromTemplate: parsed.paths.length > 0,
  };
}

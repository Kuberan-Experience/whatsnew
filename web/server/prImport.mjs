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
  if (!raw)
    throw httpError(400, "Enter a pull request URL or owner/repo#number");

  const url = raw.match(/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i);
  if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };

  const short = raw.match(/^([\w.-]+)\/([\w.-]+)(?:#|\/pull\/)(\d+)$/);
  if (short)
    return { owner: short[1], repo: short[2], number: Number(short[3]) };

  throw httpError(
    400,
    "Could not read that reference. Use a PR URL like https://github.com/owner/repo/pull/123",
  );
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export async function fetchPullRequest(ref, githubToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "whatsnew-release-notes",
  };
  // Only needed for private repos, or to lift the 60 req/hr anonymous limit.
  // A fine-grained token with Pull requests: Read-only is enough.
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const res = await fetch(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
    { headers },
  );

  if (res.status === 404) {
    throw httpError(
      404,
      githubToken
        ? `PR #${ref.number} not found in ${ref.owner}/${ref.repo}.`
        : `PR #${ref.number} not found in ${ref.owner}/${ref.repo}. If the repo is private, set GITHUB_TOKEN in web/.env.local.`,
    );
  }
  if (res.status === 403 || res.status === 429) {
    throw httpError(
      429,
      "GitHub rate limit reached. Set GITHUB_TOKEN in web/.env.local to raise it.",
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

  const cleaned = raw
    .replace(/^[-*•]\s*/gm, "")
    .replace(/\[[ xX]\]/g, "")
    .trim();
  // The untouched template line lists every option — that means unanswered.
  if (
    /new field\s*\/\s*new component\s*\/\s*update\s*\/\s*bug fix/i.test(cleaned)
  ) {
    return null;
  }
  for (const [label, value] of TYPE_MAP) {
    if (new RegExp(`(^|[^a-z])${label}([^a-z]|$)`, "i").test(cleaned))
      return value;
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
    : raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

  const seen = new Set();
  const paths = [];
  for (const c of candidates) {
    const label = c
      .replace(/^[`"']|[`"']$/g, "")
      .split(">")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" > ");
    // The template ships an empty "-" bullet. Left unfilled it is punctuation,
    // not a path, and a junk path routes the note to nobody.
    if (!label || !/[a-z0-9]/i.test(label)) continue;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    paths.push(label);
  }
  return paths;
}

export function parseTemplate(body) {
  const md = stripComments(body);
  return {
    type: parseType(md),
    whatChanged:
      sectionBody(md, /^what changed\??$/i)
        ?.replace(/^[-*•]\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim() ?? null,
    paths: parsePaths(md),
  };
}

/**
 * The PR's changed files, with patches.
 *
 * The body is what an author *chose* to write, and they often write nothing.
 * The diff is what actually shipped, so it is the more reliable source — this
 * is where a new field or component is visible even when the template is blank.
 */
export async function fetchPullRequestFiles(ref, githubToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "whatsnew-release-notes",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const res = await fetch(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100`,
    { headers },
  );
  // A missing diff should not sink the import; we still have title and body.
  if (!res.ok) return [];

  const files = await res.json();
  return files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? "",
  }));
}

// Generated, vendored or binary files say nothing about what a user will see.
const NOISE = /(^|\/)(dist|build|node_modules|coverage|\.next|vendor)\//i;
const NOISE_FILE =
  /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)|\.snap)$/i;

export function interestingFiles(files) {
  return files.filter(
    (f) => !NOISE.test(f.filename) && !NOISE_FILE.test(f.filename),
  );
}

/** A diff digest sized for a prompt: newly added files first, patches capped. */
export function summariseDiff(files, { perFile = 5000, total = 60000 } = {}) {
  const kept = interestingFiles(files);
  if (!kept.length) return "(no reviewable file changes)";

  const listing = kept
    .map(
      (f) =>
        `  ${f.status.padEnd(9)} +${f.additions} -${f.deletions}  ${f.filename}`,
    )
    .join("\n");

  // Added files describe new surface area, so they earn the budget first.
  const ordered = [...kept].sort((a, b) => {
    const rank = (f) =>
      f.status === "added" ? 0 : f.status === "modified" ? 1 : 2;
    return rank(a) - rank(b) || b.additions - a.additions;
  });

  const patches = [];
  let budget = total;
  for (const f of ordered) {
    if (budget <= 0 || !f.patch) break;
    const slice = f.patch.slice(0, Math.min(perFile, budget));
    budget -= slice.length;
    patches.push(
      `--- ${f.filename} (${f.status}) ---\n${slice}${
        f.patch.length > slice.length ? "\n… patch truncated …" : ""
      }`,
    );
  }

  return `Changed files (${kept.length}):\n${listing}\n\n${patches.join("\n\n")}`;
}

/**
 * Labels, headings and field names introduced by added lines — a cheap,
 * grounded read of "what is new on screen", used when no model is available.
 *
 * It only reports text that literally appears in the diff, and it reads across
 * line breaks, because JSX routinely puts a label's text on the line after the
 * opening tag.
 */
export function addedUiLabels(files) {
  const found = new Set();

  const humanise = (id) =>
    id
      .replace(/^[a-z]+[-_]/, "") // drop a "profile-" style prefix
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");

  const looksLikeLabel = (t) =>
    t &&
    /^[A-Z][\w &'\/()-]{2,40}$/.test(t) &&
    !/^(Div|Span|Input|Button)$/.test(t);

  for (const f of interestingFiles(files)) {
    const added = (f.patch ?? "")
      .split(/\r?\n/)
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1));

    added.forEach((line, i) => {
      // <label ...>Text  — or the text on a following line.
      const openLabel = line.match(/<label[^>]*>\s*(.*)$/);
      if (openLabel) {
        let text = openLabel[1].replace(/<[^>]*>/g, "").trim();
        for (let j = i + 1; !text && j < Math.min(i + 3, added.length); j++) {
          text = added[j].replace(/<[^>]*>/g, "").trim();
        }
        if (looksLikeLabel(text)) found.add(text);
      }

      // htmlFor="profile-personal-website" / id="..." -> "Personal Website"
      const forId = line.match(/(?:htmlFor|id)=["']([a-z][a-z0-9-]{3,50})["']/);
      if (forId) {
        const h = humanise(forId[1]);
        if (looksLikeLabel(h)) found.add(h);
      }

      const placeholder = line.match(
        /placeholder=["']([A-Z][\w &'\/.-]{2,40})["']/,
      );
      if (placeholder) found.add(placeholder[1].trim());

      const heading = line.match(/<h[1-4][^>]*>\s*([A-Z][\w &'\/-]{2,40})/);
      if (heading) found.add(heading[1].trim());
    });
  }
  return [...found].slice(0, 8);
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
      description:
        "One or two sentences describing the change from the user's point of view.",
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
    confidence: {
      type: "string",
      enum: ["high", "low"],
      description: "low when the PR body gave little to work with.",
    },
  },
  required: ["title", "summary", "type", "paths", "confidence"],
  additionalProperties: false,
};

const SYSTEM = `You turn merged pull requests into release notes for a product used by non-technical agents.

You are given the PR title, its body, and its actual diff. The body is often
empty or an unfilled template — the diff is the reliable source. Read the diff
and work out what is actually NEW for the user: a field, a screen, a control, a
behaviour. Say what it is and where they will find it. Ignore refactors, tests, dependency bumps and internal
plumbing: if a change is invisible to the user, say so in the summary rather
than dressing it up.

Rules:
- Use only what the pull request says. Never add capabilities, numbers, dates, limits, or reasons that are not in the input. If the PR is thin, write something short — padding it with invented detail is a failure.
- Write for the person using the app, not the person who wrote the code. Drop internal service names, class names, file paths, flags and ticket IDs.
- No marketing language, no exclamation marks, no "we're excited to". Address the reader as "you".
- paths: if the PR lists nav paths, reuse them exactly. Otherwise pick from the known nav paths ONLY when the PR clearly indicates that area. When unsure, return an empty list — a wrong path sends the note to the wrong people.
- Set confidence to "low" when the PR body gave you little to work with.`;

export async function generateNote({ pr, parsed, navPaths, diff, apiKey }) {
  if (!apiKey) {
    throw httpError(
      503,
      "ANTHROPIC_API_KEY is not set in web/.env.local, so the note cannot be generated.",
    );
  }

  const client = new Anthropic({ apiKey });

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
    "--- The diff (what actually shipped) ---",
    diff || "(diff unavailable)",
    "",
    "--- The app's nav, for the 'where to find it' paths ---",
    navPaths.join("\n"),
  ].join("\n");

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
    });
  } catch (err) {
    if (err?.status === 401) {
      throw httpError(
        401,
        "Anthropic rejected this API key (401 invalid). Put a working key from console.anthropic.com > API keys into web/.env.local as ANTHROPIC_API_KEY — it is picked up on the next import, no restart needed.",
      );
    }
    throw httpError(
      err?.status || 502,
      `Anthropic request failed: ${err?.message ?? err}`,
    );
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

/* ------------------------------------------------- fallback, no model */

/**
 * Build a draft from the pull request alone, with no model involved.
 *
 * This runs when Anthropic is unavailable — no key, a rejected key, a rate
 * limit. Importing a PR should still work: the PR is the source of truth, and
 * the admin can edit the copy. The result is flagged so nobody mistakes
 * lifted-verbatim text for written-for-the-reader text.
 */
export function deriveNoteWithoutModel({ pr, parsed, uiLabels = [] }) {
  // "feat(profile): add tagline" / "[compiler] Fix refs" -> "add tagline"
  const stripped = pr.title
    .replace(/^\s*\[[^\]]+\]\s*/, "")
    .replace(/^\s*\w+(\([^)]*\))?!?:\s*/, "")
    .trim();
  const title = stripped
    ? stripped[0].toUpperCase() + stripped.slice(1)
    : pr.title;

  let summary = parsed.whatChanged;
  if (!summary) {
    // First real paragraph of the body — skipping headings, tables, and the
    // template's own boilerplate. An author who merged the template untouched
    // left the option list behind; echoing it back as a summary would be worse
    // than admitting the PR said nothing.
    const isBoilerplate = (b) =>
      /new field\s*\/\s*new component\s*\/\s*update\s*\/\s*bug fix/i.test(b) ||
      /^[-*•\s]+$/.test(b) ||
      /delete all but one/i.test(b);

    const body = stripComments(pr.body ?? "")
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, "")
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .find(
        (b) =>
          b &&
          !b.startsWith("#") &&
          !b.startsWith("<") &&
          !b.startsWith("|") &&
          !isBoilerplate(b),
      );
    summary = body ? body.replace(/\s+/g, " ") : "";
  }
  // Nothing written anywhere, but the diff shows new UI: name it, grounded in
  // what the diff literally contains, and leave the wording to the admin.
  if (!summary && uiLabels.length) {
    const list =
      uiLabels.length === 1
        ? uiLabels[0]
        : `${uiLabels.slice(0, -1).join(", ")} and ${uiLabels.at(-1)}`;
    summary = `This release adds ${list} to the app.`;
  }
  if (summary.length > 320) summary = summary.slice(0, 317).trimEnd() + "…";

  let type = parsed.type;
  if (!type) {
    if (
      /^\s*(fix|bugfix|hotfix)\b/i.test(pr.title) ||
      /\bfix(es|ed)?\b/i.test(pr.title)
    ) {
      type = "bug_fix";
    } else {
      type = "update";
    }
  }

  return { title, summary, type, paths: parsed.paths, confidence: "low" };
}

/* ------------------------------------------------------------- orchestrate */

export async function importPullRequest({ ref, navPaths, secrets = {} }) {
  const prRef = parsePrRef(ref);
  const pr = await fetchPullRequest(prRef, secrets.githubToken);
  const files = await fetchPullRequestFiles(prRef, secrets.githubToken);
  const parsed = parseTemplate(pr.body);
  const diff = summariseDiff(files);
  const uiLabels = addedUiLabels(files);

  // Reading the PR is the part that must never fail. If the model is
  // unavailable, fall back to what the PR itself states rather than losing the
  // import — the admin edits the copy either way.
  let generated;
  let generatedBy = "claude";
  let modelError = null;
  try {
    generated = await generateNote({
      pr,
      parsed,
      navPaths,
      diff,
      apiKey: secrets.anthropicApiKey,
    });
  } catch (err) {
    generated = deriveNoteWithoutModel({ pr, parsed, uiLabels });
    generatedBy = "pull-request";
    modelError = err?.message ?? String(err);
  }

  // The author's own paths win over the model's. They decide who gets notified,
  // and the human who wrote them knows the product.
  const paths = parsed.paths.length ? parsed.paths : (generated.paths ?? []);

  // An untouched template plus a bare title means the PR says nothing about
  // what shipped. Better to state that than to dress the title up as a note.
  const templateEmpty =
    !parsed.type && !parsed.whatChanged && parsed.paths.length === 0;

  return {
    templateEmpty,
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.url,
    prAuthor: pr.author,
    prRepo: pr.repo,
    merged: pr.merged,
    type: parsed.type ?? generated.type ?? "update",
    title: generated.title,
    summary: generated.summary,
    paths,
    rawWhatChanged: parsed.whatChanged,
    confidence: generated.confidence,
    pathsFromTemplate: parsed.paths.length > 0,
    generatedBy,
    modelError,
    changedFiles: interestingFiles(files).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
    uiLabels,
  };
}

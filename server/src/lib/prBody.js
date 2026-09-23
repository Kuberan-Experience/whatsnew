/**
 * Parses the structured sections out of a PR body written against
 * .github/PULL_REQUEST_TEMPLATE.md.
 *
 * The template is markdown a human edits, so the parser is deliberately
 * forgiving: any heading level, any casing, "Path(s) in app" with or without
 * the parenthetical, bullets as "-", "*" or "•". What it will not do is guess —
 * a section it cannot find comes back null and the release note is stored with
 * whatever the PR title gives us.
 */

const TYPE_MAP = new Map([
  ["new field", "new_field"],
  ["new component", "new_component"],
  ["update", "update"],
  ["bug fix", "bug_fix"],
  ["bugfix", "bug_fix"],
  ["fix", "bug_fix"],
]);

/** Strip HTML comments — the template's instructions live in them. */
function stripComments(md) {
  return String(md ?? "").replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Returns the body text under a heading whose text matches `pattern`,
 * up to the next heading of any level.
 */
function sectionBody(md, pattern) {
  const lines = md.split(/\r?\n/);
  const headingRe = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
  let collecting = false;
  const collected = [];

  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (collecting) break;
      if (pattern.test(m[1].replace(/\*\*/g, "").trim())) collecting = true;
      continue;
    }
    if (collecting) collected.push(line);
  }

  const body = collected.join("\n").trim();
  return body.length ? body : null;
}

function parseType(md) {
  const raw = sectionBody(md, /^type$/i);
  if (!raw) return null;

  // The author may have left the slash-separated list intact, ticked a
  // checkbox, or written one label. Take the first recognised label, but if
  // the untouched template line survives verbatim, treat it as unanswered.
  const cleaned = raw
    .replace(/^[-*•]\s*/gm, "")
    .replace(/\[[ xX]\]/g, "")
    .trim();

  const untouched = /new field\s*\/\s*new component\s*\/\s*update\s*\/\s*bug fix/i;
  if (untouched.test(cleaned)) return null;

  for (const [label, value] of TYPE_MAP) {
    if (new RegExp(`(^|[^a-z])${label}([^a-z]|$)`, "i").test(cleaned)) return value;
  }
  return null;
}

function parseWhatChanged(md) {
  const raw = sectionBody(md, /^what changed\??$/i);
  if (!raw) return null;
  const text = raw.replace(/^[-*•]\s*/gm, "").replace(/\s+/g, " ").trim();
  return text.length ? text : null;
}

function parsePaths(md) {
  const raw = sectionBody(md, /^path\(?s?\)?\s+in\s+app$/i);
  if (!raw) return [];

  const bulletRe = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/;
  const bullets = raw
    .split(/\r?\n/)
    .map((l) => l.match(bulletRe)?.[1])
    .filter(Boolean);

  // Fall back to non-empty lines when the author skipped the bullets.
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
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(label);
  }
  return paths;
}

/**
 * @param {string} body  PR body markdown
 * @param {string} prTitle  used as the fallback title
 */
export function parsePullRequestBody(body, prTitle = "") {
  const md = stripComments(body);
  const whatChanged = parseWhatChanged(md);

  return {
    type: parseType(md) ?? "update",
    typeWasParsed: parseType(md) !== null,
    whatChanged,
    paths: parsePaths(md),
    // Pre-polish defaults. The LLM step overwrites these when it succeeds.
    title: prTitle.trim() || "Untitled change",
    summary: whatChanged ?? prTitle.trim(),
  };
}

/**
 * "What's New" release-note email template.
 *
 * Styled after the product-updates newsletter: blue hero with the edition
 * badge, a greeting card, then one orange title bar + bullet list per change.
 *
 * Everything visual lives in this one file — restyling the email means editing
 * here and nowhere else. Plain string building, table layout, inline styles,
 * because Gmail and Outlook still drop <style> blocks and ignore flexbox.
 *
 * Renders one note or a whole edition: pass an array.
 */

const C = {
  hero: "#4a8fd8",
  heroDeep: "#2f6cb0",
  heroFleck: "#69a4e0",
  accent: "#e4652a",
  ink: "#1f2430",
  body: "#3d4450",
  muted: "#8b92a0",
  hairline: "#e3e6ef",
  canvas: "#eef0f8",
  surface: "#ffffff",
};

const TYPE_LABELS = {
  new_field: "New field",
  new_component: "New component",
  update: "Update",
  bug_fix: "Bug fix",
};

export function typeLabel(type) {
  return TYPE_LABELS[type] ?? "Update";
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date instanceof Date ? date : new Date(date));
}

function editionLabel(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.toLocaleString("en-US", { month: "long" })} Edition`.toUpperCase();
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * The faint diagonal fleck pattern in the hero. It is just text — the only
 * thing every email client renders identically — in a slightly lighter blue
 * than the background, so it reads as texture rather than content.
 */
function heroFlecks() {
  const rows = [
    "        x   x",
    "      x x x     x x",
    "   x x x x x  x x x x x",
    " x x x x x x x x x x x x x",
    "x x x x x x x x x x x x x x x",
    "  x x x x x x x x x x x x x",
    "     x x x x x x x x x x",
    "        x x x x x x",
  ];
  return `<div style="font-family:'Courier New',Courier,monospace;font-size:11px;line-height:12px;color:${C.heroFleck};white-space:pre;text-align:right;">${rows
    .map((r) => esc(r))
    .join("\n")}</div>`;
}

/** One change: orange title bar, then its bullets on white. */
function noteBlock(note) {
  const bullets = [];

  // The summary leads, then the nav paths — the same order the reader needs
  // them in: what changed, then where to find it.
  if (note.summary) bullets.push(esc(note.summary));

  for (const path of note.paths ?? []) {
    const crumbs = String(path)
      .split(">")
      .map((s) => esc(s.trim()))
      .join(` <span style="color:${C.muted};">&rsaquo;</span> `);
    bullets.push(
      `<span style="color:${C.muted};">Find it in</span> <strong style="color:${C.ink};">${crumbs}</strong>`
    );
  }

  if (!note.paths?.length) {
    bullets.push(`<span style="color:${C.muted};">Applies across the app</span>`);
  }

  const items = bullets
    .map(
      (b) =>
        `<li style="margin:0 0 10px 0;font-size:15px;line-height:1.55;color:${C.body};">${b}</li>`
    )
    .join("");

  return `
  <tr>
    <td style="padding:22px 0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:${C.accent};padding:16px 26px;">
            <p style="margin:0;font-size:18px;line-height:1.35;font-weight:700;font-style:italic;color:#ffffff;">${esc(
              note.title
            )}</p>
          </td>
        </tr>
        <tr>
          <td style="background:${C.surface};border:1px solid ${C.hairline};border-top:0;padding:22px 26px 6px 26px;">
            <p style="margin:0 0 14px 0;font-size:12px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;color:${C.accent};">${esc(
              typeLabel(note.type)
            )}</p>
            <ul style="margin:0;padding-left:20px;">${items}</ul>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * @param {object} args
 * @param {Array<{title,summary,type,paths}>|object} args.notes  one note or many
 * @param {string} [args.recipientName]  "Hi Kuberan," — falls back to "there"
 * @param {Date|string} [args.releaseDate]
 * @param {string} [args.intro]  overrides the generated intro sentence
 * @param {string} [args.appUrl] adds the footer button when set
 */
export function renderReleaseNoteEmail({
  notes,
  recipientName,
  releaseDate = new Date(),
  intro,
  appUrl,
} = {}) {
  const list = Array.isArray(notes) ? notes : [notes].filter(Boolean);
  const date = releaseDate instanceof Date ? releaseDate : new Date(releaseDate);
  const firstName = String(recipientName ?? "").trim().split(/\s+/)[0] || "there";

  const introText =
    intro ??
    `Get ready for some great new updates going live on <strong>${esc(
      date.toLocaleString("en-US", { month: "long" })
    )} ${esc(ordinal(date.getDate()))}!</strong> This release is all about making your experience smoother and more intuitive.`;

  const subject =
    list.length === 1
      ? `What's new: ${list[0].title}`
      : `What's new — ${list.length} product updates`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
  <!-- Preheader: the grey line next to the subject in the inbox list. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(
    list[0]?.summary ?? "Product updates"
  )}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

        <!-- Hero -->
        <tr>
          <td style="background:${C.hero};padding:30px 30px 34px 30px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-.01em;">e<span style="font-weight:700;">X</span>perience.com</td>
                <td align="right">
                  <span style="display:inline-block;background:${C.heroDeep};color:#ffffff;font-size:13px;font-weight:700;letter-spacing:.06em;padding:9px 16px;">${esc(
                    editionLabel(date)
                  )}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:34px;" valign="bottom">
                  <p style="margin:0;font-size:42px;line-height:1.05;font-weight:800;color:#ffffff;letter-spacing:-.02em;">What's New...</p>
                  <p style="margin:10px 0 0 0;font-size:19px;font-style:italic;color:#eaf2fc;">Product Updates</p>
                </td>
                <td align="right" valign="bottom">${heroFlecks()}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="background:${C.surface};border:1px solid ${C.hairline};border-top:0;padding:26px 30px;">
            <p style="margin:0 0 16px 0;font-size:16px;color:${C.ink};">Hi ${esc(firstName)},</p>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${C.body};">${introText}</p>
            <p style="margin:0;font-size:15px;line-height:1.6;color:${C.body};">Here's what we are rolling out:</p>
          </td>
        </tr>

        ${list.map(noteBlock).join("")}

        <!-- Footer -->
        <tr>
          <td style="padding:26px 4px 0 4px;" align="center">
            ${
              appUrl
                ? `<a href="${esc(
                    appUrl
                  )}" style="display:inline-block;background:${C.heroDeep};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">Open the app</a>`
                : ""
            }
            <p style="margin:18px 0 0 0;font-size:12px;color:${C.muted};">Released ${esc(
              formatDate(date)
            )} · You're receiving this because you have access to the areas above.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `What's New — Product Updates (${editionLabel(date)})`,
    "",
    `Hi ${firstName},`,
    "",
    "Here's what we are rolling out:",
    "",
    ...list.map((n) =>
      [
        `## ${n.title} (${typeLabel(n.type)})`,
        n.summary,
        ...(n.paths?.length
          ? n.paths.map((p) => `  - Find it in ${p}`)
          : ["  - Applies across the app"]),
        "",
      ].join("\n")
    ),
    `Released ${formatDate(date)}`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Release-note email template.
 *
 * Everything visual lives in this file — restyling the email means editing
 * here and nowhere else. It is plain string building on purpose: no template
 * engine to install, and the whole thing renders in a serverless function
 * with no filesystem reads.
 *
 * Table-based layout with inline styles, because Outlook and Gmail still
 * ignore <style> blocks and flexbox.
 */

const BRAND = {
  primary: "#1d4ed8",
  ink: "#0f172a",
  body: "#475569",
  muted: "#94a3b8",
  hairline: "#e2e8f0",
  canvas: "#f1f5f9",
  surface: "#ffffff",
};

const TYPE_BADGES = {
  new_field: { label: "New field", bg: "#eff6ff", fg: "#1d4ed8" },
  new_component: { label: "New component", bg: "#f5f3ff", fg: "#6d28d9" },
  update: { label: "Update", bg: "#ecfdf5", fg: "#047857" },
  bug_fix: { label: "Bug fix", bg: "#fff7ed", fg: "#c2410c" },
};

export function typeLabel(type) {
  return TYPE_BADGES[type]?.label ?? "Update";
}

function escapeHtml(value) {
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
    timeZone: "UTC",
  }).format(date instanceof Date ? date : new Date(date));
}

/** One "Settings > Profile" chip per path, rendered as a table row. */
export function renderPathRows(paths) {
  if (!paths?.length) {
    return `<tr><td style="padding:2px 0;color:${BRAND.body};font-size:14px;">Applies across the app</td></tr>`;
  }

  return paths
    .map((label) => {
      const crumbs = String(label)
        .split(">")
        .map((s) => escapeHtml(s.trim()))
        .join(
          ` <span style="color:${BRAND.muted};">&rsaquo;</span> `
        );
      return `<tr><td style="padding:3px 0;">
        <span style="display:inline-block;background:${BRAND.canvas};border:1px solid ${BRAND.hairline};border-radius:6px;padding:6px 10px;font-size:13px;color:${BRAND.ink};">${crumbs}</span>
      </td></tr>`;
    })
    .join("");
}

/**
 * @param {object} args
 * @param {string} args.title
 * @param {string} args.summary
 * @param {string} args.type            ReleaseType enum value
 * @param {string[]} [args.paths]       rendered unless `pathRowsHtml` is given
 * @param {Date|string} args.releaseDate
 * @param {string} [args.appBaseUrl]    adds a "View in app" button when set
 * @param {string} [args.greeting]      defaults to "Hi there" — the mailer
 *                                      passes a SendGrid substitution token so
 *                                      each agent gets their own name
 * @param {string} [args.pathRowsHtml]  pre-rendered/token path rows, same reason
 */
export function renderReleaseNoteEmail({
  title,
  summary,
  type,
  paths = [],
  releaseDate = new Date(),
  appBaseUrl,
  greeting = "Hi there",
  pathRowsHtml,
}) {
  const badge = TYPE_BADGES[type] ?? TYPE_BADGES.update;
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  const dateLabel = formatDate(releaseDate);
  const rows = pathRowsHtml ?? renderPathRows(paths);

  const cta = appBaseUrl
    ? `<tr><td style="padding:28px 32px 0 32px;">
         <a href="${escapeHtml(appBaseUrl)}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">View in app</a>
       </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};">
  <!-- Preheader: shown in the inbox list, hidden in the body. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safeSummary}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.canvas};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.hairline};border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <tr>
            <td style="padding:24px 32px 0 32px;">
              <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};font-weight:600;">What's new</p>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px 0 32px;">
              <span style="display:inline-block;background:${badge.bg};color:${badge.fg};font-size:12px;font-weight:600;padding:5px 10px;border-radius:999px;">${escapeHtml(badge.label)}</span>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px 0 32px;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;color:${BRAND.ink};font-weight:700;">${safeTitle}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 32px 0 32px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.body};">${greeting}, ${safeSummary}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 0 32px;">
              <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.muted};font-weight:600;">Where to find it</p>
              <table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
            </td>
          </tr>

          ${cta}

          <tr>
            <td style="padding:28px 32px 24px 32px;">
              <div style="border-top:1px solid ${BRAND.hairline};padding-top:14px;">
                <p style="margin:0;font-size:12px;color:${BRAND.muted};">Released ${escapeHtml(dateLabel)}</p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${badge.label}: ${title}`,
    "",
    summary,
    "",
    paths.length ? `Where to find it:\n${paths.map((p) => `  - ${p}`).join("\n")}` : "Applies across the app",
    "",
    `Released ${dateLabel}`,
    appBaseUrl ? `\nView in app: ${appBaseUrl}` : "",
  ].join("\n");

  return { subject: `What's new: ${title}`, html, text };
}

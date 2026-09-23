import sgMail from "@sendgrid/mail";
import { renderReleaseNoteEmail } from "../emails/releaseNote.js";
import { visiblePathsFor } from "./permissions.js";
import { renderPathRows } from "../emails/releaseNote.js";

/**
 * Bulk release-note delivery.
 *
 * One HTML body is rendered once and sent with a `personalizations` array, so
 * N agents cost ceil(N / 1000) API calls rather than N. The per-agent bits —
 * their name, and the subset of nav paths they can actually reach — travel as
 * SendGrid substitution tokens, which are swapped in per personalization at
 * send time. That keeps the single-body/single-call property while still
 * honouring per-path visibility.
 */

// SendGrid's documented ceiling is 1000 personalizations per request.
const MAX_PERSONALIZATIONS = 1000;

const NAME_TOKEN = "-greeting-";
const PATHS_TOKEN = "-pathRows-";

let configured = false;
function getClient() {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return null;
  if (!configured) {
    sgMail.setApiKey(key);
    configured = true;
  }
  return sgMail;
}

function firstName(name, email) {
  const n = String(name ?? "").trim().split(/\s+/)[0];
  return n || String(email ?? "").split("@")[0] || "there";
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * @param {object} args
 * @param {{title:string,summary:string,type:string,sentAt?:Date}} args.note
 * @param {string[]} args.paths        every path on the note
 * @param {Array<{email:string,name:string,permissions:string[]}>} args.recipients
 * @returns {Promise<{sent:number, calls:number, skipped?:string}>}
 */
export async function sendReleaseNoteEmail({ note, paths, recipients }) {
  if (!recipients.length) return { sent: 0, calls: 0 };

  const client = getClient();
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!client || !from) {
    // Dry run in local dev so the rest of the send flow stays exercisable.
    console.warn(
      `[mailer] SENDGRID_API_KEY/SENDGRID_FROM_EMAIL not set — skipping email to ${recipients.length} recipient(s)`
    );
    return { sent: 0, calls: 0, skipped: "sendgrid_not_configured" };
  }

  const { subject, html, text } = renderReleaseNoteEmail({
    title: note.title,
    summary: note.summary,
    type: note.type,
    paths,
    releaseDate: note.sentAt ?? new Date(),
    appBaseUrl: process.env.APP_BASE_URL,
    greeting: NAME_TOKEN,
    pathRowsHtml: PATHS_TOKEN,
  });

  const batches = chunk(recipients, MAX_PERSONALIZATIONS);

  for (const batch of batches) {
    const personalizations = batch.map((user) => {
      // Each agent sees only the paths their permissions cover. A note with no
      // paths is app-wide, so everyone gets the same "across the app" row.
      const theirPaths = paths.length ? visiblePathsFor(user, paths) : [];
      return {
        to: [{ email: user.email, name: user.name || undefined }],
        substitutions: {
          [NAME_TOKEN]: `Hi ${firstName(user.name, user.email)}`,
          [PATHS_TOKEN]: renderPathRows(theirPaths),
        },
      };
    });

    await client.send({
      personalizations,
      from: {
        email: from,
        name: process.env.SENDGRID_FROM_NAME || "Release Notes",
      },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
      trackingSettings: { clickTracking: { enable: false, enableText: false } },
    });
  }

  return { sent: recipients.length, calls: batches.length };
}

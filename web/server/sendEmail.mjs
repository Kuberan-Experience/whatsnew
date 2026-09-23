/**
 * Real SendGrid delivery.
 *
 * Server-side only: it holds the API key. Batching works by grouping
 * recipients who can see the same set of nav paths, rendering that group's
 * email once, and sending it with a `personalizations` array. So N agents cost
 * one API call per distinct visibility group — normally one or two — rather
 * than N single sends, while nobody is shown a path they cannot open.
 */

import sgMail from "@sendgrid/mail";

// SendGrid's documented ceiling per request.
const MAX_PERSONALIZATIONS = 1000;
const NAME_TOKEN = "-firstName-";

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
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
 * @param {{title,summary,type}} args.note
 * @param {Array<{email,name,visiblePaths:string[]}>} args.recipients
 * @param {(args:object)=>{subject:string,html:string,text:string}} args.renderEmail
 * @param {{sendgridApiKey?:string, fromEmail?:string, fromName?:string}} args.secrets
 */
export async function sendReleaseNoteEmail({ note, recipients, renderEmail, secrets }) {
  if (!recipients?.length) return { sent: 0, calls: 0, skipped: "no_recipients" };

  if (!secrets.sendgridApiKey) {
    throw httpError(
      503,
      "SENDGRID_API_KEY is not set in web/.env.local, so no email can be sent."
    );
  }
  if (!secrets.fromEmail) {
    throw httpError(
      503,
      "SENDGRID_FROM_EMAIL is not set in web/.env.local. It must be an address verified as a Single Sender in SendGrid, or on a domain you have authenticated there."
    );
  }

  sgMail.setApiKey(secrets.sendgridApiKey);

  // Group by what each recipient is allowed to see.
  const groups = new Map();
  for (const r of recipients) {
    const key = JSON.stringify([...(r.visiblePaths ?? [])].sort());
    if (!groups.has(key)) groups.set(key, { paths: r.visiblePaths ?? [], members: [] });
    groups.get(key).members.push(r);
  }

  let calls = 0;
  let sent = 0;

  for (const { paths, members } of groups.values()) {
    const { subject, html, text } = renderEmail({
      notes: [{ ...note, paths }],
      recipientName: NAME_TOKEN,
      releaseDate: new Date(),
    });

    for (const batch of chunk(members, MAX_PERSONALIZATIONS)) {
      const personalizations = batch.map((u) => ({
        to: [{ email: u.email, name: u.name || undefined }],
        substitutions: { [NAME_TOKEN]: firstName(u.name, u.email) },
      }));

      try {
        await sgMail.send({
          personalizations,
          from: { email: secrets.fromEmail, name: secrets.fromName || "Release Notes" },
          subject,
          content: [
            // SendGrid requires text/plain before text/html.
            { type: "text/plain", value: text },
            { type: "text/html", value: html },
          ],
          trackingSettings: { clickTracking: { enable: false, enableText: false } },
        });
      } catch (err) {
        // SendGrid puts the useful part in response.body.errors.
        const detail =
          err?.response?.body?.errors?.map((e) => e.message).join("; ") ??
          err?.message ??
          String(err);
        throw httpError(err?.code ?? 502, `SendGrid rejected the send: ${detail}`);
      }

      calls += 1;
      sent += batch.length;
    }
  }

  return { sent, calls, groups: groups.size };
}

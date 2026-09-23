/**
 * Vercel serverless function: send a release note via SendGrid.
 *
 * Requires an admin token issued by /api/auth/login — without it this would be
 * an open relay for the configured SendGrid sender.
 */
import { requireRole } from "../server/auth.mjs";
import { sendReleaseNoteEmail } from "../server/sendEmail.mjs";
import { renderReleaseNoteEmail } from "../src/email/releaseNoteEmail.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // Admin session required — this endpoint sends real email.
    requireRole(req, process.env.AUTH_SECRET ?? "", ["admin"]);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

    const result = await sendReleaseNoteEmail({
      note: body.note,
      recipients: body.recipients,
      renderEmail: renderReleaseNoteEmail,
      secrets: {
        sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
        fromEmail: process.env.SENDGRID_FROM_EMAIL ?? "",
        fromName: process.env.SENDGRID_FROM_NAME ?? "",
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[send-email]", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Send failed" });
  }
}

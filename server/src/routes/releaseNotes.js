import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware/auth.js";
import { normalizePathLabel, selectRecipients } from "../lib/permissions.js";
import { sendReleaseNoteEmail } from "../lib/mailer.js";
import { renderReleaseNoteEmail } from "../emails/releaseNote.js";

export const releaseNotesRouter = Router();

// Everything below is admin-only.
releaseNotesRouter.use(requireAuth, requireAdmin);

const TYPES = new Set(["new_field", "new_component", "update", "bug_fix"]);
const EDITABLE_STATUSES = new Set(["pending_review", "approved"]);

function serialize(note) {
  return {
    id: note.id,
    prNumber: note.prNumber,
    prTitle: note.prTitle,
    prUrl: note.prUrl,
    type: note.type,
    title: note.title,
    summary: note.summary,
    rawWhatChanged: note.rawWhatChanged,
    polished: note.polished,
    status: note.status,
    paths: note.paths?.map((p) => p.pathLabel) ?? [],
    createdAt: note.createdAt,
    sentAt: note.sentAt,
    notificationCount: note._count?.notifications ?? 0,
  };
}

const withRelations = {
  paths: { orderBy: { pathLabel: "asc" } },
  _count: { select: { notifications: true } },
};

/** GET /api/release-notes?status=pending_review */
releaseNotesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const notes = await prisma.releaseNote.findMany({
      where: status ? { status } : undefined,
      include: withRelations,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    res.json({ releaseNotes: notes.map(serialize) });
  })
);

/** GET /api/release-notes/:id */
releaseNotesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const note = await prisma.releaseNote.findUnique({
      where: { id: req.params.id },
      include: withRelations,
    });
    if (!note) return res.status(404).json({ error: "Release note not found" });
    res.json(serialize(note));
  })
);

/**
 * PATCH /api/release-notes/:id
 * Body: { title?, summary?, type?, paths?: string[], status?: "approved" }
 */
releaseNotesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, summary, type, paths, status } = req.body ?? {};

    const existing = await prisma.releaseNote.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) return res.status(404).json({ error: "Release note not found" });
    if (existing.status === "sent") {
      return res
        .status(409)
        .json({ error: "This release note has already been sent and can no longer be edited" });
    }

    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title must be a non-empty string" });
      }
      data.title = title.trim();
    }

    if (summary !== undefined) {
      if (typeof summary !== "string" || !summary.trim()) {
        return res.status(400).json({ error: "summary must be a non-empty string" });
      }
      data.summary = summary.trim();
    }

    if (type !== undefined) {
      if (!TYPES.has(type)) {
        return res.status(400).json({ error: `type must be one of ${[...TYPES].join(", ")}` });
      }
      data.type = type;
    }

    if (status !== undefined) {
      if (!EDITABLE_STATUSES.has(status)) {
        return res
          .status(400)
          .json({ error: "status may only be set to pending_review or approved here; use /send to send" });
      }
      data.status = status;
    }

    let normalizedPaths = null;
    if (paths !== undefined) {
      if (!Array.isArray(paths)) {
        return res.status(400).json({ error: "paths must be an array of strings" });
      }
      // Normalise spacing around ">" and drop duplicates so the permission
      // matcher sees consistent input.
      const seen = new Set();
      normalizedPaths = [];
      for (const raw of paths) {
        const label = normalizePathLabel(raw);
        if (!label) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        normalizedPaths.push(label);
      }
    }

    const note = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.releaseNote.update({ where: { id }, data });
      }
      if (normalizedPaths) {
        await tx.releaseNotePath.deleteMany({ where: { releaseNoteId: id } });
        if (normalizedPaths.length) {
          await tx.releaseNotePath.createMany({
            data: normalizedPaths.map((pathLabel) => ({ releaseNoteId: id, pathLabel })),
          });
        }
      }
      return tx.releaseNote.findUnique({ where: { id }, include: withRelations });
    });

    res.json(serialize(note));
  })
);

/**
 * GET /api/release-notes/:id/preview
 * The exact HTML that would be emailed. Used by the dashboard's preview pane,
 * and handy while restyling the template.
 */
releaseNotesRouter.get(
  "/:id/preview",
  asyncHandler(async (req, res) => {
    const note = await prisma.releaseNote.findUnique({
      where: { id: req.params.id },
      include: { paths: true },
    });
    if (!note) return res.status(404).json({ error: "Release note not found" });

    const { html } = renderReleaseNoteEmail({
      title: note.title,
      summary: note.summary,
      type: note.type,
      paths: note.paths.map((p) => p.pathLabel),
      releaseDate: note.sentAt ?? new Date(),
      appBaseUrl: process.env.APP_BASE_URL,
      greeting: `Hi ${req.user.name?.split(" ")[0] || "there"}`,
    });

    res.type("html").send(html);
  })
);

/**
 * POST /api/release-notes/:id/send
 *
 * Ordering note: the email goes out before the DB is committed. If SendGrid
 * fails we commit nothing, so the admin can hit Send again on a clean slate.
 * The reverse order would leave a note marked "sent" with no email behind it,
 * which is invisible. A retry after a rare post-email DB failure can re-send
 * the email, but the notification rows are idempotent (unique on
 * userId+releaseNoteId), so nothing duplicates in-app.
 */
releaseNotesRouter.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const note = await prisma.releaseNote.findUnique({
      where: { id },
      include: { paths: true },
    });
    if (!note) return res.status(404).json({ error: "Release note not found" });
    if (note.status === "sent") {
      return res.status(409).json({ error: "Release note has already been sent", sentAt: note.sentAt });
    }

    const paths = note.paths.map((p) => p.pathLabel);

    const agents = await prisma.user.findMany({
      where: { role: "agent" },
      select: { id: true, email: true, name: true, permissions: true },
    });

    const recipients = selectRecipients(agents, paths);
    if (!recipients.length) {
      return res.status(422).json({
        error:
          "No agents have permission for any of this note's paths. Adjust the paths or the agents' permissions, then send.",
        paths,
      });
    }

    const sentAt = new Date();
    const email = await sendReleaseNoteEmail({
      note: { ...note, sentAt },
      paths,
      recipients,
    });

    await prisma.$transaction([
      prisma.notification.createMany({
        data: recipients.map((u) => ({ userId: u.id, releaseNoteId: id })),
        skipDuplicates: true,
      }),
      prisma.releaseNote.update({
        where: { id },
        data: { status: "sent", sentAt },
      }),
    ]);

    res.json({
      ok: true,
      releaseNoteId: id,
      recipients: recipients.length,
      emailsSent: email.sent,
      sendGridCalls: email.calls,
      emailSkipped: email.skipped ?? null,
      sentAt,
    });
  })
);

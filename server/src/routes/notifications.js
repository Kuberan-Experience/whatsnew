import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, asyncHandler } from "../middleware/auth.js";
import { visiblePathsFor } from "../lib/permissions.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

/**
 * GET /api/notifications?unreadOnly=true&limit=20
 *
 * Returns this user's notifications. Paths are filtered a second time on read:
 * permissions can be narrowed after a notification was written, and an agent
 * should never see a nav path they can no longer reach.
 */
notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id, ...(unreadOnly ? { read: false } : {}) },
        include: { releaseNote: { include: { paths: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.user.id, read: false } }),
    ]);

    const notifications = rows.map((n) => {
      const allPaths = n.releaseNote.paths.map((p) => p.pathLabel);
      return {
        id: n.id,
        read: n.read,
        createdAt: n.createdAt,
        releaseNote: {
          id: n.releaseNote.id,
          type: n.releaseNote.type,
          title: n.releaseNote.title,
          summary: n.releaseNote.summary,
          sentAt: n.releaseNote.sentAt,
          // App-wide notes (no paths) stay visible to everyone.
          paths: allPaths.length ? visiblePathsFor(req.user, allPaths) : [],
        },
      };
    });

    res.json({ notifications, unreadCount });
  })
);

/** PATCH /api/notifications/:id/read */
notificationsRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    // Scoped by userId so one agent can't mark another's notification read.
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { read: true, readAt: new Date() },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, read: false },
    });
    res.json({ ok: true, id: req.params.id, read: true, unreadCount });
  })
);

/** PATCH /api/notifications/read-all — what the bell calls when opened. */
notificationsRouter.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true, readAt: new Date() },
    });
    res.json({ ok: true, marked: result.count, unreadCount: 0 });
  })
);

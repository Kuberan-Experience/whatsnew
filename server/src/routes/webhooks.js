import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { parsePullRequestBody } from "../lib/prBody.js";
import { polishReleaseNote } from "../lib/polish.js";
import { asyncHandler } from "../middleware/auth.js";

export const webhooksRouter = Router();

/**
 * Constant-time comparison of the GitHub signature header against a signature
 * we compute over the exact bytes GitHub sent. This is why the route is mounted
 * with express.raw() in app.js — re-serialising a parsed body changes the bytes
 * (key order, unicode escaping) and the signature will never match.
 */
function signatureIsValid(rawBody, headerValue, secret) {
  if (!headerValue) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  // timingSafeEqual throws on length mismatch, so check length first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

webhooksRouter.post(
  "/github",
  asyncHandler(async (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[webhook] GITHUB_WEBHOOK_SECRET is not set");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    // express.raw() leaves req.body as a Buffer.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

    if (!signatureIsValid(rawBody, req.get("x-hub-signature-256"), secret)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = req.get("x-github-event");
    if (event === "ping") return res.status(200).json({ ok: true, pong: true });
    if (event !== "pull_request") {
      return res.status(202).json({ ok: true, ignored: `event=${event}` });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Body is not valid JSON" });
    }

    const { action, pull_request: pr } = payload;
    if (action !== "closed" || !pr?.merged) {
      return res.status(202).json({
        ok: true,
        ignored: `action=${action} merged=${Boolean(pr?.merged)}`,
      });
    }

    const parsed = parsePullRequestBody(pr.body, pr.title);

    // Already ingested (GitHub retries deliveries, and a PR can be reopened and
    // re-merged). Never clobber a note an admin has already edited or sent.
    const existing = await prisma.releaseNote.findUnique({
      where: { prNumber: pr.number },
      select: { id: true, status: true },
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        releaseNoteId: existing.id,
        duplicate: true,
        status: existing.status,
      });
    }

    // Auto-polish, fail-open: a polish failure must not cost us the delivery.
    const polished = await polishReleaseNote({
      prTitle: pr.title,
      whatChanged: parsed.whatChanged,
      type: parsed.type,
      paths: parsed.paths,
    });

    const note = await prisma.releaseNote.create({
      data: {
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.html_url ?? null,
        type: parsed.type,
        title: polished?.title ?? parsed.title,
        summary: polished?.summary ?? parsed.summary,
        rawWhatChanged: parsed.whatChanged,
        polished: Boolean(polished),
        status: "pending_review",
        paths: {
          create: parsed.paths.map((pathLabel) => ({ pathLabel })),
        },
      },
      select: { id: true, title: true, polished: true },
    });

    // 201 with a small body: GitHub only cares that we answered quickly.
    res.status(201).json({
      ok: true,
      releaseNoteId: note.id,
      polished: note.polished,
      parsedPaths: parsed.paths.length,
      typeWasParsed: parsed.typeWasParsed,
    });
  })
);

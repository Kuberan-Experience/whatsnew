/**
 * Mock API for the UI-only build.
 *
 * Every function here mirrors a backend endpoint one-for-one and returns a
 * promise, so wiring this to a real server later means replacing the bodies
 * with fetch calls — no component changes:
 *
 *   listReleaseNotes   GET   /api/release-notes
 *   updateReleaseNote  PATCH /api/release-notes/:id
 *   sendReleaseNote    POST  /api/release-notes/:id/send
 *   listNotifications  GET   /api/notifications
 *   markRead           PATCH /api/notifications/:id/read
 *
 * State lives in localStorage so edits survive a refresh.
 */

import {
  USERS,
  RELEASE_NOTES,
  NOTIFICATIONS,
  DEMO_PASSWORD,
  flattenNavPaths,
  PROFILE_SEED,
} from "./appData.js";
import {
  selectRecipients,
  visiblePathsFor,
  normalizePathLabel,
} from "./permissions.js";
import { destinationFor } from "./deepLink.js";
import { renderReleaseNoteEmail } from "../email/releaseNoteEmail.js";

// Bump on any seed change: persisted state from an older seed would otherwise
// keep the previous accounts alive in an existing browser.
const KEY = "whatsnew.state.v4";
const LATENCY = 220; // enough to make loading states real, not enough to annoy

function seed() {
  return {
    users: structuredClone(USERS),
    releaseNotes: structuredClone(RELEASE_NOTES),
    notifications: structuredClone(NOTIFICATIONS),
    profile: structuredClone(PROFILE_SEED),
    // Emails the mock "SendGrid" accepted, newest first — the Outbox view.
    outbox: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    // Any shape drift and we start clean rather than crash the app.
    if (!parsed?.users || !parsed?.releaseNotes) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

let state = load();

// Two accounts sharing an email means login always resolves to the first one
// and the other becomes unreachable. Cheap to detect, confusing to debug.
if (import.meta.env?.DEV) {
  const seen = new Set();
  for (const u of state.users ?? []) {
    const email = u.email?.toLowerCase();
    if (seen.has(email)) {
      console.warn(
        `[whatsnew] Duplicate account email "${u.email}" — only the first can sign in.`,
      );
    }
    seen.add(email);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private-mode or quota. The in-memory state still works for this session.
  }
}

function delay(value) {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(value)), LATENCY),
  );
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return Promise.reject(err);
}

function noteById(id) {
  return state.releaseNotes.find((n) => n.id === id);
}

export function resetDemoData() {
  state = seed();
  persist();
}

export const api = {
  /** POST /api/auth/login */
  login(email, password) {
    const user = state.users.find(
      (u) => u.email.toLowerCase() === String(email).trim().toLowerCase(),
    );
    if (!user || password !== DEMO_PASSWORD) {
      return fail(401, "Invalid email or password");
    }
    return delay(user);
  },

  /** GET /api/auth/me */
  me(userId) {
    const user = state.users.find((u) => u.id === userId);
    return user ? delay(user) : fail(401, "Session expired");
  },

  listUsers() {
    return delay(state.users);
  },

  navPaths() {
    return delay(flattenNavPaths());
  },

  /**
   * POST /api/pr-import
   *
   * The only way a release note enters this app. Hits the dev-server handler,
   * which reads the PR from GitHub and has Claude write the copy — both need
   * secrets, so neither can happen in the browser.
   */
  async importPullRequest(ref) {
    const res = await fetch("/api/pr-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    });

    let payload;
    try {
      payload = await res.json();
    } catch {
      throw Object.assign(
        new Error("The import endpoint returned nothing usable."),
        {
          status: res.status,
        },
      );
    }
    if (!res.ok) {
      throw Object.assign(new Error(payload.error ?? "Import failed"), {
        status: res.status,
      });
    }

    const duplicate = state.releaseNotes.find(
      (n) => n.prNumber === payload.prNumber && n.prRepo === payload.prRepo,
    );
    if (duplicate) {
      throw Object.assign(
        new Error(`PR #${payload.prNumber} has already been imported.`),
        { status: 409 },
      );
    }

    const note = {
      id: `rn_${Date.now()}`,
      ...payload,
      polished: true,
      status: "pending_review",
      createdAt: new Date().toISOString(),
      sentAt: null,
    };
    state.releaseNotes.unshift(note);
    persist();
    return structuredClone(note);
  },

  /** GET /api/release-notes */
  listReleaseNotes() {
    const order = { pending_review: 0, approved: 1, sent: 2 };
    const sorted = [...state.releaseNotes].sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        new Date(b.createdAt) - new Date(a.createdAt),
    );
    return delay(sorted);
  },

  /** PATCH /api/release-notes/:id */
  updateReleaseNote(id, patch) {
    const note = noteById(id);
    if (!note) return fail(404, "Release note not found");
    if (note.status === "sent") {
      return fail(
        409,
        "This release note has been sent and can no longer be edited",
      );
    }

    if (patch.title !== undefined) {
      if (!String(patch.title).trim())
        return fail(400, "Title cannot be empty");
      note.title = String(patch.title).trim();
    }
    if (patch.summary !== undefined) {
      if (!String(patch.summary).trim())
        return fail(400, "Summary cannot be empty");
      note.summary = String(patch.summary).trim();
    }
    if (patch.type !== undefined) note.type = patch.type;
    if (patch.status !== undefined) note.status = patch.status;

    if (patch.paths !== undefined) {
      // Normalise spacing around ">" and drop duplicates, so the permission
      // matcher always sees consistent input.
      const seen = new Set();
      note.paths = [];
      for (const raw of patch.paths) {
        const label = normalizePathLabel(raw);
        if (!label || seen.has(label.toLowerCase())) continue;
        seen.add(label.toLowerCase());
        note.paths.push(label);
      }
    }

    persist();
    return delay(note);
  },

  /**
   * Who would receive this note, without sending it. Drives the recipient
   * preview in the editor, so an admin can see the permission filter working
   * before committing to a send.
   */
  previewRecipients(id) {
    const note = noteById(id);
    if (!note) return fail(404, "Release note not found");

    const recipients = selectRecipients(state.users, note.paths).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      visiblePaths: note.paths.length ? visiblePathsFor(u, note.paths) : [],
    }));

    const excluded = state.users
      .filter(
        (u) => u.role === "agent" && !recipients.some((r) => r.id === u.id),
      )
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));

    return delay({ recipients, excluded });
  },

  /** POST /api/release-notes/:id/send */
  async sendReleaseNote(id) {
    const note = noteById(id);
    if (!note) return fail(404, "Release note not found");
    if (note.status === "sent")
      return fail(409, "Release note has already been sent");
    if (!String(note.summary ?? "").trim()) {
      return fail(
        422,
        "This note has no summary — the pull request didn't describe the change. Write one before sending.",
      );
    }

    const recipients = selectRecipients(state.users, note.paths);
    if (!recipients.length) {
      return fail(
        422,
        "No agents have permission for any of this note's paths. Adjust the paths or the agents' permissions, then send.",
      );
    }

    const sentAt = new Date().toISOString();

    const personalizations = recipients.map((u) => ({
      to: u.email,
      name: u.name,
      visiblePaths: note.paths.length ? visiblePathsFor(u, note.paths) : [],
    }));

    // Hand it to the server to send for real. If SendGrid isn't configured the
    // server says so, and we record the send as simulated rather than pretending
    // an email went out.
    let delivery;
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: { title: note.title, summary: note.summary, type: note.type },
          recipients: personalizations.map((p) => ({
            email: p.to,
            name: p.name,
            visiblePaths: p.visiblePaths,
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      delivery = res.ok
        ? { delivered: true, calls: payload.calls, sent: payload.sent }
        : {
            delivered: false,
            reason: payload.error ?? `Send failed (${res.status})`,
          };
    } catch (err) {
      delivery = { delivered: false, reason: err.message };
    }

    const { subject, html } = renderReleaseNoteEmail({
      notes: [note],
      recipientName: recipients[0].name,
      releaseDate: sentAt,
    });

    state.outbox.unshift({
      id: `mail_${Date.now()}`,
      releaseNoteId: note.id,
      subject,
      html,
      sentAt,
      personalizations,
      sendGridCalls:
        delivery.calls ?? Math.ceil(personalizations.length / 1000),
      delivered: delivery.delivered,
      deliveryError: delivery.reason ?? null,
    });

    // A notification is only worth posting if it can take the agent somewhere.
    // When none of the note's paths map to a screen that exists, the bell entry
    // would be a dead end — so it isn't created, and every notification that
    // does exist carries a working "Check it out".
    const destination = destinationFor(note);
    let notified = 0;

    if (destination) {
      // One row per recipient, deduped on (user, note).
      for (const u of recipients) {
        const exists = state.notifications.some(
          (n) => n.userId === u.id && n.releaseNoteId === note.id,
        );
        if (exists) continue;
        state.notifications.unshift({
          id: `n_${u.id}_${note.id}`,
          userId: u.id,
          releaseNoteId: note.id,
          read: false,
          createdAt: sentAt,
        });
        notified += 1;
      }
    }

    note.status = "sent";
    note.sentAt = sentAt;
    persist();

    return delay({
      ok: true,
      recipients: recipients.length,
      sendGridCalls: delivery.calls ?? 0,
      delivered: delivery.delivered,
      deliveryError: delivery.reason ?? null,
      notified,
      destination: destination?.path ?? null,
      sentAt,
    });
  },

  listOutbox() {
    return delay(state.outbox);
  },

  /** The email that was actually delivered for a given note, if any. */
  getSentEmail(releaseNoteId) {
    const mail = state.outbox.find((m) => m.releaseNoteId === releaseNoteId);
    return delay(mail ?? null);
  },

  /** GET /api/profile */
  getProfile() {
    // Merge over the seed rather than replacing it: persisted state written
    // before a field existed would otherwise hand React an undefined value and
    // flip that input to uncontrolled.
    state.profile = {
      ...structuredClone(PROFILE_SEED),
      ...(state.profile ?? {}),
    };
    return delay(state.profile);
  },

  /** PATCH /api/profile */
  saveProfile(patch) {
    if (!String(patch?.publishName ?? "").trim()) {
      return fail(400, "Publish Name is required");
    }
    const next = { ...state.profile, ...patch };

    // People type "acme.com"; store something a browser can actually open.
    const site = String(next.personalWebsite ?? "").trim();
    next.personalWebsite =
      site && !/^https?:\/\//i.test(site) ? `https://${site}` : site;

    state.profile = next;
    persist();
    return delay(state.profile);
  },

  /** GET /api/notifications */
  listNotifications(userId) {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return fail(401, "Session expired");

    const rows = state.notifications
      .filter((n) => n.userId === userId)
      // Only surface what we can actually take the agent to. This also hides
      // rows written before that rule existed, so the bell is self-healing
      // rather than showing a dead entry until someone clears storage.
      .filter((n) => {
        const note = noteById(n.releaseNoteId);
        return note && destinationFor(note);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((n) => {
        const note = noteById(n.releaseNoteId);
        return {
          id: n.id,
          read: n.read,
          createdAt: n.createdAt,
          releaseNote: {
            id: note.id,
            type: note.type,
            title: note.title,
            summary: note.summary,
            sentAt: note.sentAt,
            // Labels the PR's diff introduced — what "Check it out" aims at.
            uiLabels: note.uiLabels ?? [],
            // Filtered again on read: permissions can be narrowed after the
            // notification was written.
            paths: note.paths.length ? visiblePathsFor(user, note.paths) : [],
          },
        };
      });

    return delay({
      notifications: rows,
      unreadCount: rows.filter((r) => !r.read).length,
    });
  },

  /** Does this note point at a screen the app actually has? */
  destinationForNote(id) {
    const note = noteById(id);
    if (!note) return fail(404, "Release note not found");
    return delay(destinationFor(note));
  },

  /** PATCH /api/notifications/:id/read */
  markNotificationRead(userId, id) {
    const row = state.notifications.find(
      (n) => n.id === id && n.userId === userId,
    );
    if (!row) return fail(404, "Notification not found");
    row.read = true;
    persist();
    return delay({ ok: true, id });
  },

  /** PATCH /api/notifications/read-all */
  markAllRead(userId) {
    let marked = 0;
    for (const n of state.notifications) {
      if (n.userId === userId && !n.read) {
        n.read = true;
        marked += 1;
      }
    }
    persist();
    return delay({ ok: true, marked });
  },
};

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
} from "../mock/data.js";
import { selectRecipients, visiblePathsFor, normalizePathLabel } from "./permissions.js";
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

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private-mode or quota. The in-memory state still works for this session.
  }
}

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), LATENCY));
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
      (u) => u.email.toLowerCase() === String(email).trim().toLowerCase()
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
      throw Object.assign(new Error("The import endpoint returned nothing usable."), {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw Object.assign(new Error(payload.error ?? "Import failed"), { status: res.status });
    }

    const duplicate = state.releaseNotes.find(
      (n) => n.prNumber === payload.prNumber && n.prRepo === payload.prRepo
    );
    if (duplicate) {
      throw Object.assign(
        new Error(`PR #${payload.prNumber} has already been imported.`),
        { status: 409 }
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
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    return delay(sorted);
  },

  /** PATCH /api/release-notes/:id */
  updateReleaseNote(id, patch) {
    const note = noteById(id);
    if (!note) return fail(404, "Release note not found");
    if (note.status === "sent") {
      return fail(409, "This release note has been sent and can no longer be edited");
    }

    if (patch.title !== undefined) {
      if (!String(patch.title).trim()) return fail(400, "Title cannot be empty");
      note.title = String(patch.title).trim();
    }
    if (patch.summary !== undefined) {
      if (!String(patch.summary).trim()) return fail(400, "Summary cannot be empty");
      note.summary = String(patch.summary).trim();
    }
    if (patch.type !== undefined) note.type = patch.type;
    if (patch.componentKey !== undefined) note.componentKey = patch.componentKey || null;
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
      .filter((u) => u.role === "agent" && !recipients.some((r) => r.id === u.id))
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));

    return delay({ recipients, excluded });
  },

  /** POST /api/release-notes/:id/send */
  sendReleaseNote(id) {
    const note = noteById(id);
    if (!note) return fail(404, "Release note not found");
    if (note.status === "sent") return fail(409, "Release note has already been sent");

    const recipients = selectRecipients(state.users, note.paths);
    if (!recipients.length) {
      return fail(
        422,
        "No agents have permission for any of this note's paths. Adjust the paths or the agents' permissions, then send."
      );
    }

    const sentAt = new Date().toISOString();

    // One send, one personalizations array — the batch shape the real SendGrid
    // call uses, so the outbox shows exactly how many API calls it would cost.
    const personalizations = recipients.map((u) => ({
      to: u.email,
      name: u.name,
      visiblePaths: note.paths.length ? visiblePathsFor(u, note.paths) : [],
    }));

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
      sendGridCalls: Math.ceil(personalizations.length / 1000),
    });

    // One notification row per recipient, deduped on (user, note).
    for (const u of recipients) {
      const exists = state.notifications.some(
        (n) => n.userId === u.id && n.releaseNoteId === note.id
      );
      if (exists) continue;
      state.notifications.unshift({
        id: `n_${u.id}_${note.id}`,
        userId: u.id,
        releaseNoteId: note.id,
        read: false,
        createdAt: sentAt,
      });
    }

    note.status = "sent";
    note.sentAt = sentAt;
    persist();

    return delay({
      ok: true,
      recipients: recipients.length,
      sendGridCalls: Math.ceil(recipients.length / 1000),
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
    // Older persisted state predates the profile; fall back to the seed.
    state.profile ??= structuredClone(PROFILE_SEED);
    return delay(state.profile);
  },

  /** PATCH /api/profile */
  saveProfile(patch) {
    if (!String(patch?.publishName ?? "").trim()) {
      return fail(400, "Publish Name is required");
    }
    state.profile = { ...state.profile, ...patch };
    persist();
    return delay(state.profile);
  },

  /**
   * GET /api/highlights
   *
   * Which controls on screen should wear a "New" badge for this user: every
   * sent release note that names a componentKey and that this user was allowed
   * to receive. Same permission filter as the email and the bell, so the three
   * can never disagree about what an agent has been told.
   */
  listHighlights(userId) {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return fail(401, "Session expired");

    const highlights = {};
    for (const note of state.releaseNotes) {
      if (note.status !== "sent" || !note.componentKey) continue;

      const allowed =
        user.role === "admin" ||
        !note.paths.length ||
        visiblePathsFor(user, note.paths).length > 0;
      if (!allowed) continue;

      highlights[note.componentKey] = {
        id: note.id,
        title: note.title,
        summary: note.summary,
        type: note.type,
        sentAt: note.sentAt,
      };
    }
    return delay(highlights);
  },

  /** GET /api/notifications */
  listNotifications(userId) {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return fail(401, "Session expired");

    const rows = state.notifications
      .filter((n) => n.userId === userId)
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

  /** PATCH /api/notifications/:id/read */
  markNotificationRead(userId, id) {
    const row = state.notifications.find((n) => n.id === id && n.userId === userId);
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

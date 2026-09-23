# What's New — release notes from merged PRs

An admin pastes a merged GitHub pull request. The PR is read from the GitHub API,
Claude writes the release-note copy, and once approved it goes out as an email
and an in-app notification — filtered so an agent only hears about nav areas
they can actually reach, and badging the exact control the PR introduced.

## Run it

```bash
cd web
npm install
cp .env.example .env.local     # then fill in ANTHROPIC_API_KEY
npm run dev                    # http://localhost:5173
```

`.env.local` (gitignored, server-side only — never bundled into client JS):

| Var | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | writing the release note. Without it, importing a PR fails with a clear message. |
| `GITHUB_TOKEN` | optional — private repos, or lifting GitHub's 60 req/hr anonymous limit. |

Accounts (password `whatsnew123`):

| Account | Role | Permissions |
|---|---|---|
| `kuberan@experience.com` | admin | `*` |
| `kuberanvenkatesh3@gmail.com` | agent | `*` |
| `nivedth@experience.com` | agent | `Account Center > Profile`, `Account Center > Billing` |

> **No real email is sent.** There is no SendGrid key in this build — the
> addresses decide who appears in the audience panel, the personalizations and
> the Delivered tab. Nothing leaves the browser.

## The two roles

**Admin** gets one page: Release Notes. No product nav — it would be scenery.
Paste a PR URL (`https://github.com/owner/repo/pull/123`, or `owner/repo#123`),
review what comes back, then **Approve & Send**.

**Agent** lands on their profile **preview**, as in the product. **Edit** opens
the editor; **Cancel** returns. Release notes reach them through the bell, and
any control a note introduced wears a **New** badge.

## The loop

1. As **kuberan@**, paste a merged PR and hit **Import PR**.
2. The server reads the PR, parses the template sections, and has Claude write
   the title and summary. The editor shows the audience — who receives it and
   who is skipped, and why.
3. **Email preview** → the newsletter. **Approve & Send** → the **Delivered**
   tab shows the per-agent personalizations and the exact HTML.
4. As an agent: bell badge, a dot on *Profile*, and a **New** badge on the field
   the PR added.

## Where the content comes from

Nothing is seeded. Every release note is a real PR.

- **Deterministic first.** If the PR follows
  `.github/PULL_REQUEST_TEMPLATE.md`, the *Type* and *Path(s) in app* sections
  are parsed literally. The author's paths **override** the model's — they decide
  who gets notified, and a model should not be free to reword that.
- **Claude second**, for the editorial copy and for whatever the template left
  blank. It is told, and constrained by schema, to use only what the PR says; a
  thin PR yields a thin note rather than an invented one. It returns a
  `confidence` flag, surfaced on import when the PR body was thin.
- Paths the PR didn't state are labelled as inferred in the editor, so they get
  a second look before they decide an audience.

## Why there is a server at all

Importing a PR needs an Anthropic key and optionally a GitHub token. A key in
client JavaScript is a key you have handed to every visitor, so the handler runs
in the Vite dev server (`web/vite.config.js` → `web/server/prImport.mjs`), not
the browser. It is still one `npm run dev`. For deployment the same handler
belongs in a serverless function; `server/` holds the Express version.

## Layout

```
web/
  server/prImport.mjs             GitHub fetch + template parse + Claude
  vite.config.js                  mounts /api/pr-import in dev
  src/email/releaseNoteEmail.js   the newsletter — all styling lives here
  src/lib/permissions.js          segment-prefix path matching
  src/lib/store.js                app state; one function per future endpoint
  src/pages/AdminReleaseNotes.jsx
  src/pages/Profile.jsx           preview + editor
server/                           Express/Prisma version, not wired up
.github/PULL_REQUEST_TEMPLATE.md  the sections the parser reads
```

### The permission model

An agent's permissions are nav-path prefixes:

- `Account Center` grants `Account Center > Billing > Invoices` — prefix match.
- `Account Center > Billing` does **not** grant the broader `Account Center`.
- `*` grants everything. A note with no paths is app-wide.

The same matcher decides who is emailed, who gets the bell entry, and who sees
the "New" badge — so the three can't drift apart.

### Tying a note to the control it describes

A note can name a `componentKey` (`profile.tagline`, …) from
`PROFILE_COMPONENTS` in `src/mock/data.js`; Claude picks one when the PR clearly
introduces it, and the admin can override. Once sent, that control renders a
"New" badge for the agents who were in the audience. Add a component to that
list and it becomes available to both.

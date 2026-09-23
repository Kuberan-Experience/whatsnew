import { useCallback, useEffect, useMemo, useState } from "react";
import { api, resetDemoData } from "../lib/store.js";
import { destinationFor } from "../lib/deepLink.js";
import { useAuth } from "../lib/auth.jsx";
import TypeBadge, { TYPE_OPTIONS } from "../components/TypeBadge.jsx";
import PathsInput from "../components/PathsInput.jsx";
import EmailPreview from "../components/EmailPreview.jsx";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending_review", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
];

const STATUS_LABELS = {
  pending_review: "Needs review",
  approved: "Approved",
  sent: "Sent",
};

export default function AdminReleaseNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState("edit");

  // Draft holds unsaved edits so the form stays responsive without writing on
  // every keystroke; `dirty` drives the save affordance.
  const [draft, setDraft] = useState(null);
  const [audience, setAudience] = useState(null);
  const [sentEmail, setSentEmail] = useState(null);
  const [prRef, setPrRef] = useState("");
  const [importing, setImporting] = useState({ busy: false, error: null, flash: null });
  const [status, setStatus] = useState({ busy: false, error: null, flash: null });

  const load = useCallback(async () => {
    const list = await api.listReleaseNotes();
    setNotes(list);
    setSelectedId((cur) => cur ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  // Reset the draft whenever the selection changes.
  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({
      title: selected.title,
      summary: selected.summary,
      type: selected.type,
      paths: [...selected.paths],
    });
    setStatus({ busy: false, error: null, flash: null });
    setTab("edit");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The email that actually went out, for sent notes.
  useEffect(() => {
    if (!selected || selected.status !== "sent") return setSentEmail(null);
    api.getSentEmail(selected.id).then(setSentEmail).catch(() => setSentEmail(null));
  }, [selected?.id, selected?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who this note would reach, recomputed whenever the saved paths change.
  useEffect(() => {
    if (!selected) return setAudience(null);
    api.previewRecipients(selected.id).then(setAudience).catch(() => setAudience(null));
  }, [selected?.id, selected?.paths?.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () => (filter === "all" ? notes : notes.filter((n) => n.status === filter)),
    [notes, filter]
  );

  const locked = selected?.status === "sent";
  const dirty =
    draft &&
    selected &&
    (draft.title !== selected.title ||
      draft.summary !== selected.summary ||
      draft.type !== selected.type ||
      draft.paths.join("|") !== selected.paths.join("|"));

  /**
   * Runs an action, reloads, then shows a confirmation. The message comes from
   * whatever `fn` returns, falling back to `defaultFlash` — an earlier version
   * let `fn` set the status itself and then clobbered it here, so a successful
   * send confirmed nothing.
   */
  async function run(fn, defaultFlash) {
    setStatus({ busy: true, error: null, flash: null });
    try {
      const flash = await fn();
      await load();
      setStatus({ busy: false, error: null, flash: flash ?? defaultFlash ?? null });
    } catch (err) {
      setStatus({ busy: false, error: err.message, flash: null });
    }
  }

  async function importPr(e) {
    e.preventDefault();
    if (!prRef.trim()) return;
    setImporting({ busy: true, error: null, flash: null });
    try {
      const note = await api.importPullRequest(prRef.trim());
      await load();
      setSelectedId(note.id);
      setPrRef("");
      setImporting({
        busy: false,
        error: null,
        flash:
          `Imported PR #${note.prNumber} from ${note.prRepo}` +
          (note.templateEmpty
            ? " — but its template was empty, so you'll need to write the note"
            : note.generatedBy === "pull-request"
              ? " — Claude was unavailable, so the text came straight from the PR"
              : note.confidence === "low"
                ? " — the PR body was thin, so check the copy"
                : ""),
      });
    } catch (err) {
      setImporting({ busy: false, error: err.message, flash: null });
    }
  }

  const save = (extra = {}) =>
    run(() => api.updateReleaseNote(selected.id, { ...draft, ...extra }), "Saved");

  const approveAndSend = () =>
    run(async () => {
      // Save first — sending should always mail what's on screen, not a stale
      // version the admin thinks they already changed.
      if (dirty) await api.updateReleaseNote(selected.id, draft);
      const res = await api.sendReleaseNote(selected.id);
      const who = `${res.recipients} agent${res.recipients === 1 ? "" : "s"}`;
      const inApp = res.notified
        ? `${res.notified} in-app notification${res.notified === 1 ? "" : "s"} posted (links to ${res.destination}).`
        : "No in-app notification — these paths don't map to a screen in the app.";
      return res.delivered
        ? `Emailed ${who} via SendGrid in ${res.sendGridCalls} call${res.sendGridCalls === 1 ? "" : "s"}. ${inApp}`
        : `NO email was sent — ${res.deliveryError} ${inApp}`;
    });

  const previewNote = draft
    ? { ...draft, id: selected?.id }
    : selected;

  return (
    <div className="admin">
      <div className="admin__head">
        <div>
          <h1>Release notes</h1>
          <p className="admin__sub">
            Paste a merged pull request. Its type, description and nav paths are read
            from the PR, and the note is written by Claude — review it, then send.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            resetDemoData();
            setSelectedId(null);
            load();
          }}
        >
          Clear all
        </button>
      </div>

      <form className="importer" onSubmit={importPr}>
        <input
          value={prRef}
          onChange={(e) => setPrRef(e.target.value)}
          placeholder="https://github.com/owner/repo/pull/123   or   owner/repo#123"
          disabled={importing.busy}
          aria-label="Pull request URL"
        />
        <button type="submit" className="btn btn--primary" disabled={importing.busy || !prRef.trim()}>
          {importing.busy ? "Reading PR…" : "Import PR"}
        </button>
      </form>
      {importing.error && <p className="alert alert--error">{importing.error}</p>}
      {importing.flash && <p className="alert alert--ok">{importing.flash}</p>}

      <div className="admin__cols">
        <section className="list">
          <div className="tabs">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`tab ${filter === f.value ? "is-active" : ""}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                <span className="tab__count">
                  {f.value === "all"
                    ? notes.length
                    : notes.filter((n) => n.status === f.value).length}
                </span>
              </button>
            ))}
          </div>

          <ul className="list__items">
            {visible.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`card ${selectedId === n.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(n.id)}
                >
                  <div className="card__top">
                    <TypeBadge type={n.type} />
                    <span className={`status status--${n.status}`}>
                      {STATUS_LABELS[n.status]}
                    </span>
                  </div>
                  <p className="card__title">{n.title}</p>
                  <p className="card__meta">
                    PR #{n.prNumber}
                    {n.generatedBy === "pull-request" ? (
                      <span className="card__raw">From PR text</span>
                    ) : (
                      <span className="card__ai">AI-written</span>
                    )}
                  </p>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="list__empty">
                {notes.length === 0
                  ? "No release notes yet. Import a merged pull request above to create one."
                  : "Nothing with this status."}
              </li>
            )}
          </ul>
        </section>

        <section className="editor">
          {!selected || !draft ? (
            <p className="editor__empty">
              {notes.length === 0
                ? "Import a pull request to get started."
                : "Select a release note to review it."}
            </p>
          ) : (
            <>
              <div className="editor__head">
                <div className="tabs tabs--pill">
                  <button
                    type="button"
                    className={`tab ${tab === "edit" ? "is-active" : ""}`}
                    onClick={() => setTab("edit")}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`tab ${tab === "preview" ? "is-active" : ""}`}
                    onClick={() => setTab("preview")}
                  >
                    Email preview
                  </button>
                  {selected.status === "sent" && (
                    <button
                      type="button"
                      className={`tab ${tab === "sent" ? "is-active" : ""}`}
                      onClick={() => setTab("sent")}
                    >
                      Delivered
                    </button>
                  )}
                </div>
                <a href={selected.prUrl} target="_blank" rel="noreferrer" className="editor__pr">
                  {selected.prRepo ? `${selected.prRepo}#${selected.prNumber}` : `PR #${selected.prNumber}`} ↗
                </a>
              </div>

              {selected.templateEmpty && (
                <p className="notice notice--warn">
                  This PR merged with the release-note template untouched — no Type, no
                  “What changed”, no paths.{" "}
                  {selected.uiLabels?.length
                    ? `So this was read from the diff instead, which adds: ${selected.uiLabels.join(", ")}. Confirm the wording and the paths below.`
                    : "Nothing in the body or the diff described user-facing change, so write the summary and paths below."}
                </p>
              )}

              {!selected.templateEmpty && selected.generatedBy === "pull-request" && (
                <p className="notice notice--warn">
                  Written from the pull request text, not by Claude —{" "}
                  {selected.modelError}
                  <br />
                  The wording below is lifted from the PR, so read it as the user will
                  before sending.
                </p>
              )}

              {locked && (
                <p className="notice">
                  Sent {new Date(selected.sentAt).toLocaleString()} — no longer editable.
                </p>
              )}

              {tab === "sent" ? (
                <div className="delivered">
                  {!sentEmail ? (
                    <p className="hint">
                      This note was marked sent in the seed data, so there's no delivery
                      record. Send one from the dashboard to see the real thing here.
                    </p>
                  ) : (
                    <>
                      <div className="delivered__stats">
                        <div>
                          <strong>{sentEmail.personalizations.length}</strong>
                          <span>recipients</span>
                        </div>
                        <div>
                          <strong>{sentEmail.sendGridCalls}</strong>
                          <span>SendGrid call{sentEmail.sendGridCalls === 1 ? "" : "s"}</span>
                        </div>
                        <div>
                          <strong>{new Date(sentEmail.sentAt).toLocaleString()}</strong>
                          <span>delivered</span>
                        </div>
                      </div>

                      <p className="field__label">Personalizations</p>
                      <ul className="delivered__list">
                        {sentEmail.personalizations.map((p) => (
                          <li key={p.to}>
                            <strong>{p.name}</strong>
                            <span>{p.to}</span>
                            <span className="delivered__paths">
                              {p.visiblePaths.length
                                ? p.visiblePaths.join(", ")
                                : "all areas"}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <p className="field__label">What landed in their inbox</p>
                      <iframe
                        className="preview__frame"
                        title="Delivered email"
                        srcDoc={sentEmail.html}
                        sandbox=""
                      />
                    </>
                  )}
                </div>
              ) : tab === "preview" ? (
                <EmailPreview
                  notes={[previewNote]}
                  recipientName={audience?.recipients?.[0]?.name ?? user.name}
                  releaseDate={selected.sentAt ?? new Date()}
                />
              ) : (
                <div className="form">
                  <label>
                    Title
                    <input
                      value={draft.title}
                      disabled={locked}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </label>

                  <label>
                    Summary
                    <textarea
                      rows={3}
                      value={draft.summary}
                      disabled={locked}
                      onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                    />
                  </label>

                  <label>
                    Type
                    <select
                      value={draft.type}
                      disabled={locked}
                      onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    >
                      {TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="field">
                    <span className="field__label">Path(s) in app</span>
                    <PathsInput
                      value={draft.paths}
                      disabled={locked}
                      onChange={(paths) => setDraft({ ...draft, paths })}
                    />
                    {draft.paths.length > 0 && !destinationFor({ paths: draft.paths }) && (
                      <p className="hint hint--warn">
                        None of these paths map to a screen in the app, so no in-app
                        notification will be created — there would be nowhere for
                        “Check it out” to go. The email still sends.
                      </p>
                    )}
                    <p className="hint">
                      {selected.pathsFromTemplate
                        ? "Taken verbatim from the PR's \u201cPath(s) in app\u201d section."
                        : "The PR didn't list paths, so these were inferred — check them before sending."}
                    </p>
                  </div>

                  {selected.rawWhatChanged && (
                    <details className="raw">
                      <summary>What the PR actually said</summary>
                      <p>{selected.rawWhatChanged}</p>
                    </details>
                  )}

                  {selected.changedFiles?.length > 0 && (
                    <details className="raw">
                      <summary>
                        Files this PR changed ({selected.changedFiles.length})
                      </summary>
                      <ul className="files">
                        {selected.changedFiles.map((f) => (
                          <li key={f.filename}>
                            <span className={`files__status files__status--${f.status}`}>
                              {f.status}
                            </span>
                            <code>{f.filename}</code>
                            <span className="files__count">
                              +{f.additions} −{f.deletions}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {audience && (
                    <div className="audience">
                      <p className="field__label">
                        Goes to {audience.recipients.length} agent
                        {audience.recipients.length === 1 ? "" : "s"}
                      </p>
                      <ul>
                        {audience.recipients.map((r) => (
                          <li key={r.id}>
                            <strong>{r.name}</strong>
                            <span>
                              {r.visiblePaths.length
                                ? `sees ${r.visiblePaths.join(", ")}`
                                : "sees all areas"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {audience.excluded.length > 0 && (
                        <p className="audience__excluded">
                          Not sent to {audience.excluded.map((e) => e.name).join(", ")} — no
                          permission for these paths.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {status.error && <p className="alert alert--error">{status.error}</p>}
              {status.flash && <p className="alert alert--ok">{status.flash}</p>}

              {!locked && (
                <div className="editor__actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={!dirty || status.busy}
                    onClick={() => save()}
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={status.busy}
                    onClick={approveAndSend}
                  >
                    {status.busy ? "Sending…" : "Approve & Send"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

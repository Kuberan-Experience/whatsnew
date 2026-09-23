import { useMemo } from "react";
import { renderReleaseNoteEmail } from "../email/releaseNoteEmail.js";

/**
 * Renders the real email HTML in a sandboxed iframe, so what the admin reviews
 * is the same markup that would be mailed — not a React approximation of it.
 */
export default function EmailPreview({ notes, recipientName, releaseDate }) {
  const { subject, html } = useMemo(
    () => renderReleaseNoteEmail({ notes, recipientName, releaseDate }),
    [notes, recipientName, releaseDate]
  );

  return (
    <div className="preview">
      <div className="preview__meta">
        <span className="preview__label">Subject</span>
        <span className="preview__subject">{subject}</span>
      </div>
      <iframe
        className="preview__frame"
        title="Email preview"
        srcDoc={html}
        sandbox=""
      />
    </div>
  );
}

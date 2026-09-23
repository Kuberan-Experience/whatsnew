/**
 * Marks a control that a released change introduced.
 *
 * The badge only appears when a release note naming this component has been
 * sent AND this user was in its audience — so it is the same permission
 * decision as the email and the bell, not a second opinion.
 */
export default function NewBadge({ highlight }) {
  if (!highlight) return null;

  const when = highlight.sentAt
    ? new Date(highlight.sentAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <span
      className="newBadge"
      title={`${highlight.title}\n\n${highlight.summary}${when ? `\n\nReleased ${when}` : ""}`}
    >
      New
    </span>
  );
}

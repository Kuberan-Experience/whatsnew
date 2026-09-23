/**
 * Permission model: an agent's `permissions` is a list of nav-path prefixes
 * written the same way the PR template writes them, e.g.
 *
 *   ["Settings", "Reports > Payouts", "*"]
 *
 * A permission grants a release-note path when the permission's segments are a
 * prefix of the path's segments. So "Settings" grants "Settings > Profile",
 * but "Settings > Profile" does NOT grant the broader "Settings" — a narrow
 * grant should not imply visibility into the whole area above it.
 *
 * "*" is a wildcard granting every path.
 */

const WILDCARD = "*";

/** "Settings  >  Profile " -> ["settings", "profile"] */
export function segmentsOf(pathLabel) {
  return String(pathLabel ?? "")
    .split(">")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Display-normalised form, used when persisting so paths dedupe cleanly. */
export function normalizePathLabel(pathLabel) {
  return String(pathLabel ?? "")
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" > ");
}

/** Does a single permission grant a single path? */
export function permissionGrantsPath(permission, pathLabel) {
  if (permission === WILDCARD) return true;

  const perm = segmentsOf(permission);
  const path = segmentsOf(pathLabel);
  if (perm.length === 0 || path.length === 0) return false;
  if (perm.length > path.length) return false;

  return perm.every((seg, i) => seg === path[i]);
}

/** Can this user see a release note that touches `pathLabel`? */
export function canAccessPath(permissions, pathLabel) {
  return (permissions ?? []).some((p) => permissionGrantsPath(p, pathLabel));
}

/**
 * Recipients for a release note.
 *
 * A note with no paths is treated as app-wide and goes to every agent — that is
 * how the PR template tells us "this affects everything". A note with paths
 * goes to agents who can reach at least one of them.
 */
export function selectRecipients(users, pathLabels) {
  const labels = (pathLabels ?? []).filter(Boolean);
  if (labels.length === 0) return [...users];

  return users.filter((u) =>
    labels.some((label) => canAccessPath(u.permissions, label))
  );
}

/** The subset of a note's paths a given user is actually allowed to see. */
export function visiblePathsFor(user, pathLabels) {
  return (pathLabels ?? []).filter((label) =>
    canAccessPath(user.permissions, label)
  );
}

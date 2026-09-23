/**
 * Permission model: an agent's `permissions` is a list of nav-path prefixes
 * written the same way the nav writes them, e.g.
 *
 *   ["Command Center", "Account Center > Billing", "*"]
 *
 * A permission grants a path when its segments are a prefix of the path's
 * segments. So "Account Center" grants "Account Center > Billing > Invoices",
 * but "Account Center > Billing" does not grant the broader "Account Center" —
 * a narrow grant shouldn't imply visibility into the whole area above it.
 *
 * "*" is a wildcard granting everything.
 */

const WILDCARD = "*";

export function segmentsOf(pathLabel) {
  return String(pathLabel ?? "")
    .split(">")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizePathLabel(pathLabel) {
  return String(pathLabel ?? "")
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" > ");
}

export function permissionGrantsPath(permission, pathLabel) {
  if (permission === WILDCARD) return true;

  const perm = segmentsOf(permission);
  const path = segmentsOf(pathLabel);
  if (!perm.length || !path.length || perm.length > path.length) return false;

  return perm.every((seg, i) => seg === path[i]);
}

export function canAccessPath(permissions, pathLabel) {
  return (permissions ?? []).some((p) => permissionGrantsPath(p, pathLabel));
}

/**
 * Recipients for a note. A note with no paths is app-wide and goes to every
 * agent — that's how the PR template says "this affects everything".
 */
export function selectRecipients(users, pathLabels) {
  const labels = (pathLabels ?? []).filter(Boolean);
  const agents = users.filter((u) => u.role === "agent");
  if (!labels.length) return agents;
  return agents.filter((u) => labels.some((l) => canAccessPath(u.permissions, l)));
}

/** The subset of a note's paths a given user may actually see. */
export function visiblePathsFor(user, pathLabels) {
  return (pathLabels ?? []).filter((l) => canAccessPath(user.permissions, l));
}

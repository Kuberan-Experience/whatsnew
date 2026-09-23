/**
 * "Check it out" — taking an agent from a notification to the actual control.
 *
 * Deliberately catalog-free. Nothing here lists the app's fields. A release
 * note carries the nav path (where) and the labels the PR's diff introduced
 * (what), and the target is resolved by looking at the live DOM: find the
 * <label> whose text matches, then the control it points at. Any field with a
 * properly associated label is reachable without being registered anywhere.
 */

/** Which route renders a given nav path. Routes are local by nature. */
export function routeForPath(pathLabel) {
  const segments = String(pathLabel ?? "")
    .split(">")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Only the Profile screen is built out; everything else has no page to open.
  if (segments.includes("profile")) return "/profile";
  return null;
}

/** The first destination a note can actually open, or null. */
export function destinationFor(releaseNote) {
  for (const path of releaseNote?.paths ?? []) {
    const route = routeForPath(path);
    if (route) return { route, path };
  }
  return null;
}

/**
 * Navigate to the control a release note describes. The destination page reads
 * `releaseTarget` from router state and reveals the field itself, so callers
 * need to know nothing about how any screen is built.
 *
 * @returns {boolean} false when the note has no screen to open.
 */
export function goToRelease(navigate, releaseNote) {
  const dest = destinationFor(releaseNote);
  if (!dest) return false;

  navigate(dest.route, {
    state: {
      releaseTarget: {
        noteId: releaseNote.id,
        labels: releaseNote.uiLabels ?? [],
        path: dest.path,
        // A timestamp, so clicking the same CTA twice re-runs the reveal.
        at: Date.now(),
      },
    },
  });
  return true;
}

const normalise = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/[*•:]/g, "")
    .trim()
    .toLowerCase();

/**
 * Find the control a label names, by reading the DOM.
 *
 * Order matters: an explicit label/control association is the strongest
 * signal, so it is tried before anything heuristic.
 */
export function findControlByLabel(labelText) {
  const target = normalise(labelText);
  if (!target) return null;

  for (const label of document.querySelectorAll("label")) {
    const text = normalise(label.textContent);
    // startsWith, because a label may carry a required marker or badge after it.
    if (!text || (text !== target && !text.startsWith(target))) continue;

    const forId = label.getAttribute("for");
    if (forId) {
      const el = document.getElementById(forId);
      if (el) return el;
    }
    const nested = label.querySelector("input, select, textarea");
    if (nested) return nested;
    // A styled label sitting above its control.
    const sibling = label.parentElement?.querySelector(
      "input, select, textarea",
    );
    if (sibling) return sibling;
    return label;
  }

  // Fall back to a matching id, e.g. "Personal Website" -> #profile-personal-website
  const slug = target.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    document.getElementById(slug) ||
    document.querySelector(`[id$="-${slug}"]`) ||
    document.querySelector(`[data-release-label="${slug}"]`)
  );
}

/** Scroll a control into view and flash it for a few seconds. */
export function flashElement(el, { ms = 3000 } = {}) {
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("is-flashing");
  // Focusing a form control makes the destination obvious to keyboard and
  // screen-reader users, not just to people who can see the outline.
  if (typeof el.focus === "function") {
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* not focusable */
    }
  }
  window.setTimeout(() => el.classList.remove("is-flashing"), ms);
  return true;
}

/**
 * Poll for the control, because the page it lives on may still be rendering
 * (or may need to switch into edit mode) when we arrive.
 */
export function revealWhenReady(labelText, { timeout = 2500 } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const el = findControlByLabel(labelText);
      if (el) return resolve(flashElement(el));
      if (Date.now() - started > timeout) return resolve(false);
      window.setTimeout(attempt, 120);
    };
    attempt();
  });
}

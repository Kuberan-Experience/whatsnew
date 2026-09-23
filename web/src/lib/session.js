/**
 * The API token issued by /api/auth/login.
 *
 * Kept in localStorage so a refresh doesn't sign you out, and mirrored in
 * memory so a blocked-storage browser still works for the session.
 */
const KEY = "whatsnew.token.v1";
let cached = null;

export function getToken() {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export function setToken(token) {
  cached = token;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode — memory only */
  }
}

export function clearToken() {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Authorization header for calls the server protects. */
export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

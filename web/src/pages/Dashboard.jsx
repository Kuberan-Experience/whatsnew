import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/store.js";
import { goToRelease } from "../lib/deepLink.js";
import TypeBadge from "../components/TypeBadge.jsx";

/**
 * The agent's landing page.
 *
 * "What's new" leads, because a release an agent hasn't seen is the one thing
 * on this screen that is actually new — the rest of the product is where they
 * already know to look.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listNotifications(user.id)
      .then((r) => setItems(r.notifications))
      .finally(() => setLoading(false));
  }, [user.id]);

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="dash">
      <header className="dash__head">
        <h1>Welcome back, {user.name.split(" ")[0]}</h1>
        <p>
          {user.permissions.includes("*")
            ? "You have access to every area of the app."
            : `Your areas: ${user.permissions.join(", ")}.`}
        </p>
      </header>

      <section className="dash__panel">
        <div className="dash__panelHead">
          <h2>What's new</h2>
          {unread > 0 && <span className="dash__unread">{unread} unread</span>}
        </div>

        {loading && <p className="dash__empty">Loading…</p>}

        {!loading && items.length === 0 && (
          <p className="dash__empty">
            Nothing yet. When a release lands in an area you can access, it shows up
            here and in the bell.
          </p>
        )}

        <ul className="dash__list">
          {items.map((n) => (
            <li key={n.id} className={`dash__item ${n.read ? "" : "is-unread"}`}>
              <div className="dash__itemTop">
                <TypeBadge type={n.releaseNote.type} />
                <time>
                  {new Date(n.releaseNote.sentAt ?? n.createdAt).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" }
                  )}
                </time>
              </div>

              <h3>{n.releaseNote.title}</h3>
              <p>{n.releaseNote.summary}</p>

              <div className="dash__itemFoot">
                <div className="dash__paths">
                  {n.releaseNote.paths.map((p) => (
                    <span key={p} className="chip chip--static">
                      {p}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => goToRelease(navigate, n.releaseNote)}
                >
                  Check it out →
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="dash__cards">
        <Link to="/profile" className="dash__card">
          <h3>Profile</h3>
          <p>Business details, categories and services shown on your public profile.</p>
          <span className="dash__cardLink">Open profile →</span>
        </Link>

        {/* Not built out — shown so the dashboard reflects the real nav. */}
        {["Search Ranking", "Insights", "Billing"].map((label) => (
          <div key={label} className="dash__card dash__card--soon">
            <h3>{label}</h3>
            <p>Coming soon.</p>
          </div>
        ))}
      </section>
    </div>
  );
}

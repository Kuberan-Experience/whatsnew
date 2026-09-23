import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/store.js";
import { NAV_TREE } from "../mock/data.js";
import NotificationBell from "./NotificationBell.jsx";

/**
 * Two different shells, because the two roles are doing unrelated jobs.
 *
 * An admin is here to turn pull requests into release notes — the product nav
 * would be scenery they never click. An agent is here to use the product, and
 * the release notes reach them through the bell.
 */
export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  if (user.role === "admin") return <AdminShell user={user} logout={logout} children={children} />;
  return <AgentShell user={user} logout={logout} pathname={pathname} children={children} />;
}

function AdminShell({ user, logout, children }) {
  return (
    <div className="adminShell">
      <header className="adminShell__bar">
        <div className="adminShell__brand">
          e<span>X</span>perience.com
          <span className="adminShell__tag">Release Notes</span>
        </div>
        <div className="topbar__right">
          <div className="topbar__user">
            <span className="avatar">{user.name.charAt(0)}</span>
            <div className="topbar__userText">
              <span className="topbar__viewing">Signed in as</span>
              <strong>{user.name}</strong>
            </div>
          </div>
          <button type="button" className="topbar__ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

function AgentShell({ user, logout, pathname, children }) {
  const onProfile = pathname.startsWith("/profile") || pathname === "/";

  // Nav items whose controls carry a "New" badge get a dot, so an agent can
  // find what the release note was talking about without hunting for it.
  const [highlights, setHighlights] = useState({});
  useEffect(() => {
    api.listHighlights(user.id).then(setHighlights).catch(() => setHighlights({}));
  }, [user.id, pathname]);

  const profileNew = Object.keys(highlights).filter((k) => k.startsWith("profile.")).length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          e<span>X</span>perience.com
        </div>

        <div className="sidebar__onboarding">
          <span>Complete Onboarding</span>
          <span className="sidebar__pill">5/12</span>
        </div>

        <span className="sidebar__link sidebar__link--static">Home</span>

        {NAV_TREE.map((group) => (
          <div key={group.group} className="sidebar__group">
            <p className="sidebar__groupLabel">{group.group}</p>
            {group.items.map((item) =>
              item.label === "Profile" ? (
                <Link
                  key={item.label}
                  to="/profile"
                  className={`sidebar__link ${onProfile ? "is-active" : ""}`}
                >
                  {item.label}
                  {profileNew > 0 && <span className="sidebar__new">{profileNew}</span>}
                </Link>
              ) : (
                <span key={item.label} className="sidebar__link sidebar__link--static">
                  {item.label}
                </span>
              )
            )}
          </div>
        ))}
      </aside>

      <div className="main">
        <header className="topbar">
          <nav className="crumbs">
            <span>Hierarchy</span>
            <span className="crumbs__sep">›</span>
            <strong>Preview Profile</strong>
          </nav>

          <div className="topbar__right">
            <button type="button" className="topbar__ghost">
              Help
            </button>
            <NotificationBell />
            <div className="topbar__user">
              <span className="avatar">{user.name.charAt(0)}</span>
              <div className="topbar__userText">
                <span className="topbar__viewing">Viewing as</span>
                <strong>{user.name}</strong>
              </div>
            </div>
            <button type="button" className="topbar__ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

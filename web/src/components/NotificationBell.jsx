import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/store.js";
import TypeBadge from "./TypeBadge.jsx";

// How often the bell re-checks for new notifications. Polling, not websockets:
// release notes arrive a few times a week, so a 30s poll is the right amount
// of machinery for the problem.
const POLL_MS = 30_000;

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { notifications, unreadCount } = await api.listNotifications(user.id);
    setItems(notifications);
    setUnread(unreadCount);
  }, [user]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Close on outside click and on Escape — a dropdown that traps the page is
  // worse than no dropdown.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    await refresh();
    // Opening the dropdown is the read receipt. The badge clears immediately
    // while the request is in flight, then the refresh confirms it.
    if (unread > 0) {
      setUnread(0);
      await api.markAllRead(user.id);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }

  return (
    <div className="bell" ref={wrapRef}>
      <button
        type="button"
        className="bell__button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && <span className="bell__dot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="bell__panel" role="dialog" aria-label="Notifications">
          <header className="bell__head">
            <strong>What's new</strong>
            <span className="bell__count">{items.length}</span>
          </header>

          {items.length === 0 ? (
            <p className="bell__empty">
              Nothing yet. New releases for your areas will show up here.
            </p>
          ) : (
            <ul className="bell__list">
              {items.map((n) => (
                <li key={n.id} className={n.read ? "bell__item" : "bell__item is-unread"}>
                  <div className="bell__itemTop">
                    <TypeBadge type={n.releaseNote.type} />
                    <time className="bell__time">{timeAgo(n.createdAt)}</time>
                  </div>
                  <p className="bell__title">{n.releaseNote.title}</p>
                  <p className="bell__summary">{n.releaseNote.summary}</p>
                  {n.releaseNote.paths.length > 0 && (
                    <ul className="bell__paths">
                      {n.releaseNote.paths.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth.jsx";
import AppShell from "./components/AppShell.jsx";
import Login from "./pages/Login.jsx";
import AdminReleaseNotes from "./pages/AdminReleaseNotes.jsx";
import Profile from "./pages/Profile.jsx";
import Dashboard from "./pages/Dashboard.jsx";

function Protected({ adminOnly = false, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="route-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  // An admin has one job here; the product pages aren't part of it.
  if (!adminOnly && user.role === "admin") return <Navigate to="/admin/release-notes" replace />;

  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { user } = useAuth();
  const home = user?.role === "admin" ? "/admin/release-notes" : "/dashboard";

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <Profile />
          </Protected>
        }
      />
      <Route
        path="/admin/release-notes"
        element={
          <Protected adminOnly>
            <AdminReleaseNotes />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

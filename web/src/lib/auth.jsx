import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./store.js";

const SESSION_KEY = "whatsnew.session.v1";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` covers the initial session restore, so protected routes don't
  // bounce to /login for a frame before we know who's signed in.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    api
      .me(id)
      .then(setUser)
      .catch(() => localStorage.removeItem(SESSION_KEY))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      async login(email, password) {
        const u = await api.login(email, password);
        localStorage.setItem(SESSION_KEY, u.id);
        setUser(u);
        return u;
      },
      logout() {
        localStorage.removeItem(SESSION_KEY);
        api.logout();
        setUser(null);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

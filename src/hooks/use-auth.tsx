"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isBrowser } from "@/lib/storage/safe-storage";
import { setCloudUserId } from "@/lib/sync/local-snapshot";
import { clearLocalUserData } from "@/lib/user-data-reset";

export type AuthUser = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  authConfigured: boolean;
  databaseConfigured: boolean;
  requireAuth: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [databaseConfigured, setDatabaseConfigured] = useState(false);
  const [requireAuth, setRequireAuth] = useState(false);

  const refresh = useCallback(async () => {
    if (!isBrowser()) return;
    try {
      const res = await fetch("/api/v1/auth/me", { credentials: "include" });
      const data = (await res.json()) as {
        user: AuthUser | null;
        authConfigured?: boolean;
        databaseConfigured?: boolean;
        requireAuth?: boolean;
      };
      setUser(data.user);
      setAuthConfigured(Boolean(data.authConfigured));
      setDatabaseConfigured(Boolean(data.databaseConfigured));
      setRequireAuth(Boolean(data.requireAuth));
      if (data.user?.userId) {
        setCloudUserId(data.user.userId);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    setUser(null);
    // Full local wipe so the next account never inherits progress
    clearLocalUserData();
    setCloudUserId("");
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authConfigured,
      databaseConfigured,
      requireAuth,
      refresh,
      logout,
    }),
    [
      user,
      loading,
      authConfigured,
      databaseConfigured,
      requireAuth,
      refresh,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      loading: false,
      authConfigured: false,
      databaseConfigured: false,
      requireAuth: false,
      refresh: async () => {},
      logout: async () => {},
    };
  }
  return ctx;
}

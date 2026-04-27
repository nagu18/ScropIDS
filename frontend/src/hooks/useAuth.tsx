import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, clearActiveOrgSlug, errorMessage, getActiveOrgSlug, setActiveOrgSlug } from "@/lib/api";
import type { AuthMe } from "@/types/api";

type AuthContextValue = {
  me: AuthMe | null;
  loading: boolean;
  isAuthenticated: boolean;
  activeOrgSlug: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (payload: { username: string; password: string; organizationName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  switchOrg: (slug: string) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrgSlug, setOrgSlug] = useState<string | null>(getActiveOrgSlug());

  const refreshMe = async () => {
    try {
      const response = await api.get<AuthMe>("/auth/me/");
      const payload = response.data;
      setMe(payload);
      if (!activeOrgSlug && payload.organizations.length > 0) {
        const first = payload.organizations[0].slug;
        setActiveOrgSlug(first);
        setOrgSlug(first);
      }
      if (activeOrgSlug && !payload.organizations.some((org) => org.slug === activeOrgSlug)) {
        const fallback = payload.organizations[0]?.slug ?? null;
        if (fallback) {
          setActiveOrgSlug(fallback);
        } else {
          clearActiveOrgSlug();
        }
        setOrgSlug(fallback);
      }
    } catch {
      setMe(null);
      clearActiveOrgSlug();
      setOrgSlug(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username: string, password: string) => {
    await api.get("/auth/csrf/");
    await api.post("/auth/login/", { username, password });
    await refreshMe();
  };

  const register = async (payload: { username: string; password: string; organizationName: string }) => {
    await api.get("/auth/csrf/");
    await api.post("/auth/register/", {
      username: payload.username,
      password: payload.password,
      organization_name: payload.organizationName,
    });
    await refreshMe();
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout/");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setMe(null);
      clearActiveOrgSlug();
      setOrgSlug(null);
    }
  };

  const switchOrg = (slug: string) => {
    setActiveOrgSlug(slug);
    setOrgSlug(slug);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading,
      isAuthenticated: !!me,
      activeOrgSlug,
      login,
      register,
      logout,
      refreshMe,
      switchOrg,
    }),
    [me, loading, activeOrgSlug]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}

"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthUser {
  username: string;
  role: string;
  token: string;
  picture?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  googleError: string | null;
  login: (username: string, password: string) => Promise<string | null>;
  register: (username: string, password: string) => Promise<string | null>;
  loginWithGoogle: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const persistUser = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem("velora_user", JSON.stringify(u));
  };

  // Restore session from localStorage on mount,
  // and also check if Google just redirected back with a token in the hash.
  useEffect(() => {
    // Check URL hash for Google OAuth callback
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("auth_token=")) {
        const params = new URLSearchParams(hash.slice(1));
        const token    = params.get("auth_token");
        const username = params.get("username");
        const role     = params.get("role");
        const picture  = params.get("picture") ?? undefined;
        if (token && username && role) {
          persistUser({ token, username, role, picture });
          // Clean the hash from the URL
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }
      if (hash.includes("auth_error=")) {
        const params = new URLSearchParams(hash.slice(1));
        const errMsg = decodeURIComponent(params.get("auth_error") ?? "Google sign-in failed");
        setGoogleError(errMsg);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    // Restore from localStorage
    const stored = localStorage.getItem("velora_user");
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  const login = async (username: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Login failed";
      persistUser({ username: data.username, role: data.role, token: data.token });
      return null;
    } catch {
      return "Could not connect to backend";
    }
  };

  const register = async (username: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch("http://localhost:8000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Registration failed";
      return null;
    } catch {
      return "Could not connect to backend";
    }
  };

  const loginWithGoogle = () => {
    // Redirect the browser to the backend, which redirects to Google
    window.location.href = "http://localhost:8000/api/auth/google";
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("velora_user");
  };

  return (
    <AuthContext.Provider value={{ user, googleError, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

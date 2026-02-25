import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AppState } from "react-native";
import { cleanupStalePlayers, updateOnlinePresence } from "../services/friendService";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  refreshSession: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const normalizeAuthError = (error: unknown): Error => {
  if (error instanceof Error) {
    const msg = error.message || "";
    if (
      /failed to fetch/i.test(msg) ||
      /network request failed/i.test(msg) ||
      /load failed/i.test(msg)
    ) {
      return new Error(
        "Khong the ket noi toi Supabase. Kiem tra EXPO_PUBLIC_SUPABASE_URL/ANON_KEY trong .env va ket noi mang."
      );
    }
    return error;
  }
  return new Error("Da xay ra loi khong xac dinh");
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      try {
        const {
          data: { session: s },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
      } catch (error) {
        console.warn("[Auth] getSession failed:", error);

        if (!mounted) return;
        setSession(null);
        setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    void updateOnlinePresence(true);
    void cleanupStalePlayers(45);

    const heartbeat = setInterval(() => {
      if (AppState.currentState === "active") {
        void updateOnlinePresence(true);
      }
      void cleanupStalePlayers(45);
    }, 10000);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void updateOnlinePresence(true);
        void cleanupStalePlayers(45);
      } else {
        void updateOnlinePresence(false);
        void cleanupStalePlayers(5);
      }
    });

    let webCleanup: (() => void) | null = null;
    const canUseWindowEvents =
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function" &&
      typeof window.removeEventListener === "function";
    const canUseDocumentEvents =
      typeof document !== "undefined" &&
      typeof document.addEventListener === "function" &&
      typeof document.removeEventListener === "function";

    if (canUseWindowEvents) {
      const onBeforeUnload = () => {
        void updateOnlinePresence(false);
        void cleanupStalePlayers(5);
      };

      const onVisibilityChange = () => {
        if (!canUseDocumentEvents) return;
        if (document.visibilityState === "hidden") {
          void updateOnlinePresence(false);
          void cleanupStalePlayers(5);
        } else {
          void updateOnlinePresence(true);
          void cleanupStalePlayers(45);
        }
      };

      window.addEventListener("beforeunload", onBeforeUnload);
      window.addEventListener("pagehide", onBeforeUnload);
      if (canUseDocumentEvents) {
        document.addEventListener("visibilitychange", onVisibilityChange);
      }

      webCleanup = () => {
        window.removeEventListener("beforeunload", onBeforeUnload);
        window.removeEventListener("pagehide", onBeforeUnload);
        if (canUseDocumentEvents) {
          document.removeEventListener("visibilitychange", onVisibilityChange);
        }
      };
    }

    return () => {
      clearInterval(heartbeat);
      sub.remove();
      webCleanup?.();
      void updateOnlinePresence(false);
    };
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    } catch (error) {
      return { error: normalizeAuthError(error) };
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: displayName ? { display_name: displayName } : undefined,
        },
      });
      if (error) return { error: error as Error };
      return { error: null };
    } catch (error) {
      return { error: normalizeAuthError(error) };
    }
  };

  const signOut = async () => {
    if (user) {
      await updateOnlinePresence(false);
    }
    await supabase.auth.signOut();
  };

  const refreshSession = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
    } catch (error) {
      console.warn("[Auth] refreshSession failed:", error);
      setSession(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, signOut, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

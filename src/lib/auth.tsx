import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";

type Ctx = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>({ user: null, profile: null, loading: true, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (u: User | null) => {
    if (!u) return setProfile(null);
    const { data } = await supabase.from("profiles").select("*").eq("id", u.id).maybeSingle();
    if (data) return setProfile(data);
    // Profile missing (e.g. signup needed email confirmation) — create from metadata
    const m = u.user_metadata ?? {};
    const row = { id: u.id, email: u.email, full_name: m.full_name ?? "", phone_number: m.phone_number ?? "", faculty: m.faculty ?? "", avatar_url: null };
    await supabase.from("profiles").upsert(row);
    setProfile(row as Profile);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setTimeout(() => loadProfile(session?.user ?? null), 0);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setUser(data.session?.user ?? null);
      await loadProfile(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthCtx.Provider value={{ user, profile, loading, refreshProfile: () => loadProfile(user) }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

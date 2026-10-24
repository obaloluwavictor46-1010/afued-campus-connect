import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Home, ShoppingBag, User, Loader2, MessageCircle, Megaphone, Shield, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { startPresence } from "@/lib/presence";
import { supabase } from "@/lib/supabase";

export function AppShell({ children, title, bare }: { children: ReactNode; title?: string; bare?: boolean }) {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  // 🔴 CHAT UNREAD COUNT - for Bottom Nav red dot
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);
  useEffect(() => { if (user) startPresence(user.id); }, [user]);

  // 🔴 Load unread messages + live update
  useEffect(() => {
    if (!user) return;
    const loadUnread = async () => {
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .is("read_at", null);
      if (!error) setChatUnread(count ?? 0);
    };
    loadUnread();
    const ch = supabase
      .channel("appshell-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadUnread)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (loading || !user)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  if (bare) return <div className="mx-auto min-h-screen max-w-xl">{children}</div>;

  const item = "relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground";
  return (
    <div className="mx-auto min-h-screen max-w-xl pb-20">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          <span className="text-primary">AFUED</span> {title ?? "Community"}
        </h1>
        {profile?.is_admin && (
          <Link to="/admin" className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
            <Shield className="h-4 w-4" /> Admin
          </Link>
        )}
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card">
        <div className="mx-auto flex max-w-xl">
          <Link to="/" className={item} activeProps={{ className: "!text-primary" }} activeOptions={{ exact: true }}>
            <Home className="h-6 w-6" /> Feed
          </Link>
          <Link to="/meet-people" className={item} activeProps={{ className: "!text-primary" }}>
            <Users className="h-6 w-6" /> Meet People
          </Link>
          <Link to="/announcements" className={item} activeProps={{ className: "!text-primary" }}>
            <Megaphone className="h-6 w-6" /> News
          </Link>
          {/* 🔴 CHAT WITH RED DOT */}
          <Link to="/chat" className={item} activeProps={{ className: "!text-primary" }}>
            <span className="relative">
              <MessageCircle className="h-6 w-6" />
              {chatUnread > 0 && (
                <span className="absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white shadow ring-2 ring-white animate-pulse">
                  {chatUnread > 99 ? "99+" : chatUnread}
                </span>
              )}
            </span>
            Chat
          </Link>
          <Link to="/marketplace" className={item} activeProps={{ className: "!text-primary" }}>
            <ShoppingBag className="h-6 w-6" /> Market
          </Link>
          <Link to="/profile" className={item} activeProps={{ className: "!text-primary" }}>
            <User className="h-6 w-6" /> Profile
          </Link>
        </div>
      </nav>
    </div>
  );
}

export function Avatar({ url, name, size = 40, online }: { url?: string | null | undefined; name?: string | null | undefined; size?: number; online?: boolean }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name ?? ""} style={{ width: size, height: size }} className="rounded-full object-cover ring-2 ring-primary/20" />
      ) : (
        <div style={{ width: size, height: size, fontSize: size / 2.6 }} className="flex items-center justify-center rounded-full bg-gradient-brand font-bold text-primary-foreground">
          {initials}
        </div>
      )}
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-online" />}
    </div>
  );
    }

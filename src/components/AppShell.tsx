import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Home, ShoppingBag, User, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  const item = "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-muted-foreground";
  return (
    <div className="mx-auto min-h-screen max-w-xl pb-20">
      <header className="sticky top-0 z-30 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          <span className="text-primary">AFUED</span> {title ?? "Community"}
        </h1>
      </header>
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card">
        <div className="mx-auto flex max-w-xl">
          <Link to="/" className={item} activeProps={{ className: "!text-primary" }} activeOptions={{ exact: true }}>
            <Home className="h-6 w-6" /> Feed
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

export function Avatar({ url, name, size = 40 }: { url?: string | null | undefined; name?: string | null | undefined; size?: number }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return url ? (
    <img src={url} alt={name ?? ""} style={{ width: size, height: size }} className="rounded-full object-cover ring-2 ring-primary/20" />
  ) : (
    <div style={{ width: size, height: size, fontSize: size / 2.6 }} className="flex items-center justify-center rounded-full bg-gradient-brand font-bold text-primary-foreground">
      {initials}
    </div>
  );
}

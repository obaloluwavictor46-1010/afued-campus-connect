import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Two passwords no match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password don change! Login with new password now.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-card p-6 rounded-3xl text-center shadow-elevated">
          <h2 className="font-bold text-lg">You never login</h2>
          <p className="text-sm text-muted-foreground mt-1">Press that Gmail link again to enter account, then come back here.</p>
          <button onClick={() => navigate({ to: "/auth" })} className="mt-4 bg-primary text-primary-foreground px-5 py-2.5 rounded-2xl font-semibold">Go to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero px-4 py-10">
      <div className="mx-auto max-w-md">
        <form onSubmit={save} className="space-y-3 rounded-3xl bg-card p-6 shadow-elevated">
          <div className="text-center">
            <h2 className="text-lg font-bold">🔒 Set New Password</h2>
            <p className="text-sm text-muted-foreground">You dey logged in as {user.email}. Type new password wey you go remember.</p>
          </div>
          <input required type="password" minLength={6} placeholder="New password (min 6)" className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input required type="password" minLength={6} placeholder="Confirm new password" className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button disabled={busy} className="w-full rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? "Saving..." : "Save New Password"}
          </button>
        </form>
      </div>
    </div>
  );
          }

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FACULTIES, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Join AFUED Community — Sign in or sign up" },
      { name: "description", content: "Sign in or create your AFUED Community account to connect with your faculty." },
      { property: "og:title", content: "Join AFUED Community" },
      { property: "og:description", content: "Connect with students across every AFUED faculty." },
    ],
  }),
  component: AuthPage,
});

const field = "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40";

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [f, setF] = useState({ full_name: "", email: "", phone_number: "", password: "", faculty: FACULTIES[0] as string });
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: f.email,
          password: f.password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: f.full_name, phone_number: f.phone_number, faculty: f.faculty } },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("profiles").upsert({ id: data.user.id, full_name: f.full_name, email: f.email, phone_number: f.phone_number, faculty: f.faculty });
        }
        if (!data.session) toast.success("Account created! Check your email to confirm, then log in.");
        else toast.success("Welcome to AFUED Community!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center text-primary-foreground">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-foreground/15 font-display text-2xl font-extrabold backdrop-blur">A</div>
          <h1 className="font-display text-3xl font-extrabold">AFUED Community</h1>
          <p className="mt-1 text-sm opacity-85">Connect, share and trade with fellow students</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-3xl bg-card p-6 shadow-elevated">
          <div className="mb-2 grid grid-cols-2 rounded-2xl bg-muted p-1">
            {(["signup", "login"] as const).map((m) => (
              <button type="button" key={m} onClick={() => setMode(m)} className={`rounded-xl py-2 text-sm font-semibold transition ${mode === m ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>
                {m === "signup" ? "Sign up" : "Log in"}
              </button>
            ))}
          </div>
          {mode === "signup" && (
            <>
              <input required placeholder="Full name" className={field} value={f.full_name} onChange={set("full_name")} />
              <input required type="tel" placeholder="Phone number" className={field} value={f.phone_number} onChange={set("phone_number")} />
            </>
          )}
          <input required type="email" placeholder="Email" className={field} value={f.email} onChange={set("email")} />
          <input required type="password" minLength={6} placeholder="Password" className={field} value={f.password} onChange={set("password")} />
          {mode === "signup" && (
            <select className={field} value={f.faculty} onChange={set("faculty")}>
              {FACULTIES.map((x) => <option key={x}>{x}</option>)}
            </select>
          )}
          <button disabled={busy} className="flex w-full items-center justify-center rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}

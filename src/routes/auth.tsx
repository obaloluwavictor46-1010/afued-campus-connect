import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Eye, EyeOff, MailCheck, AlertCircle, CheckCircle } from "lucide-react";
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
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">("signup");
  const [f, setF] = useState({ full_name: "", email: "", phone_number: "", password: "", faculty: FACULTIES[0] as string });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && mode !== "reset") navigate({ to: "/" });
  }, [user, navigate, mode]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setMode("reset");
      setNotice({ type: "info", text: "Link don open. Type your new password now." });
    }
  }, []);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const resendVerify = async () => {
    if (!f.email.includes("@")) { setNotice({ type: "error", text: "Put your Gmail first" }); return; }
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: f.email.trim().toLowerCase() });
    if (error) setNotice({ type: "error", text: error.message });
    else setNotice({ type: "success", text: "We don send verification link again. Go check Gmail + Spam." });
    setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const cleanEmail = f.email.trim().toLowerCase();

      if (mode === "signup") {
        if (!f.full_name.trim()) throw new Error("Put your full name");
        if (!cleanEmail.includes("@")) throw new Error("Put correct Gmail, e.g name@gmail.com");
        if (f.password.length < 6) throw new Error("Password must be at least 6 characters");

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: f.password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: { full_name: f.full_name, phone_number: f.phone_number, faculty: f.faculty },
          },
        });
        if (error) throw error;

        if (data.user && !data.session) {
          setCheckEmail(true);
          setNotice({ type: "success", text: `We don send verification link to ${cleanEmail}. Go open your Gmail (check Spam / Promotions too), press the link, then come login.` });
          toast.success("Check your Gmail to verify!");
          setMode("login");
          setBusy(false);
          return;
        }

        if (data.user) {
          await supabase.from("profiles").upsert({ id: data.user.id, full_name: f.full_name, email: cleanEmail, phone_number: f.phone_number, faculty: f.faculty });
        }
        toast.success("Welcome to AFUED Community!");
        navigate({ to: "/" });
      }

      else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: f.password });
        if (error) {
          if (error.message.includes("Invalid login credentials")) throw new Error("Wrong email or password. If you never verify your Gmail, go check Gmail for verification link.");
          if (error.message.toLowerCase().includes("email not confirmed") || error.message.toLowerCase().includes("not confirmed")) {
            setCheckEmail(true);
            throw new Error("Your Gmail never verify. Go check Gmail / Spam, press verification link, then login again.");
          }
          throw error;
        }

        const { data: { user: loggedUser } } = await supabase.auth.getUser();
        if (loggedUser && !loggedUser.email_confirmed_at) {
          await supabase.auth.signOut();
          setCheckEmail(true);
          throw new Error("Your Gmail never verify. We don send verification link to your Gmail. Go press am, then login again.");
        }

        toast.success("Welcome back!");
        navigate({ to: "/" });
      }

      else if (mode === "forgot") {
        if (!cleanEmail.includes("@")) throw new Error("Put your Gmail first");
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin + "/auth",
        });
        if (error) throw error;
        setCheckEmail(true);
        setNotice({ type: "success", text: `If ${cleanEmail} dey for our system, we don send reset link go there. Go check Gmail (check Spam too), press link, set new password.` });
        toast.success("Reset link sent! Check Gmail.");
      }

      else if (mode === "reset") {
        if (f.password.length < 6) throw new Error("Password must be at least 6 characters");
        if (f.password !== confirmPassword) throw new Error("Two passwords no match");
        const { error } = await supabase.auth.updateUser({ password: f.password });
        if (error) throw error;
        toast.success("Password don change! Login with new password now.");
        await supabase.auth.signOut();
        setMode("login");
        setF({ ...f, password: "" });
        setConfirmPassword("");
        window.history.replaceState(null, "", "/auth");
      }

    } catch (err) {
      const msg = (err as Error).message;
      setNotice({ type: "error", text: msg });
      toast.error(msg);
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
          {(mode === "login" || mode === "signup") && (
            <div className="mb-2 grid grid-cols-2 rounded-2xl bg-muted p-1">
              {(["signup", "login"] as const).map((m) => (
                <button type="button" key={m} onClick={() => { setMode(m); setNotice(null); setCheckEmail(false); }} className={`rounded-xl py-2 text-sm font-semibold transition ${mode === m ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>
                  {m === "signup" ? "Sign up" : "Log in"}
                </button>
              ))}
            </div>
          )}

          {mode === "forgot" && (
            <div className="text-center">
              <h2 className="text-lg font-bold">Forgot Password?</h2>
              <p className="text-sm text-muted-foreground">No wahala, we go send reset link go your Gmail.</p>
            </div>
          )}
          {mode === "reset" && (
            <div className="text-center">
              <h2 className="text-lg font-bold">🔒 Set New Password</h2>
              <p className="text-sm text-muted-foreground">Type your new password wey you go remember.</p>
            </div>
          )}

          {notice && (
            <div className={`flex gap-2 rounded-2xl p-3 text-[13px] leading-5 ${notice.type === "error" ? "bg-red-50 text-red-700" : notice.type === "success" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
              {notice.type === "error" ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>{notice.text}</span>
            </div>
          )}

          {checkEmail && (mode === "login" || mode === "forgot" || mode === "signup") && (
            <div className="rounded-2xl bg-yellow-50 p-3 text-[13px] leading-5 text-yellow-800">
              <div className="flex gap-1.5 font-semibold"><MailCheck className="h-4 w-4" /> Check your Gmail now!</div>
              If you no see am, check <b>Spam / Promotions</b> folder.
              {mode !== "forgot" && (
                <div><button type="button" onClick={resendVerify} disabled={busy} className="mt-1 font-bold text-blue-600 underline">Resend link again</button></div>
              )}
            </div>
          )}

          {mode === "signup" && (
            <>
              <input required placeholder="Full name" className={field} value={f.full_name} onChange={set("full_name")} />
              <input required type="tel" placeholder="Phone number" className={field} value={f.phone_number} onChange={set("phone_number")} />
            </>
          )}

          {mode !== "reset" && (
            <input required type="email" placeholder="Email" className={field} value={f.email} onChange={set("email")} />
          )}

          {mode !== "forgot" && (
            <div className="relative">
              <input required type={showPass ? "text" : "password"} minLength={6} placeholder={mode === "reset" ? "New password (min 6)" : "Password"} className={field + " pr-11"} value={f.password} onChange={set("password")} />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {mode === "reset" && (
            <div className="relative">
              <input required type={showConfirm ? "text" : "password"} minLength={6} placeholder="Confirm new password" className={field + " pr-11"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {mode === "signup" && (
            <select className={field} value={f.faculty} onChange={set("faculty")}>
              {FACULTIES.map((x) => <option key={x}>{x}</option>)}
            </select>
          )}

          {mode === "login" && (
            <div className="text-right">
              <button type="button" onClick={() => { setMode("forgot"); setNotice(null); setCheckEmail(false); }} className="text-[13px] font-semibold text-primary">Forgot Password?</button>
            </div>
          )}

          <button disabled={busy} className="flex w-full items-center justify-center rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "signup" ? "Create account" : mode === "login" ? "Log in" : mode === "forgot" ? "Send Reset Link" : "Save New Password"}
          </button>

          {(mode === "forgot" || mode === "reset") && (
            <div className="text-center text-sm">
              <button type="button" onClick={() => { setMode("login"); setNotice(null); setCheckEmail(false); window.history.replaceState(null, "", "/auth"); }} className="font-semibold text-primary">Back to Login</button>
            </div>
          )}

          <p className="pt-1 text-center text-[11px] text-muted-foreground">Your Gmail must be real - we go verify am before you enter.</p>
        </form>
      </div>
    </div>
  );
        }

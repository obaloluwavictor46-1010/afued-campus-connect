import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Mail, Phone, Pencil, Shield } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { CommentsSheet } from "@/components/CommentsSheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FACULTIES, supabase, uploadImage, type Post } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Profile — AFUED Community" }] }),
  component: () => <AppShell title="Profile"><ProfilePage /></AppShell>,
});

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setPosts(data ?? []);
      if (data?.length) {
        const { data: cs } = await supabase.from("comments").select("post_id").in("post_id", data.map((p) => p.id));
        const m: Record<string, number> = {};
        (cs ?? []).forEach((c) => (m[c.post_id] = (m[c.post_id] ?? 0) + 1));
        setCounts(m);
      }
    })();
  }, [user]);
  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };
  return (
    <div className="space-y-4 p-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="h-24 bg-gradient-hero" />
        <div className="-mt-12 px-5 pb-5">
          <div className="flex items-end justify-between">
            <div className="rounded-full bg-card p-1"><Avatar url={profile?.avatar_url} name={profile?.full_name} size={88} /></div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Edit</button>
              <button onClick={logout} className="rounded-full border p-2 text-destructive"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
          <h2 className="mt-3 font-display text-2xl font-extrabold">{profile?.full_name || "Student"}</h2>
          {profile?.faculty && <span className="mt-1 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold">{profile.faculty}</span>}
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><Mail className="h-4 w-4" />{profile?.email || user?.email}</p>
            {profile?.phone_number && <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{profile.phone_number}</p>}
          </div>
          <p className="mt-3 text-sm"><b>{posts.length}</b> posts</p>
          {profile?.is_admin && (
            <Link to="/afued-oga-only-2024-x9" className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-black py-3 text-sm font-bold text-white">
              <Shield className="h-4 w-4" /> Admin Panel — Oga Only 🔐
            </Link>
          )}
        </div>
      </div>
      <h3 className="px-1 font-display text-lg font-bold">My posts</h3>
      {posts.length === 0 && <p className="py-6 text-center text-muted-foreground">You haven't posted yet.</p>}
      {posts.map((p) => <PostCard key={p.id} post={p} author={profile ?? undefined} commentCount={counts[p.id] ?? 0} onComments={() => setOpenPost(p.id)} />)}
      <CommentsSheet postId={openPost} onClose={() => setOpenPost(null)} />
      {editing && <EditProfile onClose={() => { setEditing(false); refreshProfile(); }} />}
    </div>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState({ full_name: profile?.full_name ?? "", phone_number: profile?.phone_number ?? "", faculty: profile?.faculty || FACULTIES[0] });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none";
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user) return; setBusy(true);
    try {
      const avatar_url = file ? await uploadImage(file, user.id, "avatars") : profile?.avatar_url ?? null;
      const { error } = await supabase.from("profiles").upsert({ id: user.id, email: user.email, ...f, avatar_url });
      if (error) throw error; toast.success("Profile updated"); onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm font-medium">Photo<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" /></label>
          <input required placeholder="Full name" className={field} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <input placeholder="Phone" className={field} value={f.phone_number} onChange={(e) => setF({ ...f, phone_number: e.target.value })} />
          <select className={field} value={f.faculty} onChange={(e) => setF({ ...f, faculty: e.target.value })}>{FACULTIES.map((x) => <option key={x}>{x}</option>)}</select>
          <button disabled={busy} className="flex w-full justify-center rounded-2xl bg-primary py-3 font-semibold text-primary-foreground">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save"}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
      }

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Mail, Phone, Pencil, Shield, MapPin, GraduationCap, Share2, Camera, Repeat2 } from "lucide-react";
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
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [tab, setTab] = useState<"all" | "photos" | "reels" | "reposts">("all");
  const navigate = useNavigate();
  const p: any = profile;

  // === ADDED: REPOSTS LIKE TIKTOK ===
  const [repostedPosts, setRepostedPosts] = useState<Post[]>([]);
  const [repostCount, setRepostCount] = useState(0);

  const loadReposts = async (uid: string) => {
    const { data: rows, error } = await supabase.from("reposts").select("post_id, created_at").eq("user_id", uid).order("created_at", { ascending: false });
    if (error || !rows || rows.length === 0) {
      setRepostedPosts([]);
      setRepostCount(0);
      return;
    }
    const ids = rows.map((r: any) => r.post_id);
    const { data: rePosts } = await supabase.from("posts").select("*").in("id", ids).order("created_at", { ascending: false });
    // Keep repost order - latest repost first
    const ordered = ids.map((id: string) => (rePosts || []).find((pp: any) => pp.id === id)).filter(Boolean) as Post[];
    setRepostedPosts(ordered);
    setRepostCount(rows.length);
    // Load comment counts for reposted posts too
    if (ordered.length) {
      const { data: cs } = await supabase.from("comments").select("post_id").in("post_id", ordered.map((pp: any) => pp.id));
      const m: Record<string, number> = {};
      (cs ?? []).forEach((c) => (m[c.post_id] = (m[c.post_id] ?? 0) + 1));
      setCounts((prev) => ({ ...prev, ...m }));
    }
  };

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
      const { count: f1 } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id);
      const { count: f2 } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id);
      setFollowersCount(f1 ?? 0);
      setFollowingCount(f2 ?? 0);
      // === ADDED: Load my reposts ===
      await loadReposts(user.id);
    })();
    // === ADDED: Live update when I repost / unrepost from anywhere ===
    const ch = supabase.channel(`my-reposts-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reposts", filter: `user_id=eq.${user.id}` }, () => loadReposts(user.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };

  const shareProfile = async () => {
    const url = `${window.location.origin}/profile`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch {
      toast.success(url);
    }
  };

  // === ADDED: If tab na reposts, show repostedPosts, else show my posts ===
  const listToShow = tab === "reposts" ? repostedPosts : posts;

  const filteredPosts = listToShow.filter((post: any) => {
    if (tab === "all") return true;
    if (tab === "reposts") return true;
    if (tab === "photos") return post.media_url && !post.media_url.includes(".mp4") && !post.media_type?.includes("video");
    if (tab === "reels") return post.media_type?.includes("video") || post.media_url?.includes(".mp4");
    return true;
  });

  return (
    <div className="space-y-4 p-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="relative h-32 sm:h-40 bg-gradient-hero overflow-hidden">
          {p?.cover_url && <img src={p.cover_url} className="h-full w-full object-cover" alt="cover" />}
          <button onClick={() => setEditing(true)} className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
            <Camera className="h-3.5 w-3.5" /> Edit Cover
          </button>
        </div>
        <div className="-mt-12 px-5 pb-5">
          <div className="flex items-end justify-between">
            <div className="rounded-full bg-card p-1"><Avatar url={profile?.avatar_url} name={profile?.full_name} size={88} /></div>
            <div className="flex gap-2">
              <button onClick={shareProfile} className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold"><Share2 className="h-4 w-4" /> Share</button>
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Edit</button>
              <button onClick={logout} className="rounded-full border p-2 text-destructive"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/change-password" })}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-yellow-100 py-3 text-sm font-bold text-yellow-800"
          >
            🔒 Change Password
          </button>
          <h2 className="mt-3 font-display text-2xl font-extrabold">{profile?.full_name || "Student"}</h2>
          {profile?.faculty && <span className="mt-1 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold">{profile.faculty}</span>}
          {p?.bio && <p className="mt-2 text-sm text-foreground">{p.bio}</p>}
          <p className="mt-3 text-sm">
            <b>{followersCount}</b> <span className="text-muted-foreground">followers</span> • <b>{followingCount}</b> <span className="text-muted-foreground">following</span> • <b>{posts.length}</b> <span className="text-muted-foreground">posts</span> • <b>{repostCount}</b> <span className="text-muted-foreground">reposts</span>
          </p>
          <div className="mt-4 rounded-2xl border bg-muted/40 p-4 space-y-2 text-sm">
            <p className="font-bold">Details</p>
            <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> Lives in {p?.location || "Akure"}</p>
            <p className="flex items-center gap-2 text-muted-foreground"><GraduationCap className="h-4 w-4" /> Studied at {p?.school || "AFUED"}</p>
          </div>
          {profile?.is_admin && (
            <Link to="/afued-oga-only-2024-x9" className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-black py-3 text-sm font-bold text-white">
              <Shield className="h-4 w-4" /> Admin Panel — Oga Only 🔐
            </Link>
          )}
        </div>
      </div>
      <div className="flex gap-2 px-1 overflow-x-auto no-scrollbar">
        {(["all", "photos", "reels", "reposts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-black text-white" : "border bg-card"}`}>
            {t === "all" ? "All" : t} {t === "reposts" ? `(${repostCount})` : ""}
          </button>
        ))}
      </div>
      <h3 className="px-1 font-display text-lg font-bold">{tab === "reposts" ? `My reposts • ${repostCount}` : "My posts"}</h3>
      {filteredPosts.length === 0 && <p className="py-6 text-center text-muted-foreground">{tab === "reposts" ? "You never repost anything yet. Go Feed, press 🔁 for any post you like!" : "No posts in this tab yet."}</p>}
      {filteredPosts.map((p) => (
        <div key={p.id}>
          {/* === ADDED: Repost label like TikTok === */}
          {tab === "reposts" && (
            <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-bold text-green-700">
              <Repeat2 className="h-3.5 w-3.5" /> You reposted this
            </div>
          )}
          <PostCard key={p.id} post={p} author={profile ?? undefined} commentCount={counts[p.id] ?? 0} onComments={() => setOpenPost(p.id)} />
        </div>
      ))}
      <CommentsSheet postId={openPost} onClose={() => setOpenPost(null)} />
      {editing && <EditProfile onClose={() => { setEditing(false); refreshProfile(); }} />}
    </div>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const p: any = profile;
  const [f, setF] = useState({
    full_name: profile?.full_name ?? "",
    phone_number: profile?.phone_number ?? "",
    faculty: profile?.faculty || FACULTIES[0],
    bio: p?.bio ?? "",
    location: p?.location ?? "Akure",
    school: p?.school ?? "AFUED",
  });
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none";
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user) return; setBusy(true);
    try {
      const avatar_url = file ? await uploadImage(file, user.id, "avatars") : profile?.avatar_url ?? null;
      const cover_url = coverFile ? await uploadImage(coverFile, user.id, "covers") : p?.cover_url ?? null;
      const { error } = await supabase.from("profiles").upsert({ id: user.id, email: user.email, ...f, avatar_url, cover_url });
      if (error) throw error; toast.success("Profile updated"); onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm font-medium">Profile Photo<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" /></label>
          <label className="block text-sm font-medium">Cover Photo<input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" /></label>
          <input required placeholder="Full name" className={field} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <textarea placeholder="Bio - tell people about you..." className={field} rows={2} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
          <input placeholder="Lives in - e.g. Akure" className={field} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <input placeholder="Studied at - e.g. AFUED" className={field} value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} />
          <input placeholder="Phone (private - only you see am)" className={field} value={f.phone_number} onChange={(e) => setF({ ...f, phone_number: e.target.value })} />
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {user?.email} - private, no one else go see am</p>
          <select className={field} value={f.faculty} onChange={(e) => setF({ ...f, faculty: e.target.value })}>{FACULTIES.map((x) => <option key={x}>{x}</option>)}</select>
          <button disabled={busy} className="flex w-full justify-center rounded-2xl bg-primary py-3 font-semibold text-primary-foreground">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save"}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
         }

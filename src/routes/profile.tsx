import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Mail, Phone, Pencil, Shield, MapPin, GraduationCap, Share2, Camera, Repeat2, Heart, UserPlus, UserCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { CommentsSheet } from "@/components/CommentsSheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FACULTIES, supabase, uploadImage, fetchProfiles, type Post, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Profile — AFUED Community" }] }),
  component: () => <AppShell title="Profile"><ProfilePage /></AppShell>,
});

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // FIX: No validateSearch, no Route.useSearch. Use plain browser search - build no go crash.
  const [viewedIdFromUrl, setViewedIdFromUrl] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setViewedIdFromUrl(params.get("userId"));
  }, []);

  const viewedId = viewedIdFromUrl || user?.id || "";
  const isOwn = !!user?.id && viewedId === user.id;

  const [viewedProfile, setViewedProfile] = useState<Profile | null>(null);
  const [viewedLoading, setViewedLoading] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [tab, setTab] = useState<"all" | "photos" | "reels" | "reposts">("all");
  const p: any = viewedProfile || profile;
  const [totalLikes, setTotalLikes] = useState(0);
  const [repostedPosts, setRepostedPosts] = useState<Post[]>([]);
  const [repostCount, setRepostCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    if (!viewedId) return;
    if (isOwn) {
      setViewedProfile(profile as any);
      return;
    }
    (async () => {
      setViewedLoading(true);
      const profs = await fetchProfiles([viewedId]);
      setViewedProfile(profs[viewedId] || null);
      setViewedLoading(false);
      if (user?.id) {
        const { data } = await supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", viewedId).maybeSingle();
        setIsFollowing(!!data);
      }
    })();
  }, [viewedId, isOwn, profile, user?.id]);

  const toggleFollow = async () => {
    if (!user) { toast.error("Login first"); return; }
    if (isOwn) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", viewedId);
        if (error) throw error;
        setIsFollowing(false);
        setFollowersCount(c => Math.max(0, c - 1));
        toast.success("Unfollowed");
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: viewedId });
        if (error) throw error;
        setIsFollowing(true);
        setFollowersCount(c => c + 1);
        toast.success("Following! ✅");
      }
    } catch (e: any) {
      toast.error(e.message || "Follow failed");
    } finally { setFollowBusy(false); }
  };

  const loadReposts = async (uid: string) => {
    const { data: rows, error } = await supabase.from("reposts").select("post_id, created_at").eq("user_id", uid).order("created_at", { ascending: false });
    if (error || !rows || rows.length === 0) {
      setRepostedPosts([]);
      setRepostCount(0);
      return;
    }
    const ids = rows.map((r: any) => r.post_id);
    const { data: rePosts } = await supabase.from("posts").select("*").in("id", ids).order("created_at", { ascending: false });
    const ordered = ids.map((id: string) => (rePosts || []).find((pp: any) => pp.id === id)).filter(Boolean) as Post[];
    setRepostedPosts(ordered);
    setRepostCount(rows.length);
    if (ordered.length) {
      const { data: cs } = await supabase.from("comments").select("post_id").in("post_id", ordered.map((pp: any) => pp.id));
      const m: Record<string, number> = {};
      (cs ?? []).forEach((c) => (m[c.post_id] = (m[c.post_id] ?? 0) + 1));
      setCounts((prev) => ({ ...prev, ...m }));
    }
  };

  const loadTotalLikes = async (postIds: string[]) => {
    if (postIds.length === 0) { setTotalLikes(0); return; }
    const { data, error } = await supabase.from("likes").select("id").in("post_id", postIds);
    if (!error && data) { setTotalLikes(data.length); return; }
    const { data: data2 } = await supabase.from("post_likes").select("id").in("post_id", postIds);
    if (data2) { setTotalLikes(data2.length); return; }
    const { data: postsData } = await supabase.from("posts").select("likes_count").in("id", postIds);
    if (postsData) {
      const sum = (postsData as any[]).reduce((a, b) => a + (b.likes_count || 0), 0);
      setTotalLikes(sum);
    }
  };

  useEffect(() => {
    if (!viewedId) return;
    (async () => {
      const { data } = await supabase.from("posts").select("*").eq("user_id", viewedId).order("created_at", { ascending: false });
      setPosts(data ?? []);
      if (data?.length) {
        const { data: cs } = await supabase.from("comments").select("post_id").in("post_id", data.map((p) => p.id));
        const m: Record<string, number> = {};
        (cs ?? []).forEach((c) => (m[c.post_id] = (m[c.post_id] ?? 0) + 1));
        setCounts(m);
        await loadTotalLikes(data.map((p) => p.id));
      } else {
        setTotalLikes(0);
      }
      const { count: f1 } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", viewedId);
      const { count: f2 } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", viewedId);
      setFollowersCount(f1 ?? 0);
      setFollowingCount(f2 ?? 0);
      await loadReposts(viewedId);
    })();
    const ch = supabase.channel(`reposts-${viewedId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reposts", filter: `user_id=eq.${viewedId}` }, () => loadReposts(viewedId))
      .subscribe();
    const ch2 = supabase.channel(`likes-${viewedId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, async () => {
        const { data: vPosts } = await supabase.from("posts").select("id").eq("user_id", viewedId);
        if (vPosts) await loadTotalLikes(vPosts.map((pp: any) => pp.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(ch2); };
  }, [viewedId]);

  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };

  const shareProfile = async () => {
    const url = `${window.location.origin}/profile?userId=${viewedId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch {
      toast.success(url);
    }
  };

  const listToShow = tab === "reposts" ? repostedPosts : posts;

  const filteredPosts = listToShow.filter((post: any) => {
    if (tab === "all") return true;
    if (tab === "reposts") return true;
    if (tab === "photos") return post.media_url && !post.media_url.includes(".mp4") && !post.media_type?.includes("video");
    if (tab === "reels") return post.media_type?.includes("video") || post.media_url?.includes(".mp4");
    return true;
  });

  if (!user) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (viewedLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!isOwn && !viewedProfile) {
    return (
      <div className="p-4 text-center">
        <p className="py-10 text-muted-foreground">Profile not found.</p>
        <button onClick={() => navigate({ to: "/" })} className="rounded-full bg-black px-6 py-2 text-sm font-bold text-white">Back to Feed</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {!isOwn && (
        <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-1 text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" /> Back to Feed
        </button>
      )}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="relative h-32 sm:h-40 bg-gradient-hero overflow-hidden">
          {p?.cover_url && <img src={p.cover_url} className="h-full w-full object-cover" alt="cover" />}
          {isOwn && (
            <button onClick={() => setEditing(true)} className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
              <Camera className="h-3.5 w-3.5" /> Edit Cover
            </button>
          )}
        </div>
        <div className="-mt-12 px-5 pb-5">
          <div className="flex items-end justify-between">
            <div className="rounded-full bg-card p-1"><Avatar url={p?.avatar_url} name={p?.full_name} size={88} /></div>
            <div className="flex gap-2">
              <button onClick={shareProfile} className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold"><Share2 className="h-4 w-4" /> Share</button>
              {isOwn ? (
                <>
                  <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Edit</button>
                  <button onClick={logout} className="rounded-full border p-2 text-destructive"><LogOut className="h-4 w-4" /></button>
                </>
              ) : (
                <button onClick={toggleFollow} disabled={followBusy} className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold text-white ${isFollowing ? "bg-zinc-600" : "bg-black"}`}>
                  {isFollowing ? <><UserCheck className="h-4 w-4" /> Following</> : <><UserPlus className="h-4 w-4" /> Follow</>}
                </button>
              )}
            </div>
          </div>
          {isOwn && (
            <button
              onClick={() => navigate({ to: "/change-password" })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-yellow-100 py-3 text-sm font-bold text-yellow-800"
            >
              🔒 Change Password
            </button>
          )}
          <h2 className="mt-3 font-display text-2xl font-extrabold">{p?.full_name || "Student"}</h2>
          {p?.faculty && <span className="mt-1 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold">{p.faculty}</span>}
          {p?.bio && <p className="mt-2 text-sm text-foreground">{p.bio}</p>}
          <p className="mt-3 text-sm">
            <b>{followersCount}</b> <span className="text-muted-foreground">followers</span> • <b>{followingCount}</b> <span className="text-muted-foreground">following</span> • <b>{posts.length}</b> <span className="text-muted-foreground">posts</span> • <b>{repostCount}</b> <span className="text-muted-foreground">reposts</span>
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white"><Heart className="h-5 w-5 fill-white" /></span>
            <div>
              <p className="text-base font-extrabold leading-none">{totalLikes} Total Likes</p>
              <p className="text-xs text-muted-foreground mt-0.5">{isOwn ? "All likes for all your posts, add together" : `All likes for ${p?.full_name || "this user"}'s posts`}</p>
            </div>
          </div>
          {isOwn && (
            <div className="mt-4 rounded-2xl border bg-muted/40 p-4 space-y-2 text-sm">
              <p className="font-bold">Details</p>
              <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> Lives in {p?.location || "Akure"}</p>
              <p className="flex items-center gap-2 text-muted-foreground"><GraduationCap className="h-4 w-4" /> Studied at {p?.school || "AFUED"}</p>
            </div>
          )}
          {isOwn && profile?.is_admin && (
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
      <h3 className="px-1 font-display text-lg font-bold">{tab === "reposts" ? `${isOwn ? "My" : `${p?.full_name}'s`} reposts • ${repostCount}` : isOwn ? "My posts" : `${p?.full_name}'s posts`}</h3>
      {filteredPosts.length === 0 && <p className="py-6 text-center text-muted-foreground">{tab === "reposts" ? (isOwn ? "You never repost anything yet. Go Feed, press 🔁 for any post you like!" : "No reposts yet.") : "No posts in this tab yet."}</p>}
      {filteredPosts.map((pp) => (
        <div key={pp.id}>
          {tab === "reposts" && (
            <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-bold text-green-700">
              <Repeat2 className="h-3.5 w-3.5" /> {isOwn ? "You reposted this" : `${p?.full_name} reposted this`}
            </div>
          )}
          <PostCard key={pp.id} post={pp} author={viewedProfile ?? profile ?? undefined} commentCount={counts[pp.id] ?? 0} onComments={() => setOpenPost(pp.id)} />
        </div>
      ))}
      <CommentsSheet postId={openPost} onClose={() => setOpenPost(null)} />
      {editing && isOwn && <EditProfile onClose={() => { setEditing(false); refreshProfile(); }} />}
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

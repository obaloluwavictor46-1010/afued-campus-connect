import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { CommentsSheet } from "@/components/CommentsSheet";
import { UploadBar, useMediaPicker } from "@/components/MediaView";
import { FEED_CHANNELS, fetchProfiles, insertWithMedia, MAX_POSTS_PER_DAY, shortFaculty, supabase, uploadMany, type Post, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AFUED Community — Campus Feed" },
      { name: "description", content: "The social feed for AFUED students. Share posts across every faculty channel." },
      { property: "og:title", content: "AFUED Community — Campus Feed" },
      { property: "og:description", content: "Share posts and connect across every AFUED faculty." },
    ],
  }),
  component: Feed,
});

function Feed() {
  return <AppShell><FeedInner /></AppShell>;
}

function FeedInner() {
  const [channel, setChannel] = useState("All");
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [openPost, setOpenPost] = useState<string | null>(null);

  const load = async () => {
    let q = supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (channel !== "All") q = q.eq("faculty_channel", channel);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    const list = (data ?? []) as Post[];
    setPosts(list);
    setProfiles(await fetchProfiles(list.map((p) => p.user_id)));
    if (list.length) {
      const { data: cs } = await supabase.from("comments").select("post_id").in("post_id", list.map((p) => p.id));
      const m: Record<string, number> = {};
      (cs ?? []).forEach((c) => (m[c.post_id] = (m[c.post_id] ?? 0) + 1));
      setCounts(m);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    const ch = supabase
      .channel(`feed-${channel}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channel]);

  return (
    <>
      <div className="no-scrollbar sticky top-[57px] z-20 flex gap-2 overflow-x-auto border-b bg-background px-4 py-3">
        {["All", ...FEED_CHANNELS].map((c) => (
          <button key={c} onClick={() => setChannel(c)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${channel === c ? "bg-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}>
            {c === "All" ? "All" : shortFaculty(c)}
          </button>
        ))}
      </div>
      <div className="space-y-4 p-4">
        <Composer defaultChannel={channel} onPosted={load} />
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : posts.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No posts in this channel yet.</p>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} author={profiles[p.user_id]} commentCount={counts[p.id] ?? 0} onComments={() => setOpenPost(p.id)} />)
        )}
      </div>
      <CommentsSheet postId={openPost} onClose={() => setOpenPost(null)} />
    </>
  );
}

function Composer({ defaultChannel, onPosted }: { defaultChannel: string; onPosted: () => void }) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState("");
  const picker = useMediaPicker();
  const [faculty, setFaculty] = useState<string>(FEED_CHANNELS.includes(profile?.faculty as never) ? profile!.faculty! : FEED_CHANNELS[0]!);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (defaultChannel !== "All") setFaculty(defaultChannel); }, [defaultChannel]);

  const [pct, setPct] = useState<number | null>(null);
  const post = async () => {
    if (!user || (!content.trim() && !picker.files.length)) return;
    setBusy(true);
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { count } = await supabase.from("posts").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", since.toISOString());
    if ((count ?? 0) >= MAX_POSTS_PER_DAY) {
      toast.error(`You can post up to ${MAX_POSTS_PER_DAY} times per day`);
      setBusy(false);
      return;
    }
    try {
      const urls = picker.files.length ? await uploadMany(picker.files, user.id, setPct) : [];
      await insertWithMedia("posts", { user_id: user.id, content: content.trim(), faculty_channel: faculty }, urls);
      setContent(""); picker.clear();
      toast.success("Posted!");
      onPosted();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setPct(null); }
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex gap-3">
        <Avatar url={profile?.avatar_url} name={profile?.full_name} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's happening on campus?" rows={2} className="flex-1 resize-none bg-transparent pt-2 text-[15px] outline-none" />
      </div>
      {picker.grid(busy)}
      <UploadBar pct={pct} />
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        {picker.input}
        <button onClick={picker.open} disabled={busy} className="rounded-full p-2 text-primary hover:bg-accent" aria-label="Add photos or videos"><ImagePlus className="h-5 w-5" /></button>
        <button onClick={picker.open} disabled={busy} className="rounded-full p-2 text-primary hover:bg-accent" aria-label="Add file"><Paperclip className="h-5 w-5" /></button>
        <select value={faculty} onChange={(e) => setFaculty(e.target.value)} className="min-w-0 flex-1 truncate rounded-full bg-muted px-3 py-2 text-xs font-medium outline-none">
          {FEED_CHANNELS.map((f) => <option key={f} value={f}>{shortFaculty(f)}</option>)}
        </select>
        <button onClick={post} disabled={busy} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? (pct !== null ? `${pct}%` : <Loader2 className="h-4 w-4 animate-spin" />) : "Post"}
        </button>
      </div>
    </div>
  );
}

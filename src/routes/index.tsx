import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Paperclip, MoreHorizontal, Pencil, Trash2, Share2, Music } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { CommentsSheet } from "@/components/CommentsSheet";
import { UploadBar, useMediaPicker } from "@/components/MediaView";
import { FEED_CHANNELS, fetchProfiles, MAX_POSTS_PER_DAY, shortFaculty, supabase, type Post, type Profile } from "@/lib/supabase";
import { uploadToBunny } from "@/lib/bunny";
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
  const { user } = useAuth();
  const [channel, setChannel] = useState("All");
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    let q = supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (channel !== "All") q = q.eq("faculty_channel", channel);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    const list = (data ?? []) as Post[];
    // Keep optimistic posts that are still uploading
    setPosts(prev => {
      const uploading = prev.filter((p: any) => p.isUploading);
      const merged = [...uploading, ...list];
      // remove duplicate ids
      return merged.filter((v,i,a)=>a.findIndex(t=>t.id===v.id)===i);
    });
    setProfiles(await fetchProfiles(list.map((p) => p.user_id)));
    if (list.length) {
      const { data: cs } = await supabase.from("comments").select("post_id").in("post_id", list.map((p) => p.id));
      const m: Record<string, number> = {};
      (cs ?? []).forEach((c) => (m[c.post_id] = (m[c.post_id] ?? 0) + 1));
      setCounts(m);
    }
    setLoading(false);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("You wan delete this post? E go comot forever o!")) return;
    setDeletingId(postId);
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) toast.error(error.message);
    else {
      toast.success("Post deleted!");
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
    setDeletingId(null);
    setOpenMenu(null);
  };

  const handleEditSave = async () => {
    if (!editingPost || !editContent.trim()) return;
    const { error } = await supabase.from("posts").update({ content: editContent.trim() }).eq("id", editingPost.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Post updated!");
      setPosts((prev) => prev.map(p => p.id === editingPost.id ? { ...p, content: editContent.trim() } : p));
      setEditingPost(null);
    }
    setOpenMenu(null);
  };

  const handleShare = async (post: Post) => {
    const url = `${window.location.origin}/post/${post.id}?from=AFUED_Connect`;
    const shareData = {
      title: "AFUED Community",
      text: `${post.content.slice(0, 100)} - Shared from AFUED Connect App 🎓`,
      url: url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied! Share am for WhatsApp with AFUED flag 🎓");
      }
    } catch {}
    setOpenMenu(null);
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

  useEffect(() => {
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

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
        <Composer 
          defaultChannel={channel} 
          onOptimisticAdd={(temp: any) => setPosts(prev => [temp, ...prev])}
          onOptimisticReplace={(tempId: string, real: any) => setPosts(prev => prev.map(p => p.id === tempId ? { ...p, ...real, isUploading: false } : p))}
          onOptimisticRemove={(tempId: string) => setPosts(prev => prev.filter(p => p.id !== tempId))}
          onPosted={load} 
        />
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : posts.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No posts in this channel yet.</p>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="relative">
              {(p as any).isUploading && (
                <div className="absolute top-0 left-0 right-0 z-20 h-1 overflow-hidden rounded-t-2xl bg-muted">
                  <div className="h-full w-full animate-pulse bg-primary" style={{ width: `${(p as any).uploadPct || 30}%` }} />
                </div>
              )}
              <div className="absolute right-3 top-3 z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === p.id ? null : p.id); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white border shadow-sm hover:bg-muted"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {openMenu === p.id && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border bg-white shadow-xl overflow-hidden animate-in fade-in">
                    <button onClick={(e) => { e.stopPropagation(); handleShare(p); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left">
                      <Share2 className="h-4 w-4" /> Share / Invite
                    </button>
                    {p.user_id === user?.id && (
                      <>
                        <div className="h-[1px] bg-gray-100" />
                        <button onClick={(e) => { e.stopPropagation(); setEditingPost(p); setEditContent(p.content); setOpenMenu(null); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left">
                          <Pencil className="h-4 w-4" /> Edit Post
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} disabled={deletingId === p.id} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-red-50 text-red-500 text-left disabled:opacity-50">
                          {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete Post
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className={(p as any).isUploading ? "opacity-80" : ""}>
                <PostCard post={p} author={profiles[p.user_id]} commentCount={counts[p.id] ?? 0} onComments={() => setOpenPost(p.id)} />
              </div>
              {(p as any).isUploading && <p className="px-4 pb-2 text-[11px] text-primary font-semibold">Uploading fast like WhatsApp... {(p as any).uploadPct || 0}%</p>}
            </div>
          ))
        )}
      </div>
      <CommentsSheet postId={openPost} onClose={() => setOpenPost(null)} />

      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold mb-3 text-lg">Edit Post</h3>
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} className="w-full rounded-xl border p-3 text-[15px] outline-none focus:ring-2 focus:ring-primary" placeholder="Edit your post..." />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditingPost(null)} className="rounded-full px-5 py-2 text-sm bg-muted font-medium">Cancel</button>
              <button onClick={handleEditSave} className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Composer({ defaultChannel, onPosted, onOptimisticAdd, onOptimisticReplace, onOptimisticRemove }: { 
  defaultChannel: string; 
  onPosted: () => void;
  onOptimisticAdd: (p: any) => void;
  onOptimisticReplace: (tempId: string, real: any) => void;
  onOptimisticRemove: (tempId: string) => void;
}) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState("");
  const picker = useMediaPicker();
  const [faculty, setFaculty] = useState<string>(FEED_CHANNELS.includes(profile?.faculty as never) ? profile!.faculty! : FEED_CHANNELS[0]!);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (defaultChannel !== "All") setFaculty(defaultChannel); }, [defaultChannel]);
  const [pct, setPct] = useState<number | null>(null);

  // NEW: FACEBOOK INSTANT LOGIC - SHOW BEFORE UPLOAD!
  const post = async () => {
    if (!user || (!content.trim() && !picker.files.length)) return;
    
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since.toISOString());
    if ((count ?? 0) >= MAX_POSTS_PER_DAY) { toast.error(`You can post up to ${MAX_POSTS_PER_DAY} times per day`); return; }

    // 1. CREATE LOCAL BLOB URLS - INSTANT LIKE FACEBOOK/WHATSAPP!
    const localImages: string[] = [];
    let localVideo = "";
    let localMusic = "";
    const blobUrls: string[] = [];

    for (const f of picker.files) {
      const blobUrl = URL.createObjectURL(f);
      blobUrls.push(blobUrl);
      const name = (f.name?.toLowerCase() || "");
      const type = f.type || "";
      const isMusic = type.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".m4a") || name.endsWith(".ogg") || name.endsWith(".wav");
      const isVideo = type.startsWith("video/");
      if (isMusic) localMusic = blobUrl;
      else if (isVideo) localVideo = blobUrl;
      else localImages.push(blobUrl);
    }

    const tempId = `temp-${Date.now()}`;
    const tempPost: any = {
      id: tempId,
      user_id: user.id,
      content: content.trim(),
      faculty_channel: faculty,
      image_urls: localImages,
      image_url: localImages[0] || "",
      music_url: localMusic,
      video_url: localVideo,
      created_at: new Date().toISOString(),
      isUploading: true,
      uploadPct: 5
    };

    // 2. SHOW FOR FEED IMMEDIATELY!
    onOptimisticAdd(tempPost);
    const savedContent = content.trim();
    const savedFaculty = faculty;
    setContent(""); 
    picker.clear();
    setBusy(true);

    // 3. SECRET BACKGROUND UPLOAD LIKE WHATSAPP!
    try {
      let image_urls: string[] = [];
      let music_url = "";
      let video_url = "";
      
      for (let i = 0; i < picker.files.length; i++) {
        const file: any = picker.files[i];
        
        const name = file.name?.toLowerCase() || "";
        const type = file.type || "";
        const isMusic = type.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".m4a") || name.endsWith(".ogg") || name.endsWith(".wav");
        const isVideo = type.startsWith("video/");
        
        const url = await uploadToBunny(file, isMusic ? "music" : isVideo ? "videos" : "images", (p) => {
          setPct(p);
          onOptimisticReplace(tempId, { uploadPct: p });
        });

        if (isMusic) music_url = url;
        else if (isVideo) video_url = url;
        else image_urls.push(url);
      }

      // 4. SAVE REAL URL TO DATABASE
      const { data, error } = await supabase.from("posts").insert({
        user_id: user.id,
        content: savedContent,
        faculty_channel: savedFaculty,
        image_urls: image_urls,
        image_url: image_urls[0] || "",
        music_url: music_url,
        video_url: video_url,
      } as any).select().single();
      
      if (error) throw error;
      
      // 5. REPLACE TEMP WITH REAL - SWAP BLOB WITH BUNNY URL!
      onOptimisticReplace(tempId, {
        ...data,
        uploadPct: 100,
        isUploading: false
      });

      // Cleanup blob urls
      blobUrls.forEach(u => URL.revokeObjectURL(u));

      toast.success("Posted! Fast like WhatsApp! 🚀");
      onPosted();
      
    } catch (e) { 
      toast.error((e as Error).message); 
      onOptimisticRemove(tempId);
      blobUrls.forEach(u => URL.revokeObjectURL(u));
    } finally { 
      setBusy(false); 
      setPct(null); 
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex gap-3">
        <Avatar url={profile?.avatar_url} name={profile?.full_name} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's happening on campus? Add pic + music 🎵" rows={2} className="flex-1 resize-none bg-transparent pt-2 text-[15px] outline-none" />
      </div>
      {picker.grid(busy)}
      <UploadBar pct={pct} />
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        {picker.input}
        <button onClick={picker.open} disabled={busy} className="rounded-full p-2 text-primary hover:bg-accent" aria-label="Add photos, videos or music">
          <ImagePlus className="h-5 w-5" />
        </button>
        <button onClick={picker.open} disabled={busy} className="flex items-center gap-1 rounded-full p-2 text-primary hover:bg-accent" aria-label="Add music">
          <Music className="h-4 w-4" /><span className="text-[10px] font-bold">MP3</span>
        </button>
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

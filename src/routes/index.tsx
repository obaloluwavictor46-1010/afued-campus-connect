import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ImagePlus, Loader2, MoreHorizontal, Pencil, Trash2, Share2, Music, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { CommentsSheet } from "@/components/CommentsSheet";
import { UploadBar, useMediaPicker } from "@/components/MediaView";
import { FEED_CHANNELS, fetchProfiles, MAX_POSTS_PER_DAY, shortFaculty, supabase, type Post, type Profile } from "@/lib/supabase";
import { uploadToBunnyStorage } from "@/lib/bunnyStorage";
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

function checkVideoDuration(file: File): Promise<{ ok: boolean; dur: number }> {
  return new Promise((resolve) => {
    if (!file.type?.startsWith("video/")) { resolve({ ok: true, dur: 0 }); return; }
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); const dur = v.duration || 0; if (dur > 180) resolve({ ok: false, dur }); else resolve({ ok: true, dur }); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve({ ok: true, dur: 0 }); };
    v.src = url;
  });
}

function Feed() { return <AppShell><FeedInner /></AppShell>; }

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
  const [repostCounts, setRepostCounts] = useState<Record<string, number>>({});
  const [myReposts, setMyReposts] = useState<Set<string>>(new Set());
  const [repostBy, setRepostBy] = useState<Record<string, any[]>>({});
  const [repostingId, setRepostingId] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);

  const loadReposts = async () => {
    const { data, error } = await supabase.from("reposts").select("post_id, user_id, created_at").order("created_at", { ascending: false });
    if (error) { console.log("LOAD REPOSTS ERROR:", error.code, error.message); return; }
    if (!data) return;
    const counts: Record<string, number> = {};
    const mine = new Set<string>();
    const by: Record<string, any[]> = {};
    const userIds: string[] = [];
    (data as any[]).forEach((r) => {
      counts[r.post_id] = (counts[r.post_id] || 0) + 1;
      if (r.user_id === user?.id) mine.add(r.post_id);
      if (!by[r.post_id]) by[r.post_id] = [];
      by[r.post_id].push(r);
      if (!userIds.includes(r.user_id)) userIds.push(r.user_id);
    });
    setRepostCounts(counts); setMyReposts(mine); setRepostBy(by);
    if (userIds.length) {
      const profs = await fetchProfiles(userIds);
      setRepostBy((prev) => {
        const next: any = {};
        Object.keys(prev).forEach((pid) => { next[pid] = prev[pid].map((r: any) => ({ ...r, profile: profs[r.user_id] })); });
        return next;
      });
    }
  };

  const handleRepost = async (post: Post) => {
    if (!user) { toast.error("Login first"); return; }
    if (repostingId === post.id) return;
    setRepostingId(post.id);
    const already = myReposts.has(post.id);
    try {
      if (already) {
        const { error } = await supabase.from("reposts").delete().eq("user_id", user.id).eq("post_id", post.id);
        if (error) throw error;
        toast.success("Repost removed");
        setMyReposts(prev => { const n = new Set(prev); n.delete(post.id); return n; });
        setRepostCounts(prev => ({ ...prev, [post.id]: Math.max(0, (prev[post.id] || 1) - 1) }));
      } else {
        const { error } = await supabase.from("reposts").insert({ user_id: user.id, post_id: post.id });
        if (error) throw error;
        toast.success("Reposted! 🔁 E go show for your profile");
        setMyReposts(prev => new Set(prev).add(post.id));
        setRepostCounts(prev => ({ ...prev, [post.id]: (prev[post.id] || 0) + 1 }));
      }
    } catch (e: any) {
      console.log("REPOST REAL ERROR:", e);
      if (e.code === "42P01") toast.error("Repost table never create yet - run SQL for reposts first");
      else if (e.code === "23505") { toast.error("You don repost this one before"); setMyReposts(prev => new Set(prev).add(post.id)); }
      else if (e.code === "42501") toast.error("Policy still block am (42501) - run policy SQL again");
      else toast.error(`Repost failed: ${e.code || ""} - ${e.message || "Unknown error"}`);
    } finally { setRepostingId(null); }
  };

  // NO WATCHDOG HERE AGAIN - PostCard.tsx don handle pause. Watchdog dey fight am before.

  const load = async () => {
    let q = supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (channel !== "All") q = q.eq("faculty_channel", channel);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    const list = (data ?? []) as Post[];
    setPosts(prev => {
      const uploading = prev.filter((p: any) => p.isUploading);
      const merged = [...uploading, ...list];
      return merged.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
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

  const handleDeleteEveryone = async (postId: string) => {
    if (!confirm("Delete for Everyone? E go comot for everybody forever o!")) return;
    setDeletingId(postId);
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) toast.error(error.message);
    else { toast.success("Post deleted for everyone!"); setPosts((prev) => prev.filter((p) => p.id !== postId)); }
    setDeletingId(null); setOpenMenu(null);
  };

  const handleEditSave = async () => {
    if (!editingPost || !editContent.trim()) return;
    const { error } = await supabase.from("posts").update({ content: editContent.trim() }).eq("id", editingPost.id);
    if (error) toast.error(error.message);
    else { toast.success("Post updated!"); setPosts((prev) => prev.map(p => p.id === editingPost.id ? { ...p, content: editContent.trim() } : p)); setEditingPost(null); setOpenMenu(null); }
  };

  const handleShare = async (post: Post) => {
    const url = `${window.location.origin}/post/${post.id}?from=AFUED_Connect`;
    try {
      if (navigator.share) await navigator.share({ title: "AFUED Community", text: `${post.content.slice(0, 100)} - Shared from AFUED Connect App 🎓`, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied! Share am for WhatsApp 🎓"); }
    } catch {}
    setOpenMenu(null);
  };

  const showNewPosts = async () => { setNewCount(0); await load(); window.scrollTo({ top: 0, behavior: "smooth" }); };

  useEffect(() => {
    setLoading(true); setNewCount(0); load(); loadReposts();
    const ch = supabase.channel(`feed-${channel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        const newPost: any = payload.new;
        if (newPost.user_id === user?.id) { load(); return; }
        if (channel !== "All" && newPost.faculty_channel !== channel) return;
        if (window.scrollY < 150) { load(); } else { setNewCount((c) => c + 1); }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reposts" }, loadReposts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channel]);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const visiblePosts = posts;

  return (
    <>
      <div className="no-scrollbar sticky top-[57px] z-20 flex gap-2 overflow-x-auto border-b bg-background px-4 py-3">
        {["All", ...FEED_CHANNELS].map((c) => (
          <button key={c} onClick={() => setChannel(c)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${channel === c ? "bg-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}>
            {c === "All" ? "All" : shortFaculty(c)}
          </button>
        ))}
      </div>
      {newCount > 0 && (
        <div className="sticky top-[125px] z-30 flex justify-center">
          <button onClick={showNewPosts} className="flex items-center gap-2 rounded-full bg-red-500 px-5 py-2.5 text-sm font-extrabold text-white shadow-xl animate-bounce">
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-extrabold text-red-600">{newCount > 99 ? "99+" : newCount}</span>
            🔴 {newCount} New Post{newCount > 1 ? "s" : ""} — Tap to see
          </button>
        </div>
      )}
      <div className="space-y-4 p-4">
        <Composer defaultChannel={channel} onOptimisticAdd={(temp: any) => setPosts(prev => [temp, ...prev])} onOptimisticReplace={(tempId: string, real: any) => setPosts(prev => prev.map(p => p.id === tempId ? { ...p, ...real, isUploading: false } : p))} onOptimisticRemove={(tempId: string) => setPosts(prev => prev.filter(p => p.id !== tempId))} onPosted={load} />
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : visiblePosts.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No posts in this channel yet.</p>
        ) : (
          visiblePosts.map((p) => {
            const isReposted = myReposts.has(p.id);
            const reposters = repostBy[p.id] || [];
            const firstReposter = reposters[0]?.profile;
            return (
              <div key={p.id} className="relative">
                <div className="absolute right-3 top-3 z-10">
                  <button onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === p.id ? null : p.id); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-white border shadow-sm hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {openMenu === p.id && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-xl overflow-hidden animate-in fade-in">
                      <button onClick={(e) => { e.stopPropagation(); handleShare(p); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left"><Share2 className="h-4 w-4" /> Share / Invite</button>
                      <button onClick={(e) => { e.stopPropagation(); handleRepost(p); setOpenMenu(null); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left"><Repeat2 className="h-4 w-4" /> {isReposted ? "Undo Repost" : "Repost"}</button>
                      {p.user_id === user?.id && (
                        <>
                          <div className="h-[1px] bg-gray-100" />
                          <button onClick={(e) => { e.stopPropagation(); setEditingPost(p); setEditContent(p.content); setOpenMenu(null); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left"><Pencil className="h-4 w-4" /> Edit Post</button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteEveryone(p.id); }} disabled={deletingId === p.id} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-red-50 text-red-500 text-left disabled:opacity-50">{deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete for Everyone</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {(isReposted || reposters.length > 0) && (
                  <div className="px-4 pt-3 flex items-center gap-1.5 text-xs font-semibold text-green-700">
                    <Repeat2 className="h-3.5 w-3.5" />
                    {isReposted ? "You reposted this" : `${firstReposter?.full_name || "Someone"} reposted this`}
                    {(repostCounts[p.id] || 0) > 1 && <span className="text-muted-foreground font-normal">• {repostCounts[p.id]} reposts</span>}
                  </div>
                )}
                <div>
                  <PostCard post={p} author={profiles[p.user_id]} commentCount={counts[p.id] ?? 0} onComments={() => setOpenPost(p.id)} />
                </div>
                <div className="flex items-center gap-2 px-4 pb-3">
                  <button onClick={() => handleRepost(p)} disabled={repostingId === p.id} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${isReposted ? "bg-green-100 text-green-700 border border-green-200" : "bg-muted text-muted-foreground"}`}>
                    <Repeat2 className="h-4 w-4" />
                    {repostingId === p.id ? "Wait..." : isReposted ? "Reposted" : "Repost"} • {repostCounts[p.id] || 0}
                  </button>
                  <button onClick={() => setOpenPost(p.id)} className="rounded-full bg-muted px-4 py-2 text-xs font-bold text-muted-foreground">💬 {counts[p.id] ?? 0}</button>
                  <button onClick={() => handleShare(p)} className="rounded-full bg-muted px-4 py-2 text-xs font-bold text-muted-foreground">↗ Share</button>
                </div>
              </div>
            );
          })
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
  defaultChannel: string; onPosted: () => void; onOptimisticAdd: (p: any) => void; onOptimisticReplace: (tempId: string, real: any) => void; onOptimisticRemove: (tempId: string) => void;
}) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState("");
  const picker = useMediaPicker();
  const [faculty, setFaculty] = useState<string>(FEED_CHANNELS.includes(profile?.faculty as never) ? profile!.faculty! : FEED_CHANNELS[0]!);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (defaultChannel !== "All") setFaculty(defaultChannel); }, [defaultChannel]);
  const [pct, setPct] = useState<number | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [editedFiles, setEditedFiles] = useState<File[]>([]);
  const [showEditorBtn, setShowEditorBtn] = useState(false);

  useEffect(() => {
    if (picker.files.length > 0) {
      const hasImage = picker.files.some((f: any) => f.type?.startsWith('image/') || f.type?.startsWith('video/'));
      setShowEditorBtn(hasImage);
    } else setShowEditorBtn(false);
  }, [picker.files]);

  function openEditorForFirstImage() {
    const img = picker.files.find((f: any) => f.type?.startsWith('image/') || f.type?.startsWith('video/'));
    if (!img) return;
    if (img.type?.startsWith('video/')) { toast.success("Video ready! Press Post - no need edit, e go upload fast 🎬"); return; }
    setEditorFile(img);
    setEditorUrl(URL.createObjectURL(img));
  }

  function onEditorSend(editedDataUrl: string, captionFromEditor: string) {
    if (captionFromEditor) setContent(prev => prev ? prev + " " + captionFromEditor : captionFromEditor);
    fetch(editedDataUrl).then(r => r.blob()).then(blob => {
      const newFile = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setEditedFiles([newFile]);
      toast.success("Edited! Press Post now 🎨");
    });
    setEditorUrl(null); setEditorFile(null);
  }

  const post = async () => {
    if (!user || (!content.trim() && !picker.files.length && editedFiles.length === 0)) return;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since.toISOString());
    if ((count ?? 0) >= MAX_POSTS_PER_DAY) { toast.error(`You can post up to ${MAX_POSTS_PER_DAY} times per day`); return; }
    const filesToUpload = editedFiles.length > 0 ? editedFiles : picker.files;
    for (const f of filesToUpload) {
      if ((f as any).type?.startsWith("video/")) {
        const check = await checkVideoDuration(f as File);
        if (!check.ok) { toast.error(`Video too long! ${Math.floor(check.dur)}s - Max na 3 minutes (180s).`); return; }
      }
    }
    const localImages: string[] = [];
    let localVideo = "";
    let localMusic = "";
    const blobUrls: string[] = [];
    for (const f of filesToUpload) {
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
      id: tempId, user_id: user.id, content: content.trim(), faculty_channel: faculty,
      image_urls: localImages, image_url: localImages[0] || "",
      music_url: localMusic, video_url: localVideo, poster_url: "", thumbnail_url: "",
      created_at: new Date().toISOString(), isUploading: true, uploadPct: 5
    };
    onOptimisticAdd(tempPost);
    toast.success("Posting... e go show now, upload dey run for background 🚀");
    const savedContent = content.trim();
    const savedFaculty = faculty;
    setContent(""); picker.clear(); setEditedFiles([]); setShowEditorBtn(false); setBusy(true);
    try {
      let image_urls: string[] = []; let music_url = ""; let video_url = "";
      for (let i = 0; i < filesToUpload.length; i++) {
        const file: any = filesToUpload[i];
        const name = file.name?.toLowerCase() || "";
        const type = file.type || "";
        const isMusic = type.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".m4a") || name.endsWith(".ogg") || name.endsWith(".wav");
        const isVideo = type.startsWith("video/");
        const url = await uploadToBunnyStorage(file, isMusic ? "music" : isVideo ? "videos" : "images", (p) => { setPct(p); });
        if (isMusic) music_url = url; else if (isVideo) video_url = url; else image_urls.push(url);
      }
      const { data, error } = await supabase.from("posts").insert({
        user_id: user.id, content: savedContent, faculty_channel: savedFaculty,
        image_urls: image_urls, image_url: image_urls[0] || "", music_url: music_url, video_url: video_url,
      } as any).select().single();
      if (error) throw error;
      onOptimisticReplace(tempId, { ...data, uploadPct: 100, isUploading: false });
      blobUrls.forEach(u => URL.revokeObjectURL(u));
      toast.success("Posted! 🚀");
      onPosted();
    } catch (e) {
      toast.error((e as Error).message);
      onOptimisticRemove(tempId);
      blobUrls.forEach(u => URL.revokeObjectURL(u));
    } finally { setBusy(false); setPct(null); }
  };

  return (
    <>
      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex gap-3">
          <Avatar url={profile?.avatar_url} name={profile?.full_name} />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's happening on campus? Add pic + music 🎵" rows={2} className="flex-1 resize-none bg-transparent pt-2 text-[15px] outline-none" />
        </div>
        {picker.grid(busy)}
        {showEditorBtn && editedFiles.length === 0 && (
          <button onClick={openEditorForFirstImage} className="mt-2 w-full rounded-full bg-[#00a884] py-2.5 text-sm font-bold text-white shadow">
            🎨 Edit Picture Like WhatsApp - Draw, Text, Crop
          </button>
        )}
        {editedFiles.length > 0 && (
          <div className="mt-2 rounded-xl bg-green-50 border border-green-200 p-2 text-center text-sm font-semibold text-green-700">✅ Picture Edited! Ready to Post. Press Post below.</div>
        )}
        <UploadBar pct={pct} />
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          {picker.input}
          <button onClick={picker.open} disabled={busy} className="rounded-full p-2 text-primary hover:bg-accent" aria-label="Add photos, videos or music"><ImagePlus className="h-5 w-5" /></button>
          <button onClick={picker.open} disabled={busy} className="flex items-center gap-1 rounded-full p-2 text-primary hover:bg-accent" aria-label="Add music"><Music className="h-4 w-4" /><span className="text-[10px] font-bold">MP3</span></button>
          <select value={faculty} onChange={(e) => setFaculty(e.target.value)} className="min-w-0 flex-1 truncate rounded-full bg-muted px-3 py-2 text-xs font-medium outline-none">
            {FEED_CHANNELS.map((f) => <option key={f} value={f}>{shortFaculty(f)}</option>)}
          </select>
          <button onClick={post} disabled={busy} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? (pct !== null ? `${pct}%` : <Loader2 className="h-4 w-4 animate-spin" />) : "Post"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">📹 Video max: 3 minutes • For fast upload, record 720p, no be 4K</p>
      </div>
      {editorUrl && (
        <FeedWhatsAppEditor imageUrl={editorUrl} isVideo={false} onCancel={() => { setEditorUrl(null); setEditorFile(null); }} onSend={onEditorSend} />
      )}
    </>
  );
}

async function getCroppedImg(imageSrc: string, pixelCrop: any) {
  const image = new Image(); image.crossOrigin = "anonymous"; image.src = imageSrc;
  await new Promise((res) => (image.onload = res));
  const canvas = document.createElement("canvas"); canvas.width = pixelCrop.width; canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function FeedWhatsAppEditor({ imageUrl, onCancel, onSend }: any) {
  const canvasRef = useRef<any>(null);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'crop' | 'text'>('pen');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [caption, setCaption] = useState('');
  const COLORS = ['#ffffff', '#ff0000', '#ff9500', '#ffeb00', '#00e676', '#00b0ff', '#ff4081', '#000000', '#9c27b0'];
  const [texts, setTexts] = useState<any[]>([]);
  const [emojis, setEmojis] = useState<any[]>([]);
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [directText, setDirectText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [drawLines, setDrawLines] = useState<any[]>([]);
  const [dragItem, setDragItem] = useState<any>(null);
  const [filter, setFilter] = useState('none');
  const FILTERS = [{ n: 'Original', v: 'none' }, { n: 'Pop', v: 'contrast(1.2) saturate(1.4)' }, { n: 'B&W', v: 'grayscale(1)' }, { n: 'Cool', v: 'hue-rotate(180deg) saturate(1.2)' }, { n: 'Warm', v: 'sepia(0.4) contrast(1.1)' }, { n: 'Vivid', v: 'saturate(1.8) contrast(1.15)' }];
  const [cropBox, setCropBox] = useState({ x: 8, y: 8, w: 84, h: 84 });
  const [cropHandle, setCropHandle] = useState<string | null>(null);
  const cropStart = useRef<any>(null);
  const [cropRotate, setCropRotate] = useState(0);

  useEffect(() => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = currentImage;
    img.onload = () => { const canvas = canvasRef.current; if (!canvas) return; canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
  }, [currentImage]);

  function getPos(e: any) {
    const el = canvasRef.current; if (!el) return { x: 0, y: 0, clientX: 0, clientY: 0 };
    const rect = el.getBoundingClientRect(); const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY;
    return { x: cx - rect.left, y: cy - rect.top, clientX: cx, clientY: cy };
  }
  function startDragItem(e: any, type: string, index: number) { e.stopPropagation(); const p = getPos(e); const item = type === 'text' ? texts[index] : emojis[index]; setDragItem({ type, index, startX: p.clientX, startY: p.clientY, origX: item.x, origY: item.y }); }
  function moveDragItem(e: any) { if (!dragItem) return; const p = getPos(e); const dx = p.clientX - dragItem.startX; const dy = p.clientY - dragItem.startY; if (dragItem.type === 'text') setTexts(prev => prev.map((t, i) => i === dragItem.index ? { ...t, x: dragItem.origX + dx, y: dragItem.origY + dy } : t)); else setEmojis(prev => prev.map((t, i) => i === dragItem.index ? { ...t, x: dragItem.origX + dx, y: dragItem.origY + dy } : t)); }
  function endDragItem() { setDragItem(null); }
  function startDraw(e: any) { if (dragItem) return; if (tool === 'pen') { setIsDrawing(true); const { x, y } = getPos(e); setDrawLines(prev => [...prev, { color, size: brushSize, points: [{ x, y }] }]); } else if (tool === 'eraser') { setIsDrawing(true); eraseAt(e); } }
  function draw(e: any) { if (dragItem) { moveDragItem(e); return; } if (!isDrawing) return; if (tool === 'eraser') { eraseAt(e); return; } if (tool !== 'pen') return; const { x, y } = getPos(e); setDrawLines(prev => { const copy = [...prev]; const last = copy[copy.length - 1]; if (last) last.points.push({ x, y }); return copy; }); }
  function endDraw() { setIsDrawing(false); endDragItem(); }
  function eraseAt(e: any) { const { x, y } = getPos(e); setDrawLines(prev => prev.filter((line: any) => !line.points.some((p: any) => Math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)) < 28))); }
  function undo() { if (drawLines.length > 0) setDrawLines(prev => prev.slice(0, -1)); else if (texts.length > 0) setTexts(prev => prev.slice(0, -1)); else if (emojis.length > 0) setEmojis(prev => prev.slice(0, -1)); }
  function confirmDirectText() { if (!directText.trim()) { setShowTextInput(false); return; } setTexts(prev => [...prev, { text: directText.trim(), x: 80, y: 150, color }]); setDirectText(''); setShowTextInput(false); setTool('pen'); }
  function startCropHandle(e: any, handle: string) { e.stopPropagation(); const container = document.getElementById('crop-container-feed'); if (!container) return; const rect = container.getBoundingClientRect(); const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; cropStart.current = { handle, startX: cx, startY: cy, box: { ...cropBox }, rect }; setCropHandle(handle); }
  function startCropMove(e: any) { const container = document.getElementById('crop-container-feed'); if (!container) return; const rect = container.getBoundingClientRect(); const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; cropStart.current = { handle: 'move', startX: cx, startY: cy, box: { ...cropBox }, rect }; setCropHandle('move'); }
  function moveCropHandle(e: any) { if (!cropHandle || !cropStart.current) return; const { rect, box, startX, startY, handle } = cropStart.current; const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; const dxPct = ((cx - startX) / rect.width) * 100; const dyPct = ((cy - startY) / rect.height) * 100; let next = { ...box }; if (handle === 'move') { next.x = box.x + dxPct; next.y = box.y + dyPct; if (next.x < 0) next.x = 0; if (next.y < 0) next.y = 0; if (next.x + next.w > 100) next.x = 100 - next.w; if (next.y + next.h > 100) next.y = 100 - next.y; } else { if (handle.includes('l')) { next.x = box.x + dxPct; next.w = box.w - dxPct; } if (handle.includes('r')) { next.w = box.w + dxPct; } if (handle.includes('t')) { next.y = box.y + dyPct; next.h = box.h - dyPct; } if (handle.includes('b')) { next.h = box.h + dyPct; } if (next.w < 20) { if (handle.includes('l')) next.x = box.x + box.w - 20; next.w = 20; } if (next.h < 20) { if (handle.includes('t')) next.y = box.y + box.h - 20; next.h = 20; } if (next.x < 0) { next.w += next.x; next.x = 0; } if (next.y < 0) { next.h += next.y; next.y = 0; } if (next.x + next.w > 100) next.w = 100 - next.x; if (next.y + next.h > 100) next.h = 100 - next.y; } setCropBox(next); }
  function endCropHandle() { setCropHandle(null); cropStart.current = null; }
  async function applyCrop() { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = currentImage; await new Promise((res) => (img.onload = res)); const pixelCrop = { x: (cropBox.x / 100) * img.width, y: (cropBox.y / 100) * img.height, width: (cropBox.w / 100) * img.width, height: (cropBox.h / 100) * img.height }; const cropped = await getCroppedImg(currentImage, pixelCrop); setCurrentImage(cropped); setCropBox({ x: 8, y: 8, w: 84, h: 84 }); setCropRotate(0); setTool('pen'); }
  function rotateCrop() { setCropRotate(prev => (prev + 90) % 360); setCropBox(prev => ({ x: prev.x, y: prev.y, w: prev.h, h: prev.w })); }

  async function handleSend() {
    const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = currentImage; await new Promise((res) => (img.onload = res));
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.filter = filter; ctx.drawImage(img, 0, 0); ctx.filter = 'none';
    const rect = canvas.getBoundingClientRect(); const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    drawLines.forEach((line: any) => { ctx.strokeStyle = line.color; ctx.lineWidth = line.size * 2 * scaleX; ctx.lineCap = 'round'; ctx.beginPath(); line.points.forEach((p: any, i: number) => { const X = p.x * scaleX, Y = p.y * scaleY; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }); ctx.stroke(); });
    texts.forEach((t: any) => { ctx.font = `bold ${42 * scaleX}px Arial`; ctx.fillStyle = t.color; ctx.strokeStyle = 'black'; ctx.lineWidth = 3; ctx.strokeText(t.text, t.x * scaleX, t.y * scaleY); ctx.fillText(t.text, t.x * scaleX, t.y * scaleY); });
    emojis.forEach((e: any) => { ctx.font = `${80 * scaleX}px Arial`; ctx.fillText(e.emoji, e.x * scaleX, e.y * scaleY); });
    onSend(canvas.toDataURL('image/jpeg', 0.92), caption);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'black', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <button onClick={onCancel} style={{ color: 'white', background: 'rgba(0,0,0,0.4)', border: 'none', fontSize: 22, width: 36, height: 36, borderRadius: '50%' }}>✕</button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setTool('crop')} style={{ color: 'white', background: 'rgba(0,0,0,0.4)', border: 'none', fontSize: 20, width: 38, height: 38, borderRadius: '50%' }}>⤢</button>
          <button onClick={() => { setShowTextInput(true); setTool('text'); }} style={{ color: 'white', background: 'rgba(0,0,0,0.4)', border: 'none', fontSize: 17, fontWeight: 'bold', width: 38, height: 38, borderRadius: '50%' }}>Aa</button>
          <button onClick={() => setTool('pen')} style={{ color: tool === 'pen' ? '#00e676' : 'white', background: 'rgba(0,0,0,0.4)', border: 'none', fontSize: 20, width: 38, height: 38, borderRadius: '50%' }}>✎</button>
          <button onClick={() => setTool('eraser')} style={{ color: tool === 'eraser' ? '#ff5252' : 'white', background: 'rgba(0,0,0,0.4)', border: 'none', fontSize: 16, width: 38, height: 38, borderRadius: '50%' }}>🧽</button>
          <button onClick={undo} style={{ color: 'white', background: 'rgba(0,0,0,0.4)', border: 'none', fontSize: 20, width: 38, height: 38, borderRadius: '50%' }}>↩</button>
        </div>
      </div>
      {tool === 'crop' ? (
        <div id="crop-container-feed" onMouseMove={moveCropHandle} onTouchMove={moveCropHandle} onMouseUp={endCropHandle} onTouchEnd={endCropHandle} style={{ flex: 1, position: 'relative', background: 'black', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={currentImage} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', pointerEvents: 'none', transform: `rotate(${cropRotate}deg)`, filter }} />
            <div onMouseDown={startCropMove} onTouchStart={startCropMove} style={{ position: 'absolute', left: `${cropBox.x}%`, top: `${cropBox.y}%`, width: `${cropBox.w}%`, height: `${cropBox.h}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)', boxSizing: 'border-box', touchAction: 'none', cursor: 'move' }}>
              <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.7)' }} />
              <div onMouseDown={(e) => startCropHandle(e, 'tl')} onTouchStart={(e) => startCropHandle(e, 'tl')} style={{ position: 'absolute', left: -2, top: -2, width: 28, height: 28, borderLeft: '4px solid white', borderTop: '4px solid white', touchAction: 'none', zIndex: 10 }} />
              <div onMouseDown={(e) => startCropHandle(e, 'tr')} onTouchStart={(e) => startCropHandle(e, 'tr')} style={{ position: 'absolute', right: -2, top: -2, width: 28, height: 28, borderRight: '4px solid white', borderTop: '4px solid white', touchAction: 'none', zIndex: 10 }} />
              <div onMouseDown={(e) => startCropHandle(e, 'bl')} onTouchStart={(e) => startCropHandle(e, 'bl')} style={{ position: 'absolute', left: -2, bottom: -2, width: 28, height: 28, borderLeft: '4px solid white', borderBottom: '4px solid white', touchAction: 'none', zIndex: 10 }} />
              <div onMouseDown={(e) => startCropHandle(e, 'br')} onTouchStart={(e) => startCropHandle(e, 'br')} style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRight: '4px solid white', borderBottom: '4px solid white', touchAction: 'none', zIndex: 10 }} />
            </div>
          </div>
          <div style={{ background: '#000', padding: '14px 24px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => { setCropBox({ x: 8, y: 8, w: 84, h: 84 }); setCropRotate(0); setTool('pen'); }} style={{ background: 'none', border: 'none', color: '#00e676', fontSize: 16, fontWeight: '600' }}>Cancel</button>
            <button onClick={rotateCrop} style={{ background: 'none', border: 'none', color: 'white', fontSize: 24 }}>⟳</button>
            <button onClick={applyCrop} style={{ background: 'none', border: 'none', color: '#00e676', fontSize: 16, fontWeight: '600' }}>Done</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#000' }} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', touchAction: 'none', filter }} />
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {drawLines.map((line: any, li: number) => (<polyline key={li} points={line.points.map((p: any) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={line.color} strokeWidth={line.size} strokeLinecap="round" strokeLinejoin="round" />))}
          </svg>
          {texts.map((t: any, i: number) => (<div key={i} onMouseDown={(e) => startDragItem(e, 'text', i)} onTouchStart={(e) => startDragItem(e, 'text', i)} style={{ position: 'absolute', left: t.x, top: t.y, color: t.color, fontSize: 28, fontWeight: 'bold', textShadow: '0 2px 4px black', cursor: 'move', touchAction: 'none', padding: '6px 10px', border: '1px dashed rgba(255,255,255,0.4)', borderRadius: 8 }}>{t.text}</div>))}
          {emojis.map((e: any, i: number) => (<div key={i} onMouseDown={(ev) => startDragItem(ev, 'emoji', i)} onTouchStart={(ev) => startDragItem(ev, 'emoji', i)} style={{ position: 'absolute', left: e.x, top: e.y, fontSize: 40, cursor: 'move', touchAction: 'none' }}>{e.emoji}</div>))}
          {showTextInput && (
            <div style={{ position: 'absolute', top: '35%', left: 16, right: 16, background: 'rgba(0,0,0,0.9)', borderRadius: 16, padding: 14, zIndex: 30 }}>
              <input autoFocus value={directText} onChange={e => setDirectText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmDirectText(); }} placeholder="Type here..." style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontSize: 18, background: '#222', color: 'white', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{COLORS.map(c => (<div key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '3px solid white' : '1px solid #555' }} />))}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => setShowTextInput(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#333', color: 'white' }}>Cancel</button>
                <button onClick={confirmDirectText} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#00a884', color: 'white', fontWeight: 'bold' }}>Add + Drag</button>
              </div>
            </div>
          )}
        </div>
      )}
      {tool !== 'crop' && (
        <div style={{ background: '#000', padding: '6px 12px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          <span style={{ color: '#aaa', fontSize: 11, whiteSpace: 'nowrap', alignSelf: 'center' }}>Filters</span>
          {FILTERS.map(f => (<button key={f.n} onClick={() => setFilter(f.v)} style={{ background: filter === f.v ? '#00a884' : '#222', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 20, fontSize: 12, whiteSpace: 'nowrap' }}>{f.n}</button>))}
        </div>
      )}
      {tool === 'pen' && (
        <div style={{ background: '#111', padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 8 }}>{COLORS.map(c => (<div key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '3px solid white' : '2px solid #555', cursor: 'pointer', flexShrink: 0 }} />))}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'white' }}><span style={{ fontSize: 11 }}>Thin</span><input type="range" min={1} max={20} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ flex: 1 }} /><span style={{ fontSize: 11 }}>Thick</span></div>
        </div>
      )}
      {tool === 'eraser' && (
        <div style={{ background: '#3a0a0a', padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <p style={{ color: 'white', fontSize: 12, margin: 0, flex: 1 }}>🧽 Rub pen line to erase am</p>
          <button onClick={() => setDrawLines([])} style={{ background: '#ff5252', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12 }}>Erase All</button>
        </div>
      )}
      <div style={{ background: '#000', padding: '10px 12px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, background: '#222', borderRadius: 24, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🖼️</span>
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption..." style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: 15 }} />
        </div>
        <button onClick={handleSend} style={{ width: 52, height: 52, borderRadius: '50%', background: '#00a884', color: 'white', border: 'none', fontSize: 22, flexShrink: 0 }}>➤</button>
      </div>
    </div>
  );
    }

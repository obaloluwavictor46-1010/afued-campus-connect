import { useEffect, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Play, Pause, Music2, Download, Repeat2, Pin, PinOff, MoreVertical, Pencil, Trash2, Share2, Link2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./AppShell";
import { shortFaculty, supabase, type Profile } from "@/lib/supabase";
import { MediaGallery } from "./MediaView";
import { downloadAFUEDVideoSimple, getBunnyStreamPosterUrl, getBunnyVideoId } from "@/lib/bunny";
import { useAuth } from "@/lib/auth";

// ===== GLOBAL: Only 1 video / audio fit play at a time =====
function pauseAllOthers(except?: HTMLMediaElement | null) {
  document.querySelectorAll("video, audio").forEach((el: any) => {
    if (el !== except) { try { el.pause(); } catch {} }
  });
  document.querySelectorAll("iframe").forEach((f: any) => {
    try { f.contentWindow?.postMessage({ action: "pause" }, "*"); } catch {}
  });
}

// ===== STEP 1: Build MP4 from video link itself =====
function parseBunny(src: string) {
  if (!src.includes("iframe.mediadelivery.net")) return null;
  const parts = src.split("/");
  const lib = parts[4] || "";
  const id = (parts[5] || "").split("?")[0].split("#")[0] || "";
  if (!lib || !id) return null;
  return { lib, id };
}

function buildBunnyMp4(src: string, quality: string): string {
  const p = parseBunny(src);
  if (p) return `https://vz-${p.lib}.b-cdn.net/${p.id}/play_${quality}.mp4`;
  return src;
}

function toPosterUrl(src: string, fallback: string): string {
  if (fallback) return fallback;
  if (src.includes("iframe.mediadelivery.net")) {
    const p = getBunnyStreamPosterUrl(src);
    if (p) return p;
  }
  return "";
}

// ===== STEP 1 + 2 + 3: TikTokVideo =====
function TikTokVideo({ src, authorName, posterUrl }: { src: string; authorName: string; posterUrl?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [useIframe, setUseIframe] = useState(false);
  const [qualityIndex, setQualityIndex] = useState(0);
  const [posterOk, setPosterOk] = useState(true);

  const isStream = src.includes("iframe.mediadelivery.net");
  const qualities = ["720p", "480p", "360p", "240p"];
  const directSrc = isStream ? buildBunnyMp4(src, qualities[qualityIndex] || "720p") : src;
  const poster = toPosterUrl(src, posterUrl || "");

  useEffect(() => {
    const onAnyPlay = (e: any) => {
      const target = e.target as HTMLMediaElement;
      const mine = videoRef.current;
      if (!mine) return;
      if (target === mine) {
        document.querySelectorAll("video, audio").forEach((el: any) => {
          if (el !== mine) { try { el.pause(); } catch {} }
        });
      } else {
        if (!mine.paused) { try { mine.pause(); } catch {} }
      }
    };
    document.addEventListener("play", onAnyPlay, true);
    return () => document.removeEventListener("play", onAnyPlay, true);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const getVideo = () => videoRef.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        const v = getVideo();
        if (!v) return;
        if (entry.intersectionRatio < 0.5 && !v.paused) {
          try { v.pause(); } catch {}
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    obs.observe(wrap);
    const onScroll = () => {
      const v = getVideo();
      if (!v || v.paused) return;
      const rect = wrap.getBoundingClientRect();
      const windowH = window.innerHeight;
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, windowH);
      const visibleHeight = visibleBottom - visibleTop;
      const visibleRatio = rect.height > 0 ? visibleHeight / rect.height : 0;
      if (visibleRatio < 0.5) {
        try { v.pause(); } catch {}
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("touchmove", onScroll, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("touchmove", onScroll);
    };
  }, [directSrc, useIframe]);

  const handleError = () => {
    if (isStream && qualityIndex < qualities.length - 1) {
      setQualityIndex((i) => i + 1);
      return;
    }
    if (isStream) {
      setUseIframe(true);
      return;
    }
  };

  if (useIframe) {
    return (
      <div className="relative w-full bg-black overflow-hidden" style={{ height: 380 }}>
        <iframe src={src} className="w-full h-full" style={{ border: 0 }} allow="autoplay; fullscreen" allowFullScreen title="AFUED Video" />
        <button onClick={() => { setUseIframe(false); setQualityIndex(0); }} className="absolute top-2 right-2 z-30 bg-black/70 text-white text-[10px] px-2 py-1 rounded-full">
          Try MP4 again
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full bg-black overflow-hidden">
      <video
        key={`${qualityIndex}`}
        ref={videoRef}
        src={directSrc}
        poster={poster && posterOk ? poster : undefined}
        playsInline
        preload="metadata"
        controls
        onError={handleError}
        onPlay={() => pauseAllOthers(videoRef.current)}
        className="w-full max-h-[520px] min-h-[280px] bg-zinc-900 object-contain"
      />
      {!posterOk && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#00a884]/40 via-zinc-900 to-black">
          <span className="text-[80px] font-black text-white/20">{authorName.charAt(0).toUpperCase()}</span>
        </div>
      )}
      {poster && (
        <img src={poster} alt="" className="hidden" onError={() => setPosterOk(false)} />
      )}
      <div className="absolute bottom-10 left-2 z-30 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
        AFUED • @{authorName} • afuedconnect
      </div>
      <button
        onClick={async (e) => {
          e.stopPropagation();
          setIsDownloading(true);
          try { await downloadAFUEDVideoSimple(src, authorName); } finally { setIsDownloading(false); }
        }}
        disabled={isDownloading}
        className="absolute bottom-2 right-2 z-30 bg-black/70 hover:bg-black/90 text-white text-[11px] px-3 py-1.5 rounded-full flex items-center gap-1 backdrop-blur"
      >
        <Download className="h-3 w-3" />
        {isDownloading ? " ..." : " Download"}
      </button>
    </div>
  );
}

export function PostCard({ post, author, commentCount, onComments, onDeleted }: { post: any; author?: Profile | undefined; commentCount: number; onComments: () => void; onDeleted?: () => void }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liking, setLiking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [repostCount, setRepostCount] = useState(0);
  const [myReposted, setMyReposted] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [isPinned, setIsPinned] = useState(!!post.is_pinned);
  const [pinning, setPinning] = useState(false);
  const postOwnerId = post.user_id || post.author_id || post.profiles?.id || author?.id;
  const isOwnPost = !!user?.id && !!postOwnerId && user.id === postOwnerId;

  const musicUrl = (post as any).music_url as string | undefined;
  const videoUrl = (post as any).video_url as string | undefined;
  const authorName = author?.full_name || post.profiles?.full_name || "student";
  const posterUrl = (post as any).poster_url || (post as any).thumbnail_url || "";

  // ===== STEP 4: 3-dot menu state =====
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.content || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: any) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, [menuOpen]);

  useEffect(() => { setIsPinned(!!post.is_pinned); }, [post.is_pinned]);
  useEffect(() => { setEditText(post.content || ""); }, [post.content]);

  // ===== STEP 4: EDIT =====
  const saveEdit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("posts").update({ content: editText }).eq("id", post.id);
      if (error) throw error;
      post.content = editText;
      setIsEditing(false);
      setMenuOpen(false);
      toast.success("Post updated ✅");
    } catch (e: any) {
      console.log("EDIT ERROR:", e);
      if (e.code === "42501") toast.error("Policy block edit (42501) - run posts policy SQL");
      else toast.error(`Edit failed: ${e.message || "Unknown"}`);
    } finally { setSaving(false); }
  };

  // ===== STEP 4: DELETE - Press twice =====
  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (deleting) return;
    setDeleting(true);
    try {
      try { document.querySelectorAll("video, audio").forEach((el: any) => el.pause()); } catch {}
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      if (error) throw error;
      toast.success("Post deleted 🗑️");
      setIsDeleted(true);
      if (onDeleted) onDeleted();
    } catch (e: any) {
      console.log("DELETE ERROR:", e);
      if (e.code === "42501") toast.error("Policy block delete (42501) - run posts policy SQL");
      else toast.error(`Delete failed: ${e.message || "Unknown"}`);
    } finally { setDeleting(false); setMenuOpen(false); setConfirmDelete(false); }
  };

  // ===== STEP 4: SHARE / COPY LINK =====
  const postLink = `${window.location.origin}/post/${post.id}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(postLink);
      toast.success("Link copied! Send am to anybody");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = postLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("Link copied!");
    }
    setMenuOpen(false);
  };

  const sharePost = async () => {
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ title: "AFUED Connect", text: post.content || "Check this post", url: postLink });
        setMenuOpen(false);
        return;
      } catch {}
    }
    copyLink();
  };

  if (isDeleted) return null;

  const loadLikes = async () => {
    const { data, error } = await supabase.from("likes").select("id, user_id").eq("post_id", post.id);
    if (error) { console.log("LOAD LIKE ERROR:", error.code, error.message); return; }
    setLikeCount((data || []).length);
    if (user?.id) setLiked((data || []).some((r: any) => r.user_id === user.id));
  };

  useEffect(() => { loadLikes(); }, [post.id, user?.id]);

  const toggleLike = async () => {
    if (!user) { toast.error("Login first"); return; }
    if (liking) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => wasLiked ? Math.max(0, c - 1) : c + 1);
    setLiking(true);
    try {
      if (wasLiked) {
        const { error } = await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("likes").insert({ post_id: post.id, user_id: user.id });
        if (error) throw error;
      }
    } catch (e: any) {
      setLiked(wasLiked);
      setLikeCount(c => wasLiked ? c + 1 : Math.max(0, c - 1));
      console.log("LIKE REAL ERROR:", e);
      if (e.code === "42P01") toast.error("Likes table never create yet - run likes SQL first");
      else if (e.code === "42501") toast.error("Policy still block am (42501) - run likes policy SQL again");
      else if (e.code === "23505") { setLiked(true); }
      else toast.error(`Like failed: ${e.message || "Unknown"}`);
    } finally { setLiking(false); }
  };

  const togglePin = async () => {
    if (!user) { toast.error("Login first"); return; }
    if (!isOwnPost) return;
    if (pinning) return;
    setPinning(true);
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    try {
      if (newPinned) {
        await supabase.from("posts").update({ is_pinned: false }).eq("user_id", user.id).eq("is_pinned", true);
      }
      const { error } = await supabase.from("posts").update({ is_pinned: newPinned }).eq("id", post.id);
      if (error) throw error;
      toast.success(newPinned ? "📌 Pinned! E go stay for top of your Profile" : "Unpinned");
      if (newPinned) setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      setIsPinned(!newPinned);
      console.log("PIN ERROR:", e);
      if (e.code === "42703") toast.error("Run Step 1 SQL first - is_pinned column never add yet");
      else toast.error(`Pin failed: ${e.message || "Unknown"}`);
    } finally { setPinning(false); }
  };

  useEffect(() => {
    let cancelled = false;
    const loadRepost = async () => {
      const { data, error } = await supabase.from("reposts").select("id, user_id").eq("post_id", post.id);
      if (cancelled) return;
      if (error) { console.log("LOAD REPOST ERROR:", error.code, error.message); return; }
      setRepostCount((data || []).length);
      if (user?.id) setMyReposted((data || []).some((r: any) => r.user_id === user.id));
    };
    loadRepost();
    return () => { cancelled = true; };
  }, [post.id, user?.id]);

  const handleRepost = async () => {
    if (!user) { toast.error("Login first"); return; }
    if (reposting) return;
    setReposting(true);
    try {
      if (myReposted) {
        const { error } = await supabase.from("reposts").delete().eq("user_id", user.id).eq("post_id", post.id);
        if (error) throw error;
        toast.success("Repost removed");
        setMyReposted(false);
        setRepostCount(c => Math.max(0, c - 1));
      } else {
        const { error } = await supabase.from("reposts").insert({ user_id: user.id, post_id: post.id });
        if (error) throw error;
        toast.success("Reposted! 🔁 E go show for your profile");
        setMyReposted(true);
        setRepostCount(c => c + 1);
      }
    } catch (e: any) {
      console.log("REPOST REAL ERROR:", e);
      if (e.code === "42P01") toast.error("Repost table never create yet - run SQL for reposts first");
      else if (e.code === "23505") { toast.error("You don repost this one before"); setMyReposted(true); }
      else if (e.code === "42501") toast.error("Policy still block am (42501) - run policy SQL again");
      else toast.error(`Repost failed: ${e.code || ""} - ${e.message || "Unknown error"}`);
    } finally { setReposting(false); }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onAudioPlay = () => {
      document.querySelectorAll("video").forEach((v: any) => { try { v.pause(); } catch {} });
      setPlaying(true);
    };
    const onAudioPause = () => setPlaying(false);
    audio.addEventListener("play", onAudioPlay);
    audio.addEventListener("pause", onAudioPause);
    return () => { audio.removeEventListener("play", onAudioPlay); audio.removeEventListener("pause", onAudioPause); };
  }, [musicUrl]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const onScrollMusic = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      const rect = card.getBoundingClientRect();
      const windowH = window.innerHeight;
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, windowH);
      const visibleHeight = visibleBottom - visibleTop;
      const visibleRatio = rect.height > 0 ? visibleHeight / rect.height : 0;
      if (visibleRatio < 0.3) { audio.pause(); setPlaying(false); }
    };
    const obs = new IntersectionObserver(
      ([entry]) => {
        const audio = audioRef.current;
        if (!entry.isIntersecting && audio) { audio.pause(); setPlaying(false); }
      },
      { threshold: 0 }
    );
    obs.observe(card);
    window.addEventListener("scroll", onScrollMusic, { passive: true });
    document.addEventListener("touchmove", onScrollMusic, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScrollMusic);
      document.removeEventListener("touchmove", onScrollMusic);
    };
  }, []);

  let imageUrls: string[] = [];
  try {
    const raw = post.image_urls || post.image_url || [];
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      imageUrls = Array.isArray(parsed) ? parsed : [parsed];
    } else if (Array.isArray(raw)) { imageUrls = raw; }
  } catch {
    const raw = post.image_urls || post.image_url || "";
    if (typeof raw === 'string' && raw.startsWith('http')) imageUrls = [raw];
  }
  imageUrls = imageUrls.filter((u: any) => typeof u === 'string' && u.startsWith('http'));

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { pauseAllOthers(audioRef.current); audioRef.current.play(); setPlaying(true); }
  };

  return (
    <article ref={cardRef} className={`relative overflow-hidden rounded-2xl border bg-card shadow-card ${isPinned ? "ring-2 ring-amber-400/60" : ""}`}>
      {isPinned && (
        <div className="flex items-center gap-1.5 bg-amber-50 px-4 py-1.5 text-[11px] font-bold text-amber-700">
          <Pin className="h-3 w-3 fill-amber-500 text-amber-500" /> Pinned Post
        </div>
      )}
      <div className="flex items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar url={author?.avatar_url} name={author?.full_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{author?.full_name || "AFUED Student"}</p>
            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
          </div>
        </div>
        {post.faculty_channel && (
          <span className="max-w-[45%] truncate rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
            {shortFaculty(post.faculty_channel)}
          </span>
        )}
        {isOwnPost && (
          <button onClick={togglePin} disabled={pinning} title={isPinned ? "Unpin this post" : "Pin to top of Profile"} className={`shrink-0 rounded-full p-2 transition active:scale-95 ${isPinned ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        )}

        {/* ===== STEP 4: 3-DOT MENU ===== */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); setConfirmDelete(false); }}
            className="rounded-full p-2 hover:bg-zinc-100 active:scale-95 active:bg-zinc-200"
            title="More"
          >
            <MoreVertical className="h-5 w-5 text-zinc-600" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-xl border bg-white shadow-xl">
              {isOwnPost && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(true); setMenuOpen(false); setEditText(post.content || ""); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-zinc-50 active:bg-zinc-100"
                  >
                    <Pencil className="h-4 w-4 text-zinc-600" /> Edit Post
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium active:bg-red-50 ${confirmDelete ? "bg-red-50 text-red-700 font-bold" : "text-red-600 hover:bg-red-50"}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "Deleting..." : confirmDelete ? "⚠️ Tap again to DELETE" : "Delete Post"}
                  </button>
                  {confirmDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                      className="w-full px-4 py-2 text-center text-xs text-zinc-500 hover:bg-zinc-50"
                    >
                      Cancel - No delete
                    </button>
                  )}
                  <div className="h-px bg-zinc-100" />
                </>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); sharePost(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-zinc-50 active:bg-zinc-100"
              >
                <Share2 className="h-4 w-4 text-zinc-600" /> Share Post
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); copyLink(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-zinc-50 active:bg-zinc-100"
              >
                <Link2 className="h-4 w-4 text-zinc-600" /> Copy Link
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-center text-xs text-zinc-400 hover:bg-zinc-50"
              >
                <X className="h-3 w-3" /> Close
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== STEP 4: EDIT BOX ===== */}
      {isEditing ? (
        <div className="mx-4 mb-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
          <p className="mb-2 text-xs font-bold">✏️ Edit your post:</p>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border bg-white p-2.5 text-[15px] outline-none focus:border-primary"
            placeholder="Write something..."
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveEdit} disabled={saving} className="flex flex-1 items-center justify-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              <Check className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => { setIsEditing(false); setEditText(post.content || ""); }} className="flex-1 rounded-full bg-zinc-200 px-4 py-2 text-sm font-bold">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        post.content && <p className="whitespace-pre-wrap px-4 pb-3 text-[15px] leading-relaxed">{post.content}</p>
      )}

      <div className="relative">
        <MediaGallery urls={imageUrls} />
        {musicUrl && imageUrls.length > 0 && (
          <button onClick={togglePlay} className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-white backdrop-blur text-xs font-semibold hover:bg-black/80">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <Music2 className="h-3 w-3" />
            {playing ? "Pause music" : "Play music"}
          </button>
        )}
      </div>
      {videoUrl && !imageUrls.length && (
        <TikTokVideo src={videoUrl} authorName={authorName} posterUrl={posterUrl} />
      )}
      {musicUrl && imageUrls.length === 0 && !videoUrl && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary/20 to-accent/20 p-3 border">
          <button onClick={togglePlay} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold flex items-center gap-1"><Music2 className="h-3 w-3" /> Music attached</p>
            <p className="text-[11px] text-muted-foreground truncate">Tap to play vibe 🎵</p>
          </div>
        </div>
      )}
      {musicUrl && <audio ref={audioRef} src={musicUrl} onEnded={() => setPlaying(false)} preload="none" />}
      <div className="flex items-center gap-5 px-4 py-3">
        <button onClick={toggleLike} className="flex items-center gap-1.5 text-sm font-medium active:scale-95 transition">
          <Heart className={`h-6 w-6 transition ${liked ? "fill-like text-like scale-110" : ""}`} />
          {likeCount}
        </button>
        <button onClick={onComments} className="flex items-center gap-1.5 text-sm font-medium">
          <MessageCircle className="h-6 w-6" /> {commentCount}
        </button>
        <button onClick={handleRepost} disabled={reposting} className={`flex items-center gap-1.5 text-sm font-medium ${myReposted ? "text-green-600" : ""}`}>
          <Repeat2 className={`h-6 w-6 transition ${myReposted ? "text-green-600 scale-110" : ""}`} />
          {repostCount}
        </button>
        {myReposted && <span className="text-[11px] font-semibold text-green-600">Reposted</span>}
        {musicUrl && <span className="ml-auto flex items-center gap-1 text-[11px] text-primary font-bold"><Music2 className="h-3 w-3" /> MP3</span>}
      </div>
    </article>
  );
}

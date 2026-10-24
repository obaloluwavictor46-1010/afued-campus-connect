import { useEffect, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Play, Pause, Music2, Download, Repeat2, Pin, PinOff } from "lucide-react";
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
  // Also try pause Bunny iframes
  document.querySelectorAll("iframe").forEach((f: any) => {
    try { f.contentWindow?.postMessage({ action: "pause" }, "*"); } catch {}
  });
}

// ===== STEP 1 FIX: Build MP4 from video link itself, no Vercel wahala =====
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

// ===== STEP 1 + STEP 2: TikTokVideo =====
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

  // ===== STEP 2 MAIN FIX: Global play listener =====
  // If ANY video/audio for page start, pause this one. If MY OWN start, pause others.
  // capture: true = we catch am before sound go mix even for 1 second.
  useEffect(() => {
    const onAnyPlay = (e: any) => {
      const target = e.target as HTMLMediaElement;
      const mine = videoRef.current;
      if (!mine) return;
      if (target === mine) {
        // Na my own dey play - pause everybody else
        document.querySelectorAll("video, audio").forEach((el: any) => {
          if (el !== mine) { try { el.pause(); } catch {} }
        });
      } else {
        // Na another person dey play - pause mine
        if (!mine.paused) { try { mine.pause(); } catch {} }
      }
    };
    document.addEventListener("play", onAnyPlay, true);
    return () => document.removeEventListener("play", onAnyPlay, true);
  }, []);

  // Pause when scroll comot - Step 3 go make am stronger, but keep this one for now
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) {
          try { videoRef.current?.pause(); } catch {}
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(wrap);
    return () => obs.disconnect();
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

export function PostCard({ post, author, commentCount, onComments }: { post: any; author?: Profile | undefined; commentCount: number; onComments: () => void }) {
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

  useEffect(() => { setIsPinned(!!post.is_pinned); }, [post.is_pinned]);

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

  // ===== STEP 2: Music audio self go join the "only 1 play" rule =====
  // If video start, music go pause. If music start, video go pause.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onAudioPlay = () => {
      // Music start - pause all videos
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
    const audio = audioRef.current;
    if (!card) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting && audio) { audio.pause(); setPlaying(false); } },
      { threshold: 0 }
    );
    obs.observe(card);
    return () => obs.disconnect();
  }, []);

  const musicUrl = (post as any).music_url as string | undefined;
  const videoUrl = (post as any).video_url as string | undefined;
  const authorName = author?.full_name || post.profiles?.full_name || "student";
  const posterUrl = (post as any).poster_url || (post as any).thumbnail_url || "";

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
    <article ref={cardRef} className={`overflow-hidden rounded-2xl border bg-card shadow-card ${isPinned ? "ring-2 ring-amber-400/60" : ""}`}>
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
      </div>
      {post.content && <p className="whitespace-pre-wrap px-4 pb-3 text-[15px] leading-relaxed">{post.content}</p>}
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

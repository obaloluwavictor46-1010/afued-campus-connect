import { useEffect, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Play, Pause, Music2, Download, Repeat2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./AppShell";
import { shortFaculty, supabase, type Profile } from "@/lib/supabase";
import { MediaGallery } from "./MediaView";
import { downloadVideoWithAFUEDWatermark, downloadAFUEDVideoSimple } from "@/lib/bunny";
import { useAuth } from "@/lib/auth";

// VIDEO - FIXED NO SUPABASE: Use video itself to show face, no hidden poster, no CORS wahala
function AutoPauseVideo({ src, authorName }: { src: string; authorName: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dlProgress, setDlProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const displaySrc = src.includes("#t=") ? src : `${src}#t=0.5`;
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) {
          try { videoRef.current?.pause(); } catch {}
        }
      },
      { threshold: 0.5, rootMargin: "0px" }
    );
    obs.observe(wrap);
    return () => obs.disconnect();
  }, [src, retryKey]);
  const handlePlay = () => {
    document.querySelectorAll('video, audio').forEach((el: any) => {
      if (el !== videoRef.current) { try { el.pause(); } catch {} }
    });
    document.querySelectorAll('iframe').forEach((f: any) => {
      if (f.src && f.src !== "about:blank" && f.src.includes("iframe.mediadelivery.net")) {
        try { f.dataset.savedSrc = f.src; f.src = "about:blank"; } catch {}
      }
    });
  };
  const handleError = () => setHasError(true);
  const handleRetry = () => {
    setHasError(false);
    setRetryKey(k => k + 1);
    setTimeout(() => { try { videoRef.current?.load(); } catch {} }, 100);
  };
  return (
    <div ref={wrapRef} className="relative w-full bg-zinc-900 group overflow-hidden min-h-[280px]">
      <video
        key={retryKey}
        ref={videoRef}
        src={displaySrc}
        controls
        playsInline
        preload="metadata"
        onPlay={handlePlay}
        onError={handleError}
        onClick={() => { if (hasError) handleRetry(); }}
        className="relative z-10 w-full max-h-[480px] bg-zinc-900 object-contain"
      />
      {hasError && (
        <button onClick={handleRetry} className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-white text-sm font-semibold gap-2">
          <span className="text-3xl">↻</span>
          <span>Video no load? Tap to resurrect</span>
          <span className="text-xs text-white/70">E never delete, na network</span>
        </button>
      )}
      <div className="absolute bottom-10 left-2 z-20 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
        AFUED • @{authorName} • afuedconnect
      </div>
      <button
        onClick={async (e)=>{
          e.stopPropagation()
          setIsDownloading(true)
          try { await downloadVideoWithAFUEDWatermark(src, authorName, (p)=>setDlProgress(p)) } finally { setIsDownloading(false); setDlProgress(0) }
        }}
        disabled={isDownloading}
        className="absolute bottom-2 right-2 z-20 bg-black/70 hover:bg-black/90 text-white text-[11px] px-3 py-1.5 rounded-full flex items-center gap-1 backdrop-blur"
      >
        <Download className="h-3 w-3" />
        {isDownloading ? ` ${dlProgress}%` : " Download"}
      </button>
      {isDownloading && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20">
          <div className="h-full bg-[#00a884] transition-all duration-200" style={{width: `${dlProgress}%`}}></div>
        </div>
      )}
    </div>
  )
}

function AutoPauseBunnyIframe({ src, authorName, posterUrl }: { src: string; authorName: string; posterUrl?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showCover, setShowCover] = useState(!!posterUrl);
  const [isNear, setIsNear] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => { setShowCover(!!posterUrl); }, [posterUrl]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNear(true);
          setIsVisible(true);
        } else {
          setIsVisible(false);
          try {
            iframeRef.current?.contentWindow?.postMessage({ action: "pause" }, "*");
          } catch {}
        }
      },
      { threshold: 0, rootMargin: "1000px 0px 1000px 0px" }
    );
    obs.observe(wrap);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!isNear) return;
    if (!posterUrl) { setShowCover(false); return; }
    const t = setTimeout(() => { setIsReady(true); setShowCover(false); }, 1800);
    return () => clearTimeout(t);
  }, [isNear, posterUrl]);
  const handleWrapClick = () => {
    document.querySelectorAll('video, audio').forEach((el: any) => {
      try { (el as HTMLMediaElement).pause(); } catch {}
    });
    setShowCover(false);
  };
  return (
    <div ref={wrapRef} onClick={handleWrapClick} className="relative w-full bg-zinc-900 overflow-hidden" style={{ height: '380px' }}>
      {isNear ? (
        <iframe
          ref={iframeRef}
          src={src}
          onLoad={() => setIsReady(true)}
          className="w-full h-full"
          style={{ border: 0, opacity: showCover ? 0 : 1, visibility: isVisible ? "visible" : "visible" }}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-900">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#00a884]" />
        </div>
      )}
      {showCover && posterUrl && isNear && (
        <button onClick={() => setShowCover(false)} className="absolute inset-0 z-20 flex h-full w-full items-center justify-center overflow-hidden bg-black text-white">
          <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 backdrop-blur">
              <Play className="ml-1 h-7 w-7 fill-white text-white" />
            </span>
            <span className="mt-3 rounded-full bg-black/70 px-4 py-1.5 text-xs font-bold backdrop-blur">
              {isReady ? "Tap to play ▶" : "Loading..."}
            </span>
          </div>
        </button>
      )}
      <div className="absolute bottom-10 left-2 z-30 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
        AFUED • @{authorName} • afuedconnect
      </div>
      <button
        onClick={async (e)=>{
          e.stopPropagation()
          setIsDownloading(true)
          try { await downloadAFUEDVideoSimple(src, authorName) } finally { setIsDownloading(false) }
        }}
        disabled={isDownloading}
        className="absolute bottom-2 right-2 z-30 bg-black/70 text-white text-[11px] px-3 py-1.5 rounded-full flex items-center gap-1"
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
  // PIN STATE - added, no touch other logic
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

  useEffect(() => {
    loadLikes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, user?.id]);

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

  // PIN HANDLER - only 1 pinned post per user
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
      if (error) {
        console.log("LOAD REPOST ERROR:", error.code, error.message);
        return;
      }
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
      if (e.code === "42P01") {
        toast.error("Repost table never create yet - run SQL for reposts first");
      } else if (e.code === "23505") {
        toast.error("You don repost this one before");
        setMyReposted(true);
      } else if (e.code === "42501") {
        toast.error("Policy still block am (42501) - run policy SQL again");
      } else {
        toast.error(`Repost failed: ${e.code || ""} - ${e.message || "Unknown error"}`);
      }
    } finally { setReposting(false); }
  };

  useEffect(() => {
    const card = cardRef.current;
    const audio = audioRef.current;
    if (!card) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && audio) { audio.pause(); setPlaying(false); }
      },
      { threshold: 0 }
    );
    obs.observe(card);
    return () => obs.disconnect();
  }, []);
  
  const musicUrl = (post as any).music_url as string | undefined;
  const videoUrl = (post as any).video_url as string | undefined;
  const isStreamVideo = videoUrl?.includes('iframe.mediadelivery.net');
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
    document.querySelectorAll('audio, video').forEach(el => {
      if (el !== audioRef.current) (el as HTMLMediaElement).pause();
    });
    document.querySelectorAll('iframe').forEach((f: any) => {
      if (f.src && f.src !== "about:blank" && f.src.includes("iframe.mediadelivery.net")) {
        try { f.dataset.savedSrc = f.src; f.src = "about:blank"; } catch {}
      }
    });
    if (playing) { audioRef.current.pause(); setPlaying(false); } else { audioRef.current.play(); setPlaying(true); }
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
          <button
            onClick={togglePin}
            disabled={pinning}
            title={isPinned ? "Unpin this post" : "Pin to top of Profile"}
            className={`shrink-0 rounded-full p-2 transition active:scale-95 ${isPinned ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
          >
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
        isStreamVideo ? <AutoPauseBunnyIframe src={videoUrl} authorName={authorName} posterUrl={posterUrl} /> : <AutoPauseVideo src={videoUrl} authorName={authorName} />
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

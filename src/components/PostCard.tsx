import { useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Play, Pause, Music2, Download, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./AppShell";
import { shortFaculty, supabase, type Profile } from "@/lib/supabase";
import { MediaGallery } from "./MediaView";
import { downloadVideoWithAFUEDWatermark, downloadAFUEDVideoSimple } from "@/lib/bunny";
import { useAuth } from "@/lib/auth";

// VIDEO - FIXED: Observer on WRAPPER, not on video. 1 observer only.
function AutoPauseVideo({ src, authorName }: { src: string; authorName: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dlProgress, setDlProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [poster, setPoster] = useState<string>("")
  const [isLoaded, setIsLoaded] = useState(false)
  const [isNear, setIsNear] = useState(false)

  useEffect(() => {
    setPoster("")
    setIsLoaded(false)
    setHasError(false)
    const v = document.createElement("video")
    v.muted = true
    v.playsInline = true
    v.preload = "metadata"
    v.crossOrigin = "anonymous"
    v.onloadeddata = () => {
      try { v.currentTime = 0.5 } catch {}
    }
    v.onseeked = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = v.videoWidth || 720
        canvas.height = v.videoHeight || 1280
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          const url = canvas.toDataURL("image/jpeg", 0.7)
          setPoster(url)
        }
      } catch {}
    }
    v.onerror = () => {}
    v.src = src.includes("#t=") ? src : `${src}#t=0.1`
  }, [src, retryKey])

  // FIXED: ONE observer on wrapper div. Near (800px) = load, Far = pause only, no blank.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setIsNear(true);
        else videoRef.current?.pause();
      },
      { threshold: 0.05, rootMargin: "800px 0px 800px 0px" }
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
    <div ref={wrapRef} className="relative w-full bg-black group overflow-hidden min-h-[280px]">
      {!isLoaded && poster && (
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {!isLoaded && !poster && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black text-white">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#00a884]" />
          <p className="mt-2 text-[11px] text-white/70">Loading video... ⏳</p>
        </div>
      )}
      <video
        key={retryKey}
        ref={videoRef}
        src={isNear ? src : undefined}
        controls
        playsInline
        preload="auto"
        poster={poster || undefined}
        onPlay={handlePlay}
        onError={handleError}
        onLoadedData={() => setIsLoaded(true)}
        onCanPlay={() => setIsLoaded(true)}
        onClick={() => { if (hasError) handleRetry(); }}
        className="relative z-10 w-full max-h-[480px] bg-black"
        style={{ opacity: isLoaded || !poster ? 1 : 0.01 }}
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

// IFRAME - FIXED: ONE observer only. No double text. No blanking bug.
function AutoPauseBunnyIframe({ src, authorName, posterUrl }: { src: string; authorName: string; posterUrl?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showCover, setShowCover] = useState(!!posterUrl);
  const [isNear, setIsNear] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setShowCover(!!posterUrl); }, [posterUrl]);

  // FIXED: ONE observer does preload + pause. No second observer to fight am.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // Near = 1000px away (2-3 videos under) -> start loading for background
        if (entry.isIntersecting) {
          setIsNear(true);
          setIsVisible(true);
        } else {
          // Far away -> pause via postMessage, DON'T blank src, so preload no die
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

  // Auto-hide cover when iframe don load
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
    <div ref={wrapRef} onClick={handleWrapClick} className="relative w-full bg-black overflow-hidden" style={{ height: '380px' }}>
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
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#00a884]" />
        </div>
      )}

      {/* COVER: ONLY 1 text. Old video (no poster) = no cover at all */}
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
  const key = `afued-like-${post.id}`;
  const [liked, setLiked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [repostCount, setRepostCount] = useState(0);
  const [myReposted, setMyReposted] = useState(false);
  const [reposting, setReposting] = useState(false);

  useEffect(() => setLiked(localStorage.getItem(key) === "1"), [key]);

  useEffect(() => {
    let cancelled = false;
    const loadRepost = async () => {
      const { data, error } = await supabase.from("reposts").select("id, user_id").eq("post_id", post.id);
      if (cancelled || error) return;
      setRepostCount((data || []).length);
      if (user?.id) setMyReposted((data || []).some((r: any) => r.user_id === user.id));
    };
    loadRepost();
    const ch = supabase.channel(`repost-${post.id}`).on("postgres_changes", { event: "*", schema: "public", table: "reposts", filter: `post_id=eq.${post.id}` }, loadRepost).subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
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
      if (e.message?.includes("reposts") || e.code === "42P01") {
        toast.error("Repost table never create yet - run SQL for reposts first");
      } else toast.error(e.message || "Repost failed");
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
  
  const toggle = () => { localStorage.setItem(key, liked ? "0" : "1"); setLiked(!liked); };

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
    <article ref={cardRef} className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="flex items-center gap-3 p-4">
        <Link to="/u/$userId" params={{ userId: post.user_id }} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar url={author?.avatar_url} name={author?.full_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold hover:underline">{author?.full_name || "AFUED Student"}</p>
            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
          </div>
        </Link>
        {post.faculty_channel && (
          <span className="max-w-[45%] truncate rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
            {shortFaculty(post.faculty_channel)}
          </span>
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
        <button onClick={toggle} className="flex items-center gap-1.5 text-sm font-medium">
          <Heart className={`h-6 w-6 transition ${liked ? "fill-like text-like scale-110" : ""}`} />
          {liked ? 1 : 0}
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

import { useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Play, Pause, Music2 } from "lucide-react";
import { Avatar } from "./AppShell";
import { shortFaculty, type Profile } from "@/lib/supabase";
import { MediaGallery } from "./MediaView";

// VIDEO - MUST PAUSE WHEN COMOT
function AutoPauseVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (!e.isIntersecting) video.pause(); },
      { threshold: 0, rootMargin: "0px 0px -100px 0px" }
    );
    obs.observe(video);
    return () => obs.disconnect();
  }, [src]);
  return <video ref={videoRef} src={src} controls playsInline preload="metadata" className="w-full max-h-[480px] bg-black" />;
}

// IFRAME - FORCE KILL SOUND WHEN COMOT
function AutoPauseBunnyIframe({ src }: { src: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savedSrc = useRef(src);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        if (!entry.isIntersecting) {
          // THIS LINE KILL SOUND BY FORCE!
          if (iframe.src !== "about:blank") {
            savedSrc.current = iframe.src;
            iframe.src = "about:blank";
          }
        } else {
          if (iframe.src === "about:blank") {
            iframe.src = savedSrc.current;
          }
        }
      },
      { threshold: 0 }
    );
    obs.observe(wrap);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full bg-black" style={{ height: '380px' }}>
      <iframe ref={iframeRef} src={src} className="w-full h-full" style={{ border: 0 }} allow="autoplay; fullscreen" allowFullScreen />
    </div>
  );
}

export function PostCard({ post, author, commentCount, onComments }: { post: any; author?: Profile | undefined; commentCount: number; onComments: () => void }) {
  const key = `afued-like-${post.id}`;
  const [liked, setLiked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  
  useEffect(() => setLiked(localStorage.getItem(key) === "1"), [key]);

  useEffect(() => {
    const card = cardRef.current;
    const audio = audioRef.current;
    if (!card) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && audio) {
          audio.pause();
          setPlaying(false);
        }
      },
      { threshold: 0 }
    );
    obs.observe(card);
    return () => obs.disconnect();
  }, []);
  
  const toggle = () => {
    localStorage.setItem(key, liked ? "0" : "1");
    setLiked(!liked);
  };

  const musicUrl = (post as any).music_url as string | undefined;
  const videoUrl = (post as any).video_url as string | undefined;
  const isStreamVideo = videoUrl?.includes('iframe.mediadelivery.net');
  
  let imageUrls: string[] = [];
  try {
    const raw = post.image_urls || post.image_url || [];
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      imageUrls = Array.isArray(parsed) ? parsed : [parsed];
    } else if (Array.isArray(raw)) {
      imageUrls = raw;
    }
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
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
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
        isStreamVideo ? <AutoPauseBunnyIframe src={videoUrl} /> : <AutoPauseVideo src={videoUrl} />
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
        {musicUrl && <span className="ml-auto flex items-center gap-1 text-[11px] text-primary font-bold"><Music2 className="h-3 w-3" /> MP3</span>}
      </div>
    </article>
  );
}

import { useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle, Play, Pause, Music2 } from "lucide-react";
import { Avatar } from "./AppShell";
import { shortFaculty, type Post, type Profile } from "@/lib/supabase";
import { MediaGallery } from "./MediaView";

export function PostCard({ post, author, commentCount, onComments }: { post: any; author?: Profile | undefined; commentCount: number; onComments: () => void }) {
  const key = `afued-like-${post.id}`;
  const [liked, setLiked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => setLiked(localStorage.getItem(key) === "1"), [key]);
  
  const toggle = () => {
    localStorage.setItem(key, liked ? "0" : "1");
    setLiked(!liked);
  };

  const musicUrl = (post as any).music_url as string | undefined;
  const videoUrl = (post as any).video_url as string | undefined;
  
  // --- FIXED BUNNY IMAGE PARSER - NO MORE mediaOf ---
  let imageUrls: string[] = [];
  try {
    const raw = post.image_urls || post.image_url || [];
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      imageUrls = Array.isArray(parsed) ? parsed : [parsed];
    } else if (Array.isArray(raw)) {
      imageUrls = raw;
    } else if (typeof raw === 'string' && raw.startsWith('http')) {
      imageUrls = [raw];
    }
  } catch {
    const raw = post.image_urls || post.image_url || "";
    if (typeof raw === 'string' && raw.startsWith('http')) imageUrls = [raw];
  }
  imageUrls = imageUrls.filter((u: any) => typeof u === 'string' && u.startsWith('http'));

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-card">
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
          <button 
            onClick={togglePlay}
            className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-white backdrop-blur text-xs font-semibold hover:bg-black/80"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <Music2 className="h-3 w-3" />
            {playing ? "Pause music" : "Play music"}
          </button>
        )}
      </div>

      {videoUrl && !imageUrls.length && (
        <video src={videoUrl} controls className="w-full max-h-[480px] bg-black" />
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

      {musicUrl && (
        <audio ref={audioRef} src={musicUrl} onEnded={() => setPlaying(false)} preload="none" />
      )}

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

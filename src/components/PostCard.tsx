import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle } from "lucide-react";
import { Avatar } from "./AppShell";
import { kindOfUrl, shortFaculty, type Post, type Profile } from "@/lib/supabase";
import { MediaView } from "./MediaView";

export function PostCard({ post, author, commentCount, onComments }: { post: Post; author?: Profile | undefined; commentCount: number; onComments: () => void }) {
  const key = `afued-like-${post.id}`;
  const [liked, setLiked] = useState(false);
  useEffect(() => setLiked(localStorage.getItem(key) === "1"), [key]);
  const toggle = () => {
    localStorage.setItem(key, liked ? "0" : "1");
    setLiked(!liked);
  };
  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="flex items-center gap-3 p-4">
        <Avatar url={author?.avatar_url} name={author?.full_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{author?.full_name || "AFUED Student"}</p>
          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
        </div>
        {post.faculty_channel && (
          <span className="max-w-[45%] truncate rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
            {shortFaculty(post.faculty_channel)}
          </span>
        )}
      </div>
      {post.content && <p className="whitespace-pre-wrap px-4 pb-3 text-[15px] leading-relaxed">{post.content}</p>}
      {post.image_url && <MediaView url={post.image_url} className={kindOfUrl(post.image_url) === "file" ? "mx-4 mb-1" : ""} />}
      <div className="flex items-center gap-5 px-4 py-3">
        <button onClick={toggle} className="flex items-center gap-1.5 text-sm font-medium">
          <Heart className={`h-6 w-6 transition ${liked ? "fill-like text-like scale-110" : ""}`} />
          {liked ? 1 : 0}
        </button>
        <button onClick={onComments} className="flex items-center gap-1.5 text-sm font-medium">
          <MessageCircle className="h-6 w-6" /> {commentCount}
        </button>
      </div>
    </article>
  );
}

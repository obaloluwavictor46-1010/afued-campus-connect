import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { AppShell, Avatar } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { CommentsSheet } from "@/components/CommentsSheet";
import { supabase, type Post, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/u/$userId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Student Profile — AFUED Community" },
      { name: "description", content: "View an AFUED student's profile and posts, and message them." },
      { property: "og:title", content: "Student Profile — AFUED Community" },
      { property: "og:description", content: "View an AFUED student's profile and posts." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell title="Profile"><UserPage /></AppShell>,
});

function UserPage() {
  const { userId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [p, setP] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id === userId) { navigate({ to: "/profile", replace: true }); return; }
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle().then(({ data }) => setP(data as Profile));
    supabase.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setPosts((data ?? []) as Post[]));
  }, [userId, user?.id]);

  return (
    <div className="space-y-4 p-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="h-24 bg-gradient-hero" />
        <div className="-mt-12 px-5 pb-5">
          <div className="rounded-full bg-card p-1 w-fit"><Avatar url={p?.avatar_url} name={p?.full_name} size={88} /></div>
          <h2 className="mt-3 font-display text-2xl font-extrabold">{p?.full_name || "AFUED Student"}</h2>
          {p?.faculty && <span className="mt-1 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">{p.faculty}</span>}
          <p className="mt-3 text-sm"><b>{posts.length}</b> posts</p>
          <Link to="/chat/$userId" params={{ userId }} className="mt-4 flex items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow-glow">
            <MessageCircle className="h-5 w-5" /> Message
          </Link>
        </div>
      </div>
      {posts.map((x) => <PostCard key={x.id} post={x} author={p ?? undefined} commentCount={0} onComments={() => setOpen(x.id)} />)}
      <CommentsSheet postId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

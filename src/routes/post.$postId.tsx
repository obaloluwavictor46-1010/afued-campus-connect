import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, fetchProfiles, type Post, type Profile } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { Loader2, GraduationCap, Repeat2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/post/$postId")({
  component: SinglePost,
});

function SinglePost() {
  const { postId } = Route.useParams();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentCount, setCommentCount] = useState(0);

  // === ADDED: REPOST LIKE TIKTOK ===
  const [repostCount, setRepostCount] = useState(0);
  const [myReposted, setMyReposted] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [reposters, setReposters] = useState<any[]>([]);

  const loadReposts = async () => {
    const { data } = await supabase.from("reposts").select("user_id").eq("post_id", postId);
    if (!data) return;
    setRepostCount(data.length);
    if (user?.id) {
      setMyReposted((data as any[]).some((r) => r.user_id === user.id));
    }
    // Load first 3 reposter names for label
    if (data.length > 0) {
      const ids = (data as any[]).slice(0, 3).map((r) => r.user_id);
      const profs = await fetchProfiles(ids);
      setReposters(ids.map((id: string) => profs[id]).filter(Boolean));
    }
  };

  const handleRepost = async () => {
    if (!user) { toast.error("Login first to repost"); return; }
    if (reposting) return;
    setReposting(true);
    try {
      if (myReposted) {
        const { error } = await supabase.from("reposts").delete().eq("user_id", user.id).eq("post_id", postId);
        if (error) throw error;
        toast.success("Repost removed");
        setMyReposted(false);
        setRepostCount((c) => Math.max(0, c - 1));
      } else {
        const { error } = await supabase.from("reposts").insert({ user_id: user.id, post_id: postId });
        if (error) throw error;
        toast.success("Reposted! 🔁 E go show for your profile");
        setMyReposted(true);
        setRepostCount((c) => c + 1);
      }
      loadReposts();
    } catch (e: any) {
      if (e.message?.includes("reposts") || e.code === "42P01") {
        toast.error("Repost table never create yet - run SQL for reposts first");
      } else toast.error(e.message || "Repost failed");
    } finally { setReposting(false); }
  };

  const handleShare = async () => {
    if (!post) return;
    const url = window.location.href;
    const text = `🎓 AFUED COMMUNITY INVITE\n\n"${post.content.slice(0, 120)}"\n\n👉 Join AFUED gist, news & connect!\n📲 Open:\n`;
    if (navigator.share) await navigator.share({ title: "AFUED Community", text, url });
    else { await navigator.clipboard.writeText(text + url); toast.success("Link copied!"); }
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("posts").select("*").eq("id", postId).single();
      if (data) {
        setPost(data as Post);
        const profiles = await fetchProfiles([data.user_id]);
        setAuthor(profiles[data.user_id] || null);
        // === ADDED: Real comment count ===
        const { count } = await supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId);
        setCommentCount(count ?? 0);
      }
      setLoading(false);
    };
    load();
    loadReposts();
    // Live update when person repost
    const ch = supabase.channel(`single-repost-${postId}`).on("postgres_changes", { event: "*", schema: "public", table: "reposts", filter: `post_id=eq.${postId}` }, loadReposts).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [postId, user?.id]);

  useEffect(() => {
    if (post) {
      document.title = `🎓 AFUED Community - ${post.content.slice(0, 40)}`;
      let metaImg = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
      if (!metaImg) {
        metaImg = document.createElement('meta') as HTMLMetaElement;
        metaImg.setAttribute('property', 'og:image');
        document.head.appendChild(metaImg);
      }
      metaImg.content = `${window.location.origin}/Afued-logo.jpg`;
    }
  }, [post]);

  if (loading) return <AppShell><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div></AppShell>;

  if (!post) {
    return (
      <AppShell>
        <div className="text-center py-20 px-4">
          <h1 className="text-3xl font-bold">Post no dey again</h1>
          <p className="mt-2 text-muted-foreground">E don delete or e no exist</p>
          <a href="/" className="mt-6 inline-block rounded-full bg-blue-600 px-8 py-3 text-white font-bold">Go back home</a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg p-4">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-blue-600 p-4 text-white shadow-lg">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
            <GraduationCap className="h-7 w-7 text-blue-700" />
          </div>
          <div>
            <p className="font-bold">AFUED Community 🎓</p>
            <p className="text-xs opacity-90">Shared from AFUED Connect App</p>
          </div>
        </div>

        <img src="/Afued-logo.jpg" alt="AFUED Logo" className="mb-4 h-20 w-auto rounded-xl mx-auto shadow-md border-2 border-blue-100" />

        {/* === ADDED: Repost label like TikTok === */}
        {(myReposted || repostCount > 0) && (
          <div className="mb-2 flex items-center gap-1.5 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs font-bold text-green-700">
            <Repeat2 className="h-4 w-4" />
            {myReposted ? "You reposted this" : `${reposters[0]?.full_name || "Someone"} reposted this`}
            {repostCount > 1 && <span className="font-normal text-green-600">• {repostCount} reposts • 💬 {commentCount} comments</span>}
            {repostCount <= 1 && <span className="font-normal text-green-600">• 💬 {commentCount} comments</span>}
          </div>
        )}

        <PostCard post={post} author={author || undefined} commentCount={commentCount} onComments={() => {}} />

        {/* === ADDED: Big Repost + Share bar like TikTok === */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleRepost}
            disabled={reposting}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 font-bold text-sm transition ${myReposted ? "bg-green-100 text-green-700 border border-green-300" : "bg-black text-white"}`}
          >
            <Repeat2 className="h-5 w-5" />
            {reposting ? "Wait..." : myReposted ? `Reposted • ${repostCount}` : `Repost • ${repostCount}`}
          </button>
          <button onClick={handleShare} className="flex flex-1 items-center justify-center gap-2 rounded-full border py-3 font-bold bg-white text-sm">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
        {myReposted && <p className="mt-2 text-center text-xs font-semibold text-green-600">✅ E don show for your profile → Profile → Reposts tab</p>}

        <div className="mt-6 flex gap-2">
          <a href="/" className="flex-1 rounded-full bg-blue-600 py-3 text-center font-bold text-white">Open AFUED App</a>
          <button onClick={handleShare} className="flex-1 rounded-full border py-3 font-bold bg-white">Share Again</button>
        </div>
      </div>
    </AppShell>
  );
    }

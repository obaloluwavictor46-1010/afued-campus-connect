import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, fetchProfiles, type Post, type Profile } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { Loader2, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/post/$postId")({
  component: SinglePost,
});

function SinglePost() {
  const { postId } = Route.useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("posts").select("*").eq("id", postId).single();
      if (data) {
        setPost(data as Post);
        const profiles = await fetchProfiles([data.user_id]);
        setAuthor(profiles[data.user_id] || null);
      }
      setLoading(false);
    };
    load();
  }, [postId]);

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

        <PostCard post={post} author={author || undefined} commentCount={0} onComments={() => {}} />

        <div className="mt-6 flex gap-2">
          <a href="/" className="flex-1 rounded-full bg-blue-600 py-3 text-center font-bold text-white">Open AFUED App</a>
          <button onClick={async () => {
            const url = window.location.href;
            const text = `🎓 AFUED COMMUNITY INVITE\n\n"${post.content.slice(0, 120)}"\n\n👉 Join AFUED gist, news & connect!\n📲 Open:\n`;
            if (navigator.share) await navigator.share({ title: "AFUED Community", text, url });
            else { await navigator.clipboard.writeText(text + url); alert("Link copied!"); }
          }} className="flex-1 rounded-full border py-3 font-bold bg-white">Share Again</button>
        </div>
      </div>
    </AppShell>
  );
      }

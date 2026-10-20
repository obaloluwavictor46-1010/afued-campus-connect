import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Search, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";
import { supabase, type Profile, type Post } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/afued-oga-only-2024-x9")({
  ssr: false,
  head: () => ({ meta: [{ title: "Oga Admin — AFUED" }] }),
  component: () => <AppShell title="Admin"><Admin /></AppShell>,
});

function Admin() {
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"users"|"posts">("users");
  const [stats, setStats] = useState({ total:0, today:0, posts:0, market:0 });

  const search = async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
    if (q.trim()) query = query.ilike("email", `%${q.trim()}%`);
    const { data } = await query;
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  };

  const loadPosts = async () => {
    setLoading(true);
    const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
    setPosts((data ?? []) as Post[]);
    setView("posts");
    setLoading(false);
  };

  const loadStats = async () => {
    const { count: total } = await supabase.from("profiles").select("*", { count: 'exact', head: true });
    const todayStr = new Date().toISOString().split('T')[0];
    const { count: today } = await supabase.from("profiles").select("*", { count: 'exact', head: true }).gte("created_at", todayStr);
    const { count: postsCount } = await supabase.from("posts").select("*", { count: 'exact', head: true });
    const { count: market } = await supabase.from("marketplace_items").select("*", { count: 'exact', head: true });
    setStats({ total: total||0, today: today||0, posts: postsCount||0, market: market||0 });
  }

  useEffect(() => { if (profile?.is_admin) { search(); loadStats(); } }, [profile?.is_admin]);

  const deletePost = async (id: string) => {
    if (!confirm("DELETE this post? Pic/video go comot forever!")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted!"); setPosts(posts.filter(p=>p.id!==id)); loadStats(); }
  };

  if (!profile?.is_admin) return <div className="py-20 text-center"><ShieldOff className="mx-auto mb-3 h-10 w-10" />Admins only</div>;

  const toggle = async (u: Profile, key: "is_admin" | "can_post_announcement", value: boolean) => {
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, [key]: value } : x)));
    const { error } = await supabase.from("profiles").update({ [key]: value }).eq("id", u.id);
    if (error) { toast.error(error.message); search(); } else toast.success("Updated");
  };

  return (
    <div className="space-y-4 p-4 pb-20">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.total}</div><div className="text-sm">Total Users</div></div>
        <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.today}</div><div className="text-sm">Today Joined</div></div>
        <button onClick={loadPosts} className="bg-purple-600 text-white p-4 rounded-2xl text-left"><div className="text-2xl font-bold">{stats.posts}</div><div className="text-sm">All Posts - TAP TO MANAGE & DELETE</div></button>
        <div className="bg-orange-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.market}</div><div className="text-sm">Market Items</div></div>
      </div>

      <div className="flex gap-2">
        <button onClick={()=>setView("users")} className={`flex-1 rounded-full py-2.5 font-bold ${view==="users"?"bg-black text-white":"bg-gray-100"}`}>Users</button>
        <button onClick={loadPosts} className={`flex-1 rounded-full py-2.5 font-bold ${view==="posts"?"bg-black text-white":"bg-gray-100"}`}>Posts - Delete</button>
      </div>

      {view==="users" ? (
        <>
          <form onSubmit={(e)=>{e.preventDefault(); search();}} className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-full border px-4"><Search className="h-4 w-4" /><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search email" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div>
            <button className="rounded-full bg-black text-white px-5 text-sm">Search</button>
          </form>
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : users.map((u)=>(
            <div key={u.id} className="rounded-2xl border p-4">
              <div className="flex items-center gap-3"><Avatar url={u.avatar_url} name={u.full_name} /><div><p className="font-semibold">{u.full_name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div>
              <div className="mt-3 space-y-2 border-t pt-3 text-sm">
                <label className="flex justify-between">Admin <Switch checked={!!u.is_admin} disabled={u.id===profile.id} onCheckedChange={(v)=>toggle(u,"is_admin",v)} /></label>
                <label className="flex justify-between">Can post announcements <Switch checked={!!u.can_post_announcement} onCheckedChange={(v)=>toggle(u,"can_post_announcement",v)} /></label>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="space-y-3">
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : posts.map((p)=>(
            <div key={p.id} className="rounded-2xl border p-3">
              <div className="flex justify-between gap-3"><p className="text-sm flex-1">{p.content}</p><button onClick={()=>deletePost(p.id)} className="h-10 w-10 bg-red-600 text-white rounded-full flex items-center justify-center"><Trash2 className="h-5 w-5" /></button></div>
              {p.image_url && <img src={p.image_url} className="mt-2 rounded-xl max-h-72 w-full object-cover" />}
              <p className="text-[11px] text-muted-foreground mt-2">{new Date(p.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
            }

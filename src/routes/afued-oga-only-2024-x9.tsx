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

type MarketItem = { id: string; title: string; image_url?: string; created_at: string; user_id: string };

function Admin() {
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"users"|"posts"|"market">("users");
  const [stats, setStats] = useState({ total:0, today:0, posts:0, market:0 });

  const search = async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
    if (q.trim()) query = query.ilike("email", `%${q.trim()}%`);
    const { data } = await query;
    setUsers((data ?? []) as Profile[]);
    setView("users");
    setLoading(false);
  };

  const loadPosts = async () => {
    setLoading(true);
    const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
    setPosts((data ?? []) as Post[]);
    setView("posts");
    setLoading(false);
  };

  const loadMarket = async () => {
    setLoading(true);
    const { data } = await supabase.from("marketplace_items").select("*").order("created_at", { ascending: false }).limit(100);
    setMarket((data ?? []) as any);
    setView("market");
    setLoading(false);
  };

  const loadStats = async () => {
    const { count: total } = await supabase.from("profiles").select("*", { count: 'exact', head: true });
    const todayStr = new Date().toISOString().split('T')[0];
    const { count: today } = await supabase.from("profiles").select("*", { count: 'exact', head: true }).gte("created_at", todayStr);
    const { count: postsCount } = await supabase.from("posts").select("*", { count: 'exact', head: true });
    const { count: marketCount } = await supabase.from("marketplace_items").select("*", { count: 'exact', head: true });
    setStats({ total: total||0, today: today||0, posts: postsCount||0, market: marketCount||0 });
  }

  useEffect(() => { if (profile?.is_admin) { search(); loadStats(); } }, [profile?.is_admin]);

  const deletePost = async (id: string) => {
    if (!confirm("DELETE this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post deleted!"); setPosts(posts.filter(p=>p.id!==id)); loadStats(); }
  };

  const deleteMarket = async (id: string) => {
    if (!confirm("DELETE this market item?")) return;
    const { error } = await supabase.from("marketplace_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Market item deleted!"); setMarket(market.filter(p=>p.id!==id)); loadStats(); }
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
        <button onClick={search} className="bg-blue-600 text-white p-4 rounded-2xl text-left active:scale-95 transition"><div className="text-2xl font-bold">{stats.total}</div><div className="text-sm">Total Users - TAP TO OPEN</div></button>
        <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.today}</div><div className="text-sm">Today Joined</div></div>
        <button onClick={loadPosts} className="bg-purple-600 text-white p-4 rounded-2xl text-left active:scale-95 transition"><div className="text-2xl font-bold">{stats.posts}</div><div className="text-sm">All Posts - TAP TO SEE & DELETE PICS/VIDEOS</div></button>
        <button onClick={loadMarket} className="bg-orange-600 text-white p-4 rounded-2xl text-left active:scale-95 transition"><div className="text-2xl font-bold">{stats.market}</div><div className="text-sm">Market Items - TAP TO MANAGE</div></button>
      </div>

      <form onSubmit={(e)=>{e.preventDefault(); search();}} className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border px-4 bg-card"><Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by email" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div>
        <button className="rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Search</button>
      </form>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <>
          {view==="users" && users.map((u)=>(
            <div key={u.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-3"><Avatar url={u.avatar_url} name={u.full_name} /><div><p className="font-semibold">{u.full_name}</p><p className="text-xs text-muted-foreground">{u.email}</p><p className="text-[11px]">Joined: {new Date(u.created_at).toLocaleDateString()}</p></div></div>
              <div className="mt-3 space-y-2 border-t pt-3 text-sm">
                <label className="flex justify-between">Admin <Switch checked={!!u.is_admin} disabled={u.id===profile.id} onCheckedChange={(v)=>toggle(u,"is_admin",v)} /></label>
                <label className="flex justify-between">Can post announcements <Switch checked={!!u.can_post_announcement} onCheckedChange={(v)=>toggle(u,"can_post_announcement",v)} /></label>
              </div>
            </div>
          ))}
          {view==="posts" && posts.map((p)=>(
            <div key={p.id} className="rounded-2xl border bg-card p-3">
              <div className="flex justify-between gap-3"><p className="text-sm flex-1">{p.content}</p><button onClick={()=>deletePost(p.id)} className="h-10 w-10 bg-red-600 text-white rounded-full flex items-center justify-center"><Trash2 className="h-5 w-5" /></button></div>
              {p.image_url && <img src={p.image_url} className="mt-2 rounded-xl max-h-80 w-full object-cover" />}
              <p className="text-[11px] text-muted-foreground mt-2">{new Date(p.created_at).toLocaleString()}</p>
            </div>
          ))}
          {view==="market" && market.map((m)=>(
            <div key={m.id} className="rounded-2xl border bg-card p-3 flex justify-between gap-3">
              <div className="flex-1"><p className="font-semibold text-sm">{m.title}</p>{m.image_url && <img src={m.image_url} className="mt-2 rounded-xl max-h-60" />}<p className="text-[11px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</p></div>
              <button onClick={()=>deleteMarket(m.id)} className="h-10 w-10 bg-red-600 text-white rounded-full flex items-center justify-center"><Trash2 className="h-5 w-5" /></button>
            </div>
          ))}
        </>
      )}
    </div>
  );
              }

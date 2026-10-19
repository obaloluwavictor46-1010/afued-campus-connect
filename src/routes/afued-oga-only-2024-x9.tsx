import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Search, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";
import { supabase, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/afued-oga-only-2024-x9")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Dashboard — AFUED Community" },
      { name: "description", content: "Manage AFUED Community admins and announcement permissions." },
      { property: "og:title", content: "Admin Dashboard — AFUED Community" },
      { property: "og:description", content: "Manage AFUED Community user permissions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell title="Admin"><Admin /></AppShell>,
});

function Admin() {
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total:0, today:0, posts:0, market:0 });

  const search = async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50);
    if (q.trim()) query = query.ilike("email", `%${q.trim()}%`);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  };

  const loadStats = async () => {
    const { count: total } = await supabase.from("profiles").select("*", { count: 'exact', head: true });
    const todayStr = new Date().toISOString().split('T')[0];
    const { count: today } = await supabase.from("profiles").select("*", { count: 'exact', head: true }).gte("created_at", todayStr);
    const { count: posts } = await supabase.from("posts").select("*", { count: 'exact', head: true });
    const { count: market } = await supabase.from("marketplace_items").select("*", { count: 'exact', head: true });
    setStats({ total: total||0, today: today||0, posts: posts||0, market: market||0 });
  }

  useEffect(() => { 
    if (profile?.is_admin) {
      search(); 
      loadStats();
    }
  }, [profile?.is_admin]);

  if (!profile?.is_admin)
    return <div className="py-20 text-center text-muted-foreground"><ShieldOff className="mx-auto mb-3 h-10 w-10" />Admins only - Oga you no be admin.</div>;

  const toggle = async (u: Profile, key: "is_admin" | "can_post_announcement", value: boolean) => {
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, [key]: value } : x)));
    const { error } = await supabase.from("profiles").update({ [key]: value }).eq("id", u.id);
    if (error) { toast.error(error.message); search(); } else toast.success("Updated");
  };

  return (
    <div className="space-y-4 p-4 pb-20">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.total}</div><div className="text-sm">Total Users</div></div>
        <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.today}</div><div className="text-sm">Today Joined</div></div>
        <div className="bg-purple-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.posts}</div><div className="text-sm">All Posts</div></div>
        <div className="bg-orange-600 text-white p-4 rounded-2xl"><div className="text-2xl font-bold">{stats.market}</div><div className="text-sm">Market Items</div></div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border bg-card px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </div>
        <button className="rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Search</button>
      </form>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : users.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No users found.</p>
      ) : (
        users.map((u) => (
          <div key={u.id} className="rounded-2xl border bg-card p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar url={u.avatar_url} name={u.full_name} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{u.full_name || "Student"}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                <p className="text-[11px] text-muted-foreground">Joined: {new Date(u.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 border-t pt-3 text-sm">
              <label className="flex items-center justify-between">Admin
                <Switch checked={!!u.is_admin} disabled={u.id === profile.id} onCheckedChange={(v) => toggle(u, "is_admin", v)} />
              </label>
              <label className="flex items-center justify-between">Can post announcements
                <Switch checked={!!u.can_post_announcement} onCheckedChange={(v) => toggle(u, "can_post_announcement", v)} />
              </label>
            </div>
          </div>
        ))
      )}
    </div>
  );
      }

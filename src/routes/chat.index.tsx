import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppShell, Avatar } from "@/components/AppShell";
import { shortFaculty, supabase, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/lib/presence";

export const Route = createFileRoute("/chat/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chats — AFUED Community" },
      { name: "description", content: "Private one-on-one chats with AFUED students." },
      { property: "og:title", content: "Chats — AFUED Community" },
      { property: "og:description", content: "Private one-on-one chats with AFUED students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell title="Chats"><ChatList /></AppShell>,
});

type Last = { text: string; at: string; unread: number };

function ChatList() {
  const { user } = useAuth();
  const online = useOnline();
  const [users, setUsers] = useState<Profile[]>([]);
  const [last, setLast] = useState<Record<string, Last>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const [{ data: ps }, { data: ms }] = await Promise.all([
      supabase.from("profiles").select("*").neq("id", user.id).limit(500),
      supabase.from("messages").select("sender_id,receiver_id,content,media_type,created_at,read_at")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(500),
    ]);
    const m: Record<string, Last> = {};
    (ms ?? []).forEach((x) => {
      const other = x.sender_id === user.id ? x.receiver_id : x.sender_id;
      if (!m[other]) m[other] = { text: x.content || (x.media_type === "audio" ? "🎤 Voice note" : `📎 ${x.media_type ?? "File"}`), at: x.created_at, unread: 0 };
      if (x.receiver_id === user.id && !x.read_at) m[other].unread++;
    });
    setLast(m);
    setUsers((ps ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("chatlist").on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const sorted = useMemo(() => {
    const s = q.toLowerCase();
    return users
      .filter((u) => !s || (u.full_name ?? "").toLowerCase().includes(s) || (u.email ?? "").toLowerCase().includes(s))
      .sort((a, b) => (last[b.id]?.at ?? "").localeCompare(last[a.id]?.at ?? "") || Number(online.has(b.id)) - Number(online.has(a.id)));
  }, [users, last, q, online]);

  return (
    <div>
      <div className="p-4 pb-2">
        <div className="flex items-center gap-2 rounded-full bg-muted px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <ul>
          {sorted.map((u) => {
            const l = last[u.id];
            return (
              <li key={u.id}>
                <Link to="/chat/$userId" params={{ userId: u.id }} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
                  <Avatar url={u.avatar_url} name={u.full_name} size={50} online={online.has(u.id)} />
                  <div className="min-w-0 flex-1 border-b pb-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">{u.full_name || u.email}</p>
                      {l && <span className="shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(l.at))}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-muted-foreground">{l ? l.text : online.has(u.id) ? "Online" : shortFaculty(u.faculty) || "Tap to chat"}</p>
                      {l && l.unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{l.unread}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

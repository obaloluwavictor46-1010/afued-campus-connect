import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Check, X, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
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
type ChatRequest = { id: string; sender_id: string; receiver_id: string; status: string; created_at: string; sender?: Profile };

function ChatList() {
  const { user } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const [users, setUsers] = useState<Profile[]>([]);
  const [last, setLast] = useState<Record<string, Last>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ChatRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRequests = async () => {
    if (!user) return;
    const { data } = await supabase.from("chat_requests").select("*").eq("receiver_id", user.id).eq("status", "pending").order("created_at", { ascending: false });
    if (!data || data.length === 0) { setRequests([]); return; }
    const senderIds = data.map((r) => r.sender_id);
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", senderIds);
    const map: Record<string, Profile> = {};
    (profiles ?? []).forEach((p) => { map[p.id] = p as Profile; });
    setRequests(data.map((r) => ({ ...r, sender: map[r.sender_id] })));
  };

  const load = async () => {
    if (!user) return;
    const [{ data: ps }, { data: ms }] = await Promise.all([
      supabase.from("profiles").select("*").neq("id", user.id).limit(500),
      supabase.from("messages").select("sender_id,receiver_id,content,media_type,created_at,read_at").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(500),
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
    loadRequests();
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("chatlist").on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load).subscribe();
    const ch2 = supabase.channel("chat-requests-list").on("postgres_changes", { event: "*", schema: "public", table: "chat_requests" }, loadRequests).subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(ch2); };
  }, [user]);

  const handleRequest = async (req: ChatRequest, action: "accepted" | "declined") => {
    setBusyId(req.id);
    const { error } = await supabase.from("chat_requests").update({ status: action }).eq("id", req.id);
    if (error) { toast.error(error.message); setBusyId(null); return; }
    if (action === "accepted") {
      toast.success(`You accepted ${req.sender?.full_name || "request"}`);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      navigate({ to: "/chat/$userId", params: { userId: req.sender_id } });
    } else {
      toast.success("Request declined");
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    }
    setBusyId(null);
  };

  const sorted = useMemo(() => {
    const s = q.toLowerCase().trim();
    return users
      .filter((u) => {
        if (!s) return true;
        const hay = `${u.full_name||''} ${u.email||''} ${(u as any).phone||''} ${(u as any).matric_no||''} ${(u as any).department||''} ${(u as any).faculty||''} ${shortFaculty(u.faculty)||''}`.toLowerCase();
        return hay.includes(s);
      })
      .sort((a, b) => (last[b.id]?.at ?? "").localeCompare(last[a.id]?.at ?? "") || Number(online.has(b.id)) - Number(online.has(a.id)));
  }, [users, last, q, online]);

  return (
    <div>
      <div className="p-4 pb-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, matric no, phone, dept..." className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </div>
        <Link to="/search" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow">
          <Search className="h-5 w-5" />
        </Link>
      </div>
      {requests.length > 0 && (
        <div className="mx-4 mt-2 rounded-2xl border border-yellow-300 bg-yellow-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-yellow-800"><Clock className="h-4 w-4" /> Message Requests ({requests.length})</p>
          <p className="mt-1 text-xs text-yellow-700">These people want to chat with you. Allow first before dem fit send you message.</p>
          <div className="mt-3 space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 rounded-xl bg-white p-2 shadow-sm">
                <Avatar url={req.sender?.avatar_url} name={req.sender?.full_name} size={44} online={online.has(req.sender_id)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{req.sender?.full_name || req.sender?.email || "Student"}</p>
                  <p className="text-xs text-muted-foreground">{shortFaculty(req.sender?.faculty) || "AFUED"} • {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</p>
                </div>
                <button disabled={busyId === req.id} onClick={() => handleRequest(req, "accepted")} className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Allow</button>
                <button disabled={busyId === req.id} onClick={() => handleRequest(req, "declined")} className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Decline</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <ul>
          {sorted.length === 0 && q ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No student found for "<b>{q}</b>"<br />Try name, matric, phone or dept<br />
              <Link to="/search" className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-white">Advanced Search</Link>
            </div>
          ) : (
            sorted.map((u) => {
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
                        <p className="truncate text-sm text-muted-foreground">{l ? l.text : online.has(u.id) ? "Online" : shortFaculty(u.faculty) || (u as any).department || (u as any).matric_no || "Tap to chat"}</p>
                        {l && l.unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{l.unread}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
    }

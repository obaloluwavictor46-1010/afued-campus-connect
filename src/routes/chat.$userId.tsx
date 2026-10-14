import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Check, CheckCheck, Loader2, Mic, Paperclip, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { FileChip, UploadBar } from "@/components/MediaView";
import { kindOfFile, supabase, uploadFile, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/lib/presence";

export const Route = createFileRoute("/chat/$userId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chat — AFUED Community" },
      { name: "description", content: "Private chat on AFUED Community." },
      { property: "og:title", content: "Chat — AFUED Community" },
      { property: "og:description", content: "Private chat on AFUED Community." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell bare><Thread /></AppShell>,
});

type Msg = {
  id: string; sender_id: string; receiver_id: string; content: string | null; media_url: string | null;
  media_type: string | null; file_name: string | null; delivered_at: string | null; read_at: string | null; created_at: string;
};

function Thread() {
  const { userId } = Route.useParams();
  const { user } = useAuth();
  const me = user!.id;
  const online = useOnline();
  const [other, setOther] = useState<Profile | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const markRead = () =>
    supabase.from("messages").update({ read_at: new Date().toISOString(), delivered_at: new Date().toISOString() })
      .eq("receiver_id", me).eq("sender_id", userId).is("read_at", null).then(() => {});

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle().then(({ data }) => setOther(data as Profile));
    supabase.from("messages").select("*")
      .or(`and(sender_id.eq.${me},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${me})`)
      .order("created_at").limit(500)
      .then(({ data, error }) => { if (error) toast.error(error.message); setMsgs((data ?? []) as Msg[]); });
    markRead();
    const mine = (m: Msg) => (m.sender_id === me && m.receiver_id === userId) || (m.sender_id === userId && m.receiver_id === me);
    const ch = supabase.channel(`thread-${me}-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const m = p.new as Msg;
        if (!mine(m)) return;
        setMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
        if (m.sender_id === userId) markRead();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (p) => {
        const m = p.new as Msg;
        if (mine(m)) setMsgs((l) => l.map((x) => (x.id === m.id ? m : x)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, me]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async (row: Partial<Msg>) => {
    const { data, error } = await supabase.from("messages").insert({ sender_id: me, receiver_id: userId, ...row }).select().single();
    if (error) { toast.error(error.message); return; }
    setMsgs((l) => (l.some((x) => x.id === data.id) ? l : [...l, data as Msg]));
  };

  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await send({ content: t });
  };

  const [pct, setPct] = useState<number | null>(null);
  const sendFile = async (file: Blob, name: string, ext?: string) => {
    setBusy(true);
    try {
      const type = kindOfFile(file);
      const url = await uploadFile(Object.assign(file, { name }), "chat-attachments", me, ext, setPct);
      await send({ media_url: url, media_type: type, file_name: name });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setPct(null); }
  };

  const toggleRecord = async () => {
    if (recording) { recRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: mime.split(";")[0] || "audio/webm" });
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        if (blob.size > 0) sendFile(blob, `voice-note.${ext}`, ext);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch { toast.error("Microphone access was blocked"); }
  };

  const isOnline = online.has(userId);

  return (
    <div className="flex h-[100dvh] flex-col bg-muted/40">
      <header className="flex items-center gap-3 border-b bg-card px-3 py-2.5">
        <Link to="/chat" className="rounded-full p-1.5" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <Avatar url={other?.avatar_url} name={other?.full_name} size={40} online={isOnline} />
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{other?.full_name || other?.email || "…"}</p>
          <p className={`text-xs ${isOnline ? "text-online" : "text-muted-foreground"}`}>{isOnline ? "online" : "offline"}</p>
        </div>
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {msgs.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Say hi 👋</p>}
        {msgs.map((m) => {
          const out = m.sender_id === me;
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${out ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card"}`}>
                <Media m={m} out={out} />
                {m.content && <p className="whitespace-pre-wrap break-words text-[15px]">{m.content}</p>}
                <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${out ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                  {format(new Date(m.created_at), "HH:mm")}
                  {out && (m.read_at ? <CheckCheck className="h-3.5 w-3.5 text-online" /> : m.delivered_at ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {pct !== null && <div className="border-t bg-card px-3 pb-1"><UploadBar pct={pct} /></div>}
      <div className="flex items-end gap-2 border-t bg-card p-2">
        <input ref={fileRef} type="file" hidden accept="image/*,video/mp4,video/quicktime,.mp4,.mov,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f, f.name); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy || recording} className="rounded-full p-2.5 text-muted-foreground" aria-label="Attach">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </button>
        {recording ? (
          <div className="flex flex-1 items-center gap-2 rounded-3xl bg-muted px-4 py-2.5 text-sm text-like">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-like" /> Recording… tap stop to send
          </div>
        ) : (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Message"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            className="max-h-32 flex-1 resize-none rounded-3xl bg-muted px-4 py-2.5 text-[15px] outline-none" />
        )}
        {text.trim() && !recording ? (
          <button onClick={sendText} className="rounded-full bg-primary p-3 text-primary-foreground" aria-label="Send"><Send className="h-5 w-5" /></button>
        ) : (
          <button onClick={toggleRecord} disabled={busy} className={`rounded-full p-3 text-primary-foreground ${recording ? "bg-like" : "bg-primary"}`} aria-label={recording ? "Stop and send" : "Record voice note"}>
            {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Media({ m, out }: { m: Msg; out: boolean }) {
  if (!m.media_url) return null;
  if (m.media_type === "image") return <a href={m.media_url} target="_blank" rel="noreferrer"><img src={m.media_url} alt="" className="mb-1 max-h-72 rounded-xl object-cover" /></a>;
  if (m.media_type === "video") return <video src={m.media_url} controls playsInline preload="metadata" className="mb-1 max-h-72 rounded-xl" />;
  if (m.media_type === "audio") return <audio src={m.media_url} controls className="mb-1 h-10 w-60 max-w-full" />;
  return <FileChip url={m.media_url} name={m.file_name || "File"} className={`mb-1 ${out ? "bg-primary-foreground/15" : ""}`} />;
}

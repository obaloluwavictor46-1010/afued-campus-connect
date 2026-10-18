import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ImagePlus, Loader2, Megaphone, Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchProfiles, insertWithMedia, mediaOf, supabase, uploadMany, type Profile } from "@/lib/supabase";
import { MediaGallery, UploadBar, useMediaPicker } from "@/components/MediaView";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/announcements")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Announcements — AFUED Community" },
      { name: "description", content: "Official announcements for AFUED students." },
      { property: "og:title", content: "Announcements — AFUED Community" },
      { property: "og:description", content: "Official announcements for AFUED students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell title="Announcements"><Page /></AppShell>,
});

type A = { id: string; author_id: string; title: string; content: string | null; image_url: string | null; created_at: string };

function Page() {
  const { user, profile } = useAuth();
  const canPost = !!(profile?.is_admin || profile?.can_post_announcement);
  const [list, setList] = useState<A[]>([]);
  const [authors, setAuthors] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [codeInput, setCodeInput] = useState("");

  const [loadError, setLoadError] = useState<string | null>(null);
  const load = async () => {
    setLoadError(null);
    const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    if (error) { setLoadError(error.message); setList([]); setLoading(false); return; }
    setList((data ?? []) as A[]);
    setAuthors(await fetchProfiles((data ?? []).map((a: A) => a.author_id)));
    setLoading(false);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("ann").on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const handlePlusClick = () => {
    if (canPost) {
      setOpen(true);
    } else {
      setShowCodeDialog(true);
    }
  };

  const verifyCode = () => {
    if (codeInput.trim() === "1010") {
      toast.success("Code verified — you can now post!");
      setShowCodeDialog(false);
      setCodeInput("");
      setOpen(true);
    } else {
      toast.error("Wrong code! Enter 1010");
    }
  };

  return (
    <div className="space-y-4 p-4">
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : loadError ? (
        <div className="py-16 text-center text-muted-foreground">
          <Megaphone className="mx-auto mb-3 h-10 w-10" />
          <p>Couldn't load announcements.</p>
          <button onClick={() => { setLoading(true); load(); }} className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Try again</button>
        </div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground"><Megaphone className="mx-auto mb-3 h-10 w-10" />No announcements yet.</div>
      ) : (
        list.map((a) => (
          <article key={a.id} className="overflow-hidden rounded-2xl border bg-card shadow-card">
            <div className="flex items-center gap-3 p-4">
              <Avatar url={authors[a.author_id]?.avatar_url} name={authors[a.author_id]?.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{authors[a.author_id]?.full_name || "AFUED"}</p>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
              </div>
              <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">Official</span>
              {(a.author_id === user?.id || profile?.is_admin) && (
                <button onClick={() => remove(a.id)} className="p-1 text-muted-foreground" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
            <h2 className="px-4 font-display text-lg font-bold">{a.title}</h2>
            {a.content && <p className="whitespace-pre-wrap px-4 pb-3 pt-1 text-[15px] leading-relaxed">{a.content}</p>}
            <MediaGallery urls={mediaOf(a)} className="pb-2" />
          </article>
        ))
      )}
      {/* + ICON ALWAYS VISIBLE — WITH CODE 1010 GATE */}
      <button onClick={handlePlusClick} className="fixed bottom-24 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-glow">
        <Plus className="h-5 w-5" /> Announce
      </button>

      {/* CODE DIALOG — ASK FOR 1010 */}
      <Dialog open={showCodeDialog} onOpenChange={(o) => !o && setShowCodeDialog(false)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Enter Admin Code</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Only admins with code can post announcements.</p>
            <input type="password" placeholder="Enter code (1010)" className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verifyCode()} />
            <button onClick={verifyCode} className="flex w-full justify-center rounded-2xl bg-primary py-3 font-semibold text-primary-foreground">Verify Code</button>
          </div>
        </DialogContent>
      </Dialog>

      {open && <NewAnnouncement onClose={() => setOpen(false)} onDone={load} />}
    </div>
  );
}

function NewAnnouncement({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [f, setF] = useState({ title: "", content: "" });
  const picker = useMediaPicker();
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const field = "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const urls = picker.files.length ? await uploadMany(picker.files, user.id, setPct) : [];
      await insertWithMedia("announcements", { author_id: user.id, title: f.title.trim(), content: f.content.trim() }, urls);
      setF({ title: "", content: "" }); picker.clear();
      toast.success("Announcement posted"); onDone(); onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); setPct(null); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <input required placeholder="Title" className={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea rows={5} placeholder="Write the announcement..." className={field} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />
          {picker.input}
          <button type="button" onClick={picker.open} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-3 text-sm font-semibold text-primary">
            <ImagePlus className="h-5 w-5" /> Add photos, videos or files
          </button>
          <p className="text-xs text-muted-foreground">Max 5 photos (10MB each) · Videos mp4/mov max 1 min / 30MB · PDF/Word</p>
          {picker.grid(busy)}
          <UploadBar pct={pct} />
          <button disabled={busy} className="flex w-full justify-center rounded-2xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? (pct !== null ? `Uploading ${pct}%...` : <Loader2 className="h-5 w-5 animate-spin" />) : "Post announcement"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
            }

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Plus, ShoppingBag, MessageCircle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaGallery, UploadBar, useMediaPicker } from "@/components/MediaView";
import { fetchProfiles, insertWithMedia, kindOfUrl, mediaOf, supabase, uploadMany, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/marketplace")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AFUED Marketplace — Buy & sell on campus" },
      { name: "description", content: "Buy and sell textbooks, gadgets and more with fellow AFUED students." },
      { property: "og:title", content: "AFUED Marketplace" },
      { property: "og:description", content: "Buy and sell with fellow AFUED students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell title="Marketplace"><Market /></AppShell>,
});

type Item = { id: string; seller_id: string; title: string; description: string | null; price: number; image_url: string | null; media_urls?: string[] | null; whatsapp_number: string | null; created_at: string };
const naira = (n: number) => `₦${Number(n).toLocaleString()}`;

function waLink(item: Item) {
  let d = (item.whatsapp_number ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "234" + d.slice(1);
  else if (!d.startsWith("234")) d = "234" + d;
  const msg = `Hi, I'm interested in your "${item.title}" (${naira(item.price)}) on AFUED Marketplace. Is it still available?`;
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}

function WhatsAppButton({ item, small }: { item: Item; small?: boolean }) {
  if (!item.whatsapp_number) return null;
  return (
    <a href={waLink(item)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className={`flex items-center justify-center gap-1.5 rounded-full bg-whatsapp font-semibold text-primary-foreground ${small ? "mt-2 py-1.5 text-xs" : "py-3 text-sm"}`}>
      <MessageCircle className={small ? "h-3.5 w-3.5" : "h-5 w-5"} /> Chat on WhatsApp
    </a>
  );
}

function Market() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [sellers, setSellers] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<Item | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("marketplace_items").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Item[]);
    setSellers(await fetchProfiles((data ?? []).map((i: Item) => i.seller_id)));
    setLoading(false);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("market").on("postgres_changes", { event: "*", schema: "public", table: "marketplace_items" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="p-4">
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground"><ShoppingBag className="mx-auto mb-3 h-10 w-10" />No items yet. List the first one!</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((i) => {
            const m = mediaOf(i);
            const cover = m.find((u) => kindOfUrl(u) !== "file");
            return (
            <div key={i.id} role="button" onClick={() => setView(i)} className="cursor-pointer overflow-hidden rounded-2xl border bg-card text-left shadow-card">
              <div className="relative aspect-square bg-muted">
                {cover && (kindOfUrl(cover) === "video"
                  ? <video src={cover} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  : <img src={cover} alt={i.title} className="h-full w-full object-cover" loading="lazy" />)}
                {m.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[11px] font-semibold text-background">1/{m.length}</span>}
                {cover && kindOfUrl(cover) === "video" && <span className="absolute bottom-2 left-2 rounded bg-foreground/70 px-1.5 text-[11px] text-background">▶ Video</span>}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{i.title}</p>
                <p className="font-display font-extrabold text-primary">{naira(i.price)}</p>
                <Link to="/u/$userId" params={{ userId: i.seller_id }} onClick={(e) => e.stopPropagation()} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Avatar url={sellers[i.seller_id]?.avatar_url} name={sellers[i.seller_id]?.full_name} size={20} />
                  <span className="truncate hover:underline">{sellers[i.seller_id]?.full_name || "Seller"}</span>
                </Link>
                <WhatsAppButton item={i} small />
              </div>
            </div>
            );
          })}
        </div>
      )}
      <button onClick={() => setAdding(true)} className="fixed bottom-24 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-glow">
        <Plus className="h-5 w-5" /> Sell
      </button>
      <AddItem open={adding} onClose={() => setAdding(false)} onAdded={load} />
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl">
          {view && (
            <>
              <MediaGallery urls={mediaOf(view)} className="-mx-2 overflow-hidden rounded-xl" />
              <DialogHeader><DialogTitle>{view.title}</DialogTitle></DialogHeader>
              <p className="font-display text-2xl font-extrabold text-primary">{naira(view.price)}</p>
              {view.description && <p className="text-sm text-muted-foreground">{view.description}</p>}
              <Link to="/u/$userId" params={{ userId: view.seller_id }} className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm">
                <Avatar url={sellers[view.seller_id]?.avatar_url} name={sellers[view.seller_id]?.full_name} size={36} />
                <div className="min-w-0">
                  <p className="font-semibold hover:underline">{sellers[view.seller_id]?.full_name || "Seller"}</p>
                  {view.whatsapp_number && <p className="text-muted-foreground">WhatsApp: {view.whatsapp_number}</p>}
                </div>
              </Link>
              {view.seller_id !== user?.id && (
                <Link to="/chat/$userId" params={{ userId: view.seller_id }} className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground">
                  <MessageSquare className="h-5 w-5" /> Chat with Seller
                </Link>
              )}
              <WhatsAppButton item={view} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddItem({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState({ title: "", description: "", price: "", whatsapp_number: "" });
  const picker = useMediaPicker(100);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => { if (open && !f.whatsapp_number && profile?.phone_number) setF((x) => ({ ...x, whatsapp_number: profile.phone_number ?? "" })); }, [open]);
  const field = "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (f.whatsapp_number.replace(/\D/g, "").length < 10) { toast.error("Enter a valid WhatsApp number"); return; }
    setBusy(true);
    try {
      const urls = picker.files.length ? await uploadMany(picker.files, user.id, setPct) : [];
      await insertWithMedia("marketplace_items", { seller_id: user.id, title: f.title, description: f.description, price: Number(f.price), whatsapp_number: f.whatsapp_number.trim() }, urls);
      setF({ title: "", description: "", price: "", whatsapp_number: "" }); picker.clear();
      toast.success("Item listed!"); onAdded(); onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); setPct(null); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>List an item</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <input required placeholder="Title" className={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input required type="number" min="0" placeholder="Price (₦)" className={field} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          <input required type="tel" placeholder="WhatsApp number e.g. 08012345678" className={field} value={f.whatsapp_number} onChange={(e) => setF({ ...f, whatsapp_number: e.target.value })} />
          <textarea rows={3} placeholder="Description" className={field} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          {picker.input}
          <button type="button" onClick={picker.open} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-3 text-sm font-semibold text-primary">
            <ImagePlus className="h-5 w-5" /> Add up to 15 photos or videos (video max 100MB)
          </button>
          {picker.grid(busy)}
          <UploadBar pct={pct} />
          <button disabled={busy} className="flex w-full justify-center rounded-2xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "List item"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

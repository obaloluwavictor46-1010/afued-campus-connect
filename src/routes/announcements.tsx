import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { ImagePlus, Loader2, Megaphone, Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchProfiles, insertWithMedia, mediaOf, supabase, uploadMany, type Profile } from "@/lib/supabase";
import { MediaGallery, UploadBar, useMediaPicker } from "@/components/MediaView";
import { useAuth } from "@/lib/auth";
import Cropper from "react-easy-crop";

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

  // === WHATSAPP EDITOR FOR ANNOUNCEMENT - SAME AS FEED ===
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [editedFiles, setEditedFiles] = useState<File[]>([]);
  const [showEditorBtn, setShowEditorBtn] = useState(false);

  useEffect(() => {
    if (picker.files.length > 0) {
      const hasImage = picker.files.some((f: any) => f.type?.startsWith('image/'));
      setShowEditorBtn(hasImage);
    } else {
      setShowEditorBtn(false);
    }
  }, [picker.files]);

  function openEditorForFirstImage() {
    const img = picker.files.find((f: any) => f.type?.startsWith('image/'));
    if (!img) return;
    setEditorUrl(URL.createObjectURL(img));
  }

  function onEditorSend(editedDataUrl: string, captionFromEditor: string) {
    if (captionFromEditor) setF(prev => ({ ...prev, content: prev.content ? prev.content + " " + captionFromEditor : captionFromEditor }));
    fetch(editedDataUrl).then(r => r.blob()).then(blob => {
      const newFile = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setEditedFiles([newFile]);
      toast.success("Edited! Press Post announcement now 🎨");
    });
    setEditorUrl(null);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const filesToUpload = editedFiles.length > 0 ? editedFiles : picker.files;
      const urls = filesToUpload.length ? await uploadMany(filesToUpload, user.id, setPct) : [];
      await insertWithMedia("announcements", { author_id: user.id, title: f.title.trim(), content: f.content.trim() }, urls);
      setF({ title: "", content: "" }); picker.clear(); setEditedFiles([]); setShowEditorBtn(false);
      toast.success("Announcement posted"); onDone(); onClose();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); setPct(null); }
  };
  return (
    <>
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
          {showEditorBtn && editedFiles.length===0 && (
            <button type="button" onClick={openEditorForFirstImage} className="w-full rounded-full bg-[#00a884] py-2.5 text-sm font-bold text-white shadow">
              🎨 Edit Picture Like WhatsApp - Draw, Text, Emoji, Crop
            </button>
          )}
          {editedFiles.length>0 && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-2 text-center text-sm font-semibold text-green-700">
              ✅ Picture Edited! Ready to Post. Press Post announcement below.
            </div>
          )}
          <UploadBar pct={pct} />
          <button disabled={busy} className="flex w-full justify-center rounded-2xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? (pct !== null ? `Uploading ${pct}%...` : <Loader2 className="h-5 w-5 animate-spin" />) : "Post announcement"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
    {editorUrl && (
      <WhatsAppEditor imageUrl={editorUrl} onCancel={() => setEditorUrl(null)} onSend={onEditorSend} />
    )}
    </>
  );
}

// === WHATSAPP EDITOR - X | STICKER | CROP | Aa | PEN - NO MUSIC - SAME AS FEED ===
async function getCroppedImg(imageSrc: string, pixelCrop: any) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;
  await new Promise((res) => (image.onload = res));
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function WhatsAppEditor({ imageUrl, onCancel, onSend }: any){
  const canvasRef = useRef<any>(null);
  const [tool, setTool] = useState<'pen'|'emoji'|'crop'>('pen');
  const [color, setColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [caption, setCaption] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const COLORS = ['#ff0000','#ff9500','#ffeb00','#00e676','#00b0ff','#ff4081','#ffffff','#000000','#9c27b0'];
  const EMOJIS = ['😂','❤️','🔥','😍','👍','😮','🥰','😭','🙏','🎉','💯','😎','🎓','🇳🇬','✨','👑'];
  const [emojis, setEmojis] = useState<any[]>([]);
  const [texts, setTexts] = useState<any[]>([]);
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<any>(null);

  useEffect(()=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentImage;
    img.onload = ()=>{
      const canvas = canvasRef.current;
      if(!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
    };
  },[currentImage]);

  function saveHistory(){
    const canvas = canvasRef.current;
    if(canvas) setHistory(prev => [...prev, canvas.toDataURL()]);
  }
  function getPos(e:any){
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    const x = (cx - rect.left) * (canvas.width / rect.width);
    const y = (cy - rect.top) * (canvas.height / rect.height);
    return {x,y};
  }
  function startDraw(e:any){
    if(tool!=='pen') return;
    saveHistory();
    setIsDrawing(true);
    const {x,y} = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x,y);
  }
  function draw(e:any){
    if(!isDrawing) return;
    const {x,y} = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x,y);
    ctx.stroke();
  }
  function endDraw(){ setIsDrawing(false); }
  function undo(){
    if(history.length===0) return;
    const last = history[history.length-1];
    const img = new Image();
    img.src = last;
    img.onload = ()=>{
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width, canvas.height);
      ctx.drawImage(img,0,0);
    };
    setHistory(prev => prev.slice(0,-1));
  }
  function addText(){
    const t = prompt("Type text to add on picture:");
    if(!t) return;
    setTexts(prev=>[...prev, {text:t, x:60, y:80+prev.length*40, color}]);
  }
  function addEmoji(emoji:string){
    setEmojis(prev=>[...prev, {emoji, x:60+prev.length*40, y:140}]);
  }
  async function applyCrop(){
    if(!croppedArea) return;
    const cropped = await getCroppedImg(currentImage, croppedArea);
    setCurrentImage(cropped);
    setTool('pen');
    setCrop({x:0,y:0});
    setZoom(1);
  }
  function handleSend(){
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    texts.forEach((t:any)=>{ ctx.font = `bold 32px Arial`; ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); });
    emojis.forEach((e:any)=>{ ctx.font = '60px Arial'; ctx.fillText(e.emoji, e.x, e.y); });
    const finalImage = canvas.toDataURL('image/jpeg', 0.9);
    onSend(finalImage, caption);
  }

  return (
    <div style={{position:'fixed', inset:0, background:'black', zIndex:1000, display:'flex', flexDirection:'column'}}>
      <div style={{display:'flex', justifyContent:'space-between', padding:'12px', background:'#111'}}>
        <button onClick={onCancel} style={{color:'white', background:'none', border:'none', fontSize:20}}>✕</button>
        <div style={{display:'flex', gap:16, alignItems:'center'}}>
          <button onClick={()=>setTool('emoji')} style={{color: tool==='emoji'?'#00e676':'white', background:'none', border:'none', fontSize:20}}>😊</button>
          <button onClick={()=>setTool('crop')} style={{color: tool==='crop'?'#00e676':'white', background:'none', border:'none', fontSize:16, fontWeight:'bold'}}>Crop</button>
          <button onClick={addText} style={{color:'white', background:'none', border:'none', fontSize:20, fontWeight:'bold'}}>Aa</button>
          <button onClick={()=>setTool('pen')} style={{color: tool==='pen'?'#00e676':'white', background:'none', border:'none', fontSize:20}}>✏️</button>
          <button onClick={undo} style={{color:'white', background:'none', border:'none', fontSize:20}}>↩️</button>
        </div>
      </div>
      {tool==='crop' ? (
        <div style={{flex:1, position:'relative', background:'#000'}}>
          <Cropper image={currentImage} crop={crop} zoom={zoom} aspect={4/5} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, area)=>setCroppedArea(area)} />
          <div style={{position:'absolute', bottom:16, left:16, right:16, display:'flex', gap:10}}>
            <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{flex:1}} />
            <button onClick={applyCrop} style={{background:'#00a884', color:'white', border:'none', padding:'10px 18px', borderRadius:20, fontWeight:'bold'}}>Done Crop</button>
            <button onClick={()=>setTool('pen')} style={{background:'#333', color:'white', border:'none', padding:'10px 14px', borderRadius:20}}>Cancel</button>
          </div>
        </div>
      ) : (
      <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative'}}>
        <canvas ref={canvasRef} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} style={{maxWidth:'100%', maxHeight:'100%', touchAction:'none'}} />
        {texts.map((t:any,i:number)=>(<div key={i} style={{position:'absolute', left:60, top:120+t.y, color:t.color, fontSize:26, fontWeight:'bold', textShadow:'0 2px 4px black'}}>{t.text}</div>))}
        {emojis.map((e:any,i:number)=>(<div key={i} style={{position:'absolute', left:e.x, top:150+e.y, fontSize:36}}>{e.emoji}</div>))}
      </div>
      )}
      {tool==='emoji' && (
        <div style={{background:'#222', padding:12, display:'flex', gap:8, flexWrap:'wrap'}}>
          {EMOJIS.map(e=><button key={e} onClick={()=>addEmoji(e)} style={{fontSize:28, background:'none', border:'none'}}>{e}</button>)}
        </div>
      )}
      {tool==='pen' && (
        <div style={{background:'#111', padding:12}}>
          <div style={{display:'flex', gap:8, overflowX:'auto', marginBottom:10}}>
            {COLORS.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:28, height:28, borderRadius:'50%', background:c, border: color===c ? '3px solid white' : '2px solid #555', cursor:'pointer', flexShrink:0}} />))}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:10, color:'white'}}>
            <span style={{fontSize:12}}>Thin</span>
            <input type="range" min={1} max={20} value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} style={{flex:1}} />
            <span style={{fontSize:12}}>Thick</span>
            <div style={{width: brushSize*2, height: brushSize*2, borderRadius:'50%', background:color}} />
          </div>
          <div style={{color:'#aaa', fontSize:12, marginTop:6}}>✏️ Draw with finger to cover / hide anything - like WhatsApp pen</div>
        </div>
      )}
      <div style={{background:'#111', padding:'12px', display:'flex', gap:8, alignItems:'center'}}>
        <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Add a caption..." style={{flex:1, padding:'10px 14px', borderRadius:20, border:'none', background:'#222', color:'white'}} />
        <button onClick={handleSend} style={{width:48, height:48, borderRadius:'50%', background:'#00a884', color:'white', border:'none', fontSize:20}}>➤</button>
      </div>
    </div>
  );
  }

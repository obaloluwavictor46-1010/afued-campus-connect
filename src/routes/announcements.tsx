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
    if (canPost) { setOpen(true); } else { setShowCodeDialog(true); }
  };
  const verifyCode = () => {
    if (codeInput.trim() === "1010") {
      toast.success("Code verified — you can now post!");
      setShowCodeDialog(false);
      setCodeInput("");
      setOpen(true);
    } else { toast.error("Wrong code! Try again"); }
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
      <button onClick={handlePlusClick} className="fixed bottom-24 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-glow">
        <Plus className="h-5 w-5" /> Announce
      </button>
      <Dialog open={showCodeDialog} onOpenChange={(o) => !o && setShowCodeDialog(false)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Enter Admin Code</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Only admins with code can post announcements.</p>
            <input type="password" placeholder="Enter code" className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verifyCode()} />
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
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [editedFiles, setEditedFiles] = useState<File[]>([]);
  const [showEditorBtn, setShowEditorBtn] = useState(false);

  useEffect(() => {
    if (picker.files.length > 0) {
      const hasImage = picker.files.some((f: any) => f.type?.startsWith('image/') || f.type?.startsWith('video/'));
      setShowEditorBtn(hasImage);
    } else { setShowEditorBtn(false); }
  }, [picker.files]);

  function openEditorForFirstImage() {
    const img = picker.files.find((f: any) => f.type?.startsWith('image/') || f.type?.startsWith('video/'));
    if (!img) { toast.error("Pick picture / video first"); return; }
    setEditorFile(img);
    setEditorUrl(URL.createObjectURL(img));
  }

  function onEditorSend(editedDataUrl: string, captionFromEditor: string, editedFile?: File | null) {
    if (captionFromEditor) setF(prev => ({ ...prev, content: prev.content ? prev.content + " " + captionFromEditor : captionFromEditor }));
    if (editorFile?.type?.startsWith('video/')) {
      if (editedFile) {
        setEditedFiles([editedFile]);
        toast.success("Video Edited! Text dey inside video now 🎬 Press Post announcement");
      } else {
        toast.success("Caption added! Press Post announcement now 🎬");
      }
      setEditorUrl(null); setEditorFile(null);
      return;
    }
    if (!editedDataUrl) { setEditorUrl(null); setEditorFile(null); return; }
    fetch(editedDataUrl).then(r => r.blob()).then(blob => {
      const newFile = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setEditedFiles([newFile]);
      toast.success("Edited! Press Post announcement now 🎨");
    }).catch(()=>{ toast.error("Edit failed, try again"); });
    setEditorUrl(null); setEditorFile(null);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Login first"); return; }
    if (!f.title.trim()) { toast.error("Put Title first"); return; }
    setBusy(true);
    try {
      const filesToUpload = editedFiles.length > 0 ? editedFiles : picker.files;
      const urls = filesToUpload.length ? await uploadMany(filesToUpload, user.id, setPct) : [];
      await insertWithMedia("announcements", { author_id: user.id, title: f.title.trim(), content: f.content.trim() }, urls);
      setF({ title: "", content: "" }); picker.clear(); setEditedFiles([]); setShowEditorBtn(false);
      toast.success("Announcement posted ✅"); onDone(); onClose();
    } catch (err: any) { console.log(err); toast.error(err?.message || "Post failed - check internet / file size"); } finally { setBusy(false); setPct(null); }
  };

  if (editorUrl) {
    return <WhatsAppEditor imageUrl={editorUrl} isVideo={editorFile?.type?.startsWith('video/')} onCancel={() => { setEditorUrl(null); setEditorFile(null); }} onSend={onEditorSend} />;
  }

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
          {showEditorBtn && editedFiles.length===0 && (
            <button type="button" onClick={openEditorForFirstImage} className="w-full rounded-full bg-[#00a884] py-2.5 text-sm font-bold text-white shadow">
              🎨 Edit Picture / Video Like WhatsApp - Draw, Text, Crop
            </button>
          )}
          {editedFiles.length>0 && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-2 text-center text-sm font-semibold text-green-700">
              ✅ Edited! Ready to Post. Press Post announcement below.
            </div>
          )}
          <UploadBar pct={pct} />
          <button disabled={busy} className="flex w-full justify-center rounded-2xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? (pct !== null ? `Uploading ${pct}%...` : <Loader2 className="h-5 w-5 animate-spin" />) : "Post announcement"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function getCroppedImg(imageSrc: string, pixelCrop: any) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;
  await new Promise((res) => (image.onload = res));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(pixelCrop.width));
  canvas.height = Math.max(1, Math.floor(pixelCrop.height));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function WhatsAppEditor({ imageUrl, isVideo, onCancel, onSend }: any){
  const canvasRef = useRef<any>(null);
  const videoRef = useRef<any>(null);
  const [tool, setTool] = useState<'pen'|'eraser'|'crop'|'text'>('pen');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [caption, setCaption] = useState('');
  const COLORS = ['#ffffff','#ff0000','#ff9500','#ffeb00','#00e676','#00b0ff','#ff4081','#000000','#9c27b0'];
  const [texts, setTexts] = useState<any[]>([]);
  const [emojis, setEmojis] = useState<any[]>([]);
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [directText, setDirectText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [drawLines, setDrawLines] = useState<any[]>([]);
  const [dragItem, setDragItem] = useState<any>(null);
  const [selectedText, setSelectedText] = useState<number | null>(null);
  const [editingInline, setEditingInline] = useState<number | null>(null);
  const [editInlineValue, setEditInlineValue] = useState('');
  const tapStart = useRef<any>(null);
  const [filter, setFilter] = useState('none');
  const FILTERS = [{n:'Original', v:'none'}, {n:'Pop', v:'contrast(1.2) saturate(1.4)'}, {n:'B&W', v:'grayscale(1)'}, {n:'Cool', v:'hue-rotate(180deg) saturate(1.2)'}, {n:'Warm', v:'sepia(0.4) contrast(1.1)'}, {n:'Vivid', v:'saturate(1.8) contrast(1.15)'}];
  const [cropBox, setCropBox] = useState({ x: 8, y: 8, w: 84, h: 84 });
  const [cropHandle, setCropHandle] = useState<string | null>(null);
  const cropStart = useRef<any>(null);
  const [cropRotate, setCropRotate] = useState(0);
  const [isBurning, setIsBurning] = useState(false);
  const [imgReady, setImgReady] = useState(false);

  useEffect(()=>{
    if(isVideo && videoRef.current){
      if(tool==='pen' || tool==='eraser' || tool==='text' || tool==='crop') videoRef.current.pause();
      else videoRef.current.play().catch(()=>{});
    }
  },[tool, isVideo]);

  useEffect(()=>{
    if(isVideo) return;
    setImgReady(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentImage;
    img.onload = ()=>{
      const canvas = canvasRef.current;
      if(!canvas) { setTimeout(()=>{ const c2 = canvasRef.current; if(c2){ c2.width = img.width; c2.height = img.height; const ctx2 = c2.getContext('2d'); ctx2.clearRect(0,0,c2.width,c2.height); ctx2.drawImage(img, 0, 0); } }, 50); return; }
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0);
      setImgReady(true);
    };
    img.onerror = ()=> setImgReady(true);
  },[currentImage, isVideo, tool]);

  function getPos(e:any){
    const el = isVideo ? videoRef.current : canvasRef.current;
    if(!el) return {x:0,y:0,clientX:0,clientY:0};
    const rect = el.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    return {x: cx - rect.left, y: cy - rect.top, clientX: cx, clientY: cy};
  }
  function startDragItem(e:any, type:string, index:number){
    e.stopPropagation();
    const p = getPos(e);
    const item = type==='text' ? texts[index] : emojis[index];
    setDragItem({type, index, startX: p.clientX, startY: p.clientY, origX: item.x, origY: item.y});
  }
  function moveDragItem(e:any){
    if(!dragItem) return;
    const p = getPos(e);
    const dx = p.clientX - dragItem.startX;
    const dy = p.clientY - dragItem.startY;
    if(dragItem.type==='text') setTexts(prev=>prev.map((t,i)=> i===dragItem.index ? {...t, x: dragItem.origX+dx, y: dragItem.origY+dy} : t));
    else setEmojis(prev=>prev.map((t,i)=> i===dragItem.index ? {...t, x: dragItem.origX+dx, y: dragItem.origY+dy} : t));
  }
  function endDragItem(){ setDragItem(null); }
  function startDraw(e:any){
    if(dragItem) return;
    if(tool==='pen'){
      setIsDrawing(true);
      const {x,y} = getPos(e);
      setDrawLines(prev=>[...prev, {color, size: brushSize, points:[{x,y}]}]);
    } else if(tool==='eraser'){
      setIsDrawing(true);
      eraseAt(e);
    }
  }
  function draw(e:any){
    if(dragItem){ moveDragItem(e); return; }
    if(!isDrawing) return;
    if(tool==='eraser'){ eraseAt(e); return; }
    if(tool!=='pen') return;
    const {x,y} = getPos(e);
    setDrawLines(prev=>{
      const copy=[...prev];
      const last=copy[copy.length-1];
      if(last) last.points.push({x,y});
      return copy;
    });
  }
  function endDraw(){ setIsDrawing(false); endDragItem(); }
  function eraseAt(e:any){
    const {x,y} = getPos(e);
    setDrawLines(prev=>prev.filter((line:any)=> !line.points.some((p:any)=> Math.sqrt((p.x-x)*(p.x-x)+(p.y-y)*(p.y-y)) < 28 )));
  }
  function undo(){
    if(drawLines.length>0) setDrawLines(prev=>prev.slice(0,-1));
    else if(texts.length>0) setTexts(prev=>prev.slice(0,-1));
    else if(emojis.length>0) setEmojis(prev=>prev.slice(0,-1));
  }
  function confirmDirectText(){
    if(!directText.trim()){ setShowTextInput(false); return; }
    setTexts(prev=>[...prev, {text: directText.trim(), x: 80, y: 150, color}]);
    setDirectText(''); setShowTextInput(false); setTool('pen');
  }
  function onTextTouchStart(e:any, i:number){
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    tapStart.current = { x: cx, y: cy, time: Date.now(), index: i };
  }
  function onTextTouchEnd(e:any, i:number){
    if(!tapStart.current) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? tapStart.current.x;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? tapStart.current.y;
    const dx = Math.abs(cx - tapStart.current.x);
    const dy = Math.abs(cy - tapStart.current.y);
    const dt = Date.now() - tapStart.current.time;
    if(dx < 6 && dy < 6 && dt < 400){
      e.stopPropagation();
      setEditingInline(i);
      setEditInlineValue(texts[i].text);
      setSelectedText(i);
    }
    tapStart.current = null;
  }
  function saveInlineEdit(){
    if(editingInline===null) return;
    if(editInlineValue.trim()==='') setTexts(prev=>prev.filter((_,idx)=>idx!==editingInline));
    else setTexts(prev=>prev.map((t,idx)=> idx===editingInline ? {...t, text: editInlineValue} : t));
    setEditingInline(null); setSelectedText(null);
  }
  function deleteInlineText(){
    if(editingInline===null) return;
    setTexts(prev=>prev.filter((_,idx)=>idx!==editingInline));
    setEditingInline(null); setSelectedText(null);
  }
  function startCropHandle(e:any, handle:string){
    e.stopPropagation();
    const container = document.getElementById('crop-container-ann');
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    cropStart.current = { handle, startX: cx, startY: cy, box: {...cropBox}, rect };
    setCropHandle(handle);
  }
  function startCropMove(e:any){
    const container = document.getElementById('crop-container-ann');
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    cropStart.current = { handle:'move', startX: cx, startY: cy, box: {...cropBox}, rect };
    setCropHandle('move');
  }
  function moveCropHandle(e:any){
    if(!cropHandle || !cropStart.current) return;
    const { rect, box, startX, startY, handle } = cropStart.current;
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    const dxPct = ((cx - startX) / rect.width) * 100;
    const dyPct = ((cy - startY) / rect.height) * 100;
    let next = {...box};
    if(handle==='move'){
      next.x = box.x + dxPct; next.y = box.y + dyPct;
      if(next.x < 0) next.x = 0; if(next.y < 0) next.y = 0;
      if(next.x + next.w > 100) next.x = 100 - next.w;
      if(next.y + next.h > 100) next.y = 100 - next.h;
    } else {
      if(handle.includes('l')){ next.x = box.x + dxPct; next.w = box.w - dxPct; }
      if(handle.includes('r')){ next.w = box.w + dxPct; }
      if(handle.includes('t')){ next.y = box.y + dyPct; next.h = box.h - dyPct; }
      if(handle.includes('b')){ next.h = box.h + dyPct; }
      if(next.w < 20){ if(handle.includes('l')) next.x = box.x + box.w - 20; next.w = 20; }
      if(next.h < 20){ if(handle.includes('t')) next.y = box.y + box.h - 20; next.h = 20; }
      if(next.x < 0){ next.w += next.x; next.x = 0; }
      if(next.y < 0){ next.h += next.y; next.y = 0; }
      if(next.x + next.w > 100) next.w = 100 - next.x;
      if(next.y + next.h > 100) next.h = 100 - next.y;
    }
    setCropBox(next);
  }
  function endCropHandle(){ setCropHandle(null); cropStart.current = null; }
  async function applyCrop(){
    if(!isVideo){
      const img = new Image(); img.crossOrigin='anonymous'; img.src = currentImage;
      await new Promise((res)=>(img.onload=res));
      const pixelCrop = { x: (cropBox.x/100)*img.width, y: (cropBox.y/100)*img.height, width: (cropBox.w/100)*img.width, height: (cropBox.h/100)*img.height };
      const cropped = await getCroppedImg(currentImage, pixelCrop);
      setCurrentImage(cropped);
    }
    setCropBox({x:8,y:8,w:84,h:84}); setCropRotate(0); setTool('pen');
  }
  function rotateCrop(){
    setCropRotate(prev => (prev + 90) % 360);
    setCropBox(prev => ({ x: prev.x, y: prev.y, w: prev.h, h: prev.w }));
  }
  async function burnVideoWithOverlays(): Promise<File | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = currentImage;
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext('2d')!;
        const dispVideo = videoRef.current;
        const rect = dispVideo ? dispVideo.getBoundingClientRect() : { width: canvas.width, height: canvas.height };
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        // @ts-ignore
        const stream = canvas.captureStream(30);
        let rec: any = null;
        try { rec = new MediaRecorder(stream, { mimeType: 'video/webm' }); } catch { rec = new MediaRecorder(stream); }
        const chunks: any[] = [];
        rec.ondataavailable = (e:any) => { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const file = new File([blob], `edited-video-${Date.now()}.webm`, { type: 'video/webm' });
          resolve(file);
        };
        const drawFrame = () => {
          if (video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          drawLines.forEach((line: any) => {
            ctx.strokeStyle = line.color; ctx.lineWidth = line.size * 2 * scaleX; ctx.lineCap = 'round'; ctx.beginPath();
            line.points.forEach((p: any, i: number) => { const X = p.x * scaleX, Y = p.y * scaleY; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
            ctx.stroke();
          });
          texts.forEach((t: any) => {
            ctx.font = `bold ${42 * scaleX}px Arial`;
            ctx.fillStyle = t.color; ctx.strokeStyle = 'black'; ctx.lineWidth = 3;
            ctx.strokeText(t.text, t.x * scaleX, t.y * scaleY);
            ctx.fillText(t.text, t.x * scaleX, t.y * scaleY);
          });
          emojis.forEach((e: any) => { ctx.font = `${80 * scaleX}px Arial`; ctx.fillText(e.emoji, e.x * scaleX, e.y * scaleY); });
          requestAnimationFrame(drawFrame);
        };
        video.onplay = () => { rec.start(); drawFrame(); };
        video.onended = () => { setTimeout(() => { try { rec.stop(); } catch {} }, 200); };
        video.currentTime = 0;
        video.play().catch(() => resolve(null));
        setTimeout(() => { if (rec.state !== 'inactive') { try { rec.stop(); } catch {} } }, ((video.duration || 5) * 1000) + 800);
      };
      video.onerror = () => resolve(null);
    });
  }
  async function handleSend(){
    if(isVideo){
      if(texts.length===0 && emojis.length===0 && drawLines.length===0){
        onSend(imageUrl, caption);
        return;
      }
      setIsBurning(true);
      const burnedFile = await burnVideoWithOverlays();
      setIsBurning(false);
      if(burnedFile){ onSend(URL.createObjectURL(burnedFile), caption, burnedFile); }
      else { onSend(imageUrl, caption); }
      return;
    }
    const canvas = canvasRef.current;
    if(!canvas || !canvas.width){ onSend(currentImage, caption); return; }
    try{
      const ctx = canvas.getContext('2d');
      const img = new Image(); img.crossOrigin='anonymous'; img.src=currentImage;
      await new Promise((res)=>{ img.onload=res; img.onerror=res; });
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.filter = filter;
      ctx.drawImage(img,0,0);
      ctx.filter = 'none';
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || canvas.width);
      const scaleY = canvas.height / (rect.height || canvas.height);
      drawLines.forEach((line:any)=>{
        ctx.strokeStyle=line.color; ctx.lineWidth=line.size*2*scaleX; ctx.lineCap='round'; ctx.beginPath();
        line.points.forEach((p:any,i:number)=>{ const X=p.x*scaleX, Y=p.y*scaleY; if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y); });
        ctx.stroke();
      });
      texts.forEach((t:any)=>{ ctx.font=`bold ${42*scaleX}px Arial`; ctx.fillStyle=t.color; ctx.strokeStyle='black'; ctx.lineWidth=3; ctx.strokeText(t.text, t.x*scaleX, t.y*scaleY); ctx.fillText(t.text, t.x*scaleX, t.y*scaleY); });
      emojis.forEach((e:any)=>{ ctx.font=`${80*scaleX}px Arial`; ctx.fillText(e.emoji, e.x*scaleX, e.y*scaleY); });
      onSend(canvas.toDataURL('image/jpeg',0.92), caption);
    }catch(e){ onSend(currentImage, caption); }
  }

  return (
    <div style={{position:'fixed', inset:0, background:'black', zIndex:9999, display:'flex', flexDirection:'column'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px'}}>
        <button onClick={onCancel} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:22, width:36, height:36, borderRadius:'50%'}}>✕</button>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <button onClick={()=>setTool('crop')} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:20, width:38, height:38, borderRadius:'50%'}}>⤢</button>
          <button onClick={()=>{ setShowTextInput(true); setTool('text'); }} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:17, fontWeight:'bold', width:38, height:38, borderRadius:'50%'}}>Aa</button>
          <button onClick={()=>setTool('pen')} style={{color: tool==='pen'?'#00e676':'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:20, width:38, height:38, borderRadius:'50%'}}>✎</button>
          <button onClick={()=>setTool('eraser')} style={{color: tool==='eraser'?'#ff5252':'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:16, width:38, height:38, borderRadius:'50%'}}>🧽</button>
          <button onClick={undo} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:20, width:38, height:38, borderRadius:'50%'}}>↩</button>
        </div>
      </div>
      {tool==='crop' ? (
        <div id="crop-container-ann" onMouseMove={moveCropHandle} onTouchMove={moveCropHandle} onMouseUp={endCropHandle} onTouchEnd={endCropHandle} style={{flex:1, position:'relative', background:'black', display:'flex', flexDirection:'column', overflow:'hidden'}}>
          <div style={{flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
            {isVideo ? (
              <video ref={videoRef} src={currentImage} playsInline muted loop style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', pointerEvents:'none', transform:`rotate(${cropRotate}deg)`, filter}} />
            ) : (
              <img src={currentImage} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', pointerEvents:'none', transform:`rotate(${cropRotate}deg)`, filter}} />
            )}
            <div onMouseDown={startCropMove} onTouchStart={startCropMove} style={{position:'absolute', left:`${cropBox.x}%`, top:`${cropBox.y}%`, width:`${cropBox.w}%`, height:`${cropBox.h}%`, boxShadow:'0 0 0 9999px rgba(0,0,0,0.72)', boxSizing:'border-box', touchAction:'none', cursor:'move'}}>
              <div style={{position:'absolute', inset:0, border:'1px solid rgba(255,255,255,0.7)'}}>
                <div style={{position:'absolute', left:'33.3%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.6)'}} />
                <div style={{position:'absolute', left:'66.6%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.6)'}} />
                <div style={{position:'absolute', top:'33.3%', left:0, right:0, height:1, background:'rgba(255,255,255,0.6)'}} />
                <div style={{position:'absolute', top:'66.6%', left:0, right:0, height:1, background:'rgba(255,255,255,0.6)'}} />
              </div>
              <div onMouseDown={(e)=>startCropHandle(e,'tl')} onTouchStart={(e)=>startCropHandle(e,'tl')} style={{position:'absolute', left:-2, top:-2, width:28, height:28, borderLeft:'4px solid white', borderTop:'4px solid white', touchAction:'none', zIndex:10}} />
              <div onMouseDown={(e)=>startCropHandle(e,'tr')} onTouchStart={(e)=>startCropHandle(e,'tr')} style={{position:'absolute', right:-2, top:-2, width:28, height:28, borderRight:'4px solid white', borderTop:'4px solid white', touchAction:'none', zIndex:10}} />
              <div onMouseDown={(e)=>startCropHandle(e,'bl')} onTouchStart={(e)=>startCropHandle(e,'bl')} style={{position:'absolute', left:-2, bottom:-2, width:28, height:28, borderLeft:'4px solid white', borderBottom:'4px solid white', touchAction:'none', zIndex:10}} />
              <div onMouseDown={(e)=>startCropHandle(e,'br')} onTouchStart={(e)=>startCropHandle(e,'br')} style={{position:'absolute', right:-2, bottom:-2, width:28, height:28, borderRight:'4px solid white', borderBottom:'4px solid white', touchAction:'none', zIndex:10}} />
            </div>
          </div>
          <div style={{background:'#000', padding:'14px 24px 18px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <button onClick={()=>{ setCropBox({x:8,y:8,w:84,h:84}); setCropRotate(0); setTool('pen'); }} style={{background:'none', border:'none', color:'#00e676', fontSize:16, fontWeight:'600'}}>Cancel</button>
            <button onClick={rotateCrop} style={{background:'none', border:'none', color:'white', fontSize:24}}>⟳</button>
            <button onClick={applyCrop} style={{background:'none', border:'none', color:'#00e676', fontSize:16, fontWeight:'600'}}>Done</button>
          </div>
        </div>
      ) : (
      <div style={{flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#000'}} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}>
        {isVideo ? (
          <video ref={videoRef} src={currentImage} controls playsInline autoPlay loop muted style={{maxWidth:'100%', maxHeight:'100%', filter}} />
        ) : (
          <canvas ref={canvasRef} style={{maxWidth:'100%', maxHeight:'100%', touchAction:'none', filter}} />
        )}
        <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none'}}>
          {drawLines.map((line:any, li:number)=>(
            <polyline key={li} points={line.points.map((p:any)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={line.color} strokeWidth={line.size} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
        {texts.map((t:any,i:number)=>{
          if(editingInline===i){
            return (
              <div key={i} style={{position:'absolute', left:t.x, top:t.y, zIndex:50, display:'flex', flexDirection:'column', gap:6}} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
                <input autoFocus value={editInlineValue} onChange={e=>setEditInlineValue(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') saveInlineEdit(); if(e.key==='Escape'){ setEditingInline(null); setSelectedText(null); } }} style={{fontSize:28, fontWeight:'bold', color:t.color, background:'rgba(0,0,0,0.85)', border:'2px solid #00e676', borderRadius:8, padding:'6px 10px', width:'220px', outline:'none'}} />
                <div style={{display:'flex', gap:6}}>
                  <button onClick={deleteInlineText} style={{flex:1, background:'#ff5252', color:'white', border:'none', padding:'8px', borderRadius:20, fontWeight:'bold', fontSize:12}}>🗑 Delete</button>
                  <button onClick={saveInlineEdit} style={{flex:1, background:'#00a884', color:'white', border:'none', padding:'8px', borderRadius:20, fontWeight:'bold', fontSize:12}}>Done ✓</button>
                </div>
              </div>
            );
          }
          return (
            <div key={i} onMouseDown={(e)=>{ onTextTouchStart(e,i); startDragItem(e,'text',i); }} onTouchStart={(e)=>{ onTextTouchStart(e,i); startDragItem(e,'text',i); }} onMouseUp={(e)=>onTextTouchEnd(e,i)} onTouchEnd={(e)=>onTextTouchEnd(e,i)} style={{position:'absolute', left:t.x, top:t.y, color:t.color, fontSize:28, fontWeight:'bold', textShadow:'0 2px 4px black', cursor:'move', touchAction:'none', padding:'6px 10px', border: selectedText===i ? '2px solid #00e676' : '1px dashed rgba(255,255,255,0.4)', borderRadius:8}}>{t.text}</div>
          );
        })}
        {emojis.map((e:any,i:number)=>(
          <div key={i} onMouseDown={(ev)=>startDragItem(ev,'emoji',i)} onTouchStart={(ev)=>startDragItem(ev,'emoji',i)} style={{position:'absolute', left:e.x, top:e.y, fontSize:40, cursor:'move', touchAction:'none'}}>{e.emoji}</div>
        ))}
        {showTextInput && (
          <div style={{position:'absolute', top:'35%', left:16, right:16, background:'rgba(0,0,0,0.9)', borderRadius:16, padding:14, zIndex:30}}>
            <input autoFocus value={directText} onChange={e=>setDirectText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') confirmDirectText(); }} placeholder="Type here..." style={{width:'100%', padding:'14px', borderRadius:10, border:'none', fontSize:18, background:'#222', color:'white', outline:'none', boxSizing:'border-box'}} />
            <div style={{display:'flex', gap:8, marginTop:10}}>
              {COLORS.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:'50%',background:c,border:color===c?'3px solid white':'1px solid #555'}} />))}
            </div>
            <div style={{display:'flex', gap:8, marginTop:10}}>
              <button onClick={()=>setShowTextInput(false)} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#333',color:'white'}}>Cancel</button>
              <button onClick={confirmDirectText} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#00a884',color:'white',fontWeight:'bold'}}>Add + Drag</button>
            </div>
          </div>
        )}
      </div>
      )}
      {tool!=='crop' && (
        <div style={{background:'#000', padding:'6px 12px', display:'flex', gap:8, overflowX:'auto'}}>
          <span style={{color:'#aaa', fontSize:11, whiteSpace:'nowrap', alignSelf:'center'}}>↑ Swipe up for filters</span>
          {FILTERS.map(f=>(
            <button key={f.n} onClick={()=>setFilter(f.v)} style={{background: filter===f.v ? '#00a884' : '#222', color:'white', border:'none', padding:'6px 12px', borderRadius:20, fontSize:12, whiteSpace:'nowrap'}}>{f.n}</button>
          ))}
        </div>
      )}
      {tool==='pen' && (
        <div style={{background:'#111', padding:'10px 12px'}}>
          <div style={{display:'flex', gap:8, overflowX:'auto', marginBottom:8}}>
            {COLORS.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:26, height:26, borderRadius:'50%', background:c, border: color===c ? '3px solid white' : '2px solid #555', cursor:'pointer', flexShrink:0}} />))}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:10, color:'white'}}>
            <span style={{fontSize:11}}>Thin</span>
            <input type="range" min={1} max={20} value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} style={{flex:1}} />
            <span style={{fontSize:11}}>Thick</span>
          </div>
        </div>
      )}
      {tool==='eraser' && (
        <div style={{background:'#3a0a0a', padding:10, display:'flex', gap:8, alignItems:'center'}}>
          <p style={{color:'white', fontSize:12, margin:0, flex:1}}>🧽 Rub pen line to erase am</p>
          <button onClick={()=>setDrawLines([])} style={{background:'#ff5252', color:'white', border:'none', padding:'8px 12px', borderRadius:20, fontWeight:'bold', fontSize:12}}>Erase All</button>
        </div>
      )}
      <div style={{background:'#000', padding:'10px 12px 14px', display:'flex', gap:8, alignItems:'center'}}>
        <div style={{flex:1, background:'#222', borderRadius:24, padding:'8px 12px', display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontSize:18}}>🖼️</span>
          <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Add a caption..." style={{flex:1, background:'transparent', border:'none', color:'white', outline:'none', fontSize:15}} />
          <span style={{fontSize:16, color:'#aaa'}}>@</span>
        </div>
        <button onClick={handleSend} disabled={isBurning} style={{width:52, height:52, borderRadius:'50%', background:'#00a884', color:'white', border:'none', fontSize:22, flexShrink:0, opacity: isBurning ? 0.6 : 1}}>{isBurning ? '⏳' : '➤'}</button>
      </div>
      {isBurning && <p style={{textAlign:'center', color:'#00e676', fontSize:12, background:'#000', padding:'6px'}}>Burning text inside video... wait small ⏳</p>}
      {!imgReady && !isVideo && <p style={{textAlign:'center', color:'#aaa', fontSize:11, background:'#000', padding:'4px'}}>Loading picture... wait small</p>}
    </div>
  );
    }

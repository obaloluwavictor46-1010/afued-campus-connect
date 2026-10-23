import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ImagePlus, Loader2, Paperclip, MoreHorizontal, Pencil, Trash2, Share2, Music } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { CommentsSheet } from "@/components/CommentsSheet";
import { UploadBar, useMediaPicker } from "@/components/MediaView";
import { FEED_CHANNELS, fetchProfiles, MAX_POSTS_PER_DAY, shortFaculty, supabase, type Post, type Profile } from "@/lib/supabase";
import { uploadToBunny } from "@/lib/bunny";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AFUED Community — Campus Feed" },
      { name: "description", content: "The social feed for AFUED students. Share posts across every faculty channel." },
      { property: "og:title", content: "AFUED Community — Campus Feed" },
      { property: "og:description", content: "Share posts and connect across every AFUED faculty." },
    ],
  }),
  component: Feed,
});

function Feed() {
  return <AppShell><FeedInner /></AppShell>;
}

function FeedInner() {
  const { user } = useAuth();
  const [channel, setChannel] = useState("All");
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    let q = supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (channel !== "All") q = q.eq("faculty_channel", channel);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    const list = (data ?? []) as Post[];
    setPosts(prev => {
      const uploading = prev.filter((p: any) => p.isUploading);
      const merged = [...uploading, ...list];
      return merged.filter((v,i,a)=>a.findIndex(t=>t.id===v.id)===i);
    });
    setProfiles(await fetchProfiles(list.map((p) => p.user_id)));
    if (list.length) {
      const { data: cs } = await supabase.from("comments").select("post_id").in("post_id", list.map((p) => p.id));
      const m: Record<string, number> = {};
      (cs ?? []).forEach((c) => (m[c.post_id] = (m[c.post_id] ?? 0) + 1));
      setCounts(m);
    }
    setLoading(false);
  };

  const handleDeleteEveryone = async (postId: string) => {
    if (!confirm("Delete for Everyone? E go comot for everybody forever o!")) return;
    setDeletingId(postId);
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) toast.error(error.message);
    else {
      toast.success("Post deleted for everyone!");
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
    setDeletingId(null);
    setOpenMenu(null);
  };

  const handleDelete = handleDeleteEveryone;

  const handleEditSave = async () => {
    if (!editingPost || !editContent.trim()) return;
    const { error } = await supabase.from("posts").update({ content: editContent.trim() }).eq("id", editingPost.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Post updated!");
      setPosts((prev) => prev.map(p => p.id === editingPost.id ? { ...p, content: editContent.trim() } : p));
      setEditingPost(null);
    }
    setOpenMenu(null);
  };

  const handleShare = async (post: Post) => {
    const url = `${window.location.origin}/post/${post.id}?from=AFUED_Connect`;
    const shareData = {
      title: "AFUED Community",
      text: `${post.content.slice(0, 100)} - Shared from AFUED Connect App 🎓`,
      url: url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied! Share am for WhatsApp with AFUED flag 🎓");
      }
    } catch {}
    setOpenMenu(null);
  };

  useEffect(() => {
    setLoading(true);
    load();
    const ch = supabase
      .channel(`feed-${channel}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channel]);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const visiblePosts = posts;

  return (
    <>
      <div className="no-scrollbar sticky top-[57px] z-20 flex gap-2 overflow-x-auto border-b bg-background px-4 py-3">
        {["All", ...FEED_CHANNELS].map((c) => (
          <button key={c} onClick={() => setChannel(c)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${channel === c ? "bg-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}>
            {c === "All" ? "All" : shortFaculty(c)}
          </button>
        ))}
      </div>
      <div className="space-y-4 p-4">
        <Composer 
          defaultChannel={channel} 
          onOptimisticAdd={(temp: any) => setPosts(prev => [temp, ...prev])}
          onOptimisticReplace={(tempId: string, real: any) => setPosts(prev => prev.map(p => p.id === tempId ? { ...p, ...real, isUploading: false } : p))}
          onOptimisticRemove={(tempId: string) => setPosts(prev => prev.filter(p => p.id !== tempId))}
          onPosted={load} 
        />
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : visiblePosts.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No posts in this channel yet.</p>
        ) : (
          visiblePosts.map((p) => (
            <div key={p.id} className="relative">
              {(p as any).isUploading && (
                <div className="absolute top-0 left-0 right-0 z-20 h-1 overflow-hidden rounded-t-2xl bg-muted">
                  <div className="h-full w-full animate-pulse bg-primary" style={{ width: `${(p as any).uploadPct || 30}%` }} />
                </div>
              )}
              <div className="absolute right-3 top-3 z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === p.id ? null : p.id); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white border shadow-sm hover:bg-muted"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {openMenu === p.id && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-xl overflow-hidden animate-in fade-in">
                    <button onClick={(e) => { e.stopPropagation(); handleShare(p); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left">
                      <Share2 className="h-4 w-4" /> Share / Invite
                    </button>
                    {p.user_id === user?.id && (
                      <>
                        <div className="h-[1px] bg-gray-100" />
                        <button onClick={(e) => { e.stopPropagation(); setEditingPost(p); setEditContent(p.content); setOpenMenu(null); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left">
                          <Pencil className="h-4 w-4" /> Edit Post
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteEveryone(p.id); }} disabled={deletingId === p.id} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-red-50 text-red-500 text-left disabled:opacity-50">
                          {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete for Everyone
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className={(p as any).isUploading ? "opacity-80" : ""}>
                <PostCard post={p} author={profiles[p.user_id]} commentCount={counts[p.id] ?? 0} onComments={() => setOpenPost(p.id)} />
              </div>
              {(p as any).isUploading && <p className="px-4 pb-2 text-[11px] text-primary font-semibold">Uploading fast like WhatsApp... {(p as any).uploadPct || 0}%</p>}
            </div>
          ))
        )}
      </div>
      <CommentsSheet postId={openPost} onClose={() => setOpenPost(null)} />
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold mb-3 text-lg">Edit Post</h3>
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} className="w-full rounded-xl border p-3 text-[15px] outline-none focus:ring-2 focus:ring-primary" placeholder="Edit your post..." />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditingPost(null)} className="rounded-full px-5 py-2 text-sm bg-muted font-medium">Cancel</button>
              <button onClick={handleEditSave} className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Composer({ defaultChannel, onPosted, onOptimisticAdd, onOptimisticReplace, onOptimisticRemove }: { 
  defaultChannel: string; 
  onPosted: () => void;
  onOptimisticAdd: (p: any) => void;
  onOptimisticReplace: (tempId: string, real: any) => void;
  onOptimisticRemove: (tempId: string) => void;
}) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState("");
  const picker = useMediaPicker();
  const [faculty, setFaculty] = useState<string>(FEED_CHANNELS.includes(profile?.faculty as never) ? profile!.faculty! : FEED_CHANNELS[0]!);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (defaultChannel !== "All") setFaculty(defaultChannel); }, [defaultChannel]);
  const [pct, setPct] = useState<number | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [editedFiles, setEditedFiles] = useState<File[]>([]);
  const [showEditorBtn, setShowEditorBtn] = useState(false);

  useEffect(() => {
    if (picker.files.length > 0) {
      const hasImage = picker.files.some((f: any) => f.type?.startsWith('image/') || f.type?.startsWith('video/'));
      setShowEditorBtn(hasImage);
    } else {
      setShowEditorBtn(false);
    }
  }, [picker.files]);

  function openEditorForFirstImage() {
    const img = picker.files.find((f: any) => f.type?.startsWith('image/') || f.type?.startsWith('video/'));
    if (!img) return;
    setEditorFile(img);
    setEditorUrl(URL.createObjectURL(img));
  }

  // FIXED: Video edited file no go lost again - e go keep burned video
  function onEditorSend(editedDataUrl: string, captionFromEditor: string, editedFile?: File | null) {
    if (captionFromEditor) setContent(prev => prev ? prev + " " + captionFromEditor : captionFromEditor);
    if (editorFile?.type?.startsWith('video/')) {
      if (editedFile) {
        setEditedFiles([editedFile]);
        toast.success("Video Edited! Text dey inside video now 🎬 Press Post");
      } else {
        toast.success("Caption added! Press Post now 🎬");
      }
      setEditorUrl(null); setEditorFile(null);
      return;
    }
    fetch(editedDataUrl).then(r => r.blob()).then(blob => {
      const newFile = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setEditedFiles([newFile]);
      toast.success("Edited! Press Post now to post edited picture 🎨");
    });
    setEditorUrl(null); setEditorFile(null);
  }

  const post = async () => {
    if (!user || (!content.trim() && !picker.files.length && editedFiles.length===0)) return;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since.toISOString());
    if ((count ?? 0) >= MAX_POSTS_PER_DAY) { toast.error(`You can post up to ${MAX_POSTS_PER_DAY} times per day`); return; }
    const filesToUpload = editedFiles.length > 0 ? editedFiles : picker.files;
    const localImages: string[] = [];
    let localVideo = "";
    let localMusic = "";
    const blobUrls: string[] = [];
    for (const f of filesToUpload) {
      const blobUrl = URL.createObjectURL(f);
      blobUrls.push(blobUrl);
      const name = (f.name?.toLowerCase() || "");
      const type = f.type || "";
      const isMusic = type.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".m4a") || name.endsWith(".ogg") || name.endsWith(".wav");
      const isVideo = type.startsWith("video/");
      if (isMusic) localMusic = blobUrl;
      else if (isVideo) localVideo = blobUrl;
      else localImages.push(blobUrl);
    }
    const tempId = `temp-${Date.now()}`;
    const tempPost: any = {
      id: tempId,
      user_id: user.id,
      content: content.trim(),
      faculty_channel: faculty,
      image_urls: localImages,
      image_url: localImages[0] || "",
      music_url: localMusic,
      video_url: localVideo,
      created_at: new Date().toISOString(),
      isUploading: true,
      uploadPct: 5
    };
    onOptimisticAdd(tempPost);
    const savedContent = content.trim();
    const savedFaculty = faculty;
    setContent(""); 
    picker.clear();
    setEditedFiles([]);
    setShowEditorBtn(false);
    setBusy(true);
    try {
      let image_urls: string[] = [];
      let music_url = "";
      let video_url = "";
      for (let i = 0; i < filesToUpload.length; i++) {
        const file: any = filesToUpload[i];
        const name = file.name?.toLowerCase() || "";
        const type = file.type || "";
        const isMusic = type.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".m4a") || name.endsWith(".ogg") || name.endsWith(".wav");
        const isVideo = type.startsWith("video/");
        const url = await uploadToBunny(file, isMusic ? "music" : isVideo ? "videos" : "images", (p) => {
          setPct(p);
          onOptimisticReplace(tempId, { uploadPct: p });
        });
        if (isMusic) music_url = url;
        else if (isVideo) video_url = url;
        else image_urls.push(url);
      }
      const { data, error } = await supabase.from("posts").insert({
        user_id: user.id,
        content: savedContent,
        faculty_channel: savedFaculty,
        image_urls: image_urls,
        image_url: image_urls[0] || "",
        music_url: music_url,
        video_url: video_url,
      } as any).select().single();
      if (error) throw error;
      onOptimisticReplace(tempId, { ...data, uploadPct: 100, isUploading: false });
      blobUrls.forEach(u => URL.revokeObjectURL(u));
      toast.success("Posted! Fast like WhatsApp! 🚀");
      onPosted();
    } catch (e) { 
      toast.error((e as Error).message); 
      onOptimisticRemove(tempId);
      blobUrls.forEach(u => URL.revokeObjectURL(u));
    } finally { 
      setBusy(false); 
      setPct(null); 
    }
  };

  return (
    <>
      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex gap-3">
          <Avatar url={profile?.avatar_url} name={profile?.full_name} />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's happening on campus? Add pic + music 🎵" rows={2} className="flex-1 resize-none bg-transparent pt-2 text-[15px] outline-none" />
        </div>
        {picker.grid(busy)}
        {showEditorBtn && editedFiles.length===0 && (
          <button onClick={openEditorForFirstImage} className="mt-2 w-full rounded-full bg-[#00a884] py-2.5 text-sm font-bold text-white shadow">
            🎨 Edit Picture / Video Like WhatsApp - Draw, Text, Crop
          </button>
        )}
        {editedFiles.length>0 && (
          <div className="mt-2 rounded-xl bg-green-50 border border-green-200 p-2 text-center text-sm font-semibold text-green-700">
            ✅ Picture Edited! Ready to Post. Press Post below.
          </div>
        )}
        <UploadBar pct={pct} />
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          {picker.input}
          <button onClick={picker.open} disabled={busy} className="rounded-full p-2 text-primary hover:bg-accent" aria-label="Add photos, videos or music">
            <ImagePlus className="h-5 w-5" />
          </button>
          <button onClick={picker.open} disabled={busy} className="flex items-center gap-1 rounded-full p-2 text-primary hover:bg-accent" aria-label="Add music">
            <Music className="h-4 w-4" /><span className="text-[10px] font-bold">MP3</span>
          </button>
          <select value={faculty} onChange={(e) => setFaculty(e.target.value)} className="min-w-0 flex-1 truncate rounded-full bg-muted px-3 py-2 text-xs font-medium outline-none">
            {FEED_CHANNELS.map((f) => <option key={f} value={f}>{shortFaculty(f)}</option>)}
          </select>
          <button onClick={post} disabled={busy} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? (pct !== null ? `${pct}%` : <Loader2 className="h-4 w-4 animate-spin" />) : "Post"}
          </button>
        </div>
      </div>
      {editorUrl && (
        <FeedWhatsAppEditor imageUrl={editorUrl} isVideo={editorFile?.type?.startsWith('video/')} onCancel={() => { setEditorUrl(null); setEditorFile(null); }} onSend={onEditorSend} />
      )}
    </>
  );
}

// === FEED EDITOR V6 - MODERN WHATSAPP - NO MUSIC, NO STICKER - VIDEO TEXT BURNED INSIDE, NOT CAPTION ===
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

function FeedWhatsAppEditor({ imageUrl, isVideo, onCancel, onSend }: any){
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

  useEffect(()=>{
    if(isVideo && videoRef.current){
      if(tool==='pen' || tool==='eraser' || tool==='text' || tool==='crop') videoRef.current.pause();
      else videoRef.current.play().catch(()=>{});
    }
  },[tool, isVideo]);

  useEffect(()=>{
    if(isVideo) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentImage;
    img.onload = ()=>{
      const canvas = canvasRef.current;
      if(!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  },[currentImage, isVideo]);

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
    const container = document.getElementById('crop-container-feed');
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    cropStart.current = { handle, startX: cx, startY: cy, box: {...cropBox}, rect };
    setCropHandle(handle);
  }
  function startCropMove(e:any){
    const container = document.getElementById('crop-container-feed');
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

  // === VIDEO BURN - Text / Pen / Emoji go inside video, NOT caption ===
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
        let raf = 0;
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
          raf = requestAnimationFrame(drawFrame);
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
      if(burnedFile){
        // caption na ONLY caption box, screen text NO go join caption
        onSend(URL.createObjectURL(burnedFile), caption, burnedFile);
      } else {
        onSend(imageUrl, caption);
      }
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image(); img.crossOrigin='anonymous'; img.src=currentImage;
    await new Promise((res)=>(img.onload=res));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.filter = filter;
    ctx.drawImage(img,0,0);
    ctx.filter = 'none';
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    drawLines.forEach((line:any)=>{
      ctx.strokeStyle=line.color; ctx.lineWidth=line.size*2*scaleX; ctx.lineCap='round'; ctx.beginPath();
      line.points.forEach((p:any,i:number)=>{ const X=p.x*scaleX, Y=p.y*scaleY; if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y); });
      ctx.stroke();
    });
    texts.forEach((t:any)=>{ ctx.font=`bold ${42*scaleX}px Arial`; ctx.fillStyle=t.color; ctx.strokeStyle='black'; ctx.lineWidth=3; ctx.strokeText(t.text, t.x*scaleX, t.y*scaleY); ctx.fillText(t.text, t.x*scaleX, t.y*scaleY); });
    emojis.forEach((e:any)=>{ ctx.font=`${80*scaleX}px Arial`; ctx.fillText(e.emoji, e.x*scaleX, e.y*scaleY); });
    onSend(canvas.toDataURL('image/jpeg',0.92), caption);
  }

  return (
    <div style={{position:'fixed', inset:0, background:'black', zIndex:1000, display:'flex', flexDirection:'column'}}>
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
        <div id="crop-container-feed" onMouseMove={moveCropHandle} onTouchMove={moveCropHandle} onMouseUp={endCropHandle} onTouchEnd={endCropHandle} style={{flex:1, position:'relative', background:'black', display:'flex', flexDirection:'column', overflow:'hidden'}}>
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
    </div>
  );
       }

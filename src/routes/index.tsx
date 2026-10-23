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

  function onEditorSend(editedDataUrl: string, captionFromEditor: string) {
    if (captionFromEditor) setContent(prev => prev ? prev + " " + captionFromEditor : captionFromEditor);
    if (editorFile?.type?.startsWith('video/')) {
      toast.success("Caption added! Press Post now 🎬");
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
            🎨 Edit Picture / Video Like WhatsApp - Draw, Text, Emoji, Crop
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

// === FEED EDITOR V3 - GALAXY CROP + DRAG TEXT/EMOJI + VIDEO PAUSE - NO Cropper, NO prompt(), NO 4-corner ===
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
  const [tool, setTool] = useState<'pen'|'emoji'|'crop'|'text'>('pen');
  const [color, setColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [caption, setCaption] = useState('');
  const COLORS = ['#ff0000','#ff9500','#ffeb00','#00e676','#00b0ff','#ff4081','#ffffff','#000000','#9c27b0'];
  const EMOJIS = ['😂','❤️','🔥','😍','👍','😮','🥰','😭','🙏','🎉','💯','😎','🎓','🇳🇬','✨','👑'];
  const [emojis, setEmojis] = useState<any[]>([]);
  const [texts, setTexts] = useState<any[]>([]);
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [directText, setDirectText] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [drawLines, setDrawLines] = useState<any[]>([]);
  const [dragItem, setDragItem] = useState<any>(null);

  // STEP 1: GALAXY CROP - drag middle, pinch zoom, frame dey still
  const [gx, setGx] = useState(0);
  const [gy, setGy] = useState(0);
  const [gScale, setGScale] = useState(1);
  const galaxyDrag = useRef<any>(null);
  const galaxyPinch = useRef<number | null>(null);
  const galaxyStartScale = useRef(1);

  // STEP 3: VIDEO PAUSE - when you draw / type, video pause so ink no break
  useEffect(()=>{
    if(isVideo && videoRef.current){
      if(tool==='pen' || tool==='text' || tool==='emoji') videoRef.current.pause();
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

  // STEP 2: DRAG TEXT / EMOJI
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
    if(dragItem.type==='text'){
      setTexts(prev=>prev.map((t,i)=> i===dragItem.index ? {...t, x: dragItem.origX+dx, y: dragItem.origY+dy} : t));
    } else {
      setEmojis(prev=>prev.map((t,i)=> i===dragItem.index ? {...t, x: dragItem.origX+dx, y: dragItem.origY+dy} : t));
    }
  }
  function endDragItem(){ setDragItem(null); }

  function startDraw(e:any){
    if(dragItem) return;
    if(tool!=='pen') return;
    setIsDrawing(true);
    const {x,y} = getPos(e);
    setDrawLines(prev=>[...prev, {color, size: brushSize, points:[{x,y}]}]);
  }
  function draw(e:any){
    if(dragItem){ moveDragItem(e); return; }
    if(!isDrawing) return;
    const {x,y} = getPos(e);
    setDrawLines(prev=>{
      const copy=[...prev];
      const last=copy[copy.length-1];
      if(last) last.points.push({x,y});
      return copy;
    });
  }
  function endDraw(){ setIsDrawing(false); endDragItem(); }
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
  function addEmoji(emoji:string){
    setEmojis(prev=>[...prev, {emoji, x: 120, y: 220}]);
  }

  // STEP 1: GALAXY CROP FUNCTIONS
  async function applyGalaxyCrop(){
    const img = new Image();
    img.crossOrigin='anonymous';
    img.src = currentImage;
    await new Promise((res)=>(img.onload=res));
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,img.width,img.height);
    const drawW = img.width * gScale;
    const drawH = img.height * gScale;
    const offsetX = (img.width - drawW)/2 + (gx * 2);
    const offsetY = (img.height - drawH)/2 + (gy * 2);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    const cropped = canvas.toDataURL('image/jpeg', 0.92);
    setCurrentImage(cropped);
    setGx(0); setGy(0); setGScale(1);
    setTool('pen');
  }
  function onGalaxyTouchStart(e:any){
    if(e.touches?.length===2){
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      galaxyPinch.current = Math.sqrt(dx*dx+dy*dy);
      galaxyStartScale.current = gScale;
      return;
    }
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    galaxyDrag.current = {x: cx, y: cy, gx, gy};
  }
  function onGalaxyTouchMove(e:any){
    if(e.touches?.length===2 && galaxyPinch.current){
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const newScale = galaxyStartScale.current * (dist / galaxyPinch.current);
      setGScale(Math.max(1, Math.min(3, newScale)));
      return;
    }
    if(!galaxyDrag.current) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    setGx(galaxyDrag.current.gx + (cx - galaxyDrag.current.x));
    setGy(galaxyDrag.current.gy + (cy - galaxyDrag.current.y));
  }
  function onGalaxyTouchEnd(){
    galaxyDrag.current = null;
    galaxyPinch.current = null;
  }

  async function handleSend(){
    if(isVideo){
      const textPart = texts.map((t:any)=>t.text).join(' ');
      const emojiPart = emojis.map((e:any)=>e.emoji).join(' ');
      const fullCaption = [caption, textPart, emojiPart].filter(Boolean).join(' ');
      onSend(imageUrl, fullCaption);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image(); img.crossOrigin='anonymous'; img.src=currentImage;
    await new Promise((res)=>(img.onload=res));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0);
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
      <div style={{display:'flex', justifyContent:'space-between', padding:'12px', background:'#111'}}>
        <button onClick={onCancel} style={{color:'white', background:'none', border:'none', fontSize:24}}>✕</button>
        <div style={{display:'flex', gap:18, alignItems:'center'}}>
          <button onClick={()=>setTool('emoji')} style={{color: tool==='emoji'?'#00e676':'white', background:'none', border:'none', fontSize:22}}>😊</button>
          {!isVideo && <button onClick={()=>setTool('crop')} style={{color: tool==='crop'?'#00e676':'white', background:'none', border:'none', fontSize:16, fontWeight:'bold'}}>Crop</button>}
          <button onClick={()=>{ setShowTextInput(true); setTool('text'); }} style={{color: tool==='text'?'#00e676':'white', background:'none', border:'none', fontSize:22, fontWeight:'bold'}}>Aa</button>
          <button onClick={()=>setTool('pen')} style={{color: tool==='pen'?'#00e676':'white', background:'none', border:'none', fontSize:22}}>✏️</button>
          <button onClick={undo} style={{color:'white', background:'none', border:'none', fontSize:22, fontWeight:'bold'}}>↩</button>
        </div>
      </div>

      {tool==='crop' && !isVideo ? (
        <div style={{position:'relative', flex:1, background:'#000', display:'flex', flexDirection:'column', overflow:'hidden'}}>
          <div style={{textAlign:'center', color:'white', fontSize:13, padding:'10px'}}>
            👆 Drag middle to move picture • Pinch 2 fingers to zoom • Like Samsung Gallery
          </div>
          <div
            onMouseDown={onGalaxyTouchStart}
            onMouseMove={onGalaxyTouchMove}
            onMouseUp={onGalaxyTouchEnd}
            onTouchStart={onGalaxyTouchStart}
            onTouchMove={onGalaxyTouchMove}
            onTouchEnd={onGalaxyTouchEnd}
            style={{flex:1, position:'relative', overflow:'hidden', touchAction:'none', cursor:'grab'}}
          >
            <img src={currentImage} draggable={false} style={{position:'absolute', left:'50%', top:'50%', width:'90%', height:'80%', objectFit:'cover', transform:`translate(calc(-50% + ${gx}px), calc(-50% + ${gy}px)) scale(${gScale})`, pointerEvents:'none'}} />
            <div style={{position:'absolute', left:'5%', top:'10%', width:'90%', height:'80%', border:'2px solid white', pointerEvents:'none', boxSizing:'border-box'}}>
              <div style={{position:'absolute', left:'33.3%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.5)'}} />
              <div style={{position:'absolute', left:'66.6%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.5)'}} />
              <div style={{position:'absolute', top:'33.3%', left:0, right:0, height:1, background:'rgba(255,255,255,0.5)'}} />
              <div style={{position:'absolute', top:'66.6%', left:0, right:0, height:1, background:'rgba(255,255,255,0.5)'}} />
            </div>
          </div>
          <div style={{background:'#111', padding:'12px'}}>
            <div style={{display:'flex', alignItems:'center', gap:10, color:'white', marginBottom:12}}>
              <span style={{fontSize:12}}>Zoom Out</span>
              <input type="range" min={1} max={3} step={0.1} value={gScale} onChange={e=>setGScale(Number(e.target.value))} style={{flex:1}} />
              <span style={{fontSize:12}}>Zoom In</span>
            </div>
            <div style={{display:'flex', gap:10}}>
              <button onClick={()=>{ setGx(0); setGy(0); setGScale(1); setTool('pen'); }} style={{flex:1, background:'#333', color:'white', border:'none', padding:'12px', borderRadius:20}}>Cancel</button>
              <button onClick={()=>{ setGx(0); setGy(0); setGScale(1); }} style={{background:'#444', color:'white', border:'none', padding:'12px 16px', borderRadius:20}}>Reset</button>
              <button onClick={applyGalaxyCrop} style={{flex:1, background:'#00a884', color:'white', border:'none', padding:'12px', borderRadius:20, fontWeight:'bold'}}>Done Crop ✂️</button>
            </div>
          </div>
        </div>
      ) : (
      <div style={{flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#000'}} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}>
        {isVideo ? (
          <video ref={videoRef} src={currentImage} controls playsInline autoPlay loop muted style={{maxWidth:'100%', maxHeight:'100%'}} />
        ) : (
          <canvas ref={canvasRef} style={{maxWidth:'100%', maxHeight:'100%', touchAction:'none'}} />
        )}
        <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none'}}>
          {drawLines.map((line:any, li:number)=>(
            <polyline key={li} points={line.points.map((p:any)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={line.color} strokeWidth={line.size} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
        {texts.map((t:any,i:number)=>(
          <div key={i} onMouseDown={(e)=>startDragItem(e,'text',i)} onTouchStart={(e)=>startDragItem(e,'text',i)} style={{position:'absolute', left:t.x, top:t.y, color:t.color, fontSize:28, fontWeight:'bold', textShadow:'0 2px 4px black', cursor:'move', touchAction:'none', padding:'6px 10px', border:'1px dashed rgba(255,255,255,0.5)', borderRadius:8}}>✋ {t.text}</div>
        ))}
        {emojis.map((e:any,i:number)=>(
          <div key={i} onMouseDown={(ev)=>startDragItem(ev,'emoji',i)} onTouchStart={(ev)=>startDragItem(ev,'emoji',i)} style={{position:'absolute', left:e.x, top:e.y, fontSize:40, cursor:'move', touchAction:'none'}}>✋ {e.emoji}</div>
        ))}
        {showTextInput && (
          <div style={{position:'absolute', top:'35%', left:16, right:16, background:'rgba(0,0,0,0.9)', borderRadius:16, padding:14, zIndex:30}}>
            <input autoFocus value={directText} onChange={e=>setDirectText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') confirmDirectText(); }} placeholder="Type here - keyboard go open..." style={{width:'100%', padding:'14px', borderRadius:10, border:'none', fontSize:18, background:'#222', color:'white', outline:'none', boxSizing:'border-box'}} />
            <div style={{display:'flex', gap:8, marginTop:10}}>
              {COLORS.slice(0,6).map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:'50%',background:c,border:color===c?'3px solid white':'1px solid #555'}} />))}
            </div>
            <p style={{color:'#aaa', fontSize:12, margin:'8px 0 0'}}>After you add am, hold am and drag am go anywhere</p>
            <div style={{display:'flex', gap:8, marginTop:10}}>
              <button onClick={()=>setShowTextInput(false)} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#333',color:'white'}}>Cancel</button>
              <button onClick={confirmDirectText} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#00a884',color:'white',fontWeight:'bold'}}>Add + Drag</button>
            </div>
          </div>
        )}
      </div>
      )}

      {tool==='emoji' && (
        <div style={{background:'#222', padding:12, display:'flex', gap:8, flexWrap:'wrap'}}>
          {EMOJIS.map(e=><button key={e} onClick={()=>addEmoji(e)} style={{fontSize:30, background:'none', border:'none'}}>{e}</button>)}
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
          </div>
          <div style={{color:'#aaa', fontSize:12, marginTop:6}}>{isVideo ? '⏸️ Video don pause - draw now, ink no go break' : '✏️ Draw with finger'}</div>
        </div>
      )}
      <div style={{background:'#111', padding:'12px', display:'flex', gap:8, alignItems:'center'}}>
        <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Add a caption..." style={{flex:1, padding:'10px 14px', borderRadius:20, border:'none', background:'#222', color:'white'}} />
        <button onClick={handleSend} style={{width:48, height:48, borderRadius:'50%', background:'#00a884', color:'white', border:'none', fontSize:20}}>➤</button>
      </div>
    </div>
  );
  }

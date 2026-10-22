import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ImagePlus, Loader2, Paperclip, MoreHorizontal, Pencil, Trash2, Share2, Music, EyeOff } from "lucide-react";
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
  // === HIDE FOR ME (Delete For Me for Feed) - saved on this phone only ===
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('afued_hidden_posts') || '[]') } catch { return [] }
  });

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

  // Delete for Me = Hide for Me for Feed
  const handleHideForMe = (postId: string) => {
    const next = [...hiddenIds, postId];
    setHiddenIds(next);
    localStorage.setItem('afued_hidden_posts', JSON.stringify(next));
    toast.success("Hidden for you only. Others still see am.");
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

  const visiblePosts = posts.filter(p => !hiddenIds.includes(p.id));

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
                    <button onClick={(e) => { e.stopPropagation(); handleHideForMe(p.id); }} className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted text-left">
                      <EyeOff className="h-4 w-4" /> Hide for Me
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
                    {p.user_id !== user?.id && (
                      <div className="px-4 py-2 text-[11px] text-gray-400">Hide = Delete for Me. Only you no go see am again.</div>
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

  // === WHATSAPP EDITOR FOR FEED ===
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [editedFiles, setEditedFiles] = useState<File[]>([]);
  const [showEditorBtn, setShowEditorBtn] = useState(false);

  // When user picks files, if e get image, show "Edit with WhatsApp Editor" button
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
    setEditorFile(img);
    setEditorUrl(URL.createObjectURL(img));
  }

  function onEditorSend(editedDataUrl: string, captionFromEditor: string) {
    if (captionFromEditor) setContent(prev => prev ? prev + " " + captionFromEditor : captionFromEditor);
    // Convert edited image to File and store it, remove original
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

    // Use edited files if we have them, else picker.files
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
      
      onOptimisticReplace(tempId, {
        ...data,
        uploadPct: 100,
        isUploading: false
      });

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
            🎨 Edit Picture Like WhatsApp - Draw, Text, Emoji
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
        <FeedWhatsAppEditor imageUrl={editorUrl} onCancel={() => { setEditorUrl(null); setEditorFile(null); }} onSend={onEditorSend} />
      )}
    </>
  );
}

// === FEED WHATSAPP EDITOR - PAINT, TEXT, EMOJI ===
function FeedWhatsAppEditor({ imageUrl, onCancel, onSend }: any){
  const canvasRef = useRef<any>(null);
  const [tool, setTool] = useState<'pen'|'emoji'>('pen');
  const [color, setColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [caption, setCaption] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const COLORS = ['#ff0000','#ff9500','#ffeb00','#00e676','#00b0ff','#ff4081','#ffffff','#000000','#9c27b0'];
  const EMOJIS = ['😂','❤️','🔥','😍','👍','😮','🥰','😭','🙏','🎉','💯','😎'];
  const [emojis, setEmojis] = useState<any[]>([]);
  const [texts, setTexts] = useState<any[]>([]);

  useEffect(()=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = ()=>{
      const canvas = canvasRef.current;
      if(!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
    };
  },[imageUrl]);

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
        <div style={{display:'flex', gap:16}}>
          <button onClick={()=>setTool('emoji')} style={{color: tool==='emoji'?'#00e676':'white', background:'none', border:'none', fontSize:20}}>😊</button>
          <button onClick={addText} style={{color:'white', background:'none', border:'none', fontSize:20, fontWeight:'bold'}}>T</button>
          <button onClick={()=>setTool('pen')} style={{color: tool==='pen'?'#00e676':'white', background:'none', border:'none', fontSize:20}}>✏️</button>
          <button onClick={undo} style={{color:'white', background:'none', border:'none', fontSize:20}}>↩️</button>
        </div>
      </div>
      <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative'}}>
        <canvas ref={canvasRef} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} style={{maxWidth:'100%', maxHeight:'100%', touchAction:'none'}} />
        {texts.map((t:any,i:number)=>(<div key={i} style={{position:'absolute', left:60, top:120+t.y, color:t.color, fontSize:26, fontWeight:'bold', textShadow:'0 2px 4px black'}}>{t.text}</div>))}
        {emojis.map((e:any,i:number)=>(<div key={i} style={{position:'absolute', left:e.x, top:150+e.y, fontSize:36}}>{e.emoji}</div>))}
      </div>
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

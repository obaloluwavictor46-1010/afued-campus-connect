import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToBunny } from '../lib/bunny'
import { Smile, Paperclip, Camera, Mic, Send, Trash2, Pause, Play, ArrowLeft } from 'lucide-react'
import Cropper from "react-easy-crop"

export const Route = createFileRoute('/chat/$userId')({
  component: ChatPage,
})

function ChatPage(){
  const { userId: otherUserId } = Route.useParams()
  const [me, setMe] = useState<any>(null)
  const [other, setOther] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [convId, setConvId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  
  const [recording, setRecording] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const [levels, setLevels] = useState<number[]>(Array(24).fill(8))
  const recRef = useRef<MediaRecorder|null>(null)
  const streamRef = useRef<MediaStream|null>(null)
  const ctxRef = useRef<AudioContext|null>(null)
  const timerRef = useRef<any>(null)
  const analyserRef = useRef<AnalyserNode|null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  // === DELETE STATE ===
  const [selectedMsg, setSelectedMsg] = useState<any>(null)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const pressTimer = useRef<any>(null)

  // === WHATSAPP EDITOR STATE ===
  const [pendingFile, setPendingFile] = useState<any>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [pendingType, setPendingType] = useState<string>('image')

  useEffect(()=>{
    let mounted = true
    async function boot(){
      try{
        const {data:{user}} = await supabase.auth.getUser()
        if(!mounted) return
        setMe(user)
        const {data} = await supabase.from('profiles').select('*').eq('id', otherUserId).maybeSingle()
        if(mounted) setOther(data)
        initChat()
      }catch(e){ console.log(e) }
    }
    boot()
    return ()=> { 
      mounted = false
      try{ supabase.removeAllChannels() }catch{}
      cleanupRec()
    }
  },[otherUserId])

  useEffect(()=>{ 
    try{ listRef.current?.scrollTo(0, listRef.current.scrollHeight) }catch{}
  }, [messages])

  async function initChat(){
    try{
      const { data: {user} } = await supabase.auth.getUser()
      if(!user) return
      let { data: conv } = await supabase.from('conversations').select('*').or(`and(participant1.eq.${user.id},participant2.eq.${otherUserId}),and(participant1.eq.${otherUserId},participant2.eq.${user.id})`).maybeSingle()
      if(!conv){
        const { data: newC, error } = await supabase.from('conversations').insert({participant1:user.id, participant2:otherUserId}).select().maybeSingle()
        if(error){ console.log(error); return }
        conv = newC
      }
      if(conv){ 
        setConvId(conv.id); 
        loadMsgs(conv.id);
        subscribeToChat(conv.id);
      }
    }catch(e){ console.log(e) }
  }

  function subscribeToChat(cId:string){
    try{ supabase.removeAllChannels() }catch{}
    try{
      const channel = supabase.channel(`chat-${cId}`)
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cId}` }, 
          (payload)=>{
            const newMsg = payload.new as any
            setMessages(prev=>{
              const filtered = prev.filter(m=> !String(m.id).startsWith('temp-'))
              if(filtered.some(m=>m.id===newMsg.id)) return filtered
              // If I deleted it for me, don't show it
              if((newMsg.deleted_for||[]).includes(me?.id)) return filtered
              return [...filtered, newMsg]
            })
          }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cId}` },
          (payload)=>{
            const updated = payload.new as any
            setMessages(prev=> prev.map(m=> m.id===updated.id ? updated : m))
          }
        )
        .subscribe()
    }catch(e){ console.log(e) }
  }

  async function loadMsgs(cId:string){
    try{
      const { data: {user} } = await supabase.auth.getUser()
      const { data } = await supabase.from('messages').select('*').eq('conversation_id', cId).order('created_at', {ascending:true})
      const filtered = (data||[]).filter((m:any)=> !(m.deleted_for||[]).includes(user?.id))
      setMessages(filtered)
    }catch(e){ console.log(e) }
  }

  // === DELETE FUNCTIONS ===
  function onPressStart(msg:any){
    pressTimer.current = setTimeout(()=>{
      setSelectedMsg(msg)
      setShowDeleteMenu(true)
    }, 500)
  }
  function onPressEnd(){ if(pressTimer.current) clearTimeout(pressTimer.current) }

  async function deleteForMe(){
    if(!selectedMsg || !me?.id) return
    if(String(selectedMsg.id).startsWith('temp-')){ setMessages(prev=>prev.filter(m=>m.id!==selectedMsg.id)); setShowDeleteMenu(false); return }
    const newList = [...(selectedMsg.deleted_for||[]), me.id]
    await supabase.from('messages').update({ deleted_for: newList }).eq('id', selectedMsg.id)
    setMessages(prev=>prev.filter(m=>m.id!==selectedMsg.id))
    setShowDeleteMenu(false)
  }

  async function deleteForEveryone(){
    if(!selectedMsg) return
    if(selectedMsg.sender_id !== me?.id){ alert("You can only Delete for Everyone your own message"); return }
    if(String(selectedMsg.id).startsWith('temp-')){ setMessages(prev=>prev.filter(m=>m.id!==selectedMsg.id)); setShowDeleteMenu(false); return }
    await supabase.from('messages').update({ 
      deleted_for_everyone: true,
      content: '🚫 This message was deleted',
      deleted_at: new Date().toISOString()
    }).eq('id', selectedMsg.id)
    setMessages(prev=>prev.map(m=> m.id===selectedMsg.id ? {...m, deleted_for_everyone:true, content:'🚫 This message was deleted'} : m))
    setShowDeleteMenu(false)
  }

  async function send(type='text', content=''){
    const msg = content || text
    if(!msg && type==='text') return
    if(!convId) return
    const { data: {user} } = await supabase.auth.getUser()
    if(!user?.id) return
    const tempId = `temp-${Date.now()}`
    const tempMsg: any = {
      id: tempId,
      conversation_id: convId,
      sender_id: user?.id,
      type,
      content: msg,
      created_at: new Date().toISOString(),
      isUploading: false
    }
    setMessages(prev=>[...prev, tempMsg])
    if(type==='text') setText('')
    
    try{
      const { error } = await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type, content: msg})
      if(error) throw error
    }catch(e){
      console.log(e)
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
    }
  }

  // When user picks image/video, open WhatsApp Editor first, don't send straight
  function handlePick(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
    if(file.size > 50*1024*1024){ e.target.value=''; return }
    const localUrl = URL.createObjectURL(file)
    const isVideoFile = file.type.startsWith('video/')
    setPendingFile(file)
    setPendingUrl(localUrl)
    setPendingType(isVideoFile ? 'video' : type)
    e.target.value = ''
  }

  async function handleUploadEdited(editedDataUrl:string, caption:string){
    if(!pendingFile) return
    const file = pendingFile
    const tempId = `temp-${Date.now()}`
    // Convert edited image back to file if it's image
    let fileToUpload = file
    if(pendingType==='image' && editedDataUrl.startsWith('data:image')){
      const res = await fetch(editedDataUrl)
      const blob = await res.blob()
      fileToUpload = new File([blob], file.name || `edited-${Date.now()}.jpg`, {type:'image/jpeg'})
    }
    const localUrl = editedDataUrl || URL.createObjectURL(fileToUpload)
    setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type: pendingType, content: localUrl, isUploading: true, created_at: new Date().toISOString() }])
    setPendingFile(null); setPendingUrl(null)
    
    try{
      setUploading(true); setProgress(0)
      const url = await uploadToBunny(fileToUpload, pendingType==='video' ? 'videos' : pendingType==='image' ? 'chat_images' : 'files', (p)=> setProgress(p))
      setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading: false} : m))
      const { data: {user} } = await supabase.auth.getUser()
      if(user?.id && convId){
        await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type: pendingType, content: url})
        if(caption?.trim()){
          await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type:'text', content: caption})
        }
      }
      setTimeout(()=> setMessages(prev=>prev.filter(m=>m.id!==tempId)), 600)
    }catch(err:any){
      console.log(err)
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
    }finally{
      setUploading(false); setProgress(0)
    }
  }

  async function handleUpload(e:any, type='image'){
    // For files (pdf etc) send straight, no editor. For image/video use editor.
    const file = e.target.files[0]; if(!file) return
    if(file.type.startsWith('image/') || file.type.startsWith('video/')){
      handlePick(e, type); return
    }
    if(file.size > 50*1024*1024){ e.target.value=''; return }
    const localUrl = URL.createObjectURL(file)
    const tempId = `temp-${Date.now()}`
    setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type, content: localUrl, isUploading: true, created_at: new Date().toISOString() }])
    try{
      setUploading(true); setProgress(0)
      const url = await uploadToBunny(file, 'files', (p)=> setProgress(p))
      setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading: false} : m))
      const { data: {user} } = await supabase.auth.getUser()
      if(user?.id && convId){
        await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type, content: url})
      }
      setTimeout(()=> setMessages(prev=>prev.filter(m=>m.id!==tempId)), 600)
    }catch(err:any){
      console.log(err)
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
    }finally{
      setUploading(false); setProgress(0)
      e.target.value = ''
      setTimeout(()=> { try{ URL.revokeObjectURL(localUrl) }catch{} }, 5000)
    }
  }

  // === FIXED VOICE - CLEAR LIKE WHATSAPP, NO TV NOISE ===
  async function startVoice(){
    if(recording) return
    try{
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        }
      })
      streamRef.current = stream
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate:44100})
      ctxRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      const src = audioCtx.createMediaStreamSource(stream)
      src.connect(analyser)
      analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
      recRef.current = rec
      const tick = () => {
        try{
          if(analyserRef.current){
            analyserRef.current.getByteFrequencyData(data)
            const avg = data.reduce((a,b)=>a+b,0)/data.length
            setLevels(prev=>[...prev.slice(1), Math.max(8, avg*1.5)])
          }
        }catch{}
        if(recRef.current?.state==='recording') requestAnimationFrame(tick)
      }
      tick()
      const chunks:any[]=[]
      rec.ondataavailable = e=>{ if(e.data.size>0) chunks.push(e.data) }
      rec.onstop = async()=>{
        const blob = new Blob(chunks,{type: mimeType})
        if(blob.size < 800) { cleanupRec(); return }
        const file = new File([blob], `voice-${Date.now()}.webm`, {type: mimeType})
        const tempId = `temp-${Date.now()}`
        const localUrl = URL.createObjectURL(blob)
        setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type:'voice', content: localUrl, isUploading: true, created_at: new Date().toISOString() }])
        try{
          setUploading(true); setProgress(0)
          const url = await uploadToBunny(file, 'voices', (p)=> setProgress(p))
          setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading:false} : m))
          const { data: {user} } = await supabase.auth.getUser()
          if(user?.id && convId){
            await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type:'voice', content: url})
          }
          setTimeout(()=> setMessages(prev=>prev.filter(m=>m.id!==tempId)), 600)
        }catch(err:any){
          console.log(err)
          setMessages(prev=>prev.filter(m=>m.id!==tempId))
        }finally{ setUploading(false); setProgress(0); try{ URL.revokeObjectURL(localUrl) }catch{} }
        cleanupRec()
      }
      rec.start(100)
      setRecording(true)
      setRecTime(0)
      timerRef.current = setInterval(()=>setRecTime(t=>t+1),1000)
    }catch(e){ console.log(e); cleanupRec() }
  }

  function cleanupRec(){
    try{ if(timerRef.current) clearInterval(timerRef.current) }catch{}
    try{ streamRef.current?.getTracks().forEach(t=>t.stop()) }catch{}
    try{ ctxRef.current?.close() }catch{}
    setRecording(false); setRecTime(0); setLevels(Array(24).fill(8))
  }

  function stopVoice(){ try{ recRef.current?.stop() }catch{ cleanupRec() } }
  function cancelVoice(){ 
    try{ recRef.current?.stop() }catch{}
    setTimeout(()=>{ 
      setMessages(prev=>prev.filter(m=> !(String(m.id).startsWith('temp-') && m.type==='voice'))); 
      cleanupRec() 
    },100) 
  }

  return (
    <div style={{maxWidth:480, margin:'0 auto', height:'100vh', display:'flex', flexDirection:'column', background:'#efeae2'}}>
      <div style={{padding:'10px 12px', background:'white', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10}}>
        <Link to="/chat" style={{padding:4, textDecoration:'none', color:'black'}}><ArrowLeft size={20}/></Link>
        <Link to={`/u/${otherUserId}`} style={{display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'black', flex:1}}>
          <img src={other?.avatar_url||`https://ui-avatars.com/api/?name=${other?.full_name||'User'}&background=0866ff&color=fff`} style={{width:38,height:38,borderRadius:19, objectFit:'cover'}}/>
          <div>
            <b style={{fontSize:15, display:'flex', alignItems:'center', gap:4}}>{other?.full_name||'Chat'} <span style={{background:'#1877f2', color:'white', borderRadius:'50%', fontSize:9, width:12, height:12, display:'flex', alignItems:'center', justifyContent:'center'}}>✓</span></b>
            <div style={{fontSize:11, color:'#65676b'}}>Tap to view • Follow • Posts</div>
          </div>
        </Link>
        <div style={{display:'flex', gap:12, fontSize:18}}>📞 🎥</div>
      </div>

      <div ref={listRef} style={{flex:1, overflowY:'auto', padding:'12px 8px 90px'}}>
        {messages.map(m=>(
          <div key={m.id} style={{display:'flex', justifyContent: m.sender_id===me?.id?'flex-end':'flex-start', margin:'4px 0'}}>
            <div 
              onMouseDown={()=>onPressStart(m)}
              onMouseUp={onPressEnd}
              onMouseLeave={onPressEnd}
              onTouchStart={()=>onPressStart(m)}
              onTouchEnd={onPressEnd}
              style={{
                maxWidth:'76%', padding:'8px 10px', borderRadius: m.sender_id===me?.id ? '18px 18px 0 18px' : '18px 18px 18px 0',
                background: m.sender_id===me?.id ? '#0084ff' : 'white',
                color: m.sender_id===me?.id ? 'white' : '#111b21',
                boxShadow:'0 1px 0.5px rgba(0,0,0,0.13)',
                opacity: (m as any).isUploading ? 0.7 : 1,
                userSelect:'none', WebkitUserSelect:'none' as any, touchAction:'manipulation'
              }}>
              {m.deleted_for_everyone ? (
                <i style={{fontSize:13, opacity:0.7}}>🚫 This message was deleted</i>
              ) : (
                <>
                  {m.type==='text' && <span style={{fontSize:15, lineHeight:'19px', wordBreak:'break-word'}}>{m.content}</span>}
                  {m.type==='image' && <img src={m.content} style={{width:220, borderRadius:12, display:'block', maxHeight:320, objectFit:'cover'}} loading="lazy"/>}
                  {m.type==='file' && <a href={m.content} target="_blank" rel="noreferrer" style={{color: m.sender_id===me?.id?'white':'#0084ff', fontSize:14, textDecoration:'none'}}>📎 Open File</a>}
                  {m.type==='voice' && <VoiceBubble url={m.content} isMe={m.sender_id===me?.id} />}
                  {m.type==='video' && <video src={m.content} controls playsInline style={{width:230, borderRadius:12, background:'black', maxHeight:320}} />}
                  {(m as any).isUploading && <div style={{fontSize:10, marginTop:4}}>⏳</div>}
                </>
              )}
            </div>
          </div>
        ))}
        {uploading && (
          <div style={{textAlign:'center', padding:8, background:'#dbeafe', borderRadius:18, margin:'8px auto', fontSize:12, maxWidth:220, color:'#1e40af'}}>
            🚀 {progress}% uploading
            <div style={{height:3, background:'#e2e8f0', borderRadius:2, marginTop:4}}><div style={{width:`${progress}%`, height:3, background:'#1877f2', transition:'width 0.2s'}}/></div>
          </div>
        )}
      </div>

      {/* DELETE MENU - WhatsApp style */}
      {showDeleteMenu && (
        <>
          <div onClick={()=>setShowDeleteMenu(false)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:90}} />
          <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'white', padding:16, borderRadius:'16px 16px 0 0', zIndex:100, boxShadow:'0 -2px 20px rgba(0,0,0,0.2)'}}>
            <div style={{textAlign:'center', fontWeight:'700', marginBottom:12, fontSize:15}}>Delete message?</div>
            <button onClick={deleteForMe} style={{width:'100%', padding:13, marginBottom:8, border:'none', background:'#f0f2f5', borderRadius:10, fontSize:15}}>Delete for Me</button>
            {selectedMsg?.sender_id === me?.id && (
              <button onClick={deleteForEveryone} style={{width:'100%', padding:13, marginBottom:8, border:'none', background:'#ffebee', color:'#d32f2f', borderRadius:10, fontWeight:'600', fontSize:15}}>Delete for Everyone</button>
            )}
            <button onClick={()=>setShowDeleteMenu(false)} style={{width:'100%', padding:13, border:'none', background:'white', borderRadius:10, fontSize:15}}>Cancel</button>
          </div>
        </>
      )}

      {/* WHATSAPP EDITOR */}
      {pendingUrl && (
        <WhatsAppEditor imageUrl={pendingUrl} isVideo={pendingType==='video'} onCancel={()=>{setPendingUrl(null); setPendingFile(null)}} onSend={handleUploadEdited} />
      )}

      {recording && (
        <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'#202c33', display:'flex', alignItems:'center', gap:10, padding:'12px 16px', zIndex:50}}>
          <button onClick={cancelVoice} style={{background:'#f15c6d', border:'none', borderRadius:'50%', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center'}}><Trash2 size={20} color="white"/></button>
          <div style={{flex:1, display:'flex', gap:2, alignItems:'center', height:32}}>{levels.map((l,i)=><div key={i} style={{width:3, height:`${l}%`, background:'#00a884', borderRadius:2, minHeight:4}}/>)}</div>
          <span style={{color:'white', fontFamily:'monospace', fontSize:14}}>{Math.floor(recTime/60)}:{String(recTime%60).padStart(2,'0')}</span>
          <button onClick={stopVoice} style={{background:'#0084ff', border:'none', borderRadius:'50%', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center'}}><Send size={18} color="white"/></button>
        </div>
      )}

      <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'white', padding:'6px 8px', display:'flex', alignItems:'flex-end', gap:6, borderTop:'1px solid #e4e6eb'}}>
        <div style={{flex:1, background:'#f0f2f5', borderRadius:24, display:'flex', alignItems:'flex-end', padding:'4px 6px', gap:2}}>
          <button style={{padding:8, border:'none', background:'transparent'}}><Smile size={22} color="#65676b"/></button>
          <input value={text} onChange={e=>setText(e.target.value)} placeholder="Aa" style={{flex:1, border:'none', outline:'none', padding:'8px 2px', fontSize:15, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter') send() }}/>
          <button onClick={()=>fileRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Paperclip size={20} color="#65676b" style={{transform:'rotate(45deg)'}}/></button>
          <button onClick={()=>camRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Camera size={20} color="#65676b"/></button>
        </div>
        
        {text.trim() ? (
          <button onClick={()=>send()} style={{width:48, height:48, borderRadius:'50%', background:'#0084ff', border:'none', display:'flex', alignItems:'center', justifyContent:'center'}}><Send size={20} color="white"/></button>
        ) : (
          <button onClick={startVoice} style={{width:48, height:48, borderRadius:'50%', background:'#0084ff', border:'none', display:'flex', alignItems:'center', justifyContent:'center'}}><Mic size={22} color="white"/></button>
        )}

        <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.zip,.mp3" onChange={e=>handleUpload(e,'file')}/>
        <input ref={camRef} type="file" accept="image/*,video/*" hidden onChange={e=>handleUpload(e,'image')}/>
      </div>
    </div>
  )
}

function VoiceBubble({ url, isMe }: { url: string; isMe: boolean }){
  const [playing, setPlaying] = useState(false)
  const [pct, setPct] = useState(0)
  const audioRef = useRef<HTMLAudioElement|null>(null)
  const [dur, setDur] = useState(0)
  const toggle = ()=>{
    try{
      if(!audioRef.current){
        const a = new Audio(url)
        audioRef.current = a
        a.onloadedmetadata = ()=> setDur(a.duration||0)
        a.ontimeupdate = ()=> { if(a.duration) setPct((a.currentTime / a.duration)*100) }
        a.onended = ()=> setPlaying(false)
        a.onpause = ()=> setPlaying(false)
      }
      if(playing){ audioRef.current?.pause(); setPlaying(false) }
      else { audioRef.current?.play().catch(()=>{}); setPlaying(true) }
    }catch(e){ console.log(e) }
  }
  useEffect(()=>{ return ()=>{ try{ audioRef.current?.pause() }catch{} } },[])
  return (
    <div style={{display:'flex', alignItems:'center', gap:10, minWidth:180}}>
      <button onClick={toggle} style={{width:36, height:36, borderRadius:'50%', border:'none', background: isMe ? '#0064d1' : '#0084ff', display:'flex', alignItems:'center', justifyContent:'center'}}>
        {playing ? <Pause size={16} color="white"/> : <Play size={16} color="white" style={{marginLeft:2}}/>}
      </button>
      <div style={{flex:1}}>
        <div style={{height:3, background: isMe ? 'rgba(255,255,255,0.4)' : '#e4e6eb', borderRadius:2}}><div style={{width:`${pct}%`, height:3, background: isMe ? 'white' : '#0084ff', borderRadius:2, transition:'width 0.1s'}}/></div>
        <div style={{fontSize:10, marginTop:4, opacity:0.8}}>{dur ? `${Math.floor(dur/60)}:${String(Math.floor(dur%60)).padStart(2,'0')}` : '0:00'} • 🔊</div>
      </div>
    </div>
  )
}

// === WHATSAPP EDITOR - X | STICKER | CROP | Aa | PEN - NO MUSIC ===
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

function WhatsAppEditor({ imageUrl, isVideo, onCancel, onSend }: any){
  const canvasRef = useRef<any>(null)
  const [tool, setTool] = useState<'pen'|'emoji'|'crop'>('pen')
  const [color, setColor] = useState('#ff0000')
  const [brushSize, setBrushSize] = useState(5)
  const [isDrawing, setIsDrawing] = useState(false)
  const [caption, setCaption] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const COLORS = ['#ff0000','#ff9500','#ffeb00','#00e676','#00b0ff','#ff4081','#ffffff','#000000','#9c27b0']
  const EMOJIS = ['😂','❤️','🔥','😍','👍','😮','🥰','😭','🙏','🎉','💯','😎','🎓','🇳🇬','✨','👑']
  const [emojis, setEmojis] = useState<any[]>([])
  const [texts, setTexts] = useState<any[]>([])
  const [currentImage, setCurrentImage] = useState(imageUrl)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<any>(null)

  useEffect(()=>{
    if(isVideo) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = currentImage
    img.onload = ()=>{
      const canvas = canvasRef.current
      if(!canvas) return
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
    }
  },[currentImage, isVideo])

  function saveHistory(){
    const canvas = canvasRef.current
    if(canvas) setHistory(prev => [...prev, canvas.toDataURL()])
  }
  function getPos(e:any){
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX ?? e.touches?.[0]?.clientX
    const cy = e.clientY ?? e.touches?.[0]?.clientY
    const x = (cx - rect.left) * (canvas.width / rect.width)
    const y = (cy - rect.top) * (canvas.height / rect.height)
    return {x,y}
  }
  function startDraw(e:any){
    if(tool!=='pen' || isVideo) return
    saveHistory()
    setIsDrawing(true)
    const {x,y} = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.strokeStyle = color
    ctx.lineWidth = brushSize * 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x,y)
  }
  function draw(e:any){
    if(!isDrawing) return
    const {x,y} = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x,y)
    ctx.stroke()
  }
  function endDraw(){ setIsDrawing(false) }
  function undo(){
    if(history.length===0) return
    const last = history[history.length-1]
    const img = new Image()
    img.src = last
    img.onload = ()=>{
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0,0,canvas.width, canvas.height)
      ctx.drawImage(img,0,0)
    }
    setHistory(prev => prev.slice(0,-1))
  }
  function addText(){
    const t = prompt("Type text to add on image:")
    if(!t) return
    setTexts(prev=>[...prev, {text:t, x:60, y:80+prev.length*40, color}])
  }
  function addEmoji(emoji:string){
    setEmojis(prev=>[...prev, {emoji, x:60+prev.length*40, y:140}])
  }
  async function applyCrop(){
    if(!croppedArea) return
    const cropped = await getCroppedImg(currentImage, croppedArea)
    setCurrentImage(cropped)
    setTool('pen')
    setCrop({x:0,y:0})
    setZoom(1)
  }
  async function handleSend(){
    if(isVideo){ onSend(imageUrl, caption); return }
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    texts.forEach((t:any)=>{ ctx.font = `bold 32px Arial`; ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y) })
    emojis.forEach((e:any)=>{ ctx.font = '60px Arial'; ctx.fillText(e.emoji, e.x, e.y) })
    const finalImage = canvas.toDataURL('image/jpeg', 0.9)
    onSend(finalImage, caption)
  }

  return (
    <div style={{position:'fixed', inset:0, background:'black', zIndex:1000, display:'flex', flexDirection:'column'}}>
      <div style={{display:'flex', justifyContent:'space-between', padding:'12px', background:'#111'}}>
        <button onClick={onCancel} style={{color:'white', background:'none', border:'none', fontSize:20}}>✕</button>
        <div style={{display:'flex', gap:16, alignItems:'center'}}>
          <button onClick={()=>setTool('emoji')} style={{color: tool==='emoji'?'#00e676':'white', background:'none', border:'none', fontSize:20}}>😊</button>
          {!isVideo && <button onClick={()=>setTool('crop')} style={{color: tool==='crop'?'#00e676':'white', background:'none', border:'none', fontSize:16, fontWeight:'bold'}}>Crop</button>}
          <button onClick={addText} style={{color:'white', background:'none', border:'none', fontSize:20, fontWeight:'bold'}}>Aa</button>
          <button onClick={()=>setTool('pen')} style={{color: tool==='pen'?'#00e676':'white', background:'none', border:'none', fontSize:20}}>✏️</button>
          <button onClick={undo} style={{color:'white', background:'none', border:'none', fontSize:20}}>↩️</button>
        </div>
      </div>

      {tool==='crop' && !isVideo ? (
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
        {isVideo ? (
          <video src={imageUrl} controls playsInline style={{maxWidth:'100%', maxHeight:'100%'}} />
        ) : (
          <canvas ref={canvasRef} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} style={{maxWidth:'100%', maxHeight:'100%', touchAction:'none'}} />
        )}
        {texts.map((t:any,i:number)=>(<div key={i} style={{position:'absolute', left:t.x, top:120+t.y, color:t.color, fontSize:26, fontWeight:'bold', textShadow:'0 2px 4px black'}}>{t.text}</div>))}
        {emojis.map((e:any,i:number)=>(<div key={i} style={{position:'absolute', left:e.x, top:150+e.y, fontSize:36}}>{e.emoji}</div>))}
      </div>
      )}
      {tool==='emoji' && (
        <div style={{background:'#222', padding:12, display:'flex', gap:8, flexWrap:'wrap'}}>
          {EMOJIS.map(e=><button key={e} onClick={()=>addEmoji(e)} style={{fontSize:28, background:'none', border:'none'}}>{e}</button>)}
        </div>
      )}
      {tool==='pen' && !isVideo && (
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
      {isVideo && <div style={{background:'#111', color:'#aaa', padding:10, fontSize:12, textAlign:'center'}}>Video: You can add caption below. Paint for video coming next.</div>}
      <div style={{background:'#111', padding:'12px', display:'flex', gap:8, alignItems:'center'}}>
        <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Add a caption..." style={{flex:1, padding:'10px 14px', borderRadius:20, border:'none', background:'#222', color:'white'}} />
        <button onClick={handleSend} style={{width:48, height:48, borderRadius:'50%', background:'#00a884', color:'white', border:'none', fontSize:20}}>➤</button>
      </div>
    </div>
  )
    }

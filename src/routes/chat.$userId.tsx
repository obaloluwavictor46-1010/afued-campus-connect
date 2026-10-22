import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToBunny } from '../lib/bunny'
import { Smile, Paperclip, Camera, Mic, Send, Trash2, Pause, Play, ArrowLeft } from 'lucide-react'

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
              return [...filtered, newMsg]
            })
          }
        )
        .subscribe()
    }catch(e){ console.log(e) }
  }

  async function loadMsgs(cId:string){
    try{
      const { data } = await supabase.from('messages').select('*').eq('conversation_id', cId).order('created_at', {ascending:true})
      setMessages(data||[])
    }catch(e){ console.log(e) }
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

  async function handleUpload(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
    if(file.size > 50*1024*1024){ e.target.value=''; return }
    const localUrl = URL.createObjectURL(file)
    const tempId = `temp-${Date.now()}`
    const isVideoFile = file.type.startsWith('video/')
    const displayType = isVideoFile ? 'video' : type
    
    setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type: displayType, content: localUrl, isUploading: true, created_at: new Date().toISOString() }])
    
    try{
      setUploading(true); setProgress(0)
      const url = await uploadToBunny(file, isVideoFile ? 'videos' : type==='image' ? 'chat_images' : 'files', (p)=> setProgress(p))
      setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading: false} : m))
      const { data: {user} } = await supabase.auth.getUser()
      if(user?.id && convId){
        await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type: displayType, content: url})
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
      {/* FACEBOOK STYLE HEADER - TAP TO PROFILE */}
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
            <div style={{
              maxWidth:'76%', padding:'8px 10px', borderRadius: m.sender_id===me?.id ? '18px 18px 0 18px' : '18px 18px 18px 0',
              background: m.sender_id===me?.id ? '#0084ff' : 'white',
              color: m.sender_id===me?.id ? 'white' : '#111b21',
              boxShadow:'0 1px 0.5px rgba(0,0,0,0.13)',
              opacity: (m as any).isUploading ? 0.7 : 1
            }}>
              {m.type==='text' && <span style={{fontSize:15, lineHeight:'19px', wordBreak:'break-word'}}>{m.content}</span>}
              {m.type==='image' && <img src={m.content} style={{width:220, borderRadius:12, display:'block', maxHeight:320, objectFit:'cover'}} loading="lazy"/>}
              {m.type==='file' && <a href={m.content} target="_blank" rel="noreferrer" style={{color: m.sender_id===me?.id?'white':'#0084ff', fontSize:14, textDecoration:'none'}}>📎 Open File</a>}
              {m.type==='voice' && <VoiceBubble url={m.content} isMe={m.sender_id===me?.id} />}
              {m.type==='video' && <video src={m.content} controls playsInline style={{width:230, borderRadius:12, background:'black', maxHeight:320}} />}
              {(m as any).isUploading && <div style={{fontSize:10, marginTop:4}}>⏳</div>}
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

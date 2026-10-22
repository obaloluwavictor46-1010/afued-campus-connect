import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToBunny, startBoldVoiceRecording } from '../lib/bunny'
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
    supabase.auth.getUser().then(({data})=>setMe(data.user))
    supabase.from('profiles').select('*').eq('id', otherUserId).single().then(({data})=>setOther(data))
    initChat()
    return ()=> { supabase.removeAllChannels() }
  },[])

  useEffect(()=>{ listRef.current?.scrollTo(0, listRef.current.scrollHeight) }, [messages])

  async function initChat(){
    const { data: {user} } = await supabase.auth.getUser()
    if(!user) return
    let { data: conv } = await supabase.from('conversations').select('*').or(`and(participant1.eq.${user.id},participant2.eq.${otherUserId}),and(participant1.eq.${otherUserId},participant2.eq.${user.id})`).maybeSingle()
    if(!conv){
      const { data: newC } = await supabase.from('conversations').insert({participant1:user.id, participant2:otherUserId}).select().single()
      conv = newC
    }
    if(conv){ 
      setConvId(conv.id); 
      loadMsgs(conv.id);
      subscribeToChat(conv.id);
    }
  }

  function subscribeToChat(cId:string){
    supabase.removeAllChannels()
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
  }

  async function loadMsgs(cId:string){
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', cId).order('created_at', {ascending:true})
    setMessages(data||[])
  }

  async function send(type='text', content=''){
    const msg = content || text
    if(!msg && type==='text') return
    const { data: {user} } = await supabase.auth.getUser()
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
    setText('')
    
    try{
      const { error } = await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type, content: msg})
      if(error) throw error
    }catch(e){
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
      alert("Send fail - check internet")
    }
  }

  async function handleUpload(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
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
      await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type: displayType, content: url})
      setTimeout(()=> setMessages(prev=>prev.filter(m=>m.id!==tempId)), 800)
    }catch(err:any){
      alert(err.message)
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
    }finally{
      setUploading(false); setProgress(0)
      e.target.value = ''
      setTimeout(()=> URL.revokeObjectURL(localUrl), 5000)
    }
  }

  async function startVoice(){
    if(recording) return; // FIX: Prevent double start
    try{
      const { stream, audioCtx, rec } = await startBoldVoiceRecording()
      streamRef.current = stream
      ctxRef.current = audioCtx
      recRef.current = rec

      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      const src = audioCtx.createMediaStreamSource(stream)
      src.connect(analyser)
      analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        if(analyserRef.current){
          analyserRef.current.getByteFrequencyData(data)
          const avg = data.reduce((a,b)=>a+b,0)/data.length
          setLevels(prev=>[...prev.slice(1), Math.max(8, avg*1.3)])
        }
        if(recRef.current?.state==='recording') requestAnimationFrame(tick)
      }
      tick()

      const chunks:any[]=[]
      rec.ondataavailable = e=>{ if(e.data.size>0) chunks.push(e.data) }
      rec.onstop = async()=>{
        const blob = new Blob(chunks,{type:'audio/webm;codecs=opus'})
        if(blob.size < 1000) { cleanupRec(); return }
        const file = new File([blob], `voice-${Date.now()}.webm`, {type:'audio/webm'})
        const tempId = `temp-${Date.now()}`
        const localUrl = URL.createObjectURL(blob)
        setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type:'voice', content: localUrl, isUploading: true, created_at: new Date().toISOString() }])
        try{
          setUploading(true); setProgress(0)
          // FIX: use 'voices' folder to match Bunny
          const url = await uploadToBunny(file, 'voices', (p)=> setProgress(p))
          setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading:false} : m))
          const { data: {user} } = await supabase.auth.getUser()
          await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type:'voice', content: url})
          setTimeout(()=> setMessages(prev=>prev.filter(m=>m.id!==tempId)), 800)
        }catch(err:any){
          alert(err.message)
          setMessages(prev=>prev.filter(m=>m.id!==tempId))
        }finally{ setUploading(false); setTimeout(()=> URL.revokeObjectURL(localUrl), 5000) }
        cleanupRec()
      }

      rec.start(100)
      setRecording(true)
      setRecTime(0)
      timerRef.current = setInterval(()=>setRecTime(t=>t+1),1000)

    }catch(e){ console.log(e) }
  }

  function cleanupRec(){
    if(timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t=>t.stop())
    try{ ctxRef.current?.close() }catch{}
    setRecording(false); setRecTime(0); setLevels(Array(24).fill(8))
  }

  function stopVoice(){ recRef.current?.stop() }
  function cancelVoice(){ 
    try{ recRef.current?.stop() }catch{}
    setTimeout(()=>{ 
      setMessages(prev=>prev.filter(m=> !(String(m.id).startsWith('temp-') && m.type==='voice'))); 
      cleanupRec() 
    },100) 
  }

  return (
    <div style={{maxWidth:480, margin:'0 auto', height:'100vh', display:'flex', flexDirection:'column', background:'#efeae2'}}>
      {/* FIXED: TAP TO PROFILE - NOW GOES TO /u/ NOT /profile */}
      <div style={{padding:'10px 12px', background:'white', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10}}>
        <Link to="/chat" style={{padding:4}}><ArrowLeft size={20}/></Link>
        <Link to={`/u/${otherUserId}`} style={{display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'black', flex:1}}>
          <img src={other?.avatar_url||`https://ui-avatars.com/api/?name=${other?.full_name||'User'}`} style={{width:36,height:36,borderRadius:18, objectFit:'cover'}}/>
          <div><b style={{fontSize:15}}>{other?.full_name||'Chat'}</b><div style={{fontSize:11, color:'#667781'}}>tap to view profile • posts • follow</div></div>
        </Link>
      </div>

      <div ref={listRef} style={{flex:1, overflowY:'auto', padding:'12px 8px 90px'}}>
        {messages.map(m=>(
          <div key={m.id} style={{display:'flex', justifyContent: m.sender_id===me?.id?'flex-end':'flex-start', margin:'4px 0'}}>
            <div style={{
              maxWidth:'75%', padding:'8px 10px', borderRadius: m.sender_id===me?.id ? '16px 16px 0 16px' : '16px 16px 16px 0',
              background: m.sender_id===me?.id ? '#005c4b' : 'white',
              color: m.sender_id===me?.id ? 'white' : '#111b21',
              boxShadow:'0 1px 0.5px rgba(0,0,0,0.13)',
              opacity: (m as any).isUploading ? 0.7 : 1
            }}>
              {m.type==='text' && <span style={{fontSize:15, lineHeight:'19px', wordBreak:'break-word'}}>{m.content}</span>}
              {m.type==='image' && <img src={m.content} style={{width:220, borderRadius:8, display:'block', maxHeight:300, objectFit:'cover'}} loading="lazy"/>}
              {m.type==='file' && <a href={m.content} target="_blank" rel="noreferrer" style={{color: m.sender_id===me?.id?'#e9edef':'#008069', fontSize:14}}>📎 Open File</a>}
              {m.type==='voice' && <VoiceBubble url={m.content} isMe={m.sender_id===me?.id} />}
              {m.type==='video' && <video src={m.content} controls playsInline style={{width:220, borderRadius:8, background:'black', maxHeight:300}} />}
              {(m as any).isUploading && <div style={{fontSize:10, marginTop:4}}>⏳ uploading...</div>}
            </div>
          </div>
        ))}
        {uploading && (
          <div style={{textAlign:'center', padding:8, background:'#dcfce7', borderRadius:18, margin:'8px auto', fontSize:12, maxWidth:220, color:'#005c4b'}}>
            🚀 {progress}% • Fast like WhatsApp
            <div style={{height:3, background:'#e2e8f0', borderRadius:2, marginTop:4}}><div style={{width:`${progress}%`, height:3, background:'#00a884', transition:'width 0.2s'}}/></div>
          </div>
        )}
      </div>

      {recording && (
        <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'#202c33', display:'flex', alignItems:'center', gap:10, padding:'12px 16px', zIndex:50}}>
          <button onClick={cancelVoice} style={{background:'#f15c6d', border:'none', borderRadius:'50%', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center'}}><Trash2 size={20} color="white"/></button>
          <div style={{flex:1, display:'flex', gap:2, alignItems:'center', height:32}}>{levels.map((l,i)=><div key={i} style={{width:3, height:`${l}%`, background:'#00a884', borderRadius:2, minHeight:4}}/>)}</div>
          <span style={{color:'white', fontFamily:'monospace', fontSize:14}}>{Math.floor(recTime/60)}:{String(recTime%60).padStart(2,'0')}</span>
          <button onClick={stopVoice} style={{background:'#00a884', border:'none', borderRadius:'50%', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center'}}><Send size={18} color="white"/></button>
        </div>
      )}

      <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'#f0f2f5', padding:'6px 8px', display:'flex', alignItems:'flex-end', gap:6, borderTop:'1px solid #e9edef'}}>
        <div style={{flex:1, background:'white', borderRadius:24, display:'flex', alignItems:'flex-end', padding:'4px 6px', gap:2}}>
          <button style={{padding:8, border:'none', background:'transparent'}}><Smile size={22} color="#54656f"/></button>
          <input value={text} onChange={e=>setText(e.target.value)} placeholder="Message" style={{flex:1, border:'none', outline:'none', padding:'8px 2px', fontSize:16, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter') send() }}/>
          <button onClick={()=>fileRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Paperclip size={20} color="#54656f" style={{transform:'rotate(45deg)'}}/></button>
          <button onClick={()=>camRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Camera size={20} color="#54656f"/></button>
        </div>
        
        {text.trim() ? (
          <button onClick={()=>send()} style={{width:48, height:48, borderRadius:'50%', background:'#00a884', border:'none', display:'flex', alignItems:'center', justifyContent:'center'}}><Send size={20} color="white"/></button>
        ) : (
          /* FIXED: Mic now only starts recording, no auto-stop on touchEnd */
          <button onClick={startVoice} style={{width:48, height:48, borderRadius:'50%', background:'#00a884', border:'none', display:'flex', alignItems:'center', justifyContent:'center'}}><Mic size={22} color="white"/></button>
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
    if(!audioRef.current){
      const a = new Audio(url)
      audioRef.current = a
      a.onloadedmetadata = ()=> setDur(a.duration)
      a.ontimeupdate = ()=> setPct((a.currentTime / a.duration)*100)
      a.onended = ()=> setPlaying(false)
      a.onpause = ()=> setPlaying(false)
    }
    if(playing){ audioRef.current?.pause(); setPlaying(false) }
    else { audioRef.current?.play(); setPlaying(true) }
  }

  useEffect(()=>{ return ()=>{ audioRef.current?.pause() } },[])

  return (
    <div style={{display:'flex', alignItems:'center', gap:10, minWidth:180}}>
      <button onClick={toggle} style={{width:36, height:36, borderRadius:'50%', border:'none', background: isMe ? '#025144' : '#00a884', display:'flex', alignItems:'center', justifyContent:'center'}}>
        {playing ? <Pause size={16} color="white"/> : <Play size={16} color="white" style={{marginLeft:2}}/>}
      </button>
      <div style={{flex:1}}>
        <div style={{height:3, background: isMe ? 'rgba(255,255,255,0.3)' : '#e9edef', borderRadius:2}}><div style={{width:`${pct}%`, height:3, background: isMe ? 'white' : '#00a884', borderRadius:2, transition:'width 0.1s'}}/></div>
        <div style={{fontSize:10, marginTop:4, opacity:0.7}}>{dur ? `${Math.floor(dur/60)}:${String(Math.floor(dur%60)).padStart(2,'0')}` : '0:00'} • 🔊</div>
      </div>
    </div>
  )
                                     }

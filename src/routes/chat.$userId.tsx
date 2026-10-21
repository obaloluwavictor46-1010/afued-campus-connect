import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToBunny, startBoldVoiceRecording } from '../lib/bunny'
import { Smile, Paperclip, Camera, Mic, Send, Trash2, Pause, Play } from 'lucide-react'

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
  
  // WhatsApp voice states
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
    if(conv){ setConvId(conv.id); loadMsgs(conv.id) }
  }

  async function loadMsgs(cId:string){
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', cId).order('created_at')
    setMessages(data||[])
  }

  // FACEBOOK INSTANT - Show before upload!
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
      isUploading: type!=='text'
    }
    // INSTANT SHOW LIKE WHATSAPP!
    setMessages(prev=>[...prev, tempMsg])
    setText('')
    
    try{
      const { data } = await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type, content: msg, file_name: type!=='text'? 'file': null}).select().single()
      if(data){
        setMessages(prev=>prev.map(m=>m.id===tempId ? data : m))
      }
    }catch{
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
    }
  }

  async function handleUpload(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
    const localUrl = URL.createObjectURL(file)
    const tempId = `temp-${Date.now()}`
    setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, type, content: localUrl, isUploading: true, created_at: new Date().toISOString() }])
    
    try{
      setUploading(true); setProgress(0)
      const isVideo = file.type.startsWith('video/')
      const url = await uploadToBunny(file, isVideo ? 'videos' : type, (p)=> setProgress(p))
      setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading: false} : m))
      const { data: {user} } = await supabase.auth.getUser()
      await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type: isVideo ? 'video' : type, content: url})
      loadMsgs(convId)
    }catch(err:any){
      alert(err.message)
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
    }finally{
      setUploading(false); setProgress(0)
      e.target.value = ''
      URL.revokeObjectURL(localUrl)
    }
  }

  // WHATSAPP BOLD VOICE - No radio!
  async function startVoice(){
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
      rec.ondataavailable = e=>chunks.push(e.data)
      rec.onstop = async()=>{
        const blob = new Blob(chunks,{type:'audio/webm;codecs=opus'})
        if(blob.size < 1000) { cleanupRec(); return }
        const file = new File([blob], `voice-${Date.now()}.webm`, {type:'audio/webm'})
        const tempId = `temp-${Date.now()}`
        const localUrl = URL.createObjectURL(blob)
        setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, type:'voice', content: localUrl, isUploading: true, created_at: new Date().toISOString() }])
        try{
          setUploading(true); setProgress(0)
          const url = await uploadToBunny(file, 'voice', (p)=> setProgress(p))
          setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading:false} : m))
          const { data: {user} } = await supabase.auth.getUser()
          await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type:'voice', content: url})
          loadMsgs(convId)
        }finally{ setUploading(false); URL.revokeObjectURL(localUrl) }
        cleanupRec()
      }

      rec.start(100)
      setRecording(true)
      setRecTime(0)
      timerRef.current = setInterval(()=>setRecTime(t=>t+1),1000)

    }catch{}
  }

  function cleanupRec(){
    if(timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t=>t.stop())
    ctxRef.current?.close()
    setRecording(false); setRecTime(0); setLevels(Array(24).fill(8))
  }

  function stopVoice(){ recRef.current?.stop() }
  function cancelVoice(){ recRef.current?.stop(); setTimeout(()=>{ setMessages(prev=>prev.filter(m=>!m.id.startsWith('temp-') || m.type!=='voice')); cleanupRec() },100) }

  return (
    <div style={{maxWidth:480, margin:'0 auto', height:'100vh', display:'flex', flexDirection:'column', background:'#efeae2'}}>
      {/* Header */}
      <div style={{padding:'10px 12px', background:'white', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10}}>
        <button onClick={()=>history.back()}>←</button>
        <img src={other?.avatar_url||'https://via.placeholder.com/40'} style={{width:36,height:36,borderRadius:18}}/>
        <div><b style={{fontSize:15}}>{other?.full_name||'Chat'}</b><div style={{fontSize:11, color:'#667781'}}>tap for info</div></div>
      </div>

      {/* Messages */}
      <div ref={listRef} style={{flex:1, overflowY:'auto', padding:'12px 8px 80px'}}>
        {messages.map(m=>(
          <div key={m.id} style={{display:'flex', justifyContent: m.sender_id===me?.id?'flex-end':'flex-start', margin:'4px 0'}}>
            <div style={{
              maxWidth:'75%', padding:'8px 10px', borderRadius: m.sender_id===me?.id ? '16px 16px 0 16px' : '16px 16px 16px 0',
              background: m.sender_id===me?.id ? '#005c4b' : 'white',
              color: m.sender_id===me?.id ? 'white' : '#111b21',
              boxShadow:'0 1px 0.5px rgba(0,0,0,0.13)',
              opacity: (m as any).isUploading ? 0.7 : 1
            }}>
              {m.type==='text' && <span style={{fontSize:15, lineHeight:'19px'}}>{m.content}</span>}
              {m.type==='image' && <img src={m.content} style={{width:220, borderRadius:8, display:'block'}}/>}
              {m.type==='file' && <a href={m.content} target="_blank" style={{color: m.sender_id===me?.id?'#e9edef':'#008069'}}>📎 Open File</a>}
              {m.type==='voice' && <VoiceBubble url={m.content} isMe={m.sender_id===me?.id} />}
              {m.type==='video' && (
                m.content?.includes('iframe.mediadelivery.net') ? (
                  <iframe src={m.content} style={{width:220, height:150, border:0, borderRadius:8}} allow="autoplay; fullscreen" allowFullScreen />
                ) : (
                  <video src={m.content} controls playsInline style={{width:220, borderRadius:8, background:'black'}} />
                )
              )}
              {(m as any).isUploading && <div style={{fontSize:10, marginTop:4, color: m.sender_id===me?.id?'#e9edef':'#667781'}}>⏳ uploading...</div>}
            </div>
          </div>
        ))}
        {uploading && (
          <div style={{textAlign:'center', padding:8, background:'#dcfce7', borderRadius:18, margin:'8px auto', fontSize:12, maxWidth:220}}>
            🚀 {progress}% • Fast like WhatsApp
            <div style={{height:3, background:'#e2e8f0', borderRadius:2, marginTop:4}}><div style={{width:`${progress}%`, height:3, background:'#00a884'}}/></div>
          </div>
        )}
      </div>

      {/* Recording overlay - EXACT like WhatsApp */}
      {recording && (
        <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'#202c33', display:'flex', alignItems:'center', gap:10, padding:'12px 16px', zIndex:50}}>
          <button onClick={cancelVoice} style={{background:'#f15c6d', border:'none', borderRadius:'50%', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center'}}><Trash2 size={20} color="white"/></button>
          <div style={{flex:1, display:'flex', gap:2, alignItems:'center', height:32}}>{levels.map((l,i)=><div key={i} style={{width:3, height:`${l}%`, background:'#00a884', borderRadius:2, minHeight:4}}/>)}</div>
          <span style={{color:'white', fontFamily:'monospace', fontSize:14}}>{Math.floor(recTime/60)}:{String(recTime%60).padStart(2,'0')}</span>
          <span style={{color:'#8696a0', fontSize:12}}>slide to cancel</span>
          <button onClick={stopVoice} style={{background:'#00a884', border:'none', borderRadius:'50%', width:44, height:44}}><Send size={18} color="white"/></button>
        </div>
      )}

      {/* Bottom Bar - EXACT like your screenshot */}
      <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'#f0f2f5', padding:'6px 8px', display:'flex', alignItems:'flex-end', gap:6, borderTop:'1px solid #e9edef'}}>
        <div style={{flex:1, background:'white', borderRadius:24, display:'flex', alignItems:'flex-end', padding:'4px 6px', gap:2}}>
          <button style={{padding:8, border:'none', background:'transparent'}}><Smile size={22} color="#54656f"/></button>
          <input value={text} onChange={e=>setText(e.target.value)} placeholder="Message" style={{flex:1, border:'none', outline:'none', padding:'8px 2px', fontSize:16, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter') send() }}/>
          <button onClick={()=>fileRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Paperclip size={20} color="#54656f" style={{transform:'rotate(45deg)'}}/></button>
          <button onClick={()=>camRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Camera size={20} color="#54656f"/></button>
        </div>
        
        {text.trim() ? (
          <button onClick={()=>send()} style={{width:48, height:48, borderRadius:'50%', background:'#00a884', border:'none', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}><Send size={20} color="white"/></button>
        ) : (
          <button onTouchStart={startVoice} onMouseDown={startVoice} onTouchEnd={stopVoice} onMouseUp={stopVoice} style={{width:48, height:48, borderRadius:'50%', background:'#00a884', border:'none', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}><Mic size={22} color="white" style={{fill:'white'}}/></button>
        )}

        <input ref={fileRef} type="file" hidden onChange={e=>handleUpload(e,'file')}/>
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

  useEffect(()=>{
    return ()=>{ audioRef.current?.pause() }
  },[])

  return (
    <div style={{display:'flex', alignItems:'center', gap:10, minWidth:180}}>
      <button onClick={toggle} style={{width:36, height:36, borderRadius:'50%', border:'none', background: isMe ? '#025144' : '#00a884', display:'flex', alignItems:'center', justifyContent:'center'}}>
        {playing ? <Pause size={16} color="white"/> : <Play size={16} color="white" style={{marginLeft:2}}/>}
      </button>
      <div style={{flex:1}}>
        <div style={{height:3, background: isMe ? 'rgba(255,255,255,0.3)' : '#e9edef', borderRadius:2}}><div style={{width:`${pct}%`, height:3, background: isMe ? 'white' : '#00a884', borderRadius:2}}/></div>
        <div style={{fontSize:10, marginTop:4, opacity:0.7}}>{Math.floor(dur/60)}:{String(Math.floor(dur%60)).padStart(2,'0')} • 🔊 Bold</div>
      </div>
    </div>
  )
    }

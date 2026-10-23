import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToBunny } from '../lib/bunny'
import { Smile, Paperclip, Camera, Mic, Send, Trash2, Pause, Play, ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/chat/$userId')({
  component: ChatPage,
})

function ChatVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [poster, setPoster] = useState<string | undefined>(undefined)
  const [playing, setPlaying] = useState(false)
  const makePoster = () => {
    const v = ref.current
    if (!v) return
    const target = v.duration > 2 ? 0.8 : 0.1
    if (Math.abs(v.currentTime - target) > 0.1) { v.currentTime = target; return }
    try {
      if (v.videoWidth > 0) {
        const c = document.createElement("canvas")
        c.width = v.videoWidth; c.height = v.videoHeight
        const ctx = c.getContext("2d")
        if (ctx) {
          ctx.drawImage(v, 0, 0)
          const d = ctx.getImageData(0, 0, Math.min(20, c.width), Math.min(20, c.height)).data
          let b = 0; for (let i = 0; i < d.length; i += 4) b += d[i] + d[i+1] + d[i+2]
          if (b / (d.length/4) < 12 && v.duration > 2 && v.currentTime < 1.4) { v.currentTime = 1.5; return }
          setPoster(c.toDataURL("image/jpeg", 0.7))
        }
      }
    } catch {}
  }
  return (
    <div style={{ position: 'relative', width: 230 }}>
      <video ref={ref} src={src.includes("#t=") ? src : `${src}#t=0.8`} poster={poster} controls playsInline preload="metadata" muted
        style={{ width: 230, borderRadius: 12, background: 'black', maxHeight: 320 }}
        onLoadedMetadata={makePoster} onSeeked={makePoster}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      {!playing && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontSize: 28 }}>▶️</span>}
    </div>
  )
}

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
  const [selectedMsg, setSelectedMsg] = useState<any>(null)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const pressTimer = useRef<any>(null)
  const [pendingFile, setPendingFile] = useState<any>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [pendingType, setPendingType] = useState<string>('image')
  const convIdRef = useRef('')
  const meRef = useRef<any>(null)
  convIdRef.current = convId
  meRef.current = me

  // --- CHAT REQUEST GATE ---
  const [gate, setGate] = useState<'loading'|'none'|'pending_out'|'pending_in'|'declined'|'declined_in'|'allowed'>('loading')
  const [gateReqId, setGateReqId] = useState<string | null>(null)
  const [gateBusy, setGateBusy] = useState(false)

  async function checkGate(myId: string){
    try{
      // 1. If dem don chat before (old chats), allow straight - no request needed
      const { data: conv } = await supabase.from('conversations').select('id').or(`and(participant1.eq.${myId},participant2.eq.${otherUserId}),and(participant1.eq.${otherUserId},participant2.eq.${myId})`).maybeSingle()
      if(conv){
        const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id)
        if((count||0) > 0){ setGate('allowed'); initChat({ id: myId }); return }
      }
      // 2. Check request
      const { data: req } = await supabase.from('chat_requests').select('*').or(`and(sender_id.eq.${myId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${myId})`).order('created_at',{ascending:false}).limit(1).maybeSingle()
      if(!req){ setGate('none'); return }
      setGateReqId(req.id)
      if(req.status === 'accepted'){ setGate('allowed'); initChat({ id: myId }); return }
      if(req.status === 'pending'){
        if(req.sender_id === myId) setGate('pending_out')
        else setGate('pending_in')
        return
      }
      if(req.status === 'declined'){
        if(req.sender_id === myId) setGate('declined')
        else setGate('declined_in')
        return
      }
      setGate('none')
    }catch(e){ console.log(e); setGate('none') }
  }

  async function sendRequest(){
    if(!me?.id || gateBusy) return
    setGateBusy(true)
    try{
      if(gateReqId){
        const { error } = await supabase.from('chat_requests').update({ status: 'pending' }).eq('id', gateReqId)
        if(error) throw error
      } else {
        const { data, error } = await supabase.from('chat_requests').insert({ sender_id: me.id, receiver_id: otherUserId, status: 'pending' }).select().single()
        if(error) throw error
        if(data) setGateReqId(data.id)
      }
      setGate('pending_out')
    }catch(e:any){ alert(e.message || 'Could not send request') }
    setGateBusy(false)
  }

  async function handleIncoming(action: 'accepted' | 'declined'){
    if(!gateReqId || gateBusy) return
    setGateBusy(true)
    const { error } = await supabase.from('chat_requests').update({ status: action }).eq('id', gateReqId)
    if(error){ alert(error.message); setGateBusy(false); return }
    if(action === 'accepted'){ setGate('allowed'); initChat(me) }
    else { setGate('declined_in') }
    setGateBusy(false)
  }

  useEffect(()=>{
    let mounted = true
    async function boot(){
      try{
        const {data:{user}} = await supabase.auth.getUser()
        if(!mounted) return
        setMe(user); meRef.current = user
        const {data} = await supabase.from('profiles').select('*').eq('id', otherUserId).maybeSingle()
        if(mounted) setOther(data)
        if(user) checkGate(user.id)
      }catch(e){ console.log(e) }
    }
    boot()
    return ()=> {
      mounted = false
      cleanupRec()
      try{ supabase.removeChannel(supabase.channel(`chat-${convIdRef.current}`)) }catch{}
    }
  },[otherUserId])

  // Live update: if other person Accept, open chat automatically
  useEffect(()=>{
    if(!me?.id) return
    const ch = supabase.channel(`gate-${me.id}-${otherUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_requests' }, (payload:any)=>{
        const r = payload.new
        if(!r) return
        const isBetween = (r.sender_id===me.id && r.receiver_id===otherUserId) || (r.sender_id===otherUserId && r.receiver_id===me.id)
        if(!isBetween) return
        setGateReqId(r.id)
        if(r.status==='accepted'){ setGate('allowed'); initChat(me) }
        else if(r.status==='pending'){ setGate(r.sender_id===me.id ? 'pending_out' : 'pending_in') }
        else if(r.status==='declined'){ setGate(r.sender_id===me.id ? 'declined' : 'declined_in') }
      }).subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  },[me, otherUserId])

  useEffect(()=>{
    try{ listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }catch{}
  }, [messages])

  async function initChat(user?: any){
    try{
      const u = user || (await supabase.auth.getUser()).data.user
      if(!u) return
      let { data: conv } = await supabase.from('conversations').select('*').or(`and(participant1.eq.${u.id},participant2.eq.${otherUserId}),and(participant1.eq.${otherUserId},participant2.eq.${u.id})`).maybeSingle()
      if(!conv){
        const { data: newC, error } = await supabase.from('conversations').insert({participant1:u.id, participant2:otherUserId}).select().maybeSingle()
        if(error){ console.log(error); return }
        conv = newC
      }
      if(conv){
        setConvId(conv.id); convIdRef.current = conv.id
        await loadMsgs(conv.id)
        subscribeToChat(conv.id)
      }
    }catch(e){ console.log(e) }
  }

  function subscribeToChat(cId:string){
    try{ supabase.removeChannel(supabase.channel(`chat-${cId}`)) }catch{}
    try{
      supabase.channel(`chat-${cId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cId}` },
          (payload)=>{
            const newMsg = payload.new as any
            setMessages(prev=>{
              if(prev.some(m=>m.id===newMsg.id)) return prev
              if(newMsg.sender_id === meRef.current?.id){
                const tempIdx = prev.findIndex(m=> String(m.id).startsWith('temp-') && m.content===newMsg.content && m.type===newMsg.type)
                if(tempIdx !== -1){
                  const copy=[...prev]; copy[tempIdx]=newMsg; return copy
                }
                return [...prev, newMsg]
              }
              if((newMsg.deleted_for||[]).includes(meRef.current?.id)) return prev
              return [...prev, newMsg]
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

  function onPressStart(msg:any){
    pressTimer.current = setTimeout(()=>{ setSelectedMsg(msg); setShowDeleteMenu(true) }, 500)
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
    await supabase.from('messages').update({ deleted_for_everyone: true, content: '🚫 This message was deleted', deleted_at: new Date().toISOString() }).eq('id', selectedMsg.id)
    setMessages(prev=>prev.map(m=> m.id===selectedMsg.id ? {...m, deleted_for_everyone:true, content:'🚫 This message was deleted'} : m))
    setShowDeleteMenu(false)
  }

  async function send(type='text', content=''){
    if(gate !== 'allowed'){ alert('Wait for them to accept your request first'); return }
    const msg = content || text
    if(!msg && type==='text') return
    if(!convId) return
    const { data: {user} } = await supabase.auth.getUser()
    if(!user?.id) return
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
    const tempMsg: any = { id: tempId, conversation_id: convId, sender_id: user?.id, type, content: msg, created_at: new Date().toISOString(), isUploading: false, pending: true }
    setMessages(prev=>[...prev, tempMsg])
    if(type==='text') setText('')
    try{
      const { data, error } = await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type, content: msg}).select().single()
      if(error) throw error
      if(data) setMessages(prev=> prev.map(m=> m.id===tempId ? { ...data, pending: false } : m))
    }catch(e){
      console.log(e)
      setMessages(prev=> prev.map(m=> m.id===tempId ? { ...m, failed: true, pending: false } : m))
    }
  }

  function handlePick(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
    if(file.size > 50*1024*1024){ e.target.value=''; return }
    const localUrl = URL.createObjectURL(file)
    const isVideoFile = file.type.startsWith('video/')
    setPendingFile(file); setPendingUrl(localUrl); setPendingType(isVideoFile ? 'video' : type)
    e.target.value = ''
  }

  async function handleUploadEdited(editedDataUrl:string, caption:string, editedFile?: File | null){
    if(!pendingFile) return
    const file = pendingFile
    const tempId = `temp-${Date.now()}`
    let fileToUpload = file
    if(editedFile) fileToUpload = editedFile
    else if(pendingType==='image' && editedDataUrl.startsWith('data:image')){
      const res = await fetch(editedDataUrl); const blob = await res.blob()
      fileToUpload = new File([blob], file.name || `edited-${Date.now()}.jpg`, {type:'image/jpeg'})
    }
    const localUrl = editedDataUrl || URL.createObjectURL(fileToUpload)
    setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type: pendingType, content: localUrl, isUploading: true, pending: true, created_at: new Date().toISOString() }])
    setPendingFile(null); setPendingUrl(null)
    try{
      setUploading(true); setProgress(0)
      const url = await uploadToBunny(fileToUpload, pendingType==='video' ? 'videos' : pendingType==='image' ? 'chat_images' : 'files', (p)=> setProgress(p))
      setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading: false} : m))
      const { data: {user} } = await supabase.auth.getUser()
      if(user?.id && convId){
        const { data } = await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type: pendingType, content: url}).select().single()
        if(data) setMessages(prev=> prev.map(m=> m.id===tempId ? { ...data, pending: false } : m))
        if(caption?.trim()){
          await send('text', caption)
        }
      }
    }catch(err:any){
      console.log(err); setMessages(prev=>prev.map(m=> m.id===tempId ? { ...m, failed: true, isUploading: false, pending: false } : m))
    }finally{ setUploading(false); setProgress(0) }
  }

  async function handleUpload(e:any, type='image'){
    if(gate !== 'allowed') return
    const file = e.target.files[0]; if(!file) return
    if(file.type.startsWith('image/') || file.type.startsWith('video/')){ handlePick(e, type); return }
    if(file.size > 50*1024*1024){ e.target.value=''; return }
    const localUrl = URL.createObjectURL(file)
    const tempId = `temp-${Date.now()}`
    setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type, content: localUrl, isUploading: true, pending: true, created_at: new Date().toISOString() }])
    try{
      setUploading(true); setProgress(0)
      const url = await uploadToBunny(file, 'files', (p)=> setProgress(p))
      setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading: false} : m))
      const { data: {user} } = await supabase.auth.getUser()
      if(user?.id && convId){
        const { data } = await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type, content: url}).select().single()
        if(data) setMessages(prev=> prev.map(m=> m.id===tempId ? { ...data, pending: false } : m))
      }
    }catch(err:any){
      console.log(err); setMessages(prev=>prev.map(m=> m.id===tempId ? { ...m, failed: true, isUploading: false, pending: false } : m))
    }finally{
      setUploading(false); setProgress(0); e.target.value = ''
      setTimeout(()=> { try{ URL.revokeObjectURL(localUrl) }catch{} }, 5000)
    }
  }

  async function startVoice(){
    if(recording) return
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 44100, channelCount: 1 } })
      streamRef.current = stream
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate:44100})
      ctxRef.current = audioCtx
      const analyser = audioCtx.createAnalyser(); analyser.fftSize = 256
      const src = audioCtx.createMediaStreamSource(stream); src.connect(analyser); analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 }); recRef.current = rec
      const tick = () => {
        try{ if(analyserRef.current){ analyserRef.current.getByteFrequencyData(data); const avg = data.reduce((a,b)=>a+b,0)/data.length; setLevels(prev=>[...prev.slice(1), Math.max(8, avg*1.5)]) } }catch{}
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
        setMessages(prev=>[...prev, { id: tempId, sender_id: me?.id, conversation_id: convId, type:'voice', content: localUrl, isUploading: true, pending: true, created_at: new Date().toISOString() }])
        try{
          setUploading(true); setProgress(0)
          const url = await uploadToBunny(file, 'voices', (p)=> setProgress(p))
          setMessages(prev=>prev.map(m=>m.id===tempId ? {...m, content: url, isUploading:false} : m))
          const { data: {user} } = await supabase.auth.getUser()
          if(user?.id && convId){
            const { data } = await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type:'voice', content: url}).select().single()
            if(data) setMessages(prev=> prev.map(m=> m.id===tempId ? { ...data, pending: false } : m))
          }
        }catch(err:any){ console.log(err); setMessages(prev=>prev.map(m=> m.id===tempId ? { ...m, failed: true, isUploading: false, pending: false } : m)) }
        finally{ setUploading(false); setProgress(0); try{ URL.revokeObjectURL(localUrl) }catch{} }
        cleanupRec()
      }
      rec.start(100); setRecording(true); setRecTime(0)
      timerRef.current = setInterval(()=>setRecTime(t=>t+1),1000)
    }catch(e){ console.log(e); cleanupRec() }
  }
  function cleanupRec(){ try{ if(timerRef.current) clearInterval(timerRef.current) }catch{}; try{ streamRef.current?.getTracks().forEach(t=>t.stop()) }catch{}; try{ ctxRef.current?.close() }catch{}; setRecording(false); setRecTime(0); setLevels(Array(24).fill(8)) }
  function stopVoice(){ try{ recRef.current?.stop() }catch{ cleanupRec() } }
  function cancelVoice(){
    try{ recRef.current?.stop() }catch{}
    setTimeout(()=>{ setMessages(prev=>prev.filter(m=> !(String(m.id).startsWith('temp-') && m.type==='voice' && m.pending))); cleanupRec() },100)
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

      {gate === 'loading' && (<div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>Loading...</div>)}

      {gate === 'none' && (
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center'}}>
          <img src={other?.avatar_url||`https://ui-avatars.com/api/?name=${other?.full_name||'User'}&background=0866ff&color=fff`} style={{width:90,height:90,borderRadius:45, objectFit:'cover'}}/>
          <h3 style={{margin:'16px 0 6px'}}>{other?.full_name||'User'}</h3>
          <p style={{color:'#65676b', fontSize:14, lineHeight:'20px'}}>Send a message request first.<br/>{other?.full_name||'They'} go Allow before you fit chat.</p>
          <button onClick={sendRequest} disabled={gateBusy} style={{marginTop:20, padding:'13px 28px', border:'none', background:'#0084ff', color:'white', borderRadius:24, fontSize:15, fontWeight:'700'}}>{gateBusy ? 'Sending...' : '✉️ Send Message Request'}</button>
        </div>
      )}

      {gate === 'pending_out' && (
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center'}}>
          <div style={{fontSize:48}}>⏳</div>
          <h3 style={{margin:'16px 0 6px'}}>Request Sent</h3>
          <p style={{color:'#65676b', fontSize:14, lineHeight:'20px'}}>Wait for {other?.full_name||'them'} to Allow.<br/>You no fit send message until dem accept.<br/>Chat go open automatically once dem Allow.</p>
          <p style={{fontSize:12, color:'#999', marginTop:12}}>You go see notification for Chats once dem accept.</p>
        </div>
      )}

      {gate === 'pending_in' && (
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center'}}>
          <img src={other?.avatar_url||`https://ui-avatars.com/api/?name=${other?.full_name||'User'}&background=0866ff&color=fff`} style={{width:90,height:90,borderRadius:45, objectFit:'cover'}}/>
          <h3 style={{margin:'16px 0 6px'}}>{other?.full_name||'User'} wants to chat</h3>
          <p style={{color:'#65676b', fontSize:14}}>Allow first before una fit chat.</p>
          <div style={{display:'flex', gap:10, marginTop:20}}>
            <button onClick={()=>handleIncoming('accepted')} disabled={gateBusy} style={{padding:'12px 22px', border:'none', background:'#16a34a', color:'white', borderRadius:24, fontWeight:'700'}}>✅ Allow</button>
            <button onClick={()=>handleIncoming('declined')} disabled={gateBusy} style={{padding:'12px 22px', border:'none', background:'#fee2e2', color:'#b91c1c', borderRadius:24, fontWeight:'700'}}>❌ Decline</button>
          </div>
        </div>
      )}

      {gate === 'declined' && (
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center'}}>
          <div style={{fontSize:48}}>😔</div>
          <h3 style={{margin:'16px 0 6px'}}>{other?.full_name||'They'} declined your request</h3>
          <p style={{color:'#65676b', fontSize:14}}>You no fit chat for now. Try send request again later.</p>
          <button onClick={sendRequest} disabled={gateBusy} style={{marginTop:20, padding:'13px 28px', border:'none', background:'#0084ff', color:'white', borderRadius:24, fontSize:15, fontWeight:'700'}}>{gateBusy ? 'Sending...' : '🔁 Send Request Again'}</button>
        </div>
      )}

      {gate === 'declined_in' && (
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center'}}>
          <div style={{fontSize:48}}>🚫</div>
          <h3 style={{margin:'16px 0 6px'}}>You declined this request</h3>
          <p style={{color:'#65676b', fontSize:14}}>You declined {other?.full_name||'them'}. Dem no fit message you.</p>
        </div>
      )}

      {gate === 'allowed' && (<>
      <div ref={listRef} style={{flex:1, overflowY:'auto', padding:'12px 8px 90px'}}>
        {messages.map(m=>(
          <div key={m.id} style={{display:'flex', justifyContent: m.sender_id===me?.id?'flex-end':'flex-start', margin:'4px 0'}}>
            <div onMouseDown={()=>onPressStart(m)} onMouseUp={onPressEnd} onMouseLeave={onPressEnd} onTouchStart={()=>onPressStart(m)} onTouchEnd={onPressEnd}
              style={{ maxWidth:'76%', padding:'8px 10px', borderRadius: m.sender_id===me?.id ? '18px 18px 0 18px' : '18px 18px 18px 0', background: m.sender_id===me?.id ? '#0084ff' : 'white', color: m.sender_id===me?.id ? 'white' : '#111b21', boxShadow:'0 1px 0.5px rgba(0,0,0,0.13)', opacity: (m as any).isUploading ? 0.7 : 1, userSelect:'none', WebkitUserSelect:'none' as any, touchAction:'manipulation' }}>
              {m.deleted_for_everyone ? (<i style={{fontSize:13, opacity:0.7}}>🚫 This message was deleted</i>) : (
                <>
                  {m.type==='text' && <span style={{fontSize:15, lineHeight:'19px', wordBreak:'break-word'}}>{m.content}</span>}
                  {m.type==='image' && <img src={m.content} style={{width:220, borderRadius:12, display:'block', maxHeight:320, objectFit:'cover'}} loading="lazy"/>}
                  {m.type==='file' && <a href={m.content} target="_blank" rel="noreferrer" style={{color: m.sender_id===me?.id?'white':'#0084ff', fontSize:14, textDecoration:'none'}}>📎 Open File</a>}
                  {m.type==='voice' && <VoiceBubble url={m.content} isMe={m.sender_id===me?.id} />}
                  {m.type==='video' && <ChatVideo src={m.content} />}
                  {(m as any).isUploading && <div style={{fontSize:10, marginTop:4}}>⏳ Uploading...</div>}
                  <div style={{ fontSize: 10, textAlign: 'right', marginTop: 3, opacity: 0.8, display: 'flex', justifyContent: 'flex-end', gap: 4, alignItems: 'center' }}>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.sender_id===me?.id && (
                      m.failed ? <span style={{ color: '#ffcc00' }} onClick={() => { if (m.type==='text') send('text', m.content) }}>⚠️ Tap to retry</span>
                      : m.pending ? <span>🕐</span>
                      : <span>✓✓</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {uploading && (<div style={{textAlign:'center', padding:8, background:'#dbeafe', borderRadius:18, margin:'8px auto', fontSize:12, maxWidth:220, color:'#1e40af'}}>🚀 {progress}% uploading<div style={{height:3, background:'#e2e8f0', borderRadius:2, marginTop:4}}><div style={{width:`${progress}%`, height:3, background:'#1877f2', transition:'width 0.2s'}}/></div></div>)}
      </div>
      {showDeleteMenu && (<><div onClick={()=>setShowDeleteMenu(false)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:90}} /><div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'white', padding:16, borderRadius:'16px 16px 0 0', zIndex:100, boxShadow:'0 -2px 20px rgba(0,0,0,0.2)'}}><div style={{textAlign:'center', fontWeight:'700', marginBottom:12, fontSize:15}}>Delete message?</div><button onClick={deleteForMe} style={{width:'100%', padding:13, marginBottom:8, border:'none', background:'#f0f2f5', borderRadius:10, fontSize:15}}>Delete for Me</button>{selectedMsg?.sender_id === me?.id && (<button onClick={deleteForEveryone} style={{width:'100%', padding:13, marginBottom:8, border:'none', background:'#ffebee', color:'#d32f2f', borderRadius:10, fontWeight:'600', fontSize:15}}>Delete for Everyone</button>)}<button onClick={()=>setShowDeleteMenu(false)} style={{width:'100%', padding:13, border:'none', background:'white', borderRadius:10, fontSize:15}}>Cancel</button></div></>)}
      {pendingUrl && (<WhatsAppEditor imageUrl={pendingUrl} isVideo={pendingType==='video'} onCancel={()=>{setPendingUrl(null); setPendingFile(null)}} onSend={handleUploadEdited} />)}
      {recording && (<div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'#202c33', display:'flex', alignItems:'center', gap:10, padding:'12px 16px', zIndex:50}}><button onClick={cancelVoice} style={{background:'#f15c6d', border:'none', borderRadius:'50%', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center'}}><Trash2 size={20} color="white"/></button><div style={{flex:1, display:'flex', gap:2, alignItems:'center', height:32}}>{levels.map((l,i)=><div key={i} style={{width:3, height:`${l}%`, background:'#00a884', borderRadius:2, minHeight:4}}/>)}</div><span style={{color:'white', fontFamily:'monospace', fontSize:14}}>{Math.floor(recTime/60)}:{String(recTime%60).padStart(2,'0')}</span><button onClick={stopVoice} style={{background:'#0084ff', border:'none', borderRadius:'50%', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center'}}><Send size={18} color="white"/></button></div>)}
      <div style={{position:'fixed', bottom:0, left:0, right:0, maxWidth:480, margin:'0 auto', background:'white', padding:'6px 8px', display:'flex', alignItems:'flex-end', gap:6, borderTop:'1px solid #e4e6eb'}}>
        <div style={{flex:1, background:'#f0f2f5', borderRadius:24, display:'flex', alignItems:'flex-end', padding:'4px 6px', gap:2}}>
          <button style={{padding:8, border:'none', background:'transparent'}}><Smile size={22} color="#65676b"/></button>
          <input value={text} onChange={e=>setText(e.target.value)} placeholder="Aa" style={{flex:1, border:'none', outline:'none', padding:'8px 2px', fontSize:15, background:'transparent'}} onKeyDown={e=>{ if(e.key==='Enter') send() }}/>
          <button onClick={()=>fileRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Paperclip size={20} color="#65676b" style={{transform:'rotate(45deg)'}}/></button>
          <button onClick={()=>camRef.current?.click()} style={{padding:8, border:'none', background:'transparent'}}><Camera size={20} color="#65676b"/></button>
        </div>
        {text.trim() ? (<button onClick={()=>send()} style={{width:48, height:48, borderRadius:'50%', background:'#0084ff', border:'none', display:'flex', alignItems:'center', justifyContent:'center'}}><Send size={20} color="white"/></button>) : (<button onClick={startVoice} style={{width:48, height:48, borderRadius:'50%', background:'#0084ff', border:'none', display:'flex', alignItems:'center', justifyContent:'center'}}><Mic size={22} color="white"/></button>)}
        <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.zip,.mp3" onChange={e=>handleUpload(e,'file')}/>
        <input ref={camRef} type="file" accept="image/*,video/*" hidden onChange={e=>handleUpload(e,'image')}/>
      </div>
      </>)}
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
        const a = new Audio(url); audioRef.current = a
        a.onloadedmetadata = ()=> setDur(a.duration||0)
        a.ontimeupdate = ()=> { if(a.duration) setPct((a.currentTime / a.duration)*100) }
        a.onended = ()=> setPlaying(false); a.onpause = ()=> setPlaying(false)
      }
      if(playing){ audioRef.current?.pause(); setPlaying(false) } else { audioRef.current?.play().catch(()=>{}); setPlaying(true) }
    }catch(e){ console.log(e) }
  }
  useEffect(()=>{ return ()=>{ try{ audioRef.current?.pause() }catch{} } },[])
  return (<div style={{display:'flex', alignItems:'center', gap:10, minWidth:180}}><button onClick={toggle} style={{width:36, height:36, borderRadius:'50%', border:'none', background: isMe ? '#0064d1' : '#0084ff', display:'flex', alignItems:'center', justifyContent:'center'}}>{playing ? <Pause size={16} color="white"/> : <Play size={16} color="white" style={{marginLeft:2}}/>}</button><div style={{flex:1}}><div style={{height:3, background: isMe ? 'rgba(255,255,255,0.4)' : '#e4e6eb', borderRadius:2}}><div style={{width:`${pct}%`, height:3, background: isMe ? 'white' : '#0084ff', borderRadius:2, transition:'width 0.1s'}}/></div><div style={{fontSize:10, marginTop:4, opacity:0.8}}>{dur ? `${Math.floor(dur/60)}:${String(Math.floor(dur%60)).padStart(2,'0')}` : '0:00'} • 🔊</div></div></div>)
}

async function getCroppedImg(imageSrc: string, pixelCrop: any) {
  const image = new Image(); image.crossOrigin = "anonymous"; image.src = imageSrc; await new Promise((res) => (image.onload = res))
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1,pixelCrop.width); canvas.height = Math.max(1,pixelCrop.height)
  const ctx = canvas.getContext("2d")!; ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return canvas.toDataURL("image/jpeg", 0.9)
}

function WhatsAppEditor({ imageUrl, isVideo, onCancel, onSend }: any){
  const canvasRef = useRef<any>(null); const videoRef = useRef<any>(null)
  const [tool, setTool] = useState<'pen'|'eraser'|'crop'|'text'>('pen'); const [color, setColor] = useState('#ffffff'); const [brushSize, setBrushSize] = useState(5)
  const [isDrawing, setIsDrawing] = useState(false); const [caption, setCaption] = useState('')
  const COLORS = ['#ffffff','#ff0000','#ff9500','#ffeb00','#00e676','#00b0ff','#ff4081','#000000','#9c27b0']
  const [texts, setTexts] = useState<any[]>([]); const [emojis, setEmojis] = useState<any[]>([]); const [currentImage, setCurrentImage] = useState(imageUrl)
  const [directText, setDirectText] = useState(''); const [showTextInput, setShowTextInput] = useState(false); const [drawLines, setDrawLines] = useState<any[]>([])
  const [dragItem, setDragItem] = useState<any>(null); const [selectedText, setSelectedText] = useState<number | null>(null); const [editingInline, setEditingInline] = useState<number | null>(null); const [editInlineValue, setEditInlineValue] = useState('')
  const tapStart = useRef<any>(null); const [filter, setFilter] = useState('none')
  const FILTERS = [{n:'Original', v:'none'}, {n:'Pop', v:'contrast(1.2) saturate(1.4)'}, {n:'B&W', v:'grayscale(1)'}, {n:'Cool', v:'hue-rotate(180deg) saturate(1.2)'}, {n:'Warm', v:'sepia(0.4) contrast(1.1)'}, {n:'Vivid', v:'saturate(1.8) contrast(1.15)'}]
  const [cropBox, setCropBox] = useState({ x: 8, y: 8, w: 84, h: 84 }); const [cropHandle, setCropHandle] = useState<string | null>(null); const cropStart = useRef<any>(null); const [cropRotate, setCropRotate] = useState(0); const [isBurning, setIsBurning] = useState(false)
  useEffect(()=>{ if(isVideo && videoRef.current){ if(tool==='pen' || tool==='eraser' || tool==='text' || tool==='crop') videoRef.current.pause(); else videoRef.current.play().catch(()=>{}) } },[tool, isVideo])
  useEffect(()=>{ if(isVideo) return; const img = new Image(); img.crossOrigin = 'anonymous'; img.src = currentImage; img.onload = ()=>{ const canvas = canvasRef.current; if(!canvas) return; canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img, 0, 0) } },[currentImage, isVideo, tool])
  function getPos(e:any){ const el = isVideo ? videoRef.current : canvasRef.current; if(!el) return {x:0,y:0,clientX:0,clientY:0}; const rect = el.getBoundingClientRect(); const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; return {x: cx - rect.left, y: cy - rect.top, clientX: cx, clientY: cy} }
  function startDragItem(e:any, type:string, index:number){ e.stopPropagation(); const p = getPos(e); const item = type==='text' ? texts[index] : emojis[index]; setDragItem({type, index, startX: p.clientX, startY: p.clientY, origX: item.x, origY: item.y}) }
  function moveDragItem(e:any){ if(!dragItem) return; const p = getPos(e); const dx = p.clientX - dragItem.startX; const dy = p.clientY - dragItem.startY; if(dragItem.type==='text') setTexts(prev=>prev.map((t,i)=> i===dragItem.index ? {...t, x: dragItem.origX+dx, y: dragItem.origY+dy} : t)); else setEmojis(prev=>prev.map((t,i)=> i===dragItem.index ? {...t, x: dragItem.origX+dx, y: dragItem.origY+dy} : t)) }
  function endDragItem(){ setDragItem(null) }
  function startDraw(e:any){ if(dragItem) return; if(tool==='pen'){ setIsDrawing(true); const {x,y} = getPos(e); setDrawLines(prev=>[...prev, {color, size: brushSize, points:[{x,y}]}]) } else if(tool==='eraser'){ setIsDrawing(true); eraseAt(e) } }
  function draw(e:any){ if(dragItem){ moveDragItem(e); return } if(!isDrawing) return; if(tool==='eraser'){ eraseAt(e); return } if(tool!=='pen') return; const {x,y} = getPos(e); setDrawLines(prev=>{ const copy=[...prev]; const last=copy[copy.length-1]; if(last) last.points.push({x,y}); return copy }) }
  function endDraw(){ setIsDrawing(false); endDragItem() }
  function eraseAt(e:any){ const {x,y} = getPos(e); setDrawLines(prev=>prev.filter((line:any)=> !line.points.some((p:any)=> Math.sqrt((p.x-x)*(p.x-x)+(p.y-y)*(p.y-y)) < 28 ))) }
  function undo(){ if(drawLines.length>0) setDrawLines(prev=>prev.slice(0,-1)); else if(texts.length>0) setTexts(prev=>prev.slice(0,-1)); else if(emojis.length>0) setEmojis(prev=>prev.slice(0,-1)) }
  function confirmDirectText(){ if(!directText.trim()){ setShowTextInput(false); return } setTexts(prev=>[...prev, {text: directText.trim(), x: 80, y: 150, color}]); setDirectText(''); setShowTextInput(false); setTool('pen') }
  function onTextTouchStart(e:any, i:number){ const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; tapStart.current = { x: cx, y: cy, time: Date.now(), index: i } }
  function onTextTouchEnd(e:any, i:number){ if(!tapStart.current) return; const cx = e.clientX ?? e.touches?.[0]?.clientX ?? tapStart.current.x; const cy = e.clientY ?? e.touches?.[0]?.clientY ?? tapStart.current.y; const dx = Math.abs(cx - tapStart.current.x); const dy = Math.abs(cy - tapStart.current.y); const dt = Date.now() - tapStart.current.time; if(dx < 6 && dy < 6 && dt < 400){ e.stopPropagation(); setEditingInline(i); setEditInlineValue(texts[i].text); setSelectedText(i) } tapStart.current = null }
  function saveInlineEdit(){ if(editingInline===null) return; if(editInlineValue.trim()==='') setTexts(prev=>prev.filter((_,idx)=>idx!==editingInline)); else setTexts(prev=>prev.map((t,idx)=> idx===editingInline ? {...t, text: editInlineValue} : t)); setEditingInline(null); setSelectedText(null) }
  function deleteInlineText(){ if(editingInline===null) return; setTexts(prev=>prev.filter((_,idx)=>idx!==editingInline)); setEditingInline(null); setSelectedText(null) }
  function startCropHandle(e:any, handle:string){ e.stopPropagation(); const container = document.getElementById('crop-container-chat'); if(!container) return; const rect = container.getBoundingClientRect(); const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; cropStart.current = { handle, startX: cx, startY: cy, box: {...cropBox}, rect }; setCropHandle(handle) }
  function startCropMove(e:any){ const container = document.getElementById('crop-container-chat'); if(!container) return; const rect = container.getBoundingClientRect(); const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; cropStart.current = { handle:'move', startX: cx, startY: cy, box: {...cropBox}, rect }; setCropHandle('move') }
  function moveCropHandle(e:any){ if(!cropHandle || !cropStart.current) return; const { rect, box, startX, startY, handle } = cropStart.current; const cx = e.clientX ?? e.touches?.[0]?.clientX; const cy = e.clientY ?? e.touches?.[0]?.clientY; const dxPct = ((cx - startX) / rect.width) * 100; const dyPct = ((cy - startY) / rect.height) * 100; let next = {...box}; if(handle==='move'){ next.x = box.x + dxPct; next.y = box.y + dyPct; if(next.x < 0) next.x = 0; if(next.y < 0) next.y = 0; if(next.x + next.w > 100) next.x = 100 - next.w; if(next.y + next.h > 100) next.y = 100 - next.h } else { if(handle.includes('l')){ next.x = box.x + dxPct; next.w = box.w - dxPct } if(handle.includes('r')){ next.w = box.w + dxPct } if(handle.includes('t')){ next.y = box.y + dyPct; next.h = box.h - dyPct } if(handle.includes('b')){ next.h = box.h + dyPct } if(next.w < 20){ if(handle.includes('l')) next.x = box.x + box.w - 20; next.w = 20 } if(next.h < 20){ if(handle.includes('t')) next.y = box.y + box.h - 20; next.h = 20 } if(next.x < 0){ next.w += next.x; next.x = 0 } if(next.y < 0){ next.h += next.y; next.y = 0 } if(next.x + next.w > 100) next.w = 100 - next.x; if(next.y + next.h > 100) next.h = 100 - next.y } setCropBox(next) }
  function endCropHandle(){ setCropHandle(null); cropStart.current = null }
  async function applyCrop(){ if(!isVideo){ const img = new Image(); img.crossOrigin='anonymous'; img.src = currentImage; await new Promise((res)=>(img.onload=res)); const pixelCrop = { x: (cropBox.x/100)*img.width, y: (cropBox.y/100)*img.height, width: (cropBox.w/100)*img.width, height: (cropBox.h/100)*img.height }; const cropped = await getCroppedImg(currentImage, pixelCrop); setCurrentImage(cropped) } setCropBox({x:8,y:8,w:84,h:84}); setCropRotate(0); setTool('pen') }
  function rotateCrop(){ setCropRotate(prev => (prev + 90) % 360); setCropBox(prev => ({ x: prev.x, y: prev.y, w: prev.h, h: prev.w })) }
  async function burnVideoWithOverlays(): Promise<File | null> { return new Promise((resolve) => { const video = document.createElement('video'); video.src = currentImage; video.muted = true; video.playsInline = true; video.onloadedmetadata = async () => { const canvas = document.createElement('canvas'); canvas.width = video.videoWidth || 720; canvas.height = video.videoHeight || 1280; const ctx = canvas.getContext('2d')!; const dispVideo = videoRef.current; const rect = dispVideo ? dispVideo.getBoundingClientRect() : { width: canvas.width, height: canvas.height }; const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height; const stream = canvas.captureStream(30); let rec: any = null; try { rec = new MediaRecorder(stream, { mimeType: 'video/webm' }) } catch { rec = new MediaRecorder(stream) } const chunks: any[] = []; rec.ondataavailable = (e:any) => { if (e.data.size > 0) chunks.push(e.data) }; rec.onstop = () => { const blob = new Blob(chunks, { type: 'video/webm' }); const file = new File([blob], `edited-video-${Date.now()}.webm`, { type: 'video/webm' }); resolve(file) }; const drawFrame = () => { if (video.paused || video.ended) return; ctx.drawImage(video, 0, 0, canvas.width, canvas.height); drawLines.forEach((line: any) => { ctx.strokeStyle = line.color; ctx.lineWidth = line.size * 2 * scaleX; ctx.lineCap = 'round'; ctx.beginPath(); line.points.forEach((p: any, i: number) => { const X = p.x * scaleX, Y = p.y * scaleY; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y) }); ctx.stroke() }); texts.forEach((t: any) => { ctx.font = `bold ${42 * scaleX}px Arial`; ctx.fillStyle = t.color; ctx.strokeStyle = 'black'; ctx.lineWidth = 3; ctx.strokeText(t.text, t.x * scaleX, t.y * scaleY); ctx.fillText(t.text, t.x * scaleX, t.y * scaleY) }); emojis.forEach((e: any) => { ctx.font = `${80 * scaleX}px Arial`; ctx.fillText(e.emoji, e.x * scaleX, e.y * scaleY) }); requestAnimationFrame(drawFrame) }; video.onplay = () => { rec.start(); drawFrame() }; video.onended = () => { setTimeout(() => { try { rec.stop() } catch {} }, 200) }; video.currentTime = 0; video.play().catch(() => resolve(null)); setTimeout(() => { if (rec.state !== 'inactive') { try { rec.stop() } catch {} } }, ((video.duration || 5) * 1000) + 800) }; video.onerror = () => resolve(null) }) }
  async function handleSend(){ if(isVideo){ if(texts.length===0 && emojis.length===0 && drawLines.length===0){ onSend(imageUrl, caption); return } setIsBurning(true); const burnedFile = await burnVideoWithOverlays(); setIsBurning(false); if(burnedFile){ onSend(URL.createObjectURL(burnedFile), caption, burnedFile) } else { onSend(imageUrl, caption) } return } const canvas = canvasRef.current; if(!canvas){ onSend(currentImage, caption); return } const ctx = canvas.getContext('2d'); const img = new Image(); img.crossOrigin='anonymous'; img.src=currentImage; await new Promise((res)=>{ img.onload=res; img.onerror=res }); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.filter = filter; ctx.drawImage(img,0,0); ctx.filter = 'none'; const rect = canvas.getBoundingClientRect(); const scaleX = canvas.width / (rect.width || canvas.width); const scaleY = canvas.height / (rect.height || canvas.height); drawLines.forEach((line:any)=>{ ctx.strokeStyle=line.color; ctx.lineWidth=line.size*2*scaleX; ctx.lineCap='round'; ctx.beginPath(); line.points.forEach((p:any,i:number)=>{ const X=p.x*scaleX, Y=p.y*scaleY; if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y) }); ctx.stroke() }); texts.forEach((t:any)=>{ ctx.font=`bold ${42*scaleX}px Arial`; ctx.fillStyle=t.color; ctx.strokeStyle='black'; ctx.lineWidth=3; ctx.strokeText(t.text, t.x*scaleX, t.y*scaleY); ctx.fillText(t.text, t.x*scaleX, t.y*scaleY) }); emojis.forEach((e:any)=>{ ctx.font=`${80*scaleX}px Arial`; ctx.fillText(e.emoji, e.x*scaleX, e.y*scaleY) }); onSend(canvas.toDataURL('image/jpeg',0.92), caption) }
  return (
    <div style={{position:'fixed', inset:0, background:'black', zIndex:1000, display:'flex', flexDirection:'column'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px'}}><button onClick={onCancel} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:22, width:36, height:36, borderRadius:'50%'}}>✕</button><div style={{display:'flex', gap:10, alignItems:'center'}}><button onClick={()=>setTool('crop')} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:20, width:38, height:38, borderRadius:'50%'}}>⤢</button><button onClick={()=>{ setShowTextInput(true); setTool('text') }} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:17, fontWeight:'bold', width:38, height:38, borderRadius:'50%'}}>Aa</button><button onClick={()=>setTool('pen')} style={{color: tool==='pen'?'#00e676':'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:20, width:38, height:38, borderRadius:'50%'}}>✎</button><button onClick={()=>setTool('eraser')} style={{color: tool==='eraser'?'#ff5252':'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:16, width:38, height:38, borderRadius:'50%'}}>🧽</button><button onClick={undo} style={{color:'white', background:'rgba(0,0,0,0.4)', border:'none', fontSize:20, width:38, height:38, borderRadius:'50%'}}>↩</button></div></div>
      {tool==='crop' ? (<div id="crop-container-chat" onMouseMove={moveCropHandle} onTouchMove={moveCropHandle} onMouseUp={endCropHandle} onTouchEnd={endCropHandle} style={{flex:1, position:'relative', background:'black', display:'flex', flexDirection:'column', overflow:'hidden'}}><div style={{flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>{isVideo ? (<video ref={videoRef} src={currentImage} playsInline muted loop style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', pointerEvents:'none', transform:`rotate(${cropRotate}deg)`, filter}} />) : (<img src={currentImage} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', pointerEvents:'none', transform:`rotate(${cropRotate}deg)`, filter}} />)}<div onMouseDown={startCropMove} onTouchStart={startCropMove} style={{position:'absolute', left:`${cropBox.x}%`, top:`${cropBox.y}%`, width:`${cropBox.w}%`, height:`${cropBox.h}%`, boxShadow:'0 0 0 9999px rgba(0,0,0,0.72)', boxSizing:'border-box', touchAction:'none', cursor:'move'}}><div style={{position:'absolute', inset:0, border:'1px solid rgba(255,255,255,0.7)'}}><div style={{position:'absolute', left:'33.3%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.6)'}} /><div style={{position:'absolute', left:'66.6%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.6)'}} /><div style={{position:'absolute', top:'33.3%', left:0, right:0, height:1, background:'rgba(255,255,255,0.6)'}} /><div style={{position:'absolute', top:'66.6%', left:0, right:0, height:1, background:'rgba(255,255,255,0.6)'}} /></div><div onMouseDown={(e)=>startCropHandle(e,'tl')} onTouchStart={(e)=>startCropHandle(e,'tl')} style={{position:'absolute', left:-2, top:-2, width:28, height:28, borderLeft:'4px solid white', borderTop:'4px solid white', touchAction:'none', zIndex:10}} /><div onMouseDown={(e)=>startCropHandle(e,'tr')} onTouchStart={(e)=>startCropHandle(e,'tr')} style={{position:'absolute', right:-2, top:-2, width:28, height:28, borderRight:'4px solid white', borderTop:'4px solid white', touchAction:'none', zIndex:10}} /><div onMouseDown={(e)=>startCropHandle(e,'bl')} onTouchStart={(e)=>startCropHandle(e,'bl')} style={{position:'absolute', left:-2, bottom:-2, width:28, height:28, borderLeft:'4px solid white', borderBottom:'4px solid white', touchAction:'none', zIndex:10}} /><div onMouseDown={(e)=>startCropHandle(e,'br')} onTouchStart={(e)=>startCropHandle(e,'br')} style={{position:'absolute', right:-2, bottom:-2, width:28, height:28, borderRight:'4px solid white', borderBottom:'4px solid white', touchAction:'none', zIndex:10}} /></div></div><div style={{background:'#000', padding:'14px 24px 18px', display:'flex', justifyContent:'space-between', alignItems:'center'}}><button onClick={()=>{ setCropBox({x:8,y:8,w:84,h:84}); setCropRotate(0); setTool('pen') }} style={{background:'none', border:'none', color:'#00e676', fontSize:16, fontWeight:'600'}}>Cancel</button><button onClick={rotateCrop} style={{background:'none', border:'none', color:'white', fontSize:24}}>⟳</button><button onClick={applyCrop} style={{background:'none', border:'none', color:'#00e676', fontSize:16, fontWeight:'600'}}>Done</button></div></div>) : (<div style={{flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#000'}} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}>{isVideo ? (<video ref={videoRef} src={currentImage} controls playsInline autoPlay loop muted style={{maxWidth:'100%', maxHeight:'100%', filter}} />) : (<canvas ref={canvasRef} style={{maxWidth:'100%', maxHeight:'100%', touchAction:'none', filter}} />)}<svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none'}}>{drawLines.map((line:any, li:number)=>(<polyline key={li} points={line.points.map((p:any)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={line.color} strokeWidth={line.size} strokeLinecap="round" strokeLinejoin="round" />))}</svg>{texts.map((t:any,i:number)=>{ if(editingInline===i){ return (<div key={i} style={{position:'absolute', left:t.x, top:t.y, zIndex:50, display:'flex', flexDirection:'column', gap:6}} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}><input autoFocus value={editInlineValue} onChange={e=>setEditInlineValue(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') saveInlineEdit(); if(e.key==='Escape'){ setEditingInline(null); setSelectedText(null) } }} style={{fontSize:28, fontWeight:'bold', color:t.color, background:'rgba(0,0,0,0.85)', border:'2px solid #00e676', borderRadius:8, padding:'6px 10px', width:'220px', outline:'none'}} /><div style={{display:'flex', gap:6}}><button onClick={deleteInlineText} style={{flex:1, background:'#ff5252', color:'white', border:'none', padding:'8px', borderRadius:20, fontWeight:'bold', fontSize:12}}>🗑 Delete</button><button onClick={saveInlineEdit} style={{flex:1, background:'#00a884', color:'white', border:'none', padding:'8px', borderRadius:20, fontWeight:'bold', fontSize:12}}>Done ✓</button></div></div>) } return (<div key={i} onMouseDown={(e)=>{ onTextTouchStart(e,i); startDragItem(e,'text',i) }} onTouchStart={(e)=>{ onTextTouchStart(e,i); startDragItem(e,'text',i) }} onMouseUp={(e)=>onTextTouchEnd(e,i)} onTouchEnd={(e)=>onTextTouchEnd(e,i)} style={{position:'absolute', left:t.x, top:t.y, color:t.color, fontSize:28, fontWeight:'bold', textShadow:'0 2px 4px black', cursor:'move', touchAction:'none', padding:'6px 10px', border: selectedText===i ? '2px solid #00e676' : '1px dashed rgba(255,255,255,0.4)', borderRadius:8}}>{t.text}</div>) })} {emojis.map((e:any,i:number)=>(<div key={i} onMouseDown={(ev)=>startDragItem(ev,'emoji',i)} onTouchStart={(ev)=>startDragItem(ev,'emoji',i)} style={{position:'absolute', left:e.x, top:e.y, fontSize:40, cursor:'move', touchAction:'none'}}>{e.emoji}</div>))} {showTextInput && (<div style={{position:'absolute', top:'35%', left:16, right:16, background:'rgba(0,0,0,0.9)', borderRadius:16, padding:14, zIndex:30}}><input autoFocus value={directText} onChange={e=>setDirectText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') confirmDirectText() }} placeholder="Type here..." style={{width:'100%', padding:'14px', borderRadius:10, border:'none', fontSize:18, background:'#222', color:'white', outline:'none', boxSizing:'border-box'}} /><div style={{display:'flex', gap:8, marginTop:10}}>{COLORS.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:'50%',background:c,border:color===c?'3px solid white':'1px solid #555'}} />))}</div><div style={{display:'flex', gap:8, marginTop:10}}><button onClick={()=>setShowTextInput(false)} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#333',color:'white'}}>Cancel</button><button onClick={confirmDirectText} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#00a884',color:'white',fontWeight:'bold'}}>Add + Drag</button></div></div>)} </div>)}
      {tool!=='crop' && (<div style={{background:'#000', padding:'6px 12px', display:'flex', gap:8, overflowX:'auto'}}><span style={{color:'#aaa', fontSize:11, whiteSpace:'nowrap', alignSelf:'center'}}>↑ Swipe up for filters</span>{FILTERS.map(f=>(<button key={f.n} onClick={()=>setFilter(f.v)} style={{background: filter===f.v ? '#00a884' : '#222', color:'white', border:'none', padding:'6px 12px', borderRadius:20, fontSize:12, whiteSpace:'nowrap'}}>{f.n}</button>))}</div>)}
      {tool==='pen' && (<div style={{background:'#111', padding:'10px 12px'}}><div style={{display:'flex', gap:8, overflowX:'auto', marginBottom:8}}>{COLORS.map(c=>(<div key={c} onClick={()=>setColor(c)} style={{width:26, height:26, borderRadius:'50%', background:c, border: color===c ? '3px solid white' : '2px solid #555', cursor:'pointer', flexShrink:0}} />))}</div><div style={{display:'flex', alignItems:'center', gap:10, color:'white'}}><span style={{fontSize:11}}>Thin</span><input type="range" min={1} max={20} value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} style={{flex:1}} /><span style={{fontSize:11}}>Thick</span></div></div>)}
      {tool==='eraser' && (<div style={{background:'#3a0a0a', padding:10, display:'flex', gap:8, alignItems:'center'}}><p style={{color:'white', fontSize:12, margin:0, flex:1}}>🧽 Rub pen line to erase am</p><button onClick={()=>setDrawLines([])} style={{background:'#ff5252', color:'white', border:'none', padding:'8px 12px', borderRadius:20, fontWeight:'bold', fontSize:12}}>Erase All</button></div>)}
      <div style={{background:'#000', padding:'10px 12px 14px', display:'flex', gap:8, alignItems:'center'}}><div style={{flex:1, background:'#222', borderRadius:24, padding:'8px 12px', display:'flex', alignItems:'center', gap:8}}><span style={{fontSize:18}}>🖼️</span><input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Add a caption..." style={{flex:1, background:'transparent', border:'none', color:'white', outline:'none', fontSize:15}} /><span style={{fontSize:16, color:'#aaa'}}>@</span></div><button onClick={handleSend} disabled={isBurning} style={{width:52, height:52, borderRadius:'50%', background:'#00a884', color:'white', border:'none', fontSize:22, flexShrink:0, opacity: isBurning ? 0.6 : 1}}>{isBurning ? '⏳' : '➤'}</button></div>
      {isBurning && <p style={{textAlign:'center', color:'#00e676', fontSize:12, background:'#000', padding:'6px'}}>Burning text inside video... wait small ⏳</p>}
    </div>
  )
              }

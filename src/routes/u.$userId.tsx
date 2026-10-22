import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToBunny } from '../lib/bunny'

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
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [voiceTime, setVoiceTime] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const streamRef = useRef<MediaStream|null>(null)

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>setMe(data.user))
    supabase.from('profiles').select('*').eq('id', otherUserId).single().then(({data})=>setOther(data))
    initChat()
  },[])

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:'smooth'})
  },[messages, uploading])

  useEffect(()=>{
    if(!convId) return
    const channel = supabase.channel(`chat-${convId}`)
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'messages', filter:`conversation_id=eq.${convId}`}, 
      (payload)=> {
        setMessages(prev=>{
          // no duplicate like WhatsApp
          if(prev.some(m=>m.id===payload.new.id)) return prev
          // remove temp
          const filtered = prev.filter(m=> !String(m.id).startsWith('temp-'))
          return [...filtered, payload.new]
        })
      }
      ).subscribe()
    return ()=>{ supabase.removeChannel(channel) }
  },[convId])

  async function initChat(){
    const { data: {user} } = await supabase.auth.getUser()
    if(!user) return
    setMe(user)
    // FIXED: use maybeSingle pattern to avoid array bug
    let { data: convs } = await supabase.from('conversations').select('*')
      .or(`and(participant1.eq.${user.id},participant2.eq.${otherUserId}),and(participant1.eq.${otherUserId},participant2.eq.${user.id})`)
    
    let conv = convs?.[0]
    if(!conv){
      const { data: newC, error } = await supabase.from('conversations').insert({participant1:user.id, participant2:otherUserId}).select().single()
      if(error){ alert("Conv error: "+error.message); return }
      conv = newC
    }
    if(conv){ setConvId(conv.id); loadMsgs(conv.id) }
  }

  async function loadMsgs(cId:string){
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', cId).order('created_at', {ascending:true})
    setMessages(data||[])
  }

  async function send(type='text', content=''){
    const msg = content || text
    if(!msg || !convId) return
    const trimmed = msg.trim()
    if(!trimmed && type==='text') return
    const tempId = `temp-${Date.now()}`
    const newMsg = {id: tempId, conversation_id: convId, sender_id: me?.id, type, content: trimmed || content, created_at: new Date().toISOString()}
    setMessages(prev=>[...prev, newMsg])
    setText('')

    const { data, error } = await supabase.from('messages').insert({conversation_id: convId, sender_id: me?.id, type, content: trimmed || content}).select().single()
    if(error){
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
      alert("Failed to send: "+error.message)
    }else{
      setMessages(prev=>prev.map(m=>m.id===tempId ? data : m))
    }
  }

  async function handleUpload(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
    try{
      setUploading(true); setProgress(0)
      const isVideo = file.type.startsWith('video/') || type==='video'
      // FIX: use correct folder names
      const folder = isVideo ? 'videos' : type==='voice' ? 'voices' : type==='image' ? 'chat_images' : 'files'
      const url = await uploadToBunny(file, folder, (p)=> setProgress(p))
      await send(isVideo ? 'video' : type, url)
    }catch(err:any){ alert(err.message) }
    finally{ setUploading(false); setProgress(0); e.target.value='' }
  }

  // FIXED VOICE: Tap to START, Tap to SEND - no more cut
  async function startVoice(e:any){
    e.preventDefault()
    if(recording) return
    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true})
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      const chunks:any[]=[]
      rec.ondataavailable = ev=>{ if(ev.data.size>0) chunks.push(ev.data) }
      rec.onstop = async()=>{
        stream.getTracks().forEach(t=>t.stop())
        clearInterval(timerRef.current)
        if(chunks.length===0) { setRecording(false); return }
        const blob = new Blob(chunks,{type:'audio/webm'})
        const file = new File([blob], `voice-${Date.now()}.webm`, {type:'audio/webm'})
        try{
          setUploading(true); setProgress(0)
          const url = await uploadToBunny(file, 'voices', (p)=> setProgress(p))
          await send('voice', url)
        }catch(err:any){ alert(err.message) }
        finally{ setUploading(false); setVoiceTime(0); setRecording(false) }
      }
      mediaRef.current = rec
      rec.start(); setRecording(true); setVoiceTime(0)
      timerRef.current = setInterval(()=> setVoiceTime(t=>t+1), 1000)
    }catch{ alert("Allow microphone") }
  }

  function stopVoice(e:any){ 
    e?.preventDefault()
    if(mediaRef.current?.state==='recording'){ 
      mediaRef.current.stop()
    }
  }
  function cancelVoice(){
    if(mediaRef.current?.state==='recording') mediaRef.current.stop()
    streamRef.current?.getTracks().forEach(t=>t.stop())
    clearInterval(timerRef.current)
    setRecording(false); setVoiceTime(0)
    // remove last temp voice if any
    setMessages(prev=>prev.filter(m=> !String(m.id).startsWith('temp-')))
  }

  return (
    <div style={{maxWidth:480, margin:'0 auto', height:'100vh', display:'flex', flexDirection:'column', background:'#e5ddd5'}}>
      {/* FIXED HEADER - tap go profile /u/ */}
      <div style={{padding:'10px 12px', background:'#075e54', color:'white', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10}}>
        <Link to="/chat" style={{color:'white', textDecoration:'none', fontSize:20, padding:4}}>←</Link>
        <Link to={`/u/${otherUserId}`} style={{display:'flex', alignItems:'center', gap:10, flex:1, textDecoration:'none', color:'white'}}>
          <img src={other?.avatar_url||'https://via.placeholder.com/40'} style={{width:36,height:36,borderRadius:18, objectFit:'cover'}}/>
          <div style={{flex:1}}>
            <b style={{display:'block', fontSize:15}}>{other?.full_name||'Loading...'}</b>
            <small style={{fontSize:11, opacity:0.8}}>tap to view profile</small>
          </div>
        </Link>
      </div>

      <div style={{flex:1, overflowY:'auto', padding:'12px 8px', backgroundImage:'url(https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png)', backgroundRepeat:'repeat'}}>
        {messages.length===0 && <div style={{textAlign:'center', marginTop:100, background:'#fff8c4', padding:8, borderRadius:8, fontSize:12, color:'#54656f'}}>🔒 Messages are secure. Say hi to {other?.full_name||'user'}!</div>}
        
        {messages.map(m=>{
          const isMe = m.sender_id===me?.id
          const time = new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
          return (
            <div key={m.id} style={{display:'flex', justifyContent: isMe?'flex-end':'flex-start', margin:'4px 0'}}>
              <div style={{
                maxWidth:'78%', 
                padding:'6px 8px 4px 8px', 
                borderRadius: isMe ? '8px 0 8px 8px' : '0 8px 8px 8px', 
                background: isMe ? '#dcf8c6' : 'white', 
                boxShadow:'0 1px 0.5px rgba(0,0,0,0.13)',
              }}>
                {m.type==='text' && <span style={{fontSize:14.5, color:'#303030', whiteSpace:'pre-wrap'}}>{m.content}</span>}
                {m.type==='image' && <img src={m.content} style={{width:220, borderRadius:6, display:'block'}} loading="lazy"/>}
                {m.type==='file' && <a href={m.content} target="_blank" style={{color:'#075e54', fontSize:13}}>📎 Open File</a>}
                {m.type==='voice' && <audio src={m.content} controls style={{width:200, height:32}}/>}
                {m.type==='video' && <video src={m.content} controls style={{width:220, borderRadius:6, display:'block'}} />}
                <div style={{display:'flex', justifyContent:'flex-end', alignItems:'center', gap:3, marginTop:4}}>
                  <span style={{fontSize:10, color:'#667781'}}>{time}</span>
                  {isMe && <span style={{fontSize:11, color:'#53bdeb'}}>✓✓</span>}
                </div>
              </div>
            </div>
          )
        })}
        {uploading && (
          <div style={{display:'flex', justifyContent:'flex-end'}}>
            <div style={{background:'#dcf8c6', padding:'8px 12px', borderRadius:'8px 0 8px 8px', fontSize:12}}>
              ⏳ Uploading {progress}% 
              <div style={{height:3, background:'#fff', marginTop:4, borderRadius:2, width:120}}>
                <div style={{width:`${progress}%`, height:3, background:'#075e54', borderRadius:2}} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{padding:'6px 6px', background:'#f0f2f5', display:'flex', gap:6, alignItems:'flex-end'}}>
        {!recording ? (
          <>
            <div style={{flex:1, background:'white', borderRadius:24, display:'flex', alignItems:'center', padding:'2px 12px', minHeight:44, boxShadow:'0 1px 1px rgba(0,0,0,0.08)'}}>
              <input 
                value={text} 
                onChange={e=>setText(e.target.value)} 
                onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); send() } }}
                placeholder="Type a message" 
                style={{flex:1, border:'none', outline:'none', fontSize:15, padding:'8px 0', background:'transparent'}}/>
              <label style={{cursor:'pointer', fontSize:18, margin:'0 6px'}}>📎<input type="file" hidden accept=".pdf,.doc,.docx,.zip" onChange={e=>handleUpload(e,'file')}/></label>
              <label style={{cursor:'pointer', fontSize:18}}>📷<input type="file" accept="image/*,video/*" hidden onChange={e=>handleUpload(e,'image')}/></label>
            </div>
            {text.trim() ? (
              <button onClick={()=>send()} style={{background:'#075e54', color:'white', border:'none', width:44, height:44, borderRadius:22, fontSize:18}}>➤</button>
            ) : (
              // FIXED: One tap to start recording
              <button onClick={startVoice} style={{background:'#075e54', color:'white', border:'none', width:44, height:44, borderRadius:22, fontSize:20}}>🎤</button>
            )}
          </>
        ) : (
          <div style={{flex:1, background:'white', borderRadius:24, display:'flex', alignItems:'center', padding:'6px 12px', gap:10}}>
            <div style={{width:8, height:8, background:'red', borderRadius:8}} />
            <span style={{fontSize:14, color:'#f00'}}>{Math.floor(voiceTime/60)}:{(voiceTime%60).toString().padStart(2,'0')}</span>
            <span style={{flex:1, fontSize:12, color:'#667781'}}>Recording... tap send</span>
            <button onClick={cancelVoice} style={{background:'#f15c6d', color:'white', border:'none', padding:'8px 12px', borderRadius:16}}>✕</button>
            <button onClick={stopVoice} style={{background:'#075e54', color:'white', border:'none', width:44, height:44, borderRadius:22}}>➤</button>
          </div>
        )}
      </div>
    </div>
  )
                  }

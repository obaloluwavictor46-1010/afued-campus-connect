import { createFileRoute } from '@tanstack/react-router'
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

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>setMe(data.user))
    supabase.from('profiles').select('*').eq('id', otherUserId).single().then(({data})=>setOther(data))
    initChat()
  },[])

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:'smooth'})
  },[messages, uploading])

  // REALTIME - Make message appear instantly like WhatsApp
  useEffect(()=>{
    if(!convId) return
    const channel = supabase.channel(`chat-${convId}`)
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'messages', filter:`conversation_id=eq.${convId}`}, 
      (payload)=> setMessages(m=>[...m, payload.new])
      ).subscribe()
    return ()=>{ supabase.removeChannel(channel) }
  },[convId])

  async function initChat(){
    const { data: {user} } = await supabase.auth.getUser()
    if(!user) return
    setMe(user)
    // FIXED QUERY - old one no dey work
    let { data: convs } = await supabase.from('conversations').select('*')
      .or(`and(participant1.eq.${user.id},participant2.eq.${otherUserId}),and(participant1.eq.${otherUserId},participant2.eq.${user.id})`)
    
    let conv = convs?.[0]
    if(!conv){
      const { data: newC, error } = await supabase.from('conversations').insert({participant1:user.id, participant2:otherUserId}).select().single()
      if(error){ console.log(error); return }
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
    setText('')
    // Optimistic UI - show immediately like WhatsApp
    const tempId = Date.now().toString()
    const newMsg = {id: tempId, conversation_id: convId, sender_id: me?.id, type, content: trimmed || msg, created_at: new Date().toISOString()}
    setMessages(prev=>[...prev, newMsg])

    const { data, error } = await supabase.from('messages').insert({conversation_id: convId, sender_id: me?.id, type, content: trimmed || content, file_name: type!=='text'? 'file': null}).select().single()
    if(error){
      // remove temp if failed
      setMessages(prev=>prev.filter(m=>m.id!==tempId))
      alert("Failed to send: "+error.message)
    }else{
      // replace temp with real
      setMessages(prev=>prev.map(m=>m.id===tempId ? data : m))
    }
  }

  async function handleUpload(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
    try{
      setUploading(true); setProgress(0)
      const isVideo = file.type.startsWith('video/') || type==='video'
      const url = await uploadToBunny(file, isVideo ? 'videos' : type, (p)=> setProgress(p))
      send(isVideo ? 'video' : type, url)
    }catch(err:any){ alert(err.message) }
    finally{ setUploading(false); setProgress(0); e.target.value='' }
  }

  async function startVoice(e:any){
    e.preventDefault()
    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true})
      const rec = new MediaRecorder(stream)
      const chunks:any[]=[]
      rec.ondataavailable = ev=>chunks.push(ev.data)
      rec.onstop = async()=>{
        stream.getTracks().forEach(t=>t.stop())
        clearInterval(timerRef.current)
        if(chunks.length===0) return
        const blob = new Blob(chunks,{type:'audio/webm'})
        const file = new File([blob], `voice-${Date.now()}.webm`, {type:'audio/webm'})
        try{
          setUploading(true); setProgress(0)
          const url = await uploadToBunny(file, 'voice', (p)=> setProgress(p))
          send('voice', url)
        }finally{ setUploading(false); setVoiceTime(0) }
      }
      mediaRef.current = rec
      rec.start(); setRecording(true); setVoiceTime(0)
      timerRef.current = setInterval(()=> setVoiceTime(t=>t+1), 1000)
      setTimeout(()=>{ if(rec.state==='recording'){rec.stop(); setRecording(false)} }, 60000)
    }catch{ alert("Allow microphone") }
  }
  function stopVoice(e:any){ e.preventDefault(); if(mediaRef.current?.state==='recording'){ mediaRef.current.stop(); setRecording(false); clearInterval(timerRef.current)} }

  return (
    <div style={{maxWidth:480, margin:'0 auto', height:'100vh', display:'flex', flexDirection:'column', background:'#e5ddd5'}}>
      {/* WhatsApp Header */}
      <div style={{padding:'10px 12px', background:'#075e54', color:'white', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10}}>
        <button onClick={()=>history.back()} style={{background:'none', border:'none', color:'white', fontSize:20}}>←</button>
        <img src={other?.avatar_url||'https://via.placeholder.com/40'} style={{width:36,height:36,borderRadius:18}}/>
        <div style={{flex:1}}>
          <b style={{display:'block', fontSize:15}}>{other?.full_name||'Loading...'}</b>
          <small style={{fontSize:11, opacity:0.8}}>{other ? 'tap here for contact info' : 'connecting...'}</small>
        </div>
        <span style={{fontSize:18}}>📞</span>
        <span style={{fontSize:18, marginLeft:8}}>⋮</span>
      </div>

      {/* Chat Background like WhatsApp */}
      <div style={{flex:1, overflowY:'auto', padding:'12px 8px', backgroundImage:'url(https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png)', backgroundRepeat:'repeat'}}>
        {messages.length===0 && <div style={{textAlign:'center', marginTop:100, background:'#fff8c4', padding:8, borderRadius:8, fontSize:12, color:'#54656f'}}>🔒 Messages are end-to-end encrypted. Tap to send first message to {other?.full_name||'James'}.</div>}
        
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
                position:'relative'
              }}>
                {m.type==='text' && <span style={{fontSize:14.5, color:'#303030', whiteSpace:'pre-wrap'}}>{m.content}</span>}
                {m.type==='image' && <img src={m.content} style={{width:220, borderRadius:6, display:'block'}}/>}
                {m.type==='file' && <a href={m.content} target="_blank" style={{color:'#075e54', fontSize:13}}>📎 {m.file_name||'Document'}</a>}
                {m.type==='voice' && <audio src={m.content} controls style={{width:200, height:32}}/>}
                {m.type==='video' && (
                  m.content?.includes('iframe.mediadelivery.net') ? (
                    <iframe src={m.content} style={{width:220, height:140, border:0, borderRadius:6, display:'block'}} allow="autoplay; fullscreen" allowFullScreen />
                  ) : (
                    <video src={m.content} controls style={{width:220, borderRadius:6, display:'block'}} />
                  )
                )}
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

      {/* WhatsApp Input Bar */}
      <div style={{padding:'6px 6px', background:'#f0f2f5', display:'flex', gap:6, alignItems:'flex-end'}}>
        {!recording ? (
          <>
            <div style={{flex:1, background:'white', borderRadius:24, display:'flex', alignItems:'center', padding:'2px 12px', minHeight:44, boxShadow:'0 1px 1px rgba(0,0,0,0.08)'}}>
              <label style={{cursor:'pointer', fontSize:22, marginRight:6}}>😊</label>
              <input 
                value={text} 
                onChange={e=>setText(e.target.value)} 
                onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); send() } }}
                placeholder="Type a message" 
                style={{flex:1, border:'none', outline:'none', fontSize:15, padding:'8px 0', background:'transparent'}}/>
              <label style={{cursor:'pointer', fontSize:18, margin:'0 6px'}}>📎<input type="file" hidden onChange={e=>handleUpload(e,'file')}/></label>
              <label style={{cursor:'pointer', fontSize:18}}>📷<input type="file" accept="image/*,video/*" hidden onChange={e=>handleUpload(e,'image')}/></label>
            </div>
            {text.trim() ? (
              <button onClick={()=>send()} style={{background:'#075e54', color:'white', border:'none', width:44, height:44, borderRadius:22, fontSize:18}}>➤</button>
            ) : (
              <button onMouseDown={startVoice} onMouseUp={stopVoice} onTouchStart={startVoice} onTouchEnd={stopVoice} style={{background:'#075e54', color:'white', border:'none', width:44, height:44, borderRadius:22, fontSize:20}}>🎤</button>
            )}
          </>
        ) : (
          <div style={{flex:1, background:'white', borderRadius:24, display:'flex', alignItems:'center', padding:'6px 12px', gap:10}}>
            <div style={{width:8, height:8, background:'red', borderRadius:8}} />
            <span style={{fontSize:14, color:'#f00'}}>{Math.floor(voiceTime/60)}:{(voiceTime%60).toString().padStart(2,'0')}</span>
            <span style={{flex:1, fontSize:12, color:'#667781'}}>Recording... slide to cancel</span>
            <button onClick={stopVoice} style={{background:'#f00', color:'white', border:'none', padding:'8px 12px', borderRadius:16}}>Cancel</button>
            <button onMouseUp={stopVoice} onTouchEnd={stopVoice} style={{background:'#075e54', color:'white', border:'none', width:44, height:44, borderRadius:22}}>➤</button>
          </div>
        )}
      </div>
    </div>
  )
                                  }

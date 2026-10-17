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
  const mediaRef = useRef<any>(null)

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>setMe(data.user))
    supabase.from('profiles').select('*').eq('id', otherUserId).single().then(({data})=>setOther(data))
    initChat()
  },[])

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

  async function send(type='text', content=''){
    const msg = content || text
    if(!msg) return
    const { data: {user} } = await supabase.auth.getUser()
    await supabase.from('messages').insert({conversation_id: convId, sender_id: user?.id, type, content: msg, file_name: type!=='text'? 'file': null})
    setText('')
    loadMsgs(convId)
  }

  async function handleUpload(e:any, type='image'){
    const file = e.target.files[0]; if(!file) return
    const url = await uploadToBunny(file)
    send(type, url)
  }

  async function startVoice(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true})
      const rec = new MediaRecorder(stream)
      const chunks:any[]=[]
      rec.ondataavailable = e=>chunks.push(e.data)
      rec.onstop = async()=>{
        const blob = new Blob(chunks,{type:'audio/webm'})
        const file = new File([blob], `voice-${Date.now()}.webm`, {type:'audio/webm'})
        const url = await uploadToBunny(file)
        send('voice', url)
      }
      mediaRef.current = rec
      rec.start(); setRecording(true)
      setTimeout(()=>{ if(rec.state==='recording'){rec.stop(); setRecording(false)} }, 10000)
    }catch{}
  }

  function stopVoice(){
    if(mediaRef.current){ mediaRef.current.stop(); setRecording(false) }
  }

  return (
    <div style={{maxWidth:480, margin:'0 auto', height:'100vh', display:'flex', flexDirection:'column', background:'#f8fafc'}}>
      <div style={{padding:12, background:'white', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:10}}>
        <button onClick={()=>history.back()}>←</button>
        <img src={other?.avatar_url||'https://via.placeholder.com/40'} style={{width:36,height:36,borderRadius:18}}/>
        <b>{other?.full_name||'Chat'}</b>
      </div>
      <div style={{flex:1, overflowY:'auto', padding:12}}>
        {messages.map(m=>(
          <div key={m.id} style={{display:'flex', justifyContent: m.sender_id===me?.id?'flex-end':'flex-start', margin:'6px 0'}}>
            <div style={{maxWidth:'75%', padding:'10px 12px', borderRadius:16, background: m.sender_id===me?.id?'#2563eb':'white', color: m.sender_id===me?.id?'white':'#0f172a', border: m.sender_id!==me?.id?'1px solid #e2e8f0':''}}>
              {m.type==='text' && <span>{m.content}</span>}
              {m.type==='image' && <img src={m.content} style={{width:200, borderRadius:8}}/>}
              {m.type==='file' && <a href={m.content} target="_blank" style={{color: m.sender_id===me?.id?'white':'#2563eb'}}>📎 Open File</a>}
              {m.type==='voice' && <audio src={m.content} controls style={{width:180}}/>}
            </div>
          </div>
        ))}
      </div>
      <div style={{padding:10, background:'white', borderTop:'1px solid #e2e8f0', display:'flex', gap:6, alignItems:'center'}}>
        <label style={{cursor:'pointer', fontSize:20}}>📎<input type="file" hidden onChange={e=>handleUpload(e,'file')}/></label>
        <label style={{cursor:'pointer', fontSize:20}}>🖼️<input type="file" accept="image/*" hidden onChange={e=>handleUpload(e,'image')}/></label>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="Type message..." style={{flex:1, padding:'10px 12px', borderRadius:20, border:'1px solid #e2e8f0'}}/>
        <button onClick={()=>send()} style={{background:'#2563eb', color:'white', border:'none', padding:'10px 14px', borderRadius:20}}>Send</button>
        <button onMouseDown={startVoice} onMouseUp={stopVoice} onTouchStart={startVoice} onTouchEnd={stopVoice} style={{fontSize:20, background: recording?'#ef4444':'#f1f5f9', border:'none', padding:'8px 10px', borderRadius:20}}>{recording?'⏹️':'🎤'}</button>
      </div>
      <small style={{textAlign:'center', padding:4, color:'#94a3b8'}}>Hold 🎤 for voice note (max 10s) • No video call as requested</small>
    </div>
  )
      }

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/u/$userId')({
  component: UserProfile,
})

function UserProfile(){
  const { userId } = Route.useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  
  useEffect(()=>{
    async function load(){
      const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(p)
      const { data: ps } = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at',{ascending:false})
      setPosts(ps||[])
    }
    load()
  },[userId])

  if(!profile) return <div style={{padding:20}}>Loading profile...</div>

  return (
    <div style={{maxWidth:480, margin:'0 auto', background:'#f8fafc', minHeight:'100vh'}}>
      <div style={{padding:12, background:'white', borderBottom:'1px solid #eee'}}>
        <button onClick={()=>history.back()}>← Back</button>
      </div>
      <div style={{background:'white', padding:20, textAlign:'center'}}>
        <img src={profile.avatar_url || 'https://via.placeholder.com/100'} style={{width:90,height:90,borderRadius:45, border:'3px solid #2563eb'}}/>
        <h2 style={{marginTop:10}}>{profile.full_name}</h2>
        <p style={{color:'#64748b'}}>{profile.faculty} • {profile.email}</p>
        <p style={{color:'#64748b'}}>{profile.phone}</p>
        <button 
          onClick={()=>navigate({to:'/chat/$userId', params:{userId}})}
          style={{marginTop:14, background:'#2563eb', color:'white', border:'none', padding:'12px 28px', borderRadius:12, fontWeight:700, width:'100%'}}>
          ✉️ Message {profile.full_name.split(' ')[0]}
        </button>
      </div>
      <div style={{padding:12}}>
        <h3>Posts by {profile.full_name.split(' ')[0]} ({posts.length})</h3>
        {posts.map(post=>(
          <div key={post.id} style={{background:'white', borderRadius:12, padding:12, marginTop:10}}>
            <small style={{color:'#2563eb'}}>{post.channel} • {new Date(post.created_at).toLocaleDateString()}</small>
            <p style={{marginTop:6}}>{post.content}</p>
            {post.image_urls?.map((url:string,i:number)=><img key={i} src={url} style={{width:'100%', borderRadius:8, marginTop:6}}/>)}
            {post.video_url && <video src={post.video_url} controls style={{width:'100%', borderRadius:8, marginTop:6}}/>}
          </div>
        ))}
      </div>
    </div>
  )
      }

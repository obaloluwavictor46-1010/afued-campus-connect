import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/u/$userId')({
  component: FacebookProfile,
})

function FacebookProfile(){
  const { userId } = Route.useParams()
  const [me, setMe] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [followers, setFollowers] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [tab, setTab] = useState('All')
  const [loading, setLoading] = useState(true)
  const [showFullBio, setShowFullBio] = useState(false)

  useEffect(()=>{
    let mounted = true
    async function run(){
      try{
        setLoading(true)
        // Get current user
        const {data:{user}} = await supabase.auth.getUser()
        if(mounted && user) setMe(user)
        
        // Get profile data
        const {data:prof, error:profErr} = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
        if(profErr) {
          console.log("Profile error", profErr)
        }
        if(mounted) setProfile(prof)

        // Get user posts
        const {data:postData, error:postErr} = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at',{ascending:false}).limit(20)
        if(postErr) console.log(postErr)
        if(mounted) setPosts(postData||[])

        // Check if following this user
        if(user){
          const {data:fol, error:folErr} = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', userId).maybeSingle()
          if(!folErr && mounted) setIsFollowing(!!fol)
        }

        // Get followers count
        const {count:followersCount} = await supabase.from('follows').select('*',{count:'exact', head:true}).eq('following_id', userId)
        if(mounted) setFollowers(followersCount||0)

        // Get following count
        const {count:followingsCount} = await supabase.from('follows').select('*',{count:'exact', head:true}).eq('follower_id', userId)
        if(mounted) setFollowingCount(followingsCount||0)

      }catch(e){ 
        console.log("Load error", e) 
      }
      finally{ 
        if(mounted) setLoading(false) 
      }
    }
    run()
    return ()=>{ mounted=false }
  },[userId])

  async function toggleFollow(){
    if(!me?.id) { 
      alert("Please login to follow")
      return 
    }
    if(me.id===userId) return
    try{
      if(isFollowing){
        const {error} = await supabase.from('follows').delete().eq('follower_id', me.id).eq('following_id', userId)
        if(!error){ 
          setIsFollowing(false)
          setFollowers(f=>Math.max(0,f-1))
        } else {
          console.log(error)
        }
      }else{
        const {error} = await supabase.from('follows').insert({follower_id: me.id, following_id: userId})
        if(!error){ 
          setIsFollowing(true)
          setFollowers(f=>f+1)
        } else {
          console.log(error)
        }
      }
    }catch(e){ 
      console.log("Follow error", e) 
    }
  }

  if(loading) {
    return (
      <div style={{padding:40, textAlign:'center', fontFamily:'sans-serif'}}>
        <div style={{width:40, height:40, border:'3px solid #e4e6eb', borderTop:'3px solid #1877f2', borderRadius:'50%', margin:'0 auto', animation:'spin 1s linear infinite'}}></div>
        <div style={{marginTop:12}}>Loading profile...</div>
      </div>
    )
  }

  if(!profile) {
    return (
      <div style={{padding:40, textAlign:'center', fontFamily:'sans-serif'}}>
        <div style={{fontSize:18, marginBottom:8}}>User not found</div>
        <Link to="/" style={{color:'#1877f2', textDecoration:'none'}}>Go Home</Link>
      </div>
    )
  }

  const isMe = me?.id === profile.id
  const avatar = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name||'User')}&background=0866ff&color=fff`
  const coverBg = profile.cover_url ? `url(${profile.cover_url}) center/cover` : 'linear-gradient(90deg,#60a5fa,#3b82f6)'

  const bioText = profile.bio || `AFUED Student • ${profile.department||'Student'} • President @AFUED • Helping students connect`
  const displayBio = showFullBio ? bioText : bioText.slice(0, 100)

  return (
    <div style={{maxWidth:480, margin:'0 auto', background:'#f0f2f5', minHeight:'100vh', paddingBottom:70, fontFamily:'system-ui, -apple-system, sans-serif'}}>
      {/* Top Header like Facebook */}
      <div style={{background:'white', padding:'10px 12px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10, borderBottom:'1px solid #ddd'}}>
        <Link to="/" style={{textDecoration:'none', fontSize:22, color:'black'}}>←</Link>
        <b style={{fontSize:16, flex:1}}>{profile.full_name}</b>
        <span style={{fontSize:18, cursor:'pointer'}}>🔍</span>
        <span style={{fontSize:18, cursor:'pointer'}}>•••</span>
      </div>

      {/* Facebook Cover + Avatar like screenshot you sent */}
      <div style={{background:'white'}}>
        <div style={{height:180, background: coverBg, position:'relative'}}>
          <img src={avatar} alt="avatar" style={{width:140, height:140, borderRadius:'50%', border:'4px solid white', position:'absolute', bottom:-40, left:16, objectFit:'cover', background:'white'}}/>
        </div>
        
        <div style={{padding:'50px 16px 12px'}}>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <h1 style={{fontSize:21, fontWeight:'800', margin:0}}>{profile.full_name}</h1>
            <span style={{background:'#1877f2', color:'white', borderRadius:'50%', width:16, height:16, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10}}>✓</span>
          </div>
          
          <div style={{fontSize:13, marginTop:4, color:'#050505'}}>
            <b>{followers.toLocaleString()}</b> followers • <b>{followingCount}</b> following • <b>{posts.length}</b> posts
          </div>
          
          <div style={{fontSize:14, marginTop:8, lineHeight:'18px'}}>
            {displayBio}
            {bioText.length > 100 && (
              <span onClick={()=>setShowFullBio(!showFullBio)} style={{color:'#0064d1', cursor:'pointer', marginLeft:4}}>
                {showFullBio ? 'See less' : '... See more'}
              </span>
            )}
          </div>
          
          <div style={{fontSize:13, marginTop:8, color:'#65676b'}}>
            <div>🎓 Public figure • 📍 {profile.location||'Akure'}</div>
            {profile.followed_by && <div style={{marginTop:4}}>Followed by {profile.followed_by}</div>}
          </div>

          {/* Message + Follow like Facebook screenshot */}
          <div style={{display:'flex', gap:8, marginTop:14}}>
            {!isMe ? (
              <>
                <Link to={`/chat/${profile.id}`} style={{flex:1, background:'#1877f2', color:'white', padding:'10px', borderRadius:6, textAlign:'center', textDecoration:'none', fontWeight:'600', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>💬 Message</Link>
                <button onClick={toggleFollow} style={{flex:1, background: isFollowing ? '#e4e6eb' : '#e4e6eb', color:'black', border:'none', padding:'10px', borderRadius:6, fontWeight:'600', fontSize:14, cursor:'pointer'}}>
                  {isFollowing ? '✓ Following' : '+ Follow'}
                </button>
              </>
            ) : (
              <Link to="/profile" style={{flex:1, background:'#e4e6eb', color:'black', padding:'10px', borderRadius:6, textAlign:'center', textDecoration:'none', fontWeight:'600', fontSize:14}}>✏️ Edit Profile</Link>
            )}
          </div>

          {/* Tabs All Photos Reels Mentions like your screenshot */}
          <div style={{display:'flex', gap:22, marginTop:18, borderTop:'1px solid #e4e6eb', borderBottom:'1px solid #e4e6eb', overflowX:'auto'}}>
            {['All','Photos','Reels','Mentions'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:'12px 2px', border:'none', background:'none', borderBottom: tab===t ? '3px solid #1877f2' : '3px solid transparent', color: tab===t ? '#1877f2' : '#65676b', fontWeight: tab===t ? '700' : '400', fontSize:14, cursor:'pointer', whiteSpace:'nowrap'}}>{t}</button>
            ))}
          </div>

          <div style={{marginTop:12, display:'flex', gap:8}}>
            <div style={{flex:1, background:'#f0f2f5', padding:'10px', borderRadius:8, fontSize:13}}>
              <b>Details</b>
              <div style={{marginTop:6}}>📍 Lives in {profile.location||'Akure'}</div>
              <div style={{marginTop:4}}>🎓 Studied at AFUED</div>
            </div>
          </div>
        </div>
      </div>

      {/* Posts Section like Facebook */}
      <div>
        <div style={{background:'white', padding:'10px 16px', fontWeight:'700', fontSize:15, marginTop:8, borderBottom:'1px solid #e4e6eb'}}>Posts</div>
        {tab==='All' && posts.map(p=>(
          <div key={p.id} style={{background:'white', marginTop:8, padding:12}}>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <img src={avatar} style={{width:36, height:36, borderRadius:18, objectFit:'cover'}} alt=""/>
              <div style={{flex:1}}>
                <div style={{fontWeight:'700', fontSize:13, display:'flex', alignItems:'center', gap:4}}>{profile.full_name} <span style={{color:'#1877f2', fontSize:12}}>• Follow</span></div>
                <div style={{fontSize:11, color:'#65676b'}}>{new Date(p.created_at).toLocaleDateString()} • 🌍</div>
              </div>
              <div style={{fontSize:16}}>•••</div>
            </div>
            <div style={{marginTop:8, fontSize:14, lineHeight:'19px', whiteSpace:'pre-wrap'}}>{p.content}</div>
            {p.image_url && <img src={p.image_url} style={{width:'100%', borderRadius:8, marginTop:10, maxHeight:400, objectFit:'cover'}} loading="lazy" alt=""/>}
            {p.video_url && <video src={p.video_url} controls style={{width:'100%', borderRadius:8, marginTop:10}}/>}
          </div>
        ))}
        {tab!=='All' && <div style={{background:'white', padding:30, textAlign:'center', color:'#65676b', marginTop:8}}>No {tab} yet</div>}
        {posts.length===0 && tab==='All' && <div style={{background:'white', padding:30, textAlign:'center', color:'#65676b', marginTop:8}}>No posts yet - {isMe ? 'Create your first post!' : `${profile.full_name} has no posts`}</div>}
      </div>
    </div>
  )
            }

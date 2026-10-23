import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/u/$userId')({
  component: FacebookProfile,
})

// === ADDED: Profile Video - 1 at a time + resurrect if e fail ===
function ProfileVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasError, setHasError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const obs = new IntersectionObserver(
      ([e]) => { if (!e.isIntersecting) { try { video.pause() } catch {} } },
      { threshold: 0 }
    )
    obs.observe(video)
    return () => obs.disconnect()
  }, [src, retryKey])

  const handlePlay = () => {
    document.querySelectorAll('video, audio').forEach((el: any) => {
      if (el !== videoRef.current) { try { el.pause() } catch {} }
    })
  }

  const handleRetry = () => {
    setHasError(false)
    setRetryKey(k => k + 1)
    setTimeout(() => { try { videoRef.current?.load(); videoRef.current?.play().catch(()=>{}) } catch {} }, 100)
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <video
        key={retryKey}
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        onPlay={handlePlay}
        onError={() => setHasError(true)}
        style={{ width: '100%', borderRadius: 8, marginTop: 10, background: 'black' }}
      />
      {hasError && (
        <button onClick={handleRetry} style={{ position: 'absolute', inset: 0, top: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          <span style={{ fontSize: 28 }}>↻</span>
          <span>Video no load? Tap to resurrect</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>E never delete, na network</span>
        </button>
      )}
    </div>
  )
}

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
  const [followBusy, setFollowBusy] = useState(false)
  const [showFullBio, setShowFullBio] = useState(false)

  // === ADDED: REPOSTS ===
  const [repostedPosts, setRepostedPosts] = useState<any[]>([])
  const [repostCount, setRepostCount] = useState(0)
  const [myReposts, setMyReposts] = useState<Set<string>>(new Set())
  const [repostCounts, setRepostCounts] = useState<Record<string, number>>({})
  const [repostingId, setRepostingId] = useState<string | null>(null)

  const loadReposts = async (currentUserId?: string) => {
    // 1. Posts wey this profile person repost
    const { data: myRows } = await supabase.from('reposts').select('post_id, created_at').eq('user_id', userId).order('created_at', { ascending: false })
    if (myRows && myRows.length > 0) {
      const ids = myRows.map((r: any) => r.post_id)
      const { data: rePosts } = await supabase.from('posts').select('*').in('id', ids).order('created_at', { ascending: false })
      // Keep repost order
      const ordered = ids.map(id => (rePosts || []).find((p: any) => p.id === id)).filter(Boolean)
      setRepostedPosts(ordered)
      setRepostCount(myRows.length)
    } else {
      setRepostedPosts([])
      setRepostCount(0)
    }

    // 2. Repost counts for all posts shown + if ME don repost them
    const { data: allReposts } = await supabase.from('reposts').select('post_id, user_id')
    if (allReposts) {
      const counts: Record<string, number> = {}
      const mine = new Set<string>()
      ;(allReposts as any[]).forEach((r) => {
        counts[r.post_id] = (counts[r.post_id] || 0) + 1
        if (currentUserId && r.user_id === currentUserId) mine.add(r.post_id)
      })
      setRepostCounts(counts)
      setMyReposts(mine)
    }
  }

  const handleRepost = async (post: any) => {
    if (!me?.id) { alert("Please login to repost"); return }
    if (repostingId === post.id) return
    setRepostingId(post.id)
    const already = myReposts.has(post.id)
    try {
      if (already) {
        const { error } = await supabase.from('reposts').delete().eq('user_id', me.id).eq('post_id', post.id)
        if (error) throw error
        setMyReposts(prev => { const n = new Set(prev); n.delete(post.id); return n })
        setRepostCounts(prev => ({ ...prev, [post.id]: Math.max(0, (prev[post.id] || 1) - 1) }))
        // If we dey Reposts tab and na my own profile, remove am from list
        if (me.id === userId) setRepostedPosts(prev => prev.filter(p => p.id !== post.id))
        if (me.id === userId) setRepostCount(c => Math.max(0, c - 1))
      } else {
        const { error } = await supabase.from('reposts').insert({ user_id: me.id, post_id: post.id })
        if (error) throw error
        setMyReposts(prev => new Set(prev).add(post.id))
        setRepostCounts(prev => ({ ...prev, [post.id]: (prev[post.id] || 0) + 1 }))
        alert("Reposted! 🔁 E go show for your profile")
      }
    } catch (e: any) {
      if (e.message?.includes("reposts") || e.code === "42P01") alert("Repost table never create yet - run SQL for reposts first")
      else alert(e.message || "Repost failed")
    } finally { setRepostingId(null) }
  }

  useEffect(()=>{
    let mounted = true
    async function run(){
      try{
        setLoading(true)
        const {data:{user}} = await supabase.auth.getUser()
        if(mounted && user) setMe(user)
        const {data:prof, error:profErr} = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
        if(profErr) console.log("Profile error", profErr)
        if(mounted) setProfile(prof)
        const {data:postData, error:postErr} = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at',{ascending:false}).limit(20)
        if(postErr) console.log(postErr)
        if(mounted) setPosts(postData||[])
        if(user){
          const {data:fol} = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', userId).limit(1)
          if(mounted) setIsFollowing(!!fol && fol.length > 0)
        }
        const {count:followersCount} = await supabase.from('follows').select('*',{count:'exact', head:true}).eq('following_id', userId)
        if(mounted) setFollowers(followersCount||0)
        const {count:followingsCount} = await supabase.from('follows').select('*',{count:'exact', head:true}).eq('follower_id', userId)
        if(mounted) setFollowingCount(followingsCount||0)
        // === ADDED: Load reposts ===
        await loadReposts(user?.id)
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
    if(!me?.id){
      alert("Please login to follow")
      return
    }
    if(me.id===userId) return
    if(followBusy) return
    setFollowBusy(true)
    try{
      if(isFollowing){
        const {error} = await supabase.from('follows').delete().eq('follower_id', me.id).eq('following_id', userId)
        if(error) throw error
      }else{
        const {error} = await supabase.from('follows').upsert({follower_id: me.id, following_id: userId}, {onConflict: 'follower_id,following_id'})
        if(error) throw error
      }
      const {count: realCount} = await supabase.from('follows').select('*',{count:'exact', head:true}).eq('following_id', userId)
      setFollowers(realCount||0)
      setIsFollowing(!isFollowing)
    }catch(e:any){
      console.log("Follow error", e)
      alert("Follow failed: " + (e.message || "Check Supabase RLS policy for follows table"))
    } finally {
      setFollowBusy(false)
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
  const bioText = profile.bio || `AFUED Student • ${profile.department||profile.faculty||'Student'} • Helping students connect`
  const displayBio = showFullBio ? bioText : bioText.slice(0, 100)

  const getMedia = (p:any) => {
    if(p.media_url) return { url: p.media_url, isVideo: p.media_type?.includes('video') || p.media_url.includes('.mp4') || p.media_url.includes('.mov') }
    if(p.image_url) return { url: p.image_url, isVideo: false }
    if(p.video_url) return { url: p.video_url, isVideo: true }
    return { url: null, isVideo: false }
  }

  // === ADDED: If tab na Reposts, show repostedPosts, else filter normal posts ===
  const listToShow = tab === 'Reposts' ? repostedPosts : posts
  const filteredPosts = listToShow.filter(p => {
    if(tab === 'All') return true
    if(tab === 'Reposts') return true
    if(tab === 'Photos') return getMedia(p).url && !getMedia(p).isVideo
    if(tab === 'Reels') return getMedia(p).url && getMedia(p).isVideo
    if(tab === 'Mentions') return false
    return true
  })

  return (
    <div style={{maxWidth:480, margin:'0 auto', background:'#f0f2f5', minHeight:'100vh', paddingBottom:70, fontFamily:'system-ui, -apple-system, sans-serif'}}>
      <div style={{background:'white', padding:'10px 12px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10, borderBottom:'1px solid #ddd'}}>
        <Link to="/" style={{textDecoration:'none', fontSize:22, color:'black'}}>←</Link>
        <b style={{fontSize:16, flex:1}}>{profile.full_name}</b>
        <span style={{fontSize:18, cursor:'pointer'}}>🔍</span>
        <span style={{fontSize:18, cursor:'pointer'}}>•••</span>
      </div>
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
            <b>{followers.toLocaleString()}</b> followers • <b>{followingCount}</b> following • <b>{posts.length}</b> posts • <b>{repostCount}</b> reposts
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
          <div style={{display:'flex', gap:8, marginTop:14}}>
            {!isMe ? (
              <>
                <Link to="/chat/$userId" params={{ userId: profile.id }} style={{flex:1, background:'#1877f2', color:'white', padding:'10px', borderRadius:6, textAlign:'center', textDecoration:'none', fontWeight:'600', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>💬 Message</Link>
                <button onClick={toggleFollow} disabled={followBusy} style={{flex:1, background: isFollowing ? '#e4e6eb' : '#1877f2', color: isFollowing ? 'black' : 'white', border:'none', padding:'10px', borderRadius:6, fontWeight:'600', fontSize:14, cursor: followBusy ? 'wait' : 'pointer', opacity: followBusy ? 0.6 : 1}}>
                  {followBusy ? '...' : isFollowing ? '✓ Following' : '+ Follow'}
                </button>
              </>
            ) : (
              <Link to="/profile" style={{flex:1, background:'#e4e6eb', color:'black', padding:'10px', borderRadius:6, textAlign:'center', textDecoration:'none', fontWeight:'600', fontSize:14}}>✏️ Edit Profile</Link>
            )}
          </div>
          <div style={{display:'flex', gap:22, marginTop:18, borderTop:'1px solid #e4e6eb', borderBottom:'1px solid #e4e6eb', overflowX:'auto'}}>
            {['All','Photos','Reels','Reposts','Mentions'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:'12px 2px', border:'none', background:'none', borderBottom: tab===t ? '3px solid #1877f2' : '3px solid transparent', color: tab===t ? '#1877f2' : '#65676b', fontWeight: tab===t ? '700' : '400', fontSize:14, cursor:'pointer', whiteSpace:'nowrap'}}>{t}{t==='Reposts' ? ` (${repostCount})` : ''}</button>
            ))}
          </div>
          <div style={{marginTop:12, display:'flex', gap:8}}>
            <div style={{flex:1, background:'#f0f2f5', padding:'10px', borderRadius:8, fontSize:13}}>
              <b>Details</b>
              <div style={{marginTop:6}}>📍 Lives in {profile.location||'Akure'}</div>
              <div style={{marginTop:4}}>🎓 Studied at {profile.school || 'AFUED'}</div>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div style={{background:'white', padding:'10px 16px', fontWeight:'700', fontSize:15, marginTop:8, borderBottom:'1px solid #e4e6eb'}}>{tab === 'Reposts' ? `Reposts • ${repostCount}` : 'Posts'}</div>
        {filteredPosts.map(p=>{
          const media = getMedia(p)
          const isRepostedPost = tab === 'Reposts'
          const isMyRepost = myReposts.has(p.id)
          return (
            <div key={p.id} style={{background:'white', marginTop:8, padding:12}}>
              {/* === ADDED: Repost label like TikTok === */}
              {isRepostedPost && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0a7a42', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  🔁 {profile.full_name} reposted this
                </div>
              )}
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <img src={avatar} style={{width:36, height:36, borderRadius:18, objectFit:'cover'}} alt=""/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'700', fontSize:13, display:'flex', alignItems:'center', gap:4}}>{isRepostedPost ? 'Original Post' : profile.full_name} {!isMe && !isFollowing && <span onClick={toggleFollow} style={{color:'#1877f2', fontSize:12, cursor:'pointer'}}>• Follow</span>}</div>
                  <div style={{fontSize:11, color:'#65676b'}}>{new Date(p.created_at).toLocaleDateString()} • 🌍</div>
                </div>
                <div style={{fontSize:16}}>•••</div>
              </div>
              <div style={{marginTop:8, fontSize:14, lineHeight:'19px', whiteSpace:'pre-wrap'}}>{p.content}</div>
              {media.url && !media.isVideo && <img src={media.url} style={{width:'100%', borderRadius:8, marginTop:10, maxHeight:400, objectFit:'cover'}} loading="lazy" alt=""/>}
              {media.url && media.isVideo && <ProfileVideo src={media.url} />}
              {/* === ADDED: Repost button for profile posts === */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => handleRepost(p)} disabled={repostingId === p.id} style={{ background: isMyRepost ? '#d1f4e0' : '#f0f2f5', color: isMyRepost ? '#0a7a42' : '#65676b', border: 'none', padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  🔁 {repostingId === p.id ? 'Wait...' : isMyRepost ? 'Reposted' : 'Repost'} • {repostCounts[p.id] || 0}
                </button>
                <Link to="/post/$postId" params={{ postId: p.id }} style={{ background: '#f0f2f5', color: '#65676b', padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>💬 View Post</Link>
              </div>
            </div>
          )
        })}
        {filteredPosts.length===0 && <div style={{background:'white', padding:30, textAlign:'center', color:'#65676b', marginTop:8}}>{tab==='Reposts' ? `${profile.full_name} never repost anything yet` : tab==='All' && posts.length===0 ? (isMe ? 'No posts yet - Create your first post!' : `${profile.full_name} has no posts`) : `No ${tab} yet`}</div>}
      </div>
    </div>
  )
}

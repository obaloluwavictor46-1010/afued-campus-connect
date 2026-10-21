import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Search, ArrowLeft, MessageCircle, User } from 'lucide-react'

export const Route = createFileRoute('/search')({
  component: SearchPage,
})

function SearchPage(){
  const [q, setQ] = useState("")
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<any[]>(()=>{ 
    try{ return JSON.parse(localStorage.getItem('afued-search-recent')||'[]') }catch{ return [] }
  })

  async function doSearch(val: string){
    setQ(val)
    if(val.trim().length < 2){
      setUsers([])
      return
    }
    setLoading(true)
    const { data: {user: me} } = await supabase.auth.getUser()
    
    // Search by full_name, phone, matric, email, department
    const { data } = await supabase.from('profiles')
      .select('id, full_name, avatar_url, phone, matric_no, department, faculty')
      .or(`full_name.ilike.%${val}%,phone.ilike.%${val}%,matric_no.ilike.%${val}%,email.ilike.%${val}%,department.ilike.%${val}%`)
      .neq('id', me?.id || '')
      .limit(25)

    setUsers(data || [])
    setLoading(false)
  }

  function saveRecent(u:any){
    const newRecent = [u, ...recent.filter((r:any)=>r.id!==u.id)].slice(0,10)
    setRecent(newRecent)
    localStorage.setItem('afued-search-recent', JSON.stringify(newRecent))
  }

  return (
    <div style={{maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'white'}}>
      {/* Header - Like WhatsApp */}
      <div style={{position:'sticky', top:0, background:'white', padding:'8px 12px', borderBottom:'1px solid #e2e8f0', zIndex:10, display:'flex', alignItems:'center', gap:10}}>
        <button onClick={()=>history.back()} style={{padding:6, border:'none', background:'transparent'}}>
          <ArrowLeft size={22}/>
        </button>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:8, background:'#f0f2f5', borderRadius:24, padding:'8px 14px'}}>
          <Search size={18} color="#667781"/>
          <input 
            value={q} 
            onChange={e=>doSearch(e.target.value)} 
            placeholder="Search name, matric no, phone..." 
            autoFocus
            style={{flex:1, border:'none', outline:'none', background:'transparent', fontSize:16}}
          />
          {q && <button onClick={()=>{setQ(''); setUsers([])}} style={{border:'none', background:'transparent', fontSize:18}}>×</button>}
        </div>
      </div>

      {/* Results */}
      <div style={{padding:'10px 0'}}>
        {q.length < 2 && recent.length > 0 && (
          <>
            <div style={{padding:'8px 16px', fontSize:12, color:'#667781', fontWeight:600}}>RECENT SEARCHES</div>
            {recent.map((u:any)=>(
              <Link key={u.id} to="/chat/$userId" params={{userId: u.id}} onClick={()=>saveRecent(u)} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 16px', textDecoration:'none', color:'black'}}>
                <img src={u.avatar_url || `https://ui-avatars.com/api/?name=${u.full_name}`} style={{width:48, height:48, borderRadius:24, objectFit:'cover'}}/>
                <div style={{flex:1}}>
                  <b style={{fontSize:15}}>{u.full_name}</b>
                  <div style={{fontSize:12, color:'#667781'}}>{u.department || u.matric_no || u.phone || 'AFUED Student'}</div>
                </div>
                <MessageCircle size={18} color="#00a884"/>
              </Link>
            ))}
          </>
        )}

        {q.length >= 2 && (
          <>
            <div style={{padding:'8px 16px', fontSize:12, color:'#667781', fontWeight:600}}>
              {loading ? 'SEARCHING...' : `${users.length} RESULTS FOR "${q}"`}
            </div>
            {users.map((u:any)=>(
              <Link key={u.id} to="/chat/$userId" params={{userId: u.id}} onClick={()=>saveRecent(u)} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', textDecoration:'none', color:'black', borderBottom:'1px solid #f0f2f5'}}>
                <img src={u.avatar_url || `https://ui-avatars.com/api/?name=${u.full_name}`} style={{width:50, height:50, borderRadius:25, objectFit:'cover', background:'#e2e8f0'}}/>
                <div style={{flex:1, minWidth:0}}>
                  <b style={{fontSize:15, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{u.full_name}</b>
                  <div style={{fontSize:12, color:'#667781', display:'flex', gap:6, flexWrap:'wrap'}}>
                    {u.matric_no && <span>🎓 {u.matric_no}</span>}
                    {u.department && <span>• {u.department}</span>}
                    {u.phone && <span>• 📞 {u.phone}</span>}
                  </div>
                </div>
                <div style={{background:'#00a884', width:36, height:36, borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <MessageCircle size={18} color="white"/>
                </div>
              </Link>
            ))}
            {!loading && users.length===0 && q.length>=2 && (
              <div style={{textAlign:'center', padding:'40px 20px', color:'#667781'}}>
                <User size={48} style={{margin:'0 auto 12px', opacity:0.3}}/>
                <p>No student found for <b>"{q}"</b></p>
                <p style={{fontSize:12, marginTop:6}}>Try full name, matric no, or phone number</p>
              </div>
            )}
          </>
        )}

        {q.length < 2 && recent.length===0 && (
          <div style={{textAlign:'center', padding:'60px 20px', color:'#667781'}}>
            <Search size={48} style={{margin:'0 auto 12px', opacity:0.2}}/>
            <p style={{fontWeight:600}}>Search AFUED Students</p>
            <p style={{fontSize:13, marginTop:6}}>Find by name, matric number, phone number, or department</p>
            <div style={{marginTop:20, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap'}}>
              <span style={{background:'#f0f2f5', padding:'6px 12px', borderRadius:16, fontSize:12}}>e.g. James</span>
              <span style={{background:'#f0f2f5', padding:'6px 12px', borderRadius:16, fontSize:12}}>e.g. EDU/2022/1234</span>
              <span style={{background:'#f0f2f5', padding:'6px 12px', borderRadius:16, fontSize:12}}>e.g. 080...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

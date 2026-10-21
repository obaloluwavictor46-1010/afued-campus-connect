import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

function PrivacyPage(){
  return (
    <div style={{maxWidth:700, margin:'0 auto', padding:'20px', background:'white', minHeight:'100vh', color:'#111b21', lineHeight:1.6}}>
      <Link to="/" style={{color:'#00a884'}}>← Back to AFUED</Link>
      <h1 style={{fontSize:28, marginTop:16}}>Privacy Policy - AFUED Campus Connect</h1>
      <p style={{color:'#667781'}}>Last updated: May 13, 2026</p>

      <h2>1. Who we are</h2>
      <p>AFUED Campus Connect is an official student social platform for Adeyemi Federal University of Education (AFUED), Ondo. Built for students to connect, share news, chat and buy/sell in market.</p>

      <h2>2. What data we collect</h2>
      <ul>
        <li><b>Account:</b> Full name, matric number, avatar photo, email (for login only)</li>
        <li><b>Posts:</b> Text, images, videos you upload (stored securely on Bunny.net CDN)</li>
        <li><b>Chat:</b> Messages, voice notes, images, videos between students</li>
        <li><b>Technical:</b> Device type, app usage to improve speed</li>
      </ul>

      <h2>3. What we DON'T collect</h2>
      <p style={{background:'#dcfce7', padding:10, borderRadius:8}}>✅ We NEVER collect your credit card, BVN, bank password, or Gmail password. AFUED will never ask for it.</p>

      <h2>4. How we use your data</h2>
      <p>To show your posts in feed, deliver chat messages, compress videos for fast play like Facebook/WhatsApp. Your videos are stored on Bunny Stream (iframe.mediadelivery.net) for fast playback.</p>

      <h2>5. Where data is stored</h2>
      <p>Supabase (EU/US), BunnyCDN Storage. All data encrypted with HTTPS. Only you and people you chat with can see your messages.</p>

      <h2>6. Your rights</h2>
      <p>You can delete your post, delete your account anytime from Profile → Settings. Contact us to remove data: afuedconnect@gmail.com</p>

      <h2>7. Contact</h2>
      <p>Developer: AFUED Campus Team, Ondo State, Nigeria<br/>Email: afuedconnect@gmail.com<br/>Phone: Available in school ICT office</p>

      <p style={{marginTop:30, fontSize:12, color:'#8696a0'}}>This app is not affiliated with Google, Meta, or WhatsApp. WhatsApp-style UI is for familiarity only.</p>
    </div>
  )
}

import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/terms')({
  component: TermsPage,
})

function TermsPage(){
  return (
    <div style={{maxWidth:700, margin:'0 auto', padding:'20px', background:'white', minHeight:'100vh', color:'#111b21', lineHeight:1.6}}>
      <Link to="/" style={{color:'#00a884'}}>← Back to AFUED</Link>
      <h1 style={{fontSize:28, marginTop:16}}>Terms of Use - AFUED Campus Connect</h1>
      <p style={{color:'#667781'}}>By using AFUED Campus Connect, you agree to these terms.</p>

      <h2>1. Student Use Only</h2>
      <p>Only AFUED students and staff can register. Use your real name and matric number.</p>

      <h2>2. Don'ts</h2>
      <ul>
        <li>No porn, nudity, or explicit sexual content</li>
        <li>No scam, fraud, or collecting other students' passwords/bank details</li>
        <li>No bullying, harassment, hate speech</li>
        <li>No posting other people's private info</li>
      </ul>

      <h2>3. Content</h2>
      <p>You own your posts. But you give AFUED permission to show it in feed and compress video for fast play. We can remove content that breaks rules.</p>

      <h2>4. Safety</h2>
      <p>This is a safe campus space. If someone asks you for money or password, report immediately. AFUED admins will never ask for your Supabase/Bunny password or credit card.</p>

      <h2>5. Disclaimer</h2>
      <p>Marketplace transactions are between students. AFUED team is not responsible for lost items. Meet in public places on campus.</p>

      <h2>6. Changes</h2>
      <p>We can update these terms. Continued use means you agree.</p>
    </div>
  )
}

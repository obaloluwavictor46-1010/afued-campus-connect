export async function uploadToBunny(file: File): Promise<string> {
  const endpoint = import.meta.env.VITE_BUNNY_ENDPOINT
  const publicUrl = import.meta.env.VITE_BUNNY_PUBLIC_URL
  const accessKey = import.meta.env.VITE_BUNNY_ACCESS_KEY
  const fileName = Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9.-]/g,'')
  const res = await fetch(`${endpoint}/${fileName}`, {
    method: 'PUT',
    headers: { 'AccessKey': accessKey, 'Content-Type': file.type },
    body: file
  })
  if(!res.ok) throw new Error('Bunny upload failed')
  return `${publicUrl}/${fileName}`
}
export function validateVideo(file: File){
  if(file.size > 30*1024*1024) throw new Error('Video max 30MB - reduce am')
  return true
}

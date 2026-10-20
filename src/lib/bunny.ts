export async function uploadToBunny(file: File): Promise<string> {
  const endpoint = import.meta.env.VITE_BUNNY_ENDPOINT as string // https://de.storage.bunnycdn.com/afued-storage
  const publicUrl = import.meta.env.VITE_BUNNY_PUBLIC_URL as string
  const accessKey = import.meta.env.VITE_BUNNY_ACCESS_KEY as string
  
  // Clean file name make e no get space
  const fileName = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.-]/g,'')
  
  const res = await fetch(`${endpoint}/${fileName}`, {
    method: 'PUT',
    headers: { 
      'AccessKey': accessKey, 
      'Content-Type': file.type || 'application/octet-stream' 
    },
    body: file
  })
  
  if(!res.ok) {
    const err = await res.text()
    console.error(err)
    throw new Error('Bunny upload failed: ' + err)
  }
  
  return `${publicUrl}/${fileName}`
}

export function validateVideo(file: File){
  // Before na 30MB, now we allow up to 500MB because na Bunny
  if(file.size > 500*1024*1024) throw new Error('Video too big - max 500MB')
  return true
}

export function validateAudio(file: File){
  if(file.size > 200*1024*1024) throw new Error('Audio too big - max 200MB')
  return true
}

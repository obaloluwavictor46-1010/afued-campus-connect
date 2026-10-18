import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function uploadFile(file: File) {
  try {
    const fileName = `${Date.now()}-${Math.random()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('media').upload(fileName, file)
    if (error) return null
    const { data } = supabase.storage.from('media').getPublicUrl(fileName)
    return data.publicUrl
  } catch { return null }
}

export async function uploadMultipleFiles(files: File[]) {
  const urls: string[] = []
  for (const file of files) {
    const url = await uploadFile(file)
    if (url) urls.push(url)
  }
  return urls
}

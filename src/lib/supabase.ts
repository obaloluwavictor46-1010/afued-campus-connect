import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const supabase = createClient(url, key)

// --- FIXES FOR BUILD ---
export const MAX_POSTS_PER_DAY = 5
export const FEED_CHANNELS = ["general", "academics", "announcements"] as const

export function shortFaculty(faculty: string) {
  if (!faculty) return "";
  return faculty.slice(0, 4).toUpperCase();
}

export type Profile = {
  id: string
  faculty?: string
  full_name?: string
  avatar_url?: string
}

export type Post = {
  id: string
  content: string
  user_id: string
  media_urls?: string[]
  channel?: string
  created_at?: string
}

export async function fetchProfiles(ids: string[]) {
  if (!ids.length) return [] as Profile[]
  const { data } = await supabase.from("profiles").select("*").in("id", ids)
  return (data as Profile[]) || []
}

export async function insertWithMedia(payload: any) {
  const { data, error } = await supabase.from("posts").insert(payload).select().single()
  if (error) throw error
  return data
}

export async function uploadMany(files: File[]) {
  const urls: string[] = []
  for (const file of files) {
    const path = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from("post-media").upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from("post-media").getPublicUrl(path)
      urls.push(data.publicUrl)
    }
  }
  return urls
      }

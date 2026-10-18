import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const supabase = createClient(url, key)

// --- CONSTANTS ---
export const MAX_POSTS_PER_DAY = 5
export const MARKETPLACE_TTL_DAYS = 30
export const FEED_CHANNELS = ["general", "academics", "announcements"] as const
export const FACULTIES = ["Arts", "Education", "Science", "Social Sciences", "Vocational Education", "Agriculture"] as const

// --- HELPERS ---
export function shortFaculty(faculty: string) {
  if (!faculty) return "";
  return faculty.slice(0, 4).toUpperCase();
}

export function kindOfUrl(u: string) {
  if (!u) return "unknown";
  if (u.match(/\.(mp4|mov|webm|avi)$/i)) return "video";
  if (u.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return "image";
  return "link";
}

export function mediaOf(url: string) {
  const kind = kindOfUrl(url);
  return { url, kind, type: kind };
}

// --- TYPES ---
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

// --- FUNCTIONS ---
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
    await supabase.storage.from("post-media").upload(path, file)
    const { data } = supabase.storage.from("post-media").getPublicUrl(path)
    urls.push(data.publicUrl)
  }
  return urls
}

export async function uploadImage(file: File) {
  const path = `${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from("post-media").upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from("post-media").getPublicUrl(path)
  return data.publicUrl
}

export async function uploadImages(files: File[]) {
  return uploadMany(files)
}

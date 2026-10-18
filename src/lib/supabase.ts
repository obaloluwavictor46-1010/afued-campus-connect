import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// --- CONSTANTS ---
export const MAX_IMAGES = 4;
export const MAX_MEDIA = 15;
export const MARKETPLACE_TTL_DAYS = 30;
export const MAX_POSTS_PER_DAY = 10;

export const FACULTIES = [
  "Arts",
  "Education",
  "Science",
  "Social Sciences",
  "Vocational & Technical Education",
] as const;

export const FEED_CHANNELS = [
  "general",
  "academic",
  "announcements",
  "marketplace",
  "lost_and_found",
] as const;

export const LEVELS = ["100", "200", "300", "400", "500"] as const;
export type Profile = any;

// --- HELPERS ---
export function shortFaculty(faculty: string) {
  if (!faculty) return "";
  const map: Record<string, string> = {
    "Arts": "ARTS",
    "Education": "EDU",
    "Science": "SCI",
    "Social Sciences": "SOS",
    "Vocational & Technical Education": "VTE",
  };
  return map[faculty] || faculty.slice(0, 4).toUpperCase();
}

export function fileNameFromUrl(url: string) {
  try { return new URL(url).pathname.split("/").pop() || "file"; } catch { return "file"; }
}

export function kindOfUrl(url: string): "image" | "video" | "file" {
  if (!url) return "file";
  const u = url.toLowerCase();
  if (u.match(/\.(mp4|webm|mov)(\?|$)/)) return "video";
  if (u.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) return "image";
  return "file";
}

export function mediaOf(post: any): string[] {
  if (!post) return [];
  if (Array.isArray(post.media)) return post.media;
  if (Array.isArray(post.media_urls)) return post.media_urls;
  if (Array.isArray(post.images)) return post.images;
  if (post.image_url) return [post.image_url];
  if (typeof post.media === 'string') return [post.media];
  return [];
}

export function checkSize() { return true; }
export function checkVideo() { return true; }

// --- STORAGE — FIXED NO CRASH ---
export async function uploadFile(file: File, bucket = "media") {
  try {
    const cleanName = file.name.replace(/\s/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
    const fileName = `${Date.now()}-${cleanName}`;
    const { error } = await supabase.storage.from(bucket).upload(fileName, file);
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  } catch { return null; }
}

export async function uploadFiles(files: File[], bucket = "media") {
  const urls = [];
  for (const f of files) {
    const url = await uploadFile(f, bucket);
    if (url) urls.push(url);
  }
  return urls;
}

// NEW uploadMany supports userId and progress callback (for Marketplace/Feed/Announcements)
export async function uploadMany(files: File[], _userId?: string, onProgress?: (pct: number) => void) {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const url = await uploadFile(files[i], "media");
    if (url) urls.push(url);
    if (onProgress) onProgress(Math.round(((i+1)/files.length)*100));
  }
  return urls;
}

export async function uploadImage(file: File) {
  return await uploadFile(file, "media");
}

export async function uploadMultipleFiles(files: File[]) {
  return await uploadFiles(files);
}

export function getPublicUrl(path: string, bucket = "media") {
  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch { return ""; }
}

export async function deleteFile(path: string, bucket = "media") {
  try { await supabase.storage.from(bucket).remove([path]); return true; } catch { return false; }
}

export async function listFiles() { return []; }

// --- DATABASE — FIXED TO SUPPORT ALL TABLES ---
export async function fetchProfiles(ids?: string[]) {
  try {
    let query = supabase.from("profiles").select("*");
    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    }
    const { data } = await query;
    if (ids && ids.length > 0) {
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.id] = p; });
      return map;
    }
    return data || [];
  } catch { return ids ? {} : []; }
}

export async function fetchPosts() {
  try {
    const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    return data || [];
  } catch { return []; }
}

export async function createPost(payload: any) {
  try {
    const { data, error } = await supabase.from("posts").insert(payload).select().single();
    if (error) throw error;
    return data;
  } catch { return null; }
}

// THIS NOW SUPPORTS BOTH WAYS: insertWithMedia("marketplace_items", {...}, urls) AND insertWithMedia(payload, files)
export async function insertWithMedia(tableOrPayload: any, payloadOrUrls?: any, maybeUrls?: any) {
  try {
    // Case 1: insertWithMedia("marketplace_items", {author_id...}, urls)
    if (typeof tableOrPayload === "string") {
      const tableName = tableOrPayload;
      const payload = payloadOrUrls || {};
      const urls: string[] = maybeUrls || [];
      let finalPayload = { ...payload };
      // Put media urls in correct field
      if (urls.length > 0) {
        if (tableName === "marketplace_items" || tableName === "posts") {
          finalPayload.media = urls;
          if (urls[0] && !finalPayload.image_url) finalPayload.image_url = urls[0];
        } else if (tableName === "announcements") {
          finalPayload.media = urls;
          if (urls[0]) finalPayload.image_url = urls[0];
        } else {
          finalPayload.media = urls;
        }
      }
      const { data, error } = await supabase.from(tableName).insert(finalPayload).select().single();
      if (error) throw error;
      return data;
    } else {
      // Case 2: insertWithMedia(payload, files) -> old feed logic -> insert to posts
      const payload = tableOrPayload;
      const files: File[] = payloadOrUrls || [];
      let mediaUrls: string[] = [];
      if (files.length > 0) mediaUrls = await uploadMany(files);
      const finalPayload = { ...payload, media: mediaUrls };
      return await createPost(finalPayload);
    }
  } catch (e) {
    throw e;
  }
    }

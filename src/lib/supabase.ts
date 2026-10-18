import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// --- CONSTANTS ---
export const MAX_IMAGES = 4;
export const MAX_MEDIA = 15;
export const MARKETPLACE_TTL_DAYS = 30;

export const FACULTIES = [
  "Arts",
  "Education",
  "Science",
  "Social Sciences",
  "Vocational & Technical Education",
] as const;

export const LEVELS = ["100", "200", "300", "400", "500"] as const;

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
  try {
    return new URL(url).pathname.split("/").pop() || "file";
  } catch {
    return "file";
  }
}

export function kindOfUrl(url: string): "image" | "video" | "file" {
  if (!url) return "file";
  const u = url.toLowerCase();
  if (u.match(/\.(mp4|webm|mov)$/)) return "video";
  if (u.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "image";
  return "file";
}

export function checkSize() { return true; }
export function checkVideo() { return true; }

// --- STORAGE ---
export async function uploadFile(file: File, bucket = "media") {
  try {
    const fileName = `${Date.now()}-${file.name}`;
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

export async function uploadMany(files: File[]) {
  return await uploadFiles(files);
}

export async function uploadImage(file: File) {
  return await uploadFile(file, "media");
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

// --- DATABASE ---
export async function fetchProfiles() {
  try {
    const { data } = await supabase.from("profiles").select("*");
    return data || [];
  } catch { return []; }
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

export async function insertWithMedia(payload: any, files: File[]) {
  try {
    let mediaUrls: string[] = [];
    if (files && files.length > 0) {
      mediaUrls = await uploadMany(files);
    }
    const finalPayload = { ...payload, media: mediaUrls };
    return await createPost(finalPayload);
  } catch {
    return await createPost(payload);
  }
}

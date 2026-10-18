import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    const { data } = await supabase.from("posts").insert(payload).select().single();
    return data;
  } catch { return null; }
}

export async function uploadMany(files: File[]) { return []; }
export async function insertWithMedia(payload: any, files: File[]) {
  try { return await createPost(payload); } catch { return null; }
}
export async function uploadFile() { return null; }
export async function uploadFiles() { return []; }
export async function deleteFile() { return true; }
export async function getPublicUrl() { return ""; }
export async function listFiles() { return []; }

export const MAX_IMAGES = 4
export const MAX_MEDIA = 15
export function checkSize() { return true; }
export function checkVideo() { return true; }
export function fileNameFromUrl(url: string) { 
  try { return new URL(url).pathname.split("/").pop() || "file" } catch { return "file" } 
}
export function kindOfUrl() { return "file" as const; }

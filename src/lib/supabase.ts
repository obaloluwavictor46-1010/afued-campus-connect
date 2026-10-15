import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] || "https://ciwljsccbheykclimmhq.supabase.co";
const supabaseKey =
  import.meta.env["VITE_SUPABASE_ANON_KEY"] ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpd2xqc2NjYmhleWtjbGltbWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTY3MzgsImV4cCI6MjEwNzM5MjczOH0.h41kKfoXGVdk3RJEMvkwUFfC3k4g7pUTkpvX_zVzNgo";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export const FACULTIES = [
  "Faculty of Arts",
  "Faculty of Management and Social Science",
  "Faculty of Education",
  "Faculty of Science",
  "Faculty of Vocational and Technical Education",
  "Department of Educational Psychology and Counselling",
] as const;

// Feed channels (categories)
export const FEED_CHANNELS = FACULTIES.slice(0, 5);

export const shortFaculty = (f?: string | null) =>
  !f
    ? ""
    : f
        .replace("Faculty of ", "")
        .replace("Department of ", "")
        .replace("Management and Social Science", "Mgt & Social Sci")
        .replace("Vocational and Technical Education", "Voc & Tech Edu")
        .replace("Educational Psychology and Counselling", "Edu Psych & Counselling");

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  faculty: string | null;
  avatar_url: string | null;
  is_admin?: boolean | null;
  can_post_announcement?: boolean | null;
};

export type Post = {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  media_urls?: string[] | null;
  faculty_channel: string | null;
  created_at: string;
};

export const MEDIA_BUCKET = "post-media";
export const MAX_MEDIA = 15;
export const MAX_IMAGE = 10 * 1024 * 1024;
export const MAX_FILE = 50 * 1024 * 1024;
export const MEDIA_ACCEPT = "image/*,video/mp4,video/quicktime,.mp4,.mov,.pdf,.doc,.docx";

export type MediaKind = "image" | "video" | "audio" | "file";
export const kindOfFile = (f: Blob) =>
  (f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "file") as MediaKind;
export const kindOfUrl = (url: string): MediaKind => {
  const ext = url.split("?")[0]!.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "avif", "bmp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v", "qt"].includes(ext)) return "video";
  if (["mp3", "m4a", "ogg", "wav", "aac"].includes(ext)) return "audio";
  return "file";
};
export const fileNameFromUrl = (url: string) => {
  const last = decodeURIComponent(url.split("?")[0]!.split("/").pop() ?? "file");
  return last.replace(/^\d+-[a-z0-9]+-/, "");
};

/** All media of a row: media_urls array, falling back to the single image_url. */
export const mediaOf = (row: { media_urls?: string[] | null; image_url?: string | null }) =>
  row.media_urls?.length ? row.media_urls : row.image_url ? [row.image_url] : [];

/** Throws a friendly error if the file is too big. */
export function checkSize(file: Blob, maxVideoMB = 50) {
  const k = kindOfFile(file);
  const max = k === "image" ? MAX_IMAGE : k === "video" ? maxVideoMB * 1024 * 1024 : MAX_FILE;
  if (file.size > max) throw new Error(`${k === "image" ? "Image" : k === "video" ? "Video" : "File"} is too large (max ${max / 1024 / 1024}MB)`);
}

/** Upload many files to post-media with combined progress. */
export async function uploadMany(files: File[], folder: string, onProgress?: (pct: number) => void) {
  const total = files.reduce((s, f) => s + f.size, 0) || 1;
  const done: number[] = files.map(() => 0);
  const report = () => onProgress?.(Math.min(99, Math.round((done.reduce((s, x) => s + x, 0) / total) * 100)));
  onProgress?.(0);
  const urls: string[] = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const n = next++;
      const f = files[n]!;
      urls[n] = await uploadFile(f, MEDIA_BUCKET, folder, undefined, (p) => { done[n] = (p / 100) * f.size; report(); });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  onProgress?.(100);
  return urls;
}

/** Insert a row with media_urls; if that column isn't added yet, falls back to image_url only. */
export async function insertWithMedia(table: string, row: Record<string, unknown>, urls: string[]) {
  const full = { ...row, image_url: urls[0] ?? null, media_urls: urls };
  let res = await supabase.from(table).insert(full);
  if (res.error && /media_urls/.test(res.error.message)) res = await supabase.from(table).insert({ ...row, image_url: urls[0] ?? null });
  if (res.error) throw res.error;
}

async function compressIfImage(file: Blob & { name?: string }): Promise<Blob & { name?: string }> {
  if (!file.type?.startsWith("image/") || file.type === "image/gif" || file.size <= 800 * 1024) return file;
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const out = await imageCompression(file as File, { maxSizeMB: 0.78, maxWidthOrHeight: 1920, useWebWorker: true });
    return Object.assign(out, { name: file.name });
  } catch {
    return file;
  }
}

/** Upload with real progress (0-100) via the storage REST endpoint. */
export async function uploadFile(
  input: Blob & { name?: string },
  bucket: string,
  folder: string,
  extOverride?: string,
  onProgress?: (pct: number) => void,
) {
  checkSize(input, 100);
  onProgress?.(0);
  const file = await compressIfImage(input);
  const ext = extOverride || file.name?.split(".").pop() || "bin";
  const base = (file.name || "file").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "file";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}.${ext}`;
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token || supabaseKey;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(100); resolve(); }
      else { let m = "Upload failed"; try { m = JSON.parse(xhr.responseText).message || m; } catch { /* */ } reject(new Error(m)); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function uploadImage(file: File, folder: string, bucket = "posts", onProgress?: (p: number) => void) {
  return uploadFile(file, bucket, folder, undefined, onProgress);
}

export async function fetchProfiles(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {} as Record<string, Profile>;
  const { data } = await supabase.from("profiles").select("*").in("id", unique);
  const map: Record<string, Profile> = {};
  (data ?? []).forEach((p: Profile) => (map[p.id] = p));
  return map;
}

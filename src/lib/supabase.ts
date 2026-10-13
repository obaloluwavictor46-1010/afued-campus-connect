import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ciwljsccbheykclimmhq.supabase.co";
const supabaseKey = "sb_publishable_IhHGFJLuGGicCOYCKYLHqg_rKUwLNRH";

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
  faculty_channel: string | null;
  created_at: string;
};

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

export async function uploadFile(input: Blob & { name?: string }, bucket: string, folder: string, extOverride?: string) {
  const file = await compressIfImage(input);
  const ext = extOverride || file.name?.split(".").pop() || "bin";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function uploadImage(file: File, folder: string, bucket = "posts") {
  return uploadFile(file, bucket, folder);
}

export async function fetchProfiles(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {} as Record<string, Profile>;
  const { data } = await supabase.from("profiles").select("*").in("id", unique);
  const map: Record<string, Profile> = {};
  (data ?? []).forEach((p: Profile) => (map[p.id] = p));
  return map;
}

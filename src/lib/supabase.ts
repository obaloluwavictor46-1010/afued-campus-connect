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
};

export type Post = {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  faculty_channel: string | null;
  created_at: string;
};

export async function uploadImage(file: File, folder: string) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("posts").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;
}

export async function fetchProfiles(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {} as Record<string, Profile>;
  const { data } = await supabase.from("profiles").select("*").in("id", unique);
  const map: Record<string, Profile> = {};
  (data ?? []).forEach((p: Profile) => (map[p.id] = p));
  return map;
}

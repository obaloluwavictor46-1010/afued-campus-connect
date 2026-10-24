// src/lib/bunnyStorage.ts
// Bunny STORAGE - Direct MP4, No Cooking, No Delay.

const ZONE = import.meta.env.VITE_BUNNY_STORAGE_ZONE || "afued-storage";
const KEY = import.meta.env.VITE_BUNNY_STORAGE_KEY || "";
const PULL = (import.meta.env.VITE_BUNNY_PULL_ZONE || "https://afued-storage.b-cdn.net").replace(/\/$/, "");

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase() || "file";
}

export async function uploadToBunnyStorage(file: File, folder: "videos" | "images" | "music" = "videos") {
  if (!KEY) throw new Error("Bunny Key never set - check .env VITE_BUNNY_STORAGE_KEY");
  const fileName = `${folder}/${Date.now()}-${cleanName(file.name)}`;

  const res = await fetch(`https://storage.bunnycdn.com/${ZONE}/${fileName}`, {
    method: "PUT",
    headers: {
      AccessKey: KEY,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!res.ok) throw new Error(`Upload fail: ${res.status}`);
  return `${PULL}/${fileName}`;
                                           }

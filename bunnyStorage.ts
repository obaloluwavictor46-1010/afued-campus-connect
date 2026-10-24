// src/lib/bunnyStorage.ts
// Bunny STORAGE - Direct MP4, No Cooking, No Delay.

const ZONE = import.meta.env.VITE_BUNNY_STORAGE_ZONE || "afued-storage";
const KEY = import.meta.env.VITE_BUNNY_STORAGE_KEY || "";
const PULL = (import.meta.env.VITE_BUNNY_PULL_ZONE || "https://afued-storage.b-cdn.net").replace(/\/$/, "");

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase() || "file";
}

export async function uploadToBunnyStorage(file: File, folder: "videos" | "images" | "music" = "videos", onProgress?: (p: number) => void) {
  if (!KEY) throw new Error("Bunny Key never set - check .env VITE_BUNNY_STORAGE_KEY");
  const fileName = `${folder}/${Date.now()}-${cleanName(file.name)}`;

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `https://storage.bunnycdn.com/${ZONE}/${fileName}`);
    xhr.setRequestHeader("AccessKey", KEY);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(`${PULL}/${fileName}`);
      else reject(new Error(`Upload fail: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload fail: network"));
    xhr.send(file);
  });
      }

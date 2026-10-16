// Bunny CDN storage client (upload/delete/list via the Storage REST API).
const ENDPOINT = (import.meta.env["VITE_BUNNY_ENDPOINT"] || "https://storage.bunnycdn.com/afued-storage").replace(/\/+$/, "");
const PUBLIC_URL = (import.meta.env["VITE_BUNNY_PUBLIC_URL"] || "https://afued-storage.b-cdn.net").replace(/\/+$/, "");
const ACCESS_KEY = import.meta.env["VITE_BUNNY_ACCESS_KEY"] || "";

export const bunnyPublicUrl = (path: string) => `${PUBLIC_URL}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Upload a file with real progress (0-100); returns the public URL. */
export function bunnyUpload(path: string, file: Blob, onProgress?: (pct: number) => void): Promise<string> {
  onProgress?.(0);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${ENDPOINT}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("AccessKey", ACCESS_KEY);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(100); resolve(bunnyPublicUrl(path)); }
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

/** Delete a file by path or public URL. Best-effort helper for cleanup. */
export async function bunnyDelete(pathOrUrl: string) {
  const path = pathOrUrl.startsWith("http")
    ? pathOrUrl.replace(`${PUBLIC_URL}/`, "").replace(`${ENDPOINT}/`, "")
    : pathOrUrl;
  const res = await fetch(`${ENDPOINT}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "DELETE",
    headers: { AccessKey: ACCESS_KEY },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
}

export type BunnyItem = { ObjectName: string; Length: number; IsDirectory: boolean; LastChanged: string };

/** List files inside a folder path (e.g. "posts/user-id"). */
export async function bunnyList(prefix: string): Promise<BunnyItem[]> {
  const res = await fetch(`${ENDPOINT}/${prefix.replace(/\/+$/, "")}/`, { headers: { AccessKey: ACCESS_KEY } });
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return (await res.json()) as BunnyItem[];
}

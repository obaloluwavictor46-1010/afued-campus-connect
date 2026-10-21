const BUNNY_ENDPOINT = import.meta.env.VITE_BUNNY_ENDPOINT;
const BUNNY_PUBLIC_URL = import.meta.env.VITE_BUNNY_PUBLIC_URL;
const BUNNY_ACCESS_KEY = import.meta.env.VITE_BUNNY_ACCESS_KEY;

const STREAM_LIB_ID = import.meta.env.VITE_BUNNY_STREAM_LIBRARY_ID;
const STREAM_API_KEY = import.meta.env.VITE_BUNNY_STREAM_API_KEY;

type ProgressCb = (percent: number) => void;

// --- MAIN FUNCTION - Your app dey call this one ---
// If na video, e go use STREAM (fast + compress inside $20)
// If na pics/voice/file, e go use STORAGE (afued-storage)
export const uploadToBunny = async (
  file: File, 
  folder: string = "videos",
  onProgress?: ProgressCb
): Promise<string> => {
  if (!file) throw new Error("No file selected");

  const MAX_SIZE = 500 * 1024 * 1024;
  if (file.size > MAX_SIZE) throw new Error("Video too big (max 500MB)");

  // VIDEO = Go STREAM (This na the new fast way)
  if (folder === "videos" || file.type.startsWith("video/")) {
    // 1. Create video entry for Bunny (1 sec)
    const createRes = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos`, {
      method: 'POST',
      headers: { 'AccessKey': STREAM_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: file.name })
    });
    if (!createRes.ok) throw new Error("Failed to create video entry");
    const { guid: videoId } = await createRes.json();

    // 2. Upload direct to Bunny Stream (with progress like WhatsApp)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos/${videoId}`);
      xhr.setRequestHeader('AccessKey', STREAM_API_KEY);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status === 200 || xhr.status === 201) ? resolve() : reject(new Error(xhr.statusText));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    });

    // Return embed link wey you fit put for <iframe> or save for DB
    return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${videoId}`;
  }

  // PICS / VOICE / FILES = Go Storage (afued-storage) - your old way still dey
  const fileName = `${folder}/${Date.now()}-${file.name.replace(/\s/g, "_")}`;
  const url = `${BUNNY_ENDPOINT}/${fileName}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "AccessKey": BUNNY_ACCESS_KEY,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bunny upload failed: ${response.status} - ${text}`);
  }

  return `${BUNNY_PUBLIC_URL}/${fileName}`;
};

// Extra helpers for video play
export const getBunnyStreamPlayUrl = (videoIdOrEmbedUrl: string) => {
  if (videoIdOrEmbedUrl.includes('iframe.mediadelivery.net')) return videoIdOrEmbedUrl;
  return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${videoIdOrEmbedUrl}`;
};

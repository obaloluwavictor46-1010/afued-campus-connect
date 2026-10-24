// FINAL BUNNY.TS - AFUED - TIKTOK STYLE
// ALL videos -> Bunny Stream (server compress + HLS). NO browser compress, NO burning, NO Processing block.
// Images / Music -> Bunny Storage. Phone only uploads + plays.

const BUNNY_ENDPOINT = import.meta.env.VITE_BUNNY_ENDPOINT;
const BUNNY_PUBLIC_URL = import.meta.env.VITE_BUNNY_PUBLIC_URL;
const BUNNY_ACCESS_KEY = import.meta.env.VITE_BUNNY_ACCESS_KEY;

const STREAM_LIB_ID = import.meta.env.VITE_BUNNY_STREAM_LIBRARY_ID;
const STREAM_API_KEY = import.meta.env.VITE_BUNNY_STREAM_API_KEY;

type ProgressCb = (percent: number) => void;

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("video/")) return resolve(0);
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

// Poster - try 0.5s, fail fast, no hang. If fail, PostCard go show Tap To Play, no black.
export async function generateVideoPoster(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    let done = false;
    const finish = (val: string) => { if (!done) { done = true; URL.revokeObjectURL(url); resolve(val); } };
    v.onloadeddata = () => { try { v.currentTime = 0.5; } catch { finish(""); } };
    v.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth || 720;
        canvas.height = v.videoHeight || 1280;
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.drawImage(v, 0, 0, canvas.width, canvas.height); finish(canvas.toDataURL("image/jpeg", 0.7)); }
        else finish("");
      } catch { finish(""); }
    };
    v.onerror = () => finish("");
    setTimeout(() => finish(""), 1500);
    v.src = url;
  });
}

// Bunny Stream poster - real thumbnail from Bunny, no browser work
export function getBunnyStreamPosterUrl(embedUrl: string): string {
  const id = getBunnyVideoId(embedUrl);
  if (!id || !STREAM_LIB_ID) return "";
  return `https://vz-${STREAM_LIB_ID}.b-cdn.net/${id}/thumbnail.jpg`;
}

export function getBunnyVideoId(embedUrl: string): string {
  if (!embedUrl) return "";
  const parts = embedUrl.split("/");
  return parts[parts.length - 1]?.split("?")[0] || "";
}

// HLS playlist - this na wetin make video play piece-by-piece like TikTok, no need download full 30MB
export function getBunnyStreamHlsUrl(embedUrl: string): string {
  const id = getBunnyVideoId(embedUrl);
  if (!id || !STREAM_LIB_ID) return embedUrl;
  return `https://vz-${STREAM_LIB_ID}.b-cdn.net/${id}/playlist.m3u8`;
}

export function isBunnyStreamUrl(url: string): boolean {
  return !!url && (url.includes("iframe.mediadelivery.net") || url.includes("mediadelivery.net") || url.includes("b-cdn.net"));
}

export async function checkBunnyStreamReady(embedUrl: string): Promise<boolean> {
  try {
    const videoId = getBunnyVideoId(embedUrl);
    if (!videoId || !STREAM_LIB_ID || !STREAM_API_KEY) return true;
    const res = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos/${videoId}`, {
      headers: { AccessKey: STREAM_API_KEY },
    });
    if (!res.ok) return true;
    const data = await res.json();
    // 0=Created, 1=Uploaded, 2=Processing, 3=Transcoding, 4=Finished
    return (data.status ?? 4) >= 4;
  } catch { return true; }
}

export const getBunnyStreamPlayUrl = (idOrUrl: string) => {
  if (!idOrUrl) return "";
  if (idOrUrl.includes('iframe.mediadelivery.net')) return idOrUrl;
  if (idOrUrl.includes('playlist.m3u8') || idOrUrl.includes('b-cdn.net')) return idOrUrl;
  return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${idOrUrl}`;
};

// ===== DOWNLOAD - NO BURN, NO RE-RECORD. Just download original file fast. =====
export async function downloadAFUEDVideoSimple(videoUrl: string, authorName: string): Promise<void> {
  try {
    // For Stream videos, download the MP4 directly from Bunny
    let downloadUrl = videoUrl;
    if (videoUrl.includes("iframe.mediadelivery.net")) {
      const id = getBunnyVideoId(videoUrl);
      downloadUrl = `https://vz-${STREAM_LIB_ID}.b-cdn.net/${id}/play_720p.mp4`;
    }
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error("fetch fail");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AFUED-${authorName}-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.open(videoUrl, "_blank");
  }
}
export const downloadAFUEDVideo = downloadAFUEDVideoSimple;
export const downloadVideoWithAFUEDWatermark = downloadAFUEDVideoSimple;

// ===== MAIN UPLOAD - NO COMPRESS =====
export const uploadToBunny = async (
  file: File,
  folder: string = "videos",
  onProgress?: ProgressCb
): Promise<string> => {
  if (!file) throw new Error("No file selected");

  const isVideoFile = folder === "videos" || file.type.startsWith("video/");

  if (isVideoFile) {
    const duration = await getVideoDuration(file);
    if (duration > 180) throw new Error(`Video too long! Max 3 mins. Yours na ${Math.round(duration)}s`);

    // ALL VIDEOS -> Bunny Stream, even 5s video. No split, no compress.
    if (!STREAM_LIB_ID || !STREAM_API_KEY) throw new Error("Stream keys missing - add VITE_BUNNY_STREAM_LIBRARY_ID & VITE_BUNNY_STREAM_API_KEY to Vercel");

    if (onProgress) onProgress(5);

    const createRes = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos`, {
      method: 'POST',
      headers: { 'AccessKey': STREAM_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: file.name || `AFUED-${Date.now()}` })
    });
    if (!createRes.ok) throw new Error("Stream create fail: " + await createRes.text());
    const { guid: videoId } = await createRes.json();

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos/${videoId}`);
      xhr.setRequestHeader('AccessKey', STREAM_API_KEY);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round(5 + (e.loaded / e.total) * 95));
      };
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) resolve();
        else reject(new Error(`Upload fail ${xhr.status}: ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error('Network fail'));
      xhr.send(file);
    });

    return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${videoId}`;
  }

  // Images / Audio / Music -> Bunny Storage (fast, no processing)
  if (!BUNNY_ENDPOINT || !BUNNY_ACCESS_KEY || !BUNNY_PUBLIC_URL) throw new Error("Storage keys missing");
  const rawName = file.name && file.name.includes(".") ? file.name : `file-${Date.now()}`;
  const safeName = rawName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileName = `${folder}/${Date.now()}-${safeName}`;
  const url = `${BUNNY_ENDPOINT}/${fileName}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('AccessKey', BUNNY_ACCESS_KEY);
    xhr.setRequestHeader('Content-Type', file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(`${BUNNY_PUBLIC_URL}/${fileName}`);
      else reject(new Error(`Storage fail ${xhr.status}: ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error('Storage network fail'));
    xhr.send(file);
  });
};

// ===== VOICE - CLEAR LIKE FACEBOOK MESSENGER =====
export const startBoldVoiceRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 44100, channelCount: 1 }
  });
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
  const source = audioCtx.createMediaStreamSource(stream);
  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(dest);
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const rec = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 128000 });
  return { stream, audioCtx, rec };
};

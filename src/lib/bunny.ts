// FINAL BUNNY.TS - AFUED - 0-45s INSTANT, 50s+ STREAM, 3 MINS MAX
// Copy everything comot old one, paste this

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
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration || 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    v.src = url;
  });
}

// This na the main function wey your app dey call
export const uploadToBunny = async (
  file: File,
  folder: string = "videos",
  onProgress?: ProgressCb
): Promise<string> => {
  if (!file) throw new Error("No file selected");

  const isVideoFile = folder === "videos" || file.type.startsWith("video/");
  const duration = isVideoFile ? await getVideoDuration(file) : 0;

  // Max 3 mins = 180 sec for all videos
  if (isVideoFile && duration > 180) {
    throw new Error(`Video too long! Max 3 mins. Yours na ${Math.round(duration)}s`);
  }

  // --- NEW LOGIC LIKE FACEBOOK ---
  // 0-45 sec = INSTANT STORAGE (No Processing!)
  const isShortVideo = isVideoFile && duration <= 45;

  if (isShortVideo) {
    if (!BUNNY_ENDPOINT || !BUNNY_ACCESS_KEY || !BUNNY_PUBLIC_URL) {
      throw new Error("Storage keys missing - add VITE_BUNNY_ENDPOINT, PUBLIC_URL, ACCESS_KEY to Vercel");
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${folder}/${Date.now()}-${safeName}`;
    const url = `${BUNNY_ENDPOINT}/${fileName}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('AccessKey', BUNNY_ACCESS_KEY);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(`${BUNNY_PUBLIC_URL}/${fileName}`);
        } else {
          reject(new Error(`Storage fail ${xhr.status}: ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Storage network fail'));
      xhr.send(file);
    });
  }

  // 50 sec+ = STREAM (With Processing to save money)
  if (isVideoFile) {
    if (!STREAM_LIB_ID || !STREAM_API_KEY) {
      throw new Error("Stream keys missing - add VITE_BUNNY_STREAM_LIBRARY_ID & VITE_BUNNY_STREAM_API_KEY to Vercel");
    }

    // Create video for Stream
    const createRes = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos`, {
      method: 'POST',
      headers: { 
        'AccessKey': STREAM_API_KEY, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ title: file.name })
    });

    if (!createRes.ok) {
      const t = await createRes.text();
      throw new Error("Stream create fail: " + t);
    }
    
    const { guid: videoId } = await createRes.json();

    // Upload original file - Bunny go handle compress
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos/${videoId}`);
      xhr.setRequestHeader('AccessKey', STREAM_API_KEY);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) resolve();
        else reject(new Error(`Upload fail ${xhr.status}: ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error('Network fail'));
      xhr.send(file);
    });

    // Return embed - YOU MUST USE <iframe> for this, not <video>!
    return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${videoId}`;
  }

  // VOICE / PICTURE / CAR / DOC = Go STORAGE (no compress)
  if (!BUNNY_ENDPOINT || !BUNNY_ACCESS_KEY || !BUNNY_PUBLIC_URL) {
    throw new Error("Storage keys missing - add VITE_BUNNY_ENDPOINT, PUBLIC_URL, ACCESS_KEY to Vercel");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileName = `${folder}/${Date.now()}-${safeName}`;
  const url = `${BUNNY_ENDPOINT}/${fileName}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('AccessKey', BUNNY_ACCESS_KEY);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(`${BUNNY_PUBLIC_URL}/${fileName}`);
      } else {
        reject(new Error(`Storage fail ${xhr.status}: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Storage network fail'));
    xhr.send(file);
  });
};

// Helper to get play URL
export const getBunnyStreamPlayUrl = (idOrUrl: string) => {
  if (idOrUrl.includes('iframe.mediadelivery.net')) return idOrUrl;
  return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${idOrUrl}`;
};

// BOLD VOICE - No radio sound
export const startBoldVoiceRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1
    }
  });

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
  const source = audioCtx.createMediaStreamSource(stream);
  const gain = audioCtx.createGain();
  gain.gain.value = 2.5; // bold like WhatsApp
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(dest);

  const rec = new MediaRecorder(dest.stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000
  });

  return { stream, audioCtx, rec };
};

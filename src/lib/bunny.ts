// FINAL BUNNY.TS - AFUED - 3 MINS VIDEO + BOLD VOICE
// Copy everything comot old one, paste this

const BUNNY_ENDPOINT = import.meta.env.VITE_BUNNY_ENDPOINT;
const BUNNY_PUBLIC_URL = import.meta.env.VITE_BUNNY_PUBLIC_URL;
const BUNNY_ACCESS_KEY = import.meta.env.VITE_BUNNY_ACCESS_KEY;

const STREAM_LIB_ID = import.meta.env.VITE_BUNNY_STREAM_LIBRARY_ID;
const STREAM_API_KEY = import.meta.env.VITE_BUNNY_STREAM_API_KEY;

type ProgressCb = (percent: number) => void;

// This na the main function wey your app dey call
export const uploadToBunny = async (
  file: File,
  folder: string = "videos",
  onProgress?: ProgressCb
): Promise<string> => {
  if (!file) throw new Error("No file selected");

  if (!BUNNY_ENDPOINT || !BUNNY_ACCESS_KEY || !STREAM_LIB_ID || !STREAM_API_KEY) {
    throw new Error("Bunny keys missing for .env - check Vercel settings");
  }

  // 1. VIDEO = Go STREAM (Bunny go compress to small size automatically - GOOD)
  if (folder === "videos" || file.type.startsWith("video/")) {
    
    // Check 3 mins = 180 sec for channel/group
    const duration = await new Promise<number>((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(v.src);
        resolve(v.duration);
      };
      v.onerror = () => resolve(0);
      v.src = URL.createObjectURL(file);
    });

    if (duration > 180) {
      throw new Error(`Video too long! Max 3 mins. Yours na ${Math.round(duration)}s`);
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

    // Upload original file - NO CANVAS, Bunny go handle compress
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

  // 2. VOICE / PICTURE / CAR / DOC = Go STORAGE (no compress)
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

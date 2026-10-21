// FINAL FIXED BUNNY.TS - AFUED - 785939 - Bold Voice + Video 3 mins + Picture/Car/Doc
const BUNNY_ENDPOINT = import.meta.env.VITE_BUNNY_ENDPOINT || "https://storage.bunnycdn.com/afued-storage";
const BUNNY_PUBLIC_URL = import.meta.env.VITE_BUNNY_PUBLIC_URL || "https://afued-storage.b-cdn.net";
const BUNNY_ACCESS_KEY = import.meta.env.VITE_BUNNY_ACCESS_KEY || "280c4a91-f06b-47f9-af72727adc9c-ecc7-400c";

const STREAM_LIB_ID = import.meta.env.VITE_BUNNY_STREAM_LIBRARY_ID || "785939";
const STREAM_API_KEY = import.meta.env.VITE_BUNNY_STREAM_API_KEY || "1b0d3648-0e1c-499f-9d4896653811-cb9f-45a0";

type ProgressCb = (percent: number) => void;

// MAIN FUNCTION - Your app dey call this one for channel/group
// video => STREAM (fast, Bunny go compress after, play with iframe)
// pics/voice/car/doc => STORAGE (afued-storage)
export const uploadToBunny = async (
  file: File,
  folder: string = "videos",
  onProgress?: ProgressCb
): Promise<string> => {
  if (!file) throw new Error("No file selected");

  const MAX_SIZE = 500 * 1024 * 1024;
  if (file.size > MAX_SIZE) throw new Error("File too big (max 500MB)");

  // VIDEO = Go STREAM - Fast like WhatsApp
  if (folder === "videos" || file.type.startsWith("video/")) {
    // Check 3 mins for channel/group
    const checkDuration = await new Promise<number>((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(v.src);
        resolve(v.duration);
      };
      v.onerror = () => resolve(0);
      v.src = URL.createObjectURL(file);
    });

    if (checkDuration > 180) {
      throw new Error(`Video too long! Max 3 mins for group/channel. Yours na ${Math.round(checkDuration)} sec`);
    }

    // 1. Create video entry for Bunny
    const createRes = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos`, {
      method: 'POST',
      headers: { 'AccessKey': STREAM_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: file.name })
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      throw new Error("Failed to create video entry - Check Stream API Key: " + t);
    }
    const { guid: videoId } = await createRes.json();

    // 2. Upload direct original (no canvas compress) - Bunny go transcode
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `https://video.bunnycdn.com/library/${STREAM_LIB_ID}/videos/${videoId}`);
      xhr.setRequestHeader('AccessKey', STREAM_API_KEY);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status === 200 || xhr.status === 201) ? resolve() : reject(new Error("Video upload fail " + xhr.status + " " + xhr.responseText));
      xhr.onerror = () => reject(new Error('Video upload network failed'));
      xhr.send(file);
    });

    // Return embed link - MUST use <iframe> to play, not <video>!
    return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${videoId}`;
  }

  // VOICE / PICS / CAR / DOC = Go Storage - With progress + Bold Voice support
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileName = `${folder}/${Date.now()}-${safeName}`;
  const url = `${BUNNY_ENDPOINT}/${fileName}`;

  // Use XHR for progress for all (voice bold go upload fast)
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
        reject(new Error(`Storage upload failed: ${xhr.status} - ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Storage upload network failed'));
    xhr.send(file);
  });
};

// Helpers
export const getBunnyStreamPlayUrl = (videoIdOrEmbedUrl: string) => {
  if (videoIdOrEmbedUrl.includes('iframe.mediadelivery.net')) return videoIdOrEmbedUrl;
  return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${videoIdOrEmbedUrl}`;
};

// BOLD VOICE RECORDER - No radio sound - Use this for your voice button
export const startBoldVoiceRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false, // Bold, no cut
      noiseSuppression: false, // No radio sound
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1
    }
  });

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
  const source = audioCtx.createMediaStreamSource(stream);
  const gain = audioCtx.createGain();
  gain.gain.value = 2.5; // 2.5x loud like WhatsApp bold
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(gain); gain.connect(dest);

  const rec = new MediaRecorder(dest.stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000 // 128k bold, not 32k radio
  });

  return { stream, audioCtx, rec };
};

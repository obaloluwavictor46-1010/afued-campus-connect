// FINAL BUNNY.TS - AFUED - 0-45s INSTANT + WhatsApp FAST COMPRESS + 3 MINS MAX
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

// WHATSAPP FAST COMPRESS - 120MB -> 8MB for phone before upload
async function compressVideoIfNeeded(file: File, onProgress?: ProgressCb): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  if (file.size < 12 * 1024 * 1024) return file; // small already

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    let revoked = false;
    const cleanup = () => {
      if (!revoked) {
        URL.revokeObjectURL(video.src);
        revoked = true;
      }
    };

    video.onloadedmetadata = () => {
      const MAX_W = 720; // TikTok/WhatsApp size
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > MAX_W) {
        h = Math.round((h * MAX_W) / w);
        w = MAX_W;
      }
      if (h > 1280) {
        w = Math.round((w * 1280) / h);
        h = 1280;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const canvasStream = canvas.captureStream(30);

      try {
        const vStream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.();
        if (vStream) {
          vStream.getAudioTracks().forEach((t: MediaStreamTrack) => canvasStream.addTrack(t));
        }
      } catch {}

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(canvasStream, {
        mimeType: mime,
        videoBitsPerSecond: 1_200_000, // 1.2Mbps like WhatsApp
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        cleanup();
        if (chunks.length === 0) {
          resolve(file);
          return;
        }
        const blob = new Blob(chunks, { type: mime });
        if (blob.size >= file.size) resolve(file);
        else resolve(new File([blob], file.name.replace(/\.\w+$/, ".webm"), { type: mime }));
      };

      video.onended = () => { if (recorder.state === "recording") recorder.stop(); };

      video.play().then(() => {
        recorder.start(200);
        if (onProgress) onProgress(3);
        const draw = () => {
          if (video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, w, h);
          requestAnimationFrame(draw);
        };
        draw();
      }).catch(() => {
        cleanup();
        resolve(file);
      });

      setTimeout(() => {
        if (recorder.state === "recording") {
          video.pause();
          recorder.stop();
        }
      }, (video.duration + 3) * 1000);
    };

    video.onerror = () => {
      cleanup();
      resolve(file);
    };

    setTimeout(() => {
      if (video.readyState === 0) {
        cleanup();
        resolve(file);
      }
    }, 3000);
  });
}

// This na the main function wey your app dey call
export const uploadToBunny = async (
  file: File,
  folder: string = "videos",
  onProgress?: ProgressCb
): Promise<string> => {
  if (!file) throw new Error("No file selected");

  // 1. WHATSAPP COMPRESS FIRST - Make upload fast for Ibadan network!
  if (file.type.startsWith("video/") && file.size > 10 * 1024 * 1024) {
    if (onProgress) onProgress(1);
    file = await compressVideoIfNeeded(file, onProgress);
  }

  const isVideoFile = folder === "videos" || file.type.startsWith("video/");
  const duration = isVideoFile ? await getVideoDuration(file) : 0;

  // Max 3 mins = 180 sec for all videos
  if (isVideoFile && duration > 180) {
    throw new Error(`Video too long! Max 3 mins. Yours na ${Math.round(duration)}s`);
  }

  // 0-45 sec = INSTANT STORAGE (No Processing!) - FAST LIKE FACEBOOK
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

    return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${videoId}`;
  }

  // VOICE / PICTURE / CAR / DOC = Go STORAGE
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

export const getBunnyStreamPlayUrl = (idOrUrl: string) => {
  if (idOrUrl.includes('iframe.mediadelivery.net')) return idOrUrl;
  return `https://iframe.mediadelivery.net/embed/${STREAM_LIB_ID}/${idOrUrl}`;
};

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
  gain.gain.value = 2.5;
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(dest);

  const rec = new MediaRecorder(dest.stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000
  });

  return { stream, audioCtx, rec };
};

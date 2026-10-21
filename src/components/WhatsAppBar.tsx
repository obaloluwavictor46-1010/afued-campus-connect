import { useState, useRef, useEffect } from "react";
import { Smile, Paperclip, Camera, Mic, Send, Trash2 } from "lucide-react";
import { startBoldVoiceRecording, uploadToBunny } from "@/lib/bunny";

export function WhatsAppBar({ onSendText, onSendVoice, onSendFile }: {
  onSendText: (text: string) => void;
  onSendVoice: (url: string) => void;
  onSendFile: (file: File) => void;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [time, setTime] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(25).fill(8));
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<any>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const startRec = async () => {
    try {
      const { stream, audioCtx, rec } = await startBoldVoiceRecording();
      streamRef.current = stream;
      ctxRef.current = audioCtx;
      recRef.current = rec;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const src = audioCtx.createMediaStreamSource(stream);
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevels(prev => [...prev.slice(1), Math.max(8, avg * 1.2)]);
        if (recRef.current?.state === "recording") requestAnimationFrame(tick);
      };
      tick();

      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
        if (blob.size > 1000) {
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
          const url = await uploadToBunny(file, "voice");
          onSendVoice(url);
        }
        cleanup();
      };

      rec.start(100);
      setRecording(true);
      setTime(0);
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } catch {
      alert("Allow microphone for AFUED voice note");
    }
  };

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    setRecording(false);
    setTime(0);
    setLevels(Array(25).fill(8));
  };

  const stopRec = () => recRef.current?.stop();
  const cancelRec = () => {
    recRef.current?.stop();
    // discard
    recRef.current = null;
    setTimeout(cleanup, 100);
  };

  useEffect(() => () => cleanup(), []);

  if (recording) {
    // WhatsApp recording UI - like when you hold mic
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 bg-[#202c33] px-4 py-3">
        <button onClick={cancelRec} className="rounded-full bg-red-500 p-3"><Trash2 className="h-5 w-5 text-white" /></button>
        <div className="flex flex-1 items-center gap-[2px]">
          {levels.map((l, i) => <div key={i} className="w-[3px] rounded-full bg-[#00a884]" style={{ height: `${l}%`, minHeight: '6px' }} />)}
        </div>
        <span className="font-mono text-sm text-white">{Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}</span>
        <div className="ml-2 flex items-center gap-2">
          <span className="text-xs text-white/70">Slide to cancel</span>
          <button onClick={stopRec} className="rounded-full bg-[#00a884] p-3"><Send className="h-5 w-5 text-white" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-end gap-2 bg-[#111b21] px-2 py-2">
      {/* Message box - like your screenshot */}
      <div className="flex flex-1 items-end gap-2 rounded-full bg-[#202c33] px-3 py-1.5">
        <button className="p-2 text-[#8696a0]"><Smile className="h-6 w-6" /></button>
        
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Message"
          className="flex-1 bg-transparent py-2 text-[15px] text-white placeholder:text-[#8696a0] outline-none"
        />
        
        <button onClick={() => fileInputRef.current?.click()} className="p-2 text-[#8696a0]"><Paperclip className="h-5 w-5 rotate-45" /></button>
        <button onClick={() => cameraInputRef.current?.click()} className="p-2 text-[#8696a0]"><Camera className="h-5 w-5" /></button>
      </div>

      {/* Mic / Send button - EXACT like your screenshot green */}
      {text.trim() ? (
        <button onClick={() => { onSendText(text.trim()); setText(""); }} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg active:scale-95">
          <Send className="h-5 w-5" />
        </button>
      ) : (
        <button
          onTouchStart={startRec}
          onMouseDown={startRec}
          onTouchEnd={stopRec}
          onMouseUp={stopRec}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg active:scale-95 select-none"
        >
          <Mic className="h-6 w-6 fill-white" />
        </button>
      )}

      <input ref={fileInputRef} type="file" hidden onChange={e => { if (e.target.files?.[0]) onSendFile(e.target.files[0]); }} />
      <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" hidden onChange={e => { if (e.target.files?.[0]) onSendFile(e.target.files[0]); }} />
    </div>
  );
                                                      }

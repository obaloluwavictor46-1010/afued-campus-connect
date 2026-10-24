import { useEffect, useMemo, useRef, useState } from "react"
import { Download, FileText, Play, Plus, X } from "lucide-react"
import { toast } from "sonner"

// --- FIX: All missing exports defined here ---
export const MAX_IMAGES = 4
export const MAX_MEDIA = 15

export function checkSize(f: File, maxVideoMB = 500) {
  const max = f.type.startsWith("video/") ? maxVideoMB * 1024 * 1024 : 5 * 1024 * 1024
  if (f.size > max) throw new Error(f.type.startsWith("video/") ? `Video too big (max ${maxVideoMB}MB)` : "Image too big (max 5MB)")
}

export async function checkVideo(f: File) {
  return true
}

export function fileNameFromUrl(url: string) {
  try { return new URL(url).pathname.split("/").pop() || "file" } catch { return url.split("/").pop() || "file" }
}

export type MediaKind = "image" | "video" | "audio" | "file"
export function kindOfUrl(url: string): MediaKind {
  if (!url) return "file"
  // FIX: Remove ?token=... & #t=... before checking extension
  const clean = url.split("?")[0].split("#")[0].toLowerCase()
  if (clean.match(/\.(mp4|mov|webm|avi|mkv|m4v)$/)) return "video"
  if (clean.match(/\.(mp3|wav|m4a|ogg|aac)$/)) return "audio"
  if (clean.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/)) return "image"
  // FIX: Bunny Storage video wey no get extension but get /videos/ for path
  if (url.includes("/videos/")) return "video"
  if (url.includes("/music/")) return "audio"
  if (url.includes("/images/")) return "image"
  return "file"
}

export async function downloadUrl(url: string, name?: string) {
  const fname = name || fileNameFromUrl(url)
  try {
    const blob = await (await fetch(url)).blob()
    const u = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(u), 1000)
  } catch { window.open(url, "_blank") }
}

export function DownloadBtn({ url, name, className }: { url: string, name?: string, className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); downloadUrl(url, name) }} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${className}`}>
      <Download className="h-4 w-4" /> Save
    </button>
  )
}

// === VIDEO WEY SHOW FACE QUICK, NO MORE BLACK - Direct MP4 ===
function SmartVideo({ url, className }: { url: string, className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showPlay, setShowPlay] = useState(true)
  const [poster, setPoster] = useState<string | undefined>(undefined)

  const makePoster = () => {
    const v = videoRef.current
    if (!v) return
    const target = v.duration > 2 ? 0.8 : 0.1
    if (Math.abs(v.currentTime - target) > 0.1) {
      v.currentTime = target
      return
    }
    try {
      if (v.videoWidth > 0) {
        const c = document.createElement("canvas")
        c.width = v.videoWidth
        c.height = v.videoHeight
        const ctx = c.getContext("2d")
        if (ctx) {
          ctx.drawImage(v, 0, 0)
          const data = ctx.getImageData(0, 0, Math.min(20, c.width), Math.min(20, c.height)).data
          let bright = 0
          for (let i = 0; i < data.length; i += 4) bright += data[i] + data[i+1] + data[i+2]
          const avg = bright / (data.length / 4)
          if (avg < 12 && v.duration > 2 && v.currentTime < 1.4) {
            v.currentTime = 1.5
            return
          }
          setPoster(c.toDataURL("image/jpeg", 0.7))
        }
      }
    } catch {}
  }

  return (
    <div className="relative w-full bg-black rounded overflow-hidden">
      <video
        ref={videoRef}
        src={url.includes("#t=") ? url : `${url}#t=0.8`}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        muted
        className={`w-full rounded bg-black ${className || ""}`}
        style={{ maxHeight: 480, objectFit: "contain" }}
        onLoadedMetadata={makePoster}
        onSeeked={makePoster}
        onPlay={() => setShowPlay(false)}
        onPause={() => setShowPlay(true)}
        onClick={() => {
          const v = videoRef.current
          if (!v) return
          if (v.paused) { v.muted = false; v.play().catch(()=>{}) } else v.pause()
        }}
      />
      {showPlay && (
        <button
          type="button"
          onClick={() => { const v = videoRef.current; if (v) { v.muted = false; v.play().catch(()=>{}) } }}
          className="absolute inset-0 flex items-center justify-center bg-black/10"
          aria-label="Play video"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-white">
            <Play className="h-6 w-6 ml-1" />
          </span>
        </button>
      )}
    </div>
  )
}

// --- FIXED MediaView - Direct MP4 Only, No More Bunny Stream Iframe ---
export function MediaView({ url, kind, name, className }: { url: string, kind?: MediaKind, name?: string, className?: string }) {
  const k = (kind as MediaKind) || kindOfUrl(url)
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current
        if (video && !entry.isIntersecting) {
          video.pause()
        }
        if (k === "audio" && !entry.isIntersecting) {
          const audio = wrap.querySelector("audio")
          if (audio) (audio as HTMLAudioElement).pause()
        }
      },
      { threshold: 0, rootMargin: "0px 0px -50px 0px" }
    )

    observer.observe(wrap)
    return () => observer.disconnect()
  }, [k, url])

  if (k === "file") return <FileChip url={url} name={name} className={className} />
  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {k === "image" && <img src={url} alt={name || "media"} className="w-full h-auto rounded" loading="lazy" />}
      {k === "video" && <SmartVideo url={url} />}
      {k === "audio" && <audio src={url} controls preload="metadata" className="w-full" />}
      {k !== "audio" && <DownloadBtn url={url} name={name} className="absolute top-2 right-2 bg-black/60 text-white z-10" />}
    </div>
  )
}

export function MediaGallery({ urls, className }: { urls: string[], className?: string }) {
  const [i, setI] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  if (!urls.length) return null
  const files = urls.filter((u) => kindOfUrl(u) === "file")
  const visual = urls.filter((u) => kindOfUrl(u) !== "file")
  return (
    <div className={className}>
      {visual.length === 1 && <MediaView url={visual[0]} className="w-full" />}
      {visual.length > 1 && (
        <div className="relative">
          <div ref={ref} onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)) }} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
            {visual.map((u) => (<div key={u} className="w-full flex-shrink-0 snap-center"><MediaView url={u} className="w-full" /></div>))}
          </div>
          <span className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded">{i + 1}/{visual.length}</span>
          <div className="flex justify-center gap-1 mt-2">{visual.map((u, n) => <span key={u} className={`h-1.5 w-1.5 rounded-full ${n === i ? "bg-primary" : "bg-muted"}`} />)}</div>
        </div>
      )}
      {files.length > 0 && <div className="space-y-2 mt-2">{files.map((u) => <FileChip key={u} url={u} />)}</div>}
    </div>
  )
}

export function FileChip({ url, name, className }: { url: string, name?: string, className?: string }) {
  return (
    <div className={`flex items-center gap-3 rounded border p-2 ${className}`}>
      <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
      <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm underline">{name || fileNameFromUrl(url)}</a>
      <button type="button" onClick={() => downloadUrl(url, name)} className="flex items-center gap-1 text-xs"><Download className="h-4 w-4" /> Download</button>
    </div>
  )
}

export function UploadBar({ pct }: { pct: number | null }) {
  if (pct === null) return null
  return (<div className="mt-3"><div className="mb-1 text-xs font-semibold">{pct}%</div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div></div>)
}

function ThumbVideo({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const onMeta = () => { if (v.duration > 1) v.currentTime = 0.8 }
    v.addEventListener("loadedmetadata", onMeta)
    return () => v.removeEventListener("loadedmetadata", onMeta)
  }, [])
  return <video ref={ref} src={`${url}#t=0.8`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
}

function Thumb({ file, onRemove }: { file: File, onRemove?: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="relative aspect-square overflow-hidden rounded border">
      {file.type.startsWith("image/") ? <img src={url} alt={file.name} className="h-full w-full object-cover" /> : file.type.startsWith("video/") ? <ThumbVideo file={file} /> : <div className="flex h-full flex-col items-center justify-center p-2"><FileText className="h-6 w-6" /><span className="text-xs truncate">{file.name}</span></div>}
      {file.type.startsWith("video/") && <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">VID</span>}
      {onRemove && <button type="button" onClick={onRemove} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"><X className="h-3 w-3" /></button>}
    </div>
  )
}

export function useMediaPicker(maxVideoMB = 500) {
  const [files, setFiles] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const add = async (list: FileList | null) => {
    if (!list) return
    const ok: File[] = []
    for (const f of Array.from(list)) {
      try { checkSize(f, maxVideoMB); await checkVideo(f); ok.push(f) } catch (e) { toast.error((e as Error).message) }
    }
    setFiles((cur) => {
      const isImg = (f: File) => f.type.startsWith("image/")
      const imgRoom = Math.max(0, MAX_IMAGES - cur.filter(isImg).length)
      let imgs = 0
      const accepted = ok.filter((f) => { if (isImg(f)) { imgs++; return imgs <= imgRoom } return true })
      if (imgs > imgRoom) toast.error(`Maximum ${MAX_IMAGES} images`)
      const next = [...cur, ...accepted]
      if (next.length > MAX_MEDIA) toast.error(`Maximum ${MAX_MEDIA} files`)
      return next.slice(0, MAX_MEDIA)
    })
  }
  const open = () => inputRef.current?.click()
  const input = (<input ref={inputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = "" }} />)
  const grid = (disabled?: boolean) => files.length ? (<div className="mt-3"><div className="grid grid-cols-4 gap-2">{files.map((f, n) => <Thumb key={n + f.name} file={f} onRemove={() => setFiles((c) => c.filter((_, i) => i !== n))} />)}{!disabled && files.length < MAX_MEDIA && (<button type="button" onClick={open} className="flex aspect-square items-center justify-center rounded border border-dashed"><Plus className="h-6 w-6" /></button>)}</div><p className="mt-1 text-xs text-muted-foreground">{files.length}/{MAX_MEDIA} files</p></div>) : null
  const clear = () => setFiles([])
  return { files, setFiles, open, input, grid, clear }
    }

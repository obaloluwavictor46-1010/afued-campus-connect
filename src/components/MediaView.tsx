import { useEffect, useMemo, useRef, useState } from "react"
import { Download, FileText, Plus, X } from "lucide-react"
import { toast } from "sonner"

// --- FIX: All missing exports defined here ---
export const MAX_IMAGES = 4
export const MAX_MEDIA = 15

export function checkSize(f: File, maxVideoMB = 30) {
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
  if (url.match(/\.(mp4|mov|webm|avi)$/i)) return "video"
  if (url.match(/\.(mp3|wav|m4a|ogg)$/i)) return "audio"
  if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return "image"
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

export function MediaView({ url, kind, name, className }: { url: string, kind?: MediaKind, name?: string, className?: string }) {
  const k = (kind as MediaKind) || kindOfUrl(url)
  if (k === "file") return <FileChip url={url} name={name} className={className} />
  return (
    <div className={`relative ${className}`}>
      {k === "image" && <img src={url} alt={name || "media"} className="w-full h-auto rounded" />}
      {k === "video" && <video src={url} controls className="w-full rounded" />}
      {k === "audio" && <audio src={url} controls className="w-full" />}
      {k !== "audio" && <DownloadBtn url={url} name={name} className="absolute top-2 right-2 bg-black/60 text-white" />}
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

function Thumb({ file, onRemove }: { file: File, onRemove?: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="relative aspect-square overflow-hidden rounded border">
      {file.type.startsWith("image/") ? <img src={url} alt={file.name} className="h-full w-full object-cover" /> : file.type.startsWith("video/") ? <video src={url} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center p-2"><FileText className="h-6 w-6" /><span className="text-xs truncate">{file.name}</span></div>}
      {file.type.startsWith("video/") && <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">VID</span>}
      {onRemove && <button type="button" onClick={onRemove} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"><X className="h-3 w-3" /></button>}
    </div>
  )
}

export function useMediaPicker(maxVideoMB = 30) {
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
  return { files, setFiles, open, input, grid }
      }

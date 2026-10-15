import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { checkSize, fileNameFromUrl, kindOfUrl, MAX_MEDIA, MEDIA_ACCEPT, type MediaKind } from "@/lib/supabase";

export async function downloadUrl(url: string, name?: string) {
  const fname = name || fileNameFromUrl(url);
  try {
    const blob = await (await fetch(url)).blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  } catch { window.open(url, "_blank"); }
}

export function DownloadBtn({ url, name, className = "" }: { url: string; name?: string | undefined; className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); downloadUrl(url, name); }} aria-label="Download"
      className={`flex items-center gap-1 rounded-full bg-foreground/70 px-2.5 py-1.5 text-xs font-semibold text-background backdrop-blur ${className}`}>
      <Download className="h-4 w-4" /> Save
    </button>
  );
}

export function MediaView({ url, kind, name, className = "" }: { url: string; kind?: MediaKind | string | null; name?: string | null; className?: string }) {
  const k = (kind as MediaKind) || kindOfUrl(url);
  if (k === "file") return <FileChip url={url} name={name || fileNameFromUrl(url)} className={className} />;
  return (
    <div className={`relative ${className}`}>
      {k === "image" && <img src={url} alt="" loading="lazy" className="max-h-[520px] w-full bg-muted object-cover" />}
      {k === "video" && <video src={url} controls playsInline preload="metadata" className="max-h-[520px] w-full bg-foreground" />}
      {k === "audio" && <audio src={url} controls className="h-10 w-60 max-w-full" />}
      {k !== "audio" && <DownloadBtn url={url} name={name ?? undefined} className="absolute right-2 top-2" />}
    </div>
  );
}

/** Shows 1 item full width, or a swipeable carousel for many. */
export function MediaGallery({ urls, className = "" }: { urls: string[]; className?: string }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  if (!urls.length) return null;
  const files = urls.filter((u) => kindOfUrl(u) === "file");
  const visual = urls.filter((u) => kindOfUrl(u) !== "file");
  return (
    <div className={className}>
      {visual.length === 1 && <MediaView url={visual[0]!} />}
      {visual.length > 1 && (
        <div className="relative">
          <div ref={ref} onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
            {visual.map((u) => (
              <div key={u} className="w-full shrink-0 snap-center">
                <MediaView url={u} className="[&_img]:aspect-square [&_img]:max-h-none" />
              </div>
            ))}
          </div>
          <span className="absolute left-2 top-2 rounded-full bg-foreground/70 px-2 py-1 text-xs font-semibold text-background">{i + 1}/{visual.length}</span>
          <div className="flex justify-center gap-1 py-2">
            {visual.map((u, n) => <span key={u} className={`h-1.5 w-1.5 rounded-full ${n === i ? "bg-primary" : "bg-muted-foreground/30"}`} />)}
          </div>
        </div>
      )}
      {files.length > 0 && <div className="space-y-2 px-4 py-2">{files.map((u) => <FileChip key={u} url={u} name={fileNameFromUrl(u)} />)}</div>}
    </div>
  );
}

export function FileChip({ url, name, className = "" }: { url: string; name: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl bg-muted p-3 ${className}`}>
      <FileText className="h-8 w-8 shrink-0 text-primary" />
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-foreground underline">{name}</a>
      <button type="button" onClick={() => downloadUrl(url, name)} className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
        <Download className="h-4 w-4" /> Download
      </button>
    </div>
  );
}

export function UploadBar({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-semibold text-primary">{pct < 100 ? `Uploading ${pct}%...` : "Finishing..."}</div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Thumb({ file, onRemove }: { file: File; onRemove?: (() => void) | undefined }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
      {file.type.startsWith("image/") ? <img src={url} className="h-full w-full object-cover" alt="" />
        : file.type.startsWith("video/") ? <video src={url} muted playsInline className="h-full w-full bg-foreground object-cover" />
        : <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center"><FileText className="h-7 w-7 text-primary" /><span className="line-clamp-2 break-all text-[10px]">{file.name}</span></div>}
      {file.type.startsWith("video/") && <span className="absolute bottom-1 left-1 rounded bg-foreground/70 px-1 text-[10px] text-background">Video</span>}
      {onRemove && <button type="button" onClick={onRemove} className="absolute right-1 top-1 rounded-full bg-foreground/70 p-0.5 text-background" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

/** Pick up to 15 photos / videos / files with previews and remove. */
export function useMediaPicker(maxVideoMB = 50) {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      try { checkSize(f, maxVideoMB); ok.push(f); } catch (e) { toast.error((e as Error).message); }
    }
    setFiles((cur) => {
      const next = [...cur, ...ok];
      if (next.length > MAX_MEDIA) toast.error(`Maximum ${MAX_MEDIA} items at once`);
      return next.slice(0, MAX_MEDIA);
    });
  };
  const open = () => inputRef.current?.click();
  const input = (
    <input ref={inputRef} type="file" multiple hidden accept={MEDIA_ACCEPT}
      onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
  );
  const grid = (disabled?: boolean) => files.length > 0 && (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-2">
        {files.map((f, n) => <Thumb key={n + f.name} file={f} onRemove={disabled ? undefined : () => setFiles((c) => c.filter((_, j) => j !== n))} />)}
        {!disabled && files.length < MAX_MEDIA && (
          <button type="button" onClick={open} className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground"><Plus className="h-6 w-6" /></button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{files.length}/{MAX_MEDIA} selected</p>
    </div>
  );
  return { files, setFiles, open, input, grid, clear: () => setFiles([]) };
}

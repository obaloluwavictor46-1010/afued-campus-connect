import { Download, FileText } from "lucide-react";
import { fileNameFromUrl, kindOfUrl, type MediaKind } from "@/lib/supabase";

export function MediaView({ url, kind, name, className = "" }: { url: string; kind?: MediaKind | string | null; name?: string | null; className?: string }) {
  const k = (kind as MediaKind) || kindOfUrl(url);
  if (k === "image") return <img src={url} alt="" loading="lazy" className={`max-h-[520px] w-full bg-muted object-cover ${className}`} />;
  if (k === "video") return <video src={url} controls playsInline preload="metadata" className={`max-h-[520px] w-full bg-foreground ${className}`} />;
  if (k === "audio") return <audio src={url} controls className={`h-10 w-60 max-w-full ${className}`} />;
  return <FileChip url={url} name={name || fileNameFromUrl(url)} className={className} />;
}

export function FileChip({ url, name, className = "" }: { url: string; name: string; className?: string }) {
  const download = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 30000);
    } catch { window.open(url, "_blank"); }
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl bg-muted p-3 ${className}`}>
      <FileText className="h-8 w-8 shrink-0 text-primary" />
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-foreground underline">{name}</a>
      <button type="button" onClick={download} className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
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

export function LocalPreview({ file }: { file: File }) {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("image/")) return <img src={url} className="max-h-64 w-full rounded-xl object-cover" alt="" />;
  if (file.type.startsWith("video/")) return <video src={url} controls playsInline className="max-h-64 w-full rounded-xl bg-foreground" />;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
      <FileText className="h-8 w-8 text-primary" />
      <span className="truncate text-sm">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</span>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";
import { X, Smile, Crop, Type, Pen, Check } from "lucide-react";

type Props = {
  fileUrl: string;
  isVideo: boolean;
  onClose: () => void;
  onSave: (editedUrl: string) => void;
};

type StickerItem = { id: number; emoji: string; x: number; y: number; size: number };
type TextItem = { id: number; text: string; x: number; y: number; size: number };

export default function MediaEditor({ fileUrl, isVideo, onClose, onSave }: Props) {
  const [mode, setMode] = useState<"none" | "crop" | "pen">("none");
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showStickerBox, setShowStickerBox] = useState(false);
  const [showTextBox, setShowTextBox] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [caption, setCaption] = useState("");
  const [penColor, setPenColor] = useState("red");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const emojis = ["😂","❤️","🔥","😍","👏","🎓","🇳🇬","✨","💯","🙏","👑","😭"];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
  }, [mode]);

  const startDraw = (e: React.MouseEvent) => {
    if (mode !== "pen") return;
    setIsDrawing(true);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing || mode !== "pen") return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const addSticker = (emoji: string) => {
    setStickers([...stickers, { id: Date.now(), emoji, x: 150, y: 300, size: 48 }]);
    setShowStickerBox(false);
  };

  const addText = () => {
    if (!textInput.trim()) return;
    setTexts([...texts, { id: Date.now(), text: textInput, x: 120, y: 280, size: 28 }]);
    setTextInput("");
    setShowTextBox(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* TOP BAR - X | Sticker | Crop | Aa | Pen - NO MUSIC */}
      <div className="flex justify-between items-center p-3">
        <button onClick={onClose} className="p-2 bg-black/50 rounded-full text-white">
          <X size={26} />
        </button>
        <div className="flex gap-2">
          <button onClick={() => setShowStickerBox(true)} className="p-2.5 bg-black/50 rounded-full text-white">
            <Smile size={22} />
          </button>
          <button onClick={() => setMode(mode === "crop" ? "none" : "crop")} className={`p-2.5 rounded-full text-white ${mode === "crop" ? "bg-green-600" : "bg-black/50"}`}>
            <Crop size={22} />
          </button>
          <button onClick={() => setShowTextBox(true)} className="p-2.5 bg-black/50 rounded-full text-white">
            <Type size={22} />
          </button>
          <button onClick={() => setMode(mode === "pen" ? "none" : "pen")} className={`p-2.5 rounded-full text-white ${mode === "pen" ? "bg-green-600" : "bg-black/50"}`}>
            <Pen size={22} />
          </button>
        </div>
      </div>

      {/* MIDDLE - Picture / Video - WhatsApp Preview */}
      <div className="flex-1 relative overflow-hidden">
        {mode === "crop" && !isVideo ? (
          <Cropper
            image={fileUrl}
            crop={crop}
            zoom={zoom}
            aspect={4 / 5}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={() => {}}
          />
        ) : isVideo ? (
          <video src={fileUrl} controls className="w-full h-full object-cover" />
        ) : (
          <img src={fileUrl} className="w-full h-full object-cover" />
        )}

        {mode === "pen" && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={() => setIsDrawing(false)}
            onMouseLeave={() => setIsDrawing(false)}
          />
        )}

        {/* Texts */}
        {texts.map((t) => (
          <div
            key={t.id}
            className="absolute font-bold text-white cursor-move select-none"
            style={{ left: t.x, top: t.y, fontSize: t.size, textShadow: "2px 2px 5px black" }}
            draggable
            onDragEnd={(e) => {
              setTexts(texts.map((x) => x.id === t.id ? { ...x, x: e.clientX - 50, y: e.clientY - 100 } : x));
            }}
            onDoubleClick={() => setTexts(texts.map((x) => x.id === t.id ? { ...x, size: x.size === 28 ? 42 : 28 } : x))}
          >
            {t.text}
          </div>
        ))}

        {/* Stickers */}
        {stickers.map((s) => (
          <div
            key={s.id}
            className="absolute cursor-move select-none"
            style={{ left: s.x, top: s.y, fontSize: s.size }}
            draggable
            onDragEnd={(e) => {
              setStickers(stickers.map((x) => x.id === s.id ? { ...x, x: e.clientX - 50, y: e.clientY - 100 } : x));
            }}
            onDoubleClick={() => setStickers(stickers.map((x) => x.id === s.id ? { ...x, size: x.size === 48 ? 80 : 48 } : x))}
          >
            {s.emoji}
          </div>
        ))}

        {showStickerBox && (
          <div className="absolute bottom-4 left-4 right-4 bg-black/90 rounded-xl p-4 grid grid-cols-6 gap-2 z-10">
            {emojis.map((em) => (
              <button key={em} onClick={() => addSticker(em)} className="text-3xl">{em}</button>
            ))}
            <button onClick={() => setShowStickerBox(false)} className="col-span-6 text-white text-sm mt-2">Close</button>
          </div>
        )}

        {showTextBox && (
          <div className="absolute bottom-4 left-4 right-4 bg-black/90 rounded-xl p-4 z-10">
            <input
              autoFocus
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="God is good..."
              className="w-full bg-transparent text-white text-xl outline-none placeholder:text-white/50"
            />
            <div className="flex justify-end gap-3 mt-3">
              <button onClick={() => setShowTextBox(false)} className="text-white">Cancel</button>
              <button onClick={addText} className="text-green-400 font-bold">Add</button>
            </div>
          </div>
        )}

        {mode === "pen" && (
          <div className="absolute bottom-4 left-4 flex gap-2 bg-black/70 p-2 rounded-full">
            {["red", "yellow", "white", "green", "blue"].map((c) => (
              <button key={c} onClick={() => setPenColor(c)} className="w-7 h-7 rounded-full border-2" style={{ backgroundColor: c, borderColor: penColor === c ? "white" : "transparent" }} />
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM - Caption + Send - Like WhatsApp */}
      <div className="p-3 flex gap-2 items-center bg-black">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption..."
          className="flex-1 bg-white/20 text-white placeholder:text-white/60 rounded-full px-4 py-3 outline-none"
        />
        <button onClick={() => onSave(fileUrl)} className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white shrink-0">
          <Check size={24} />
        </button>
      </div>

      {mode === "crop" && (
        <div className="px-4 pb-2 bg-black">
          <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
        </div>
      )}
    </div>
  );
    }

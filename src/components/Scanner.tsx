import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import type { AdAnalysis, AppSettings } from '../types';
import { analyzeWithProvider, buildPlaceholderAnalysis, ProviderError } from '../services/ai';

interface Props {
  onAnalysisComplete: (result: AdAnalysis, heroImage: string, additionalImages?: string[]) => void;
  onCancel: () => void;
  isEmbedded: boolean;
  settings: AppSettings;
}
const CONSTRAINTS: MediaStreamConstraints[] = [
  { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
  { video: { facingMode: 'environment', width: { ideal: 1280 } } },
  { video: true },
];
type C = MediaTrackConstraints;
export default function Scanner({ onAnalysisComplete, onCancel, isEmbedded, settings }: Props) {
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [images, setImages] = useState<string[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [extraNotes, setExtraNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<{ msg: string; kind?: string } | null>(null);
  const [canPlaceholder, setCanPlaceholder] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCam = useCallback(() => {
    const v = videoRef.current;
    (v?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setCamActive(false);
  }, []);
  const startCam = useCallback(async () => {
    setError(null);
    stopCam();
    let stream: MediaStream | null = null;
    for (const c of CONSTRAINTS) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); if (stream) break; } catch { /* fallback */ }
    }
    if (!stream) { setError({ msg: 'Kamera nicht verfügbar – bitte Upload nutzen.' }); setMode('upload'); return; }
    const track = stream.getVideoTracks()[0];
    try {
      const caps = (typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {}) as { focusMode?: string[] };
      if (caps.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as C);
    } catch { /* ignorieren */ }
    if (videoRef.current) { videoRef.current.srcObject = stream; setCamActive(true); }
  }, [stopCam]);
  useEffect(() => { if (mode === 'camera') void startCam(); else stopCam(); return () => stopCam(); }, [mode, startCam, stopCam]);

  const tapFocus = async () => { // Tap-to-Focus wenn unterstützt
    const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function') return;
    try {
      const caps = track.getCapabilities() as { focusMode?: string[] };
      if (caps.focusMode?.includes('single')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'single' }] } as unknown as C);
        setTimeout(() => { track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as C).catch(() => undefined); }, 300);
      }
    } catch { /* ignorieren */ }
  };
  const capture = () => { // Button-Capture, Canvas-Downscale 1280px/q0.9
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    const max = 1280; let w = v.videoWidth; let h = v.videoHeight;
    if (w > max || h > max) { if (w > h) { h = Math.round((h * max) / w); w = max; } else { w = Math.round((w * max) / h); h = max; } }
    c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    setImages((p) => [...p, c.toDataURL('image/jpeg', 0.9)]);
    setCaptions((p) => [...p, '']);
  };
  const readFiles = async (files: FileList | File[]) => {
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      urls.push(await new Promise<string>((res) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(f); }));
    }
    setImages((p) => [...p, ...urls]); setCaptions((p) => [...p, ...urls.map(() => '')]);
  };
  const removeAt = (i: number) => { setImages((p) => p.filter((_, j) => j !== i)); setCaptions((p) => p.filter((_, j) => j !== i)); };
  const analyze = async () => {
    setError(null); setCanPlaceholder(false);
    if (images.length === 0 && !captions.some((c) => c.trim()) && !extraNotes.trim()) {
      setError({ msg: 'Mindestens ein Bild oder eine Beschreibung erforderlich.', kind: 'config' }); return;
    }
    setAnalyzing(true);
    try {
      const res = await analyzeWithProvider(settings.activeProvider, { images, captions, extraNotes });
      stopCam(); onAnalysisComplete(res, images[0] ?? '', images.slice(1));
    } catch (e) {
      const kind = e instanceof ProviderError ? e.kind : 'network';
      const msg = e instanceof Error ? e.message : String(e);
      if (kind === 'auth') setError({ msg: `${msg} → Bitte in Einstellungen prüfen.`, kind });
      else { setError({ msg, kind }); setCanPlaceholder(kind === 'network' || kind === 'server' || kind === 'rate-limit'); }
    } finally { setAnalyzing(false); }
  };
  const savePlaceholder = () => { const ph = buildPlaceholderAnalysis(captions, extraNotes); stopCam(); onAnalysisComplete(ph, images[0] ?? '', images.slice(1)); };

  return (
    <div className="flex flex-col bg-oil-800 border border-stone-700/50 rounded-2xl overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-stone-700 flex justify-between items-center bg-stone-900/50">
        <h2 className="font-bold text-white font-industrial uppercase flex items-center gap-2"><Camera className="w-5 h-5 text-rust-500" /> Scanner</h2>
        <div className="flex gap-2">
          <button onClick={() => setMode(mode === 'camera' ? 'upload' : 'camera')} className="text-xs px-3 py-1.5 bg-stone-800 border border-stone-700 rounded text-stone-300 hover:text-white">{mode === 'camera' ? 'Upload' : 'Kamera'}</button>
          {!isEmbedded && <button onClick={onCancel} className="p-1.5 text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>}
        </div>
      </div>
      <div className="p-4 space-y-4">
        {mode === 'camera' && (
          <div className="relative bg-black rounded-lg overflow-hidden cursor-crosshair" onClick={() => void tapFocus()} title="Tippen zum Fokussieren">
            <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-72 object-cover opacity-90" />
            <canvas ref={canvasRef} className="hidden" />
            {!camActive && <p className="absolute inset-0 flex items-center justify-center text-stone-500 text-xs">Kamera startet …</p>}
            <button onClick={(e) => { e.stopPropagation(); capture(); }} className="absolute bottom-3 left-1/2 -translate-x-1/2 w-14 h-14 bg-white/10 border-4 border-stone-300 rounded-full flex items-center justify-center hover:bg-white/20"><span className="w-10 h-10 bg-white rounded-full" /></button>
          </div>
        )}
        {mode === 'upload' && (
          <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-stone-700 rounded-xl p-8 text-center cursor-pointer hover:border-rust-500">
            <ImagePlus className="w-10 h-10 text-stone-500 mx-auto mb-2" />
            <p className="text-white font-medium font-industrial uppercase text-sm">Bilder wählen</p>
            <p className="text-stone-500 text-xs">Mehrfachauswahl – Bild 1 = Analyse-Basis</p>
            <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { if (e.target.files) void readFiles(e.target.files); }} />
          </div>
        )}
        {images.map((img, i) => (
          <div key={i} className="flex gap-2 items-start bg-stone-900/50 border border-stone-700 rounded-lg p-2">
            <img src={img} alt="" className="w-14 h-14 rounded object-cover" />
            <input value={captions[i] ?? ''} onChange={(e) => setCaptions((p) => p.map((c, j) => (j === i ? e.target.value : c)))} placeholder={`Caption Bild ${i + 1} (optional)`} className="flex-1 bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-xs text-white placeholder-stone-600 outline-none focus:border-rust-500" />
            <button onClick={() => removeAt(i)} className="p-1.5 text-stone-500 hover:text-red-500"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <textarea value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} placeholder="Extra-Notizen (optional, z. B. Defekte, Zubehör)" rows={2} className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 text-sm text-white placeholder-stone-600 outline-none focus:border-rust-500" />
        {error && (
          <div className="flex items-start gap-2 bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div><p>{error.msg}</p>
              {canPlaceholder && <button onClick={savePlaceholder} className="mt-2 px-3 py-1.5 bg-stone-800 border border-stone-600 rounded text-stone-200 font-bold uppercase text-[11px] hover:bg-stone-700">Als Platzhalter speichern</button>}
            </div>
          </div>
        )}
        <button onClick={() => void analyze()} disabled={analyzing} className="w-full py-3 bg-rust-600 hover:bg-rust-500 disabled:opacity-50 text-white rounded-lg font-bold uppercase font-industrial flex items-center justify-center gap-2">
          {analyzing ? <><Loader2 className="w-5 h-5 animate-spin" /> Analysiere …</> : <><Sparkles className="w-5 h-5" /> Analysieren ({settings.activeProvider})</>}
        </button>
      </div>
    </div>
  );
}

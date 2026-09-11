import { useEffect, useState, useCallback, useRef } from 'react';
import { AlertCircle, ImagePlus, Loader2, Sparkles, X, Camera as CameraIcon } from 'lucide-react';
import { Camera, CameraSource, CameraResultType, CameraDirection } from '@capacitor/camera';
import type { AdAnalysis, AppSettings } from '../types';
import { analyzeWithProvider, buildPlaceholderAnalysis, ProviderError } from '../services/ai';

interface Props {
  onAnalysisComplete: (result: AdAnalysis, heroImage: string, additionalImages?: string[]) => void;
  onCancel: () => void;
  isEmbedded: boolean;
  settings: AppSettings;
}

export default function Scanner({ onAnalysisComplete, onCancel, isEmbedded, settings }: Props) {
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [images, setImages] = useState<string[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [extraNotes, setExtraNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<{ msg: string; kind?: string } | null>(null);
  const [canPlaceholder, setCanPlaceholder] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const takePhoto = useCallback(async () => {
    setError(null); setCamError(null);
    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        direction: CameraDirection.Rear,
        resultType: CameraResultType.DataUrl,
        quality: 80,
        width: 1280,
        height: 960,
        correctOrientation: true,
        saveToGallery: false,
        webUseInput: true,
      });
      if (photo.dataUrl) {
        setImages((p: string[]) => [...p, photo.dataUrl!]);
        setCaptions((p: string[]) => [...p, '']);
        setCamActive(true);
      } else {
        setCamError('Kein Bild aufgenommen – bitte Upload nutzen.');
        setMode('upload');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('user')) {
        setCamError(null); return;
      }
      setCamError(`Kamera-Fehler: ${msg} – bitte Upload nutzen.`);
      setMode('upload');
    }
  }, []);

  const readFiles = async (files: FileList | File[]) => {
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      urls.push(await new Promise<string>((res: (v: string) => void) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(f); }));
    }
    setImages((p: string[]) => [...p, ...urls]); setCaptions((p: string[]) => [...p, ...urls.map(() => '')]);
  };

  const removeAt = (i: number) => { setImages((p: string[]) => p.filter((_, j: number) => j !== i)); setCaptions((p: string[]) => p.filter((_, j: number) => j !== i)); };

  const analyze = async () => {
    setError(null); setCanPlaceholder(false);
    if (images.length === 0 && !captions.some((c: string) => c.trim()) && !extraNotes.trim()) {
      setError({ msg: 'Mindestens ein Bild oder eine Beschreibung erforderlich.', kind: 'config' }); return;
    }
    setAnalyzing(true);
    try {
      const res = await analyzeWithProvider(settings.activeProvider, { images, captions, extraNotes });
      onAnalysisComplete(res, images[0] ?? '', images.slice(1));
    } catch (e) {
      const kind = e instanceof ProviderError ? e.kind : 'network';
      const msg = e instanceof Error ? e.message : String(e);
      if (kind === 'auth') setError({ msg: `${msg} → Bitte in Einstellungen prüfen.`, kind });
      else { setError({ msg, kind }); setCanPlaceholder(kind === 'network' || kind === 'server' || kind === 'rate-limit'); }
    } finally { setAnalyzing(false); }
  };

  const savePlaceholder = () => { const ph = buildPlaceholderAnalysis(captions, extraNotes); onAnalysisComplete(ph, images[0] ?? '', images.slice(1)); };

  const checkCamera = useCallback(async () => {
    try {
      const perm = await Camera.checkPermissions();
      if (perm.camera !== 'granted') {
        await Camera.requestPermissions({ permissions: ['camera'] });
      }
      setCamActive(true);
    } catch {
      setCamError('Kamera-Berechtigung fehlgeschlagen – bitte Upload nutzen.');
      setMode('upload');
    }
  }, []);

  useEffect(() => { if (mode === 'camera') void checkCamera(); }, [mode, checkCamera]);

  return (
    <div className="flex flex-col bg-oil-800 border border-stone-700/50 rounded-2xl overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-stone-700 flex justify-between items-center bg-stone-900/50">
        <h2 className="font-bold text-white font-industrial uppercase flex items-center gap-2"><CameraIcon className="w-5 h-5 text-rust-500" /> Scanner</h2>
        <div className="flex gap-2">
          <button onClick={() => setMode(mode === 'camera' ? 'upload' : 'camera')} className="text-xs px-3 py-1.5 bg-stone-800 border border-stone-700 rounded text-stone-300 hover:text-white">{mode === 'camera' ? 'Upload' : 'Kamera'}</button>
          {!isEmbedded && <button onClick={onCancel} className="p-1.5 text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>}
        </div>
      </div>
      <div className="p-4 space-y-4">
        {mode === 'camera' && (
          <div className="relative bg-black rounded-lg overflow-hidden">
            {!camActive && !camError && <p className="absolute inset-0 flex items-center justify-center text-stone-500 text-xs">Kamera startet …</p>}
            {camError && <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900/90 p-4 text-center"><p className="text-red-400 text-xs mb-3">{camError}</p><button onClick={() => setMode('upload')} className="px-4 py-2 bg-rust-600 text-white rounded text-xs font-bold">Bilder wählen</button></div>}
            <button onClick={(e) => { e.stopPropagation(); void takePhoto(); }} className="absolute bottom-3 left-1/2 -translate-x-1/2 w-14 h-14 bg-white/10 border-4 border-stone-300 rounded-full flex items-center justify-center hover:bg-white/20"><span className="w-10 h-10 bg-white rounded-full" /></button>
          </div>
        )}
        {mode === 'upload' && (
          <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-stone-700 rounded-xl p-8 text-center cursor-pointer hover:border-rust-500">
            <ImagePlus className="w-10 h-10 text-stone-500 mx-auto mb-2" />
            <p className="text-white font-medium font-industrial uppercase text-sm">Bilder wählen</p>
            <p className="text-stone-500 text-xs">Mehrfachauswahl – Bild 1 = Analyse-Basis</p>
            <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { if (e.target.files) void readFiles(e.target.files); }} />
            <p className="text-stone-600 text-[10px] mt-2">Oder Kamera oben aktivieren</p>
          </div>
        )}
        {camError && mode === 'camera' && (
          <button onClick={() => setMode('upload')} className="w-full py-2 bg-stone-800 border border-stone-600 rounded text-stone-200 text-xs font-bold hover:bg-stone-700">Upload statt Kamera nutzen</button>
        )}
        {images.map((img: string, i: number) => (
          <div key={i} className="flex gap-2 items-start bg-stone-900/50 border border-stone-700 rounded-lg p-2">
            <img src={img} alt="" className="w-14 h-14 rounded object-cover" />
            <input value={captions[i] ?? ''} onChange={(e) => setCaptions((p: string[]) => p.map((c: string, j: number) => (j === i ? e.target.value : c)))} placeholder={`Caption Bild ${i + 1} (optional)`} className="flex-1 bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-xs text-white placeholder-stone-600 outline-none focus:border-rust-500" />
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

import { useState, useRef } from 'react';
import { AlertCircle, Camera as CameraIcon, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import type { AdAnalysis, AppSettings } from '../types';
import { analyzeWithProvider, buildPlaceholderAnalysis, ProviderError } from '../services/ai';

interface Props {
  onAnalysisComplete: (result: AdAnalysis, heroImage: string, additionalImages?: string[]) => void;
  onCancel: () => void;
  isEmbedded: boolean;
  settings: AppSettings;
}

export default function Scanner({ onAnalysisComplete, onCancel, isEmbedded, settings }: Props) {
  const [images, setImages] = useState<string[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [extraNotes, setExtraNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<{ msg: string; kind?: string } | null>(null);
  const [canPlaceholder, setCanPlaceholder] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFiles = async (files: FileList | File[]) => {
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      urls.push(await new Promise<string>((res: (v: string) => void) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result as string);
        r.readAsDataURL(f);
      }));
    }
    setImages((p: string[]) => [...p, ...urls]);
    setCaptions((p: string[]) => [...p, ...urls.map(() => '')]);
  };

  const removeAt = (i: number) => {
    setImages((p: string[]) => p.filter((_, j: number) => j !== i));
    setCaptions((p: string[]) => p.filter((_, j: number) => j !== i));
  };

  const analyze = async () => {
    setError(null);
    setCanPlaceholder(false);
    if (images.length === 0 && !captions.some((c: string) => c.trim()) && !extraNotes.trim()) {
      setError({ msg: 'Mindestens ein Bild oder eine Beschreibung erforderlich.', kind: 'config' });
      return;
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

  const savePlaceholder = () => {
    const ph = buildPlaceholderAnalysis(captions, extraNotes);
    onAnalysisComplete(ph, images[0] ?? '', images.slice(1));
  };

  return (
    <div className="flex flex-col bg-oil-800 border border-stone-700/50 rounded-2xl overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-stone-700 flex justify-between items-center bg-stone-900/50">
        <h2 className="font-bold text-white font-industrial uppercase flex items-center gap-2">
          <CameraIcon className="w-5 h-5 text-rust-500" /> Scanner
        </h2>
        {!isEmbedded && (
          <button onClick={onCancel} className="p-1.5 text-stone-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { if (e.target.files) void readFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files) void readFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-2 p-6 bg-rust-600 hover:bg-rust-500 rounded-xl transition-colors"
          >
            <CameraIcon className="w-8 h-8 text-white" />
            <span className="text-white font-bold font-industrial uppercase text-sm">Kamera</span>
            <span className="text-rust-200 text-[10px]">Foto aufnehmen</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 p-6 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-xl transition-colors"
          >
            <ImagePlus className="w-8 h-8 text-stone-300" />
            <span className="text-stone-200 font-bold font-industrial uppercase text-sm">Upload</span>
            <span className="text-stone-500 text-[10px]">Bilder wählen</span>
          </button>
        </div>
        <p className="text-stone-600 text-[10px] text-center">Kamera = Sofort-Foto · Upload = Galerie/Mehrfachauswahl</p>

        {images.map((img: string, i: number) => (
          <div key={i} className="flex gap-2 items-start bg-stone-900/50 border border-stone-700 rounded-lg p-2">
            <img src={img} alt="" className="w-14 h-14 rounded object-cover" />
            <input
              value={captions[i] ?? ''}
              onChange={(e) => setCaptions((p: string[]) => p.map((c: string, j: number) => (j === i ? e.target.value : c)))}
              placeholder={`Caption Bild ${i + 1} (optional)`}
              className="flex-1 bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-xs text-white placeholder-stone-600 outline-none focus:border-rust-500"
            />
            <button onClick={() => removeAt(i)} className="p-1.5 text-stone-500 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        <textarea
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          placeholder="Extra-Notizen (optional, z. B. Defekte, Zubehör)"
          rows={2}
          className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 text-sm text-white placeholder-stone-600 outline-none focus:border-rust-500"
        />

        {error && (
          <div className="flex items-start gap-2 bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>{error.msg}</p>
              {canPlaceholder && (
                <button onClick={savePlaceholder} className="mt-2 px-3 py-1.5 bg-stone-800 border border-stone-600 rounded text-stone-200 font-bold uppercase text-[11px] hover:bg-stone-700">
                  Als Platzhalter speichern
                </button>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => void analyze()}
          disabled={analyzing || images.length === 0}
          className="w-full py-3 bg-rust-600 hover:bg-rust-500 disabled:opacity-50 text-white rounded-lg font-bold uppercase font-industrial flex items-center justify-center gap-2"
        >
          {analyzing
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Analysiere …</>
            : <><Sparkles className="w-5 h-5" /> Analysieren ({settings.activeProvider})</>}
        </button>
      </div>
    </div>
  );
}

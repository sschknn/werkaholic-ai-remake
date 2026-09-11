import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, FileDown, Archive, Plus, Trash2 } from 'lucide-react';
import type { AdAnalysis, AppSettings } from '../types';
import { sanitizeText, sanitizeTags } from '../utils/sanitize';
import { copyAdToClipboard, exportAdPdf, exportAdZip } from '../services/exportService';
import ResultPublish from './ResultPublish';

interface Props {
  result: AdAnalysis;
  images: string[];
  settings?: AppSettings;
  onBack: () => void;
  onSave: (updated: AdAnalysis, images?: string[]) => void;
}

export default function ResultView({ result, images, settings, onBack, onSave }: Props) {
  const [form, setForm] = useState<AdAnalysis>(result);
  const [localImages, setLocalImages] = useState<string[]>(images);
  const [sel, setSel] = useState(0);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSaved = useRef('');

  useEffect(() => {
    setForm(result);
    setLocalImages(images);
    lastSaved.current = JSON.stringify(result) + JSON.stringify(images);
  }, [result, images]);

  useEffect(() => {
    const key = JSON.stringify(form) + JSON.stringify(localImages);
    if (key === lastSaved.current) return;
    const t = setTimeout(() => {
      const clean: AdAnalysis = {
        ...form,
        title: sanitizeText(form.title, 140) || form.title,
        description: sanitizeText(form.description, 5000) || form.description,
        category: sanitizeText(form.category, 80) || form.category,
        condition: sanitizeText(form.condition, 40) || form.condition,
        price_estimate: sanitizeText(form.price_estimate, 60) || form.price_estimate,
        brand_detected: form.brand_detected ? sanitizeText(form.brand_detected, 80) : undefined,
        keywords: sanitizeTags(form.keywords),
      };
      onSave(clean, localImages);
      lastSaved.current = JSON.stringify(clean) + JSON.stringify(localImages);
      setSaved('Gespeichert');
      setTimeout(() => setSaved(''), 1500);
    }, 800);
    return () => clearTimeout(t);
  }, [form, localImages, onSave]);

  const set = (k: keyof AdAnalysis, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const addImages = (files: FileList) => {
    Array.from(files).forEach((f) => {
      const r = new FileReader();
      r.onloadend = () => { if (r.result) setLocalImages((p) => [...p, r.result as string]); };
      r.readAsDataURL(f);
    });
  };
  const delImage = (i: number) => {
    if (localImages.length <= 1) return;
    const next = localImages.filter((_, j) => j !== i);
    setLocalImages(next);
    setSel((s) => Math.min(s, next.length - 1));
  };
  const doExport = async (kind: 'copy' | 'pdf' | 'zip') => {
    setBusy(kind);
    try {
      if (kind === 'copy') { await copyAdToClipboard(form); setSaved('Kopiert'); }
      if (kind === 'pdf') await exportAdPdf(form, localImages);
      if (kind === 'zip') await exportAdZip(form, localImages);
    } finally {
      setBusy(null);
      setTimeout(() => setSaved(''), 1500);
    }
  };

  const input = 'w-full bg-stone-900 border border-stone-700 rounded p-2 text-sm text-white outline-none focus:border-rust-500';
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in pb-24 md:pb-12">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-stone-400 hover:text-white text-sm font-bold uppercase"><ArrowLeft className="w-4 h-4" /> Zurück</button>
        {saved && <span className="text-xs text-emerald-400 font-bold uppercase">{saved}</span>}
      </div>

      <div className="bg-oil-800 border border-stone-700/50 rounded-2xl p-3">
        {localImages[sel] ? <img src={localImages[sel]} alt="" className="w-full max-h-80 object-contain bg-black rounded-lg" /> : <div className="h-40 flex items-center justify-center text-stone-600 text-sm">Kein Bild</div>}
        <div className="mt-2 grid grid-cols-6 gap-2">
          {localImages.map((img, i) => (
            <div key={i} onClick={() => setSel(i)} className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 ${sel === i ? 'border-rust-500' : 'border-stone-800 opacity-60'}`}>
              <img src={img} alt="" className="w-full h-full object-cover" />
              <button onClick={(e) => { e.stopPropagation(); delImage(i); }} disabled={localImages.length <= 1} className="absolute top-0 right-0 bg-red-700 p-1 disabled:opacity-30"><Trash2 className="w-3 h-3 text-white" /></button>
            </div>
          ))}
          <button onClick={() => fileRef.current?.click()} className="aspect-square rounded border-2 border-dashed border-stone-700 text-stone-500 hover:text-rust-500 flex items-center justify-center"><Plus className="w-5 h-5" /></button>
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { if (e.target.files) addImages(e.target.files); }} />
        </div>
        {localImages.length <= 1 && <p className="text-[11px] text-stone-500 mt-1">Mind. 1 Bild wird behalten.</p>}
      </div>

      <div className="bg-oil-800 border border-stone-700/50 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-white font-industrial uppercase text-sm">Inserat bearbeiten</h3>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Titel" className={input} />
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} placeholder="Beschreibung" className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Kategorie" className={input} />
          <input value={form.condition} onChange={(e) => set('condition', e.target.value)} placeholder="Zustand" className={input} />
          <input value={form.price_estimate} onChange={(e) => set('price_estimate', e.target.value)} placeholder="Preis-Schätzung" className={input} />
          <input value={form.brand_detected ?? ''} onChange={(e) => set('brand_detected', e.target.value)} placeholder="Marke" className={input} />
        </div>
        <input value={form.keywords.join(', ')} onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Keywords, Komma-getrennt" className={input} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => void doExport('copy')} disabled={busy !== null} className="py-2.5 bg-oil-800 border border-stone-700 rounded text-stone-200 text-xs font-bold uppercase flex items-center justify-center gap-1.5 hover:bg-stone-700"><Copy className="w-4 h-4" /> {busy === 'copy' ? '…' : 'Kopieren'}</button>
        <button onClick={() => void doExport('pdf')} disabled={busy !== null} className="py-2.5 bg-oil-800 border border-stone-700 rounded text-stone-200 text-xs font-bold uppercase flex items-center justify-center gap-1.5 hover:bg-stone-700"><FileDown className="w-4 h-4" /> {busy === 'pdf' ? '…' : 'PDF'}</button>
        <button onClick={() => void doExport('zip')} disabled={busy !== null} className="py-2.5 bg-oil-800 border border-stone-700 rounded text-stone-200 text-xs font-bold uppercase flex items-center justify-center gap-1.5 hover:bg-stone-700"><Archive className="w-4 h-4" /> {busy === 'zip' ? '…' : 'ZIP'}</button>
      </div>

      <ResultPublish ad={form} images={localImages} settings={settings} />
    </div>
  );
}

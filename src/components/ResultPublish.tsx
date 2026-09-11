import { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Globe } from 'lucide-react';
import type { AdAnalysis, AppSettings } from '../types';
import { ProviderError } from '../services/ai';
import { copyAdToClipboard } from '../services/exportService';
import { MARKETPLACES, publishToMarketplace, type MarketplaceId } from '../services/marketplaces/registry';
import { getHoodConfig, downloadHoodCsv } from '../services/marketplaces/hood';
import { getTraderaConfig, suggestCategory } from '../services/tradera';
import { isBrowserPublisherAvailable, openPublisher, postListingFlow, getStatus, onStatus } from '../services/browserPublisher';

const badge: Record<string, string> = {
  live: 'bg-emerald-900/50 text-emerald-400 border-emerald-700',
  partner: 'bg-amber-900/50 text-amber-400 border-amber-700',
  unsupported: 'bg-stone-900 text-stone-500 border-stone-700',
};

export default function ResultPublish({ ad, images, settings }: { ad: AdAnalysis; images: string[]; settings?: AppSettings }) {
  const [sel, setSel] = useState<MarketplaceId>('tradera');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState('');
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const info = MARKETPLACES.find((m) => m.id === sel);
  const hoodNoApi = sel === 'hood' && !getHoodConfig().apiUrl;
  const traderaCfg = getTraderaConfig();
  const traderaCat = suggestCategory(ad.title, ad.category);

  const publish = async () => {
    setBusy(true);
    setErr(null);
    setUrl(undefined);
    try {
      const res = await publishToMarketplace(sel, ad, images, (t: string) => setProg(t));
      setUrl(res.url);
      setProg(res.isDraft ? 'Als Entwurf gespeichert.' : 'Veröffentlicht.');
    } catch (e) {
      setErr(e instanceof ProviderError ? `${e.kind}: ${e.message}` : String(e));
      setProg('');
    } finally {
      setBusy(false);
    }
  };

  const kleinanzeigen = async () => {
    await copyAdToClipboard(ad);
    window.open('https://www.kleinanzeigen.de/p-anzeige-aufgeben.html', '_blank');
  };

  const browserSettings = settings?.browserPublisher ?? {
    enabled: false, username: '', password: '', autoFillOnly: false,
    defaultCategory: '', defaultCondition: '',
  };

  const [browserStatus, setBrowserStatus] = useState<{ loaded: boolean; url: string; loggedIn: boolean }>({ loaded: false, url: '', loggedIn: false });
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserMsg, setBrowserMsg] = useState('');

  if (isBrowserPublisherAvailable() && !browserStatus.loaded) {
    getStatus().then(setBrowserStatus).catch(() => {});
    onStatus(setBrowserStatus);
  }

  return (
    <div className="bg-oil-800 rounded-lg border border-stone-700 p-4 space-y-3">
      <h3 className="font-bold text-white font-industrial uppercase text-sm">Marktplatz-Publish</h3>
      <div className="flex flex-wrap gap-1.5">
        {MARKETPLACES.map((m) => (
          <button key={m.id} onClick={() => { setSel(m.id); setErr(null); setUrl(undefined); setProg(''); }} className={`px-2 py-1 rounded border text-[11px] font-bold uppercase ${m.id === sel ? 'bg-rust-600 text-white border-rust-600' : 'bg-stone-900 text-stone-400 border-stone-700'}`}>
            {m.name}
          </button>
        ))}
      </div>
      {info && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded border font-bold uppercase text-[10px] ${badge[info.status]}`}>{info.status}</span>
          <span className="text-stone-500">{info.authHint}</span>
        </div>
      )}
      {sel === 'tradera' && (
        <p className="text-xs text-stone-400">Kategorie-Vorschlag: <b className="text-stone-200">{traderaCat.name} (#{traderaCat.id})</b> · AutoCommit: <b className="text-stone-200">{traderaCfg.autoCommit ? 'an' : 'aus (Entwurf)'}</b></p>
      )}
      {sel === 'kleinanzeigen' && (
        <div className="space-y-2">
          <button onClick={() => void kleinanzeigen()} className="w-full py-2.5 bg-rust-600 hover:bg-rust-500 text-white rounded font-bold uppercase text-sm flex items-center justify-center gap-2">
            <ExternalLink className="w-4 h-4" /> Kopieren + Kleinanzeigen öffnen
          </button>
          {browserSettings.enabled && isBrowserPublisherAvailable() && (
            <>
              {!browserStatus.loaded ? (
                <button
                  onClick={async () => {
                    setBrowserBusy(true);
                    setBrowserMsg('');
                    const r = await openPublisher('kleinanzeigen');
                    if (!r.ok) { setBrowserMsg(r.error || 'Fehler beim Öffnen'); }
                    else { setBrowserMsg('Browser geöffnet – bitte einloggen'); }
                    setBrowserBusy(false);
                  }}
                  disabled={browserBusy}
                  className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded font-bold uppercase text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {browserBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  {browserBusy ? 'Öffne…' : 'Browser-Post (Kleinanzeigen)'}
                </button>
              ) : (
                <button
                  onClick={async () => {
                    setBrowserBusy(true);
                    setBrowserMsg('');
                    const r = await postListingFlow(ad, images[0] ?? '', images.slice(1), browserSettings, 'kleinanzeigen');
                    if (r.ok) setBrowserMsg('Formular ausgefüllt – bitte abschicken');
                    else setBrowserMsg(r.error || 'Fehler');
                    setBrowserBusy(false);
                  }}
                  disabled={browserBusy || !browserStatus.loggedIn}
                  className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded font-bold uppercase text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {browserBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  {browserBusy ? 'Fülle aus…' : 'Auto-Inserat starten'}
                </button>
              )}
              {browserMsg && <p className="text-xs text-stone-400">{browserMsg}</p>}
            </>
          )}
        </div>
      )}
      {(sel === 'vinted' || sel === 'ricardo' || sel === 'willhaben') && (
        <div className="text-xs text-stone-400 space-y-2">
          <p>{info?.fallbackHint} – bitte manuell anlegen.</p>
          <button onClick={() => downloadHoodCsv(ad)} className="px-3 py-1.5 bg-stone-800 border border-stone-600 rounded text-stone-200 text-[11px] font-bold uppercase">Hood-CSV als Beleg exportieren</button>
        </div>
      )}
      {sel === 'hood' && hoodNoApi && (
        <div className="text-xs text-stone-400 space-y-2">
          <p>Keine apiUrl konfiguriert → CSV-Download statt Publish (Platin-Shop nötig).</p>
          <button onClick={() => downloadHoodCsv(ad)} className="px-3 py-1.5 bg-stone-800 border border-stone-600 rounded text-stone-200 text-[11px] font-bold uppercase">Hood-CSV herunterladen</button>
        </div>
      )}
      {!((sel === 'kleinanzeigen') || (sel === 'vinted' || sel === 'ricardo' || sel === 'willhaben') || hoodNoApi) && (
        <button onClick={() => void publish()} disabled={busy} className="w-full py-2.5 bg-rust-600 hover:bg-rust-500 disabled:opacity-50 text-white rounded font-bold uppercase text-sm flex items-center justify-center gap-2">
          {busy ? (<><Loader2 className="w-4 h-4 animate-spin" /> {prog || 'Publiziere …'}</>) : (<>Auf {info?.name} veröffentlichen</>)}
        </button>
      )}
      {prog && !busy && <p className="text-xs text-stone-400">{prog}</p>}
      {url && <a href={url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {url}</a>}
      {err && <p className="text-xs text-red-300 bg-red-950/40 border border-red-800 rounded p-2">{err}</p>}
    </div>
  );
}

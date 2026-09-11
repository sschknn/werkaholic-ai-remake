import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Save, Shield, XCircle } from 'lucide-react';
import type { AppSettings, ProviderId } from '../types';
import { defaultTraderaConfig, verifyTraderaConnection } from '../services/tradera';
import { defaultEbayConfig, verifyEbayConnection } from '../services/marketplaces/ebay';
import { defaultEtsyConfig, verifyEtsyConnection } from '../services/marketplaces/etsy';
import { defaultHoodConfig } from '../services/marketplaces/hood';
import { defaultFacebookConfig, verifyFacebookConnection } from '../services/marketplaces/facebook';

interface Props { settings: AppSettings; onSave: (s: AppSettings) => void; onBack: () => void; }
type Tab = 'ki' | 'tradera' | 'ebay' | 'etsy' | 'hood' | 'facebook';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'ki', label: 'KI-Provider' }, { id: 'tradera', label: 'Tradera' }, { id: 'ebay', label: 'eBay' },
  { id: 'etsy', label: 'Etsy' }, { id: 'hood', label: 'Hood' }, { id: 'facebook', label: 'Facebook' },
];

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[11px] text-stone-400 uppercase font-bold">{label}</span>
      <input {...rest} className="mt-1 w-full bg-stone-900 border border-stone-700 rounded p-2 text-xs text-stone-200 font-mono outline-none focus:border-rust-500" />
    </label>
  );
}

export default function SettingsView({ settings, onSave, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('ki');
  const [s, setS] = useState<AppSettings>({
    ...settings,
    openai: settings.openai ?? { apiKey: '', model: '' },
    xai: settings.xai ?? { apiKey: '', model: '' },
    gemini: settings.gemini ?? { apiKey: '', model: '' },
    tradera: { ...defaultTraderaConfig(), ...settings.tradera },
    ebay: { ...defaultEbayConfig(), ...settings.ebay },
    etsy: { ...defaultEtsyConfig(), ...settings.etsy },
    hood: { ...defaultHoodConfig(), ...settings.hood },
    facebook: { ...defaultFacebookConfig(), ...settings.facebook },
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const patch = (k: keyof AppSettings, v: unknown) => setS((p) => ({ ...p, [k]: v }));

  const kiCheck = () => {
    const p = s[s.activeProvider];
    const ok = p.apiKey.trim().length >= 8;
    setMsg(ok
      ? { ok: true, text: `Key-Format OK (${p.apiKey.length} Zeichen). Kein kostenpflichtiger Call ausgeführt – Analyse startet erst im Scanner.` }
      : { ok: false, text: 'Key zu kurz / fehlt – bitte prüfen (kein Call ausgeführt).' });
  };

  const verify = async () => {
    setChecking(true);
    setMsg(null);
    try {
      if (tab === 'tradera') { const r = await verifyTraderaConnection(s.tradera!); setMsg({ ok: r.ok, text: r.message }); }
      if (tab === 'ebay') { const r = await verifyEbayConnection(s.ebay!); setMsg({ ok: r.ok, text: r.message }); }
      if (tab === 'etsy') { const r = await verifyEtsyConnection(s.etsy!); setMsg({ ok: r.ok, text: r.message }); }
      if (tab === 'facebook') { const r = await verifyFacebookConnection(s.facebook!); setMsg({ ok: r.ok, text: r.message }); }
    } finally { setChecking(false); }
  };

  const input = 'w-full bg-stone-900 border border-stone-700 rounded p-2 text-xs text-stone-200 outline-none focus:border-rust-500';
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in pb-24 md:pb-12 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded bg-stone-900 border border-stone-800 text-stone-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-2xl font-bold text-white font-industrial uppercase flex items-center gap-2"><Shield className="w-6 h-6 text-rust-500" /> Einstellungen</h1>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg(null); }} className={`px-3 py-1.5 rounded text-xs font-bold uppercase ${tab === t.id ? 'bg-rust-600 text-white' : 'bg-oil-800 text-stone-400 border border-stone-700'}`}>{t.label}</button>
        ))}
      </div>

      <div className="bg-oil-800 border border-stone-700 rounded-xl p-5 space-y-4">
        {tab === 'ki' && (
          <>
            <div className="flex flex-wrap gap-2">
              {(['opencode', 'openrouter', 'openai', 'xai', 'gemini'] as const satisfies readonly ProviderId[]).map((p) => (
                <button key={p} onClick={() => patch('activeProvider', p)} className={`px-4 py-2 rounded text-xs font-bold uppercase ${s.activeProvider === p ? 'bg-rust-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>{p}</button>
              ))}
            </div>
            <Field label="API-Key (password)" type="password" value={s[s.activeProvider].apiKey} onChange={(e) => patch(s.activeProvider, { ...s[s.activeProvider], apiKey: e.target.value })} placeholder="Key nur lokal" />
            {s.activeProvider === 'opencode'
              ? <Field label="API-URL (opencode)" value={s.opencode.apiUrl ?? ''} onChange={(e) => patch('opencode', { ...s.opencode, apiUrl: e.target.value })} placeholder="https://…" />
              : s.activeProvider === 'openrouter'
                ? <Field label="Modell (openrouter)" value={s.openrouter.model ?? ''} onChange={(e) => patch('openrouter', { ...s.openrouter, model: e.target.value })} placeholder="openai/gpt-4o-mini" />
                : s.activeProvider === 'openai'
                  ? <Field label="Modell (openai)" value={s.openai.model ?? ''} onChange={(e) => patch('openai', { ...s.openai, model: e.target.value })} placeholder="gpt-4o-mini" />
                  : s.activeProvider === 'xai'
                    ? <Field label="Modell (xai)" value={s.xai.model ?? ''} onChange={(e) => patch('xai', { ...s.xai, model: e.target.value })} placeholder="grok-3-mini" />
                    : <Field label="Modell (gemini)" value={s.gemini.model ?? ''} onChange={(e) => patch('gemini', { ...s.gemini, model: e.target.value })} placeholder="gemini-3.6-flash" />}
            <button onClick={kiCheck} className="px-4 py-2 bg-stone-800 border border-stone-600 rounded text-xs font-bold uppercase text-stone-200">Key-Format prüfen (kein Call)</button>
          </>
        )}

        {tab === 'tradera' && s.tradera && (
          <>
            <p className={`text-xs font-bold uppercase ${s.tradera.isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>{s.tradera.isConnected ? '● Verbunden' : '● Nicht verbunden'}</p>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Token" type="password" value={s.tradera.token} onChange={(e) => patch('tradera', { ...s.tradera!, token: e.target.value })} />
              <Field label="User-ID" value={s.tradera.userId} onChange={(e) => patch('tradera', { ...s.tradera!, userId: e.target.value })} />
              <label className="block"><span className="text-[11px] text-stone-400 uppercase font-bold">Inserat-Typ</span>
                <select value={s.tradera.defaultItemType} onChange={(e) => patch('tradera', { ...s.tradera!, defaultItemType: Number(e.target.value) as 1 | 3 })} className={input}><option value={1}>Auktion (1)</option><option value={3}>Festpreis (3)</option></select></label>
              <label className="block"><span className="text-[11px] text-stone-400 uppercase font-bold">Laufzeit (Tage)</span>
                <select value={s.tradera.defaultDuration} onChange={(e) => patch('tradera', { ...s.tradera!, defaultDuration: Number(e.target.value) })} className={input}>{[7, 10, 14, 30].map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
              <Field label="Versand-Provider-ID" type="number" value={s.tradera.defaultShippingProviderId} onChange={(e) => patch('tradera', { ...s.tradera!, defaultShippingProviderId: Number(e.target.value) })} />
              <Field label="Versandkosten (SEK)" type="number" value={s.tradera.defaultShippingCost} onChange={(e) => patch('tradera', { ...s.tradera!, defaultShippingCost: Number(e.target.value) })} />
              <Field label="EUR→SEK-Rate" type="number" value={s.tradera.currencyRateEurToSek} onChange={(e) => patch('tradera', { ...s.tradera!, currencyRateEurToSek: Number(e.target.value) })} />
              <label className="flex items-center gap-2 text-xs text-stone-300"><input type="checkbox" checked={s.tradera.autoCommit} onChange={(e) => patch('tradera', { ...s.tradera!, autoCommit: e.target.checked })} className="accent-rust-600 w-4 h-4" /> AutoCommit (direkt live)</label>
            </div>
            <button onClick={() => void verify()} disabled={checking} className="px-4 py-2 bg-stone-800 border border-stone-600 rounded text-xs font-bold uppercase text-stone-200 disabled:opacity-50">{checking ? 'Prüfe …' : 'Verify'}</button>
          </>
        )}

        {tab === 'ebay' && s.ebay && (
          <>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="OAuth-Token" type="password" value={s.ebay.oAuthToken} onChange={(e) => patch('ebay', { ...s.ebay!, oAuthToken: e.target.value })} />
              <Field label="Marketplace-ID" value={s.ebay.marketplaceId} onChange={(e) => patch('ebay', { ...s.ebay!, marketplaceId: e.target.value })} />
              <Field label="Category-ID" value={s.ebay.categoryId} onChange={(e) => patch('ebay', { ...s.ebay!, categoryId: e.target.value })} />
              <Field label="Location Key" value={s.ebay.merchantLocationKey} onChange={(e) => patch('ebay', { ...s.ebay!, merchantLocationKey: e.target.value })} />
              <Field label="Fulfillment-Policy-ID" value={s.ebay.fulfillmentPolicyId} onChange={(e) => patch('ebay', { ...s.ebay!, fulfillmentPolicyId: e.target.value })} />
              <Field label="Payment-Policy-ID" value={s.ebay.paymentPolicyId} onChange={(e) => patch('ebay', { ...s.ebay!, paymentPolicyId: e.target.value })} />
              <Field label="Return-Policy-ID" value={s.ebay.returnPolicyId} onChange={(e) => patch('ebay', { ...s.ebay!, returnPolicyId: e.target.value })} />
              <label className="flex items-center gap-2 text-xs text-stone-300"><input type="checkbox" checked={s.ebay.sandbox} onChange={(e) => patch('ebay', { ...s.ebay!, sandbox: e.target.checked })} className="accent-rust-600 w-4 h-4" /> Sandbox</label>
            </div>
            <button onClick={() => void verify()} disabled={checking} className="px-4 py-2 bg-stone-800 border border-stone-600 rounded text-xs font-bold uppercase text-stone-200 disabled:opacity-50">{checking ? 'Prüfe …' : 'Verify'}</button>
          </>
        )}

        {tab === 'etsy' && s.etsy && (
          <>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="API-Key" type="password" value={s.etsy.apiKey} onChange={(e) => patch('etsy', { ...s.etsy!, apiKey: e.target.value })} />
              <Field label="Access-Token" type="password" value={s.etsy.accessToken} onChange={(e) => patch('etsy', { ...s.etsy!, accessToken: e.target.value })} />
              <Field label="Shop-ID" value={s.etsy.shopId} onChange={(e) => patch('etsy', { ...s.etsy!, shopId: e.target.value })} />
              <Field label="Taxonomy-ID" value={s.etsy.taxonomyId} onChange={(e) => patch('etsy', { ...s.etsy!, taxonomyId: e.target.value })} />
              <Field label="Shipping-Profile-ID" value={s.etsy.shippingProfileId} onChange={(e) => patch('etsy', { ...s.etsy!, shippingProfileId: e.target.value })} />
            </div>
            <button onClick={() => void verify()} disabled={checking} className="px-4 py-2 bg-stone-800 border border-stone-600 rounded text-xs font-bold uppercase text-stone-200 disabled:opacity-50">{checking ? 'Prüfe …' : 'Verify'}</button>
          </>
        )}

        {tab === 'hood' && s.hood && (
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Account-Name" value={s.hood.accountName} onChange={(e) => patch('hood', { ...s.hood!, accountName: e.target.value })} />
              <Field label="Schnittstellen-Passwort" type="password" value={s.hood.accountPass} onChange={(e) => patch('hood', { ...s.hood!, accountPass: e.target.value })} />
            </div>
            <Field label="API-URL (Platin-Shop)" value={s.hood.apiUrl} onChange={(e) => patch('hood', { ...s.hood!, apiUrl: e.target.value })} placeholder="leer = CSV-Export" />
            <p className="text-xs text-stone-500">Hood-Direkt-API nur mit Platin-Shop. Ohne apiUrl nutzt ResultView den CSV-Export (buildHoodCsv/downloadHoodCsv).</p>
          </div>
        )}

        {tab === 'facebook' && s.facebook && (
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Catalog-ID" value={s.facebook.catalogId} onChange={(e) => patch('facebook', { ...s.facebook!, catalogId: e.target.value })} />
              <Field label="Access-Token" type="password" value={s.facebook.accessToken} onChange={(e) => patch('facebook', { ...s.facebook!, accessToken: e.target.value })} />
              <Field label="Seller-ID" value={s.facebook.sellerId} onChange={(e) => patch('facebook', { ...s.facebook!, sellerId: e.target.value })} />
            </div>
            <p className="text-xs text-stone-500">Nur für zugelassene Partner (Graph API Catalog). Ohne Partner-Zugang deaktiviert.</p>
            <button onClick={() => void verify()} disabled={checking} className="px-4 py-2 bg-stone-800 border border-stone-600 rounded text-xs font-bold uppercase text-stone-200 disabled:opacity-50">{checking ? 'Prüfe …' : 'Verify'}</button>
          </div>
        )}

        {msg && (
          <p className={`text-xs rounded p-2 border flex items-center gap-2 ${msg.ok ? 'bg-emerald-950/40 border-emerald-700 text-emerald-200' : 'bg-red-950/40 border-red-700 text-red-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}{msg.text}
          </p>
        )}
      </div>

      <div className="bg-rust-900/20 border border-rust-800 rounded p-3 text-xs text-rust-200">Keys nur lokal (localStorage), nie committen – .env.local bleibt unberührt.</div>

      <div className="flex justify-end">
        <button onClick={() => onSave(s)} className="px-6 py-3 bg-rust-600 hover:bg-rust-500 text-white rounded font-bold uppercase font-industrial flex items-center gap-2"><Save className="w-5 h-5" /> Speichern</button>
      </div>
    </div>
  );
}

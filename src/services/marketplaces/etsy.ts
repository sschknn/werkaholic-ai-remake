import type { AdAnalysis, EtsyConfig } from '../../types';
import type { MarketplacePublishResult } from './registry';
import { loadSettings, saveSettings } from '../settings';
import { ProviderError } from '../ai';

export interface EtsyPublishOptions {
  onProgress?: (statusText: string, step: number, totalSteps: number) => void;
}

export const ETSY_API_BASE = 'https://openapi.etsy.com';

/** Secrets-freie Defaults: Key/Token/IDs leer, nur whoMade/whenMade vorbelegt. */
export function defaultEtsyConfig(): EtsyConfig {
  return {
    apiKey: '',
    accessToken: '',
    shopId: '',
    taxonomyId: '',
    shippingProfileId: '',
    whoMade: 'i_did',
    whenMade: 'made_to_order',
  };
}

/** Holt die Etsy-Konfiguration aus AppSettings oder den Defaults. */
export function getEtsyConfig(): EtsyConfig {
  try {
    const stored = loadSettings().etsy;
    if (!stored) return defaultEtsyConfig();
    return { ...defaultEtsyConfig(), ...stored };
  } catch {
    return defaultEtsyConfig();
  }
}

/** Speichert einen Etsy-Config-Patch persistent in AppSettings. */
export function saveEtsyConfig(patch: Partial<EtsyConfig>): EtsyConfig {
  const updated: EtsyConfig = { ...getEtsyConfig(), ...patch };
  const settings = loadSettings();
  saveSettings({ ...settings, etsy: updated });
  return updated;
}

function etsyHeaders(cfg: EtsyConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'x-api-key': cfg.apiKey,
    Authorization: `Bearer ${cfg.accessToken}`,
    ...extra,
  };
}

function requireEtsyCfg(cfg: EtsyConfig): void {
  if (!cfg.apiKey || !cfg.accessToken) {
    throw new ProviderError('auth', 'Etsy API-Key oder Access-Token fehlt (Scope listings_w). Bitte in den Einstellungen hinterlegen.');
  }
  if (!cfg.shopId) {
    throw new ProviderError('config', 'Etsy Shop-ID fehlt. Bitte in den Einstellungen hinterlegen.');
  }
}

/** Prüft API-Key + Token gegen GET /v3/application/shops/{shop_id}. */
export async function verifyEtsyConnection(
  cfg: EtsyConfig = getEtsyConfig(),
): Promise<{ ok: boolean; message: string }> {
  if (!cfg.apiKey || !cfg.accessToken || !cfg.shopId) {
    return { ok: false, message: 'Etsy API-Key, Token oder Shop-ID fehlt.' };
  }
  try {
    const res = await fetch(`${ETSY_API_BASE}/v3/application/shops/${encodeURIComponent(cfg.shopId)}`, {
      method: 'GET',
      headers: etsyHeaders(cfg),
    });
    if (res.ok) return { ok: true, message: 'Etsy-Verbindung OK (Shop gefunden).' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Etsy meldet: Key/Token ungültig oder Scope fehlt (listings_w).' };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, message: `Etsy-Antwort (${res.status}): ${text.slice(0, 150)}` };
  } catch (e) {
    return { ok: false, message: `Verbindungsfehler: ${e instanceof Error ? e.message : 'Etsy nicht erreichbar'}` };
  }
}

/** Wandelt eine DataURL in einen Blob um (Fallback, wenn fetch(dataURL) scheitert, z. B. in Tests). */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = head.match(/data:([^;,]+)/)?.[1] ?? 'image/jpeg';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function imageToBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    try {
      const res = await fetch(src);
      return await res.blob();
    } catch {
      return dataUrlToBlob(src);
    }
  }
  const res = await fetch(src);
  if (!res.ok) throw new ProviderError('network', `Bild konnte nicht geladen werden (${res.status}).`);
  return await res.blob();
}

/**
 * Veröffentlicht eine AdAnalysis über die Etsy API v3.
 * Flow: POST shops/{shop_id}/listings (draft) → POST listings/{id}/images je Bild
 * → PATCH listings/{id} (state 'active').
 * Signatur: (cfg, ad, images, opts) – analog zum Tradera-Referenz-Adapter.
 */
export async function publishEtsyListing(
  cfg: EtsyConfig,
  ad: AdAnalysis,
  images: string[],
  opts: EtsyPublishOptions = {},
): Promise<MarketplacePublishResult> {
  requireEtsyCfg(cfg);
  const title = ad.title.trim().slice(0, 140);
  if (!title) {
    throw new ProviderError('validation', 'Titel fehlt – Inserat kann nicht erstellt werden.');
  }
  const onProgress = opts.onProgress ?? (() => undefined);
  const price = (() => {
    const m = ad.price_estimate.match(/(\d+[.,]?\d*)/);
    return m ? parseFloat(m[1].replace(',', '.')) : 1;
  })();

  const form = new URLSearchParams();
  form.set('quantity', '1');
  form.set('title', title);
  form.set('description', ad.description);
  form.set('price', (Number.isFinite(price) && price > 0 ? price : 1).toFixed(2));
  form.set('who_made', cfg.whoMade || 'i_did');
  form.set('when_made', cfg.whenMade || 'made_to_order');
  if (cfg.taxonomyId) form.set('taxonomy_id', cfg.taxonomyId);
  if (cfg.shippingProfileId) form.set('shipping_profile_id', cfg.shippingProfileId);
  form.set('type', 'physical');
  // Tags (max 13): mitgeben, falls der Endpoint sie akzeptiert – sonst ignoriert der Server sie.
  const tags = (ad.keywords ?? []).slice(0, 13).join(',');
  if (tags) form.set('tags', tags);

  const totalSteps = 2 + Math.min(images.length, 10);
  onProgress('Lege Etsy-Entwurf an...', 1, totalSteps);
  let draftRes: Response;
  try {
    draftRes = await fetch(`${ETSY_API_BASE}/v3/application/shops/${encodeURIComponent(cfg.shopId)}/listings`, {
      method: 'POST',
      headers: { ...etsyHeaders(cfg), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (e) {
    throw new ProviderError('network', `Etsy nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (draftRes.status === 401 || draftRes.status === 403) {
    throw new ProviderError('auth', 'Etsy meldet: Key/Token ungültig oder Scope fehlt (listings_w).', draftRes.status);
  }
  if (draftRes.status !== 200 && draftRes.status !== 201) {
    const text = await draftRes.text().catch(() => '');
    throw new ProviderError('server', `Etsy Fehler beim Anlegen (${draftRes.status}): ${text.slice(0, 300)}`, draftRes.status);
  }
  const draft = (await draftRes.json().catch(() => null)) as { listing_id?: number; url?: string } | null;
  const listingId = draft?.listing_id;
  if (listingId === undefined) {
    throw new ProviderError('validation', 'Ungültige Etsy-Antwort: Keine listing_id erhalten.');
  }

  const toUpload = images.slice(0, 10);
  for (let i = 0; i < toUpload.length; i++) {
    onProgress(`Lade Etsy-Bild ${i + 1} von ${toUpload.length} hoch...`, 2 + i, totalSteps);
    try {
      const blob = await imageToBlob(toUpload[i]);
      const fd = new FormData();
      fd.append('image', blob, `bild-${i + 1}.jpg`);
      fd.append('rank', String(i + 1));
      await fetch(`${ETSY_API_BASE}/v3/application/shops/${encodeURIComponent(cfg.shopId)}/listings/${listingId}/images`, {
        method: 'POST',
        headers: etsyHeaders(cfg),
        body: fd,
      });
    } catch (imgErr) {
      console.warn(`Etsy-Bild ${i + 1} konnte nicht hochgeladen werden:`, imgErr);
    }
  }

  onProgress('Aktiviere Etsy-Inserat...', totalSteps, totalSteps);
  let activateRes: Response;
  try {
    activateRes = await fetch(
      `${ETSY_API_BASE}/v3/application/shops/${encodeURIComponent(cfg.shopId)}/listings/${listingId}`,
      {
        method: 'PATCH',
        headers: { ...etsyHeaders(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'active' }),
      },
    );
  } catch (e) {
    throw new ProviderError('network', `Etsy nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (activateRes.status < 200 || activateRes.status >= 300) {
    const text = await activateRes.text().catch(() => '');
    throw new ProviderError('server', `Etsy Fehler beim Aktivieren (${activateRes.status}): ${text.slice(0, 300)}`, activateRes.status);
  }
  const activated = (await activateRes.json().catch(() => null)) as { url?: string } | null;
  return {
    marketplace: 'etsy',
    externalId: String(listingId),
    url: activated?.url ?? draft?.url ?? `https://www.etsy.com/listing/${listingId}`,
    isDraft: false,
    title,
  };
}

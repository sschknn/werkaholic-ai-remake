import type { AdAnalysis, FacebookConfig } from '../../types';
import type { MarketplacePublishResult } from './registry';
import { loadSettings, saveSettings } from '../settings';
import { ProviderError } from '../ai';
import { parsePrice } from '../../utils/price';

export interface FacebookPublishOptions {
  onProgress?: (statusText: string, step: number, totalSteps: number) => void;
}

export const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com';

/** Secrets-freie Defaults: Catalog-ID/Token leer (= deaktiviert, Partner-only). */
export function defaultFacebookConfig(): FacebookConfig {
  return { catalogId: '', accessToken: '', sellerId: '', apiVersion: 'v20.0' };
}

/** Holt die Facebook-Konfiguration aus AppSettings oder den Defaults. */
export function getFacebookConfig(): FacebookConfig {
  try {
    const stored = loadSettings().facebook;
    if (!stored) return defaultFacebookConfig();
    return { ...defaultFacebookConfig(), ...stored };
  } catch {
    return defaultFacebookConfig();
  }
}

/** Speichert einen Facebook-Config-Patch persistent in AppSettings. */
export function saveFacebookConfig(patch: Partial<FacebookConfig>): FacebookConfig {
  const updated: FacebookConfig = { ...getFacebookConfig(), ...patch };
  const settings = loadSettings();
  saveSettings({ ...settings, facebook: updated });
  return updated;
}

/**
 * Prüft Catalog-Zugriff via GET /v{ver}/{catalog_id}?fields=id,name.
 * Gibt {ok, message} zurück (kein Throw bei Fehlkonfiguration).
 */
export async function verifyFacebookConnection(
  cfg: FacebookConfig = getFacebookConfig(),
): Promise<{ ok: boolean; message: string }> {
  if (!cfg.catalogId || !cfg.accessToken) {
    return { ok: false, message: 'Facebook Catalog-ID oder Token fehlt (Partner-Zugang erforderlich).' };
  }
  const ver = cfg.apiVersion || 'v20.0';
  try {
    const res = await fetch(
      `${FACEBOOK_GRAPH_BASE}/${ver}/${encodeURIComponent(cfg.catalogId)}?fields=id,name&access_token=${encodeURIComponent(cfg.accessToken)}`,
      { method: 'GET' },
    );
    if (res.ok) return { ok: true, message: 'Facebook-Catalog erreichbar.' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Facebook meldet: Token ungültig oder kein Partner-Zugang.' };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, message: `Facebook-Antwort (${res.status}): ${text.slice(0, 150)}` };
  } catch (e) {
    return { ok: false, message: `Verbindungsfehler: ${e instanceof Error ? e.message : 'Facebook nicht erreichbar'}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Veröffentlicht eine AdAnalysis in einen Facebook Product Catalog (NUR Partner).
 * Flow: POST /v{ver}/{catalog_id}/items_batch (CREATE) → handle →
 * GET check_batch_request_status (Poll, max 3x).
 *
 * Bild-Policy (dokumentiert): Die Catalog Batch API akzeptiert nur öffentlich
 * abrufbare image_link-URLs. DataURLs werden NICHT hochgeladen – ohne http(s)-
 * Bild bricht der Publish mit einem 'config'-Fehler ab ("gehostete Bild-URL
 * nötig"), statt still ein bildloses Item anzulegen. Begründung: Stille
 * bildlose Katalog-Items würden im Shop unvollständig wirken und der Batch-
 * Status ließe sich nicht sinnvoll zuordnen; der Nutzer soll stattdessen
 * zuerst eine gehostete URL hinterlegen.
 *
 * Signatur: (cfg, ad, images, opts) – analog zum Tradera-Referenz-Adapter.
 */
export async function publishFacebookListing(
  cfg: FacebookConfig,
  ad: AdAnalysis,
  images: string[],
  opts: FacebookPublishOptions = {},
): Promise<MarketplacePublishResult> {
  if (!cfg.catalogId || !cfg.accessToken) {
    throw new ProviderError('config', 'Facebook Catalog-ID oder Token fehlt (nur für zugelassene Partner verfügbar).');
  }
  const title = ad.title.trim().slice(0, 200);
  if (!title) {
    throw new ProviderError('validation', 'Titel fehlt – Inserat kann nicht erstellt werden.');
  }
  const imageLink = images.find((u) => u.startsWith('http://') || u.startsWith('https://'));
  if (!imageLink) {
    throw new ProviderError('config', 'Gehostete Bild-URL nötig – DataURLs werden von der Catalog Batch API nicht akzeptiert.');
  }
  const ver = cfg.apiVersion || 'v20.0';
  const onProgress = opts.onProgress ?? (() => undefined);
  const price = parsePrice(ad.price_estimate);
  const priceValue = Number.isFinite(price) && price > 0 ? price : 1;

  onProgress('Sende Facebook Catalog-Batch...', 1, 2);
  let batchRes: Response;
  try {
    batchRes = await fetch(
      `${FACEBOOK_GRAPH_BASE}/${ver}/${encodeURIComponent(cfg.catalogId)}/items_batch?access_token=${encodeURIComponent(cfg.accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'PRODUCT_ITEM',
          requests: [
            {
              method: 'CREATE',
              data: {
                id: cfg.sellerId ? `${cfg.sellerId}-${Date.now()}` : `werkaholic-${Date.now()}`,
                title,
                description: ad.description,
                price: `${priceValue.toFixed(2)} EUR`,
                image_link: imageLink,
                brand: ad.brand_detected ?? ad.category,
                availability: 'in stock',
                condition: /neu/i.test(ad.condition) ? 'new' : 'used',
                link: 'https://werkaholic.ai',
                partner_seller_id: cfg.sellerId || undefined,
                partner_item_country: 'DE',
              },
            },
          ],
        }),
      },
    );
  } catch (e) {
    throw new ProviderError('network', `Facebook nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (batchRes.status === 401 || batchRes.status === 403) {
    throw new ProviderError('auth', 'Facebook meldet: Token ungültig oder kein Partner-Zugang.', batchRes.status);
  }
  if (batchRes.status < 200 || batchRes.status >= 300) {
    const text = await batchRes.text().catch(() => '');
    throw new ProviderError('server', `Facebook Batch-Fehler (${batchRes.status}): ${text.slice(0, 300)}`, batchRes.status);
  }
  const batch = (await batchRes.json().catch(() => null)) as { handle?: string } | null;
  const handle = batch?.handle;
  if (!handle) {
    throw new ProviderError('validation', 'Ungültige Facebook-Antwort: Kein Batch-Handle erhalten.');
  }

  onProgress('Prüfe Facebook Batch-Status...', 2, 2);
  let lastStatus = 'unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);
    let statusRes: Response;
    try {
      statusRes = await fetch(
        `${FACEBOOK_GRAPH_BASE}/${ver}/check_batch_request_status?handle=${encodeURIComponent(handle)}&access_token=${encodeURIComponent(cfg.accessToken)}`,
        { method: 'GET' },
      );
    } catch (e) {
      throw new ProviderError('network', `Facebook nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (statusRes.ok) {
      const st = (await statusRes.json().catch(() => null)) as { status?: string } | null;
      lastStatus = st?.status ?? 'unknown';
      if (lastStatus === 'finished' || lastStatus === 'completed') break;
    }
  }
  if (lastStatus !== 'finished' && lastStatus !== 'completed') {
    console.warn(`Facebook Batch-Status: ${lastStatus} (Handle ${handle})`);
  }
  return {
    marketplace: 'facebook',
    externalId: handle,
    url: undefined,
    isDraft: false,
    title,
  };
}

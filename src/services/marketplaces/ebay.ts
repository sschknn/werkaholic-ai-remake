import type { AdAnalysis, EbayConfig } from '../../types';
import type { MarketplacePublishResult } from './registry';
import { loadSettings, saveSettings } from '../settings';
import { ProviderError } from '../ai';
import { parsePrice } from '../../utils/price';

export interface EbayPublishOptions {
  sku?: string;
  onProgress?: (statusText: string, step: number, totalSteps: number) => void;
}

export const EBAY_API_BASE = 'https://api.ebay.com';
export const EBAY_SANDBOX_BASE = 'https://api.sandbox.ebay.com';

/** Secrets-freie Defaults: Token/IDs leer, nur Marketplace/Currency/Sandbox vorbelegt. */
export function defaultEbayConfig(): EbayConfig {
  return {
    oAuthToken: '',
    marketplaceId: 'EBAY_DE',
    currency: 'EUR',
    categoryId: '',
    fulfillmentPolicyId: '',
    paymentPolicyId: '',
    returnPolicyId: '',
    merchantLocationKey: '',
    sandbox: false,
  };
}

export function getEbayBase(cfg: EbayConfig): string {
  return cfg.sandbox ? EBAY_SANDBOX_BASE : EBAY_API_BASE;
}

/** Holt die eBay-Konfiguration aus AppSettings oder den Defaults. */
export function getEbayConfig(): EbayConfig {
  try {
    const stored = loadSettings().ebay;
    if (!stored) return defaultEbayConfig();
    return { ...defaultEbayConfig(), ...stored };
  } catch {
    return defaultEbayConfig();
  }
}

/** Speichert einen eBay-Config-Patch persistent in AppSettings. */
export function saveEbayConfig(patch: Partial<EbayConfig>): EbayConfig {
  const updated: EbayConfig = { ...getEbayConfig(), ...patch };
  const settings = loadSettings();
  saveSettings({ ...settings, ebay: updated });
  return updated;
}

function ebayHeaders(cfg: EbayConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.oAuthToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

function errorDetail(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    const errors = d.errors as Array<{ message?: string }> | undefined;
    if (Array.isArray(errors) && typeof errors[0]?.message === 'string') return errors[0].message as string;
    if (typeof d.message === 'string') return d.message;
    return JSON.stringify(data).slice(0, 300);
  }
  return String(data ?? '').slice(0, 300);
}

async function ebayFetch(url: string, init: RequestInit): Promise<{ status: number; data: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new ProviderError('network', `eBay nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/** Mappt deutsche Zustandsangaben auf eBay-Condition-Enum (override via conditionMap möglich). */
export function mapEbayCondition(condition: string, conditionMap?: Record<string, string>): string {
  if (conditionMap) {
    for (const [k, v] of Object.entries(conditionMap)) {
      if (condition.toLowerCase().includes(k.toLowerCase())) return v;
    }
  }
  const c = condition.toLowerCase();
  if (c.includes('neu')) return 'NEW';
  if (c.includes('sehr gut') || c.includes('excellent') || c.includes('wie neu')) return 'USED_EXCELLENT';
  if (c.includes('gut')) return 'USED_GOOD';
  return 'USED_GOOD';
}

/** Nur öffentliche http(s)-Bild-URLs sind für eBay imageUrls tauglich; DataURLs filtern wir aus. */
export function hostedImageUrls(images: string[]): string[] {
  return images.filter((u) => u.startsWith('http://') || u.startsWith('https://'));
}

/** Prüft das OAuth-Token gegen GET /sell/inventory/v1/offer?limit=1. */
export async function verifyEbayConnection(
  cfg: EbayConfig = getEbayConfig(),
): Promise<{ ok: boolean; message: string }> {
  if (!cfg.oAuthToken) {
    return { ok: false, message: 'Kein eBay OAuth-Token hinterlegt (Scope sell.inventory erforderlich).' };
  }
  const base = getEbayBase(cfg);
  try {
    const res = await fetch(`${base}/sell/inventory/v1/offer?limit=1`, {
      method: 'GET',
      headers: ebayHeaders(cfg),
    });
    if (res.ok) return { ok: true, message: 'eBay-Verbindung OK (Sell Inventory API erreichbar).' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'eBay meldet: Token ungültig/abgelaufen oder Scope fehlt (sell.inventory).' };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, message: `eBay-Antwort (${res.status}): ${text.slice(0, 150)}` };
  } catch (e) {
    return { ok: false, message: `Verbindungsfehler: ${e instanceof Error ? e.message : 'eBay nicht erreichbar'}` };
  }
}

/**
 * Veröffentlicht eine AdAnalysis über die eBay Sell Inventory API.
 * Flow: PUT inventory_item/{sku} → POST offer → POST offer/{offerId}/publish.
 * Signatur: (cfg, ad, images, opts) – analog zum Tradera-Referenz-Adapter.
 *
 * DataURLs können von eBay nicht gehostet werden: In dem Fall wird das Item
 * ohne Bilder angelegt und per onProgress gewarnt ("manuell nachpflegen").
 */
export async function publishEbayListing(
  cfg: EbayConfig,
  ad: AdAnalysis,
  images: string[],
  opts: EbayPublishOptions = {},
): Promise<MarketplacePublishResult> {
  if (!cfg.oAuthToken) {
    throw new ProviderError('auth', 'eBay OAuth-Token fehlt (Scope sell.inventory). Bitte in den Einstellungen hinterlegen.');
  }
  if (!cfg.categoryId || !cfg.fulfillmentPolicyId || !cfg.paymentPolicyId || !cfg.returnPolicyId) {
    throw new ProviderError(
      'config',
      'eBay Listing-Policies unvollständig (categoryId, fulfillmentPolicyId, paymentPolicyId, returnPolicyId erforderlich).',
    );
  }
  const title = ad.title.trim().slice(0, 80);
  if (!title) {
    throw new ProviderError('validation', 'Titel fehlt – Inserat kann nicht erstellt werden.');
  }
  const base = getEbayBase(cfg);
  const onProgress = opts.onProgress ?? (() => undefined);
  const sku = opts.sku ?? `werkaholic-${Date.now()}`;
  const price = parsePrice(ad.price_estimate);
  const value = (Number.isFinite(price) && price > 0 ? price : 1).toFixed(2);
  const hosted = hostedImageUrls(images);
  const totalSteps = 3;

  onProgress('Lege eBay Inventory-Item an...', 1, totalSteps);
  const itemBody: Record<string, unknown> = {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: mapEbayCondition(ad.condition, cfg.conditionMap),
    product: {
      title,
      description: ad.description,
      aspects: {
        Marke: ad.brand_detected ? [ad.brand_detected] : undefined,
        Zustand: [ad.condition],
        Kategorie: [ad.category],
      },
      ...(hosted.length > 0 ? { imageUrls: hosted } : {}),
    },
  };
  const put = await ebayFetch(`${base}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    headers: ebayHeaders(cfg, { 'Content-Language': 'de-DE' }),
    body: JSON.stringify(itemBody),
  });
  if (put.status === 401 || put.status === 403) {
    throw new ProviderError('auth', 'eBay meldet: Token ungültig oder Scope fehlt (sell.inventory).', put.status);
  }
  if (put.status < 200 || put.status >= 300) {
    throw new ProviderError('server', `eBay Fehler beim Anlegen des Items (${put.status}): ${errorDetail(put.data)}`, put.status);
  }
  if (hosted.length === 0 && images.length > 0) {
    onProgress('Bilder erfordern gehostete URLs – manuell nachpflegen', 1, totalSteps);
  }

  onProgress('Erstelle eBay-Angebot...', 2, totalSteps);
  const offerBody = {
    sku,
    marketplaceId: cfg.marketplaceId || 'EBAY_DE',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    pricingSummary: { price: { value, currency: cfg.currency || 'EUR' } },
    listingPolicies: {
      fulfillmentPolicyId: cfg.fulfillmentPolicyId,
      paymentPolicyId: cfg.paymentPolicyId,
      returnPolicyId: cfg.returnPolicyId,
    },
    categoryId: cfg.categoryId,
    merchantLocationKey: cfg.merchantLocationKey || undefined,
  };
  const offer = await ebayFetch(`${base}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: ebayHeaders(cfg, { 'Content-Language': 'de-DE' }),
    body: JSON.stringify(offerBody),
  });
  if (offer.status < 200 || offer.status >= 300) {
    throw new ProviderError('server', `eBay Fehler beim Erstellen des Offers (${offer.status}): ${errorDetail(offer.data)}`, offer.status);
  }
  const offerId = (offer.data as { offerId?: string } | null)?.offerId;
  if (!offerId) {
    throw new ProviderError('validation', 'Ungültige eBay-Antwort: Keine offerId erhalten.');
  }

  onProgress('Veröffentliche eBay-Angebot...', 3, totalSteps);
  const pub = await ebayFetch(`${base}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, {
    method: 'POST',
    headers: ebayHeaders(cfg, { 'Content-Language': 'de-DE' }),
  });
  if (pub.status < 200 || pub.status >= 300) {
    throw new ProviderError('server', `eBay Fehler beim Publish (${pub.status}): ${errorDetail(pub.data)}`, pub.status);
  }
  const listingId = (pub.data as { listingId?: string } | null)?.listingId ?? offerId;
  return {
    marketplace: 'ebay',
    externalId: listingId,
    url: `https://www.ebay.de/itm/${listingId}`,
    isDraft: false,
    title,
  };
}

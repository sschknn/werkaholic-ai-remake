import type { AdAnalysis, BrowserPublisherSettings } from '../types';

export interface PublisherStatus {
  loaded: boolean;
  url: string;
  loggedIn: boolean;
}

export interface ListingData {
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  images: string[];
}

export type PlatformId = 'kleinanzeigen' | 'ebay' | 'facebook';

export const PLATFORM_URLS: Record<PlatformId, string> = {
  kleinanzeigen: 'https://www.kleinanzeigen.de',
  ebay: 'https://www.ebay.de',
  facebook: 'https://www.facebook.com/marketplace',
};

export function isBrowserPublisherAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.werkscan?.browser;
}

export async function openPublisher(platform: PlatformId = 'kleinanzeigen'): Promise<{ ok: boolean; error?: string }> {
  if (!isBrowserPublisherAvailable()) {
    return { ok: false, error: 'Browser-Publisher nicht verfügbar (Electron erforderlich).' };
  }
  try {
    const url = PLATFORM_URLS[platform];
    const resp = await (window.werkscan.browser.openPublisher as (url: string) => Promise<{ ok: boolean }>) (url);
    return resp;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function closePublisher(): Promise<{ ok: boolean }> {
  if (!isBrowserPublisherAvailable()) return { ok: false };
  try {
    return await (window.werkscan.browser.closePublisher as () => Promise<{ ok: boolean }>) ();
  } catch (e) {
    return { ok: false };
  }
}

export async function getStatus(): Promise<PublisherStatus> {
  if (!isBrowserPublisherAvailable()) return { loaded: false, url: '', loggedIn: false };
  try {
    const status = await (window.werkscan.browser.getStatus as () => Promise<PublisherStatus>) ();
    return status || { loaded: false, url: '', loggedIn: false };
  } catch {
    return { loaded: false, url: '', loggedIn: false };
  }
}

export function onStatus(callback: (status: PublisherStatus) => void): void {
  if (!isBrowserPublisherAvailable()) return;
  (window.werkscan.browser.onStatus as (cb: (s: PublisherStatus) => void) => void)(callback);
}

export function adaptAnalysisToListing(
  analysis: AdAnalysis,
  heroImage: string,
  additionalImages?: string[],
  settings?: BrowserPublisherSettings,
): ListingData {
  const extractPrice = (raw: string): string => {
    const match = raw.match(/[\d.,]+/);
    return match ? match[0].replace(',', '.') : '';
  };

  const category = settings?.defaultCategory || analysis.category || 'Sonstiges';
  const condition = settings?.defaultCondition || analysis.condition || 'Gebraucht';

  const desc = [
    analysis.description,
    analysis.brand_detected ? `Marke: ${analysis.brand_detected}` : '',
    analysis.high_value_attributes && analysis.high_value_attributes.length > 0
      ? `Besondere Merkmale: ${analysis.high_value_attributes.join(', ')}` : '',
    analysis.weight_estimate ? `Gewicht: ${analysis.weight_estimate}` : '',
    analysis.shipping_cost ? `Versand: ${analysis.shipping_cost}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    title: analysis.title.slice(0, 60),
    description: desc.slice(0, 2000),
    price: extractPrice(analysis.price_estimate),
    category,
    condition,
    images: [heroImage, ...(additionalImages ?? [])].filter(Boolean),
  };
}

export async function postListingFlow(
  analysis: AdAnalysis,
  heroImage: string,
  additionalImages?: string[],
  settings?: BrowserPublisherSettings,
  platform: PlatformId = 'kleinanzeigen',
): Promise<{ ok: boolean; error?: string; step?: string }> {
  if (!isBrowserPublisherAvailable()) {
    return { ok: false, error: 'Browser-Publisher nicht verfügbar (Electron erforderlich).', step: 'check' };
  }

  const openResult = await openPublisher(platform);
  if (!openResult.ok) {
    return { ok: false, error: openResult.error, step: 'open' };
  }

  const data = adaptAnalysisToListing(analysis, heroImage, additionalImages, settings);

  const postResult = await fillForm(data);
  if (!postResult.ok) {
    return { ok: false, error: postResult.error, step: 'fill' };
  }

  return { ok: true, step: 'complete' };
}

async function fillForm(data: ListingData): Promise<{ ok: boolean; error?: string }> {
  if (!isBrowserPublisherAvailable()) {
    return { ok: false, error: 'Browser-Publisher nicht verfügbar.' };
  }
  try {
    const resp = await (window.werkscan.browser.postListing as (data: ListingData) => Promise<{ ok: boolean; error?: string; result?: unknown }>) (data);
    if (!resp.ok) return { ok: false, error: resp.error || 'Unbekannter Fehler beim Ausfüllen.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

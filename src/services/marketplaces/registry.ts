import type { AdAnalysis } from '../../types';
import { ProviderError } from '../ai';
import { getTraderaConfig, publishListing as publishTraderaListing } from '../tradera';
import { getEbayConfig, publishEbayListing } from './ebay';
import { getEtsyConfig, publishEtsyListing } from './etsy';
import { getHoodConfig, publishHoodListing } from './hood';
import { getFacebookConfig, publishFacebookListing } from './facebook';

export type MarketplaceId =
  | 'tradera'
  | 'ebay'
  | 'etsy'
  | 'hood'
  | 'facebook'
  | 'kleinanzeigen'
  | 'vinted'
  | 'ricardo'
  | 'willhaben';

export interface MarketplaceInfo {
  id: MarketplaceId;
  name: string;
  region: string;
  status: 'live' | 'partner' | 'unsupported';
  authHint: string;
  fallbackHint: string;
}

export const MARKETPLACES: MarketplaceInfo[] = [
  {
    id: 'tradera',
    name: 'Tradera',
    region: 'SE',
    status: 'live',
    authHint: 'App-Key + Token-Login (X-App-Id, X-User-Token)',
    fallbackHint: 'Direkt-Publish via Tradera API',
  },
  {
    id: 'ebay',
    name: 'eBay',
    region: 'DE',
    status: 'live',
    authHint: 'OAuth2 User-Token, Scope sell.inventory',
    fallbackHint: 'Direkt-Publish via Sell Inventory API (gehostete Bild-URLs nötig)',
  },
  {
    id: 'etsy',
    name: 'Etsy',
    region: 'INTL',
    status: 'live',
    authHint: 'x-api-key + Bearer Token, Scope listings_w',
    fallbackHint: 'Direkt-Publish via API v3 (draft → Bilder → activate)',
  },
  {
    id: 'hood',
    name: 'Hood.de',
    region: 'DE',
    status: 'live',
    authHint: 'Platin-Shop: AccountName + Schnittstellen-Passwort, konfigurierbare apiUrl',
    fallbackHint: 'CSV-Export (buildHoodCsv/downloadHoodCsv)',
  },
  {
    id: 'facebook',
    name: 'Facebook Marketplace',
    region: 'DE',
    status: 'partner',
    authHint: 'Nur für zugelassene Partner (Graph API Catalog: Catalog-ID + Token)',
    fallbackHint: 'Partner-Catalog-Batch; ohne Partner-Zugang deaktiviert',
  },
  {
    id: 'kleinanzeigen',
    name: 'Kleinanzeigen',
    region: 'DE',
    status: 'unsupported',
    authHint: 'Keine Public Listing-API',
    fallbackHint: 'clipboard-deeplink: Clipboard-Export + Deep-Link (siehe exportService)',
  },
  {
    id: 'vinted',
    name: 'Vinted',
    region: 'EU',
    status: 'unsupported',
    authHint: 'Keine Public API (nur Pro-Allowlist)',
    fallbackHint: 'manual-csv: manuelles Anlegen, Daten per Clipboard/CSV übernehmen',
  },
  {
    id: 'ricardo',
    name: 'Ricardo',
    region: 'CH',
    status: 'unsupported',
    authHint: 'Öffentliche API am 01.09.2026 abgeschaltet',
    fallbackHint: 'manual-csv: manuelles Anlegen, Daten per Clipboard/CSV übernehmen',
  },
  {
    id: 'willhaben',
    name: 'Willhaben',
    region: 'AT',
    status: 'unsupported',
    authHint: 'Keine Public Listing-API',
    fallbackHint: 'manual-csv: manuelles Anlegen, Daten per Clipboard/CSV übernehmen',
  },
];

export interface MarketplacePublishResult {
  marketplace: MarketplaceId;
  externalId?: string;
  url?: string;
  isDraft: boolean;
  title: string;
}

export type MarketplaceProgress = (statusText: string, step: number, totalSteps: number) => void;

/** Re-Export des Tradera-Referenz-Adapters (bestehende Signatur bleibt unverändert). */
export { publishTraderaListing };

/**
 * Dispatcht einen Publish auf den gewählten Marktplatz.
 * Config wird jeweils aus AppSettings geladen (kein impliziter Global-State in der Signatur).
 * Unsupported-Marktplätze werfen ProviderError 'config' inkl. Fallback-Hinweis.
 */
export async function publishToMarketplace(
  id: MarketplaceId,
  ad: AdAnalysis,
  images: string[],
  onProgress?: MarketplaceProgress,
): Promise<MarketplacePublishResult> {
  switch (id) {
    case 'tradera': {
      const res = await publishTraderaListing(getTraderaConfig(), ad, images, { onProgress });
      return {
        marketplace: 'tradera',
        externalId: String(res.itemId || res.requestId),
        url: res.url,
        isDraft: res.isDraft,
        title: res.title,
      };
    }
    case 'ebay':
      return publishEbayListing(getEbayConfig(), ad, images, { onProgress });
    case 'etsy':
      return publishEtsyListing(getEtsyConfig(), ad, images, { onProgress });
    case 'hood':
      return publishHoodListing(getHoodConfig(), ad, images, { onProgress });
    case 'facebook':
      return publishFacebookListing(getFacebookConfig(), ad, images, { onProgress });
    case 'kleinanzeigen':
      throw new ProviderError(
        'config',
        'Kleinanzeigen hat keine Public Listing-API. Fallback: clipboard-deeplink (Clipboard-Export + Deep-Link, siehe exportService).',
      );
    case 'vinted':
      throw new ProviderError(
        'config',
        'Vinted hat keine Public API (nur Pro-Allowlist). Fallback: manual-csv (manuell anlegen).',
      );
    case 'ricardo':
      throw new ProviderError(
        'config',
        'Ricardo hat die öffentliche API am 01.09.2026 abgeschaltet. Fallback: manual-csv (manuell anlegen).',
      );
    case 'willhaben':
      throw new ProviderError(
        'config',
        'Willhaben hat keine Public Listing-API. Fallback: manual-csv (manuell anlegen).',
      );
  }
}

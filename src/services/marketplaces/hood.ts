import type { AdAnalysis, HoodConfig } from '../../types';
import type { MarketplacePublishResult } from './registry';
import { loadSettings, saveSettings } from '../settings';
import { ProviderError } from '../ai';

export interface HoodPublishOptions {
  category?: string;
  onProgress?: (statusText: string, step: number, totalSteps: number) => void;
}

/** Secrets-freie Defaults: Account/Passwort/URL leer (= deaktiviert). */
export function defaultHoodConfig(): HoodConfig {
  return { accountName: '', accountPass: '', apiUrl: '' };
}

/** Holt die Hood-Konfiguration aus AppSettings oder den Defaults. */
export function getHoodConfig(): HoodConfig {
  try {
    const stored = loadSettings().hood;
    if (!stored) return defaultHoodConfig();
    return { ...defaultHoodConfig(), ...stored };
  } catch {
    return defaultHoodConfig();
  }
}

/** Speichert einen Hood-Config-Patch persistent in AppSettings. */
export function saveHoodConfig(patch: Partial<HoodConfig>): HoodConfig {
  const updated: HoodConfig = { ...getHoodConfig(), ...patch };
  const settings = loadSettings();
  saveSettings({ ...settings, hood: updated });
  return updated;
}

function csvCell(value: string): string {
  const flat = value.replace(/[\r\n;]+/g, ' ').trim();
  return `"${flat.replace(/"/g, '""')}"`;
}

/**
 * Baut das Hood-CSV-Import-Format als Fallback für alle
 * (für Nutzer ohne Platin-Shop-Direkt-API).
 * Format: Titel;Beschreibung;Preis;Kategorie (Header + 1 Datenzeile).
 */
export function buildHoodCsv(ad: AdAnalysis): string {
  const header = 'Titel;Beschreibung;Preis;Kategorie';
  const row = [csvCell(ad.title), csvCell(ad.description), csvCell(ad.price_estimate), csvCell(ad.category)].join(';');
  return `${header}\n${row}\n`;
}

/** Lädt das Hood-CSV als Datei herunter (Browser-Blob-Download). */
export function downloadHoodCsv(ad: AdAnalysis): void {
  const csv = buildHoodCsv(ad);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ad.title.slice(0, 30).replace(/[^\wäöüÄÖÜß-]+/gi, '_') || 'hood-import'}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Veröffentlicht eine AdAnalysis über die Hood-Platin-Shop-API.
 * Da keine öffentliche Doku vorliegt, POST als JSON {auth, item} an die
 * konfigurierbare apiUrl. Ohne apiUrl → 'config'-Fehler mit CSV-Hinweis.
 * Signatur: (cfg, ad, images, opts) – analog zum Tradera-Referenz-Adapter.
 */
export async function publishHoodListing(
  cfg: HoodConfig,
  ad: AdAnalysis,
  images: string[],
  opts: HoodPublishOptions = {},
): Promise<MarketplacePublishResult> {
  if (!cfg.apiUrl) {
    throw new ProviderError('config', 'Platin-Shop API-URL fehlt – nutze CSV-Export (buildHoodCsv/downloadHoodCsv).');
  }
  if (!cfg.accountName || !cfg.accountPass) {
    throw new ProviderError('auth', 'Hood AccountName oder Schnittstellen-Passwort fehlt. Bitte in den Einstellungen hinterlegen.');
  }
  const title = ad.title.trim().slice(0, 80);
  if (!title) {
    throw new ProviderError('validation', 'Titel fehlt – Inserat kann nicht erstellt werden.');
  }
  const onProgress = opts.onProgress ?? (() => undefined);
  onProgress('Sende Inserat an Hood...', 1, 1);
  let res: Response;
  try {
    res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        auth: { accountName: cfg.accountName, accountPass: cfg.accountPass },
        item: {
          Titel: title,
          Beschreibung: ad.description,
          Preis: ad.price_estimate,
          Kategorie: opts.category ?? ad.category,
          Zustand: ad.condition,
          Bilder: images,
        },
      }),
    });
  } catch (e) {
    throw new ProviderError('network', `Hood nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProviderError('auth', 'Hood meldet: AccountName/Passwort ungültig.', res.status);
  }
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text().catch(() => '');
    throw new ProviderError('server', `Hood Fehler (${res.status}): ${text.slice(0, 300)}`, res.status);
  }
  const data = (await res.json().catch(() => null)) as { itemId?: number | string; url?: string } | null;
  const externalId = data?.itemId !== undefined ? String(data.itemId) : undefined;
  return {
    marketplace: 'hood',
    externalId,
    url: data?.url,
    isDraft: false,
    title,
  };
}

import type { AdAnalysis, TraderaConfig } from '../types'
import { loadSettings, saveSettings } from './settings'
import { ProviderError } from './ai'

export interface TraderaCategory {
  id: number
  name: string
  fullName?: string
}

export interface TraderaListingResult {
  requestId: number
  itemId: number
  url: string
  title: string
  price: number
  isDraft: boolean
}

export interface PublishListingOptions {
  categoryId?: number
  itemType?: 1 | 3
  startPrice?: number
  buyItNowPrice?: number
  duration?: number
  shippingCost?: number
  autoCommit?: boolean
  onProgress?: (statusText: string, step: number, totalSteps: number) => void
}

export const TRADERA_API_TIMEOUT_MS = 15_000
export const TRADERA_AUTH_BASE_URL = 'https://api.tradera.com/token-login?'

/** Secrets-freie Defaults: IDs/Strings leer bzw. 0/false; nur Typ/Dauer/Versand/Kurs vorbelegt. */
export function defaultTraderaConfig(): TraderaConfig {
  return {
    appId: '',
    appKey: '',
    publicKey: '',
    authorizationUrl: '',
    token: '',
    userId: '',
    tokenExpires: undefined,
    isConnected: false,
    defaultItemType: 3,
    defaultDuration: 7,
    defaultShippingProviderId: 6,
    defaultShippingCost: 0,
    autoCommit: false,
    currencyRateEurToSek: 11.5,
  }
}

/** Holt die Tradera-Konfiguration aus AppSettings (settings.ts) oder den Defaults. */
export function getTraderaConfig(): TraderaConfig {
  try {
    const stored = loadSettings().tradera
    if (!stored) return defaultTraderaConfig()
    return {
      ...defaultTraderaConfig(),
      ...stored,
      isConnected: Boolean(stored.token && stored.userId),
    }
  } catch {
    return defaultTraderaConfig()
  }
}

/** Speichert ein Tradera-Config-Patch persistent in AppSettings. */
export function saveTraderaConfig(patch: Partial<TraderaConfig>): TraderaConfig {
  const current = getTraderaConfig()
  const token = patch.token ?? current.token
  const userId = patch.userId ?? current.userId
  const updated: TraderaConfig = { ...current, ...patch, isConnected: Boolean(token && userId) }
  const settings = loadSettings()
  saveSettings({ ...settings, tradera: updated })
  return updated
}

/** Generiert die URL für den Tradera Token-Login Flow. */
export function getAuthUrl(cfg: TraderaConfig = getTraderaConfig()): string {
  const rawBase = cfg.authorizationUrl || TRADERA_AUTH_BASE_URL
  const base = rawBase.endsWith('?') ? rawBase : rawBase.includes('?') ? `${rawBase}&` : `${rawBase}?`
  return `${base}appId=${encodeURIComponent(cfg.appId)}&pkey=${encodeURIComponent(cfg.publicKey)}`
}

/** Extrahiert Token, User-ID und Ablaufdatum aus Callback-URL (Query oder Hash). */
export function parseTraderaCallback(
  urlStringOrSearch: string,
): { token?: string; userId?: string; exp?: string } | null {
  try {
    let search = urlStringOrSearch
    if (search.includes('?')) {
      search = search.substring(search.indexOf('?') + 1)
    } else if (search.includes('#')) {
      search = search.substring(search.indexOf('#') + 1)
    }
    const params = new URLSearchParams(search)
    const token = params.get('token')
    const userId = params.get('userId') || params.get('userid') || params.get('user_id')
    const exp = params.get('exp') || params.get('expires')
    if (token) {
      return {
        token: decodeURIComponent(token),
        userId: userId ? decodeURIComponent(userId) : undefined,
        exp: exp ? decodeURIComponent(exp) : undefined,
      }
    }
  } catch {
    // ungültige URL -> null
  }
  return null
}

/** API-Basis: im Browser derselbe Origin (Proxy), sonst direkt. */
function getTraderaApiBase(): string {
  if (typeof window !== 'undefined' && window.location.hostname !== '') {
    return '/api/tradera'
  }
  return 'https://api.tradera.com'
}

function buildHeaders(cfg: TraderaConfig, requireUser = false): Record<string, string> {
  const headers: Record<string, string> = {
    'X-App-Id': cfg.appId,
    'X-App-Key': cfg.appKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (requireUser && cfg.token && cfg.userId) {
    headers['X-User-Id'] = cfg.userId
    headers['X-User-Token'] = cfg.token
  }
  return headers
}

/** Prüft Token & App-Key gegen GET seller-items (Timeout 15s). */
export async function verifyTraderaConnection(
  cfg: TraderaConfig = getTraderaConfig(),
): Promise<{ ok: boolean; message: string; userId?: string }> {
  if (!cfg.token || !cfg.userId) {
    return { ok: false, message: 'Kein Benutzer-Token oder User-ID hinterlegt. Bitte zuerst anmelden.' }
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TRADERA_API_TIMEOUT_MS)
  try {
    const res = await fetch(`${getTraderaApiBase()}/v4/listings/seller-items`, {
      method: 'GET',
      headers: buildHeaders(cfg, true),
      signal: ctrl.signal,
    })
    if (res.ok) {
      return {
        ok: true,
        message: `Erfolgreich autorisiert als Tradera Verkäufer #${cfg.userId}!`,
        userId: cfg.userId,
      }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: 'Tradera meldet: Token abgelaufen oder Berechtigung verweigert (403 Forbidden). Bitte erneut anmelden.',
      }
    }
    const errText = await res.text().catch(() => '')
    return { ok: false, message: `Tradera Antwort (${res.status}): ${errText.slice(0, 150)}` }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, message: 'Verbindungsfehler: Zeitüberschreitung (15s) – Tradera Server nicht erreichbar.' }
    }
    return { ok: false, message: `Verbindungsfehler: ${e instanceof Error ? e.message : 'Tradera Server nicht erreichbar'}` }
  } finally {
    clearTimeout(t)
  }
}

/** Beliebte Tradera-Kategorien (nur öffentliche IDs/Namen, keine Secrets). */
export const POPULAR_CATEGORIES: TraderaCategory[] = [
  { id: 302432, name: 'Akkuschrauber & Schlagschrauber', fullName: 'Bygg & Verktyg > Maskiner > Skruv- & mutterdragare' },
  { id: 301790, name: 'Bohrmaschinen & Bohrhämmer', fullName: 'Bygg & Verktyg > Maskiner > Borrmaskiner' },
  { id: 343322, name: 'Winkelschleifer (Flex)', fullName: 'Bygg & Verktyg > Maskiner > Vinkelslipar' },
  { id: 301806, name: 'Schleifmaschinen & Multischleifer', fullName: 'Bygg & Verktyg > Maskiner > Slipmaskiner' },
  { id: 301792, name: 'Sägen (Kreis-, Stich- & Säbelsägen)', fullName: 'Bygg & Verktyg > Maskiner > Maskinsågar' },
  { id: 302433, name: 'Sonstige Maschinen & Elektrowerkzeuge', fullName: 'Bygg & Verktyg > Maskiner > Övriga maskiner' },
  { id: 302408, name: 'Handwerkzeuge (Schlüssel, Zangen, etc.)', fullName: 'Bygg & Verktyg > Verktyg' },
  { id: 302415, name: 'Werkstatt & Aufbewahrung', fullName: 'Bygg & Verktyg > Verkstad' },
  { id: 301811, name: 'Baubedarf & Heimwerker', fullName: 'Bygg & Verktyg > Övriga byggartiklar' },
  { id: 17, name: 'Unterhaltungselektronik & Audio', fullName: 'Hemelektronik' },
  { id: 12, name: 'Computer, IT & Zubehör', fullName: 'Datorer & Tillbehör' },
  { id: 26, name: 'Smartphones, Tablets & Zubehör', fullName: 'Telefoni & Tablets' },
  { id: 25, name: 'Sport, Outdoor & Freizeit', fullName: 'Sport & Fritid' },
  { id: 31, name: 'Haus, Garten & Haushalt', fullName: 'Hem & Hushåll' },
  { id: 2805, name: 'Sonstiges / Allgemein', fullName: 'Övrigt > Övrigt' },
]

/** Stichwort-Heuristik: schlägt anhand von Titel + Kategorie die beste Kategorie vor. */
export function suggestCategory(title: string, category = ''): TraderaCategory {
  const text = `${title} ${category}`.toLowerCase()
  if (text.includes('akkuschrauber') || text.includes('schrauber') || text.includes('mutterdragare') || text.includes('drill')) {
    return POPULAR_CATEGORIES[0]
  }
  if (text.includes('bohr') || text.includes('bohrhammer') || text.includes('schlagbohr')) {
    return POPULAR_CATEGORIES[1]
  }
  if (text.includes('flex') || text.includes('winkelschleifer') || text.includes('trennjäger')) {
    return POPULAR_CATEGORIES[2]
  }
  if (text.includes('schleif') || text.includes('bandschleifer') || text.includes('exzenterschleifer')) {
    return POPULAR_CATEGORIES[3]
  }
  if (text.includes('säge') || text.includes('stichsäge') || text.includes('kreissäge') || text.includes('kappsäge')) {
    return POPULAR_CATEGORIES[4]
  }
  if (text.includes('makita') || text.includes('bosch') || text.includes('dewalt') || text.includes('milwaukee') || text.includes('festool') || text.includes('hilti')) {
    return POPULAR_CATEGORIES[5]
  }
  if (text.includes('schlüssel') || text.includes('zange') || text.includes('hammer') || text.includes('knarre') || text.includes('ratsche') || text.includes('werkzeug')) {
    return POPULAR_CATEGORIES[6]
  }
  if (text.includes('werkbank') || text.includes('werkstatt') || text.includes('koffer') || text.includes('systainer')) {
    return POPULAR_CATEGORIES[7]
  }
  if (text.includes('handy') || text.includes('iphone') || text.includes('samsung') || text.includes('ipad') || text.includes('tablet')) {
    return POPULAR_CATEGORIES[11]
  }
  if (text.includes('laptop') || text.includes('computer') || text.includes('pc') || text.includes('tastatur') || text.includes('monitor')) {
    return POPULAR_CATEGORIES[10]
  }
  if (text.includes('radio') || text.includes('box') || text.includes('lautsprecher') || text.includes('kamera') || text.includes('fernseher')) {
    return POPULAR_CATEGORIES[9]
  }
  return POPULAR_CATEGORIES[8]
}

/** Rechnet eine EUR-Preisangabe (Einzelwert oder Range) in SEK-Start-/Sofortkaufpreis um. */
export function calculateTraderaPrice(priceEstimate: string, rate = 11.5): { startPrice: number; buyItNowPrice?: number } {
  try {
    const matches = priceEstimate.match(/(\d+[.,]?\d*)/g)
    if (!matches || matches.length === 0) {
      return { startPrice: 150 }
    }
    const numbers = matches.map((m) => parseFloat(m.replace(',', '.')))
    if (numbers.length >= 2) {
      const minEur = Math.min(...numbers)
      const maxEur = Math.max(...numbers)
      const startSek = Math.max(1, Math.round(minEur * rate))
      const binSek = Math.max(startSek + 50, Math.round(maxEur * rate))
      return { startPrice: startSek, buyItNowPrice: binSek }
    }
    const sek = Math.max(1, Math.round(numbers[0] * rate))
    return { startPrice: sek, buyItNowPrice: Math.round(sek * 1.25) }
  } catch {
    return { startPrice: 150 }
  }
}

async function fetchTraderaJson(url: string, cfg: TraderaConfig, body?: unknown): Promise<{ status: number; data: unknown }> {
  let res: Response
  try {
    res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: buildHeaders(cfg, true),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    throw new ProviderError('network', `Tradera nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`)
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

function traderaErrorDetail(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>
    if (typeof d.message === 'string') return d.message
    const err = d.error as Record<string, unknown> | undefined
    if (err && typeof err.message === 'string') return err.message
    return JSON.stringify(data).slice(0, 300)
  }
  return String(data ?? '').slice(0, 300)
}

/**
 * Veröffentlicht eine AdAnalysis auf Tradera (3 Schritte: items → images → commit).
 * Signatur: (cfg, ad, images, opts) – Config wird explizit übergeben (kein impliziter Global-State).
 */
export async function publishListing(
  cfg: TraderaConfig,
  ad: AdAnalysis,
  images: string[],
  opts: PublishListingOptions = {},
): Promise<TraderaListingResult> {
  if (!cfg.token || !cfg.userId) {
    throw new ProviderError('auth', 'Tradera ist nicht autorisiert. Bitte zuerst in den Einstellungen anmelden.')
  }
  const baseUrl = getTraderaApiBase()
  const onProgress = opts.onProgress ?? (() => undefined)

  const category = opts.categoryId ?? suggestCategory(ad.title, ad.category).id
  const itemType = opts.itemType ?? cfg.defaultItemType
  const duration = opts.duration ?? (itemType === 3 ? 30 : cfg.defaultDuration)
  const priceCalc = calculateTraderaPrice(ad.price_estimate, cfg.currencyRateEurToSek)
  const startPrice = opts.startPrice ?? priceCalc.startPrice
  const buyItNowPrice = opts.buyItNowPrice ?? (itemType === 3 ? startPrice : priceCalc.buyItNowPrice)
  const shippingCost = opts.shippingCost ?? cfg.defaultShippingCost
  const autoCommit = opts.autoCommit ?? cfg.autoCommit

  const cleanTitle = ad.title.trim().slice(0, 80)
  if (!cleanTitle) {
    throw new ProviderError('validation', 'Titel fehlt – Inserat kann nicht erstellt werden.')
  }
  const fullDescription = [
    ad.title,
    '',
    ad.description,
    '',
    `Zustand / Skick: ${ad.condition}`,
    ad.brand_detected ? `Hersteller: ${ad.brand_detected}` : '',
    ad.shipping_cost ? `Versandinfo: ${ad.shipping_cost}` : '',
    ad.keywords && ad.keywords.length > 0 ? `Suchbegriffe: ${ad.keywords.join(', ')}` : '',
    '',
    '---',
    'Erstellt mit Werkaholic AI - Produktscanner',
  ]
    .filter(Boolean)
    .join('\n')

  const isNew = ad.condition.toLowerCase().includes('neu') || ad.condition.toLowerCase().includes('new')
  const itemPayload: Record<string, unknown> = {
    title: cleanTitle,
    description: fullDescription,
    categoryId: category,
    duration,
    itemType,
    startPrice,
    autoCommit: false,
    itemAttributes: [isNew ? 1 : 2],
    acceptedBidderId: 4,
    paymentOptionIds: [16384, 4],
    shippingOptions: [{ shippingOptionId: cfg.defaultShippingProviderId || 6, cost: shippingCost }],
  }
  if (itemType === 1 && buyItNowPrice && buyItNowPrice > startPrice) {
    itemPayload.buyItNowPrice = buyItNowPrice
  } else if (itemType === 3) {
    itemPayload.buyItNowPrice = buyItNowPrice || startPrice
  }

  const imagesToUpload = images.slice(0, 5)
  const totalSteps = 2 + imagesToUpload.length
  onProgress('Erstelle Inserat-Entwurf auf Tradera...', 1, totalSteps)

  // --- Schritt 1: Entwurf anlegen ---
  const created = await fetchTraderaJson(`${baseUrl}/v4/listings/items`, cfg, itemPayload)
  if (created.status === 401 || created.status === 403) {
    throw new ProviderError('auth', 'Tradera meldet: Token abgelaufen oder Berechtigung verweigert. Bitte erneut anmelden.', created.status)
  }
  if (created.status < 200 || created.status >= 300) {
    throw new ProviderError('server', `Tradera Fehler beim Erstellen (${created.status}): ${traderaErrorDetail(created.data)}`, created.status)
  }
  const createdData = created.data as { requestId?: unknown; itemId?: unknown } | null
  const requestId = typeof createdData?.requestId === 'number' ? createdData.requestId : undefined
  const itemId = typeof createdData?.itemId === 'number' ? createdData.itemId : undefined
  if (requestId === undefined) {
    throw new ProviderError('validation', 'Ungültige Serverantwort von Tradera: Keine requestId erhalten.')
  }

  // --- Schritt 2: Bilder hochladen (max. 5, JPEG=1/PNG=2) ---
  for (let i = 0; i < imagesToUpload.length; i++) {
    const rawImg = imagesToUpload[i]
    onProgress(`Lade Produktbild ${i + 1} von ${imagesToUpload.length} hoch...`, 2 + i, totalSteps)
    try {
      let base64Data = rawImg
      let format = 1
      if (rawImg.includes(',')) {
        const parts = rawImg.split(',')
        base64Data = parts[1]
        if (parts[0].includes('png')) format = 2
      }
      const imgRes = await fetchTraderaJson(`${baseUrl}/v4/listings/items/${requestId}/images`, cfg, {
        imageData: base64Data,
        imageFormat: format,
        hasMega: false,
      })
      if (imgRes.status < 200 || imgRes.status >= 300) {
        console.warn(`Bild ${i + 1} Upload-Warnung:`, imgRes.status)
      }
    } catch (imgErr) {
      console.warn(`Bild ${i + 1} konnte nicht hochgeladen werden:`, imgErr)
    }
  }

  // --- Schritt 3: Commit (Veröffentlichung) ---
  if (autoCommit) {
    onProgress('Veröffentliche Inserat live auf Tradera...', totalSteps, totalSteps)
    const commit = await fetchTraderaJson(`${baseUrl}/v4/listings/items/${requestId}/commit`, cfg, {})
    if (commit.status < 200 || commit.status >= 300) {
      console.warn('Commit fehlgeschlagen, bleibt als Entwurf erhalten:', commit.status)
    }
  }

  return {
    requestId,
    itemId: itemId ?? 0,
    url: `https://www.tradera.com/item/${itemId ?? requestId}`,
    title: cleanTitle,
    price: startPrice,
    isDraft: !autoCommit,
  }
}

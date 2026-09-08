/**
 * Legacy-Wrapper (AdOutput-Schema) – für bestehende Tests/Callers.
 * Neue Implementierung: src/services/ai.ts (AdAnalysis-Schema, Provider opencode|openrouter).
 * Neue Re-Exporte unten; alte Funktionen bleiben bis zur finalen Migration grün.
 */
import { AD_CONDITIONS, SETTINGS_KEY, type AdOutput, type WerkaholicSettings } from '../types'
import { sanitizeTags, sanitizeText } from '../utils/sanitize'
import { buildAdPrompt } from './prompts'
import { ProviderError } from './ai'

export const REQUEST_TIMEOUT_MS = 30_000
export const MAX_RETRIES = 2
const BASE_DELAY_MS = 800
export const PLACEHOLDER_API_URL = 'https://api.opencode.example/v1/ad-generation'

export type OpenCodeErrorKind = 'auth' | 'rate-limit' | 'server' | 'network' | 'parse' | 'validation' | 'config'

export class OpenCodeError extends ProviderError {
  declare kind: OpenCodeErrorKind
  constructor(kind: OpenCodeErrorKind, message: string, status?: number) {
    super(kind, message, status)
    this.name = 'OpenCodeError'
    this.kind = kind
  }
}

export function getApiUrl(): string {
  const envUrl =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_OPEN_CODE_API_URL ||
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.OPEN_CODE_API_URL
  if (envUrl) return envUrl
  try {
    if (typeof localStorage === 'undefined') return PLACEHOLDER_API_URL
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw) as WerkaholicSettings
      if (s.apiUrl) return s.apiUrl
    }
  } catch {
    // ignore
  }
  return PLACEHOLDER_API_URL
}

/** Extrahiert JSON-Objekt aus Text (z. B. mit Markdown-Codefence oder Fließtext drumherum). */
export function extractJsonCandidate(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  if (trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed)
      return trimmed
    } catch {
      // fall through to brace scan
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

export function validateAdOutput(raw: unknown): AdOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new OpenCodeError('validation', 'KI-Antwort ist kein Objekt — erneut versuchen / manuell bearbeiten.')
  }
  const o = raw as Record<string, unknown>
  const title = sanitizeText(o.title, 140)
  const short_description = sanitizeText(o.short_description, 500)
  const long_description = sanitizeText(o.long_description, 5000)
  const category = sanitizeText(o.category, 80)
  const conditionRaw = sanitizeText(o.condition, 20)
  const price_text = sanitizeText(o.price_text, 40)
  const price_value = typeof o.price_value === 'string' ? Number(o.price_value) : (o.price_value as number)
  const tags = sanitizeTags(o.tags)
  const confidence = typeof o.confidence === 'string' ? Number(o.confidence) : (o.confidence as number)

  const missing: string[] = []
  if (!title) missing.push('title')
  if (!short_description) missing.push('short_description')
  if (!long_description) missing.push('long_description')
  if (!category) missing.push('category')
  if (!conditionRaw) missing.push('condition')
  if (!price_text) missing.push('price_text')
  if (missing.length > 0) {
    throw new OpenCodeError('validation', `KI-Antwort unvollständig (fehlt: ${missing.join(', ')}) — erneut versuchen / manuell bearbeiten.`)
  }
  if (!AD_CONDITIONS.includes(conditionRaw as (typeof AD_CONDITIONS)[number])) {
    throw new OpenCodeError(
      'validation',
      `Ungültiger Zustand "${conditionRaw}" (erwartet: ${AD_CONDITIONS.join('|')}) — erneut versuchen / manuell bearbeiten.`,
    )
  }
  if (!Number.isFinite(price_value) || price_value < 0) {
    throw new OpenCodeError('validation', 'Ungültiger Preis (price_value) — erneut versuchen / manuell bearbeiten.')
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new OpenCodeError('validation', 'Ungültige confidence (0–1 erwartet) — erneut versuchen / manuell bearbeiten.')
  }

  return {
    title,
    short_description,
    long_description,
    category,
    condition: conditionRaw,
    price_text,
    price_value,
    tags,
    confidence,
  }
}

export function parseAdOutput(text: string): AdOutput {
  const candidate = extractJsonCandidate(text)
  try {
    return validateAdOutput(JSON.parse(candidate))
  } catch (e) {
    if (e instanceof OpenCodeError) throw e
    throw new OpenCodeError('parse', 'KI-Antwort unverständlich — erneut versuchen / manuell bearbeiten.')
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function postOnce(prompt: string, apiKey: string, apiUrl: string): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        // Bequemlichkeit für OpenAI-kompatible Backends:
        model: 'default',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: ctrl.signal,
    })
    if (res.status === 401 || res.status === 403) {
      throw new OpenCodeError('auth', 'API Key ungültig oder abgelaufen — bitte in Einstellungen prüfen.', res.status)
    }
    if (res.status === 429) {
      throw new OpenCodeError('rate-limit', 'Rate Limit erreicht — bitte später versuchen.', res.status)
    }
    if (res.status >= 500) {
      throw new OpenCodeError('server', `Serverfehler (${res.status}) — Retry läuft / später versuchen.`, res.status)
    }
    if (res.status >= 400) {
      const body = await res.text().catch(() => '')
      throw new OpenCodeError('validation', `Anfrage fehlerhaft (${res.status}): ${body.slice(0, 300)}`, res.status)
    }
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as unknown
      // Unterstütze mehrere Antwortformen: {choices[0].message.content}, {text}, {output}, direkt AdOutput
      if (typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>
        const choiceContent = (d.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content
        if (typeof choiceContent === 'string') return choiceContent
        if (typeof d.text === 'string') return d.text
        if (typeof d.output === 'string') return d.output
        return JSON.stringify(data)
      }
      return String(data)
    }
    return await res.text()
  } catch (e) {
    if (e instanceof OpenCodeError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new OpenCodeError('network', 'Zeitüberschreitung (30s) — Netzwerk prüfen / später versuchen.')
    }
    throw new OpenCodeError('network', `Netzwerkfehler: ${e instanceof Error ? e.message : String(e)} — lokales Speichern möglich.`)
  } finally {
    clearTimeout(t)
  }
}

/**
 * Erzeugt aus Bild-Captions ein Kleinanzeigen-Inserat via Open Code API.
 * Timeout 30s, max. 2 Retries mit exponential backoff. Keine Bilder werden automatisch hochgeladen.
 */
export async function generateAdFromCaptions(
  imageCaptions: string[],
  apiKey: string,
  extraNotes = '',
): Promise<AdOutput> {
  if (!imageCaptions || imageCaptions.length === 0) {
    throw new OpenCodeError('config', 'Mindestens eine Bildbeschreibung erforderlich.')
  }
  if (!apiKey || !apiKey.trim()) {
    throw new OpenCodeError('auth', 'Kein API-Key gesetzt — bitte in Einstellungen hinterlegen.')
  }
  const apiUrl = getApiUrl()
  if (!apiUrl || apiUrl.includes('example')) {
    // Platzhalter-URL: Hinweis, aber trotzdem versuchen (Tests mocken fetch ohnehin)
    console.warn(`[openCodeService] OPEN_CODE_API_URL ist Platzhalter (${apiUrl}). Echte URL in .env.local setzen.`)
  }
  const prompt = buildAdPrompt(imageCaptions, extraNotes)
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const rawText = await postOnce(prompt, apiKey, apiUrl)
      return parseAdOutput(rawText)
    } catch (e) {
      lastError = e
      const kind = e instanceof OpenCodeError ? e.kind : 'network'
      // Keine Retries bei Auth/Config/Validation/Parse
      if (kind === 'auth' || kind === 'config' || kind === 'validation' || kind === 'parse') throw e
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt)
        continue
      }
      throw e
    }
  }
  throw lastError instanceof Error ? lastError : new OpenCodeError('network', 'Unbekannter Fehler — später versuchen.')
}

export function buildPlaceholderAd(captions: string[], extraNotes = ''): AdOutput {
  const first = captions[0] || 'Gegenstand'
  return {
    title: sanitizeText(first, 80) || 'Manueller Eintrag',
    short_description: 'Offline-Platzhalter — bitte manuell bearbeiten.',
    long_description: `Lokal gespeicherter Platzhalter (Netzwerk/API-Fehler). Captions:\n- ${captions.join('\n- ')}${extraNotes ? `\nNotizen: ${extraNotes}` : ''}`,
    category: 'Sonstiges',
    condition: 'Gut',
    price_text: 'VB',
    price_value: 0,
    tags: ['offline', 'platzhalter'],
    confidence: 0,
  }
}

// --- Neue AdAnalysis-API (Re-Exporte, kein Bruch bestehender Importe) ---
export {
  analyzeWithProvider,
  buildPlaceholderAnalysis,
  extractJson,
  validateAnalysis,
  ProviderError,
  OPENROUTER_API_URL,
  OPENROUTER_DEFAULT_MODEL,
  AI_REQUEST_TIMEOUT_MS,
  AI_MAX_RETRIES,
} from './ai'
export type { AnalyzeInput, ProviderErrorKind } from './ai'

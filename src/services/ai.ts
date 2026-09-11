import type { AdAnalysis, ProviderId } from '../types'
import { sanitizeTags, sanitizeText } from '../utils/sanitize'
import { getApiUrl, getProviderKey, getProviderModel } from './settings'
import { AD_ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserText } from './prompts'

export interface AnalyzeInput {
  images: string[]
  captions: string[]
  extraNotes: string
}

export type ProviderErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'parse'
  | 'validation'
  | 'config'
  | 'quota'

export class ProviderError extends Error {
  kind: ProviderErrorKind
  status?: number
  constructor(kind: ProviderErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    this.status = status
  }
}

export const AI_REQUEST_TIMEOUT_MS = 30_000
export const AI_MAX_RETRIES = 2
const AI_BASE_DELAY_MS = 800
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_DEFAULT_MODEL = 'openrouter/free'
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'
export const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'
export const XAI_DEFAULT_MODEL = 'grok-3-mini'
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash'
export const APP_REFERER = 'https://werkaholic.ai'
export const APP_TITLE = 'Werkaholic AI'

/** Extrahiert ein JSON-Objekt aus purem JSON, Markdown-Codefence oder Fließtext. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const candidates: string[] = []
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1].trim())
  candidates.push(trimmed)
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // nächsten Kandidaten versuchen
    }
  }
  throw new ProviderError('parse', 'KI-Antwort enthält kein gültiges JSON — erneut versuchen / manuell bearbeiten.')
}

function optionalText(value: unknown, maxLen: number): string | undefined {
  const s = sanitizeText(value, maxLen)
  return s ? s : undefined
}

function optionalStringList(value: unknown): string[] | undefined {
  const list = sanitizeTags(value)
  return list.length > 0 ? list : undefined
}

/** Validiert und sanitized eine rohe KI-Antwort zu einer AdAnalysis. */
export function validateAnalysis(raw: unknown): AdAnalysis {
  if (typeof raw !== 'object' || raw === null) {
    throw new ProviderError('validation', 'KI-Antwort ist kein Objekt — erneut versuchen / manuell bearbeiten.')
  }
  const o = raw as Record<string, unknown>
  if (typeof o.item_detected !== 'boolean') {
    throw new ProviderError(
      'validation',
      'KI-Antwort unvollständig (fehlt: item_detected) — erneut versuchen / manuell bearbeiten.',
    )
  }
  const title = sanitizeText(o.title, 140)
  const price_estimate = sanitizeText(o.price_estimate, 60)
  const condition = sanitizeText(o.condition, 40)
  const category = sanitizeText(o.category, 80)
  const description = sanitizeText(o.description, 5000)
  const keywords = sanitizeTags(o.keywords)
  const reasoning = sanitizeText(o.reasoning, 2000)

  const missing: string[] = []
  if (!title) missing.push('title')
  if (!price_estimate) missing.push('price_estimate')
  if (!condition) missing.push('condition')
  if (!category) missing.push('category')
  if (!description) missing.push('description')
  if (keywords.length === 0) missing.push('keywords')
  if (!reasoning) missing.push('reasoning')
  if (missing.length > 0) {
    throw new ProviderError(
      'validation',
      `KI-Antwort unvollständig (fehlt: ${missing.join(', ')}) — erneut versuchen / manuell bearbeiten.`,
    )
  }

  let confidence: number | undefined
  const rawConfidence = o.confidence
  if (rawConfidence !== undefined && rawConfidence !== null && rawConfidence !== '') {
    const n = typeof rawConfidence === 'string' ? Number(rawConfidence) : rawConfidence
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) {
      throw new ProviderError('validation', 'Ungültige confidence (0–1 erwartet) — erneut versuchen / manuell bearbeiten.')
    }
    confidence = n
  }

  const result: AdAnalysis = {
    item_detected: o.item_detected,
    title,
    price_estimate,
    condition,
    category,
    description,
    keywords,
    reasoning,
  }
  const brand = optionalText(o.brand_detected, 80)
  if (brand) result.brand_detected = brand
  const shipping = optionalText(o.shipping_cost, 60)
  if (shipping) result.shipping_cost = shipping
  const weight = optionalText(o.weight_estimate, 40)
  if (weight) result.weight_estimate = weight
  const attrs = optionalStringList(o.high_value_attributes)
  if (attrs) result.high_value_attributes = attrs
  if (confidence !== undefined) result.confidence = confidence
  return result
}

function parseAnalysis(text: string): AdAnalysis {
  try {
    return validateAnalysis(extractJson(text))
  } catch (e) {
    if (e instanceof ProviderError) throw e
    throw new ProviderError('parse', 'KI-Antwort unverständlich — erneut versuchen / manuell bearbeiten.')
  }
}

interface ResolvedProvider {
  key: string
  model: string
  url: string
  label: string
}

function resolveProvider(provider: ProviderId): ResolvedProvider {
  const labels: Record<ProviderId, string> = {
    opencode: 'OpenCode',
    openrouter: 'OpenRouter',
    openai: 'OpenAI',
    xai: 'xAI',
    gemini: 'Gemini',
  }
  const label = labels[provider] ?? provider
  if (!(provider in labels)) {
    throw new ProviderError('config', `Unbekannter KI-Provider: ${String(provider)} — Einstellungen prüfen.`)
  }
  const key = getProviderKey(provider)
  if (!key) {
    throw new ProviderError('auth', `Kein API-Key für ${label} – in Einstellungen hinterlegen.`)
  }
  if (provider === 'openrouter') {
    return { key, model: getProviderModel('openrouter') || OPENROUTER_DEFAULT_MODEL, url: OPENROUTER_API_URL, label }
  }
  if (provider === 'openai') {
    return { key, model: getProviderModel('openai') || OPENAI_DEFAULT_MODEL, url: OPENAI_API_URL, label }
  }
  if (provider === 'xai') {
    return { key, model: getProviderModel('xai') || XAI_DEFAULT_MODEL, url: XAI_API_URL, label }
  }
  if (provider === 'gemini') {
    return { key, model: getProviderModel('gemini') || GEMINI_DEFAULT_MODEL, url: GEMINI_API_URL, label }
  }
  const url = getApiUrl()
  if (!url) {
    throw new ProviderError('config', 'Keine API-URL für OpenCode konfiguriert – in Einstellungen oder .env.local hinterlegen.')
  }
  return { key, model: getProviderModel('opencode') || 'default', url, label }
}

function toDataUrl(img: string): string {
  const t = img.trim()
  if (t.startsWith('data:')) return t
  return `data:image/jpeg;base64,${t}`
}

function buildMessages(input: AnalyzeInput): unknown[] {
  const parts: unknown[] = [{ type: 'text', text: buildAnalysisUserText(input.captions, input.extraNotes) }]
  for (const img of input.images) {
    if (!img || !img.trim()) continue
    parts.push({ type: 'image_url', image_url: { url: toDataUrl(img) } })
  }
  return [
    { role: 'system', content: AD_ANALYSIS_SYSTEM_PROMPT },
    { role: 'user', content: parts },
  ]
}

function extractContent(data: unknown): string {
  if (typeof data === 'string') return data
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>
    const choices = d.choices as Array<{ message?: { content?: unknown; reasoning?: unknown } }> | undefined
    const content = choices?.[0]?.message?.content
    if (typeof content === 'string' && content) return content
    if (Array.isArray(content)) {
      const joined = content
        .map((p) => (typeof p === 'object' && p !== null ? (p as { text?: unknown }).text : undefined))
        .filter((t): t is string => typeof t === 'string')
        .join('')
      if (joined) return joined
    }
    if (typeof d.text === 'string' && d.text) return d.text
    if (typeof d.output === 'string' && d.output) return d.output
    const msgReasoning = choices?.[0]?.message?.reasoning
    if (typeof msgReasoning === 'string' && msgReasoning) return msgReasoning
    return JSON.stringify(data)
  }
  return String(data)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function postOnce(provider: ProviderId, cfg: ResolvedProvider, input: AnalyzeInput): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), AI_REQUEST_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    }
    const body: Record<string, unknown> = { model: cfg.model, messages: buildMessages(input) }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = APP_REFERER
      headers['X-Title'] = APP_TITLE
    }
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    console.log(`[AI] ${cfg.label} status=${res.status} url=${cfg.url}`)
    if (res.status === 401 || res.status === 403 || res.status === 402) {
      throw new ProviderError('auth', `API-Key für ${cfg.label} ungültig oder abgelaufen — bitte in Einstellungen prüfen.`, res.status)
    }
    if (res.status === 429) {
      throw new ProviderError('rate-limit', 'Rate Limit erreicht — bitte später erneut versuchen.', res.status)
    }
    if (res.status >= 500) {
      throw new ProviderError('server', `Serverfehler (${res.status}) — Retry läuft / später versuchen.`, res.status)
    }
    if (res.status >= 400) {
      const bodyText = await res.text().catch(() => '')
      throw new ProviderError('validation', `Anfrage fehlerhaft (${res.status}): ${bodyText.slice(0, 300)}`, res.status)
    }
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await res.json() as unknown
      const content = extractContent(json)
      console.log(`[AI] ${cfg.label} content_len=${content.length}`)
      return content
    }
    const text = await res.text()
    console.log(`[AI] ${cfg.label} text_len=${text.length}`)
    return text
  } catch (e) {
    if (e instanceof ProviderError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ProviderError('network', 'Zeitüberschreitung (30s) — Netzwerk prüfen / später versuchen.')
    }
    throw new ProviderError('network', `Netzwerkfehler: ${e instanceof Error ? e.message : String(e)} — lokales Speichern möglich.`)
  } finally {
    clearTimeout(t)
  }
}

/** Fallback-Reihenfolge: kostenlose Modelle zuerst. */
const PROVIDER_FALLBACK_CHAIN: ProviderId[] = ['openrouter', 'gemini', 'openai', 'xai', 'opencode']

/** Gibt die nächsten Provider in der Fallback-Kette zurück (exkl. aktuellen). */
function getFallbackProviders(current: ProviderId): ProviderId[] {
  const idx = PROVIDER_FALLBACK_CHAIN.indexOf(current)
  return idx >= 0 ? PROVIDER_FALLBACK_CHAIN.slice(idx + 1) : PROVIDER_FALLBACK_CHAIN
}

/**
 * Analysiert Bilder/Captions über den gewählten Provider zu einer AdAnalysis.
 * Timeout 30s, max. 2 Retries pro Provider. Bei auth/rate-limit/qu/server → nächsten Provider probieren.
 */
export async function analyzeWithProvider(provider: ProviderId, input: AnalyzeInput): Promise<AdAnalysis> {
  const hasImages = input.images.some((i) => i && i.trim().length > 0)
  const hasCaptions = input.captions.some((c) => c && c.trim().length > 0)
  if (!hasImages && !hasCaptions) {
    throw new ProviderError('config', 'Mindestens ein Bild oder eine Bildbeschreibung erforderlich.')
  }

  const providersToTry = [provider, ...getFallbackProviders(provider)]
  const errors: string[] = []
  let lastError: ProviderError | null = null

  for (const p of providersToTry) {
    const cfg = resolveProvider(p)
    for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
      try {
        const rawText = await postOnce(p, cfg, input)
        return parseAnalysis(rawText)
      } catch (e) {
        if (e instanceof ProviderError) {
          lastError = e
        }
        const kind = e instanceof ProviderError ? e.kind : 'network'
        if (kind === 'auth' || kind === 'rate-limit' || kind === 'quota') {
          errors.push(`${cfg.label}: ${e instanceof Error ? e.message : String(e)}`)
          break // nächsten Provider versuchen
        }
        if (kind === 'server') {
          if (attempt < AI_MAX_RETRIES) {
            await sleep(AI_BASE_DELAY_MS * 2 ** attempt)
            continue
          }
          errors.push(`${cfg.label}: Serverfehler`)
          break
        }
        if (kind === 'network') {
          if (attempt < AI_MAX_RETRIES) {
            await sleep(AI_BASE_DELAY_MS * 2 ** attempt)
            continue
          }
          errors.push(`${cfg.label}: Netzwerkfehler`)
          break
        }
        throw e // parse/validation/config → sofort werfen
      }
    }
  }

  const lastErr = errors.length > 0 ? errors.join(' | ') : 'Unbekannter Fehler'
  if (lastError && (lastError.kind === 'auth' || lastError.kind === 'rate-limit' || lastError.kind === 'quota')) {
    throw lastError
  }
  throw new ProviderError('network', `Alle Provider gescheitert: ${lastErr} — lokal speichern möglich.`)
}

/** Offline-Platzhalter ohne KI – immer manuell nachbearbeiten. */
export function buildPlaceholderAnalysis(captions: string[], extraNotes = ''): AdAnalysis {
  const first = captions.find((c) => c && c.trim())?.trim() || extraNotes.trim() || 'Gegenstand'
  return {
    item_detected: true,
    title: sanitizeText(first, 80) || 'Manueller Eintrag',
    price_estimate: 'VB',
    condition: 'Gebraucht',
    category: 'Sonstiges',
    description: `Offline-Platzhalter — bitte manuell bearbeiten.\nCaptions:\n- ${captions.join('\n- ')}${extraNotes ? `\nNotizen: ${extraNotes}` : ''}`,
    keywords: ['offline', 'platzhalter'],
    reasoning: 'Ohne KI-Analyse erstellt (Offline-Modus).',
    confidence: 0,
  }
}

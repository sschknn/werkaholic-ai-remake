import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  analyzeWithProvider,
  buildPlaceholderAnalysis,
  extractJson,
  ProviderError,
  validateAnalysis,
} from '../ai'
import { calculateTraderaPrice, suggestCategory } from '../tradera'
import { saveSettings } from '../settings'
import * as settings from '../settings'
import { defaultAppSettings } from '../../types'

const SPEC_RAW = {
  item_detected: true,
  title: 'Bosch Handbohrgerät mit Koffer (gebraucht)',
  price_estimate: '40€ - 60€',
  condition: 'Gebraucht',
  category: 'Werkzeug',
  description: 'Gebrauchtes Bosch Handbohrgerät mit Kratzern, voll funktionsfähig, inkl. Koffer.',
  keywords: ['Bosch', 'Handbohrgerät', 'Bohrer', 'Werkzeug', 'Koffer'],
  reasoning: 'Markengerät mit gutem Werterhalt, Koffer erhöht den Wert.',
  brand_detected: 'Bosch',
  confidence: 0.82,
}

function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
  stubLocalStorage()
  // Tests hermetisch halten: .env.local-Werte aus import.meta.env temporär blanken
  // (vi.stubEnv greift hier nicht durch; direkte Zuweisung schon).
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  for (const k of [
    'VITE_OPEN_CODE_API_KEY',
    'VITE_OPEN_CODE_API_URL',
    'OPEN_CODE_API_URL',
    'VITE_OPENROUTER_API_KEY',
    'VITE_OPENROUTER_MODEL',
    'VITE_OPENAI_API_KEY',
    'VITE_OPENAI_MODEL',
    'VITE_XAI_API_KEY',
    'VITE_XAI_MODEL',
    'VITE_GEMINI_API_KEY',
    'VITE_GEMINI_MODEL',
  ]) {
    if (env) env[k] = ''
  }
})

describe('extractJson', () => {
  it('parst pures JSON', () => {
    expect(extractJson(JSON.stringify(SPEC_RAW))).toMatchObject({ title: SPEC_RAW.title })
  })
  it('extrahiert aus Markdown-Codefence', () => {
    const text = 'Hier bitte:\n```json\n' + JSON.stringify(SPEC_RAW) + '\n```\nDanke'
    expect(extractJson(text)).toMatchObject({ price_estimate: '40€ - 60€' })
  })
  it('extrahiert aus Fließtext', () => {
    const text = 'Ergebnis: ' + JSON.stringify(SPEC_RAW) + ' Ende.'
    expect(extractJson(text)).toMatchObject({ item_detected: true })
  })
  it('wirft parse-Fehler bei Müll', () => {
    expect(() => extractJson('kein json hier')).toThrowError(ProviderError)
  })
})

describe('validateAnalysis', () => {
  it('akzeptiert Spec-Beispiel ["Gebrauchtes Bosch Handbohrgerät, Kratzer, inkl. Koffer"]', () => {
    const out = validateAnalysis(SPEC_RAW)
    expect(out.title).toContain('Bosch')
    expect(out.keywords).toContain('Koffer')
    expect(out.confidence).toBe(0.82)
  })
  it('wirft bei fehlenden Feldern (mit DE-Meldung)', () => {
    expect(() => validateAnalysis({})).toThrowError(ProviderError)
    expect(() => validateAnalysis({})).toThrowError(/item_detected|unvollständig/)
    expect(() => validateAnalysis({ item_detected: true })).toThrowError(/fehlt:.*title/)
  })
  it('sanitized HTML/script weg', () => {
    const out = validateAnalysis({ ...SPEC_RAW, title: '<script>alert(1)</script>Bohrer' })
    expect(out.title).not.toContain('<script>')
    expect(out.title).toContain('Bohrer')
  })
  it('wirft bei ungültiger confidence', () => {
    expect(() => validateAnalysis({ ...SPEC_RAW, confidence: 5 })).toThrowError(/confidence/)
  })
  it('confidence ist optional', () => {
    const { confidence: _dropped, ...rest } = SPEC_RAW
    expect(validateAnalysis(rest).confidence).toBeUndefined()
  })
})

describe('analyzeWithProvider', () => {
  it('sendet Bearer-Header und parst choices-Antwort (opencode)', async () => {
    saveSettings({
      ...defaultAppSettings(),
      activeProvider: 'opencode',
      opencode: { apiKey: 'test-key', model: '', apiUrl: 'https://test.example/v1' },
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(SPEC_RAW) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await analyzeWithProvider('opencode', {
      images: [],
      captions: ['Gebrauchtes Bosch Handbohrgerät, Kratzer, inkl. Koffer'],
      extraNotes: '',
    })
    expect(out.title).toBe(SPEC_RAW.title)
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('openrouter: Default-Modell + Referer/Title-Header', async () => {
    saveSettings({
      ...defaultAppSettings(),
      activeProvider: 'openrouter',
      openrouter: { apiKey: 'or-key', model: '' },
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SPEC_RAW), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await analyzeWithProvider('openrouter', { images: [], captions: ['Bohrer'], extraNotes: '' })
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = opts.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer or-key')
    expect(headers['HTTP-Referer']).toBeTruthy()
    expect(headers['X-Title']).toBeTruthy()
    expect(opts.body as string).toContain('openai/gpt-4o-mini')
  })

  it('openai: URL + Bearer-Header + Default-Modell', async () => {
    saveSettings({
      ...defaultAppSettings(),
      activeProvider: 'openai',
      openai: { apiKey: 'sk-test', model: '' },
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(SPEC_RAW) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await analyzeWithProvider('openai', { images: [], captions: ['Bohrer'], extraNotes: '' })
    expect(out.title).toBe(SPEC_RAW.title)
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect(opts.body as string).toContain('gpt-4o-mini')
  })

  it('xai: URL + Bearer-Header + Default-Modell', async () => {
    saveSettings({
      ...defaultAppSettings(),
      activeProvider: 'xai',
      xai: { apiKey: 'xai-test', model: '' },
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(SPEC_RAW) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await analyzeWithProvider('xai', { images: [], captions: ['Bohrer'], extraNotes: '' })
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.x.ai/v1/chat/completions')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer xai-test')
    expect(opts.body as string).toContain('grok-3-mini')
  })

  it('gemini: OpenAI-kompatible URL + Bearer-Header + Default-Modell', async () => {
    saveSettings({
      ...defaultAppSettings(),
      activeProvider: 'gemini',
      gemini: { apiKey: 'gem-test', model: '' },
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(SPEC_RAW) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await analyzeWithProvider('gemini', { images: [], captions: ['Bohrer'], extraNotes: '' })
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer gem-test')
    expect(opts.body as string).toContain('gemini-3.6-flash')
  })

  it('ungültiger Provider → config-Fehler', async () => {
    saveSettings(defaultAppSettings())
    await expect(
      analyzeWithProvider('unbekannt' as unknown as 'openai', { images: [], captions: ['x'], extraNotes: '' }),
    ).rejects.toMatchObject({ kind: 'config' })
  })

  it('wirft auth-Fehler bei 401 ohne Retry', async () => {
    saveSettings({
      ...defaultAppSettings(),
      activeProvider: 'opencode',
      opencode: { apiKey: 'bad-key', model: '', apiUrl: 'https://test.example/v1' },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      analyzeWithProvider('opencode', { images: [], captions: ['x'], extraNotes: '' }),
    ).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retry bei 500 und Erfolg beim 2. Versuch', async () => {
    saveSettings({
      ...defaultAppSettings(),
      activeProvider: 'opencode',
      opencode: { apiKey: 'k', model: '', apiUrl: 'https://test.example/v1' },
    })
    const ok = new Response(JSON.stringify(SPEC_RAW), { status: 200, headers: { 'content-type': 'application/json' } })
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('err', { status: 500 })).mockResolvedValueOnce(ok)
    vi.stubGlobal('fetch', fetchMock)
    const out = await analyzeWithProvider('opencode', { images: [], captions: ['x'], extraNotes: '' })
    expect(out.category).toBe('Werkzeug')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('wirft auth-Fehler ohne Key', async () => {
    saveSettings(defaultAppSettings())
    // .env.local-Keys (pro Modul eingebettet) ausblenden → Key fehlt garantiert
    const spy = vi.spyOn(settings, 'getProviderKey').mockReturnValue('')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(
        analyzeWithProvider('opencode', { images: [], captions: ['x'], extraNotes: '' }),
      ).rejects.toMatchObject({ kind: 'auth' })
      await expect(
        analyzeWithProvider('opencode', { images: [], captions: ['x'], extraNotes: '' }),
      ).rejects.toThrowError(/Kein API-Key/)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('buildPlaceholderAnalysis', () => {
  it('liefert Offline-Platzhalter', () => {
    const out = buildPlaceholderAnalysis(['Gebrauchtes Bosch Handbohrgerät, Kratzer, inkl. Koffer'], 'Notiz')
    expect(out.item_detected).toBe(true)
    expect(out.price_estimate).toBe('VB')
    expect(out.description).toContain('Handbohrgerät')
  })
})

describe('calculateTraderaPrice', () => {
  it('rechnet EUR-Range in SEK um', () => {
    expect(calculateTraderaPrice('150€ - 200€', 11.5)).toEqual({ startPrice: 1725, buyItNowPrice: 2300 })
  })
  it('rechnet Einzelpreis mit Aufschlag um', () => {
    expect(calculateTraderaPrice('45 €', 11.5)).toEqual({ startPrice: 518, buyItNowPrice: 648 })
  })
  it('Fallback bei unlesbarem Preis', () => {
    expect(calculateTraderaPrice('VB', 11.5)).toEqual({ startPrice: 150 })
  })
})

describe('suggestCategory', () => {
  it('erkennt Akkuschrauber', () => {
    expect(suggestCategory('Bosch Akkuschrauber 18V', 'Werkzeug').id).toBe(302432)
  })
  it('erkennt Smartphone', () => {
    expect(suggestCategory('iPhone 12, Top Zustand', 'Handy').id).toBe(26)
  })
  it('Fallback auf Baubedarf', () => {
    expect(suggestCategory('völlig unbekannter Kram xyz', '').id).toBe(301811)
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  OpenCodeError,
  buildPlaceholderAd,
  extractJsonCandidate,
  generateAdFromCaptions,
  parseAdOutput,
  validateAdOutput,
} from '../openCodeService'
import { sanitizeText } from '../../utils/sanitize'
import type { AdOutput } from '../../types'

const VALID: AdOutput = {
  title: 'Bosch Handbohrgerät mit Koffer',
  short_description: 'Robustes Bosch Handbohrgerät, gebraucht, voll funktionsfähig.',
  long_description: 'Verkauft wird ein gebrauchtes Bosch Handbohrgerät mit kleinem Koffer.',
  category: 'Werkzeug',
  condition: 'Gut',
  price_text: '45 €',
  price_value: 45.0,
  tags: ['Bosch', 'Handbohrgerät', 'Werkzeug'],
  confidence: 0.78,
}

beforeEach(() => {
  vi.unstubAllGlobals()
  if (typeof localStorage !== 'undefined') localStorage.clear()
  else {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  }
})

describe('extractJsonCandidate', () => {
  it('gibt pures JSON zurück', () => {
    expect(extractJsonCandidate(JSON.stringify(VALID))).toContain('"title"')
  })
  it('extrahiert aus Markdown-Codefence', () => {
    const text = 'Hier bitte:\n```json\n' + JSON.stringify(VALID) + '\n```\nDanke'
    expect(JSON.parse(extractJsonCandidate(text)).title).toBe(VALID.title)
  })
  it('extrahiert aus Fließtext', () => {
    const text = 'Ergebnis: ' + JSON.stringify(VALID) + ' Ende.'
    expect(JSON.parse(extractJsonCandidate(text)).price_value).toBe(45)
  })
})

describe('validateAdOutput', () => {
  it('akzeptiert Spec-Beispiel', () => {
    expect(validateAdOutput(VALID)).toEqual(VALID)
  })
  it('wirft bei fehlenden Feldern', () => {
    expect(() => validateAdOutput({})).toThrowError(OpenCodeError)
  })
  it('wirft bei ungültigem Zustand', () => {
    expect(() => validateAdOutput({ ...VALID, condition: 'Kaputt' })).toThrowError(/Zustand/)
  })
  it('sanitized HTML/script weg', () => {
    const out = validateAdOutput({ ...VALID, title: '<script>alert(1)</script>Bohrer' })
    expect(out.title).not.toContain('<script>')
  })
})

describe('parseAdOutput', () => {
  it('parst Spec-Beispiel mit Text drumherum', () => {
    const out = parseAdOutput('Bitte sehr:\n' + JSON.stringify(VALID))
    expect(out.price_text).toBe('45 €')
  })
  it('wirft parse-Fehler bei Müll', () => {
    expect(() => parseAdOutput('kein json hier')).toThrowError(OpenCodeError)
  })
})

describe('sanitizeText', () => {
  it('strippt script-Tags', () => {
    expect(sanitizeText('<script>alert(1)</script>Hallo')).toBe('Hallo')
  })
})

describe('generateAdFromCaptions', () => {
  it('sendet Bearer-Header und parst choices-Antwort', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(VALID) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await generateAdFromCaptions(['Gebrauchtes Bosch Handbohrgerät, Kratzer, inkl. Koffer'], 'test-key')
    expect(out.title).toBe(VALID.title)
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('wirft auth-Fehler bei 401 ohne Retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateAdFromCaptions(['x'], 'bad-key')).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retry bei 500 und Erfolg beim 2. Versuch', async () => {
    const ok = new Response(JSON.stringify(VALID), { status: 200, headers: { 'content-type': 'application/json' } })
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('err', { status: 500 })).mockResolvedValueOnce(ok)
    vi.stubGlobal('fetch', fetchMock)
    const out = await generateAdFromCaptions(['x'], 'k')
    expect(out.category).toBe('Werkzeug')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('wirft config-Fehler ohne Captions / ohne Key', async () => {
    await expect(generateAdFromCaptions([], 'k')).rejects.toMatchObject({ kind: 'config' })
    await expect(generateAdFromCaptions(['x'], '')).rejects.toMatchObject({ kind: 'auth' })
  })
})

describe('buildPlaceholderAd', () => {
  it('liefert offline-Platzhalter', () => {
    const out = buildPlaceholderAd(['Bohrer, Kratzer'], 'Notiz')
    expect(out.price_value).toBe(0)
    expect(out.long_description).toContain('Bohrer')
  })
})

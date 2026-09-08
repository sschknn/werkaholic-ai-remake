import { useState } from 'react'
import type { AdOutput } from '../types'
import { OpenCodeError, buildPlaceholderAd, generateAdFromCaptions } from '../services/openCodeService'
import { loadSettings } from '../services/settings'

export interface ScanImage {
  dataUrl: string
  object: string
  damage: string
  accessory: string
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

export function captionFor(img: ScanImage): string {
  const parts = [img.object.trim(), img.damage.trim(), img.accessory.trim()].filter(Boolean)
  return parts.join(', ') || 'Gegenstand auf Foto'
}

export default function Scanner({ onResult }: { onResult: (ad: AdOutput, images: string[], captions: string[], extraNotes: string, placeholder: boolean) => void }) {
  const [images, setImages] = useState<ScanImage[]>([])
  const [extraNotes, setExtraNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastCaptions, setLastCaptions] = useState<string[]>([])

  async function onFiles(files: FileList | null) {
    if (!files) return
    const picked = Array.from(files).slice(0, 6 - images.length)
    const dataUrls = await Promise.all(picked.map(fileToDataUrl))
    setImages((prev) => [...prev, ...dataUrls.map((dataUrl) => ({ dataUrl, object: '', damage: '', accessory: '' }))].slice(0, 6))
  }

  function update(i: number, patch: Partial<ScanImage>) {
    setImages((prev) => prev.map((img, idx) => (idx === i ? { ...img, ...patch } : img)))
  }

  async function createAd() {
    setError('')
    const settings = loadSettings()
    if (!settings.apiKey) {
      setError('Kein API-Key gesetzt — bitte in Einstellungen hinterlegen (Test C).')
      return
    }
    const captions = images.map(captionFor)
    if (captions.length === 0) {
      setError('Bitte 1–6 Bilder aufnehmen oder hochladen.')
      return
    }
    setLastCaptions(captions)
    setLoading(true)
    try {
      const ad = await generateAdFromCaptions(captions, settings.apiKey, extraNotes)
      onResult(ad, images.map((i) => i.dataUrl), captions, extraNotes, false)
    } catch (e) {
      const msg = e instanceof OpenCodeError ? e.message : e instanceof Error ? e.message : String(e)
      const kind = e instanceof OpenCodeError ? e.kind : ''
      setError(kind === 'auth' ? `${msg} (Einstellungen prüfen)` : msg)
    } finally {
      setLoading(false)
    }
  }

  function savePlaceholder() {
    const captions = lastCaptions.length > 0 ? lastCaptions : images.map(captionFor)
    const ad = buildPlaceholderAd(captions, extraNotes)
    onResult(ad, images.map((i) => i.dataUrl), captions, extraNotes, true)
  }

  return (
    <section>
      <h2>1. Scannen</h2>
      <p className="hint">1–6 Bilder. Bilder bleiben lokal — kein Upload ohne deine Aktion.</p>
      <input
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={(e) => void onFiles(e.target.files)}
        aria-label="Bilder aufnehmen oder hochladen"
      />
      {images.map((img, i) => (
        <div key={i} className="card">
          <img src={img.dataUrl} alt={`Scan ${i + 1}`} className="thumb" />
          <input placeholder="Gegenstand (z. B. Bosch Bohrgerät)" value={img.object} onChange={(e) => update(i, { object: e.target.value })} aria-label={`Gegenstand Bild ${i + 1}`} />
          <input placeholder="Sichtbare Schäden (z. B. Kratzer)" value={img.damage} onChange={(e) => update(i, { damage: e.target.value })} aria-label={`Schäden Bild ${i + 1}`} />
          <input placeholder="Zubehör (z. B. inkl. Koffer)" value={img.accessory} onChange={(e) => update(i, { accessory: e.target.value })} aria-label={`Zubehör Bild ${i + 1}`} />
          <small className="hint">Caption: {captionFor(img)}</small>
          <button type="button" className="ghost" onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}>
            Entfernen
          </button>
        </div>
      ))}
      <label>
        Zusatzinfos (optional)
        <textarea rows={2} value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} placeholder="z. B. funktioniert einwandfrei, VB…" />
      </label>
      <div className="row">
        <button onClick={() => void createAd()} disabled={loading || images.length === 0}>
          {loading ? 'KI erstellt Inserat…' : 'Inserat erstellen'}
        </button>
        {error && (
          <button type="button" className="ghost" onClick={savePlaceholder}>
            Als Platzhalter speichern
          </button>
        )}
      </div>
      {loading && <p role="status">Spinner: Anfrage läuft (Timeout 30s, max. 2 Retries)…</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  )
}

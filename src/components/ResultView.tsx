import { useState } from 'react'
import { AD_CONDITIONS, type AdOutput } from '../types'
import { sanitizeText } from '../utils/sanitize'
import { newId, saveHistoryItem } from '../services/storageService'
import { copyAdToClipboard, exportAdPdf, exportAdZip } from '../services/exportService'

export default function ResultView({
  initial,
  images,
  captions,
  extraNotes,
  placeholder,
  onSaved,
}: {
  initial: AdOutput
  images: string[]
  captions: string[]
  extraNotes: string
  placeholder: boolean
  onSaved: () => void
}) {
  const [ad, setAd] = useState<AdOutput>(initial)
  const [tagsText, setTagsText] = useState(initial.tags.join(', '))
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  function set<K extends keyof AdOutput>(k: K, v: AdOutput[K]) {
    setAd((prev) => ({ ...prev, [k]: v }))
  }

  async function save() {
    setMsg('')
    setSaving(true)
    try {
      const cleaned: AdOutput = {
        ...ad,
        title: sanitizeText(ad.title, 140),
        short_description: sanitizeText(ad.short_description, 500),
        long_description: sanitizeText(ad.long_description, 5000),
        category: sanitizeText(ad.category, 80),
        price_text: sanitizeText(ad.price_text, 40),
        price_value: Number(ad.price_value) || 0,
        tags: tagsText.split(',').map((t) => sanitizeText(t, 60)).filter(Boolean),
        confidence: Number(ad.confidence) || 0,
      }
      await saveHistoryItem({
        id: newId(),
        createdAt: new Date().toISOString(),
        images,
        captions,
        extraNotes,
        analysis: cleaned,
        placeholder,
      })
      setMsg('Gespeichert im Verlauf.')
      onSaved()
    } catch (e) {
      setMsg(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2>2. Ergebnis prüfen & bearbeiten {placeholder && '(Platzhalter)'}</h2>
      <label>Titel<input value={ad.title} onChange={(e) => set('title', e.target.value)} /></label>
      <label>Kurzbeschreibung<textarea rows={2} value={ad.short_description} onChange={(e) => set('short_description', e.target.value)} /></label>
      <label>Langbeschreibung<textarea rows={5} value={ad.long_description} onChange={(e) => set('long_description', e.target.value)} /></label>
      <div className="row">
        <label>Kategorie<input value={ad.category} onChange={(e) => set('category', e.target.value)} /></label>
        <label>Zustand
          <select value={ad.condition} onChange={(e) => set('condition', e.target.value)}>
            {AD_CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label>Preis-Text<input value={ad.price_text} onChange={(e) => set('price_text', e.target.value)} /></label>
        <label>Preis-Wert<input type="number" value={ad.price_value} onChange={(e) => set('price_value', Number(e.target.value))} /></label>
      </div>
      <label>Tags (kommagetrennt)<input value={tagsText} onChange={(e) => setTagsText(e.target.value)} /></label>
      <p className="hint">Confidence: {ad.confidence} · Bilder: {images.length} (nur lokal)</p>
      <div className="row">
        <button onClick={() => void save()} disabled={saving}>{saving ? 'Speichert…' : 'Save (lokal)'}</button>
        <button type="button" className="ghost" onClick={() => void copyAdToClipboard(ad).then(() => setMsg('Text kopiert.')).catch((e: unknown) => setMsg(String(e)))}>
          Kopieren für Kleinanzeige
        </button>
      </div>
      <div className="row">
        <button type="button" className="ghost" onClick={() => void exportAdPdf(ad, images).catch((e: unknown) => setMsg(String(e)))}>PDF Export</button>
        <button type="button" className="ghost" onClick={() => void exportAdZip(ad, images).catch((e: unknown) => setMsg(String(e)))}>ZIP Export</button>
      </div>
      {msg && <p role="status">{msg}</p>}
    </section>
  )
}

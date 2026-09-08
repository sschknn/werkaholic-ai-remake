import { useEffect, useState } from 'react'
import type { HistoryItem } from '../types'
import { deleteHistoryItem, getHistory } from '../services/storageService'
import { copyAdToClipboard } from '../services/exportService'

export default function HistoryView({ refreshToken }: { refreshToken: number }) {
  const [items, setItems] = useState<HistoryItem[]>([])

  async function load() {
    setItems(await getHistory())
  }

  useEffect(() => {
    void load()
  }, [refreshToken])

  return (
    <section>
      <h2>Verlauf ({items.length})</h2>
      {items.length === 0 && <p className="hint">Noch nichts gespeichert. Scanner → Inserat erstellen → Save.</p>}
      {items.map((it) => (
        <article key={it.id} className="card">
          <strong>{it.analysis.title}</strong>
          <small className="hint">{new Date(it.createdAt).toLocaleString()} · {it.analysis.price_text} · {it.placeholder ? 'Platzhalter' : 'KI'}</small>
          <div className="thumbs">
            {it.images.slice(0, 3).map((src, i) => (
              <img key={i} src={src} alt="" className="thumb-sm" />
            ))}
          </div>
          <p>{it.analysis.short_description}</p>
          <div className="row">
            <button type="button" className="ghost" onClick={() => void copyAdToClipboard(it.analysis)}>Kopieren</button>
            <button type="button" className="ghost" onClick={() => void deleteHistoryItem(it.id).then(load)}>Löschen</button>
          </div>
        </article>
      ))}
    </section>
  )
}

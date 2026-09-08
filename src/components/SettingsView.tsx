import { useState } from 'react'
import { loadSettings, saveSettings } from '../services/settings'

export default function SettingsView() {
  const [settings, setSettings] = useState(loadSettings)
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)

  function save() {
    saveSettings({ apiKey: settings.apiKey.trim(), apiUrl: settings.apiUrl?.trim() || undefined, model: settings.model?.trim() || undefined })
    setMsg('Einstellungen lokal gespeichert (localStorage: werkaholic_settings).')
  }

  return (
    <section>
      <h2>Einstellungen</h2>
      <label>
        API-Key (Free Trial API Key von Open Code)
        <input
          type={show ? 'text' : 'password'}
          value={settings.apiKey}
          onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
          placeholder="sk-..."
          autoComplete="off"
        />
      </label>
      <button type="button" className="ghost" onClick={() => setShow((v) => !v)}>{show ? 'Verbergen' : 'Anzeigen'}</button>
      <label>
        API-URL (optional, sonst VITE_OPEN_CODE_API_URL)
        <input
          value={settings.apiUrl || ''}
          onChange={(e) => setSettings((s) => ({ ...s, apiUrl: e.target.value }))}
          placeholder="https://…"
        />
      </label>
      <div className="row">
        <button onClick={save}>Speichern (nur lokal)</button>
      </div>
      {msg && <p role="status">{msg}</p>}
      <div className="card">
        <h3>So bekommst du den Key</h3>
        <ol>
          <li>Open Code Konto erstellen, Free Trial aktivieren.</li>
          <li>API-Key kopieren, hier einfügen, speichern.</li>
          <li>Key nie committen / nie teilen. Nur in <code>.env.local</code> oder hier (localStorage).</li>
        </ol>
        <p className="hint">Bilder bleiben standardmäßig lokal. Kein automatischer Upload an Provider ohne deine ausdrückliche Aktion.</p>
      </div>
    </section>
  )
}

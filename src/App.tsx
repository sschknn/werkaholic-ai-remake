import { useState } from 'react'
import Scanner from './components/Scanner'
import ResultView from './components/ResultView'
import SettingsView from './components/SettingsView'
import HistoryView from './components/HistoryView'
import type { AdOutput } from './types'
import './index.css'

type Tab = 'scan' | 'history' | 'settings'

interface Draft {
  ad: AdOutput
  images: string[]
  captions: string[]
  extraNotes: string
  placeholder: boolean
}

export default function App() {
  const [tab, setTab] = useState<Tab>('scan')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [historyTick, setHistoryTick] = useState(0)

  return (
    <div className="app">
      <header className="topbar">
        <h1>Werkaholic AI</h1>
        <nav>
          <button className={tab === 'scan' ? 'active' : ''} onClick={() => setTab('scan')}>Scan</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Verlauf</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
        </nav>
      </header>
      <main>
        {tab === 'scan' && (
          <>
            <Scanner
              onResult={(ad, images, captions, extraNotes, placeholder) => {
                setDraft({ ad, images, captions, extraNotes, placeholder })
              }}
            />
            {draft && (
              <ResultView
                key={JSON.stringify(draft.ad).slice(0, 50)}
                initial={draft.ad}
                images={draft.images}
                captions={draft.captions}
                extraNotes={draft.extraNotes}
                placeholder={draft.placeholder}
                onSaved={() => {
                  setHistoryTick((t) => t + 1)
                  setDraft(null)
                  setTab('history')
                }}
              />
            )}
          </>
        )}
        {tab === 'history' && <HistoryView refreshToken={historyTick} />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}

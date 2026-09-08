import { useCallback, useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import AppNav from './components/AppNav';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Analytics from './components/Analytics';
import LoadingScreen from './components/LoadingScreen';
import PlaceholderView from './components/PlaceholderView';
import Scanner from './components/Scanner';
import ResultView from './components/ResultView';
import SettingsView from './components/SettingsView';
import { ViewState, type AdAnalysis, type AppSettings, type HistoryItem } from './types';
import { deleteHistoryItem, getHistory, newId, saveHistoryItem } from './services/storageService';
import { loadSettings, saveSettings } from './services/settings';
import './index.css';

export default function App() {
  const [isLoadingApp, setIsLoadingApp] = useState(true);
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [current, setCurrent] = useState<HistoryItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initData = async () => {
      try {
        const items = await getHistory();
        if (!cancelled) setHistory(items);
      } catch (e) {
        console.error('DB Init Failed:', e);
      }
    };
    const minLoadTime = new Promise((r) => setTimeout(r, 1200));
    Promise.all([initData(), minLoadTime]).then(() => {
      if (!cancelled) setIsLoadingApp(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (current?.id === id) setCurrent(null);
    deleteHistoryItem(id).catch((err) => console.error('Fehler beim Löschen:', err));
  };

  const handleOpenItem = (item: HistoryItem) => {
    setCurrent(item);
    setView(ViewState.RESULTS);
  };

  const handleAnalysisComplete = useCallback(
    (result: AdAnalysis, heroImage: string, additionalImages?: string[]) => {
      const item: HistoryItem = {
        id: newId(),
        image: heroImage,
        additionalImages,
        date: new Date().toLocaleDateString('de-DE'),
        analysis: result,
      };
      setHistory((prev) => [item, ...prev]);
      saveHistoryItem(item).catch((e) => console.error('Speichern fehlgeschlagen:', e));
      setCurrent(item);
      setView(ViewState.RESULTS);
    },
    [],
  );

  const handleResultSave = useCallback(
    (updated: AdAnalysis, imgs?: string[]) => {
      if (!current) return;
      const next: HistoryItem = {
        ...current,
        analysis: updated,
        image: imgs?.[0] ?? current.image,
        additionalImages: imgs ? imgs.slice(1) : current.additionalImages,
      };
      setCurrent(next);
      setHistory((prev) => prev.map((h) => (h.id === next.id ? next : h)));
      saveHistoryItem(next).catch((e) => console.error('Update fehlgeschlagen:', e));
    },
    [current],
  );

  const handleSettingsSave = useCallback((s: AppSettings) => {
    saveSettings(s);
    setSettings(loadSettings());
    setView(ViewState.DASHBOARD);
  }, []);

  if (isLoadingApp) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-oil-950 flex font-sans text-stone-200 selection:bg-rust-500 selection:text-white">
      <AppNav view={view} onNavigate={setView} />
      <main className="flex-1 overflow-auto w-full relative">
        {view === ViewState.DASHBOARD && (
          <Dashboard history={history} onOpen={handleOpenItem} onDelete={handleDeleteItem} onShowAll={() => setView(ViewState.INVENTORY)} settings={settings} onScanComplete={handleAnalysisComplete} />
        )}
        {view === ViewState.INVENTORY && <Inventory history={history} onOpen={handleOpenItem} onDelete={handleDeleteItem} />}
        {view === ViewState.HISTORY && <Inventory history={history} onOpen={handleOpenItem} onDelete={handleDeleteItem} />}
        {view === ViewState.ANALYTICS && <Analytics history={history} />}
        {view === ViewState.SETTINGS && (
          <SettingsView settings={settings} onSave={handleSettingsSave} onBack={() => setView(ViewState.DASHBOARD)} />
        )}
        {view === ViewState.RESULTS &&
          (current ? (
            <ResultView
              result={current.analysis}
              images={[current.image, ...(current.additionalImages ?? [])].filter(Boolean)}
              onBack={() => setView(ViewState.DASHBOARD)}
              onSave={handleResultSave}
            />
          ) : (
            <PlaceholderView icon={ClipboardList} title="Ergebnis" text="Noch kein Scan geöffnet – starte einen Scan auf dem Dashboard." />
          ))}
        {view === ViewState.SCANNER && (
          <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-12 animate-fade-in">
            <Scanner onAnalysisComplete={handleAnalysisComplete} onCancel={() => setView(ViewState.DASHBOARD)} isEmbedded={false} settings={settings} />
          </div>
        )}
      </main>
    </div>
  );
}

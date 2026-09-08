import { History, ScanLine, Trash2, Zap } from 'lucide-react';
import type { AdAnalysis, AppSettings, HistoryItem } from '../types';
import Scanner from './Scanner';

interface Props {
  history: HistoryItem[];
  onOpen: (item: HistoryItem) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onShowAll: () => void;
  settings: AppSettings;
  onScanComplete: (result: AdAnalysis, heroImage: string, additionalImages?: string[]) => void;
}

export default function Dashboard({ history, onOpen, onDelete, onShowAll, settings, onScanComplete }: Props) {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto flex flex-col">
      <div className="flex justify-between items-center mb-2 md:hidden">
        <div className="flex items-center gap-2">
          <div className="bg-rust-600 rounded-lg p-1">
            <Zap className="w-4 h-4 text-white" fill="currentColor" />
          </div>
          <span className="font-bold text-lg text-white font-industrial">WERKSCAN</span>
        </div>
      </div>
      <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <section className="md:col-span-1 lg:col-span-2 min-h-[280px] rounded-2xl bg-oil-800 border border-stone-700/50 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 px-2 pt-2">
            <ScanLine className="w-6 h-6 text-rust-500" />
            <h2 className="text-lg font-bold text-white font-industrial uppercase">Neuer Scan</h2>
          </div>
          <Scanner onAnalysisComplete={onScanComplete} onCancel={() => undefined} isEmbedded settings={settings} />
        </section>
        <section className="md:col-span-1 bg-oil-800 rounded-2xl border border-stone-700/50 flex flex-col overflow-hidden max-h-[500px]">
          <div className="p-4 border-b border-stone-700 flex justify-between items-center bg-stone-900/50">
            <h3 className="font-bold text-stone-200 flex items-center gap-2 font-industrial uppercase">
              <History className="w-5 h-5 text-rust-500" />
              Schnellzugriff
            </h3>
            <button onClick={onShowAll} className="text-xs font-medium text-rust-500 hover:text-rust-400">
              ALLE
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {history.slice(0, 10).map((item) => (
              <div
                key={item.id}
                onClick={() => onOpen(item)}
                className="flex items-center gap-3 p-2 hover:bg-stone-700/50 rounded-lg cursor-pointer border border-transparent hover:border-stone-600 group"
              >
                {item.image ? (
                  <img src={item.image} alt="" className="w-12 h-12 rounded bg-stone-900 object-cover opacity-80 group-hover:opacity-100" />
                ) : (
                  <div className="w-12 h-12 rounded bg-stone-900" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-200 truncate">{item.analysis.title}</p>
                  <p className="text-xs text-rust-400 font-bold">{item.analysis.price_estimate}</p>
                </div>
                <button
                  onClick={(e) => onDelete(e, item.id)}
                  className="p-2 text-stone-500 hover:text-red-500 hover:bg-red-900/20 rounded-md"
                  title="Löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {history.length === 0 && <div className="text-center p-8 text-stone-600 text-sm">Keine Scans vorhanden.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

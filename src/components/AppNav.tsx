import { BarChart3, LayoutDashboard, Package, Settings, Zap } from 'lucide-react';
import { ViewState } from '../types';

const ITEMS = [
  { id: ViewState.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
  { id: ViewState.INVENTORY, icon: Package, label: 'Warenbestand' },
  { id: ViewState.ANALYTICS, icon: BarChart3, label: 'Auswertung' },
  { id: ViewState.SETTINGS, icon: Settings, label: 'Einstellungen' },
];

const MOBILE = [
  { id: ViewState.DASHBOARD, icon: LayoutDashboard, label: 'Scan' },
  { id: ViewState.INVENTORY, icon: Package, label: 'Bestand' },
  { id: ViewState.ANALYTICS, icon: BarChart3, label: 'Daten' },
  { id: ViewState.SETTINGS, icon: Settings, label: 'Settings' },
];

export default function AppNav({ view, onNavigate }: { view: ViewState; onNavigate: (v: ViewState) => void }) {
  return (
    <>
      <aside className="hidden md:flex w-64 flex-col bg-oil-950 border-r border-stone-800 h-screen sticky top-0 z-40">
        <div className="p-6">
          <div className="flex items-center gap-2 cursor-pointer mb-10" onClick={() => onNavigate(ViewState.DASHBOARD)}>
            <div className="bg-rust-600 rounded-lg p-1.5 shadow-lg shadow-rust-600/20">
              <Zap className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <span className="font-bold text-xl tracking-wide text-white font-industrial uppercase">
              Werkscan
            </span>
          </div>
          <nav className="space-y-2">
            {ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium border border-transparent ${
                  view === item.id
                    ? 'bg-rust-600/10 text-rust-500 border-rust-600/30'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-6 border-t border-stone-800">
          <div className="bg-stone-900 p-3 rounded-lg border border-stone-800">
            <p className="font-bold text-white font-industrial text-sm">Pro Account</p>
            <p className="text-xs text-stone-500">Lokaler Modus</p>
          </div>
        </div>
      </aside>
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-oil-900 border-t border-stone-800 flex justify-around p-3 z-50 pb-safe-area">
        {MOBILE.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
              view === item.id ? 'text-rust-500' : 'text-stone-500'
            }`}
          >
            <item.icon className="w-6 h-6" />
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

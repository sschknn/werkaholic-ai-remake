import { useMemo, useState } from 'react';
import { ArrowUpRight, Filter, Package, Search, Trash2 } from 'lucide-react';
import type { HistoryItem } from '../types';

interface Props {
  history: HistoryItem[];
  onOpen: (item: HistoryItem) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

export default function Inventory({ history, onOpen, onDelete }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const filtered = useMemo(
    () =>
      history.filter(
        (item) =>
          item.analysis.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.analysis.category.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [history, searchTerm],
  );

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-industrial uppercase">
            <Package className="w-6 h-6 text-rust-500" />
            Warenbestand
          </h1>
          <p className="text-stone-400 text-sm mt-1">Verwalte deine {history.length} erfassten Produkte</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              placeholder="Suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-oil-800 border border-stone-700 rounded-lg text-sm focus:ring-1 focus:ring-rust-500 outline-none text-white placeholder-stone-600"
            />
          </div>
          <button className="p-2 bg-oil-800 border border-stone-700 rounded-lg text-stone-400 hover:text-rust-500" title="Filter">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-oil-800 rounded-2xl border border-stone-700/50">
        {filtered.length > 0 ? (
          <div className="divide-y divide-stone-700">
            {filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpen(item)}
                className="p-3 md:p-4 hover:bg-stone-700/30 flex items-start md:items-center gap-3 group cursor-pointer"
              >
                <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-stone-900 relative border border-stone-700">
                  {item.image && <img src={item.image} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />}
                  {item.additionalImages && item.additionalImages.length > 0 && (
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 rounded">
                      +{item.additionalImages.length}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col md:grid md:grid-cols-3 gap-1 md:items-center">
                  <div className="md:col-span-2">
                    <h3 className="font-bold text-stone-200 truncate">{item.analysis.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs bg-stone-900 text-stone-400 px-2 py-0.5 rounded border border-stone-700">
                        {item.analysis.category}
                      </span>
                      <span className="text-xs text-stone-500">{item.date}</span>
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-bold text-rust-500 font-mono">{item.analysis.price_estimate}</p>
                    <p className="text-xs text-stone-500">{item.analysis.condition}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <button onClick={() => onOpen(item)} className="p-2 text-rust-500 hover:bg-rust-900/20 rounded hidden md:block" title="Details">
                    <ArrowUpRight className="w-5 h-5" />
                  </button>
                  <button onClick={(e) => onDelete(e, item.id)} className="p-2 text-stone-500 hover:text-red-500 hover:bg-red-900/20 rounded" title="Löschen">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-stone-600">
            <Package className="w-12 h-12 mb-4 opacity-20" />
            <p>Keine Produkte gefunden.</p>
          </div>
        )}
      </div>
    </div>
  );
}

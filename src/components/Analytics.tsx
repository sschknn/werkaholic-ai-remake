import { useMemo } from 'react';
import { BarChart3, DollarSign, Package } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryItem } from '../types';
import { parsePrice } from '../utils/price';

const COLORS = ['#ea580c', '#57534e', '#d97706', '#78716c', '#b45309'];
const tooltipStyle = { backgroundColor: '#1c1917', borderRadius: '8px', border: '1px solid #44403c', color: '#fff' };

export default function Analytics({ history }: { history: HistoryItem[] }) {
  const data = useMemo(() => {
    const totalItems = history.length;
    const totalValue = history.reduce((acc, i) => acc + parsePrice(i.analysis.price_estimate), 0);
    const averageValue = totalItems > 0 ? totalValue / totalItems : 0;
    const counts: Record<string, number> = {};
    history.forEach((i) => {
      const cat = i.analysis.category || 'Sonstige';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    const categoryData = Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const priceDistribution = history
      .slice(0, 20)
      .map((i, idx) => ({ name: `Item ${idx + 1}`, value: parsePrice(i.analysis.price_estimate) }));
    return { totalItems, totalValue, averageValue, categoryData, priceDistribution };
  }, [history]);

  const eur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-industrial uppercase">
        <BarChart3 className="w-6 h-6 text-rust-500" />
        Auswertung
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-gradient-to-br from-rust-600 to-rust-800 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden border border-rust-500/30">
          <p className="text-rust-100 text-sm font-medium mb-1 uppercase tracking-wider">Gesamtwert</p>
          <h2 className="text-3xl md:text-4xl font-black font-mono">{eur(data.totalValue)}</h2>
          <DollarSign className="absolute right-[-20px] bottom-[-20px] w-32 h-32 text-black/20 rotate-12" />
        </div>
        <div className="bg-oil-800 p-6 rounded-2xl border border-stone-700/50 flex justify-between items-start">
          <div>
            <p className="text-stone-400 text-sm font-bold uppercase tracking-wider mb-2">Produkte</p>
            <h2 className="text-3xl md:text-4xl font-black text-white">{data.totalItems}</h2>
          </div>
          <div className="p-3 bg-stone-900 rounded-lg text-stone-400 border border-stone-700">
            <Package className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-oil-800 p-6 rounded-2xl border border-stone-700/50">
          <p className="text-stone-400 text-sm font-bold uppercase tracking-wider mb-2">Ø Wert</p>
          <h2 className="text-3xl md:text-4xl font-black text-white font-mono">{eur(data.averageValue)}</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-oil-800 p-6 rounded-2xl border border-stone-700/50">
          <h3 className="text-lg font-bold text-white mb-6 font-industrial">Kategorien</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.categoryData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {data.categoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-oil-800 p-6 rounded-2xl border border-stone-700/50">
          <h3 className="text-lg font-bold text-white mb-6 font-industrial">Werteverteilung</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.priceDistribution}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#292524" />
                <XAxis hide dataKey="name" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#78716c', fontSize: 12 }} tickFormatter={(v: number) => `${v}€`} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#ea580c' }} labelStyle={{ display: 'none' }} />
                <Area type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

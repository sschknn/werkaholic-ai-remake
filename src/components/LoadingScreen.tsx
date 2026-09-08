import { Wrench } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-oil-950 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-oil-950 via-oil-900 to-oil-950" />
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <div className="mb-6 animate-fade-in">
          <div className="bg-rust-600 p-3 rounded-xl shadow-2xl shadow-rust-600/30 rotate-3">
            <Wrench className="w-12 h-12 text-white" />
          </div>
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-white uppercase tracking-widest font-industrial mb-2">
          Werkscan
        </h1>
        <p className="text-stone-400 text-sm tracking-[0.3em] uppercase mb-12">
          KI Inserate-Scanner
        </p>
        <div className="w-64 h-1.5 bg-stone-800 rounded-full overflow-hidden border border-stone-700">
          <div className="h-full bg-rust-500 w-full origin-left" style={{ animation: 'width 2s ease-out' }} />
        </div>
        <p className="mt-4 text-xs text-stone-500 animate-pulse">Initialisiere Datenbank…</p>
      </div>
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';

export default function PlaceholderView({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-24 md:pb-12 animate-fade-in">
      <div className="bg-oil-800 border border-stone-700/50 rounded-2xl p-10 text-center space-y-3">
        <Icon className="w-10 h-10 text-rust-500 mx-auto" />
        <h1 className="text-xl font-bold text-white font-industrial uppercase">{title}</h1>
        <p className="text-stone-400 text-sm">{text}</p>
      </div>
    </div>
  );
}

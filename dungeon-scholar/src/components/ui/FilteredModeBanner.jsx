import { BookOpen } from 'lucide-react';

export function FilteredModeBanner({ domainFilter, onExitFilter, accent = 'emerald' }) {
  const palette =
    accent === 'purple'
      ? { bg: 'rgba(126, 34, 206, 0.32)', border: '#a855f7', text: '#ede9fe' }
      : accent === 'sapphire'
        ? { bg: 'rgba(29, 78, 216, 0.32)', border: '#60a5fa', text: '#dbeafe' }
        : { bg: 'rgba(16, 185, 129, 0.32)', border: '#10b981', text: '#a7f3d0' };
  return (
    <div
      className="flex items-center justify-between gap-3 p-2.5 rounded-sm text-xs italic"
      style={{ background: palette.bg, border: `1.5px solid ${palette.border}`, color: palette.text }}
    >
      <span className="flex items-center gap-2">
        <BookOpen className="w-4 h-4" />
        Studying: <span className="font-bold">{domainFilter}</span>
      </span>
      {onExitFilter && (
        <button
          onClick={onExitFilter}
          className="px-2.5 py-1 rounded-sm text-[11px] italic font-bold hover:bg-black/30 transition"
          style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${palette.border}` }}
        >
          ← Back to Codex
        </button>
      )}
    </div>
  );
}

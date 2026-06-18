import { useState } from 'react';

export function CollapsibleGroup({ title, icon, color = 'amber', defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const palette = {
    red:      { border: 'rgba(185, 28, 28, 0.55)',  text: '#fca5a5', glow: 'rgba(239, 68, 68, 0.18)' },
    sapphire: { border: 'rgba(29, 78, 216, 0.55)',  text: '#93c5fd', glow: 'rgba(59, 130, 246, 0.18)' },
    amber:    { border: 'rgba(180, 83, 9, 0.55)',   text: '#fcd34d', glow: 'rgba(245, 158, 11, 0.18)' },
    purple:   { border: 'rgba(126, 34, 206, 0.55)', text: '#d8b4fe', glow: 'rgba(168, 85, 247, 0.18)' },
  }[color] || { border: 'rgba(180, 83, 9, 0.55)', text: '#fcd34d', glow: 'rgba(245, 158, 11, 0.18)' };
  return (
    <div className="rounded-sm relative" style={{
      background: 'linear-gradient(135deg, rgba(var(--surface-modal, 20, 12, 6), 0.55) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.92) 100%)',
      border: `2px solid ${palette.border}`,
      boxShadow: `0 0 20px ${palette.glow}, inset 0 0 18px rgba(0,0,0,0.5)`,
    }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 italic tracking-wider text-left"
        style={{ color: palette.text, textShadow: `0 0 10px ${palette.glow}` }}
      >
        <span className="text-lg w-4 inline-block text-center">{open ? '▾' : '▸'}</span>
        <span className="text-base font-bold">
          {icon ? <span className="mr-1">{icon}</span> : null}{title}
        </span>
        <span className="flex-1 h-px ml-2" style={{ background: `linear-gradient(to right, ${palette.border}, transparent)` }} />
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

import { Settings } from 'lucide-react';
import { OrnatePanel } from '../../components/ui/OrnatePanel.jsx';

// Phase 34b QA P10: theme picker — Dark (default) / Light (experimental) /
// Match System. Persisted in playerState.theme; applied via data-theme on
// the root element by an effect in DungeonScholarApp. The "light" variant
// is intentionally partial — only the body background swaps to off-white;
// dungeon panels stay dark by design. CSS in index.css.
function ThemePanel({ currentTheme, onSetTheme }) {
  const opts = [
    { id: 'dark', label: '🌙 Dark', desc: 'The default dungeon palette.' },
    { id: 'light', label: '☀ Light', desc: 'Off-white background, warmer panel tints. Dungeon aesthetic preserved.' },
    { id: 'system', label: '🖥 Match System', desc: 'Follows your OS color preference.' },
  ];
  return (
    <OrnatePanel color="amber">
      <h3 className="text-lg font-bold mb-3 text-amber-300 flex items-center gap-2 italic">
        <Settings className="w-5 h-5" /> ✦ Visual Theme ✦
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {opts.map(o => {
          const active = currentTheme === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onSetTheme?.(o.id)}
              aria-pressed={active}
              className={`text-left p-3 rounded-sm border-2 italic transition ${active ? 'border-amber-300 text-amber-100' : 'border-amber-700 text-amber-200 hover:border-amber-500'}`}
              style={{
                background: active ? 'rgba(120, 53, 15, 0.5)' : 'rgba(41, 24, 12, 0.7)',
                boxShadow: active ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none',
              }}
            >
              <div className="text-sm font-bold">{o.label}</div>
              <div className="text-[10px] italic text-amber-200/70 mt-1">{o.desc}</div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] italic text-amber-700/80 mt-3">
        ⓘ Light mode pairs an off-white page with warmer panel tints. The
        dungeon aesthetic is preserved — interiors stay dark-ish so the
        ornate borders and glow effects still read.
      </p>
    </OrnatePanel>
  );
}

export default ThemePanel;

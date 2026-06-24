export function OrnatePanel({ children, color = 'amber', className = '', glow = true }) {
  // Phase 38g: background swatch is sourced from a CSS variable so light
  // mode can re-theme without a React subscription. Border + glow stay
  // as hard-coded colors — they're tuned for visual punch and look the
  // same under both themes. Fallback values match the original dark
  // colors so non-CSS-var environments still render correctly.
  const colorMap = {
    amber: {
      border: 'rgba(180, 83, 9, 0.6)',
      glow: 'rgba(245, 158, 11, 0.2)',
      bgVar: 'var(--panel-bg-amber, rgba(var(--surface-amber, 41, 24, 12), 0.85))',
    },
    red: {
      border: 'rgba(185, 28, 28, 0.6)',
      glow: 'rgba(239, 68, 68, 0.2)',
      bgVar: 'var(--panel-bg-red, rgba(41, 12, 12, 0.85))',
    },
    emerald: {
      border: 'rgba(5, 150, 105, 0.6)',
      glow: 'rgba(16, 185, 129, 0.2)',
      bgVar: 'var(--panel-bg-emerald, rgba(12, 41, 27, 0.85))',
    },
    purple: {
      border: 'rgba(126, 34, 206, 0.6)',
      glow: 'rgba(168, 85, 247, 0.2)',
      bgVar: 'var(--panel-bg-purple, rgba(var(--surface-purple, 31, 12, 41), 0.85))',
    },
    sapphire: {
      border: 'rgba(29, 78, 216, 0.6)',
      glow: 'rgba(59, 130, 246, 0.2)',
      bgVar: 'var(--panel-bg-sapphire, rgba(12, 24, 41, 0.85))',
    },
    rose: {
      border: 'rgba(190, 24, 93, 0.6)',
      glow: 'rgba(244, 63, 94, 0.2)',
      bgVar: 'var(--panel-bg-rose, rgba(41, 12, 27, 0.85))',
    },
  };
  const c = colorMap[color] || colorMap.amber;
  return (
    <div
      className={`relative rounded-sm p-5 ${className}`}
      style={{
        background: `linear-gradient(135deg, ${c.bgVar} 0%, var(--panel-end, rgba(var(--surface-deep, 10, 6, 4), 0.9)) 100%)`,
        border: `2px solid ${c.border}`,
        boxShadow: glow ? `0 0 25px ${c.glow}, inset 0 0 20px rgba(0,0,0,0.5)` : 'inset 0 0 20px rgba(0,0,0,0.5)',
      }}
    >
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>
      {children}
    </div>
  );
}

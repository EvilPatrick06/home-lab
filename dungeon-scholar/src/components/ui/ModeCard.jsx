export function ModeCard({ title, desc, icon, color, onClick, featured, disabled, disabledReason }) {
  const colorMap = {
    amber: { grad: 'from-amber-500 to-yellow-700', border: 'rgba(180, 83, 9, 0.6)', glow: 'rgba(245, 158, 11, 0.3)', text: 'text-amber-200' },
    red: { grad: 'from-red-500 to-red-800', border: 'rgba(185, 28, 28, 0.6)', glow: 'rgba(239, 68, 68, 0.3)', text: 'text-red-200' },
    emerald: { grad: 'from-emerald-500 to-emerald-800', border: 'rgba(5, 150, 105, 0.6)', glow: 'rgba(16, 185, 129, 0.3)', text: 'text-emerald-200' },
    purple: { grad: 'from-purple-500 to-purple-800', border: 'rgba(126, 34, 206, 0.6)', glow: 'rgba(168, 85, 247, 0.3)', text: 'text-purple-200' },
    sapphire: { grad: 'from-sky-500 to-blue-800', border: 'rgba(29, 78, 216, 0.6)', glow: 'rgba(59, 130, 246, 0.3)', text: 'text-sky-200' },
    rose: { grad: 'from-rose-500 to-rose-800', border: 'rgba(190, 24, 93, 0.6)', glow: 'rgba(244, 63, 94, 0.3)', text: 'text-rose-200' },
  };
  const c = colorMap[color];
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={!!disabled}
      title={disabled ? (disabledReason || 'Unavailable for the active tome') : undefined}
      aria-disabled={!!disabled}
      className={`text-left rounded-sm p-5 transition-all group relative overflow-hidden ${featured ? 'md:col-span-2' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:scale-[1.02]'}`}
      style={{
        // Phase 38g: background sourced from CSS vars so light theme can
        // re-theme without a React subscription. Border + glow stay solid.
        background: `linear-gradient(135deg, var(--modecard-bg-start, rgba(41, 24, 12, 0.85)) 0%, var(--modecard-bg-end, rgba(10, 6, 4, 0.95)) 100%)`,
        border: `2px solid ${c.border}`,
        boxShadow: disabled ? 'inset 0 0 20px rgba(0,0,0,0.5)' : `0 0 20px ${c.glow}, inset 0 0 20px rgba(0,0,0,0.5)`,
      }}
    >
      <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
      <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

      {featured && (
        <div className="absolute top-3 right-3 text-xs px-3 py-1 rounded-sm text-amber-950 font-bold tracking-wider" style={{
          background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
          boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
          border: '1px solid #92400e',
        }}>
          ★ LEGENDARY ★
        </div>
      )}
      <div className={`w-14 h-14 rounded-sm bg-linear-to-br ${c.grad} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform border-2 border-amber-600/50`} style={{
        boxShadow: `0 0 15px ${c.glow}`,
      }}>
        {icon}
      </div>
      <h3 className={`text-xl font-bold mb-1 italic ${c.text}`} style={{ textShadow: `0 0 8px ${c.glow}` }}>{title}</h3>
      <p className="text-sm text-amber-100/70 italic leading-relaxed">{desc}</p>
    </button>
  );
}

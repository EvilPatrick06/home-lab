/** @param {{ label?: any, value?: any, sub?: any }} props */
export function RecordTile({ label, value, sub }) {
  return (
    <div
      className="p-3 rounded-sm relative"
      style={{
        background:
          'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.45) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.85) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        boxShadow: 'inset 0 0 12px rgba(0,0,0,0.4)',
      }}
    >
      <div className="text-xs text-amber-700 tracking-[0.15em] italic uppercase">{label}</div>
      <div
        className="text-xl font-bold text-amber-200 italic tabular-nums"
        style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.3)' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-amber-100/60 italic">{sub}</div>}
    </div>
  );
}

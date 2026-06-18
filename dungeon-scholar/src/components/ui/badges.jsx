export const BLOOM_PALETTE = {
  remember:   { bg: 'rgba(82, 82, 91, 0.35)',   border: '#a1a1aa', text: '#e4e4e7' },
  understand: { bg: 'rgba(29, 78, 216, 0.32)',  border: '#60a5fa', text: '#dbeafe' },
  apply:      { bg: 'rgba(16, 185, 129, 0.32)', border: '#10b981', text: '#a7f3d0' },
  analyze:    { bg: 'rgba(245, 158, 11, 0.32)', border: '#fbbf24', text: '#fde68a' },
  evaluate:   { bg: 'rgba(244, 63, 94, 0.32)',  border: '#fb7185', text: '#fecdd3' },
  create:     { bg: 'rgba(168, 85, 247, 0.32)', border: '#c084fc', text: '#e9d5ff' },
};

export function DifficultyStars({ value }) {
  if (typeof value !== 'number' || value < 1) return null;
  const v = Math.min(5, Math.max(1, Math.round(value)));
  return (
    <span className="text-xs italic tabular-nums" title={`Difficulty ${v}/5`}>
      <span style={{ color: '#fbbf24' }}>{'▰'.repeat(v)}</span>
      <span style={{ color: 'rgba(120, 53, 15, 0.7)' }}>{'▱'.repeat(5 - v)}</span>
    </span>
  );
}

export function BloomBadge({ level }) {
  if (!level || typeof level !== 'string') return null;
  const palette = BLOOM_PALETTE[level.toLowerCase()] || BLOOM_PALETTE.remember;
  return (
    <span className="text-[10px] uppercase tracking-wider italic px-2 py-0.5 rounded-sm font-bold"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text }}
      title={`Bloom's level: ${level}`}>
      {level}
    </span>
  );
}

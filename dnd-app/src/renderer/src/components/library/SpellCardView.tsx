import { memo } from 'react'

interface SpellData {
  name?: string
  level?: number
  school?: string
  castingTime?: unknown
  range?: unknown
  components?: { verbal?: boolean; somatic?: boolean; material?: boolean; materialDescription?: string } | unknown
  duration?: unknown
  description?: string
  higherLevels?: string
  ritual?: boolean
  concentration?: boolean
  classes?: string[]
  spellList?: string[]
  tags?: string[]
}

function formatLevel(level: number | undefined): string {
  if (level === undefined || level === 0) return 'Cantrip'
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'
  return `${level}${suffix}-level`
}

function formatCastingTime(ct: unknown): string {
  if (!ct) return '—'
  if (typeof ct === 'string') return ct
  if (typeof ct === 'object' && ct !== null) {
    const obj = ct as Record<string, unknown>
    return String((obj.type ?? obj.amount) ? `${obj.amount} ${obj.unit ?? ''}` : '—').trim()
  }
  return String(ct)
}

function formatRange(range: unknown): string {
  if (!range) return '—'
  if (typeof range === 'string') return range
  if (typeof range === 'number') return `${range} feet`
  if (typeof range === 'object' && range !== null) {
    const obj = range as Record<string, unknown>
    if (obj.distance) return `${obj.distance} ${obj.unit ?? 'feet'}`
    return String(obj.type ?? '—')
  }
  return String(range)
}

function formatDuration(dur: unknown): { text: string; concentration: boolean } {
  if (!dur) return { text: '—', concentration: false }
  if (typeof dur === 'string') return { text: dur, concentration: false }
  if (typeof dur === 'object' && dur !== null) {
    const obj = dur as Record<string, unknown>
    const conc = Boolean(obj.concentration)
    const text = obj.amount ? `${obj.amount} ${obj.unit ?? ''}`.trim() : String(obj.type ?? '—')
    return { text: conc ? `Concentration, ${text}` : text, concentration: conc }
  }
  return { text: String(dur), concentration: false }
}

function formatComponents(comp: unknown): string {
  if (!comp) return '—'
  if (typeof comp === 'string') return comp
  if (typeof comp === 'object' && comp !== null) {
    const obj = comp as Record<string, unknown>
    const parts: string[] = []
    if (obj.verbal) parts.push('V')
    if (obj.somatic) parts.push('S')
    if (obj.material) parts.push(`M (${obj.materialDescription ?? ''})`)
    return parts.join(', ') || '—'
  }
  return String(comp)
}

interface SpellCardViewProps {
  spell: Record<string, unknown>
}

function SpellCardView({ spell }: SpellCardViewProps): JSX.Element {
  const s = spell as unknown as SpellData
  const levelSchool =
    s.level === 0 || s.level === undefined
      ? `${s.school ?? 'Unknown'} cantrip`
      : `${formatLevel(s.level)} ${s.school ?? 'Unknown'}`
  const duration = formatDuration(s.duration)
  const isConcentration = s.concentration ?? duration.concentration
  const classList = s.classes ?? s.spellList ?? []

  return (
    <div className="bg-gray-900 border border-amber-800/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className="text-base font-bold text-amber-400">{s.name ?? 'Unknown Spell'}</h3>
        <p className="text-xs text-gray-400 italic">
          {levelSchool}
          {s.ritual ? ' (ritual)' : ''}
        </p>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* Stats grid */}
        <div className="space-y-0.5 text-sm">
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">Casting Time</span>
            <span className="text-gray-300">{formatCastingTime(s.castingTime)}</span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">Range</span>
            <span className="text-gray-300">{formatRange(s.range)}</span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">Components</span>
            <span className="text-gray-300">{formatComponents(s.components)}</span>
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-amber-500 font-semibold">Duration</span>
            <span className="text-gray-300">{duration.text}</span>
            {isConcentration && (
              <span className="text-[10px] bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded-full ml-1">
                Concentration
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-amber-800/30" />

        {/* Description */}
        {s.description && <div className="text-xs text-gray-300 whitespace-pre-wrap">{s.description}</div>}

        {/* At Higher Levels */}
        {s.higherLevels && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="text-xs">
              <span className="text-amber-400 font-semibold italic">At Higher Levels. </span>
              <span className="text-gray-300">{s.higherLevels}</span>
            </div>
          </>
        )}

        {/* Class list */}
        {classList.length > 0 && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="text-xs text-gray-500">
              <span className="font-semibold">Classes: </span>
              {classList.join(', ')}
            </div>
          </>
        )}

        {/* Tags */}
        {s.tags && s.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {s.tags.map((tag) => (
              <span key={tag} className="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(SpellCardView)

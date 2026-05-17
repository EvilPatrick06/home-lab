import { memo } from 'react'
import { renderInlineMarkdown } from '../../utils/markdown'

// Subset of the species data shape we render; permissive on shape so we don't
// fight against ad-hoc fields some species use (e.g. lineageChoices on Aasimar).
interface SpeciesTrait {
  name?: string
  description?: string
  requiredCharacterLevel?: number
  usageLimit?: { type?: string; rechargesOn?: string }
  spellcasting?: { ability?: { type?: string; ability?: string }; cantrips?: string[] }
}

interface SpeciesData {
  name?: string
  description?: string
  creatureType?: string
  size?: { type?: string; value?: string; options?: string[] }
  speed?: number | { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number }
  traits?: SpeciesTrait[]
  source?: string
}

interface SpeciesDetailViewProps {
  species: Record<string, unknown>
}

function formatSize(size: SpeciesData['size']): string {
  if (!size) return '—'
  if (size.type === 'choice' && size.options) return size.options.join(' or ')
  if (size.value) return size.value
  return '—'
}

function formatSpeed(speed: SpeciesData['speed']): string {
  if (typeof speed === 'number') return `${speed} ft.`
  if (!speed || typeof speed !== 'object') return '—'
  const parts: string[] = []
  if (speed.walk) parts.push(`${speed.walk} ft.`)
  if (speed.fly) parts.push(`fly ${speed.fly} ft.`)
  if (speed.swim) parts.push(`swim ${speed.swim} ft.`)
  if (speed.climb) parts.push(`climb ${speed.climb} ft.`)
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`)
  return parts.join(', ') || '—'
}

function formatUsage(u: SpeciesTrait['usageLimit']): string {
  if (!u || !u.type) return ''
  const labels: Record<string, string> = {
    perProficiencyBonus: 'Proficiency Bonus per long rest',
    perDay: 'per day',
    perShortRest: 'per short rest',
    perLongRest: 'per long rest'
  }
  const lbl = labels[u.type] ?? u.type
  return u.rechargesOn ? `${lbl} — recharges on ${u.rechargesOn}` : lbl
}

function SpeciesDetailView({ species }: SpeciesDetailViewProps): JSX.Element {
  const s = species as unknown as SpeciesData
  const traits = s.traits ?? []

  return (
    <div className="bg-gray-900 border border-amber-800/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className="text-base font-bold text-amber-400">{s.name ?? 'Unknown Species'}</h3>
        {s.creatureType && (
          <p className="text-xs text-gray-400 italic">
            {s.creatureType}
            {s.source ? ` · ${s.source}` : ''}
          </p>
        )}
      </div>

      <div className="px-3 py-2 space-y-2">
        {s.description && (
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{renderInlineMarkdown(s.description)}</p>
        )}

        <div className="border-t border-amber-800/30" />

        <div className="space-y-0.5 text-sm">
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">Size</span>
            <span className="text-gray-300">{formatSize(s.size)}</span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">Speed</span>
            <span className="text-gray-300">{formatSpeed(s.speed)}</span>
          </div>
        </div>

        {traits.length > 0 && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Traits</h4>
              {traits.map((trait, i) => {
                const usage = formatUsage(trait.usageLimit)
                return (
                  <div key={i} className="text-xs">
                    <span className="text-amber-400 font-semibold italic">
                      {trait.name}
                      {trait.requiredCharacterLevel ? ` (level ${trait.requiredCharacterLevel}+)` : ''}.{' '}
                    </span>
                    <span className="text-gray-300 whitespace-pre-wrap">
                      {renderInlineMarkdown(trait.description ?? '')}
                    </span>
                    {usage && <div className="text-[10px] text-gray-500 mt-0.5">Usage: {usage}</div>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default memo(SpeciesDetailView)

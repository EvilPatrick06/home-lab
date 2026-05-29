import type { LibraryCategory } from '../../types/library'

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '?'
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} hour${seconds >= 7200 ? 's' : ''}`
  return `${Math.round(seconds / 60)} min`
}

export function summarizeItem(item: Record<string, unknown>, category: LibraryCategory): string {
  switch (category) {
    case 'monsters':
    case 'creatures':
    case 'npcs':
      return `CR ${item.cr ?? '?'} ${item.type ?? ''} - ${item.hp ?? '?'} HP`
    case 'spells':
      return `Level ${item.level ?? '?'} ${item.school ?? ''} - ${(item.spellList as string[])?.join(', ') ?? ''}`
    case 'classes':
      return `${(item.coreTraits as unknown as Record<string, unknown>)?.hitPointDie ?? '?'} | ${((item.coreTraits as unknown as Record<string, unknown>)?.primaryAbility as string[])?.join(', ') ?? ''}`
    case 'subclasses':
      return `${((item.className as string) ?? '').charAt(0).toUpperCase() + ((item.className as string) ?? '').slice(1)} - Level ${item.level ?? '?'}`
    case 'species': {
      const sizeObj = item.size as { type?: string; value?: string; options?: string[] } | undefined
      const sizeStr = sizeObj?.type === 'choice' ? (sizeObj.options?.join('/') ?? '?') : (sizeObj?.value ?? '?')
      return `Speed: ${item.speed ?? '?'} ft. | Size: ${sizeStr}`
    }
    case 'backgrounds':
      return (item.skillProficiencies as string[])?.join(', ') ?? (item.description as string)?.slice(0, 80) ?? ''
    case 'feats': {
      const prereqs = item.prerequisites as { level?: number | null } | undefined
      return `${item.category ?? ''} - Level ${prereqs?.level ?? '?'}`
    }
    case 'weapons':
      return `${item.category ?? ''} - ${item.damage ?? '?'} ${item.damageType ?? ''}`
    case 'armor':
      return `${item.category ?? ''} - AC ${item.baseAC ?? item.ac ?? '?'}`
    case 'magic-items':
      return `${item.rarity ?? ''} ${item.type ?? ''} ${item.attunement ? '(attunement)' : ''}`
    case 'gear':
      return `${item.cost ?? ''} - ${item.weight ?? '?'} lb.`
    case 'traps':
      return `${item.level ?? ''} - ${item.trigger ?? ''}`
    case 'hazards':
      return `${item.level ?? ''} ${item.type ?? ''}`
    case 'poisons':
      return `${item.type ?? ''} - DC ${item.saveDC ?? '?'}`
    case 'diseases':
      return `DC ${item.saveDC ?? '?'} - ${item.vector ?? ''}`
    case 'curses':
      return `${item.type ?? ''} curse`
    case 'environmental-effects':
      return `${item.category ?? ''}`
    case 'settlements':
      return `Pop: ${item.populationMin ?? '?'}-${item.populationMax ?? '?'}`
    case 'invocations':
      return `Level ${item.level ?? 'Any'}${item.pactRequired ? ' - Pact required' : ''}`
    case 'metamagic':
      return `${item.cost ?? '?'} sorcery points`
    case 'vehicles':
      return `${item.size ?? ''} - Speed: ${item.speed ?? '?'}`
    case 'mounts':
      return `${item.size ?? ''} - Speed: ${item.speed ?? '?'} ft.`
    case 'siege-equipment':
      return `AC ${item.ac ?? '?'} | HP ${item.hp ?? '?'}`
    case 'supernatural-gifts':
      return `${item.type ?? ''}`
    case 'encounter-presets':
      return `${item.difficulty ?? ''} - Levels ${item.partyLevelRange ?? '?'}`
    case 'crafting':
      return `${item.toolType ?? ''}`
    case 'conditions':
      return `${item.type ?? ''} - ${((item.description as string) ?? '').slice(0, 60)}`
    case 'weapon-mastery':
      return ((item.description as string) ?? '').slice(0, 80)
    case 'languages':
      return `${item.type ?? ''} - Script: ${item.script ?? 'None'}`
    case 'skills':
      return `${item.ability ?? ''} - ${((item.description as string) ?? '').slice(0, 60)}`
    case 'fighting-styles':
      return ((item.description as string) ?? '').slice(0, 80)
    case 'maps':
      return `Map${item.gridWidth ? ` - ${item.gridWidth}x${item.gridHeight}` : ''}`
    case 'shop-templates':
      return `${((item.inventory as unknown[]) ?? []).length} items`
    case 'portraits':
      return 'Portrait / Icon'
    case 'class-features':
      return `Level ${item.level ?? '?'} - ${((item.description as string) ?? '').slice(0, 60)}`
    case 'companions': {
      const cType = (item.type as string) ?? ''
      if (cType === 'mount') return `Mount - Speed: ${item.speed ?? '?'}`
      if (cType === 'pet') return `Pet - ${item.name ?? '?'}`
      if (cType === 'hireling') return `Hireling - ${item.dailyCost ?? '?'}/day`
      return cType || 'Companion'
    }
    case 'adventure-seeds':
      return `Levels ${item.levelRange ?? '?'}`
    case 'calendars': {
      const months = item.months as unknown[] | undefined
      return `${item.daysPerYear ?? '?'} days, ${months?.length ?? '?'} months`
    }
    case 'deities':
      return `${item.title ?? ''} - ${item.alignment ?? '?'}`
    case 'planes':
      return `${((item.category as string) ?? '').replace(/^./, (c: string) => c.toUpperCase())} Plane`
    case 'npc-names': {
      const nameData = item as unknown as Record<string, unknown>
      const male = (nameData.male as string[] | undefined)?.length ?? 0
      const female = (nameData.female as string[] | undefined)?.length ?? 0
      const neutral = (nameData.neutral as string[] | undefined)?.length ?? 0
      return `${male} male, ${female} female, ${neutral} neutral names`
    }
    case 'light-sources':
      return `Bright: ${item.brightRadius ?? '?'} ft., Dim: ${item.dimRadius ?? '?'} ft. - ${formatDuration(item.durationSeconds as number | undefined)}`
    case 'sentient-items': {
      const entries = item.entries as unknown[] | undefined
      return `${entries?.length ?? '?'} entries`
    }
    default:
      return (item.description as string)?.slice(0, 80) ?? ''
  }
}

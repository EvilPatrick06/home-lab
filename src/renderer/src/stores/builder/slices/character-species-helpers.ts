/**
 * Character Species Helpers — D&D 5e 2024
 *
 * Species-based resistances and senses derived from species/subspecies.
 * Extracted from save-slice-5e for modularity.
 */

export function getSpeciesResistances(speciesId: string, subspeciesId?: string): string[] {
  const resistances: string[] = []
  switch (speciesId) {
    case 'aasimar':
      resistances.push('necrotic', 'radiant')
      break
    case 'dragonborn':
      switch (subspeciesId) {
        case 'black-dragonborn':
        case 'copper-dragonborn':
          resistances.push('acid')
          break
        case 'blue-dragonborn':
        case 'bronze-dragonborn':
          resistances.push('lightning')
          break
        case 'brass-dragonborn':
        case 'gold-dragonborn':
        case 'red-dragonborn':
          resistances.push('fire')
          break
        case 'green-dragonborn':
          resistances.push('poison')
          break
        case 'silver-dragonborn':
        case 'white-dragonborn':
          resistances.push('cold')
          break
      }
      break
    case 'dwarf':
      resistances.push('poison')
      break
    case 'tiefling':
      switch (subspeciesId) {
        case 'abyssal-tiefling':
          resistances.push('poison')
          break
        case 'chthonic-tiefling':
          resistances.push('necrotic')
          break
        case 'infernal-tiefling':
          resistances.push('fire')
          break
      }
      break
  }
  return resistances
}

export function getSpeciesSenses(speciesId: string, subspeciesId?: string): string[] {
  switch (speciesId) {
    case 'aasimar':
    case 'dragonborn':
    case 'gnome':
    case 'tiefling':
      return ['Darkvision 60 ft']
    case 'dwarf':
    case 'orc':
      return ['Darkvision 120 ft']
    case 'elf':
      if (subspeciesId === 'drow') return ['Darkvision 120 ft']
      if (subspeciesId === 'high-elf' || subspeciesId === 'wood-elf') return ['Darkvision 60 ft']
      return ['Darkvision 60 ft']
    default:
      return []
  }
}

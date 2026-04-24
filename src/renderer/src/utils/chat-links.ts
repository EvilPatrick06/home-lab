import React from 'react'
import type { LibraryCategory } from '../types/library'

// Known monster names and item names that should be linkable
// In a full implementation, this would be populated from the library
const MONSTER_NAMES = [
  'Goblin', 'Orc', 'Dragon', 'Skeleton', 'Zombie', 'Troll', 'Giant', 'Beholder',
  'Mind Flayer', 'Lich', 'Vampire', 'Werewolf', 'Demon', 'Devil', 'Angel',
  'Elemental', 'Golem', 'Mimic', 'Gelatinous Cube', 'Owlbear', 'Displacer Beast'
]

const ITEM_NAMES = [
  'Potion of Healing', 'Magic Missile', 'Fireball', 'Lightning Bolt',
  'Sword', 'Shield', 'Armor', 'Ring', 'Amulet', 'Wand', 'Staff'
]

export interface ChatLink {
  type: 'monster' | 'item' | 'spell'
  name: string
  start: number
  end: number
}

export function parseChatLinks(content: string): ChatLink[] {
  const links: ChatLink[] = []

  // Find monster references
  for (const monsterName of MONSTER_NAMES) {
    const regex = new RegExp(`\\b${monsterName}\\b`, 'gi')
    let match
    while ((match = regex.exec(content)) !== null) {
      links.push({
        type: 'monster',
        name: monsterName,
        start: match.index,
        end: match.index + match[0].length
      })
    }
  }

  // Find item references
  for (const itemName of ITEM_NAMES) {
    const regex = new RegExp(`\\b${itemName}\\b`, 'gi')
    let match
    while ((match = regex.exec(content)) !== null) {
      links.push({
        type: 'item',
        name: itemName,
        start: match.index,
        end: match.index + match[0].length
      })
    }
  }

  // Find spell references (basic patterns)
  const spellRegex = /\b(?:Magic Missile|Fireball|Lightning Bolt|Cure Wounds|Heal|Raise Dead|Wish)\b/gi
  let match
  while ((match = spellRegex.exec(content)) !== null) {
    links.push({
      type: 'spell',
      name: match[0],
      start: match.index,
      end: match.index + match[0].length
    })
  }

  // Remove overlapping links (keep the first one)
  links.sort((a, b) => a.start - b.start)
  const filteredLinks: ChatLink[] = []
  for (const link of links) {
    const overlaps = filteredLinks.some(existing =>
      (link.start >= existing.start && link.start < existing.end) ||
      (link.end > existing.start && link.end <= existing.end)
    )
    if (!overlaps) {
      filteredLinks.push(link)
    }
  }

  return filteredLinks
}

export function renderChatContent(content: string, onLinkClick?: (type: LibraryCategory, name: string) => void): JSX.Element {
  const links = parseChatLinks(content)

  if (links.length === 0) {
    return <span>{content}</span>
  }

  const parts: JSX.Element[] = []
  let lastIndex = 0

  for (const link of links) {
    // Add text before the link
    if (link.start > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex, link.start)}</span>)
    }

    // Add the link
    const linkText = content.slice(link.start, link.end)
    parts.push(
      <button
        key={`link-${link.start}`}
        onClick={() => onLinkClick?.(link.type === 'monster' ? 'monsters' : link.type === 'item' ? 'magic-items' : 'spells', link.name)}
        className="text-amber-400 hover:text-amber-300 underline cursor-pointer"
        title={`Open ${link.name} in compendium`}
      >
        {linkText}
      </button>
    )

    lastIndex = link.end
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>)
  }

  return <span>{parts}</span>
}
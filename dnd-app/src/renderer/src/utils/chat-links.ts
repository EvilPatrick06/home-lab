import React from 'react'
import ContentTooltip from '../components/ui/ContentTooltip'
import { lookupContent } from '../services/library/content-index'
import type { LibraryCategory } from '../types/library'

// Known monster names and item names that should be linkable (fallback for auto-detection)
const MONSTER_NAMES = [
  'Goblin',
  'Orc',
  'Dragon',
  'Skeleton',
  'Zombie',
  'Troll',
  'Giant',
  'Beholder',
  'Mind Flayer',
  'Lich',
  'Vampire',
  'Werewolf',
  'Demon',
  'Devil',
  'Angel',
  'Elemental',
  'Golem',
  'Mimic',
  'Gelatinous Cube',
  'Owlbear',
  'Displacer Beast'
]

const ITEM_NAMES = [
  'Potion of Healing',
  'Magic Missile',
  'Fireball',
  'Lightning Bolt',
  'Sword',
  'Shield',
  'Armor',
  'Ring',
  'Amulet',
  'Wand',
  'Staff'
]

export interface ChatLink {
  type: 'monster' | 'item' | 'spell' | LibraryCategory
  name: string
  start: number
  end: number
}

export function parseChatLinks(content: string): ChatLink[] {
  const links: ChatLink[] = []

  // 1. Parse [[name]] bracket syntax — matches against content index
  const bracketRegex = /\[\[([^\]]+)\]\]/g
  let bracketMatch: RegExpExecArray | null
  for (;;) {
    bracketMatch = bracketRegex.exec(content)
    if (bracketMatch === null) break
    const ref = lookupContent(bracketMatch[1])
    if (ref) {
      links.push({
        type: ref.category,
        name: ref.name,
        start: bracketMatch.index,
        end: bracketMatch.index + bracketMatch[0].length
      })
    }
  }

  // 2. Fallback auto-detection for known names
  // Find monster references
  for (const monsterName of MONSTER_NAMES) {
    const regex = new RegExp(`\\b${monsterName}\\b`, 'gi')
    let m: RegExpExecArray | null
    for (;;) {
      m = regex.exec(content)
      if (m === null) break
      links.push({
        type: 'monster',
        name: monsterName,
        start: m.index,
        end: m.index + m[0].length
      })
    }
  }

  // Find item references
  for (const itemName of ITEM_NAMES) {
    const regex = new RegExp(`\\b${itemName}\\b`, 'gi')
    let m: RegExpExecArray | null
    for (;;) {
      m = regex.exec(content)
      if (m === null) break
      links.push({
        type: 'item',
        name: itemName,
        start: m.index,
        end: m.index + m[0].length
      })
    }
  }

  // Find spell references (basic patterns)
  const spellRegex = /\b(?:Magic Missile|Fireball|Lightning Bolt|Cure Wounds|Heal|Raise Dead|Wish)\b/gi
  let sm: RegExpExecArray | null
  for (;;) {
    sm = spellRegex.exec(content)
    if (sm === null) break
    links.push({
      type: 'spell',
      name: sm[0],
      start: sm.index,
      end: sm.index + sm[0].length
    })
  }

  // Remove overlapping links (keep the first one — bracket syntax takes priority)
  links.sort((a, b) => a.start - b.start)
  const filteredLinks: ChatLink[] = []
  for (const link of links) {
    const overlaps = filteredLinks.some(
      (existing) =>
        (link.start >= existing.start && link.start < existing.end) ||
        (link.end > existing.start && link.end <= existing.end)
    )
    if (!overlaps) {
      filteredLinks.push(link)
    }
  }

  return filteredLinks
}

function linkTypeToCategory(type: string): LibraryCategory {
  if (type === 'monster') return 'monsters'
  if (type === 'item') return 'magic-items'
  if (type === 'spell') return 'spells'
  return type as LibraryCategory
}

export function renderChatContent(
  content: string,
  onLinkClick?: (type: LibraryCategory, name: string) => void,
  renderPreview?: (category: LibraryCategory, name: string) => React.ReactNode | null
): React.ReactElement {
  const links = parseChatLinks(content)

  if (links.length === 0) {
    return React.createElement('span', null, content)
  }

  const parts: React.ReactElement[] = []
  let lastIndex = 0

  for (const link of links) {
    // Add text before the link
    if (link.start > lastIndex) {
      parts.push(React.createElement('span', { key: `text-${lastIndex}` }, content.slice(lastIndex, link.start)))
    }

    // For bracket syntax, display without the [[ ]] delimiters
    const rawText = content.slice(link.start, link.end)
    const linkText = rawText.startsWith('[[') ? rawText.slice(2, -2) : rawText
    const category = linkTypeToCategory(link.type)
    const button = React.createElement(
      'button',
      {
        key: `link-${link.start}`,
        onClick: () => onLinkClick?.(category, link.name),
        className: 'text-amber-400 hover:text-amber-300 underline cursor-pointer',
        title: `Open ${link.name} in compendium`
      },
      linkText
    )

    if (renderPreview) {
      parts.push(
        React.createElement(
          ContentTooltip,
          {
            key: `tooltip-${link.start}`,
            category,
            name: link.name,
            renderPreview
          },
          button
        )
      )
    } else {
      parts.push(button)
    }

    lastIndex = link.end
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(React.createElement('span', { key: `text-${lastIndex}` }, content.slice(lastIndex)))
  }

  return React.createElement('span', null, ...parts)
}

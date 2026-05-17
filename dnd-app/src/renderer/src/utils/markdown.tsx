import { Fragment, type ReactNode } from 'react'

/**
 * Minimal inline markdown renderer. Handles **bold** and *italic*.
 *
 * Used wherever bundled D&D content embeds those inline markers (monster action
 * descriptions, species traits, background features, etc.). We deliberately don't
 * pull in a real markdown library — the bundle is already huge, the markers are
 * narrow (no headings, no lists), and a full parser would let arbitrary content
 * influence layout.
 *
 * Pass-through for falsy/empty input. Returns a single ReactNode (a Fragment with
 * keyed children) when markers are present, or the raw string when not.
 */
export function renderInlineMarkdown(text: string | null | undefined): ReactNode {
  if (!text) return text
  // Token stream: split on **...** (bold) first to avoid the inner * being parsed
  // as italic markers.
  const parts: ReactNode[] = []
  const re = /\*\*([^*]+?)\*\*|\*([^*]+?)\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex.exec idiom
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={`b${key++}`}>{match[1]}</strong>)
    } else if (match[2] !== undefined) {
      parts.push(<em key={`i${key++}`}>{match[2]}</em>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length === 0 ? (
    text
  ) : (
    <>
      {parts.map((p, idx) => (
        <Fragment key={idx}>{p}</Fragment>
      ))}
    </>
  )
}

import type { ReactNode } from 'react'

interface EmptyStateProps {
  /** Optional leading glyph or icon element (e.g. an emoji string or a Lucide icon). */
  icon?: ReactNode
  title: string
  description?: string
  /** Phase 18d — compact variant for narrow contexts (sidebars, small panels). */
  compact?: boolean
}

export default function EmptyState({ icon, title, description, compact = false }: EmptyStateProps): JSX.Element {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-gray-500 py-6 px-3">
        {icon && <div className="text-2xl mb-2">{icon}</div>}
        <p className="text-sm text-muted">{title}</p>
        {description && <p className="text-xs text-gray-600 mt-1">{description}</p>}
      </div>
    )
  }

  return (
    <div className="border border-dashed border-border rounded-lg p-12 text-center text-gray-500">
      {icon && <div className="text-4xl mb-4">{icon}</div>}
      <p className="text-xl mb-2">{title}</p>
      {description && <p className="text-sm">{description}</p>}
    </div>
  )
}

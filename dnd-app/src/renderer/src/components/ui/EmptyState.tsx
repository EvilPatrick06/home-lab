interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
}

export default function EmptyState({ icon, title, description }: EmptyStateProps): JSX.Element {
  return (
    <div className="border border-dashed border-gray-700 rounded-lg p-12 text-center text-gray-500">
      {icon && <div className="text-4xl mb-4">{icon}</div>}
      <p className="text-xl mb-2">{title}</p>
      {description && <p className="text-sm">{description}</p>}
    </div>
  )
}

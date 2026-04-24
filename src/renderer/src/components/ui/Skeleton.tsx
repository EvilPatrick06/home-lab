interface SkeletonProps {
  lines?: number
  className?: string
}

export default function Skeleton({ lines = 3, className = '' }: SkeletonProps): JSX.Element {
  const widths = ['w-full', 'w-3/4', 'w-5/6', 'w-2/3', 'w-4/5']

  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Loading content">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`h-4 rounded bg-gray-800 animate-pulse ${widths[i % widths.length]}`} />
      ))}
    </div>
  )
}

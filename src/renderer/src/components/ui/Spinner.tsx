interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-4 h-4 border',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2'
}

export default function Spinner({ size = 'md', className = '' }: SpinnerProps): JSX.Element {
  return (
    <div
      className={`${sizeClasses[size]} border-amber-400 border-t-transparent rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}

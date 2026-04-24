import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
}

export default function Card({ title, className = '', children, ...props }: CardProps): JSX.Element {
  return (
    <div className={`bg-gray-900/50 border border-gray-800 rounded-lg p-6 ${className}`} {...props}>
      {title && <h3 className="text-lg font-semibold mb-3">{title}</h3>}
      {children}
    </div>
  )
}

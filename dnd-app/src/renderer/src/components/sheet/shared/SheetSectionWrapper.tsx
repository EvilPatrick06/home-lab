import { useState } from 'react'

interface SheetSectionWrapperProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

export default function SheetSectionWrapper({
  title,
  children,
  defaultOpen = true,
  className,
  onDragOver,
  onDragLeave,
  onDrop
}: SheetSectionWrapperProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`mb-4 ${className ?? ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-800/80 hover:bg-gray-800 transition-colors rounded-t-lg"
      >
        <span className="text-xs font-bold tracking-widest text-amber-400 uppercase">{title}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border border-gray-800 border-t-0 rounded-b-lg p-3">{children}</div>}
    </div>
  )
}

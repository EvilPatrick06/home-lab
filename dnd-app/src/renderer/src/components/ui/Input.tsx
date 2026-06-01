import { type InputHTMLAttributes, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className = '', id: externalId, ...props }: InputProps): JSX.Element {
  const generatedId = useId()
  const inputId = externalId || generatedId
  const errorId = `${inputId}-error`

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="block text-muted mb-2 text-sm">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full p-3 rounded-lg bg-surface-2 border text-fg
          placeholder-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 transition-colors
          ${error ? 'border-red-500 focus:border-red-400' : 'border-border focus:border-amber-500'}
          ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-red-400 text-sm mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

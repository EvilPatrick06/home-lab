import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-amber-600 hover:bg-amber-500 text-white',
  secondary: 'border border-gray-600 hover:bg-gray-800 text-gray-200',
  danger: 'bg-red-700 hover:bg-red-600 text-white',
  ghost: 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
}

export default function Button({
  variant = 'primary',
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      className={`px-5 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900
        ${variantStyles[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

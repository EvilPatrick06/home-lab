import { useNavigate } from 'react-router'

interface BackButtonProps {
  to?: string
  label?: string
}

export default function BackButton({ to = '/', label = 'Back to Menu' }: BackButtonProps): JSX.Element {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(to)}
      className="text-amber-400 hover:text-amber-300 hover:underline mb-6 block cursor-pointer"
    >
      &larr; {label}
    </button>
  )
}

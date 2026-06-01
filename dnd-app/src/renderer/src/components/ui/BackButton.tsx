import { useNavigate } from 'react-router'
import { useT } from '../../i18n'

interface BackButtonProps {
  to?: string
  label?: string
}

export default function BackButton({ to = '/', label }: BackButtonProps): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(to)}
      className="text-accent hover:text-amber-300 hover:underline mb-6 block cursor-pointer"
    >
      &larr; {label ?? t('ui.backButton.defaultLabel')}
    </button>
  )
}

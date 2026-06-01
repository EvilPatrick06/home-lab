import { useNavigate } from 'react-router'
import { useT } from '../i18n'

export default function NotFoundPage(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-base text-fg">
      <div className="text-center">
        <div className="text-6xl mb-4">&#128270;</div>
        <h1 className="text-3xl font-bold mb-2">{t('pages.notFoundPage.title')}</h1>
        <p className="text-muted mb-6">{t('pages.notFoundPage.description')}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-lg font-semibold bg-amber-600 hover:bg-accent-strong
            text-white transition-colors cursor-pointer"
        >
          {t('pages.notFoundPage.returnToMenu')}
        </button>
      </div>
    </div>
  )
}

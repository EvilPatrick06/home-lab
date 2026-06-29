/**
 * Visually-hidden skip-to-content link that becomes visible on focus.
 * Standard accessibility pattern for keyboard users to bypass navigation.
 */
import { useT } from '../../i18n'

export default function SkipToContent(): JSX.Element {
  const { t } = useT()
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100]
        focus:px-4 focus:py-2 focus:bg-amber-600 focus:text-white focus:rounded-lg
        focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      {t('ui.skipToContent.label')}
    </a>
  )
}

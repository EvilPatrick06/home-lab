import { useCallback, useEffect, useState } from 'react'
import { Z } from '../../constants'
import { useT } from '../../i18n'
import { useAccessibilityStore } from '../../stores/use-accessibility-store'
import { useOnboardingStore } from '../../stores/use-onboarding-store'

// First-run guided tour: a dismissible, resumable, keyboard-navigable modal that
// introduces the core loop (create/import a character → create/join a campaign →
// the game table). Honors reducedMotion (no transition animation). Skippable in
// one click; re-launchable from Settings. (suggestions-log 2026-06-22)
const STEP_KEYS = ['welcome', 'character', 'campaign', 'table', 'help'] as const

export default function OnboardingTour(): JSX.Element | null {
  const { t } = useT()
  const isOpen = useOnboardingStore((s) => s.isOpen)
  const complete = useOnboardingStore((s) => s.complete)
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion)
  const [step, setStep] = useState(0)

  const last = STEP_KEYS.length - 1
  const next = useCallback(() => setStep((n) => Math.min(last, n + 1)), [last])
  const back = useCallback(() => setStep((n) => Math.max(0, n - 1)), [])

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => {
    if (isOpen) setStep(0)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') complete()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (step >= last) complete()
        else next()
      } else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, step, last, next, back, complete])

  if (!isOpen) return null

  const key = STEP_KEYS[step]
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ zIndex: Z.MODAL }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className={`bg-surface border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl ${reducedMotion ? '' : 'transition-all'}`}
      >
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
          {t('onboarding.stepCounter', { current: step + 1, total: STEP_KEYS.length })}
        </p>
        <h2 id="onboarding-title" className="text-lg font-semibold text-fg mb-2">
          {t(`onboarding.steps.${key}.title`)}
        </h2>
        <p className="text-sm text-gray-300 mb-5">{t(`onboarding.steps.${key}.body`)}</p>

        <div className="mb-5 flex items-center justify-center gap-1.5" aria-hidden="true">
          {STEP_KEYS.map((k, i) => (
            <span key={k} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>

        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={complete}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-gray-400 hover:text-fg transition-colors cursor-pointer"
          >
            {t('onboarding.skip')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="px-3 py-1.5 text-sm rounded-lg border border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
              >
                {t('onboarding.back')}
              </button>
            )}
            <button
              type="button"
              onClick={() => (step >= last ? complete() : next())}
              className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-accent-strong text-white transition-colors cursor-pointer"
            >
              {step >= last ? t('onboarding.done') : t('onboarding.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

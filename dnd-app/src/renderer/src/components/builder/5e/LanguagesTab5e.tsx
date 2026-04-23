import languageD12Json from '@data/5e/character/language-d12-table.json'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { LANGUAGE_DESCRIPTIONS } from '../../../data/language-descriptions'
import { load5eLanguageD12Table } from '../../../services/data-provider'
import { useBuilderStore } from '../../../stores/use-builder-store'
import { RARE_LANGUAGES_5E, STANDARD_LANGUAGES_5E } from '../../../types/character-common'
import SectionBanner from '../shared/SectionBanner'

const LANGUAGE_D12_TABLE: { min: number; max: number; language: string }[] = languageD12Json

/** Load language D12 table from the data store (includes plugin entries). */
export async function loadLanguageD12Data(): Promise<unknown> {
  return load5eLanguageD12Table()
}

function rollD12Language(knownSet: Set<string>): { roll: number; language: string } | null {
  // Collect all rollable languages not yet known
  const available = LANGUAGE_D12_TABLE.filter((e) => !knownSet.has(e.language))
  if (available.length === 0) return null

  const roll = Math.floor(Math.random() * 12) + 1
  const entry = LANGUAGE_D12_TABLE.find((e) => roll >= e.min && roll <= e.max)

  if (entry && !knownSet.has(entry.language)) {
    return { roll, language: entry.language }
  }
  // Re-roll: pick randomly from available entries
  const pick = available[Math.floor(Math.random() * available.length)]
  return { roll, language: pick.language }
}

interface TooltipPos {
  x: number
  y: number
  flipBelow: boolean
}

function LanguageTooltip({
  lang,
  desc,
  anchorRef
}: {
  lang: string
  desc: string
  anchorRef: HTMLElement | null
}): JSX.Element | null {
  const [pos, setPos] = useState<TooltipPos | null>(null)

  useEffect(() => {
    if (!anchorRef) return
    const rect = anchorRef.getBoundingClientRect()
    const flipBelow = rect.top < 100
    setPos({
      x: rect.left + rect.width / 2,
      y: flipBelow ? rect.bottom + 8 : rect.top - 8,
      flipBelow
    })
  }, [anchorRef])

  if (!pos) return null

  return createPortal(
    <div
      className="fixed z-[9999] w-64 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl text-xs text-gray-300 leading-relaxed pointer-events-none"
      style={{
        left: pos.x,
        top: pos.flipBelow ? pos.y : undefined,
        bottom: pos.flipBelow ? undefined : `${window.innerHeight - pos.y}px`,
        transform: 'translateX(-50%)'
      }}
    >
      <div className="font-semibold text-amber-400 mb-1">{lang}</div>
      {desc}
    </div>,
    document.body
  )
}

export default function LanguagesTab5e(): JSX.Element {
  const speciesLanguages = useBuilderStore((s) => s.speciesLanguages)
  const speciesExtraLangCount = useBuilderStore((s) => s.speciesExtraLangCount)
  const bgLanguageCount = useBuilderStore((s) => s.bgLanguageCount)
  const classExtraLangCount = useBuilderStore((s) => s.classExtraLangCount)
  const chosenLanguages = useBuilderStore((s) => s.chosenLanguages)
  const setChosenLanguages = useBuilderStore((s) => s.setChosenLanguages)
  const allKnownLanguages = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const lang of speciesLanguages) {
      if (!seen.has(lang)) {
        seen.add(lang)
        result.push(lang)
      }
    }
    for (const lang of chosenLanguages) {
      if (!seen.has(lang)) {
        seen.add(lang)
        result.push(lang)
      }
    }
    return result
  }, [speciesLanguages, chosenLanguages])

  const totalBonusSlots = 2 + speciesExtraLangCount + bgLanguageCount + classExtraLangCount
  const remainingSlots = Math.max(0, totalBonusSlots - chosenLanguages.length)

  const rareSet = useMemo(() => new Set(RARE_LANGUAGES_5E), [])

  const availableLanguages = useMemo(() => {
    const knownSet = new Set(allKnownLanguages)
    // Only show standard languages as clickable options; rare languages are auto-granted only
    return STANDARD_LANGUAGES_5E.filter((lang) => !knownSet.has(lang))
  }, [allKnownLanguages])

  const [lastRoll, setLastRoll] = useState<{ roll: number; language: string } | null>(null)

  const handleD12Roll = (): void => {
    const knownSet = new Set(allKnownLanguages)
    const result = rollD12Language(knownSet)
    if (!result) return
    setLastRoll(result)
    const current = useBuilderStore.getState().chosenLanguages
    setChosenLanguages([...current, result.language])
  }

  const handleAddLanguage = (lang: string): void => {
    if (remainingSlots > 0 && !allKnownLanguages.includes(lang)) {
      const current = useBuilderStore.getState().chosenLanguages
      setChosenLanguages([...current, lang])
    }
  }

  const handleRemoveChosenLanguage = (lang: string): void => {
    const current = useBuilderStore.getState().chosenLanguages
    setChosenLanguages(current.filter((l) => l !== lang))
  }

  const [hoveredLang, setHoveredLang] = useState<string | null>(null)
  const [hoveredRef, setHoveredRef] = useState<HTMLElement | null>(null)

  const handleMouseEnter = useCallback((lang: string, el: HTMLElement) => {
    setHoveredLang(lang)
    setHoveredRef(el)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredLang(null)
    setHoveredRef(null)
  }, [])

  return (
    <div>
      <SectionBanner label="LANGUAGES" />
      <div className="px-4 py-3 space-y-3 border-b border-gray-800">
        {/* Known languages displayed as green pills */}
        {allKnownLanguages.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allKnownLanguages.map((lang) => {
              const isChosen = chosenLanguages.includes(lang)
              const isRare = rareSet.has(lang)
              const desc = LANGUAGE_DESCRIPTIONS[lang]
              return (
                <div key={lang} className="relative">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
                      isRare
                        ? 'bg-purple-900/50 text-purple-300 border-purple-700/50'
                        : 'bg-green-900/50 text-green-300 border-green-700/50'
                    }`}
                    onMouseEnter={(e) => desc && handleMouseEnter(lang, e.currentTarget)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {lang}
                    {desc && (
                      <span className={`text-[10px] ml-0.5 ${isRare ? 'text-purple-500/60' : 'text-green-500/60'}`}>
                        ?
                      </span>
                    )}
                    {isChosen && (
                      <button
                        onClick={() => handleRemoveChosenLanguage(lang)}
                        className={`ml-0.5 hover:text-red-400 transition-colors ${isRare ? 'text-purple-400' : 'text-green-400'}`}
                        title={`Remove ${lang}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                  {desc && hoveredLang === lang && <LanguageTooltip lang={lang} desc={desc} anchorRef={hoveredRef} />}
                </div>
              )
            })}
          </div>
        ) : (
          <span className="text-sm text-gray-500 italic">No languages known</span>
        )}

        {/* Language chooser when bonus slots are available */}
        {remainingSlots > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-amber-400 font-semibold">
                {remainingSlots} language{remainingSlots !== 1 ? 's' : ''} remaining
              </span>
              <button
                onClick={handleD12Roll}
                className="text-xs px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-gray-900 font-semibold cursor-pointer"
              >
                Roll d12
              </button>
            </div>

            {lastRoll && (
              <div className="text-xs text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded px-2.5 py-1.5">
                <span className="font-mono text-amber-400">d12: {lastRoll.roll}</span>
                <span className="mx-1.5 text-gray-600">&rarr;</span>
                <span className="font-medium">{lastRoll.language}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {availableLanguages.map((lang) => {
                const desc = LANGUAGE_DESCRIPTIONS[lang]
                return (
                  <div key={lang} className="relative">
                    <button
                      onClick={() => handleAddLanguage(lang)}
                      onMouseEnter={(e) => desc && handleMouseEnter(lang, e.currentTarget)}
                      onMouseLeave={handleMouseLeave}
                      className="text-xs px-2 py-1 rounded border transition-colors bg-gray-800 border-gray-600 text-gray-300 hover:border-amber-500 hover:text-amber-300"
                    >
                      {lang}
                    </button>
                    {desc && hoveredLang === lang && <LanguageTooltip lang={lang} desc={desc} anchorRef={hoveredRef} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {remainingSlots === 0 && totalBonusSlots > 0 && (
          <div className="text-xs text-green-400 font-medium">All language slots filled.</div>
        )}
      </div>
    </div>
  )
}

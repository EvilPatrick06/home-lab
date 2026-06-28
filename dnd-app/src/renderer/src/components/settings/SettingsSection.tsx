import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  children: ReactNode
}

// Shared settings panel wrapper. Extracted from SettingsPage.tsx so per-section
// panels can live in their own files. (suggestions-log 2026-06-22 — god-component split)
export function Section({ title, children }: SettingsSectionProps): JSX.Element {
  return (
    <div data-settings-section className="bg-surface-2/50 border border-border/50 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-accent mb-4 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

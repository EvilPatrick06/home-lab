import { Card } from '../../components/ui'
import { useT } from '../../i18n'
import { createEmptyMetrics, formatPlaytime } from '../../services/metrics-tracker'
import type { Campaign } from '../../types/campaign'

interface MetricsCardProps {
  campaign: Campaign
}

export default function MetricsCard({ campaign }: MetricsCardProps): JSX.Element {
  const { t } = useT()
  const m = campaign.metrics ?? createEmptyMetrics()

  const stats = [
    { label: t('pages.metricsCard.sessionsPlayed'), value: m.sessionsPlayed },
    { label: t('pages.metricsCard.totalPlaytime'), value: formatPlaytime(m.totalPlaytimeSeconds) },
    { label: t('pages.metricsCard.encounters'), value: m.encountersCompleted },
    { label: t('pages.metricsCard.damageDealt'), value: m.totalDamageDealt.toLocaleString() },
    { label: t('pages.metricsCard.healingDone'), value: m.totalHealingDone.toLocaleString() }
  ]

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-3">{t('pages.metricsCard.title')}</h3>
      <div className="grid grid-cols-2 gap-y-2 text-sm">
        {stats.map((s) => (
          <div key={s.label} className="contents">
            <span className="text-gray-400">{s.label}</span>
            <span className="text-gray-200 font-medium">{s.value}</span>
          </div>
        ))}
      </div>
      {m.lastSessionDate && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <span className="text-gray-500 text-xs">
            {t('pages.metricsCard.lastSession', { date: new Date(m.lastSessionDate).toLocaleDateString() })}
          </span>
        </div>
      )}
    </Card>
  )
}

import { plural, t } from '@lingui/core/macro'
import { useLiveProxies } from '../hooks/liveStore'
import { ProgressPanel } from './progress-panel'
import type { ProgressRow } from './progress-panel'

const ProxyPanel = ({
  ready,
  total,
  waiting,
  names
}: {
  ready: number
  total: number
  waiting: number
  names: Record<string, string>
}) => {
  const live = useLiveProxies()
  if (waiting === 0 && live.length === 0) return null
  const rows: ProgressRow[] = live.map(({ id, percent }) => ({
    key: id,
    name: names[id] ?? id,
    size: 0,
    at: 'now',
    part: percent / 100
  }))
  const through = total > 0 ? (ready + (live[0] ? live[0].percent / 100 : 0)) / total : 0
  return (
    <ProgressPanel
      label={t`Making small copies`}
      icon='play'
      title={t`Making small copies`}
      barLabel={t`Small copies made`}
      doing={t`Making`}
      barTitle={t`${ready} of ${plural(total, { one: '# clip', other: '# clips' })} have their small copy`}
      rows={rows}
      overall={through}
      counted={{ at: ready, of: total }}
      summary={t`${ready} of ${total} ready — they play and scrub at once with one`}
    />
  )
}

export { ProxyPanel }

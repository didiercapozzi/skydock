import type { MontageFact } from './boardAnswer'
import { hasCompletePassenger } from './workspace'
import type { ManifestGroup } from './types'

const MONTAGE_STEPS = ['Named', 'Prepared', 'Project', 'Film', 'Uploaded', 'Sent'] as const

type MontageStep = (typeof MONTAGE_STEPS)[number]

const NEXT: Record<MontageStep, { todo: string; how: string }> = {
  Named: { todo: 'to name', how: 'Give it a name' },
  Prepared: { todo: 'to process', how: 'Process it' },
  Project: { todo: 'to edit', how: 'Make the montage, then edit it in kdenlive' },
  Film: { todo: 'to render', how: 'Render the film in kdenlive' },
  Uploaded: { todo: 'to upload', how: 'Upload it' },
  Sent: { todo: 'to email', how: 'Email the link' }
}

const montageSteps = ({
  group,
  facts,
  emailed
}: {
  group: ManifestGroup
  facts?: MontageFact
  emailed: boolean
}) => {
  const done: Record<MontageStep, boolean> = {
    Named: hasCompletePassenger(group.passenger),
    Prepared: Boolean(group.processed || group.uploaded || group.freed),
    Project: Boolean(facts?.project || group.freed),
    Film: Boolean(facts?.film || group.uploaded || group.freed),
    Uploaded: Boolean(group.uploaded),
    Sent: emailed
  }
  const steps = MONTAGE_STEPS.map((name) => ({ name, done: done[name] }))
  const found = steps.findIndex((step) => !step.done)
  const at = found === -1 ? steps.length : found
  const step = steps[at]
  return { steps, at, next: step ? NEXT[step.name] : null }
}

type MontageProgress = ReturnType<typeof montageSteps>

const furthestBehind = (progress: MontageProgress[]) =>
  progress.reduce<MontageProgress | null>(
    (behind, one) => (behind === null || one.at < behind.at ? one : behind),
    null
  )

export { furthestBehind, montageSteps }
export type { MontageProgress, MontageStep }

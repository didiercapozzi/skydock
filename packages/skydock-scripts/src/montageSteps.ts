import type { MontageFact } from './boardAnswer'
import type { ManifestGroup } from './types'

const MONTAGE_STEPS = ['Edited', 'Rendered', 'Uploaded', 'Emailed'] as const

type MontageStep = (typeof MONTAGE_STEPS)[number]

const NEXT: Record<MontageStep, { todo: string; how: string }> = {
  Edited: { todo: 'to edit', how: 'Edit the film' },
  Rendered: { todo: 'to render', how: 'Render the film' },
  Uploaded: { todo: 'to upload', how: 'Upload it' },
  Emailed: { todo: 'to email', how: 'Email the link' }
}

/* A montage is of use from the moment it has a name: its clips are edited where they are, and nothing is
   made until something is handed over. The steps are what can be done with it, and none is forced. A
   montage is finished when the person says so, or when it has been freed from this machine; until then it
   has a step to take next. */
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
    Edited: Boolean(facts?.edit || group.freed),
    Rendered: Boolean(facts?.film || group.uploaded || group.freed),
    Uploaded: Boolean(group.uploaded),
    Emailed: emailed
  }
  const steps = MONTAGE_STEPS.map((name) => ({ name, done: done[name] }))
  const kept = group.done !== undefined && !group.freed
  const found = steps.findIndex((step) => !step.done)
  const at = kept || found === -1 ? steps.length : found
  const step = steps[at]
  return { steps, at, next: step ? NEXT[step.name] : null, kept }
}

const montageLockOf = (group: ManifestGroup, facts?: MontageFact) =>
  group.freed ? ('freed' as const) : facts?.edit ? ('edit' as const) : null

type MontageProgress = ReturnType<typeof montageSteps>

const furthestBehind = (progress: MontageProgress[]) =>
  progress.reduce<MontageProgress | null>(
    (behind, one) => (behind === null || one.at < behind.at ? one : behind),
    null
  )

export { furthestBehind, montageLockOf, montageSteps }
export type { MontageProgress, MontageStep }

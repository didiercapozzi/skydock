import type { TandemFact } from './boardAnswer'
import { hasCompletePassenger } from './workspace'
import type { ManifestGroup } from './types'

/* A tandem's way from a name to the passenger's inbox, in the order it is walked (RULES, The
   board). Each step is read off what is there — the name, the copies, the project, the film, the
   upload record, the storage's list — never remembered, so it can only say what is true now. */
const TANDEM_STEPS = ['Named', 'Processed', 'Edited', 'Rendered', 'Uploaded', 'Emailed'] as const

type TandemStep = (typeof TANDEM_STEPS)[number]

/* what gets a tandem past the step it is at, in the words of the buttons that do it */
const NEXT: Record<TandemStep, { todo: string; how: string }> = {
  Named: { todo: 'to name', how: 'Give it a name' },
  Processed: { todo: 'to process', how: 'Process it' },
  Edited: { todo: 'to edit', how: 'Make the montage, then edit it in kdenlive' },
  Rendered: { todo: 'to render', how: 'Render the film in kdenlive' },
  Uploaded: { todo: 'to upload', how: 'Upload it' },
  Emailed: { todo: 'to email', how: 'Email the link' }
}

/* A freed tandem went through every step up to the upload, even with nothing of it left here to
   show for it: its copies, project and film are on the storage now. */
const tandemSteps = ({
  group,
  facts,
  emailed
}: {
  group: ManifestGroup
  facts?: TandemFact
  emailed: boolean
}) => {
  const done: Record<TandemStep, boolean> = {
    Named: hasCompletePassenger(group.passenger),
    Processed: Boolean(group.processed || group.uploaded || group.freed),
    Edited: Boolean(facts?.project || group.freed),
    Rendered: Boolean(facts?.film || group.uploaded || group.freed),
    Uploaded: Boolean(group.uploaded),
    Emailed: emailed
  }
  const steps = TANDEM_STEPS.map((name) => ({ name, done: done[name] }))
  /* the first step not yet done is the one it is at; past the last, it is finished */
  const found = steps.findIndex((step) => !step.done)
  const at = found === -1 ? steps.length : found
  const step = steps[at]
  return { steps, at, next: step ? NEXT[step.name] : null }
}

type TandemProgress = ReturnType<typeof tandemSteps>

/* A passenger is one folder, however many jumps: they are past a step only once every one of their
   jumps is, so what they show is the jump furthest behind. */
const furthestBehind = (progress: TandemProgress[]) =>
  progress.reduce<TandemProgress | null>(
    (behind, one) => (behind === null || one.at < behind.at ? one : behind),
    null
  )

export { furthestBehind, TANDEM_STEPS, tandemSteps }
export type { TandemProgress, TandemStep }

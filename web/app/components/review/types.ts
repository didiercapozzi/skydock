import type { ManifestFile, ManifestJump } from '../../lib/types'

type SelectionMap = Record<string, Record<string, boolean>>

type JumpDayGroup = {
  date: string
  jumps: ManifestJump[]
}

type PreviewState = {
  files: ManifestFile[]
  index: number
  label: string
}

export type { JumpDayGroup, PreviewState, SelectionMap }

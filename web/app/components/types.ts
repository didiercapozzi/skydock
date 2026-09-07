import type { ManifestFile, ManifestJump, ManifestPassenger } from '@skydock/scripts'

type SelectionMap = Record<string, Record<string, boolean>>

type DragData = {
  groups: Record<string, string[]>
}

type DropDialog = {
  x: number
  y: number
  groups: Record<string, string[]>
  targetJumpId: string
}

type DropHint = {
  jumpId: string
  index: number
}

type PreviewState = {
  files: ManifestFile[]
  index: number
  groupId: string
} | null

type JumpDayGroup = {
  date: string
  jumps: ManifestJump[]
}

export type {
  DragData,
  DropDialog,
  DropHint,
  JumpDayGroup,
  ManifestFile,
  ManifestJump,
  ManifestPassenger,
  PreviewState,
  SelectionMap
}

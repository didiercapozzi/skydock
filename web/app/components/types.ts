import type { Destination, ManifestFile, ManifestGroup, ManifestPassenger } from '@skydock/scripts'

type SelectionMap = Record<string, Record<string, boolean>>

type DragData = {
  groups: Record<string, string[]>
}

type DropDialog = {
  x: number
  y: number
  groups: Record<string, string[]>
  targetGroupId: string
}

type DropHint = {
  groupId: string
  index: number
}

type PreviewState = {
  files: ManifestFile[]
  index: number
  groupId: string
} | null

type DayGroup = {
  date: string
  groups: ManifestGroup[]
}

type DestinationGroup = {
  name: string
  groups: ManifestGroup[]
}

export type {
  Destination,
  DestinationGroup,
  DayGroup,
  DragData,
  DropDialog,
  DropHint,
  ManifestFile,
  ManifestGroup,
  ManifestPassenger,
  PreviewState,
  SelectionMap
}

import type { Destination, ManifestFile, ManifestGroup } from '@skydock/scripts'

/* which files the preview drawer is walking through, and where it is in them */
type PreviewState = {
  files: ManifestFile[]
  index: number
  groupId: string
} | null

export type { Destination, ManifestFile, ManifestGroup, PreviewState }

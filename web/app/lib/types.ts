export type FileEntry = {
  name: string
  path: string
  size: number
  isTheory: boolean
  copiedFromLibrary: boolean
  mtime: number
}

export type Jump = {
  id: string
  date: string
  name: string | null
  displayName: string
  num: number
  photoCount: number
  videoCount: number
  theoryPhotoCount: number
  theoryVideoCount: number
  jumpPhotos: FileEntry[]
  jumpVideos: FileEntry[]
  theoryPhotos: FileEntry[]
  theoryVideos: FileEntry[]
  totalSize: number
  startedAt: number
}

export type DayGroup = {
  date: string
  jumps: Jump[]
  totalPhotos: number
  totalVideos: number
}

export type TheoryOverride = {
  originalPath: string
  sourceDate: string
}

export type TheoryOverrides = Record<string, TheoryOverride>

export type TheoryVideoWithSource = FileEntry & {
  jumpName: string
  passengerName: string | null
  jumpDate: string
  jumpId: string
}

export type ManifestFile = {
  path: string
  camera: 'PHOTO' | 'VIDEO'
  size: number
  mtime: number
  filename: string
}

export type ManifestJump = {
  id: string
  label: string
  confirmed: boolean
  files: ManifestFile[]
}

export type ManifestStatus = 'empty' | 'proposed' | 'confirmed' | 'executed'

export type Manifest = {
  version: number
  status: ManifestStatus
  date: string
  startDatetime: string
  createdAt: string
  camera1: { path: string; fileCount: number }
  camera2: { path: string; fileCount: number }
  theory: ManifestFile[]
  files: ManifestFile[]
  jumps: ManifestJump[]
}

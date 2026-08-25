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

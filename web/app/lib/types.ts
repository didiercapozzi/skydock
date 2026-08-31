import { z } from 'zod'

const manifestFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  mtime: z.number(),
  filename: z.string(),
  id: z.string().nullable().optional(),
  originalMtime: z.number().nullable().optional(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  thumbPath: z.string().nullable().optional(),
  proxyPath: z.string().nullable().optional()
})

const manifestJumpSchema = z.object({
  id: z.string(),
  label: z.string(),
  confirmed: z.boolean(),
  files: z.array(manifestFileSchema),
  processed: z.boolean().nullable().optional()
})

const manifestStatusSchema = z.enum(['empty', 'proposed', 'confirmed', 'executed'])

const manifestSchema = z.object({
  version: z.number(),
  status: manifestStatusSchema,
  date: z.string(),
  startDatetime: z.string(),
  createdAt: z.string(),
  theory: z.array(manifestFileSchema),
  files: z.array(manifestFileSchema),
  jumps: z.array(manifestJumpSchema),
  cameraClockOffsetSeconds: z.number().nullable().optional()
})

type ManifestFile = z.infer<typeof manifestFileSchema>
type ManifestJump = z.infer<typeof manifestJumpSchema>
type ManifestStatus = z.infer<typeof manifestStatusSchema>
type Manifest = z.infer<typeof manifestSchema>

type FileEntry = {
  name: string
  path: string
  size: number
  isTheory: boolean
  copiedFromLibrary: boolean
  mtime: number
}

type Jump = {
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

type DayGroup = {
  date: string
  jumps: Jump[]
  totalPhotos: number
  totalVideos: number
}

type TheoryOverride = {
  originalPath: string
  sourceDate: string
}

type TheoryOverrides = Record<string, TheoryOverride>

type TheoryVideoWithSource = FileEntry & {
  jumpName: string
  passengerName: string | null
  jumpDate: string
  jumpId: string
}

export type {
  DayGroup,
  FileEntry,
  Jump,
  Manifest,
  ManifestFile,
  ManifestJump,
  ManifestStatus,
  TheoryOverride,
  TheoryOverrides,
  TheoryVideoWithSource
}

export { manifestSchema }

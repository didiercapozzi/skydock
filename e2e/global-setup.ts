import * as fs from 'node:fs'
import * as path from 'node:path'

type SeedFile = {
  filename: string
  size: number
  offset: number
  id: string
}

const seedFiles: SeedFile[] = [
  { filename: 'DJI_0001.MP4', size: 245_000_000, offset: 33125, id: 'a'.repeat(16) },
  { filename: 'DJI_0002.MP4', size: 198_700_000, offset: 33333, id: 'b'.repeat(16) },
  { filename: 'DJI_0003.JPG', size: 9_400_000, offset: 33361, id: 'c'.repeat(16) },
  { filename: 'DJI_0004.MP4', size: 312_500_000, offset: 36131, id: 'd'.repeat(16) },
  { filename: 'DJI_0005.MP4', size: 287_300_000, offset: 36347, id: 'e'.repeat(16) },
  { filename: 'DJI_0006.JPG', size: 8_200_000, offset: 36361, id: 'f'.repeat(16) },
  { filename: 'DJI_0007.MP4', size: 156_800_000, offset: 41422, id: 'g'.repeat(16) },
  { filename: 'DJI_0008.MP4', size: 203_100_000, offset: 41625, id: 'h'.repeat(16) },
  { filename: 'DJI_0009.JPG', size: 7_900_000, offset: 41641, id: 'i'.repeat(16) },
  { filename: 'DJI_0010.MP4', size: 178_400_000, offset: 41838, id: 'j'.repeat(16) },
  { filename: 'DJI_0011.JPG', size: 8_100_000, offset: 41875, id: 'k'.repeat(16) },
  { filename: 'DJI_0012.MP4', size: 142_200_000, offset: 55822, id: 'l'.repeat(16) },
  { filename: 'DJI_0013.MP4', size: 98_500_000, offset: 56100, id: 'm'.repeat(16) },
  { filename: 'DJI_0014.JPG', size: 6_800_000, offset: 56200, id: 'n'.repeat(16) }
]

const seedManifest = () => {
  const dir = process.env.SKYDOCK_OUTPUT_DIR ?? '/tmp/playwright-output'
  fs.mkdirSync(dir, { recursive: true })
  const base = Date.UTC(2026, 7, 24) / 1000
  const files = seedFiles.map((f) => ({
    path: `/demo/${f.filename}`,
    size: f.size,
    mtime: base + f.offset,
    filename: f.filename,
    id: f.id
  }))
  const idOf = (filename: string) => files.find((f) => f.filename === filename)?.id ?? ''
  const jump = (id: string, label: string, names: string[]) => ({
    id,
    label,
    confirmed: false,
    files: names.map((name) => ({ id: idOf(name) }))
  })
  const now = new Date().toISOString()
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      version: 1,
      status: 'proposed',
      date: '2026-08-24',
      startDatetime: now,
      createdAt: now,
      theory: [],
      files
    })
  )
  fs.writeFileSync(
    path.join(dir, 'jumps.json'),
    JSON.stringify({
      jumps: [
        jump('jump_1', 'Jump 1 — Tandem', ['DJI_0001.MP4', 'DJI_0002.MP4', 'DJI_0003.JPG']),
        jump('jump_2', 'Jump 2 — Solo', ['DJI_0004.MP4', 'DJI_0005.MP4', 'DJI_0006.JPG']),
        jump('jump_3', 'Jump 3 — Tandem', [
          'DJI_0007.MP4',
          'DJI_0008.MP4',
          'DJI_0009.JPG',
          'DJI_0010.MP4',
          'DJI_0011.JPG'
        ]),
        jump('jump_4', 'Jump 4 — Video', ['DJI_0012.MP4'])
      ]
    })
  )
}

export default seedManifest

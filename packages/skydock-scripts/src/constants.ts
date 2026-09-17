const GROUP_GAP_SECONDS = 900

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'mts', 'm4v', '3gp']

const PHOTO_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'dng',
  'raw',
  'tif',
  'tiff',
  'heic',
  'heif',
  'arw',
  'cr2',
  'cr3',
  'nef',
  'orf',
  'rw2',
  'raf'
]

const VIDEO_EXTENSIONS_SET = new Set(VIDEO_EXTENSIONS.map((e) => e.toLowerCase()))

const PHOTO_EXTENSIONS_SET = new Set(PHOTO_EXTENSIONS.map((e) => e.toLowerCase()))

const MEDIA_EXTENSIONS_SET = new Set(
  [...VIDEO_EXTENSIONS, ...PHOTO_EXTENSIONS].map((e) => e.toLowerCase())
)

export { GROUP_GAP_SECONDS, MEDIA_EXTENSIONS_SET, PHOTO_EXTENSIONS_SET, VIDEO_EXTENSIONS_SET }

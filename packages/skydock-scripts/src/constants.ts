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

/* What a file is, by its name: everything after the last dot of the last part of the path. A name
   that begins with a dot and has no other is not an extension but a hidden file. */
const getExtension = (filePath: string) => {
  const base = filePath.split(/[\\/]/).pop() ?? filePath
  const dot = base.lastIndexOf('.')
  return dot < 1 ? '' : base.slice(dot + 1).toLowerCase()
}

/* A file of pictures or film, by its name. A name starting `._` is not one whatever it ends with:
   it is the sidecar a Mac leaves beside every file it copies onto a card or a drive, a few hundred
   bytes of Finder notes that no player can open. */
const isMediaName = (name: string) =>
  !name.startsWith('._') && MEDIA_EXTENSIONS_SET.has(getExtension(name))

export {
  getExtension,
  GROUP_GAP_SECONDS,
  isMediaName,
  MEDIA_EXTENSIONS_SET,
  PHOTO_EXTENSIONS_SET,
  VIDEO_EXTENSIONS_SET
}

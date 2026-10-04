import { plural } from '@lingui/core/macro'

const kindsSaid = (videos: number, photos: number, joiner = ', ') =>
  [
    videos > 0 ? plural(videos, { one: '# video', other: '# videos' }) : '',
    photos > 0 ? plural(photos, { one: '# photo', other: '# photos' }) : ''
  ]
    .filter(Boolean)
    .join(joiner)

export { kindsSaid }

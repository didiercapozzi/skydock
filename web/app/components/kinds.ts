import { plural } from '@lingui/core/macro'

/* what a run of files is made of, in words, leaving out what there is none of: "2 videos, 1 photo" */
const kindsSaid = (videos: number, photos: number, joiner = ', ') =>
  [
    videos > 0 ? plural(videos, { one: '# video', other: '# videos' }) : '',
    photos > 0 ? plural(photos, { one: '# photo', other: '# photos' }) : ''
  ]
    .filter(Boolean)
    .join(joiner)

export { kindsSaid }

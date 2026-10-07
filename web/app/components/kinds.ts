import { plural } from '@lingui/core/macro'
import { isVideoFile } from '@skydock/scripts'
import type { ManifestFile } from './types'

/* what a run of files is made of, in words, leaving out what there is none of: "2 videos · 1 photo" */
const kindsSaid = (files: ManifestFile[], joiner = ' · ') => {
  const videos = files.filter((f) => isVideoFile(f.path)).length
  const photos = files.length - videos
  return [
    videos > 0 ? plural(videos, { one: '# video', other: '# videos' }) : '',
    photos > 0 ? plural(photos, { one: '# photo', other: '# photos' }) : ''
  ]
    .filter(Boolean)
    .join(joiner)
}

export { kindsSaid }
